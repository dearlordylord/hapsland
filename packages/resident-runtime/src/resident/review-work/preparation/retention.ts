import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { JoinedReview } from "../../state/joined-reviews.ts"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import { type PreparedObservation } from "@hapsland/review-execution/direct-event/pipeline"
import { type CapacityReservation } from "../../state/resident/state.ts"
import { type UnitJob } from "../../work-ownership/jobs.ts"
import { ResidentAdapterError } from "../../adapter-error.ts"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { sourcePartition } from "../../recipient/identity.ts"
import { logicalBytes } from "../../state/encoded-size.ts"
import {
  type PreparationContext,
  type PlannedPreparationItem,
  type RetainedPreparationItem,
  type PreparationReservation,
  type PreparedUnitFacts
} from "./context.ts"

export const observePlannedEvaluation = (
  context: PreparationContext<"inspection" | "residentInspection">,
  item: PlannedPreparationItem
): void => {
  const inspectionEvaluationRouteFact = (
    item: PlannedPreparationItem,
    evaluationId: string | undefined
  ): Parameters<typeof context.deps.inspection.offer>[2] => ({
    kind: "evaluation-route",
    route:
      item.kind === "owner"
        ? "fresh"
        : item.kind === "cached"
          ? "cached"
          : item.join === "advice"
            ? "existing-advice"
            : item.join === "pending"
              ? "joined-pending"
              : "joined-claimed",
    semanticIdentity: item.outcome.prepared.identity,
    path: item.outcome.path,
    declaration: item.outcome.prepared.input.declaration.name,
    original:
      evaluationId === undefined ? { status: "missing", reason: "not-captured" } : { status: "linked", evaluationId }
  })
  const receipt = context.job.inspectionReceipt
  if (item.kind === "owner") context.deps.residentInspection.forgetOrigin(item.evaluationKey)
  if (receipt === undefined || !context.deps.inspection.isEnabled(receipt.scope.root)) return
  if (item.kind === "owner") context.deps.residentInspection.registerOrigin(item.evaluationKey)
  const evaluationId = context.deps.residentInspection.evaluationId(item.evaluationKey)
  context.deps.inspection.offer(
    receipt.scope,
    { ...receipt.correlation, ...(evaluationId === undefined ? {} : { evaluationId }) },
    inspectionEvaluationRouteFact(item, evaluationId)
  )
}

export const recordReuseObservation = Effect.fn("ResidentRuntime.recordReuseObservation")(function* (
  context: PreparationContext<
    | "lifetime"
    | "residentAdvice"
    | "residentJoined"
    | "residentLedger"
    | "residentRecordJoinedOutcomes"
    | "residentRegisterCurrentWork"
    | "residentReleaseCurrentWork"
    | "residentReuse"
  >,
  pathObservation: DirectObservation,
  item: PlannedPreparationItem
) {
  if (item.kind === "cached" && item.cached.evaluation.findings.length === 0) {
    const revision = yield* context.deps.residentRegisterCurrentWork(
      sourcePartition(context.job.observation.root, context.job.observation.advicee),
      item.outcome.prepared
    )
    yield* context.deps.residentReleaseCurrentWork(revision)
    context.expectedActivityUnits.push(item.evaluationKey)
    recordActivity({
      statePath: context.job.dispatch.activityPath,
      root: context.job.observation.root,
      advicee: context.job.observation.advicee,
      lifetime: context.deps.lifetime,
      stage: "clear",
      unitIdentity: item.evaluationKey
    })
  } else if (item.kind === "joined") {
    const recordJoinedObservation = Effect.fn("ResidentRuntime.recordJoinedObservation")(function* () {
      const existing = (yield* context.deps.residentAdvice()).find(
        (advice) => advice.evaluationKey === item.evaluationKey
      )
      if (existing !== undefined) {
        yield* context.deps.residentRecordJoinedOutcomes(
          yield* context.deps.residentLedger.advice.publish(existing),
          existing.id
        )
        recordActivity({
          statePath: context.job.dispatch.activityPath,
          root: context.job.observation.root,
          advicee: context.job.observation.advicee,
          lifetime: context.deps.lifetime,
          stage: "findings",
          findings: (yield* context.deps.residentLedger.advice.current(existing)).findings.length,
          unitIdentity: item.evaluationKey
        })
      } else {
        const pending = yield* context.deps.residentReuse.pending(item.evaluationKey)
        if (pending === undefined && item.join !== "claimed") {
          recordActivity({
            statePath: context.job.dispatch.activityPath,
            root: context.job.observation.root,
            advicee: context.job.observation.advicee,
            lifetime: context.deps.lifetime,
            stage: "unavailable",
            unitIdentity: item.evaluationKey
          })
        } else {
          const joined: JoinedReview = {
            admission: context.job.canonicalObservationId,
            evaluationKey: item.evaluationKey,
            observation: pathObservation,
            activityPath: context.job.dispatch.activityPath,
            ...(pending === undefined ? {} : { revision: pending.revision })
          }
          yield* context.deps.residentJoined.append(joined)
          context.expectedActivityUnits.push(item.evaluationKey)
        }
      }
    })
    yield* recordJoinedObservation()
  }
})

