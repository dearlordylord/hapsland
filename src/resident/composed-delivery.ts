import { createHash } from "node:crypto";
import { monotonicNow, PRE_EDIT_ADMISSION_DEADLINE_MS } from "./hook-clock.ts";
import { canonicalValue } from "../direct-event/model.ts";

/** Shared round and source-free handoff state for every agent runtime. */
export const MAX_STOP_CONTINUATIONS = 4;
export const MAX_COMPOSED_ROUNDS = 64;
export const EDIT_PERMIT_EXPIRY_MS = 30_000;
export const BACKGROUND_WAITER_EXPIRY_MS = 20_000;

type Round = {
  readonly marker: string;
  readonly generation: number;
  readonly lastSeenAt: number;
  readonly stopCount: number;
  readonly closed: boolean;
  readonly closedAt?: number;
  readonly events: ReadonlySet<string>;
  readonly continuationDigest?: string;
};

export type DeliverySurface = "edit" | "background" | "stop";
type SubmissionBatch = {
  readonly surface: DeliverySurface;
  readonly at: number;
  readonly fingerprints: ReadonlySet<string>;
  status: "uncertain" | "submitted";
};
type Submission = {
  readonly partition: string;
  readonly generation: number;
  readonly batches: Map<string, SubmissionBatch>;
};

const fingerprint = (finding: unknown): string =>
  createHash("sha256").update(canonicalValue(finding)).digest("hex");

export class ComposedDelivery {
  readonly #rounds = new Map<string, Round>();
  readonly #permits = new Map<string, { readonly partition: string; readonly generation: number; readonly expiresAt: number }>();
  readonly #stops = new Map<string, { token: string; generation: number; barrier: boolean }>();
  readonly #submissions = new Map<string, Submission>();
  readonly #backgroundWaiters = new Map<string, { readonly token: string; readonly at: number }>();

