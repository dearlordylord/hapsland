import { runEvaluationProvider } from "./native-provider.ts"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import { encodedPreparedProviderInputBytes } from "@hapsland/review-execution/direct-event/pipeline"
import { type ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { claimDemoBudget } from "@hapsland/activity-observation/activity/demo-budget"
import { type EvaluationContext } from "./context.ts"
import { resolveEvaluationCredentials, authorizePreparedUnit } from "./authorization.ts"
import { observeRequest } from "./observation.ts"
import { reportInterruption } from "./settlement.ts"

export const residentControlledOutcomePath = (controlled: ControlledDecisionModelOptions): string =>
  controlled.outcomePath ?? ""

export const residentControlledOutcomeLabel = (count: number): string =>
  count === 0 ? "completed-clear" : "completed-findings"

export const evaluateAuthorizedUnit = Effect.fn("ResidentRuntime.evaluateAuthorizedUnit")(function* (
  context: EvaluationContext<
    | "inspection"
    | "residentControlledRequestEffect"
    | "residentCredentialRequired"
    | "residentCredentialShapeMatches"
    | "residentDispatchControls"
    | "residentInspection"
    | "residentIsCurrentWork"
    | "residentJobActive"
    | "residentLedger"
    | "residentObserveDispatchAuthority"
    | "residentObserveJevRequest"
    | "residentOfflineHttpClient"
    | "residentRecordAnalytics"
  >,
  controlled: ControlledDecisionModelOptions | undefined
) {
  const resolved = yield* resolveEvaluationCredentials(context, controlled)
  if ("status" in resolved) return resolved
  const { dispatchCredential, credential } = resolved
  // Source and credential authority may change while waiting. Configuration
  // and rules remain the edit-owned snapshot through dispatch and delivery.

  const ready = yield* authorizePreparedUnit(context, resolved)
  const deniedAuthorization = () =>
    ready.status === "notAuthorized" ? ready : { status: "notAuthorized" as const, reason: undefined }
  if (ready.status !== "issued") return deniedAuthorization()
  const makeCredentialAuthority = () => {
    return credential?.status !== "present"
      ? Effect.void
      : Effect.suspend(() => {
          const current = readCredentialState(dispatchCredential?.statePath)
          return current.generation === credential.generation &&
            (credential.source === "environment" || !current.savedUseSuspended)
            ? Effect.void
            : Effect.fail(new Error("credential generation changed before provider dispatch"))
        })
  }
  const credentialAuthority = makeCredentialAuthority()
  const makeBudgetAuthority = () => {
    return context.job.dispatch.demoBudgetPath == null
      ? Effect.void
      : Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) =>
            Effect.try(() =>
              claimDemoBudget(
                context.job.dispatch.demoBudgetPath ?? "",
                context.job.observation.root,
                encodedPreparedProviderInputBytes(context.job.prepared),
                now
              )
            )
          )
        )
  }
  const budgetAuthority = makeBudgetAuthority()
  const beforeDispatch = credentialAuthority.pipe(
    Effect.andThen(budgetAuthority),
    Effect.andThen(
      Effect.gen(function* () {
        if (
          !(yield* context.deps.residentLedger.startJevRequest(
            context.job.partition,
            context.job.canonicalOperationId,
            ready.request
          ))
        ) {
          throw new Error("canonical Jev request start refused")
        }
        context.state.requestStarted = true
        context.job.requestStarted = true
        yield* observeRequest(context, "started", ready.request)
        if (context.signal?.aborted) yield* reportInterruption(context)
      })
    )
  )
  return yield* runEvaluationProvider(context, {
    controlled,
    credential,
    request: ready.request,
    beforeDispatch,
    observeOutcome: () => {
      context.state.evaluationOutcomeObserved = true
    }
  })
})
