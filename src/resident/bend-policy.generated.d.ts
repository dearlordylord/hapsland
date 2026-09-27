export type BendList<T> = { readonly $: "Nil" } |
  { readonly $: "Con"; readonly head: T; readonly tail: BendList<T> };

export type BendAdmissionProspectiveFacts = { readonly $: "ProspectiveFacts";
  readonly clock_valid: boolean; readonly within_hook_window: boolean;
  readonly started_after_closure: boolean; readonly duplicate_event: boolean;
  readonly permit_count: number | bigint; readonly permit_limit: number | bigint;
  readonly round_count: number | bigint; readonly round_limit: number | bigint;
  readonly new_round: boolean; readonly event_count: number | bigint;
  readonly event_limit: number | bigint };
export type BendAdmissionProspectiveDecision = { readonly $: "PermitAllowed" | "PermitDenied" };
export function bendAdmissionProspectiveGate(facts: BendAdmissionProspectiveFacts):
  BendAdmissionProspectiveDecision;
export type BendAdmissionExpiryResult =
  { readonly $: "KeepPermit" | "RemovePermit"; readonly state: BendAdmissionState };
export function bendAdmissionExpire(state: BendAdmissionState,
  token: number | bigint, deadlineReached: boolean): BendAdmissionExpiryResult;

export type BendSelection = {
  readonly $: "Selection";
  readonly partition: bigint;
  readonly round: bigint;
  readonly selected: BendList<bigint>;
  readonly retained: BendList<bigint>;
  readonly findings: bigint;
  readonly bytes: bigint;
};

export type BendAdvice = {
  readonly $: "Advice";
  readonly id: number | bigint;
  readonly unit: number | bigint;
  readonly partition: number | bigint;
  readonly round: number | bigint;
  readonly snapshot: number | bigint;
  readonly current_snapshot: number | bigint;
  readonly credential: number | bigint;
  readonly current_credential: number | bigint;
  readonly age_ms: number | bigint;
  readonly solo_bytes: number | bigint;
  readonly collection_ready: boolean;
};

export type BendSelectionResult =
  | { readonly $: "Selected" | "Retained" | "Expired" | "Duplicate"; readonly state: BendSelection }
  | { readonly $: "Limited"; readonly state: BendSelection; readonly id: bigint };

export type BendValidationStatus = { readonly $: "Current" | "Stale" | "Unavailable" | "Unattributed" };
export type BendCandidateAction = { readonly $: "IgnoreCandidate" | "ReleaseCandidate" |
  "RetireCandidate" | "ContinueCandidate" | "RetainCandidate" };
export function bendValidationRoute(ownerCurrent: boolean,
  status: BendValidationStatus): BendCandidateAction;
export function bendPostValidation(workAccepted: boolean, expired: boolean,
  hasFitting: boolean): BendCandidateAction;
export function bendFinalCandidate(ownerCurrent: boolean,
  credentialGeneration: boolean, credentialAuthorized: boolean,
  expired: boolean, workCurrent: boolean, hasFindings: boolean): BendCandidateAction;

export function bendSelectionInitial(
  partition: number | bigint, round: number | bigint,
): BendSelection;
export function bendSelectionStep(
  state: BendSelection, advice: BendAdvice, prospectiveBytes: number | bigint,
): BendSelectionResult;
export function bendFitsBatch(items: number | bigint, bytes: number | bigint): boolean;
export type BendNoticeOffer = { readonly $: "IncludeNotice" | "SkipNotice" | "StopNotices" };
export function bendNoticeOffer(items: number | bigint, bytes: number | bigint,
  skipUnfitting: boolean): BendNoticeOffer;

export type BendAdmissionState = {
  readonly $: "AdmissionState";
  readonly partition: bigint;
  readonly lifetime: bigint;
  readonly round: bigint;
  readonly active: boolean;
  readonly closed_at: bigint;
  readonly next_token: bigint;
  readonly permits: BendList<unknown>;
  readonly used: BendList<unknown>;
};
export type BendMaybeNat = { readonly $: "None" } | { readonly $: "Some"; readonly value: bigint };
export type BendAdmissionResult =
  | { readonly $: "Accepted"; readonly state: BendAdmissionState;
      readonly token: BendMaybeNat; readonly round: BendMaybeNat }
  | { readonly $: "Rejected"; readonly state: BendAdmissionState;
      readonly reason: { readonly $: string } };
