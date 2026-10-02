import Base
import ./Ledger.bend as Ledger
import ./Admission.bend as Admission
import ./EditHistory.bend as EditHistory
import ./Quiescence.bend as Quiescence
import ./Work.bend as WorkPolicy
import ./Dispatch.bend as Dispatch
import ./Retention.bend as Retention
import ./Collection.bend as Collection
import ./CollectionState.bend as CollectionState
import ./Handoff.bend as Handoff
import ./Delivery.bend as Delivery
import ./Round.bend as RoundPolicy
import ./DeliveryState.bend as DeliveryState
import ./SubmissionState.bend as SubmissionState
import ./RevisionState.bend as RevisionState
import ./CollectorAuthority.bend as CollectorAuthority
import ./Reuse.bend as Reuse
import ./ReuseState.bend as ReuseState
import ./NoticeState.bend as NoticeState
import ./Configuration.bend as Configuration
import ./RulePolicy.bend as RulePolicy

# #119 boundary: one resident lifetime, shared ledger, active advicee rounds.
# Native IDs are bijectively mapped to positive Nat values before entry.
type Round is Data:
  Round{partition: Nat, lifetime: Nat, id: Nat, waiting: Bool, deciding: Bool,
    write: Maybe<&2, Nat>, uncertain: Bool, quiet_since: Maybe<&2, Nat>}

type Work is Data:
  Work{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    charge: Nat, kind: WorkKind, parent: Nat}

type WorkKind is Data:
  AwaitingSourceRead{}
  SourceReading{}
  Preparing{}
  Reviewing{}
  AtJev{}
  PendingFinding{count: Nat}

type StopScope is Data:
  StopScope{partition: Nat, round: Nat}

type State is Data:
  State{ledger: Ledger.Ledger, rounds: List<&2, Round>,
    work: List<&2, Work>, next_round: Nat, next_operation: Nat,
    admissions: List<&2, Admission.AdmissionState>, dispatch: Dispatch.State,
    collection: CollectionState.State, history: EditHistory.State}

type Outcome is Data:
  Finding{}
  Clear{}
  Unavailable{}
  Interrupted{}
  Discarded{}

type RequestOutcome is Data:
  NeverSent{}
  RequestFinding{}
  RequestClear{}
  RequestBackendFailure{}
  RequestTimeout{}
  RequestInterrupted{}

type WriteOutcome is Data:
  Acknowledged{}
  Failed{}
  Unknown{}

