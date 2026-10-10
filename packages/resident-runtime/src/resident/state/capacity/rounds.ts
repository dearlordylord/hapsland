import type { stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { type CapacityDraft, type ResidentTransition, type CapacityState } from "./model.ts"
import { canonicalProjection, transition } from "./canonical.ts"
import { partitionId } from "./identities.ts"

export function acknowledgeStopRelease(draft: CapacityDraft, id: number): void {
  if (canonicalProjection(draft).charges.some((charge) => charge.id === id)) {
    throw new Error("canonical Stop release retained its charge")
  }
  draft.reservations.delete(id)
}
export function consumeEditPermit(
  draft: CapacityDraft,
  partition: string,
  event: Extract<ResidentTransition, { readonly kind: "consumePermit" }>
): ReturnType<typeof stepCanonical> {
  const result = transition(draft, event)
  if (result.rejection !== undefined) return result
  const consumed = result.outputs.find((command) => command.kind === "permitConsumed")
  const round = result.outputs.find((command) => command.kind === "roundStarted")
  const boundRound = canonicalProjection(draft).rounds.find(
    (item) => item.partition === event.partition && item.lifetime === event.lifetime
  )
  const roundId = round?.kind === "roundStarted" ? round.id : boundRound?.id
  if (consumed?.kind !== "permitConsumed" || roundId === undefined || boundRound?.id !== roundId) {
    throw new Error("canonical edit admission omitted its round")
  }
  draft.roundIds.set(partition, roundId)
  return result
}
export function roundId(draft: CapacityDraft, partition: string): number {
  const existing = draft.roundIds.get(partition)
  if (existing !== undefined) return existing
  const result = transition(draft, { kind: "openRound", partition: partitionId(draft, partition), lifetime: 1 })
  const command = result.outputs[0]
  if (result.rejection !== undefined || command?.kind !== "roundStarted")
    throw new Error("canonical round admission refused")
  draft.roundIds.set(partition, command.id)
  return command.id
}
export function currentRoundId(draft: CapacityState, partition: string): number | undefined {
  return draft.roundIds.get(partition)
}
export function retireRound(draft: CapacityDraft, partition: string, round: number): void {
  if (draft.roundIds.get(partition) !== round) return
  const result = transition(draft, {
    kind: "retirePartition",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round
  })
  if (result.rejection !== undefined || result.outputs.at(-1)?.kind !== "partitionRetired") {
    throw new Error("canonical round retirement refused")
  }
  const live = new Set(canonicalProjection(draft).charges.map((charge) => charge.id))
  for (const [id, reservation] of draft.reservations) {
    if (reservation.capability.partition === partition && !live.has(id)) draft.reservations.delete(id)
  }
  draft.roundIds.delete(partition)
}
