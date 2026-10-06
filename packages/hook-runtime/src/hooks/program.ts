import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import { readFileSync } from "node:fs"
import { adaptClaudeDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { isCodexHostVersion } from "@hapsland/native-observation/direct-event/observation"
import { runPiHook } from "../pi/transport.ts"
import { hookMonotonicMillis } from "@hapsland/resident-transport/resident/hook-clock"
import { residentStartupLayer } from "@hapsland/resident-transport/resident/client"
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

/** Wire the hook capability without any administration or review execution. */
export const runHookProgram = async (options: HookArguments, startedAt: number): Promise<void> => {
  const codex = options["codex-hook"]
  const claude = options["claude-hook"]
  const pi = options["pi-hook"]
  const openCode = options["opencode-hook"]
  const composedEdit = options["composed-edit-hook"]
  const kind: ComposedHookKind | undefined = options["composed-before-edit-hook"]
    ? "before-edit"
    : options["composed-background-hook"]
      ? "background"
      : options["composed-stop-hook"]
        ? "stop"
        : options["composed-prompt-hook"]
          ? "prompt"
          : undefined
  if (
    codex &&
    (composedEdit || kind !== undefined) &&
    options["codex-version"] !== undefined &&
    !isCodexHostVersion(options["codex-version"])
  )
    return
  const codexVersion = isCodexHostVersion(options["codex-version"]) ? options["codex-version"] : "0.155.1"
  const deadline = startedAt + (codex && composedEdit ? 9_000 : 3_900)
  const { runDirectCodexHook, runDirectBoundedHook, isDirectEventReady } = makeDirectHookDispatch({
    deadline,
    controlledWriter: options["controlled-writer"],
    composedEdit
  })
  const program = Effect.gen(function* () {
    // Retired channels cannot read input, start a resident or dispatch work.
    if (openCode || (codex && !composedEdit && kind === undefined)) return {}
    const input = yield* Effect.try({
      try: () => readFileSync(0, "utf8"),
      catch: () => new Error("could not read stdin")
    })
    const statePath = yield* statePathConfig
    const activityPath = yield* activityPathConfig
    const userConfigPath = Option.getOrUndefined(yield* userConfigPathConfig)
    const controlled = options["controlled-reviewer"] ? yield* controlledOptions : undefined
    if (kind !== undefined) {
      let event: unknown
      try {
        event = JSON.parse(input)
      } catch {
        event = undefined
      }
      yield* runComposedHookEffect({
        kind,
        host: options["composed-host"] === "claude-code" ? "claude-code" : "codex-cli",
        event,
        codexVersion,
        statePath,
        activityPath,
        ...(userConfigPath === undefined ? {} : { userConfigPath }),
        ...(controlled === undefined ? {} : { controlled })
      })
      return undefined
    }
    const event = yield* Effect.try({
      try: () => JSON.parse(input) as unknown,
      catch: () => new Error("stdin is not valid JSON")
    })
    if (pi)
      return yield* runPiHook(event, {
        statePath,
        activityPath,
        ...(userConfigPath === undefined ? {} : { userConfigPath }),
        ...(controlled === undefined ? {} : { controlled })
      }).pipe(Effect.catch(() => Effect.succeed({ status: "unavailable" })))
    if (claude) {
      if (!composedEdit) return {}
      const observation = yield* adaptClaudeDirectEvent(event, userConfigPath === undefined ? {} : { userConfigPath })
      return yield* runDirectBoundedHook(observation, controlled, statePath, activityPath, userConfigPath).pipe(
        Effect.catch(() => Effect.succeed({}))
      )
    }
    if (codex) {
      const direct = yield* runDirectCodexHook(event, codexVersion, controlled, statePath, activityPath, userConfigPath)
      return direct.handled ? direct.output : {}
    }
    return {}
  }).pipe(
    Effect.catchCause(() =>
      Effect.succeed(
        kind !== undefined
          ? undefined
          : claude || openCode
            ? {}
            : codex
              ? { systemMessage: "Review unavailable: invalid or unsupported Codex PostToolUse input." }
              : {
                  version: 1,
                  error: { code: "invalid_request", message: "input does not satisfy a supported command contract" }
                }
      )
    )
  )
  const run = Effect.gen(function* () {
    const watchdog =
      claude || openCode
        ? yield* Effect.sleep(Math.max(0, startedAt + 4_500 - (yield* hookMonotonicMillis))).pipe(
            Effect.andThen(Effect.sync(() => process.exit(0))),
            Effect.forkScoped
          )
        : undefined
    const output = yield* program
    const written = isDirectEventReady(output)
      ? yield* submitDirectHookOutput(output, { composed: composedEdit, claude, deadlineAt: deadline })
      : kind === undefined && (claude || codex)
        ? yield* (yield* HookOutput).writeEncoded(
            typeof output === "string" ? output : `${JSON.stringify(output)}\n`,
            deadline
          )
        : undefined
    if (written === "timed-out" && watchdog !== undefined) yield* Fiber.join(watchdog)
    if (pi && kind === undefined && !isDirectEventReady(output)) process.stdout.write(JSON.stringify(output) + "\n")
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
