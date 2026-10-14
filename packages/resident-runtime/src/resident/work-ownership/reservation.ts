import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { PreparedUnit, MaterializationAdmission } from "@hapsland/review-definition/direct-event/model"
import type { ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import type { CapacityResize } from "../state/resident/state.ts"
import { measurePostSizing } from "../review-work/preparation/post-sizing.ts"

export const resizePreparationAdmission = (
  result: CapacityResize,
  requestedBytes: number
): MaterializationAdmission => {
  if (result.status === "resized") return { status: "admitted" }
  if (result.status === "capacity-refused")
    return {
      status: "refused",
      diagnostic: {
        stage: "preparation",
        code: "preparation-resource-refused",
        args: { phase: "materialization", requestedBytes, constraint: result.constraint }
      }
    }
  return {
    status: "refused",
    diagnostic: { stage: "preparation", code: "panic", args: { boundary: "review-preparation" } }
  }
}

export const RESERVATION_OVERHEAD_BYTES = 1024

export const residentUnitWorstOutcomeBytes = (prepared: PreparedUnit): number =>
  measurePostSizing({ $: "WorstOutcomeSizing" }, prepared) as number

export const residentUnitFits = (prepared: PreparedUnit): boolean =>
  measurePostSizing({ $: "DeliverabilitySizing" }, prepared) as boolean

export const residentUnitReservationBytes = (
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  prepared: PreparedUnit
): number => measurePostSizing({ $: "ReservationSizing" }, prepared, observation, dispatch) as number
