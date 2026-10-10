import { type makeResidentInspection } from "../inspection/observer.ts"
import { type InspectionReceipt } from "../inspection/receipt.ts"
import { type DirectObservation, type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { makeResidentRuntimeConfiguration } from "../runtime-configuration.ts"
import type { RoundWork } from "../state/round-records.ts"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import * as Effect from "effect/Effect"
import type * as Semaphore from "effect/Semaphore"
import {
  candidateRootObservation,
  candidatesForSourceRoot,
  observationForTargetRoot
} from "@hapsland/native-observation/direct-event/target-observation"
import { createHash, randomUUID } from "node:crypto"
import { appendFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import { verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"
import { eligibleNamedPath, resolvedDirectFilePolicy } from "@hapsland/native-observation/direct-event/selection"
import {
  settingsSource,
  type ReviewSettingsSnapshot,
  type ReviewSettingsOperations
} from "@hapsland/review-definition/runtime/review-settings"
import { type ResidentDispatchContext, type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type CapacityReservation } from "../state/capacity.ts"
import { type Dispatcher } from "../state/dispatch.ts"
import { type ResidentLedger, type IngressJob, type Job } from "../work-ownership/jobs.ts"
import { RESERVATION_OVERHEAD_BYTES } from "../work-ownership/reservation.ts"
import { recipientPartition, editPermitIdentity, dispatchForSourceRoot } from "../recipient/identity.ts"
import { logicalBytes } from "../state/encoded-size.ts"

type Dependencies = {
  readonly residentComposedDelivery: ReturnType<ResidentLedger["delivery"]>
  readonly residentLedger: ResidentLedger
  readonly residentNotices: ReturnType<ResidentLedger["notices"]>
  readonly lifetime: string
  readonly residentRecordAnalytics: (
    job: Pick<Job, "dispatch" | "observation"> & { readonly analyticsEnabled?: boolean },
    kind:
      | "submitted"
      | "request-started"
      | "request-clear"
      | "request-findings"
      | "request-failed"
      | "request-timeout"
      | "request-interrupted"
      | "request-never-sent"
      | "cache-hit"
      | "joined-review"
      | "skipped-candidate"
      | "incomplete-candidate"
      | "work-discarded"
      | "preparation-failed"
      | "capacity-rejected"
      | "review-unavailable",
    findings?: readonly Finding[] | undefined
  ) => Effect.Effect<void, never, never>
  readonly runtimeConfiguration: Effect.Success<ReturnType<typeof makeResidentRuntimeConfiguration>>
  readonly reviewSettings: ReviewSettingsOperations
  readonly residentOptionalUserConfig: (dispatch: ResidentDispatchContext) => string | undefined
  readonly residentNow: () => number
  readonly residentExpirePending: (now: number) => Effect.Effect<void, never, never>
  readonly residentPruneNoticeCooldowns: (
    now: number,
    exceptKey?: string | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentDispatcher: Dispatcher<string, Job>
  readonly inspection: Effect.Success<ReturnType<typeof makeResidentInspection>>["recorder"]
  readonly residentInspection: Effect.Success<ReturnType<typeof makeResidentInspection>>
  readonly admissionLock: Semaphore.Semaphore
}
const residentPruneCollectionTokenIds = Effect.fn("ResidentRuntime.pruneCollectionTokenIds")(function* (
  deps: Dependencies
) {
  const live = yield* deps.residentComposedDelivery.liveCollectionTokenKeys()
  for (const { content } of yield* deps.residentLedger.advice.snapshots()) {
    if (content.delivery !== undefined) live.add(content.delivery.token)
  }
  for (const notice of (yield* deps.residentNotices.entries()).map(([, value]) => value)) {
    if (notice.pending?.delivery !== undefined) live.add(notice.pending.delivery.token)
  }
  yield* deps.residentLedger.pruneCollectionTokenIds(live)
}, Effect.uninterruptible)
const residentRoundSnapshot = Effect.fn("ResidentRuntime.roundSnapshot")(function* (
  deps: Dependencies,
  round: RoundWork
) {
  const snapshot = yield* deps.residentLedger.rounds.snapshot(round)
  if (snapshot === undefined) throw new Error("native round snapshot lost its capability")
  return snapshot
})
function recordResidentObservationActivity(
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  stage: "pending" | "incomplete" | "unavailable"
): void {
  recordActivity({
    statePath: dispatch.activityPath,
    root: observation.root,
    advicee: observation.advicee,
    lifetime: deps.lifetime,
    stage
  })
}
const residentRejectAdmissionCapacity = Effect.fn("ResidentRuntime.rejectAdmissionCapacity")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext
) {
  yield* deps.residentLedger.runtime.rejectCapacity()
  yield* deps.residentRecordAnalytics({ observation, dispatch }, "capacity-rejected")
  recordResidentObservationActivity(deps, observation, dispatch, "unavailable")
})
const residentAdmissionGeneration = Effect.fn("ResidentRuntime.admissionGeneration")(function* (
  deps: Dependencies,
  group: string,
  observation: DirectObservation,
  composed: boolean,
  requirePermit: boolean
) {
  return composed
    ? yield* deps.residentComposedDelivery.admitEditObservation(
        group,
        editPermitIdentity(observation.root, observation.advicee),
        monotonicNow(),
        requirePermit
      )
    : undefined
})
const residentBindAdmissionRound = Effect.fn("ResidentRuntime.bindAdmissionRound")(function* (
  deps: Dependencies,
  group: string,
  generation: number | undefined,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext
) {
  return generation === undefined
    ? undefined
    : yield* deps.residentLedger.rounds.bind(
        group,
        generation,
        {
          root: observation.root,
          rootIdentity: observation.rootIdentity,
          advicee: observation.advicee,
          activityPath: dispatch.activityPath
        },
        randomUUID()
      )
})
const residentAdmissionCanonicalRound = Effect.fn("ResidentRuntime.admissionCanonicalRound")(function* (
  deps: Dependencies,
  round: RoundWork | undefined,
  partition: string
) {
  return round?.canonicalRound ?? (yield* deps.residentLedger.roundId(partition))
})
const residentAdmissionJob = Effect.fn("ResidentRuntime.admissionJob")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  partition: string,
  canonicalRound: number,
  canonicalObservationId: number,
  reservation: CapacityReservation,
  round: RoundWork | undefined,
  settings: ReviewSettingsSnapshot,
  inspectionReceipt: InspectionReceipt | undefined
): Effect.fn.Return<IngressJob> {
  const roundFields =
    round === undefined
      ? {}
      : {
          round,
          work: (yield* residentRoundSnapshot(deps, round)).work,
          workObservationId: (yield* deps.residentLedger.rounds.policyWork(round)).admit(canonicalObservationId)
        }
  return {
    kind: "ingress",
    ...(inspectionReceipt === undefined ? {} : { inspectionReceipt }),
    settings,
    canonicalRound,
    ...roundFields,
    observation,
    canonicalObservationId,
    partition,
    reservation,
    dispatch
  }
})
const residentTraceAdvicee = (
  advicee: DirectAdvicee
): advicee is DirectAdvicee & { readonly sessionId: string; readonly toolUseId: string } =>
  typeof advicee.sessionId === "string" && typeof advicee.toolUseId === "string"