export type BendAdmissionEvent =
  | { readonly $: "Issue"; readonly tool: number | bigint;
      readonly started: number | bigint; readonly deadline: number | bigint;
      readonly now: number | bigint }
  | { readonly $: "Consume"; readonly token: number | bigint;
      readonly tool: number | bigint; readonly now: number | bigint }
  | { readonly $: "Release"; readonly token: number | bigint }
  | { readonly $: "CloseRound"; readonly at: number | bigint };
export function bendAdmissionInitial(partition: number | bigint,
  lifetime: number | bigint): BendAdmissionState;
export function bendAdmissionStep(state: BendAdmissionState, partition: number | bigint,
  lifetime: number | bigint, event: BendAdmissionEvent): BendAdmissionResult;
export function bendAdmissionCloseProspective(state: BendAdmissionState,
  at: number | bigint): BendAdmissionResult;
export function bendWorkFinishWait(unfinished: number | bigint,
  deadlineReached: boolean, continuationBudget: boolean): boolean;
export type BendPreparedOffer = { readonly $: "SkipPrepared" | "AdmitPrepared" | "RejectPreparedCapacity" };
export function bendWorkPreparedOffer(ready: boolean, withinFrame: boolean): BendPreparedOffer;
export type BendEmptyPrepared = { readonly $: "NoEmptyFailure" | "FailEmptyLost" };
export function bendWorkEmptyPrepared(readyCount: number | bigint,
  hasNonSkipped: boolean, ticketed: boolean): BendEmptyPrepared;
export type BendEvaluatedDisposition = { readonly $: "RetainFinding" | "SettleClear" |
  "SettleStaleClear" | "RetireStaleFinding" };
export function bendWorkEvaluatedDisposition(hasFindings: boolean,
  currentWork: boolean): BendEvaluatedDisposition;
export type BendFailureDisposition = { readonly $: "NoFailure" | "BackendUnavailable" |
  "CredentialUnavailable" | "LostUnavailable" };
export function bendWorkFailureDisposition(backendOrTimeout: boolean,
  credential: boolean, missing: boolean): BendFailureDisposition;

export type BendWorkState = {
  readonly $: "Work";
  readonly next_observation: bigint;
  readonly next_unit: bigint;
  readonly source_capacity: unknown;
  readonly review_capacity: unknown;
  readonly observations: BendList<unknown>;
  readonly units: BendList<unknown>;
};
export type BendWorkStep =
  | { readonly $: "Accepted"; readonly state: BendWorkState; readonly admitted: BendList<bigint> }
  | { readonly $: "Rejected"; readonly state: BendWorkState; readonly reason: { readonly $: string } };
export type BendWorkOutcome =
  | { readonly $: "Finding"; readonly count: number | bigint; readonly bytes: number | bigint }
  | { readonly $: "Clear" | "Unavailable" };
export type BendWorkClose = { readonly $: "Closed"; readonly state: BendWorkState;
  readonly cancelled_source: BendList<bigint>; readonly cancelled_jev: BendList<bigint>;
  readonly discarded_findings: BendList<bigint> };
export type BendWorkCancel = { readonly $: "Cancelled"; readonly state: BendWorkState;
  readonly cancelled_source: BendList<bigint>; readonly cancelled_jev: BendList<bigint> };
export function bendWorkInitial(): BendWorkState;
export function bendWorkAdmit(state: BendWorkState): BendWorkStep;
export function bendWorkStartSource(state: BendWorkState, observation: number | bigint): BendWorkStep;
export function bendWorkStartUnit(state: BendWorkState, unit: number | bigint): BendWorkStep;
export function bendWorkSpawn(state: BendWorkState, observation: number | bigint,
  count: number | bigint): BendWorkStep;
export function bendWorkCompleteSource(state: BendWorkState,
  observation: number | bigint): BendWorkStep;
export function bendWorkCachedFinding(state: BendWorkState, observation: number | bigint,
  count: number | bigint, bytes: number | bigint): BendWorkStep;
export function bendWorkOutcome(state: BendWorkState, unit: number | bigint,
  outcome: BendWorkOutcome): BendWorkStep;
export function bendWorkInterruptObservation(state: BendWorkState,
  observation: number | bigint): BendWorkStep;
export function bendWorkInterruptUnit(state: BendWorkState, unit: number | bigint): BendWorkStep;
export function bendWorkRetire(state: BendWorkState, unit: number | bigint): BendWorkStep;
export function bendWorkReviseFinding(state: BendWorkState, unit: number | bigint,
  count: number | bigint, bytes: number | bigint): BendWorkStep;
