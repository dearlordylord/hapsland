import { createHash } from "node:crypto";
import { monotonicNow, PRE_EDIT_ADMISSION_DEADLINE_MS } from "./hook-clock.ts";
import { canonicalValue } from "../direct-event/model.ts";
import { DELIVERY_LEASE_MS } from "./protocol.ts";
import {
  bendRoundActive, bendRoundBeginDecision, bendRoundBeginStop, bendRoundBudget,
  bendRoundConsume, bendRoundFinishStop, bendRoundInitial, bendRoundOwnsStop,
  bendRoundReopen, bendRoundReserveOutput, bendRoundMaxContinuations, type BendRound,
  bendLeaseInitial, bendLeaseReserve, bendLeaseAuthorize, bendLeaseTerminal,
  bendLeaseReoffer, bendLeaseSuppresses, type BendLease, type BendLeaseSurface,
  bendAdmissionInitial, bendAdmissionStep, bendAdmissionCloseProspective,
  type BendAdmissionState,
  bendBackgroundInitial, bendBackgroundClaim, bendBackgroundRelease,
  bendBackgroundExpire, type BendBackgroundWaiter,
} from "./bend-policy.generated.js";

/** Shared round and source-free handoff state for every agent runtime. */
export const MAX_STOP_CONTINUATIONS = Number(bendRoundMaxContinuations());
export const MAX_COMPOSED_ROUNDS = 64;
export const EDIT_PERMIT_EXPIRY_MS = 30_000;
export const BACKGROUND_WAITER_EXPIRY_MS = 20_000;

type Round = {
  readonly marker: string;
  readonly lastSeenAt: number;
  readonly policy: BendRound;
  readonly events: ReadonlySet<string>;
  readonly continuationDigest?: string;
};

