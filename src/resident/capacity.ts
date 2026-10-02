import { initialRuntimeRecords, draftRuntimeRecords, runtimeRecordOperations, runtimeRecordView, type RuntimeRecordsState } from "./runtime-records.ts";
import { initialAdviceRecords, draftAdviceRecords, adviceRecordOperations, emptyAdviceContent, type AdviceRecordsState, type AdviceRecordOperations, type Advice, type AdviceInitial } from "./advice-records.ts";
import { initialNoticeRecords, draftNoticeRecords, noticeRecordOperations, type NoticeRecordsState, type NoticeRecordOperations, type NoticeCooldownSnapshot } from "./notice-records.ts";
import { initialRoundRecords, draftRoundRecords, roundRecordOperations, type RoundRecordsState, type RoundRecords, type RoundWork, type WorkCohort } from "./round-records.ts";
import { workView } from "./bend-work.ts";
import { initialJoinedReviews, draftJoinedReviews, joinedReviewOperations, type JoinedReviewsState, type JoinedReviews, type JoinedReviewOutcome } from "./joined-reviews.ts";
import { initialTicketRecords, draftTicketRecords, ticketRecordOperations, type TicketRecordsState, type TicketRecords } from "./ticket-records.ts";
import { initialTicketUnits, draftTicketUnits, ticketUnitOperations, emptyTicketUnitCurrent, type TicketUnitsState, type TicketUnit, type TicketUnits } from "./ticket-units.ts";
import { initialRevision, draftRevision, revisionOperations, type RevisionState, type RevisionOperations, type WorkRevision } from "./revision.ts";
import { initialDispatchRegistry, type DispatchRegistry, type DispatchState } from "./dispatch.ts";
import { initialDelivery, draftDelivery, deliveryOperations, deliveryView, assertDeliveryState, type DeliveryState, type ComposedDelivery, type RepeatEditDiagnostic } from "./composed-delivery.ts";
import { initialEvaluationReuse, draftEvaluationReuse, evaluationReuseOperations, evaluationReuseView, residentEvaluationIdentity, type EvaluationReuse, type EvaluationReuseState } from "./evaluation-reuse.ts";
import { Effect, Ref } from "effect";
import { CANONICAL_MAX_BYTES, CANONICAL_MAX_UNITS, initialCanonical, projectCanonical, stepCanonical, type CanonicalEvent, type CapacityPurpose, type JevRequestOutcome } from "../canonical/adapter.ts";
import { randomUUID } from "node:crypto";
import { monotonicNow } from "./hook-clock.ts";
export type { CapacityPurpose } from "../canonical/adapter.ts";

export const GLOBAL_ITEM_LIMIT = 512;
// A 256 KiB source requires 2 MiB of capture workspace before path overhead.
// Eight concurrent graph preparations can each reserve the conservative
// 18+ MiB analyzer fallback. These are logical reservations, not an RSS claim.
export const GLOBAL_BYTE_LIMIT = 256 * 1024 * 1024;
export const PARTITION_ITEM_LIMIT = 16;
export const PARTITION_BYTE_LIMIT = 32 * 1024 * 1024;
export const MAX_PARTITION_IDENTITIES = 8192;
export const MAX_PARTITION_KEY_BYTES = 1024 * 1024;
export const MAX_PARTITION_IDENTITY_BYTES = 64 * 1024 * 1024;
export const MAX_COLLECTION_TOKEN_IDENTITIES = 16384;
export const MAX_COLLECTION_TOKEN_KEY_BYTES = 4096;

export type CapacityLimits = {
  readonly globalItems: number;
  readonly globalBytes: number;
  readonly partitionItems: number;
  readonly partitionBytes: number;
};

export type CapacityReservation = {
  readonly id: number;
  readonly partition: string;
};

export type CapacitySnapshot = {
  readonly items: number;
  readonly bytes: number;
  readonly partitions: Readonly<Record<string, { readonly items: number; readonly bytes: number }>>;
};

type ResidentTransition = Extract<CanonicalEvent, { readonly kind:
  "issuePermit" | "checkCompletedEdit" | "rememberCompletedEdit" | "quietRoundTick" | "quietRoundReset" | "consumePermit" | "releasePermit" | "expirePermit" | "closePermitRound" | "forgetAdmission" |
  "openRound" | "admitObservation" | "startObservation" | "completeObservation" |
  "interruptObservation" | "beginObservedPreparation" | "interruptPreparation" |
  "preparationCompleted" | "startReview" | "jevRequestReady" |
  "jevRequestStarted" | "jevRequestInterrupted" | "jevRequestSettled" |
  "reviewCompleted" | "retireReview" |
  "retirePartition" | "reviewObserved" | "findingCountUpdated" | "preparedOfferCheck" |
  "emptyPreparedCheck" | "reviewFailureCheck" | "queueDispatch" |
  "dispatchSettled" | "discardDispatch" | "dispatchScopeCheck" | "closeDispatch" |
  "stopGroupPolled" | "stopGroupEnded" |
  "collectionReady" | "collectionCredentialCheck" | "collectionCandidateCheck" |
  "collectionOrderCheck" | "collectionExpiryCheck" | "collectionFindingCheck" | "collectionNoticeCheck" |
  "collectionFitCheck" | "collectionReserveLease" | "collectionReleaseLease" | "collectionLeaseCheck" |
  "collectionRetireAdvice" | "collectionClaimBackground" |
  "collectionReleaseBackground" | "collectionExpireBackground" |
  "finishReserve" | "finishRelease" | "finishAuthorize" | "finishTerminal" |
  "finishEnd" | "continuationConsume" |
  "submissionBegin" | "submissionAuthorize" | "submissionTerminal" |
  "submissionRelease" | "submissionForget" | "submissionSuppressCheck" |
  "submissionReofferCheck" | "submissionExpiryCheck" |
  "revisionRegister" | "revisionRelease" | "revisionCurrentCheck" |
  "revisionSupersededCheck" | "revisionGenerationCheck" | "revisionCountCheck" |
  "ticketOpen" | "ticketForget" |
  "ticketAddUnit" | "ticketStepUnit" | "ticketUnitCheck" |
  "ticketCollectGateCheck" | "ticketFinalAuthorityCheck" | "ticketJoinedCheck" |
  "ticketRetentionCheck" | "cleanupCheck" | "cleanupCommit" | "deliveryReleaseCheck" |
  "deliveryAcknowledgeCheck" | "deliveryFinalizeCheck" | "deliveryFindingDispositionCheck" |
  "deliverySubmissionCandidateCheck" | "deliverySubmissionBatchCheck" |
  "deliveryCredentialObserveCheck" | "deliveryFinalCredentialCheck" |
  "validationRouteCheck" | "postValidationCheck" | "finalCandidateCheck" |
  "roundBeginStopCheck" | "roundOwnsStopCheck" | "roundStopTerminalCheck" |
  "roundActivityCheck" | "roundBarrierCheck" |
  "roundExpireCloseCheck" | "roundContinuationBudgetCheck" |
  "deliverySubmissionAllowedCheck" | "deliveryExistingTokenCheck" | "deliveryUnreservedStopCheck" |
  "reuseRoute" | "reuseClaim" | "reuseAttach" | "reuseRelease" | "reuseTouch" |
  "cachePrepare" | "cacheCommit" | "cacheDiscardPartition" | "cacheClear" |
  "noticeAdvance" | "noticeCommit" | "noticePrune" | "noticeDrop" |
  "noticeLease" | "noticeClearPending" | "noticeSelect" }>;

const defaultLimits: CapacityLimits = {
  globalItems: GLOBAL_ITEM_LIMIT,
  globalBytes: GLOBAL_BYTE_LIMIT,
  partitionItems: PARTITION_ITEM_LIMIT,
  partitionBytes: PARTITION_BYTE_LIMIT,
};

/** Measure an untrusted logical payload without allowing unknown output size. */
export const encodedBytesWithin = (value: unknown, maximum: number): number | undefined => {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) return undefined;
    const bytes = Buffer.byteLength(encoded, "utf8");
    return bytes <= maximum ? bytes : undefined;
  } catch {
    return undefined;
  }
};

type ReservationRecord = {
  readonly capability: CapacityReservation;
  readonly bytes: number;
  readonly purpose: CapacityPurpose;
};
export type AdviceCapture = {
  readonly reservation: CapacityReservation;
  readonly revision: WorkRevision;
  readonly retainedBytes: number;
};
type AdviceCaptureRecord = { readonly capability: AdviceCapture; readonly retired: boolean };
type ResidentRecords<Pending, Key, Value> = {
  readonly runtime: RuntimeRecordsState;
  readonly adviceCaptures: ReadonlyMap<number, AdviceCaptureRecord>;
  readonly advice: AdviceRecordsState;
  readonly reuse: EvaluationReuseState<Pending>;
  readonly delivery: DeliveryState;
  readonly dispatch: DispatchRegistry<Key, Value>;
  readonly revision: RevisionState;
  readonly ticketUnits: TicketUnitsState;
  readonly tickets: TicketRecordsState;
  readonly joined: JoinedReviewsState;
  readonly rounds: RoundRecordsState;
  readonly notices: NoticeRecordsState;
};
type CapacityState = {
  readonly residentLifetime: string;
  readonly limits: CapacityLimits;
  readonly canonical: unknown;
  readonly reservations: ReadonlyMap<number, ReservationRecord>;
  readonly partitionIds: ReadonlyMap<string, number>;
  readonly partitionIdentityBytes: number;
  readonly roundIds: ReadonlyMap<string, number>;
  readonly requestRounds: ReadonlyMap<number, { readonly partition: string; readonly round: number }>;
  readonly collectionTokens: ReadonlyMap<string, number>;
  readonly nextCollectionToken: number;
  readonly nextPartitionId: number;
  readonly minimumFreshStart: number;
};
type CapacityDraft = {
  -readonly [K in keyof CapacityState]: CapacityState[K] extends ReadonlyMap<infer Key, infer Value> ? Map<Key, Value> : CapacityState[K]
};
type Arguments<F extends (...args: never[]) => unknown> = Parameters<F> extends [unknown, ...infer Rest] ? Rest : never;

const draftCapacity = (current: CapacityState): CapacityDraft => ({
  ...current,
  reservations: new Map(current.reservations), partitionIds: new Map(current.partitionIds),
  roundIds: new Map(current.roundIds), requestRounds: new Map(current.requestRounds),
  collectionTokens: new Map(current.collectionTokens),
});

/** One commit owner for canonical state, capacity identities and native domain records.
 * Draft validation can fail without publishing a partial canonical transition.
 * Synchronous methods bridge existing host callers while the resident service
 * surface is migrated; all internal operations receive their draft explicitly.
 */
