import type { projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import {
  type CapacityDraft,
  MAX_PARTITION_KEY_BYTES,
  MAX_PARTITION_IDENTITIES,
  MAX_PARTITION_IDENTITY_BYTES,
  type CapacityState,
  MAX_COLLECTION_TOKEN_KEY_BYTES,
  MAX_COLLECTION_TOKEN_IDENTITIES
} from "./model.ts"
import { canonicalProjection, transition } from "./canonical.ts"

export function partitionId(draft: CapacityDraft, partition: string): number {
  let id = draft.partitionIds.get(partition)
  if (id === undefined) {
    const keyBytes = Buffer.byteLength(partition, "utf8")
    if (keyBytes > MAX_PARTITION_KEY_BYTES) {
      throw new RangeError("advicee identity exceeds resident metadata bound")
    }
    while (
      draft.partitionIds.size >= MAX_PARTITION_IDENTITIES ||
      draft.partitionIdentityBytes + keyBytes > MAX_PARTITION_IDENTITY_BYTES
    ) {
      if (!evictInactivePartition(draft)) {
        throw new RangeError("resident advicee identity capacity exhausted")
      }
    }
    id = draft.nextPartitionId++
    draft.partitionIds.set(partition, id)
    draft.partitionIdentityBytes += keyBytes
  }
  return id
}
export function knownPartitionId(draft: CapacityState, partition: string): number | undefined {
  return draft.partitionIds.get(partition)
}
export function minimumFreshStart(draft: CapacityState): number {
  return draft.minimumFreshStart
}
export function partitionIdentityCount(draft: CapacityState): number {
  return draft.partitionIds.size
}
export function partitionIdentityBytes(draft: CapacityState): number {
  return draft.partitionIdentityBytes
}
function nativePartitionInUse(draft: CapacityDraft, partition: string): boolean {
  return (
    draft.roundIds.has(partition) ||
    [...draft.reservations.values()].some((item) => item.capability.partition === partition) ||
    [...draft.requestRounds.values()].some((item) => item.partition === partition)
  )
}
function canonicalPartitionInUse(state: ReturnType<typeof projectCanonical>, id: number): boolean {
  const partitions = [
    state.partitions,
    state.rounds,
    state.work,
    state.charges,
    state.dispatch.queued,
    state.dispatch.running,
    state.dispatch.requests,
    state.reuse.cache
  ]
  if (partitions.some((entries) => entries.some((item) => item.partition === id))) return true
  const groups = [
    state.delivery.slots,
    state.delivery.counters,
    state.delivery.submissions.batches,
    state.collection.claims
  ]
  if (groups.some((entries) => entries.some((item) => item.group === id))) return true
  return state.notices.some((item) => item.partition === id || item.group === id)
}
function admissionInUse(state: ReturnType<typeof projectCanonical>, id: number): boolean {
  const admission = state.admissions.find((item) => item.partition === id)
  return Boolean(admission?.active || (admission?.permits.length ?? 0) > 0)
}
export function discardUnusedPartition(draft: CapacityDraft, partition: string): void {
  const id = draft.partitionIds.get(partition)
  if (id === undefined || nativePartitionInUse(draft, partition)) return
  const state = canonicalProjection(draft)
  if (canonicalPartitionInUse(state, id) || admissionInUse(state, id)) return
  const forgotten = transition(draft, { kind: "forgetAdmission", partition: id, lifetime: 1 })
  if (forgotten.rejection !== undefined || forgotten.outputs[0]?.kind !== "admissionForgotten") return
  draft.partitionIds.delete(partition)
  draft.partitionIdentityBytes -= Buffer.byteLength(partition, "utf8")
}
function evictInactivePartition(draft: CapacityDraft): boolean {
  for (const partition of draft.partitionIds.keys()) {
    const before = draft.partitionIds.size
    discardUnusedPartition(draft, partition)
    if (draft.partitionIds.size < before) {
      draft.minimumFreshStart = Math.max(draft.minimumFreshStart, Math.ceil(monotonicNow() * 1000))
      return true
    }
  }
  return false
}
export function collectionTokenId(draft: CapacityDraft, token: string): number {
  let id = draft.collectionTokens.get(token)
  if (id === undefined) {
    if (
      Buffer.byteLength(token, "utf8") > MAX_COLLECTION_TOKEN_KEY_BYTES ||
      draft.collectionTokens.size >= MAX_COLLECTION_TOKEN_IDENTITIES
    ) {
      throw new RangeError("resident collection token capacity exhausted")
    }
    id = draft.nextCollectionToken++
    draft.collectionTokens.set(token, id)
  }
  return id
}
export function collectionTokenIdentityCount(draft: CapacityState): number {
  return draft.collectionTokens.size
}
export function pruneCollectionTokenIds(draft: CapacityDraft, nativeLive: ReadonlySet<string>): void {
  const state = canonicalProjection(draft)
  const canonicalLive = new Set<number>([
    ...state.collection.leases.map((item) => item.owner),
    ...state.collection.claims.map((item) => item.owner),
    ...state.delivery.slots.map((item) => item.token),
    ...state.delivery.submissions.batches.map((item) => item.token)
  ])
  for (const [key, id] of draft.collectionTokens) {
    if (!nativeLive.has(key) && !canonicalLive.has(id)) draft.collectionTokens.delete(key)
  }
}

export function dispatchIdentity(
  draft: CapacityDraft,
  partition: string,
  round: number
): { readonly partition: number; readonly round: number } {
  return { partition: partitionId(draft, partition), round }
}
