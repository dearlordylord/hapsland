import { createHash } from "node:crypto";
import { monotonicNow, PRE_EDIT_ADMISSION_DEADLINE_MS } from "./hook-clock.ts";
import { canonicalValue } from "../direct-event/model.ts";
import { BendWorkTracker } from "./bend-work.ts";
import { CapacityLedger } from "./capacity.ts";
import { DELIVERY_LEASE_MS } from "./protocol.ts";
import {
  bendRoundActive, bendRoundBeginStop, bendRoundBudget,
  bendRoundConsume, bendRoundFinishStop, bendRoundInitial, bendRoundOwnsStop,
  bendRoundStopTerminal, bendRoundExpireClose,
  bendRoundReopen, bendRoundMaxContinuations, type BendRound,
  bendLeaseInitial, bendLeaseOffer, bendLeaseAuthorize, bendLeaseTerminal,
  bendLeaseSuppresses, type BendLease, type BendLeaseSurface,
  bendBackgroundInitial, bendBackgroundClaim, bendBackgroundRelease,
  bendBackgroundExpire, type BendBackgroundWaiter,
  bendDeliveryTransition, bendDeliveryExpired, bendDeliveryBackgroundReofferable,
  bendDeliverySubmissionAllowed, bendDeliveryLegacyStopAllowed,
  bendDeliveryExistingTokenAllowed,
  type BendDeliveryPhase,
  bendLifecycleReleaseUnwritten,
  bendLifecycleSelectionAuthorize, bendLifecycleSelectionConsume,
  type BendOutputSelection,
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
  readonly leases: Map<string, BendLease>;
};

const fingerprint = (finding: unknown): string =>
  createHash("sha256").update(canonicalValue(finding)).digest("hex");

