import { residentSettingsEnvironmentOnly } from "../authorization/credentials.ts"
import type { makeResidentInspection } from "../inspection/observer.ts"
import {
  type NativeEditMetadata,
  type DirectObservation,
  type DirectAdvicee
} from "@hapsland/native-observation/direct-event/observation"
import { packageBuildIdentity } from "@hapsland/runtime-environment/runtime/package-runtime"
import { inspectionSourceId } from "@hapsland/inspection-records/inspection/contract"
import type { Advice } from "../state/advice-records.ts"
import type { RoundWork } from "../state/round-records.ts"
import {
  effectiveSessionAnalytics,
  effectiveEditPermitLimits,
  effectiveVirtualRoundQuietMs
} from "@hapsland/runtime-inputs/configuration/resolve"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import * as Option from "effect/Option"
import * as Effect from "effect/Effect"
import { discoverPhysicalWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { resolvedDirectFilePolicy } from "@hapsland/native-observation/direct-event/selection"
import {
  settingsSource,
  type ReviewSettingsSnapshot,
  type ReviewSettingsOperations
} from "@hapsland/review-definition/runtime/review-settings"
import { type ResidentPaths } from "@hapsland/resident-transport/resident/paths"
import {
  residentUpdateRecipient,
  residentUpdateOpportunity,
  type UpdateRecipient,
  CURRENT_HOOK_CONTRACT,
  UPDATE_NOTICE_COOLDOWN_MS,
  MAX_UPDATE_NOTICE_KEYS,
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
  type CollectionMode
} from "@hapsland/resident-transport/resident/protocol"
import type { Scope } from "effect"
import { Ref } from "effect"
import * as Fiber from "effect/Fiber"
import * as Schedule from "effect/Schedule"
import { type ResidentLedger } from "../work-ownership/jobs.ts"
import type { ResidentAdapterError } from "../adapter-error.ts"
import {
  type ResponseAuthority,
  type EditRequest,
  type EditCollectionRequest,
  type ResponseContext
} from "../advice-delivery/authority.ts"
import { residentResponse } from "../advice-delivery/findings.ts"
import { recipientPartition, editPermitIdentity } from "../recipient/identity.ts"
import {
  residentFinishSelection,
  residentFinishBindingValid,
  residentResponseToken,
  residentNoticeResponse
} from "../advice-delivery/finish.ts"

type Dependencies = {
  readonly lifetime: string
  readonly releaseDelivery: (token: string) => Effect.Effect<void>
  readonly releaseComposedSubmission: (token: string) => Effect.Effect<ResidentResponse>
  readonly beginComposedSubmission: (
    token: string,
    surface: "edit" | "background" | "stop"
  ) => Effect.Effect<ResidentResponse>
  readonly acknowledge: (token: string) => Effect.Effect<ResidentResponse>
  readonly finalize: (token: string) => Effect.Effect<ResidentResponse>
  readonly stats: () => Effect.Effect<Extract<ResidentResponse, { status: "stats" }>>
  readonly close: Effect.Effect<void, ResidentAdapterError>
  readonly residentLifetimeController: AbortController
  readonly residentLedger: ResidentLedger
  readonly residentNow: () => number
  readonly residentAdmit: (
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    composed?: boolean,
    requirePermit?: boolean
  ) => Effect.Effect<{ readonly response: ResidentResponse; readonly settings?: ReviewSettingsSnapshot }, never, never>
  readonly residentCollectorGate: (
    authority: ResponseAuthority,
    dispatch: ResidentDispatchContext,
    now: number
  ) => Effect.Effect<ResidentResponse | undefined, never, never>
  readonly residentCollect: (
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode?: CollectionMode | undefined,
    authority?: ResponseAuthority | undefined,
    composed?: boolean
  ) => Effect.Effect<ResidentResponse, ResidentAdapterError, never>
  readonly residentEditCollectionStatus: (
    authority: ResponseAuthority,
    root: string,
    advicee: DirectAdvicee,
    composed: boolean,
    now: number
  ) => Effect.Effect<ResidentResponse, never, never>
  readonly residentComposedDelivery: ReturnType<ResidentLedger["delivery"]>
  readonly residentStopExpiries: Map<string, Fiber.Fiber<void, never>>
  readonly residentCloseRound: (
    group: string,
    generation: number,
    reason: "deadline" | "unavailable" | "limit" | "no-advice" | "output-failed" | "abandoned-stop" | "quiescent",
    counts: { reservedContinuations: number; submitted: number; uncertain: number; editPermits: number }
  ) => Effect.Effect<void, never, never>
  readonly residentDispatchScope: Scope.Closeable
  readonly residentRootIdentityMatches: (
    expected: DirectObservation["rootIdentity"] | undefined,
    actual: DirectObservation["rootIdentity"]
  ) => boolean
  readonly reviewSettings: ReviewSettingsOperations
  readonly residentPinnedActivity: (
    group: string
  ) => Effect.Effect<Effect.Success<ReturnType<ResidentLedger["rounds"]["activity"]>> | undefined>
  readonly residentInspection: Effect.Success<ReturnType<typeof makeResidentInspection>>
  readonly admit: (
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    composed?: boolean,
    requirePermit?: boolean
  ) => Effect.Effect<ResidentResponse, never, never>
  readonly residentPruneNoticeCooldowns: (
    now: number,
    exceptKey?: string | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentReleaseAdviceLease: (advice: Advice) => Effect.Effect<boolean, never, never>
  readonly residentCollectionWorkCount: (
    root: string,
    advicee: DirectAdvicee,
    composed?: boolean
  ) => Effect.Effect<number, never, never>
  readonly residentDiscardUnfinishedWork: (
    round: RoundWork,
    cancellation: { readonly cancelledSource: ReadonlyArray<number>; readonly cancelledJev: ReadonlyArray<number> }
  ) => Effect.Effect<boolean, never, never>
  readonly residentAllowFinish: (
    group: string,
    token: string,
    reason: "deadline" | "unavailable" | "limit" | "no-advice" | "output-failed" | "abandoned-stop" | "quiescent"
  ) => Effect.Effect<void, never, never>
  readonly residentCollectionWorkState: (
    root: string,
    advicee: DirectAdvicee,
    composed?: boolean
  ) => Effect.Effect<{ readonly status: "pending" | "empty" }, never, never>
  readonly cleanup: () => Effect.Effect<"busy" | "cleaned", never, never>
  readonly paths: ResidentPaths
  readonly inspection: Effect.Success<ReturnType<typeof makeResidentInspection>>["recorder"]
  readonly residentRuntimeScope: Scope.Scope
  readonly updateNoticeBudgets: Ref.Ref<ReadonlyMap<string, number>>
  readonly sweepQuietRounds: (requestedNow?: number | undefined) => Effect.Effect<number, never, never>
}

const residentEditCollectionRequest = (request: EditRequest): EditCollectionRequest => ({
  requestRoute: "edit",
  operation: "collect",
  lifetime: request.lifetime,
  root: request.observation.root,
  advicee: request.observation.advicee,
  dispatch: request.dispatch,
  composed: true,
  mode: "ordinary"
})

function residentResponseCredentialFields(
  deps: Dependencies,
  dispatch: ResidentDispatchContext,
  settings: ReviewSettingsSnapshot
) {
  return {
    credentialGeneration: dispatch.credential?.generation ?? null,
    credentialStatePath: dispatch.credential?.statePath ?? null,
    credentialRequired: dispatch.controlled === null || dispatch.controlled.requireCredential === true,
    credentialEnvironmentOnly: residentSettingsEnvironmentOnly(settings)
  }
}

const residentAdmittedResponseAuthority = Effect.fn("ResidentRuntime.admittedResponseAuthority")(function* (
  deps: Dependencies,
  request: EditRequest,
  group: string,
  settings: ReviewSettingsSnapshot,
  startedAt: number
): Effect.fn.Return<ResponseAuthority> {
  const { observation, dispatch } = request
  return Object.freeze({
    lifetime: deps.lifetime,
    partition: group,
    root: observation.root,
    advicee: Object.freeze({ ...observation.advicee }),
    claudeFeedbackMode: settings.configuration.policy.claudeFeedbackMode.value,
    ...residentResponseCredentialFields(deps, dispatch, settings),
    expiresAt: startedAt + 600_000,
    round: yield* deps.residentLedger.rounds.get(group)
  })
})

const residentAdmitAndCollect = Effect.fn("ResidentRuntime.admitAndCollect")(function* (
  deps: Dependencies,
  request: EditRequest,
  context: Ref.Ref<ResponseContext>
): Effect.fn.Return<ResidentResponse, ResidentAdapterError> {
  const { observation, dispatch } = request
  const startedAt = deps.residentNow()
  const group = recipientPartition(observation.advicee)
  const admission = yield* deps.residentAdmit(observation, dispatch, true, true)
  const admitted = admission.response
  if (admitted.status !== "accepted" || admission.settings === undefined)
    return {
      requestRoute: "edit",
      status:
        admitted.status === "skipped-other-root"
          ? "skipped-other-root"
          : admitted.status === "rejected-stale"
            ? "rejected-stale"
            : "rejected-capacity"
    }
  const authority = yield* residentAdmittedResponseAuthority(deps, request, group, admission.settings, startedAt)
  yield* Ref.set(context, { authority })
  const pass = Effect.fn("ResidentRuntime.collectEditResponse")(function* () {
    const gate = yield* deps.residentCollectorGate(authority, dispatch, deps.residentNow())
    if (gate !== undefined) return gate
    const response = yield* Effect.uninterruptibleMask((restore) =>
      restore(deps.residentCollect(observation.root, observation.advicee, dispatch, "ordinary", authority, true)).pipe(
        Effect.flatMap(
          (response): Effect.Effect<ResidentResponse> =>
            response.status === "advice"
              ? Ref.update(context, (state) => ({ ...state, token: response.token })).pipe(Effect.as(response))
              : Effect.succeed(response)
        )
      )
    )
    return response.status === "advice"
      ? response
      : yield* deps.residentEditCollectionStatus(
          authority,
          observation.root,
          observation.advicee,
          true,
          deps.residentNow()
        )
  })
  return yield* pass().pipe(
    Effect.repeat({ schedule: Schedule.spaced("50 millis"), while: (response) => response.status === "pending" }),
    Effect.timeoutOrElse({
      duration: request.waitMs,
      orElse: () => Effect.succeed<ResidentResponse>({ requestRoute: "edit", status: "pending" })
    }),
    Effect.catch(() =>
      Effect.succeed<ResidentResponse>({ requestRoute: "edit", status: "unavailable", reason: "lost" })
    )
  )
})

const residentHandlePromptMarker = Effect.fn("ResidentRuntime.handle.prompt-marker")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "prompt-marker" }>
) {
  const group = recipientPartition(request.advicee)
  return residentResponse(
    (
      request.onlyIfMissing === true
        ? yield* deps.residentComposedDelivery.ensureFromHostTurn(group, request.marker, deps.residentNow())
        : yield* deps.residentComposedDelivery.advance(group, request.marker, deps.residentNow(), request.promptDigest)
    )
      ? { status: "advanced" }
      : { status: "rejected-capacity" }
  )
})

