import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import * as Effect from "effect/Effect"
import { type JevRequestObservation } from "../request-observation.ts"
import { type EvaluationContext } from "./context.ts"

export const observeRequest = Effect.fn("ResidentRuntime.observeRequest")(function* (
  context: EvaluationContext<"residentObserveJevRequest" | "residentRecordAnalytics">,
  stage: JevRequestObservation["stage"],
  request?: number,
  outcome?: JevRequestObservation["outcome"],
  findings: ReadonlyArray<Finding> = []
) {
  if (context.state.requestIdentity === undefined) throw new Error("Jev request observation lacks canonical identity")
  if (stage === "started") yield* context.deps.residentRecordAnalytics(context.job, "request-started")
  if (stage === "settled" && outcome !== undefined) {
    const kinds = {
      clear: "request-clear",
      finding: "request-findings",
      backendFailure: "request-failed",
      timeout: "request-timeout",
      interrupted: "request-interrupted",
      neverSent: "request-never-sent"
    } as const
    yield* context.deps.residentRecordAnalytics(context.job, kinds[outcome], findings)
  }
  context.deps.residentObserveJevRequest({
    ...context.state.requestIdentity,
    stage,
    ...(request === undefined ? {} : { request }),
    ...(outcome === undefined ? {} : { outcome })
  })
})
