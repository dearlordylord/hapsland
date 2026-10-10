import { recordActivity } from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import { appendFile } from "node:fs/promises"
import type { evaluatePrepared } from "@hapsland/review-execution/direct-event/pipeline"
import { type ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { recordDemoTrace } from "@hapsland/activity-observation/activity/demo-trace"
import { residentAdapter } from "../../adapter-error.ts"
import { logicalBytes } from "../../state/encoded-size.ts"
import { type EvaluationContext, type EvaluationResult } from "./context.ts"
import { observeRequest } from "./observation.ts"
import { residentControlledOutcomePath, residentControlledOutcomeLabel } from "./request.ts"
import { residentRetireUnitWork, residentRetainAdvice } from "./retention.ts"

const residentEvaluatedOutcome = (count: number): "clear" | "finding" => (count === 0 ? "clear" : "finding")

export const reportInterruption = Effect.fn("ResidentRuntime.reportInterruption")(function* (
  context: EvaluationContext<"residentLedger" | "residentObserveJevRequest" | "residentRecordAnalytics">
) {
  if (context.state.issuedRequest === undefined || !context.state.requestStarted || context.state.interruptionReported)
    return
  context.state.interruptionReported = yield* context.deps.residentLedger.interruptJevRequest(
    context.job.partition,
    context.job.canonicalOperationId,
    context.state.issuedRequest
  )
  if (context.state.interruptionReported) yield* observeRequest(context, "interrupted", context.state.issuedRequest)
}, Effect.uninterruptible)

export const observeEscapedEvaluation = (context: EvaluationContext<"inspection" | "residentInspection">): void => {
  const receipt = context.job.inspectionReceipt
  if (
    context.state.requestStarted &&
    !context.state.evaluationOutcomeObserved &&
    receipt !== undefined &&
    context.deps.inspection.isEnabled(receipt.scope.root)
  ) {
    context.deps.inspection.offer(
      receipt.scope,
      context.deps.residentInspection.unitCorrelation(context.job, receipt, context.state.issuedRequest),
      { kind: "evaluation-outcome", outcome: context.signal.aborted ? "interrupted" : "backend" }
    )
  }
}

export const settleEvaluatedUnit = Effect.fn("ResidentRuntime.settleEvaluatedUnit")(function* (
  context: EvaluationContext<
    | "inspection"
    | "lifetime"
    | "residentAdvice"
    | "residentInspection"
    | "residentIsCurrentWork"
    | "residentJobActive"
    | "residentLedger"
    | "residentLifetimeController"
    | "residentNow"
    | "residentObserveJevRequest"
    | "residentRecordAnalytics"
    | "residentRecordJoinedOutcomes"
    | "residentReleaseReuseClaim"
    | "residentReleaseUnit"
    | "residentRemoveAdvice"
    | "residentReuse"
    | "residentReviewControls"
    | "residentSettleJoined"
  >,
  controlled: ControlledDecisionModelOptions | undefined,
  result: Extract<Effect.Success<ReturnType<typeof evaluatePrepared>>, { status: "evaluated" }>
) {
  const reportEvaluatedBendOutcome = Effect.fn("ResidentRuntime.reportEvaluatedBendOutcome")(function* () {
    const evaluatedWorkTarget = Effect.fn("ResidentRuntime.evaluatedWorkTarget")(function* () {
      if (!(yield* context.deps.residentJobActive(context.job))) return undefined
      if ((yield* context.deps.residentLedger.runtime.snapshot()).lifecycle !== "active") return undefined
      if (context.job.round === undefined || context.job.workUnitId === undefined) return undefined
      return { round: context.job.round, id: context.job.workUnitId }
    })
    const target = yield* evaluatedWorkTarget()
    if (
      target !== undefined &&
      !(yield* context.deps.residentLedger.rounds.policyWork(target.round)).outcome(
        target.id,
        result.findings.length === 0
          ? { $: "Clear" }
          : { $: "Finding", count: result.findings.length, bytes: logicalBytes(result.findings) }
      )
    ) {
      throw new Error("Bend denied review outcome")
    }
  })
  yield* reportEvaluatedBendOutcome()
  const evaluatedWorkCurrent = Effect.fn("ResidentRuntime.evaluatedWorkCurrent")(function* () {
    return (
      (yield* context.deps.residentLedger.runtime.snapshot()).lifecycle === "active" &&
      (yield* context.deps.residentJobActive(context.job)) &&
      (yield* context.deps.residentIsCurrentWork(context.job.revision, context.job.prepared))
    )
  })
  const currentWork = yield* evaluatedWorkCurrent()
  if (context.state.issuedRequest === undefined || !context.state.requestStarted) {
    throw new Error("Jev result without a matching canonical request command and start")
  }
  const disposition = yield* context.deps.residentLedger.settleJevRequest(
    context.job.partition,
    context.job.canonicalOperationId,
    context.state.issuedRequest,
    context.job.reservation,
    residentEvaluatedOutcome(result.findings.length),
    currentWork
  )
  context.state.requestSettled = true
  yield* observeRequest(
    context,
    "settled",
    context.state.issuedRequest,
    residentEvaluatedOutcome(result.findings.length),
    result.findings
  )
  const discardSettledUnit = Effect.fn("ResidentRuntime.discardSettledUnit")(function* () {
    if (disposition !== "ignored" && disposition !== "stale") return false
    context.deps.residentInspection.observeUnitFate(
      context.job,
      result.findings,
      disposition === "stale" ? "stale" : "discarded",
      disposition === "stale" ? "resident-stale" : "settlement-ignored"
    )
    yield* context.deps.residentReleaseReuseClaim(context.job.evaluationKey)
    yield* context.deps.residentReleaseUnit(context.job)
    return true
  })
  if (yield* discardSettledUnit()) return
  const recordEvaluatedUnit = Effect.fn("ResidentRuntime.recordEvaluatedUnit")(function* () {
    recordDemoTrace(
      context.job.dispatch.demoBudgetPath,
      context.job.observation.root,
      context.job.observation.advicee,
      {
        kind: "terminal",
        ...(context.job.sourceHash === undefined ? {} : { sourceHash: context.job.sourceHash }),
        state: result.findings.length === 0 ? "clear" : "findings"
      }
    )
    const evaluation = { prepared: context.job.prepared, findings: result.findings }
    yield* context.deps.residentReuse.put(context.job.partition, context.job.evaluationKey, evaluation)
    yield* context.deps.residentReleaseReuseClaim(context.job.evaluationKey)
    recordActivity({
      statePath: context.job.dispatch.activityPath,
      root: context.job.observation.root,
      advicee: context.job.observation.advicee,
      lifetime: context.deps.lifetime,
      stage: result.findings.length === 0 ? "clear" : "findings",
      findings: result.findings.length,
      unitIdentity: context.job.evaluationKey
    })
    return evaluation
  })
  const evaluation = yield* recordEvaluatedUnit()
  const recordOutcome = Effect.fn("ResidentRuntime.recordControlledOutcome")(function* () {
    if (controlled?.outcomePath === undefined) return
    const { sessionId, turnId, toolUseId, subagentId } = context.job.observation.advicee
    yield* residentAdapter("record controlled outcome", () =>
      appendFile(
        residentControlledOutcomePath(controlled),
        `${JSON.stringify({
          sessionId,
          turnId,
          toolUseId,
          subagentId,
          outcome: residentControlledOutcomeLabel(result.findings.length)
        })}\n`,
        "utf8"
      )
    )
  })
  const settleNonRetainedOutcome = Effect.fn("ResidentRuntime.settleNonRetainedOutcome")(function* () {
    if (disposition !== "findingRetained") {
      context.deps.residentInspection.observeUnitFate(
        context.job,
        result.findings,
        disposition === "staleFindingRetired" ? "stale" : "discarded",
        disposition === "staleFindingRetired" ? "resident-stale" : "settlement-ignored"
      )
      if (disposition === "staleFindingRetired") yield* residentRetireUnitWork(context.deps, context.job)
      yield* context.deps.residentSettleJoined(
        context.job.evaluationKey,
        disposition === "clearSettled" ? "clear" : "unavailable",
        "stale"
      )
      context.job.completed = true
      yield* context.deps.residentReleaseUnit(context.job)
      yield* recordOutcome()
      return true
    }
    return false
  })
  if (yield* settleNonRetainedOutcome()) return
  yield* residentRetainAdvice(context.deps, context.job, evaluation, context.sequence)
  yield* recordOutcome()
  return
})

export const settleFailedEvaluation = Effect.fn("ResidentRuntime.settleFailedEvaluation")(function* (
  context: EvaluationContext<
    | "lifetime"
    | "residentLedger"
    | "residentObserveJevRequest"
    | "residentRecordAnalytics"
    | "residentRecordOperationalFailure"
    | "residentSettleJoined"
  >,
  result: EvaluationResult
) {
  if (context.signal?.aborted) yield* reportInterruption(context)
  const observedFailure = () => {
    return context.state.issuedRequest === undefined
      ? undefined
      : context.signal?.aborted && context.state.requestStarted && context.state.interruptionReported
        ? "interrupted"
        : !context.state.requestStarted
          ? "neverSent"
          : result?.status === "timeout"
            ? "timeout"
            : "backendFailure"
  }
  const observed = observedFailure()
  const classifyEvaluationFailure = () => {
    return context.deps.residentLedger.reviewFailure(
      observed === "backendFailure" ||
        observed === "timeout" ||
        (context.state.issuedRequest === undefined && (result?.status === "backend" || result?.status === "timeout")),
      false,
      observed === "neverSent" || observed === "interrupted" || result === undefined
    )
  }
  const failure = yield* classifyEvaluationFailure()
  const settleFailedRequest = Effect.fn("ResidentRuntime.settleFailedRequest")(function* () {
    if (context.state.issuedRequest === undefined) {
      if (
        !(yield* context.deps.residentLedger.completeReview(
          context.job.partition,
          context.job.canonicalOperationId,
          context.job.reservation,
          "unavailable",
          context.job.canonicalRound
        ))
      )
        return false
    } else {
      yield* context.deps.residentLedger.settleJevRequest(
        context.job.partition,
        context.job.canonicalOperationId,
        context.state.issuedRequest,
        context.job.reservation,
        observed ?? "neverSent",
        false
      )
      context.state.requestSettled = true
      yield* observeRequest(context, "settled", context.state.issuedRequest, observed ?? "neverSent")
    }
    return true
  })
  if (!(yield* settleFailedRequest())) return
  const recordFailureNotice = Effect.fn("ResidentRuntime.recordFailureNotice")(function* (
    reason: "backend" | "credential" | "lost"
  ) {
    if (reason !== "lost") yield* context.deps.residentRecordOperationalFailure(context.job.observation, reason)
  })
  const recordFailedEvaluation = Effect.fn("ResidentRuntime.recordFailedEvaluation")(function* () {
    if (failure === "failureNone") return
    const reasons: Partial<Record<typeof failure, "backend" | "credential" | "lost">> = {
      failureBackend: "backend",
      failureCredential: "credential",
      failureLost: "lost"
    }
    const reason = reasons[failure]
    if (reason === undefined) throw new Error("Bend denied review failure disposition")
    yield* context.deps.residentSettleJoined(context.job.evaluationKey, "unavailable", reason)
    yield* recordFailureNotice(reason)
    recordActivity({
      statePath: context.job.dispatch.activityPath,
      root: context.job.observation.root,
      advicee: context.job.observation.advicee,
      lifetime: context.deps.lifetime,
      stage: "unavailable",
      unitIdentity: context.job.evaluationKey
    })
  })
  yield* recordFailedEvaluation()
})