export const makeResidentState = <Pending = never, DispatchKey = string, DispatchValue = never>(limits: CapacityLimits = defaultLimits, requestedLifetime?: string) => Effect.gen(function* () {
  const residentLifetime = requestedLifetime ?? (yield* Effect.sync(randomUUID));
  const state = yield* Ref.make<CapacityState & { readonly records: ResidentRecords<Pending, DispatchKey, DispatchValue> }>({
    residentLifetime, limits, canonical: initialCanonical(limits), reservations: new Map(),
    partitionIds: new Map(), partitionIdentityBytes: 0, roundIds: new Map(), requestRounds: new Map(),
    collectionTokens: new Map(), nextCollectionToken: 1, nextPartitionId: 1, minimumFreshStart: 0,
    records: { runtime: initialRuntimeRecords(), adviceCaptures: new Map(), advice: initialAdviceRecords(), reuse: initialEvaluationReuse<Pending>(), delivery: initialDelivery(),
      dispatch: initialDispatchRegistry<DispatchKey, DispatchValue>(), revision: initialRevision(), ticketUnits: initialTicketUnits(), tickets: initialTicketRecords(), joined: initialJoinedReviews(), rounds: initialRoundRecords(), notices: initialNoticeRecords() },
  });
  const read = <A>(operation: (current: CapacityState) => A): A =>
    Effect.runSync(Ref.get(state).pipe(Effect.map(operation)));
  let committing = false;
  const commitAllEffect = <A>(operation: (draft: CapacityDraft, records: ResidentRecords<Pending, DispatchKey, DispatchValue>) =>
    readonly [A, ResidentRecords<Pending, DispatchKey, DispatchValue>]): Effect.Effect<A> =>
    Ref.modify(state, (current) => {
      if (committing) throw new Error("resident capacity commit cannot be reentered");
      committing = true;
      try {
        const draft = draftCapacity(current);
        const [value, records] = operation(draft, current.records);
        const next = draft;
        // Record every published charge peak, including capture workspaces
        // that can be resized or released before any server checkpoint.
        const peakLedgerBytes = Math.max(records.runtime.peakLedgerBytes, projectCanonical(next.canonical).global.bytes);
        const observedRecords = peakLedgerBytes === records.runtime.peakLedgerBytes ? records
          : { ...records, runtime: { ...records.runtime, peakLedgerBytes } };
        return [value, { ...next, records: observedRecords }] as const;
      } finally { committing = false; }
    }).pipe(Effect.withSpan("ResidentState.commit"));
  const commitAll = <A>(operation: Parameters<typeof commitAllEffect<A>>[0]): A =>
    Effect.runSync(commitAllEffect(operation));
  const commit = <A>(operation: (draft: CapacityDraft) => A): A =>
    commitAll((draft, records) => [operation(draft), records]);
  const capacity = capacityOperations(commit, read, residentLifetime);
  const unitCommit = <A>(operation: (operations: ReturnType<typeof ticketUnitOperations>, tickets: TicketRecordsState) => A): Effect.Effect<A> =>
    commitAllEffect((draft, records) => {
      const ticketUnits = draftTicketUnits(records.ticketUnits);
      const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
      const value = operation(ticketUnitOperations(ticketUnits, owner), records.tickets);
      return [value, { ...records, ticketUnits }];
    });
  const ticketUnits: TicketUnits = {
    add: Effect.fn("ResidentState.addTicketUnit")((record) => unitCommit((operations, tickets) => {
      if (tickets.entries.get(record.ticket.nonce) !== record) {
        throw new Error("native ticket unit admission lost its ticket capability");
      }
      return operations.add(record.generation, (id, ticketId) => Object.freeze({ id, ticketId }));
    })),
    values: Effect.fn("ResidentState.ticketUnitValues")(() => Ref.get(state).pipe(Effect.map((state) =>
      [...state.records.ticketUnits.entries.values()].map((entry) => entry.capability)))),
    current: Effect.fn("ResidentState.ticketUnitCurrent")((unit) => Ref.get(state).pipe(Effect.map((state) => {
      const entry = state.records.ticketUnits.entries.get(unit.id);
      return entry?.capability === unit ? entry.current : emptyTicketUnitCurrent;
    }))),
    stage: Effect.fn("ResidentState.ticketUnitStage")((unit) => unitCommit((operations) => operations.stage(unit))),
    step: Effect.fn("ResidentState.stepTicketUnit")((...args) => unitCommit((operations) => operations.step(...args))),
    fail: Effect.fn("ResidentState.failTicketUnit")((...args) => unitCommit((operations) => operations.fail(...args))),
    revise: Effect.fn("ResidentState.reviseTicketUnit")((...args) => unitCommit((operations) => operations.revise(...args))),
    clear: Effect.fn("ResidentState.clearTicketUnit")((...args) => unitCommit((operations) => operations.clear(...args))),
    markAdviceDelivered: Effect.fn("ResidentState.markAdviceDelivered")((...args) => unitCommit((operations) => operations.markAdviceDelivered(...args))),
  };
  const ticketCommit = <A>(operation: (operations: ReturnType<typeof ticketRecordOperations>) => A): Effect.Effect<A> =>
    commitAllEffect((draft, records) => {
      const tickets = draftTicketRecords(records.tickets);
      const ticketUnits = draftTicketUnits(records.ticketUnits);
      const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
      const units = ticketUnitOperations(ticketUnits, owner);
      const operations = ticketRecordOperations(tickets, owner, units.forget);
      const value = operation(operations);
      operations.assert();
      return [value, { ...records, tickets, ticketUnits }];
    });
  const tickets: TicketRecords = {
    open: Effect.fn("ResidentState.openTicket")((input) => ticketCommit((operations) => operations.open(input))),
    get: Effect.fn("ResidentState.getTicket")((nonce) => Ref.get(state).pipe(Effect.map((current) => current.records.tickets.entries.get(nonce)))),
    forget: Effect.fn("ResidentState.forgetTicket")((record) => ticketCommit((operations) => operations.forget(record))),
    discardPartition: Effect.fn("ResidentState.discardPartitionTickets")((partition) => ticketCommit((operations) => operations.discardPartition(partition))),
    retain: Effect.fn("ResidentState.retainTickets")((limit) => ticketCommit((operations) => operations.retain(limit))),
  };
  const roundCommit = <A>(operation: (operations: ReturnType<typeof roundRecordOperations>) => A): Effect.Effect<A> =>
    commitAllEffect((draft, records) => {
      const rounds = draftRoundRecords(records.rounds);
      const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
      const value = operation(roundRecordOperations(rounds, owner));
      return [value, { ...records, rounds }];
    });
  const rounds: RoundRecords = {
    bind: Effect.fn("ResidentState.bindRound")((group, generation, activity, cohortId) => roundCommit((operations) => operations.bind(group, generation, activity, (canonicalRound) => {
      const issuedWork: WorkCohort = Object.freeze({ id: cohortId, controller: new AbortController() });
      const discarded = Object.freeze({ queued: 0, running: 0 });
      const capability: RoundWork = Object.freeze({
        group, generation, canonicalRound, controller: new AbortController(),
      });
      return { capability, work: issuedWork, discarded };
    }))),
    get: Effect.fn("ResidentState.getRound")((group) => Ref.get(state).pipe(Effect.map((state) => state.records.rounds.entries.get(group)?.capability))),
    entries: Effect.fn("ResidentState.roundEntries")(() => Ref.get(state).pipe(Effect.map((state) =>
      [...state.records.rounds.entries].map(([group, record]) => [group, record.capability] as const)))),
    activity: Effect.fn("ResidentState.roundActivity")((round) => Ref.get(state).pipe(Effect.map((state) => {
      const record = state.records.rounds.entries.get(round.group);
      return record?.capability === round ? record.activity : undefined;
    }))),
    snapshot: Effect.fn("ResidentState.roundSnapshot")((round) => Ref.get(state).pipe(Effect.map((state) => {
      const record = state.records.rounds.entries.get(round.group);
      return record?.capability === round ? record : undefined;
    }))),
    policyWork: Effect.fn("ResidentState.roundPolicyWork")((round) => Ref.get(state).pipe(Effect.map((state) => {
      const partition = state.partitionIds.get(round.group);
      const current = state.records.rounds.entries.get(round.group)?.capability === round;
      return workView(current && partition !== undefined ? canonicalProjection(state)
        : { work: [], pendingFindings: [] }, partition ?? 0, round.canonicalRound);
    }))),
    replaceWork: Effect.fn("ResidentState.replaceRoundWork")((...args) => roundCommit((operations) => operations.replaceWork(...args))),
    retire: Effect.fn("ResidentState.retireRound")((round) => roundCommit((operations) => operations.retire(round))),
  };
  const runtimeCommitEffect = <A>(operation: (runtime: ReturnType<typeof runtimeRecordOperations>) => A): Effect.Effect<A> =>
    commitAllEffect((_draft, records) => {
      const runtime = draftRuntimeRecords(records.runtime);
      const value = operation(runtimeRecordOperations(runtime, residentLifetime));
      return [value, { ...records, runtime }];
    });
  return {
    ...capacity,
    consumeEditPermit: Effect.fn("Capacity.consumeEditPermit")((...args: Arguments<typeof consumeEditPermit>) => commitAllEffect((draft, records) => [consumeEditPermit(draft, ...args), records])),
    acknowledgeStopRelease: Effect.fn("Capacity.acknowledgeStopRelease")((...args: Arguments<typeof acknowledgeStopRelease>) => commitAllEffect((draft, records) => [acknowledgeStopRelease(draft, ...args), records])),
    retireRound: Effect.fn("Capacity.retireRound")((...args: Arguments<typeof retireRound>) => commitAllEffect((draft, records) => [retireRound(draft, ...args), records])),
    minimumFreshStart: Effect.fn("Capacity.minimumFreshStart")((...args: Arguments<typeof minimumFreshStart>) => Ref.get(state).pipe(Effect.map((snapshot) => minimumFreshStart(snapshot, ...args)))),
    partitionIdentityCount: Effect.fn("Capacity.partitionIdentityCount")((...args: Arguments<typeof partitionIdentityCount>) => Ref.get(state).pipe(Effect.map((snapshot) => partitionIdentityCount(snapshot, ...args)))),
    partitionIdentityBytes: Effect.fn("Capacity.partitionIdentityBytes")((...args: Arguments<typeof partitionIdentityBytes>) => Ref.get(state).pipe(Effect.map((snapshot) => partitionIdentityBytes(snapshot, ...args)))),
    collectionTokenIdentityCount: Effect.fn("Capacity.collectionTokenIdentityCount")((...args: Arguments<typeof collectionTokenIdentityCount>) => Ref.get(state).pipe(Effect.map((snapshot) => collectionTokenIdentityCount(snapshot, ...args)))),
    currentRoundId: Effect.fn("Capacity.currentRoundId")((...args: Arguments<typeof currentRoundId>) => Ref.get(state).pipe(Effect.map((snapshot) => currentRoundId(snapshot, ...args)))),
    roundId: Effect.fn("Capacity.roundId")((partition: string) => commitAllEffect((draft, records) => [roundId(draft, partition), records])),
    collectionTokenId: Effect.fn("Capacity.collectionTokenId")((...args: Arguments<typeof collectionTokenId>) => commitAllEffect((draft, records) => [collectionTokenId(draft, ...args), records])),
    discardUnusedPartition: Effect.fn("Capacity.discardUnusedPartition")((...args: Arguments<typeof discardUnusedPartition>) => commitAllEffect((draft, records) => [discardUnusedPartition(draft, ...args), records])),
    dispatchScope: Effect.fn("Capacity.dispatchScope")((...args: Arguments<typeof dispatchScope>) => commitAllEffect((draft, records) => [dispatchScope(draft, ...args), records])),
    partitionId: Effect.fn("Capacity.partitionId")((partition: string) => commitAllEffect((draft, records) => [partitionId(draft, partition), records])),
    dispatchIdentity: Effect.fn("Capacity.dispatchIdentity")((...args: Arguments<typeof dispatchIdentity>) => commitAllEffect((draft, records) => [dispatchIdentity(draft, ...args), records])),
    pruneCollectionTokenIds: Effect.fn("Capacity.pruneCollectionTokenIds")((nativeLive: ReadonlySet<string>) => commitAllEffect((draft, records) => [pruneCollectionTokenIds(draft, nativeLive), records])),
    reservationSnapshot: Effect.fn("Capacity.reservationSnapshot")((capability: CapacityReservation) => Ref.get(state).pipe(Effect.map((snapshot) => {
      const record = snapshot.reservations.get(capability.id);
      return record?.capability === capability ? Object.freeze({ bytes: record.bytes, purpose: record.purpose }) : undefined;
    }))),
    runtime: {
      snapshot: Effect.fn("RuntimeRecords.snapshot")(() => Ref.get(state).pipe(Effect.map((snapshot) => runtimeRecordView(snapshot.records.runtime)))),
      openConnection: Effect.fn("ResidentState.openConnection")((maximum: number) => runtimeCommitEffect((operations) => operations.openConnection(maximum))),
      releaseConnection: Effect.fn("ResidentState.releaseConnection")((connection: Parameters<ReturnType<typeof runtimeRecordOperations>["releaseConnection"]>[0]) => runtimeCommitEffect((operations) => operations.releaseConnection(connection))),
      rejectCapacity: Effect.fn("ResidentState.rejectCapacity")(() => runtimeCommitEffect((operations) => operations.rejectCapacity())),
      observePreparedUnits: Effect.fn("ResidentState.observePreparedUnits")((units: number) => runtimeCommitEffect((operations) => operations.observePreparedUnits(units))),
      nextAuthoritySequence: Effect.fn("ResidentState.nextAuthoritySequence")(() => runtimeCommitEffect((operations) => operations.nextAuthoritySequence())),
      scheduleRetirement: Effect.fn("ResidentState.scheduleRetirement")(() => runtimeCommitEffect((operations) => operations.scheduleRetirement())),
      close: () => runtimeCommitEffect((operations) => operations.close()),
      cleanup: (logicalBytes: (value: unknown) => number): Effect.Effect<"busy" | "cleaned"> => commitAllEffect((draft, records) => {
        if (records.runtime.lifecycle !== "active") return ["busy", records];
        const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
        const reuse = evaluationReuseView(records.reuse, owner).snapshot();
        const capacity = owner.snapshot();
        const revision = draftRevision(records.revision);
        const check = owner.transition({ kind: "cleanupCheck", facts: {
          active: records.runtime.lifecycle === "active",
          dispatcherIdle: records.dispatch.entries.size === 0,
          noAdvice: records.advice.entries.size === 0,
          noNotices: [...records.notices.entries.values()].every((notice) => notice.pending === undefined),
          noPendingEvaluations: reuse.pending === 0,
          noCurrentWork: revisionOperations(revision, owner).count() === 0,
          noCooldowns: records.notices.entries.size === 0,
          connectionCountOk: records.runtime.connections.size <= 1,
          cacheMatchesLedger: capacity.items === reuse.entries && capacity.bytes === reuse.bytes,
        } });
        if (check.rejection !== undefined || check.commands.length !== 1) throw new Error("canonical cleanup check refused");
        if (check.commands[0]?.kind === "cleanupBusy") return ["busy", records];
        if (check.commands[0]?.kind !== "cleanupReady") throw new Error("invalid canonical cleanup check");
        const clearedReuse = draftEvaluationReuse(records.reuse);
        evaluationReuseOperations(clearedReuse, owner, logicalBytes).clear();
        const tickets = draftTicketRecords(records.tickets);
        const ticketUnits = draftTicketUnits(records.ticketUnits);
        const ticketOperations = ticketRecordOperations(tickets, owner, ticketUnitOperations(ticketUnits, owner).forget);
        ticketOperations.retain(0);
        ticketOperations.assert();
        const commit = owner.transition({ kind: "cleanupCommit" });
        if (commit.rejection !== undefined || commit.commands.length !== 1) throw new Error("canonical cleanup commit refused");
        if (commit.commands[0]?.kind === "cleanupBusy") {
          return ["busy", { ...records, revision, reuse: clearedReuse, tickets, ticketUnits }];
        }
        if (commit.commands[0]?.kind !== "cleanupCommitted") throw new Error("invalid canonical cleanup commit");
        const runtime = draftRuntimeRecords(records.runtime);
        runtimeRecordOperations(runtime, residentLifetime).retire();
        return ["cleaned", { ...records, runtime, revision, reuse: clearedReuse, tickets, ticketUnits }];
      }),
    },
    rounds,
    ticketUnits,
    tickets,
    clear: Effect.fn("ResidentState.clear")(() => commitAllEffect((draft, records) => {
      const dispatch = records.dispatch;
      if (dispatch.entries.size !== 0) throw new Error("resident state cannot clear outstanding native dispatch jobs");
      if (records.adviceCaptures.size !== 0) throw new Error("resident state cannot clear outstanding advice captures");
      return [clear(draft), { runtime: records.runtime, adviceCaptures: new Map(), advice: initialAdviceRecords(), reuse: initialEvaluationReuse<Pending>(), delivery: initialDelivery(), revision: initialRevision(), ticketUnits: initialTicketUnits(), tickets: initialTicketRecords(), joined: initialJoinedReviews(), rounds: initialRoundRecords(), notices: initialNoticeRecords(),
        dispatch: { ...initialDispatchRegistry<DispatchKey, DispatchValue>(), executorAttached: dispatch.executorAttached } }];
    })),
    revision: (() => {
      const revisionChange = <A>(operation: (operations: RevisionOperations) => A): Parameters<typeof commitAllEffect<A>>[0] =>
        (draft, records) => {
          const revision = draftRevision(records.revision);
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          const operations = revisionOperations(revision, owner);
          const value = operation(operations);
          operations.assert();
          return [value, { ...records, revision }];
        };
      const revisionRead = <A>(operation: (operations: Pick<RevisionOperations, "count" | "generation" | "superseded" | "current">) => A): Effect.Effect<A> =>
        Ref.get(state).pipe(Effect.map((snapshot) => {
          // Bend check events run against a private draft of this one snapshot.
          // Queries must not publish identity allocations or canonical state.
          const draft = draftCapacity(snapshot);
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          return operation(revisionOperations(draftRevision(snapshot.records.revision), owner));
        }));
      return {
        count: Effect.fn("RevisionRecords.count")((...args: Parameters<RevisionOperations["count"]>) =>
          revisionRead((operations) => operations.count(...args))),
        generation: Effect.fn("RevisionRecords.generation")((...args: Parameters<RevisionOperations["generation"]>) =>
          revisionRead((operations) => operations.generation(...args))),
        register: Effect.fn("RevisionRecords.register")((...args: Parameters<RevisionOperations["register"]>) =>
          commitAllEffect(revisionChange((operations) => operations.register(...args)))),
        superseded: Effect.fn("RevisionRecords.superseded")((...args: Parameters<RevisionOperations["superseded"]>) =>
          revisionRead((operations) => operations.superseded(...args))),
        current: Effect.fn("RevisionRecords.current")((...args: Parameters<RevisionOperations["current"]>) =>
          revisionRead((operations) => operations.current(...args))),
        release: Effect.fn("RevisionRecords.release")((...args: Parameters<RevisionOperations["release"]>) =>
          commitAllEffect(revisionChange((operations) => operations.release(...args)))),
      };
    })(),
    dispatch: {
      read: Ref.get(state).pipe(Effect.map((current) => current.records.dispatch)),
      modify: <A>(operation: (current: DispatchRegistry<DispatchKey, DispatchValue>, ledger: CapacityLedger) => readonly [A, DispatchRegistry<DispatchKey, DispatchValue>]) =>
        commitAllEffect((draft, records) => {
          const current = records.dispatch;
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          const [value, dispatch] = operation(current, owner);
          return [value, { ...records, dispatch }];
        }),
    } satisfies DispatchState<DispatchKey, DispatchValue>,
    delivery: (reportRepeat: (diagnostic: RepeatEditDiagnostic) => void = () => {}) => {
      const deliveryCommitEffect = <A>(operation: (operations: ComposedDelivery) => A): Effect.Effect<A> => Effect.gen(function* () {
        const [value, diagnostics] = yield* commitAllEffect((draft, records) => {
          const current = records.delivery;
          const delivery = draftDelivery(current);
          const diagnostics: RepeatEditDiagnostic[] = [];
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          const operations = deliveryOperations(delivery, owner, (diagnostic) => diagnostics.push(diagnostic));
          const value = operation(operations);
          assertDeliveryState(delivery, owner);
          return [[value, diagnostics] as const, { ...records, delivery }];
        });
        // Diagnostics run after publication, outside the atomic commit. A
        // diagnostic failure cannot undo admission or change policy decisions.
        for (const diagnostic of diagnostics) {
          try { reportRepeat(diagnostic); } catch { /* diagnostic sink unavailable */ }
        }
        return value;
      }).pipe(Effect.uninterruptible);
      const deliveryRead = <A>(operation: (view: ReturnType<typeof deliveryView>) => A): Effect.Effect<A> =>
        Ref.get(state).pipe(Effect.map((snapshot) => {
          const draft = draftCapacity(snapshot);
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          return operation(deliveryView(snapshot.records.delivery, owner));
        }));
      return {
        canonical: capacity,
        claimBackground: Effect.fn("ComposedDelivery.claimBackground")((...args: Parameters<ComposedDelivery["claimBackground"]>) => deliveryCommitEffect((operations) => operations.claimBackground(...args))),
        releaseBackground: Effect.fn("ComposedDelivery.releaseBackground")((...args: Parameters<ComposedDelivery["releaseBackground"]>) => deliveryCommitEffect((operations) => operations.releaseBackground(...args))),
        advance: Effect.fn("ComposedDelivery.advance")((...args: Parameters<ComposedDelivery["advance"]>) => deliveryCommitEffect((operations) => operations.advance(...args))),
        recentEditCount: Effect.fn("ComposedDelivery.recentEditCount")((...args: Parameters<ComposedDelivery["recentEditCount"]>) => deliveryRead((view) => view.recentEditCount(...args))),
        editIdentityMappingCount: Effect.fn("ComposedDelivery.editIdentityMappingCount")((...args: Parameters<ComposedDelivery["editIdentityMappingCount"]>) => deliveryRead((view) => view.editIdentityMappingCount(...args))),
        liveCollectionTokenKeys: Effect.fn("ComposedDelivery.liveCollectionTokenKeys")((...args: Parameters<ComposedDelivery["liveCollectionTokenKeys"]>) => deliveryRead((view) => view.liveCollectionTokenKeys(...args))),
        ensureFromHostTurn: Effect.fn("ComposedDelivery.ensureFromHostTurn")((...args: Parameters<ComposedDelivery["ensureFromHostTurn"]>) => deliveryCommitEffect((operations) => operations.ensureFromHostTurn(...args))),
        registerEdit: Effect.fn("ComposedDelivery.registerEdit")((...args: Parameters<ComposedDelivery["registerEdit"]>) => deliveryCommitEffect((operations) => operations.registerEdit(...args))),
        registerEditDecision: Effect.fn("ComposedDelivery.registerEditDecision")((...args: Parameters<ComposedDelivery["registerEditDecision"]>) => deliveryCommitEffect((operations) => operations.registerEditDecision(...args))),
        admitEdit: Effect.fn("ComposedDelivery.admitEdit")((...args: Parameters<ComposedDelivery["admitEdit"]>) => deliveryCommitEffect((operations) => operations.admitEdit(...args))),
        expirePermits: Effect.fn("ComposedDelivery.expirePermits")((...args: Parameters<ComposedDelivery["expirePermits"]>) => deliveryCommitEffect((operations) => operations.expirePermits(...args))),
        hasPendingEdits: Effect.fn("ComposedDelivery.hasPendingEdits")((...args: Parameters<ComposedDelivery["hasPendingEdits"]>) => deliveryCommitEffect((operations) => operations.hasPendingEdits(...args))),
        isActive: Effect.fn("ComposedDelivery.isActive")((...args: Parameters<ComposedDelivery["isActive"]>) => deliveryCommitEffect((operations) => operations.isActive(...args))),
        beginStop: Effect.fn("ComposedDelivery.beginStop")((...args: Parameters<ComposedDelivery["beginStop"]>) => deliveryCommitEffect((operations) => operations.beginStop(...args))),
        ownsStop: Effect.fn("ComposedDelivery.ownsStop")((...args: Parameters<ComposedDelivery["ownsStop"]>) => deliveryCommitEffect((operations) => operations.ownsStop(...args))),
        finishGate: Effect.fn("ComposedDelivery.finishGate")((...args: Parameters<ComposedDelivery["finishGate"]>) => deliveryCommitEffect((operations) => operations.finishGate(...args))),
        reserveFinishOutput: Effect.fn("ComposedDelivery.reserveFinishOutput")((...args: Parameters<ComposedDelivery["reserveFinishOutput"]>) => deliveryCommitEffect((operations) => operations.reserveFinishOutput(...args))),
        decideFinishOutput: Effect.fn("ComposedDelivery.decideFinishOutput")((...args: Parameters<ComposedDelivery["decideFinishOutput"]>) => deliveryCommitEffect((operations) => operations.decideFinishOutput(...args))),
        revokeProvisionalFinishOutput: Effect.fn("ComposedDelivery.revokeProvisionalFinishOutput")((...args: Parameters<ComposedDelivery["revokeProvisionalFinishOutput"]>) => deliveryCommitEffect((operations) => operations.revokeProvisionalFinishOutput(...args))),
        hasFinishPermit: Effect.fn("ComposedDelivery.hasFinishPermit")((...args: Parameters<ComposedDelivery["hasFinishPermit"]>) => deliveryRead((view) => view.hasFinishPermit(...args))),
        isFinishAuthorized: Effect.fn("ComposedDelivery.isFinishAuthorized")((...args: Parameters<ComposedDelivery["isFinishAuthorized"]>) => deliveryRead((view) => view.isFinishAuthorized(...args))),
        finishSelectionMatches: Effect.fn("ComposedDelivery.finishSelectionMatches")((...args: Parameters<ComposedDelivery["finishSelectionMatches"]>) => deliveryCommitEffect((operations) => operations.finishSelectionMatches(...args))),
        authorizeFinishOutput: Effect.fn("ComposedDelivery.authorizeFinishOutput")((...args: Parameters<ComposedDelivery["authorizeFinishOutput"]>) => deliveryCommitEffect((operations) => operations.authorizeFinishOutput(...args))),
        finishStop: Effect.fn("ComposedDelivery.finishStop")((...args: Parameters<ComposedDelivery["finishStop"]>) => deliveryCommitEffect((operations) => operations.finishStop(...args))),
        tickQuietRound: Effect.fn("ComposedDelivery.tickQuietRound")((...args: Parameters<ComposedDelivery["tickQuietRound"]>) => deliveryCommitEffect((operations) => operations.tickQuietRound(...args))),
        closureCounts: Effect.fn("ComposedDelivery.closureCounts")((...args: Parameters<ComposedDelivery["closureCounts"]>) => deliveryCommitEffect((operations) => operations.closureCounts(...args))),
        expireStop: Effect.fn("ComposedDelivery.expireStop")((...args: Parameters<ComposedDelivery["expireStop"]>) => deliveryCommitEffect((operations) => operations.expireStop(...args))),
        isDeciding: Effect.fn("ComposedDelivery.isDeciding")((...args: Parameters<ComposedDelivery["isDeciding"]>) => deliveryCommitEffect((operations) => operations.isDeciding(...args))),
        canSubmit: Effect.fn("ComposedDelivery.canSubmit")((...args: Parameters<ComposedDelivery["canSubmit"]>) => deliveryCommitEffect((operations) => operations.canSubmit(...args))),
        canBeginSubmission: Effect.fn("ComposedDelivery.canBeginSubmission")((...args: Parameters<ComposedDelivery["canBeginSubmission"]>) => deliveryCommitEffect((operations) => operations.canBeginSubmission(...args))),
        canBeginExistingToken: Effect.fn("ComposedDelivery.canBeginExistingToken")((...args: Parameters<ComposedDelivery["canBeginExistingToken"]>) => deliveryCommitEffect((operations) => operations.canBeginExistingToken(...args))),
        generation: Effect.fn("ComposedDelivery.generation")((...args: Parameters<ComposedDelivery["generation"]>) => deliveryCommitEffect((operations) => operations.generation(...args))),
        consumeStop: Effect.fn("ComposedDelivery.consumeStop")((...args: Parameters<ComposedDelivery["consumeStop"]>) => deliveryCommitEffect((operations) => operations.consumeStop(...args))),
        hasVirtualRoundContinuationBudget: Effect.fn("ComposedDelivery.hasVirtualRoundContinuationBudget")((...args: Parameters<ComposedDelivery["hasVirtualRoundContinuationBudget"]>) => deliveryCommitEffect((operations) => operations.hasVirtualRoundContinuationBudget(...args))),
        beginSubmission: Effect.fn("ComposedDelivery.beginSubmission")((...args: Parameters<ComposedDelivery["beginSubmission"]>) => deliveryCommitEffect((operations) => operations.beginSubmission(...args))),
        markSubmitted: Effect.fn("ComposedDelivery.markSubmitted")((...args: Parameters<ComposedDelivery["markSubmitted"]>) => deliveryCommitEffect((operations) => operations.markSubmitted(...args))),
        markUncertain: Effect.fn("ComposedDelivery.markUncertain")((...args: Parameters<ComposedDelivery["markUncertain"]>) => deliveryCommitEffect((operations) => operations.markUncertain(...args))),
        release: Effect.fn("ComposedDelivery.release")((...args: Parameters<ComposedDelivery["release"]>) => deliveryCommitEffect((operations) => operations.release(...args))),
        forget: Effect.fn("ComposedDelivery.forget")((...args: Parameters<ComposedDelivery["forget"]>) => deliveryCommitEffect((operations) => operations.forget(...args))),
        suppresses: Effect.fn("ComposedDelivery.suppresses")((...args: Parameters<ComposedDelivery["suppresses"]>) => deliveryCommitEffect((operations) => operations.suppresses(...args))),
        backgroundReofferable: Effect.fn("ComposedDelivery.backgroundReofferable")((...args: Parameters<ComposedDelivery["backgroundReofferable"]>) => deliveryCommitEffect((operations) => operations.backgroundReofferable(...args))),
        hasToken: Effect.fn("ComposedDelivery.hasToken")((...args: Parameters<ComposedDelivery["hasToken"]>) => deliveryRead((view) => view.hasToken(...args))),
        expire: Effect.fn("ComposedDelivery.expire")((...args: Parameters<ComposedDelivery["expire"]>) => deliveryCommitEffect((operations) => operations.expire(...args))),
      };
    },
    advice: (() => {
      const adviceChange = <A>(operation: (operations: AdviceRecordOperations) => A): Parameters<typeof commitAllEffect<A>>[0] => (draft, records) => {
        const advice = draftAdviceRecords(records.advice);
        const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
        const operations = adviceRecordOperations(advice, owner);
        const value = operation(operations);
        operations.assert();
        return [value, { ...records, advice }];
      };
      return {
        snapshots: Effect.fn("AdviceRecords.snapshots")(() => Ref.get(state).pipe(Effect.map((snapshot) =>
          Object.freeze([...snapshot.records.advice.entries.values()]
            .map(({ capability, content }) => Object.freeze({ capability, content }))
            .sort((left, right) => left.capability.sequence - right.capability.sequence))))),
        current: Effect.fn("AdviceRecords.current")((capability: Advice) => Ref.get(state).pipe(Effect.map((snapshot) => {
          const retained = snapshot.records.advice.entries.get(capability.id);
          return retained?.capability === capability ? retained.content : emptyAdviceContent;
        }))),
        values: Effect.fn("AdviceRecords.values")(() => Ref.get(state).pipe(Effect.map((snapshot) =>
          Object.freeze([...snapshot.records.advice.entries.values()]
            .map(({ capability }) => capability).sort((left, right) => left.sequence - right.sequence))))),
        insert: Effect.fn("AdviceRecords.insert")((initial: AdviceInitial): Effect.Effect<Advice> => commitAllEffect(adviceChange((operations) => operations.insert(initial, (metadata) => {
          return Object.freeze({ ...metadata });
        })))),
        publish: Effect.fn("AdviceRecords.publish")((capability: Advice, unit?: TicketUnit, revision: WorkRevision = capability.revision): Effect.Effect<ReadonlyArray<JoinedReviewOutcome>> =>
          commitAllEffect((draft, records) => {
            if (records.advice.entries.get(capability.id)?.capability !== capability) return [[], records];
            const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
            const ticketUnits = draftTicketUnits(records.ticketUnits);
            const units = ticketUnitOperations(ticketUnits, owner);
            if (unit !== undefined && units.step(unit, "findingResult", "lost", { revision, adviceId: capability.id }) &&
                units.stage(unit)?.stage !== "finding") throw new Error("invalid canonical ticket finding stage");
            const joined = draftJoinedReviews(records.joined);
            const revisions = revisionOperations(draftRevision(records.revision), owner);
            const outcomes = joinedReviewOperations(joined, owner, units, revisions)
              .settle(capability.evaluationKey, "finding", "lost", capability.id);
            return [outcomes, { ...records, ticketUnits, joined }];
          })),
        eligible: Effect.fn("AdviceRecords.eligible")((...args: Parameters<AdviceRecordOperations["eligible"]>) =>
          commitAllEffect(adviceChange((operations) => operations.eligible(...args)))),
        revise: Effect.fn("AdviceRecords.revise")((...args: Parameters<AdviceRecordOperations["revise"]>) =>
          commitAllEffect(adviceChange((operations) => operations.revise(...args)))),
        reserveLease: Effect.fn("AdviceRecords.reserveLease")((...args: Parameters<AdviceRecordOperations["reserveLease"]>) =>
          commitAllEffect(adviceChange((operations) => operations.reserveLease(...args)))),
        releaseLease: Effect.fn("AdviceRecords.releaseLease")((...args: Parameters<AdviceRecordOperations["releaseLease"]>) =>
          commitAllEffect(adviceChange((operations) => operations.releaseLease(...args)))),
        checkLease: Effect.fn("AdviceRecords.checkLease")((...args: Parameters<AdviceRecordOperations["checkLease"]>) =>
          commitAllEffect(adviceChange((operations) => operations.checkLease(...args)))),
        updateDelivery: Effect.fn("AdviceRecords.updateDelivery")((...args: Parameters<AdviceRecordOperations["updateDelivery"]>) =>
          commitAllEffect(adviceChange((operations) => operations.updateDelivery(...args)))),
        remove: Effect.fn("AdviceRecords.remove")((capability: Advice, reason: "expired" | "stale", token?: string): Effect.Effect<boolean> => commitAllEffect((draft, records) => {
          const advice = draftAdviceRecords(records.advice);
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          const operations = adviceRecordOperations(advice, owner);
          if (!operations.remove(capability, token)) return [false, records];
          const delivery = draftDelivery(records.delivery);
          const deliveryOps = deliveryOperations(delivery, owner, () => {});
          deliveryOps.forget(capability.id);
          const ticketUnits = draftTicketUnits(records.ticketUnits);
          const units = ticketUnitOperations(ticketUnits, owner);
          for (const { capability: unit, current } of ticketUnits.entries.values()) {
            const stage = units.stage(unit);
            if (stage?.stage === "finding" && current.adviceId === capability.id && !stage.delivered) {
              if (!units.step(unit, "failUnit", reason, {})) throw new Error("canonical advice ticket retirement refused");
            }
          }
          const adviceCaptures = new Map(records.adviceCaptures);
          const capture = adviceCaptures.get(capability.reservation.id);
          const revision = draftRevision(records.revision);
          const revisions = revisionOperations(revision, owner);
          if (capture?.capability.reservation === capability.reservation) {
            adviceCaptures.set(capability.reservation.id, Object.freeze({ ...capture, retired: true }));
          } else {
            owner.release(capability.reservation);
            revisions.release(capability.revision);
          }
          operations.assert();
          revisions.assert();
          assertDeliveryState(delivery, owner);
          return [true, { ...records, advice, delivery, ticketUnits, adviceCaptures, revision }];
        })),
      };
    })(),
    adviceCaptures: (() => {
      const captureChange = <A>(operation: (
        captures: Map<number, AdviceCaptureRecord>, owner: CapacityLedger, revision: RevisionOperations,
      ) => A): Parameters<typeof commitAllEffect<A>>[0] => (draft, records) => {
        const captures = new Map(records.adviceCaptures);
        const revision = draftRevision(records.revision);
        const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
        const revisions = revisionOperations(revision, owner);
        const value = operation(captures, owner, revisions);
        revisions.assert();
        return [value, { ...records, adviceCaptures: captures, revision }];
      };
      return {
        start: Effect.fn("AdviceCaptures.start")((reservation: CapacityReservation, revision: WorkRevision, workspaceBytes: number): Effect.Effect<AdviceCapture | undefined> =>
          commitAllEffect(captureChange((captures, owner) => {
            if (captures.has(reservation.id)) return undefined;
            const retained = owner.reservationSnapshot(reservation);
            if (retained === undefined) return undefined;
            const retainedBytes = retained.bytes;
            if (!owner.resize(reservation, retainedBytes + workspaceBytes, "adviceRecheck")) return undefined;
            const capability = Object.freeze({ reservation, revision, retainedBytes });
            captures.set(reservation.id, Object.freeze({ capability, retired: false }));
            return capability;
          }))),
        resize: Effect.fn("AdviceCaptures.resize")((capture: AdviceCapture, workspaceBytes: number): Effect.Effect<boolean> => commitAllEffect(captureChange((captures, owner) => {
          if (captures.get(capture.reservation.id)?.capability !== capture) return false;
          return owner.resize(capture.reservation, capture.retainedBytes + workspaceBytes, "adviceRecheck");
        }))),
        retire: Effect.fn("AdviceCaptures.retire")((reservation: CapacityReservation): Effect.Effect<boolean> => commitAllEffect(captureChange((captures) => {
          const record = captures.get(reservation.id);
          if (record?.capability.reservation !== reservation) return false;
          captures.set(reservation.id, Object.freeze({ ...record, retired: true }));
          return true;
        }))),
        finish: Effect.fn("AdviceCaptures.finish")((capture: AdviceCapture): Effect.Effect<"retained" | "retired" | "stale"> => commitAllEffect(captureChange((captures, owner, revisions) => {
          const record = captures.get(capture.reservation.id);
          if (record?.capability !== capture) return "stale";
          if (record.retired) {
            owner.release(capture.reservation);
            revisions.release(capture.revision);
          } else if (!owner.resize(capture.reservation, capture.retainedBytes, "storedResult")) {
            throw new Error("advice capture could not restore its retained reservation");
          }
          captures.delete(capture.reservation.id);
          return record.retired ? "retired" : "retained";
        }))),
        count: Effect.fn("AdviceCaptures.count")(() => Ref.get(state).pipe(Effect.map((snapshot) => snapshot.records.adviceCaptures.size))),
      };
    })(),
    notices: (maximumKeys: number, cooldownMs: number, lifetimeMs: number, measure: (value: unknown) => number) => {
      const noticeChange = <A>(operation: (operations: NoticeRecordOperations) => A, identity = ""): Parameters<typeof commitAllEffect<A>>[0] => (draft, records) => {
        const notices = draftNoticeRecords(records.notices);
        const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
        const operations = noticeRecordOperations(notices, owner, maximumKeys, cooldownMs, lifetimeMs, measure, identity);
        const value = operation(operations);
        operations.assert();
        for (const record of notices.entries.values()) {
          if (record.pending !== undefined) {
            Object.freeze(record.pending.value);
            if (record.pending.delivery !== undefined) Object.freeze(record.pending.delivery);
            Object.freeze(record.pending);
          }
          Object.freeze(record);
        }
        return [value, { ...records, notices }];
      };
      return {
        entries: Effect.fn("NoticeRecords.entries")(() => Ref.get(state).pipe(Effect.map((snapshot): ReadonlyArray<readonly [string, NoticeCooldownSnapshot]> =>
          Object.freeze([...snapshot.records.notices.entries].map(([key, value]) => Object.freeze([key, value] as const)))))),
        record: Effect.fn("NoticeRecords.record")((...args: Parameters<NoticeRecordOperations["record"]>) =>
          Effect.suspend(() => commitAllEffect(noticeChange((operations) => operations.record(...args), randomUUID())))),
        prune: Effect.fn("NoticeRecords.prune")((...args: Parameters<NoticeRecordOperations["prune"]>) => commitAllEffect(noticeChange((operations) => operations.prune(...args)))),
        drop: Effect.fn("NoticeRecords.drop")((...args: Parameters<NoticeRecordOperations["drop"]>) => commitAllEffect(noticeChange((operations) => operations.drop(...args)))),
        remove: Effect.fn("NoticeRecords.remove")((...args: Parameters<NoticeRecordOperations["remove"]>) => commitAllEffect(noticeChange((operations) => operations.remove(...args)))),
        release: Effect.fn("NoticeRecords.release")((...args: Parameters<NoticeRecordOperations["release"]>) => commitAllEffect(noticeChange((operations) => operations.release(...args)))),
        acknowledge: Effect.fn("NoticeRecords.acknowledge")((...args: Parameters<NoticeRecordOperations["acknowledge"]>) => commitAllEffect(noticeChange((operations) => operations.acknowledge(...args)))),
        renew: Effect.fn("NoticeRecords.renew")((...args: Parameters<NoticeRecordOperations["renew"]>) => commitAllEffect(noticeChange((operations) => operations.renew(...args)))),
      };
    },
    joinedReviews: (logicalBytes: (value: unknown) => number): JoinedReviews<Pending> => {
      const joinedChange = <A>(operation: (joined: ReturnType<typeof joinedReviewOperations>, reuse: EvaluationReuse<Pending>) => A): Parameters<typeof commitAllEffect<A>>[0] =>
        (draft, records) => {
          const joined = draftJoinedReviews(records.joined);
          const ticketUnits = draftTicketUnits(records.ticketUnits);
          const revision = draftRevision(records.revision);
          const reuse = draftEvaluationReuse(records.reuse);
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          const unitOperations = ticketUnitOperations(ticketUnits, owner);
          const revisionOps = revisionOperations(revision, owner);
          const reuseOps = evaluationReuseOperations(reuse, owner, logicalBytes);
          const operations = joinedReviewOperations(joined, owner, unitOperations, revisionOps);
          const value = operation(operations, reuseOps);
          revisionOps.assert();
          reuseOps.snapshot();
          return [value, { ...records, joined, ticketUnits, revision, reuse }];
        };
      return {
        append: Effect.fn("JoinedReviews.append")((review: Parameters<JoinedReviews<Pending>["append"]>[0]) =>
          commitAllEffect(joinedChange((joined) => joined.append(review)))),
        hasAdmission: Effect.fn("JoinedReviews.hasAdmission")((admission: number) =>
          Ref.get(state).pipe(Effect.map((snapshot) => [...snapshot.records.joined.entries.values()]
            .some((reviews) => reviews.some((review) => review.admission === admission))))),
        attachOwner: Effect.fn("JoinedReviews.attachOwner")((key: string, pending: Pending, revision: WorkRevision) => commitAllEffect(joinedChange((joined, reuse) => {
          if (!reuse.attachPending(key, pending)) return false;
          joined.attach(key, revision);
          return true;
        }))),
        releaseOwner: Effect.fn("JoinedReviews.releaseOwner")((...args: Parameters<JoinedReviews<Pending>["releaseOwner"]>) => commitAllEffect(joinedChange((joined, reuse) => {
          const [key, reason] = args;
          reuse.releaseClaim(key);
          return joined.releaseUnattached(key, reason);
        }))),
        retireSuperseded: Effect.fn("JoinedReviews.retireSuperseded")((subject: string) =>
          commitAllEffect(joinedChange((joined) => joined.retireSuperseded(subject)))),
        settle: Effect.fn("JoinedReviews.settle")((...args: Parameters<JoinedReviews<Pending>["settle"]>) =>
          commitAllEffect(joinedChange((joined) => joined.settle(...args)))),
      };
    },
    reuse: (logicalBytes: (value: unknown) => number) => {
      const reuseCommit = <A>(operation: (operations: EvaluationReuse<Pending>) => A): Effect.Effect<A> =>
        commitAllEffect((draft, records) => {
          const current = records.reuse;
          const reuse = draftEvaluationReuse(current);
          const operations = evaluationReuseOperations(reuse,
            capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime), logicalBytes);
          const value = operation(operations);
          operations.snapshot();
          return [value, { ...records, reuse }];
        });
      const reuseRead = <A>(operation: (view: ReturnType<typeof evaluationReuseView<Pending>>) => A): Effect.Effect<A> =>
        Ref.get(state).pipe(Effect.map((snapshot) => {
          const draft = draftCapacity(snapshot);
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          return operation(evaluationReuseView(snapshot.records.reuse, owner));
        }));
      return {
        key: residentEvaluationIdentity,
        route: Effect.fn("EvaluationReuse.route")((...args: Parameters<EvaluationReuse<Pending>["route"]>) => reuseCommit((operations) => operations.route(...args))),
        claim: Effect.fn("EvaluationReuse.claim")((...args: Parameters<EvaluationReuse<Pending>["claim"]>) => reuseCommit((operations) => operations.claim(...args))),
        attachPending: Effect.fn("EvaluationReuse.attachPending")((...args: Parameters<EvaluationReuse<Pending>["attachPending"]>) => reuseCommit((operations) => operations.attachPending(...args))),
        pending: Effect.fn("EvaluationReuse.pending")((...args: Parameters<EvaluationReuse<Pending>["pending"]>) => reuseRead((view) => view.pending(...args))),
        releaseClaim: Effect.fn("EvaluationReuse.releaseClaim")((...args: Parameters<EvaluationReuse<Pending>["releaseClaim"]>) => reuseCommit((operations) => operations.releaseClaim(...args))),
        hasPending: Effect.fn("EvaluationReuse.hasPending")((...args: Parameters<EvaluationReuse<Pending>["hasPending"]>) => reuseRead((view) => view.hasPending(...args))),
        get: Effect.fn("EvaluationReuse.get")((...args: Parameters<EvaluationReuse<Pending>["get"]>) => reuseCommit((operations) => operations.get(...args))),
        cached: Effect.fn("EvaluationReuse.cached")((...args: Parameters<EvaluationReuse<Pending>["cached"]>) => reuseRead((view) => view.cached(...args))),
        put: Effect.fn("EvaluationReuse.put")((...args: Parameters<EvaluationReuse<Pending>["put"]>) => reuseCommit((operations) => operations.put(...args))),
        snapshot: Effect.fn("EvaluationReuse.snapshot")((...args: Parameters<EvaluationReuse<Pending>["snapshot"]>) => reuseRead((view) => view.snapshot(...args))),
        discardPartition: Effect.fn("EvaluationReuse.discardPartition")((...args: Parameters<EvaluationReuse<Pending>["discardPartition"]>) => reuseCommit((operations) => operations.discardPartition(...args))),
        clear: Effect.fn("EvaluationReuse.clear")((...args: Parameters<EvaluationReuse<Pending>["clear"]>) => reuseCommit((operations) => operations.clear(...args))),
      };
    },
  };
}).pipe(Effect.withSpan("ResidentState.make"));

