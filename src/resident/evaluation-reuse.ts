import { canonicalValue, type PreparedUnit } from "../direct-event/model.ts";
import type { EvaluatedUnit } from "../direct-event/pipeline.ts";
import type { CapacityReservation } from "./capacity.ts";
import { bendCacheAdmit, bendCacheEvict } from "./bend-policy.generated.js";

export const SUCCESS_CACHE_ENTRY_LIMIT = 8;
export const SUCCESS_CACHE_BYTE_LIMIT = 128 * 1024;

/**
 * Identity for one logical evaluation. Advicee/root isolation comes from the
 * partition; event ids, source snapshots, and scheduler bookkeeping are absent.
 */
export const residentEvaluationIdentity = (
  partition: string,
  prepared: PreparedUnit,
): string => canonicalValue({ partition, input: prepared.input });

export type CachedEvaluation = {
  readonly evaluation: EvaluatedUnit;
  readonly logicalBytes: number;
};

type CacheEntry = CachedEvaluation & {
  readonly key: string;
  readonly reservation: CapacityReservation;
};

type EvaluationReuseOptions = {
  readonly reserve: (partition: string, bytes: number) => CapacityReservation | undefined;
  readonly release: (reservation: CapacityReservation) => void;
  readonly logicalBytes: (value: unknown) => number;
};

/** Pending ownership is intentionally independent from successful-cache LRU. */
export class EvaluationReuse<Pending = never> {
  readonly #pending = new Map<string, Pending | undefined>();
  readonly #cache = new Map<string, CacheEntry>();
  readonly #options: EvaluationReuseOptions;
  #cacheBytes = 0;

  constructor(options: EvaluationReuseOptions) {
    this.#options = options;
  }

  key(partition: string, prepared: PreparedUnit): string {
    return residentEvaluationIdentity(partition, prepared);
  }

  claim(key: string): boolean {
    if (this.#pending.has(key)) return false;
    this.#pending.set(key, undefined);
    return true;
  }

  attachPending(key: string, pending: Pending): boolean {
    if (!this.#pending.has(key)) return false;
    this.#pending.set(key, pending);
    return true;
  }

  pending(key: string): Pending | undefined {
    return this.#pending.get(key);
  }

  releaseClaim(key: string): void {
    this.#pending.delete(key);
  }

  hasPending(key: string): boolean {
    return this.#pending.has(key);
  }

  get(key: string): CachedEvaluation | undefined {
    const retained = this.#cache.get(key);
    if (retained === undefined) return undefined;
    this.#cache.delete(key);
    this.#cache.set(key, retained);
    return { evaluation: retained.evaluation, logicalBytes: retained.logicalBytes };
  }

  put(partition: string, key: string, evaluation: EvaluatedUnit): boolean {
    if (this.#cache.has(key)) return bendCacheAdmit(true, 0, SUCCESS_CACHE_BYTE_LIMIT).$ === "Already";
    const logicalBytes = this.#options.logicalBytes({ key, evaluation });
    if (bendCacheAdmit(false, logicalBytes, SUCCESS_CACHE_BYTE_LIMIT).$ !== "Add") return false;
    while (bendCacheEvict(this.#cache.size, this.#cacheBytes, logicalBytes,
      SUCCESS_CACHE_ENTRY_LIMIT, SUCCESS_CACHE_BYTE_LIMIT)) this.#evictOldest();
    const reservation = this.#options.reserve(partition, logicalBytes);
    if (reservation === undefined) return false;
    this.#cache.set(key, { key, evaluation, logicalBytes, reservation });
    this.#cacheBytes += logicalBytes;
    return true;
  }

  snapshot(): { readonly entries: number; readonly bytes: number; readonly pending: number } {
    return { entries: this.#cache.size, bytes: this.#cacheBytes, pending: this.#pending.size };
  }

  discardPartition(partition: string): void {
    for (const [key, entry] of this.#cache) {
      if (entry.reservation.partition !== partition) continue;
      this.#cache.delete(key);
      this.#cacheBytes -= entry.logicalBytes;
      this.#options.release(entry.reservation);
    }
  }

  clear(): void {
    this.#pending.clear();
    for (const entry of this.#cache.values()) this.#options.release(entry.reservation);
    this.#cache.clear();
    this.#cacheBytes = 0;
  }

  #evictOldest(): void {
    const next = this.#cache.values().next();
    if (next.done) return;
    const oldest = next.value;
    this.#cache.delete(oldest.key);
    this.#cacheBytes -= oldest.logicalBytes;
    this.#options.release(oldest.reservation);
  }
}
