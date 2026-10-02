import Base
import ./Advicees.bend as Advicees
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Ledger.bend as Ledger
import ../agent-flow-bend/Dispatch.bend as Dispatch
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/DeliveryState.bend as Delivery
import ../agent-flow-bend/SubmissionState.bend as Submission
import ../agent-flow-bend/NoticeState.bend as Notices

type Reference is Data:
  Direct{partition: Nat}
  Operation{operation: Nat}
  Reservation{reservation: Nat}
  Round{round: Nat}
  Advice{advice: Nat}
  Notice{key: Nat}
  Context{}
  Shared{}
type Binding is Data:
  Binding{owner: Nat, id: Nat}

# Display selection consumes checked factual bindings; it never allocates a
# resource or creates an owner for an unbound record.
def select_if(owned: Bool, id: Nat, tail: List<&2, Nat>) -> List<&2, Nat>:
  match owned:
    case True{}: id <> tail
    case False{}: tail

def select(bindings: List<&2, Binding>, +partition: Nat) -> List<&2, Nat>:
  match bindings:
    case Nil{}: []
    case Binding{owner, id} <> tail:
      select_if(Nat.is_eq(owner, partition) && Advicees.bounded(partition), id, select(tail, partition))

def first(found: Maybe<&2, Nat>, fallback: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case Some{partition}: Some{partition}
    case None{}: fallback

def owner_if(found: Bool, partition: Nat, tail: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case True{}: Some{partition}
    case False{}: tail

def work_owner(work: List<&2, Canonical.Work>, +operation: Nat) -> Maybe<&2, Nat>:
  match work:
    case Nil{}: None{}
    case Canonical.Work{partition, _, _, id, _, _, _} <> tail:
      owner_if(Nat.is_eq(id, operation), partition, work_owner(tail, operation))

def entry_owner(entries: List<&2, Dispatch.Entry>, +operation: Nat) -> Maybe<&2, Nat>:
  match entries:
    case Nil{}: None{}
    case Dispatch.Entry{partition, _, _, id, _, _, _} <> tail:
      owner_if(Nat.is_eq(id, operation), partition, entry_owner(tail, operation))

def request_owner(requests: List<&2, Dispatch.Request>, +operation: Nat) -> Maybe<&2, Nat>:
  match requests:
    case Nil{}: None{}
    case Dispatch.Request{partition, _, _, id, _, _, _} <> tail:
      owner_if(Nat.is_eq(id, operation), partition, request_owner(tail, operation))

def dispatch_owner(dispatch: Dispatch.State, +operation: Nat) -> Maybe<&2, Nat>:
  match dispatch:
    case Dispatch.State{queued, running, _, _, requests}:
      first(entry_owner(queued, operation), first(entry_owner(running, operation), request_owner(requests, operation)))

def charge_owner(charges: List<&2, Ledger.Charge>, +reservation: Nat) -> Maybe<&2, Nat>:
  match charges:
    case Nil{}: None{}
    case Ledger.Charge{id, partition, _, _} <> tail:
      owner_if(Nat.is_eq(id, reservation), partition, charge_owner(tail, reservation))

def round_owner(rounds: List<&2, Canonical.Round>, +round: Nat) -> Maybe<&2, Nat>:
  match rounds:
    case Nil{}: None{}
    case Canonical.Round{partition, _, id, _, _, _, _, _} <> tail:
      owner_if(Nat.is_eq(id, round), partition, round_owner(tail, round))

def batch_owner(batches: List<&2, Submission.Batch>, +advice: Nat) -> Maybe<&2, Nat>:
  match batches:
    case Nil{}: None{}
    case Submission.Batch{id, group, _, _, _, _, _, _} <> tail:
      owner_if(Nat.is_eq(id, advice), group, batch_owner(tail, advice))

def notice_owner(records: List<&2, Notices.Record>, +key: Nat) -> Maybe<&2, Nat>:
  match records:
    case Nil{}: None{}
    case Notices.Record{id, partition, _, _, _, _} <> tail:
      owner_if(Nat.is_eq(id, key), partition, notice_owner(tail, key))

def submission_owner(submissions: Submission.State, advice: Nat) -> Maybe<&2, Nat>:
  match submissions:
    case Submission.State{_, batches}: batch_owner(batches, advice)

def delivery_owner(delivery: Delivery.State, advice: Nat) -> Maybe<&2, Nat>:
  match delivery:
    case Delivery.State{_, _, submissions}: submission_owner(submissions, advice)

def collection_advice_owner(collection: Collection.State, advice: Nat) -> Maybe<&2, Nat>:
  match collection:
    case Collection.State{_, _, _, delivery, _, _, _}: delivery_owner(delivery, advice)

def collection_notice_owner(collection: Collection.State, key: Nat) -> Maybe<&2, Nat>:
  match collection:
    case Collection.State{_, _, _, _, _, _, Notices.State{records}}: notice_owner(records, key)

def ledger_owner(ledger: Ledger.Ledger, reservation: Nat) -> Maybe<&2, Nat>:
  match ledger:
    case Ledger.Ledger{_, _, charges}: charge_owner(charges, reservation)

def intrinsic(state: Canonical.State, reference: Reference) -> Maybe<&2, Nat>:
  match state reference:
    case _ Direct{+partition}: owner_if(Advicees.bounded(partition), partition, None{})
    case Canonical.State{_, _, work, _, _, _, dispatch, _, _} Operation{+operation}:
      first(work_owner(work, operation), dispatch_owner(dispatch, operation))
    case Canonical.State{ledger, _, _, _, _, _, _, _, _} Reservation{reservation}: ledger_owner(ledger, reservation)
    case Canonical.State{_, rounds, _, _, _, _, _, _, _} Round{round}: round_owner(rounds, round)
    case Canonical.State{_, _, work, _, _, _, _, collection, _} Advice{+advice}:
      first(work_owner(work, advice), collection_advice_owner(collection, advice))
    case Canonical.State{_, _, _, _, _, _, _, collection, _} Notice{key}: collection_notice_owner(collection, key)
    case _ _: None{}

def context_owner(provided: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match provided:
    case Some{+partition}: owner_if(Advicees.bounded(partition), partition, None{})
    case None{}: None{}

def resolve(before: Canonical.State, after: Canonical.State, reference: Reference,
    provided: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match reference:
    case Context{}: context_owner(provided)
    case Shared{}: None{}
    case +reference: first(intrinsic(before, reference), intrinsic(after, reference))

def event_reference(value: Canonical.CanonicalEvent) -> Reference:
  match value:
    case Canonical.ReserveCapacity{partition, _, _}: Direct{partition}
    case Canonical.ResizeCapacity{reservation, _, _}: Reservation{reservation}
    case Canonical.ReleaseCapacity{reservation}: Reservation{reservation}
    case Canonical.ReplaceCapacity{reservation, _}: Reservation{reservation}
    case Canonical.IssuePermit{partition, _, _, _, _, _, _, _}: Direct{partition}
    case Canonical.CheckCompletedEdit{_}: Context{}
    case Canonical.RememberCompletedEdit{_, _}: Context{}
    case Canonical.QuietRoundTick{partition, _, _, _, _, _}: Direct{partition}
    case Canonical.QuietRoundReset{partition, _, _}: Direct{partition}
    case Canonical.ConsumePermit{partition, _, _, _, _}: Direct{partition}
    case Canonical.ReleasePermit{partition, _, _}: Direct{partition}
    case Canonical.ExpirePermit{partition, _, _, _}: Direct{partition}
    case Canonical.ClosePermitRound{partition, _, _, _}: Direct{partition}
    case Canonical.ForgetAdmission{partition, _}: Direct{partition}
    case Canonical.OpenRound{partition, _}: Direct{partition}
    case Canonical.AdmitObservation{partition, _, _}: Direct{partition}
    case Canonical.StartObservation{partition, _, _, _}: Direct{partition}
    case Canonical.CompleteObservation{partition, _, _, _}: Direct{partition}
    case Canonical.InterruptObservation{partition, _, _, _}: Direct{partition}
    case Canonical.BeginPreparation{partition, _, _, _}: Direct{partition}
    case Canonical.BeginObservedPreparation{partition, _, _, _, _}: Direct{partition}
    case Canonical.InterruptPreparation{partition, _, _, _}: Direct{partition}
    case Canonical.PreparationCompleted{partition, _, _, _, _}: Direct{partition}
    case Canonical.StartReview{partition, _, _, _}: Direct{partition}
    case Canonical.JevRequestReady{partition, _, _, _, _, _, _, _, _, _}: Direct{partition}
    case Canonical.JevRequestStarted{partition, _, _, _, _}: Direct{partition}
    case Canonical.JevRequestInterrupted{partition, _, _, _, _}: Direct{partition}
    case Canonical.JevRequestSettled{partition, _, _, _, _, _, _}: Direct{partition}
    case Canonical.ReviewCompleted{partition, _, _, _, _}: Direct{partition}
    case Canonical.RetireReview{partition, _, _, _}: Direct{partition}
    case Canonical.ReviewObserved{partition, _, _, _, _, _}: Direct{partition}
    case Canonical.FindingCountUpdated{partition, _, _, _, _}: Direct{partition}
    case Canonical.QueueDispatch{partition, _, _, _}: Direct{partition}
    case Canonical.DispatchSettled{partition, _, _, _}: Direct{partition}
    case Canonical.DiscardDispatch{_}: Shared{}
    case Canonical.DispatchScopeCheck{_, _, _}: Context{}
    case Canonical.CloseDispatch{}: Shared{}
    case Canonical.PreparedOfferCheck{_, _}: Context{}
    case Canonical.EmptyPreparedCheck{_, _, _}: Context{}
    case Canonical.ReviewFailureCheck{_, _, _}: Context{}
    case Canonical.StopPolled{partition, _, _, _}: Direct{partition}
    case Canonical.StopGroupPolled{group, _, _, _, _, _, _}: Direct{group}
    case Canonical.StopGroupEnded{group, _, _, _}: Direct{group}
    case Canonical.CollectionReady{_, partition, _, _, _, _}: Direct{partition}
    case Canonical.CollectionCredentialCheck{_, _}: Context{}
    case Canonical.CollectionCandidateCheck{_, _, _, _}: Context{}
    case Canonical.CollectionOrderCheck{_, _}: Context{}
    case Canonical.CollectionExpiryCheck{_, _}: Context{}
    case Canonical.CollectionFitCheck{_, _}: Context{}
    case Canonical.CollectionFindingCheck{_, _, _, partition, _, _, _, _, _, _, _, _, _, _}: Direct{partition}
    case Canonical.CollectionNoticeCheck{_, _, _}: Context{}
    case Canonical.CollectionReserveLease{advice, _}: Advice{advice}
    case Canonical.CollectionReleaseLease{advice, _}: Advice{advice}
    case Canonical.CollectionLeaseCheck{advice, _, _, _, _, _}: Advice{advice}
    case Canonical.CollectionRetireAdvice{advice}: Advice{advice}
    case Canonical.CollectionClaimBackground{group, _, _, _}: Direct{group}
    case Canonical.CollectionReleaseBackground{group, _}: Direct{group}
    case Canonical.CollectionExpireBackground{group, _, _, _}: Direct{group}
    case Canonical.FinishReserve{group, _, _, _, _, _, _, _, _, _, _}: Direct{group}
    case Canonical.FinishRelease{group, _, _, _}: Direct{group}
    case Canonical.FinishAuthorize{group, _, _, _, _}: Direct{group}
    case Canonical.FinishTerminal{group, _, _, _, _, _}: Direct{group}
    case Canonical.FinishEnd{group, _, _, _}: Direct{group}
    case Canonical.ContinuationConsume{group, _}: Direct{group}
    case Canonical.SubmissionBegin{_, group, _, _, _, _, _, _}: Direct{group}
    case Canonical.SubmissionAuthorize{advice, _}: Advice{advice}
    case Canonical.SubmissionTerminal{advice, _, _}: Advice{advice}
    case Canonical.SubmissionRelease{advice, _}: Advice{advice}
    case Canonical.SubmissionForget{advice}: Advice{advice}
    case Canonical.SubmissionSuppressCheck{advice, _, _, _}: Advice{advice}
    case Canonical.SubmissionReofferCheck{advice, _}: Advice{advice}
    case Canonical.SubmissionExpiryCheck{advice, _, _, _}: Advice{advice}
    case Canonical.RevisionRegister{_, _, _}: Context{}
    case Canonical.RevisionRelease{_, _}: Context{}
    case Canonical.RevisionCurrentCheck{_, _, _}: Context{}
    case Canonical.RevisionSupersededCheck{_, _, _}: Context{}
    case Canonical.RevisionGenerationCheck{_}: Context{}
    case Canonical.RevisionCountCheck{}: Shared{}
    case Canonical.CollectorGateCheck{_, _}: Context{}
    case Canonical.CollectorFinalAuthorityCheck{_, _}: Context{}
    case Canonical.ReuseMemberCheck{_, _, _, _}: Context{}
    case Canonical.CleanupCheck{_}: Shared{}
    case Canonical.CleanupCommit{}: Shared{}
    case Canonical.DeliveryReleaseCheck{_}: Context{}
    case Canonical.DeliveryAcknowledgeCheck{_, _}: Context{}
    case Canonical.DeliveryFinalizeCheck{_, _, _}: Context{}
    case Canonical.DeliveryFindingDispositionCheck{_, _}: Context{}
    case Canonical.DeliverySubmissionCandidateCheck{_}: Context{}
    case Canonical.DeliverySubmissionBatchCheck{_, _}: Context{}
    case Canonical.DeliveryCredentialObserveCheck{_, _, _}: Context{}
    case Canonical.DeliveryFinalCredentialCheck{_, _}: Context{}
    case Canonical.ValidationRouteCheck{_, _}: Context{}
    case Canonical.PostValidationCheck{_, _, _}: Context{}
    case Canonical.FinalCandidateCheck{_, _, _, _, _, _}: Context{}
    case Canonical.RoundBeginStopCheck{_, _, _}: Context{}
    case Canonical.RoundActivityCheck{_, _, _, _, _, _}: Context{}
    case Canonical.RoundBarrierCheck{_, _, _}: Context{}
    case Canonical.RoundOwnsStopCheck{_, _, _}: Context{}
    case Canonical.RoundStopTerminalCheck{_, _, _}: Context{}
    case Canonical.RoundExpireCloseCheck{_, _}: Context{}
    case Canonical.RoundContinuationBudgetCheck{_, _}: Context{}
    case Canonical.DeliverySubmissionAllowedCheck{_, _, _, _, _, _}: Context{}
    case Canonical.DeliveryExistingTokenCheck{_, _, _}: Context{}
    case Canonical.DeliveryUnreservedStopCheck{_, _}: Context{}
    case Canonical.IncludeLayerCheck{_, _, _}: Context{}
    case Canonical.FileSelectionCheck{_, _, _, _}: Context{}
    case Canonical.FileProtectionInvalid{}: Context{}
    case Canonical.FileProtectionCheck{_, _, _}: Context{}
    case Canonical.CandidateFileCheck{_, _, _}: Context{}
    case Canonical.ReviewAdmissionCheck{_, _, _, _}: Context{}
    case Canonical.RuleEnableCheck{_, _}: Context{}
    case Canonical.RuleApplicabilityCheck{_, _, _, _, _, _, _, _, _, _, _, _, _}: Context{}
    case Canonical.RuleFindingCheck{_, _}: Context{}
    case Canonical.RuleRankOrderCheck{_, _, _, _}: Context{}
    case Canonical.AdviceOrderCheck{_, _, _, _}: Context{}
    case Canonical.RuleBudgetCheck{_, _}: Context{}
    case Canonical.ReuseRoute{_, _}: Context{}
    case Canonical.ReuseClaim{_}: Context{}
    case Canonical.ReuseAttach{_}: Context{}
    case Canonical.ReuseRelease{_}: Context{}
    case Canonical.ReuseTouch{_}: Context{}
    case Canonical.CachePrepare{_, _, _, _}: Context{}
    case Canonical.CacheCommit{_, partition, _, _, _, _}: Direct{partition}
    case Canonical.CacheDiscardPartition{partition}: Direct{partition}
    case Canonical.CacheClear{}: Shared{}
    case Canonical.NoticeAdvance{key, _, _, _, _, _}: Notice{key}
    case Canonical.NoticeCommit{_, partition, _, _, _, _, _}: Direct{partition}
    case Canonical.NoticePrune{key, _, _, _, _}: Notice{key}
    case Canonical.NoticeDrop{key}: Notice{key}
    case Canonical.NoticeLease{key, _}: Notice{key}
    case Canonical.NoticeClearPending{key}: Notice{key}
    case Canonical.NoticeSelect{partition, _, _, _, _}: Direct{partition}
    case Canonical.OutputStarted{partition, _, _}: Direct{partition}
    case Canonical.OutputTerminal{partition, _, _, _, _}: Direct{partition}
    case Canonical.RetirePartition{partition, _, _}: Direct{partition}

def event(before: Canonical.State, after: Canonical.State, value: Canonical.CanonicalEvent, provided: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  resolve(before, after, event_reference(value), provided)

def command_reference(value: Canonical.Command) -> Reference:
  match value:
    case Canonical.CapacityGranted{id, _}: Reservation{id}
    case Canonical.CapacityRefused{_, _}: Context{}
    case Canonical.CapacityResized{id, _}: Reservation{id}
    case Canonical.CapacityUnitAdmitted{reservation, _, _, _}: Reservation{reservation}
    case Canonical.CapacityUnitRefused{_, _, _, _}: Context{}
    case Canonical.PermitIssued{_, _}: Context{}
    case Canonical.CompletedEditAbsent{}: Context{}
    case Canonical.CompletedEditSeen{_, _}: Context{}
    case Canonical.CompletedEditRemembered{_}: Context{}
    case Canonical.QuietRoundBusy{}: Context{}
    case Canonical.QuietRoundWaiting{_}: Context{}
    case Canonical.QuietRoundExpired{_}: Context{}
    case Canonical.QuietRoundResetRecorded{}: Context{}
    case Canonical.PermitConsumed{_}: Context{}
    case Canonical.PermitReleased{}: Context{}
    case Canonical.PermitExpired{}: Context{}
    case Canonical.PermitKept{}: Context{}
    case Canonical.PermitRoundClosed{_}: Context{}
    case Canonical.RoundStarted{id}: Round{id}
    case Canonical.ObservationAdmitted{id}: Operation{id}
    case Canonical.ObservationStarted{}: Context{}
    case Canonical.ObservationCompleted{}: Context{}
    case Canonical.ObservationInterrupted{}: Context{}
    case Canonical.Prepare{operation, _}: Operation{operation}
    case Canonical.PreparationRefused{}: Context{}
    case Canonical.UnitAdmitted{operation, _, _, _, _}: Operation{operation}
    case Canonical.UnitRefused{_, _, _, _}: Context{}
    case Canonical.PreparationReleased{id, _}: Reservation{id}
    case Canonical.ReviewStarted{}: Context{}
    case Canonical.JevRequestIssued{partition, _, _, _, _}: Direct{partition}
    case Canonical.JevRequestUnavailable{}: Context{}
    case Canonical.JevRequestStartRecorded{}: Context{}
    case Canonical.JevInterruptionRecorded{}: Context{}
    case Canonical.JevRequestOutcomeRecorded{_}: Context{}
    case Canonical.JevObservationIgnored{}: Context{}
    case Canonical.ReservationReleased{id}: Reservation{id}
    case Canonical.ReviewRecorded{_}: Context{}
    case Canonical.RetainFinding{}: Context{}
    case Canonical.FindingCountRecorded{}: Context{}
    case Canonical.SettleClear{}: Context{}
    case Canonical.SettleStaleClear{}: Context{}
    case Canonical.RetireStaleFinding{}: Context{}
    case Canonical.PreparedSkipped{}: Context{}
    case Canonical.PreparedAdmitted{}: Context{}
    case Canonical.PreparedCapacityRefused{}: Context{}
    case Canonical.EmptyLost{}: Context{}
    case Canonical.EmptyAccepted{}: Context{}
    case Canonical.FailureBackend{}: Context{}
    case Canonical.FailureCredential{}: Context{}
    case Canonical.FailureLost{}: Context{}
    case Canonical.FailureNone{}: Context{}
    case Canonical.DispatchStarted{operation, _}: Operation{operation}
    case Canonical.DispatchDiscarded{operation, _}: Operation{operation}
    case Canonical.DiscardNamedOnly{}: Context{}
    case Canonical.DiscardAllUnfinished{}: Context{}
    case Canonical.WaitForWork{}: Context{}
    case Canonical.CancelWork{operation}: Operation{operation}
    case Canonical.FinishReady{}: Context{}
    case Canonical.FinishLimit{}: Context{}
    case Canonical.StopEnded{}: Context{}
    case Canonical.CollectionEligible{}: Context{}
    case Canonical.CollectionWaiting{}: Context{}
    case Canonical.CollectionRetireCredential{}: Context{}
    case Canonical.CollectionRetainCredential{}: Context{}
    case Canonical.CollectionCandidate{}: Context{}
    case Canonical.CollectionSkip{}: Context{}
    case Canonical.CollectionBefore{}: Context{}
    case Canonical.CollectionEqual{}: Context{}
    case Canonical.CollectionAfter{}: Context{}
    case Canonical.CollectionExpired{}: Context{}
    case Canonical.CollectionCurrent{}: Context{}
    case Canonical.CollectionFits{}: Context{}
    case Canonical.CollectionLimited{}: Context{}
    case Canonical.CollectionFindingSelected{}: Context{}
    case Canonical.CollectionFindingRetained{}: Context{}
    case Canonical.CollectionFindingLimited{}: Context{}
    case Canonical.CollectionFindingExpired{}: Context{}
    case Canonical.CollectionNoticeIncluded{}: Context{}
    case Canonical.CollectionNoticeSkipped{}: Context{}
    case Canonical.CollectionNoticeStopped{}: Context{}
    case Canonical.CollectionLeaseReserved{}: Context{}
    case Canonical.CollectionLeaseRefused{}: Context{}
    case Canonical.CollectionLeaseReleased{}: Context{}
    case Canonical.CollectionLeaseKept{}: Context{}
    case Canonical.CollectionAdviceRetired{}: Context{}
    case Canonical.CollectionBackgroundClaimed{}: Context{}
    case Canonical.CollectionBackgroundRefused{}: Context{}
    case Canonical.CollectionBackgroundReleased{}: Context{}
    case Canonical.CollectionBackgroundKept{}: Context{}
    case Canonical.FinishReserved{}: Context{}
    case Canonical.FinishNotices{}: Context{}
    case Canonical.FinishAllowedNoAdvice{}: Context{}
    case Canonical.FinishAllowedDeadline{}: Context{}
    case Canonical.FinishAllowedUnavailable{}: Context{}
    case Canonical.FinishRefused{}: Context{}
    case Canonical.FinishReleased{}: Context{}
    case Canonical.FinishAuthorized{}: Context{}
    case Canonical.FinishRecorded{_}: Context{}
    case Canonical.FinishEnded{}: Context{}
    case Canonical.ContinuationConsumed{}: Context{}
    case Canonical.ContinuationRefused{}: Context{}
    case Canonical.SubmissionBegun{}: Context{}
    case Canonical.SubmissionAuthorized{}: Context{}
    case Canonical.SubmissionRecorded{}: Context{}
    case Canonical.SubmissionReleased{}: Context{}
    case Canonical.SubmissionRefused{}: Context{}
    case Canonical.SubmissionForgotten{}: Context{}
    case Canonical.SubmissionSuppresses{}: Context{}
    case Canonical.SubmissionUnsuppressed{}: Context{}
    case Canonical.SubmissionReofferable{}: Context{}
    case Canonical.SubmissionNotReofferable{}: Context{}
    case Canonical.SubmissionExpired{}: Context{}
    case Canonical.SubmissionCurrent{}: Context{}
    case Canonical.RevisionReused{_}: Context{}
    case Canonical.RevisionReplaced{_}: Context{}
    case Canonical.RevisionReleased{}: Context{}
    case Canonical.RevisionCurrent{}: Context{}
    case Canonical.RevisionStale{}: Context{}
    case Canonical.RevisionSuperseded{}: Context{}
    case Canonical.RevisionNotSuperseded{}: Context{}
    case Canonical.RevisionGeneration{_}: Context{}
    case Canonical.RevisionCount{_}: Context{}
    case Canonical.CollectorProceed{}: Context{}
    case Canonical.CollectorUnavailable{_}: Context{}
    case Canonical.CollectorFinalProceed{}: Context{}
    case Canonical.CollectorFinalRelease{}: Context{}
    case Canonical.ReuseKeepMember{}: Context{}
    case Canonical.ReuseSetMemberClear{}: Context{}
    case Canonical.ReuseSetMemberFinding{}: Context{}
    case Canonical.ReuseSetMemberUnavailable{}: Context{}
    case Canonical.ReuseSetMemberLost{}: Context{}
    case Canonical.CleanupReady{}: Context{}
    case Canonical.CleanupBusy{}: Context{}
    case Canonical.CleanupCommitted{}: Context{}
    case Canonical.DeliveryReleaseUnacknowledged{}: Context{}
    case Canonical.DeliveryKeepAcknowledged{}: Context{}
    case Canonical.DeliveryAckReady{}: Context{}
    case Canonical.DeliveryAckExpired{}: Context{}
    case Canonical.DeliveryAckEmpty{}: Context{}
    case Canonical.DeliveryFinalReady{}: Context{}
    case Canonical.DeliveryFinalExpired{}: Context{}
    case Canonical.DeliveryFinalEmpty{}: Context{}
    case Canonical.DeliveryRetireAdvice{}: Context{}
    case Canonical.DeliveryKeepRemaining{}: Context{}
    case Canonical.DeliveryKeepForReoffer{}: Context{}
    case Canonical.DeliverySubmissionCandidate{}: Context{}
    case Canonical.DeliverySubmissionRefused{}: Context{}
    case Canonical.DeliveryBatchProceed{}: Context{}
    case Canonical.DeliveryBatchRelease{}: Context{}
    case Canonical.DeliveryCredentialInvalid{}: Context{}
    case Canonical.DeliveryCredentialValid{}: Context{}
    case Canonical.IgnoreCandidate{}: Context{}
    case Canonical.ReleaseCandidate{}: Context{}
    case Canonical.RetireCandidate{}: Context{}
    case Canonical.ContinueCandidate{}: Context{}
    case Canonical.RetainCandidate{}: Context{}
    case Canonical.RoundStopBegun{}: Context{}
    case Canonical.RoundStopRefused{}: Context{}
    case Canonical.RoundActive{}: Context{}
    case Canonical.RoundInactive{}: Context{}
    case Canonical.RoundBarrierRaised{}: Context{}
    case Canonical.RoundBarrierClear{}: Context{}
    case Canonical.RoundStopOwned{}: Context{}
    case Canonical.RoundStopNotOwned{}: Context{}
    case Canonical.RoundStopTerminal{_, _}: Context{}
    case Canonical.RoundExpireCloses{}: Context{}
    case Canonical.RoundExpireKeeps{}: Context{}
    case Canonical.RoundContinuationAvailable{}: Context{}
    case Canonical.RoundContinuationExhausted{}: Context{}
    case Canonical.DeliverySubmissionAllowed{}: Context{}
    case Canonical.DeliverySubmissionDenied{}: Context{}
    case Canonical.DeliveryExistingTokenAllowed{}: Context{}
    case Canonical.DeliveryExistingTokenDenied{}: Context{}
    case Canonical.DeliveryUnreservedStopAllowed{}: Context{}
    case Canonical.DeliveryUnreservedStopDenied{}: Context{}
    case Canonical.ReuseJoinAdvice{}: Context{}
    case Canonical.ReuseJoinPending{}: Context{}
    case Canonical.ReuseJoinClaimed{}: Context{}
    case Canonical.ReuseCached{}: Context{}
    case Canonical.ReuseOwn{}: Context{}
    case Canonical.ReuseClaimed{}: Context{}
    case Canonical.ReuseAttached{}: Context{}
    case Canonical.ReuseReleased{}: Context{}
    case Canonical.ReuseRefused{}: Context{}
    case Canonical.CacheAlready{}: Context{}
    case Canonical.CacheRejected{}: Context{}
    case Canonical.CachePrepared{_}: Context{}
    case Canonical.CacheCommitted{}: Context{}
    case Canonical.CacheDiscarded{_}: Context{}
    case Canonical.NoticeSuppressed{_}: Context{}
    case Canonical.NoticeRejectedFull{}: Context{}
    case Canonical.NoticeCreateKey{}: Context{}
    case Canonical.NoticeCreatePending{_}: Context{}
    case Canonical.NoticeMergePending{_}: Context{}
    case Canonical.NoticeKeepLeased{}: Context{}
    case Canonical.NoticeRefused{}: Context{}
    case Canonical.NoticeCommitted{}: Context{}
    case Canonical.NoticePruned{_, _, _}: Context{}
    case Canonical.NoticeDropped{}: Context{}
    case Canonical.NoticeLeased{}: Context{}
    case Canonical.NoticePendingCleared{}: Context{}
    case Canonical.NoticeSelected{_}: Context{}
    case Canonical.IncludeChoice{_}: Context{}
    case Canonical.FileSelection{_}: Context{}
    case Canonical.FileProtection{_}: Context{}
    case Canonical.CandidateFile{_}: Context{}
    case Canonical.ReviewAdmission{_}: Context{}
    case Canonical.RuleGate{_}: Context{}
    case Canonical.RuleOrder{_}: Context{}
    case Canonical.WriteAuthorized{operation}: Operation{operation}
    case Canonical.WriteRecorded{_}: Context{}
    case Canonical.WaitForOutput{}: Context{}
    case Canonical.ReofferAtStop{}: Context{}
    case Canonical.PartitionRetired{_}: Context{}
    case Canonical.AdmissionForgotten{}: Context{}

def command(before: Canonical.State, after: Canonical.State, value: Canonical.Command, provided: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  resolve(before, after, command_reference(value), provided)
