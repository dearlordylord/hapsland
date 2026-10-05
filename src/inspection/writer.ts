import { Context } from "effect"
import type { DirectAdvicee } from "../direct-event/model.ts"
import type { InspectionFact } from "./contract.ts"

/** Common observation port for hook and native writers; reporters must offer without awaiting I/O. */
export class InspectionWriterObservation extends Context.Service<
  InspectionWriterObservation,
  {
    readonly observe: (event: {
      readonly state: Extract<InspectionFact, { kind: "writer-evidence" }>["state"]
      readonly encoded?: string
      readonly outputMissing?: "oversized" | "unavailable"
    }) => void
  }
>()("@hapsland/InspectionWriterObservation") {}

export const observeInspectionWriter = (
  observer: InspectionWriterObservation["Service"] | undefined,
  state: Parameters<InspectionWriterObservation["Service"]["observe"]>[0]["state"],
  encoded?: string
): void => {
  try {
    observer?.observe({ state, ...(encoded === undefined ? {} : { encoded }) })
  } catch {
    /* Optional inspection cannot change output behavior. */
  }
}

/** A reporter binds one attempt to its original resident and exact intended recipient. */
export class InspectionSubmissionObservation extends Context.Service<
  InspectionSubmissionObservation,
  {
    readonly forAttempt: (attempt: {
      readonly batchId: string
      readonly findingCount: number
      readonly noticeOnly: boolean
      readonly attemptId: string
      readonly endpoint: string
      readonly lifetime: string
      readonly root: string
      readonly advicee: DirectAdvicee
      readonly recording?: true
    }) => InspectionWriterObservation["Service"] | undefined
  }
>()("@hapsland/InspectionSubmissionObservation") {}
