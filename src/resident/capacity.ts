import { initialTicketUnits, draftTicketUnits, ticketUnitOperations, ticketUnitView, emptyTicketUnitCurrent, type TicketUnitsState, type TicketUnit, type TicketUnits } from "./ticket-units.ts";
import { initialRevision, draftRevision, revisionOperations, type RevisionState, type RevisionOperations } from "./revision.ts";
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
  readonly bytes: number;
  readonly purpose: CapacityPurpose;
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
type ResidentRecords<Pending, Key, Value> = {
  readonly reuse: EvaluationReuseState<Pending>;
  readonly delivery: DeliveryState;
  readonly dispatch: DispatchRegistry<Key, Value>;
  readonly revision: RevisionState;
  readonly ticketUnits: TicketUnitsState;
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
} & { readonly readReservation: (id: number) => ReservationRecord | undefined };
type Arguments<F extends (...args: never[]) => unknown> = Parameters<F> extends [unknown, ...infer Rest] ? Rest : never;

const draftCapacity = (current: CapacityState, readReservation: CapacityDraft["readReservation"]): CapacityDraft => ({
  ...current,
  reservations: new Map(current.reservations), partitionIds: new Map(current.partitionIds),
  roundIds: new Map(current.roundIds), requestRounds: new Map(current.requestRounds),
  collectionTokens: new Map(current.collectionTokens), readReservation,
});

/** One commit owner for canonical state, capacity identities and native domain records.
 * Draft validation can fail without publishing a partial canonical transition.
 * Synchronous methods bridge existing host callers while the resident service
 * surface is migrated; all internal operations receive their draft explicitly.
 */