export function bendWorkUnfinished(state: BendWorkState): bigint;
export function bendWorkPendingFindings(state: BendWorkState): bigint;
export function bendWorkPendingFor(state: BendWorkState, unit: number | bigint): bigint;
export function bendWorkClose(state: BendWorkState): BendWorkClose;
export function bendWorkCancelUnfinished(state: BendWorkState): BendWorkCancel;

export type BendLeaseSurface = { readonly $: "Edit" | "Background" | "Stop" };
export type BendLeasePhase = { readonly $: "Available" } |
  { readonly $: "Reserved" | "Authorized"; readonly token: bigint; readonly surface: BendLeaseSurface } |
  { readonly $: "Submitted" | "Uncertain"; readonly surface: BendLeaseSurface };
export type BendLease = {
  readonly $: "Lease";
  readonly item: bigint;
  readonly round: bigint;
  readonly closed: boolean;
  readonly reoffered: boolean;
  readonly phase: BendLeasePhase;
};
export type BendLeaseResult = { readonly $: "Granted" | "Denied"; readonly state: BendLease };
export function bendLeaseInitial(item: number | bigint, round: number | bigint): BendLease;
export function bendLeaseReserve(state: BendLease, round: number | bigint,
  token: number | bigint, surface: BendLeaseSurface): BendLeaseResult;
export function bendLeaseOffer(state: BendLease, round: number | bigint,
  token: number | bigint, surface: BendLeaseSurface, fresh: boolean): BendLeaseResult;
export function bendLeaseAuthorize(state: BendLease, round: number | bigint,
  token: number | bigint): BendLeaseResult;
export function bendLeaseRelease(state: BendLease, round: number | bigint,
  token: number | bigint): BendLeaseResult;
export function bendLeaseTerminal(state: BendLease, round: number | bigint,
  token: number | bigint, certain: boolean): BendLeaseResult;
export function bendLeaseReoffer(state: BendLease, round: number | bigint,
  token: number | bigint, fresh: boolean): BendLeaseResult;
export function bendLeaseClose(state: BendLease): BendLease;
export function bendLeaseSuppresses(state: BendLease, round: number | bigint,
  requested: BendLeaseSurface): boolean;

export type BendRound = {
  readonly $: "Round";
  readonly generation: bigint;
  readonly active: boolean;
  readonly closed_at: bigint;
  readonly continuations: bigint;
  readonly stop_token: bigint;
  readonly barrier: boolean;
  readonly deciding: boolean;
  readonly output_reserved: boolean;
};
export type BendRoundStep =
  | { readonly $: "Granted"; readonly state: BendRound }
  | { readonly $: "Denied"; readonly state: BendRound };

export function bendRoundInitial(): BendRound;
export function bendRoundMaxContinuations(): bigint;
export function bendRoundActive(state: BendRound, generation: number | bigint): boolean;
export function bendRoundBudget(state: BendRound): boolean;
export function bendRoundBeginStop(state: BendRound, token: number | bigint): BendRoundStep;
export function bendRoundOwnsStop(state: BendRound, token: number | bigint): boolean;
export function bendRoundBeginDecision(state: BendRound, token: number | bigint): BendRoundStep;
export function bendRoundConsume(state: BendRound): BendRoundStep;
export function bendRoundReserveOutput(state: BendRound, token: number | bigint): BendRoundStep;
export function bendRoundReleaseOutput(state: BendRound, token: number | bigint): BendRoundStep;
export function bendRoundFinishStop(state: BendRound, token: number | bigint,
  close: boolean, at: number | bigint): BendRoundStep;
export function bendRoundReopen(state: BendRound, generation: number | bigint): BendRoundStep;

export type BendBackgroundWaiter = {
  readonly $: "Waiter";
  readonly owner: bigint;
};
export type BendBackgroundStep =
  | { readonly $: "Granted"; readonly state: BendBackgroundWaiter }
  | { readonly $: "Denied"; readonly state: BendBackgroundWaiter };
export function bendBackgroundInitial(): BendBackgroundWaiter;
export function bendBackgroundClaim(state: BendBackgroundWaiter, token: number | bigint,
  active: boolean, used: number | bigint,
  capacity: number | bigint): BendBackgroundStep;
export function bendBackgroundRelease(state: BendBackgroundWaiter,
  token: number | bigint): BendBackgroundStep;
