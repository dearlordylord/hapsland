import Base
import ./fixtures.bend as Fixtures
import ../Admission.bend as Admission
import ../Handoff.bend as Handoff
import ../Canonical.bend as Canonical
import ../Collection.bend as Collection
import ../CollectionState.bend as CollectionState
import ../Dispatch.bend as Dispatch
import ../Ledger.bend as Ledger
import ../Reuse.bend as Reuse

# Independent identity-preserving projections, not a second lifecycle machine.
def findings(items: List<&2, Canonical.ReviewWorkRecord>) -> List<&2, Canonical.ReviewWorkRecord>:
  match items:
    case Nil{}: Nil{}
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.PendingFinding{count}, parent} <> rest:
      Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.PendingFinding{count},
        parent} <> findings(rest)
    case _ <> rest: findings(rest)

def other_finding_put(item: Canonical.ReviewWorkRecord, rest: List<&2, Canonical.ReviewWorkRecord>,
  same: Bool) -> List<&2, Canonical.ReviewWorkRecord>:
  match same:
    case True{}: rest
    case False{}: item <> rest

def other_findings(
  +operation: Nat,
  items: List<&2, Canonical.ReviewWorkRecord>
) -> List<&2, Canonical.ReviewWorkRecord>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest:
      match item:
        case Canonical.ReviewWorkRecord{_, _, _, op, _, Canonical.PendingFinding{_}, _}:
          other_finding_put(item, other_findings(operation, rest), Nat.is_eq(op, operation))
        case _: other_findings(operation, rest)

def work(state: Canonical.State) -> List<&2, Canonical.ReviewWorkRecord>:
  match state:
    case Canonical.State{_, _, work, _, _, _, _, _, _}: work

def collection_eligible(step: Canonical.Step) -> Bool:
  match step:
    case Canonical.Advanced{_, Canonical.EventEstablished{Canonical.CollectionEligible{}} <> Nil{}}: True{}
    case _: False{}

# Freshness and finding ownership are separate premises at this boundary.
def ordinary_ready(+state: Canonical.State, advice: Nat, partition: Nat,
    lifetime: Nat, round: Nat, observation: Nat, joined_pending: Bool) -> Bool:
  collection_eligible(Canonical.collection_ready(state, advice, partition,
    lifetime, round, observation, joined_pending))

# A host reports terminal evaluation facts to every still-current member.
type Member is Data:
  Member{id: Nat, revision: Bool, advice: Bool}

type Reply is Data:
  Reply{id: Nat, disposition: Reuse.JoinedDisposition}

def terminal_state(outcome: Canonical.Outcome) -> Reuse.JoinedState:
  match outcome:
    case Canonical.Finding{}: Reuse.JoinedFinding{}
    case Canonical.Clear{}: Reuse.JoinedClear{}
    case _: Reuse.JoinedUnavailable{}

def reply(member: Member, outcome: Canonical.Outcome) -> Reply:
  match member:
    case Member{id, revision, advice}:
      Reply{id, Reuse.joined_disposition(terminal_state(outcome), False{}, revision, advice)}

def replies(members: List<&2, Member>, +outcome: Canonical.Outcome) -> List<&2, Reply>:
  match members:
    case Nil{}: Nil{}
    case member <> rest: reply(member, outcome) <> replies(rest, outcome)

# Obvious specification: incomplete identity yields Lost, never clear.
def expected_disposition(outcome: Canonical.Outcome, revision: Bool,
  advice: Bool) -> Reuse.JoinedDisposition:
  match outcome revision advice:
    case Canonical.Finding{} True{} True{}: Reuse.SetJoinedFinding{}
    case Canonical.Finding{} _ _: Reuse.SetJoinedLost{}
    case Canonical.Clear{} True{} _: Reuse.SetJoinedClear{}
    case Canonical.Clear{} False{} _: Reuse.SetJoinedLost{}
    case _ _ _: Reuse.SetJoinedUnavailable{}

def expected_reply(member: Member, outcome: Canonical.Outcome) -> Reply:
  match member:
    case Member{id, revision, advice}: Reply{id, expected_disposition(outcome, revision, advice)}

def expected_replies(members: List<&2, Member>, +outcome: Canonical.Outcome) -> List<&2, Reply>:
  match members:
    case Nil{}: Nil{}
    case member <> rest: expected_reply(member, outcome) <> expected_replies(rest, outcome)