export const retainPreparedUnit = Effect.fn("ResidentRuntime.retainPreparedUnit")(function* (
  context: PreparationContext<
    | "lifetime"
    | "residentDispatcher"
    | "residentInspection"
    | "residentJobActive"
    | "residentJoined"
    | "residentLedger"
    | "residentRecordAnalytics"
    | "residentRecordOperationalFailure"
    | "residentRegisterCurrentWork"
    | "residentReleaseCurrentWork"
    | "residentReleaseReuseClaim"
    | "residentReleaseUnit"
    | "residentRetainAdvice"
    | "residentRetireCachedUnit"
  >,
  retained: readonly RetainedPreparationItem[],
  reservations: readonly PreparationReservation[],
  prepared: PreparedObservation,
  pathObservation: DirectObservation,
  analyticsEnabled: boolean,
  index: number,
  item: RetainedPreparationItem
) {
  const releaseRemainingReservation = Effect.fn("ResidentRuntime.releaseRemainingReservation")(function* (
    reservation: CapacityReservation | undefined
  ) {
    if (reservation !== undefined) yield* context.deps.residentLedger.release(reservation)
  })
  const releaseRemainingClaim = Effect.fn("ResidentRuntime.releaseRemainingClaim")(function* (
    item: RetainedPreparationItem | undefined
  ) {
    if (item?.kind === "owner") yield* context.deps.residentReleaseReuseClaim(item.evaluationKey)
  })
  const discardRemainingPreparedUnits = Effect.fn("ResidentRuntime.discardRemainingPreparedUnits")(function* () {
    for (let remaining = index; remaining < retained.length; remaining++) {
      const admitted = reservations[remaining]
      yield* releaseRemainingReservation(admitted?.reservation)
      const pending = retained[remaining]
      yield* releaseRemainingClaim(pending)
    }
  })
  if (!(yield* context.deps.residentJobActive(context.job))) {
    yield* discardRemainingPreparedUnits()
    return false
  }
  const admitted = reservations[index]
  const reportRetainedCapacityRefusal = Effect.fn("ResidentRuntime.reportRetainedCapacityRefusal")(function* () {
    if (item.kind === "owner") yield* context.deps.residentReleaseReuseClaim(item.evaluationKey, "capacity")
    yield* context.deps.residentLedger.runtime.rejectCapacity()
    yield* context.deps.residentRecordAnalytics(context.job, "capacity-rejected")
    yield* context.deps.residentRecordOperationalFailure(context.job.observation, "capacity")
    recordActivity({
      statePath: context.job.dispatch.activityPath,
      root: context.job.observation.root,
      advicee: context.job.observation.advicee,
      lifetime: context.deps.lifetime,
      stage: "unavailable"
    })
  })
  if (admitted === undefined) {
    yield* reportRetainedCapacityRefusal()
    return true
  }
  const reservation = admitted.reservation
  const revision = yield* context.deps.residentRegisterCurrentWork(
    sourcePartition(context.job.observation.root, context.job.observation.advicee),
    item.outcome.prepared
  )
  const registerPreparedWork = Effect.fn("ResidentRuntime.registerPreparedWork")(function* () {
    return context.job.round === undefined || context.job.workObservationId === undefined
      ? undefined
      : item.kind === "cached"
        ? (yield* context.deps.residentLedger.rounds.policyWork(context.job.round)).cachedFinding(
            context.job.workObservationId,
            item.cached.evaluation.findings.length,
            logicalBytes(item.cached.evaluation.findings),
            admitted.operation
          )
        : (yield* context.deps.residentLedger.rounds.policyWork(context.job.round)).spawn(
            context.job.workObservationId,
            admitted.operation
          )
  })
  const releaseUnspawnedUnit = Effect.fn("ResidentRuntime.releaseUnspawnedUnit")(function* () {
    if (item.kind === "owner") yield* context.deps.residentReleaseReuseClaim(item.evaluationKey)
    yield* context.deps.residentLedger.release(reservation)
    yield* context.deps.residentReleaseCurrentWork(revision)
  })
  const workUnitId = yield* registerPreparedWork().pipe(
    Effect.onError(() =>
      context.deps.residentReleaseCurrentWork(revision).pipe(Effect.andThen(discardRemainingPreparedUnits()))
    )
  )
  if (context.job.round !== undefined && workUnitId === undefined) {
    yield* releaseUnspawnedUnit()
    return true
  }
  context.expectedActivityUnits.push(item.evaluationKey)
  const sourceHash = prepared.observation.outcomes.flatMap((outcome) =>
    outcome.status === "observed" && outcome.path === item.outcome.path ? [outcome.snapshot.sourceHash] : []
  )[0]
  const unit = makePreparedUnit(context, {
    item,
    admitted,
    pathObservation,
    analyticsEnabled,
    sourceHash,
    revision,
    workUnitId
  })
  context.deps.residentInspection.observePreparedUnit(unit)
  if (item.kind === "cached") {
    return yield* settleCachedUnit(context, unit, item)
  }
  if (!(yield* context.deps.residentJoined.attachOwner(item.evaluationKey, unit, revision))) {
    throw new Error("canonical evaluation attachment refused")
  }
  context.unassignedClaims.delete(item.evaluationKey)
  const enqueuePreparedUnit = Effect.fn("ResidentRuntime.enqueuePreparedUnit")(function* () {
    if (!(yield* context.deps.residentDispatcher.enqueue(context.job.partition, unit))) {
      yield* context.deps.residentReleaseReuseClaim(item.evaluationKey, "capacity")
      yield* context.deps.residentReleaseUnit(unit)
      yield* context.deps.residentLedger.runtime.rejectCapacity()
      yield* context.deps.residentRecordAnalytics(context.job, "capacity-rejected")
      yield* context.deps.residentRecordOperationalFailure(context.job.observation, "capacity")
      recordActivity({
        statePath: context.job.dispatch.activityPath,
        root: context.job.observation.root,
        advicee: context.job.observation.advicee,
        lifetime: context.deps.lifetime,
        stage: "unavailable",
        unitIdentity: item.evaluationKey
      })
    }
  })
  yield* enqueuePreparedUnit()
  return true
})