const residentHandleRecipientRoot = Effect.fn("ResidentRuntime.handle.recipient-root")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "recipient-root" | "edit-policy" }>
) {
  const round = yield* deps.residentLedger.rounds.get(recipientPartition(request.advicee))
  const activity = round === undefined ? undefined : yield* deps.residentLedger.rounds.activity(round)
  return residentResponse({ status: "recipient-root", root: activity?.root ?? null })
})

const residentHandleBeginStop = Effect.fn("ResidentRuntime.handle.begin-stop")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "begin-stop" | "finish-stop" }>
) {
  const group = recipientPartition(request.advicee)
  if (!(yield* deps.residentComposedDelivery.beginStop(group, request.token)))
    return residentResponse({ status: "busy" })
  const expiry = yield* Effect.forkIn(
    Effect.sleep("5 seconds").pipe(
      Effect.andThen(
        Effect.gen(function* () {
          deps.residentStopExpiries.delete(request.token)
          const counts = yield* deps.residentComposedDelivery.closureCounts(group)
          const closed = yield* deps.residentComposedDelivery.expireStop(group, request.token)
          if (closed !== undefined) yield* deps.residentCloseRound(group, closed, "abandoned-stop", counts)
        })
      )
    ),
    deps.residentDispatchScope
  )
  deps.residentStopExpiries.set(request.token, expiry)
  return residentResponse({ status: "advanced" })
})

