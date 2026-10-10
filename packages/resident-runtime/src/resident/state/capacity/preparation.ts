import { CANONICAL_MAX_UNITS } from "@hapsland/canonical-policy/canonical/adapter"
import { type CapacityDraft, type PreparationAdmission, type CapacityReservation } from "./model.ts"
import { roundId } from "./rounds.ts"
import { transition } from "./canonical.ts"
import { partitionId } from "./identities.ts"
import { validCapacityBytes, registerReservation } from "./reservations.ts"

export function admitObservation(
  draft: CapacityDraft,
  partition: string,
  round: number = roundId(draft, partition)
): number {
  const result = transition(draft, {
    kind: "admitObservation",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round
  })
  const command = result.outputs[0]
  if (result.rejection !== undefined || command?.kind !== "observationAdmitted")
    throw new Error("canonical observation admission refused")
  return command.id
}
export function observation(
  draft: CapacityDraft,
  partition: string,
  id: number,
  kind: "startObservation" | "completeObservation" | "interruptObservation",
  round: number
): boolean {
  const result = transition(draft, {
    kind,
    partition: partitionId(draft, partition),
    lifetime: 1,
    round,
    observation: id
  })
  return (
    result.rejection === undefined &&
    result.outputs[0]?.kind ===
      (
        {
          startObservation: "observationStarted",
          completeObservation: "observationCompleted",
          interruptObservation: "observationInterrupted"
        } as const
      )[kind]
  )
}
export function beginObservedPreparation(
  draft: CapacityDraft,
  partition: string,
  observation: number,
  bytes: number,
  round: number
): PreparationAdmission {
  if (!validCapacityBytes(bytes, 1)) return { status: "invalid-measurement" }
  const result = transition(draft, {
    kind: "beginObservedPreparation",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round,
    observation,
    bytes
  })
  if (result.rejection === "StaleRound") return { status: "unavailable", reason: "stale-round" }
  if (result.rejection === "WrongStage") return { status: "unavailable", reason: "wrong-stage" }
  if (result.rejection !== undefined) throw new Error("unexpected canonical preparation rejection")
  const command = result.outputs[0]
  if (command === undefined) throw new Error("invalid canonical preparation admission")
  if (command.kind === "preparationRefused") return { status: "capacity-refused" }
  if (command.kind !== "prepare") throw new Error("unexpected canonical preparation command")
  const reservation = registerReservation(draft, command.reservation, partition, bytes, "preparation")
  return { status: "admitted", operation: command.operation, reservation }
}
export function completePreparation(
  draft: CapacityDraft,
  partition: string,
  operation: number,
  reservation: CapacityReservation,
  sizes: readonly number[],
  round: number
): ReadonlyArray<{ readonly operation: number; readonly reservation: CapacityReservation } | undefined> {
  if (
    draft.reservations.get(reservation.id)?.capability !== reservation ||
    sizes.length > CANONICAL_MAX_UNITS ||
    sizes.some((size) => !validCapacityBytes(size, 1))
  ) {
    throw new TypeError("invalid canonical preparation completion")
  }
  const result = transition(draft, {
    kind: "preparationCompleted",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round,
    operation,
    unitBytes: sizes
  })
  if (result.rejection !== undefined || result.outputs[0]?.kind !== "preparationReleased") {
    throw new Error("canonical preparation completion refused")
  }
  draft.reservations.delete(reservation.id)
  const units = result.outputs.slice(1).map((command, index) => {
    // undefined records a capacity refusal, which cannot establish a clear review outcome.
    if (command.kind === "unitRefused" && command.position === index + 1) return undefined
    if (command.kind !== "unitAdmitted" || command.position !== index + 1)
      throw new Error("invalid canonical unit admission")
    const unit = registerReservation(draft, command.reservation, partition, command.bytes, "reviewUnit")
    return { operation: command.operation, reservation: unit }
  })
  if (units.length !== sizes.length) throw new Error("canonical unit count mismatch")
  return units
}
