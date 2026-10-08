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
      select_if(
        Nat.is_eq(owner, partition) && Advicees.bounded(partition),
        id,
        select(tail, partition)
      )

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
      first(
        entry_owner(queued, operation),
        first(entry_owner(running, operation), request_owner(requests, operation))
      )

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
    case Canonical.State{ledger, _, _, _, _, _, _, _, _} Reservation{reservation}: ledger_owner(
      ledger,
      reservation
    )
    case Canonical.State{_, rounds, _, _, _, _, _, _, _} Round{round}: round_owner(rounds, round)
    case Canonical.State{_, _, work, _, _, _, _, collection, _} Advice{+advice}:
      first(work_owner(work, advice), collection_advice_owner(collection, advice))
    case Canonical.State{_, _, _, _, _, _, _, collection, _} Notice{key}: collection_notice_owner(
      collection,
      key
    )
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
    case Canonical.CancelReview{partition, _, _, _}: Direct{partition}
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
    case Canonical.CollectionFindingCheck{_, _, _, partition, _, _, _, _, _, _, _, _, _, _}: Direct{
      partition
    }
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

def event(
  before: Canonical.State,
  after: Canonical.State,
  value: Canonical.CanonicalEvent,
  provided: Maybe<&2, Nat>
) -> Maybe<&2, Nat>:
  resolve(before, after, event_reference(value), provided)