export class ComposedDelivery {
  readonly canonical: CapacityLedger;
  constructor(canonical = new CapacityLedger()) {
    this.canonical = canonical;
  }
  readonly #rounds = new Map<string, Round>();
  readonly #permits = new Map<string, { readonly partition: string; readonly generation: number;
    readonly expiresAt: number; readonly token: number; readonly tool: number }>();
  readonly #toolIds = new Map<string, number>();
  #nextToolId = 1;
  readonly #stops = new Map<string, { token: string; id: number; generation: number; outputToken?: string }>();
  #nextStopId = 1;
  readonly #submissions = new Map<string, Submission>();
  readonly #submissionTokenIds = new Map<string, number>();
  #nextSubmissionTokenId = 1;
  readonly #finishPermits = new Map<string, {
    readonly partition: string; readonly generation: number; readonly attempt: string;
    selection: BendOutputSelection; revoked: boolean;
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

  #releaseAdmissionPermit(partition: string, token: number): void {
    this.canonical.transition({ kind: "releasePermit", partition: this.canonical.partitionId(partition),
      lifetime: 1, token });
  }

  ensureFromHostTurn(partition: string, marker: string, now: number): boolean {
    return this.advance(partition, marker, now);
  }

  /** The installed synchronous PreToolUse hook grants one prospective edit. */
  registerEdit(partition: string, eventId: string, startedAt: number, now = monotonicNow()): boolean {
    this.expirePermits(now);
    let round = this.#rounds.get(partition);
    const event = eventId;
    // A hook that began before closure cannot reopen by arriving late. The
    // 1ms margin rejects uncertain clock sampling at the boundary.
    const facts = {
      clockValid: Number.isFinite(now) && Number.isFinite(startedAt) &&
        startedAt > 0 && startedAt <= now,
      withinHookWindow: now - startedAt < PRE_EDIT_ADMISSION_DEADLINE_MS,
      startedAfterClosure: round === undefined || round.policy.active ||
        startedAt > Number(round.policy.closed_at) + 1,
      duplicateEvent: round?.events.has(event) ?? false,
      permitCount: this.#permits.size, permitLimit: 1024,
      roundCount: this.#rounds.size, roundLimit: MAX_COMPOSED_ROUNDS,
      newRound: round === undefined,
      eventCount: round?.events.size ?? 0, eventLimit: 4096,
    };
    const tool = this.#toolId(partition, event);
    let issued;
    try {
      issued = this.canonical.transition({ kind: "issuePermit",
        partition: this.canonical.partitionId(partition), lifetime: 1, tool,
        started: this.#bendTime(startedAt), deadline: this.#bendTime(startedAt + EDIT_PERMIT_EXPIRY_MS),
        now: this.#bendTime(now), facts,
      });
    } catch {
      return false;
    }
    const command = issued.commands[0];
    if (issued.rejection !== undefined || command?.kind !== "permitIssued") return false;
    const expectedGeneration = round === undefined ? 1 :
      Number(round.policy.generation) + (round.policy.active ? 0 : 1);
    if (command.round !== expectedGeneration) {
      this.#releaseAdmissionPermit(partition, command.token);
      return false;
    }
    if (round === undefined) {
      round = this.#startRound(partition, event, now);
      if (round === undefined) return false;
    }
    this.#rounds.set(partition, { ...round, events: new Set([...round.events, event]) });
    this.#permits.set(`${partition}\0${event}`, { partition,
      generation: command.round, expiresAt: startedAt + EDIT_PERMIT_EXPIRY_MS,
      token: command.token, tool });
    return true;
  }

  admitEdit(partition: string, eventId: string, now: number, requirePermit = false): number | undefined {
    let previous = this.#rounds.get(partition);
    const event = eventId;
    const key = `${partition}\0${event}`;
    if (requirePermit) {
      this.expirePermits(now);
      const permit = this.#permits.get(key);
      this.#permits.delete(key);
      if (previous === undefined || permit === undefined) return undefined;
      if (permit.generation !== Number(previous.policy.generation) + (previous.policy.active ? 0 : 1)) {
        this.#releaseAdmissionPermit(partition, permit.token);
        return undefined;
      }
      let consumed;
      try {
        consumed = this.canonical.transition({ kind: "consumePermit",
          partition: this.canonical.partitionId(partition), lifetime: 1,
          token: permit.token, tool: permit.tool, now: this.#bendTime(now) });
      } catch {
        this.#releaseAdmissionPermit(partition, permit.token);
        return undefined;
      }
      if (consumed.rejection !== undefined || consumed.commands[0]?.kind !== "permitConsumed" ||
          consumed.commands[0].round !== permit.generation) {
        this.#releaseAdmissionPermit(partition, permit.token);
        return undefined;
      }
      if (!previous.policy.active) {
        const reopened = bendRoundReopen(previous.policy, permit.generation);
        if (reopened.$ !== "Granted") {
          this.#releaseAdmissionPermit(partition, permit.token);
          return undefined;
        }
        this.#rounds.set(partition, { marker: event, policy: reopened.state,
          lastSeenAt: now, events: previous.events });
      }
      return this.generation(partition);
    }
    // Internal deterministic fixtures and the non-installed API may start a
    // first round; reopening always requires the runtime's prospective permit.
    if ((previous !== undefined && (!previous.policy.active || previous.events.has(event) || previous.events.size >= 4096)) ||
        (previous === undefined && this.#rounds.size >= MAX_COMPOSED_ROUNDS)) return undefined;
    const partitionId = this.canonical.partitionId(partition);
    const tool = this.#toolId(partition, event);
    const syntheticNow = this.#bendTime(Math.max(1, now));
    const issued = this.canonical.transition({ kind: "issuePermit", partition: partitionId,
      lifetime: 1, tool, started: syntheticNow, deadline: syntheticNow + this.#bendTime(EDIT_PERMIT_EXPIRY_MS),
      now: syntheticNow, facts: { clockValid: true, withinHookWindow: true,
        startedAfterClosure: true, duplicateEvent: false,
        permitCount: this.#permits.size, permitLimit: 1024,
        roundCount: this.#rounds.size, roundLimit: MAX_COMPOSED_ROUNDS,
        newRound: previous === undefined, eventCount: previous?.events.size ?? 0, eventLimit: 4096 } });
    const permit = issued.commands[0];
    if (permit?.kind !== "permitIssued") return undefined;
    const consumed = this.canonical.transition({ kind: "consumePermit", partition: partitionId,
      lifetime: 1, token: permit.token, tool, now: syntheticNow });
    if (consumed.commands[0]?.kind !== "permitConsumed") {
      this.#releaseAdmissionPermit(partition, permit.token);
      return undefined;
    }
    if (previous === undefined) {
      previous = this.#startRound(partition, event, now);
      if (previous === undefined) return undefined;
    }
    if (consumed.commands[0].round !== Number(previous.policy.generation)) return undefined;
    this.#rounds.set(partition, { ...previous, events: new Set([...previous.events, event]) });
    return Number(previous.policy.generation);
  }

  expirePermits(now = monotonicNow()): void {
    for (const [key, permit] of this.#permits) {
      const result = this.canonical.transition({ kind: "expirePermit",
        partition: this.canonical.partitionId(permit.partition), lifetime: 1,
        token: permit.token, deadlineReached: permit.expiresAt <= now });
      if (result.commands[0]?.kind === "permitKept") continue;
      if (result.rejection !== undefined || result.commands[0]?.kind !== "permitExpired") throw new Error("invalid Bend permit expiry");
      this.#permits.delete(key);
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

  finishGate(partition: string, token: string, extraUnfinished: number,
    deadlineReached: boolean, work = new BendWorkTracker()):
    { readonly status: "waiting" } |
    { readonly status: "cutoff"; readonly cancelledSource: number[];
      readonly cancelledJev: number[] } | undefined {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== token || round === undefined) return undefined;
    const result = work.finishGate(round.policy, stop.id, extraUnfinished, deadlineReached);
    if (result === undefined) return undefined;
    if (result.status === "waiting") return { status: "waiting" };
    this.#rounds.set(partition, { ...round, policy: result.round });
    for (const [key, permit] of this.#permits) if (permit.partition === partition) this.#permits.delete(key);
    return { status: "cutoff", cancelledSource: result.cancelledSource,
      cancelledJev: result.cancelledJev };
  }

  reserveFinishOutput(partition: string, attempt: string, outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number;
      readonly findings: ReadonlyArray<unknown> }>, now: number, work: BendWorkTracker): boolean {
    return this.decideFinishOutput(partition, attempt, outputToken, advice, now, work,
      false, false, true, true, false).kind === "reserved";
  }

  decideFinishOutput(partition: string, attempt: string, outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number;
      readonly findings: ReadonlyArray<unknown> }>, now: number, work: BendWorkTracker,
    hasNotice: boolean, passNotices: boolean, canWrite: boolean,
    bindingValid: boolean, deadlineReached: boolean):
    { readonly kind: "reserved" | "notices" | "failed" } |
    { readonly kind: "allowed"; readonly reason: "no-advice" | "deadline" | "unavailable" } {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== attempt || round === undefined) return { kind: "failed" };
    const selected = advice.flatMap((item) => item.findings.map(() => item.unit));
    const decision = work.finishOutput(round.policy, stop.id, selected,
      hasNotice, passNotices, canWrite, bindingValid, deadlineReached);
    if (decision.$ === "OutputNotices") return { kind: "notices" };
    if (decision.$ === "OutputAllowed") {
      switch (decision.reason.$) {
        case "AllowNoAdvice": return { kind: "allowed", reason: "no-advice" };
        case "AllowDeadline": return { kind: "allowed", reason: "deadline" };
        case "AllowUnavailable": return { kind: "allowed", reason: "unavailable" };
        default: return { kind: "failed" };
      }
    }
    if (decision.$ !== "OutputReserved") return { kind: "failed" };
    const staged = advice.map((item) => [item.id,
      this.#stageSubmission(item.id, partition, outputToken, item.findings, "stop", now, "reserved")
    ] as const);
    if (staged.some(([, submission]) => submission === undefined)) {
      this.#pruneSubmissionTokenIds();
      return { kind: "failed" };
    }
    this.#rounds.set(partition, { ...round, policy: decision.round });
    stop.outputToken = outputToken;
    this.#finishPermits.set(outputToken, { partition, generation: stop.generation, attempt,
      selection: decision.selection, revoked: false });
    for (const [id, submission] of staged) this.#submissions.set(id, submission!);
    return { kind: "reserved" };
  }

  revokeProvisionalFinishOutput(partition: string, attempt: string, outputToken: string): boolean {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    const permit = this.#finishPermits.get(outputToken);
    if (stop?.token !== attempt || stop.outputToken !== outputToken || round === undefined ||
        permit?.selection.authorized === true) return false;
    const released = bendLifecycleReleaseUnwritten(round.policy, stop.id);
    if (released.$ !== "Granted") return false;
    this.#rounds.set(partition, { ...round, policy: released.state });
    this.release(outputToken);
    this.#finishPermits.delete(outputToken);
    delete stop.outputToken;
    return true;
  }

  hasFinishPermit(token: string): boolean {
    return this.#finishPermits.has(token);
  }

  authorizeFinishOutput(partition: string, token: string): boolean {
    const permit = this.#finishPermits.get(token);
    // The non-installed legacy collector has no finish-decision permit.
    if (permit === undefined) {
      const round = this.#rounds.get(partition)?.policy;
      return round !== undefined && bendDeliveryLegacyStopAllowed(round);
    }
    const stop = this.#stops.get(partition);
    if (permit.partition !== partition || !this.isActive(partition, permit.generation) ||
        permit.revoked || stop?.token !== permit.attempt || stop.outputToken !== token) return false;
    const authorization = bendLifecycleSelectionAuthorize(permit.selection);
    if (authorization.$ !== "SelectionGranted") return false;
    if (!this.#transitionBatchStatus(token, "authorized")) return false;
    permit.selection = authorization.state;
    return true;
  }

  finishStop(partition: string, token: string, close: boolean, closedAt = monotonicNow()): number | undefined {
    const stop = this.#stops.get(partition);
    let round = this.#rounds.get(partition);
    if (stop?.token !== token || round === undefined) return undefined;
    // A provisional output has not crossed the IPC write boundary. If Stop
    // ends while that response is gated, release its slot and close the round.
    const terminal = bendRoundStopTerminal(stop.outputToken !== undefined,
      stop.outputToken !== undefined &&
        this.#finishPermits.get(stop.outputToken)?.selection.authorized === true, close);
    if (terminal.$ !== "StopTerminal") return undefined;
    if (terminal.revoke_provisional && stop.outputToken !== undefined) {
      if (!this.revokeProvisionalFinishOutput(partition, token, stop.outputToken)) return undefined;
      round = this.#rounds.get(partition);
      if (round === undefined) return undefined;
    }
    close = terminal.close;
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
    const admission = this.canonical.canonicalProjection().admissions.find(
      (item) => item.partition === this.canonical.partitionId(partition));
    if (admission === undefined) throw new Error("canonical admission missing at round closure");
    const at = Math.max(this.#bendTime(closedAt + 1), admission.closedAt);
    const closed = this.canonical.transition({ kind: "closePermitRound",
      partition: admission.partition, lifetime: admission.lifetime,
      round: stop.generation, at, prospective: !admission.active });
    if (closed.rejection !== undefined || closed.commands[0]?.kind !== "permitRoundClosed" ||
        closed.commands[0].round !== stop.generation) throw new Error("canonical permit closure disagrees with round");
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
    // An authorized output may have reached the runtime. Preserve its count
    // and round; finishStop releases any provisional output before closing.
    return this.finishStop(partition, token,
      bendRoundExpireClose(this.#rounds.get(partition)?.policy.barrier === true));
  }

  isDeciding(partition: string): boolean {
    return this.#rounds.get(partition)?.policy.deciding === true;
  }

  canSubmit(partition: string, surface: DeliverySurface): boolean {
    const policy = this.#rounds.get(partition)?.policy;
    return policy !== undefined && bendDeliverySubmissionAllowed(policy,
      this.#leaseSurface(surface), false, false);
  }

  canBeginSubmission(partition: string, surface: DeliverySurface, token: string): boolean {
    const policy = this.#rounds.get(partition)?.policy;
    return policy !== undefined && bendDeliverySubmissionAllowed(policy,
      this.#leaseSurface(surface), this.hasToken(token),
      surface === "stop" && this.hasFinishPermit(token));
  }

  canBeginExistingToken(surface: DeliverySurface, token: string): boolean {
    return bendDeliveryExistingTokenAllowed(this.#leaseSurface(surface),
      this.hasToken(token), surface === "stop" && this.hasFinishPermit(token));
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

  #deliveryPhase(status: SubmissionBatch["status"]): BendDeliveryPhase {
    return { $: status === "reserved" ? "Reserved" : status === "authorized" ? "Authorized"
      : status === "submitted" ? "Submitted" : "Uncertain" };
  }

  #batchStatus(phase: BendDeliveryPhase): SubmissionBatch["status"] {
    switch (phase.$) {
      case "Reserved": return "reserved";
      case "Authorized": return "authorized";
      case "Submitted": return "submitted";
      case "Uncertain": return "uncertain";
    }
  }

  #rebuildLeases(submission: Submission): Map<string, BendLease> | undefined {
    const leases = new Map<string, BendLease>();
    try {
      for (const batch of submission.batches.values()) {
        for (const digest of batch.fingerprints) {
          const previous = leases.get(digest) ?? bendLeaseInitial(1, submission.generation);
          const offered = bendLeaseOffer(previous, submission.generation, batch.id,
            this.#leaseSurface(batch.surface), true);
          if (offered.$ !== "Granted") return undefined;
          let lease = offered.state;
          if (batch.status !== "reserved") {
            const authorized = bendLeaseAuthorize(lease, submission.generation, batch.id);
            if (authorized.$ !== "Granted") return undefined;
            lease = authorized.state;
            if (batch.status !== "authorized") {
              const terminal = bendLeaseTerminal(lease, submission.generation, batch.id,
                batch.status === "submitted");
              if (terminal.$ !== "Granted") return undefined;
              lease = terminal.state;
            }
          }
          leases.set(digest, lease);
        }
      }
      return leases;
    } catch {
      return undefined;
    }
  }

  #stageSubmission(
    adviceId: string, partition: string, token: string,
    findings: ReadonlyArray<unknown>, surface: DeliverySurface, now: number,
    status: "reserved" | "authorized",
  ): Submission | undefined {
    const generation = this.generation(partition);
    if (generation === 0 || !this.isActive(partition, generation)) return undefined;
    const existing = this.#submissions.get(adviceId);
    const batches = existing?.partition === partition && existing.generation === generation
      ? new Map(existing.batches) : new Map<string, SubmissionBatch>();
    const leases = existing?.partition === partition && existing.generation === generation
      ? new Map(existing.leases) : new Map<string, BendLease>();
    if (batches.has(token)) return undefined;
    const fingerprints = new Set(findings.map(fingerprint));
    if (fingerprints.size === 0) return undefined;
    const id = this.#submissionTokenId(token);
    try {
      for (const digest of fingerprints) {
        const previous = leases.get(digest) ?? bendLeaseInitial(1, generation);
        const offered = bendLeaseOffer(previous, generation, id, this.#leaseSurface(surface), true);
        if (offered.$ !== "Granted") {
          this.#pruneSubmissionTokenIds();
          return undefined;
        }
        if (status === "authorized") {
          const authorized = bendLeaseAuthorize(offered.state, generation, id);
          if (authorized.$ !== "Granted") {
            this.#pruneSubmissionTokenIds();
            return undefined;
          }
          leases.set(digest, authorized.state);
        } else {
          leases.set(digest, offered.state);
        }
      }
    } catch {
      this.#pruneSubmissionTokenIds();
      return undefined;
    }
    batches.set(token, { id, surface, at: now, fingerprints, status });
    return { partition, generation, batches, leases };
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
      const transition = bendDeliveryTransition(this.#deliveryPhase(batch.status),
        this.#deliveryPhase(status));
      if (transition.$ !== "Granted") return false;
      const batches = new Map(submission.batches);
      batches.set(token, { ...batch, status: this.#batchStatus(transition.phase) });
      const leases = new Map(submission.leases);
      try {
        for (const digest of batch.fingerprints) {
          const current = leases.get(digest);
          if (current === undefined) return false;
          const step = status === "authorized"
            ? bendLeaseAuthorize(current, submission.generation, batch.id)
            : bendLeaseTerminal(current, submission.generation, batch.id, status === "submitted");
          if (step.$ !== "Granted") return false;
          leases.set(digest, step.state);
        }
      } catch {
        return false;
      }
      const next: Submission = { ...submission, batches, leases };
      staged.push([id, next]);
    }
    for (const [id, submission] of staged) this.#submissions.set(id, submission);
    return true;
  }

  markSubmitted(token: string, selectedUnits: ReadonlyArray<number> = []): boolean {
    const permit = this.#finishPermits.get(token);
    const consumed = permit === undefined ? undefined :
      bendLifecycleSelectionConsume(permit.selection, selectedUnits);
    if (consumed !== undefined && consumed.$ !== "SelectionGranted") return false;
    if (!this.#transitionBatchStatus(token, "submitted")) return false;
    if (permit !== undefined && consumed !== undefined) permit.selection = consumed.state;
    return true;
  }

  markUncertain(token: string): boolean {
    return this.#transitionBatchStatus(token, "uncertain");
  }

  release(token: string): void {
    const permit = this.#finishPermits.get(token);
    if (permit !== undefined) permit.revoked = true;
    for (const [adviceId, submission] of this.#submissions) {
      if (!submission.batches.has(token)) continue;
      const batches = new Map(submission.batches);
      batches.delete(token);
      if (batches.size === 0) {
        this.#submissions.delete(adviceId);
        continue;
      }
      // Removing a known unwritten token restores the previous Bend lease.
      // Replay is needed only for this rollback, including an aborted Stop
      // reoffer whose prior background terminal must remain authoritative.
      const retained = { ...submission, batches };
      const leases = this.#rebuildLeases(retained);
      if (leases !== undefined) this.#submissions.set(adviceId, { ...retained, leases });
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
    const lease = submission.leases.get(digest);
    if (lease === undefined && [...submission.batches.values()].some((batch) =>
      batch.fingerprints.has(digest))) return true;
    return lease !== undefined && bendLeaseSuppresses(lease, submission.generation,
      this.#leaseSurface(surface ?? "edit"));
  }

  backgroundReofferable(adviceId: string, token: string): boolean {
    const batch = this.#submissions.get(adviceId)?.batches.get(token);
    return batch !== undefined && bendDeliveryBackgroundReofferable(
      this.#deliveryPhase(batch.status), this.#leaseSurface(batch.surface));
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
        const elapsed = Math.floor(Math.min(DELIVERY_LEASE_MS, Math.max(0, now - batch.at)));
        if (bendDeliveryExpired(this.#deliveryPhase(batch.status), elapsed, DELIVERY_LEASE_MS)) expired.add(token);
      }
    }
    for (const token of expired) this.markUncertain(token);
    // Round fences and continuation counts never expire in a resident lifetime.
  }
}