const makePreparedUnit = (context: PreparationContext<"residentInspection">, facts: PreparedUnitFacts): UnitJob => {
  const { item, admitted, pathObservation, analyticsEnabled, sourceHash, revision, workUnitId } = facts
  const reservation = admitted.reservation
  const inspectionEvaluationId = context.deps.residentInspection.evaluationId(item.evaluationKey)
  return {
    kind: "unit",
    ...(inspectionEvaluationId === undefined ? {} : { inspectionEvaluationId }),
    ...(context.job.inspectionReceipt === undefined ? {} : { inspectionReceipt: context.job.inspectionReceipt }),
    settings: context.job.settings,
    canonicalRound: context.job.canonicalRound,
    ...(context.job.round === undefined ? {} : { round: context.job.round, work: context.job.work }),
    ...(workUnitId === undefined ? {} : { workUnitId }),
    admissionId: context.job.canonicalObservationId,
    canonicalOperationId: admitted.operation,
    observation: pathObservation,
    partition: context.job.partition,
    reservation,
    dispatch: context.job.dispatch,
    analyticsEnabled,
    prepared: item.outcome.prepared,
    ...(sourceHash === undefined ? {} : { sourceHash }),
    revision,
    evaluationKey: item.evaluationKey
  }
}

const settleCachedUnit = Effect.fn("ResidentRuntime.settleCachedUnit")(function* (
  context: PreparationContext<"lifetime" | "residentLedger" | "residentRetainAdvice" | "residentRetireCachedUnit">,
  unit: UnitJob,
  item: Extract<PlannedPreparationItem, { kind: "cached" }>
) {
  const admitted = { operation: unit.canonicalOperationId }
  const reservation = unit.reservation
  const workUnitId = unit.workUnitId
  if (
    !(yield* context.deps.residentLedger.startReview(
      context.job.partition,
      admitted.operation,
      context.job.canonicalRound
    )) ||
    !(yield* context.deps.residentLedger.completeReview(
      context.job.partition,
      admitted.operation,
      reservation,
      "finding",
      context.job.canonicalRound
    ))
  ) {
    throw new Error("canonical cached review settlement refused")
  }
  recordActivity({
    statePath: context.job.dispatch.activityPath,
    root: context.job.observation.root,
    advicee: context.job.observation.advicee,
    lifetime: context.deps.lifetime,
    stage: "findings",
    findings: item.cached.evaluation.findings.length,
    unitIdentity: item.evaluationKey
  })
  yield* context.deps
    .residentRetainAdvice(
      unit,
      { prepared: item.outcome.prepared, findings: item.cached.evaluation.findings },
      context.sequence
    )
    .pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          yield* context.deps.residentRetireCachedUnit(unit, context.job.round, workUnitId)
        })
      )
    )
  return true
})