export function bendBackgroundExpire(state: BendBackgroundWaiter,
  elapsed: number | bigint, lifetime: number | bigint): BendBackgroundWaiter;

export type BendNoticeAction = { readonly $: "Suppress" | "Refresh" | "RejectFull" | "Create" };
export function bendNoticeDecide(remaining: BendMaybeNat,
  count: number | bigint, maximum: number | bigint): BendNoticeAction;
export type BendNoticeAdvance =
  | { readonly $: "Suppressed" | "CreatePending" | "MergePending"; readonly count: bigint }
  | { readonly $: "RejectedFull" | "CreateKey" | "KeepLeased" };
export function bendNoticeAdvance(remaining: BendMaybeNat,
  count: number | bigint, maximum: number | bigint, suppressed: number | bigint,
  pending: BendMaybeNat, leased: boolean): BendNoticeAdvance;
export type BendNoticePrune = { readonly $: "Prune"; readonly drop_lease: boolean;
  readonly drop_pending: boolean; readonly drop_key: boolean };
export function bendNoticePrune(hasPending: boolean, leased: boolean,
  leaseExpired: boolean, pendingExpired: boolean, excepted: boolean,
  cooldownExpired: boolean): BendNoticePrune;

export type BendCollectionOrder = { readonly $: "Before" | "Equal" | "After" };
export function bendCollectionOrder(leftCycle: number | bigint, leftSequence: number | bigint,
  rightCycle: number | bigint, rightSequence: number | bigint): BendCollectionOrder;
export function bendCollectionEligible(already: boolean, turnEnd: boolean,
  cycleComplete: boolean, elapsed: number | bigint, window: number | bigint): boolean;
export function bendCollectionExpired(elapsed: number | bigint,
  lifetime: number | bigint): boolean;

export type BendDeliveryPhase = { readonly $: "Reserved" | "Authorized" | "Submitted" | "Uncertain" };
export type BendDeliverySurface = { readonly $: "Edit" | "Background" | "Stop" };
export type BendDeliveryStep = { readonly $: "Granted" | "Denied";
  readonly phase: BendDeliveryPhase };
export function bendDeliveryTransition(current: BendDeliveryPhase,
  requested: BendDeliveryPhase): BendDeliveryStep;
export function bendDeliveryExpired(phase: BendDeliveryPhase,
  elapsed: number | bigint, lifetime: number | bigint): boolean;
export function bendDeliveryBackgroundReofferable(phase: BendDeliveryPhase,
  surface: BendDeliverySurface): boolean;
export function bendDeliverySubmissionAllowed(round: BendRound, surface: BendDeliverySurface,
  existingToken: boolean, finishPermit: boolean): boolean;
export function bendDeliveryExistingTokenAllowed(surface: BendDeliverySurface,
  existingToken: boolean, finishPermit: boolean): boolean;
export function bendDeliveryLegacyStopAllowed(round: BendRound): boolean;
export type BendDeliveryAckDecision = { readonly $: "AckReady" | "AckExpired" | "AckEmpty" };
export type BendDeliveryFinalDecision = { readonly $: "FinalReady" | "FinalExpired" | "FinalEmpty" };
export type BendDeliveryFindingDisposition = { readonly $: "RetireAdvice" | "KeepRemaining" | "KeepForReoffer" };
export function bendDeliveryAcknowledge(items: number | bigint, anyExpired: boolean): BendDeliveryAckDecision;
export function bendDeliveryFinalize(items: number | bigint, allAcknowledged: boolean,
  anyExpired: boolean): BendDeliveryFinalDecision;
export function bendDeliveryFindingDisposition(composed: boolean,
  remaining: number | bigint): BendDeliveryFindingDisposition;
export function bendDeliveryReleaseUnacknowledged(acknowledged: boolean): boolean;
export type BendCollectionLeaseAction = { readonly $: "KeepLease" | "DropLease" };
export function bendDeliveryCollectionLease(hasLease: boolean, expired: boolean,
  stopCollector: boolean, sameGroup: boolean, reofferable: boolean): BendCollectionLeaseAction;
export function bendDeliveryAdviceCandidate(samePartition: boolean, unleased: boolean,
  hasUnsuppressed: boolean, ticketOwns: boolean): boolean;
export function bendDeliveryNoticeCandidate(samePartition: boolean, hasPending: boolean,
  unleased: boolean, ticketOwns: boolean): boolean;
export function bendDeliveryReserveCandidate(unleased: boolean): boolean;

