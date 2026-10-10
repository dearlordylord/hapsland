import { type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { Advice, AdviceContent } from "../state/advice-records.ts"
import type { PendingNoticeSnapshot as PendingNotice } from "../state/notice-records.ts"
import type { RoundWork } from "../state/round-records.ts"
import { type WorkRevision } from "../state/revision.ts"
import { recordAnalytics } from "@hapsland/activity-observation/activity/analytics"
import * as Effect from "effect/Effect"
import { type PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import { type EvaluatedUnit } from "@hapsland/review-execution/direct-event/pipeline"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type CapacityLedger } from "../state/resident/state.ts"
import { type Dispatcher } from "../state/dispatch.ts"
import type { CanonicalOutput } from "@hapsland/canonical-policy/canonical/adapter"
import { type ResidentLedger, type Job } from "../work-ownership/jobs.ts"
import type { PendingAdviceMetadata, AccountingMetrics } from "./metadata.ts"
import { recipientPartition } from "../recipient/identity.ts"
import { withoutDeliveredFindings } from "./findings.ts"

type AdviceSnapshot = { readonly capability: Advice; readonly content: AdviceContent }
type DeliveryBatch = { readonly advice: ReadonlyArray<AdviceSnapshot>; readonly notices: ReadonlyArray<PendingNotice> }
type SubmissionSurface = "edit" | "background" | "stop"
type Dependencies = {
  readonly residentExpirePending: (now: number) => Effect.Effect<void, never, never>
  readonly residentPruneNoticeCooldowns: (
    now: number,
    exceptKey?: string | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentLedger: ResidentLedger
  readonly residentNoticesForToken: (token: string) => Effect.Effect<PendingNotice[], never, never>
  readonly residentReleaseAdviceLease: (advice: Advice) => Effect.Effect<boolean, never, never>
  readonly residentNotices: ReturnType<ResidentLedger["notices"]>
  readonly lifetime: string
  readonly residentNow: () => number
  readonly residentComposedDelivery: ReturnType<ResidentLedger["delivery"]>
  readonly residentRemoveAdvice: (
    id: string,
    token?: string | undefined,
    retirement?:
      | {
          readonly fate: Parameters<typeof captureInspectionFate>[1]
          readonly reason: Parameters<typeof captureInspectionFate>[2]
        }
      | undefined
  ) => Effect.Effect<boolean, never, never>
  readonly residentRemovePendingNotice: (id: string, token?: string | undefined) => Effect.Effect<boolean, never, never>
  readonly residentPendingCanonicalFindings: (operation: number) => Effect.Effect<number, never, never>
  readonly residentRoundActive: (round: RoundWork | undefined) => Effect.Effect<boolean, never, never>
  readonly residentIsCurrentWork: (
    revision: WorkRevision,
    prepared: PreparedUnit
  ) => Effect.Effect<boolean, never, never>
  readonly residentAdviceCredentialAuthority: (advice: Advice) => boolean
  readonly residentDispatcher: Dispatcher<string, Job>
  readonly residentReuse: ReturnType<ResidentLedger["reuse"]>
}
const residentDeliveryBatch = Effect.fn("ResidentRuntime.deliveryBatch")(function* (
  deps: Dependencies,
  token: string,
  now: number
): Effect.fn.Return<DeliveryBatch> {
  yield* deps.residentExpirePending(now)
  yield* deps.residentPruneNoticeCooldowns(now)
  const advice = (yield* deps.residentLedger.advice.snapshots()).filter(
    ({ content }) => content.delivery?.token === token
  )
  const notices = yield* deps.residentNoticesForToken(token)
  return { advice, notices }
})
function residentDeliveryDecision(
  decision: ReturnType<CapacityLedger["transition"]>,
  message: string
): CanonicalOutput | undefined {
  if (decision.rejection !== undefined || decision.outputs.length !== 1) throw new Error(message)
  return decision.outputs[0]
}
const deliveryExpired = (delivery: { readonly leaseUntil: number } | undefined, now: number): boolean =>
  delivery === undefined || delivery.leaseUntil <= now
const residentBatchExpired = (batch: DeliveryBatch, now: number): boolean =>
  batch.advice.some(({ content }) => deliveryExpired(content.delivery, now)) ||
  batch.notices.some((item) => deliveryExpired(item.delivery, now))
const residentReleaseDeliveryBatch = Effect.fn("ResidentRuntime.releaseDeliveryBatch")(function* (
  deps: Dependencies,
  batch: DeliveryBatch
) {
  yield* Effect.forEach(batch.advice, ({ capability }) => deps.residentReleaseAdviceLease(capability), {
    concurrency: 1,
    discard: true
  })
  yield* Effect.forEach(batch.notices, (item) => deps.residentNotices.release(item.id), {
    concurrency: 1,
    discard: true
  })
})
const unacknowledgedDelivery = (delivery: AdviceContent["delivery"]): boolean =>
  delivery !== undefined && !delivery.acknowledged
const residentSubmissionAnalyticsEligible = (item: AdviceSnapshot): boolean =>
  item.capability.analyticsEnabled && unacknowledgedDelivery(item.content.delivery)
function residentSubmissionAnalyticsGroups(
  advice: ReadonlyArray<AdviceSnapshot>
): ReadonlyArray<ReadonlyArray<AdviceSnapshot>> {
  const groups = new Map<string, ReadonlyArray<AdviceSnapshot>>()
  for (const item of advice) {
    if (!residentSubmissionAnalyticsEligible(item)) continue
    const key = JSON.stringify([item.capability.analyticsPath, item.capability.analyticsControlled])
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.values()]
}
function residentRecordSubmissionAnalytics(deps: Dependencies, group: ReadonlyArray<AdviceSnapshot>): void {
  const first = group[0]?.capability
  if (first === undefined) return
  const findings = group.flatMap(({ content }) => content.delivery?.findings ?? [])
  recordAnalytics({
    enabled: true,
    statePath: first.analyticsPath,
    root: first.observation.root,
    advicee: first.observation.advicee,
    lifetime: deps.lifetime,
    kind: "submitted",
    controlled: first.analyticsControlled,
    findings: findings.length,
    ruleIds: findings.map((finding) => finding.ruleId)
  })
}
const residentAcknowledgeBatch = Effect.fn("ResidentRuntime.acknowledgeBatch")(function* (
  deps: Dependencies,
  batch: DeliveryBatch,
  token: string
) {
  for (const group of residentSubmissionAnalyticsGroups(batch.advice)) residentRecordSubmissionAnalytics(deps, group)
  for (const { capability } of batch.advice)
    yield* deps.residentLedger.advice.updateDelivery(capability, token, { acknowledged: true })
  for (const item of batch.notices) yield* deps.residentNotices.acknowledge(item.id)
})
const acknowledge = Effect.fn("ResidentRuntime.acknowledge")(function* (
  deps: Dependencies,
  token: string
): Effect.fn.Return<ResidentResponse> {
  const now = deps.residentNow()
  const batch = yield* residentDeliveryBatch(deps, token, now)
  const decision = residentDeliveryDecision(
    yield* deps.residentLedger.transition({
      kind: "deliveryAcknowledgeCheck",
      items: batch.advice.length + batch.notices.length,
      anyExpired: residentBatchExpired(batch, now)
    }),
    "canonical acknowledgement refused"
  )
  if (decision?.kind === "deliveryAckEmpty") return { status: "empty" }
  if (decision?.kind === "deliveryAckExpired") {
    yield* residentReleaseDeliveryBatch(deps, batch)
    return { status: "empty" }
  }
  if (decision?.kind !== "deliveryAckReady") throw new Error("invalid canonical acknowledgement")
  const selected = batch.advice.flatMap(({ capability, content }) =>
    (content.delivery?.findings ?? []).map(() => capability.canonicalOperationId)
  )
  if (!(yield* deps.residentComposedDelivery.markSubmitted(token, selected))) return { status: "empty" }
  yield* residentAcknowledgeBatch(deps, batch, token)
  return { status: "acknowledged" }
}, Effect.uninterruptible)
const residentRemainingDeliveryFindings = (
  content: AdviceContent,
  delivered: ReadonlyArray<Finding>,
  composed: boolean
): ReadonlyArray<Finding> => (composed ? [] : withoutDeliveredFindings(content.findings, delivered))
function residentRemainingEvaluations(
  content: AdviceContent,
  delivered: ReadonlyArray<Finding>
): ReadonlyArray<EvaluatedUnit> {
  return content.evaluations
    .map((evaluation) => ({ ...evaluation, findings: withoutDeliveredFindings(evaluation.findings, delivered) }))
    .filter((evaluation) => evaluation.findings.length > 0)
}
const residentFinalizeAdvice = Effect.fn("ResidentRuntime.finalizeAdvice")(function* (
  deps: Dependencies,
  snapshot: AdviceSnapshot,
  token: string,
  composed: boolean
) {
  const { capability: item, content } = snapshot
  const delivered = content.delivery?.findings ?? []
  const remaining = residentRemainingDeliveryFindings(content, delivered, composed)
  const disposition = residentDeliveryDecision(
    yield* deps.residentLedger.transition({
      kind: "deliveryFindingDispositionCheck",
      composed,
      remaining: remaining.length
    }),
    "canonical finding disposition refused"
  )
  if (disposition?.kind === "deliveryKeepForReoffer") {
    yield* deps.residentReleaseAdviceLease(item)
    return
  }
  if (disposition?.kind === "deliveryRetireAdvice") {
    yield* deps.residentRemoveAdvice(item.id, token, { fate: "discarded", reason: "delivery-finalized" })
    return
  }
  if (disposition?.kind !== "deliveryKeepRemaining") throw new Error("invalid canonical delivery disposition")
  yield* deps.residentLedger.advice.revise(item, residentRemainingEvaluations(content, delivered), remaining)
  yield* deps.residentReleaseAdviceLease(item)
})
const residentBatchAcknowledged = (batch: DeliveryBatch): boolean =>
  batch.advice.every(({ content }) => content.delivery?.acknowledged === true) &&
  batch.notices.every((item) => item.delivery?.acknowledged === true)
const residentFinalizeBatch = Effect.fn("ResidentRuntime.finalizeBatch")(function* (
  deps: Dependencies,
  batch: DeliveryBatch,
  token: string,
  composed: boolean
) {
  for (const advice of batch.advice) yield* residentFinalizeAdvice(deps, advice, token, composed)
  for (const item of batch.notices) yield* deps.residentRemovePendingNotice(item.id, token)
})
const finalize = Effect.fn("ResidentRuntime.finalize")(function* (
  deps: Dependencies,
  token: string
): Effect.fn.Return<ResidentResponse> {
  const now = deps.residentNow()
  const batch = yield* residentDeliveryBatch(deps, token, now)
  const decision = residentDeliveryDecision(
    yield* deps.residentLedger.transition({
      kind: "deliveryFinalizeCheck",
      items: batch.advice.length + batch.notices.length,
      allAcknowledged: residentBatchAcknowledged(batch),
      anyExpired: residentBatchExpired(batch, now)
    }),
    "canonical finalization refused"
  )
  if (decision?.kind === "deliveryFinalEmpty") return { status: "empty" }
  if (decision?.kind === "deliveryFinalExpired") {
    yield* residentReleaseDeliveryBatch(deps, batch)
    return { status: "empty" }
  }
  if (decision?.kind !== "deliveryFinalReady") throw new Error("invalid canonical finalization")
  const composed = yield* deps.residentComposedDelivery.hasToken(token)
  yield* residentFinalizeBatch(deps, batch, token, composed)
  return { status: "finalized" }
}, Effect.uninterruptible)
const residentReleaseUnacknowledged = Effect.fn("ResidentRuntime.releaseUnacknowledged")(function* (
  deps: Dependencies,
  acknowledged: boolean
) {
  const command = residentDeliveryDecision(
    yield* deps.residentLedger.transition({ kind: "deliveryReleaseCheck", acknowledged }),
    "canonical delivery release refused"
  )
  if (command?.kind === "deliveryReleaseUnacknowledged") return true
  if (command?.kind === "deliveryKeepAcknowledged") return false
  throw new Error("invalid canonical delivery release")
})
const residentReleaseTokenLease = Effect.fn("ResidentRuntime.releaseTokenLease")(function* (
  deps: Dependencies,
  token: string,
  delivery: { readonly token: string; readonly acknowledged: boolean } | undefined,
  release: Effect.Effect<void>
) {
  if (delivery?.token !== token) return
  if (yield* residentReleaseUnacknowledged(deps, delivery.acknowledged)) yield* release
})
const residentReleaseAdviceForToken = Effect.fn("ResidentRuntime.releaseAdviceForToken")(
  (deps: Dependencies, token: string, snapshot: AdviceSnapshot) =>
    residentReleaseTokenLease(
      deps,
      token,
      snapshot.content.delivery,
      deps.residentReleaseAdviceLease(snapshot.capability)
    )
)
const residentReleaseNoticeForToken = Effect.fn("ResidentRuntime.releaseNoticeForToken")(
  (deps: Dependencies, token: string, notice: PendingNotice) =>
    residentReleaseTokenLease(deps, token, notice.delivery, deps.residentNotices.release(notice.id))
)
const releaseDelivery = Effect.fn("ResidentRuntime.releaseDelivery")(function* (deps: Dependencies, token: string) {
  for (const advice of yield* deps.residentLedger.advice.snapshots())
    yield* residentReleaseAdviceForToken(deps, token, advice)
  for (const notice of yield* deps.residentNoticesForToken(token))
    yield* residentReleaseNoticeForToken(deps, token, notice)
}, Effect.uninterruptible)
const residentPendingSubmissionCapacity = Effect.fn("ResidentRuntime.pendingSubmissionCapacity")(function* (
  deps: Dependencies,
  item: Advice,
  delivery: AdviceContent["delivery"]
) {
  if (item.round === undefined || item.workUnitId === undefined || delivery === undefined) return false
  return delivery.findings.length <= (yield* deps.residentPendingCanonicalFindings(item.canonicalOperationId))
})
const residentSubmissionCandidateFacts = Effect.fn("ResidentRuntime.submissionCandidateFacts")(function* (
  deps: Dependencies,
  snapshot: AdviceSnapshot,
  token: string,
  surface: SubmissionSurface
) {
  const { capability: item, content } = snapshot
  return {
    roundActive: yield* deps.residentRoundActive(item.round),
    hasRound: item.round !== undefined,
    hasUnit: item.workUnitId !== undefined,
    hasDelivery: content.delivery !== undefined,
    pendingCapacity: yield* residentPendingSubmissionCapacity(deps, item, content.delivery),
    submissionAllowed: yield* deps.residentComposedDelivery.canBeginSubmission(
      recipientPartition(item.observation.advicee),
      surface,
      token
    ),
    currentWork: yield* deps.residentIsCurrentWork(item.revision, item.prepared),
    credentialAuthorized: deps.residentAdviceCredentialAuthority(item)
  }
})
const residentSubmissionCandidateValid = Effect.fn("ResidentRuntime.submissionCandidateValid")(function* (
  deps: Dependencies,
  advice: AdviceSnapshot,
  token: string,
  surface: SubmissionSurface
) {
  const facts = yield* residentSubmissionCandidateFacts(deps, advice, token, surface)
  const command = residentDeliveryDecision(
    yield* deps.residentLedger.transition({ kind: "deliverySubmissionCandidateCheck", facts }),
    "canonical submission candidate refused"
  )
  return command?.kind === "deliverySubmissionCandidate"
})
const residentSubmissionSelectionValid = Effect.fn("ResidentRuntime.submissionSelectionValid")(function* (
  deps: Dependencies,
  token: string,
  advice: ReadonlyArray<AdviceSnapshot>,
  finishPermit: boolean
) {
  return (
    !finishPermit ||
    (yield* deps.residentComposedDelivery.finishSelectionMatches(
      token,
      advice.map(({ capability, content }) => ({
        id: capability.id,
        unit: capability.canonicalOperationId,
        findings: content.delivery?.findings ?? []
      }))
    ))
  )
})
const residentAllSubmissionCandidatesValid = Effect.fn("ResidentRuntime.allSubmissionCandidatesValid")(function* (
  deps: Dependencies,
  token: string,
  surface: SubmissionSurface,
  advice: ReadonlyArray<AdviceSnapshot>,
  selectionValid: boolean
) {
  let allValid = selectionValid
  for (const item of advice) {
    if (!allValid) break
    allValid = yield* residentSubmissionCandidateValid(deps, item, token, surface)
  }
  return allValid
})
const residentAuthorizeStopSubmission = Effect.fn("ResidentRuntime.authorizeStopSubmission")(function* (
  deps: Dependencies,
  token: string,
  surface: SubmissionSurface,
  advice: ReadonlyArray<AdviceSnapshot>
) {
  if (surface !== "stop") return true
  const first = advice[0]!.capability
  return yield* deps.residentComposedDelivery.authorizeFinishOutput(
    recipientPartition(first.observation.advicee),
    token
  )
})
const residentBeginSubmissionAdvice = Effect.fn("ResidentRuntime.beginSubmissionAdvice")(function* (
  deps: Dependencies,
  token: string,
  surface: SubmissionSurface,
  advice: ReadonlyArray<AdviceSnapshot>,
  finishPermit: boolean,
  now: number
) {
  for (const { capability: item, content } of advice) {
    if (finishPermit) continue
    const begun = yield* deps.residentComposedDelivery.beginSubmission(
      item.id,
      recipientPartition(item.observation.advicee),
      token,
      content.delivery?.findings ?? [],
      surface,
      now,
      item.canonicalOperationId
    )
    if (!begun) {
      yield* releaseComposedSubmission(deps, token)
      return false
    }
  }
  return true
})
const residentSubmissionAdvice = Effect.fn("ResidentRuntime.submissionAdvice")(function* (
  deps: Dependencies,
  token: string,
  now: number
) {
  return (yield* deps.residentLedger.advice.snapshots()).filter(
    ({ content }) =>
      content.delivery?.token === token && content.delivery.leaseUntil > now && content.delivery.findings.length > 0
  )
})
const residentSubmissionBatchReady = Effect.fn("ResidentRuntime.submissionBatchReady")(function* (
  deps: Dependencies,
  count: number,
  allValid: boolean
) {
  const command = residentDeliveryDecision(
    yield* deps.residentLedger.transition({ kind: "deliverySubmissionBatchCheck", count, allValid }),
    "canonical submission batch refused"
  )
  return command?.kind === "deliveryBatchProceed"
})
const residentStopFinishPermit = Effect.fn("ResidentRuntime.stopFinishPermit")(function* (
  deps: Dependencies,
  surface: SubmissionSurface,
  token: string
) {
  return surface === "stop" && (yield* deps.residentComposedDelivery.hasFinishPermit(token))
})
const beginComposedSubmission = Effect.fn("ResidentRuntime.beginComposedSubmission")(function* (
  deps: Dependencies,
  token: string,
  surface: SubmissionSurface
): Effect.fn.Return<ResidentResponse> {
  const now = deps.residentNow()
  yield* deps.residentExpirePending(now)
  const finishPermit = yield* residentStopFinishPermit(deps, surface, token)
  if (finishPermit && (yield* deps.residentComposedDelivery.isFinishAuthorized(token))) return { status: "empty" }
  if (!(yield* deps.residentComposedDelivery.canBeginExistingToken(surface, token))) return { status: "empty" }
  const advice = yield* residentSubmissionAdvice(deps, token, now)
  const selectionValid = yield* residentSubmissionSelectionValid(deps, token, advice, finishPermit)
  const allValid = yield* residentAllSubmissionCandidatesValid(deps, token, surface, advice, selectionValid)
  if (!(yield* residentSubmissionBatchReady(deps, advice.length, allValid))) {
    yield* releaseComposedSubmission(deps, token)
    return { status: "empty" }
  }
  if (!(yield* residentAuthorizeStopSubmission(deps, token, surface, advice))) return { status: "empty" }
  if (!(yield* residentBeginSubmissionAdvice(deps, token, surface, advice, finishPermit, now)))
    return { status: "empty" }
  return { status: "submitting" }
}, Effect.uninterruptible)
const releaseComposedSubmission = Effect.fn("ResidentRuntime.releaseComposedSubmission")(function* (
  deps: Dependencies,
  token: string
): Effect.fn.Return<ResidentResponse> {
  yield* deps.residentComposedDelivery.release(token)
  yield* releaseDelivery(deps, token)
  return { status: "released" }
}, Effect.uninterruptible)
const residentDispatcherWorkCount = Effect.fn("ResidentRuntime.dispatcherWorkCount")(function* (
  deps: Dependencies,
  partition: string
) {
  const jobs = yield* deps.residentDispatcher.snapshotWhere(({ key }) => key === partition)
  return jobs.queued + jobs.running
})
const residentComposedWorkCount = Effect.fn("ResidentRuntime.composedWorkCount")(function* (
  deps: Dependencies,
  partition: string
) {
  const round = yield* deps.residentLedger.rounds.get(partition)
  return round === undefined ? 0 : (yield* deps.residentLedger.rounds.policyWork(round)).unfinished()
})
const residentLeasedAdviceCount = Effect.fn("ResidentRuntime.leasedAdviceCount")(function* (
  deps: Dependencies,
  partition: string,
  composed: boolean
) {
  return (yield* deps.residentLedger.advice.snapshots()).filter(
    ({ capability: item, content }) =>
      (composed ? recipientPartition(item.observation.advicee) : item.partition) === partition &&
      content.delivery !== undefined
  ).length
})
const residentLeasedNoticeCount = Effect.fn("ResidentRuntime.leasedNoticeCount")(function* (
  deps: Dependencies,
  partition: string,
  composed: boolean
) {
  return [...(yield* deps.residentNotices.entries()).map(([, value]) => value)].filter(
    (notice) =>
      (composed ? notice.deliveryGroup : notice.partition) === partition && notice.pending?.delivery !== undefined
  ).length
})
const residentCollectionWorkCount = Effect.fn("ResidentRuntime.collectionWorkCount")(function* (
  deps: Dependencies,
  root: string,
  advicee: DirectAdvicee,
  composed = false
): Effect.fn.Return<number> {
  const partition = recipientPartition(advicee)
  const dispatcherWork = composed ? 0 : yield* residentDispatcherWorkCount(deps, partition)
  const work = composed ? yield* residentComposedWorkCount(deps, partition) : dispatcherWork
  const pendingEdits = composed && (yield* deps.residentComposedDelivery.hasPendingEdits(partition))
  return (
    Number(pendingEdits) +
    work +
    (yield* residentLeasedAdviceCount(deps, partition, composed)) +
    (yield* residentLeasedNoticeCount(deps, partition, composed))
  )
})
const residentCollectionWorkState = Effect.fn("ResidentRuntime.collectionWorkState")(function* (
  deps: Dependencies,
  root: string,
  advicee: DirectAdvicee,
  composed = false
): Effect.fn.Return<{ readonly status: "pending" | "empty" }> {
  return { status: (yield* residentCollectionWorkCount(deps, root, advicee, composed)) > 0 ? "pending" : "empty" }
})
const whenIdle = Effect.fn("ResidentRuntime.whenIdle")((deps: Dependencies) => deps.residentDispatcher.whenIdle())
const pendingAdviceMetadata = Effect.fn("ResidentRuntime.pendingAdviceMetadata")(function* (
  deps: Dependencies
): Effect.fn.Return<PendingAdviceMetadata> {
  return yield* Effect.forEach(
    yield* deps.residentLedger.advice.snapshots(),
    Effect.fn("ResidentRuntime.adviceMetadata")(function* ({ capability: advice, content }) {
      const reservation = yield* deps.residentLedger.reservationSnapshot(advice.reservation)
      if (reservation === undefined) throw new Error("advice metadata lost reservation ownership")
      return {
        id: advice.id,
        partition: advice.partition,
        sequence: advice.sequence,
        pendingAt: advice.pendingAt,
        collectionEligible: content.collectionEligible,
        retainedBytes: reservation.bytes,
        generation: advice.revision.generation,
        evaluationIdentities: content.evaluations.map(({ prepared }) => prepared.identity),
        path: advice.prepared.input.path,
        pendingFindings: content.findings.length,
        deliveryFindings: content.delivery?.findings.length ?? 0,
        delivery:
          content.delivery === undefined
            ? "available"
            : content.delivery.acknowledged
              ? "leased-acknowledged"
              : "leased-unacknowledged"
      } as const
    })
  )
})
const accountingMetrics = Effect.fn("ResidentRuntime.accountingMetrics")(function* (
  deps: Dependencies
): Effect.fn.Return<AccountingMetrics> {
  const reuse = yield* deps.residentReuse.snapshot()
  const notices = yield* deps.residentNotices.entries()
  const runtimeState = yield* deps.residentLedger.runtime.snapshot()
  let noticeBytes = 0
  for (const [, cooldown] of notices) {
    const reservation = yield* deps.residentLedger.reservationSnapshot(cooldown.reservation)
    if (reservation === undefined) throw new Error("notice accounting lost reservation ownership")
    noticeBytes += reservation.bytes
  }
  return {
    peakLedgerBytes: runtimeState.peakLedgerBytes,
    maxMaterializedPreparedUnits: runtimeState.maxMaterializedPreparedUnits,
    successfulCacheEntries: reuse.entries,
    successfulCacheBytes: reuse.bytes,
    pendingEvaluations: reuse.pending,
    operationalNoticeKeys: notices.length,
    pendingOperationalNotices: notices.filter(([, cooldown]) => cooldown.pending !== undefined).length,
    operationalNoticeBytes: noticeBytes
  }
})
export const makeResidentDelivery = (deps: Dependencies) => {
  return {
    residentCollectionWorkCount: residentCollectionWorkCount.bind(null, deps),
    residentCollectionWorkState: residentCollectionWorkState.bind(null, deps),
    whenIdle: whenIdle.bind(null, deps),
    acknowledge: acknowledge.bind(null, deps),
    finalize: finalize.bind(null, deps),
    releaseDelivery: releaseDelivery.bind(null, deps),
    beginComposedSubmission: beginComposedSubmission.bind(null, deps),
    releaseComposedSubmission: releaseComposedSubmission.bind(null, deps),
    pendingAdviceMetadata: pendingAdviceMetadata.bind(null, deps),
    accountingMetrics: accountingMetrics.bind(null, deps)
  }
}
