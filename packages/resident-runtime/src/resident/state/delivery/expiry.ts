import type { CapacityLedger } from "../capacity/operations.ts"
import { DELIVERY_LEASE_MS } from "@hapsland/resident-transport/resident/protocol"
import { type DeliveryDraft, BACKGROUND_WAITER_EXPIRY_MS, type SubmissionBatch } from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliveryExpiry = (
  state: DeliveryDraft,
  canonicalOwner: Pick<CapacityLedger, "transition" | "partitionId">,
  { submissionAdviceId, markUncertain }: Pick<DeliveryPorts, "submissionAdviceId" | "markUncertain">
) => {
  function expireBackgroundWaiter(
    partition: string,
    waiter: { readonly id: number; readonly at: number },
    now: number
  ): void {
    const elapsed = Math.floor(Math.min(BACKGROUND_WAITER_EXPIRY_MS, Math.max(0, now - waiter.at)))
    const result = canonicalOwner.transition({
      kind: "collectionExpireBackground",
      group: canonicalOwner.partitionId(partition),
      token: waiter.id,
      elapsed,
      lifetime: BACKGROUND_WAITER_EXPIRY_MS
    })
    if (result.rejection !== undefined) throw new Error("canonical background expiry refused")
    if (result.outputs[0]?.kind === "collectionBackgroundReleased") state.backgroundWaiters.delete(partition)
    else if (result.outputs[0]?.kind !== "collectionBackgroundKept")
      throw new Error("invalid canonical background expiry")
  }

  function submissionExpired(adviceId: string, batch: SubmissionBatch, now: number): boolean {
    const elapsed = Math.floor(Math.min(DELIVERY_LEASE_MS, Math.max(0, now - batch.at)))
    const checked = canonicalOwner.transition({
      kind: "submissionExpiryCheck",
      advice: submissionAdviceId(adviceId),
      token: batch.id,
      elapsed,
      lifetime: DELIVERY_LEASE_MS
    })
    if (checked.rejection !== undefined) throw new Error("canonical submission expiry refused")
    return checked.outputs[0]?.kind === "submissionExpired"
  }

  function expire(now: number): void {
    for (const [partition, waiter] of state.backgroundWaiters) expireBackgroundWaiter(partition, waiter, now)
    const expired = new Set<string>()
    for (const [adviceId, submission] of state.submissions)
      for (const [token, batch] of submission.batches) if (submissionExpired(adviceId, batch, now)) expired.add(token)
    for (const token of expired) markUncertain(token)
    // Round fences and continuation counts never expire in a resident lifetime.
  }
  return { expire }
}