def resolved_reply(reply: Reply) -> Bool:
  match reply:
    case Reply{_, Reuse.KeepJoined{}}: False{}
    case _: True{}

def all_resolved(replies: List<&2, Reply>) -> Bool:
  match replies:
    case Nil{}: True{}
    case reply <> rest: Bool.and(resolved_reply(reply), all_resolved(rest))

# Only matching request settlement may drive this resource-release trace.
def release_next(result: Ledger.LedgerResult,
    next: Ledger.Ledger -> Maybe<&2, Ledger.Ledger>) -> Maybe<&2, Ledger.Ledger>:
  match result:
    case Ledger.Granted{state, _}: next(state)
    case Ledger.Rejected{_}: None{}

def release_charges(
  charges: List<&2, Ledger.ReviewCapacityReservationRecord>,
  +ledger: Ledger.Ledger
) -> Maybe<&2,
  Ledger.Ledger>:
  match charges:
    case Nil{}: Some{ledger}
    case Ledger.ReviewCapacityReservationRecord{id, _, _, _} <> rest:
      release_next(Ledger.release(ledger, id), state => release_charges(rest, state))

# A shrinking waiting prefix cannot be overtaken by arbitrary later arrivals.
def Waiting(
  prefix: List<&2, Dispatch.ScheduledReviewWork>,
  +running: List<&2, Dispatch.ScheduledReviewWork>
) -> Type:
  match prefix:
    case Nil{}: Unit
    case +entry <> rest:
      {False{} == Dispatch.can_start(entry, running) : Bool} & Waiting(rest, running)

# Unique transient IDs, disjoint from legitimate retained owners.
def Absent(+id: Nat, charges: List<&2, Ledger.ReviewCapacityReservationRecord>) -> Type:
  match charges:
    case Nil{}: Unit
    case Ledger.ReviewCapacityReservationRecord{current, _, _, _} <> rest:
      {False{} == Nat.is_eq(current, id) : Bool} & Absent(id, rest)

def Transient(
  charges: List<&2, Ledger.ReviewCapacityReservationRecord>,
  +retained: List<&2, Ledger.ReviewCapacityReservationRecord>
) -> Type:
  match charges:
    case Nil{}: Unit
    case Ledger.ReviewCapacityReservationRecord{+id, _, _, _} <> +rest:
      Absent(id, List.append(&2, Ledger.ReviewCapacityReservationRecord, rest, retained)) & Transient(
        rest,
        retained
      )

# The trace also requires each command that enables the next host operation.
# A state-only journey would miss a reducer that silently dropped Prepare.
type Required is Data:
  NoCommand{}
  NeedIssuePermit{}
  NeedConsumePermit{}
  NeedAdmitObservation{}
  NeedQueueDispatch{}
  NeedStartObservation{}
  NeedBeginObservedPreparation{}
  NeedPreparationCompleted{}
  NeedCompleteObservation{}
  NeedReviewServiceRequestReady{}
  NeedReviewServiceRequestStarted{}
  NeedReviewServiceRequestInterrupted{}
  NeedReviewServiceRequestSettled{}
  NeedCollectionReady{}
  NeedCollectionReserveLease{}
  NeedSubmissionBegin{}
  NeedSubmissionAuthorize{}
  NeedSubmissionTerminal{}
  NeedCollectionReleaseLease{}

