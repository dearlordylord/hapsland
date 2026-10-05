import { canonicalValue, type PreparedUnit } from "../direct-event/model.ts"
import type { EvaluatedUnit } from "../direct-event/pipeline.ts"
import type { CapacityLedger, CapacityReservation } from "./capacity.ts"

export const SUCCESS_CACHE_ENTRY_LIMIT = 8
export const SUCCESS_CACHE_BYTE_LIMIT = 128 * 1024

/**
 * Identity for one logical evaluation. Advicee/root isolation comes from the
 * partition; event ids, source snapshots, and scheduler bookkeeping are absent.
 */
export const residentEvaluationIdentity = (partition: string, prepared: PreparedUnit): string =>
  canonicalValue({ partition, input: prepared.identity })

export type CachedEvaluation = { readonly evaluation: EvaluatedUnit; readonly logicalBytes: number }

type CacheEntry = CachedEvaluation & { readonly key: string; readonly reservation: CapacityReservation }

export type EvaluationReuseState<Pending> = {
  readonly pending: ReadonlyMap<string, Pending | undefined>
  readonly cache: ReadonlyMap<string, CacheEntry>
  readonly keyIds: ReadonlyMap<string, number>
  readonly idKeys: ReadonlyMap<number, string>
  readonly nextId: number
  readonly cacheBytes: number
}
export type EvaluationReuseDraft<Pending> = {
  -readonly [K in keyof EvaluationReuseState<Pending>]: EvaluationReuseState<Pending>[K] extends ReadonlyMap<
    infer Key,
    infer Value
  >
    ? Map<Key, Value>
    : EvaluationReuseState<Pending>[K]
}
export const initialEvaluationReuse = <Pending>(): EvaluationReuseState<Pending> => ({
  pending: new Map(),
  cache: new Map(),
  keyIds: new Map(),
  idKeys: new Map(),
  nextId: 1,
  cacheBytes: 0
})
export const draftEvaluationReuse = <Pending>(
  current: EvaluationReuseState<Pending>
): EvaluationReuseDraft<Pending> => ({
  ...current,
  pending: new Map(current.pending),
  cache: new Map(current.cache),
  keyIds: new Map(current.keyIds),
  idKeys: new Map(current.idKeys)
})

/** Read-only operations over the owned record; mutable registries stay private. */
export const evaluationReuseView = <Pending>(state: EvaluationReuseState<Pending>, ledger: CapacityLedger) => {
  function key(partition: string, prepared: PreparedUnit): string {
    return residentEvaluationIdentity(partition, prepared)
  }

  function pending(key: string): Pending | undefined {
    return state.pending.get(key)
  }

  function hasPending(key: string): boolean {
    return state.pending.has(key)
  }

  function cached(key: string): CachedEvaluation {
    const entry = state.cache.get(key)
    if (entry === undefined) throw new Error("canonical cached evaluation lacks native payload")
    return { evaluation: entry.evaluation, logicalBytes: entry.logicalBytes }
  }

  function snapshot(): { readonly entries: number; readonly bytes: number; readonly pending: number } {
    const canonical = ledger.canonicalProjection().reuse
    const bytes = canonical.cache.reduce((sum, entry) => sum + entry.bytes, 0)
    const ordered = [...state.cache.values()]
    if (
      canonical.cache.length !== state.cache.size ||
      bytes !== state.cacheBytes ||
      canonical.claims.length !== state.pending.size ||
      canonical.cache.some((entry, index) => {
        const native = ordered[index]
        return (
          native === undefined ||
          state.keyIds.get(native.key) !== entry.id ||
          native.reservation.id !== entry.reservation ||
          native.logicalBytes !== entry.bytes ||
          ledger.knownPartitionId(native.reservation.partition) !== entry.partition
        )
      }) ||
      canonical.claims.some((claim) => {
        const key = state.idKeys.get(claim.id)
        return key === undefined || !state.pending.has(key) || claim.attached !== (state.pending.get(key) !== undefined)
      }) ||
      state.keyIds.size !== state.idKeys.size ||
      [...state.keyIds].some(([key, id]) => state.idKeys.get(id) !== key)
    ) {
      throw new Error("native evaluation handles differ from canonical state")
    }
    return { entries: canonical.cache.length, bytes, pending: canonical.claims.length }
  }
  return { key, pending, hasPending, cached, snapshot }
}

