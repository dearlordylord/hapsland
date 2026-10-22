import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import * as Effect from "effect/Effect"
import { type ReviewServiceRequestObservation } from "../request-observation.ts"
import { type EvaluationContext } from "./context.ts"

export const observeReviewServiceRequest = Effect.fn("ResidentRuntime.observeReviewServiceRequest")(function* (
  context: EvaluationContext<"residentObserveReviewServiceRequest" | "residentRecordAnalytics">,
  stage: ReviewServiceRequestObservation["stage"],
  reviewServiceRequestId?: number,
  outcome?: ReviewServiceRequestObservation["outcome"],
  findings: ReadonlyArray<Finding> = []
) {
  if (context.state.reviewServiceRequestIdentity === undefined)
    throw new Error("Jev reviewServiceRequestId observation lacks canonical identity")
  if (stage === "started") yield* context.deps.residentRecordAnalytics(context.job, "review-service-request-started")
  if (stage === "settled" && outcome !== undefined) {
    const kinds = {
      clear: "review-service-request-clear",
      finding: "review-service-request-findings",
      backendFailure: "review-service-request-failed",
      timeout: "review-service-request-timeout",
      interrupted: "review-service-request-interrupted",
      neverSent: "review-service-request-never-sent"
    } as const
    yield* context.deps.residentRecordAnalytics(context.job, kinds[outcome], findings)
  }
  context.deps.residentObserveReviewServiceRequest({
    ...context.state.reviewServiceRequestIdentity,
    stage,
    ...(reviewServiceRequestId === undefined ? {} : { reviewServiceRequestId }),
    ...(outcome === undefined ? {} : { outcome })
  })
})
