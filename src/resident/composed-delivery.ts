import { createHash } from "node:crypto";
import { canonicalValue } from "../direct-event/model.ts";

/** Shared turn-chain and source-free handoff state for every agent host. */
export const MAX_COMPOSED_CHAINS = 64;
export const COMPOSED_CHAIN_EXPIRY_MS = 10 * 60_000;
export const BACKGROUND_WAITER_EXPIRY_MS = 20_000;

type Chain = {
  readonly marker: string;
  readonly generation: number;
  readonly lastSeenAt: number;
  readonly stopUsed: boolean;
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
  readonly #chains = new Map<string, Chain>();
  readonly #submissions = new Map<string, Submission>();
  readonly #backgroundWaiters = new Map<string, { readonly token: string; readonly at: number }>();

  claimBackground(partition: string, token: string, now: number): boolean {
    this.expire(now);
    if (this.#backgroundWaiters.has(partition) || this.#backgroundWaiters.size >= MAX_COMPOSED_CHAINS) return false;
    this.#backgroundWaiters.set(partition, { token, at: now });
    return true;
  }

  releaseBackground(partition: string, token: string): void {
    if (this.#backgroundWaiters.get(partition)?.token === token) this.#backgroundWaiters.delete(partition);
  }

  advance(partition: string, marker: string, now: number, promptDigest?: string): boolean {
    this.expire(now);
    const previous = this.#chains.get(partition);
    if (previous?.marker === marker) return true;
    if (promptDigest !== undefined && previous?.continuationDigest === promptDigest) return true;
    if (previous === undefined && this.#chains.size >= MAX_COMPOSED_CHAINS) return false;
    this.#chains.set(partition, {
      marker,
      generation: (previous?.generation ?? 0) + 1,
      lastSeenAt: now,
      stopUsed: false,
    });
    return true;
  }

  ensureFromHostTurn(partition: string, marker: string, now: number): boolean {
    this.expire(now);
    return this.#chains.has(partition) || this.advance(partition, marker, now);
  }

  generation(partition: string): number {
    return this.#chains.get(partition)?.generation ?? 0;
  }

  /** An unknown turn chain must never authorize a Stop continuation. */
  consumeStop(partition: string, continuationDigest?: string): boolean {
    const chain = this.#chains.get(partition);
    if (chain === undefined || chain.stopUsed) return false;
    this.#chains.set(partition, { ...chain, stopUsed: true,
      ...(continuationDigest === undefined ? {} : { continuationDigest }) });
    return true;
  }

  hasStopAllowance(partition: string): boolean {
    const chain = this.#chains.get(partition);
    return chain !== undefined && !chain.stopUsed;
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

  suppresses(adviceId: string, partition: string, finding: unknown): boolean {
    const submission = this.#submissions.get(adviceId);
    if (submission === undefined || submission.partition !== partition ||
        submission.generation !== this.generation(partition)) return false;
    const digest = fingerprint(finding);
    return [...submission.batches.values()].some((batch) => batch.fingerprints.has(digest));
  }

  hasToken(token: string): boolean {
    return [...this.#submissions.values()].some((submission) => submission.batches.has(token));
  }

  expire(now: number): void {
    for (const [partition, waiter] of this.#backgroundWaiters) {
      if (now - waiter.at >= BACKGROUND_WAITER_EXPIRY_MS) this.#backgroundWaiters.delete(partition);
    }
    for (const [partition, chain] of this.#chains) {
      if (now - chain.lastSeenAt >= COMPOSED_CHAIN_EXPIRY_MS) this.#chains.delete(partition);
    }
    for (const [adviceId, submission] of this.#submissions) {
      for (const [token, batch] of submission.batches) {
        if (now - batch.at >= COMPOSED_CHAIN_EXPIRY_MS) submission.batches.delete(token);
      }
      if (submission.batches.size === 0) this.#submissions.delete(adviceId);
    }
  }
}
