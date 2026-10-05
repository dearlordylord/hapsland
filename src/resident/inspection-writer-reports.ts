import { Context } from "effect"
import type { DirectAdvicee } from "../direct-event/model.ts"
import type { ResidentWriterEvidence } from "./protocol.ts"

/** Optional bounded evidence carried on the existing delivery acknowledgement RPC. */
export class InspectionWriterReports extends Context.Service<
  InspectionWriterReports,
  {
    readonly forBatch: (batch: {
      readonly endpoint: string
      readonly token: string
      readonly lifetime: string
      readonly root: string
      readonly advicee: DirectAdvicee
    }) => ReadonlyArray<ResidentWriterEvidence>
  }
>()("Hapsland/InspectionWriterReports") {}