export const makeResidentState = <Pending = never, DispatchKey = string, DispatchValue = never>(limits: CapacityLimits = defaultLimits, residentLifetime: string = randomUUID()) => Effect.gen(function* () {
  const state = yield* Ref.make<CapacityState & { readonly records: ResidentRecords<Pending, DispatchKey, DispatchValue> }>({
    residentLifetime, limits, canonical: initialCanonical(limits), reservations: new Map(),
    partitionIds: new Map(), partitionIdentityBytes: 0, roundIds: new Map(), requestRounds: new Map(),
    collectionTokens: new Map(), nextCollectionToken: 1, nextPartitionId: 1, minimumFreshStart: 0,
    records: { reuse: initialEvaluationReuse<Pending>(), delivery: initialDelivery(),
      dispatch: initialDispatchRegistry<DispatchKey, DispatchValue>(), revision: initialRevision(), ticketUnits: initialTicketUnits() },
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
        const draft = draftCapacity(current, (id) => Ref.getUnsafe(state).reservations.get(id));
        const [value, records] = operation(draft, current.records);
        const { readReservation: _, ...next } = draft;
        return [value, { ...next, records }] as const;
      } finally { committing = false; }
    }).pipe(Effect.withSpan("ResidentState.commit"));
  const commitAll = <A>(operation: Parameters<typeof commitAllEffect<A>>[0]): A =>
    Effect.runSync(commitAllEffect(operation));
  const commit = <A>(operation: (draft: CapacityDraft) => A): A =>
    commitAll((draft, records) => [operation(draft), records]);
  const capacity = capacityOperations(commit, read, residentLifetime);
  const unitCommit = <A>(operation: (operations: ReturnType<typeof ticketUnitOperations>) => A): A =>
    commitAll((draft, records) => {
      const ticketUnits = draftTicketUnits(records.ticketUnits);
      const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
      const value = operation(ticketUnitOperations(ticketUnits, owner));
      return [value, { ...records, ticketUnits }];
    });
  const ticketUnits: TicketUnits = {
    add: (ticketId) => unitCommit((operations) => operations.add(ticketId, (id, ticketId) => {
      const capability: TicketUnit = Object.freeze<TicketUnit>({
        id, ticketId,
        get current() {
          const entry = Ref.getUnsafe(state).records.ticketUnits.entries.get(id);
          return entry?.capability === capability ? entry.current : emptyTicketUnitCurrent;
        },
        stage: () => commitAll((draft, records) => {
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          return [ticketUnitView(records.ticketUnits, owner).stage(capability), records];
        }),
        step: (event, reason, current) => unitCommit((operations) => operations.step(capability, event, reason, current)),
      });
      return capability;
    })),
    values: () => [...Ref.getUnsafe(state).records.ticketUnits.entries.values()].map((entry) => entry.capability),
    forget: (ticketId) => unitCommit((operations) => operations.forget(ticketId)),
  };
  return {
    ...capacity,
    ticketUnits,
    clear: () => commitAll((draft, records) => {
      const dispatch = records.dispatch;
      if (dispatch.entries.size !== 0) throw new Error("resident state cannot clear outstanding native dispatch jobs");
      return [clear(draft), { reuse: initialEvaluationReuse<Pending>(), delivery: initialDelivery(), revision: initialRevision(), ticketUnits: initialTicketUnits(),
        dispatch: { ...initialDispatchRegistry<DispatchKey, DispatchValue>(), executorAttached: dispatch.executorAttached } }];
    }),
    revision: (() => {
      const revisionCommit = <A>(operation: (operations: RevisionOperations) => A): A =>
        commitAll((draft, records) => {
          const revision = draftRevision(records.revision);
          const owner = capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime);
          const operations = revisionOperations(revision, owner);
          const value = operation(operations);
          operations.assert();
          return [value, { ...records, revision }];
        });
      return {
        count: (...args: Parameters<RevisionOperations["count"]>) => revisionCommit((operations) => operations.count(...args)),
        generation: (...args: Parameters<RevisionOperations["generation"]>) => revisionCommit((operations) => operations.generation(...args)),
        register: (...args: Parameters<RevisionOperations["register"]>) => revisionCommit((operations) => operations.register(...args)),
        superseded: (...args: Parameters<RevisionOperations["superseded"]>) => revisionCommit((operations) => operations.superseded(...args)),
        current: (...args: Parameters<RevisionOperations["current"]>) => revisionCommit((operations) => operations.current(...args)),
        release: (...args: Parameters<RevisionOperations["release"]>) => revisionCommit((operations) => operations.release(...args)),
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
      const deliveryCommit = <A>(operation: (operations: ComposedDelivery) => A): A => {
        const [value, diagnostics] = commitAll((draft, records) => {
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
      };
      const view = () => deliveryView(Ref.getUnsafe(state).records.delivery, capacity);
      return {
        canonical: capacity,
        claimBackground: (...args: Parameters<ComposedDelivery["claimBackground"]>) => deliveryCommit((operations) => operations.claimBackground(...args)),
        releaseBackground: (...args: Parameters<ComposedDelivery["releaseBackground"]>) => deliveryCommit((operations) => operations.releaseBackground(...args)),
        advance: (...args: Parameters<ComposedDelivery["advance"]>) => deliveryCommit((operations) => operations.advance(...args)),
        recentEditCount: (...args: Parameters<ComposedDelivery["recentEditCount"]>) => view().recentEditCount(...args),
        editIdentityMappingCount: (...args: Parameters<ComposedDelivery["editIdentityMappingCount"]>) => view().editIdentityMappingCount(...args),
        liveCollectionTokenKeys: (...args: Parameters<ComposedDelivery["liveCollectionTokenKeys"]>) => view().liveCollectionTokenKeys(...args),
        ensureFromHostTurn: (...args: Parameters<ComposedDelivery["ensureFromHostTurn"]>) => deliveryCommit((operations) => operations.ensureFromHostTurn(...args)),
        registerEdit: (...args: Parameters<ComposedDelivery["registerEdit"]>) => deliveryCommit((operations) => operations.registerEdit(...args)),
        registerEditDecision: (...args: Parameters<ComposedDelivery["registerEditDecision"]>) => deliveryCommit((operations) => operations.registerEditDecision(...args)),
        admitEdit: (...args: Parameters<ComposedDelivery["admitEdit"]>) => deliveryCommit((operations) => operations.admitEdit(...args)),
        expirePermits: (...args: Parameters<ComposedDelivery["expirePermits"]>) => deliveryCommit((operations) => operations.expirePermits(...args)),
        hasPendingEdits: (...args: Parameters<ComposedDelivery["hasPendingEdits"]>) => deliveryCommit((operations) => operations.hasPendingEdits(...args)),
        isActive: (...args: Parameters<ComposedDelivery["isActive"]>) => deliveryCommit((operations) => operations.isActive(...args)),
        beginStop: (...args: Parameters<ComposedDelivery["beginStop"]>) => deliveryCommit((operations) => operations.beginStop(...args)),
        ownsStop: (...args: Parameters<ComposedDelivery["ownsStop"]>) => deliveryCommit((operations) => operations.ownsStop(...args)),
        finishGate: (...args: Parameters<ComposedDelivery["finishGate"]>) => deliveryCommit((operations) => operations.finishGate(...args)),
        reserveFinishOutput: (...args: Parameters<ComposedDelivery["reserveFinishOutput"]>) => deliveryCommit((operations) => operations.reserveFinishOutput(...args)),
        decideFinishOutput: (...args: Parameters<ComposedDelivery["decideFinishOutput"]>) => deliveryCommit((operations) => operations.decideFinishOutput(...args)),
        revokeProvisionalFinishOutput: (...args: Parameters<ComposedDelivery["revokeProvisionalFinishOutput"]>) => deliveryCommit((operations) => operations.revokeProvisionalFinishOutput(...args)),
        hasFinishPermit: (...args: Parameters<ComposedDelivery["hasFinishPermit"]>) => view().hasFinishPermit(...args),
        isFinishAuthorized: (...args: Parameters<ComposedDelivery["isFinishAuthorized"]>) => view().isFinishAuthorized(...args),
        finishSelectionMatches: (...args: Parameters<ComposedDelivery["finishSelectionMatches"]>) => deliveryCommit((operations) => operations.finishSelectionMatches(...args)),
        authorizeFinishOutput: (...args: Parameters<ComposedDelivery["authorizeFinishOutput"]>) => deliveryCommit((operations) => operations.authorizeFinishOutput(...args)),
        finishStop: (...args: Parameters<ComposedDelivery["finishStop"]>) => deliveryCommit((operations) => operations.finishStop(...args)),
        tickQuietRound: (...args: Parameters<ComposedDelivery["tickQuietRound"]>) => deliveryCommit((operations) => operations.tickQuietRound(...args)),
        closureCounts: (...args: Parameters<ComposedDelivery["closureCounts"]>) => deliveryCommit((operations) => operations.closureCounts(...args)),
        expireStop: (...args: Parameters<ComposedDelivery["expireStop"]>) => deliveryCommit((operations) => operations.expireStop(...args)),
        isDeciding: (...args: Parameters<ComposedDelivery["isDeciding"]>) => deliveryCommit((operations) => operations.isDeciding(...args)),
        canSubmit: (...args: Parameters<ComposedDelivery["canSubmit"]>) => deliveryCommit((operations) => operations.canSubmit(...args)),
        canBeginSubmission: (...args: Parameters<ComposedDelivery["canBeginSubmission"]>) => deliveryCommit((operations) => operations.canBeginSubmission(...args)),
        canBeginExistingToken: (...args: Parameters<ComposedDelivery["canBeginExistingToken"]>) => deliveryCommit((operations) => operations.canBeginExistingToken(...args)),
        generation: (...args: Parameters<ComposedDelivery["generation"]>) => deliveryCommit((operations) => operations.generation(...args)),
        consumeStop: (...args: Parameters<ComposedDelivery["consumeStop"]>) => deliveryCommit((operations) => operations.consumeStop(...args)),
        hasVirtualRoundContinuationBudget: (...args: Parameters<ComposedDelivery["hasVirtualRoundContinuationBudget"]>) => deliveryCommit((operations) => operations.hasVirtualRoundContinuationBudget(...args)),
        beginSubmission: (...args: Parameters<ComposedDelivery["beginSubmission"]>) => deliveryCommit((operations) => operations.beginSubmission(...args)),
        markSubmitted: (...args: Parameters<ComposedDelivery["markSubmitted"]>) => deliveryCommit((operations) => operations.markSubmitted(...args)),
        markUncertain: (...args: Parameters<ComposedDelivery["markUncertain"]>) => deliveryCommit((operations) => operations.markUncertain(...args)),
        release: (...args: Parameters<ComposedDelivery["release"]>) => deliveryCommit((operations) => operations.release(...args)),
        forget: (...args: Parameters<ComposedDelivery["forget"]>) => deliveryCommit((operations) => operations.forget(...args)),
        suppresses: (...args: Parameters<ComposedDelivery["suppresses"]>) => deliveryCommit((operations) => operations.suppresses(...args)),
        backgroundReofferable: (...args: Parameters<ComposedDelivery["backgroundReofferable"]>) => deliveryCommit((operations) => operations.backgroundReofferable(...args)),
        hasToken: (...args: Parameters<ComposedDelivery["hasToken"]>) => view().hasToken(...args),
        expire: (...args: Parameters<ComposedDelivery["expire"]>) => deliveryCommit((operations) => operations.expire(...args)),
      };
    },
    reuse: (logicalBytes: (value: unknown) => number) => {
      const reuseCommit = <A>(operation: (operations: EvaluationReuse<Pending>) => A): A =>
        commitAll((draft, records) => {
          const current = records.reuse;
          const reuse = draftEvaluationReuse(current);
          const operations = evaluationReuseOperations(reuse,
            capacityOperations((run) => run(draft), (run) => run(draft), residentLifetime), logicalBytes);
          const value = operation(operations);
          operations.snapshot();
          return [value, { ...records, reuse }];
        });
      const view = () => evaluationReuseView(Ref.getUnsafe(state).records.reuse, capacity);
      return {
        key: residentEvaluationIdentity,
        route: (...args: Parameters<EvaluationReuse<Pending>["route"]>) => reuseCommit((operations) => operations.route(...args)),
        claim: (...args: Parameters<EvaluationReuse<Pending>["claim"]>) => reuseCommit((operations) => operations.claim(...args)),
        attachPending: (...args: Parameters<EvaluationReuse<Pending>["attachPending"]>) => reuseCommit((operations) => operations.attachPending(...args)),
        pending: (...args: Parameters<EvaluationReuse<Pending>["pending"]>) => view().pending(...args),
        releaseClaim: (...args: Parameters<EvaluationReuse<Pending>["releaseClaim"]>) => reuseCommit((operations) => operations.releaseClaim(...args)),
        hasPending: (...args: Parameters<EvaluationReuse<Pending>["hasPending"]>) => view().hasPending(...args),
        get: (...args: Parameters<EvaluationReuse<Pending>["get"]>) => reuseCommit((operations) => operations.get(...args)),
        cached: (...args: Parameters<EvaluationReuse<Pending>["cached"]>) => view().cached(...args),
        put: (...args: Parameters<EvaluationReuse<Pending>["put"]>) => reuseCommit((operations) => operations.put(...args)),
        snapshot: (...args: Parameters<EvaluationReuse<Pending>["snapshot"]>) => view().snapshot(...args),
        discardPartition: (...args: Parameters<EvaluationReuse<Pending>["discardPartition"]>) => reuseCommit((operations) => operations.discardPartition(...args)),
        clear: (...args: Parameters<EvaluationReuse<Pending>["clear"]>) => reuseCommit((operations) => operations.clear(...args)),
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
  const readReservation = draft.readReservation;
  const live = () => {
    const record = readReservation(id);
    return record?.capability === capability ? record : undefined;
  };
  const capability: CapacityReservation = Object.freeze({
    id, partition,
    get bytes() { return live()?.bytes ?? bytes; },
    get purpose() { return live()?.purpose ?? purpose; },
  });
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
  purpose: CapacityPurpose = reservation.purpose): boolean {
  const retained = draft.reservations.get(reservation.id);
  if (retained?.capability !== reservation || !Number.isSafeInteger(bytes) || bytes < 0 ||
      bytes > CANONICAL_MAX_BYTES) return false;
  const result = stepCanonical(draft.canonical, { kind: "resizeCapacity", reservation: reservation.id, bytes, purpose });
  const command = result.commands[0];
  if (result.rejection !== undefined || result.commands.length !== 1 || command === undefined) throw new Error("invalid Bend capacity resize result");
  if (command.kind === "capacityRefused") return false;
  if (command.kind !== "capacityResized" || command.id !== reservation.id) throw new Error("unexpected Bend capacity resize command");
  draft.canonical = result.state;
  setReservationMetadata(draft, reservation, bytes, purpose);
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