const residentHandleFinishStop = Effect.fn("ResidentRuntime.handle.finish-stop")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "begin-stop" | "finish-stop" }>
) {
  return yield* Effect.uninterruptible(
    Effect.gen(function* () {
      const expiry = deps.residentStopExpiries.get(request.token)
      if (expiry !== undefined) yield* Fiber.interrupt(expiry)
      deps.residentStopExpiries.delete(request.token)
      const group = recipientPartition(request.advicee)
      const counts = yield* deps.residentComposedDelivery.closureCounts(group)
      const closed = yield* deps.residentComposedDelivery.finishStop(
        group,
        request.token,
        request.close === true,
        deps.residentNow()
      )
      if (closed !== undefined) yield* deps.residentCloseRound(group, closed, request.reason ?? "no-advice", counts)
      return residentResponse({ status: "advanced" })
    })
  )
})

const residentHandleClaimBackground = Effect.fn("ResidentRuntime.handle.claim-background")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "claim-background" | "release-background" }>
) {
  return residentResponse(
    (yield* deps.residentComposedDelivery.claimBackground(
      recipientPartition(request.advicee),
      request.token,
      deps.residentNow()
    ))
      ? { status: "background-claimed" }
      : { status: "busy" }
  )
})

const residentHandleReleaseBackground = Effect.fn("ResidentRuntime.handle.release-background")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "claim-background" | "release-background" }>
) {
  yield* deps.residentComposedDelivery.releaseBackground(recipientPartition(request.advicee), request.token)
  return residentResponse({ status: "released" })
})

