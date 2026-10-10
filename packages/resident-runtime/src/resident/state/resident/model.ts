import { type RuntimeRecordsState } from "../runtime-records.ts"
import { type AdviceRecordsState } from "../advice-records.ts"
import { type NoticeRecordsState } from "../notice-records.ts"
import { type RoundRecordsState } from "../round-records.ts"
import { type JoinedReviewsState } from "../joined-reviews.ts"
import { type RevisionState, type WorkRevision } from "../revision.ts"
import { type DispatchRegistry } from "../dispatch.ts"
import { type DeliveryState } from "../delivery/model.ts"
import { type EvaluationReuseState } from "../evaluation-reuse.ts"
import { type CapacityReservation } from "../capacity/model.ts"

export type AdviceCapture = {
  readonly reservation: CapacityReservation
  readonly revision: WorkRevision
  readonly retainedBytes: number
}
export type AdviceCaptureRecord = { readonly capability: AdviceCapture; readonly retired: boolean }
export type ResidentRecords<Pending, Key, Value> = {
  readonly runtime: RuntimeRecordsState
  readonly adviceCaptures: ReadonlyMap<number, AdviceCaptureRecord>
  readonly advice: AdviceRecordsState
  readonly reuse: EvaluationReuseState<Pending>
  readonly delivery: DeliveryState
  readonly dispatch: DispatchRegistry<Key, Value>
  readonly revision: RevisionState
  readonly joined: JoinedReviewsState
  readonly rounds: RoundRecordsState
  readonly notices: NoticeRecordsState
}
