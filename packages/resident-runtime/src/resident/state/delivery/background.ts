import type { CapacityLedger } from "../capacity/operations.ts"
import { type DeliveryDraft, MAX_BACKGROUND_WAITERS } from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliveryBackground = (
  state: DeliveryDraft,
  canonicalOwner: Pick<CapacityLedger, "collectionTokenId" | "transition" | "partitionId">,
  { expire, isActive, markUncertain }: Pick<DeliveryPorts, "expire" | "isActive" | "markUncertain">
) => {
  function claimBackground(partition: string, token: string, now: number): boolean {
    expire(now)
    const id = canonicalOwner.collectionTokenId(token)
    const claimed = canonicalOwner.transition({
      kind: "collectionClaimBackground",
      group: canonicalOwner.partitionId(partition),
      token: id,
      active: isActive(partition),
      capacity: MAX_BACKGROUND_WAITERS
    })
    if (claimed.rejection !== undefined || claimed.outputs[0]?.kind !== "collectionBackgroundClaimed") return false
    state.backgroundWaiters.set(partition, { token, id, at: now })
    return true
  }

  function releaseBackground(partition: string, token: string): void {
    const waiter = state.backgroundWaiters.get(partition)
    if (waiter === undefined) return
    const release = canonicalOwner.transition({
      kind: "collectionReleaseBackground",
      group: canonicalOwner.partitionId(partition),
      token: canonicalOwner.collectionTokenId(token)
    })
    if (release.rejection !== undefined || release.outputs[0]?.kind !== "collectionBackgroundReleased") return
    state.backgroundWaiters.delete(partition)
    markBackgroundUncertain(partition)
  }

  function markBackgroundUncertain(partition: string): void {
    for (const submission of state.submissions.values()) {
      if (submission.partition !== partition) continue
      for (const [token, batch] of submission.batches)
        if (batch.surface === "background" && batch.status === "authorized") markUncertain(token)
    }
  }
  return { claimBackground, releaseBackground }
}