const residentHandleBeginSubmission = Effect.fn("ResidentRuntime.handle.begin-submission")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "begin-submission" }>
) {
  return residentResponse(yield* deps.beginComposedSubmission(request.token, request.surface))
})

const residentHandleRelease = Effect.fn("ResidentRuntime.handle.release")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "release" }>
) {
  return residentResponse(yield* deps.releaseComposedSubmission(request.token))
})

const residentPreEditSnapshot = Effect.fn("ResidentRuntime.preEditSnapshot")(function* (
  deps: Dependencies,
  root: string,
  settings: ReviewSettingsSnapshot
) {
  const discovered = yield* discoverPhysicalWorkingTreeRoot(root).pipe(Effect.option)
  if (discovered._tag === "None" || discovered.value.root !== root) return undefined
  const snapshot =
    settings.rootIdentity === undefined
      ? Object.freeze({ ...settings, rootIdentity: Object.freeze({ ...discovered.value.rootIdentity }) })
      : settings
  return deps.residentRootIdentityMatches(snapshot.rootIdentity, discovered.value.rootIdentity) ? snapshot : undefined
})

const residentRegistrationSettings = Effect.fn("ResidentRuntime.registrationSettings")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "register-edit" | "retire-edit" }>,
  group: string
) {
  return (
    (yield* deps.residentComposedDelivery.registeredEditSettings(
      group,
      editPermitIdentity(request.root, request.advicee)
    )) ??
    (yield* deps.reviewSettings
      .capture(settingsSource(request.root, request.userConfigPath))
      .pipe(Effect.catch(() => Effect.succeed(undefined))))
  )
})

const residentRegisterEdit = Effect.fn("ResidentRuntime.registerEdit")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "register-edit" | "retire-edit" }>,
  group: string
) {
  const pin = yield* deps.residentPinnedActivity(group)
  if (pin !== undefined && pin.root !== request.root) {
    yield* deps.residentComposedDelivery.retireEdit(group, editPermitIdentity(request.root, request.advicee))
    return residentResponse({ status: "skipped-other-root" })
  }
  const capture = yield* residentRegistrationSettings(deps, request, group)
  if (capture === undefined) return residentResponse({ status: "rejected-stale", reason: "InvalidConfiguration" })
  const snapshot = yield* residentPreEditSnapshot(deps, request.root, capture)
  if (snapshot === undefined) return residentResponse({ status: "rejected-stale" })
  const decision = yield* deps.residentComposedDelivery.registerEditDecision(
    group,
    editPermitIdentity(request.root, request.advicee),
    request.startedAt,
    monotonicNow(),
    effectiveEditPermitLimits(capture.configuration.policy),
    effectiveVirtualRoundQuietMs(capture.configuration.policy),
    snapshot
  )
  return residentResponse(
    decision.accepted ? { status: "advanced" } : { status: "rejected-stale", reason: decision.reason }
  )
})