/** Synchronous host bridge during runtime service consolidation. */
export const makeCapacityLedger = <Pending = never, DispatchKey = string, DispatchValue = never>(
  ...args: Parameters<typeof makeResidentState<Pending, DispatchKey, DispatchValue>>
) => Effect.runSync(makeResidentState<Pending, DispatchKey, DispatchValue>(...args));

const capacityOperations = (
  commit: <A>(operation: (draft: CapacityDraft) => A) => A,
  read: <A>(operation: (current: CapacityState) => A) => A,
  residentLifetime: string,
) => {
  return {
    residentLifetime, canonicalLifetime: 1,
    reservationSnapshot: (capability: CapacityReservation) => read((snapshot) => {
      const record = snapshot.reservations.get(capability.id);
      return record?.capability === capability ? Object.freeze({ bytes: record.bytes, purpose: record.purpose }) : undefined;
    }),
    partitionId: (...args: Arguments<typeof partitionId>) => commit((draft) => partitionId(draft, ...args)),
    knownPartitionId: (...args: Arguments<typeof knownPartitionId>) => read((draft) => knownPartitionId(draft, ...args)),
    minimumFreshStart: (...args: Arguments<typeof minimumFreshStart>) => read((draft) => minimumFreshStart(draft, ...args)),
    partitionIdentityCount: (...args: Arguments<typeof partitionIdentityCount>) => read((draft) => partitionIdentityCount(draft, ...args)),
    partitionIdentityBytes: (...args: Arguments<typeof partitionIdentityBytes>) => read((draft) => partitionIdentityBytes(draft, ...args)),
    discardUnusedPartition: (...args: Arguments<typeof discardUnusedPartition>) => commit((draft) => discardUnusedPartition(draft, ...args)),
    collectionTokenId: (...args: Arguments<typeof collectionTokenId>) => commit((draft) => collectionTokenId(draft, ...args)),
    collectionTokenIdentityCount: (...args: Arguments<typeof collectionTokenIdentityCount>) => read((draft) => collectionTokenIdentityCount(draft, ...args)),
    pruneCollectionTokenIds: (...args: Arguments<typeof pruneCollectionTokenIds>) => commit((draft) => pruneCollectionTokenIds(draft, ...args)),
    dispatchIdentity: (...args: Arguments<typeof dispatchIdentity>) => commit((draft) => dispatchIdentity(draft, ...args)),
    dispatchScope: (...args: Arguments<typeof dispatchScope>) => commit((draft) => dispatchScope(draft, ...args)),
    transition: (...args: Arguments<typeof transition>) => commit((draft) => transition(draft, ...args)),
    canonicalProjection: (...args: Arguments<typeof canonicalProjection>) => read((draft) => canonicalProjection(draft, ...args)),
    acknowledgeStopRelease: (...args: Arguments<typeof acknowledgeStopRelease>) => commit((draft) => acknowledgeStopRelease(draft, ...args)),
    consumeEditPermit: (...args: Arguments<typeof consumeEditPermit>) => commit((draft) => consumeEditPermit(draft, ...args)),
    roundId: (...args: Arguments<typeof roundId>) => commit((draft) => roundId(draft, ...args)),
    currentRoundId: (...args: Arguments<typeof currentRoundId>) => read((draft) => currentRoundId(draft, ...args)),
    admitObservation: (...args: Arguments<typeof admitObservation>) => commit((draft) => admitObservation(draft, ...args)),
    observation: (...args: Arguments<typeof observation>) => commit((draft) => observation(draft, ...args)),
    beginObservedPreparation: (...args: Arguments<typeof beginObservedPreparation>) => commit((draft) => beginObservedPreparation(draft, ...args)),
    completePreparation: (...args: Arguments<typeof completePreparation>) => commit((draft) => completePreparation(draft, ...args)),
    startReview: (...args: Arguments<typeof startReview>) => commit((draft) => startReview(draft, ...args)),
    readyJevRequest: (...args: Arguments<typeof readyJevRequest>) => commit((draft) => readyJevRequest(draft, ...args)),
    startJevRequest: (...args: Arguments<typeof startJevRequest>) => commit((draft) => startJevRequest(draft, ...args)),
    interruptJevRequest: (...args: Arguments<typeof interruptJevRequest>) => commit((draft) => interruptJevRequest(draft, ...args)),
    settleJevRequest: (...args: Arguments<typeof settleJevRequest>) => commit((draft) => settleJevRequest(draft, ...args)),
    completeReview: (...args: Arguments<typeof completeReview>) => commit((draft) => completeReview(draft, ...args)),
    observeReview: (...args: Arguments<typeof observeReview>) => commit((draft) => observeReview(draft, ...args)),
    preparedOffer: (...args: Arguments<typeof preparedOffer>) => commit((draft) => preparedOffer(draft, ...args)),
    emptyPrepared: (...args: Arguments<typeof emptyPrepared>) => commit((draft) => emptyPrepared(draft, ...args)),
    reviewFailure: (...args: Arguments<typeof reviewFailure>) => commit((draft) => reviewFailure(draft, ...args)),
    retireRound: (...args: Arguments<typeof retireRound>) => commit((draft) => retireRound(draft, ...args)),
    reserve: (...args: Arguments<typeof reserve>) => commit((draft) => reserve(draft, ...args)),
    resize: (...args: Arguments<typeof resize>) => commit((draft) => resize(draft, ...args)),
    replace: (...args: Arguments<typeof replace>) => {
      const result = commit((draft) => replace(draft, ...args));
      if ("invalidMeasurement" in result) throw new TypeError("invalid measured review unit size");
      return result;
    },
    release: (...args: Arguments<typeof release>) => commit((draft) => release(draft, ...args)),
    clear: (...args: Arguments<typeof clear>) => commit((draft) => clear(draft, ...args)),
    snapshot: (...args: Arguments<typeof snapshot>) => read((draft) => snapshot(draft, ...args)),
  };
};
export type CapacityLedger = ReturnType<typeof capacityOperations>;

