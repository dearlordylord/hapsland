import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import { type PreparedObservation } from "@hapsland/review-execution/direct-event/pipeline"
import { MAX_IPC_FRAME_BYTES } from "@hapsland/resident-transport/resident/protocol"
import { ResidentAdapterError } from "../../../adapter-error.ts"
import { residentUnitWorstOutcomeBytes, residentUnitReservationBytes } from "../../../work-ownership/reservation.ts"
import { withinWork } from "../../../work-ownership/cancellation.ts"
import { type PreparationContext, type RetainedPreparationItem } from "../context.ts"
import { planPreparedUnits } from "./native-preparation-planning.ts"
import { observePlannedEvaluation } from "../evaluation-observation.ts"
import { recordReuseObservation, retainPreparedUnit } from "./native-post-retention.ts"

// Independent original native Post oracle. The whole source reference calls
// this same tracked function; no source slice is restored or evaluated.
export const nativePostPreparation = Effect.fn("Verification.nativePostPreparation")(function* (
  context: PreparationContext<
    | "inspection"
    | "lifetime"
    | "residentAdvice"
    | "residentCaptureSource"
    | "residentDispatcher"
    | "residentInspection"
    | "residentJobActive"
    | "residentJoined"
    | "residentLedger"
    | "residentPreparationControls"
    | "residentRecordAnalytics"
    | "residentRecordJoinedOutcomes"
    | "residentRecordOperationalFailure"
    | "residentRegisterCurrentWork"
    | "residentReleaseCurrentWork"
    | "residentReleaseReuseClaim"
    | "residentReleaseUnit"
    | "residentRestoreCurrentWork"
    | "residentRetainAdvice"
    | "residentRetireCachedUnit"
    | "residentReuse"
  >,
  prepared: PreparedObservation,
  preparation: Extract<import("../../../state/capacity/model.ts").PreparationAdmission, { status: "admitted" }>,
  pathObservation: DirectObservation,
  analyticsEnabled: boolean
) {
  const workspace = preparation.reservation
  context.deps.residentInspection.observePreparation(context.job, prepared)
  if (!(yield* context.deps.residentJobActive(context.job))) {
    yield* context.deps.residentLedger.release(workspace)
    return false
  }
  const admitPreparedOutcomes = Effect.fn("ResidentRuntime.admitPreparedOutcomes")(function* () {
    const ready: Extract<(typeof prepared.outcomes)[number], { status: "ready" }>[] = []
    for (const outcome of prepared.outcomes) {
      const offer = yield* context.deps.residentLedger.preparedOffer(outcome.status === "ready", true)
      if (offer === "preparedAdmitted" && outcome.status === "ready") ready.push(outcome)
    }
    if (ready.length === 0) {
      yield* context.deps.residentRecordAnalytics(
        context.job,
        prepared.observation.status === "incomplete" ? "incomplete-candidate" : "skipped-candidate"
      )
      recordActivity({
        statePath: context.job.dispatch.activityPath,
        root: context.job.observation.root,
        advicee: context.job.observation.advicee,
        lifetime: context.deps.lifetime,
        stage: prepared.observation.status === "incomplete" ? "incomplete" : "skipped"
      })
    }
    return ready
  })
  const ready = yield* admitPreparedOutcomes()
  yield* context.deps.residentLedger.runtime.observePreparedUnits(ready.length)
  const filterDeliverableOutcomes = Effect.fn("ResidentRuntime.filterDeliverableOutcomes")(function* () {
    let rejectedDeliverable = false
    const deliverable: typeof ready = []
    for (const outcome of ready) {
      const accepted =
        (yield* context.deps.residentLedger.preparedOffer(
          true,
          residentUnitWorstOutcomeBytes(outcome.prepared) <= MAX_IPC_FRAME_BYTES - 1024
        )) === "preparedAdmitted"
      if (!accepted) {
        yield* context.deps.residentLedger.runtime.rejectCapacity()
        yield* context.deps.residentRecordAnalytics(context.job, "capacity-rejected")
        rejectedDeliverable = true
      }
      if (accepted) deliverable.push(outcome)
    }
    return { rejectedDeliverable, deliverable }
  })
  const { rejectedDeliverable, deliverable } = yield* filterDeliverableOutcomes()
  const planned = yield* planPreparedUnits(context, deliverable)
  for (const item of planned) observePlannedEvaluation(context, item)
  const recordReuseAnalytics = Effect.fn("ResidentRuntime.recordReuseAnalytics")(function* () {
    for (const item of planned) {
      if (item.kind === "cached")
        yield* context.deps.residentRecordAnalytics(context.job, "cache-hit", item.cached.evaluation.findings)
      else if (item.kind === "joined") yield* context.deps.residentRecordAnalytics(context.job, "joined-review")
    }
  })
  yield* recordReuseAnalytics()
  const observeOwnerBoundary = Effect.fn("ResidentRuntime.observeOwnerBoundary")(function* () {
    if (planned.some((item) => item.kind === "owner")) {
      yield* withinWork(
        context.deps.residentPreparationControls
          .afterReuseBoundary("ownerClaimed")
          .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "owner claim barrier" }))),
        context.preparationSignal
      )
    }
  })
  yield* observeOwnerBoundary()
  if (!(yield* context.deps.residentJobActive(context.job))) {
    yield* context.deps.residentLedger.release(workspace)
    return false
  }
  const retained = planned.filter(
    (item): item is RetainedPreparationItem =>
      item.kind === "owner" || (item.kind === "cached" && item.cached.evaluation.findings.length > 0)
  )
  const reservations = yield* context.deps.residentLedger.completePreparation(
    context.job.partition,
    preparation.operation,
    workspace,
    retained.map((item) => residentUnitReservationBytes(pathObservation, context.job.dispatch, item.outcome.prepared)),
    context.job.canonicalRound
  )
  context.activeWorkspaces.delete(workspace)
  // Workspace has been released and all accepted unit reservations are
  // fixed, so best-effort notice retention cannot displace fresh work.
  const recordRejectedDeliverable = Effect.fn("ResidentRuntime.recordRejectedDeliverable")(function* () {
    if (rejectedDeliverable) {
      yield* context.deps.residentRecordOperationalFailure(context.job.observation, "capacity")
      recordActivity({
        statePath: context.job.dispatch.activityPath,
        root: context.job.observation.root,
        advicee: context.job.observation.advicee,
        lifetime: context.deps.lifetime,
        stage: "unavailable"
      })
    }
  })
  yield* recordRejectedDeliverable()
  for (const item of planned) yield* recordReuseObservation(context, pathObservation, item)
  const observeJoinedBoundary = Effect.fn("ResidentRuntime.observeJoinedBoundary")(function* () {
    if (planned.some((item) => item.kind === "joined" && item.join === "claimed")) {
      yield* withinWork(
        context.deps.residentPreparationControls
          .afterReuseBoundary("claimJoined")
          .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "joined claim barrier" }))),
        context.preparationSignal
      )
    }
  })
  yield* observeJoinedBoundary()
  const retainPreparedUnits = Effect.fn("ResidentRuntime.retainPreparedUnits")(function* () {
    for (const [index, item] of retained.entries()) {
      if (
        !(yield* retainPreparedUnit(
          context,
          retained,
          reservations,
          prepared,
          pathObservation,
          analyticsEnabled,
          index,
          item
        ))
      )
        return false
    }
    return true
  })
  return yield* retainPreparedUnits()
})
