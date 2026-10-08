import type { NativeEditMetadata } from "@hapsland/native-observation/direct-event/observation"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Ref from "effect/Ref"
import { makeUpdateNoticeOutput, UPDATE_REQUIRED_TEXT } from "../resident/update-notice.ts"
import * as Option from "effect/Option"
import { readFileSync } from "node:fs"
import { adaptClaudeDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { isCodexHostVersion } from "@hapsland/native-observation/direct-event/observation"
import { runPiHook } from "../pi/transport.ts"
import { hookMonotonicMillis } from "@hapsland/resident-transport/resident/hook-clock"
import type { ResidentEditPolicy } from "@hapsland/resident-transport/resident/protocol"
import {
  readComposedEditPolicyEffect,
  residentStartupLayer,
  ResidentUpdateNotice
} from "@hapsland/resident-transport/resident/client"
import { HookOutput, hookOutputLayer } from "../resident/hook-output.ts"
import { directHookSubmissionLayer, submitDirectHookOutput } from "../resident/direct-hook-output.ts"
import { composedHookRuntimeLayer, runComposedHookEffect, type ComposedHookKind } from "../resident/composed-hook.ts"
import { controlledOptions } from "@hapsland/resident-transport/resident/controlled-options"
import {
  statePathConfig,
  activityPathConfig,
  userConfigPathConfig
} from "@hapsland/runtime-inputs/runtime/input-settings"
import { machineClockLayer } from "@hapsland/runtime-environment/runtime/machine-clock"
import { makeDirectHookDispatch } from "./direct.ts"
import type { HookArguments } from "./arguments.ts"

const composedKind = (options: HookArguments): ComposedHookKind | undefined => {
  if (options["composed-before-edit-hook"]) return "before-edit"
  if (options["composed-background-hook"]) return "background"
  if (options["composed-stop-hook"]) return "stop"
  if (options["composed-prompt-hook"]) return "prompt"
  return undefined
}

const unsupportedCodexVersion = (options: HookArguments, kind: ComposedHookKind | undefined): boolean => {
  if (!options["codex-hook"]) return false
  if (!options["composed-edit-hook"] && kind === undefined) return false
  const version = options["codex-version"]
  return version !== undefined && !isCodexHostVersion(version)
}

const retiredChannel = (options: HookArguments, kind: ComposedHookKind | undefined): boolean =>
  options["opencode-hook"] || (options["codex-hook"] && !options["composed-edit-hook"] && kind === undefined)

const readHookContext = Effect.fn("Hook.readContext")(function* (options: HookArguments) {
  const input = yield* Effect.try({
    try: () => readFileSync(0, "utf8"),
    catch: () => new Error("could not read stdin")
  })
  const statePath = yield* statePathConfig
  const activityPath = yield* activityPathConfig
  const userConfigPath = Option.getOrUndefined(yield* userConfigPathConfig)
  const controlled = options["controlled-reviewer"] ? yield* controlledOptions : undefined
  return { input, statePath, activityPath, userConfigPath, controlled }
})
type HookContext = Effect.Success<ReturnType<typeof readHookContext>>
type DirectDispatch = ReturnType<typeof makeDirectHookDispatch>
type CodexVersion = Parameters<DirectDispatch["runDirectCodexHook"]>[1]

const hookRuntimeOptions = ({ statePath, activityPath, userConfigPath, controlled }: HookContext) => ({
  statePath,
  activityPath,
  ...(userConfigPath === undefined ? {} : { userConfigPath }),
  ...(controlled === undefined ? {} : { controlled })
})

const runComposed = Effect.fn("Hook.runComposed")(function* (
  options: HookArguments,
  kind: ComposedHookKind,
  codexVersion: CodexVersion,
  context: HookContext
) {
  let event: unknown
  try {
    event = JSON.parse(context.input)
  } catch {
    event = undefined
  }
  yield* runComposedHookEffect({
    kind,
    host: options["composed-host"] === "claude-code" ? "claude-code" : "codex-cli",
    event,
    codexVersion,
    ...hookRuntimeOptions(context)
  })
})

const hookCallerCwd = (event: unknown): string | undefined =>
  event !== null && typeof event === "object" && "cwd" in event && typeof event.cwd === "string" ? event.cwd : undefined

const runNative = Effect.fn("Hook.runNative")(function* (
  options: HookArguments,
  codexVersion: CodexVersion,
  context: HookContext,
  dispatch: DirectDispatch
) {
  const event = yield* Effect.try({
    try: () => JSON.parse(context.input) as unknown,
    catch: () => new Error("stdin is not valid JSON")
  })
  const { statePath, activityPath, userConfigPath, controlled } = context
  if (options["pi-hook"])
    return yield* runPiHook(event, hookRuntimeOptions(context)).pipe(
      Effect.catch(() => Effect.succeed({ status: "unavailable" }))
    )
  if (options["claude-hook"]) {
    if (!options["composed-edit-hook"]) return {}
    let editPolicy: ResidentEditPolicy | undefined
    let metadata: NativeEditMetadata | undefined
    let skippedOtherRoot = false
    const callerCwd = hookCallerCwd(event)
    const observation = yield* adaptClaudeDirectEvent(event, {
      ...(userConfigPath === undefined ? {} : { userConfigPath }),
      observeNative: (value) => {
        metadata = skippedOtherRoot
          ? {
              ...value,
              admission: "skipped-other-root",
              candidates: value.candidates.map((candidate) => ({
                ...candidate,
                selection: { status: "not-evaluated" }
              }))
            }
          : value
      },
      capturePolicy: (root, advicee, path) =>
        readComposedEditPolicyEffect(root, advicee, undefined, [path], (outcome) => {
          skippedOtherRoot = outcome === "skipped-other-root"
        }).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
          Effect.map((policy) => {
            editPolicy = policy
            return policy?.filePolicy
          })
        )
    })
    if (observation === undefined) yield* dispatch.retireNativeEditPermits(event, "claude-code")
    return yield* dispatch
      .runDirectBoundedHook(
        observation,
        controlled,
        statePath,
        activityPath,
        userConfigPath,
        editPolicy,
        callerCwd,
        metadata
      )
      .pipe(Effect.catch(() => Effect.succeed({})))
  }
  if (options["codex-hook"]) {
    const direct = yield* dispatch.runDirectCodexHook(
      event,
      codexVersion,
      controlled,
      statePath,
      activityPath,
      userConfigPath
    )
    return direct.handled ? direct.output : {}
  }
  return {}
})

