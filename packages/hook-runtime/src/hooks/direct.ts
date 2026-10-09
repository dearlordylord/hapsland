import { resolve } from "node:path"
import { nativeSelection } from "@hapsland/native-observation/direct-event/selection"
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
import type {
  NativeEditMetadata,
  CodexHostVersion,
  DirectObservation
} from "@hapsland/native-observation/direct-event/observation"
import type { ClaudeHostOutput } from "@hapsland/delivery-output/direct-event/claude-output"
import type { ResidentControlledOptions } from "@hapsland/resident-transport/resident/protocol"
import { hookMonotonicMillis } from "@hapsland/resident-transport/resident/hook-clock"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import { recordDemoTrace } from "@hapsland/activity-observation/activity/demo-trace"
import {
  recordNativeMetadataEffect,
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
    stage: "unavailable" | "incomplete" | "skipped"
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
    version: CodexHostVersion = "0.155.1",
    claudeVersion?: string
  ) {
    if (event === null || typeof event !== "object" || Array.isArray(event)) return
    const identity = yield* adaptComposedHookIdentity(
      { ...event, hook_event_name: "PreToolUse" },
      host,
      "PreToolUse",
      version,
      claudeVersion
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
  const resolveCodexDispatch = Effect.fn("CodexHook.resolveDispatch")(function* (
    projections: Map<string, NativeEditMetadata>,
    policies: Map<string, import("@hapsland/resident-transport/resident/protocol").ResidentEditPolicy | undefined>,
    options: CodexDispatchOptions
  ) {
    let dispatch: import("@hapsland/resident-transport/resident/protocol").ResidentDispatchContext | undefined
    const sourceContexts: import("@hapsland/resident-transport/resident/protocol").ResidentSourceDispatchContext[] = []
    // Resolve review authority only after the source-free selection facts exist.
    for (const [root, metadata] of projections) {
      if (!metadata.candidates.some((candidate) => candidate.selection.status === "selected")) continue
      const selected = yield* makeResidentDispatchContextEffect(
        root,
        options.statePath,
        options.activityPath,
        options.userConfigPath,
        options.controlled,
        policies.get(root)
      ).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (selected === undefined) {
        projections.set(root, {
          ...metadata,
          diagnostic: { stage: "admission", code: "dispatch-unavailable", args: {} }
        })
        continue
      }
      dispatch ??= selected
      sourceContexts.push({
        root,
        credential: selected.credential,
        sessionAnalytics: selected.sessionAnalytics === true
      })
    }
    return {
      metadata: [...projections.values()],
      dispatch: dispatch === undefined ? undefined : { ...dispatch, sourceContexts }
    }
  })
  const codexSourceDispatch = Effect.fn("CodexHook.sourceDispatch")(function* (
    observation: DirectObservation,
    options: CodexDispatchOptions
  ) {
    const projections = new Map<string, NativeEditMetadata>()
    const policies = new Map<
      string,
      import("@hapsland/resident-transport/resident/protocol").ResidentEditPolicy | undefined
    >()
    for (let index = 0; index < observation.candidates.length; index += 1) {
      const single = candidateRootObservation(observation, index)
      if (single === undefined) continue
      if (!projections.has(single.root)) {
        let admission: "skipped-other-root" | undefined
        const policy = yield* readComposedEditPolicyEffect(
          single.root,
          single.advicee,
          undefined,
          observation.candidates.flatMap((candidate, position) =>
            observation.candidateRoots?.[position]?.root === single.root
              ? [resolve(observation.root, candidate.path)]
              : []
          ),
          (outcome) => {
            if (outcome === "skipped-other-root") admission = outcome
          }
        ).pipe(Effect.catch(() => Effect.succeed(undefined)))
        policies.set(single.root, policy)
        projections.set(single.root, {
          root: single.root,
          rootIdentity: single.rootIdentity,
          advicee: single.advicee,
          candidates: [],
          ...(admission === undefined ? {} : { admission })
        })
      }
      const metadata = projections.get(single.root)!
      const candidate = single.candidates[0]!
      const selection =
        metadata.admission === "skipped-other-root"
          ? { status: "not-evaluated" as const }
          : yield* nativeSelection(single.root, candidate, policies.get(single.root)?.filePolicy, single.rootIdentity)
      projections.set(single.root, {
        ...metadata,
        candidates: [
          ...metadata.candidates,
          {
            position: index,
            operation: candidate.operation,
            path: candidate.path,
            selection,
            ...("moveTo" in candidate && typeof candidate.moveTo === "string" ? { moveTo: candidate.moveTo } : {})
          }
        ]
      })
    }
    return yield* resolveCodexDispatch(projections, policies, options)
  })
  const codexObservationStage = (
    observation: DirectObservation | undefined,
    prepared: Effect.Success<ReturnType<typeof codexSourceDispatch>> | undefined
  ) =>
    observation === undefined
      ? "incomplete"
      : prepared?.metadata.length &&
          prepared.metadata.every(
            (metadata) =>
              metadata.admission === "skipped-other-root" ||
              metadata.candidates.every((candidate) => candidate.selection.status === "excluded")
          )
        ? "skipped"
        : "unavailable"
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
      const prepared =
        observation === undefined
          ? undefined
          : yield* codexSourceDispatch(observation, { statePath, activityPath, userConfigPath, controlled })
      yield* recordCodexObservationTrace(observation)
      // The direct dispatcher owns every native apply_patch event. Unsupported
      // shapes remain quiet and can never create review work.
      if (observation === undefined || prepared?.dispatch === undefined || !isControlledWriter) {
        if (prepared !== undefined)
          yield* recordNativeMetadataEffect(prepared.metadata, userConfigPath, activityPath).pipe(
            Effect.catch(() => Effect.void)
          )
        yield* retireNativeEditPermits(nativeEvent, "codex-cli", hostVersion)
        recordCodexHookActivity(reply, activityPath, owner.value.lifetime, codexObservationStage(observation, prepared))
        return { handled: true, output: {} } as const
      }
      // Matching reads are not attribution. The hook command must explicitly be
      // installed with this controlled-writer assertion for the supported Add profile.
      yield* admitCodexHookObservation(
        { ...observation, nativeMetadata: prepared.metadata },
        prepared.dispatch,
        activityPath,
        owner.value.lifetime
      )
      return { handled: true, output: {} } as const
    })

  const runDirectBoundedHook = Effect.fn("ClaudeHook.collectBounded")(function* (
    observation: DirectObservation | undefined,
    controlled: ResidentControlledOptions | undefined,
    statePath: string,
    activityPath: string,
    userConfigPath: string | undefined,
    editPolicy?: import("@hapsland/resident-transport/resident/protocol").ResidentEditPolicy,
    deliveryCwd?: string,
    nativeMetadata?: NativeEditMetadata
  ): Effect.fn.Return<unknown, never, ResidentStartup> {
    const deadline = directHookDeadline
    const bounded = <A, E, R>(task: Effect.Effect<A, E, R>): Effect.Effect<A | undefined, never, R> =>
      Effect.gen(function* () {
        const time = Math.max(0, deadline - (yield* hookMonotonicMillis))
        if (time <= 0) return undefined
        return yield* task.pipe(
          Effect.timeoutOrElse({ duration: time, orElse: () => Effect.succeed(undefined) }),
          Effect.catch(() => Effect.succeed(undefined))
        )
      })
    if (observation === undefined) {
      if (nativeMetadata !== undefined)
        yield* bounded(recordNativeMetadataEffect([nativeMetadata], userConfigPath, activityPath))
      return {}
    }
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
    if (dispatch === undefined) {
      const metadata = observation.nativeMetadata?.map((metadata) => ({
        ...metadata,
        diagnostic: { stage: "admission" as const, code: "dispatch-unavailable" as const, args: {} }
      }))
      if (metadata !== undefined) yield* bounded(recordNativeMetadataEffect(metadata, userConfigPath, activityPath))
      return {}
    }
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
