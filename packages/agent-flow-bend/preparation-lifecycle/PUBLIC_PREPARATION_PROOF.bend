import Base
import ./CanonicalResolverOwner.bend as Owner
import ../Canonical.bend as C
import ./PUBLIC_PREPARATION_LAWS.bend as Laws

def started_exact(
  +result: Owner.Step,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +observation: Nat,
  +bytes: Nat
) -> {
  Owner.public_preparation_begin_started(result, partition, lifetime, round, observation, bytes)
  == Laws.begin_after_start(result, partition, lifetime, round, observation, bytes)
  : List<&2, Owner.Step>
}:
  match result:
    case Owner.Advanced{_, _, _}: {==}
    case Owner.Rejected{_, _}: {==}

def outputs_exact(
  +state: Owner.State,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +bytes: Nat,
  +outputs: List<&2, C.Output>
) -> {
  Owner.public_preparation_begin_observed(state, partition, lifetime, round, bytes, outputs)
  == Laws.begin_from_outputs(state, partition, lifetime, round, bytes, outputs)
  : List<&2, Owner.Step>
}:
  match outputs:
    case Nil{}: {==}
    case C.EventEstablished{C.ObservationAdmitted{+observation}} <> _:
      started_exact(
        Owner.canonical_event(state, C.StartObservation{partition, lifetime, round, observation}),
        partition,
        lifetime,
        round,
        observation,
        bytes
      )
    case C.EventEstablished{C.CapacityGranted{_, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CapacityResized{_, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CapacityUnitAdmitted{_, _, _, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.PermitIssued{_, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CompletedEditSeen{_, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CompletedEditRemembered{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.QuietRoundBusy{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.QuietRoundWaiting{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.QuietRoundResetRecorded{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.PermitConsumed{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.PermitReleased{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.PermitExpired{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.PermitRoundClosed{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.RoundStarted{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ObservationStarted{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ObservationCompleted{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ObservationInterrupted{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.UnitAdmitted{_, _, _, _, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.PreparationReleased{_, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReviewStarted{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.JevRequestIssued{_, _, _, _, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.JevRequestStartRecorded{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.JevInterruptionRecorded{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.JevRequestOutcomeRecorded{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReservationReleased{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReviewRecorded{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FindingRetained{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FindingCountRecorded{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ClearSettled{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.StaleClearSettled{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.StaleFindingRetired{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.DispatchStarted{_, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.DispatchDiscarded{_, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.WaitForWork{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FinishReady{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FinishLimit{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.StopEnded{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CollectionEligible{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CollectionLeaseReserved{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CollectionLeaseReleased{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CollectionAdviceRetired{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CollectionBackgroundClaimed{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CollectionBackgroundReleased{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FinishReserved{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FinishReleased{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FinishAuthorized{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FinishRecorded{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.FinishEnded{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ContinuationConsumed{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.SubmissionBegun{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.SubmissionAuthorized{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.SubmissionRecorded{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.SubmissionReleased{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.SubmissionForgotten{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.RevisionReused{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.RevisionReplaced{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.RevisionReleased{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CleanupCommitted{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReuseAdviceJoined{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReusePendingJoined{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReuseClaimedJoined{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReuseCacheHit{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReuseOwned{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReuseClaimed{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReuseAttached{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReuseReleased{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CachePrepared{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CacheCommitted{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.CacheDiscarded{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticeSuppressed{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticePendingCreated{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticePendingMerged{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticeLeaseKept{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticeCommitted{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticePruned{_, _, _}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticeDropped{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticeLeased{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.NoticePendingCleared{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.WriteAuthorized{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.WriteRecorded{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.ReofferAtStop{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.PartitionRetired{_}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.EventEstablished{C.AdmissionForgotten{}} <> rest: outputs_exact(
      state,
      partition,
      lifetime,
      round,
      bytes,
      rest
    )
    case C.ActionRequested{_} <> rest: outputs_exact(state, partition, lifetime, round, bytes, rest)
    case C.PolicyDecided{_} <> rest: outputs_exact(state, partition, lifetime, round, bytes, rest)

def admitted_exact(
  +result: Owner.Step,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +bytes: Nat
) -> {
  Owner.public_preparation_begin_admitted(result, partition, lifetime, round, bytes)
  == Laws.begin_after_admit(result, partition, lifetime, round, bytes)
  : List<&2, Owner.Step>
}:
  match result:
    case Owner.Rejected{_, _}: {==}
    case Owner.Advanced{+state, +outputs, _}:
      Equal.cong(List<&2, Owner.Step>, List<&2, Owner.Step>, tail => result <> tail,
        Owner.public_preparation_begin_observed(state, partition, lifetime, round, bytes, outputs),
        Laws.begin_from_outputs(state, partition, lifetime, round, bytes, outputs),
        outputs_exact(state, partition, lifetime, round, bytes, outputs))

def Laws.begin_exact(state, partition, lifetime, round, bytes):
  admitted_exact(
    Owner.canonical_event(state, C.AdmitObservation{partition, lifetime, round}),
    partition,
    lifetime,
    round,
    bytes
  )

def completed_exact(
  +result: Owner.Step,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +observation: Nat
) -> {
  Owner.public_preparation_complete_prepared(result, partition, lifetime, round, observation)
  == Laws.complete_after_prepared(result, partition, lifetime, round, observation)
  : List<&2, Owner.Step>
}:
  match result:
    case Owner.Advanced{_, _, _}: {==}
    case Owner.Rejected{_, _}: {==}

def Laws.complete_exact(state, partition, lifetime, round, operation, observation):
  completed_exact(
    Owner.canonical_event(
      state,
      C.PreparationCompleted{partition, lifetime, round, operation, Nil{}}
    ),
    partition,
    lifetime,
    round,
    observation
  )