const invalidInputOutput = (options: HookArguments, kind: ComposedHookKind | undefined) => {
  if (kind !== undefined) return undefined
  if (options["claude-hook"] || options["opencode-hook"]) return {}
  if (options["codex-hook"])
    return { systemMessage: "Review unavailable: invalid or unsupported Codex PostToolUse input." }
  return {
    version: 1,
    error: { code: "invalid_request", message: "input does not satisfy a supported command contract" }
  }
}

const writeHookResult = Effect.fn("Hook.writeResult")(function* (
  options: HookArguments,
  kind: ComposedHookKind | undefined,
  output: unknown,
  deadline: number,
  dispatch: DirectDispatch
) {
  if (dispatch.isDirectEventReady(output))
    return yield* submitDirectHookOutput(output, {
      composed: options["composed-edit-hook"],
      claude: options["claude-hook"],
      deadlineAt: deadline
    })
  if (kind !== undefined) return
  if (!options["claude-hook"] && !options["codex-hook"]) return
  return yield* (yield* HookOutput).writeEncoded(
    typeof output === "string" ? output : `${JSON.stringify(output)}\n`,
    deadline
  )
})

const writePiResult = (
  options: HookArguments,
  kind: ComposedHookKind | undefined,
  output: unknown,
  dispatch: DirectDispatch
) => {
  if (options["pi-hook"] && kind === undefined && !dispatch.isDirectEventReady(output))
    process.stdout.write(JSON.stringify(output) + "\n")
}

const startWatchdog = Effect.fn("Hook.startWatchdog")(function* (options: HookArguments, startedAt: number) {
  if (!options["claude-hook"] && !options["opencode-hook"]) return undefined
  return yield* Effect.sleep(Math.max(0, startedAt + 4_500 - (yield* hookMonotonicMillis))).pipe(
    Effect.andThen(Effect.sync(() => process.exit(0))),
    Effect.forkScoped
  )
})

/** Wire the hook capability without any administration or review execution. */
export const runHookProgram = async (options: HookArguments, startedAt: number): Promise<void> => {
  const kind = composedKind(options)
  if (unsupportedCodexVersion(options, kind)) return
  const codexVersion = isCodexHostVersion(options["codex-version"]) ? options["codex-version"] : "0.155.1"
  const deadline = startedAt + (options["codex-hook"] && options["composed-edit-hook"] ? 9_000 : 3_900)
  const dispatch = makeDirectHookDispatch({
    deadline,
    controlledWriter: options["controlled-writer"],
    composedEdit: options["composed-edit-hook"]
  })
  const program = Effect.gen(function* () {
    // Retired channels cannot read input, start a resident or dispatch work.
    if (retiredChannel(options, kind)) return {}
    const context = yield* readHookContext(options)
    if (kind !== undefined) return yield* runComposed(options, kind, codexVersion, context)
    return yield* runNative(options, codexVersion, context, dispatch)
  }).pipe(Effect.catchCause(() => Effect.succeed(invalidInputOutput(options, kind))))
  const run = Effect.gen(function* () {
    const watchdog = yield* startWatchdog(options, startedAt)
    const granted = yield* Ref.make(false)
    const event = kind === "before-edit" ? "PreToolUse" : kind === "prompt" ? "UserPromptSubmit" : "PostToolUse"
    const noticeOutput = makeUpdateNoticeOutput(yield* HookOutput, granted, event)
    let output = yield* program.pipe(
      Effect.provideService(ResidentUpdateNotice, {
        eligible: kind !== "stop",
        record: kind === "stop" ? Effect.void : Ref.set(granted, true)
      }),
      Effect.provideService(HookOutput, noticeOutput)
    )
    if (kind === "background" && (yield* Ref.get(granted))) yield* noticeOutput.write({}, deadline)
    if (options["pi-hook"] && (yield* Ref.getAndSet(granted, false)))
      output = { status: "update-required", text: UPDATE_REQUIRED_TEXT }
    const written = yield* writeHookResult(options, kind, output, deadline, dispatch).pipe(
      Effect.provideService(HookOutput, noticeOutput)
    )
    if (written === "timed-out" && watchdog !== undefined) yield* Fiber.join(watchdog)
    writePiResult(options, kind, output, dispatch)
  }).pipe(Effect.scoped)
  await Effect.runPromise(
    run.pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true }))),
      Effect.provide(directHookSubmissionLayer),
      Effect.provide(composedHookRuntimeLayer),
      Effect.provide(hookOutputLayer),
      Effect.provide(residentStartupLayer),
      Effect.provide(machineClockLayer)
    )
  )
}
