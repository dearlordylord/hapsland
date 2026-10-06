import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { adaptCodexDirectEvent, adaptCodexReply, isCodexNativeApplyPatch } from "../direct-event/adapter.ts"
import type { CodexHostVersion, DirectObservation } from "../direct-event/observation.ts"
import type { ClaudeHostOutput } from "../direct-event/claude-output.ts"
import type { ResidentControlledOptions } from "../resident/protocol.ts"
import { hookMonotonicMillis } from "../resident/hook-clock.ts"
import { recordActivity } from "../activity/status.ts"
import { recordDemoTrace } from "../activity/demo-trace.ts"
import {
  admitObservationEffect,
  admitAndCollectEffect,
  ensureResidentEffect,
  makeResidentDispatchContextEffect,
  type ResidentStartup,
  type CollectedAdvice
} from "../resident/client.ts"

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
      const dispatch =
        reply === undefined
          ? undefined
          : yield* makeResidentDispatchContextEffect(
              reply.root,
              statePath,
              activityPath,
              userConfigPath,
              controlled
            ).pipe(Effect.catch(() => Effect.succeed(undefined)))
      const observation = yield* adaptCodexDirectEvent(nativeEvent, hostVersion)
      yield* recordCodexObservationTrace(observation)
      // The direct dispatcher owns every native apply_patch event. Unsupported
      // shapes remain quiet and can never create review work.
      if (observation === undefined) {
        recordCodexHookActivity(reply, activityPath, owner.value.lifetime, "incomplete")
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
    userConfigPath: string | undefined
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
      makeResidentDispatchContextEffect(observation.root, statePath, activityPath, userConfigPath, controlled)
    )
    if (dispatch === undefined) return {}
    const outcome = yield* bounded(admitAndCollectEffect(observation, dispatch, deadline - 150))
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

  return { runDirectCodexHook, runDirectBoundedHook, isDirectEventReady }
}
