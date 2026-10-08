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
def findings(items: List<&2, Canonical.Work>) -> List<&2, Canonical.Work>:
  match items:
    case Nil{}: Nil{}
    case Canonical.Work{p, l, r, op, charge, Canonical.PendingFinding{count}, parent} <> rest:
      Canonical.Work{p, l, r, op, charge, Canonical.PendingFinding{count},
        parent} <> findings(rest)
    case _ <> rest: findings(rest)

def other_finding_put(item: Canonical.Work, rest: List<&2, Canonical.Work>,
  same: Bool) -> List<&2, Canonical.Work>:
  match same:
    case True{}: rest
    case False{}: item <> rest

def other_findings(+operation: Nat, items: List<&2, Canonical.Work>) -> List<&2, Canonical.Work>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest:
      match item:
        case Canonical.Work{_, _, _, op, _, Canonical.PendingFinding{_}, _}:
          other_finding_put(item, other_findings(operation, rest), Nat.is_eq(op, operation))
        case _: other_findings(operation, rest)

def work(state: Canonical.State) -> List<&2, Canonical.Work>:
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

# Only matching physical settlement may drive this resource-release trace.
def release_next(result: Ledger.LedgerResult,
    next: Ledger.Ledger -> Maybe<&2, Ledger.Ledger>) -> Maybe<&2, Ledger.Ledger>:
  match result:
    case Ledger.Granted{state, _}: next(state)
    case Ledger.Rejected{_}: None{}

def release_charges(charges: List<&2, Ledger.Charge>, +ledger: Ledger.Ledger) -> Maybe<&2,
  Ledger.Ledger>:
  match charges:
    case Nil{}: Some{ledger}
    case Ledger.Charge{id, _, _, _} <> rest:
      release_next(Ledger.release(ledger, id), state => release_charges(rest, state))

# A shrinking waiting prefix cannot be overtaken by arbitrary later arrivals.
def Waiting(prefix: List<&2, Dispatch.Entry>, +running: List<&2, Dispatch.Entry>) -> Type:
  match prefix:
    case Nil{}: Unit
    case +entry <> rest:
      {False{} == Dispatch.can_start(entry, running) : Bool} & Waiting(rest, running)

# Unique transient IDs, disjoint from legitimate retained owners.
def Absent(+id: Nat, charges: List<&2, Ledger.Charge>) -> Type:
  match charges:
    case Nil{}: Unit
    case Ledger.Charge{current, _, _, _} <> rest:
      {False{} == Nat.is_eq(current, id) : Bool} & Absent(id, rest)

def Transient(charges: List<&2, Ledger.Charge>, +retained: List<&2, Ledger.Charge>) -> Type:
  match charges:
    case Nil{}: Unit
    case Ledger.Charge{+id, _, _, _} <> +rest:
      Absent(id, List.append(&2, Ledger.Charge, rest, retained)) & Transient(rest, retained)

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
  NeedJevRequestReady{}
  NeedJevRequestStarted{}
  NeedJevRequestInterrupted{}
  NeedJevRequestSettled{}
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
    case Canonical.JevRequestReady{_, _, _, _, _, _, _, _, _, _}: NeedJevRequestReady{}
    case Canonical.JevRequestStarted{_, _, _, _, _}: NeedJevRequestStarted{}
    case Canonical.JevRequestInterrupted{_, _, _, _, _}: NeedJevRequestInterrupted{}
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}: NeedJevRequestSettled{}
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
    case NeedBeginObservedPreparation{} Canonical.ActionRequested{Canonical.Prepare{_, _}}: True{}
    case NeedPreparationCompleted{} Canonical.EventEstablished{
      Canonical.UnitAdmitted{_, _, _, _, _}
    }: True{}
    case NeedCompleteObservation{} Canonical.EventEstablished{Canonical.ObservationCompleted{}}: True{}
    case NeedJevRequestReady{} Canonical.EventEstablished{
      Canonical.JevRequestIssued{_, _, _, _, _}
    }: True{}
    case NeedJevRequestStarted{} Canonical.EventEstablished{Canonical.JevRequestStartRecorded{}}: True{}
    case NeedJevRequestInterrupted{} Canonical.EventEstablished{
      Canonical.JevInterruptionRecorded{}
    }: True{}
    case NeedJevRequestSettled{} Canonical.EventEstablished{Canonical.JevRequestOutcomeRecorded{_}}: True{}
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

def request_start_events(+partition: Nat, outcome: Canonical.RequestOutcome) -> List<&2,
  Canonical.CanonicalEvent>:
  match outcome:
    case Canonical.NeverSent{}: Nil{}
    case Canonical.RequestInterrupted{}: Canonical.JevRequestStarted{(1n + partition : Nat), 1n,
      1n, 3n, 4n} <> Canonical.JevRequestInterrupted{(1n + partition : Nat), 1n, 1n, 3n, 4n} <> Nil{}
    case _: Canonical.JevRequestStarted{(1n + partition : Nat), 1n, 1n, 3n, 4n} <> Nil{}

def delivery_events(+partition: Nat, +fingerprint: Nat,
  outcome: Canonical.RequestOutcome) -> List<&2, Canonical.CanonicalEvent>:
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
  +outcome: Canonical.RequestOutcome) -> List<&2, Canonical.CanonicalEvent>:
  List.append(&2, Canonical.CanonicalEvent, request_start_events(partition, outcome),
    Canonical.JevRequestSettled{(1n + partition : Nat), 1n, 1n, 3n, 4n, outcome, True{}} <>
    Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> delivery_events(partition,
      fingerprint, outcome))

def journey_events(+partition: Nat, +size: Nat, +fingerprint: Nat,
  +outcome: Canonical.RequestOutcome) -> List<&2, Canonical.CanonicalEvent>:
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
  Canonical.JevRequestReady{
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
  outcome: Canonical.RequestOutcome) -> Canonical.State:
  match outcome:
    case Canonical.RequestFinding{}: Fixtures.final_finding(partition, size, fingerprint, limits)
    case _: Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)

def capacity_after_release(result: Maybe<&2, Ledger.Ledger>, partition: Nat,
    bytes: Nat, purpose: Ledger.Purpose) -> Maybe<&2, Ledger.LedgerResult>:
  match result:
    case None{}: None{}
    case Some{ledger}: Some{Ledger.reserve_for(ledger, partition, bytes, purpose)}

def recover_capacity(+charges: List<&2, Ledger.Charge>, retained: List<&2, Ledger.Charge>,
    limits: Ledger.Limits, next_id: Nat, partition: Nat, bytes: Nat,
      purpose: Ledger.Purpose) -> Maybe<&2, Ledger.LedgerResult>:
  capacity_after_release(release_charges(charges, Ledger.Ledger{limits, next_id,
    List.append(&2, Ledger.Charge, charges, retained)}), partition, bytes, purpose)