/** Immutable capability; metadata belongs to the current committed record.
 * A released capability has no authority and reads its issuance metadata.
 * Identity comparison fences clear/restart reuse of numeric reservation IDs.
 */
function registerReservation(draft: CapacityDraft, id: number, partition: string,
  bytes: number, purpose: CapacityPurpose): CapacityReservation {
  const capability: CapacityReservation = Object.freeze({ id, partition });
  draft.reservations.set(id, { capability, bytes, purpose });
  return capability;
}

function setReservationMetadata(draft: CapacityDraft, capability: CapacityReservation,
  bytes: number | undefined, purpose: CapacityPurpose): void {
  const record = draft.reservations.get(capability.id);
  if (record?.capability !== capability) throw new Error("unknown reservation metadata owner");
  draft.reservations.set(capability.id, { capability, bytes: bytes ?? record.bytes, purpose });
}

function partitionId(draft: CapacityDraft, partition: string): number {
  let id = draft.partitionIds.get(partition);
  if (id === undefined) {
    const keyBytes = Buffer.byteLength(partition, "utf8");
    if (keyBytes > MAX_PARTITION_KEY_BYTES) {
      throw new RangeError("advicee identity exceeds resident metadata bound");
    }
    while (draft.partitionIds.size >= MAX_PARTITION_IDENTITIES ||
      draft.partitionIdentityBytes + keyBytes > MAX_PARTITION_IDENTITY_BYTES) {
      if (!evictInactivePartition(draft)) {
        throw new RangeError("resident advicee identity capacity exhausted");
      }
    }
    id = draft.nextPartitionId++;
    draft.partitionIds.set(partition, id);
    draft.partitionIdentityBytes += keyBytes;
  }
  return id;
}

