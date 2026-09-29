import { canonicalValue, type PreparedUnit } from "../direct-event/model.ts";
import type { EvaluatedUnit } from "../direct-event/pipeline.ts";
import type { CapacityLedger, CapacityReservation } from "./capacity.ts";

export const SUCCESS_CACHE_ENTRY_LIMIT = 8;
export const SUCCESS_CACHE_BYTE_LIMIT = 128 * 1024;

/**
 * Identity for one logical evaluation. Advicee/root isolation comes from the
 * partition; event ids, source snapshots, and scheduler bookkeeping are absent.
 */
export const residentEvaluationIdentity = (
  partition: string,
  prepared: PreparedUnit,
): string => canonicalValue({ partition, input: prepared.identity });

export type CachedEvaluation = {
  readonly evaluation: EvaluatedUnit;
  readonly logicalBytes: number;
};

type CacheEntry = CachedEvaluation & {
  readonly key: string;
  readonly reservation: CapacityReservation;
};

type EvaluationReuseOptions = {
  readonly ledger: CapacityLedger;
  readonly logicalBytes: (value: unknown) => number;
};

/** Native payloads and request handles follow canonical claim and LRU state. */
export class EvaluationReuse<Pending = never> {
  readonly #pending = new Map<string, Pending | undefined>();
  readonly #cache = new Map<string, CacheEntry>();
  readonly #keyIds = new Map<string, number>();
  readonly #idKeys = new Map<number, string>();
  readonly #options: EvaluationReuseOptions;
  #nextId = 1;
  #cacheBytes = 0;

  constructor(options: EvaluationReuseOptions) {
    this.#options = options;
  }

  key(partition: string, prepared: PreparedUnit): string {
    return residentEvaluationIdentity(partition, prepared);
  }