const residentHandleRegisterEdit = Effect.fn("ResidentRuntime.handle.register-edit")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "register-edit" | "retire-edit" }>
) {
  const group = recipientPartition(request.advicee)
  if (request.operation !== "retire-edit") return yield* residentRegisterEdit(deps, request, group)
  yield* deps.residentComposedDelivery.retireEdit(group, editPermitIdentity(request.root, request.advicee))
  return residentResponse({ status: "advanced" })
})

const residentHandleAdmit = Effect.fn("ResidentRuntime.handle.admit")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "admit" }>
) {
  if (request.composed !== true) {
    deps.residentInspection.refuse(request.observation, request.dispatch, "unsupported")
    return residentResponse({ status: "unsupported" })
  }
  return residentResponse(yield* deps.admit(request.observation, request.dispatch, true, true))
})

const residentSupportedCollection = (request: Extract<ResidentRequest, { operation: "collect" }>): boolean =>
  request.composed === true && (request.mode !== "turn-end" || request.finish !== undefined)

const residentHandleCollect = Effect.fn("ResidentRuntime.handle.collect")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "collect" }>
) {
  if (!residentSupportedCollection(request)) return residentResponse({ status: "unsupported" })
  const prepareFinishGate = Effect.fn("ResidentRuntime.prepareFinishGate")(function* () {
    const finish = request.finish
    if (finish === undefined) return undefined
    const group = recipientPartition(request.advicee)
    if (!(yield* deps.residentComposedDelivery.ownsStop(group, finish.token)))
      return residentResponse({ status: "empty" })
    // Expired leases represent uncertain external output, not live writers.
    yield* deps.residentPruneNoticeCooldowns(deps.residentNow())
    const pruneFinishLeases = Effect.fn("ResidentRuntime.pruneFinishLeases")(function* () {
      for (const { capability: advice, content } of yield* deps.residentLedger.advice.snapshots()) {
        if (
          recipientPartition(advice.observation.advicee) === group &&
          content.delivery !== undefined &&
          content.delivery.leaseUntil <= deps.residentNow()
        )
          yield* deps.residentReleaseAdviceLease(advice)
      }
    })
    yield* pruneFinishLeases()
    const round = yield* deps.residentLedger.rounds.get(group)
    const totalUnfinished = yield* deps.residentCollectionWorkCount(request.root, request.advicee, true)
    const ownUnfinished = round === undefined ? 0 : (yield* deps.residentLedger.rounds.policyWork(round)).unfinished()
    const extraUnfinished = Math.max(0, totalUnfinished - ownUnfinished)
    const gate = yield* deps.residentComposedDelivery.finishGate(
      group,
      finish.token,
      extraUnfinished,
      finish.deadlineReached
    )
    const discardFinishRound = Effect.fn("ResidentRuntime.discardFinishRound")(function* (
      gate: Extract<Effect.Success<ReturnType<typeof deps.residentComposedDelivery.finishGate>>, { status: "cutoff" }>
    ) {
      if (round === undefined) return true
      return yield* deps.residentDiscardUnfinishedWork(round, gate)
    })
    const interpretFinishGate = Effect.fn("ResidentRuntime.interpretFinishGate")(function* () {
      if (gate === undefined) return residentResponse({ status: "empty" })
      if (gate.status === "waiting") return residentResponse({ status: "pending" })
      if (!(yield* discardFinishRound(gate))) {
        yield* deps.residentAllowFinish(group, finish.token, "unavailable")
        return residentResponse({ status: "empty" })
      }
      if (gate.limited) {
        yield* deps.residentAllowFinish(group, finish.token, "limit")
        return residentResponse({ status: "empty" })
      }
      return undefined
    })
    return yield* interpretFinishGate()
  })
  const gateResponse = yield* prepareFinishGate()
  if (gateResponse !== undefined) return gateResponse
  const collected = yield* deps.residentCollect(
    request.root,
    request.advicee,
    request.dispatch,
    request.mode ?? "ordinary",
    undefined,
    true
  )
  const reserveFinishOutput = Effect.fn("ResidentRuntime.reserveFinishOutput")(function* () {
    const finish = request.finish
    if (finish === undefined) return undefined
    const group = recipientPartition(request.advicee)
    const round = yield* deps.residentLedger.rounds.get(group)
    const selection = yield* residentFinishSelection(deps, collected)
    const pendingFindings = (yield* deps.residentLedger.canonicalProjection()).pendingFindings
    const bindingValid = residentFinishBindingValid(
      deps,
      collected,
      round,
      selection.count,
      selection.advice,
      pendingFindings
    )
    const output = yield* deps.residentComposedDelivery.decideFinishOutput(
      group,
      finish.token,
      residentResponseToken(collected),
      selection.selected,
      deps.residentNow(),
      residentNoticeResponse(collected),
      true,
      true,
      bindingValid,
      finish.deadlineReached
    )
    if (output.kind === "failed") {
      if (collected.status === "advice") yield* deps.releaseDelivery(collected.token)
      return residentResponse({ status: "empty" })
    }
    if (output.kind === "allowed") {
      if (collected.status === "advice") yield* deps.releaseDelivery(collected.token)
      yield* deps.residentAllowFinish(group, finish.token, output.reason)
      if (collected.status === "advice") return residentResponse({ status: "empty" })
    }
    // Only findings can reach the hook. Operational failures remain in
    // resident diagnostics and cannot reserve a continuation.
    return residentResponse(collected)
  })
  const outputResponse = yield* reserveFinishOutput()
  if (outputResponse !== undefined) return outputResponse
  return residentResponse(
    request.reportWorkState === true && collected.status === "empty"
      ? yield* deps.residentCollectionWorkState(request.root, request.advicee, true)
      : collected
  )
})

