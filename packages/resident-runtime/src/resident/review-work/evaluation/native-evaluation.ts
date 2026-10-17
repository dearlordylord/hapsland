import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import { appendFile } from "node:fs/promises"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import { recordDemoTrace } from "@hapsland/activity-observation/activity/demo-trace"
import type { EvaluatedUnit } from "@hapsland/review-execution/direct-event/pipeline"
import type { ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import type { ResidentUnavailableReason } from "@hapsland/resident-transport/resident/protocol"
import type { JevRequestOutcome } from "@hapsland/canonical-policy/canonical/adapter"
import { ResidentAdapterError, residentAdapter } from "../../adapter-error.ts"
import { decodeControlledOptions } from "../../authorization/controlled.ts"
import { logicalBytes } from "../../state/encoded-size.ts"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"
import type { ProviderLease } from "../../state/resolver-custody/provider-authority.ts"
import { workInvalidated } from "../../work-ownership/cancellation.ts"
import type { createResidentPreparationDriver } from "../composition/preparation-driver.ts"
import type { JevRequestIdentity } from "../request-observation.ts"
import type { EvaluationContext } from "./context.ts"
import type { Command, Response, Disposition, Receipt, Outcome, Reason } from "./evaluation-core.js"
import { makeEvaluationAuthorizationSession } from "./native-authorization.ts"
import { makeEvaluationDispatchCallback, makeEvaluationRequestInterruption } from "./native-dispatch.ts"
import { runEvaluationProvider } from "./native-provider.ts"
import { recordRequestObservation } from "./observation.ts"

export type EvaluationRetentionCommand =
  | Extract<Command, { readonly advice: number } | { readonly publication: number } | { readonly tail: number }>
  | { readonly $: "ReadAdviceCandidates" | "InsertAdvice" }

export type EvaluationRetention = {
  perform(command: EvaluationRetentionCommand, lease: ProviderLease): Effect.Effect<Response, unknown>
  transferred(): boolean
  finish(): Effect.Effect<void, unknown>
}
const outcomes: Record<Outcome["$"], JevRequestOutcome> = {
  Clear: "clear",
  Finding: "finding",
  NeverSent: "neverSent",
  RequestInterrupted: "interrupted",
  RequestTimeout: "timeout",
  BackendFailure: "backendFailure"
}
const dispositions = {
  findingRetained: { $: "FindingRetained" },
  clearSettled: { $: "ClearSettled" },
  staleClearSettled: { $: "StaleClearSettled" },
  staleFindingRetired: { $: "StaleFindingRetired" },
  unavailable: { $: "Unavailable" },
  ignored: { $: "Ignored" },
  stale: { $: "Stale" }
} satisfies Record<string, Disposition>
const reasons = {
  LostReason: "lost",
  CredentialReason: "credential",
  BackendReason: "backend",
  StaleReason: "stale"
} satisfies Record<Reason["$"], ResidentUnavailableReason>

// Only IO results/capabilities live here. Canonical owns request phase; the
// specialized cursor owns order, signal domain, result acceptance and recovery.
export function createNativeEvaluationIO(options: {
  readonly context: EvaluationContext
  readonly identity: JevRequestIdentity
  readonly scope: Scope.Scope
  readonly bridge: ReturnType<typeof createResidentOwnerTransaction>
  readonly driver: ReturnType<typeof createResidentPreparationDriver>
  readonly retention: (evaluation: () => EvaluatedUnit) => EvaluationRetention
}) {
  const { context, identity, bridge, driver } = options
  const { deps, job } = context
  let controlled: ControlledDecisionModelOptions | undefined
  let evaluated: EvaluatedUnit | undefined
  let outcomeObserved = false
  const evaluation = () => {
    if (evaluated === undefined) throw new Error("Evaluation IO lacks its provider result")
    return evaluated
  }
  const request = () => {
    if (job.requestId === undefined) throw new Error("Evaluation IO lacks its Canonical request")
    return job.requestId
  }
  const retention = options.retention(evaluation)
  const interruption = makeEvaluationRequestInterruption({ context, identity, request })
  const authorization = makeEvaluationAuthorizationSession({
    context,
    identity,
    bridge,
    controlled: () => controlled,
    armInterruption: () =>
      workInvalidated(context.signal).pipe(
        Effect.catch(() => interruption.run()),
        Effect.forkIn(options.scope),
        Effect.asVoid
      )
  })
  const ack = (): Response => ({ $: "Ack" })
  const flag = (value: boolean): Response => ({ $: "Flag", value })
  const currentRequest = Effect.fn("ResidentRuntime.evaluationRequestSnapshot")(function* () {
    const projection = yield* deps.residentLedger.canonicalProjection()
    const value = projection.dispatch.requests.find(
      (value) =>
        value.partition === identity.canonicalPartition &&
        value.lifetime === identity.canonicalLifetime &&
        value.round === identity.round &&
        value.operation === identity.operation
    )
    if (value !== undefined) job.requestId = value.request
    return value
  })
  const perform = Effect.fn("ResidentRuntime.evaluationCommand")(function* (
    command: Command,
    lease: ProviderLease
  ): Effect.fn.Return<Response, unknown> {
    switch (command.$) {
      case "StartPolicyUnit":
        return flag(
          job.round === undefined || job.workUnitId === undefined
            ? true
            : (yield* deps.residentLedger.rounds.policyWork(job.round)).startUnit(job.workUnitId)
        )
      case "StartReview":
        return flag(yield* deps.residentLedger.startReview(job.partition, job.canonicalOperationId, job.canonicalRound))
      case "AwaitBackendGate":
        yield* deps.residentAwaitBackendGate()
        return ack()
      case "ReadJobActive":
        return flag(yield* deps.residentJobActive(job))
      case "ReadCurrentWork":
        return flag(yield* deps.residentIsCurrentWork(job.revision, job.prepared))
      case "EvaluationBarrier":
        yield* deps.residentReviewControls
          .beforeEvaluate(job.prepared)
          .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "evaluation barrier" })))
        return ack()
      case "DecodeControlled":
        controlled = decodeControlledOptions(job.dispatch.controlled)
        return ack()
      case "Authorization":
        return { $: "Authorized", response: yield* authorization.perform(command.command, lease) }
      case "RunProvider": {
        const result = yield* runEvaluationProvider(context, {
          controlled,
          credential: authorization.credential(),
          request: request(),
          beforeDispatch: makeEvaluationDispatchCallback({
            context,
            identity,
            request: request(),
            credential: authorization.credential,
            parent: lease,
            bridge,
            driver
          }),
          observeOutcome: () => {
            outcomeObserved = true
          }
        })
        if (result === undefined) return { $: "ProviderReturned", result: { $: "Missing" } }
        switch (result.status) {
          case "evaluated":
            evaluated = { prepared: job.prepared, findings: result.findings }
            return {
              $: "ProviderReturned",
              result: {
                $: "Evaluated",
                review: { $: "Review", count: result.findings.length, bytes: logicalBytes(result.findings) }
              }
            }
          case "backend":
            return { $: "ProviderReturned", result: { $: "Backend" } }
          case "timeout":
            return { $: "ProviderReturned", result: { $: "Timeout" } }
          case "input-limit":
          case "input-invalid":
            return { $: "ProviderReturned", result: { $: "InputRefused" } }
          default: {
            const exhaustive: never = result
            return exhaustive
          }
        }
      }
      case "ReadRuntimeActive":
        return flag((yield* deps.residentLedger.runtime.snapshot()).lifecycle === "active")
      case "ReportRoundOutcome": {
        if (job.round === undefined || job.workUnitId === undefined) return flag(true)
        return flag(
          (yield* deps.residentLedger.rounds.policyWork(job.round)).outcome(
            job.workUnitId,
            command.review.count === 0
              ? { $: "Clear" }
              : { $: "Finding", count: command.review.count, bytes: command.review.bytes }
          )
        )
      }
      case "ReadRequestState": {
        const value = yield* currentRequest()
        const receipt: Receipt =
          value === undefined
            ? job.requestId === undefined
              ? { $: "Unissued" }
              : { $: "Settled", request: job.requestId }
            : { $: value.interrupted ? "Interrupted" : value.started ? "Started" : "Issued", request: value.request }
        return { $: "RequestState", receipt }
      }
      case "ReadReviewing":
        return flag(
          (yield* deps.residentLedger.canonicalProjection()).work.some(
            (value) => value.operation === job.canonicalOperationId && value.kind === "reviewing"
          )
        )
      case "ReadAborted":
        return flag(context.signal.aborted)
      case "InterruptRequest":
        return flag(yield* interruption.interrupt())
      case "ObserveInterrupted":
        yield* interruption.observe()
        return ack()
      case "SettleRequest": {
        const result = yield* bridge.evaluationSettle(
          lease,
          {
            partition: job.partition,
            operation: job.canonicalOperationId,
            round: job.canonicalRound,
            reservation: job.reservation
          },
          outcomes[command.outcome.$],
          command.current
        )
        return { $: "RequestSettled", disposition: dispositions[result.value] }
      }
      case "CompleteUnavailable":
        return flag(
          yield* deps.residentLedger.completeReview(
            job.partition,
            job.canonicalOperationId,
            job.reservation,
            "unavailable",
            job.canonicalRound
          )
        )
      case "ObserveSettled":
        yield* recordRequestObservation(
          { ...context, identity },
          "settled",
          request(),
          outcomes[command.outcome.$],
          command.outcome.$ === "Clear" || command.outcome.$ === "Finding" ? evaluation().findings : []
        )
        yield* deps.residentReviewControls
          .afterRequestSettled()
          .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "request settlement barrier" })))
        return ack()
      case "ObserveEscaped": {
        const actual = yield* currentRequest()
        const receipt = job.inspectionReceipt
        if (
          actual?.started &&
          !outcomeObserved &&
          receipt !== undefined &&
          deps.inspection.isEnabled(receipt.scope.root)
        )
          deps.inspection.offer(receipt.scope, deps.residentInspection.unitCorrelation(job, receipt, actual.request), {
            kind: "evaluation-outcome",
            outcome: command.outcome.$ === "RequestInterrupted" ? "interrupted" : "backend"
          })
        return ack()
      }
      case "ObserveFate":
        deps.residentInspection.observeUnitFate(
          job,
          evaluation().findings,
          command.fate.$ === "StaleFate" ? "stale" : "discarded",
          command.fate.$ === "StaleFate" ? "resident-stale" : "settlement-ignored"
        )
        return ack()
      case "RecordDemoTerminal":
        recordDemoTrace(job.dispatch.demoBudgetPath, job.observation.root, job.observation.advicee, {
          kind: "terminal",
          ...(job.sourceHash === undefined ? {} : { sourceHash: job.sourceHash }),
          state: command.clear ? "clear" : "findings"
        })
        return ack()
      case "StoreEvaluation":
        yield* deps.residentReuse.put(job.partition, job.evaluationKey, evaluation())
        return ack()
      case "ReleaseReuseClaim":
        yield* deps.residentReleaseReuseClaim(job.evaluationKey)
        return ack()
      case "RecordActivity": {
        const stage = {
          IncompleteActivity: "incomplete",
          UnavailableActivity: "unavailable",
          ClearActivity: "clear",
          FindingsActivity: "findings"
        } satisfies Record<typeof command.activity.$, "incomplete" | "unavailable" | "clear" | "findings">
        recordActivity({
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          advicee: job.observation.advicee,
          lifetime: deps.lifetime,
          stage: stage[command.activity.$],
          unitIdentity: job.evaluationKey,
          ...(command.activity.$ === "ClearActivity" || command.activity.$ === "FindingsActivity"
            ? { findings: evaluation().findings.length }
            : {})
        })
        return ack()
      }
      case "RecordUnavailableAnalytics":
        yield* deps.residentRecordAnalytics(job, "review-unavailable")
        return ack()
      case "SettleJoined":
        yield* deps.residentSettleJoined(
          job.evaluationKey,
          command.clear ? "clear" : "unavailable",
          reasons[command.reason.$]
        )
        return ack()
      case "RecordOperationalFailure": {
        if (command.reason.$ !== "BackendReason" && command.reason.$ !== "CredentialReason")
          throw new Error("Invalid operational notice command")
        yield* deps.residentRecordOperationalFailure(
          job.observation,
          command.reason.$ === "BackendReason" ? "backend" : "credential"
        )
        return ack()
      }
      case "RetireUnitWork":
        if (job.round !== undefined && job.workUnitId !== undefined)
          (yield* deps.residentLedger.rounds.policyWork(job.round)).retire(job.workUnitId)
        return ack()
      case "MarkCompleted":
        job.completed = true
        return ack()
      case "ReleaseUnit":
        yield* deps.residentReleaseUnit(job)
        return ack()
      case "RecordControlledOutcome": {
        if (controlled?.outcomePath !== undefined) {
          const { sessionId, turnId, toolUseId, subagentId } = job.observation.advicee
          const path = controlled.outcomePath
          yield* residentAdapter("record controlled outcome", () =>
            appendFile(
              path,
              `${JSON.stringify({ sessionId, turnId, toolUseId, subagentId, outcome: command.clear ? "completed-clear" : "completed-findings" })}\n`,
              "utf8"
            )
          )
        }
        return ack()
      }
      case "ReadAdviceCandidates":
        return yield* retention.perform({ $: "ReadAdviceCandidates" }, lease)
      case "InsertAdvice":
        return yield* retention.perform({ $: "InsertAdvice" }, lease)
      case "PublishExisting":
        return yield* retention.perform({ $: "PublishExisting", advice: command.advice }, lease)
      case "RecordJoined":
        return yield* retention.perform({ $: "RecordJoined", publication: command.publication }, lease)
      case "ObserveRetained":
      case "PreserveAdviceTail":
      case "DriveAdviceTail":
        return yield* retention.perform({ $: command.$, tail: command.tail }, lease)
      case "RecordDebugFailure":
        if (deps.runtimeConfiguration.debug) console.error("resident evaluation unavailable")
        return ack()
      case "ReadCompleted":
        return flag(job.completed === true || retention.transferred())
      case "RaiseInvariant": {
        const errors = {
          ResultWithoutStart: "Jev result without a matching canonical request command and start",
          RoundOutcomeRefused: "Bend denied review outcome",
          MissingReview: "Evaluation lacks its provider result"
        }
        throw new Error(errors[command.invariant.$])
      }
      default: {
        const exhaustive: never = command
        return exhaustive
      }
    }
  })
  return { perform, evaluation, transferred: retention.transferred, finish: retention.finish }
}