  claimBackground(partition: string, token: string, now: number): boolean {
    this.expire(now);
    if (!this.isActive(partition) || this.#backgroundWaiters.has(partition) || this.#backgroundWaiters.size >= MAX_COMPOSED_ROUNDS) return false;
    this.#backgroundWaiters.set(partition, { token, at: now });
    return true;
  }

  releaseBackground(partition: string, token: string): void {
    if (this.#backgroundWaiters.get(partition)?.token === token) this.#backgroundWaiters.delete(partition);
  }

  advance(partition: string, marker: string, now: number, promptDigest?: string): boolean {
    this.expire(now);
    const previous = this.#rounds.get(partition);
    // Neither a prompt nor a native runtime turn resets an active round.
    if (previous !== undefined) return !previous.closed;
    if (this.#rounds.size >= MAX_COMPOSED_ROUNDS) return false;
    this.#rounds.set(partition, { marker, generation: 1, lastSeenAt: now,
      stopCount: 0, closed: false, events: new Set() });
    return true;
  }

  ensureFromHostTurn(partition: string, marker: string, now: number): boolean {
    return this.advance(partition, marker, now);
  }

  /** The installed synchronous PreToolUse hook grants one prospective edit. */
  registerEdit(partition: string, eventId: string, startedAt: number, now = monotonicNow()): boolean {
    this.expirePermits(now);
    if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > now ||
        now - startedAt >= PRE_EDIT_ADMISSION_DEADLINE_MS || this.#permits.size >= 1024) return false;
    let round = this.#rounds.get(partition);
    if (round === undefined) {
      if (!this.advance(partition, fingerprint(eventId), now)) return false;
      round = this.#rounds.get(partition)!;
    }
    const event = fingerprint(eventId);
    if (round.events.has(event) || round.events.size >= 4096) return false;
    // A hook that began before closure cannot reopen by arriving late. The
    // 1ms margin rejects uncertain clock sampling at the boundary.
    if (round.closed && (round.closedAt === undefined || startedAt <= round.closedAt + 1)) return false;
    this.#rounds.set(partition, { ...round, events: new Set([...round.events, event]) });
    this.#permits.set(`${partition}\0${event}`, { partition, generation: round.generation + (round.closed ? 1 : 0), expiresAt: startedAt + EDIT_PERMIT_EXPIRY_MS });
    return true;
  }

  admitEdit(partition: string, eventId: string, now: number, requirePermit = false): number | undefined {
    let previous = this.#rounds.get(partition);
    const event = fingerprint(eventId);
    const key = `${partition}\0${event}`;
    if (requirePermit) {
      this.expirePermits(now);
      const permit = this.#permits.get(key);
      this.#permits.delete(key);
      if (previous === undefined || permit === undefined) return undefined;
      if (previous.closed) {
        if (permit.generation !== previous.generation + 1) return undefined;
        this.#rounds.set(partition, { marker: event, generation: permit.generation,
          lastSeenAt: now, stopCount: 0, closed: false, events: previous.events });
      } else if (permit.generation !== previous.generation) return undefined;
      return this.generation(partition);
    }
    // Internal deterministic fixtures and the non-installed API may start a
    // first round; reopening always requires the runtime's prospective permit.
    if (previous === undefined) {
      if (!this.advance(partition, event, now)) return undefined;
      previous = this.#rounds.get(partition)!;
    }
    if (previous.closed || previous.events.has(event) || previous.events.size >= 4096) return undefined;
    this.#rounds.set(partition, { ...previous, events: new Set([...previous.events, event]) });
    return previous.generation;
  }

  expirePermits(now = monotonicNow()): void {
    for (const [key, permit] of this.#permits) if (permit.expiresAt <= now) this.#permits.delete(key);
  }

  hasPendingEdits(partition: string): boolean {
    this.expirePermits();
    return [...this.#permits.values()].some((permit) => permit.partition === partition);
  }

  isActive(partition: string, generation = this.generation(partition)): boolean {
    const round = this.#rounds.get(partition);
    return round !== undefined && !round.closed && round.generation === generation;
  }

  beginStop(partition: string, token: string): boolean {
    if (!this.isActive(partition) || this.#stops.has(partition)) return false;
    this.#stops.set(partition, { token, generation: this.generation(partition), barrier: false });
    return true;
  }

  finishStop(partition: string, token: string, close: boolean, closedAt = monotonicNow()): number | undefined {
    const stop = this.#stops.get(partition);
    if (stop?.token !== token) return undefined;
    this.#stops.delete(partition);
    if (!close) return undefined;
    const round = this.#rounds.get(partition);
    if (round === undefined || round.generation !== stop.generation) return undefined;
    // Publish the fence synchronously before the caller starts resource cleanup.
    this.#rounds.set(partition, { ...round, closed: true, closedAt });
    for (const [key, permit] of this.#permits) if (permit.partition === partition) this.#permits.delete(key);
    this.#backgroundWaiters.delete(partition);
    for (const [id, submission] of this.#submissions) {
      if (submission.partition === partition) this.#submissions.delete(id);
    }
    return round.generation;
  }

  closureCounts(partition: string): { reservedContinuations: number; submitted: number; uncertain: number; editPermits: number } {
    const batches = new Map<string, SubmissionBatch["status"]>();
    for (const submission of this.#submissions.values()) if (submission.partition === partition) {
      for (const [token, batch] of submission.batches) batches.set(token, batch.status);
    }
    return { reservedContinuations: this.#rounds.get(partition)?.stopCount ?? 0,
      submitted: [...batches.values()].filter((status) => status === "submitted").length,
      uncertain: [...batches.values()].filter((status) => status === "uncertain").length,
      editPermits: [...this.#permits.values()].filter((permit) => permit.partition === partition).length };
  }

  expireStop(partition: string, token: string): number | undefined {
    const stop = this.#stops.get(partition);
    if (stop?.token !== token) return undefined;
    // A reserved output may have reached the runtime. Preserve its count and
    // round; otherwise the abandoned allow attempt closes with no fresh proof.
    return this.finishStop(partition, token, !stop.barrier);
  }

  canSubmit(partition: string, surface: DeliverySurface): boolean {
    return this.isActive(partition) && (surface !== "background" || !this.#stops.get(partition)?.barrier);
  }

  generation(partition: string): number {
    return this.#rounds.get(partition)?.generation ?? 0;
  }

  /** Reserve one request from the active virtual round's continuation budget. */
  consumeStop(partition: string, continuationDigest?: string): boolean {
    const chain = this.#rounds.get(partition);
    if (chain === undefined || chain.closed || chain.stopCount >= MAX_STOP_CONTINUATIONS) return false;
    const stop = this.#stops.get(partition);
    if (stop !== undefined) stop.barrier = true;
    this.#rounds.set(partition, { ...chain, stopCount: chain.stopCount + 1,
      ...(continuationDigest === undefined ? {} : { continuationDigest }) });
    return true;
  }

  hasVirtualRoundContinuationBudget(partition: string): boolean {
    const chain = this.#rounds.get(partition);
    return chain !== undefined && !chain.closed && chain.stopCount < MAX_STOP_CONTINUATIONS;
  }

  /** Reserve before writing; a crash or lost acknowledgement remains uncertain. */
  beginSubmission(
    adviceId: string,
    partition: string,
    token: string,
    findings: ReadonlyArray<unknown>,
    surface: DeliverySurface,
    now: number,
  ): void {
    const generation = this.generation(partition);
    const existing = this.#submissions.get(adviceId);
    const batches = existing?.partition === partition && existing.generation === generation
      ? existing.batches : new Map<string, SubmissionBatch>();
    batches.set(token, {
      surface, at: now,
      fingerprints: new Set(findings.map(fingerprint)),
      status: "uncertain",
    });
    this.#submissions.set(adviceId, { partition, generation, batches });
  }

  markSubmitted(token: string): void {
    for (const submission of this.#submissions.values()) {
      const batch = submission.batches.get(token);
      if (batch !== undefined) batch.status = "submitted";
    }
  }

  release(token: string): void {
    for (const [adviceId, submission] of this.#submissions) {
      submission.batches.delete(token);
      if (submission.batches.size === 0) this.#submissions.delete(adviceId);
    }
  }

  forget(adviceId: string): void {
    this.#submissions.delete(adviceId);
  }

  suppresses(adviceId: string, partition: string, finding: unknown, surface?: DeliverySurface): boolean {
    const submission = this.#submissions.get(adviceId);
    if (submission === undefined || submission.partition !== partition ||
        submission.generation !== this.generation(partition)) return false;
    const digest = fingerprint(finding);
    return [...submission.batches.values()].some((batch) =>
      batch.fingerprints.has(digest) && (surface !== "stop" || batch.surface !== "background"));
  }

  backgroundOwns(adviceId: string, token: string): boolean {
    return this.#submissions.get(adviceId)?.batches.get(token)?.surface === "background";
  }

  hasToken(token: string): boolean {
    return [...this.#submissions.values()].some((submission) => submission.batches.has(token));
  }

  expire(now: number): void {
    for (const [partition, waiter] of this.#backgroundWaiters) {
      if (now - waiter.at >= BACKGROUND_WAITER_EXPIRY_MS) this.#backgroundWaiters.delete(partition);
    }
    // Round fences and continuation counts never expire in a resident lifetime.
  }
}
