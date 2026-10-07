import { resolve } from "node:path"
import { eligibleNamedPath } from "@hapsland/native-observation/direct-event/selection"
import { candidateRootObservation } from "@hapsland/native-observation/direct-event/target-observation"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import {
  adaptCodexDirectEvent,
  adaptCodexReply,
  adaptComposedHookIdentity,
  isCodexNativeApplyPatch
} from "@hapsland/native-observation/direct-event/adapter"
import type { CodexHostVersion, DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { ClaudeHostOutput } from "@hapsland/delivery-output/direct-event/claude-output"
import type { ResidentControlledOptions } from "@hapsland/resident-transport/resident/protocol"
import { hookMonotonicMillis } from "@hapsland/resident-transport/resident/hook-clock"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import { recordDemoTrace } from "@hapsland/activity-observation/activity/demo-trace"
import {
  admitObservationEffect,
  admitAndCollectEffect,
  ensureResidentEffect,
  makeResidentDispatchContextEffect,
  readComposedEditPolicyEffect,
  retireComposedEditEffect,
  type ResidentStartup,
  type CollectedAdvice
} from "@hapsland/resident-transport/resident/client"

export interface DirectHookOptions {
  readonly deadline: number
  readonly controlledWriter: boolean
  readonly composedEdit: boolean
}

export const makeDirectHookDispatch = (options: DirectHookOptions) => {
  const directHookDeadline = options.deadline
  const isControlledWriter = options.controlledWriter
  const isComposedEditHook = options.composedEdit
  type DirectHookDispatch = { readonly handled: false } | { readonly handled: true; readonly output: unknown }

  const recordCodexHookActivity = (
    subject: Pick<DirectObservation, "root" | "advicee"> | undefined,
    statePath: string,
    lifetime: string,
    stage: "unavailable" | "incomplete"
  ): void => {
    if (subject === undefined) return
    recordActivity({ statePath, root: subject.root, advicee: subject.advicee, lifetime, stage })
  }
  const recordCodexObservationTrace = Effect.fn("CodexHook.recordEditTrace")(function* (
    observation: DirectObservation | undefined
  ) {
    if (observation === undefined) return
    const path = yield* Config.option(Config.NonEmptyString("REVIEW_DEMO_BUDGET_PATH"))
    recordDemoTrace(Option.getOrUndefined(path), observation.root, observation.advicee, { kind: "edit" })
  })
  const admitCodexHookObservation = Effect.fn("CodexHook.admitObservation")(function* (
    observation: DirectObservation,
    dispatch: Effect.Success<ReturnType<typeof makeResidentDispatchContextEffect>> | undefined,
    activityPath: string,
    lifetime: string
  ) {
    if (dispatch === undefined || !isControlledWriter) {
      recordCodexHookActivity(observation, activityPath, lifetime, "unavailable")
      return
    }
    yield* admitObservationEffect(observation, true, dispatch, undefined, isComposedEditHook).pipe(
      Effect.catch(() => {
        recordCodexHookActivity(observation, activityPath, lifetime, "unavailable")
        return Effect.void
      })
    )
  })
  const retireNativeEditPermits = Effect.fn("NativeHook.retireUnusedPermits")(function* (
    event: unknown,
    host: "codex-cli" | "claude-code",
    version: CodexHostVersion = "0.155.1"
  ) {
    if (event === null || typeof event !== "object" || Array.isArray(event)) return
    const identity = yield* adaptComposedHookIdentity(
      { ...event, hook_event_name: "PreToolUse" },
      host,
      "PreToolUse",
      version
    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (identity === undefined) return
    for (const root of identity.editRoots ?? [])
      yield* retireComposedEditEffect(root, identity.advicee).pipe(Effect.catch(() => Effect.succeed(false)))
  })
  type CodexDispatchOptions = {
    readonly statePath: string
    readonly activityPath: string
    readonly userConfigPath: string | undefined
    readonly controlled: ResidentControlledOptions | undefined
  }
  const codexCandidateDispatch = Effect.fn("CodexHook.candidateDispatch")(function* (
    single: DirectObservation,
    options: CodexDispatchOptions
  ) {
    const candidate = single.candidates[0]!
    const policy = yield* readComposedEditPolicyEffect(single.root, single.advicee, undefined, [
      resolve(single.root, candidate.path)
    ]).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (policy === undefined) return undefined
    if (candidate.operation !== "add" && candidate.operation !== "update") return undefined
    if (!(yield* eligibleNamedPath(single.root, candidate.path, policy.filePolicy, single.rootIdentity)))
      return undefined
    return yield* makeResidentDispatchContextEffect(
      single.root,
      options.statePath,
      options.activityPath,
      options.userConfigPath,
      options.controlled,
      policy
    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
  })
  const codexSourceDispatch = Effect.fn("CodexHook.sourceDispatch")(function* (
    observation: DirectObservation,
    options: CodexDispatchOptions
  ) {
    let dispatch: import("@hapsland/resident-transport/resident/protocol").ResidentDispatchContext | undefined
    const sourceContexts: import("@hapsland/resident-transport/resident/protocol").ResidentSourceDispatchContext[] = []
    const selectedRoots = new Set<string>()
    for (let index = 0; index < observation.candidates.length; index += 1) {
      const single = candidateRootObservation(observation, index)
      if (single === undefined || selectedRoots.has(single.root)) continue
      const selected = yield* codexCandidateDispatch(single, options)
      if (selected === undefined) continue
      dispatch ??= selected
      selectedRoots.add(single.root)
      sourceContexts.push({
        root: single.root,
        credential: selected.credential,
        sessionAnalytics: selected.sessionAnalytics === true
      })
    }
    return dispatch === undefined ? undefined : { ...dispatch, sourceContexts }
  })
  const runDirectCodexHook = (
    nativeEvent: unknown,
    hostVersion: CodexHostVersion,
    controlled: ResidentControlledOptions | undefined,
    statePath: string,
    activityPath: string,
    userConfigPath: string | undefined
  ): Effect.Effect<DirectHookDispatch, unknown, ResidentStartup> =>
    Effect.gen(function* () {
      if (!isCodexNativeApplyPatch(nativeEvent)) return { handled: false } as const
      const reply = yield* adaptCodexReply(nativeEvent, hostVersion)
      const owner = yield* ensureResidentEffect(
        undefined,
        Math.max(1, directHookDeadline - (yield* hookMonotonicMillis) - 500)
      ).pipe(Effect.option)
      if (Option.isNone(owner)) {
        recordCodexHookActivity(reply, activityPath, "resident-unavailable", "unavailable")
        return { handled: true, output: {} } as const
      }
      const observation = yield* adaptCodexDirectEvent(nativeEvent, hostVersion)
      const dispatch =
        observation === undefined
          ? undefined
          : yield* codexSourceDispatch(observation, { statePath, activityPath, userConfigPath, controlled })
      yield* recordCodexObservationTrace(observation)
      // The direct dispatcher owns every native apply_patch event. Unsupported
      // shapes remain quiet and can never create review work.
      if (observation === undefined || dispatch === undefined) {
        yield* retireNativeEditPermits(nativeEvent, "codex-cli", hostVersion)
        recordCodexHookActivity(
          reply,
          activityPath,
          owner.value.lifetime,
          observation === undefined ? "incomplete" : "unavailable"
        )
        return { handled: true, output: {} } as const
      }
      // Matching reads are not attribution. The hook command must explicitly be
      // installed with this controlled-writer assertion for the supported Add profile.
      yield* admitCodexHookObservation(observation, dispatch, activityPath, owner.value.lifetime)
      return { handled: true, output: {} } as const
    })

  const runDirectBoundedHook = Effect.fn("ClaudeHook.collectBounded")(function* (
    observation: DirectObservation | undefined,
    controlled: ResidentControlledOptions | undefined,
    statePath: string,
    activityPath: string,
    userConfigPath: string | undefined,
    editPolicy?: import("@hapsland/resident-transport/resident/protocol").ResidentEditPolicy,
    deliveryCwd?: string
  ): Effect.fn.Return<unknown, never, ResidentStartup> {
    const deadline = directHookDeadline
    if (observation === undefined) return {}
    const bounded = <A, E, R>(task: Effect.Effect<A, E, R>): Effect.Effect<A | undefined, never, R> =>
      Effect.gen(function* () {
        const time = Math.max(0, deadline - (yield* hookMonotonicMillis))
        if (time <= 0) return undefined
        return yield* task.pipe(
          Effect.timeoutOrElse({ duration: time, orElse: () => Effect.succeed(undefined) }),
          Effect.catch(() => Effect.succeed(undefined))
        )
      })
    const dispatch = yield* bounded(
      makeResidentDispatchContextEffect(
        observation.root,
        statePath,
        activityPath,
        userConfigPath,
        controlled,
        editPolicy
      )
    )
    if (dispatch === undefined) return {}
    const outcome = yield* bounded(
      admitAndCollectEffect(
        observation,
        { ...dispatch, ...(deliveryCwd === undefined ? {} : { deliveryCwd }) },
        deadline - 150
      )
    )
    return outcome?.status === "advice"
      ? { _tag: "DirectEventReady", value: outcome.advice.output, collected: outcome.advice }
      : {}
  })

  const isDirectEventReady = (
    value: unknown
  ): value is {
    readonly _tag: "DirectEventReady"
    readonly value: ClaudeHostOutput
    readonly collected: CollectedAdvice
  } =>
    typeof value === "object" &&
    value !== null &&
    "_tag" in value &&
    value._tag === "DirectEventReady" &&
    "value" in value

  return { runDirectCodexHook, runDirectBoundedHook, isDirectEventReady, retireNativeEditPermits }
}