def required(event: Canonical.CanonicalEvent) -> Required:
  match event:
    case Canonical.IssuePermit{_, _, _, _, _, _, _, _}: NeedIssuePermit{}
    case Canonical.ConsumePermit{_, _, _, _, _}: NeedConsumePermit{}
    case Canonical.AdmitObservation{_, _, _}: NeedAdmitObservation{}
    case Canonical.QueueDispatch{_, _, _, _}: NeedQueueDispatch{}
    case Canonical.StartObservation{_, _, _, _}: NeedStartObservation{}
    case Canonical.BeginObservedPreparation{_, _, _, _, _}: NeedBeginObservedPreparation{}
    case Canonical.PreparationCompleted{_, _, _, _, _}: NeedPreparationCompleted{}
    case Canonical.CompleteObservation{_, _, _, _}: NeedCompleteObservation{}
    case Canonical.ReviewServiceRequestReady{_, _, _, _, _, _, _, _, _, _}: NeedReviewServiceRequestReady{}
    case Canonical.ReviewServiceRequestStarted{_, _, _, _, _}: NeedReviewServiceRequestStarted{}
    case Canonical.ReviewServiceRequestInterrupted{_, _, _, _, _}: NeedReviewServiceRequestInterrupted{}
    case Canonical.ReviewServiceRequestSettled{_, _, _, _, _, _, _}: NeedReviewServiceRequestSettled{}
    case Canonical.CollectionReady{_, _, _, _, _, _}: NeedCollectionReady{}
    case Canonical.CollectionReserveLease{_, _}: NeedCollectionReserveLease{}
    case Canonical.SubmissionBegin{_, _, _, _, _, _, _, _}: NeedSubmissionBegin{}
    case Canonical.SubmissionAuthorize{_, _}: NeedSubmissionAuthorize{}
    case Canonical.SubmissionTerminal{_, _, _}: NeedSubmissionTerminal{}
    case Canonical.CollectionReleaseLease{_, _}: NeedCollectionReleaseLease{}
    case _: NoCommand{}

def command_matches(required: Required, command: Canonical.Output) -> Bool:
  match required command:
    case NeedIssuePermit{} Canonical.EventEstablished{Canonical.PermitIssued{_, _}}: True{}
    case NeedConsumePermit{} Canonical.EventEstablished{Canonical.PermitConsumed{_}}: True{}
    case NeedAdmitObservation{} Canonical.EventEstablished{Canonical.ObservationAdmitted{_}}: True{}
    case NeedQueueDispatch{} Canonical.EventEstablished{Canonical.DispatchStarted{_, _}}: True{}
    case NeedStartObservation{} Canonical.EventEstablished{Canonical.ObservationStarted{}}: True{}
    case NeedBeginObservedPreparation{} Canonical.ResidentActionRequested{Canonical.Prepare{_, _}}: True{}
    case NeedPreparationCompleted{} Canonical.EventEstablished{
      Canonical.UnitAdmitted{_, _, _, _, _}
    }: True{}
    case NeedCompleteObservation{} Canonical.EventEstablished{Canonical.ObservationCompleted{}}: True{}
    case NeedReviewServiceRequestReady{} Canonical.EventEstablished{
      Canonical.ReviewServiceRequestIssued{_, _, _, _, _}
    }: True{}
    case NeedReviewServiceRequestStarted{} Canonical.EventEstablished{
      Canonical.ReviewServiceRequestStartRecorded{}
    }: True{}
    case NeedReviewServiceRequestInterrupted{} Canonical.EventEstablished{
      Canonical.ReviewServiceRequestInterruptionRecorded{}
    }: True{}
    case NeedReviewServiceRequestSettled{} Canonical.EventEstablished{
      Canonical.ReviewServiceRequestOutcomeRecorded{_}
    }: True{}
    case NeedCollectionReady{} Canonical.EventEstablished{Canonical.CollectionEligible{}}: True{}
    case NeedCollectionReserveLease{} Canonical.EventEstablished{
      Canonical.CollectionLeaseReserved{}
    }: True{}
    case NeedSubmissionBegin{} Canonical.EventEstablished{Canonical.SubmissionBegun{}}: True{}
    case NeedSubmissionAuthorize{} Canonical.EventEstablished{Canonical.SubmissionAuthorized{}}: True{}
    case NeedSubmissionTerminal{} Canonical.EventEstablished{Canonical.SubmissionRecorded{}}: True{}
    case NeedCollectionReleaseLease{} Canonical.EventEstablished{
      Canonical.CollectionLeaseReleased{}
    }: True{}
    case _ _: False{}

