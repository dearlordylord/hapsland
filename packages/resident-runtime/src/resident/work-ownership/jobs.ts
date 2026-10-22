import { type InspectionReceipt } from "../inspection/receipt.ts"
import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { RoundWork, WorkCohort } from "../state/round-records.ts"
import { type WorkRevision } from "../state/revision.ts"
import type * as Effect from "effect/Effect"
import { type PreparedReviewUnit } from "@hapsland/review-definition/direct-event/model"
import { type ReviewSettingsSnapshot } from "@hapsland/review-definition/runtime/review-settings"
import { type ResidentReviewExecutionContext } from "@hapsland/resident-transport/resident/protocol"
import { type makeResidentState, type ReviewCapacityReservationHandle } from "../state/resident/state.ts"

export type IngressJob = {
  readonly inspectionReceipt?: InspectionReceipt
  readonly canonicalRoundId: number
  readonly round?: RoundWork
  readonly work?: WorkCohort
  completed?: boolean
  readonly settings: ReviewSettingsSnapshot
  readonly kind: "ingress"
  readonly workObservationId?: number
  readonly canonicalObservationId: number
  readonly observation: DirectObservation
  readonly partition: string
  readonly reservation: ReviewCapacityReservationHandle
  readonly dispatch: ResidentReviewExecutionContext
  analyticsEnabled?: boolean
  analyticsDiscardReported?: boolean
}

/** Resident-owned scheduling and lifetime data for evaluating one prepared review unit. */
export type ReviewUnitJob = {
  readonly inspectionEvaluationId?: string
  readonly inspectionReceipt?: InspectionReceipt
  readonly canonicalRoundId: number
  readonly round?: RoundWork
  readonly work?: WorkCohort
  completed?: boolean
  released?: boolean
  /** A Hapsland-local request identity; it is not an ID returned by the review service. */
  reviewServiceRequestId?: number
  reviewServiceRequestStarted?: boolean
  readonly settings: ReviewSettingsSnapshot
  readonly kind: "unit"
  readonly workUnitId?: number
  /** The canonical observation admitted before source preparation began. */
  readonly canonicalObservationId: number
  readonly canonicalOperationId: number
  readonly observation: DirectObservation
  readonly partition: string
  readonly reservation: ReviewCapacityReservationHandle
  readonly dispatch: ResidentReviewExecutionContext
  analyticsEnabled?: boolean
  analyticsDiscardReported?: boolean
  readonly prepared: PreparedReviewUnit
  readonly sourceHash?: string
  revision: WorkRevision
  readonly evaluationKey: string
}

export type Job = IngressJob | ReviewUnitJob

export type ResidentLedger = Effect.Success<ReturnType<typeof makeResidentState<ReviewUnitJob, string, Job>>>