export type DeliverySurface = "edit" | "background" | "stop";
type SubmissionBatch = {
  readonly id: number;
  readonly surface: DeliverySurface;
  readonly at: number;
  readonly fingerprints: ReadonlySet<string>;
  status: "reserved" | "authorized" | "uncertain" | "submitted";
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
  readonly #permits = new Map<string, { readonly partition: string; readonly generation: number;
    readonly expiresAt: number; readonly token: number; readonly tool: number }>();
  readonly #admissions = new Map<string, BendAdmissionState>();
  readonly #partitionIds = new Map<string, number>();
  readonly #toolIds = new Map<string, number>();
  #nextPartitionId = 1;
  #nextToolId = 1;
  readonly #stops = new Map<string, { token: string; id: number; generation: number; outputToken?: string }>();
  #nextStopId = 1;
  readonly #submissions = new Map<string, Submission>();
  readonly #submissionTokenIds = new Map<string, number>();
  #nextSubmissionTokenId = 1;
  readonly #finishPermits = new Map<string, {
    readonly partition: string; readonly generation: number; readonly attempt: string;
    authorized: boolean; revoked: boolean;
  }>();
  readonly #backgroundWaiters = new Map<string, { readonly token: string; readonly id: number; readonly at: number;
    readonly policy: BendBackgroundWaiter }>();
  #nextBackgroundId = 1;

  claimBackground(partition: string, token: string, now: number): boolean {
    this.expire(now);
    const existing = this.#backgroundWaiters.get(partition);
    const id = this.#nextBackgroundId++;
    const claim = bendBackgroundClaim(existing?.policy ?? bendBackgroundInitial(), id,
      this.isActive(partition),
      this.#backgroundWaiters.size, MAX_COMPOSED_ROUNDS);
    if (claim.$ !== "Granted") return false;
    this.#backgroundWaiters.set(partition, { token, id, at: now, policy: claim.state });
    return true;
  }

  releaseBackground(partition: string, token: string): void {
    const waiter = this.#backgroundWaiters.get(partition);
    if (waiter === undefined) return;
    const release = bendBackgroundRelease(waiter.policy, waiter.token === token ? waiter.id : 0);
    if (release.$ !== "Granted") return;
    this.#backgroundWaiters.delete(partition);
    for (const submission of this.#submissions.values()) {
      if (submission.partition !== partition) continue;
      for (const [outputToken, batch] of submission.batches) {
        if (batch.surface === "background" && batch.status === "authorized") {
          this.markUncertain(outputToken);
        }
      }
    }
  }

  advance(partition: string, marker: string, now: number, promptDigest?: string): boolean {
    this.expire(now);
    const previous = this.#rounds.get(partition);
    // Neither a prompt nor a native runtime turn resets an active round.
    if (previous !== undefined) return previous.policy.active;
    // A notification without an admitted edit carries no round authority.
    return true;
  }

  #startRound(partition: string, marker: string, now: number): Round | undefined {
    if (this.#rounds.size >= MAX_COMPOSED_ROUNDS) return undefined;
    const round: Round = { marker, lastSeenAt: now,
      policy: bendRoundInitial(), events: new Set() };
    this.#rounds.set(partition, round);
    return round;
  }

  #partitionId(partition: string): number {
    let id = this.#partitionIds.get(partition);
    if (id === undefined) {
      id = this.#nextPartitionId++;
      this.#partitionIds.set(partition, id);
    }
    return id;
  }

  #toolId(partition: string, event: string): number {
    const key = `${partition}\0${event}`;
    let id = this.#toolIds.get(key);
    if (id === undefined) {
      id = this.#nextToolId++;
      this.#toolIds.set(key, id);
    }
    return id;
  }

  #bendTime(ms: number): number {
    return Math.floor(ms * 1000);
  }

  #admissionFor(partition: string, round: Round | undefined): BendAdmissionState {
    const retained = this.#admissions.get(partition);
    if (retained !== undefined) return retained;
    const initial = bendAdmissionInitial(this.#partitionId(partition), 1);
    if (round === undefined) return initial;
    return { ...initial, round: round.policy.generation, active: round.policy.active,
      closed_at: round.policy.active ? initial.closed_at :
        BigInt(this.#bendTime(Number(round.policy.closed_at) + 1)) };
  }

  #releaseAdmissionPermit(partition: string, admission: BendAdmissionState, token: number): void {
    try {
      const released = bendAdmissionStep(admission, this.#partitionId(partition), 1,
        { $: "Release", token });
      if (released.$ === "Accepted") this.#admissions.set(partition, released.state);
    } catch {
      // The caller has already denied the edit; the retained permit can only expire.
    }
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
    if (round === undefined && this.#rounds.size >= MAX_COMPOSED_ROUNDS) return false;
    const event = fingerprint(eventId);
    if (round?.events.has(event) || (round?.events.size ?? 0) >= 4096) return false;
    // A hook that began before closure cannot reopen by arriving late. The
    // 1ms margin rejects uncertain clock sampling at the boundary.
    if (round !== undefined && !round.policy.active &&
        startedAt <= Number(round.policy.closed_at) + 1) return false;
    const tool = this.#toolId(partition, event);
    const admission = this.#admissionFor(partition, round);
    let issued;
    try {
      issued = bendAdmissionStep(admission, this.#partitionId(partition), 1, {
        $: "Issue", tool, started: this.#bendTime(startedAt),
        deadline: this.#bendTime(startedAt + EDIT_PERMIT_EXPIRY_MS), now: this.#bendTime(now),
      });
    } catch {
      return false;
    }
    if (issued.$ !== "Accepted" || issued.token.$ !== "Some" || issued.round.$ !== "Some") return false;
    const expectedGeneration = round === undefined ? 1 :
      Number(round.policy.generation) + (round.policy.active ? 0 : 1);
    if (Number(issued.round.value) !== expectedGeneration) return false;
    if (round === undefined) {
      round = this.#startRound(partition, event, now);
      if (round === undefined) return false;
    }
    this.#admissions.set(partition, issued.state);
    this.#rounds.set(partition, { ...round, events: new Set([...round.events, event]) });
    this.#permits.set(`${partition}\0${event}`, { partition,
      generation: Number(issued.round.value), expiresAt: startedAt + EDIT_PERMIT_EXPIRY_MS,
      token: Number(issued.token.value), tool });
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
      const admission = this.#admissions.get(partition);
      if (admission === undefined) return undefined;
      if (permit.generation !== Number(previous.policy.generation) + (previous.policy.active ? 0 : 1)) {
        this.#releaseAdmissionPermit(partition, admission, permit.token);
        return undefined;
      }
      let consumed;
      try {
        consumed = bendAdmissionStep(admission, this.#partitionId(partition), 1,
          { $: "Consume", token: permit.token, tool: permit.tool, now: this.#bendTime(now) });
      } catch {
        this.#releaseAdmissionPermit(partition, admission, permit.token);
        return undefined;
      }
      if (consumed.$ !== "Accepted" || consumed.round.$ !== "Some" ||
          Number(consumed.round.value) !== permit.generation) {
        this.#releaseAdmissionPermit(partition, admission, permit.token);
        return undefined;
      }
      if (!previous.policy.active) {
        const reopened = bendRoundReopen(previous.policy, permit.generation);
        if (reopened.$ !== "Granted") {
          this.#releaseAdmissionPermit(partition, admission, permit.token);
          return undefined;
        }
        this.#rounds.set(partition, { marker: event, policy: reopened.state,
          lastSeenAt: now, events: previous.events });
      }
      this.#admissions.set(partition, consumed.state);
      return this.generation(partition);
    }
    // Internal deterministic fixtures and the non-installed API may start a
    // first round; reopening always requires the runtime's prospective permit.
    if (previous === undefined) {
      previous = this.#startRound(partition, event, now);
      if (previous === undefined) return undefined;
    }
    if (!previous.policy.active || previous.events.has(event) || previous.events.size >= 4096) return undefined;
    this.#rounds.set(partition, { ...previous, events: new Set([...previous.events, event]) });
    return Number(previous.policy.generation);
  }

  expirePermits(now = monotonicNow()): void {
    for (const [key, permit] of this.#permits) if (permit.expiresAt <= now) {
      this.#permits.delete(key);
      const admission = this.#admissions.get(permit.partition);
      if (admission === undefined) continue;
      const released = bendAdmissionStep(admission, this.#partitionId(permit.partition), 1,
        { $: "Release", token: permit.token });
      this.#admissions.set(permit.partition, released.state);
    }
  }

  hasPendingEdits(partition: string): boolean {
    this.expirePermits();
    return [...this.#permits.values()].some((permit) => permit.partition === partition);
  }

  isActive(partition: string, generation = this.generation(partition)): boolean {
    const round = this.#rounds.get(partition);
    return round !== undefined && bendRoundActive(round.policy, generation);
  }

  beginStop(partition: string, token: string): boolean {
    const round = this.#rounds.get(partition);
    if (round === undefined) return false;
    const id = this.#nextStopId++;
    const result = bendRoundBeginStop(round.policy, id);
    if (result.$ !== "Granted") return false;
    this.#rounds.set(partition, { ...round, policy: result.state });
    this.#stops.set(partition, { token, id, generation: this.generation(partition) });
    return true;
  }

  ownsStop(partition: string, token: string): boolean {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    return stop?.token === token && round !== undefined &&
      bendRoundOwnsStop(round.policy, stop.id) && this.isActive(partition, stop.generation);
  }

  beginFinishDecision(partition: string, token: string): boolean {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== token || round === undefined) return false;
    const result = bendRoundBeginDecision(round.policy, stop.id);
    if (result.$ !== "Granted") return false;
    this.#rounds.set(partition, { ...round, policy: result.state });
    for (const [key, permit] of this.#permits) if (permit.partition === partition) this.#permits.delete(key);
    return true;
  }

  reserveFinishOutput(partition: string, attempt: string, outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly findings: ReadonlyArray<unknown> }>, now: number): boolean {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== attempt || round === undefined) return false;
    const staged = advice.map((item) => [item.id,
      this.#stageSubmission(item.id, partition, outputToken, item.findings, "stop", now, "reserved")
    ] as const);
    if (staged.some(([, submission]) => submission === undefined)) {
      this.#pruneSubmissionTokenIds();
      return false;
    }
    const result = bendRoundReserveOutput(round.policy, stop.id);
    if (result.$ !== "Granted") {
      this.#pruneSubmissionTokenIds();
      return false;
    }
    this.#rounds.set(partition, { ...round, policy: result.state });
    stop.outputToken = outputToken;
    this.#finishPermits.set(outputToken, { partition, generation: stop.generation, attempt, authorized: false, revoked: false });
    for (const [id, submission] of staged) this.#submissions.set(id, submission!);
    return true;
  }

  hasFinishPermit(token: string): boolean {
    return this.#finishPermits.has(token);
  }

  authorizeFinishOutput(partition: string, token: string): boolean {
    const permit = this.#finishPermits.get(token);
    // The non-installed legacy collector has no finish-decision permit.
    if (permit === undefined) return this.#rounds.get(partition)?.policy.deciding !== true;
    const stop = this.#stops.get(partition);
    if (permit.partition !== partition || !this.isActive(partition, permit.generation) ||
        permit.revoked || permit.authorized || stop?.token !== permit.attempt || stop.outputToken !== token) return false;
    if (!this.#transitionBatchStatus(token, "authorized")) return false;
    permit.authorized = true;
    return true;
  }

  finishStop(partition: string, token: string, close: boolean, closedAt = monotonicNow()): number | undefined {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== token || round === undefined) return undefined;
    const result = bendRoundFinishStop(round.policy, stop.id, close, Math.floor(Math.max(0, closedAt)));
    if (result.$ !== "Granted") return undefined;
    this.#rounds.set(partition, { ...round, policy: result.state });
    this.#stops.delete(partition);
    if (stop.outputToken !== undefined) {
      const permit = this.#finishPermits.get(stop.outputToken);
      if (permit !== undefined) permit.revoked = true;
    }
    if (!close) return undefined;
    if (Number(round.policy.generation) !== stop.generation) return undefined;
    // Bend publishes the fence synchronously before resource cleanup.
    const admission = this.#admissions.get(partition);
    if (admission !== undefined) {
      const at = Math.max(this.#bendTime(closedAt + 1), Number(admission.closed_at));
      const closed = admission.active
        ? bendAdmissionStep(admission, this.#partitionId(partition), 1,
          { $: "CloseRound", at })
        : bendAdmissionCloseProspective(admission, at);
      if (closed.$ === "Accepted") this.#admissions.set(partition, closed.state);
    }
    for (const [key, permit] of this.#permits) if (permit.partition === partition) this.#permits.delete(key);
    this.#backgroundWaiters.delete(partition);
    for (const [token, permit] of this.#finishPermits) if (permit.partition === partition) this.#finishPermits.delete(token);
    for (const [id, submission] of this.#submissions) {
      if (submission.partition === partition) this.#submissions.delete(id);
    }
    this.#pruneSubmissionTokenIds();
    return Number(round.policy.generation);
  }

  closureCounts(partition: string): { reservedContinuations: number; submitted: number; uncertain: number; editPermits: number } {
    const batches = new Map<string, SubmissionBatch["status"]>();
    for (const submission of this.#submissions.values()) if (submission.partition === partition) {
      for (const [token, batch] of submission.batches) batches.set(token, batch.status);
    }
    return { reservedContinuations: Number(this.#rounds.get(partition)?.policy.continuations ?? 0n),
      submitted: [...batches.values()].filter((status) => status === "submitted").length,
      uncertain: [...batches.values()].filter((status) => status === "uncertain").length,
      editPermits: [...this.#permits.values()].filter((permit) => permit.partition === partition).length };
  }

  expireStop(partition: string, token: string): number | undefined {
    const stop = this.#stops.get(partition);
    if (stop?.token !== token) return undefined;
    // A reserved output may have reached the runtime. Preserve its count and
    // round; otherwise the abandoned allow attempt closes with no fresh proof.
    return this.finishStop(partition, token, !this.#rounds.get(partition)?.policy.barrier);
  }

  isDeciding(partition: string): boolean {
    return this.#rounds.get(partition)?.policy.deciding === true;
  }

  canSubmit(partition: string, surface: DeliverySurface): boolean {
    const policy = this.#rounds.get(partition)?.policy;
    return policy !== undefined && policy.active &&
      (surface !== "background" || !(policy.barrier || policy.deciding));
  }

  generation(partition: string): number {
    return Number(this.#rounds.get(partition)?.policy.generation ?? 0n);
  }

  /** Reserve one request from the active virtual round's continuation budget. */
  consumeStop(partition: string, continuationDigest?: string): boolean {
    const chain = this.#rounds.get(partition);
    if (chain === undefined) return false;
    const result = bendRoundConsume(chain.policy);
    if (result.$ !== "Granted") return false;
    this.#rounds.set(partition, { ...chain, policy: result.state,
      ...(continuationDigest === undefined ? {} : { continuationDigest }) });
    return true;
  }

  hasVirtualRoundContinuationBudget(partition: string): boolean {
    const chain = this.#rounds.get(partition);
    return chain !== undefined && bendRoundBudget(chain.policy);
  }

  /** Reserve before writing; a crash or lost acknowledgement remains uncertain. */
  #submissionTokenId(token: string): number {
    let id = this.#submissionTokenIds.get(token);
    if (id === undefined) {
      id = this.#nextSubmissionTokenId++;
      this.#submissionTokenIds.set(token, id);
    }
    return id;
  }

  #leaseSurface(surface: DeliverySurface): BendLeaseSurface {
    return { $: surface === "edit" ? "Edit" : surface === "background" ? "Background" : "Stop" };
  }

  #leaseFor(submission: Submission, digest: string): BendLease | null | undefined {
    let lease: BendLease | undefined;
    try {
      for (const batch of submission.batches.values()) {
        if (!batch.fingerprints.has(digest)) continue;
        lease ??= bendLeaseInitial(1, submission.generation);
        const surface = this.#leaseSurface(batch.surface);
        const start = batch.surface === "stop" &&
          (lease.phase.$ === "Submitted" || lease.phase.$ === "Uncertain") &&
          lease.phase.surface.$ === "Background"
          ? bendLeaseReoffer(lease, submission.generation, batch.id, true)
          : bendLeaseReserve(lease, submission.generation, batch.id, surface);
        if (start.$ !== "Granted") return null;
        lease = start.state;
        if (batch.status !== "reserved") {
          const authorized = bendLeaseAuthorize(lease, submission.generation, batch.id);
          if (authorized.$ !== "Granted") return null;
          if (batch.status === "authorized") lease = authorized.state;
          else {
            const terminal = bendLeaseTerminal(authorized.state, submission.generation, batch.id,
              batch.status === "submitted");
            if (terminal.$ !== "Granted") return null;
            lease = terminal.state;
          }
        }
      }
      return lease;
    } catch {
      return null;
    }
  }

  #stageSubmission(
    adviceId: string, partition: string, token: string,
    findings: ReadonlyArray<unknown>, surface: DeliverySurface, now: number,
    status: SubmissionBatch["status"],
  ): Submission | undefined {
    const generation = this.generation(partition);
    if (generation === 0 || !this.isActive(partition, generation)) return undefined;
    const existing = this.#submissions.get(adviceId);
    const batches = existing?.partition === partition && existing.generation === generation
      ? new Map(existing.batches) : new Map<string, SubmissionBatch>();
    if (batches.has(token)) return undefined;
    const fingerprints = new Set(findings.map(fingerprint));
    if (fingerprints.size === 0) return undefined;
    batches.set(token, { id: this.#submissionTokenId(token), surface, at: now, fingerprints, status });
    const staged: Submission = { partition, generation, batches };
    for (const digest of fingerprints) if (this.#leaseFor(staged, digest) === null) {
      this.#pruneSubmissionTokenIds();
      return undefined;
    }
    return staged;
  }

  beginSubmission(
    adviceId: string,
    partition: string,
    token: string,
    findings: ReadonlyArray<unknown>,
    surface: DeliverySurface,
    now: number,
  ): boolean {
    const staged = this.#stageSubmission(adviceId, partition, token, findings, surface, now, "authorized");
    if (staged === undefined) return false;
    this.#submissions.set(adviceId, staged);
    return true;
  }

  #transitionBatchStatus(token: string, status: SubmissionBatch["status"]): boolean {
    const staged: Array<readonly [string, Submission]> = [];
    for (const [id, submission] of this.#submissions) {
      const batch = submission.batches.get(token);
      if (batch === undefined) continue;
      if (status === "authorized" ? batch.status !== "reserved"
        : batch.status !== "authorized") return false;
      const batches = new Map(submission.batches);
      batches.set(token, { ...batch, status });
      const next: Submission = { ...submission, batches };
      for (const digest of batch.fingerprints) if (this.#leaseFor(next, digest) === null) return false;
      staged.push([id, next]);
    }
    for (const [id, submission] of staged) this.#submissions.set(id, submission);
    return true;
  }

  markSubmitted(token: string): boolean {
    return this.#transitionBatchStatus(token, "submitted");
  }

  markUncertain(token: string): boolean {
    return this.#transitionBatchStatus(token, "uncertain");
  }

  release(token: string): void {
    const permit = this.#finishPermits.get(token);
    if (permit !== undefined) permit.revoked = true;
    for (const [adviceId, submission] of this.#submissions) {
      submission.batches.delete(token);
      if (submission.batches.size === 0) this.#submissions.delete(adviceId);
    }
    this.#pruneSubmissionTokenIds();
  }

  forget(adviceId: string): void {
    this.#submissions.delete(adviceId);
    this.#pruneSubmissionTokenIds();
  }

  #pruneSubmissionTokenIds(): void {
    const active = new Set<string>();
    for (const submission of this.#submissions.values()) {
      for (const token of submission.batches.keys()) active.add(token);
    }
    for (const token of this.#submissionTokenIds.keys()) {
      if (!active.has(token)) this.#submissionTokenIds.delete(token);
    }
  }

  suppresses(adviceId: string, partition: string, finding: unknown, surface?: DeliverySurface): boolean {
    const submission = this.#submissions.get(adviceId);
    if (submission === undefined || submission.partition !== partition ||
        submission.generation !== this.generation(partition)) return false;
    const digest = fingerprint(finding);
    const lease = this.#leaseFor(submission, digest);
    if (lease === null) return true;
    return lease !== undefined && bendLeaseSuppresses(lease, submission.generation,
      this.#leaseSurface(surface ?? "edit"));
  }

  backgroundReofferable(adviceId: string, token: string): boolean {
    const batch = this.#submissions.get(adviceId)?.batches.get(token);
    return batch?.surface === "background" &&
      (batch.status === "submitted" || batch.status === "uncertain");
  }

  hasToken(token: string): boolean {
    return [...this.#submissions.values()].some((submission) => submission.batches.has(token));
  }

  expire(now: number): void {
    for (const [partition, waiter] of this.#backgroundWaiters) {
      const elapsed = Math.floor(Math.min(BACKGROUND_WAITER_EXPIRY_MS,
        Math.max(0, now - waiter.at)));
      const expired = bendBackgroundExpire(waiter.policy, elapsed,
        BACKGROUND_WAITER_EXPIRY_MS);
      if (expired.owner === 0n) this.#backgroundWaiters.delete(partition);
      else this.#backgroundWaiters.set(partition, { ...waiter, policy: expired });
    }
    const expired = new Set<string>();
    for (const submission of this.#submissions.values()) {
      for (const [token, batch] of submission.batches) {
        if (batch.status === "authorized" && now - batch.at >= DELIVERY_LEASE_MS) expired.add(token);
      }
    }
    for (const token of expired) this.markUncertain(token);
    // Round fences and continuation counts never expire in a resident lifetime.
  }
}
