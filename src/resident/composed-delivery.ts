import { createHash } from "node:crypto";
import { monotonicNow, PRE_EDIT_ADMISSION_DEADLINE_MS } from "./hook-clock.ts";
import { canonicalValue } from "../direct-event/model.ts";
import type { CapacityLedger } from "./capacity.ts";
import type { CompletedEditReason } from "../canonical/adapter.ts";
import { DEFAULT_EDIT_PERMIT_LIMITS } from "../configuration/types.ts";
import { DEFAULT_VIRTUAL_ROUND_QUIET_MS } from "../configuration/types.ts";
import { DELIVERY_LEASE_MS } from "./protocol.ts";

/** Shared round and source-free handoff state for every agent runtime. */
export const MAX_BACKGROUND_WAITERS = 64;
export const EDIT_PERMIT_EXPIRY_MS = 30_000;
export const BACKGROUND_WAITER_EXPIRY_MS = 20_000;
export const VIRTUAL_ROUND_QUIET_MS = DEFAULT_VIRTUAL_ROUND_QUIET_MS;

type Round = { readonly quietMs: number };
export type RepeatEditDiagnostic = {
  readonly kind: "repeat-edit-id";
  readonly phase: "pending" | "completed";
  readonly completedReason?: CompletedEditReason;
  readonly identityDigest: string;
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

const fingerprint = (finding: unknown): string => createHash("sha256").update(canonicalValue(finding)).digest("hex");

export type EditPermit = {
  readonly partition: string;
  readonly generation: number;
  readonly expiresAt: number;
  readonly token: number;
  readonly tool: number;
  readonly quietMs: number;
  logged: boolean;
};
type StopRecord = {
  token: string;
  id: number;
  generation: number;
  canonicalRound: number;
  continuationsAtStart: number;
  outputToken?: string;
};
type FinishPermit = {
  readonly partition: string;
  readonly generation: number;
  readonly attempt: string;
  readonly selected: ReadonlyArray<number>;
  readonly advice: ReadonlyArray<{ readonly id: string; readonly fingerprints: ReadonlyArray<string> }>;
  authorized: boolean;
  terminal: boolean;
  revoked: boolean;
};
export type DeliveryState = {
  readonly rounds: ReadonlyMap<string, Round>;
  readonly permits: ReadonlyMap<string, EditPermit>;
  readonly toolIds: ReadonlyMap<string, number>;
  readonly toolKeys: ReadonlyMap<number, string>;
  readonly nextToolId: number;
  readonly stops: ReadonlyMap<string, StopRecord>;
  readonly nextStopId: number;
  readonly submissions: ReadonlyMap<string, Submission>;
  readonly finishPermits: ReadonlyMap<string, FinishPermit>;
  readonly backgroundWaiters: ReadonlyMap<string, { readonly token: string; readonly id: number; readonly at: number }>;
};
export type DeliveryDraft = {
  -readonly [K in keyof DeliveryState]: DeliveryState[K] extends ReadonlyMap<infer Key, infer Value>
    ? Map<Key, Value>
    : DeliveryState[K];
};
export const initialDelivery = (): DeliveryState => ({
  rounds: new Map(),
  permits: new Map(),
  toolIds: new Map(),
  toolKeys: new Map(),
  nextToolId: 1,
  stops: new Map(),
  nextStopId: 1,
  submissions: new Map(),
  finishPermits: new Map(),
  backgroundWaiters: new Map(),
});
export const draftDelivery = (current: DeliveryState): DeliveryDraft => ({
  ...current,
  rounds: new Map(current.rounds),
  toolIds: new Map(current.toolIds),
  toolKeys: new Map(current.toolKeys),
  permits: new Map([...current.permits].map(([key, value]) => [key, { ...value }])),
  stops: new Map([...current.stops].map(([key, value]) => [key, { ...value }])),
  submissions: new Map(
    [...current.submissions].map(([key, value]) => [
      key,
      { ...value, batches: new Map([...value.batches].map(([token, batch]) => [token, { ...batch }])) },
    ]),
  ),
  finishPermits: new Map([...current.finishPermits].map(([key, value]) => [key, { ...value }])),
  backgroundWaiters: new Map(current.backgroundWaiters),
});

/** Check native permit and waiter ownership before publishing the draft. */
export const assertDeliveryState = (state: DeliveryState, owner: CapacityLedger): void => {
  const projection = owner.canonicalProjection();
  if (
    state.toolIds.size !== state.toolKeys.size ||
    [...state.toolIds].some(([key, id]) => state.toolKeys.get(id) !== key) ||
    projection.completedEdits.some((entry) => !state.toolKeys.has(entry.tool)) ||
    [...state.permits.values()].some((permit) => {
      const partition = owner.knownPartitionId(permit.partition);
      return !projection.admissions.some(
        (admission) =>
          admission.partition === partition &&
          admission.permits.some(
            (native) =>
              native.token === permit.token && native.tool === permit.tool && native.round === permit.generation,
          ),
      );
    }) ||
    [...state.backgroundWaiters].some(
      ([partition, waiter]) =>
        !projection.collection.claims.some(
          (claim) => claim.group === owner.knownPartitionId(partition) && claim.owner === waiter.id,
        ),
    )
  ) {
    throw new Error("native delivery handles differ from canonical state");
  }
};

/** Read-only delivery views leave the owned record unchanged. */
export const deliveryView = (state: DeliveryState, canonicalOwner: CapacityLedger) => {
  function recentEditCount(): number {
    return canonicalOwner.canonicalProjection().completedEdits.length;
  }

  function editIdentityMappingCount(): number {
    return state.toolIds.size;
  }

  function addSubmissionTokenKeys(live: Set<string>, adviceId: string, submission: Submission): void {
    for (const [token, batch] of submission.batches) {
      live.add(token);
      for (const digest of batch.fingerprints) live.add(`submission-finding\0${adviceId}\0${digest}`);
    }
  }
  function liveCollectionTokenKeys(): Set<string> {
    const live = new Set<string>();
    for (const waiter of state.backgroundWaiters.values()) live.add(waiter.token);
    for (const stop of state.stops.values()) if (stop.outputToken !== undefined) live.add(stop.outputToken);
    for (const token of state.finishPermits.keys()) live.add(token);
    for (const [adviceId, submission] of state.submissions) {
      live.add(`submission-advice\0${adviceId}`);
      addSubmissionTokenKeys(live, adviceId, submission);
    }
    return live;
  }

  function hasFinishPermit(token: string): boolean {
    return state.finishPermits.has(token);
  }

  function isFinishAuthorized(token: string): boolean {
    return state.finishPermits.get(token)?.authorized === true;
  }

  function hasToken(token: string): boolean {
    return [...state.submissions.values()].some((submission) => submission.batches.has(token));
  }
  return {
    canonical: canonicalOwner,
    recentEditCount,
    editIdentityMappingCount,
    liveCollectionTokenKeys,
    hasFinishPermit,
    isFinishAuthorized,
    hasToken,
  };
};

/** Delivery decisions and native staging over an explicit owned draft. */
export const deliveryOperations = (
  state: DeliveryDraft,
  canonicalOwner: CapacityLedger,
  reportRepeat: (diagnostic: RepeatEditDiagnostic) => void,
) => {
  const { hasToken, hasFinishPermit } = deliveryView(state, canonicalOwner);
  function claimBackground(partition: string, token: string, now: number): boolean {
    expire(now);
    const id = canonicalOwner.collectionTokenId(token);
    const claimed = canonicalOwner.transition({
      kind: "collectionClaimBackground",
      group: canonicalOwner.partitionId(partition),
      token: id,
      active: isActive(partition),
      capacity: MAX_BACKGROUND_WAITERS,
    });
    if (claimed.rejection !== undefined || claimed.commands[0]?.kind !== "collectionBackgroundClaimed") return false;
    state.backgroundWaiters.set(partition, { token, id, at: now });
    return true;
  }

  function releaseBackground(partition: string, token: string): void {
    const waiter = state.backgroundWaiters.get(partition);
    if (waiter === undefined) return;
    const release = canonicalOwner.transition({
      kind: "collectionReleaseBackground",
      group: canonicalOwner.partitionId(partition),
      token: canonicalOwner.collectionTokenId(token),
    });
    if (release.rejection !== undefined || release.commands[0]?.kind !== "collectionBackgroundReleased") return;
    state.backgroundWaiters.delete(partition);
    markBackgroundUncertain(partition);
  }
  function markBackgroundUncertain(partition: string): void {
    for (const submission of state.submissions.values()) {
      if (submission.partition !== partition) continue;
      for (const [token, batch] of submission.batches)
        if (batch.surface === "background" && batch.status === "authorized") markUncertain(token);
    }
  }

  function advance(partition: string, marker: string, now: number, promptDigest?: string): boolean {
    expire(now);
    const previous = state.rounds.get(partition);
    // Neither a prompt nor a native runtime turn resets an active round.
    if (previous !== undefined) return isActive(partition);
    const known = canonicalOwner.knownPartitionId(partition);
    if (
      known !== undefined &&
      canonicalOwner
        .canonicalProjection()
        .admissions.some((item) => item.partition === known && item.round > 0 && !item.active)
    )
      return false;
    // A notification without an admitted edit carries no round authority.
    return true;
  }

  function startRound(partition: string, quietMs: number): Round {
    const round: Round = { quietMs };
    state.rounds.set(partition, round);
    return round;
  }

  function editDigest(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  function repeatPending(key: string): void {
    const identityDigest = editDigest(key);
    const pending = state.permits.get(key);
    if (pending === undefined || pending.logged) return;
    try {
      reportRepeat({ kind: "repeat-edit-id", phase: "pending", identityDigest });
    } catch {
      // Diagnostics cannot decide whether an edit is admitted.
    }
    pending.logged = true;
  }

  function checkCompleted(key: string): boolean {
    const tool = toolId(key);
    const result = canonicalOwner.transition({ kind: "checkCompletedEdit", tool });
    const command = result.commands[0];
    if (result.rejection !== undefined || command === undefined) throw new Error("invalid Bend completed edit check");
    if (command.kind === "completedEditAbsent") {
      dropTool(key);
      return false;
    }
    if (command.kind !== "completedEditSeen") throw new Error("invalid Bend completed edit check");
    if (command.report) {
      try {
        reportRepeat({
          kind: "repeat-edit-id",
          phase: "completed",
          identityDigest: editDigest(key),
          completedReason: command.reason,
        });
      } catch {
        // Diagnostics cannot decide whether an edit is admitted.
      }
    }
    return true;
  }

  function dropTool(key: string): void {
    const digest = editDigest(key);
    const id = state.toolIds.get(digest);
    if (id !== undefined) state.toolKeys.delete(id);
    state.toolIds.delete(digest);
  }

  function finishPermit(key: string, reason: CompletedEditReason): void {
    state.permits.delete(key);
    const tool = state.toolIds.get(editDigest(key));
    if (tool === undefined) throw new Error("missing completed edit identity");
    const result = canonicalOwner.transition({ kind: "rememberCompletedEdit", tool, reason });
    const command = result.commands[0];
    if (result.rejection !== undefined || command?.kind !== "completedEditRemembered")
      throw new Error("invalid Bend completed edit record");
    if (command.evicted !== undefined) forgetToolIdentity(command.evicted);
  }
  function forgetToolIdentity(tool: number): void {
    const digest = state.toolKeys.get(tool);
    if (digest === undefined) throw new Error("missing evicted edit identity");
    state.toolKeys.delete(tool);
    state.toolIds.delete(digest);
  }

  function toolId(key: string): number {
    const digest = editDigest(key);
    let id = state.toolIds.get(digest);
    if (id === undefined) {
      id = state.nextToolId++;
      state.toolIds.set(digest, id);
      state.toolKeys.set(id, digest);
    }
    return id;
  }

  function bendTime(ms: number): number {
    return Math.floor(ms * 1000);
  }

  function bendUpperTime(ms: number): number {
    return Math.ceil(ms * 1000);
  }

  function releaseAdmissionPermit(partition: string, token: number): void {
    canonicalOwner.transition({
      kind: "releasePermit",
      partition: canonicalOwner.partitionId(partition),
      lifetime: 1,
      token,
    });
  }

  function ensureFromHostTurn(partition: string, marker: string, now: number): boolean {
    return advance(partition, marker, now);
  }

  function registerEdit(partition: string, eventId: string, startedAt: number, now = monotonicNow()): boolean {
    return registerEditDecision(partition, eventId, startedAt, now).accepted;
  }

  type AdmissionProjection = ReturnType<CapacityLedger["canonicalProjection"]>["admissions"][number];
  type PermitTransition = ReturnType<CapacityLedger["transition"]>;
  type PermitCommand = Extract<PermitTransition["commands"][number], { kind: "permitIssued" }>;
  type EditDecision = { readonly accepted: true } | { readonly accepted: false; readonly reason: string };
  type EditPermitLimits = { readonly perAdvicee: number; readonly resident: number };

  function positiveFiniteStart(started: number): boolean {
    return Number.isFinite(started) && started > 0;
  }
  function prospectivePermitFacts(started: number, now: number, limits: EditPermitLimits) {
    return {
      clockValid: Number.isFinite(now) && positiveFiniteStart(started),
      hookWindow: bendTime(PRE_EDIT_ADMISSION_DEADLINE_MS),
      startedUpper: bendUpperTime(started),
      nowLower: bendTime(now),
      adviceePermitLimit: limits.perAdvicee,
      residentPermitLimit: limits.resident,
    };
  }
  function existingAdmission(known: number | undefined): AdmissionProjection | undefined {
    return known === undefined
      ? undefined
      : canonicalOwner.canonicalProjection().admissions.find((item) => item.partition === known);
  }
  function nextAdmissionRound(admission: AdmissionProjection | undefined): number {
    return admission === undefined ? 1 : admission.round + (admission.active ? 0 : 1);
  }
  function discardFailedPermit(partition: string, key: string, known: number | undefined): void {
    dropTool(key);
    if (known === undefined) canonicalOwner.discardUnusedPartition(partition);
  }
  function residentPermitLimitError(error: unknown): boolean {
    if (!(error instanceof RangeError)) return false;
    return error.message.includes("resident");
  }
  function permitIssueError(error: unknown): string {
    return residentPermitLimitError(error) ? "ResidentPermitLimit" : "InvalidClock";
  }
  function permitRejectionReason(rejection: PermitTransition["rejection"], clockValid: boolean): string {
    if (rejection === "ProspectiveDenied") return clockValid ? "ProspectiveDenied" : "InvalidClock";
    return rejection ?? "InconsistentLedger";
  }
  function issueProspectivePermit(
    partition: string,
    key: string,
    tool: number,
    started: number,
    now: number,
    facts: ReturnType<typeof prospectivePermitFacts>,
    known: number | undefined,
  ) {
    try {
      const result = canonicalOwner.transition({
        kind: "issuePermit",
        partition: canonicalOwner.partitionId(partition),
        lifetime: 1,
        tool,
        started: bendTime(started),
        deadline: bendTime(started + EDIT_PERMIT_EXPIRY_MS),
        now: bendUpperTime(now),
        minimumStarted: canonicalOwner.minimumFreshStart(),
        facts,
      });
      return { issued: true as const, result };
    } catch (error) {
      discardFailedPermit(partition, key, known);
      return { issued: false as const, reason: permitIssueError(error) };
    }
  }
  function retainIssuedPermit(
    partition: string,
    key: string,
    tool: number,
    started: number,
    quietMs: number,
    admission: AdmissionProjection | undefined,
    known: number | undefined,
    result: PermitTransition,
    facts: ReturnType<typeof prospectivePermitFacts>,
  ): EditDecision {
    const command = result.commands[0];
    if (result.rejection !== undefined || command?.kind !== "permitIssued") {
      discardFailedPermit(partition, key, known);
      return { accepted: false, reason: permitRejectionReason(result.rejection, facts.clockValid) };
    }
    if (command.round !== nextAdmissionRound(admission)) {
      releaseAdmissionPermit(partition, command.token);
      finishPermit(key, "released");
      return { accepted: false, reason: "StaleRound" };
    }
    state.permits.set(key, {
      partition,
      generation: command.round,
      expiresAt: started + EDIT_PERMIT_EXPIRY_MS,
      token: command.token,
      tool,
      quietMs,
      logged: false,
    });
    return { accepted: true };
  }
  function retireEdit(partition: string, eventId: string): void {
    const key = `${partition}\0${eventId}`;
    const permit = state.permits.get(key);
    if (permit !== undefined) releaseCompletedPermit(partition, key, permit);
  }
  function registerEditDecision(
    partition: string,
    eventId: string,
    startedAt: number,
    now = monotonicNow(),
    limits: EditPermitLimits = DEFAULT_EDIT_PERMIT_LIMITS,
    quietMs = DEFAULT_VIRTUAL_ROUND_QUIET_MS,
  ): EditDecision {
    expirePermits(now);
    const key = `${partition}\0${eventId}`;
    if (state.permits.has(key)) {
      repeatPending(key);
      return { accepted: true };
    }
    if (checkCompleted(key)) return { accepted: false, reason: "DuplicateTool" };
    const known = canonicalOwner.knownPartitionId(partition);
    const admission = existingAdmission(known);
    // Bend receives upper start/lower now for ordering, and lower start/upper now for its deadline.
    const facts = prospectivePermitFacts(startedAt, now, limits);
    const tool = toolId(key);
    const issued = issueProspectivePermit(partition, key, tool, startedAt, now, facts, known);
    if (!issued.issued) return { accepted: false, reason: issued.reason };
    return retainIssuedPermit(partition, key, tool, startedAt, quietMs, admission, known, issued.result, facts);
  }
  function releaseCompletedPermit(partition: string, key: string, permit: { readonly token: number }): void {
    releaseAdmissionPermit(partition, permit.token);
    finishPermit(key, "released");
  }
  function permitAdmissionCurrent(partition: string, permit: EditPermit): boolean {
    const admission = canonicalOwner
      .canonicalProjection()
      .admissions.find((item) => item.partition === canonicalOwner.partitionId(partition));
    return admission !== undefined && permit.generation === nextAdmissionRound(admission);
  }
  function validPermitConsumed(result: PermitTransition, permit: EditPermit): boolean {
    const command = result.commands[0];
    return result.rejection === undefined && command?.kind === "permitConsumed" && command.round === permit.generation;
  }
  function consumeRegisteredPermit(partition: string, permit: EditPermit, now: number): boolean {
    try {
      const consumed = canonicalOwner.consumeEditPermit(partition, {
        kind: "consumePermit",
        partition: canonicalOwner.partitionId(partition),
        lifetime: 1,
        token: permit.token,
        tool: permit.tool,
        now: bendTime(now),
      });
      return validPermitConsumed(consumed, permit);
    } catch {
      return false;
    }
  }
  function admitPermittedEdit(
    partition: string,
    key: string,
    now: number,
    previous: Round | undefined,
  ): number | undefined {
    expirePermits(now);
    const permit = state.permits.get(key);
    if (permit === undefined) {
      checkCompleted(key);
      return undefined;
    }
    if (!permitAdmissionCurrent(partition, permit)) {
      releaseCompletedPermit(partition, key, permit);
      return undefined;
    }
    if (!consumeRegisteredPermit(partition, permit, now)) {
      releaseCompletedPermit(partition, key, permit);
      return undefined;
    }
    finishPermit(key, "consumed");
    if (previous === undefined) startRound(partition, permit.quietMs);
    return readGeneration(partition);
  }
  function closedKnownRound(partition: string, known: number): boolean {
    return canonicalOwner
      .canonicalProjection()
      .admissions.some((item) => item.partition === known && item.round > 0 && !item.active);
  }
  function internalEditEligible(partition: string, key: string, previous: Round | undefined): boolean {
    // Only deterministic fixtures and the non-installed API may start a first round.
    if (previous !== undefined && !isActive(partition)) return false;
    const known = canonicalOwner.knownPartitionId(partition);
    if (previous === undefined && known !== undefined && closedKnownRound(partition, known)) return false;
    return !state.permits.has(key);
  }
  function issueSyntheticPermit(
    partitionId: number,
    key: string,
    tool: number,
    syntheticNow: number,
    limits: EditPermitLimits,
  ): PermitCommand | undefined {
    const issued = canonicalOwner.transition({
      kind: "issuePermit",
      partition: partitionId,
      lifetime: 1,
      tool,
      started: syntheticNow,
      deadline: syntheticNow + bendTime(EDIT_PERMIT_EXPIRY_MS),
      now: syntheticNow,
      minimumStarted: canonicalOwner.minimumFreshStart(),
      facts: {
        clockValid: true,
        hookWindow: bendTime(PRE_EDIT_ADMISSION_DEADLINE_MS),
        startedUpper: syntheticNow,
        nowLower: syntheticNow,
        adviceePermitLimit: limits.perAdvicee,
        residentPermitLimit: limits.resident,
      },
    });
    const permit = issued.commands[0];
    if (permit?.kind === "permitIssued") return permit;
    dropTool(key);
    return undefined;
  }
  function consumeSyntheticPermit(
    partition: string,
    partitionId: number,
    key: string,
    permit: PermitCommand,
    tool: number,
    syntheticNow: number,
  ): number | undefined {
    const consumed = canonicalOwner.consumeEditPermit(partition, {
      kind: "consumePermit",
      partition: partitionId,
      lifetime: 1,
      token: permit.token,
      tool,
      now: syntheticNow,
    });
    const command = consumed.commands[0];
    if (command?.kind === "permitConsumed") return command.round;
    releaseCompletedPermit(partition, key, permit);
    return undefined;
  }
  function commitSyntheticRound(
    partition: string,
    key: string,
    previous: Round | undefined,
    round: number,
  ): number | undefined {
    if (previous === undefined) startRound(partition, DEFAULT_VIRTUAL_ROUND_QUIET_MS);
    if (round !== readGeneration(partition)) {
      finishPermit(key, "consumed");
      return undefined;
    }
    finishPermit(key, "consumed");
    return readGeneration(partition);
  }
  function admitInternalEdit(
    partition: string,
    key: string,
    now: number,
    previous: Round | undefined,
    limits: EditPermitLimits,
  ): number | undefined {
    if (!internalEditEligible(partition, key, previous)) return undefined;
    const partitionId = canonicalOwner.partitionId(partition);
    if (checkCompleted(key)) return undefined;
    const tool = toolId(key);
    const syntheticNow = bendTime(Math.max(1, now));
    const permit = issueSyntheticPermit(partitionId, key, tool, syntheticNow, limits);
    if (permit === undefined) return undefined;
    const round = consumeSyntheticPermit(partition, partitionId, key, permit, tool, syntheticNow);
    return round === undefined ? undefined : commitSyntheticRound(partition, key, previous, round);
  }
  function admitEdit(
    partition: string,
    eventId: string,
    now: number,
    requirePermit = false,
    limits: EditPermitLimits = DEFAULT_EDIT_PERMIT_LIMITS,
  ): number | undefined {
    const previous = state.rounds.get(partition);
    const key = `${partition}\0${eventId}`;
    return requirePermit
      ? admitPermittedEdit(partition, key, now, previous)
      : admitInternalEdit(partition, key, now, previous, limits);
  }

  function expirePermits(now = monotonicNow()): void {
    for (const [key, permit] of state.permits) {
      const result = canonicalOwner.transition({
        kind: "expirePermit",
        partition: canonicalOwner.partitionId(permit.partition),
        lifetime: 1,
        token: permit.token,
        deadlineReached: permit.expiresAt <= now,
      });
      if (result.commands[0]?.kind === "permitKept") continue;
      if (result.rejection !== undefined || result.commands[0]?.kind !== "permitExpired")
        throw new Error("invalid Bend permit expiry");
      finishPermit(key, "expired");
    }
  }

  function hasPendingEdits(partition: string): boolean {
    expirePermits();
    return [...state.permits.values()].some((permit) => permit.partition === partition);
  }

  function isActive(partition: string, generation = readGeneration(partition)): boolean {
    const admission = canonicalOwner
      .canonicalProjection()
      .admissions.find((item) => item.partition === canonicalOwner.partitionId(partition));
    // Only accepted post-edit admission binds a host round.
    const result = canonicalOwner.transition({
      kind: "roundActivityCheck",
      bound: state.rounds.has(partition),
      hasAdmission: admission !== undefined,
      round: admission?.round ?? 0,
      active: admission?.active ?? false,
      closedAt: admission?.closedAt ?? 0,
      expectedGeneration: generation,
    });
    if (result.rejection !== undefined || result.commands.length !== 1)
      throw new Error("canonical round activity refused");
    return result.commands[0]?.kind === "roundActive";
  }

  function beginStop(partition: string, token: string): boolean {
    const id = state.nextStopId++;
    const decision = canonicalOwner.transition({
      kind: "roundBeginStopCheck",
      active: isActive(partition),
      hasStop: state.stops.has(partition),
      token: id,
    });
    if (decision.rejection !== undefined || decision.commands[0]?.kind !== "roundStopBegun") return false;
    const reset = canonicalOwner.transition({
      kind: "quietRoundReset",
      partition: canonicalOwner.partitionId(partition),
      lifetime: 1,
      round: canonicalOwner.currentRoundId(partition)!,
    });
    if (reset.rejection !== undefined || reset.commands[0]?.kind !== "quietRoundResetRecorded") {
      throw new Error("canonical quiet reset refused at Stop");
    }
    state.stops.set(partition, {
      token,
      id,
      generation: readGeneration(partition),
      canonicalRound: canonicalOwner.roundId(partition),
      continuationsAtStart: continuationCount(partition),
    });
    canonicalOwner.roundId(partition);
    return true;
  }

  function ownsStop(partition: string, token: string): boolean {
    const stop = state.stops.get(partition);
    const decision = canonicalOwner.transition({
      kind: "roundOwnsStopCheck",
      active: stop !== undefined && isActive(partition, stop.generation),
      tokenMatches: stop?.token === token,
      deciding: isDeciding(partition),
    });
    if (decision.rejection !== undefined || decision.commands.length !== 1)
      throw new Error("canonical Stop ownership refused");
    return decision.commands[0]?.kind === "roundStopOwned";
  }

  function unfinishedSourceOperations(
    projection: ReturnType<CapacityLedger["canonicalProjection"]>,
    owner: number,
    round: number,
  ): Set<number> {
    return new Set(
      projection.work
        .filter(
          (item) =>
            item.partition === owner &&
            item.round === round &&
            (item.kind === "awaitingSourceRead" || item.kind === "sourceReading"),
        )
        .map((item) => item.operation),
    );
  }
  function acknowledgeCutoffReservations(cutoff: PermitTransition): void {
    for (const command of cutoff.commands)
      if (command.kind === "reservationReleased") canonicalOwner.acknowledgeStopRelease(command.id);
  }
  function releaseCutoffPermit(partition: string, key: string, permit: EditPermit): void {
    const released = canonicalOwner.transition({
      kind: "releasePermit",
      partition: canonicalOwner.partitionId(partition),
      lifetime: 1,
      token: permit.token,
    });
    if (!canonicalCommandAccepted(released, "permitReleased"))
      throw new Error("canonical permit cutoff disagrees with resident");
    finishPermit(key, "released");
  }
  function releaseCutoffPermits(partition: string): void {
    for (const [key, permit] of state.permits)
      if (permit.partition === partition) releaseCutoffPermit(partition, key, permit);
  }

  function finishGate(
    partition: string,
    token: string,
    extraUnfinished: number,
    deadlineReached: boolean,
  ):
    | { readonly status: "waiting" }
    | {
        readonly status: "cutoff";
        readonly cancelledSource: number[];
        readonly cancelledJev: number[];
        readonly limited: boolean;
      }
    | undefined {
    const stop = currentStop(partition, token);
    if (stop === undefined) return undefined;
    const canonicalRound = stop.canonicalRound;
    const projection = canonicalOwner.canonicalProjection();
    const owner = canonicalOwner.partitionId(partition);
    const cutoff = canonicalOwner.transition({
      kind: "stopGroupPolled",
      group: canonicalOwner.partitionId(partition),
      lifetime: 1,
      round: canonicalRound,
      scopes: [{ partition: owner, round: canonicalRound }],
      deadline: deadlineReached,
      extraPending: extraUnfinished > 0,
      continuations: continuationCount(partition, canonicalRound),
    });
    if (cutoff.rejection !== undefined) return undefined;
    if (cutoff.commands[0]?.kind === "waitForWork") return { status: "waiting" };
    const terminal = cutoff.commands.at(-1)?.kind;
    if (terminal !== "finishReady" && terminal !== "finishLimit") throw new Error("invalid canonical Stop command");
    const source = unfinishedSourceOperations(projection, owner, canonicalRound);
    const cancelled = cutoff.commands.filter((item) => item.kind === "cancelWork").map((item) => item.operation);
    acknowledgeCutoffReservations(cutoff);
    releaseCutoffPermits(partition);
    return {
      status: "cutoff",
      cancelledSource: cancelled.filter((id) => source.has(id)),
      cancelledJev: cancelled.filter((id) => !source.has(id)),
      limited: terminal === "finishLimit",
    };
  }

  function reserveFinishOutput(
    partition: string,
    attempt: string,
    outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number; readonly findings: ReadonlyArray<unknown> }>,
    now: number,
  ): boolean {
    return (
      decideFinishOutput(partition, attempt, outputToken, advice, now, false, false, true, true, false).kind ===
      "reserved"
    );
  }

  type FinishOutputRoute =
    | { readonly kind: "reserved" | "notices" | "failed" }
    | { readonly kind: "allowed"; readonly reason: "no-advice" | "deadline" | "unavailable" };
  const finishReservationRoutes: Partial<Record<PermitTransition["commands"][number]["kind"], FinishOutputRoute>> = {
    finishNotices: { kind: "notices" },
    finishAllowedNoAdvice: { kind: "allowed", reason: "no-advice" },
    finishAllowedDeadline: { kind: "allowed", reason: "deadline" },
    finishAllowedUnavailable: { kind: "allowed", reason: "unavailable" },
    finishReserved: { kind: "reserved" },
  };
  function finishReservationRoute(kind: PermitTransition["commands"][number]["kind"] | undefined): FinishOutputRoute {
    return kind === undefined ? { kind: "failed" } : (finishReservationRoutes[kind] ?? { kind: "failed" });
  }
  function canonicalCommandAccepted(
    result: PermitTransition,
    expected: PermitTransition["commands"][number]["kind"],
  ): boolean {
    return result.rejection === undefined && result.commands[0]?.kind === expected;
  }
  function rollbackStagedSubmission(id: string, token: string, submission: Submission): void {
    const rollback = canonicalOwner.transition({
      kind: "submissionRelease",
      advice: submissionAdviceId(id),
      token: submission.batches.get(token)!.id,
    });
    if (!canonicalCommandAccepted(rollback, "submissionReleased"))
      throw new Error("canonical staged submission rollback refused");
  }
  function rollbackStagedSubmissions(
    staged: ReadonlyArray<readonly [string, Submission | undefined]>,
    token: string,
  ): void {
    staged.forEach(([id, submission]) => {
      if (submission !== undefined) rollbackStagedSubmission(id, token, submission);
    });
  }

  function decideFinishOutput(
    partition: string,
    attempt: string,
    outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number; readonly findings: ReadonlyArray<unknown> }>,
    now: number,
    hasNotice: boolean,
    passNotices: boolean,
    canWrite: boolean,
    bindingValid: boolean,
    deadlineReached: boolean,
  ):
    | { readonly kind: "reserved" | "notices" | "failed" }
    | { readonly kind: "allowed"; readonly reason: "no-advice" | "deadline" | "unavailable" } {
    const stop = state.stops.get(partition);
    const round = state.rounds.get(partition);
    if (stop?.token !== attempt || round === undefined) return { kind: "failed" };
    const selected = advice.flatMap((item) => item.findings.map(() => item.unit));
    const group = canonicalOwner.partitionId(partition);
    const currentRound = canonicalOwner.roundId(partition);
    const tokenId = canonicalOwner.collectionTokenId(outputToken);
    const decision = canonicalOwner.transition({
      kind: "finishReserve",
      group,
      lifetime: 1,
      round: currentRound,
      attempt: stop.id,
      token: tokenId,
      selected,
      hasNotice,
      passNotices,
      canWrite,
      bindingValid,
      deadlineReached,
    });
    if (decision.rejection !== undefined) return { kind: "failed" };
    const route = finishReservationRoute(decision.commands[0]?.kind);
    if (route.kind !== "reserved") return route;
    const staged = advice.map(
      (item) =>
        [
          item.id,
          stageSubmission(item.id, partition, outputToken, item.findings, "stop", now, "reserved", item.unit),
        ] as const,
    );
    if (staged.some(([, submission]) => submission === undefined)) {
      rollbackStagedSubmissions(staged, outputToken);
      canonicalOwner.transition({
        kind: "finishRelease",
        group,
        round: currentRound,
        attempt: stop.id,
        token: tokenId,
      });
      return { kind: "failed" };
    }
    stop.outputToken = outputToken;
    state.finishPermits.set(outputToken, {
      partition,
      generation: stop.generation,
      attempt,
      selected,
      advice: advice.map((item) => ({ id: item.id, fingerprints: item.findings.map(fingerprint) })),
      authorized: false,
      terminal: false,
      revoked: false,
    });
    for (const [id, submission] of staged) state.submissions.set(id, submission!);
    return { kind: "reserved" };
  }

  function provisionalStopCurrent(
    stop: StopRecord | undefined,
    round: Round | undefined,
    attempt: string,
    token: string,
  ): stop is StopRecord {
    return stop?.token === attempt && stop.outputToken === token && round !== undefined;
  }
  function revokeProvisionalFinishOutput(partition: string, attempt: string, outputToken: string): boolean {
    const stop = state.stops.get(partition);
    const round = state.rounds.get(partition);
    const permit = state.finishPermits.get(outputToken);
    if (!provisionalStopCurrent(stop, round, attempt, outputToken)) return false;
    if (permit === undefined || permit.authorized) return false;
    const released = canonicalOwner.transition({
      kind: "finishRelease",
      group: canonicalOwner.partitionId(partition),
      round: canonicalOwner.roundId(partition),
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(outputToken),
    });
    if (released.rejection !== undefined || released.commands[0]?.kind !== "finishReleased") return false;
    permit.revoked = true;
    release(outputToken);
    state.finishPermits.delete(outputToken);
    delete stop.outputToken;
    return true;
  }

  function finishSelectionMatches(
    token: string,
    advice: ReadonlyArray<{
      readonly id: string;
      readonly unit: number;
      readonly findings: ReadonlyArray<unknown>;
    }>,
  ): boolean {
    const permit = state.finishPermits.get(token);
    if (permit === undefined || permit.revoked || permit.advice.length !== advice.length) return false;
    const selected = advice.flatMap((item) => item.findings.map(() => item.unit));
    if (permit.selected.length !== selected.length || permit.selected.some((unit, index) => unit !== selected[index]))
      return false;
    if (
      !advice.every((item, index) => {
        const expected = permit.advice[index];
        const digests = item.findings.map(fingerprint);
        return (
          expected?.id === item.id &&
          expected.fingerprints.length === digests.length &&
          expected.fingerprints.every((digest, position) => digest === digests[position])
        );
      })
    )
      return false;
    return finishBatchesCurrent(token, permit);
  }

  function finishBatchesCurrent(
    token: string,
    permit: {
      readonly partition: string;
      readonly advice: ReadonlyArray<{ readonly id: string; readonly fingerprints: ReadonlyArray<string> }>;
    },
  ): boolean {
    const canonical = canonicalOwner.canonicalProjection().delivery.submissions.batches;
    return permit.advice.every((item) => {
      const batch = state.submissions.get(item.id)?.batches.get(token);
      const canonicalBatch = canonical.find(
        (candidate) => candidate.advice === submissionAdviceId(item.id) && candidate.token === batch?.id,
      );
      return (
        batch?.status === "reserved" &&
        canonicalBatch?.phase === "reserved" &&
        canonicalBatch.group === canonicalOwner.partitionId(permit.partition) &&
        canonicalBatch.round === canonicalOwner.roundId(permit.partition) &&
        canonicalBatch.fingerprints.length === new Set(item.fingerprints).size &&
        item.fingerprints.every(
          (digest) =>
            batch.fingerprints.has(digest) && canonicalBatch.fingerprints.includes(fingerprintId(item.id, digest)),
        )
      );
    });
  }

  function unreservedStopAllowed(partition: string): boolean {
    const decision = canonicalOwner.transition({
      kind: "deliveryUnreservedStopCheck",
      active: isActive(partition),
      deciding: isDeciding(partition),
    });
    if (decision.rejection !== undefined || decision.commands.length !== 1)
      throw new Error("canonical unreserved Stop gate refused");
    return decision.commands[0]?.kind === "deliveryUnreservedStopAllowed";
  }
  function finishPermitCurrent(
    partition: string,
    token: string,
    permit: FinishPermit,
    stop: StopRecord | undefined,
  ): stop is StopRecord {
    if (permit.partition !== partition || !isActive(partition, permit.generation) || permit.revoked) return false;
    return stop?.token === permit.attempt && stop.outputToken === token;
  }
  function publishBatchStatus(token: string, status: SubmissionBatch["status"]): void {
    for (const [id, submission] of state.submissions) {
      const batch = submission.batches.get(token);
      if (batch === undefined) continue;
      const batches = new Map(submission.batches);
      batches.set(token, { ...batch, status });
      state.submissions.set(id, { ...submission, batches });
    }
  }

  function authorizeFinishOutput(partition: string, token: string): boolean {
    const permit = state.finishPermits.get(token);
    if (permit === undefined) return unreservedStopAllowed(partition);
    const stop = state.stops.get(partition);
    if (!finishPermitCurrent(partition, token, permit, stop)) return false;
    if (!finishBatchesCurrent(token, permit)) return false;
    const authorization = canonicalOwner.transition({
      kind: "finishAuthorize",
      group: canonicalOwner.partitionId(partition),
      round: canonicalOwner.roundId(partition),
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(token),
      selected: permit.selected,
    });
    if (authorization.rejection !== undefined || authorization.commands[0]?.kind !== "finishAuthorized") {
      release(token);
      return false;
    }
    permit.authorized = true;
    publishBatchStatus(token, "authorized");
    return true;
  }

  function currentStop(partition: string, token: string): StopRecord | undefined {
    const stop = state.stops.get(partition);
    if (stop?.token !== token || !state.rounds.has(partition) || !isActive(partition, stop.generation))
      return undefined;
    return stop;
  }

  function stopProvisionalRevoked(partition: string, token: string, stop: StopRecord, revoke: boolean): boolean {
    if (!revoke || stop.outputToken === undefined) return true;
    return revokeProvisionalFinishOutput(partition, token, stop.outputToken);
  }

  function stopTerminalDecision(partition: string, token: string, stop: StopRecord, close: boolean) {
    const terminal = canonicalOwner.transition({
      kind: "roundStopTerminalCheck",
      hasOutput: stop.outputToken !== undefined,
      authorized: stop.outputToken !== undefined && state.finishPermits.get(stop.outputToken)?.authorized === true,
      requestedClose: close,
    });
    const command = terminal.commands[0];
    if (terminal.rejection !== undefined || command?.kind !== "roundStopTerminal") return undefined;
    if (!stopProvisionalRevoked(partition, token, stop, command.revokeProvisional)) return undefined;
    return command;
  }

  function endStopGroup(partition: string, canonicalRound: number): void {
    const owner = canonicalOwner.partitionId(partition);
    const ended = canonicalOwner.transition({
      kind: "stopGroupEnded",
      group: canonicalOwner.partitionId(partition),
      lifetime: 1,
      round: canonicalRound,
      scopes: [{ partition: owner, round: canonicalRound }],
    });
    if (ended.rejection !== undefined || ended.commands[0]?.kind !== "stopEnded")
      throw new Error("canonical Stop end refused");
  }

  function endAuthorizedFinish(partition: string, stop: StopRecord): void {
    const outputPermit = stop.outputToken === undefined ? undefined : state.finishPermits.get(stop.outputToken);
    if (stop.outputToken === undefined || outputPermit?.authorized !== true) return;
    const ended = canonicalOwner.transition({
      kind: "finishEnd",
      group: canonicalOwner.partitionId(partition),
      round: stop.canonicalRound,
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(stop.outputToken),
    });
    if (ended.rejection !== undefined || ended.commands[0]?.kind !== "finishEnded")
      throw new Error("canonical finish slot end refused");
  }

  function closeStopRound(partition: string, stop: StopRecord, closedAt: number): boolean {
    if (readGeneration(partition) !== stop.generation) return false;
    // Publish the canonical fence before changing the resident's Stop view.
    const admission = canonicalOwner
      .canonicalProjection()
      .admissions.find((item) => item.partition === canonicalOwner.partitionId(partition));
    if (admission === undefined) throw new Error("canonical admission missing at round closure");
    const closed = canonicalOwner.transition({
      kind: "closePermitRound",
      partition: admission.partition,
      lifetime: admission.lifetime,
      round: stop.generation,
      at: Math.max(bendTime(closedAt + 1), admission.closedAt),
    });
    if (
      closed.rejection !== undefined ||
      closed.commands[0]?.kind !== "permitRoundClosed" ||
      closed.commands[0].round !== stop.generation
    )
      throw new Error("canonical permit closure disagrees with round");
    return true;
  }

  function revokeEndedStop(partition: string, stop: StopRecord): void {
    state.stops.delete(partition);
    if (stop.outputToken === undefined) return;
    const permit = state.finishPermits.get(stop.outputToken);
    if (permit !== undefined) permit.revoked = true;
  }

  function finishStop(partition: string, token: string, close: boolean, closedAt = monotonicNow()): number | undefined {
    const stop = currentStop(partition, token);
    if (stop === undefined) return undefined;
    // A provisional output has not crossed the IPC write boundary.
    const command = stopTerminalDecision(partition, token, stop, close);
    if (command === undefined) return undefined;
    endStopGroup(partition, stop.canonicalRound);
    endAuthorizedFinish(partition, stop);
    if (command.close && !closeStopRound(partition, stop, closedAt)) return undefined;
    revokeEndedStop(partition, stop);
    if (!command.close) return undefined;
    retireClosedRound(partition, stop.canonicalRound);
    return stop.generation;
  }

  function retirePartitionPermits(partition: string): void {
    for (const [key, permit] of state.permits) if (permit.partition === partition) finishPermit(key, "closed");
  }
  function retirePartitionFinishes(partition: string): void {
    for (const [token, permit] of state.finishPermits)
      if (permit.partition === partition) state.finishPermits.delete(token);
  }
  function retirePartitionSubmissions(partition: string): void {
    for (const [id, submission] of state.submissions) if (submission.partition === partition) forget(id);
  }
  function retireClosedRound(partition: string, canonicalRound: number): void {
    canonicalOwner.retireRound(partition, canonicalRound);
    retirePartitionPermits(partition);
    const waiter = state.backgroundWaiters.get(partition);
    if (waiter !== undefined) releaseBackground(partition, waiter.token);
    retirePartitionFinishes(partition);
    retirePartitionSubmissions(partition);
    state.rounds.delete(partition);
  }

  function partitionHandoffIdle(partition: string): boolean {
    return (
      !state.backgroundWaiters.has(partition) &&
      ![...state.finishPermits.values()].some((item) => item.partition === partition) &&
      ![...state.submissions.values()].some(
        (item) =>
          item.partition === partition && [...item.batches.values()].some((batch) => batch.status !== "submitted"),
      )
    );
  }
  function closeQuietRound(partition: string, now: number): AdmissionProjection {
    const admission = canonicalOwner
      .canonicalProjection()
      .admissions.find((item) => item.partition === canonicalOwner.partitionId(partition));
    if (admission === undefined) throw new Error("canonical admission missing at quiet closure");
    const closed = canonicalOwner.transition({
      kind: "closePermitRound",
      partition: admission.partition,
      lifetime: admission.lifetime,
      round: admission.round,
      at: Math.max(bendTime(now + 1), admission.closedAt),
    });
    if (closed.rejection !== undefined || closed.commands[0]?.kind !== "permitRoundClosed") {
      throw new Error("canonical quiet closure refused");
    }
    return admission;
  }

  function tickQuietRound(
    partition: string,
    now: number,
    facts: { readonly nativeWorkIdle: boolean; readonly adviceEmpty: boolean },
  ): number | undefined {
    const round = state.rounds.get(partition);
    if (round === undefined) return undefined;
    const canonicalRound = canonicalOwner.currentRoundId(partition);
    if (canonicalRound === undefined) throw new Error("active virtual round lacks canonical identity");
    const handoffIdle = partitionHandoffIdle(partition);
    const tick = canonicalOwner.transition({
      kind: "quietRoundTick",
      partition: canonicalOwner.partitionId(partition),
      lifetime: 1,
      round: canonicalRound,
      now: bendTime(now),
      window: bendTime(round.quietMs),
      facts: { ...facts, handoffIdle, stopAbsent: !state.stops.has(partition) },
    });
    if (tick.rejection !== undefined || tick.commands.length !== 1) throw new Error("canonical quiet tick refused");
    if (tick.commands[0]?.kind !== "quietRoundExpired") return undefined;
    const admission = closeQuietRound(partition, now);
    retireClosedRound(partition, canonicalRound);
    return admission.round;
  }

  function closureCounts(partition: string): {
    reservedContinuations: number;
    submitted: number;
    uncertain: number;
    editPermits: number;
  } {
    const batches = new Map<string, SubmissionBatch["status"]>();
    for (const submission of state.submissions.values())
      if (submission.partition === partition) {
        for (const [token, batch] of submission.batches) batches.set(token, batch.status);
      }
    return {
      reservedContinuations: state.rounds.has(partition) ? continuationCount(partition) : 0,
      submitted: [...batches.values()].filter((status) => status === "submitted").length,
      uncertain: [...batches.values()].filter((status) => status === "uncertain").length,
      editPermits: [...state.permits.values()].filter((permit) => permit.partition === partition).length,
    };
  }

  function expireStop(partition: string, token: string): number | undefined {
    const stop = state.stops.get(partition);
    if (stop?.token !== token) return undefined;
    // An authorized output may have reached the runtime. Preserve its count
    // and round; finishStop releases any provisional output before closing.
    const authorizedOutput =
      stop.outputToken !== undefined && state.finishPermits.get(stop.outputToken)?.authorized === true;
    const expiry = canonicalOwner.transition({
      kind: "roundExpireCloseCheck",
      barrier: stopBarrier(partition),
      authorizedOutput,
    });
    if (expiry.rejection !== undefined || expiry.commands.length !== 1)
      throw new Error("canonical Stop expiry refused");
    return finishStop(partition, token, expiry.commands[0]?.kind === "roundExpireCloses");
  }

  function isDeciding(partition: string): boolean {
    const owner = canonicalOwner.partitionId(partition);
    return canonicalOwner.canonicalProjection().rounds.find((item) => item.partition === owner)?.deciding === true;
  }

  function canSubmit(partition: string, surface: DeliverySurface): boolean {
    const result = canonicalOwner.transition({
      kind: "deliverySubmissionAllowedCheck",
      active: isActive(partition),
      barrier: stopBarrier(partition),
      deciding: isDeciding(partition),
      surface,
      existingToken: false,
      finishPermit: false,
    });
    if (result.rejection !== undefined || result.commands.length !== 1)
      throw new Error("canonical submission eligibility refused");
    return result.commands[0]?.kind === "deliverySubmissionAllowed";
  }

  function canBeginSubmission(partition: string, surface: DeliverySurface, token: string): boolean {
    const result = canonicalOwner.transition({
      kind: "deliverySubmissionAllowedCheck",
      active: isActive(partition),
      barrier: stopBarrier(partition),
      deciding: isDeciding(partition),
      surface,
      existingToken: hasToken(token),
      finishPermit: surface === "stop" && hasFinishPermit(token),
    });
    if (result.rejection !== undefined || result.commands.length !== 1)
      throw new Error("canonical submission eligibility refused");
    return result.commands[0]?.kind === "deliverySubmissionAllowed";
  }

  function canBeginExistingToken(surface: DeliverySurface, token: string): boolean {
    const result = canonicalOwner.transition({
      kind: "deliveryExistingTokenCheck",
      surface,
      existingToken: hasToken(token),
      finishPermit: surface === "stop" && hasFinishPermit(token),
    });
    if (result.rejection !== undefined || result.commands.length !== 1)
      throw new Error("canonical existing token gate refused");
    return result.commands[0]?.kind === "deliveryExistingTokenAllowed";
  }

  function readGeneration(partition: string): number {
    const known = canonicalOwner.knownPartitionId(partition);
    if (known === undefined) return 0;
    const admission = canonicalOwner.canonicalProjection().admissions.find((item) => item.partition === known);
    return admission?.round ?? 0;
  }

  function consumeStop(partition: string, continuationDigest?: string): boolean {
    if (!hasVirtualRoundContinuationBudget(partition)) return false;
    const consumed = canonicalOwner.transition({
      kind: "continuationConsume",
      group: canonicalOwner.partitionId(partition),
      round: canonicalOwner.roundId(partition),
    });
    if (consumed.rejection !== undefined || consumed.commands[0]?.kind !== "continuationConsumed") return false;
    return true;
  }

  function hasVirtualRoundContinuationBudget(partition: string): boolean {
    if (!state.rounds.has(partition)) return false;
    const result = canonicalOwner.transition({
      kind: "roundContinuationBudgetCheck",
      active: isActive(partition),
      count: continuationCount(partition),
    });
    if (result.rejection !== undefined || result.commands.length !== 1)
      throw new Error("canonical continuation budget refused");
    return result.commands[0]?.kind === "roundContinuationAvailable";
  }

  function stopBarrier(partition: string): boolean {
    const stop = state.stops.get(partition);
    const result = canonicalOwner.transition({
      kind: "roundBarrierCheck",
      hasStop: stop !== undefined,
      usedAtStart: stop?.continuationsAtStart ?? 0,
      usedNow: stop === undefined ? 0 : continuationCount(partition),
    });
    if (result.rejection !== undefined || result.commands.length !== 1)
      throw new Error("canonical Stop barrier refused");
    return result.commands[0]?.kind === "roundBarrierRaised";
  }

  function continuationCount(partition: string, round = canonicalOwner.currentRoundId(partition)): number {
    if (round === undefined) return 0;
    const group = canonicalOwner.partitionId(partition);
    return (
      canonicalOwner
        .canonicalProjection()
        .delivery.counters.find((item) => item.group === group && item.round === round)?.used ?? 0
    );
  }

  function submissionTokenId(token: string): number {
    return canonicalOwner.collectionTokenId(token);
  }

  function submissionAdviceId(adviceId: string): number {
    return canonicalOwner.collectionTokenId(`submission-advice\0${adviceId}`);
  }

  function fingerprintId(adviceId: string, digest: string): number {
    return canonicalOwner.collectionTokenId(`submission-finding\0${adviceId}\0${digest}`);
  }

  function currentSubmissionBatches(
    existing: Submission | undefined,
    partition: string,
    generation: number,
  ): Map<string, SubmissionBatch> {
    if (existing?.partition === partition && existing.generation === generation) return new Map(existing.batches);
    return new Map();
  }
  function assertSubmissionAuthorization(adviceId: string, id: number, status: "reserved" | "authorized"): void {
    if (status !== "authorized") return;
    const missing = canonicalOwner
      .canonicalProjection()
      .delivery.submissions.batches.some(
        (batch) => batch.advice === submissionAdviceId(adviceId) && batch.token === id && batch.phase !== "authorized",
      );
    if (missing) throw new Error("canonical submission authorization missing");
  }

  function submissionUnits(findings: ReadonlyArray<unknown>, unit: number | undefined): ReadonlyArray<number> {
    return unit === undefined ? [] : findings.map(() => unit);
  }
  function stageSubmission(
    adviceId: string,
    partition: string,
    token: string,
    findings: ReadonlyArray<unknown>,
    surface: DeliverySurface,
    now: number,
    status: "reserved" | "authorized",
    unit?: number,
  ): Submission | undefined {
    const generation = readGeneration(partition);
    if (generation === 0 || !isActive(partition, generation)) return undefined;
    const existing = state.submissions.get(adviceId);
    const batches = currentSubmissionBatches(existing, partition, generation);
    if (batches.has(token)) return undefined;
    const fingerprints = new Set(findings.map(fingerprint));
    if (fingerprints.size === 0) return undefined;
    const id = submissionTokenId(token);
    const offered = canonicalOwner.transition({
      kind: "submissionBegin",
      advice: submissionAdviceId(adviceId),
      group: canonicalOwner.partitionId(partition),
      round: canonicalOwner.roundId(partition),
      token: id,
      surface,
      authorizeNow: status === "authorized",
      fingerprints: [...fingerprints].map((digest) => fingerprintId(adviceId, digest)),
      units: submissionUnits(findings, unit),
    });
    if (offered.rejection !== undefined || offered.commands[0]?.kind !== "submissionBegun") {
      return undefined;
    }
    assertSubmissionAuthorization(adviceId, id, status);
    batches.set(token, { id, surface, at: now, fingerprints, status });
    return { partition, generation, batches };
  }

  function beginSubmission(
    adviceId: string,
    partition: string,
    token: string,
    findings: ReadonlyArray<unknown>,
    surface: DeliverySurface,
    now: number,
    unit?: number,
  ): boolean {
    const staged = stageSubmission(adviceId, partition, token, findings, surface, now, "authorized", unit);
    if (staged === undefined) return false;
    state.submissions.set(adviceId, staged);
    return true;
  }

  type MatchingSubmission = { readonly id: string; readonly submission: Submission; readonly batch: SubmissionBatch };
  function matchingSubmissions(token: string): ReadonlyArray<MatchingSubmission> {
    return [...state.submissions].flatMap(([id, submission]) => {
      const batch = submission.batches.get(token);
      return batch === undefined ? [] : [{ id, submission, batch }];
    });
  }
  function batchPhaseMatches(
    item: MatchingSubmission,
    required: SubmissionBatch["status"],
    canonical: ReturnType<CapacityLedger["canonicalProjection"]>["delivery"]["submissions"],
  ): boolean {
    if (item.batch.status !== required) return false;
    const advice = submissionAdviceId(item.id);
    const owner = canonical.batches.find((entry) => entry.advice === advice && entry.token === item.batch.id);
    if (owner?.phase !== required) return false;
    return [...item.batch.fingerprints].every(
      (digest) =>
        canonical.leases.find(
          (lease) => lease.advice === advice && lease.fingerprint === fingerprintId(item.id, digest),
        )?.phase === required,
    );
  }
  function transitionSubmissionBatch(
    item: MatchingSubmission,
    token: string,
    status: SubmissionBatch["status"],
  ): readonly [string, Submission] {
    const result = canonicalOwner.transition(
      status === "authorized"
        ? { kind: "submissionAuthorize", advice: submissionAdviceId(item.id), token: item.batch.id }
        : {
            kind: "submissionTerminal",
            advice: submissionAdviceId(item.id),
            token: item.batch.id,
            certain: status === "submitted",
          },
    );
    const expected = status === "authorized" ? "submissionAuthorized" : "submissionRecorded";
    if (result.rejection !== undefined || result.commands[0]?.kind !== expected)
      throw new Error("canonical submission transition refused resident owner");
    const batches = new Map(item.submission.batches);
    batches.set(token, { ...item.batch, status });
    return [item.id, { ...item.submission, batches }];
  }
  function transitionBatchStatus(token: string, status: SubmissionBatch["status"]): boolean {
    const matching = matchingSubmissions(token);
    const required = status === "authorized" ? "reserved" : "authorized";
    const canonical = canonicalOwner.canonicalProjection().delivery.submissions;
    if (matching.some((item) => !batchPhaseMatches(item, required, canonical))) return false;
    const staged = matching.map((item) => transitionSubmissionBatch(item, token, status));
    for (const [id, submission] of staged) state.submissions.set(id, submission);
    return true;
  }
  function authorizedFinishPermit(token: string): FinishPermit | undefined {
    const permit = state.finishPermits.get(token);
    if (permit === undefined || !permit.authorized || permit.terminal) return undefined;
    return permit;
  }
  function finishSubmissionMatches(
    item: MatchingSubmission,
    permit: FinishPermit,
    canonical: ReturnType<CapacityLedger["canonicalProjection"]>["delivery"]["submissions"]["batches"],
  ): boolean {
    return (
      permit.advice.some((advice) => advice.id === item.id) &&
      item.batch.status === "authorized" &&
      canonical.find((batch) => batch.advice === submissionAdviceId(item.id) && batch.token === item.batch.id)
        ?.phase === "authorized"
    );
  }
  function publishMatchingBatchStatus(
    matching: ReadonlyArray<MatchingSubmission>,
    token: string,
    status: SubmissionBatch["status"],
  ): void {
    for (const { id, submission, batch } of matching) {
      const batches = new Map(submission.batches);
      batches.set(token, { ...batch, status });
      state.submissions.set(id, { ...submission, batches });
    }
  }
  function recordStopBatchResult(
    token: string,
    status: "submitted" | "uncertain",
    outcome: "acknowledged" | "unknown",
  ): boolean {
    const permit = authorizedFinishPermit(token);
    if (permit === undefined) return false;
    const stop = state.stops.get(permit.partition);
    if (stop === undefined || stop.outputToken !== token) return false;
    const matching = matchingSubmissions(token);
    const canonical = canonicalOwner.canonicalProjection().delivery.submissions.batches;
    if (
      matching.length !== permit.advice.length ||
      matching.some((item) => !finishSubmissionMatches(item, permit, canonical))
    )
      return false;
    const recorded = canonicalOwner.transition({
      kind: "finishTerminal",
      group: canonicalOwner.partitionId(permit.partition),
      round: canonicalOwner.roundId(permit.partition),
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(token),
      selected: permit.selected,
      outcome,
    });
    if (!canonicalCommandAccepted(recorded, "finishRecorded")) return false;
    publishMatchingBatchStatus(matching, token, status);
    permit.terminal = true;
    return true;
  }

  function markSubmitted(token: string, selectedUnits: ReadonlyArray<number> = []): boolean {
    const permit = state.finishPermits.get(token);
    if (
      permit !== undefined &&
      (!permit.authorized ||
        permit.terminal ||
        permit.selected.length !== selectedUnits.length ||
        permit.selected.some((unit, index) => unit !== selectedUnits[index]))
    )
      return false;
    if (permit !== undefined) {
      return recordStopBatchResult(token, "submitted", "acknowledged");
    }
    return transitionBatchStatus(token, "submitted");
  }

  function markUncertain(token: string): boolean {
    const permit = state.finishPermits.get(token);
    if (permit !== undefined && permit.authorized && !permit.terminal) {
      return recordStopBatchResult(token, "uncertain", "unknown");
    }
    return transitionBatchStatus(token, "uncertain");
  }

  function releaseFinishSlot(token: string, permit: FinishPermit, stop: StopRecord): void {
    const common = {
      group: canonicalOwner.partitionId(permit.partition),
      round: canonicalOwner.roundId(permit.partition),
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(token),
    };
    const result = permit.authorized
      ? canonicalOwner.transition({ kind: "finishTerminal", ...common, selected: permit.selected, outcome: "failed" })
      : canonicalOwner.transition({ kind: "finishRelease", ...common });
    const expected = permit.authorized ? "finishRecorded" : "finishReleased";
    if (result.rejection !== undefined || result.commands[0]?.kind !== expected)
      throw new Error("canonical finish release refused");
    permit.terminal = permit.authorized;
  }

  function releaseFinishPermit(token: string): void {
    const permit = state.finishPermits.get(token);
    if (permit === undefined || permit.revoked) return;
    const stop = state.stops.get(permit.partition);
    if (stop !== undefined && !permit.terminal) releaseFinishSlot(token, permit, stop);
    permit.revoked = true;
    if (permit.authorized) return;
    state.finishPermits.delete(token);
    if (stop?.outputToken === token) delete stop.outputToken;
  }

  function rollbackSubmission(adviceId: string, batch: SubmissionBatch): void {
    if (batch.status !== "reserved" && batch.status !== "authorized") return;
    const rollback = canonicalOwner.transition({
      kind: "submissionRelease",
      advice: submissionAdviceId(adviceId),
      token: batch.id,
    });
    if (rollback.rejection !== undefined || rollback.commands[0]?.kind !== "submissionReleased")
      throw new Error("canonical submission rollback refused");
  }

  function releaseSubmission(token: string, adviceId: string, submission: Submission): void {
    const batch = submission.batches.get(token);
    if (batch === undefined) return;
    rollbackSubmission(adviceId, batch);
    const batches = new Map(submission.batches);
    batches.delete(token);
    if (batches.size === 0) state.submissions.delete(adviceId);
    else state.submissions.set(adviceId, { ...submission, batches });
  }

  function release(token: string): void {
    releaseFinishPermit(token);
    for (const [adviceId, submission] of state.submissions) releaseSubmission(token, adviceId, submission);
  }

  function forget(adviceId: string): void {
    const result = canonicalOwner.transition({ kind: "submissionForget", advice: submissionAdviceId(adviceId) });
    if (result.rejection !== undefined || result.commands[0]?.kind !== "submissionForgotten") {
      throw new Error("canonical submission forget refused");
    }
    state.submissions.delete(adviceId);
  }

  function suppresses(adviceId: string, partition: string, finding: unknown, surface?: DeliverySurface): boolean {
    const submission = state.submissions.get(adviceId);
    if (
      submission === undefined ||
      submission.partition !== partition ||
      submission.generation !== readGeneration(partition)
    )
      return false;
    const digest = fingerprint(finding);
    const checked = canonicalOwner.transition({
      kind: "submissionSuppressCheck",
      advice: submissionAdviceId(adviceId),
      fingerprint: fingerprintId(adviceId, digest),
      round: canonicalOwner.roundId(partition),
      surface: surface ?? "edit",
    });
    if (checked.rejection !== undefined) throw new Error("canonical submission suppression refused");
    return checked.commands[0]?.kind === "submissionSuppresses";
  }

  function backgroundReofferable(adviceId: string, token: string): boolean {
    const batch = state.submissions.get(adviceId)?.batches.get(token);
    if (batch === undefined) return false;
    const checked = canonicalOwner.transition({
      kind: "submissionReofferCheck",
      advice: submissionAdviceId(adviceId),
      token: batch.id,
    });
    if (checked.rejection !== undefined) throw new Error("canonical submission reoffer check refused");
    return checked.commands[0]?.kind === "submissionReofferable";
  }

  function expireBackgroundWaiter(
    partition: string,
    waiter: { readonly id: number; readonly at: number },
    now: number,
  ): void {
    const elapsed = Math.floor(Math.min(BACKGROUND_WAITER_EXPIRY_MS, Math.max(0, now - waiter.at)));
    const result = canonicalOwner.transition({
      kind: "collectionExpireBackground",
      group: canonicalOwner.partitionId(partition),
      token: waiter.id,
      elapsed,
      lifetime: BACKGROUND_WAITER_EXPIRY_MS,
    });
    if (result.rejection !== undefined) throw new Error("canonical background expiry refused");
    if (result.commands[0]?.kind === "collectionBackgroundReleased") state.backgroundWaiters.delete(partition);
    else if (result.commands[0]?.kind !== "collectionBackgroundKept")
      throw new Error("invalid canonical background expiry");
  }

  function submissionExpired(adviceId: string, batch: SubmissionBatch, now: number): boolean {
    const elapsed = Math.floor(Math.min(DELIVERY_LEASE_MS, Math.max(0, now - batch.at)));
    const checked = canonicalOwner.transition({
      kind: "submissionExpiryCheck",
      advice: submissionAdviceId(adviceId),
      token: batch.id,
      elapsed,
      lifetime: DELIVERY_LEASE_MS,
    });
    if (checked.rejection !== undefined) throw new Error("canonical submission expiry refused");
    return checked.commands[0]?.kind === "submissionExpired";
  }

  function expire(now: number): void {
    for (const [partition, waiter] of state.backgroundWaiters) expireBackgroundWaiter(partition, waiter, now);
    const expired = new Set<string>();
    for (const [adviceId, submission] of state.submissions)
      for (const [token, batch] of submission.batches) if (submissionExpired(adviceId, batch, now)) expired.add(token);
    for (const token of expired) markUncertain(token);
    // Round fences and continuation counts never expire in a resident lifetime.
  }

  return {
    ...deliveryView(state, canonicalOwner),
    claimBackground,
    releaseBackground,
    advance,
    ensureFromHostTurn,
    registerEdit,
    registerEditDecision,
    retireEdit,
    admitEdit,
    expirePermits,
    hasPendingEdits,
    isActive,
    beginStop,
    ownsStop,
    finishGate,
    reserveFinishOutput,
    decideFinishOutput,
    revokeProvisionalFinishOutput,
    finishSelectionMatches,
    authorizeFinishOutput,
    finishStop,
    tickQuietRound,
    closureCounts,
    expireStop,
    isDeciding,
    canSubmit,
    canBeginSubmission,
    canBeginExistingToken,
    generation: readGeneration,
    consumeStop,
    hasVirtualRoundContinuationBudget,
    beginSubmission,
    markSubmitted,
    markUncertain,
    release,
    forget,
    suppresses,
    backgroundReofferable,
    expire,
  };
};
export type ComposedDelivery = ReturnType<typeof deliveryOperations>;