type CanonicalEvent is Data:
  ReserveCapacity{partition: Nat, bytes: Nat, purpose: Ledger.Purpose}
  ResizeCapacity{reservation: Nat, bytes: Nat, purpose: Ledger.Purpose}
  ReleaseCapacity{reservation: Nat}
  ReplaceCapacity{reservation: Nat, unit_bytes: List<&2, Nat>}
  IssuePermit{partition: Nat, lifetime: Nat, tool: Nat, started: Nat,
    deadline: Nat, now: Nat, minimum_started: Nat,
    facts: Admission.ProspectiveFacts}
  CheckCompletedEdit{tool: Nat}
  RememberCompletedEdit{tool: Nat, reason: EditHistory.Reason}
  QuietRoundTick{partition: Nat, lifetime: Nat, round: Nat, now: Nat,
    window: Nat, facts: Quiescence.Facts}
  QuietRoundReset{partition: Nat, lifetime: Nat, round: Nat}
  ConsumePermit{partition: Nat, lifetime: Nat, token: Nat, tool: Nat, now: Nat}
  ReleasePermit{partition: Nat, lifetime: Nat, token: Nat}
  ExpirePermit{partition: Nat, lifetime: Nat, token: Nat, deadline_reached: Bool}
  ClosePermitRound{partition: Nat, lifetime: Nat, round: Nat, at: Nat}
  ForgetAdmission{partition: Nat, lifetime: Nat}
  OpenRound{partition: Nat, lifetime: Nat}
  AdmitObservation{partition: Nat, lifetime: Nat, round: Nat}
  StartObservation{partition: Nat, lifetime: Nat, round: Nat, observation: Nat}
  CompleteObservation{partition: Nat, lifetime: Nat, round: Nat, observation: Nat}
  InterruptObservation{partition: Nat, lifetime: Nat, round: Nat, observation: Nat}
  BeginPreparation{partition: Nat, lifetime: Nat, round: Nat, bytes: Nat}
  BeginObservedPreparation{partition: Nat, lifetime: Nat, round: Nat,
    observation: Nat, bytes: Nat}
  InterruptPreparation{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
  PreparationCompleted{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, unit_bytes: List<&2, Nat>}
  StartReview{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
  JevRequestReady{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    root_valid: Bool, configuration_valid: Bool, credential_ready: Bool,
    selected: Bool, current_work: Bool, physical_available: Bool}
  JevRequestStarted{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, request: Nat}
  JevRequestInterrupted{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, request: Nat}
  JevRequestSettled{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, request: Nat, outcome: RequestOutcome, current_work: Bool}
  ReviewCompleted{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, outcome: Outcome}
  RetireReview{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
  ReviewObserved{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, outcome: Outcome, current_work: Bool}
  FindingCountUpdated{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, count: Nat}
  QueueDispatch{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
  DispatchSettled{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
  DiscardDispatch{operations: List<&2, Nat>}
  DispatchScopeCheck{named_count: Nat, cancelled_count: Nat, has_unnamed: Bool}
  CloseDispatch{}
  PreparedOfferCheck{ready: Bool, within_frame: Bool}
  EmptyPreparedCheck{ready_count: Nat, has_non_skipped: Bool, authority_bound: Bool}
  ReviewFailureCheck{backend_or_timeout: Bool, credential: Bool, missing: Bool}
  StopPolled{partition: Nat, lifetime: Nat, round: Nat, deadline: Bool}
  StopGroupPolled{group: Nat, lifetime: Nat, round: Nat,
    scopes: List<&2, StopScope>, deadline: Bool, extra_pending: Bool,
    continuations: Nat}
  StopGroupEnded{group: Nat, lifetime: Nat, round: Nat,
    scopes: List<&2, StopScope>}
  CollectionReady{advice: Nat, partition: Nat, lifetime: Nat, round: Nat, observation: Nat,
    joined_pending: Bool}
  CollectionCredentialCheck{same_scope: Bool, generation_valid: Bool}
  CollectionCandidateCheck{same_partition: Bool, unleased: Bool,
    has_unsuppressed: Bool, authority_owns: Bool}
  CollectionOrderCheck{left_sequence: Nat, right_sequence: Nat}
  CollectionExpiryCheck{elapsed: Nat, lifetime: Nat}
  CollectionFitCheck{items: Nat, bytes: Nat}
  CollectionFindingCheck{selection_partition: Nat, selection_round: Nat,
    unit: Nat, partition: Nat, round: Nat, snapshot: Nat,
    current_snapshot: Nat, credential: Nat, current_credential: Nat,
    age_ms: Nat, solo_bytes: Nat, collection_ready: Bool,
    selected_count: Nat, prospective_bytes: Nat}
  CollectionNoticeCheck{items: Nat, bytes: Nat, skip_unfitting: Bool}
  CollectionReserveLease{advice: Nat, token: Nat}
  CollectionReleaseLease{advice: Nat, token: Nat}
  CollectionLeaseCheck{advice: Nat, token: Nat, expired: Bool,
    stop_collector: Bool, same_group: Bool, reofferable: Bool}
  CollectionRetireAdvice{advice: Nat}
  CollectionClaimBackground{group: Nat, token: Nat, active: Bool, capacity: Nat}
  CollectionReleaseBackground{group: Nat, token: Nat}
  CollectionExpireBackground{group: Nat, token: Nat, elapsed: Nat, lifetime: Nat}
  FinishReserve{group: Nat, lifetime: Nat, round: Nat, attempt: Nat,
    token: Nat, selected: List<&2, Nat>, has_notice: Bool,
    pass_notices: Bool, can_write: Bool, binding_valid: Bool,
    deadline_reached: Bool}
  FinishRelease{group: Nat, round: Nat, attempt: Nat, token: Nat}
  FinishAuthorize{group: Nat, round: Nat, attempt: Nat, token: Nat,
    selected: List<&2, Nat>}
  FinishTerminal{group: Nat, round: Nat, attempt: Nat, token: Nat,
    selected: List<&2, Nat>, outcome: WriteOutcome}
  FinishEnd{group: Nat, round: Nat, attempt: Nat, token: Nat}
  ContinuationConsume{group: Nat, round: Nat}
  SubmissionBegin{advice: Nat, group: Nat, round: Nat, token: Nat,
    surface: Handoff.Surface, authorize_now: Bool, fingerprints: List<&2, Nat>,
    units: List<&2, Nat>}
  SubmissionAuthorize{advice: Nat, token: Nat}
  SubmissionTerminal{advice: Nat, token: Nat, certain: Bool}
  SubmissionRelease{advice: Nat, token: Nat}
  SubmissionForget{advice: Nat}
  SubmissionSuppressCheck{advice: Nat, fingerprint: Nat, round: Nat,
    surface: Handoff.Surface}
  SubmissionReofferCheck{advice: Nat, token: Nat}
  SubmissionExpiryCheck{advice: Nat, token: Nat, elapsed: Nat, lifetime: Nat}
  RevisionRegister{subject: Nat, input: Nat, add_member: Bool}
  RevisionRelease{subject: Nat, generation: Nat}
  RevisionCurrentCheck{subject: Nat, input: Nat, generation: Nat}
  RevisionSupersededCheck{subject: Nat, candidate_subject: Nat, generation: Nat}
  RevisionGenerationCheck{subject: Nat}
  RevisionCountCheck{}
  CollectorGateCheck{expired: Bool, credential_valid: Bool}
  CollectorFinalAuthorityCheck{admitted_block: Bool, current_block: Bool}
  ReuseMemberCheck{joined_state: Reuse.JoinedState, stale_unavailable: Bool,
    has_revision: Bool, has_advice_id: Bool}
  CleanupCheck{facts: Retention.CleanupFacts}
  CleanupCommit{}
  DeliveryReleaseCheck{acknowledged: Bool}
  DeliveryAcknowledgeCheck{items: Nat, any_expired: Bool}
  DeliveryFinalizeCheck{items: Nat, all_acknowledged: Bool, any_expired: Bool}
  DeliveryFindingDispositionCheck{composed: Bool, remaining: Nat}
  DeliverySubmissionCandidateCheck{facts: Delivery.SubmissionFacts}
  DeliverySubmissionBatchCheck{count: Nat, all_valid: Bool}
  DeliveryCredentialObserveCheck{invalid_seen: Bool, generation_valid: Bool,
    authorized: Bool}
  DeliveryFinalCredentialCheck{shared_collect: Bool, invalid_seen: Bool}
  ValidationRouteCheck{owner_current: Bool, status: Handoff.ValidationStatus}
  PostValidationCheck{work_accepted: Bool, expired: Bool, has_fitting: Bool}
  FinalCandidateCheck{owner_current: Bool, credential_generation: Bool,
    credential_authorized: Bool, expired: Bool, work_current: Bool,
    has_findings: Bool}
  RoundBeginStopCheck{active: Bool, has_stop: Bool, token: Nat}
  RoundActivityCheck{bound: Bool, has_admission: Bool, round: Nat,
    active: Bool, closed_at: Nat, expected_generation: Nat}
  RoundBarrierCheck{has_stop: Bool, used_at_start: Nat, used_now: Nat}
  RoundOwnsStopCheck{active: Bool, token_matches: Bool, deciding: Bool}
  RoundStopTerminalCheck{has_output: Bool, authorized: Bool,
    requested_close: Bool}
  RoundExpireCloseCheck{barrier: Bool, authorized_output: Bool}
  RoundContinuationBudgetCheck{active: Bool, count: Nat}
  DeliverySubmissionAllowedCheck{active: Bool, barrier: Bool,
    deciding: Bool, surface: Delivery.Surface, existing_token: Bool,
    finish_permit: Bool}
  DeliveryExistingTokenCheck{surface: Delivery.Surface,
    existing_token: Bool, finish_permit: Bool}
  DeliveryUnreservedStopCheck{active: Bool, deciding: Bool}
  IncludeLayerCheck{supplied: Bool, current_rank: Nat, candidate_rank: Nat}
  FileSelectionCheck{protected: Bool, excluded: Bool,
    includes_empty: Bool, included: Bool}
  FileProtectionInvalid{}
  FileProtectionCheck{sensitive_name: Bool,
    generated_or_vendor: Bool, allowed_extension: Bool}
  CandidateFileCheck{git_admin: Bool, physical_safe: Bool, git_allowed: Bool}
  ReviewAdmissionCheck{root_valid: Bool, configuration_valid: Bool,
    credential_ready: Bool, selected: Bool}
  RuleEnableCheck{pack_enabled: Bool, rule_enabled: Bool}
  RuleApplicabilityCheck{consent: Bool, complete: Bool, target: RulePolicy.Target,
    global_included: Bool, global_excluded: Bool,
    pack_enabled: Bool, rule_enabled: Bool,
    rule_included: Bool, rule_excluded: Bool,
    target_declared: Bool, capabilities_available: Bool,
    source_rung: Nat, minimum_rung: Nat}
  RuleFindingCheck{probability: RulePolicy.ProbabilityWords,
    threshold: RulePolicy.ProbabilityWords}
  RuleRankOrderCheck{left: RulePolicy.ProbabilityWords,
    right: RulePolicy.ProbabilityWords, left_rank: Nat, right_rank: Nat}
  AdviceOrderCheck{left: RulePolicy.ProbabilityWords,
    right: RulePolicy.ProbabilityWords,
    path_order: RulePolicy.Order, id_order: RulePolicy.Order}
  RuleBudgetCheck{position: Nat, limit: Nat}
  ReuseRoute{id: Nat, live_advice: Bool}
  ReuseClaim{id: Nat}
  ReuseAttach{id: Nat}
  ReuseRelease{id: Nat}
  ReuseTouch{id: Nat}
  CachePrepare{id: Nat, bytes: Nat, entry_limit: Nat, byte_limit: Nat}
  CacheCommit{id: Nat, partition: Nat, bytes: Nat, reservation: Nat,
    entry_limit: Nat, byte_limit: Nat}
  CacheDiscardPartition{partition: Nat}
  CacheClear{}
  NoticeAdvance{key: Nat, remaining: Maybe<&2, Nat>, maximum_keys: Nat,
    proposed: Nat, sequence: Nat, max_count: Nat}
  NoticeCommit{key: Nat, partition: Nat, group: Nat, reservation: Nat,
    pending: Nat, sequence: Nat, maximum_keys: Nat}
  NoticePrune{key: Nat, lease_expired: Bool, pending_expired: Bool,
    excepted: Bool, cooldown_expired: Bool}
  NoticeDrop{key: Nat}
  NoticeLease{key: Nat, leased: Bool}
  NoticeClearPending{key: Nat}
  NoticeSelect{partition: Nat, group: Nat, composed: Bool,
    authority_bound: Bool, allowed: List<&2, Nat>}
  OutputStarted{partition: Nat, lifetime: Nat, round: Nat}
  OutputTerminal{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, outcome: WriteOutcome}
  RetirePartition{partition: Nat, lifetime: Nat, round: Nat}

type CapacityView is Data:
  CapacityView{global: Ledger.Usage, local: Ledger.Usage,
    charges: List<&2, Ledger.Charge>}

type Command is Data:
  CapacityGranted{id: Nat, after: CapacityView}
  CapacityRefused{reason: Ledger.FitDecision, after: CapacityView}
  CapacityResized{id: Nat, after: CapacityView}
  CapacityUnitAdmitted{reservation: Nat, position: Nat, bytes: Nat, after: CapacityView}
  CapacityUnitRefused{position: Nat, bytes: Nat, reason: Ledger.FitDecision,
    after: CapacityView}
  PermitIssued{token: Nat, round: Nat}
  CompletedEditAbsent{}
  CompletedEditSeen{reason: EditHistory.Reason, report: Bool}
  CompletedEditRemembered{evicted: Maybe<&2, Nat>}
  QuietRoundBusy{}
  QuietRoundWaiting{since: Nat}
  QuietRoundExpired{since: Nat}
  QuietRoundResetRecorded{}
  PermitConsumed{round: Nat}
  PermitReleased{}
  PermitExpired{}
  PermitKept{}
  PermitRoundClosed{round: Nat}
  RoundStarted{id: Nat}
  ObservationAdmitted{id: Nat}
  ObservationStarted{}
  ObservationCompleted{}
  ObservationInterrupted{}
  Prepare{operation: Nat, reservation: Nat}
  PreparationRefused{}
  UnitAdmitted{operation: Nat, reservation: Nat, position: Nat, bytes: Nat,
    after: CapacityView}
  UnitRefused{position: Nat, bytes: Nat, reason: Ledger.FitDecision,
    after: CapacityView}
  PreparationReleased{id: Nat, after: CapacityView}
  ReviewStarted{}
  JevRequestIssued{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, request: Nat}
  JevRequestUnavailable{}
  JevRequestStartRecorded{}
  JevInterruptionRecorded{}
  JevRequestOutcomeRecorded{outcome: RequestOutcome}
  JevObservationIgnored{}
  ReservationReleased{id: Nat}
  ReviewRecorded{outcome: Outcome}
  RetainFinding{}
  FindingCountRecorded{}
  SettleClear{}
  SettleStaleClear{}
  RetireStaleFinding{}
  PreparedSkipped{}
  PreparedAdmitted{}
  PreparedCapacityRefused{}
  EmptyLost{}
  EmptyAccepted{}
  FailureBackend{}
  FailureCredential{}
  FailureLost{}
  FailureNone{}
  DispatchStarted{operation: Nat, sequence: Nat}
  DispatchDiscarded{operation: Nat, running: Bool}
  DiscardNamedOnly{}
  DiscardAllUnfinished{}
  WaitForWork{}
  CancelWork{operation: Nat}
  # Ready for advice selection; output still requires authorization.
  FinishReady{}
  FinishLimit{}
  StopEnded{}
  CollectionEligible{}
  CollectionWaiting{}
  CollectionRetireCredential{}
  CollectionRetainCredential{}
  CollectionCandidate{}
  CollectionSkip{}
  CollectionBefore{}
  CollectionEqual{}
  CollectionAfter{}
  CollectionExpired{}
  CollectionCurrent{}
  CollectionFits{}
  CollectionLimited{}
  CollectionFindingSelected{}
  CollectionFindingRetained{}
  CollectionFindingLimited{}
  CollectionFindingExpired{}
  CollectionNoticeIncluded{}
  CollectionNoticeSkipped{}
  CollectionNoticeStopped{}
  CollectionLeaseReserved{}
  CollectionLeaseRefused{}
  CollectionLeaseReleased{}
  CollectionLeaseKept{}
  CollectionAdviceRetired{}
  CollectionBackgroundClaimed{}
  CollectionBackgroundRefused{}
  CollectionBackgroundReleased{}
  CollectionBackgroundKept{}
  FinishReserved{}
  FinishNotices{}
  FinishAllowedNoAdvice{}
  FinishAllowedDeadline{}
  FinishAllowedUnavailable{}
  FinishRefused{}
  FinishReleased{}
  FinishAuthorized{}
  FinishRecorded{outcome: WriteOutcome}
  FinishEnded{}
  ContinuationConsumed{}
  ContinuationRefused{}
  SubmissionBegun{}
  SubmissionAuthorized{}
  SubmissionRecorded{}
  SubmissionReleased{}
  SubmissionRefused{}
  SubmissionForgotten{}
  SubmissionSuppresses{}
  SubmissionUnsuppressed{}
  SubmissionReofferable{}
  SubmissionNotReofferable{}
  SubmissionExpired{}
  SubmissionCurrent{}
  RevisionReused{generation: Nat}
  RevisionReplaced{generation: Nat}
  RevisionReleased{}
  RevisionCurrent{}
  RevisionStale{}
  RevisionSuperseded{}
  RevisionNotSuperseded{}
  RevisionGeneration{generation: Nat}
  RevisionCount{count: Nat}
  CollectorProceed{}
  CollectorUnavailable{reason: CollectorAuthority.Reason}
  CollectorFinalProceed{}
  CollectorFinalRelease{}
  ReuseKeepMember{}
  ReuseSetMemberClear{}
  ReuseSetMemberFinding{}
  ReuseSetMemberUnavailable{}
  ReuseSetMemberLost{}
  CleanupReady{}
  CleanupBusy{}
  CleanupCommitted{}
  DeliveryReleaseUnacknowledged{}
  DeliveryKeepAcknowledged{}
  DeliveryAckReady{}
  DeliveryAckExpired{}
  DeliveryAckEmpty{}
  DeliveryFinalReady{}
  DeliveryFinalExpired{}
  DeliveryFinalEmpty{}
  DeliveryRetireAdvice{}
  DeliveryKeepRemaining{}
  DeliveryKeepForReoffer{}
  DeliverySubmissionCandidate{}
  DeliverySubmissionRefused{}
  DeliveryBatchProceed{}
  DeliveryBatchRelease{}
  DeliveryCredentialInvalid{}
  DeliveryCredentialValid{}
  IgnoreCandidate{}
  ReleaseCandidate{}
  RetireCandidate{}
  ContinueCandidate{}
  RetainCandidate{}
  RoundStopBegun{}
  RoundStopRefused{}
  RoundActive{}
  RoundInactive{}
  RoundBarrierRaised{}
  RoundBarrierClear{}
  RoundStopOwned{}
  RoundStopNotOwned{}
  RoundStopTerminal{revoke_provisional: Bool, close: Bool}
  RoundExpireCloses{}
  RoundExpireKeeps{}
  RoundContinuationAvailable{}
  RoundContinuationExhausted{}
  DeliverySubmissionAllowed{}
  DeliverySubmissionDenied{}
  DeliveryExistingTokenAllowed{}
  DeliveryExistingTokenDenied{}
  DeliveryUnreservedStopAllowed{}
  DeliveryUnreservedStopDenied{}
  ReuseJoinAdvice{}
  ReuseJoinPending{}
  ReuseJoinClaimed{}
  ReuseCached{}
  ReuseOwn{}
  ReuseClaimed{}
  ReuseAttached{}
  ReuseReleased{}
  ReuseRefused{}
  CacheAlready{}
  CacheRejected{}
  CachePrepared{evicted: List<&2, Nat>}
  CacheCommitted{}
  CacheDiscarded{ids: List<&2, Nat>}
  NoticeSuppressed{count: Nat}
  NoticeRejectedFull{}
  NoticeCreateKey{}
  NoticeCreatePending{count: Nat}
  NoticeMergePending{count: Nat}
  NoticeKeepLeased{}
  NoticeRefused{}
  NoticeCommitted{}
  NoticePruned{drop_lease: Bool, drop_pending: Bool, drop_key: Bool}
  NoticeDropped{}
  NoticeLeased{}
  NoticePendingCleared{}
  NoticeSelected{ids: List<&2, Nat>}
  IncludeChoice{choice: Configuration.IncludeChoice}
  FileSelection{selection: Configuration.Selection}
  FileProtection{protection: Configuration.Protection}
  CandidateFile{candidate: Configuration.Candidate}
  ReviewAdmission{admission: Configuration.Admission}
  RuleGate{gate: RulePolicy.Gate}
  RuleOrder{order: RulePolicy.Order}
  WriteAuthorized{operation: Nat}
  WriteRecorded{outcome: WriteOutcome}
  WaitForOutput{}
  ReofferAtStop{}
  PartitionRetired{round: Nat}
  AdmissionForgotten{}

type Reason is Data:
  InvalidIdentity{}
  RoundLimit{}
  StaleRound{}
  StaleOperation{}
  WrongStage{}
  InconsistentLedger{}
  ProspectiveDenied{}
  AdviceePermitLimit{}
  ResidentPermitLimit{}
  PermitDenied{reason: Admission.AdmissionRejection}

type Step is Data:
  Advanced{state: State, commands: List<&2, Command>}
  Rejected{state: State, reason: Reason}

def initial(limits: Ledger.Limits) -> State:
  State{Ledger.initial(limits), Nil{}, Nil{}, 1n, 1n, Nil{}, Dispatch.initial(),
    CollectionState.initial(), EditHistory.initial()}

def with_history(state: State, replacement: EditHistory.State) -> State:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, admissions,
        dispatch, collection, +history}:
      State{ledger, rounds, work, next_round, next_operation, admissions,
        dispatch, collection, replacement}

def history_of(state: State) -> EditHistory.State:
  match state:
    case State{_, _, _, _, _, _, _, _, history}: history

def checked_completed_edit(+state: State, tool: Nat, result: EditHistory.Lookup) -> Step:
  match result:
    case EditHistory.Absent{}:
      Advanced{state, CompletedEditAbsent{} <> Nil{}}
    case EditHistory.Seen{reason, report}:
      Advanced{with_history(state, EditHistory.mark_reported(tool, history_of(state))),
        CompletedEditSeen{reason, report} <> Nil{}}

def check_completed_edit(+state: State, +tool: Nat) -> Step:
  checked_completed_edit(state, tool, EditHistory.lookup(tool, history_of(state)))

def remembered_completed_edit(state: State, result: EditHistory.Record) -> Step:
  match result:
    case EditHistory.Recorded{replacement, evicted}:
      Advanced{with_history(state, replacement), CompletedEditRemembered{evicted} <> Nil{}}

def remember_completed_checked(+state: State, tool: Nat, reason: EditHistory.Reason,
    lookup: EditHistory.Lookup) -> Step:
  match lookup:
    case EditHistory.Absent{}:
      remembered_completed_edit(state, EditHistory.record(tool, reason, history_of(state)))
    case EditHistory.Seen{_, _}:
      Advanced{state, CompletedEditRemembered{None{}} <> Nil{}}

def remember_completed_edit(+state: State, +tool: Nat, reason: EditHistory.Reason) -> Step:
  remember_completed_checked(state, tool, reason, EditHistory.lookup(tool, history_of(state)))

def same_round(+partition: Nat, +lifetime: Nat, +id: Nat, round: Round) -> Bool:
  match round:
    case Round{owner, generation, current, _, _, _, _, +quiet_since}:
      Bool.and(Nat.is_eq(owner, partition),
        Bool.and(Nat.is_eq(generation, lifetime), Nat.is_eq(current, id)))

def same_partition(+partition: Nat, round: Round) -> Bool:
  match round:
    case Round{owner, _, _, _, _, _, _, +quiet_since}:
      Nat.is_eq(owner, partition)

def admission_matches(+partition: Nat, item: Admission.AdmissionState) -> Bool:
  match item:
    case Admission.AdmissionState{owner, _, _, _, _, _, _}:
      Nat.is_eq(owner, partition)

def find_admission(+partition: Nat,
    items: List<&2, Admission.AdmissionState>) -> Maybe<&2, Admission.AdmissionState>:
  match items:
    case Nil{}:
      None{}
    case +item <> rest:
      Bool.pick(Maybe<&2, Admission.AdmissionState>, admission_matches(partition, item),
        Some{item}, find_admission(partition, rest))

def retain_admission(item: Admission.AdmissionState,
    tail: List<&2, Admission.AdmissionState>, match_owner: Bool) -> List<&2, Admission.AdmissionState>:
  match match_owner:
    case True{}:
      tail
    case False{}:
      item <> tail

def remove_admission(+partition: Nat,
    items: List<&2, Admission.AdmissionState>) -> List<&2, Admission.AdmissionState>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      retain_admission(item, remove_admission(partition, rest),
        admission_matches(partition, item))

def with_admission(state: State, +partition: Nat,
    admission: Admission.AdmissionState) -> State:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch, +collection, +history}:
      State{ledger, rounds, work, next_round, next_operation,
        admission <> remove_admission(partition, admissions), dispatch, collection, history}

def has_partition_work(+partition: Nat, work: List<&2, Work>) -> Bool:
  match work:
    case Nil{}: False{}
    case Work{owner, _, _, _, _, _, _} <> rest:
      Bool.or(Nat.is_eq(partition, owner), has_partition_work(partition, rest))

def no_round_for_partition(+partition: Nat, rounds: List<&2, Round>) -> Bool:
  match rounds:
    case Nil{}: True{}
    case Round{owner, _, _, _, _, _, _, +quiet_since} <> rest:
      Bool.and(Bool.not(Nat.is_eq(partition, owner)),
        no_round_for_partition(partition, rest))

def forget_admission_found(+state: State, +partition: Nat, +lifetime: Nat,
    found: Maybe<&2, Admission.AdmissionState>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation, admissions,
        dispatch, collection, +history} None{}:
      Advanced{State{ledger, rounds, work, next_round, next_operation,
        admissions, dispatch, collection, history}, AdmissionForgotten{} <> Nil{}}
    case State{ledger, rounds, work, next_round, next_operation, admissions,
        dispatch, collection, +history} Some{Admission.AdmissionState{owner, generation, _, active, _, _, permits}}:
      Bool.pick(Step, Bool.and(Nat.is_eq(owner, partition),
        Bool.and(Nat.is_eq(generation, lifetime),
        Bool.and(Bool.not(active), Bool.and(List.is_empty(&2, Admission.Permit, permits),
        Bool.and(Bool.not(has_partition_work(partition, work)),
        no_round_for_partition(partition, rounds)))))),
        Advanced{State{ledger, rounds, work, next_round, next_operation,
          remove_admission(partition, admissions), dispatch, collection, history},
          AdmissionForgotten{} <> Nil{}},
        Rejected{State{ledger, rounds, work, next_round, next_operation,
          admissions, dispatch, collection, history}, WrongStage{}})

def forget_admission(+state: State, +partition: Nat, +lifetime: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, admissions, +dispatch, +collection, +history}:
      forget_admission_found(state, partition, lifetime, find_admission(partition, admissions))

def current_admission_found(partition: Nat, lifetime: Nat,
    found: Maybe<&2, Admission.AdmissionState>) -> Admission.AdmissionState:
  match found:
    case Some{item}:
      item
    case None{}:
      Admission.initial(partition, lifetime)

def current_admission(state: State, +partition: Nat, +lifetime: Nat) -> Admission.AdmissionState:
  match state:
    case State{_, _, _, _, _, admissions, +dispatch, +collection, +history}:
      current_admission_found(partition, lifetime, find_admission(partition, admissions))

def pending_advicee_permits_found(found: Maybe<&2, Admission.AdmissionState>) -> Nat:
  match found:
    case None{}:
      0n
    case Some{admission}:
      Admission.pending_count(admission)

def pending_advicee_permits(partition: Nat,
    admissions: List<&2, Admission.AdmissionState>) -> Nat:
  pending_advicee_permits_found(find_admission(partition, admissions))

def pending_resident_permits(admissions: List<&2, Admission.AdmissionState>) -> Nat:
  match admissions:
    case Nil{}:
      0n
    case admission <> rest:
      (Admission.pending_count(admission) + pending_resident_permits(rest) : Nat)

def permit_result(state: State, +partition: Nat,
    result: Admission.AdmissionResult, command: Command) -> Step:
  match result:
    case Admission.Accepted{admission, _, _}:
      Advanced{with_admission(state, partition, admission), command <> Nil{}}
    case Admission.Rejected{_, reason}:
      Rejected{state, PermitDenied{reason}}

def replace_quiet_round(+partition: Nat, +since: Maybe<&2, Nat>,
    rounds: List<&2, Round>) -> List<&2, Round>:
  match rounds:
    case Nil{}: Nil{}
    case Round{+owner, lifetime, id, waiting, deciding, write, uncertain, previous} <> rest:
      Round{owner, lifetime, id, waiting, deciding, write, uncertain,
        Bool.pick(Maybe<&2, Nat>, Nat.is_eq(partition, owner), since, previous)} <>
        replace_quiet_round(partition, since, rest)

def with_quiet_round(state: State, partition: Nat, since: Maybe<&2, Nat>) -> State:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, admissions,
        dispatch, collection, history}:
      State{ledger, replace_quiet_round(partition, since, rounds), work,
        next_round, next_operation, admissions, dispatch, collection, history}

def issue_result(state: State, +partition: Nat,
    result: Admission.AdmissionResult) -> Step:
  match result:
    case Admission.Accepted{admission, Some{token}, Some{round}}:
      Advanced{with_quiet_round(with_admission(state, partition, admission), partition, None{}),
        PermitIssued{token, round} <> Nil{}}
    case Admission.Rejected{_, reason}:
      Rejected{state, PermitDenied{reason}}
    case _:
      Rejected{state, InconsistentLedger{}}


def close_permit_result(state: State, +partition: Nat,
    result: Admission.AdmissionResult) -> Step:
  match result:
    case Admission.Accepted{admission, _, Some{round}}:
      Advanced{with_admission(state, partition, admission), PermitRoundClosed{round} <> Nil{}}
    case Admission.Rejected{_, reason}:
      Rejected{state, PermitDenied{reason}}
    case _:
      Rejected{state, InconsistentLedger{}}

def issue_permit_capacity_checked(+state: State, +partition: Nat, +lifetime: Nat,
    +tool: Nat, +started: Nat, +deadline: Nat, +now: Nat,
    advicee_available: Bool, resident_available: Bool) -> Step:
  match advicee_available resident_available:
    case False{} _:
      Rejected{state, AdviceePermitLimit{}}
    case True{} False{}:
      Rejected{state, ResidentPermitLimit{}}
    case True{} True{}:
      issue_result(state, partition, Admission.step(current_admission(state, partition, lifetime),
        partition, lifetime, Admission.Issue{tool, started, deadline, now}))

def issue_permit_capacity(+state: State, +partition: Nat, +lifetime: Nat,
    +tool: Nat, +started: Nat, +deadline: Nat, +now: Nat,
    advicee_limit: Nat, resident_limit: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, +admissions, +dispatch, +collection, +history}:
      issue_permit_capacity_checked(state, partition, lifetime, tool, started, deadline, now,
        Nat.is_lt(pending_advicee_permits(partition, admissions), advicee_limit),
        Nat.is_lt(pending_resident_permits(admissions), resident_limit))

def issue_permit_gate(+state: State, +partition: Nat, +lifetime: Nat,
    +tool: Nat, +started: Nat, +deadline: Nat, +now: Nat,
    advicee_limit: Nat, resident_limit: Nat, gate: Admission.ProspectiveDecision) -> Step:
  match gate:
    case Admission.PermitDenied{}:
      Rejected{state, ProspectiveDenied{}}
    case Admission.PermitLate{}:
      Rejected{state, PermitDenied{Admission.StaleInvocation{}}}
    case Admission.PermitInvalidClock{}:
      Rejected{state, PermitDenied{Admission.InvalidClock{}}}
    case Admission.PermitAllowed{}:
      issue_permit_capacity(state, partition, lifetime, tool, started, deadline, now,
        advicee_limit, resident_limit)

def issue_permit(+state: State, +partition: Nat, +lifetime: Nat,
    +tool: Nat, +started: Nat, +deadline: Nat, +now: Nat,
    +minimum_started: Nat,
    facts: Admission.ProspectiveFacts) -> Step:
  match facts:
    case Admission.ProspectiveFacts{clock_valid, hook_window, started_upper,
        now_lower, +advicee_limit, +resident_limit}:
      Bool.pick(Step, Nat.is_gt(started, minimum_started),
        issue_permit_gate(state, partition, lifetime, tool, started, deadline, now,
          advicee_limit, resident_limit,
          Admission.prospective_gate(Admission.ProspectiveFacts{clock_valid, hook_window,
            started_upper, now_lower, advicee_limit, resident_limit}, started, now)),
        Rejected{state, PermitDenied{Admission.StaleInvocation{}}})



def release_permit(+state: State, +partition: Nat, +lifetime: Nat,
    +token: Nat) -> Step:
  permit_result(state, partition, Admission.step(current_admission(state, partition, lifetime),
    partition, lifetime, Admission.Release{token}), PermitReleased{})

def expire_permit_result(state: State, +partition: Nat,
    result: Admission.ExpiryResult) -> Step:
  match result:
    case Admission.KeepPermit{_}:
      Advanced{state, PermitKept{} <> Nil{}}
    case Admission.RemovePermit{admission}:
      Advanced{with_admission(state, partition, admission), PermitExpired{} <> Nil{}}

def expire_permit_checked(+state: State, +partition: Nat, +lifetime: Nat,
    +token: Nat, deadline_reached: Bool, admission: Admission.AdmissionState) -> Step:
  match admission:
    case Admission.AdmissionState{_, +owner_lifetime, _, _, _, _, _}:
      Bool.pick(Step, Nat.is_eq(owner_lifetime, lifetime),
        expire_permit_result(state, partition,
          Admission.expire(admission, token, deadline_reached)),
        Rejected{state, PermitDenied{Admission.WrongLifetime{}}})

def expire_permit(+state: State, +partition: Nat, +lifetime: Nat,
    +token: Nat, deadline_reached: Bool) -> Step:
  expire_permit_checked(state, partition, lifetime, token, deadline_reached,
    current_admission(state, partition, lifetime))

def close_permit_checked(+state: State, +partition: Nat, +lifetime: Nat,
    +expected: Nat, +at: Nat,
    admission: Admission.AdmissionState) -> Step:
  match admission:
    case Admission.AdmissionState{_, +owner_lifetime, +round, +active, _, _, _}:
      Bool.pick(Step, Nat.is_eq(owner_lifetime, lifetime),
        Bool.pick(Step, Nat.is_eq(expected, Admission.candidate_round(round, active)),
          close_permit_result(state, partition,
            Admission.step(admission, partition, lifetime, Admission.CloseRound{at})),
          Rejected{state, StaleRound{}}),
        Rejected{state, PermitDenied{Admission.WrongLifetime{}}})

def close_permit_round(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +at: Nat) -> Step:
  close_permit_checked(state, partition, lifetime, round, at,
    current_admission(state, partition, lifetime))

def find_round(+partition: Nat, rounds: List<&2, Round>) -> Maybe<&2, Round>:
  match rounds:
    case Nil{}:
      None{}
    case +round <> rest:
      Bool.pick(Maybe<&2, Round>, same_partition(partition, round), Some{round}, find_round(partition, rest))

def remove_round_pick(round: Round, tail: List<&2, Round>, hit: Bool) -> List<&2, Round>:
  match hit:
    case True{}:
      tail
    case False{}:
      round <> tail

def remove_round(+partition: Nat, rounds: List<&2, Round>) -> List<&2, Round>:
  match rounds:
    case Nil{}:
      Nil{}
    case +round <> rest:
      remove_round_pick(round, remove_round(partition, rest),
        same_partition(partition, round))

def same_ids(a: Nat, b: Nat, c: Nat, x: Nat, y: Nat, z: Nat) -> Bool:
  Bool.and(Nat.is_eq(a, x), Bool.and(Nat.is_eq(b, y), Nat.is_eq(c, z)))

def work_matches(+partition: Nat, +lifetime: Nat, +round: Nat,
    +operation: Nat, item: Work) -> Bool:
  match item:
    case Work{owner, generation, current, op, _, _, _}:
      Bool.and(same_ids(partition, lifetime, round, owner, generation, current),
        Nat.is_eq(op, operation))

def find_work(+partition: Nat, +lifetime: Nat, +round: Nat,
    +operation: Nat, items: List<&2, Work>) -> Maybe<&2, Work>:
  match items:
    case Nil{}:
      None{}
    case +item <> rest:
      Bool.pick(Maybe<&2, Work>, work_matches(partition, lifetime, round, operation, item),
        Some{item}, find_work(partition, lifetime, round, operation, rest))

def remove_work_pick(item: Work, tail: List<&2, Work>, hit: Bool) -> List<&2, Work>:
  match hit:
    case True{}:
      tail
    case False{}:
      item <> tail

def remove_work(+operation: Nat, items: List<&2, Work>) -> List<&2, Work>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Work{_, _, _, op, _, _, _}:
          remove_work_pick(item, remove_work(operation, rest), Nat.is_eq(op, operation))

def unfinished(kind: WorkKind) -> Bool:
  match kind:
    case PendingFinding{_}:
      False{}
    case _:
      True{}

def pending(+partition: Nat, +lifetime: Nat, +round: Nat, items: List<&2, Work>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Work{owner, generation, current, _, _, kind, _} <> rest:
      Bool.or(Bool.and(same_ids(partition, lifetime, round, owner, generation, current),
          unfinished(kind)),
        pending(partition, lifetime, round, rest))

def quiet_admission_state(admission: Admission.AdmissionState) -> Bool:
  match admission:
    case Admission.AdmissionState{_, _, _, active, _, _, permits}:
      Bool.and(active, List.is_empty(&2, Admission.Permit, permits))

def quiet_admission(state: State, +partition: Nat, +lifetime: Nat) -> Bool:
  quiet_admission_state(current_admission(state, partition, lifetime))

def quiet_round_decision(+state: State, partition: Nat,
    decision: Quiescence.Decision) -> Step:
  match decision:
    case Quiescence.Busy{}:
      Advanced{with_quiet_round(state, partition, None{}), QuietRoundBusy{} <> Nil{}}
    case Quiescence.Waiting{+since}:
      Advanced{with_quiet_round(state, partition, Some{since}),
        QuietRoundWaiting{since} <> Nil{}}
    case Quiescence.Expired{since}:
      Advanced{state, QuietRoundExpired{since} <> Nil{}}

def quiet_round_current(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, now: Nat, window: Nat, facts: Quiescence.Facts,
    current: Round) -> Step:
  match state current:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}
        Round{_, _, _, waiting, deciding, write, _, quiet_since}:
      quiet = Bool.and(Quiescence.facts_quiet(facts),
        Bool.and(quiet_admission(state, partition, lifetime),
        Bool.and(Bool.not(pending(partition, lifetime, round, work)),
        Bool.and(Bool.not(waiting), Bool.and(Bool.not(deciding),
          Maybe.is_none(&2, Nat, write))))))
      quiet_round_decision(state, partition,
        Quiescence.decide(quiet_since, now, window, quiet))

def quiet_round_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, now: Nat, window: Nat, facts: Quiescence.Facts,
    found: Maybe<&2, Round>) -> Step:
  match found:
    case None{}: Rejected{state, StaleRound{}}
    case Some{+current}:
      Bool.pick(Step, same_round(partition, lifetime, round, current),
        quiet_round_current(state, partition, lifetime, round, now, window, facts, current),
        Rejected{state, StaleRound{}})

def quiet_round_tick(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, now: Nat, window: Nat, facts: Quiescence.Facts) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      quiet_round_found(state, partition, lifetime, round, now, window, facts,
        find_round(partition, rounds))

def quiet_round_reset_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, found: Maybe<&2, Round>) -> Step:
  match found:
    case None{}: Rejected{state, StaleRound{}}
    case Some{+current}:
      Bool.pick(Step, same_round(partition, lifetime, round, current),
        Advanced{with_quiet_round(state, partition, None{}),
          QuietRoundResetRecorded{} <> Nil{}},
        Rejected{state, StaleRound{}})