def has_command(+required: Required, outputs: List<&2, Canonical.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case command <> rest: Bool.or(command_matches(required, command), has_command(required, rest))

def commands_ready(+required: Required, outputs: List<&2, Canonical.Output>) -> Bool:
  match required:
    case NoCommand{}: True{}
    case _: has_command(required, outputs)

def event_state(+event: Canonical.CanonicalEvent, step: Canonical.Step) -> Maybe<&2,
  Canonical.State>:
  match step:
    case Canonical.Advanced{state, outputs}: Bool.pick(Maybe<&2, Canonical.State>,
      commands_ready(required(event), outputs), Some{state}, None{})
    case Canonical.Rejected{_, _}: None{}

# A trace fails at the first rejected production transition.
def advance(result: Maybe<&2, Canonical.State>, next: Canonical.State -> Maybe<&2,
  Canonical.State>) -> Maybe<&2, Canonical.State>:
  match result:
    case Some{state}: next(state)
    case None{}: None{}

def run_events(events: List<&2, Canonical.CanonicalEvent>, state: Canonical.State) -> Maybe<&2,
  Canonical.State>:
  match events:
    case Nil{}: Some{state}
    case +event <> rest: advance(event_state(event, Canonical.step(state, event)),
      run_events(rest))

def request_start_events(
  +partition: Nat,
  outcome: Canonical.ReviewServiceRequestOutcome
) -> List<&2,
  Canonical.CanonicalEvent>:
  match outcome:
    case Canonical.NeverSent{}: Nil{}
    case Canonical.RequestInterrupted{}: Canonical.ReviewServiceRequestStarted{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      4n
    } <> Canonical.ReviewServiceRequestInterrupted{(1n + partition : Nat), 1n, 1n, 3n, 4n} <> Nil{}
    case _: Canonical.ReviewServiceRequestStarted{(1n + partition : Nat), 1n, 1n, 3n, 4n} <> Nil{}

def delivery_events(+partition: Nat, +fingerprint: Nat,
  outcome: Canonical.ReviewServiceRequestOutcome) -> List<&2, Canonical.CanonicalEvent>:
  match outcome:
    case Canonical.RequestFinding{}:
      Canonical.CollectionReady{3n, (1n + partition : Nat), 1n, 1n, 1n, False{}} <>
      Canonical.CollectionReserveLease{3n, 1n} <>
      Canonical.SubmissionBegin{3n, (1n + partition : Nat), 1n, 1n, Handoff.Edit{}, False{},
        (1n + fingerprint : Nat) <> Nil{}, 3n <> Nil{}} <>
      Canonical.SubmissionAuthorize{3n, 1n} <>
      Canonical.SubmissionTerminal{3n, 1n, True{}} <>
      Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}
    case _: Nil{}

def result_events(+partition: Nat, +fingerprint: Nat,
  +outcome: Canonical.ReviewServiceRequestOutcome) -> List<&2, Canonical.CanonicalEvent>:
  List.append(
    &2,
    Canonical.CanonicalEvent,
    request_start_events(partition, outcome),
    Canonical.ReviewServiceRequestSettled{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      4n,
      outcome,
      True{}
    } <> Canonical.DispatchSettled{
      (1n + partition : Nat),
      1n,
      1n,
      3n
    } <> delivery_events(partition, fingerprint, outcome)
  )

def journey_events(+partition: Nat, +size: Nat, +fingerprint: Nat,
  +outcome: Canonical.ReviewServiceRequestOutcome) -> List<&2, Canonical.CanonicalEvent>:
  Canonical.IssuePermit{(1n + partition : Nat), 1n, 1n, 1n, 10n, 1n, 0n,
    Admission.ProspectiveFacts{True{}, 5n, 1n, 1n, 1n, 1n}} <>
  Canonical.ConsumePermit{(1n + partition : Nat), 1n, 1n, 1n, 1n} <>
  Canonical.AdmitObservation{(1n + partition : Nat), 1n, 1n} <>
  Canonical.QueueDispatch{(1n + partition : Nat), 1n, 1n, 1n} <>
  Canonical.StartObservation{(1n + partition : Nat), 1n, 1n, 1n} <>
  Canonical.BeginObservedPreparation{(1n + partition : Nat), 1n, 1n, 1n, (1n + size : Nat)} <>
  Canonical.PreparationCompleted{(1n + partition : Nat), 1n, 1n, 2n, (1n + size : Nat) <> Nil{}} <>
  Canonical.CompleteObservation{(1n + partition : Nat), 1n, 1n, 1n} <>
  Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 1n} <>
  Canonical.QueueDispatch{(1n + partition : Nat), 1n, 1n, 3n} <>
  Canonical.ReviewServiceRequestReady{
    (1n + partition : Nat),
    1n,
    1n,
    3n,
    True{},
    True{},
    True{},
    True{},
    True{},
    True{}
  } <>
  result_events(partition, fingerprint, outcome)