const residentHandleCleanup = Effect.fn("ResidentRuntime.handle.cleanup")(function* (
  deps: Dependencies,
  _request: Extract<ResidentRequest, { operation: "cleanup" }>
) {
  const status = yield* deps.cleanup()
  return residentResponse({ status })
})

const residentRequestNeedsSweep = (request: ResidentRequest): boolean =>
  ["register-edit", "admit", "admit-and-collect", "begin-stop"].includes(request.operation)

const residentRequestUnsupported = (request: ResidentRequest): boolean =>
  ("advicee" in request && request.advicee.host === "opencode") ||
  ((request.operation === "admit" || request.operation === "admit-and-collect") &&
    request.observation.advicee.host === "opencode")

const residentRequestLifetime = Effect.fn("ResidentRuntime.requestLifetime")(function* (
  deps: Dependencies,
  request: ResidentRequest
) {
  if (request.operation === "hello") {
    return residentResponse(
      (yield* deps.residentLedger.runtime.snapshot()).lifecycle === "active"
        ? { status: "ready", lifetime: deps.lifetime, pid: process.pid, build: packageBuildIdentity }
        : { status: "obsolete-lifetime" }
    )
  }
  if (request.lifetime !== deps.lifetime || (yield* deps.residentLedger.runtime.snapshot()).lifecycle !== "active") {
    return residentResponse(
      request.requestRoute === "edit"
        ? { requestRoute: "edit", status: "unavailable", reason: "lost" }
        : { status: "obsolete-lifetime" }
    )
  }
  return undefined
})

const residentHandleEditPolicy = Effect.fn("ResidentRuntime.handle.edit-policy")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "recipient-root" | "edit-policy" }>
) {
  const group = recipientPartition(request.advicee)
  const active = yield* deps.residentLedger.rounds.get(group)
  const pin = active === undefined ? undefined : yield* deps.residentLedger.rounds.activity(active)
  if (pin !== undefined && pin.root !== request.root) {
    yield* deps.residentComposedDelivery.retireEdit(group, editPermitIdentity(request.root, request.advicee))
    return residentResponse({ status: "skipped-other-root" })
  }
  const settings = yield* deps.residentComposedDelivery.registeredEditSettings(
    group,
    editPermitIdentity(request.root, request.advicee)
  )
  if (settings === undefined) return residentResponse({ status: "rejected-stale" })
  if ((yield* residentPreEditSnapshot(deps, request.root, settings)) === undefined) {
    yield* deps.residentComposedDelivery.retireEdit(group, editPermitIdentity(request.root, request.advicee))
    return residentResponse({ status: "rejected-stale" })
  }
  return residentResponse({
    status: "edit-policy",
    policy: {
      filePolicy: resolvedDirectFilePolicy(settings.configuration.policy),
      credentialEnvVar: settings.configuration.policy.credentialEnvVar.value,
      sessionAnalytics: effectiveSessionAnalytics(settings.configuration.policy)
    }
  })
})

