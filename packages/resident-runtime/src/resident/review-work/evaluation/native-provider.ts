import { InspectionTransportObservation } from "@hapsland/inspection-records/inspection/transport"
import { captureInspectionFindings } from "@hapsland/review-execution/inspection/capture"
import { MAX_INSPECTION_INPUT_BYTES } from "@hapsland/inspection-records/inspection/contract"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import { createHash } from "node:crypto"
import { evaluatePrepared } from "@hapsland/review-execution/direct-event/pipeline"
import { reviewDecisionModelLayer } from "@hapsland/review-execution/review-providers/live"
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions
} from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { physicalRequest } from "../../work-ownership/cancellation.ts"
import { type EvaluationContext } from "./context.ts"
import type { resolveCredential } from "@hapsland/credential-storage/credentials/owner"

export const runEvaluationProvider = Effect.fn("ResidentRuntime.runEvaluationProvider")(function* (
  context: Pick<
    EvaluationContext<
      "inspection" | "residentControlledRequestEffect" | "residentInspection" | "residentOfflineHttpClient"
    >,
    "deps" | "job"
  >,
  options: {
    readonly controlled: ControlledDecisionModelOptions | undefined
    readonly credential: Effect.Success<ReturnType<typeof resolveCredential>> | undefined
    readonly request: number
    readonly beforeDispatch: Effect.Effect<void, unknown>
    readonly observeOutcome: () => void
  }
) {
  const { controlled, credential, request, beforeDispatch } = options
  const settings = context.job.settings
  const offlineHttpClient = context.deps.residentOfflineHttpClient
  const controlledRequestEffect = context.deps.residentControlledRequestEffect
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
  const evaluation = evaluatePrepared(context.job.prepared, beforeDispatch, (evidence) => {
    if (evidence.kind === "evaluation-outcome") options.observeOutcome()
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
      context.deps.residentInspection.unitCorrelation(context.job, context.job.inspectionReceipt, request),
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
          context.deps.residentInspection.unitCorrelation(context.job, receipt, request),
          { kind: "transport-invoked", representation: "http-body-base64", payload }
        )
      }
    })
  )
  return yield* credentialProvider === undefined ? evaluation : evaluation.pipe(Effect.provide(credentialProvider))
})
