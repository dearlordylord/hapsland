import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import * as Effect from "effect/Effect"
import { type JevRequestIdentity, type JevRequestObservation } from "../request-observation.ts"
import { type EvaluationContext } from "./context.ts"

export const recordRequestObservation = Effect.fn("ResidentRuntime.recordRequestObservation")(function* (
  context: Pick<EvaluationContext<"residentObserveJevRequest" | "residentRecordAnalytics">, "deps" | "job"> & {
    readonly identity: JevRequestIdentity
  },
  stage: JevRequestObservation["stage"],
  request?: number,
  outcome?: JevRequestObservation["outcome"],
  findings: ReadonlyArray<Finding> = []
) {
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
    ...context.identity,
    stage,
    ...(request === undefined ? {} : { request }),
    ...(outcome === undefined ? {} : { outcome })
  })
})

export const observeRequest = Effect.fn("ResidentRuntime.observeRequest")(function* (
  context: EvaluationContext<"residentObserveJevRequest" | "residentRecordAnalytics">,
  stage: JevRequestObservation["stage"],
  request?: number,
  outcome?: JevRequestObservation["outcome"],
  findings: ReadonlyArray<Finding> = []
) {
  if (context.state.requestIdentity === undefined) throw new Error("Jev request observation lacks canonical identity")
  yield* recordRequestObservation(
    { deps: context.deps, job: context.job, identity: context.state.requestIdentity },
    stage,
    request,
    outcome,
    findings
  )
})
