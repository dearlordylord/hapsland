import type { InspectionScope, InspectionCorrelation } from "@hapsland/inspection-records/inspection/contract"

export type InspectionReceipt = {
  readonly scope: InspectionScope
  readonly correlation: InspectionCorrelation
  readonly candidates: ReadonlyArray<{ readonly path: string; readonly position: number }>
}
