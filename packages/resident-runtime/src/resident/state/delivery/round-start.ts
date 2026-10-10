import type { CapacityLedger } from "../capacity/operations.ts"
import { type DeliveryDraft, type Round } from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliveryRoundStart = (
  state: DeliveryDraft,
  canonicalOwner: Pick<CapacityLedger, "knownPartitionId" | "canonicalProjection">,
  { expire, isActive }: Pick<DeliveryPorts, "expire" | "isActive">
) => {
  function advance(partition: string, marker: string, now: number, _promptDigest?: string): boolean {
    expire(now)
    const previous = state.rounds.get(partition)
    // Neither a prompt nor a native runtime turn resets an active round.
    if (previous !== undefined) return isActive(partition)
    const known = canonicalOwner.knownPartitionId(partition)
    if (
      known !== undefined &&
      canonicalOwner
        .canonicalProjection()
        .admissions.some((item) => item.partition === known && item.round > 0 && !item.active)
    )
      return false
    // A notification without an admitted edit carries no round authority.
    return true
  }

  function startRound(partition: string, quietMs: number): Round {
    const round: Round = { quietMs }
    state.rounds.set(partition, round)
    return round
  }
  return { advance, startRound }
}