  #id(key: string): number {
    const existing = this.#keyIds.get(key);
    if (existing !== undefined) return existing;
    const id = this.#nextId++;
    if (!Number.isSafeInteger(id)) throw new Error("canonical evaluation identity exhausted");
    this.#keyIds.set(key, id);
    this.#idKeys.set(id, key);
    return id;
  }

  #forgetUnused(key: string): void {
    if (this.#pending.has(key) || this.#cache.has(key)) return;
    const id = this.#keyIds.get(key);
    if (id === undefined) return;
    this.#keyIds.delete(key);
    this.#idKeys.delete(id);
  }

  route(key: string, liveAdvice: boolean): "joinedAdvice" | "joinedPending" | "joinedClaimed" | "cached" | "owner" {
    const command = this.#options.ledger.transition({ kind: "reuseRoute", id: this.#id(key),
      liveAdvice }).commands[0]?.kind;
    switch (command) {
      case "reuseJoinAdvice":
        this.#forgetUnused(key);
        return "joinedAdvice";
      case "reuseJoinPending":
        if (this.#pending.get(key) === undefined) throw new Error("canonical pending evaluation lacks native owner");
        return "joinedPending";
      case "reuseJoinClaimed":
        if (!this.#pending.has(key)) throw new Error("canonical evaluation claim lacks native owner");
        return "joinedClaimed";
      case "reuseCached": {
        const entry = this.#cache.get(key);
        if (entry === undefined) throw new Error("canonical cached evaluation lacks native payload");
        this.#cache.delete(key);
        this.#cache.set(key, entry);
        return "cached";
      }
      case "reuseOwn":
        if (this.#pending.has(key)) throw new Error("canonical evaluation owner already native");
        this.#pending.set(key, undefined);
        return "owner";
      default: throw new Error("canonical evaluation route refused");
    }
  }

  claim(key: string): boolean {
    const command = this.#options.ledger.transition({ kind: "reuseClaim", id: this.#id(key) }).commands[0]?.kind;
    if (command === "reuseClaimed") {
      if (this.#pending.has(key)) throw new Error("duplicate native evaluation claim");
      this.#pending.set(key, undefined);
      return true;
    }
    if (command === "reuseRefused") return false;
    throw new Error("canonical evaluation claim refused");
  }

  attachPending(key: string, pending: Pending): boolean {
    const id = this.#keyIds.get(key);
    if (id === undefined) return false;
    const command = this.#options.ledger.transition({ kind: "reuseAttach", id }).commands[0]?.kind;
    if (command === "reuseAttached") {
      if (!this.#pending.has(key)) throw new Error("canonical attached evaluation lacks native claim");
      this.#pending.set(key, pending);
      return true;
    }
    if (command === "reuseRefused") return false;
    throw new Error("canonical evaluation attachment refused");
  }

  pending(key: string): Pending | undefined {
    return this.#pending.get(key);
  }

  releaseClaim(key: string): void {
    const id = this.#keyIds.get(key);
    if (id === undefined) return;
    if (this.#options.ledger.transition({ kind: "reuseRelease", id }).commands[0]?.kind !== "reuseReleased") {
      throw new Error("canonical evaluation release refused");
    }
    this.#pending.delete(key);
    this.#forgetUnused(key);
  }

  hasPending(key: string): boolean {
    return this.#pending.has(key);
  }

  get(key: string): CachedEvaluation | undefined {
    const id = this.#keyIds.get(key);
    if (id === undefined) return undefined;
    const command = this.#options.ledger.transition({ kind: "reuseTouch", id }).commands[0]?.kind;
    if (command === "reuseOwn") return undefined;
    if (command !== "reuseCached") throw new Error("canonical cache lookup refused");
    const entry = this.#cache.get(key);
    if (entry === undefined) throw new Error("canonical cached evaluation lacks native payload");
    this.#cache.delete(key);
    this.#cache.set(key, entry);
    return { evaluation: entry.evaluation, logicalBytes: entry.logicalBytes };
  }

  cached(key: string): CachedEvaluation {
    const entry = this.#cache.get(key);
    if (entry === undefined) throw new Error("canonical cached evaluation lacks native payload");
    return { evaluation: entry.evaluation, logicalBytes: entry.logicalBytes };
  }

  put(partition: string, key: string, evaluation: EvaluatedUnit): boolean {
    const id = this.#id(key);
    const logicalBytes = this.#options.logicalBytes({ key, evaluation });
    const plan = this.#options.ledger.transition({ kind: "cachePrepare", id, bytes: logicalBytes,
      entryLimit: SUCCESS_CACHE_ENTRY_LIMIT, byteLimit: SUCCESS_CACHE_BYTE_LIMIT }).commands[0];
    if (plan?.kind === "cacheAlready") {
      if (!this.#cache.has(key)) throw new Error("canonical cached evaluation lacks native payload");
      return true;
    }
    if (plan?.kind === "cacheRejected") { this.#forgetUnused(key); return false; }
    if (plan?.kind !== "cachePrepared") throw new Error("canonical cache admission refused");
    for (const evicted of plan.evicted) this.#removeCachedId(evicted);
    const reservation = this.#options.ledger.reserve(partition, logicalBytes, "storedResult");
    if (reservation === undefined) { this.#forgetUnused(key); return false; }
    const command = this.#options.ledger.transition({ kind: "cacheCommit", id,
      partition: this.#options.ledger.partitionId(partition), bytes: logicalBytes,
      reservation: reservation.id,
      entryLimit: SUCCESS_CACHE_ENTRY_LIMIT, byteLimit: SUCCESS_CACHE_BYTE_LIMIT }).commands[0]?.kind;
    if (command !== "cacheCommitted") {
      this.#options.ledger.release(reservation);
      throw new Error("canonical cache commit refused");
    }
    this.#cache.set(key, { key, evaluation, logicalBytes, reservation });
    this.#cacheBytes += logicalBytes;
    return true;
  }

  snapshot(): { readonly entries: number; readonly bytes: number; readonly pending: number } {
    const canonical = this.#options.ledger.canonicalProjection().reuse;
    const bytes = canonical.cache.reduce((sum, entry) => sum + entry.bytes, 0);
    if (canonical.cache.length !== this.#cache.size || bytes !== this.#cacheBytes ||
        canonical.claims.length !== this.#pending.size) {
      throw new Error("native evaluation handles differ from canonical state");
    }
    return { entries: canonical.cache.length, bytes, pending: canonical.claims.length };
  }

  discardPartition(partition: string): void {
    const command = this.#options.ledger.transition({ kind: "cacheDiscardPartition",
      partition: this.#options.ledger.partitionId(partition) }).commands[0];
    if (command?.kind !== "cacheDiscarded") throw new Error("canonical cache expiry refused");
    for (const id of command.ids) this.#removeCachedId(id);
  }

  clear(): void {
    const command = this.#options.ledger.transition({ kind: "cacheClear" }).commands[0];
    if (command?.kind !== "cacheDiscarded") throw new Error("canonical cache clear refused");
    for (const id of command.ids) this.#removeCachedId(id);
    this.#pending.clear();
    this.#keyIds.clear();
    this.#idKeys.clear();
  }

  #removeCachedId(id: number): void {
    const key = this.#idKeys.get(id);
    if (key === undefined) throw new Error("canonical cache eviction lacks native identity");
    const entry = this.#cache.get(key);
    if (entry === undefined) throw new Error("canonical cache eviction lacks native payload");
    this.#cache.delete(key);
    this.#cacheBytes -= entry.logicalBytes;
    this.#options.ledger.release(entry.reservation);
    this.#forgetUnused(key);
  }
}