/** Draft operations; the resident state owner commits these with capacity. */
export const evaluationReuseOperations = <Pending>(
  state: EvaluationReuseDraft<Pending>,
  ledger: CapacityLedger,
  measureLogicalBytes: (value: unknown) => number
) => {
  function reuseId(key: string): number {
    const existing = state.keyIds.get(key)
    if (existing !== undefined) return existing
    const id = state.nextId++
    if (!Number.isSafeInteger(id)) throw new Error("canonical evaluation identity exhausted")
    state.keyIds.set(key, id)
    state.idKeys.set(id, key)
    return id
  }

  function forgetUnused(key: string): void {
    if (state.pending.has(key) || state.cache.has(key)) return
    const id = state.keyIds.get(key)
    if (id === undefined) return
    state.keyIds.delete(key)
    state.idKeys.delete(id)
  }

  function joinedPending(key: string): "joinedPending" {
    if (state.pending.get(key) === undefined) throw new Error("canonical pending evaluation lacks native owner")
    return "joinedPending"
  }
  function joinedClaimed(key: string): "joinedClaimed" {
    if (!state.pending.has(key)) throw new Error("canonical evaluation claim lacks native owner")
    return "joinedClaimed"
  }
  function touchCached(key: string): CachedEvaluation {
    const entry = state.cache.get(key)
    if (entry === undefined) throw new Error("canonical cached evaluation lacks native payload")
    state.cache.delete(key)
    state.cache.set(key, entry)
    return { evaluation: entry.evaluation, logicalBytes: entry.logicalBytes }
  }
  function cachedRoute(key: string): "cached" {
    touchCached(key)
    return "cached"
  }
  function ownRoute(key: string): "owner" {
    if (state.pending.has(key)) throw new Error("canonical evaluation owner already native")
    state.pending.set(key, undefined)
    return "owner"
  }
  function adviceRoute(key: string): "joinedAdvice" {
    forgetUnused(key)
    return "joinedAdvice"
  }
  const reuseRoutes = {
    reuseJoinAdvice: adviceRoute,
    reuseJoinPending: joinedPending,
    reuseJoinClaimed: joinedClaimed,
    reuseCached: cachedRoute,
    reuseOwn: ownRoute
  }
  type ReuseRouteKind = keyof typeof reuseRoutes
  function knownReuseRoute(kind: string | undefined): kind is ReuseRouteKind {
    return kind !== undefined && Object.hasOwn(reuseRoutes, kind)
  }
  function route(
    key: string,
    liveAdvice: boolean
  ): "joinedAdvice" | "joinedPending" | "joinedClaimed" | "cached" | "owner" {
    const command = ledger.transition({ kind: "reuseRoute", id: reuseId(key), liveAdvice }).commands[0]?.kind
    if (!knownReuseRoute(command)) throw new Error("canonical evaluation route refused")
    return reuseRoutes[command](key)
  }

  function claim(key: string): boolean {
    const command = ledger.transition({ kind: "reuseClaim", id: reuseId(key) }).commands[0]?.kind
    if (command === "reuseClaimed") {
      if (state.pending.has(key)) throw new Error("duplicate native evaluation claim")
      state.pending.set(key, undefined)
      return true
    }
    if (command === "reuseRefused") return false
    throw new Error("canonical evaluation claim refused")
  }

  function attachPending(key: string, pending: Pending): boolean {
    const id = state.keyIds.get(key)
    if (id === undefined) return false
    const command = ledger.transition({ kind: "reuseAttach", id }).commands[0]?.kind
    if (command === "reuseAttached") {
      if (!state.pending.has(key)) throw new Error("canonical attached evaluation lacks native claim")
      state.pending.set(key, pending)
      return true
    }
    if (command === "reuseRefused") return false
    throw new Error("canonical evaluation attachment refused")
  }

  function releaseClaim(key: string): void {
    const id = state.keyIds.get(key)
    if (id === undefined) return
    if (ledger.transition({ kind: "reuseRelease", id }).commands[0]?.kind !== "reuseReleased") {
      throw new Error("canonical evaluation release refused")
    }
    state.pending.delete(key)
    forgetUnused(key)
  }

  function get(key: string): CachedEvaluation | undefined {
    const id = state.keyIds.get(key)
    if (id === undefined) return undefined
    const command = ledger.transition({ kind: "reuseTouch", id }).commands[0]?.kind
    if (command === "reuseOwn") return undefined
    if (command !== "reuseCached") throw new Error("canonical cache lookup refused")
    return touchCached(key)
  }

  function alreadyCached(key: string): true {
    if (!state.cache.has(key)) throw new Error("canonical cached evaluation lacks native payload")
    return true
  }
  function rejectedCache(key: string): false {
    forgetUnused(key)
    return false
  }
  function commitCache(partition: string, id: number, logicalBytes: number, reservation: CapacityReservation): void {
    const command = ledger.transition({
      kind: "cacheCommit",
      id,
      partition: ledger.partitionId(partition),
      bytes: logicalBytes,
      reservation: reservation.id,
      entryLimit: SUCCESS_CACHE_ENTRY_LIMIT,
      byteLimit: SUCCESS_CACHE_BYTE_LIMIT
    }).commands[0]?.kind
    if (command !== "cacheCommitted") {
      ledger.release(reservation)
      throw new Error("canonical cache commit refused")
    }
  }

  function put(partition: string, key: string, evaluation: EvaluatedUnit): boolean {
    const id = reuseId(key)
    const logicalBytes = measureLogicalBytes({ key, evaluation })
    const plan = ledger.transition({
      kind: "cachePrepare",
      id,
      bytes: logicalBytes,
      entryLimit: SUCCESS_CACHE_ENTRY_LIMIT,
      byteLimit: SUCCESS_CACHE_BYTE_LIMIT
    }).commands[0]
    if (plan?.kind === "cacheAlready") return alreadyCached(key)
    if (plan?.kind === "cacheRejected") return rejectedCache(key)
    if (plan?.kind !== "cachePrepared") throw new Error("canonical cache admission refused")
    for (const evicted of plan.evicted) removeCachedId(evicted)
    const reservation = ledger.reserve(partition, logicalBytes, "storedResult")
    if (reservation === undefined) {
      forgetUnused(key)
      return false
    }
    commitCache(partition, id, logicalBytes, reservation)
    state.cache.set(key, { key, evaluation, logicalBytes, reservation })
    state.cacheBytes += logicalBytes
    return true
  }

  function discardPartition(partition: string): void {
    const command = ledger.transition({ kind: "cacheDiscardPartition", partition: ledger.partitionId(partition) })
      .commands[0]
    if (command?.kind !== "cacheDiscarded") throw new Error("canonical cache expiry refused")
    for (const id of command.ids) removeCachedId(id)
  }

  function clear(): void {
    const command = ledger.transition({ kind: "cacheClear" }).commands[0]
    if (command?.kind !== "cacheDiscarded") throw new Error("canonical cache clear refused")
    for (const id of command.ids) removeCachedId(id)
    state.pending.clear()
    state.keyIds.clear()
    state.idKeys.clear()
  }

  function removeCachedId(id: number): void {
    const key = state.idKeys.get(id)
    if (key === undefined) throw new Error("canonical cache eviction lacks native identity")
    const entry = state.cache.get(key)
    if (entry === undefined) throw new Error("canonical cache eviction lacks native payload")
    state.cache.delete(key)
    state.cacheBytes -= entry.logicalBytes
    ledger.release(entry.reservation)
    forgetUnused(key)
  }

  return {
    ...evaluationReuseView(state, ledger),
    route,
    claim,
    attachPending,
    releaseClaim,
    get,
    put,
    discardPartition,
    clear
  }
}
export type EvaluationReuse<Pending = never> = ReturnType<typeof evaluationReuseOperations<Pending>>