const residentRouteBoundary = Effect.fn("ResidentRuntime.routeBoundary")(function* (
  deps: Dependencies,
  request: ResidentRequest,
  _context: Ref.Ref<ResponseContext>
) {
  if (request.operation === "edit-policy") return yield* residentHandleEditPolicy(deps, request)
  if (request.operation === "recipient-root") return yield* residentHandleRecipientRoot(deps, request)
  if (request.operation === "prompt-marker") return yield* residentHandlePromptMarker(deps, request)
  if (request.operation === "begin-stop") return yield* residentHandleBeginStop(deps, request)
  if (request.operation === "finish-stop") return yield* residentHandleFinishStop(deps, request)
  if (request.operation === "claim-background") return yield* residentHandleClaimBackground(deps, request)
  if (request.operation === "release-background") return yield* residentHandleReleaseBackground(deps, request)
  return undefined
})

const residentRouteReview = Effect.fn("ResidentRuntime.routeReview")(function* (
  deps: Dependencies,
  request: ResidentRequest,
  context: Ref.Ref<ResponseContext>
) {
  if (request.operation === "begin-submission") return yield* residentHandleBeginSubmission(deps, request)
  if (request.operation === "release") return yield* residentHandleRelease(deps, request)
  if (request.operation === "register-edit" || request.operation === "retire-edit")
    return yield* residentHandleRegisterEdit(deps, request)
  if (request.operation === "admit-and-collect") return yield* residentAdmitAndCollect(deps, request, context)
  if (request.operation === "admit") return yield* residentHandleAdmit(deps, request)
  if (request.operation === "collect") return yield* residentHandleCollect(deps, request)
  return undefined
})

const residentTokenAdministration = Effect.fn("ResidentRuntime.tokenAdministration")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "acknowledge" | "finalize" }>
) {
  if (!(yield* deps.residentComposedDelivery.hasToken(request.token))) return residentResponse({ status: "empty" })
  if (request.operation === "acknowledge") return residentResponse(yield* deps.acknowledge(request.token))
  return residentResponse(yield* deps.finalize(request.token))
})

const nativeMetadataStage = (metadata: NativeEditMetadata) =>
  metadata.admission === "skipped-other-root" ||
  metadata.candidates.every((candidate) => candidate.selection.status === "excluded")
    ? "skipped"
    : metadata.diagnostic?.stage === "admission"
      ? "unavailable"
      : "incomplete"

const residentRecordNative = Effect.fn("ResidentRuntime.recordNative")(function* (
  deps: Dependencies,
  request: Extract<ResidentRequest, { operation: "record-native" }>
) {
  for (const metadata of request.metadata) {
    const discovered = yield* discoverPhysicalWorkingTreeRoot(metadata.root).pipe(Effect.option)
    if (
      Option.isNone(discovered) ||
      discovered.value.root !== metadata.root ||
      !deps.residentRootIdentityMatches(metadata.rootIdentity, discovered.value.rootIdentity)
    )
      continue
    deps.residentInspection.receiveMetadata(metadata, { userConfigPath: request.userConfigPath })
    if (request.activityPath !== undefined)
      recordActivity({
        statePath: request.activityPath,
        root: metadata.root,
        advicee: metadata.advicee,
        lifetime: deps.lifetime,
        stage: nativeMetadataStage(metadata)
      })
  }
  return residentResponse({ status: "empty" })
})