function knownPartitionId(draft: CapacityState, partition: string): number | undefined {
  return draft.partitionIds.get(partition);
}

function minimumFreshStart(draft: CapacityState): number {
  return draft.minimumFreshStart;
}

function partitionIdentityCount(draft: CapacityState): number { return draft.partitionIds.size; }

function partitionIdentityBytes(draft: CapacityState): number { return draft.partitionIdentityBytes; }

function discardUnusedPartition(draft: CapacityDraft, partition: string): void {
  const id = draft.partitionIds.get(partition);
  if (id === undefined || draft.roundIds.has(partition) ||
    [...draft.reservations.values()].some((item) => item.capability.partition === partition) ||
    [...draft.requestRounds.values()].some((item) => item.partition === partition)) return;
  const state = canonicalProjection(draft);
  if (state.partitions.some((item) => item.partition === id) ||
    state.rounds.some((item) => item.partition === id) ||
    state.work.some((item) => item.partition === id) ||
    state.charges.some((item) => item.partition === id) ||
    state.dispatch.queued.some((item) => item.partition === id) ||
    state.dispatch.running.some((item) => item.partition === id) ||
    state.dispatch.requests.some((item) => item.partition === id) ||
    state.delivery.slots.some((item) => item.group === id) ||
    state.delivery.counters.some((item) => item.group === id) ||
    state.delivery.submissions.batches.some((item) => item.group === id) ||
    state.collection.claims.some((item) => item.group === id) ||
    state.notices.some((item) => item.partition === id || item.group === id) ||
    state.reuse.cache.some((item) => item.partition === id)) return;
  const admission = state.admissions.find((item) => item.partition === id);
  if (admission?.active || (admission?.permits.length ?? 0) > 0) return;
  const forgotten = transition(draft, { kind: "forgetAdmission", partition: id, lifetime: 1 });
  if (forgotten.rejection !== undefined || forgotten.commands[0]?.kind !== "admissionForgotten") return;
  draft.partitionIds.delete(partition);
  draft.partitionIdentityBytes -= Buffer.byteLength(partition, "utf8");
}