export type BendReuseRoute = { readonly $: "JoinAdvice" | "JoinPending" | "JoinClaimed" | "LookupCache" };
export type BendReuseCacheRoute = { readonly $: "Cached" | "Own" };
export function bendReuseRoute(liveAdvice: boolean, attachedPending: boolean,
  claimedPending: boolean): BendReuseRoute;
export function bendReuseCacheRoute(hit: boolean): BendReuseCacheRoute;

export type BendCacheAdmission = { readonly $: "Already" | "Add" | "Reject" };
export function bendCacheAdmit(existing: boolean, incomingBytes: number | bigint,
  byteLimit: number | bigint): BendCacheAdmission;
export function bendCacheEvict(entries: number | bigint, currentBytes: number | bigint,
  incomingBytes: number | bigint, entryLimit: number | bigint,
  byteLimit: number | bigint): boolean;

export type BendLifecycleCutoff =
  | { readonly $: "CutoffGranted"; readonly round: BendRound; readonly work: BendWorkState;
    readonly cancelled_source: BendList<bigint>; readonly cancelled_jev: BendList<bigint> }
  | { readonly $: "CutoffDenied"; readonly round: BendRound; readonly work: BendWorkState };
export function bendLifecycleCutoff(round: BendRound, work: BendWorkState,
  token: number | bigint): BendLifecycleCutoff;
export type BendLifecycleFinishGate =
  | { readonly $: "GateWaiting"; readonly round: BendRound; readonly work: BendWorkState }
  | { readonly $: "GateDenied"; readonly round: BendRound; readonly work: BendWorkState }
  | { readonly $: "GateCutoff"; readonly round: BendRound; readonly work: BendWorkState;
    readonly cancelled_source: BendList<bigint>; readonly cancelled_jev: BendList<bigint> };
export function bendLifecycleFinishGate(round: BendRound, work: BendWorkState,
  token: number | bigint, extraUnfinished: number | bigint,
  deadlineReached: boolean): BendLifecycleFinishGate;
export type BendLifecycleFinishDisposition = { readonly $:
  "ReserveFindings" | "PassNotices" | "AllowNoAdvice" | "AllowDeadline" | "AllowUnavailable" };
export type BendLifecycleFinishOutput =
  | { readonly $: "OutputReserved"; readonly round: BendRound; readonly selection: BendOutputSelection }
  | { readonly $: "OutputNotices" }
  | { readonly $: "OutputAllowed"; readonly reason: BendLifecycleFinishDisposition };
export function bendLifecycleFinishOutput(round: BendRound, work: BendWorkState,
  token: number | bigint, selected: ReadonlyArray<number | bigint>,
  hasNotice: boolean, passNotices: boolean, canWrite: boolean,
  bindingValid: boolean, deadlineReached: boolean): BendLifecycleFinishOutput;
export function bendLifecycleFinishDisposition(work: BendWorkState,
  selected: ReadonlyArray<number | bigint>, hasNotice: boolean,
  passNotices: boolean, canWrite: boolean, bindingValid: boolean,
  deadlineReached: boolean): BendLifecycleFinishDisposition;
export type BendOutputSelection = { readonly selected: BendList<bigint>;
  readonly authorized: boolean; readonly consumed: boolean };
export type BendOutputSelectionStep = { readonly $: "SelectionGranted" | "SelectionDenied";
  readonly state: BendOutputSelection };
export function bendLifecycleSelectionReserve(work: BendWorkState,
  selected: ReadonlyArray<number | bigint>):
  { readonly $: "SelectionRejected" } | { readonly $: "SelectionReserved"; readonly state: BendOutputSelection };
export function bendLifecycleSelectionAuthorize(state: BendOutputSelection): BendOutputSelectionStep;
export function bendLifecycleSelectionConsume(state: BendOutputSelection,
  selected: ReadonlyArray<number | bigint>): BendOutputSelectionStep;
export function bendLifecycleReserveSelected(round: BendRound, work: BendWorkState,
  token: number | bigint, selectedUnits: ReadonlyArray<number | bigint>): BendRoundStep;
export function bendLifecycleReleaseUnwritten(round: BendRound,
  token: number | bigint): BendRoundStep;

export type BendTicketReason = { readonly $: "Backend" | "Credential" | "Capacity" |
  "Stale" | "Lost" | "Expired" };
export type BendTicketPhase =
  | { readonly $: "Preparing"; readonly failure:
      { readonly $: "None" } | { readonly $: "Some"; readonly value: BendTicketReason } }
  | { readonly $: "Closed" }
  | { readonly $: "Failed"; readonly reason: BendTicketReason };