def quiet_round_reset(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      quiet_round_reset_found(state, partition, lifetime, round,
        find_round(partition, rounds))

def cancel_pick(+operation: Nat, tail: List<&2, Command>, hit: Bool) -> List<&2, Command>:
  match hit:
    case True{}:
      CancelWork{operation} <> tail
    case False{}:
      tail

def cancel_commands(+partition: Nat, +lifetime: Nat, +round: Nat,
    items: List<&2, Work>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case Work{owner, generation, current, op, _, kind, _} <> rest:
      cancel_pick(op, cancel_commands(partition, lifetime, round, rest),
        Bool.and(same_ids(partition, lifetime, round, owner, generation, current),
          unfinished(kind)))

def release_pick(charge: Nat, tail: List<&2, Command>, hit: Bool) -> List<&2, Command>:
  match hit:
    case True{}:
      ReservationReleased{charge} <> tail
    case False{}:
      tail

def release_commands(+partition: Nat, +lifetime: Nat, +round: Nat,
    items: List<&2, Work>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case Work{owner, generation, current, _, +charge, kind, _} <> rest:
      release_pick(charge, release_commands(partition, lifetime, round, rest),
        Bool.and(Nat.is_gt(charge, 0n),
          Bool.and(same_ids(partition, lifetime, round, owner, generation, current),
            unfinished(kind))))

def release_all_commands(+partition: Nat, +lifetime: Nat, +round: Nat,
    items: List<&2, Work>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case Work{owner, generation, current, _, +charge, _, _} <> rest:
      release_pick(charge, release_all_commands(partition, lifetime, round, rest),
        Bool.and(Nat.is_gt(charge, 0n),
          same_ids(partition, lifetime, round, owner, generation, current)))

def release_charge(ledger: Ledger.Ledger, charge: Nat) -> Ledger.Ledger:
  match ledger:
    case Ledger.Ledger{limits, next_id, charges}:
      Ledger.Ledger{limits, next_id, Ledger.remove(charge, charges)}

def release_round_charges(items: List<&2, Work>, +ledger: Ledger.Ledger,
    +partition: Nat, +lifetime: Nat, +round: Nat) -> Ledger.Ledger:
  match items:
    case Nil{}:
      ledger
    case Work{owner, generation, current, _, charge, _, _} <> rest:
      release_round_charges(rest,
        Bool.pick(Ledger.Ledger,
          same_ids(partition, lifetime, round, owner, generation, current),
          release_charge(ledger, charge), ledger),
        partition, lifetime, round)

def release_unfinished_charges(items: List<&2, Work>, +ledger: Ledger.Ledger,
    +partition: Nat, +lifetime: Nat, +round: Nat) -> Ledger.Ledger:
  match items:
    case Nil{}:
      ledger
    case Work{owner, generation, current, _, +charge, kind, _} <> rest:
      release_unfinished_charges(rest,
        Bool.pick(Ledger.Ledger,
          Bool.and(Nat.is_gt(charge, 0n),
            Bool.and(same_ids(partition, lifetime, round, owner, generation, current),
              unfinished(kind))),
          release_charge(ledger, charge), ledger),
        partition, lifetime, round)

def retain_work_pick(item: Work, tail: List<&2, Work>, remove: Bool) -> List<&2, Work>:
  match remove:
    case True{}:
      tail
    case False{}:
      item <> tail

def retain_other_work(items: List<&2, Work>, +partition: Nat,
    +lifetime: Nat, +round: Nat) -> List<&2, Work>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Work{owner, generation, current, _, _, _, _}:
          retain_work_pick(item, retain_other_work(rest, partition, lifetime, round),
            same_ids(partition, lifetime, round, owner, generation, current))

def retain_after_stop(items: List<&2, Work>, +partition: Nat,
    +lifetime: Nat, +round: Nat) -> List<&2, Work>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Work{owner, generation, current, _, _, kind, _}:
          retain_work_pick(item, retain_after_stop(rest, partition, lifetime, round),
            Bool.and(same_ids(partition, lifetime, round, owner, generation, current),
              unfinished(kind)))

def open_found(+state: State, +partition: Nat, +lifetime: Nat,
    found: Maybe<&2, Round>) -> Step:
  match state found:
    case _ Some{_}:
      Rejected{state, StaleRound{}}
    case State{ledger, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history} None{}:
      Bool.pick(Step, Bool.and(Nat.is_gt(partition, 0n),
          Bool.and(Nat.is_gt(lifetime, 0n),
            Nat.is_lt(List.length(&2, Round, rounds), 64n))),
        Advanced{State{ledger, Round{partition, lifetime, next_round, False{}, False{}, None{}, False{}, None{}} <> rounds,
          work, (next_round + 1n : Nat), next_operation, admissions, dispatch, collection, history}, RoundStarted{next_round} <> Nil{}},
        Rejected{state, Bool.pick(Reason,
          Bool.and(Nat.is_gt(partition, 0n), Nat.is_gt(lifetime, 0n)),
          RoundLimit{}, InvalidIdentity{})})

def open(+state: State, +partition: Nat, +lifetime: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      open_found(state, partition, lifetime, find_round(partition, rounds))

# Commit the accepted edit and its canonical round together. Capacity rejection
# leaves the permit unconsumed and cannot leave an active admission without a round.
def consume_opened(original: State, round: Nat, opened: Step) -> Step:
  match opened:
    case Advanced{state, commands}:
      Advanced{state, PermitConsumed{round} <> commands}
    case Rejected{_, reason}:
      Rejected{original, reason}

def consume_existing(+original: State, +updated: State, +partition: Nat,
    +lifetime: Nat, +round: Nat, existing: Maybe<&2, Round>) -> Step:
  match existing:
    case None{}:
      consume_opened(original, round, open(updated, partition, lifetime))
    case Some{Round{_, owner_lifetime, _, _, _, _, _, +quiet_since}}:
      Bool.pick(Step, Nat.is_eq(lifetime, owner_lifetime),
        Advanced{with_quiet_round(updated, partition, None{}), PermitConsumed{round} <> Nil{}},
        Rejected{original, StaleRound{}})

def consume_admitted(+state: State, +partition: Nat, lifetime: Nat,
    admission: Admission.AdmissionState, round: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, _, _, +history}:
      consume_existing(state, with_admission(state, partition, admission),
        partition, lifetime, round, find_round(partition, rounds))

def consume_result(+state: State, +partition: Nat, lifetime: Nat,
    result: Admission.AdmissionResult) -> Step:
  match result:
    case Admission.Accepted{admission, _, Some{round}}:
      consume_admitted(state, partition, lifetime, admission, round)
    case Admission.Rejected{_, reason}:
      Rejected{state, PermitDenied{reason}}
    case _:
      Rejected{state, InconsistentLedger{}}

def consume_permit(+state: State, +partition: Nat, +lifetime: Nat,
    +token: Nat, +tool: Nat, +now: Nat) -> Step:
  consume_result(state, partition, lifetime, Admission.step(current_admission(state, partition, lifetime),
    partition, lifetime, Admission.Consume{token, tool, now}))

def is_deciding(current: Round) -> Bool:
  match current:
    case Round{_, _, _, _, deciding, _, _, +quiet_since}:
      deciding

def admit_observation_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, +next_operation, admissions, +dispatch, +collection, +history} Some{+current}:
      Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
          Bool.not(is_deciding(current))),
        Advanced{State{ledger, rounds,
          Work{partition, lifetime, round, next_operation, 0n, AwaitingSourceRead{}, 0n} <> work,
          next_round, (next_operation + 1n : Nat), admissions, dispatch, collection, history},
          ObservationAdmitted{next_operation} <> Nil{}},
        Rejected{state, StaleRound{}})
    case _ _:
      Rejected{state, StaleRound{}}

def admit_observation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      admit_observation_found(state, partition, lifetime, round, find_round(partition, rounds))

def replace_work_kind_pick(item: Work, next: Work, tail: List<&2, Work>, hit: Bool) -> List<&2, Work>:
  match hit:
    case True{}:
      next <> tail
    case False{}:
      item <> tail

def replace_work_kind(+operation: Nat, +kind: WorkKind, items: List<&2, Work>) -> List<&2, Work>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Work{partition, lifetime, round, current, charge, _, parent}:
          replace_work_kind_pick(item,
            Work{partition, lifetime, round, current, charge, kind, parent},
            replace_work_kind(operation, kind, rest), Nat.is_eq(current, operation))

def observation_started_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch, +collection, +history}
        Some{Work{_, _, _, _, 0n, AwaitingSourceRead{}, _}}:
      Advanced{State{ledger, rounds, replace_work_kind(operation, SourceReading{}, work),
        next_round, next_operation, admissions, dispatch, collection, history}, ObservationStarted{} <> Nil{}}
    case _ _:
      Rejected{state, WrongStage{}}

def observation_completed_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch, +collection, +history}
        Some{Work{_, _, _, _, 0n, SourceReading{}, _}}:
      Advanced{State{ledger, rounds, remove_work(operation, work),
        next_round, next_operation, admissions, dispatch, collection, history}, ObservationCompleted{} <> Nil{}}
    case _ _:
      Rejected{state, WrongStage{}}

# TODO: StartObservation accepts AwaitingSourceRead work without checking for a matching
# running dispatch. The resident emits this event from a started dispatch job.
# Decide whether Bend must enforce that link or admit and schedule atomically.
def start_observation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      observation_started_found(state, observation,
        find_work(partition, lifetime, round, observation, work))

def complete_observation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      observation_completed_found(state, observation,
        find_work(partition, lifetime, round, observation, work))

def interrupt_observation_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch, +collection, +history}
        Some{Work{_, _, _, _, 0n, AwaitingSourceRead{}, _}}:
      Advanced{State{ledger, rounds, remove_work(operation, work),
        next_round, next_operation, admissions, dispatch, collection, history}, ObservationInterrupted{} <> Nil{}}
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch, +collection, +history}
        Some{Work{_, _, _, _, 0n, SourceReading{}, _}}:
      Advanced{State{ledger, rounds, remove_work(operation, work),
        next_round, next_operation, admissions, dispatch, collection, history}, ObservationInterrupted{} <> Nil{}}
    case _ _:
      Rejected{state, WrongStage{}}

def interrupt_observation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      interrupt_observation_found(state, observation,
        find_work(partition, lifetime, round, observation, work))

def begin_result(state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +parent: Nat, result: Ledger.LedgerResult) -> Step:
  match state:
    case State{_, rounds, work, next_round, +next_operation, +admissions, +dispatch, +collection, +history}:
      match result:
        case Ledger.Granted{ledger, +charge}:
          Advanced{State{ledger, rounds,
            List.append(&2, Work, work, Work{partition, lifetime, round,
              next_operation, charge, Preparing{}, parent} <> Nil{}),
            next_round, (next_operation + 1n : Nat), admissions, dispatch, collection, history},
            Prepare{next_operation, charge} <> Nil{}}
        case Ledger.Rejected{_}:
          Advanced{state, PreparationRefused{} <> Nil{}}

def begin_found(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +bytes: Nat, +parent: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Some{+current}:
      Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
        Bool.and(Bool.not(is_deciding(current)), Nat.is_gt(bytes, 0n))),
        begin_result(state, partition, lifetime, round, parent,
          Ledger.reserve_for(ledger, partition, bytes, Ledger.Preparation{})),
        Rejected{state, StaleRound{}})
    case _ None{}:
      Rejected{state, StaleRound{}}

def begin(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat, +bytes: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      begin_found(state, partition, lifetime, round, bytes, 0n, find_round(partition, rounds))

def begin_observed_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat, +bytes: Nat, found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history} Some{Work{_, _, _, _, 0n, SourceReading{}, _}}:
      begin_found(state, partition, lifetime, round, bytes, observation,
        find_round(partition, rounds))
    case _ _:
      Rejected{state, WrongStage{}}