function evictInactivePartition(draft: CapacityDraft): boolean {
  for (const partition of draft.partitionIds.keys()) {
    const before = draft.partitionIds.size;
    discardUnusedPartition(draft, partition);
    if (draft.partitionIds.size < before) {
      draft.minimumFreshStart = Math.max(draft.minimumFreshStart,
        Math.ceil(monotonicNow() * 1000));
      return true;
    }
  }
  return false;
}

function collectionTokenId(draft: CapacityDraft, token: string): number {
  let id = draft.collectionTokens.get(token);
  if (id === undefined) {
    if (Buffer.byteLength(token, "utf8") > MAX_COLLECTION_TOKEN_KEY_BYTES ||
      draft.collectionTokens.size >= MAX_COLLECTION_TOKEN_IDENTITIES) {
      throw new RangeError("resident collection token capacity exhausted");
    }
    id = draft.nextCollectionToken++;
    draft.collectionTokens.set(token, id);
  }
  return id;
}

function collectionTokenIdentityCount(draft: CapacityState): number { return draft.collectionTokens.size; }

function pruneCollectionTokenIds(draft: CapacityDraft, nativeLive: ReadonlySet<string>): void {
  const state = canonicalProjection(draft);
  const canonicalLive = new Set<number>([
    ...state.collection.leases.map((item) => item.owner),
    ...state.collection.claims.map((item) => item.owner),
    ...state.delivery.slots.map((item) => item.token),
    ...state.delivery.submissions.batches.map((item) => item.token),
  ]);
  for (const [key, id] of draft.collectionTokens) {
    if (!nativeLive.has(key) && !canonicalLive.has(id)) draft.collectionTokens.delete(key);
  }
}