export type BendTicketFacts = { readonly $: "Facts";
  readonly expired: boolean; readonly credential_valid: boolean;
  readonly pending_units: number | bigint;
  readonly live_advice: boolean; readonly pending_notice: boolean;
  readonly unit_failure: { readonly $: "None" } |
    { readonly $: "Some"; readonly value: BendTicketReason };
  readonly finding_units: number | bigint; readonly undelivered_findings: number | bigint;
  readonly total_units: number | bigint };
export type BendTicketOutcome =
  | { readonly $: "Pending" | "Delivered" | "Clear" | "NoWork" }
  | { readonly $: "Unavailable"; readonly reason: BendTicketReason };
export function bendTicketInitial(): BendTicketPhase;
export function bendTicketFail(phase: BendTicketPhase, reason: BendTicketReason): BendTicketPhase;
export function bendTicketClose(phase: BendTicketPhase): BendTicketPhase;
export function bendTicketTerminal(phase: BendTicketPhase, facts: BendTicketFacts): BendTicketOutcome;
export type BendTicketCollectGate =
  | { readonly $: "CollectProceed" }
  | { readonly $: "CollectUnavailable"; readonly reason: BendTicketReason };
export function bendTicketCollectGate(expired: boolean,
  credentialValid: boolean): BendTicketCollectGate;
export type BendTicketFinalAuthority = { readonly $: "FinalProceed" | "FinalRelease" };
export function bendTicketFinalAuthority(admittedBlock: boolean,
  currentBlock: boolean): BendTicketFinalAuthority;
export type BendTicketJoinedState = { readonly $: "JoinedPending" | "JoinedClear" |
  "JoinedFinding" | "JoinedUnavailable" };
export type BendTicketJoinedDisposition = { readonly $: "KeepJoined" | "SetJoinedClear" |
  "SetJoinedFinding" | "SetJoinedUnavailable" | "SetJoinedLost" };
export function bendTicketJoinedDisposition(state: BendTicketJoinedState,
  staleUnavailable: boolean, hasRevision: boolean,
  hasAdviceId: boolean): BendTicketJoinedDisposition;
export type BendTicketUnitStage =
  | { readonly $: "UnitPending" | "UnitClear" | "UnitUnavailable" }
  | { readonly $: "UnitFinding"; readonly delivered: boolean };
export type BendTicketUnitEvent = { readonly $: "Revise" | "ClearResult" |
  "FindingResult" | "FailUnit" | "MarkDelivered" };
export type BendTicketUnitStep = { readonly $: "UnitGranted" | "UnitDenied";
  readonly stage: BendTicketUnitStage };
export function bendTicketUnitStep(stage: BendTicketUnitStage,
  event: BendTicketUnitEvent): BendTicketUnitStep;
export function bendTicketUnitInitial(): BendTicketUnitStage;
export type BendRevisionRegistration = { readonly $: "Reuse" | "Replace" };
export function bendRevisionRegister(hasCurrent: boolean, sameInput: boolean): BendRevisionRegistration;
export function bendRevisionSuperseded(candidateSubject: number | bigint,
  targetSubject: number | bigint, candidateGeneration: number | bigint,
  currentGeneration: number | bigint): boolean;
export type BendCleanupFacts = { readonly $: "CleanupFacts";
  readonly active: boolean; readonly dispatcher_idle: boolean;
  readonly no_advice: boolean; readonly no_notices: boolean;
  readonly no_pending_evaluations: boolean; readonly no_current_work: boolean;
  readonly no_cooldowns: boolean; readonly connection_count_ok: boolean;
  readonly cache_matches_ledger: boolean };
export type BendCleanupGate = { readonly $: "CleanupBusy" | "CleanupReady" };
export function bendCleanupGate(facts: BendCleanupFacts): BendCleanupGate;
export function bendCleanupCommit(ledgerEmpty: boolean): BendCleanupGate;
export type BendTicketRetention = { readonly $: "KeepTickets" | "EvictOldest" };
export function bendTicketRetention(count: number | bigint,
  limit: number | bigint, hasOldest: boolean): BendTicketRetention;
export type BendDiscardScope = { readonly $: "NamedOnly" | "AllUnfinished" };
export function bendDiscardScope(namedCount: number | bigint,
  cancelledCount: number | bigint, hasUnnamed: boolean): BendDiscardScope;
