import { recordActivity } from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import { type ReviewUnitJob } from "../../work-ownership/jobs.ts"
import { ResidentAdapterError } from "../../adapter-error.ts"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { decodeControlledOptions } from "../../authorization/controlled.ts"
import { type Dependencies, type EvaluationState, type EvaluationContext } from "./context.ts"
import { startUnitEvaluation, denyReady } from "./authorization.ts"
import { evaluateAuthorizedUnit } from "./request.ts"
import {
  settleEvaluatedReviewUnit,
  settleFailedEvaluation,
  observeEscapedEvaluation,
  reportInterruption
} from "./settlement.ts"
import { observeReviewServiceRequest } from "./observation.ts"
import { residentRetainAdvice } from "./retention.ts"

const residentEvaluateUnit = Effect.fn("ResidentRuntime.evaluateUnit")(
  (
    deps: Pick<
      Dependencies,
      | "inspection"
      | "lifetime"
      | "residentAdvice"
      | "residentAwaitBackendGate"
      | "residentControlledRequestEffect"
      | "residentCredentialRequired"
      | "residentCredentialShapeMatches"
      | "residentDispatchControls"
      | "residentInspection"
      | "residentIsCurrentWork"
      | "residentJobActive"
      | "residentLedger"
      | "residentInstanceIdController"
      | "residentNow"
      | "residentObserveDispatchAuthority"
      | "residentObserveReviewServiceRequest"
      | "residentOfflineHttpClient"
      | "residentRecordAnalytics"
      | "residentRecordJoinedOutcomes"
      | "residentRecordOperationalFailure"
      | "residentReleaseReuseClaim"
      | "residentReleaseUnit"
      | "residentRemoveAdvice"
      | "residentReuse"
      | "residentReviewControls"
      | "residentSettleJoined"
      | "runtimeConfiguration"
    >,
    job: ReviewUnitJob,
    sequence: number
  ) =>
    Effect.suspend(() => {
      const state: EvaluationState = {
        reviewServiceRequestStarted: false,
        reviewServiceRequestSettled: false,
        interruptionReported: false,
        readyReported: false,
        evaluationOutcomeObserved: false
      }
      const signal = job.work?.controller.signal ?? deps.residentInstanceIdController.signal
      const context: EvaluationContext<
        | "inspection"
        | "lifetime"
        | "residentAdvice"
        | "residentAwaitBackendGate"
        | "residentControlledRequestEffect"
        | "residentCredentialRequired"
        | "residentCredentialShapeMatches"
        | "residentDispatchControls"
        | "residentInspection"
        | "residentIsCurrentWork"
        | "residentJobActive"
        | "residentLedger"
        | "residentInstanceIdController"
        | "residentNow"
        | "residentObserveDispatchAuthority"
        | "residentObserveReviewServiceRequest"
        | "residentOfflineHttpClient"
        | "residentRecordAnalytics"
        | "residentRecordJoinedOutcomes"
        | "residentRecordOperationalFailure"
        | "residentReleaseReuseClaim"
        | "residentReleaseUnit"
        | "residentRemoveAdvice"
        | "residentReuse"
        | "residentReviewControls"
        | "residentSettleJoined"
        | "runtimeConfiguration"
      > = { deps, job, sequence, state, signal }
      return Effect.gen(function* () {
        if (!(yield* startUnitEvaluation(context))) return
        yield* withinWork(
          deps.residentReviewControls
            .beforeEvaluate(job.prepared)
            .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "evaluation barrier" }))),
          signal
        )
        const controlled = decodeControlledOptions(job.dispatch.controlled)
        const result = yield* withinWork(evaluateAuthorizedUnit(context, controlled), signal)
        if (result?.status === "notAuthorized") {
          yield* deps.residentRecordAnalytics(job, "review-unavailable")
          yield* deps.residentSettleJoined(
            job.evaluationKey,
            "unavailable",
            result.reason === "credential" ? "credential" : "lost"
          )
          if (result.reason === "credential")
            yield* deps.residentRecordOperationalFailure(job.observation, "credential")
          recordActivity({
            statePath: job.dispatch.activityPath,
            root: job.observation.root,
            advicee: job.observation.advicee,
            lifetime: deps.lifetime,
            stage: "unavailable",
            unitIdentity: job.evaluationKey
          })
          yield* deps.residentReleaseReuseClaim(job.evaluationKey)
          yield* deps.residentReleaseUnit(job)
          return
        }
        const unissuedJobInactive = Effect.fn("ResidentRuntime.unissuedJobInactive")(function* () {
          return !(yield* deps.residentJobActive(job)) && state.issuedReviewServiceRequestId === undefined
        })
        if (yield* unissuedJobInactive()) {
          yield* deps.residentReleaseReuseClaim(job.evaluationKey)
          yield* deps.residentReleaseUnit(job)
          return
        }
        if (result?.status === "evaluated") return yield* settleEvaluatedReviewUnit(context, controlled, result)
        yield* settleFailedEvaluation(context, result)
      }).pipe(
        // Observe every failed exit, including interruption, before releasing the
        // native job. Typed adapter failures have a truthful unavailable outcome;
        // invariant defects and scope interruption remain visible in the fiber.
        Effect.onError(() =>
          Effect.gen(function* () {
            // A provider defect can escape the pipeline's checked-error result.
            // Record its unavailable outcome without hiding the original cause
            // or duplicating an outcome already observed by the pipeline.
            observeEscapedEvaluation(context)
            if (
              !state.readyReported &&
              (yield* deps.residentLedger.canonicalProjection()).work.some(
                (entry) => entry.operation === job.canonicalOperationId && entry.kind === "reviewing"
              )
            ) {
              yield* denyReady(context)
            }
            const settleInterruptedEvaluation = Effect.fn("ResidentRuntime.settleInterruptedEvaluation")(function* () {
              if (state.issuedReviewServiceRequestId !== undefined && !state.reviewServiceRequestSettled) {
                if (signal?.aborted) yield* reportInterruption(context)
                const observed =
                  signal?.aborted && state.reviewServiceRequestStarted && state.interruptionReported
                    ? "interrupted"
                    : state.reviewServiceRequestStarted
                      ? "backendFailure"
                      : "neverSent"
                yield* deps.residentLedger.settleReviewServiceRequest(
                  job.partition,
                  job.canonicalOperationId,
                  state.issuedReviewServiceRequestId,
                  job.reservation,
                  observed,
                  false
                )
                state.reviewServiceRequestSettled = true
                yield* observeReviewServiceRequest(context, "settled", state.issuedReviewServiceRequestId, observed)
              }
            })
            yield* settleInterruptedEvaluation()
            yield* deps.residentSettleJoined(job.evaluationKey, "unavailable", "backend")
            if (deps.runtimeConfiguration.debug) console.error("resident evaluation unavailable")
            if ((yield* deps.residentLedger.runtime.snapshot()).lifecycle === "active")
              recordActivity({
                statePath: job.dispatch.activityPath,
                root: job.observation.root,
                advicee: job.observation.advicee,
                lifetime: deps.lifetime,
                stage: "unavailable",
                unitIdentity: job.evaluationKey
              })
          })
        ),
        Effect.catch(() => Effect.void),
        Effect.ensuring(
          Effect.gen(function* () {
            if (!job.completed) {
              yield* deps.residentReleaseReuseClaim(job.evaluationKey)
              yield* deps.residentReleaseUnit(job)
            }
          })
        ),
        Effect.scoped
      )
    })
)

export const makeResidentEvaluation = (
  deps: Pick<
    Dependencies,
    | "inspection"
    | "lifetime"
    | "residentAdvice"
    | "residentAwaitBackendGate"
    | "residentControlledRequestEffect"
    | "residentCredentialRequired"
    | "residentCredentialShapeMatches"
    | "residentDispatchControls"
    | "residentInspection"
    | "residentIsCurrentWork"
    | "residentJobActive"
    | "residentLedger"
    | "residentInstanceIdController"
    | "residentNow"
    | "residentObserveDispatchAuthority"
    | "residentObserveReviewServiceRequest"
    | "residentOfflineHttpClient"
    | "residentRecordAnalytics"
    | "residentRecordJoinedOutcomes"
    | "residentRecordOperationalFailure"
    | "residentReleaseReuseClaim"
    | "residentReleaseUnit"
    | "residentRemoveAdvice"
    | "residentReuse"
    | "residentReviewControls"
    | "residentSettleJoined"
    | "runtimeConfiguration"
  >
) => {
  return {
    residentEvaluateUnit: residentEvaluateUnit.bind(null, deps),
    residentRetainAdvice: residentRetainAdvice.bind(null, deps)
  }
}