def begin_observed(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat, +bytes: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      begin_observed_found(state, partition, lifetime, round, observation, bytes,
        find_work(partition, lifetime, round, observation, work))

type Batch is Data:
  Batch{ledger: Ledger.Ledger, work: List<&2, Work>,
    +next_operation: Nat, commands: List<&2, Command>}

def capacity_view(ledger: Ledger.Ledger, +partition: Nat) -> CapacityView:
  match ledger:
    case Ledger.Ledger{limits, next_id, +charges}:
      CapacityView{Ledger.total(charges), Ledger.partition_usage(charges, partition), charges}

def admit_one(result: Ledger.LedgerResult, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +position: Nat, +bytes: Nat, +parent: Nat,
    work: List<&2, Work>, commands: List<&2, Command>) -> Batch:
  match result:
    case Ledger.Granted{+granted, +id}:
      Batch{granted,
        Work{partition, lifetime, round, operation, id, Reviewing{}, parent} <> work,
        (operation + 1n : Nat),
        List.append(&2, Command, commands,
          UnitAdmitted{operation, id, position, bytes,
            capacity_view(granted, partition)} <> Nil{})}
    case Ledger.Rejected{+unchanged}:
      Batch{unchanged, work, operation,
        List.append(&2, Command, commands,
          UnitRefused{position, bytes, Ledger.admission(unchanged, partition, bytes),
            capacity_view(unchanged, partition)} <> Nil{})}

# Continue after refusal: a later, smaller unit may still fit.
def admit_units(sizes: List<&2, Nat>, batch: Batch, +partition: Nat,
    +lifetime: Nat, +round: Nat, +position: Nat, +parent: Nat) -> Batch:
  match sizes:
    case Nil{}:
      batch
    case +size <> rest:
      match batch:
        case Batch{ledger, work, operation, commands}:
          admit_units(rest,
            admit_one(Ledger.reserve_for(ledger, partition, size, Ledger.ReviewUnit{}), partition,
              lifetime, round, operation, position, size, parent, work, commands),
            partition, lifetime, round, (position + 1n : Nat), parent)

def prepared_batch(state: State, +operation: Nat, +charge: Nat,
    +partition: Nat, released: Ledger.Ledger, batch: Batch) -> Step:
  match state batch:
    case State{_, rounds, work, next_round, _, +admissions, +dispatch, +collection, +history} Batch{ledger, units, next, commands}:
      Advanced{State{ledger, rounds,
        List.append(&2, Work, remove_work(operation, work), units), next_round, next, admissions, dispatch, collection, history},
        PreparationReleased{charge, capacity_view(released, partition)} <> commands}

def prepared_released(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +charge: Nat, +parent: Nat, bytes: List<&2, Nat>,
    result: Ledger.LedgerResult) -> Step:
  match state bytes result:
    case _ _ Ledger.Rejected{_}:
      Rejected{state, InconsistentLedger{}}
    case State{_, _, _, _, next_operation, _, +dispatch, +collection, +history} Nil{} Ledger.Granted{+released, _}:
      prepared_batch(state, operation, charge, partition, released,
        Batch{released, Nil{}, next_operation, Nil{}})
    case State{_, _, _, _, next_operation, _, +dispatch, +collection, +history} +size <> +rest Ledger.Granted{+released, _}:
      prepared_batch(state, operation, charge, partition, released,
        admit_units(size <> rest, Batch{released, Nil{}, next_operation, Nil{}},
          partition, lifetime, round, 1n, parent))

def prepared_release(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +charge: Nat, +parent: Nat, bytes: List<&2, Nat>) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history}:
      prepared_released(state, partition, lifetime, round, operation, charge, parent,
        bytes, Ledger.release(ledger, charge))

def prepared_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, bytes: List<&2, Nat>,
    found_round: Maybe<&2, Round>, found_work: Maybe<&2, Work>) -> Step:
  match found_round found_work:
    case Some{current} Some{Work{_, _, _, _, charge, Preparing{}, parent}}:
      Bool.pick(Step, same_round(partition, lifetime, round, current),
        prepared_release(state, partition, lifetime, round, operation, charge, parent, bytes),
        Rejected{state, StaleRound{}})
    case _ _:
      Rejected{state, StaleOperation{}}

def prepared(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +operation: Nat, bytes: List<&2, Nat>) -> Step:
  match state:
    case State{_, +rounds, +work, _, _, _, +dispatch, +collection, +history}:
      prepared_found(state, partition, lifetime, round, operation, bytes,
        find_round(partition, rounds),
        find_work(partition, lifetime, round, operation, work))

def interrupt_preparation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  prepared(state, partition, lifetime, round, operation, Nil{})

def start_review_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch, +collection, +history}
        Some{Work{_, _, _, _, _, Reviewing{}, _}}:
      Advanced{state, ReviewStarted{} <> Nil{}}
    case _ _:
      Rejected{state, WrongStage{}}

def start_review(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      start_review_found(state, operation,
        find_work(partition, lifetime, round, operation, work))

def reviewed_released(+state: State, +operation: Nat, outcome: Outcome,
    +charge: Nat, result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history} Ledger.Granted{updated, _}:
      Advanced{State{updated, rounds, remove_work(operation, work),
        next_round, next_operation, admissions, dispatch, collection, history},
        ReservationReleased{charge} <> ReviewRecorded{outcome} <> Nil{}}
    case _ Ledger.Rejected{_}:
      Rejected{state, InconsistentLedger{}}

def reviewed_retained_result(+state: State, +operation: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history}
        Ledger.Granted{updated, _}:
      Advanced{State{updated, rounds,
        replace_work_kind(operation, PendingFinding{1n}, work),
        next_round, next_operation, admissions, dispatch, collection, history},
        ReviewRecorded{Finding{}} <> Nil{}}
    case _ Ledger.Rejected{_}:
      Rejected{state, InconsistentLedger{}}

def reviewed_retained_charge(+state: State, +operation: Nat, +charge: Nat,
    found: Maybe<&2, Ledger.Charge>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Some{Ledger.Charge{_, _, bytes, _}}:
      reviewed_retained_result(state, operation,
        Ledger.resize_for(ledger, charge, bytes, Ledger.StoredResult{}))
    case _ _:
      Rejected{state, InconsistentLedger{}}

def reviewed_retained_find(+state: State, +operation: Nat, +charge: Nat,
    ledger: Ledger.Ledger) -> Step:
  match ledger:
    case Ledger.Ledger{_, _, charges}:
      reviewed_retained_charge(state, operation, charge, Ledger.find(charge, charges))

def reviewed_decide(+state: State, +operation: Nat, +charge: Nat,
    +parent: Nat, outcome: Outcome) -> Step:
  match state outcome:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Finding{}:
      Bool.pick(Step, Nat.is_gt(parent, 0n),
        reviewed_retained_find(state, operation, charge, ledger),
        reviewed_released(state, operation, Finding{}, charge,
          Ledger.release(ledger, charge)))
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Clear{}:
      reviewed_released(state, operation, Clear{}, charge, Ledger.release(ledger, charge))
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Unavailable{}:
      reviewed_released(state, operation, Unavailable{}, charge, Ledger.release(ledger, charge))
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Interrupted{}:
      reviewed_released(state, operation, Interrupted{}, charge, Ledger.release(ledger, charge))
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Discarded{}:
      reviewed_released(state, operation, Discarded{}, charge, Ledger.release(ledger, charge))

def reviewed_found(+state: State, +operation: Nat, outcome: Outcome,
    found: Maybe<&2, Work>) -> Step:
  match found:
    case Some{Work{_, _, _, _, charge, Reviewing{}, parent}}:
      reviewed_decide(state, operation, charge, parent, outcome)
    case Some{Work{_, _, _, _, charge, AtJev{}, parent}}:
      reviewed_decide(state, operation, charge, parent, outcome)
    case _:
      Rejected{state, StaleOperation{}}

def reviewed(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +operation: Nat, outcome: Outcome) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      reviewed_found(state, operation, outcome,
        find_work(partition, lifetime, round, operation, work))

def retire_review_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history}
        Some{Work{_, _, _, _, +charge, PendingFinding{_}, _}}:
      reviewed_released(state, operation, Discarded{}, charge,
        Ledger.release(ledger, charge))
    case _ _:
      Rejected{state, StaleOperation{}}

def retire_review(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      retire_review_found(state, operation,
        find_work(partition, lifetime, round, operation, work))

def finding_count_found(+state: State, operation: Nat, +count: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation,
        admissions, dispatch, collection, +history}
        Some{Work{_, _, _, _, _, PendingFinding{_}, _}}:
      Bool.pick(Step, Nat.is_gt(count, 0n),
        Advanced{State{ledger, rounds,
          replace_work_kind(operation, PendingFinding{count}, work),
          next_round, next_operation, admissions, dispatch, collection, history},
          FindingCountRecorded{} <> Nil{}},
        Rejected{state, WrongStage{}})
    case _ _:
      Rejected{state, WrongStage{}}

def finding_count_update(+state: State, partition: Nat, lifetime: Nat,
    round: Nat, +operation: Nat, count: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, _, _, +history}:
      finding_count_found(state, operation, count,
        find_work(partition, lifetime, round, operation, work))

def append_review_disposition(step: Step, command: Command) -> Step:
  match step:
    case Advanced{state, commands}:
      Advanced{state, List.append(&2, Command, commands, command <> Nil{})}
    case Rejected{state, reason}:
      Rejected{state, reason}

def reviewed_stale_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history}
        Some{Work{_, _, _, _, +charge, Reviewing{}, _}}:
      reviewed_released(state, operation, Finding{}, charge, Ledger.release(ledger, charge))
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history}
        Some{Work{_, _, _, _, +charge, AtJev{}, _}}:
      reviewed_released(state, operation, Finding{}, charge, Ledger.release(ledger, charge))
    case _ _:
      Rejected{state, StaleOperation{}}

def reviewed_stale(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      reviewed_stale_found(state, operation,
        find_work(partition, lifetime, round, operation, work))

def review_observed_choice(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, outcome: Outcome,
    choice: WorkPolicy.EvaluatedDisposition) -> Step:
  match choice:
    case WorkPolicy.RetainFinding{}:
      append_review_disposition(reviewed(state, partition, lifetime, round,
        operation, outcome), RetainFinding{})
    case WorkPolicy.RetireStaleFinding{}:
      append_review_disposition(reviewed_stale(state, partition, lifetime, round,
        operation), RetireStaleFinding{})
    case WorkPolicy.SettleClear{}:
      append_review_disposition(reviewed(state, partition, lifetime, round,
        operation, outcome), SettleClear{})
    case WorkPolicy.SettleStaleClear{}:
      append_review_disposition(reviewed(state, partition, lifetime, round,
        operation, outcome), SettleStaleClear{})

def is_finding(outcome: Outcome) -> Bool:
  match outcome:
    case Finding{}:
      True{}
    case _:
      False{}

def review_observed(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +outcome: Outcome, current_work: Bool) -> Step:
  review_observed_choice(state, partition, lifetime, round, operation, outcome,
    WorkPolicy.evaluated_disposition(is_finding(outcome), current_work))

def request_outcome_valid(outcome: RequestOutcome, started: Bool,
    interrupted: Bool) -> Bool:
  match outcome:
    case NeverSent{}: Bool.not(started)
    case RequestInterrupted{}: Bool.and(started, interrupted)
    case _: started

def request_settled_outcome(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +outcome: RequestOutcome,
    current_work: Bool) -> Step:
  match outcome:
    case RequestFinding{}:
      append_review_disposition(review_observed(state, partition, lifetime,
        round, operation, Finding{}, current_work),
        JevRequestOutcomeRecorded{RequestFinding{}})
    case RequestClear{}:
      append_review_disposition(review_observed(state, partition, lifetime,
        round, operation, Clear{}, current_work),
        JevRequestOutcomeRecorded{RequestClear{}})
    case RequestInterrupted{}:
      append_review_disposition(reviewed(state, partition, lifetime, round,
        operation, Interrupted{}),
        JevRequestOutcomeRecorded{RequestInterrupted{}})
    case _:
      append_review_disposition(reviewed(state, partition, lifetime, round,
        operation, Unavailable{}), JevRequestOutcomeRecorded{outcome})

def request_settled_work(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, outcome: RequestOutcome, current_work: Bool,
    found: Maybe<&2, Work>) -> Step:
  match found:
    case Some{Work{_, _, _, _, _, AtJev{}, _}}:
      request_settled_outcome(state, partition, lifetime, round, operation,
        outcome, current_work)
    case _:
      Advanced{state, JevObservationIgnored{} <> Nil{}}

def request_settled_released(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, outcome: RequestOutcome, current_work: Bool,
    result: Dispatch.RequestResult) -> Step:
  match state result:
    case State{ledger, rounds, work, next_round, next_operation, admissions, _, collection, +history}
        Dispatch.RequestAccepted{dispatch}:
      request_settled_work(State{ledger, rounds, work, next_round, next_operation,
        admissions, dispatch, collection, history}, partition, lifetime, round, operation,
        outcome, current_work,
        find_work(partition, lifetime, round, operation, work))
    case _ Dispatch.RequestDenied{_}:
      Rejected{state, StaleOperation{}}

def request_settled_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat, +outcome: RequestOutcome,
    current_work: Bool, found: Maybe<&2, Dispatch.Request>) -> Step:
  match state found:
    case State{_, _, _, _, _, _, dispatch, _, +history}
        Some{Dispatch.Request{_, _, _, _, _, started, interrupted}}:
      Bool.pick(Step, request_outcome_valid(outcome, started, interrupted),
        request_settled_released(state, partition, lifetime, round, operation,
          outcome, current_work, Dispatch.request_update(dispatch, partition,
            lifetime, round, operation, request, False{}, False{}, True{})),
        Rejected{state, WrongStage{}})
    case _ _: Rejected{state, StaleOperation{}}

def request_settled(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat, outcome: RequestOutcome,
    current_work: Bool) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch, _, +history}:
      match dispatch:
        case Dispatch.State{_, _, _, _, requests}:
          request_settled_found(state, partition, lifetime, round, operation,
            request, outcome, current_work,
            Dispatch.request_phase(requests, partition, lifetime, round,
              operation, request))

def request_facts_ready(root_valid: Bool, configuration_valid: Bool,
    credential_ready: Bool, selected: Bool, current_work: Bool,
    physical_available: Bool) -> Bool:
  Bool.and(root_valid, Bool.and(configuration_valid,
    Bool.and(credential_ready, Bool.and(selected,
      Bool.and(current_work, physical_available)))))

def request_ready_reserved(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat,
    result: Dispatch.RequestResult) -> Step:
  match state result:
    case State{ledger, rounds, work, next_round, next_operation, admissions, _, collection, +history}
        Dispatch.RequestAccepted{dispatch}:
      Advanced{State{ledger, rounds, replace_work_kind(operation, AtJev{}, work),
        next_round, (next_operation + 1n : Nat), admissions, dispatch, collection, history},
        JevRequestIssued{partition, lifetime, round, operation, request} <> Nil{}}
    case _ Dispatch.RequestDenied{_}:
      append_review_disposition(reviewed(state, partition, lifetime, round,
        operation, Unavailable{}), JevRequestUnavailable{})

def request_ready_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, ready: Bool,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{_, _, _, _, next_operation, _, dispatch, _, +history}
        Some{Work{_, _, _, _, _, Reviewing{}, _}}:
      Bool.pick(Step, ready,
        request_ready_reserved(state, partition, lifetime, round, operation,
          next_operation, Dispatch.reserve_request(dispatch, partition, lifetime,
            round, operation, next_operation)),
        append_review_disposition(reviewed(state, partition, lifetime, round,
          operation, Unavailable{}), JevRequestUnavailable{}))
    case _ _: Rejected{state, WrongStage{}}

def request_ready(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, root_valid: Bool,
    configuration_valid: Bool, credential_ready: Bool, selected: Bool,
    current_work: Bool, physical_available: Bool) -> Step:
  match state:
    case State{_, _, work, _, _, _, _, _, +history}:
      request_ready_found(state, partition, lifetime, round, operation,
        request_facts_ready(root_valid, configuration_valid,
          credential_ready, selected, current_work, physical_available),
        find_work(partition, lifetime, round, operation, work))

def request_update_result(+state: State, result: Dispatch.RequestResult,
    command: Command) -> Step:
  match state result:
    case State{ledger, rounds, work, next_round, next_operation, admissions, _, collection, +history}
        Dispatch.RequestAccepted{dispatch}:
      Advanced{State{ledger, rounds, work, next_round, next_operation,
        admissions, dispatch, collection, history}, command <> Nil{}}
    case _ Dispatch.RequestDenied{_}:
      Rejected{state, StaleOperation{}}

def request_started(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch, _, +history}:
      request_update_result(state, Dispatch.request_update(dispatch, partition,
        lifetime, round, operation, request, True{}, False{}, False{}),
        JevRequestStartRecorded{})

def request_interrupted(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch, _, +history}:
      request_update_result(state, Dispatch.request_update(dispatch, partition,
        lifetime, round, operation, request, False{}, True{}, False{}),
        JevInterruptionRecorded{})

def prepared_offer_result(state: State, decision: WorkPolicy.PreparedOffer) -> Step:
  match decision:
    case WorkPolicy.SkipPrepared{}:
      Advanced{state, PreparedSkipped{} <> Nil{}}
    case WorkPolicy.AdmitPrepared{}:
      Advanced{state, PreparedAdmitted{} <> Nil{}}
    case WorkPolicy.RejectPreparedCapacity{}:
      Advanced{state, PreparedCapacityRefused{} <> Nil{}}

def prepared_offer_check(state: State, ready: Bool, within_frame: Bool) -> Step:
  prepared_offer_result(state, WorkPolicy.prepared_offer(ready, within_frame))

def empty_prepared_result(state: State, decision: WorkPolicy.EmptyPrepared) -> Step:
  match decision:
    case WorkPolicy.FailEmptyLost{}:
      Advanced{state, EmptyLost{} <> Nil{}}
    case WorkPolicy.NoEmptyFailure{}:
      Advanced{state, EmptyAccepted{} <> Nil{}}

def empty_prepared_check(state: State, ready_count: Nat,
    has_non_skipped: Bool, authority_bound: Bool) -> Step:
  empty_prepared_result(state,
    WorkPolicy.empty_prepared(ready_count, has_non_skipped, authority_bound))

def review_failure_result(state: State, decision: WorkPolicy.FailureDisposition) -> Step:
  match decision:
    case WorkPolicy.BackendUnavailable{}:
      Advanced{state, FailureBackend{} <> Nil{}}
    case WorkPolicy.CredentialUnavailable{}:
      Advanced{state, FailureCredential{} <> Nil{}}
    case WorkPolicy.LostUnavailable{}:
      Advanced{state, FailureLost{} <> Nil{}}
    case WorkPolicy.NoFailure{}:
      Advanced{state, FailureNone{} <> Nil{}}

def review_failure_check(state: State, backend_or_timeout: Bool,
    credential: Bool, missing: Bool) -> Step:
  review_failure_result(state,
    WorkPolicy.failure_disposition(backend_or_timeout, credential, missing))

def scope_matches(scope: StopScope, +partition: Nat, +round: Nat) -> Bool:
  match scope:
    case StopScope{owner, current}:
      Bool.and(Nat.is_eq(owner, partition), Nat.is_eq(current, round))

def scope_contains(scopes: List<&2, StopScope>, +partition: Nat, +round: Nat) -> Bool:
  match scopes:
    case Nil{}:
      False{}
    case +scope <> rest:
      Bool.or(scope_matches(scope, partition, round),
        scope_contains(rest, partition, round))

def scope_partition_seen(scopes: List<&2, StopScope>, +partition: Nat) -> Bool:
  match scopes:
    case Nil{}:
      False{}
    case StopScope{owner, _} <> rest:
      Bool.or(Nat.is_eq(owner, partition), scope_partition_seen(rest, partition))

def scope_round_valid(found: Maybe<&2, Round>, partition: Nat,
    lifetime: Nat, round: Nat) -> Bool:
  match found:
    case Some{+current}:
      Bool.and(same_round(partition, lifetime, round, current),
        Bool.not(is_deciding(current)))
    case None{}:
      False{}

def valid_stop_scopes(+rounds: List<&2, Round>, +lifetime: Nat,
    scopes: List<&2, StopScope>) -> Bool:
  match scopes:
    case Nil{}:
      True{}
    case StopScope{+partition, round} <> +rest:
      Bool.and(Bool.not(scope_partition_seen(rest, partition)),
        Bool.and(scope_round_valid(find_round(partition, rounds), partition, lifetime, round),
          valid_stop_scopes(rounds, lifetime, rest)))