def expected_journey(+partition: Nat, +size: Nat, +fingerprint: Nat, +limits: Ledger.Limits,
  outcome: Canonical.ReviewServiceRequestOutcome) -> Canonical.State:
  match outcome:
    case Canonical.RequestFinding{}: Fixtures.final_finding(partition, size, fingerprint, limits)
    case _: Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)

def capacity_after_release(result: Maybe<&2, Ledger.Ledger>, partition: Nat,
    bytes: Nat, purpose: Ledger.Purpose) -> Maybe<&2, Ledger.LedgerResult>:
  match result:
    case None{}: None{}
    case Some{ledger}: Some{Ledger.reserve_for(ledger, partition, bytes, purpose)}

def recover_capacity(
  +charges: List<&2, Ledger.ReviewCapacityReservationRecord>,
  retained: List<&2, Ledger.ReviewCapacityReservationRecord>,
  limits: Ledger.Limits,
  next_id: Nat,
  partition: Nat,
  bytes: Nat,
  purpose: Ledger.Purpose
) -> Maybe<&2, Ledger.LedgerResult>:
  capacity_after_release(
    release_charges(
      charges,
      Ledger.Ledger{
        limits,
        next_id,
        List.append(&2, Ledger.ReviewCapacityReservationRecord, charges, retained)
      }
    ),
    partition,
    bytes,
    purpose
  )

# Physical permit projection used to check logical cancellation independently.
def dispatched_requests(
  result: Dispatch.DispatchResult
) -> List<&2, Dispatch.ReviewServiceRequestRecord>:
  match result:
    case Dispatch.Advanced{Dispatch.State{_, _, _, _, requests}, _}: requests
    case Dispatch.Denied{Dispatch.State{_, _, _, _, requests}}: requests

# Independent projection: retain every record whose operation is not the target,
# including unfinished stages, completed findings, and original ordering.
def keep_other(
  item: Canonical.ReviewWorkRecord,
  tail: List<&2, Canonical.ReviewWorkRecord>,
  same: Bool
) -> List<&2, Canonical.ReviewWorkRecord>:
  match same:
    case True{}: tail
    case False{}: item <> tail

def other_work(
  +operation: Nat,
  items: List<&2, Canonical.ReviewWorkRecord>
) -> List<&2, Canonical.ReviewWorkRecord>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest:
      match item:
        case Canonical.ReviewWorkRecord{_, _, _, op, _, _, _}:
          keep_other(item, other_work(operation, rest), Nat.is_eq(op, operation))

def rounds(state: Canonical.State) -> List<&2, Canonical.Round>:
  match state:
    case Canonical.State{_, rounds, _, _, _, _, _, _, _}: rounds

# Independent expected result: one new observation record, exact previous state,
# one corresponding admission event, and the operation allocator incremented.
def expected_observation(state: Canonical.State, +partition: Nat, +lifetime: Nat,
  +round: Nat) -> Canonical.Step:
  match state:
    case Canonical.State{ledger, rounds, work, next_round, +next_operation,
      admissions, dispatch, collection, history}:
      Canonical.Advanced{
        Canonical.State{ledger, rounds,
          Canonical.ReviewWorkRecord{partition, lifetime, round, next_operation, 0n,
            Canonical.AwaitingSourceRead{}, 0n} <> work,
          next_round, (next_operation + 1n : Nat), admissions, dispatch,
          collection, history},
        Canonical.EventEstablished{Canonical.ObservationAdmitted{next_operation}} <> Nil{}
      }


# Both reducer outcomes retain an explicit resulting state.
def step_state(result: Canonical.Step) -> Canonical.State:
  match result:
    case Canonical.Advanced{state, _}: state
    case Canonical.Rejected{state, _}: state

def UnmatchedRequests(prefix: List<&2, Dispatch.ReviewServiceRequestRecord>, +partition: Nat,
    +lifetime: Nat, +round: Nat, +operation: Nat, +request: Nat) -> Type:
  match prefix:
    case Nil{}: Unit
    case head <> rest:
      {False{} == Dispatch.request_matches(head, partition, lifetime, round,
        operation, request) : Bool} &
        UnmatchedRequests(rest, partition, lifetime, round, operation, request)
