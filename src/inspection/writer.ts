import { Context } from "effect"
import type { InspectionFact } from "./contract.ts"

/** Common observation port for hook and native writers; reporters must offer without awaiting I/O. */
export class InspectionWriterObservation extends Context.Service<
  InspectionWriterObservation,
  {
    readonly observe: (event: {
      readonly state: Extract<InspectionFact, { kind: "writer-evidence" }>["state"]
      readonly encoded?: string
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