def end_scope_valid(found: Maybe<&2, Round>, partition: Nat,
    lifetime: Nat, round: Nat) -> Bool:
  match found:
    case Some{current}:
      same_round(partition, lifetime, round, current)
    case None{}:
      False{}

def valid_end_scopes(+rounds: List<&2, Round>, +lifetime: Nat,
    scopes: List<&2, StopScope>) -> Bool:
  match scopes:
    case Nil{}:
      True{}
    case StopScope{+partition, round} <> +rest:
      Bool.and(Bool.not(scope_partition_seen(rest, partition)),
        Bool.and(end_scope_valid(find_round(partition, rounds), partition, lifetime, round),
          valid_end_scopes(rounds, lifetime, rest)))

def scoped_pending(items: List<&2, Work>, +lifetime: Nat,
    +scopes: List<&2, StopScope>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Work{partition, generation, round, _, _, kind, _} <> rest:
      Bool.or(Bool.and(Nat.is_eq(generation, lifetime),
          Bool.and(scope_contains(scopes, partition, round), unfinished(kind))),
        scoped_pending(rest, lifetime, scopes))

def mark_stop_rounds_hit(item: Round, tail: List<&2, Round>,
    waiting: Bool, deciding: Bool) -> List<&2, Round>:
  match item:
    case Round{partition, generation, current, _, _, write, uncertain, +quiet_since}:
      Round{partition, generation, current, waiting, deciding, write, uncertain, quiet_since} <> tail

def mark_stop_rounds_one(item: Round, tail: List<&2, Round>, hit: Bool,
    waiting: Bool, deciding: Bool) -> List<&2, Round>:
  match hit:
    case True{}:
      mark_stop_rounds_hit(item, tail, waiting, deciding)
    case False{}:
      item <> tail

def mark_stop_rounds(items: List<&2, Round>, +group: Nat,
    +lifetime: Nat, +round: Nat, +scopes: List<&2, StopScope>,
    +waiting: Bool, +deciding: Bool) -> List<&2, Round>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Round{partition, generation, current, _, _, _, _, +quiet_since}:
          mark_stop_rounds_one(item,
            mark_stop_rounds(rest, group, lifetime, round, scopes, waiting, deciding),
            Bool.and(Nat.is_eq(generation, lifetime),
              Bool.or(same_round(group, lifetime, round, item),
                scope_contains(scopes, partition, current))), waiting, deciding)

def release_scoped_charges(items: List<&2, Work>, +ledger: Ledger.Ledger,
    +lifetime: Nat, +scopes: List<&2, StopScope>) -> Ledger.Ledger:
  match items:
    case Nil{}:
      ledger
    case Work{partition, generation, round, _, +charge, kind, _} <> rest:
      release_scoped_charges(rest,
        Bool.pick(Ledger.Ledger,
          Bool.and(Nat.is_gt(charge, 0n),
            Bool.and(Nat.is_eq(generation, lifetime),
              Bool.and(scope_contains(scopes, partition, round), unfinished(kind)))),
          release_charge(ledger, charge), ledger), lifetime, scopes)

def retain_scoped_work(items: List<&2, Work>, +lifetime: Nat,
    +scopes: List<&2, StopScope>) -> List<&2, Work>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Work{partition, generation, round, _, _, kind, _}:
          retain_work_pick(item, retain_scoped_work(rest, lifetime, scopes),
            Bool.and(Nat.is_eq(generation, lifetime),
              Bool.and(scope_contains(scopes, partition, round), unfinished(kind))))

def release_scoped_commands(items: List<&2, Work>, +lifetime: Nat,
    +scopes: List<&2, StopScope>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case Work{partition, generation, round, _, +charge, kind, _} <> rest:
      release_pick(charge, release_scoped_commands(rest, lifetime, scopes),
        Bool.and(Nat.is_gt(charge, 0n),
          Bool.and(Nat.is_eq(generation, lifetime),
            Bool.and(scope_contains(scopes, partition, round), unfinished(kind)))))

def dispatch_work_unfinished(found: Maybe<&2, Work>) -> Bool:
  match found:
    case Some{Work{_, _, _, _, _, kind, _}}:
      unfinished(kind)
    case None{}:
      False{}

def cancel_dispatch_entries(items: List<&2, Dispatch.Entry>, +work: List<&2, Work>,
    +lifetime: Nat, +scopes: List<&2, StopScope>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case Dispatch.Entry{+partition, +generation, +round, +operation, _, cancelled, _} <> rest:
      cancel_pick(operation, cancel_dispatch_entries(rest, work, lifetime, scopes),
        Bool.and(Bool.not(cancelled), Bool.and(Nat.is_eq(generation, lifetime),
          Bool.and(scope_contains(scopes, partition, round),
            dispatch_work_unfinished(find_work(partition, generation, round, operation, work))))))

def cancel_scoped_dispatch(dispatch: Dispatch.State, +work: List<&2, Work>, +lifetime: Nat,
    +scopes: List<&2, StopScope>) -> List<&2, Command>:
  match dispatch:
    case Dispatch.State{queued, running, _, _, _}:
      List.append(&2, Command, cancel_dispatch_entries(queued, work, lifetime, scopes),
        cancel_dispatch_entries(running, work, lifetime, scopes))

def stop_group_wait(+state: State, +group: Nat, +lifetime: Nat,
    +round: Nat, scopes: List<&2, StopScope>) -> Step:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, admissions, dispatch, +collection, +history}:
      Advanced{State{ledger, mark_stop_rounds(rounds, group, lifetime, round,
        scopes, True{}, False{}), work, next_round, next_operation, admissions, dispatch, collection, history},
        WaitForWork{} <> Nil{}}

def stop_group_ready(+state: State, +group: Nat, +lifetime: Nat,
    +round: Nat, +scopes: List<&2, StopScope>, continuations: Nat) -> Step:
  match state:
    case State{ledger, rounds, +work, next_round, next_operation, admissions, +dispatch, +collection, +history}:
      Advanced{State{release_scoped_charges(work, ledger, lifetime, scopes),
        mark_stop_rounds(rounds, group, lifetime, round, scopes, False{}, True{}),
        retain_scoped_work(work, lifetime, scopes), next_round, next_operation,
        admissions, dispatch, collection, history},
        List.append(&2, Command, release_scoped_commands(work, lifetime, scopes),
          List.append(&2, Command, cancel_scoped_dispatch(dispatch, work, lifetime, scopes),
            Bool.pick(Command, Nat.is_lt(continuations, 4n),
              FinishReady{}, FinishLimit{}) <> Nil{}))}

def stop_group_checked(+state: State, +group: Nat, +lifetime: Nat,
    +round: Nat, +scopes: List<&2, StopScope>, deadline: Bool,
    extra_pending: Bool, continuations: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{_, rounds, work, _, _, _, _, +collection, +history} Some{+current}:
      Bool.pick(Step,
        Bool.and(same_round(group, lifetime, round, current),
          Bool.and(Bool.not(is_deciding(current)),
            valid_stop_scopes(rounds, lifetime, scopes))),
        Bool.pick(Step,
          Bool.and(Bool.not(deadline),
            Bool.or(extra_pending, scoped_pending(work, lifetime, scopes))),
          stop_group_wait(state, group, lifetime, round, scopes),
          stop_group_ready(state, group, lifetime, round, scopes, continuations)),
        Rejected{state, StaleRound{}})
    case _ _:
      Rejected{state, StaleRound{}}

def stop_group(+state: State, +group: Nat, +lifetime: Nat, +round: Nat,
    +scopes: List<&2, StopScope>, deadline: Bool, extra_pending: Bool,
    continuations: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, _, +collection, +history}:
      stop_group_checked(state, group, lifetime, round, scopes, deadline,
        extra_pending, continuations, find_round(group, rounds))

def stop_group_end_apply(state: State, group: Nat, lifetime: Nat,
    round: Nat, scopes: List<&2, StopScope>) -> Step:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, admissions, dispatch, +collection, +history}:
      Advanced{State{ledger, mark_stop_rounds(rounds, group, lifetime, round,
        scopes, False{}, False{}), work, next_round, next_operation, admissions,
        dispatch, collection, history}, StopEnded{} <> Nil{}}

def stop_group_end_valid(+state: State, group: Nat, lifetime: Nat,
    round: Nat, scopes: List<&2, StopScope>, valid: Bool) -> Step:
  Bool.pick(Step, valid, stop_group_end_apply(state, group, lifetime, round, scopes),
    Rejected{state, StaleRound{}})

def stop_group_end_checked(+state: State, +group: Nat, +lifetime: Nat,
    +round: Nat, +scopes: List<&2, StopScope>, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{_, rounds, _, _, _, _, _, +collection, +history} Some{current}:
      stop_group_end_valid(state, group, lifetime, round, scopes,
        Bool.and(same_round(group, lifetime, round, current),
          valid_end_scopes(rounds, lifetime, scopes)))
    case _ _:
      Rejected{state, StaleRound{}}

def stop_group_end(+state: State, +group: Nat, +lifetime: Nat, +round: Nat,
    scopes: List<&2, StopScope>) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, _, +collection, +history}:
      stop_group_end_checked(state, group, lifetime, round, scopes,
        find_round(group, rounds))

def stop_ready(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, deadline: Bool, +uncertain: Bool) -> Step:
  match state:
    case State{ledger, rounds, +work, next_round, next_operation, +admissions, +dispatch, +collection, +history}:
      Advanced{State{release_unfinished_charges(work, ledger, partition, lifetime, round),
        Round{partition, lifetime, round, False{}, True{}, None{}, uncertain, None{}} <>
          remove_round(partition, rounds),
        retain_after_stop(work, partition, lifetime, round),
        next_round, next_operation, admissions, dispatch, collection, history},
        List.append(&2, Command,
          release_commands(partition, lifetime, round, work),
          List.append(&2, Command, cancel_commands(partition, lifetime, round, work),
          Bool.pick(Command, Bool.and(uncertain, Bool.not(deadline)),
            ReofferAtStop{}, FinishReady{}) <> Nil{}))}

def stop_output(+state: State, partition: Nat, lifetime: Nat, round: Nat,
    deadline: Bool, write: Maybe<&2, Nat>, uncertain: Bool) -> Step:
  match deadline write:
    case False{} Some{_}:
      Advanced{state, WaitForOutput{} <> Nil{}}
    case _ _:
      stop_ready(state, partition, lifetime, round, deadline, uncertain)

def stop_current(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +deadline: Bool, has_pending: Bool, +write: Maybe<&2, Nat>, +uncertain: Bool) -> Step:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history}:
      Bool.pick(Step, Bool.and(has_pending, Bool.not(deadline)),
        Advanced{State{ledger,
          Round{partition, lifetime, round, True{}, False{}, write, uncertain, None{}} <>
            remove_round(partition, rounds), work, next_round, next_operation, admissions, dispatch, collection, history},
          WaitForWork{} <> Nil{}},
        stop_output(state, partition, lifetime, round, deadline, write, uncertain))

def match_pending(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, deadline: Bool, current: Round) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch, +collection, +history}:
      match current:
        case Round{_, _, _, _, _, write, uncertain, +quiet_since}:
          stop_current(state, partition, lifetime, round, deadline,
            pending(partition, lifetime, round, work), write, uncertain)


def stop_found(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    deadline: Bool, found: Maybe<&2, Round>) -> Step:
  match found:
    case Some{+current}:
      Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
          Bool.not(is_deciding(current))),
        match_pending(state, partition, lifetime, round, deadline, current),
        Rejected{state, StaleRound{}})
    case None{}:
      Rejected{state, StaleRound{}}


def stop(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    deadline: Bool) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      stop_found(state, partition, lifetime, round, deadline,
        find_round(partition, rounds))


def output_start_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, +next_operation, +admissions, +dispatch, +collection, +history} Some{+current}:
      match current:
        case Round{_, _, _, waiting, deciding, None{}, uncertain, +quiet_since}:
          Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
              Bool.not(deciding)),
            Advanced{State{ledger,
              Round{partition, lifetime, round, waiting, False{},
                Some{next_operation}, uncertain, quiet_since} <> remove_round(partition, rounds),
              work, next_round, (next_operation + 1n : Nat), admissions, dispatch, collection, history},
              WriteAuthorized{next_operation} <> Nil{}},
            Rejected{state, StaleRound{}})
        case _:
          Rejected{state, StaleOperation{}}
    case _ None{}:
      Rejected{state, StaleRound{}}

def output_start(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      output_start_found(state, partition, lifetime, round, find_round(partition, rounds))

def write_is_unknown(outcome: WriteOutcome) -> Bool:
  match outcome:
    case Unknown{}:
      True{}
    case _:
      False{}

# An uncertain submission leaves advice eligible for reconsideration at Stop.
def output_terminal_current(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +outcome: WriteOutcome,
    current: Round) -> Step:
  match state current:
    case State{ledger, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history} Round{_, _, _, +waiting, +deciding, Some{+token}, _, +quiet_since}:
      Bool.pick(Step,
        Bool.and(same_round(partition, lifetime, round, current), Nat.is_eq(token, operation)),
        Advanced{State{ledger,
          Round{partition, lifetime, round, waiting, deciding, None{},
            write_is_unknown(outcome), quiet_since} <> remove_round(partition, rounds),
          work, next_round, next_operation, admissions, dispatch, collection, history},
          WriteRecorded{outcome} <> Nil{}},
        Rejected{state, StaleOperation{}})
    case _ _:
      Rejected{state, StaleOperation{}}

def output_terminal_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, outcome: WriteOutcome,
    found: Maybe<&2, Round>) -> Step:
  match found:
    case Some{current}:
      output_terminal_current(state, partition, lifetime, round, operation, outcome, current)
    case None{}:
      Rejected{state, StaleRound{}}

def output_terminal(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, outcome: WriteOutcome) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      output_terminal_found(state, partition, lifetime, round, operation,
        outcome, find_round(partition, rounds))

def retire_current(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat) -> Step:
  match state:
    case State{ledger, rounds, +work, next_round, next_operation, +admissions, +dispatch, +collection, +history}:
      Advanced{State{release_round_charges(work, ledger, partition, lifetime, round),
        remove_round(partition, rounds),
        retain_other_work(work, partition, lifetime, round),
        next_round, next_operation, admissions, dispatch,
        CollectionState.retire_round(collection, partition, round), history},
        List.append(&2, Command,
          release_all_commands(partition, lifetime, round, work),
          List.append(&2, Command,
            cancel_commands(partition, lifetime, round, work),
            PartitionRetired{round} <> Nil{}))}

def retire_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, found: Maybe<&2, Round>) -> Step:
  match found:
    case Some{current}:
      Bool.pick(Step, same_round(partition, lifetime, round, current),
        retire_current(state, partition, lifetime, round),
        Rejected{state, StaleRound{}})
    case None{}:
      Rejected{state, StaleRound{}}

def retire(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch, +collection, +history}:
      retire_found(state, partition, lifetime, round, find_round(partition, rounds))

def capacity_reserve_result(state: State, +partition: Nat, +bytes: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history} Ledger.Granted{+ledger, id}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch, collection, history},
        CapacityGranted{id, capacity_view(ledger, partition)} <> Nil{}}
    case _ Ledger.Rejected{+ledger}:
      Advanced{state, CapacityRefused{Ledger.admission(ledger, partition, bytes),
        capacity_view(ledger, partition)} <> Nil{}}

def capacity_reserve(+state: State, +partition: Nat, +bytes: Nat,
    purpose: Ledger.Purpose) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history}:
      capacity_reserve_result(state, partition, bytes,
        Ledger.reserve_for(ledger, partition, bytes, purpose))

def capacity_resize_result(state: State, +id: Nat, +partition: Nat, +bytes: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history} Ledger.Granted{+ledger, _}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch, collection, history},
        CapacityResized{id, capacity_view(ledger, partition)} <> Nil{}}
    case State{_, _, _, _, _, _, +dispatch, +collection, +history} Ledger.Rejected{+ledger}:
      match ledger:
        case Ledger.Ledger{limits, next_id, charges}:
          +others : Ledger.Ledger = Ledger.Ledger{limits, next_id, Ledger.remove(id, charges)}
          Advanced{state, CapacityRefused{Ledger.admission(others, partition, bytes),
            capacity_view(ledger, partition)} <> Nil{}}

def capacity_resize_found(+state: State, +id: Nat, +bytes: Nat,
    purpose: Ledger.Purpose,
    found: Maybe<&2, Ledger.Charge>) -> Step:
  match state found:
    case _ None{}:
      Rejected{state, StaleOperation{}}
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Some{Ledger.Charge{_, partition, _, _}}:
      capacity_resize_result(state, id, partition, bytes,
        Ledger.resize_for(ledger, id, bytes, purpose))

def capacity_resize(+state: State, +id: Nat, +bytes: Nat,
    purpose: Ledger.Purpose) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history}:
      match ledger:
        case Ledger.Ledger{_, _, charges}:
          capacity_resize_found(state, id, bytes, purpose, Ledger.find(id, charges))

def capacity_release_result(state: State, +id: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history} Ledger.Granted{ledger, _}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch, collection, history},
        ReservationReleased{id} <> Nil{}}
    case _ Ledger.Rejected{_}:
      Rejected{state, StaleOperation{}}

def capacity_release(+state: State, +id: Nat) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history}:
      capacity_release_result(state, id, Ledger.release(ledger, id))

type CapacityBatch is Data:
  CapacityBatch{ledger: Ledger.Ledger, commands: List<&2, Command>}

def capacity_replace_one(+partition: Nat, +position: Nat, +bytes: Nat,
    commands: List<&2, Command>, result: Ledger.LedgerResult) -> CapacityBatch:
  match result:
    case Ledger.Granted{+ledger, id}:
      CapacityBatch{ledger, List.append(&2, Command, commands,
        CapacityUnitAdmitted{id, position, bytes,
          capacity_view(ledger, partition)} <> Nil{})}
    case Ledger.Rejected{+ledger}:
      CapacityBatch{ledger, List.append(&2, Command, commands,
        CapacityUnitRefused{position, bytes,
          Ledger.admission(ledger, partition, bytes),
          capacity_view(ledger, partition)} <> Nil{})}

def capacity_replace_units(sizes: List<&2, Nat>, batch: CapacityBatch,
    +partition: Nat, +position: Nat) -> CapacityBatch:
  match sizes:
    case Nil{}:
      batch
    case +size <> rest:
      match batch:
        case CapacityBatch{ledger, commands}:
          capacity_replace_units(rest,
            capacity_replace_one(partition, position, size, commands,
              Ledger.reserve_for(ledger, partition, size, Ledger.ReviewUnit{})),
            partition, (position + 1n : Nat))

def capacity_replace_batch(state: State, +id: Nat, +partition: Nat,
    released: Ledger.Ledger, batch: CapacityBatch) -> Step:
  match state batch:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch, +collection, +history} CapacityBatch{ledger, commands}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch, collection, history},
        PreparationReleased{id, capacity_view(released, partition)} <> commands}

