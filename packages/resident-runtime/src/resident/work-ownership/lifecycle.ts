import type { makeResidentInspection } from "../inspection/observer.ts"
import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { Advice, AdviceContent } from "../state/advice-records.ts"
import type { PendingNoticeSnapshot as PendingNotice } from "../state/notice-records.ts"
import type { RoundWork, RoundRecord } from "../state/round-records.ts"
import type { JoinedReviewOutcome } from "../state/joined-reviews.ts"
import { type WorkRevision } from "../state/revision.ts"
import {
  recordRoundClosure,
  type RoundCloseReason,
  recordActivity
} from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import { randomUUID } from "node:crypto"
import { type PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import { type ResidentUnavailableReason } from "@hapsland/resident-transport/resident/protocol"
import { type Dispatcher } from "../state/dispatch.ts"
import type { ComposedDelivery } from "../state/composed-delivery.ts"
import { type FindingSelectionFacts, type OperationalNoticeKind } from "../state/collection-facts.ts"
import { type ResidentLedger, type UnitJob, type Job } from "./jobs.ts"
import { recipientPartition, addressableAdvicee } from "../recipient/identity.ts"

type Dependencies = {
  readonly residentNotices: ReturnType<ResidentLedger["notices"]>
  readonly residentLedger: ResidentLedger
  readonly residentNow: () => number
  readonly residentComposedDelivery: ReturnType<ResidentLedger["delivery"]>
  readonly residentJoined: ReturnType<ResidentLedger["joinedReviews"]>
  readonly lifetime: string
  readonly residentAdvice: () => Effect.Effect<readonly Advice[], never, never>
  readonly residentAdviceExpired: (
    advice: Pick<Advice, "pendingAt">,
    now: number
  ) => Effect.Effect<boolean, never, never>
  readonly residentInspection: Effect.Success<ReturnType<typeof makeResidentInspection>>
  readonly residentDispatcher: Dispatcher<string, Job>
  readonly residentLifetimeController: AbortController
  readonly residentRoundSnapshot: (round: RoundWork) => Effect.Effect<RoundRecord, never, never>
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
  readonly residentReuse: ReturnType<ResidentLedger["reuse"]>
}
const residentPendingNoticeCount = Effect.fn("ResidentRuntime.pendingNoticeCount")(function* (
  deps: Dependencies
): Effect.fn.Return<number> {
  let count = 0
  for (const cooldown of (yield* deps.residentNotices.entries()).map(([, value]) => value)) {
    if (cooldown.pending !== undefined) count += 1
  }
  return count
})
const residentNoticesForToken = Effect.fn("ResidentRuntime.noticesForToken")(function* (
  deps: Dependencies,
  token: string
): Effect.fn.Return<Array<PendingNotice>> {
  const notices: Array<PendingNotice> = []
  for (const cooldown of (yield* deps.residentNotices.entries()).map(([, value]) => value)) {
    if (cooldown.pending?.delivery?.token === token) notices.push(cooldown.pending)
  }
  return notices
})
const residentRemovePendingNotice = Effect.fn("ResidentRuntime.removePendingNotice")(
  (deps: Dependencies, id: string, token?: string) => deps.residentNotices.remove(id, token)
)
const residentReleaseNoticeCooldown = Effect.fn("ResidentRuntime.releaseNoticeCooldown")(
  (deps: Dependencies, key: string) => deps.residentNotices.drop(key)
)
const residentPruneNoticeCooldowns = Effect.fn("ResidentRuntime.pruneNoticeCooldowns")(
  (deps: Dependencies, now: number, exceptKey?: string) => deps.residentNotices.prune(now, exceptKey)
)
const residentRecordOperationalFailure = Effect.fn("ResidentRuntime.recordOperationalFailure")(function* (
  deps: Dependencies,
  observation: DirectObservation,
  kind: OperationalNoticeKind,
  now?: number
): Effect.fn.Return<void> {
  if (
    (yield* deps.residentLedger.runtime.snapshot()).lifecycle !== "active" ||
    !addressableAdvicee(observation.advicee)
  )
    return
  yield* deps.residentNotices.record(recipientPartition(observation.advicee), kind, now ?? deps.residentNow())
})
const residentAdviceCollectionReady = (
  advice: Advice,
  content: AdviceContent,
  composed: boolean,
  generation: number
): boolean => {
  if (!content.collectionEligible) return false
  return composed && advice.round !== undefined ? advice.round.generation === generation : true
}
const residentFindingSelectionFacts = Effect.fn("ResidentRuntime.findingSelectionFacts")(function* (
  deps: Dependencies,
  advice: Advice,
  partition: string,
  credentialGeneration: number | null,
  now: number,
  composed: boolean
): Effect.fn.Return<FindingSelectionFacts> {
  const partitionId = yield* deps.residentLedger.knownPartitionId(partition)
  if (partitionId === undefined) throw new Error("finding selection lost its resident partition identity")
  const content = yield* deps.residentLedger.advice.current(advice)
  const generation = composed ? yield* deps.residentComposedDelivery.generation(partition) : 0
  return {
    partition: partitionId,
    round: generation,
    unit: advice.revision.generation,
    snapshot: advice.revision.generation,
    currentSnapshot: yield* deps.residentLedger.revision.generation(advice.revision.subject),
    credential: advice.credentialGeneration ?? 0,
    currentCredential: credentialGeneration ?? 0,
    ageMs: Math.floor(Math.max(0, now - advice.pendingAt)),
    collectionReady: residentAdviceCollectionReady(advice, content, composed, generation)
  }
})
const residentRegisterRevision = Effect.fn("ResidentRuntime.registerRevision")(function* (
  deps: Dependencies,
  partition: string,
  prepared: PreparedUnit,
  addMember: boolean
): Effect.fn.Return<WorkRevision> {
  const { revision, replaced } = yield* deps.residentLedger.revision.register(
    partition,
    prepared,
    addMember,
    randomUUID()
  )
  if (replaced) yield* residentRetireSuperseded(deps, revision.subject, revision.generation, addMember)
  return revision
}, Effect.uninterruptible)
const residentRegisterCurrentWork = Effect.fn("ResidentRuntime.registerCurrentWork")(
  (deps: Dependencies, partition: string, prepared: PreparedUnit) =>
    residentRegisterRevision(deps, partition, prepared, true)
)
const residentRetireSuperseded = Effect.fn("ResidentRuntime.retireSuperseded")(function* (
  deps: Dependencies,
  subject: string,
  generation: number,
  includeJoined: boolean
) {
  const superseded = (revision: WorkRevision) => deps.residentLedger.revision.superseded(subject, revision)
  if ((yield* deps.residentLedger.revision.generation(subject)) !== generation)
    throw new Error("canonical revision changed")
  if (includeJoined) {
    for (const review of yield* deps.residentJoined.retireSuperseded(subject)) {
      recordActivity({
        statePath: review.activityPath,
        root: review.observation.root,
        advicee: review.observation.advicee,
        lifetime: deps.lifetime,
        stage: "unavailable",
        unitIdentity: review.evaluationKey
      })
    }
  }
  for (const advice of [...(yield* deps.residentAdvice())]) {
    if (yield* superseded(advice.revision))
      yield* residentRemoveAdvice(deps, advice.id, undefined, { fate: "stale", reason: "resident-stale" })
  }
})
const residentRestoreCurrentWork = Effect.fn("ResidentRuntime.restoreCurrentWork")(
  (deps: Dependencies, partition: string, prepared: PreparedUnit) =>
    residentRegisterRevision(deps, partition, prepared, false)
)
const residentIsCurrentWork = Effect.fn("ResidentRuntime.isCurrentWork")(
  (deps: Dependencies, revision: WorkRevision, prepared: PreparedUnit) =>
    deps.residentLedger.revision.current(revision, prepared)
)
const residentReleaseCurrentWork = Effect.fn("ResidentRuntime.releaseCurrentWork")(
  (deps: Dependencies, revision: WorkRevision) => deps.residentLedger.revision.release(revision)
)
const residentReleaseUnit = Effect.fn("ResidentRuntime.releaseUnit")(function* (
  deps: Dependencies,
  job: Pick<UnitJob, "reservation" | "revision" | "released">
) {
  if (job.released) return
  job.released = true
  yield* deps.residentLedger.release(job.reservation)
  yield* residentReleaseCurrentWork(deps, job.revision)
}, Effect.uninterruptible)
const residentRemoveAdvice = Effect.fn("ResidentRuntime.removeAdvice")(function* (
  deps: Dependencies,
  id: string,
  token?: string,
  retirement?: {
    readonly fate: Parameters<typeof captureInspectionFate>[1]
    readonly reason: Parameters<typeof captureInspectionFate>[2]
  }
) {
  const advice = (yield* deps.residentAdvice()).find((item) => item.id === id)
  if (advice === undefined) return false
  const expired = yield* deps.residentAdviceExpired(advice, deps.residentNow())
  const findings = (yield* deps.residentLedger.advice.current(advice)).findings
  const removed = yield* deps.residentLedger.advice.remove(advice, expired ? "expired" : "stale", token)
  if (removed)
    deps.residentInspection.observeAdviceFate(
      advice,
      findings,
      expired ? "expired" : (retirement?.fate ?? "discarded"),
      expired ? "retention-expired" : (retirement?.reason ?? "publication-retired")
    )
  return removed
}, Effect.uninterruptible)
const residentExpirePending = Effect.fn("ResidentRuntime.expirePending")(function* (deps: Dependencies, now: number) {
  yield* deps.residentComposedDelivery.expire(now)
  for (const advice of [...(yield* deps.residentAdvice())]) {
    if (yield* deps.residentAdviceExpired(advice, now)) yield* residentRemoveAdvice(deps, advice.id)
  }
}, Effect.uninterruptible)
const sweepQuietRounds = Effect.fn("ResidentRuntime.sweepQuietRounds")((deps: Dependencies, requestedNow?: number) =>
  Effect.gen(function* () {
    const now = requestedNow ?? deps.residentNow()
    if ((yield* deps.residentLedger.runtime.snapshot()).lifecycle !== "active") return 0
    yield* residentExpirePending(deps, now)
    yield* residentPruneNoticeCooldowns(deps, now)
    let closedCount = 0
    for (const [group, round] of yield* deps.residentLedger.rounds.entries()) {
      const work = yield* deps.residentDispatcher.snapshotWhere(
        ({ value }) => value.round === round && !value.completed
      )
      const counts = yield* deps.residentComposedDelivery.closureCounts(group)
      const closed = yield* deps.residentComposedDelivery.tickQuietRound(group, now, {
        nativeWorkIdle: work.queued === 0 && work.running === 0,
        adviceEmpty:
          !(yield* deps.residentAdvice()).some((advice) => advice.round === round) &&
          ![...(yield* deps.residentNotices.entries()).map(([, value]) => value)].some(
            (notice) => notice.partition === group
          )
      })
      if (closed !== undefined) {
        yield* residentCloseRound(deps, group, closed, "quiescent", counts)
        closedCount += 1
      }
    }
    return closedCount
  }).pipe(Effect.uninterruptible)
)
const residentRoundActive = Effect.fn("ResidentRuntime.roundActive")(function* (
  deps: Dependencies,
  round: RoundWork | undefined
): Effect.fn.Return<boolean> {
  return (
    round === undefined ||
    (!round.controller.signal.aborted && (yield* deps.residentComposedDelivery.isActive(round.group, round.generation)))
  )
})
const residentAllowFinish = Effect.fn("ResidentRuntime.allowFinish")(function* (
  deps: Dependencies,
  group: string,
  token: string,
  reason: RoundCloseReason
): Effect.fn.Return<void> {
  const counts = yield* deps.residentComposedDelivery.closureCounts(group)
  const closed = yield* deps.residentComposedDelivery.finishStop(group, token, true, deps.residentNow())
  if (closed !== undefined) yield* residentCloseRound(deps, group, closed, reason, counts)
}, Effect.uninterruptible)
const residentJobActive = Effect.fn("ResidentRuntime.jobActive")(function* (
  deps: Dependencies,
  job: Job
): Effect.fn.Return<boolean> {
  return (
    (yield* deps.residentLedger.runtime.snapshot()).lifecycle === "active" &&
    !deps.residentLifetimeController.signal.aborted &&
    !job.work?.controller.signal.aborted &&
    (yield* residentRoundActive(deps, job.round))
  )
})
const residentDiscardUnfinishedWork = Effect.fn("ResidentRuntime.discardUnfinishedWork")(function* (
  deps: Dependencies,
  round: RoundWork,
  cancellation: { readonly cancelledSource: ReadonlyArray<number>; readonly cancelledJev: ReadonlyArray<number> }
): Effect.fn.Return<boolean> {
  const work = (yield* deps.residentRoundSnapshot(round)).work
  const sourceIds = new Set(cancellation.cancelledSource)
  const unitIds = new Set(cancellation.cancelledJev)
  const named = (job: Job): boolean =>
    job.kind === "ingress" ? sourceIds.has(job.canonicalObservationId) : unitIds.has(job.canonicalOperationId)
  const namedCounts = yield* deps.residentDispatcher.snapshotWhere(
    ({ value }) => value.work === work && !value.completed && named(value)
  )
  const hasUnnamed = yield* deps.residentDispatcher.hasWorkWhere(
    ({ value }) => value.work === work && !value.completed && !named(value)
  )
  const replacement = yield* deps.residentLedger.rounds.replaceWork(
    round,
    { id: randomUUID(), controller: new AbortController() },
    {
      named: namedCounts,
      all: yield* deps.residentDispatcher.snapshotWhere(({ value }) => value.work === work && !value.completed),
      cancelled: sourceIds.size + unitIds.size,
      hasUnnamed
    }
  )
  if (replacement === undefined) throw new Error("native work cutoff lost its round capability")
  const { matched, previousWork } = replacement
  previousWork.controller.abort()
  const discarded = yield* deps.residentDispatcher.discardWhere(
    ({ value }) => value.work === work && (named(value) || !matched)
  )
  for (const job of discarded) yield* residentDiscardJob(deps, job)
  return matched
}, Effect.uninterruptible)
const residentDiscardJob = Effect.fn("ResidentRuntime.discardJob")(function* (deps: Dependencies, job: Job) {
  if (job.completed) return
  if (!job.analyticsDiscardReported) {
    job.analyticsDiscardReported = true
    yield* deps.residentRecordAnalytics(job, "work-discarded")
  }
  if (job.kind === "ingress") {
    yield* deps.residentLedger.observation(
      job.partition,
      job.canonicalObservationId,
      "interruptObservation",
      job.canonicalRound
    )
  }
  if (job.kind === "unit") {
    yield* residentSettleJoined(deps, job.evaluationKey, "unavailable", "lost")
    yield* residentReleaseReuseClaim(deps, job.evaluationKey)
    // An issued Jev permit remains reserved until its native Effect settles.
    if (job.requestId === undefined) yield* residentReleaseUnit(deps, job)
  } else yield* deps.residentLedger.release(job.reservation)
  recordActivity({
    statePath: job.dispatch.activityPath,
    root: job.observation.root,
    advicee: job.observation.advicee,
    lifetime: deps.lifetime,
    stage: "incomplete"
  })
}, Effect.uninterruptible)
const residentCloseRound = Effect.fn("ResidentRuntime.closeRound")(function* (
  deps: Dependencies,
  group: string,
  generation: number,
  reason: RoundCloseReason,
  counts: ReturnType<ComposedDelivery["closureCounts"]>
): Effect.fn.Return<void> {
  // finishStop can release an unwritten provisional slot after callers took
  // the pre-cleanup snapshot. Report the final Bend reservation count.
  const reservedContinuations = (yield* deps.residentComposedDelivery.closureCounts(group)).reservedContinuations
  const round = yield* deps.residentLedger.rounds.get(group)
  const snapshot = round === undefined ? undefined : yield* deps.residentRoundSnapshot(round)
  const activity = snapshot?.activity
  const work =
    round === undefined
      ? { queued: 0, running: 0 }
      : yield* deps.residentDispatcher.snapshotWhere(
          ({ value }) => value.round === round && !value.completed && !value.work?.controller.signal.aborted
        )
  const reportRoundClosure = Effect.fn("ResidentRuntime.reportRoundClosure")(function* () {
    if (activity !== undefined)
      recordRoundClosure({
        statePath: activity.activityPath,
        root: activity.root,
        advicee: activity.advicee,
        lifetime: deps.lifetime,
        roundIdentity: `${group}:${round?.canonicalRound ?? generation}`,
        reason,
        reservedContinuations,
        discarded: {
          queued: work.queued + (snapshot?.discarded.queued ?? 0),
          running: work.running + (snapshot?.discarded.running ?? 0),
          pendingAdvice:
            round === undefined ? 0 : (yield* deps.residentAdvice()).filter((advice) => advice.round === round).length,
          submitted: counts.submitted,
          uncertain: counts.uncertain,
          editPermits: counts.editPermits
        }
      })
  })
  yield* reportRoundClosure()
  if (round === undefined || round.generation !== generation) return
  // The admission/output fence is already published. Abort Effect fibers and
  // their provider connections before releasing all retained round resources.
  if (snapshot === undefined) throw new Error("native round closure lost its snapshot")
  const retireRoundResources = Effect.fn("ResidentRuntime.retireRoundResources")(function* () {
    round.controller.abort()
    snapshot.work.controller.abort()
    const discarded = yield* deps.residentDispatcher.discardWhere(({ value }) => value.round === round)
    for (const job of discarded) yield* residentDiscardJob(deps, job)
    for (const advice of [...(yield* deps.residentAdvice())])
      if (advice.round === round)
        yield* residentRemoveAdvice(deps, advice.id, undefined, { fate: "discarded", reason: "round-closed" })
    for (const [key, notice] of yield* deps.residentNotices.entries()) {
      if (notice.partition === round.group) yield* residentReleaseNoticeCooldown(deps, key)
    }
    yield* deps.residentReuse.discardPartition(round.group)
    yield* deps.residentLedger.rounds.retire(round)
  })
  yield* retireRoundResources()
}, Effect.uninterruptible)
const residentReleaseReuseClaim = Effect.fn("ResidentRuntime.releaseReuseClaim")(function* (
  deps: Dependencies,
  key: string,
  reason: ResidentUnavailableReason = "lost"
) {
  for (const review of yield* deps.residentJoined.releaseOwner(key, reason)) {
    recordActivity({
      statePath: review.activityPath,
      root: review.observation.root,
      advicee: review.observation.advicee,
      lifetime: deps.lifetime,
      stage: "unavailable",
      unitIdentity: review.evaluationKey
    })
  }
}, Effect.uninterruptible)
const residentSettleJoined = Effect.fn("ResidentRuntime.settleJoined")(function* (
  deps: Dependencies,
  key: string,
  state: "pending" | "clear" | "unavailable",
  reason?: ResidentUnavailableReason,
  adviceId?: string
) {
  yield* residentRecordJoinedOutcomes(deps, yield* deps.residentJoined.settle(key, state, adviceId), adviceId)
}, Effect.uninterruptible)
const residentRecordJoinedOutcomes = Effect.fn("ResidentRuntime.recordJoinedOutcomes")(function* (
  deps: Dependencies,
  outcomes: ReadonlyArray<JoinedReviewOutcome>,
  adviceId?: string
) {
  for (const { review, stage } of outcomes) {
    recordActivity({
      statePath: review.activityPath,
      root: review.observation.root,
      advicee: review.observation.advicee,
      lifetime: deps.lifetime,
      stage,
      ...(stage !== "findings"
        ? {}
        : {
            findings:
              (yield* deps.residentLedger.advice.snapshots()).find(({ capability }) => capability.id === adviceId)
                ?.content.findings.length ?? 0
          }),
      unitIdentity: review.evaluationKey
    })
  }
})
const residentRetireCachedUnit = Effect.fn("ResidentRuntime.retireCachedUnit")(function* (
  deps: Dependencies,
  unit: UnitJob,
  round: RoundWork | undefined,
  id: number | undefined
) {
  if (unit.completed || round === undefined || id === undefined) return
  ;(yield* deps.residentLedger.rounds.policyWork(round)).retire(id)
  yield* residentReleaseUnit(deps, unit)
})
export const makeResidentWorkLifecycle = (deps: Dependencies) => {
  return {
    residentRetireCachedUnit: residentRetireCachedUnit.bind(null, deps),
    residentExpirePending: residentExpirePending.bind(null, deps),
    residentPruneNoticeCooldowns: residentPruneNoticeCooldowns.bind(null, deps),
    residentPendingNoticeCount: residentPendingNoticeCount.bind(null, deps),
    residentRemoveAdvice: residentRemoveAdvice.bind(null, deps),
    residentFindingSelectionFacts: residentFindingSelectionFacts.bind(null, deps),
    residentRecordOperationalFailure: residentRecordOperationalFailure.bind(null, deps),
    residentIsCurrentWork: residentIsCurrentWork.bind(null, deps),
    residentNoticesForToken: residentNoticesForToken.bind(null, deps),
    residentRemovePendingNotice: residentRemovePendingNotice.bind(null, deps),
    residentRoundActive: residentRoundActive.bind(null, deps),
    residentReleaseUnit: residentReleaseUnit.bind(null, deps),
    residentJobActive: residentJobActive.bind(null, deps),
    residentRestoreCurrentWork: residentRestoreCurrentWork.bind(null, deps),
    residentRegisterCurrentWork: residentRegisterCurrentWork.bind(null, deps),
    residentReleaseCurrentWork: residentReleaseCurrentWork.bind(null, deps),
    residentRecordJoinedOutcomes: residentRecordJoinedOutcomes.bind(null, deps),
    residentReleaseReuseClaim: residentReleaseReuseClaim.bind(null, deps),
    residentSettleJoined: residentSettleJoined.bind(null, deps),
    residentCloseRound: residentCloseRound.bind(null, deps),
    residentDiscardUnfinishedWork: residentDiscardUnfinishedWork.bind(null, deps),
    residentAllowFinish: residentAllowFinish.bind(null, deps),
    sweepQuietRounds: sweepQuietRounds.bind(null, deps),
    residentReleaseNoticeCooldown: residentReleaseNoticeCooldown.bind(null, deps)
  }
}