def command_reference(value: Canonical.Output) -> Reference:
  match value:
    case Canonical.EventEstablished{Canonical.CapacityGranted{id, _}}: Reservation{id}
    case Canonical.PolicyDecided{Canonical.CapacityRefused{_, _}}: Context{}
    case Canonical.EventEstablished{Canonical.CapacityResized{id, _}}: Reservation{id}
    case Canonical.EventEstablished{Canonical.CapacityUnitAdmitted{reservation, _, _, _}}: Reservation{
      reservation
    }
    case Canonical.PolicyDecided{Canonical.CapacityUnitRefused{_, _, _, _}}: Context{}
    case Canonical.EventEstablished{Canonical.PermitIssued{_, _}}: Context{}
    case Canonical.PolicyDecided{Canonical.CompletedEditAbsent{}}: Context{}
    case Canonical.EventEstablished{Canonical.CompletedEditSeen{_, _}}: Context{}
    case Canonical.EventEstablished{Canonical.CompletedEditRemembered{_}}: Context{}
    case Canonical.EventEstablished{Canonical.QuietRoundBusy{}}: Context{}
    case Canonical.EventEstablished{Canonical.QuietRoundWaiting{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.QuietRoundExpired{_}}: Context{}
    case Canonical.EventEstablished{Canonical.QuietRoundResetRecorded{}}: Context{}
    case Canonical.EventEstablished{Canonical.PermitConsumed{_}}: Context{}
    case Canonical.EventEstablished{Canonical.PermitReleased{}}: Context{}
    case Canonical.EventEstablished{Canonical.PermitExpired{}}: Context{}
    case Canonical.PolicyDecided{Canonical.PermitKept{}}: Context{}
    case Canonical.EventEstablished{Canonical.PermitRoundClosed{_}}: Context{}
    case Canonical.EventEstablished{Canonical.RoundStarted{id}}: Round{id}
    case Canonical.EventEstablished{Canonical.ObservationAdmitted{id}}: Operation{id}
    case Canonical.EventEstablished{Canonical.ObservationStarted{}}: Context{}
    case Canonical.EventEstablished{Canonical.ObservationCompleted{}}: Context{}
    case Canonical.EventEstablished{Canonical.ObservationInterrupted{}}: Context{}
    case Canonical.ActionRequested{Canonical.Prepare{operation, _}}: Operation{operation}
    case Canonical.PolicyDecided{Canonical.PreparationRefused{}}: Context{}
    case Canonical.EventEstablished{Canonical.UnitAdmitted{operation, _, _, _, _}}: Operation{
      operation
    }
    case Canonical.PolicyDecided{Canonical.UnitRefused{_, _, _, _}}: Context{}
    case Canonical.EventEstablished{Canonical.PreparationReleased{id, _}}: Reservation{id}
    case Canonical.EventEstablished{Canonical.ReviewStarted{}}: Context{}
    case Canonical.EventEstablished{Canonical.JevRequestIssued{partition, _, _, _, _}}: Direct{
      partition
    }
    case Canonical.PolicyDecided{Canonical.JevRequestUnavailable{}}: Context{}
    case Canonical.EventEstablished{Canonical.JevRequestStartRecorded{}}: Context{}
    case Canonical.EventEstablished{Canonical.JevInterruptionRecorded{}}: Context{}
    case Canonical.EventEstablished{Canonical.JevRequestOutcomeRecorded{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.JevObservationIgnored{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReservationReleased{id}}: Reservation{id}
    case Canonical.EventEstablished{Canonical.ReviewRecorded{_}}: Context{}
    case Canonical.EventEstablished{Canonical.FindingRetained{}}: Context{}
    case Canonical.EventEstablished{Canonical.FindingCountRecorded{}}: Context{}
    case Canonical.EventEstablished{Canonical.ClearSettled{}}: Context{}
    case Canonical.EventEstablished{Canonical.StaleClearSettled{}}: Context{}
    case Canonical.EventEstablished{Canonical.StaleFindingRetired{}}: Context{}
    case Canonical.PolicyDecided{Canonical.PreparedSkipped{}}: Context{}
    case Canonical.PolicyDecided{Canonical.PreparedAdmitted{}}: Context{}
    case Canonical.PolicyDecided{Canonical.PreparedCapacityRefused{}}: Context{}
    case Canonical.PolicyDecided{Canonical.EmptyLost{}}: Context{}
    case Canonical.PolicyDecided{Canonical.EmptyAccepted{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FailureBackend{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FailureCredential{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FailureLost{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FailureNone{}}: Context{}
    case Canonical.EventEstablished{Canonical.DispatchStarted{operation, _}}: Operation{operation}
    case Canonical.EventEstablished{Canonical.DispatchDiscarded{operation, _}}: Operation{operation}
    case Canonical.PolicyDecided{Canonical.DiscardNamedOnly{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DiscardAllUnfinished{}}: Context{}
    case Canonical.EventEstablished{Canonical.WaitForWork{}}: Context{}
    case Canonical.ActionRequested{Canonical.CancelWork{operation}}: Operation{operation}
    case Canonical.EventEstablished{Canonical.FinishReady{}}: Context{}
    case Canonical.EventEstablished{Canonical.FinishLimit{}}: Context{}
    case Canonical.EventEstablished{Canonical.StopEnded{}}: Context{}
    case Canonical.EventEstablished{Canonical.CollectionEligible{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionWaiting{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionRetireCredential{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionRetainCredential{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionCandidate{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionSkip{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionBefore{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionEqual{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionAfter{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionExpired{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionCurrent{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionFits{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionLimited{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionFindingSelected{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionFindingRetained{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionFindingLimited{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionFindingExpired{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionNoticeIncluded{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionNoticeSkipped{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionNoticeStopped{}}: Context{}
    case Canonical.EventEstablished{Canonical.CollectionLeaseReserved{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionLeaseRefused{}}: Context{}
    case Canonical.EventEstablished{Canonical.CollectionLeaseReleased{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionLeaseKept{}}: Context{}
    case Canonical.EventEstablished{Canonical.CollectionAdviceRetired{}}: Context{}
    case Canonical.EventEstablished{Canonical.CollectionBackgroundClaimed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionBackgroundRefused{}}: Context{}
    case Canonical.EventEstablished{Canonical.CollectionBackgroundReleased{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectionBackgroundKept{}}: Context{}
    case Canonical.EventEstablished{Canonical.FinishReserved{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FinishNotices{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FinishAllowedNoAdvice{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FinishAllowedDeadline{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FinishAllowedUnavailable{}}: Context{}
    case Canonical.PolicyDecided{Canonical.FinishRefused{}}: Context{}
    case Canonical.EventEstablished{Canonical.FinishReleased{}}: Context{}
    case Canonical.EventEstablished{Canonical.FinishAuthorized{}}: Context{}
    case Canonical.EventEstablished{Canonical.FinishRecorded{_}}: Context{}
    case Canonical.EventEstablished{Canonical.FinishEnded{}}: Context{}
    case Canonical.EventEstablished{Canonical.ContinuationConsumed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ContinuationRefused{}}: Context{}
    case Canonical.EventEstablished{Canonical.SubmissionBegun{}}: Context{}
    case Canonical.EventEstablished{Canonical.SubmissionAuthorized{}}: Context{}
    case Canonical.EventEstablished{Canonical.SubmissionRecorded{}}: Context{}
    case Canonical.EventEstablished{Canonical.SubmissionReleased{}}: Context{}
    case Canonical.PolicyDecided{Canonical.SubmissionRefused{}}: Context{}
    case Canonical.EventEstablished{Canonical.SubmissionForgotten{}}: Context{}
    case Canonical.PolicyDecided{Canonical.SubmissionSuppresses{}}: Context{}
    case Canonical.PolicyDecided{Canonical.SubmissionUnsuppressed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.SubmissionReofferable{}}: Context{}
    case Canonical.PolicyDecided{Canonical.SubmissionNotReofferable{}}: Context{}
    case Canonical.PolicyDecided{Canonical.SubmissionExpired{}}: Context{}
    case Canonical.PolicyDecided{Canonical.SubmissionCurrent{}}: Context{}
    case Canonical.EventEstablished{Canonical.RevisionReused{_}}: Context{}
    case Canonical.EventEstablished{Canonical.RevisionReplaced{_}}: Context{}
    case Canonical.EventEstablished{Canonical.RevisionReleased{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RevisionCurrent{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RevisionStale{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RevisionSuperseded{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RevisionNotSuperseded{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RevisionGeneration{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.RevisionCount{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectorProceed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectorUnavailable{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectorFinalProceed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CollectorFinalRelease{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ReuseKeepMember{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ReuseSetMemberClear{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ReuseSetMemberFinding{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ReuseSetMemberUnavailable{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ReuseSetMemberLost{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CleanupReady{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CleanupBusy{}}: Context{}
    case Canonical.EventEstablished{Canonical.CleanupCommitted{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryReleaseUnacknowledged{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryKeepAcknowledged{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryAckReady{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryAckExpired{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryAckEmpty{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryFinalReady{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryFinalExpired{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryFinalEmpty{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryRetireAdvice{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryKeepRemaining{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryKeepForReoffer{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliverySubmissionCandidate{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliverySubmissionRefused{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryBatchProceed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryBatchRelease{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryCredentialInvalid{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryCredentialValid{}}: Context{}
    case Canonical.PolicyDecided{Canonical.IgnoreCandidate{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ReleaseCandidate{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RetireCandidate{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ContinueCandidate{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RetainCandidate{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundStopBegun{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundStopRefused{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundActive{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundInactive{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundBarrierRaised{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundBarrierClear{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundStopOwned{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundStopNotOwned{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundStopTerminal{_, _}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundExpireCloses{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundExpireKeeps{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundContinuationAvailable{}}: Context{}
    case Canonical.PolicyDecided{Canonical.RoundContinuationExhausted{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliverySubmissionAllowed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliverySubmissionDenied{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryExistingTokenAllowed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryExistingTokenDenied{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryUnreservedStopAllowed{}}: Context{}
    case Canonical.PolicyDecided{Canonical.DeliveryUnreservedStopDenied{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReuseAdviceJoined{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReusePendingJoined{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReuseClaimedJoined{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReuseCacheHit{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReuseOwned{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReuseClaimed{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReuseAttached{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReuseReleased{}}: Context{}
    case Canonical.PolicyDecided{Canonical.ReuseRefused{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CacheAlready{}}: Context{}
    case Canonical.PolicyDecided{Canonical.CacheRejected{}}: Context{}
    case Canonical.EventEstablished{Canonical.CachePrepared{_}}: Context{}
    case Canonical.EventEstablished{Canonical.CacheCommitted{}}: Context{}
    case Canonical.EventEstablished{Canonical.CacheDiscarded{_}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticeSuppressed{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.NoticeRejectedFull{}}: Context{}
    case Canonical.ActionRequested{Canonical.CreateNoticeKey{}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticePendingCreated{_}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticePendingMerged{_}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticeLeaseKept{}}: Context{}
    case Canonical.PolicyDecided{Canonical.NoticeRefused{}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticeCommitted{}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticePruned{_, _, _}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticeDropped{}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticeLeased{}}: Context{}
    case Canonical.EventEstablished{Canonical.NoticePendingCleared{}}: Context{}
    case Canonical.PolicyDecided{Canonical.NoticeSelected{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.IncludeChoice{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.FileSelection{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.FileProtection{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.CandidateFile{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.ReviewAdmission{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.RuleGate{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.RuleOrder{_}}: Context{}
    case Canonical.EventEstablished{Canonical.WriteAuthorized{operation}}: Operation{operation}
    case Canonical.EventEstablished{Canonical.WriteRecorded{_}}: Context{}
    case Canonical.PolicyDecided{Canonical.WaitForOutput{}}: Context{}
    case Canonical.EventEstablished{Canonical.ReofferAtStop{}}: Context{}
    case Canonical.EventEstablished{Canonical.PartitionRetired{_}}: Context{}
    case Canonical.EventEstablished{Canonical.AdmissionForgotten{}}: Context{}

def command(
  before: Canonical.State,
  after: Canonical.State,
  value: Canonical.Output,
  provided: Maybe<&2, Nat>
) -> Maybe<&2, Nat>:
  resolve(before, after, command_reference(value), provided)