def capacity_replace_released(state: State, +id: Nat, +partition: Nat,
    sizes: List<&2, Nat>, result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, _, +dispatch, +collection, +history} Ledger.Granted{+released, _}:
      capacity_replace_batch(state, id, partition, released,
        capacity_replace_units(sizes, CapacityBatch{released, Nil{}}, partition, 1n))
    case _ Ledger.Rejected{_}:
      Rejected{state, StaleOperation{}}

def capacity_replace_found(+state: State, +id: Nat, sizes: List<&2, Nat>,
    found: Maybe<&2, Ledger.Charge>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history} Some{Ledger.Charge{_, partition, _, Ledger.Preparation{}}}:
      capacity_replace_released(state, id, partition, sizes,
        Ledger.release(ledger, id))
    case _ _:
      Rejected{state, StaleOperation{}}

def capacity_replace(+state: State, +id: Nat, sizes: List<&2, Nat>) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch, +collection, +history}:
      match ledger:
        case Ledger.Ledger{_, _, charges}:
          capacity_replace_found(state, id, sizes, Ledger.find(id, charges))

def dispatch_commands(items: List<&2, Dispatch.Command>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case Dispatch.Started{operation, sequence} <> rest:
      DispatchStarted{operation, sequence} <> dispatch_commands(rest)
    case Dispatch.Discarded{operation, running} <> rest:
      DispatchDiscarded{operation, running} <> dispatch_commands(rest)

def dispatch_result(state: State, result: Dispatch.DispatchResult) -> Step:
  match state result:
    case State{ledger, rounds, work, next_round, next_operation, admissions, _, +collection, +history}
        Dispatch.Advanced{dispatch, commands}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch, collection, history},
        dispatch_commands(commands)}
    case _ Dispatch.Denied{_}:
      Rejected{state, StaleOperation{}}

def work_dispatchable(found: Maybe<&2, Work>) -> Bool:
  match found:
    case Some{Work{_, _, _, _, _, AwaitingSourceRead{}, _}}:
      True{}
    case Some{Work{_, _, _, _, _, Reviewing{}, _}}:
      True{}
    case _:
      False{}

def dispatch_preparation(found: Maybe<&2, Work>) -> Bool:
  match found:
    case Some{Work{_, _, _, _, _, AwaitingSourceRead{}, _}}: True{}
    case _: False{}

def queue_dispatch(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, dispatch, +collection, +history}:
      Bool.pick(Step,
        work_dispatchable(find_work(partition, lifetime, round, operation, work)),
        dispatch_result(state, Dispatch.enqueue(dispatch, partition, lifetime, round, operation,
          dispatch_preparation(find_work(partition, lifetime, round, operation, work)))),
        Rejected{state, StaleOperation{}})

def settle_dispatch(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch, +collection, +history}:
      dispatch_result(state, Dispatch.settle(dispatch, partition, lifetime, round, operation))

def discard_dispatch(+state: State, operations: List<&2, Nat>) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch, +collection, +history}:
      dispatch_result(state, Dispatch.discard(dispatch, operations))

def close_dispatch(+state: State) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch, +collection, +history}:
      dispatch_result(state, Dispatch.close(dispatch))

def dispatch_scope_result(state: State, result: Retention.DiscardScope) -> Step:
  match result:
    case Retention.NamedOnly{}:
      Advanced{state, DiscardNamedOnly{} <> Nil{}}
    case Retention.AllUnfinished{}:
      Advanced{state, DiscardAllUnfinished{} <> Nil{}}

def dispatch_scope(state: State, named_count: Nat, cancelled_count: Nat,
    has_unnamed: Bool) -> Step:
  dispatch_scope_result(state,
    Retention.discard_scope(named_count, cancelled_count, has_unnamed))

def with_collection(state: State, replacement: CollectionState.State) -> State:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, admissions, dispatch, _, +history}:
      State{ledger, rounds, work, next_round, next_operation, admissions,
        dispatch, replacement, history}

def collection_decision(+state: State, decision: CollectionState.Decision,
    accepted: Command, refused: Command) -> Step:
  match decision:
    case CollectionState.Accepted{collection}:
      Advanced{with_collection(state, collection), accepted <> Nil{}}
    case CollectionState.Refused{_}:
      Advanced{state, refused <> Nil{}}

