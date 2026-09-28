import { createHash } from "node:crypto";
import { monotonicNow, PRE_EDIT_ADMISSION_DEADLINE_MS } from "./hook-clock.ts";
import { canonicalValue } from "../direct-event/model.ts";
import { BendWorkTracker } from "./bend-work.ts";
import { CapacityLedger } from "./capacity.ts";
import { DELIVERY_LEASE_MS } from "./protocol.ts";
import {
  bendRoundActive, bendRoundBeginStop, bendRoundBeginDecision, bendRoundBudget,
  bendRoundConsume, bendRoundFinishStop, bendRoundInitial, bendRoundOwnsStop,
  bendRoundStopTerminal, bendRoundExpireClose,
  bendRoundReopen, bendRoundMaxContinuations, type BendRound,
  bendLeaseInitial, bendLeaseOffer, bendLeaseAuthorize, bendLeaseTerminal,
  bendLeaseSuppresses, type BendLease, type BendLeaseSurface,
  bendDeliveryTransition, bendDeliveryExpired, bendDeliveryBackgroundReofferable,
  bendDeliverySubmissionAllowed, bendDeliveryLegacyStopAllowed,
  bendDeliveryExistingTokenAllowed,
  type BendDeliveryPhase,
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
    readonly selected: ReadonlyArray<number>; authorized: boolean; terminal: boolean; revoked: boolean;
  }>();
  readonly #backgroundWaiters = new Map<string, { readonly token: string; readonly id: number; readonly at: number }>();

  claimBackground(partition: string, token: string, now: number): boolean {
    this.expire(now);
    const id = this.canonical.collectionTokenId(token);
    const claimed = this.canonical.transition({ kind: "collectionClaimBackground",
      group: this.canonical.partitionId(partition), token: id,
      active: this.isActive(partition), capacity: MAX_COMPOSED_ROUNDS });
    if (claimed.rejection !== undefined || claimed.commands[0]?.kind !== "collectionBackgroundClaimed") return false;
    this.#backgroundWaiters.set(partition, { token, id, at: now });
    return true;
  }

  releaseBackground(partition: string, token: string): void {
    const waiter = this.#backgroundWaiters.get(partition);
    if (waiter === undefined) return;
    const release = this.canonical.transition({ kind: "collectionReleaseBackground",
      group: this.canonical.partitionId(partition), token: this.canonical.collectionTokenId(token) });
    if (release.rejection !== undefined || release.commands[0]?.kind !== "collectionBackgroundReleased") return;
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
    return this.registerEditDecision(partition, eventId, startedAt, now).accepted;
  }

  registerEditDecision(partition: string, eventId: string, startedAt: number,
    now = monotonicNow()): { readonly accepted: true } | { readonly accepted: false; readonly reason: string } {
    this.expirePermits(now);
    let round = this.#rounds.get(partition);
    const admission = this.canonical.canonicalProjection().admissions.find(
      (item) => item.partition === this.canonical.partitionId(partition));
    const event = eventId;
    // A hook that began before closure cannot reopen by arriving late. The
    // 1ms margin rejects uncertain clock sampling at the boundary.
    const facts = {
      clockValid: Number.isFinite(now) && Number.isFinite(startedAt) &&
        startedAt > 0 && startedAt <= now,
      withinHookWindow: now - startedAt < PRE_EDIT_ADMISSION_DEADLINE_MS,
      startedAfterClosure: admission === undefined || admission.active ||
        this.#bendTime(startedAt) > admission.closedAt,
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
      return { accepted: false, reason: "InvalidClock" };
    }
    const command = issued.commands[0];
    if (issued.rejection !== undefined || command?.kind !== "permitIssued") {
      const reason = issued.rejection === "ProspectiveDenied"
        ? !facts.clockValid ? "InvalidClock"
          : !facts.withinHookWindow ? "StaleInvocation"
          : !facts.startedAfterClosure ? "RoundAlreadyClosed"
          : facts.duplicateEvent ? "DuplicateTool"
          : facts.permitCount >= facts.permitLimit ? "PermitLimit"
          : facts.newRound && facts.roundCount >= facts.roundLimit ? "RoundLimit"
          : facts.eventCount >= facts.eventLimit ? "EventLimit" : "ProspectiveDenied"
        : issued.rejection ?? "InconsistentLedger";
      return { accepted: false, reason };
    }
    const expectedGeneration = admission === undefined ? 1 :
      admission.round + (admission.active ? 0 : 1);
    if (command.round !== expectedGeneration) {
      this.#releaseAdmissionPermit(partition, command.token);
      return { accepted: false, reason: "StaleRound" };
    }
    if (round === undefined) {
      round = this.#startRound(partition, event, now);
      if (round === undefined) return { accepted: false, reason: "RoundLimit" };
    }
    this.#rounds.set(partition, { ...round, events: new Set([...round.events, event]) });
    this.#permits.set(`${partition}\0${event}`, { partition,
      generation: command.round, expiresAt: startedAt + EDIT_PERMIT_EXPIRY_MS,
      token: command.token, tool });
    return { accepted: true };
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
          throw new Error("legacy Stop round disagrees with canonical admission");
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
    this.canonical.roundId(partition);
    return true;
  }

  ownsStop(partition: string, token: string): boolean {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    return stop?.token === token && round !== undefined &&
      bendRoundOwnsStop(round.policy, stop.id) && this.isActive(partition, stop.generation);
  }

  finishGate(partition: string, token: string, extraUnfinished: number,
    deadlineReached: boolean, work = new BendWorkTracker(), scopePartitions: readonly string[] = []):
    { readonly status: "waiting" } |
    { readonly status: "cutoff"; readonly cancelledSource: number[];
      readonly cancelledJev: number[]; readonly limited: boolean } | undefined {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== token || round === undefined) return undefined;
    const projection = this.canonical.canonicalProjection();
    const scopes = scopePartitions.map((name) => {
      const partition = this.canonical.partitionId(name);
      const current = projection.rounds.find((item) => item.partition === partition);
      if (current === undefined) throw new Error("canonical stop scope missing");
      return { partition, round: current.id };
    });
    const cutoff = this.canonical.transition({ kind: "stopGroupPolled",
      group: this.canonical.partitionId(partition), lifetime: 1,
      round: this.canonical.roundId(partition), scopes,
      deadline: deadlineReached, extraPending: extraUnfinished > 0,
      continuations: this.#continuationCount(partition) });
    if (cutoff.rejection !== undefined) return undefined;
    if (cutoff.commands[0]?.kind === "waitForWork") return { status: "waiting" };
    const terminal = cutoff.commands.at(-1)?.kind;
    if (terminal !== "finishReady" && terminal !== "finishLimit") throw new Error("invalid canonical Stop command");
    const source = new Set(projection.work.filter((item) => scopes.some((scope) => scope.partition === item.partition && scope.round === item.round) &&
      (item.kind === "sourceQueued" || item.kind === "sourceReading")).map((item) => item.operation));
    const cancelled = cutoff.commands.filter((item) => item.kind === "cancelWork").map((item) => item.operation);
    for (const command of cutoff.commands) if (command.kind === "reservationReleased") {
      this.canonical.acknowledgeStopRelease(command.id);
    }
    work.cancelUnfinished(); // Keep the legacy output projection synchronized until #125.
    const decision = bendRoundBeginDecision(round.policy, stop.id);
    if (decision.$ !== "Granted") throw new Error("legacy output projection refused canonical Stop");
    for (const [key, permit] of this.#permits) if (permit.partition === partition) {
      const released = this.canonical.transition({ kind: "releasePermit",
        partition: this.canonical.partitionId(partition), lifetime: 1, token: permit.token });
      if (released.rejection !== undefined || released.commands[0]?.kind !== "permitReleased") {
        throw new Error("canonical permit cutoff disagrees with resident");
      }
      this.#permits.delete(key);
    }
    this.#rounds.set(partition, { ...round, policy: decision.state });
    return { status: "cutoff", cancelledSource: cancelled.filter((id) => source.has(id)),
      cancelledJev: cancelled.filter((id) => !source.has(id)), limited: terminal === "finishLimit" };
  }

  reserveFinishOutput(partition: string, attempt: string, outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number;
      readonly findings: ReadonlyArray<unknown> }>, now: number): boolean {
    return this.decideFinishOutput(partition, attempt, outputToken, advice, now,
      false, false, true, true, false).kind === "reserved";
  }

  decideFinishOutput(partition: string, attempt: string, outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number;
      readonly findings: ReadonlyArray<unknown> }>, now: number,
    hasNotice: boolean, passNotices: boolean, canWrite: boolean,
    bindingValid: boolean, deadlineReached: boolean):
    { readonly kind: "reserved" | "notices" | "failed" } |
    { readonly kind: "allowed"; readonly reason: "no-advice" | "deadline" | "unavailable" } {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== attempt || round === undefined) return { kind: "failed" };
    const selected = advice.flatMap((item) => item.findings.map(() => item.unit));
    const group = this.canonical.partitionId(partition);
    const currentRound = this.canonical.roundId(partition);
    const tokenId = this.canonical.collectionTokenId(outputToken);
    const decision = this.canonical.transition({ kind: "finishReserve", group,
      lifetime: 1, round: currentRound, attempt: stop.id, token: tokenId,
      selected, hasNotice, passNotices, canWrite, bindingValid, deadlineReached });
    if (decision.rejection !== undefined) return { kind: "failed" };
    switch (decision.commands[0]?.kind) {
      case "finishNotices": return { kind: "notices" };
      case "finishAllowedNoAdvice": return { kind: "allowed", reason: "no-advice" };
      case "finishAllowedDeadline": return { kind: "allowed", reason: "deadline" };
      case "finishAllowedUnavailable": return { kind: "allowed", reason: "unavailable" };
      case "finishReserved": break;
      default: return { kind: "failed" };
    }
    const staged = advice.map((item) => [item.id,
      this.#stageSubmission(item.id, partition, outputToken, item.findings, "stop", now, "reserved")
    ] as const);
    if (staged.some(([, submission]) => submission === undefined)) {
      this.canonical.transition({ kind: "finishRelease", group, round: currentRound,
        attempt: stop.id, token: tokenId });
      this.#pruneSubmissionTokenIds();
      return { kind: "failed" };
    }
    stop.outputToken = outputToken;
    this.#finishPermits.set(outputToken, { partition, generation: stop.generation, attempt,
      selected, authorized: false, terminal: false, revoked: false });
    for (const [id, submission] of staged) this.#submissions.set(id, submission!);
    return { kind: "reserved" };
  }

  revokeProvisionalFinishOutput(partition: string, attempt: string, outputToken: string): boolean {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    const permit = this.#finishPermits.get(outputToken);
    if (stop?.token !== attempt || stop.outputToken !== outputToken || round === undefined ||
        permit === undefined || permit.authorized) return false;
    const released = this.canonical.transition({ kind: "finishRelease",
      group: this.canonical.partitionId(partition), round: this.canonical.roundId(partition),
      attempt: stop.id, token: this.canonical.collectionTokenId(outputToken) });
    if (released.rejection !== undefined || released.commands[0]?.kind !== "finishReleased") return false;
    permit.revoked = true;
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
    if (!this.#transitionBatchStatus(token, "authorized")) return false;
    const authorization = this.canonical.transition({ kind: "finishAuthorize",
      group: this.canonical.partitionId(partition), round: this.canonical.roundId(partition),
      attempt: stop.id, token: this.canonical.collectionTokenId(token),
      selected: permit.selected });
    if (authorization.rejection !== undefined || authorization.commands[0]?.kind !== "finishAuthorized") {
      this.release(token);
      return false;
    }
    permit.authorized = true;
    return true;
  }

  finishStop(partition: string, token: string, close: boolean, closedAt = monotonicNow(),
    scopePartitions: readonly string[] = []): number | undefined {
    const stop = this.#stops.get(partition);
    let round = this.#rounds.get(partition);
    if (stop?.token !== token || round === undefined) return undefined;
    // A provisional output has not crossed the IPC write boundary. If Stop
    // ends while that response is gated, release its slot and close the round.
    const terminal = bendRoundStopTerminal(stop.outputToken !== undefined,
      stop.outputToken !== undefined &&
        this.#finishPermits.get(stop.outputToken)?.authorized === true, close);
    if (terminal.$ !== "StopTerminal") return undefined;
    if (terminal.revoke_provisional && stop.outputToken !== undefined) {
      if (!this.revokeProvisionalFinishOutput(partition, token, stop.outputToken)) return undefined;
      round = this.#rounds.get(partition);
      if (round === undefined) return undefined;
    }
    close = terminal.close;
    const result = bendRoundFinishStop(round.policy, stop.id, close, Math.floor(Math.max(0, closedAt)));
    if (result.$ !== "Granted") return undefined;
    const scopes = scopePartitions.map((name) => {
      const owner = this.canonical.partitionId(name);
      const current = this.canonical.canonicalProjection().rounds.find((item) => item.partition === owner);
      if (current === undefined) throw new Error("canonical Stop scope retired before finish");
      return { partition: owner, round: current.id };
    });
    const ended = this.canonical.transition({ kind: "stopGroupEnded", group: this.canonical.partitionId(partition),
      lifetime: 1, round: this.canonical.roundId(partition), scopes });
    if (ended.rejection !== undefined || ended.commands[0]?.kind !== "stopEnded") throw new Error("canonical Stop end refused");
    const outputPermit = stop.outputToken === undefined ? undefined : this.#finishPermits.get(stop.outputToken);
    if (stop.outputToken !== undefined && outputPermit?.authorized === true) {
      const outputEnded = this.canonical.transition({ kind: "finishEnd",
        group: this.canonical.partitionId(partition), round: this.canonical.roundId(partition),
        attempt: stop.id, token: this.canonical.collectionTokenId(stop.outputToken) });
      if (outputEnded.rejection !== undefined || outputEnded.commands[0]?.kind !== "finishEnded") {
        throw new Error("canonical finish slot end refused");
      }
    }
    if (close) {
      if (Number(round.policy.generation) !== stop.generation) return undefined;
      // Publish the canonical fence before changing the resident's Stop view.
      const admission = this.canonical.canonicalProjection().admissions.find(
        (item) => item.partition === this.canonical.partitionId(partition));
      if (admission === undefined) throw new Error("canonical admission missing at round closure");
      const at = Math.max(this.#bendTime(closedAt + 1), admission.closedAt);
      const closed = this.canonical.transition({ kind: "closePermitRound",
        partition: admission.partition, lifetime: admission.lifetime,
        round: stop.generation, at, prospective: !admission.active });
      if (closed.rejection !== undefined || closed.commands[0]?.kind !== "permitRoundClosed" ||
          closed.commands[0].round !== stop.generation) throw new Error("canonical permit closure disagrees with round");
    }
    this.#rounds.set(partition, { ...round, policy: result.state });
    this.#stops.delete(partition);
    if (close) this.canonical.retireRound(partition);
    if (stop.outputToken !== undefined) {
      const permit = this.#finishPermits.get(stop.outputToken);
      if (permit !== undefined) permit.revoked = true;
    }
    if (!close) return undefined;
    for (const [key, permit] of this.#permits) if (permit.partition === partition) this.#permits.delete(key);
    const waiter = this.#backgroundWaiters.get(partition);
    if (waiter !== undefined) this.releaseBackground(partition, waiter.token);
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
    return { reservedContinuations: this.#rounds.has(partition) ? this.#continuationCount(partition) : 0,
      submitted: [...batches.values()].filter((status) => status === "submitted").length,
      uncertain: [...batches.values()].filter((status) => status === "uncertain").length,
      editPermits: [...this.#permits.values()].filter((permit) => permit.partition === partition).length };
  }

  expireStop(partition: string, token: string): number | undefined {
    const stop = this.#stops.get(partition);
    if (stop?.token !== token) return undefined;
    // An authorized output may have reached the runtime. Preserve its count
    // and round; finishStop releases any provisional output before closing.
    const authorizedOutput = stop.outputToken !== undefined &&
      this.#finishPermits.get(stop.outputToken)?.authorized === true;
    return this.finishStop(partition, token,
      !authorizedOutput && bendRoundExpireClose(this.#rounds.get(partition)?.policy.barrier === true));
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
    const consumed = this.canonical.transition({ kind: "continuationConsume",
      group: this.canonical.partitionId(partition), round: this.canonical.roundId(partition) });
    if (consumed.rejection !== undefined || consumed.commands[0]?.kind !== "continuationConsumed") return false;
    const result = bendRoundConsume(chain.policy);
    if (result.$ !== "Granted") throw new Error("legacy round projection refused canonical continuation");
    this.#rounds.set(partition, { ...chain, policy: result.state,
      ...(continuationDigest === undefined ? {} : { continuationDigest }) });
    return true;
  }

  hasVirtualRoundContinuationBudget(partition: string): boolean {
    const chain = this.#rounds.get(partition);
    return chain !== undefined && chain.policy.active && this.#continuationCount(partition) < MAX_STOP_CONTINUATIONS;
  }

  #continuationCount(partition: string): number {
    const group = this.canonical.partitionId(partition);
    const round = this.canonical.roundId(partition);
    return this.canonical.canonicalProjection().delivery.counters.find((item) =>
      item.group === group && item.round === round)?.used ?? 0;
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
    if (permit !== undefined && (!permit.authorized || permit.terminal ||
        permit.selected.length !== selectedUnits.length ||
        permit.selected.some((unit, index) => unit !== selectedUnits[index]))) return false;
    if (!this.#transitionBatchStatus(token, "submitted")) return false;
    if (permit !== undefined) {
      const stop = this.#stops.get(permit.partition);
      if (stop === undefined) throw new Error("canonical finish owner missing at submission");
      const recorded = this.canonical.transition({ kind: "finishTerminal",
        group: this.canonical.partitionId(permit.partition),
        round: this.canonical.roundId(permit.partition), attempt: stop.id,
        token: this.canonical.collectionTokenId(token), selected: permit.selected,
        outcome: "acknowledged" });
      if (recorded.rejection !== undefined || recorded.commands[0]?.kind !== "finishRecorded") {
        throw new Error("canonical finish submission refused");
      }
      permit.terminal = true;
    }
    return true;
  }

  markUncertain(token: string): boolean {
    if (!this.#transitionBatchStatus(token, "uncertain")) return false;
    const permit = this.#finishPermits.get(token);
    if (permit !== undefined && permit.authorized && !permit.terminal) {
      const stop = this.#stops.get(permit.partition);
      if (stop === undefined) throw new Error("canonical finish owner missing at uncertain result");
      const recorded = this.canonical.transition({ kind: "finishTerminal",
        group: this.canonical.partitionId(permit.partition),
        round: this.canonical.roundId(permit.partition), attempt: stop.id,
        token: this.canonical.collectionTokenId(token), selected: permit.selected,
        outcome: "unknown" });
      if (recorded.rejection !== undefined || recorded.commands[0]?.kind !== "finishRecorded") {
        throw new Error("canonical uncertain submission refused");
      }
      permit.terminal = true;
    }
    return true;
  }

  release(token: string): void {
    const permit = this.#finishPermits.get(token);
    if (permit !== undefined && !permit.revoked) {
      const stop = this.#stops.get(permit.partition);
      if (stop !== undefined && !permit.terminal) {
        const common = { group: this.canonical.partitionId(permit.partition),
          round: this.canonical.roundId(permit.partition), attempt: stop.id,
          token: this.canonical.collectionTokenId(token) };
        const result = permit.authorized
          ? this.canonical.transition({ kind: "finishTerminal", ...common,
              selected: permit.selected, outcome: "failed" })
          : this.canonical.transition({ kind: "finishRelease", ...common });
        const expected = permit.authorized ? "finishRecorded" : "finishReleased";
        if (result.rejection !== undefined || result.commands[0]?.kind !== expected) {
          throw new Error("canonical finish release refused");
        }
        permit.terminal = permit.authorized;
      }
      permit.revoked = true;
      if (!permit.authorized) {
        this.#finishPermits.delete(token);
        if (stop?.outputToken === token) delete stop.outputToken;
      }
    }
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
      const result = this.canonical.transition({ kind: "collectionExpireBackground",
        group: this.canonical.partitionId(partition), token: waiter.id,
        elapsed, lifetime: BACKGROUND_WAITER_EXPIRY_MS });
      if (result.rejection !== undefined) throw new Error("canonical background expiry refused");
      if (result.commands[0]?.kind === "collectionBackgroundReleased") this.#backgroundWaiters.delete(partition);
      else if (result.commands[0]?.kind !== "collectionBackgroundKept") throw new Error("invalid canonical background expiry");
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