function residentWriteAdmissionTrace(path: string, salt: string, observation: DirectObservation): void {
  if (!residentTraceAdvicee(observation.advicee)) return
  const { sessionId, toolUseId } = observation.advicee
  const key = (value: string) => createHash("sha256").update(`${salt}:${value}`).digest("hex")
  void appendFile(path, `${JSON.stringify({ key: key(toolUseId), sessionKey: key(sessionId) })}\n`, "utf8").catch(
    () => undefined
  )
}
function residentRecordAdmissionTrace(deps: Dependencies, observation: DirectObservation): void {
  const path = deps.runtimeConfiguration.admissionTracePath
  const salt = deps.runtimeConfiguration.admissionSalt
  if (path !== undefined && salt !== undefined) residentWriteAdmissionTrace(path, salt, observation)
}
function residentRecordAdmissionDiagnostics(deps: Dependencies, observation: DirectObservation): void {
  const acceptedPath = deps.runtimeConfiguration.admissionAcceptedPath
  if (acceptedPath !== undefined) void writeFile(acceptedPath, "accepted\n").catch(() => undefined)
  residentRecordAdmissionTrace(deps, observation)
}
const residentAdmissionStale = (composed: boolean, generation: number | undefined): boolean =>
  composed && generation === undefined
const residentAdmissionSettings = Effect.fn("ResidentRuntime.admissionSettings")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  group: string,
  dispatch: ResidentDispatchContext
) {
  const registered = yield* deps.residentComposedDelivery.registeredEditSettings(
    group,
    editPermitIdentity(observation.root, observation.advicee)
  )
  return (
    registered ??
    (yield* deps.reviewSettings
      .capture(settingsSource(observation.root, deps.residentOptionalUserConfig(dispatch)))
      .pipe(Effect.catch(() => Effect.succeed(undefined))))
  )
})
const residentPinnedActivity = Effect.fn("ResidentRuntime.pinnedActivity")(function* (
  deps: Dependencies,
  group: string
) {
  const active = yield* deps.residentLedger.rounds.get(group)
  return active === undefined ? undefined : yield* deps.residentLedger.rounds.activity(active)
})
const residentAnyEligibleTarget = Effect.fn("ResidentRuntime.anyEligibleTarget")(function* (
  observation: DirectObservation,
  settings: ReviewSettingsSnapshot
) {
  if (!(yield* verifyObservationRoot(observation))) return false
  for (const candidate of observation.candidates) {
    if (candidate.operation !== "add" && candidate.operation !== "update") continue
    if (
      yield* eligibleNamedPath(
        observation.root,
        candidate.path,
        resolvedDirectFilePolicy(settings.configuration.policy),
        observation.rootIdentity
      )
    )
      return true
  }
  return false
})
const residentRootIdentityMatches = (
  expected: DirectObservation["rootIdentity"] | undefined,
  actual: DirectObservation["rootIdentity"]
) => expected === undefined || canonicalValue(expected) === canonicalValue(actual)
const residentSourceRefusal = Effect.fn("ResidentRuntime.sourceRefusal")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  settings: ReviewSettingsSnapshot,
  group: string,
  composed: boolean
) {
  if (!residentRootIdentityMatches(settings.rootIdentity, observation.rootIdentity)) return "rejected-stale" as const
  if (!composed) return undefined
  const pin = yield* residentPinnedActivity(deps, group)
  if (pin === undefined)
    return (yield* residentAnyEligibleTarget(observation, settings)) ? undefined : ("rejected-stale" as const)
  if (pin.root !== observation.root) return "skipped-other-root" as const
  if (!residentRootIdentityMatches(pin.rootIdentity, observation.rootIdentity)) return "rejected-stale" as const
  return undefined
})
const residentCanonicalAdmissionIds = Effect.fn("ResidentRuntime.canonicalAdmissionIds")(function* (
  deps: Dependencies,
  editAdmission: Effect.Success<ReturnType<typeof residentAdmissionGeneration>>,
  round: RoundWork | undefined,
  partition: string
) {
  const canonicalRound =
    editAdmission?.canonicalRound ?? (yield* residentAdmissionCanonicalRound(deps, round, partition))
  const canonicalObservationId =
    editAdmission?.canonicalObservationId ?? (yield* deps.residentLedger.admitObservation(partition, canonicalRound))
  return { canonicalRound, canonicalObservationId }
})
const residentAdmissionPreflight = Effect.fn("ResidentRuntime.admissionPreflight")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  composed: boolean
) {
  const now = deps.residentNow()
  yield* deps.residentExpirePending(now)
  // Reclaim cooldown state whose active guarantee and pending notice have
  // both ended before it can cause an otherwise-valid admission to fail.
  yield* deps.residentPruneNoticeCooldowns(now)
  if ((yield* deps.residentLedger.runtime.snapshot()).lifecycle !== "active")
    return { response: { status: "rejected-capacity" as const } }
  const group = recipientPartition(observation.advicee)
  const settings = yield* residentAdmissionSettings(deps, observation, group, dispatch)
  // A registered edit keeps its original snapshot, even after the cache expires.
  if (settings === undefined) return { response: { status: "rejected-stale" as const } }
  const sourceRefusal = yield* residentSourceRefusal(deps, observation, settings, group, composed)
  if (sourceRefusal !== undefined) {
    yield* deps.residentComposedDelivery.retireEdit(group, editPermitIdentity(observation.root, observation.advicee))
    return { response: { status: sourceRefusal } }
  }
  const reservation = yield* deps.residentLedger.reserve(
    group,
    logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES,
    "observationDispatch"
  )
  if (reservation === undefined) {
    yield* residentRejectAdmissionCapacity(deps, observation, dispatch)
    return { response: { status: "rejected-capacity" as const } }
  }
  return { group, settings, reservation }
})
const admitCore = Effect.fn("ResidentRuntime.admitCore")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  composed = false,
  requirePermit = false,
  inspectionReceipt?: InspectionReceipt
): Effect.fn.Return<{ readonly response: ResidentResponse; readonly settings?: ReviewSettingsSnapshot }> {
  const preflight = yield* residentAdmissionPreflight(deps, observation, dispatch, composed)
  if ("response" in preflight) return { response: preflight.response }
  const { group, settings, reservation } = preflight
  const editAdmission = yield* residentAdmissionGeneration(deps, group, observation, composed, requirePermit)
  const generation = editAdmission?.generation
  const editSettings = editAdmission?.settings ?? settings
  if (residentAdmissionStale(composed, generation)) {
    recordResidentObservationActivity(deps, observation, dispatch, "incomplete")
    yield* deps.residentLedger.release(reservation)
    return { response: { status: "rejected-stale" } }
  }
  const round = yield* residentBindAdmissionRound(deps, group, generation, observation, dispatch)
  const partition = group
  const { canonicalRound, canonicalObservationId } = yield* residentCanonicalAdmissionIds(
    deps,
    editAdmission,
    round,
    partition
  )
  const job = yield* residentAdmissionJob(
    deps,
    observation,
    dispatch,
    partition,
    canonicalRound,
    canonicalObservationId,
    reservation,
    round,
    editSettings,
    inspectionReceipt
  )
  if (!(yield* deps.residentDispatcher.enqueue(partition, job))) {
    yield* deps.residentLedger.observation(partition, canonicalObservationId, "interruptObservation", canonicalRound)
    yield* deps.residentLedger.release(reservation)
    yield* residentRejectAdmissionCapacity(deps, observation, dispatch)
    return { response: { status: "rejected-capacity" } }
  }
  residentRecordAdmissionDiagnostics(deps, observation)
  recordResidentObservationActivity(deps, observation, dispatch, "pending")
  return { response: { status: "accepted" }, settings: editSettings }
}, Effect.uninterruptible)
const residentRetireCandidateRoots = Effect.fn("ResidentRuntime.retireCandidateRoots")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  keepRoot?: string
) {
  const roots = new Set(observation.candidateRoots?.flatMap((target) => (target === null ? [] : [target.root])))
  for (const root of roots) {
    if (root === keepRoot) continue
    yield* deps.residentComposedDelivery.retireEdit(
      recipientPartition(observation.advicee),
      editPermitIdentity(root, observation.advicee)
    )
  }
})
const residentCandidateEligible = Effect.fn("ResidentRuntime.candidateEligible")(function* (
  deps: Dependencies,
  single: DirectObservation,
  group: string,
  dispatch: ResidentDispatchContext,
  requirePermit: boolean
) {
  if (
    requirePermit &&
    (yield* deps.residentComposedDelivery.registeredEditSettings(
      group,
      editPermitIdentity(single.root, single.advicee)
    )) === undefined
  )
    return false
  const settings = yield* residentAdmissionSettings(deps, single, group, dispatch)
  if (settings === undefined) return false
  if (
    settings.rootIdentity !== undefined &&
    canonicalValue(settings.rootIdentity) !== canonicalValue(single.rootIdentity)
  )
    return false
  return yield* residentAnyEligibleTarget(single, settings)
})
const residentFirstTarget = Effect.fn("ResidentRuntime.firstTarget")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  group: string,
  dispatch: ResidentDispatchContext,
  requirePermit: boolean,
  pinnedRoot?: string
) {
  for (let index = 0; index < observation.candidates.length; index += 1) {
    const single = candidateRootObservation(observation, index, pinnedRoot)
    if (single === undefined) continue
    if (pinnedRoot !== undefined) return single
    if (yield* residentCandidateEligible(deps, single, group, dispatch, requirePermit)) return single
  }
  return undefined
})
const residentRouteSingleSource = Effect.fn("ResidentRuntime.routeSingleSource")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  group: string,
  pinnedRoot?: string
) {
  if (pinnedRoot === undefined || pinnedRoot === observation.root) return { observation, skipped: [] as string[] }
  yield* deps.residentComposedDelivery.retireEdit(group, editPermitIdentity(observation.root, observation.advicee))
  return { skipped: observation.candidates.map((candidate) => resolve(observation.root, candidate.path)) }
})
const residentRouteObservation = Effect.fn("ResidentRuntime.routeObservation")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  composed: boolean,
  requirePermit: boolean
) {
  if (!composed) return { observation, skipped: [] as string[] }
  const group = recipientPartition(observation.advicee)
  yield* deps.residentComposedDelivery.expirePermits(monotonicNow())
  const pin = yield* residentPinnedActivity(deps, group)
  if (observation.candidateRoots === undefined)
    return yield* residentRouteSingleSource(deps, observation, group, pin?.root)
  if (observation.candidateRoots.length !== observation.candidates.length) return undefined
  const selected = yield* residentFirstTarget(deps, observation, group, dispatch, requirePermit, pin?.root)
  if (selected === undefined) {
    yield* residentRetireCandidateRoots(deps, observation, pin?.root)
    return { skipped: observation.candidates.map((candidate) => resolve(observation.root, candidate.path)) }
  }
  const { indices, skipped } = candidatesForSourceRoot(observation, selected.root)
  if (pin !== undefined) yield* residentRetireCandidateRoots(deps, observation, selected.root)
  return { observation: observationForTargetRoot(observation, selected.root, selected.rootIdentity, indices), skipped }
})
const residentRecordAdmission = (
  deps: Dependencies,
  receipt: InspectionReceipt,
  status: ResidentResponse["status"]
) => {
  if (status === "accepted" || status === "rejected-capacity" || status === "rejected-stale")
    deps.inspection.offer(receipt.scope, receipt.correlation, { kind: "edit-admission", outcome: status })
}
const residentSkippedAdmission = Effect.fn("ResidentRuntime.skippedAdmission")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  receipts: ReadonlyMap<string, InspectionReceipt>,
  skipped: ReadonlyArray<string>
) {
  const active = yield* deps.residentLedger.rounds.get(recipientPartition(observation.advicee))
  const pin = active === undefined ? undefined : yield* deps.residentLedger.rounds.activity(active)
  for (const receipt of receipts.values()) {
    deps.inspection.offer(receipt.scope, receipt.correlation, {
      kind: "edit-admission",
      outcome: active === undefined ? "rejected-stale" : "skipped-other-root"
    })
    if (pin !== undefined && active !== undefined)
      deps.inspection.offer(receipt.scope, receipt.correlation, {
        kind: "round-membership",
        roundId: `${deps.lifetime}:${active.canonicalRound}`,
        pinnedRoot: pin.root,
        skippedPaths: skipped
      })
  }
  return { response: { status: active === undefined ? ("rejected-stale" as const) : ("skipped-other-root" as const) } }
})
const residentRetryCandidates = Effect.fn("ResidentRuntime.retryCandidates")(function* (
  deps: Dependencies,
  native: DirectObservation,
  remaining: DirectObservation,
  selected: DirectObservation,
  status: ResidentResponse["status"],
  composed: boolean
) {
  if (!composed || native.candidateRoots === undefined) return undefined
  if (status !== "rejected-stale" && status !== "rejected-capacity") return undefined
  if ((yield* deps.residentLedger.rounds.get(recipientPartition(selected.advicee))) !== undefined) return undefined
  yield* deps.residentComposedDelivery.retireEdit(
    recipientPartition(selected.advicee),
    editPermitIdentity(selected.root, selected.advicee)
  )
  const candidateRoots = remaining.candidateRoots!.map((target) => (target?.root === selected.root ? null : target))
  return candidateRoots.some((target) => target !== null) ? { ...native, candidateRoots } : undefined
})
const residentAcceptedMembership = Effect.fn("ResidentRuntime.acceptedMembership")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  native: DirectObservation,
  receipt: InspectionReceipt,
  skipped: ReadonlyArray<string>,
  status: ResidentResponse["status"],
  composed: boolean
) {
  if (!composed || status !== "accepted") return
  const active = yield* deps.residentLedger.rounds.get(recipientPartition(observation.advicee))
  if (active === undefined) return
  yield* residentRetireCandidateRoots(deps, native, observation.root)
  deps.inspection.offer(receipt.scope, receipt.correlation, {
    kind: "round-membership",
    roundId: `${deps.lifetime}:${active.canonicalRound}`,
    pinnedRoot: observation.root,
    skippedPaths: skipped
  })
})
const residentAdmitSource = Effect.fn("ResidentRuntime.admitSource")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  composed: boolean,
  requirePermit: boolean,
  receipt: InspectionReceipt
) {
  const sourceDispatch = dispatchForSourceRoot(dispatch, observation.root)
  if (sourceDispatch === undefined) return { response: { status: "rejected-stale" as const } }
  return yield* admitCore(deps, observation, sourceDispatch, composed, requirePermit, receipt)
})
const residentRecordOtherRootAdmissions = (
  deps: Dependencies,
  receipts: ReadonlyMap<string, InspectionReceipt>,
  selectedRoot: string
): void => {
  for (const [root, receipt] of receipts) {
    if (root !== selectedRoot) {
      deps.inspection.offer(receipt.scope, receipt.correlation, {
        kind: "edit-admission",
        outcome: "skipped-other-root"
      })
    }
  }
}
const residentAdmitOperation = Effect.fn("ResidentRuntime.admit")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  composed = false,
  requirePermit = false
): Effect.fn.Return<{ readonly response: ResidentResponse; readonly settings?: ReviewSettingsSnapshot }> {
  const receipts = deps.residentInspection.ingress(observation, dispatch)
  // Metadata is consumed at ingress; review jobs retain only review observations.
  const { nativeMetadata: _nativeMetadata, ...native } = observation
  let remaining = native
  while (true) {
    const routed = yield* residentRouteObservation(deps, remaining, dispatch, composed, requirePermit)
    if (routed === undefined) return { response: { status: "rejected-stale" as const } }
    if (routed.observation === undefined) return yield* residentSkippedAdmission(deps, native, receipts, routed.skipped)
    const selected = routed.observation
    const receipt = receipts.get(selected.root)!
    const admission = yield* residentAdmitSource(deps, selected, dispatch, composed, requirePermit, receipt)
    const retry = yield* residentRetryCandidates(deps, native, remaining, selected, admission.response.status, composed)
    if (retry !== undefined) {
      remaining = retry
      residentRecordAdmission(deps, receipt, admission.response.status)
      continue
    }
    yield* residentAcceptedMembership(
      deps,
      selected,
      native,
      receipt,
      routed.skipped,
      admission.response.status,
      composed
    )
    residentRecordAdmission(deps, receipt, admission.response.status)
    if (admission.response.status === "accepted") residentRecordOtherRootAdmissions(deps, receipts, selected.root)
    return admission
  }
})
const residentAdmit = (
  deps: Dependencies,
  ...args: [
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    composed?: boolean,
    requirePermit?: boolean
  ]
) => residentAdmitOperation(deps, ...args).pipe(deps.admissionLock.withPermits(1), Effect.uninterruptible)
const admit = Effect.fn("ResidentRuntime.admitResponse")(
  (
    deps: Dependencies,
    ...args: [
      observation: DirectObservation,
      dispatch: ResidentDispatchContext,
      composed?: boolean,
      requirePermit?: boolean
    ]
  ) => residentAdmit(deps, ...args).pipe(Effect.map(({ response }) => response))
)
export const makeResidentAdmission = (deps: Dependencies) => {
  return {
    residentRoundSnapshot: residentRoundSnapshot.bind(null, deps),
    residentAdmit: residentAdmit.bind(null, deps),
    residentRootIdentityMatches,
    residentPinnedActivity: residentPinnedActivity.bind(null, deps),
    admit: admit.bind(null, deps),
    residentPruneCollectionTokenIds: residentPruneCollectionTokenIds.bind(null, deps)
  }
}