function dispatchIdentity(draft: CapacityDraft, partition: string, round: number): { readonly partition: number; readonly round: number } {
  return { partition: partitionId(draft, partition), round };
}

function dispatchScope(draft: CapacityDraft, namedCount: number, cancelledCount: number, hasUnnamed: boolean): boolean {
  const result = transition(draft, { kind: "dispatchScopeCheck", namedCount, cancelledCount, hasUnnamed });
  if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical dispatch scope refused");
  const command = result.commands[0];
  if (command?.kind === "discardNamedOnly") return true;
  if (command?.kind === "discardAllUnfinished") return false;
  throw new Error("invalid canonical dispatch scope command");
}

function transition(draft: CapacityDraft, event: ResidentTransition, commitNative?: (result: ReturnType<typeof stepCanonical> & {
  readonly projection: ReturnType<typeof projectCanonical>;
}) => void): ReturnType<typeof stepCanonical> {
  const result = stepCanonical(draft.canonical, event);
  if (result.rejection === undefined) {
    commitNative?.({ ...result, projection: projectCanonical(result.state) });
    draft.canonical = result.state;
  }
  return result;
}

function canonicalProjection(draft: CapacityState): ReturnType<typeof projectCanonical> {
  return projectCanonical(draft.canonical);
}

function acknowledgeStopRelease(draft: CapacityDraft, id: number): void {
  if (canonicalProjection(draft).charges.some((charge) => charge.id === id)) {
    throw new Error("canonical Stop release retained its charge");
  }
  draft.reservations.delete(id);
}

function consumeEditPermit(draft: CapacityDraft, partition: string, event: Extract<ResidentTransition, { readonly kind: "consumePermit" }>):
  ReturnType<typeof stepCanonical> {
  const result = transition(draft, event);
  if (result.rejection !== undefined) return result;
  const consumed = result.commands.find((command) => command.kind === "permitConsumed");
  const round = result.commands.find((command) => command.kind === "roundStarted");
  const boundRound = canonicalProjection(draft).rounds.find(
    (item) => item.partition === event.partition && item.lifetime === event.lifetime);
  const roundId = round?.kind === "roundStarted" ? round.id : boundRound?.id;
  if (consumed?.kind !== "permitConsumed" || roundId === undefined || boundRound?.id !== roundId) {
    throw new Error("canonical edit admission omitted its round");
  }
  draft.roundIds.set(partition, roundId);
  return result;
}

function roundId(draft: CapacityDraft, partition: string): number {
  const existing = draft.roundIds.get(partition);
  if (existing !== undefined) return existing;
  const result = transition(draft, { kind: "openRound", partition: partitionId(draft, partition), lifetime: 1 });
  const command = result.commands[0];
  if (result.rejection !== undefined || command?.kind !== "roundStarted") throw new Error("canonical round admission refused");
  draft.roundIds.set(partition, command.id);
  return command.id;
}

function currentRoundId(draft: CapacityState, partition: string): number | undefined {
  return draft.roundIds.get(partition);
}

function admitObservation(draft: CapacityDraft, partition: string, round: number = roundId(draft, partition)): number {
  const result = transition(draft, { kind: "admitObservation", partition: partitionId(draft, partition),
    lifetime: 1, round });
  const command = result.commands[0];
  if (result.rejection !== undefined || command?.kind !== "observationAdmitted") throw new Error("canonical observation admission refused");
  return command.id;
}

function observation(draft: CapacityDraft, partition: string, id: number, kind: "startObservation" | "completeObservation" | "interruptObservation", round: number): boolean {
  const result = transition(draft, { kind, partition: partitionId(draft, partition), lifetime: 1,
    round, observation: id });
  return result.rejection === undefined && result.commands[0]?.kind ===
    ({ startObservation: "observationStarted", completeObservation: "observationCompleted",
      interruptObservation: "observationInterrupted" } as const)[kind];
}

function beginObservedPreparation(draft: CapacityDraft, partition: string, observation: number, bytes: number, round: number):
  { readonly operation: number; readonly reservation: CapacityReservation } | undefined {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > CANONICAL_MAX_BYTES) return undefined;
  const result = transition(draft, { kind: "beginObservedPreparation", partition: partitionId(draft, partition),
    lifetime: 1, round, observation, bytes });
  const command = result.commands[0];
  if (result.rejection !== undefined) return undefined;
  if (command === undefined) throw new Error("invalid canonical preparation admission");
  if (command.kind === "preparationRefused") return undefined;
  if (command.kind !== "prepare") throw new Error("unexpected canonical preparation command");
  const reservation = registerReservation(draft, command.reservation, partition, bytes, "preparation");
  return { operation: command.operation, reservation };
}

function completePreparation(draft: CapacityDraft, partition: string, operation: number, reservation: CapacityReservation,
  sizes: readonly number[], round: number): ReadonlyArray<{ readonly operation: number; readonly reservation: CapacityReservation } | undefined> {
  if (draft.reservations.get(reservation.id)?.capability !== reservation || sizes.length > CANONICAL_MAX_UNITS ||
      sizes.some((size) => !Number.isSafeInteger(size) || size <= 0 || size > CANONICAL_MAX_BYTES)) {
    throw new TypeError("invalid canonical preparation completion");
  }
  const result = transition(draft, { kind: "preparationCompleted", partition: partitionId(draft, partition),
    lifetime: 1, round, operation, unitBytes: sizes });
  if (result.rejection !== undefined || result.commands[0]?.kind !== "preparationReleased") {
    throw new Error("canonical preparation completion refused");
  }
  draft.reservations.delete(reservation.id);
  const units = result.commands.slice(1).map((command, index) => {
    // undefined records a capacity refusal, which cannot establish a clear review outcome.
    if (command.kind === "unitRefused" && command.position === index + 1) return undefined;
    if (command.kind !== "unitAdmitted" || command.position !== index + 1) throw new Error("invalid canonical unit admission");
    const unit = registerReservation(draft, command.reservation, partition, command.bytes, "reviewUnit");
    return { operation: command.operation, reservation: unit };
  });
  if (units.length !== sizes.length) throw new Error("canonical unit count mismatch");
  return units;
}

function startReview(draft: CapacityDraft, partition: string, operation: number, round: number): boolean {
  const result = transition(draft, { kind: "startReview", partition: partitionId(draft, partition),
    lifetime: 1, round, operation });
  return result.rejection === undefined && result.commands[0]?.kind === "reviewStarted";
}

function readyJevRequest(draft: CapacityDraft, partition: string, operation: number, reservation: CapacityReservation,
  facts: { readonly rootValid: boolean; readonly configurationValid: boolean;
    readonly credentialReady: boolean; readonly selected: boolean;
    readonly currentWork: boolean; readonly physicalAvailable: boolean }, round: number):
  { readonly status: "issued"; readonly request: number; readonly round: number } |
  { readonly status: "unavailable"; readonly round: number } | { readonly status: "stale" } {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) return { status: "stale" };
  const result = transition(draft, { kind: "jevRequestReady", partition: partitionId(draft, partition),
    lifetime: 1, round, operation, ...facts });
  if (result.rejection !== undefined) return { status: "stale" };
  const issued = result.commands[0];
  if (issued?.kind === "jevRequestIssued") {
    draft.requestRounds.set(issued.request, { partition, round });
    return { status: "issued", request: issued.request, round };
  }
  if (result.commands.at(-1)?.kind !== "jevRequestUnavailable") throw new Error("invalid canonical request readiness");
  draft.reservations.delete(reservation.id);
  return { status: "unavailable", round };
}

function startJevRequest(draft: CapacityDraft, partition: string, operation: number, request: number): boolean {
  const identity = draft.requestRounds.get(request);
  if (identity?.partition !== partition) return false;
  const result = transition(draft, { kind: "jevRequestStarted", partition: partitionId(draft, partition),
    lifetime: 1, round: identity.round, operation, request });
  return result.rejection === undefined && result.commands[0]?.kind === "jevRequestStartRecorded";
}

function interruptJevRequest(draft: CapacityDraft, partition: string, operation: number, request: number): boolean {
  const identity = draft.requestRounds.get(request);
  if (identity?.partition !== partition) return false;
  const result = transition(draft, { kind: "jevRequestInterrupted", partition: partitionId(draft, partition),
    lifetime: 1, round: identity.round, operation, request });
  return result.rejection === undefined && result.commands[0]?.kind === "jevInterruptionRecorded";
}