const residentRouteAdministration = Effect.fn("ResidentRuntime.routeAdministration")(function* (
  deps: Dependencies,
  request: ResidentRequest,
  _context: Ref.Ref<ResponseContext>
) {
  switch (request.operation) {
    case "acknowledge":
    case "finalize":
      return yield* residentTokenAdministration(deps, request)
    case "record-native":
      return yield* residentRecordNative(deps, request)
    case "inspection-status":
      return residentResponse({
        status: "inspection-status",
        sourceId: inspectionSourceId(deps.paths.socket, deps.lifetime),
        observedAt: Date.now(),
        ...deps.inspection.currentRecording()
      })
    case "stats":
      return residentResponse(yield* deps.stats())
    case "replace":
      // Replacement may abandon transient work. Fence authority before acknowledging;
      // the existing disposer cancels work and releases only this owner's endpoints.
      yield* Effect.uninterruptible(
        Effect.gen(function* () {
          yield* deps.residentLedger.runtime.close()
          // Like ordinary retirement, allow a brief reply window. Disposal remains
          // owned by the resident scope even if the requester disconnects.
          yield* Effect.forkIn(Effect.sleep("10 millis").pipe(Effect.andThen(deps.close)), deps.residentRuntimeScope)
        })
      )
      return residentResponse({ status: "replacing" })
    case "cleanup":
      return yield* residentHandleCleanup(deps, request)
    default:
      return undefined
  }
})

const residentResponseContext = Effect.fn("ResidentRuntime.responseContext")(
  (context: Ref.Ref<ResponseContext> | undefined) =>
    context === undefined ? Ref.make<ResponseContext>({}) : Effect.succeed(context)
)

const inspectRefusedRequest = (
  deps: Dependencies,
  request: ResidentRequest,
  reason: "obsolete-lifetime" | "unsupported"
): void => {
  if (request.operation === "admit" || request.operation === "admit-and-collect")
    deps.residentInspection.refuse(request.observation, request.dispatch, reason)
}

const incompatibleCallerResponse = Effect.fn("ResidentRuntime.incompatibleCallerResponse")(function* (
  deps: Dependencies,
  recipient: UpdateRecipient | undefined,
  eligible: boolean
) {
  if ((yield* deps.residentLedger.runtime.snapshot()).lifecycle !== "active")
    return residentResponse({ status: "obsolete-lifetime" })
  let warn = false
  if (recipient !== undefined && eligible) {
    const key = JSON.stringify([recipient.host, recipient.sessionId, recipient.subagentId])
    const now = deps.residentNow()
    warn = yield* Ref.modify(deps.updateNoticeBudgets, (current) => {
      const next = new Map([...current].filter(([, expiry]) => expiry > now))
      if (next.has(key) || next.size >= MAX_UPDATE_NOTICE_KEYS) return [false, next] as const
      next.set(key, now + UPDATE_NOTICE_COOLDOWN_MS)
      return [true, next] as const
    })
  }
  return residentResponse({ status: "update-required", warn })
})

const incompatibleCaller = (deps: Dependencies, request: ResidentRequest) =>
  request.operation === "hello" || request.hookContract === undefined || request.hookContract === CURRENT_HOOK_CONTRACT
    ? Effect.succeed(undefined)
    : incompatibleCallerResponse(deps, residentUpdateRecipient(request), residentUpdateOpportunity(request))

const residentHandle = Effect.fn("ResidentRuntime.handle")(function* (
  deps: Dependencies,
  request: ResidentRequest,
  responseContext?: Ref.Ref<ResponseContext>
) {
  const incompatible = yield* incompatibleCaller(deps, request)
  if (incompatible !== undefined) return incompatible
  const context = yield* residentResponseContext(responseContext)
  const lifetime = yield* residentRequestLifetime(deps, request)
  if (lifetime !== undefined) {
    inspectRefusedRequest(deps, request, "obsolete-lifetime")
    return lifetime
  }
  if (residentRequestNeedsSweep(request)) yield* deps.sweepQuietRounds(deps.residentNow())
  if (residentRequestUnsupported(request)) {
    inspectRefusedRequest(deps, request, "unsupported")
    return residentResponse({ status: "unsupported" })
  }
  for (const route of [
    residentRouteBoundary.bind(null, deps),
    residentRouteReview.bind(null, deps),
    residentRouteAdministration.bind(null, deps)
  ]) {
    const response = yield* route(request, context)
    if (response !== undefined) return response
  }
  return residentResponse({ status: "unsupported" })
})

export const makeResidentRequests = (deps: Dependencies) => {
  return {
    residentResponseToken,
    residentNoticeResponse,
    incompatibleCallerResponse: incompatibleCallerResponse.bind(null, deps),
    residentHandle: residentHandle.bind(null, deps),
    residentEditCollectionRequest,
    residentRequestLifetime: residentRequestLifetime.bind(null, deps)
  }
}
