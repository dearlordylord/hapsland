import { deliverySyntheticEdit } from "./synthetic-edit.ts"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import type { CapacityLedger } from "../capacity/operations.ts"
import { DEFAULT_EDIT_PERMIT_LIMITS } from "@hapsland/runtime-inputs/configuration/types"
import {
  type DeliveryDraft,
  type EditPermit,
  type PermitTransition,
  type Round,
  type EditAdmission,
  type EditPermitLimits
} from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliveryEditAdmission = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    | "canonicalProjection"
    | "partitionId"
    | "consumeEditPermit"
    | "currentRoundId"
    | "admitObservation"
    | "transition"
    | "knownPartitionId"
    | "minimumFreshStart"
  >,
  ports: Pick<
    DeliveryPorts,
    | "releaseAdmissionPermit"
    | "finishPermit"
    | "nextAdmissionRound"
    | "bendTime"
    | "checkCompleted"
    | "startRound"
    | "readGeneration"
    | "isActive"
    | "dropTool"
    | "toolId"
  >
) => {
  const {
    releaseAdmissionPermit,
    finishPermit,
    nextAdmissionRound,
    bendTime,
    checkCompleted,
    startRound,
    readGeneration
  } = ports
  function releaseCompletedPermit(partition: string, key: string, permit: { readonly token: number }): void {
    releaseAdmissionPermit(partition, permit.token)
    finishPermit(key, "released")
  }

  function permitAdmissionCurrent(partition: string, permit: EditPermit): boolean {
    const admission = canonicalOwner
      .canonicalProjection()
      .admissions.find((item) => item.partition === canonicalOwner.partitionId(partition))
    return admission !== undefined && permit.generation === nextAdmissionRound(admission)
  }

  function validPermitConsumed(result: PermitTransition, permit: EditPermit): boolean {
    const command = result.outputs[0]
    return result.rejection === undefined && command?.kind === "permitConsumed" && command.round === permit.generation
  }

  function consumeRegisteredPermit(partition: string, permit: EditPermit, now: number): boolean {
    try {
      const consumed = canonicalOwner.consumeEditPermit(partition, {
        kind: "consumePermit",
        partition: canonicalOwner.partitionId(partition),
        lifetime: 1,
        token: permit.token,
        tool: permit.tool,
        now: bendTime(now)
      })
      return validPermitConsumed(consumed, permit)
    } catch {
      return false
    }
  }

  function admitPermittedEdit(
    partition: string,
    key: string,
    now: number,
    previous: Round | undefined
  ): EditAdmission | undefined {
    expirePermits(now)
    const permit = state.permits.get(key)
    if (permit === undefined) {
      checkCompleted(key)
      return undefined
    }
    if (!permitAdmissionCurrent(partition, permit)) {
      releaseCompletedPermit(partition, key, permit)
      return undefined
    }
    if (!consumeRegisteredPermit(partition, permit, now)) {
      releaseCompletedPermit(partition, key, permit)
      return undefined
    }
    finishPermit(key, "consumed")
    if (previous === undefined) startRound(partition, permit.quietMs)
    return {
      generation: readGeneration(partition),
      ...(permit.settings === undefined ? {} : { settings: permit.settings })
    }
  }

  const { admitInternalEdit } = deliverySyntheticEdit(state, canonicalOwner, { ...ports, releaseCompletedPermit })

  function admitEdit(
    partition: string,
    eventId: string,
    now: number,
    requirePermit = false,
    limits: EditPermitLimits = DEFAULT_EDIT_PERMIT_LIMITS
  ): EditAdmission | undefined {
    const previous = state.rounds.get(partition)
    const key = `${partition}\0${eventId}`
    if (requirePermit) return admitPermittedEdit(partition, key, now, previous)
    const generation = admitInternalEdit(partition, key, now, previous, limits)
    return generation === undefined ? undefined : { generation }
  }

  /** Permit consumption and canonical observation admission publish in one resident-state commit. */
  function admitEditObservation(partition: string, eventId: string, now: number, requirePermit = false) {
    const admitted = admitEdit(partition, eventId, now, requirePermit)
    if (admitted === undefined) return undefined
    const canonicalRound = canonicalOwner.currentRoundId(partition)!
    const canonicalObservationId = canonicalOwner.admitObservation(partition, canonicalRound)
    return { ...admitted, canonicalRound, canonicalObservationId }
  }

  function expirePermits(now = monotonicNow()): void {
    for (const [key, permit] of state.permits) {
      const result = canonicalOwner.transition({
        kind: "expirePermit",
        partition: canonicalOwner.partitionId(permit.partition),
        lifetime: 1,
        token: permit.token,
        deadlineReached: permit.expiresAt <= now
      })
      if (result.outputs[0]?.kind === "permitKept") continue
      if (result.rejection !== undefined || result.outputs[0]?.kind !== "permitExpired")
        throw new Error("invalid Bend permit expiry")
      finishPermit(key, "expired")
    }
  }

  function hasPendingEdits(partition: string): boolean {
    expirePermits()
    return [...state.permits.values()].some((permit) => permit.partition === partition)
  }
  return { releaseCompletedPermit, admitEdit, admitEditObservation, expirePermits, hasPendingEdits }
}