function settleJevRequest(draft: CapacityDraft, partition: string, operation: number, request: number,
  reservation: CapacityReservation, outcome: JevRequestOutcome, currentWork: boolean):
  "retainFinding" | "settleClear" | "settleStaleClear" | "retireStaleFinding" | "unavailable" | "ignored" | "stale" {
  const identity = draft.requestRounds.get(request);
  if (identity?.partition !== partition) return "stale";
  const result = transition(draft, { kind: "jevRequestSettled", partition: partitionId(draft, partition),
    lifetime: 1, round: identity.round, operation, request, outcome, currentWork });
  if (result.rejection !== undefined) return "stale";
  draft.requestRounds.delete(request);
  const disposition = result.commands.at(-1)?.kind;
  if (disposition === "jevObservationIgnored") return "ignored";
  if (disposition !== "jevRequestOutcomeRecorded") throw new Error("invalid canonical request settlement");
  const choice = result.commands.at(-2)?.kind;
  if (choice === "retainFinding") {
    if (draft.reservations.get(reservation.id)?.capability === reservation) {
      setReservationMetadata(draft, reservation, undefined, "storedResult");
    }
    return choice;
  }
  if (draft.reservations.get(reservation.id)?.capability === reservation) draft.reservations.delete(reservation.id);
  if (choice === "settleClear" || choice === "settleStaleClear" || choice === "retireStaleFinding") return choice;
  if (result.commands.some((command) => command.kind === "reviewRecorded")) return "unavailable";
  throw new Error("invalid canonical request outcome");
}

function completeReview(draft: CapacityDraft, partition: string, operation: number, reservation: CapacityReservation,
  outcome: "finding" | "clear" | "unavailable" | "interrupted" | "discarded", round: number): boolean {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) return false;
  const result = transition(draft, { kind: "reviewCompleted", partition: partitionId(draft, partition),
    lifetime: 1, round, operation, outcome });
  if (result.rejection !== undefined || result.commands.at(-1)?.kind !== "reviewRecorded") return false;
  if (outcome === "finding") setReservationMetadata(draft, reservation, undefined, "storedResult");
  else draft.reservations.delete(reservation.id);
  return true;
}

function observeReview(draft: CapacityDraft, partition: string, operation: number, reservation: CapacityReservation,
  outcome: "finding" | "clear", currentWork: boolean, round: number):
  "retainFinding" | "settleClear" | "settleStaleClear" | "retireStaleFinding" {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) throw new Error("unknown review reservation");
  const result = transition(draft, { kind: "reviewObserved", partition: partitionId(draft, partition),
    lifetime: 1, round, operation, outcome, currentWork });
  const disposition = result.commands.at(-1)?.kind;
  if (result.rejection !== undefined || (disposition !== "retainFinding" && disposition !== "settleClear" &&
      disposition !== "settleStaleClear" && disposition !== "retireStaleFinding")) {
    throw new Error("canonical review observation refused");
  }
  if (disposition === "retainFinding") setReservationMetadata(draft, reservation, undefined, "storedResult");
  else draft.reservations.delete(reservation.id);
  return disposition;
}

function preparedOffer(draft: CapacityDraft, ready: boolean, withinFrame: boolean): "preparedSkipped" | "preparedAdmitted" | "preparedCapacityRefused" {
  const command = transition(draft, { kind: "preparedOfferCheck", ready, withinFrame }).commands[0]?.kind;
  if (command !== "preparedSkipped" && command !== "preparedAdmitted" && command !== "preparedCapacityRefused") {
    throw new Error("canonical prepared offer refused");
  }
  return command;
}

function emptyPrepared(draft: CapacityDraft, readyCount: number, hasNonSkipped: boolean, ticketed: boolean): boolean {
  const command = transition(draft, { kind: "emptyPreparedCheck", readyCount, hasNonSkipped, ticketed }).commands[0]?.kind;
  if (command !== "emptyLost" && command !== "emptyAccepted") throw new Error("canonical empty preparation refused");
  return command === "emptyLost";
}

function reviewFailure(draft: CapacityDraft, backendOrTimeout: boolean, credential: boolean, missing: boolean):
  "failureBackend" | "failureCredential" | "failureLost" | "failureNone" {
  const command = transition(draft, { kind: "reviewFailureCheck", backendOrTimeout, credential, missing }).commands[0]?.kind;
  if (command !== "failureBackend" && command !== "failureCredential" && command !== "failureLost" && command !== "failureNone") {
    throw new Error("canonical review failure classification refused");
  }
  return command;
}

function retireRound(draft: CapacityDraft, partition: string, round: number): void {
  if (draft.roundIds.get(partition) !== round) return;
  const result = transition(draft, { kind: "retirePartition", partition: partitionId(draft, partition),
    lifetime: 1, round });
  if (result.rejection !== undefined || result.commands.at(-1)?.kind !== "partitionRetired") {
    throw new Error("canonical round retirement refused");
  }
  const live = new Set(canonicalProjection(draft).charges.map((charge) => charge.id));
  for (const [id, reservation] of draft.reservations) {
    if (reservation.capability.partition === partition && !live.has(id)) draft.reservations.delete(id);
  }
  draft.roundIds.delete(partition);
}

function reserve(draft: CapacityDraft, partition: string, bytes: number, purpose: CapacityPurpose): CapacityReservation | undefined {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > CANONICAL_MAX_BYTES) return undefined;
  const identity = partitionId(draft, partition);
  const result = stepCanonical(draft.canonical, { kind: "reserveCapacity", partition: identity, bytes, purpose });
  const command = result.commands[0];
  if (result.rejection !== undefined || result.commands.length !== 1 || command === undefined) throw new Error("invalid Bend capacity reservation result");
  if (command.kind === "capacityRefused") return undefined;
  if (command.kind !== "capacityGranted") throw new Error("unexpected Bend capacity reservation command");
  const id = command.id;
  if (draft.reservations.has(id)) throw new Error("Bend reused a live capacity reservation ID");
  draft.canonical = result.state;
  const reservation = registerReservation(draft, id, partition, bytes, purpose);
  return reservation;
}

function resize(draft: CapacityDraft, reservation: CapacityReservation, bytes: number,
  purpose?: CapacityPurpose): boolean {
  const retained = draft.reservations.get(reservation.id);
  if (retained?.capability !== reservation || !Number.isSafeInteger(bytes) || bytes < 0 ||
      bytes > CANONICAL_MAX_BYTES) return false;
  const nextPurpose = purpose ?? retained.purpose;
  const result = stepCanonical(draft.canonical, { kind: "resizeCapacity", reservation: reservation.id, bytes, purpose: nextPurpose });
  const command = result.commands[0];
  if (result.rejection !== undefined || result.commands.length !== 1 || command === undefined) throw new Error("invalid Bend capacity resize result");
  if (command.kind === "capacityRefused") return false;
  if (command.kind !== "capacityResized" || command.id !== reservation.id) throw new Error("unexpected Bend capacity resize command");
  draft.canonical = result.state;
  setReservationMetadata(draft, reservation, bytes, nextPurpose);
  return true;
}

function replace(draft: CapacityDraft,
  reservation: CapacityReservation,
  bytes: ReadonlyArray<number>,
): ReadonlyArray<CapacityReservation | undefined> | { readonly invalidMeasurement: true } {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) return bytes.map(() => undefined);
  if (bytes.length > CANONICAL_MAX_UNITS ||
      bytes.some((size) => !Number.isSafeInteger(size) || size <= 0 || size > CANONICAL_MAX_BYTES)) {
    release(draft, reservation);
    return { invalidMeasurement: true };
  }
  const result = stepCanonical(draft.canonical, { kind: "replaceCapacity", reservation: reservation.id, unitBytes: bytes });
  if (result.rejection !== undefined || result.commands[0]?.kind !== "preparationReleased" ||
      result.commands[0].id !== reservation.id || result.commands.length !== bytes.length + 1) {
    throw new Error("invalid Bend capacity replacement result");
  }
  const replacements = result.commands.slice(1).map((command, index) => {
    if (command.kind === "capacityUnitRefused" && command.position === index + 1 && command.bytes === bytes[index]) return undefined;
    if (command.kind !== "capacityUnitAdmitted" || command.position !== index + 1 || command.bytes !== bytes[index]) {
      throw new Error("unexpected Bend capacity replacement command");
    }
    return { id: command.reservation, partition: reservation.partition, bytes: command.bytes, purpose: "reviewUnit" as const };
  });
  const replacementIds = replacements.flatMap((item) => item === undefined ? [] : [item.id]);
  if (new Set(replacementIds).size !== replacementIds.length ||
      replacementIds.some((id) => draft.reservations.has(id))) {
    throw new Error("Bend reused a live capacity reservation ID");
  }
  draft.canonical = result.state;
  draft.reservations.delete(reservation.id);
  return replacements.map((item) => item === undefined ? undefined :
    registerReservation(draft, item.id, item.partition, item.bytes, item.purpose));
}

function release(draft: CapacityDraft, reservation: CapacityReservation): boolean {
  const retained = draft.reservations.get(reservation.id);
  if (retained?.capability !== reservation) return false;
  const work = canonicalProjection(draft).work.find((item) => item.reservation === reservation.id);
  if (work !== undefined) {
    const kind = work.kind === "preparing" ? "interruptPreparation" :
      work.kind === "pendingFinding" ? "retireReview" : "reviewCompleted";
    const common = { partition: partitionId(draft, reservation.partition), lifetime: 1,
      round: work.round, operation: work.operation };
    const result = kind === "reviewCompleted"
      ? transition(draft, { kind: "reviewCompleted", ...common, outcome: "discarded" })
      : kind === "retireReview"
        ? transition(draft, { kind: "retireReview", ...common })
        : transition(draft, { kind: "interruptPreparation", ...common });
    if (result.rejection !== undefined || !result.commands.some((command) =>
        (command.kind === "preparationReleased" || command.kind === "reservationReleased") &&
        command.id === reservation.id)) throw new Error("canonical work release refused");
    draft.reservations.delete(reservation.id);
    return true;
  }
  const result = stepCanonical(draft.canonical, { kind: "releaseCapacity", reservation: reservation.id });
  if (result.rejection !== undefined || result.commands.length !== 1 ||
      result.commands[0]?.kind !== "reservationReleased" || result.commands[0].id !== reservation.id) {
    throw new Error("invalid Bend capacity release result");
  }
  draft.canonical = result.state;
  draft.reservations.delete(reservation.id);
  return true;
}

function clear(draft: CapacityDraft): void {
  draft.canonical = initialCanonical(draft.limits);
  draft.reservations.clear();
  draft.partitionIds.clear();
  draft.partitionIdentityBytes = 0;
  draft.roundIds.clear();
  draft.requestRounds.clear();
  draft.collectionTokens.clear();
  draft.nextCollectionToken = 1;
  draft.nextPartitionId = 1;
  draft.minimumFreshStart = 0;
}

function snapshot(draft: CapacityState): CapacitySnapshot {
  const projection = projectCanonical(draft.canonical);
  const entries: Array<[string, { items: number; bytes: number }]> = [];
  for (const [partition, id] of draft.partitionIds) {
    const usage = projection.partitions.find((item) => item.partition === id);
    if (usage !== undefined && usage.items > 0) entries.push([partition, { items: usage.items, bytes: usage.bytes }]);
  }
  return {
    items: projection.global.items,
    bytes: projection.global.bytes,
    partitions: Object.fromEntries(entries),
  };
}