def unfinished_for_observation(items: List<&2, Work>, +partition: Nat,
    +lifetime: Nat, +round: Nat, +observation: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case Work{_, _, _, _, _, PendingFinding{_}, _} <> rest:
      unfinished_for_observation(rest, partition, lifetime, round, observation)
    case Work{owner, generation, current, operation, _, _, parent} <> rest:
      Bool.or(Bool.and(Nat.is_eq(owner, partition),
        Bool.and(Nat.is_eq(generation, lifetime),
          Bool.and(Nat.is_eq(current, round),
            Bool.or(Nat.is_eq(operation, observation), Nat.is_eq(parent, observation))))),
        unfinished_for_observation(rest, partition, lifetime, round, observation))

def finding_for_observation(items: List<&2, Work>, +partition: Nat,
    +lifetime: Nat, +round: Nat, +observation: Nat, +advice: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case Work{owner, generation, current, operation, _, PendingFinding{_}, parent} <> rest:
      Bool.or(Bool.and(Nat.is_eq(owner, partition),
        Bool.and(Nat.is_eq(generation, lifetime),
          Bool.and(Nat.is_eq(current, round),
            Bool.and(Nat.is_eq(operation, advice), Nat.is_eq(parent, observation))))),
        finding_for_observation(rest, partition, lifetime, round, observation, advice))
    case _ <> rest:
      finding_for_observation(rest, partition, lifetime, round, observation, advice)

def deciding_round(found: Maybe<&2, Round>, group: Nat,
    lifetime: Nat, round: Nat) -> Bool:
  match found:
    case Some{+current}:
      match current:
        case Round{_, _, _, _, deciding, _, _, +quiet_since}:
          Bool.and(deciding, same_round(group, lifetime, round, current))
    case None{}:
      False{}

def collection_ready(+state: State, +advice: Nat,
    +partition: Nat, +lifetime: Nat, +round: Nat, +observation: Nat,
    joined_pending: Bool) -> Step:
  match state:
    case State{_, rounds, work, _, _, _, _, collection, +history}:
      collection_decision(state,
        CollectionState.mark_ready(collection, advice,
          Bool.and(finding_for_observation(work, partition, lifetime, round, observation, advice),
            Collection.eligible(deciding_round(find_round(partition, rounds),
                partition, lifetime, round),
              Bool.not(Bool.or(joined_pending,
                unfinished_for_observation(work, partition, lifetime, round, observation)))))),
        CollectionEligible{}, CollectionWaiting{})

def collection_credential_result(state: State,
    decision: Collection.CredentialDisposition) -> Step:
  match decision:
    case Collection.RetireAdvice{}:
      Advanced{state, CollectionRetireCredential{} <> Nil{}}
    case Collection.RetainAdvice{}:
      Advanced{state, CollectionRetainCredential{} <> Nil{}}

def collection_candidate(state: State, same_partition: Bool, unleased: Bool,
    has_unsuppressed: Bool, authority_owns: Bool) -> Step:
  Advanced{state, Bool.pick(Command,
    Delivery.advice_candidate(same_partition, unleased, has_unsuppressed, authority_owns),
    CollectionCandidate{}, CollectionSkip{}) <> Nil{}}

def collection_order_result(state: State, order: Collection.Order) -> Step:
  match order:
    case Collection.Before{}:
      Advanced{state, CollectionBefore{} <> Nil{}}
    case Collection.Equal{}:
      Advanced{state, CollectionEqual{} <> Nil{}}
    case Collection.After{}:
      Advanced{state, CollectionAfter{} <> Nil{}}

def collection_expiry(state: State, elapsed: Nat, lifetime: Nat) -> Step:
  Advanced{state, Bool.pick(Command, Collection.expired(elapsed, lifetime),
    CollectionExpired{}, CollectionCurrent{}) <> Nil{}}

def collection_fit(state: State, items: Nat, bytes: Nat) -> Step:
  Advanced{state, Bool.pick(Command, Handoff.fits_batch(items, bytes),
    CollectionFits{}, CollectionLimited{}) <> Nil{}}

def collection_finding_result(state: State, current: Bool, oversized: Bool,
    fits: Bool) -> Step:
  Advanced{state, Bool.pick(Command, Bool.not(current), CollectionFindingExpired{},
    Bool.pick(Command, oversized, CollectionFindingLimited{},
      Bool.pick(Command, fits, CollectionFindingSelected{},
        CollectionFindingRetained{}))) <> Nil{}}

def collection_finding(state: State, selection_partition: Nat,
    selection_round: Nat, unit: Nat, partition: Nat, round: Nat,
    snapshot: Nat, current_snapshot: Nat, credential: Nat,
    current_credential: Nat, age_ms: Nat, +solo_bytes: Nat,
    collection_ready: Bool, selected_count: Nat, prospective_bytes: Nat) -> Step:
  collection_finding_result(state,
    Handoff.current(Handoff.Advice{1n, unit, partition, round,
      snapshot, current_snapshot, credential, current_credential,
      age_ms, solo_bytes, collection_ready}, selection_partition, selection_round),
    Nat.is_gt(solo_bytes, 10240n),
    Handoff.fits_batch((selected_count + 1n : Nat), prospective_bytes))

def collection_notice_result(state: State, result: Handoff.NoticeOffer) -> Step:
  match result:
    case Handoff.IncludeNotice{}:
      Advanced{state, CollectionNoticeIncluded{} <> Nil{}}
    case Handoff.SkipNotice{}:
      Advanced{state, CollectionNoticeSkipped{} <> Nil{}}
    case Handoff.StopNotices{}:
      Advanced{state, CollectionNoticeStopped{} <> Nil{}}

def collection_reserve(+state: State, advice: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state, CollectionState.reserve(collection, advice, token),
        CollectionLeaseReserved{}, CollectionLeaseRefused{})

def collection_release(+state: State, advice: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state, CollectionState.release(collection, advice, token),
        CollectionLeaseReleased{}, CollectionLeaseRefused{})

def collection_lease_keep(+state: State, advice: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{state, Bool.pick(Command,
        CollectionState.owns_lease(collection, advice, token),
        CollectionLeaseKept{}, CollectionLeaseRefused{}) <> Nil{}}

def collection_lease_checked(+state: State, advice: Nat, token: Nat,
    action: Delivery.CollectionLeaseAction) -> Step:
  match action:
    case Delivery.DropLease{}:
      collection_release(state, advice, token)
    case Delivery.KeepLease{}:
      collection_lease_keep(state, advice, token)

def collection_lease_check(state: State, advice: Nat, token: Nat,
    expired: Bool, stop_collector: Bool, same_group: Bool,
    reofferable: Bool) -> Step:
  collection_lease_checked(state, advice, token,
    Delivery.collection_lease(True{}, expired, stop_collector,
      same_group, reofferable))

def collection_retire(+state: State, +advice: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Bool.pick(Step, CollectionState.protected_advice(collection, advice),
        Rejected{state, WrongStage{}},
        Advanced{with_collection(state, CollectionState.retire(collection, advice)),
          CollectionAdviceRetired{} <> Nil{}})

def collection_claim(+state: State, group: Nat, token: Nat, active: Bool,
    capacity: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state,
        CollectionState.claim(collection, group, token, active, capacity),
        CollectionBackgroundClaimed{}, CollectionBackgroundRefused{})

def collection_release_background(+state: State, group: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state, CollectionState.release_claim(collection, group, token),
        CollectionBackgroundReleased{}, CollectionBackgroundRefused{})

def collection_expire_background(+state: State, group: Nat, token: Nat,
    elapsed: Nat, lifetime: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state,
        CollectionState.expire_claim(collection, group, token, elapsed, lifetime),
        CollectionBackgroundReleased{}, CollectionBackgroundKept{})

def pending_count(+operation: Nat, items: List<&2, Work>) -> Nat:
  match items:
    case Nil{}:
      0n
    case Work{_, _, _, candidate, _, kind, _} <> rest:
      match kind:
        case PendingFinding{count}:
          Bool.pick(Nat, Nat.is_eq(operation, candidate), count,
            pending_count(operation, rest))
        case _:
          pending_count(operation, rest)

def selected_count(+operation: Nat, selected: List<&2, Nat>) -> Nat:
  match selected:
    case Nil{}:
      0n
    case candidate <> rest:
      (Bool.pick(Nat, Nat.is_eq(operation, candidate), 1n, 0n) +
        selected_count(operation, rest) : Nat)

def selected_valid(+all: List<&2, Nat>, remaining: List<&2, Nat>,
    +work: List<&2, Work>) -> Bool:
  match remaining:
    case Nil{}:
      True{}
    case +operation <> rest:
      Bool.and(Nat.is_gt(operation, 0n),
        Bool.and(Nat.is_le(selected_count(operation, all),
          pending_count(operation, work)), selected_valid(all, rest, work)))

def selected_pending(+selected: List<&2, Nat>, work: List<&2, Work>) -> Bool:
  selected_valid(selected, selected, work)

def finish_reserve_decision(+state: State, group: Nat, round: Nat,
    attempt: Nat, token: Nat, selected: List<&2, Nat>) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state,
        CollectionState.finish_reserve(collection, group, round, attempt,
          token, selected), FinishReserved{}, FinishRefused{})

def finish_reserve(+state: State, +group: Nat, lifetime: Nat, +round: Nat,
    +attempt: Nat, +token: Nat, +selected: List<&2, Nat>,
    has_notice: Bool, pass_notices: Bool, can_write: Bool,
    binding_valid: Bool, +deadline_reached: Bool) -> Step:
  match state:
    case State{_, rounds, work, _, _, _, _, _, +history}:
      Bool.pick(Step, Bool.not(can_write),
        Advanced{state, Bool.pick(Command, deadline_reached,
          FinishAllowedDeadline{}, FinishAllowedNoAdvice{}) <> Nil{}},
        Bool.pick(Step, Nat.is_eq(List.length(&2, Nat, selected), 0n),
          Advanced{state, Bool.pick(Command,
            Bool.and(has_notice, pass_notices), FinishNotices{},
            Bool.pick(Command, deadline_reached,
              FinishAllowedDeadline{}, FinishAllowedNoAdvice{})) <> Nil{}},
          Bool.pick(Step,
            Bool.and(binding_valid,
              Bool.and(deciding_round(find_round(group, rounds), group,
                lifetime, round), selected_pending(selected, work))),
            finish_reserve_decision(state, group, round, attempt, token, selected),
            Advanced{state, FinishAllowedUnavailable{} <> Nil{}})))

def finish_release(+state: State, group: Nat, round: Nat,
    attempt: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state,
        CollectionState.finish_release(collection, group, round, attempt, token),
        FinishReleased{}, FinishRefused{})

def finish_authorize(+state: State, +group: Nat, +round: Nat,
    attempt: Nat, +token: Nat, +selected: List<&2, Nat>) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Bool.pick(Step,
        CollectionState.submission_ready(collection, group, round, token, selected),
        collection_decision(state,
          CollectionState.finish_authorize(collection, group, round,
            attempt, token, selected), FinishAuthorized{}, FinishRefused{}),
        Advanced{state, FinishRefused{} <> Nil{}})

def finish_terminal_result(state: State, outcome: WriteOutcome,
    decision: CollectionState.Decision) -> Step:
  match decision:
    case CollectionState.Accepted{collection}:
      Advanced{with_collection(state, collection), FinishRecorded{outcome} <> Nil{}}
    case CollectionState.Refused{_}:
      Advanced{state, FinishRefused{} <> Nil{}}

def finish_terminal(+state: State, group: Nat, round: Nat,
    attempt: Nat, token: Nat, selected: List<&2, Nat>,
    outcome: WriteOutcome) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      match outcome:
        case Acknowledged{}:
          finish_terminal_result(state, outcome,
            CollectionState.finish_terminal(collection, group, round,
              attempt, token, selected, DeliveryState.Submitted{}))
        case Failed{}:
          finish_terminal_result(state, outcome,
            CollectionState.finish_terminal(collection, group, round,
              attempt, token, selected, DeliveryState.Failed{}))
        case Unknown{}:
          finish_terminal_result(state, outcome,
            CollectionState.finish_terminal(collection, group, round,
              attempt, token, selected, DeliveryState.Uncertain{}))

def finish_end(+state: State, group: Nat, round: Nat,
    attempt: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state,
        CollectionState.finish_end(collection, group, round, attempt, token),
        FinishEnded{}, FinishRefused{})

def continuation_consume(+state: State, group: Nat, round: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state,
        CollectionState.consume_continuation(collection, group, round),
        ContinuationConsumed{}, ContinuationRefused{})

def submission_round_found(group: Nat, round: Nat, found: Maybe<&2, Round>) -> Bool:
  match found:
    case None{}: False{}
    case Some{Round{owner, _, current, _, _, _, _, +quiet_since}}:
      Bool.and(Nat.is_eq(group, owner), Nat.is_eq(round, current))

def submission_stop_reservation(surface: Handoff.Surface,
    authorize_now: Bool, reserved: Bool) -> Bool:
  match surface:
    case Handoff.Stop{}: Bool.or(authorize_now, reserved)
    case _: True{}

def submission_begin(+state: State, advice: Nat, +group: Nat, +round: Nat,
    +token: Nat, +surface: Handoff.Surface, +authorize_now: Bool,
    fingerprints: List<&2, Nat>, units: List<&2, Nat>) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, _, collection, +history}:
      Bool.pick(Step, Bool.and(submission_round_found(group, round,
        find_round(group, rounds)), submission_stop_reservation(surface,
          authorize_now, CollectionState.submission_reservation(collection,
            group, round, token))),
        collection_decision(state, CollectionState.submission_begin(collection,
          advice, group, round, token, surface, authorize_now, fingerprints, units),
          SubmissionBegun{}, SubmissionRefused{}),
        Advanced{state, SubmissionRefused{} <> Nil{}})

def submission_authorize(+state: State, advice: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state, CollectionState.submission_authorize(collection,
        advice, token), SubmissionAuthorized{}, SubmissionRefused{})

def submission_terminal(+state: State, advice: Nat, token: Nat, certain: Bool) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state, CollectionState.submission_terminal(collection,
        advice, token, certain), SubmissionRecorded{}, SubmissionRefused{})

def submission_release(+state: State, advice: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      collection_decision(state, CollectionState.submission_release(collection,
        advice, token), SubmissionReleased{}, SubmissionRefused{})

def submission_forget(+state: State, +advice: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Bool.pick(Step, CollectionState.protected_advice(collection, advice),
        Rejected{state, WrongStage{}},
        Advanced{with_collection(state, CollectionState.submission_forget(collection, advice)),
          SubmissionForgotten{} <> Nil{}})

def submission_suppress_check(+state: State, advice: Nat, fingerprint: Nat,
    round: Nat, surface: Handoff.Surface) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{state, Bool.pick(Command,
        CollectionState.submission_suppresses(collection, advice, fingerprint,
          round, surface), SubmissionSuppresses{}, SubmissionUnsuppressed{}) <> Nil{}}

def submission_reoffer_check(+state: State, advice: Nat, token: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{state, Bool.pick(Command,
        CollectionState.submission_reofferable(collection, advice, token),
        SubmissionReofferable{}, SubmissionNotReofferable{}) <> Nil{}}

def submission_expiry_check(+state: State, advice: Nat, token: Nat,
    elapsed: Nat, lifetime: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{state, Bool.pick(Command,
        CollectionState.submission_expired(collection, advice, token,
          elapsed, lifetime), SubmissionExpired{}, SubmissionCurrent{}) <> Nil{}}

def revision_register_result(+state: State, result: RevisionState.Registration) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, +collection, +history}:
      match result:
        case RevisionState.Reused{replacement, generation}:
          Advanced{with_collection(state, CollectionState.revision_replace(collection, replacement)),
            RevisionReused{generation} <> Nil{}}
        case RevisionState.Replaced{replacement, generation}:
          Advanced{with_collection(state, CollectionState.revision_replace(collection, replacement)),
            RevisionReplaced{generation} <> Nil{}}

def revision_register(+state: State, subject: Nat, input: Nat, add_member: Bool) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      revision_register_result(state, CollectionState.revision_register(collection,
        subject, input, add_member))

def revision_release(+state: State, subject: Nat, generation: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{with_collection(state, CollectionState.revision_release(collection,
        subject, generation)), RevisionReleased{} <> Nil{}}

def revision_current_check(+state: State, subject: Nat, input: Nat,
    generation: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{state, Bool.pick(Command, CollectionState.revision_current(collection,
        subject, input, generation), RevisionCurrent{}, RevisionStale{}) <> Nil{}}

def revision_superseded_check(+state: State, subject: Nat,
    candidate_subject: Nat, generation: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{state, Bool.pick(Command, CollectionState.revision_superseded(collection,
        subject, candidate_subject, generation), RevisionSuperseded{}, RevisionNotSuperseded{}) <> Nil{}}

def revision_generation_check(+state: State, subject: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{state, RevisionGeneration{CollectionState.revision_generation(collection,
        subject)} <> Nil{}}

def revision_count_check(+state: State) -> Step:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}:
      Advanced{state, RevisionCount{CollectionState.revision_count(collection)} <> Nil{}}

def collection_of(state: State) -> CollectionState.State:
  match state:
    case State{_, _, _, _, _, _, _, collection, +history}: collection

def collector_gate_result(state: State, result: CollectorAuthority.CollectGate) -> Step:
  match result:
    case CollectorAuthority.CollectProceed{}:
      Advanced{state, CollectorProceed{} <> Nil{}}
    case CollectorAuthority.CollectUnavailable{reason}:
      Advanced{state, CollectorUnavailable{reason} <> Nil{}}

def collector_final_authority_result(state: State, result: CollectorAuthority.FinalAuthority) -> Step:
  match result:
    case CollectorAuthority.FinalProceed{}:
      Advanced{state, CollectorFinalProceed{} <> Nil{}}
    case CollectorAuthority.FinalRelease{}:
      Advanced{state, CollectorFinalRelease{} <> Nil{}}

def reuse_member_result(state: State, result: Reuse.JoinedDisposition) -> Step:
  match result:
    case Reuse.KeepJoined{}: Advanced{state, ReuseKeepMember{} <> Nil{}}
    case Reuse.SetJoinedClear{}: Advanced{state, ReuseSetMemberClear{} <> Nil{}}
    case Reuse.SetJoinedFinding{}: Advanced{state, ReuseSetMemberFinding{} <> Nil{}}
    case Reuse.SetJoinedUnavailable{}: Advanced{state, ReuseSetMemberUnavailable{} <> Nil{}}
    case Reuse.SetJoinedLost{}: Advanced{state, ReuseSetMemberLost{} <> Nil{}}

def cleanup_state_clean(state: State) -> Bool:
  match state:
    case State{_, Nil{}, Nil{}, _, _, admissions,
        Dispatch.State{Nil{}, Nil{}, _, False{}, Nil{}},
        CollectionState.State{Nil{}, Nil{}, Nil{},
          DeliveryState.State{Nil{}, _, SubmissionState.State{Nil{}, Nil{}}},
          RevisionState.State{Nil{}, _},
          ReuseState.State{Nil{}, _}, NoticeState.State{Nil{}}}, +history}:
      Retention.cleanup_live_state(True{},
        Nat.is_eq(pending_resident_permits(admissions), 0n))
    case _: False{}

def cleanup_check_result(+state: State, result: Retention.CleanupGate) -> Step:
  match result:
    case Retention.CleanupReady{}:
      Advanced{state, Bool.pick(Command, cleanup_state_clean(state),
        CleanupReady{}, CleanupBusy{}) <> Nil{}}
    case Retention.CleanupBusy{}: Advanced{state, CleanupBusy{} <> Nil{}}

def delivery_ack_result(state: State, decision: Delivery.AckDecision) -> Step:
  match decision:
    case Delivery.AckReady{}: Advanced{state, DeliveryAckReady{} <> Nil{}}
    case Delivery.AckExpired{}: Advanced{state, DeliveryAckExpired{} <> Nil{}}
    case Delivery.AckEmpty{}: Advanced{state, DeliveryAckEmpty{} <> Nil{}}

def delivery_final_result(state: State, decision: Delivery.FinalDecision) -> Step:
  match decision:
    case Delivery.FinalReady{}: Advanced{state, DeliveryFinalReady{} <> Nil{}}
    case Delivery.FinalExpired{}: Advanced{state, DeliveryFinalExpired{} <> Nil{}}
    case Delivery.FinalEmpty{}: Advanced{state, DeliveryFinalEmpty{} <> Nil{}}

def delivery_disposition_result(state: State, decision: Delivery.FindingDisposition) -> Step:
  match decision:
    case Delivery.RetireAdvice{}: Advanced{state, DeliveryRetireAdvice{} <> Nil{}}
    case Delivery.KeepRemaining{}: Advanced{state, DeliveryKeepRemaining{} <> Nil{}}
    case Delivery.KeepForReoffer{}: Advanced{state, DeliveryKeepForReoffer{} <> Nil{}}

def delivery_batch_result(state: State, decision: Delivery.BatchGate) -> Step:
  match decision:
    case Delivery.BatchProceed{}: Advanced{state, DeliveryBatchProceed{} <> Nil{}}
    case Delivery.BatchRelease{}: Advanced{state, DeliveryBatchRelease{} <> Nil{}}

def candidate_route_result(state: State, decision: Handoff.CandidateAction) -> Step:
  match decision:
    case Handoff.IgnoreCandidate{}: Advanced{state, IgnoreCandidate{} <> Nil{}}
    case Handoff.ReleaseCandidate{}: Advanced{state, ReleaseCandidate{} <> Nil{}}
    case Handoff.RetireCandidate{}: Advanced{state, RetireCandidate{} <> Nil{}}
    case Handoff.ContinueCandidate{}: Advanced{state, ContinueCandidate{} <> Nil{}}
    case Handoff.RetainCandidate{}: Advanced{state, RetainCandidate{} <> Nil{}}

def stop_terminal_result(state: State, result: RoundPolicy.StopTerminal) -> Step:
  match result:
    case RoundPolicy.StopTerminal{revoke_provisional, close}:
      Advanced{state, RoundStopTerminal{revoke_provisional, close} <> Nil{}}

def cleanup_commit_eligible(state: State) -> Bool:
  match state:
    case State{Ledger.Ledger{_, _, Nil{}}, _, _, _, _, _, _,
        CollectionState.State{_, _, _, _, _,
          ReuseState.State{_, Nil{}}, _}, +history}: cleanup_state_clean(state)
    case _: False{}

def cleanup_closed(+state: State, result: Dispatch.DispatchResult) -> Step:
  match state result:
    case State{ledger, rounds, work, next_round, next_operation, admissions, _, collection, +history}
        Dispatch.Advanced{replacement, Nil{}}:
      Advanced{State{ledger, rounds, work, next_round, next_operation,
        admissions, replacement, collection, history}, CleanupCommitted{} <> Nil{}}
    case _ _: Advanced{state, CleanupBusy{} <> Nil{}}

def cleanup_commit_checked(+state: State, valid: Bool) -> Step:
  match state valid:
    case State{_, _, _, _, _, _, dispatch, _, +history} True{}:
      cleanup_closed(state, Dispatch.close(dispatch))
    case _ False{}: Advanced{state, CleanupBusy{} <> Nil{}}

def cleanup_commit(+state: State) -> Step:
  cleanup_commit_checked(state, cleanup_commit_eligible(state))

def reuse_step(+state: State, replacement: ReuseState.State, command: Command) -> Step:
  Advanced{with_collection(state,
    CollectionState.with_reuse(collection_of(state), replacement)), command <> Nil{}}

def reuse_route_result(+state: State, result: ReuseState.Route) -> Step:
  match result:
    case ReuseState.JoinAdvice{replacement}: reuse_step(state, replacement, ReuseJoinAdvice{})
    case ReuseState.JoinPending{replacement}: reuse_step(state, replacement, ReuseJoinPending{})
    case ReuseState.JoinClaimed{replacement}: reuse_step(state, replacement, ReuseJoinClaimed{})
    case ReuseState.Cached{replacement}: reuse_step(state, replacement, ReuseCached{})
    case ReuseState.Own{replacement}: reuse_step(state, replacement, ReuseOwn{})

def reuse_decision_result(+state: State, result: ReuseState.Decision,
    granted: Command) -> Step:
  match result:
    case ReuseState.Granted{replacement}: reuse_step(state, replacement, granted)
    case ReuseState.Refused{_}: Advanced{state, ReuseRefused{} <> Nil{}}

def cache_plan_result(+state: State, result: ReuseState.Plan) -> Step:
  match result:
    case ReuseState.Already{_}: Advanced{state, CacheAlready{} <> Nil{}}
    case ReuseState.Reject{_}: Advanced{state, CacheRejected{} <> Nil{}}
    case ReuseState.Prepared{replacement, ids}:
      reuse_step(state, replacement, CachePrepared{ids})

def cache_discard_result(+state: State, result: ReuseState.Discard) -> Step:
  match result:
    case ReuseState.Discarded{replacement, ids}:
      reuse_step(state, replacement, CacheDiscarded{ids})

def cache_charge_valid(found: Maybe<&2, Ledger.Charge>, partition: Nat, bytes: Nat) -> Bool:
  match found:
    case Some{Ledger.Charge{_, owner, size, Ledger.StoredResult{}}}:
      Bool.and(Nat.is_eq(partition, owner), Nat.is_eq(bytes, size))
    case _:
      False{}

def cache_commit_checked(+state: State, id: Nat, partition: Nat, bytes: Nat,
    reservation: Nat, entry_limit: Nat, byte_limit: Nat, valid: Bool) -> Step:
  match valid:
    case True{}:
      reuse_decision_result(state, ReuseState.commit(
        CollectionState.reuse_state(collection_of(state)), id, partition, bytes,
          reservation, entry_limit, byte_limit), CacheCommitted{})
    case False{}:
      Advanced{state, ReuseRefused{} <> Nil{}}

def cache_commit(+state: State, +id: Nat, +partition: Nat, +bytes: Nat,
    +reservation: Nat, entry_limit: Nat, byte_limit: Nat) -> Step:
  match state:
    case State{Ledger.Ledger{_, _, charges}, _, _, _, _, _, _, _, +history}:
      cache_commit_checked(state, id, partition, bytes, reservation,
        entry_limit, byte_limit,
        cache_charge_valid(Ledger.find(reservation, charges), partition, bytes))

def notice_step(+state: State, replacement: NoticeState.State, command: Command) -> Step:
  Advanced{with_collection(state,
    CollectionState.with_notices(collection_of(state), replacement)), command <> Nil{}}

def notice_advance_result(+state: State, result: NoticeState.Advance) -> Step:
  match result:
    case NoticeState.Suppressed{replacement, count}:
      notice_step(state, replacement, NoticeSuppressed{count})
    case NoticeState.RejectedFull{_}: Advanced{state, NoticeRejectedFull{} <> Nil{}}
    case NoticeState.CreateKey{_}: Advanced{state, NoticeCreateKey{} <> Nil{}}
    case NoticeState.CreatePending{replacement, count}:
      notice_step(state, replacement, NoticeCreatePending{count})
    case NoticeState.MergePending{replacement, count}:
      notice_step(state, replacement, NoticeMergePending{count})
    case NoticeState.KeepLeased{replacement}:
      notice_step(state, replacement, NoticeKeepLeased{})
    case NoticeState.RefusedAdvance{_}: Advanced{state, NoticeRefused{} <> Nil{}}

def notice_decision_result(+state: State, result: NoticeState.Decision,
    granted: Command) -> Step:
  match result:
    case NoticeState.Granted{replacement}: notice_step(state, replacement, granted)
    case NoticeState.Refused{_}: Advanced{state, NoticeRefused{} <> Nil{}}

def notice_prune_result(+state: State, result: NoticeState.PruneResult) -> Step:
  match result:
    case NoticeState.Pruned{replacement, drop_lease, drop_pending, drop_key}:
      notice_step(state, replacement, NoticePruned{drop_lease, drop_pending, drop_key})
    case NoticeState.PruneMissing{_}: Advanced{state, NoticeRefused{} <> Nil{}}

def notice_charge_valid(found: Maybe<&2, Ledger.Charge>, partition: Nat) -> Bool:
  match found:
    case Some{Ledger.Charge{_, owner, _, Ledger.OperationalNotice{}}}:
      Nat.is_eq(partition, owner)
    case _: False{}

def notice_commit_checked(+state: State, +key: Nat, +partition: Nat, +group: Nat,
    +reservation: Nat, +pending: Nat, sequence: Nat, maximum_keys: Nat, valid: Bool) -> Step:
  match valid:
    case True{}:
      notice_decision_result(state, NoticeState.commit(
        CollectionState.notice_state(collection_of(state)), key, partition,
        group, reservation, pending, sequence, maximum_keys), NoticeCommitted{})
    case False{}: Advanced{state, NoticeRefused{} <> Nil{}}

def notice_commit(+state: State, +key: Nat, +partition: Nat, +group: Nat,
    +reservation: Nat, +pending: Nat, sequence: Nat, maximum_keys: Nat) -> Step:
  match state:
    case State{Ledger.Ledger{_, _, charges}, _, _, _, _, _, _, _, +history}:
      notice_commit_checked(state, key, partition, group, reservation, pending,
        sequence, maximum_keys,
        notice_charge_valid(Ledger.find(reservation, charges), partition))

def step_unchecked(+state: State, event: CanonicalEvent) -> Step:
  match event:
    case ReserveCapacity{partition, bytes, purpose}:
      capacity_reserve(state, partition, bytes, purpose)
    case ResizeCapacity{reservation, bytes, purpose}:
      capacity_resize(state, reservation, bytes, purpose)
    case ReleaseCapacity{reservation}:
      capacity_release(state, reservation)
    case ReplaceCapacity{reservation, unit_bytes}:
      capacity_replace(state, reservation, unit_bytes)
    case IssuePermit{partition, lifetime, tool, started, deadline, now,
        minimum_started, facts}:
      issue_permit(state, partition, lifetime, tool, started, deadline, now,
        minimum_started, facts)
    case CheckCompletedEdit{tool}:
      check_completed_edit(state, tool)
    case RememberCompletedEdit{tool, reason}:
      remember_completed_edit(state, tool, reason)
    case QuietRoundTick{partition, lifetime, round, now, window, facts}:
      quiet_round_tick(state, partition, lifetime, round, now, window, facts)
    case QuietRoundReset{partition, lifetime, round}:
      quiet_round_reset(state, partition, lifetime, round)
    case ConsumePermit{partition, lifetime, token, tool, now}:
      consume_permit(state, partition, lifetime, token, tool, now)
    case ReleasePermit{partition, lifetime, token}:
      release_permit(state, partition, lifetime, token)
    case ExpirePermit{partition, lifetime, token, deadline_reached}:
      expire_permit(state, partition, lifetime, token, deadline_reached)
    case ClosePermitRound{partition, lifetime, round, at}:
      close_permit_round(state, partition, lifetime, round, at)
    case OpenRound{partition, lifetime}:
      open(state, partition, lifetime)
    case AdmitObservation{partition, lifetime, round}:
      admit_observation(state, partition, lifetime, round)
    case StartObservation{partition, lifetime, round, observation}:
      start_observation(state, partition, lifetime, round, observation)
    case CompleteObservation{partition, lifetime, round, observation}:
      complete_observation(state, partition, lifetime, round, observation)
    case InterruptObservation{partition, lifetime, round, observation}:
      interrupt_observation(state, partition, lifetime, round, observation)
    case BeginPreparation{partition, lifetime, round, bytes}:
      begin(state, partition, lifetime, round, bytes)
    case BeginObservedPreparation{partition, lifetime, round, observation, bytes}:
      begin_observed(state, partition, lifetime, round, observation, bytes)
    case InterruptPreparation{partition, lifetime, round, operation}:
      interrupt_preparation(state, partition, lifetime, round, operation)
    case PreparationCompleted{partition, lifetime, round, operation, bytes}:
      prepared(state, partition, lifetime, round, operation, bytes)
    case StartReview{partition, lifetime, round, operation}:
      start_review(state, partition, lifetime, round, operation)
    case JevRequestReady{partition, lifetime, round, operation, root_valid,
        configuration_valid, credential_ready, selected, current_work,
        physical_available}:
      request_ready(state, partition, lifetime, round, operation, root_valid,
        configuration_valid, credential_ready, selected, current_work,
        physical_available)
    case JevRequestStarted{partition, lifetime, round, operation, request}:
      request_started(state, partition, lifetime, round, operation, request)
    case JevRequestInterrupted{partition, lifetime, round, operation, request}:
      request_interrupted(state, partition, lifetime, round, operation, request)
    case JevRequestSettled{partition, lifetime, round, operation, request,
        outcome, current_work}:
      request_settled(state, partition, lifetime, round, operation, request,
        outcome, current_work)
    case ReviewCompleted{partition, lifetime, round, operation, outcome}:
      reviewed(state, partition, lifetime, round, operation, outcome)
    case RetireReview{partition, lifetime, round, operation}:
      retire_review(state, partition, lifetime, round, operation)
    case ReviewObserved{partition, lifetime, round, operation, outcome, current_work}:
      review_observed(state, partition, lifetime, round, operation, outcome, current_work)
    case FindingCountUpdated{partition, lifetime, round, operation, count}:
      finding_count_update(state, partition, lifetime, round, operation, count)
    case QueueDispatch{partition, lifetime, round, operation}:
      queue_dispatch(state, partition, lifetime, round, operation)
    case DispatchSettled{partition, lifetime, round, operation}:
      settle_dispatch(state, partition, lifetime, round, operation)
    case DiscardDispatch{operations}:
      discard_dispatch(state, operations)
    case DispatchScopeCheck{named_count, cancelled_count, has_unnamed}:
      dispatch_scope(state, named_count, cancelled_count, has_unnamed)
    case CloseDispatch{}:
      close_dispatch(state)
    case PreparedOfferCheck{ready, within_frame}:
      prepared_offer_check(state, ready, within_frame)
    case EmptyPreparedCheck{ready_count, has_non_skipped, authority_bound}:
      empty_prepared_check(state, ready_count, has_non_skipped, authority_bound)
    case ReviewFailureCheck{backend_or_timeout, credential, missing}:
      review_failure_check(state, backend_or_timeout, credential, missing)
    case StopPolled{partition, lifetime, round, deadline}:
      stop(state, partition, lifetime, round, deadline)
    case StopGroupPolled{group, lifetime, round, scopes, deadline, extra_pending, continuations}:
      stop_group(state, group, lifetime, round, scopes, deadline, extra_pending,
        continuations)
    case StopGroupEnded{group, lifetime, round, scopes}:
      stop_group_end(state, group, lifetime, round, scopes)
    case CollectionReady{advice, partition, lifetime, round,
        observation, joined_pending}:
      collection_ready(state, advice, partition, lifetime, round,
        observation, joined_pending)
    case CollectionCredentialCheck{same_scope, generation_valid}:
      collection_credential_result(state,
        Collection.credential_disposition(same_scope, generation_valid))
    case CollectionCandidateCheck{same_partition, unleased, has_unsuppressed, authority_owns}:
      collection_candidate(state, same_partition, unleased, has_unsuppressed, authority_owns)
    case CollectionOrderCheck{left_sequence, right_sequence}:
      collection_order_result(state, Collection.order(left_sequence, right_sequence))
    case CollectionExpiryCheck{elapsed, lifetime}:
      collection_expiry(state, elapsed, lifetime)
    case CollectionFitCheck{items, bytes}:
      collection_fit(state, items, bytes)
    case CollectionFindingCheck{selection_partition, selection_round, unit,
        partition, round, snapshot, current_snapshot, credential, current_credential,
        age_ms, solo_bytes, collection_ready, selected_count, prospective_bytes}:
      collection_finding(state, selection_partition, selection_round, unit,
        partition, round, snapshot, current_snapshot, credential, current_credential,
        age_ms, solo_bytes, collection_ready, selected_count, prospective_bytes)
    case CollectionNoticeCheck{items, bytes, skip_unfitting}:
      collection_notice_result(state,
        Handoff.notice_offer(items, bytes, skip_unfitting))
    case CollectionReserveLease{advice, token}:
      collection_reserve(state, advice, token)
    case CollectionReleaseLease{advice, token}:
      collection_release(state, advice, token)
    case CollectionLeaseCheck{advice, token, expired, stop_collector, same_group, reofferable}:
      collection_lease_check(state, advice, token, expired, stop_collector,
        same_group, reofferable)
    case CollectionRetireAdvice{advice}:
      collection_retire(state, advice)
    case CollectionClaimBackground{group, token, active, capacity}:
      collection_claim(state, group, token, active, capacity)
    case CollectionReleaseBackground{group, token}:
      collection_release_background(state, group, token)
    case CollectionExpireBackground{group, token, elapsed, lifetime}:
      collection_expire_background(state, group, token, elapsed, lifetime)
    case FinishReserve{group, lifetime, round, attempt, token, selected,
        has_notice, pass_notices, can_write, binding_valid, deadline_reached}:
      finish_reserve(state, group, lifetime, round, attempt, token, selected,
        has_notice, pass_notices, can_write, binding_valid, deadline_reached)
    case FinishRelease{group, round, attempt, token}:
      finish_release(state, group, round, attempt, token)
    case FinishAuthorize{group, round, attempt, token, selected}:
      finish_authorize(state, group, round, attempt, token, selected)
    case FinishTerminal{group, round, attempt, token, selected, outcome}:
      finish_terminal(state, group, round, attempt, token, selected, outcome)
    case FinishEnd{group, round, attempt, token}:
      finish_end(state, group, round, attempt, token)
    case ContinuationConsume{group, round}:
      continuation_consume(state, group, round)
    case SubmissionBegin{advice, group, round, token, surface, authorize_now, fingerprints, units}:
      submission_begin(state, advice, group, round, token, surface, authorize_now,
        fingerprints, units)
    case SubmissionAuthorize{advice, token}:
      submission_authorize(state, advice, token)
    case SubmissionTerminal{advice, token, certain}:
      submission_terminal(state, advice, token, certain)
    case SubmissionRelease{advice, token}:
      submission_release(state, advice, token)
    case SubmissionForget{advice}:
      submission_forget(state, advice)
    case SubmissionSuppressCheck{advice, fingerprint, round, surface}:
      submission_suppress_check(state, advice, fingerprint, round, surface)
    case SubmissionReofferCheck{advice, token}:
      submission_reoffer_check(state, advice, token)
    case SubmissionExpiryCheck{advice, token, elapsed, lifetime}:
      submission_expiry_check(state, advice, token, elapsed, lifetime)
    case RevisionRegister{subject, input, add_member}:
      revision_register(state, subject, input, add_member)
    case RevisionRelease{subject, generation}:
      revision_release(state, subject, generation)
    case RevisionCurrentCheck{subject, input, generation}:
      revision_current_check(state, subject, input, generation)
    case RevisionSupersededCheck{subject, candidate_subject, generation}:
      revision_superseded_check(state, subject, candidate_subject, generation)
    case RevisionGenerationCheck{subject}:
      revision_generation_check(state, subject)
    case RevisionCountCheck{}:
      revision_count_check(state)
    case CollectorGateCheck{expired, credential_valid}:
      collector_gate_result(state, CollectorAuthority.collect_gate(expired, credential_valid))
    case CollectorFinalAuthorityCheck{admitted_block, current_block}:
      collector_final_authority_result(state, CollectorAuthority.final_authority(admitted_block, current_block))
    case ReuseMemberCheck{joined_state, stale_unavailable, has_revision, has_advice_id}:
      reuse_member_result(state, Reuse.joined_disposition(joined_state, stale_unavailable,
        has_revision, has_advice_id))
    case CleanupCheck{facts}:
      cleanup_check_result(state, Retention.cleanup_gate(facts))
    case CleanupCommit{}:
      cleanup_commit(state)
    case DeliveryReleaseCheck{acknowledged}:
      Advanced{state, Bool.pick(Command, Delivery.release_unacknowledged(acknowledged),
        DeliveryReleaseUnacknowledged{}, DeliveryKeepAcknowledged{}) <> Nil{}}
    case DeliveryAcknowledgeCheck{items, any_expired}:
      delivery_ack_result(state, Delivery.acknowledge(items, any_expired))
    case DeliveryFinalizeCheck{items, all_acknowledged, any_expired}:
      delivery_final_result(state, Delivery.finalize(items, all_acknowledged, any_expired))
    case DeliveryFindingDispositionCheck{composed, remaining}:
      delivery_disposition_result(state, Delivery.finding_disposition(composed, remaining))
    case DeliverySubmissionCandidateCheck{facts}:
      Advanced{state, Bool.pick(Command, Delivery.submission_candidate(facts),
        DeliverySubmissionCandidate{}, DeliverySubmissionRefused{}) <> Nil{}}
    case DeliverySubmissionBatchCheck{count, all_valid}:
      delivery_batch_result(state, Delivery.submission_batch_gate(count, all_valid))
    case DeliveryCredentialObserveCheck{invalid_seen, generation_valid, authorized}:
      Advanced{state, Bool.pick(Command, Delivery.credential_observe(invalid_seen,
        generation_valid, authorized), DeliveryCredentialInvalid{}, DeliveryCredentialValid{}) <> Nil{}}
    case DeliveryFinalCredentialCheck{shared_collect, invalid_seen}:
      delivery_batch_result(state, Delivery.final_credential_gate(shared_collect, invalid_seen))
    case ValidationRouteCheck{owner_current, status}:
      candidate_route_result(state, Handoff.validation_route(owner_current, status))
    case PostValidationCheck{work_accepted, expired, has_fitting}:
      candidate_route_result(state, Handoff.post_validation(work_accepted, expired, has_fitting))
    case FinalCandidateCheck{owner_current, credential_generation,
        credential_authorized, expired, work_current, has_findings}:
      candidate_route_result(state, Handoff.final_candidate(owner_current,
        credential_generation, credential_authorized, expired, work_current, has_findings))
    case RoundBeginStopCheck{active, has_stop, token}:
      Advanced{state, Bool.pick(Command, Bool.and(active,
        Bool.and(Bool.not(has_stop), Nat.is_gt(token, 0n))),
        RoundStopBegun{}, RoundStopRefused{}) <> Nil{}}
    case RoundActivityCheck{bound, has_admission, +round, active, closed_at,
        expected_generation}:
      Advanced{state, Bool.pick(Command, Bool.and(bound, Bool.and(has_admission,
        Bool.and(Nat.is_eq(expected_generation, round), active))),
        RoundActive{}, RoundInactive{}) <> Nil{}}
    case RoundBarrierCheck{has_stop, used_at_start, used_now}:
      Advanced{state, Bool.pick(Command, Bool.and(has_stop,
        Nat.is_gt(used_now, used_at_start)), RoundBarrierRaised{}, RoundBarrierClear{}) <> Nil{}}
    case RoundOwnsStopCheck{active, token_matches, deciding}:
      Advanced{state, Bool.pick(Command, Bool.and(active,
        Bool.and(token_matches, Bool.not(deciding))),
        RoundStopOwned{}, RoundStopNotOwned{}) <> Nil{}}
    case RoundStopTerminalCheck{has_output, authorized, requested_close}:
      stop_terminal_result(state, RoundPolicy.stop_terminal(has_output, authorized,
        requested_close))
    case RoundExpireCloseCheck{barrier, authorized_output}:
      Advanced{state, Bool.pick(Command, Bool.and(Bool.not(authorized_output),
        RoundPolicy.expire_close(barrier)),
        RoundExpireCloses{}, RoundExpireKeeps{}) <> Nil{}}
    case RoundContinuationBudgetCheck{active, count}:
      Advanced{state, Bool.pick(Command, Bool.and(active,
        Nat.is_lt(count, RoundPolicy.max_continuations())),
        RoundContinuationAvailable{}, RoundContinuationExhausted{}) <> Nil{}}
    case DeliverySubmissionAllowedCheck{active, barrier, deciding, surface,
        existing_token, finish_permit}:
      Advanced{state, Bool.pick(Command, Delivery.submission_allowed_facts(active,
        barrier, deciding, surface, existing_token, finish_permit),
        DeliverySubmissionAllowed{}, DeliverySubmissionDenied{}) <> Nil{}}
    case DeliveryExistingTokenCheck{surface, existing_token, finish_permit}:
      Advanced{state, Bool.pick(Command, Delivery.existing_token_allowed(surface,
        existing_token, finish_permit), DeliveryExistingTokenAllowed{},
        DeliveryExistingTokenDenied{}) <> Nil{}}
    case DeliveryUnreservedStopCheck{active, deciding}:
      Advanced{state, Bool.pick(Command, Delivery.unreserved_stop_allowed_facts(active,
        deciding), DeliveryUnreservedStopAllowed{}, DeliveryUnreservedStopDenied{}) <> Nil{}}
    case IncludeLayerCheck{supplied, current_rank, candidate_rank}:
      Advanced{state, IncludeChoice{Configuration.include_choice(supplied,
        current_rank, candidate_rank)} <> Nil{}}
    case FileSelectionCheck{protected, excluded, includes_empty, included}:
      Advanced{state, FileSelection{Configuration.select(protected, excluded,
        includes_empty, included)} <> Nil{}}
    case FileProtectionInvalid{}:
      Advanced{state, FileProtection{Configuration.RepositoryBoundary{}} <> Nil{}}
    case FileProtectionCheck{sensitive_name, generated_or_vendor, allowed_extension}:
      Advanced{state, FileProtection{Configuration.protection(sensitive_name,
        generated_or_vendor,
        allowed_extension)} <> Nil{}}
    case CandidateFileCheck{git_admin, physical_safe, git_allowed}:
      Advanced{state, CandidateFile{Configuration.candidate(git_admin,
        physical_safe, git_allowed)} <> Nil{}}
    case ReviewAdmissionCheck{root_valid, configuration_valid, credential_ready, selected}:
      Advanced{state, ReviewAdmission{Configuration.admit(root_valid,
        configuration_valid, credential_ready, selected)} <> Nil{}}
    case RuleEnableCheck{pack_enabled, rule_enabled}:
      Advanced{state, RuleGate{RulePolicy.enabled(pack_enabled, rule_enabled)} <> Nil{}}
    case RuleApplicabilityCheck{consent, complete, target,
        global_included, global_excluded, pack_enabled, rule_enabled,
        rule_included, rule_excluded, target_declared, capabilities_available,
        source_rung, minimum_rung}:
      Advanced{state, RuleGate{RulePolicy.applicable(consent, complete, target,
        global_included, global_excluded, pack_enabled, rule_enabled,
        rule_included, rule_excluded, target_declared, capabilities_available,
        source_rung, minimum_rung)} <> Nil{}}
    case RuleFindingCheck{probability, threshold}:
      Advanced{state, RuleGate{RulePolicy.finding(probability, threshold)} <> Nil{}}
    case RuleRankOrderCheck{left, right, left_rank, right_rank}:
      Advanced{state, RuleOrder{RulePolicy.rank_order(left, right,
        left_rank, right_rank)} <> Nil{}}
    case AdviceOrderCheck{left, right, path_order, id_order}:
      Advanced{state, RuleOrder{RulePolicy.advice_order(left, right,
        path_order, id_order)} <> Nil{}}
    case RuleBudgetCheck{position, limit}:
      Advanced{state, RuleGate{RulePolicy.budget(position, limit)} <> Nil{}}
    case ReuseRoute{id, live_advice}:
      reuse_route_result(state, ReuseState.route(
        CollectionState.reuse_state(collection_of(state)), id, live_advice))
    case ReuseClaim{id}:
      reuse_decision_result(state, ReuseState.claim(
        CollectionState.reuse_state(collection_of(state)), id), ReuseClaimed{})
    case ReuseAttach{id}:
      reuse_decision_result(state, ReuseState.attach(
        CollectionState.reuse_state(collection_of(state)), id), ReuseAttached{})
    case ReuseRelease{id}:
      reuse_step(state, ReuseState.release(
        CollectionState.reuse_state(collection_of(state)), id), ReuseReleased{})
    case ReuseTouch{id}:
      reuse_route_result(state, ReuseState.touch(
        CollectionState.reuse_state(collection_of(state)), id))
    case CachePrepare{id, bytes, entry_limit, byte_limit}:
      cache_plan_result(state, ReuseState.prepare(
        CollectionState.reuse_state(collection_of(state)), id, bytes, entry_limit, byte_limit))
    case CacheCommit{id, partition, bytes, reservation, entry_limit, byte_limit}:
      cache_commit(state, id, partition, bytes, reservation, entry_limit, byte_limit)
    case CacheDiscardPartition{partition}:
      cache_discard_result(state, ReuseState.discard(
        CollectionState.reuse_state(collection_of(state)), partition))
    case CacheClear{}:
      cache_discard_result(state, ReuseState.clear(
        CollectionState.reuse_state(collection_of(state))))
    case NoticeAdvance{key, remaining, maximum_keys, proposed, sequence, max_count}:
      notice_advance_result(state, NoticeState.advance(
        CollectionState.notice_state(collection_of(state)), key, remaining,
        maximum_keys, proposed, sequence, max_count))
    case NoticeCommit{key, partition, group, reservation, pending, sequence, maximum_keys}:
      notice_commit(state, key, partition, group, reservation, pending, sequence, maximum_keys)
    case NoticePrune{key, lease_expired, pending_expired, excepted, cooldown_expired}:
      notice_prune_result(state, NoticeState.prune(
        CollectionState.notice_state(collection_of(state)), key, lease_expired,
        pending_expired, excepted, cooldown_expired))
    case NoticeDrop{key}:
      notice_step(state, NoticeState.drop(
        CollectionState.notice_state(collection_of(state)), key), NoticeDropped{})
    case NoticeLease{key, leased}:
      notice_decision_result(state, NoticeState.lease(
        CollectionState.notice_state(collection_of(state)), key, leased), NoticeLeased{})
    case NoticeClearPending{key}:
      notice_decision_result(state, NoticeState.clear_pending(
        CollectionState.notice_state(collection_of(state)), key), NoticePendingCleared{})
    case NoticeSelect{partition, group, composed, authority_bound, allowed}:
      Advanced{state, NoticeSelected{NoticeState.select(
        CollectionState.notice_state(collection_of(state)), partition, group,
        composed, authority_bound, allowed)} <> Nil{}}
    case OutputStarted{partition, lifetime, round}:
      output_start(state, partition, lifetime, round)
    case OutputTerminal{partition, lifetime, round, operation, outcome}:
      output_terminal(state, partition, lifetime, round, operation, outcome)
    case RetirePartition{partition, lifetime, round}:
      retire(state, partition, lifetime, round)
    case ForgetAdmission{partition, lifetime}:
      forget_admission(state, partition, lifetime)

# Rounds use a List, so uniqueness is not a type-level guarantee. Every accepted
# transition is checked here: a partition may own at most one canonical round,
# regardless of lifetime. Invalid post-states roll back to the original state.
def round_not_found(found: Maybe<&2, Round>) -> Bool:
  match found:
    case None{}:
      True{}
    case Some{_}:
      False{}

def unique_rounds(rounds: List<&2, Round>) -> Bool:
  match rounds:
    case Nil{}:
      True{}
    case Round{partition, _, _, _, _, _, _, +quiet_since} <> +rest:
      Bool.and(round_not_found(find_round(partition, rest)), unique_rounds(rest))

def check_round_invariant(original: State, updated: State,
    commands: List<&2, Command>, valid: Bool) -> Step:
  match valid:
    case True{}:
      Advanced{updated, commands}
    case False{}:
      Rejected{original, InconsistentLedger{}}

def check_step(original: State, result: Step) -> Step:
  match result:
    case Advanced{+updated, commands}:
      match updated:
        case State{_, rounds, _, _, _, _, _, _, +history}:
          check_round_invariant(original, updated, commands, unique_rounds(rounds))
    case Rejected{state, reason}:
      Rejected{state, reason}

def step(+state: State, event: CanonicalEvent) -> Step:
  check_step(state, step_unchecked(state, event))

def main() -> Step:
  step(initial(Ledger.Limits{4n, 100n, 2n, 60n}), OpenRound{1n, 1n})
