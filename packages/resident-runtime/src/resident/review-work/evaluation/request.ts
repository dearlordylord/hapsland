import { InspectionTransportObservation } from "@hapsland/inspection-records/inspection/transport"
import { captureInspectionFindings } from "@hapsland/review-execution/inspection/capture"
import { MAX_INSPECTION_INPUT_BYTES } from "@hapsland/inspection-records/inspection/contract"
import * as Clock from "effect/Clock"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import { createHash } from "node:crypto"
import { evaluatePrepared, encodedPreparedProviderInputBytes } from "@hapsland/review-execution/direct-event/pipeline"
import { reviewDecisionModelLayer } from "@hapsland/review-execution/review-providers/live"
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions
} from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { claimDemoBudget } from "@hapsland/activity-observation/activity/demo-budget"
import { physicalRequest } from "../../work-ownership/cancellation.ts"
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
  const offlineHttpClient = context.deps.residentOfflineHttpClient
  const controlledRequestEffect = context.deps.residentControlledRequestEffect
  const resolved = yield* resolveEvaluationCredentials(context, controlled)
  if ("status" in resolved) return resolved
  const { settings, dispatchCredential, credential } = resolved
  // Source and credential authority may change while waiting. Configuration
  // and rules remain the edit-owned snapshot through dispatch and delivery.

  const ready = yield* authorizePreparedUnit(context, resolved)
  const deniedAuthorization = () =>
    ready.status === "notAuthorized" ? ready : { status: "notAuthorized" as const, reason: undefined }
  if (ready.status !== "issued") return deniedAuthorization()
  const makeCredentialProvider = () => {
    return credential?.status !== "present"
      ? undefined
      : ConfigProvider.layer(ConfigProvider.fromUnknown({ [settings.credentialEnvVar]: credential.value }))
  }
  const credentialProvider = makeCredentialProvider()
  if (controlled === undefined && credentialProvider === undefined) return undefined
  const makeEvaluationModel = () => {
    return controlled === undefined
      ? reviewDecisionModelLayer(settings, offlineHttpClient)
      : controlledDecisionModelLayer({
          ...controlled,
          ...(controlledRequestEffect === undefined
            ? {}
            : { onRequest: physicalRequest("controlled provider request", controlledRequestEffect).pipe(Effect.orDie) })
        })
  }
  const decisionModel = makeEvaluationModel()
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
  const evaluation = evaluatePrepared(context.job.prepared, beforeDispatch, (evidence) => {
    if (evidence.kind === "evaluation-outcome") context.state.evaluationOutcomeObserved = true
    if (
      context.job.inspectionReceipt === undefined ||
      !context.deps.inspection.isEnabled(context.job.inspectionReceipt.scope.root)
    )
      return
    const fact =
      evidence.kind === "model-input"
        ? (() => {
            const encoded = JSON.stringify(evidence.input)
            const byteLength = Buffer.byteLength(encoded)
            return {
              kind: "model-input" as const,
              representation: "decision-model-json" as const,
              payload:
                byteLength > MAX_INSPECTION_INPUT_BYTES
                  ? { status: "missing" as const, reason: "oversized" as const }
                  : {
                      status: "available" as const,
                      encoded,
                      byteLength,
                      sha256: createHash("sha256").update(encoded).digest("hex")
                    }
            }
          })()
        : evidence.kind === "interpreted-findings"
          ? captureInspectionFindings(evidence.findings)
          : evidence
    context.deps.inspection.offer(
      context.job.inspectionReceipt.scope,
      context.deps.residentInspection.unitCorrelation(context.job, context.job.inspectionReceipt, ready.request),
      fact
    )
  }).pipe(
    Effect.provide(decisionModel),
    Effect.provideService(InspectionTransportObservation, {
      observe: (body) => {
        const receipt = context.job.inspectionReceipt
        if (receipt === undefined || !context.deps.inspection.isEnabled(receipt.scope.root)) return
        const payload =
          body === undefined
            ? { status: "missing" as const, reason: "unavailable" as const }
            : body.byteLength > MAX_INSPECTION_INPUT_BYTES
              ? { status: "missing" as const, reason: "oversized" as const }
              : {
                  status: "available" as const,
                  encoded: Buffer.from(body).toString("base64"),
                  byteLength: body.byteLength,
                  sha256: createHash("sha256").update(body).digest("hex")
                }
        context.deps.inspection.offer(
          receipt.scope,
          context.deps.residentInspection.unitCorrelation(context.job, receipt, ready.request),
          { kind: "transport-invoked", representation: "http-body-base64", payload }
        )
      }
    })
  )
  return yield* credentialProvider === undefined ? evaluation : evaluation.pipe(Effect.provide(credentialProvider))
})
