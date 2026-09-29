import { createHash } from "node:crypto";
import { monotonicNow, PRE_EDIT_ADMISSION_DEADLINE_MS } from "./hook-clock.ts";
import { canonicalValue } from "../direct-event/model.ts";
import { CapacityLedger } from "./capacity.ts";
import { DELIVERY_LEASE_MS } from "./protocol.ts";

/** Shared round and source-free handoff state for every agent runtime. */
export const MAX_COMPOSED_ROUNDS = 64;
export const EDIT_PERMIT_EXPIRY_MS = 30_000;
export const BACKGROUND_WAITER_EXPIRY_MS = 20_000;

type Round = {
  // Native event identities prevent one host callback from claiming two permits.
  // Admission, Stop phase, and continuation authority remain canonical.
  readonly events: ReadonlySet<string>;
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
  readonly canonical: CapacityLedger;
  constructor(canonical = new CapacityLedger()) {
    this.canonical = canonical;
  }
  readonly #rounds = new Map<string, Round>();
  readonly #permits = new Map<string, { readonly partition: string; readonly generation: number;
    readonly expiresAt: number; readonly token: number; readonly tool: number }>();
  readonly #toolIds = new Map<string, number>();
  #nextToolId = 1;
  readonly #stops = new Map<string, { token: string; id: number; generation: number; canonicalRound: number;
    continuationsAtStart: number; outputToken?: string }>();
  #nextStopId = 1;
  readonly #submissions = new Map<string, Submission>();
  readonly #finishPermits = new Map<string, {
    readonly partition: string; readonly generation: number; readonly attempt: string;
    readonly selected: ReadonlyArray<number>;
    readonly advice: ReadonlyArray<{ readonly id: string; readonly fingerprints: ReadonlyArray<string> }>;
    authorized: boolean; terminal: boolean; revoked: boolean;
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
    if (previous !== undefined) return this.isActive(partition);
    // A notification without an admitted edit carries no round authority.
    return true;
  }

  #startRound(partition: string): Round | undefined {
    if (this.#rounds.size >= MAX_COMPOSED_ROUNDS) return undefined;
    const round: Round = { events: new Set() };
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
    const round = this.#rounds.get(partition);
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
      if (permit === undefined) return undefined;
      if (previous === undefined && this.#rounds.size >= MAX_COMPOSED_ROUNDS) {
        this.#releaseAdmissionPermit(partition, permit.token);
        return undefined;
      }
      const admission = this.canonical.canonicalProjection().admissions.find(
        (item) => item.partition === this.canonical.partitionId(partition));
      if (admission === undefined || permit.generation !== admission.round + (admission.active ? 0 : 1)) {
        this.#releaseAdmissionPermit(partition, permit.token);
        return undefined;
      }
      let consumed;
      try {
        consumed = this.canonical.consumeEditPermit(partition, { kind: "consumePermit",
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
      if (previous === undefined) {
        previous = this.#startRound(partition);
        if (previous === undefined) return undefined;
      }
      this.#rounds.set(partition, { ...previous, events: new Set([...previous.events, event]) });
      return this.generation(partition);
    }
    // Internal deterministic fixtures and the non-installed API may start a
    // first round; reopening always requires the runtime's prospective permit.
    const partitionId = this.canonical.partitionId(partition);
    const tool = this.#toolId(partition, event);
    const syntheticNow = this.#bendTime(Math.max(1, now));
    const issued = this.canonical.transition({ kind: "issuePermit", partition: partitionId,
      lifetime: 1, tool, started: syntheticNow, deadline: syntheticNow + this.#bendTime(EDIT_PERMIT_EXPIRY_MS),
      now: syntheticNow, facts: { clockValid: true, withinHookWindow: true,
        startedAfterClosure: previous === undefined || this.isActive(partition),
        duplicateEvent: previous?.events.has(event) ?? false,
        permitCount: this.#permits.size, permitLimit: 1024,
        roundCount: this.#rounds.size, roundLimit: MAX_COMPOSED_ROUNDS,
        newRound: previous === undefined, eventCount: previous?.events.size ?? 0, eventLimit: 4096 } });
    const permit = issued.commands[0];
    if (permit?.kind !== "permitIssued") return undefined;
    const consumed = this.canonical.consumeEditPermit(partition, { kind: "consumePermit", partition: partitionId,
      lifetime: 1, token: permit.token, tool, now: syntheticNow });
    if (consumed.commands[0]?.kind !== "permitConsumed") {
      this.#releaseAdmissionPermit(partition, permit.token);
      return undefined;
    }
    if (previous === undefined) {
      previous = this.#startRound(partition);
      if (previous === undefined) return undefined;
    }
    if (consumed.commands[0].round !== this.generation(partition)) return undefined;
    this.#rounds.set(partition, { ...previous, events: new Set([...previous.events, event]) });
    return this.generation(partition);
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
    const admission = this.canonical.canonicalProjection().admissions.find(
      (item) => item.partition === this.canonical.partitionId(partition));
    // Only accepted post-edit admission binds a host round.
    const result = this.canonical.transition({ kind: "roundActivityCheck",
      bound: this.#rounds.has(partition), hasAdmission: admission !== undefined,
      round: admission?.round ?? 0, active: admission?.active ?? false,
      closedAt: admission?.closedAt ?? 0, expectedGeneration: generation });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical round activity refused");
    return result.commands[0]?.kind === "roundActive";
  }

  beginStop(partition: string, token: string): boolean {
    const id = this.#nextStopId++;
    const decision = this.canonical.transition({ kind: "roundBeginStopCheck",
      active: this.isActive(partition), hasStop: this.#stops.has(partition), token: id });
    if (decision.rejection !== undefined || decision.commands[0]?.kind !== "roundStopBegun") return false;
    this.#stops.set(partition, { token, id, generation: this.generation(partition), canonicalRound: this.canonical.roundId(partition),
      continuationsAtStart: this.#continuationCount(partition) });
    this.canonical.roundId(partition);
    return true;
  }

  ownsStop(partition: string, token: string): boolean {
    const stop = this.#stops.get(partition);
    const decision = this.canonical.transition({ kind: "roundOwnsStopCheck",
      active: stop !== undefined && this.isActive(partition, stop.generation),
      tokenMatches: stop?.token === token, deciding: this.isDeciding(partition) });
    if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical Stop ownership refused");
    return decision.commands[0]?.kind === "roundStopOwned";
  }

  finishGate(partition: string, token: string, extraUnfinished: number,
    deadlineReached: boolean):
    { readonly status: "waiting" } |
    { readonly status: "cutoff"; readonly cancelledSource: number[];
      readonly cancelledJev: number[]; readonly limited: boolean } | undefined {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== token || round === undefined || !this.isActive(partition, stop.generation)) return undefined;
    const canonicalRound = stop.canonicalRound;
    const projection = this.canonical.canonicalProjection();
    const owner = this.canonical.partitionId(partition);
    const cutoff = this.canonical.transition({ kind: "stopGroupPolled",
      group: this.canonical.partitionId(partition), lifetime: 1,
      round: canonicalRound, scopes: [{ partition: owner, round: canonicalRound }],
      deadline: deadlineReached, extraPending: extraUnfinished > 0,
      continuations: this.#continuationCount(partition, canonicalRound) });
    if (cutoff.rejection !== undefined) return undefined;
    if (cutoff.commands[0]?.kind === "waitForWork") return { status: "waiting" };
    const terminal = cutoff.commands.at(-1)?.kind;
    if (terminal !== "finishReady" && terminal !== "finishLimit") throw new Error("invalid canonical Stop command");
    const source = new Set(projection.work.filter((item) => item.partition === owner && item.round === canonicalRound &&
      (item.kind === "sourceQueued" || item.kind === "sourceReading")).map((item) => item.operation));
    const cancelled = cutoff.commands.filter((item) => item.kind === "cancelWork").map((item) => item.operation);
    for (const command of cutoff.commands) if (command.kind === "reservationReleased") {
      this.canonical.acknowledgeStopRelease(command.id);
    }
    for (const [key, permit] of this.#permits) if (permit.partition === partition) {
      const released = this.canonical.transition({ kind: "releasePermit",
        partition: this.canonical.partitionId(partition), lifetime: 1, token: permit.token });
      if (released.rejection !== undefined || released.commands[0]?.kind !== "permitReleased") {
        throw new Error("canonical permit cutoff disagrees with resident");
      }
      this.#permits.delete(key);
    }
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
      this.#stageSubmission(item.id, partition, outputToken, item.findings, "stop", now, "reserved", item.unit)
    ] as const);
    if (staged.some(([, submission]) => submission === undefined)) {
      for (const [id, submission] of staged) if (submission !== undefined) {
        const rollback = this.canonical.transition({ kind: "submissionRelease",
          advice: this.#submissionAdviceId(id), token: submission.batches.get(outputToken)!.id });
        if (rollback.rejection !== undefined || rollback.commands[0]?.kind !== "submissionReleased") {
          throw new Error("canonical staged submission rollback refused");
        }
      }
      this.canonical.transition({ kind: "finishRelease", group, round: currentRound,
        attempt: stop.id, token: tokenId });
      return { kind: "failed" };
    }
    stop.outputToken = outputToken;
    this.#finishPermits.set(outputToken, { partition, generation: stop.generation, attempt,
      selected, advice: advice.map((item) => ({ id: item.id,
        fingerprints: item.findings.map(fingerprint) })),
      authorized: false, terminal: false, revoked: false });
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

  isFinishAuthorized(token: string): boolean {
    return this.#finishPermits.get(token)?.authorized === true;
  }

  finishSelectionMatches(token: string, advice: ReadonlyArray<{
    readonly id: string; readonly unit: number; readonly findings: ReadonlyArray<unknown>;
  }>): boolean {
    const permit = this.#finishPermits.get(token);
    if (permit === undefined || permit.revoked || permit.advice.length !== advice.length) return false;
    const selected = advice.flatMap((item) => item.findings.map(() => item.unit));
    if (permit.selected.length !== selected.length ||
        permit.selected.some((unit, index) => unit !== selected[index])) return false;
    if (!advice.every((item, index) => {
      const expected = permit.advice[index];
      const digests = item.findings.map(fingerprint);
      return expected?.id === item.id && expected.fingerprints.length === digests.length &&
        expected.fingerprints.every((digest, position) => digest === digests[position]);
    })) return false;
    return this.#finishBatchesCurrent(token, permit);
  }

  #finishBatchesCurrent(token: string, permit: { readonly partition: string;
    readonly advice: ReadonlyArray<{ readonly id: string; readonly fingerprints: ReadonlyArray<string> }> }): boolean {
    const canonical = this.canonical.canonicalProjection().delivery.submissions.batches;
    return permit.advice.every((item) => {
      const batch = this.#submissions.get(item.id)?.batches.get(token);
      const canonicalBatch = canonical.find((candidate) =>
        candidate.advice === this.#submissionAdviceId(item.id) && candidate.token === batch?.id);
      return batch?.status === "reserved" && canonicalBatch?.phase === "reserved" &&
        canonicalBatch.group === this.canonical.partitionId(permit.partition) &&
        canonicalBatch.round === this.canonical.roundId(permit.partition) &&
        canonicalBatch.fingerprints.length === new Set(item.fingerprints).size &&
        item.fingerprints.every((digest) => batch.fingerprints.has(digest) &&
          canonicalBatch.fingerprints.includes(
          this.#fingerprintId(item.id, digest)));
    });
  }

  authorizeFinishOutput(partition: string, token: string): boolean {
    const permit = this.#finishPermits.get(token);
    if (permit === undefined) {
      const decision = this.canonical.transition({ kind: "deliveryUnreservedStopCheck",
        active: this.isActive(partition), deciding: this.isDeciding(partition) });
      if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical unreserved Stop gate refused");
      return decision.commands[0]?.kind === "deliveryUnreservedStopAllowed";
    }
    const stop = this.#stops.get(partition);
    if (permit.partition !== partition || !this.isActive(partition, permit.generation) ||
        permit.revoked || stop?.token !== permit.attempt || stop.outputToken !== token) return false;
    if (!this.#finishBatchesCurrent(token, permit)) return false;
    const authorization = this.canonical.transition({ kind: "finishAuthorize",
      group: this.canonical.partitionId(partition), round: this.canonical.roundId(partition),
      attempt: stop.id, token: this.canonical.collectionTokenId(token),
      selected: permit.selected });
    if (authorization.rejection !== undefined || authorization.commands[0]?.kind !== "finishAuthorized") {
      this.release(token);
      return false;
    }
    permit.authorized = true;
    if (!this.#transitionBatchStatus(token, "authorized")) {
      this.release(token);
      return false;
    }
    return true;
  }

  finishStop(partition: string, token: string, close: boolean, closedAt = monotonicNow()): number | undefined {
    const stop = this.#stops.get(partition);
    const round = this.#rounds.get(partition);
    if (stop?.token !== token || round === undefined || !this.isActive(partition, stop.generation)) return undefined;
    const canonicalRound = stop.canonicalRound;
    // A provisional output has not crossed the IPC write boundary. If Stop
    // ends while that response is gated, release its slot and close the round.
    const terminal = this.canonical.transition({ kind: "roundStopTerminalCheck",
      hasOutput: stop.outputToken !== undefined,
      authorized: stop.outputToken !== undefined &&
        this.#finishPermits.get(stop.outputToken)?.authorized === true,
      requestedClose: close });
    const command = terminal.commands[0];
    if (terminal.rejection !== undefined || command?.kind !== "roundStopTerminal") return undefined;
    if (command.revokeProvisional && stop.outputToken !== undefined) {
      if (!this.revokeProvisionalFinishOutput(partition, token, stop.outputToken)) return undefined;
    }
    close = command.close;
    const owner = this.canonical.partitionId(partition);
    const ended = this.canonical.transition({ kind: "stopGroupEnded", group: this.canonical.partitionId(partition),
      lifetime: 1, round: canonicalRound, scopes: [{ partition: owner, round: canonicalRound }] });
    if (ended.rejection !== undefined || ended.commands[0]?.kind !== "stopEnded") throw new Error("canonical Stop end refused");
    const outputPermit = stop.outputToken === undefined ? undefined : this.#finishPermits.get(stop.outputToken);
    if (stop.outputToken !== undefined && outputPermit?.authorized === true) {
      const outputEnded = this.canonical.transition({ kind: "finishEnd",
        group: this.canonical.partitionId(partition), round: canonicalRound,
        attempt: stop.id, token: this.canonical.collectionTokenId(stop.outputToken) });
      if (outputEnded.rejection !== undefined || outputEnded.commands[0]?.kind !== "finishEnded") {
        throw new Error("canonical finish slot end refused");
      }
    }
    if (close) {
      if (this.generation(partition) !== stop.generation) return undefined;
      // Publish the canonical fence before changing the resident's Stop view.
      const admission = this.canonical.canonicalProjection().admissions.find(
        (item) => item.partition === this.canonical.partitionId(partition));
      if (admission === undefined) throw new Error("canonical admission missing at round closure");
      const at = Math.max(this.#bendTime(closedAt + 1), admission.closedAt);
      const closed = this.canonical.transition({ kind: "closePermitRound",
        partition: admission.partition, lifetime: admission.lifetime,
        round: stop.generation, at });
      if (closed.rejection !== undefined || closed.commands[0]?.kind !== "permitRoundClosed" ||
          closed.commands[0].round !== stop.generation) throw new Error("canonical permit closure disagrees with round");
    }
    this.#stops.delete(partition);
    if (close) this.canonical.retireRound(partition, stop.canonicalRound);
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
      if (submission.partition === partition) this.forget(id);
    }
    return stop.generation;
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
    const expiry = this.canonical.transition({ kind: "roundExpireCloseCheck",
      barrier: this.#stopBarrier(partition), authorizedOutput });
    if (expiry.rejection !== undefined || expiry.commands.length !== 1) throw new Error("canonical Stop expiry refused");
    return this.finishStop(partition, token, expiry.commands[0]?.kind === "roundExpireCloses");
  }

  isDeciding(partition: string): boolean {
    const owner = this.canonical.partitionId(partition);
    return this.canonical.canonicalProjection().rounds.find((item) => item.partition === owner)?.deciding === true;
  }

  canSubmit(partition: string, surface: DeliverySurface): boolean {
    const result = this.canonical.transition({ kind: "deliverySubmissionAllowedCheck",
      active: this.isActive(partition), barrier: this.#stopBarrier(partition),
      deciding: this.isDeciding(partition), surface, existingToken: false, finishPermit: false });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical submission eligibility refused");
    return result.commands[0]?.kind === "deliverySubmissionAllowed";
  }

  canBeginSubmission(partition: string, surface: DeliverySurface, token: string): boolean {
    const result = this.canonical.transition({ kind: "deliverySubmissionAllowedCheck",
      active: this.isActive(partition), barrier: this.#stopBarrier(partition),
      deciding: this.isDeciding(partition), surface, existingToken: this.hasToken(token),
      finishPermit: surface === "stop" && this.hasFinishPermit(token) });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical submission eligibility refused");
    return result.commands[0]?.kind === "deliverySubmissionAllowed";
  }

  canBeginExistingToken(surface: DeliverySurface, token: string): boolean {
    const result = this.canonical.transition({ kind: "deliveryExistingTokenCheck",
      surface, existingToken: this.hasToken(token),
      finishPermit: surface === "stop" && this.hasFinishPermit(token) });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical existing token gate refused");
    return result.commands[0]?.kind === "deliveryExistingTokenAllowed";
  }

  generation(partition: string): number {
    if (!this.#rounds.has(partition)) return 0;
    const admission = this.canonical.canonicalProjection().admissions.find(
      (item) => item.partition === this.canonical.partitionId(partition));
    return admission === undefined ? 0 : Math.max(1, admission.round);
  }

  /** Reserve one request from the active virtual round's continuation budget. */
  consumeStop(partition: string, continuationDigest?: string): boolean {
    if (!this.hasVirtualRoundContinuationBudget(partition)) return false;
    const consumed = this.canonical.transition({ kind: "continuationConsume",
      group: this.canonical.partitionId(partition), round: this.canonical.roundId(partition) });
    if (consumed.rejection !== undefined || consumed.commands[0]?.kind !== "continuationConsumed") return false;
    return true;
  }

  hasVirtualRoundContinuationBudget(partition: string): boolean {
    if (!this.#rounds.has(partition)) return false;
    const result = this.canonical.transition({ kind: "roundContinuationBudgetCheck",
      active: this.isActive(partition), count: this.#continuationCount(partition) });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical continuation budget refused");
    return result.commands[0]?.kind === "roundContinuationAvailable";
  }

  #stopBarrier(partition: string): boolean {
    const stop = this.#stops.get(partition);
    const result = this.canonical.transition({ kind: "roundBarrierCheck",
      hasStop: stop !== undefined, usedAtStart: stop?.continuationsAtStart ?? 0,
      usedNow: stop === undefined ? 0 : this.#continuationCount(partition) });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical Stop barrier refused");
    return result.commands[0]?.kind === "roundBarrierRaised";
  }

  #continuationCount(partition: string, round = this.canonical.roundId(partition)): number {
    const group = this.canonical.partitionId(partition);
    return this.canonical.canonicalProjection().delivery.counters.find((item) =>
      item.group === group && item.round === round)?.used ?? 0;
  }

  /** Reserve before writing; a crash or lost acknowledgement remains uncertain. */
  #submissionTokenId(token: string): number {
    return this.canonical.collectionTokenId(token);
  }

  #submissionAdviceId(adviceId: string): number {
    return this.canonical.collectionTokenId(`submission-advice\0${adviceId}`);
  }

  #fingerprintId(adviceId: string, digest: string): number {
    return this.canonical.collectionTokenId(`submission-finding\0${adviceId}\0${digest}`);
  }

  #stageSubmission(
    adviceId: string, partition: string, token: string,
    findings: ReadonlyArray<unknown>, surface: DeliverySurface, now: number,
    status: "reserved" | "authorized", unit?: number,
  ): Submission | undefined {
    const generation = this.generation(partition);
    if (generation === 0 || !this.isActive(partition, generation)) return undefined;
    const existing = this.#submissions.get(adviceId);
    const batches = existing?.partition === partition && existing.generation === generation
      ? new Map(existing.batches) : new Map<string, SubmissionBatch>();
    if (batches.has(token)) return undefined;
    const fingerprints = new Set(findings.map(fingerprint));
    if (fingerprints.size === 0) return undefined;
    const id = this.#submissionTokenId(token);
    const offered = this.canonical.transition({ kind: "submissionBegin",
      advice: this.#submissionAdviceId(adviceId), group: this.canonical.partitionId(partition),
      round: this.canonical.roundId(partition), token: id, surface,
      authorizeNow: status === "authorized",
      fingerprints: [...fingerprints].map((digest) => this.#fingerprintId(adviceId, digest)),
      units: unit === undefined ? [] : findings.map(() => unit) });
    if (offered.rejection !== undefined || offered.commands[0]?.kind !== "submissionBegun") {
      return undefined;
    }
    if (status === "authorized" && this.canonical.canonicalProjection().delivery.submissions.batches.some(
      (batch) => batch.advice === this.#submissionAdviceId(adviceId) && batch.token === id &&
        batch.phase !== "authorized")) throw new Error("canonical submission authorization missing");
    batches.set(token, { id, surface, at: now, fingerprints, status });
    return { partition, generation, batches };
  }

  beginSubmission(
    adviceId: string,
    partition: string,
    token: string,
    findings: ReadonlyArray<unknown>,
    surface: DeliverySurface,
    now: number,
    unit?: number,
  ): boolean {
    const staged = this.#stageSubmission(adviceId, partition, token, findings, surface, now, "authorized", unit);
    if (staged === undefined) return false;
    this.#submissions.set(adviceId, staged);
    return true;
  }

  #transitionBatchStatus(token: string, status: SubmissionBatch["status"]): boolean {
    const matching = [...this.#submissions].flatMap(([id, submission]) => {
      const batch = submission.batches.get(token);
      return batch === undefined ? [] : [{ id, submission, batch }];
    });
    const required = status === "authorized" ? "reserved" : "authorized";
    const canonical = this.canonical.canonicalProjection().delivery.submissions;
    if (matching.some(({ id, batch }) => {
      if (batch.status !== required) return true;
      const advice = this.#submissionAdviceId(id);
      const owner = canonical.batches.find((item) => item.advice === advice && item.token === batch.id);
      return owner?.phase !== required || [...batch.fingerprints].some((digest) =>
        canonical.leases.find((lease) => lease.advice === advice &&
          lease.fingerprint === this.#fingerprintId(id, digest))?.phase !== required);
    })) return false;
    const staged: Array<readonly [string, Submission]> = [];
    for (const { id, submission, batch } of matching) {
      const result = this.canonical.transition(status === "authorized"
        ? { kind: "submissionAuthorize", advice: this.#submissionAdviceId(id), token: batch.id }
        : { kind: "submissionTerminal", advice: this.#submissionAdviceId(id), token: batch.id,
            certain: status === "submitted" });
      const expected = status === "authorized" ? "submissionAuthorized" : "submissionRecorded";
      if (result.rejection !== undefined || result.commands[0]?.kind !== expected) {
        throw new Error("canonical submission transition refused resident owner");
      }
      const batches = new Map(submission.batches);
      batches.set(token, { ...batch, status });
      const next: Submission = { ...submission, batches };
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
      const batch = submission.batches.get(token);
      if (batch === undefined) continue;
      if (batch.status === "reserved" || batch.status === "authorized") {
        const rollback = this.canonical.transition({ kind: "submissionRelease",
          advice: this.#submissionAdviceId(adviceId), token: batch.id });
        if (rollback.rejection !== undefined || rollback.commands[0]?.kind !== "submissionReleased") {
          throw new Error("canonical submission rollback refused");
        }
      }
      const batches = new Map(submission.batches);
      batches.delete(token);
      if (batches.size === 0) {
        this.#submissions.delete(adviceId);
        continue;
      }
      this.#submissions.set(adviceId, { ...submission, batches });
    }
  }

  forget(adviceId: string): void {
    const result = this.canonical.transition({ kind: "submissionForget",
      advice: this.#submissionAdviceId(adviceId) });
    if (result.rejection !== undefined || result.commands[0]?.kind !== "submissionForgotten") {
      throw new Error("canonical submission forget refused");
    }
    this.#submissions.delete(adviceId);
  }

  suppresses(adviceId: string, partition: string, finding: unknown, surface?: DeliverySurface): boolean {
    const submission = this.#submissions.get(adviceId);
    if (submission === undefined || submission.partition !== partition ||
        submission.generation !== this.generation(partition)) return false;
    const digest = fingerprint(finding);
    const checked = this.canonical.transition({ kind: "submissionSuppressCheck",
      advice: this.#submissionAdviceId(adviceId), fingerprint: this.#fingerprintId(adviceId, digest),
      round: this.canonical.roundId(partition), surface: surface ?? "edit" });
    if (checked.rejection !== undefined) throw new Error("canonical submission suppression refused");
    return checked.commands[0]?.kind === "submissionSuppresses";
  }

  backgroundReofferable(adviceId: string, token: string): boolean {
    const batch = this.#submissions.get(adviceId)?.batches.get(token);
    if (batch === undefined) return false;
    const checked = this.canonical.transition({ kind: "submissionReofferCheck",
      advice: this.#submissionAdviceId(adviceId), token: batch.id });
    if (checked.rejection !== undefined) throw new Error("canonical submission reoffer check refused");
    return checked.commands[0]?.kind === "submissionReofferable";
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
    for (const [adviceId, submission] of this.#submissions) {
      for (const [token, batch] of submission.batches) {
        const elapsed = Math.floor(Math.min(DELIVERY_LEASE_MS, Math.max(0, now - batch.at)));
        const checked = this.canonical.transition({ kind: "submissionExpiryCheck",
          advice: this.#submissionAdviceId(adviceId), token: batch.id, elapsed,
          lifetime: DELIVERY_LEASE_MS });
        if (checked.rejection !== undefined) throw new Error("canonical submission expiry refused");
        if (checked.commands[0]?.kind === "submissionExpired") expired.add(token);
      }
    }
    for (const token of expired) this.markUncertain(token);
    // Round fences and continuation counts never expire in a resident lifetime.
  }
}
