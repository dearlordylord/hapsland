import { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import type { EvaluatedUnit } from "@hapsland/review-execution/direct-event/pipeline"
import type { UnitJob } from "../../work-ownership/jobs.ts"
import type { Dependencies } from "./context.ts"
import type core from "./post-preparation-core.js"
import type { RetainedObservationResponse } from "./post-preparation-core.js"

type Inspection = Dependencies["inspection"]
type Tail = {
  readonly unit: Pick<UnitJob, "inspectionReceipt" | "inspectionEvaluationId" | "completed">
  readonly evaluation: Pick<EvaluatedUnit, "findings">
  readonly receipt: { readonly capability: { readonly id: string } }
}

/** Interpret the Post-selected operations synchronously under the existing lease.
 * Native receipt reads deliberately repeat in the original getter/spread order. */
export function observeRetainedAdvice(
  machine: Pick<typeof core, "retained_observation_initial" | "retained_observation_resume">,
  tail: Tail,
  readInspection: () => Inspection
): void {
  const value = tail.unit
  const receipt = () => value.inspectionReceipt as NonNullable<UnitJob["inspectionReceipt"]>
  let inspection: Inspection | undefined
  let offer: Inspection["offer"] | undefined
  let scope: Parameters<Inspection["offer"]>[0] | undefined
  let metadata: Parameters<Inspection["offer"]>[1] | undefined
  let step = machine.retained_observation_initial()
  while (step.$ === "RetainedObservationAwait") {
    let response: RetainedObservationResponse = { $: "RetainedObservationAck" }
    switch (step.operation.$) {
      case "RetainedReadReceipt":
        response = { $: "RetainedObservationFlag", value: value.inspectionReceipt !== undefined }
        break
      case "RetainedCheckEnabled":
        response = { $: "RetainedObservationFlag", value: readInspection().isEnabled(receipt().scope.root) }
        break
      case "RetainedPrepareBase":
        inspection = readInspection()
        offer = inspection.offer
        scope = receipt().scope
        metadata = { ...receipt().correlation }
        break
      case "RetainedReadEvaluation":
        response = { $: "RetainedObservationFlag", value: value.inspectionEvaluationId !== undefined }
        break
      case "RetainedAttachEvaluation":
        Object.defineProperty(metadata, "evaluationId", {
          value: value.inspectionEvaluationId,
          enumerable: true,
          writable: true,
          configurable: true
        })
        break
      case "RetainedOffer":
        Reflect.apply(offer as Inspection["offer"], inspection, [
          scope,
          metadata,
          captureInspectionFate(tail.evaluation.findings, "retained", "pending-advice", tail.receipt.capability.id)
        ])
        break
      case "RetainedComplete":
        value.completed = true
        break
    }
    step = machine.retained_observation_resume(step, response)
  }
  if (step.$ !== "RetainedObservationDone") throw new Error("Invalid retained observation reply")
}
