import {
  CANONICAL_MAX_BYTES,
  CANONICAL_MAX_UNITS,
  initialCanonical,
  projectCanonical,
  stepCanonical,
  type CapacityPurpose
} from "@hapsland/canonical-policy/canonical/adapter"
import {
  type CapacityDraft,
  type CapacityReservation,
  type CapacityResize,
  type CapacityState,
  type CapacitySnapshot
} from "./model.ts"
import { partitionId } from "./identities.ts"
import { transition, canonicalProjection } from "./canonical.ts"

export type { CapacityPurpose } from "@hapsland/canonical-policy/canonical/adapter"
/** Immutable capability; metadata belongs to the current committed record.
 * A released capability has no authority and reads its issuance metadata.
 * Identity comparison fences clear/restart reuse of numeric reservation IDs.
 */
export function registerReservation(
  draft: CapacityDraft,
  id: number,
  partition: string,
  bytes: number,
  purpose: CapacityPurpose
): CapacityReservation {
  const capability: CapacityReservation = Object.freeze({ id, partition })
  draft.reservations.set(id, { capability, bytes, purpose })
  return capability
}
export function setReservationMetadata(
  draft: CapacityDraft,
  capability: CapacityReservation,
  bytes: number | undefined,
  purpose: CapacityPurpose
): void {
  const record = draft.reservations.get(capability.id)
  if (record?.capability !== capability) throw new Error("unknown reservation metadata owner")
  draft.reservations.set(capability.id, { capability, bytes: bytes ?? record.bytes, purpose })
}
export function validCapacityBytes(bytes: number, minimum: number): boolean {
  return Number.isSafeInteger(bytes) && bytes >= minimum && bytes <= CANONICAL_MAX_BYTES
}
function singleCapacityOutput(result: ReturnType<typeof stepCanonical>, error: string) {
  const command = result.outputs[0]
  if (result.rejection !== undefined || result.outputs.length !== 1 || command === undefined) throw new Error(error)
  return command
}
function isPreparationRelease(
  command: ReturnType<typeof stepCanonical>["outputs"][number] | undefined,
  id: number
): boolean {
  return command?.kind === "preparationReleased" && command.id === id
}
function validateReplacementResult(
  result: ReturnType<typeof stepCanonical>,
  reservation: CapacityReservation,
  count: number
): void {
  if (
    result.rejection !== undefined ||
    !isPreparationRelease(result.outputs[0], reservation.id) ||
    result.outputs.length !== count + 1
  ) {
    throw new Error("invalid Bend capacity replacement result")
  }
}
function validateReplacementIdentities(draft: CapacityDraft, ids: ReadonlyArray<number>): void {
  if (new Set(ids).size !== ids.length || ids.some((id) => draft.reservations.has(id))) {
    throw new Error("Bend reused a live capacity reservation ID")
  }
}
export function reserve(
  draft: CapacityDraft,
  partition: string,
  bytes: number,
  purpose: CapacityPurpose
): CapacityReservation | undefined {
  if (!validCapacityBytes(bytes, 1)) return undefined
  const identity = partitionId(draft, partition)
  const result = stepCanonical(draft.canonical, { kind: "reserveCapacity", partition: identity, bytes, purpose })
  const command = singleCapacityOutput(result, "invalid Bend capacity reservation result")
  if (command.kind === "capacityRefused") return undefined
  if (command.kind !== "capacityGranted") throw new Error("unexpected Bend capacity reservation command")
  const id = command.id
  if (draft.reservations.has(id)) throw new Error("Bend reused a live capacity reservation ID")
  draft.canonical = result.state
  const reservation = registerReservation(draft, id, partition, bytes, purpose)
  return reservation
}
export function resize(
  draft: CapacityDraft,
  reservation: CapacityReservation,
  bytes: number,
  purpose?: CapacityPurpose
): CapacityResize {
  const retained = draft.reservations.get(reservation.id)
  if (retained?.capability !== reservation) return { status: "invalid-reservation" }
  if (!validCapacityBytes(bytes, 0)) return { status: "invalid-measurement" }
  const nextPurpose = purpose ?? retained.purpose
  const result = stepCanonical(draft.canonical, {
    kind: "resizeCapacity",
    reservation: reservation.id,
    bytes,
    purpose: nextPurpose
  })
  const command = singleCapacityOutput(result, "invalid Bend capacity resize result")
  if (command.kind === "capacityRefused") return { status: "capacity-refused", constraint: command.reason }
  if (command.kind !== "capacityResized" || command.id !== reservation.id)
    throw new Error("unexpected Bend capacity resize command")
  draft.canonical = result.state
  setReservationMetadata(draft, reservation, bytes, nextPurpose)
  return { status: "resized" }
}
export function replace(
  draft: CapacityDraft,
  reservation: CapacityReservation,
  bytes: ReadonlyArray<number>
): ReadonlyArray<CapacityReservation | undefined> | { readonly invalidMeasurement: true } {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) return bytes.map(() => undefined)
  if (bytes.length > CANONICAL_MAX_UNITS || bytes.some((size) => !validCapacityBytes(size, 1))) {
    release(draft, reservation)
    return { invalidMeasurement: true }
  }
  const result = stepCanonical(draft.canonical, {
    kind: "replaceCapacity",
    reservation: reservation.id,
    unitBytes: bytes
  })
  validateReplacementResult(result, reservation, bytes.length)
  const replacements = result.outputs.slice(1).map((command, index) => {
    if (command.kind === "capacityUnitRefused" && command.position === index + 1 && command.bytes === bytes[index])
      return undefined
    if (command.kind !== "capacityUnitAdmitted" || command.position !== index + 1 || command.bytes !== bytes[index]) {
      throw new Error("unexpected Bend capacity replacement command")
    }
    return {
      id: command.reservation,
      partition: reservation.partition,
      bytes: command.bytes,
      purpose: "reviewUnit" as const
    }
  })
  const replacementIds = replacements.flatMap((item) => (item === undefined ? [] : [item.id]))
  validateReplacementIdentities(draft, replacementIds)
  draft.canonical = result.state
  draft.reservations.delete(reservation.id)
  return replacements.map((item) =>
    item === undefined ? undefined : registerReservation(draft, item.id, item.partition, item.bytes, item.purpose)
  )
}
function releaseWorkTransition(
  draft: CapacityDraft,
  reservation: CapacityReservation,
  work: ReturnType<typeof projectCanonical>["work"][number]
) {
  const common = {
    partition: partitionId(draft, reservation.partition),
    lifetime: 1,
    round: work.round,
    operation: work.operation
  }
  switch (work.kind) {
    case "preparing":
      return transition(draft, { kind: "interruptPreparation", ...common })
    case "pendingFinding":
      return transition(draft, { kind: "retireReview", ...common })
    default:
      return transition(draft, { kind: "reviewCompleted", ...common, outcome: "discarded" })
  }
}
export function release(draft: CapacityDraft, reservation: CapacityReservation): boolean {
  const retained = draft.reservations.get(reservation.id)
  if (retained?.capability !== reservation) return false
  const work = canonicalProjection(draft).work.find((item) => item.reservation === reservation.id)
  if (work !== undefined) {
    const result = releaseWorkTransition(draft, reservation, work)
    if (
      result.rejection !== undefined ||
      !result.outputs.some(
        (command) =>
          (command.kind === "preparationReleased" || command.kind === "reservationReleased") &&
          command.id === reservation.id
      )
    )
      throw new Error("canonical work release refused")
    draft.reservations.delete(reservation.id)
    return true
  }
  const result = stepCanonical(draft.canonical, { kind: "releaseCapacity", reservation: reservation.id })
  const command = singleCapacityOutput(result, "invalid Bend capacity release result")
  if (command.kind !== "reservationReleased" || command.id !== reservation.id) {
    throw new Error("invalid Bend capacity release result")
  }
  draft.canonical = result.state
  draft.reservations.delete(reservation.id)
  return true
}
export function clear(draft: CapacityDraft): void {
  draft.canonical = initialCanonical(draft.limits)
  draft.reservations.clear()
  draft.partitionIds.clear()
  draft.partitionIdentityBytes = 0
  draft.roundIds.clear()
  draft.requestRounds.clear()
  draft.collectionTokens.clear()
  draft.nextCollectionToken = 1
  draft.nextPartitionId = 1
  draft.minimumFreshStart = 0
}
export function snapshot(draft: CapacityState): CapacitySnapshot {
  const projection = projectCanonical(draft.canonical)
  const entries: Array<[string, { items: number; bytes: number }]> = []
  for (const [partition, id] of draft.partitionIds) {
    const usage = projection.partitions.find((item) => item.partition === id)
    if (usage !== undefined && usage.items > 0) entries.push([partition, { items: usage.items, bytes: usage.bytes }])
  }
  return { items: projection.global.items, bytes: projection.global.bytes, partitions: Object.fromEntries(entries) }
}
