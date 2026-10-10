import { type InspectionReceipt } from "../inspection/receipt.ts"
import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { RoundWork, WorkCohort } from "../state/round-records.ts"
import { type WorkRevision } from "../state/revision.ts"
import type * as Effect from "effect/Effect"
import { type PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import { type ReviewSettingsSnapshot } from "@hapsland/review-definition/runtime/review-settings"
import { type ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import { type makeResidentState, type CapacityReservation } from "../state/capacity.ts"

export type IngressJob = {
  readonly inspectionReceipt?: InspectionReceipt
  readonly canonicalRound: number
  readonly round?: RoundWork
  readonly work?: WorkCohort
  completed?: boolean
  readonly settings: ReviewSettingsSnapshot
  readonly kind: "ingress"
  readonly workObservationId?: number
  readonly canonicalObservationId: number
  readonly observation: DirectObservation
  readonly partition: string
  readonly reservation: CapacityReservation
  readonly dispatch: ResidentDispatchContext
  analyticsEnabled?: boolean
  analyticsDiscardReported?: boolean
}

export type UnitJob = {
  readonly inspectionEvaluationId?: string
  readonly inspectionReceipt?: InspectionReceipt
  readonly canonicalRound: number
  readonly round?: RoundWork
  readonly work?: WorkCohort
  completed?: boolean
  released?: boolean
  requestId?: number
  requestStarted?: boolean
  readonly settings: ReviewSettingsSnapshot
  readonly kind: "unit"
  readonly workUnitId?: number
  /** The canonical observation admitted before source preparation began. */
  readonly admissionId: number
  readonly canonicalOperationId: number
  readonly observation: DirectObservation
  readonly partition: string
  readonly reservation: CapacityReservation
  readonly dispatch: ResidentDispatchContext
  analyticsEnabled?: boolean
  analyticsDiscardReported?: boolean
  readonly prepared: PreparedUnit
  readonly sourceHash?: string
  revision: WorkRevision
  readonly evaluationKey: string
}

export type Job = IngressJob | UnitJob

export type ResidentLedger = Effect.Success<ReturnType<typeof makeResidentState<UnitJob, string, Job>>>