export const completeSourcePreparation = Effect.fn("ResidentRuntime.completeSourcePreparation")(function* (
  context: PreparationContext<"lifetime" | "residentLedger" | "residentPreparationControls">
) {
  if (context.expectedActivityUnits.length > 0) {
    recordActivity({
      statePath: context.job.dispatch.activityPath,
      root: context.job.observation.root,
      advicee: context.job.observation.advicee,
      lifetime: context.deps.lifetime,
      stage: "pending",
      expectedUnitIdentities: context.expectedActivityUnits
    })
  }
  if (
    context.job.round !== undefined &&
    context.job.workObservationId !== undefined &&
    !(yield* context.deps.residentLedger.rounds.policyWork(context.job.round)).completeSource(
      context.job.workObservationId
    )
  ) {
    throw new Error("Bend denied source completion")
  }
  if (
    !(yield* context.deps.residentLedger.observation(
      context.job.partition,
      context.job.canonicalObservationId,
      "completeObservation",
      context.job.canonicalRound
    ))
  ) {
    throw new Error("canonical observation completion refused")
  }
  context.job.completed = true
  yield* withinWork(
    context.deps.residentPreparationControls.afterPrepare.pipe(
      Effect.mapError(() => new ResidentAdapterError({ operation: "preparation barrier" }))
    ),
    context.preparationSignal
  )
})
