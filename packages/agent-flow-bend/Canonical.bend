import Base
import ./Ledger.bend as Ledger
import ./Admission.bend as Admission
import ./Work.bend as WorkPolicy
import ./Dispatch.bend as Dispatch
import ./Retention.bend as Retention

# #119 boundary: one resident lifetime, shared ledger, active advicee rounds.
# Native IDs are bijectively mapped to positive Nat values before entry.
type Round is Data:
  Round{partition: Nat, lifetime: Nat, id: Nat, waiting: Bool, deciding: Bool,
    write: Maybe<&2, Nat>, uncertain: Bool}

type Work is Data:
  Work{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    charge: Nat, kind: WorkKind, parent: Nat}

type WorkKind is Data:
  SourceQueued{}
  SourceReading{}
  Preparing{}
  Reviewing{}
  AtJev{}
  PendingFinding{}

type StopScope is Data:
  StopScope{partition: Nat, round: Nat}

type State is Data:
  State{ledger: Ledger.Ledger, rounds: List<&2, Round>,
    work: List<&2, Work>, next_round: Nat, next_operation: Nat,
    admissions: List<&2, Admission.AdmissionState>, dispatch: Dispatch.State}

type Outcome is Data:
  Finding{}
  Clear{}
  Unavailable{}
  Interrupted{}
  Discarded{}

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
    deadline: Nat, now: Nat, facts: Admission.ProspectiveFacts}
  ConsumePermit{partition: Nat, lifetime: Nat, token: Nat, tool: Nat, now: Nat}
  ReleasePermit{partition: Nat, lifetime: Nat, token: Nat}
  ExpirePermit{partition: Nat, lifetime: Nat, token: Nat, deadline_reached: Bool}
  ClosePermitRound{partition: Nat, lifetime: Nat, round: Nat, at: Nat, prospective: Bool}
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
  ReviewCompleted{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, outcome: Outcome}
  RetireReview{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
  ReviewObserved{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, outcome: Outcome, current_work: Bool}
  QueueDispatch{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
  DispatchSettled{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
  DiscardDispatch{operations: List<&2, Nat>}
  DispatchScopeCheck{named_count: Nat, cancelled_count: Nat, has_unnamed: Bool}
  CloseDispatch{}
  PreparedOfferCheck{ready: Bool, within_frame: Bool}
  EmptyPreparedCheck{ready_count: Nat, has_non_skipped: Bool, ticketed: Bool}
  ReviewFailureCheck{backend_or_timeout: Bool, credential: Bool, missing: Bool}
  StopPolled{partition: Nat, lifetime: Nat, round: Nat, deadline: Bool}
  StopGroupPolled{group: Nat, lifetime: Nat, round: Nat,
    scopes: List<&2, StopScope>, deadline: Bool, extra_pending: Bool,
    continuations: Nat}
  StopGroupEnded{group: Nat, lifetime: Nat, round: Nat,
    scopes: List<&2, StopScope>}
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
  ReservationReleased{id: Nat}
  ReviewRecorded{outcome: Outcome}
  RetainFinding{}
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
  DispatchStarted{operation: Nat, sequence: Nat, cycle: Nat}
  DispatchCycleCompleted{cycle: Nat}
  DispatchDiscarded{operation: Nat, running: Bool}
  DiscardNamedOnly{}
  DiscardAllUnfinished{}
  WaitForWork{}
  CancelWork{operation: Nat}
  FinishReady{}
  FinishLimit{}
  StopEnded{}
  WriteAuthorized{operation: Nat}
  WriteRecorded{outcome: WriteOutcome}
  WaitForOutput{}
  ReofferAtStop{}
  PartitionRetired{round: Nat}

type Reason is Data:
  InvalidIdentity{}
  RoundLimit{}
  StaleRound{}
  StaleOperation{}
  WrongStage{}
  InconsistentLedger{}
  ProspectiveDenied{}
  PermitDenied{reason: Admission.AdmissionRejection}

type Step is Data:
  Advanced{state: State, commands: List<&2, Command>}
  Rejected{state: State, reason: Reason}

def initial(limits: Ledger.Limits) -> State:
  State{Ledger.initial(limits), Nil{}, Nil{}, 1n, 1n, Nil{}, Dispatch.initial()}

def same_round(+partition: Nat, +lifetime: Nat, +id: Nat, round: Round) -> Bool:
  match round:
    case Round{owner, generation, current, _, _, _, _}:
      Bool.and(Nat.is_eq(owner, partition),
        Bool.and(Nat.is_eq(generation, lifetime), Nat.is_eq(current, id)))

def same_partition(+partition: Nat, round: Round) -> Bool:
  match round:
    case Round{owner, _, _, _, _, _, _}:
      Nat.is_eq(owner, partition)

def admission_matches(+partition: Nat, item: Admission.AdmissionState) -> Bool:
  match item:
    case Admission.AdmissionState{owner, _, _, _, _, _, _, _}:
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
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch}:
      State{ledger, rounds, work, next_round, next_operation,
        admission <> remove_admission(partition, admissions), dispatch}

def current_admission_found(partition: Nat, lifetime: Nat,
    found: Maybe<&2, Admission.AdmissionState>) -> Admission.AdmissionState:
  match found:
    case Some{item}:
      item
    case None{}:
      Admission.initial(partition, lifetime)

def current_admission(state: State, +partition: Nat, +lifetime: Nat) -> Admission.AdmissionState:
  match state:
    case State{_, _, _, _, _, admissions, +dispatch}:
      current_admission_found(partition, lifetime, find_admission(partition, admissions))

def permit_result(state: State, +partition: Nat,
    result: Admission.AdmissionResult, command: Command) -> Step:
  match result:
    case Admission.Accepted{admission, _, _}:
      Advanced{with_admission(state, partition, admission), command <> Nil{}}
    case Admission.Rejected{_, reason}:
      Rejected{state, PermitDenied{reason}}

def issue_result(state: State, +partition: Nat,
    result: Admission.AdmissionResult) -> Step:
  match result:
    case Admission.Accepted{admission, Some{token}, Some{round}}:
      Advanced{with_admission(state, partition, admission), PermitIssued{token, round} <> Nil{}}
    case Admission.Rejected{_, reason}:
      Rejected{state, PermitDenied{reason}}
    case _:
      Rejected{state, InconsistentLedger{}}

def consume_result(state: State, +partition: Nat,
    result: Admission.AdmissionResult) -> Step:
  match result:
    case Admission.Accepted{admission, _, Some{round}}:
      Advanced{with_admission(state, partition, admission), PermitConsumed{round} <> Nil{}}
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

def issue_permit_gate(+state: State, +partition: Nat, +lifetime: Nat,
    +tool: Nat, +started: Nat, +deadline: Nat, +now: Nat,
    gate: Admission.ProspectiveDecision) -> Step:
  match gate:
    case Admission.PermitDenied{}:
      Rejected{state, ProspectiveDenied{}}
    case Admission.PermitAllowed{}:
      issue_result(state, partition, Admission.step(current_admission(state, partition, lifetime),
        partition, lifetime, Admission.Issue{tool, started, deadline, now}))

def issue_permit(+state: State, +partition: Nat, +lifetime: Nat,
    +tool: Nat, +started: Nat, +deadline: Nat, +now: Nat,
    facts: Admission.ProspectiveFacts) -> Step:
  issue_permit_gate(state, partition, lifetime, tool, started, deadline, now,
    Admission.prospective_gate(facts))


def consume_permit(+state: State, +partition: Nat, +lifetime: Nat,
    +token: Nat, +tool: Nat, +now: Nat) -> Step:
  consume_result(state, partition, Admission.step(current_admission(state, partition, lifetime),
    partition, lifetime, Admission.Consume{token, tool, now}))

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
    case Admission.AdmissionState{_, +owner_lifetime, _, _, _, _, _, _}:
      Bool.pick(Step, Nat.is_eq(owner_lifetime, lifetime),
        expire_permit_result(state, partition,
          Admission.expire(admission, token, deadline_reached)),
        Rejected{state, PermitDenied{Admission.WrongLifetime{}}})

def expire_permit(+state: State, +partition: Nat, +lifetime: Nat,
    +token: Nat, deadline_reached: Bool) -> Step:
  expire_permit_checked(state, partition, lifetime, token, deadline_reached,
    current_admission(state, partition, lifetime))


def close_prospective_permit(+state: State, +partition: Nat, +at: Nat,
    admission: Admission.AdmissionState) -> Step:
  match admission:
    case Admission.AdmissionState{owner, lifetime, +round, False{}, closed_at,
        +next_token, Nil{}, used}:
      Bool.pick(Step,
        Bool.and(Nat.is_gt(next_token, 1n), Nat.is_ge(at, closed_at)),
        Advanced{with_admission(state, partition,
          Admission.AdmissionState{owner, lifetime, (round + 1n : Nat), False{},
            at, next_token, Nil{}, used}),
          PermitRoundClosed{(round + 1n : Nat)} <> Nil{}},
        Rejected{state, PermitDenied{Admission.RoundAlreadyClosed{}}})
    case _:
      close_permit_result(state, partition, Admission.close_prospective(admission, at))

def close_permit_apply(+state: State, +partition: Nat, +lifetime: Nat,
    +at: Nat, prospective: Bool, admission: Admission.AdmissionState) -> Step:
  match prospective:
    case True{}:
      close_prospective_permit(state, partition, at, admission)
    case False{}:
      close_permit_result(state, partition,
        Admission.step(admission, partition, lifetime, Admission.CloseRound{at}))


def close_permit_checked(+state: State, +partition: Nat, +lifetime: Nat,
    +expected: Nat, +at: Nat, prospective: Bool,
    admission: Admission.AdmissionState) -> Step:
  match admission:
    case Admission.AdmissionState{_, +owner_lifetime, +round, +active, _, _, _, _}:
      Bool.pick(Step, Nat.is_eq(owner_lifetime, lifetime),
        Bool.pick(Step, Nat.is_eq(expected, Admission.candidate_round(round, active)),
          close_permit_apply(state, partition, lifetime, at, prospective, admission),
          Rejected{state, StaleRound{}}),
        Rejected{state, PermitDenied{Admission.WrongLifetime{}}})

def close_permit_round(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +at: Nat, prospective: Bool) -> Step:
  close_permit_checked(state, partition, lifetime, round, at, prospective,
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
    case PendingFinding{}:
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
    case State{ledger, rounds, work, next_round, next_operation, +admissions, +dispatch} None{}:
      Bool.pick(Step, Bool.and(Nat.is_gt(partition, 0n),
          Bool.and(Nat.is_gt(lifetime, 0n),
            Nat.is_lt(List.length(&2, Round, rounds), 256n))),
        Advanced{State{ledger, Round{partition, lifetime, next_round, False{}, False{}, None{}, False{}} <> rounds,
          work, (next_round + 1n : Nat), next_operation, admissions, dispatch}, RoundStarted{next_round} <> Nil{}},
        Rejected{state, Bool.pick(Reason,
          Bool.and(Nat.is_gt(partition, 0n), Nat.is_gt(lifetime, 0n)),
          RoundLimit{}, InvalidIdentity{})})

def open(+state: State, +partition: Nat, +lifetime: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch}:
      open_found(state, partition, lifetime, find_round(partition, rounds))

def is_deciding(current: Round) -> Bool:
  match current:
    case Round{_, _, _, _, deciding, _, _}:
      deciding

def admit_observation_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, +next_operation, admissions, +dispatch} Some{+current}:
      Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
          Bool.not(is_deciding(current))),
        Advanced{State{ledger, rounds,
          Work{partition, lifetime, round, next_operation, 0n, SourceQueued{}, 0n} <> work,
          next_round, (next_operation + 1n : Nat), admissions, dispatch},
          ObservationAdmitted{next_operation} <> Nil{}},
        Rejected{state, StaleRound{}})
    case _ _:
      Rejected{state, StaleRound{}}

def admit_observation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch}:
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
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch}
        Some{Work{_, _, _, _, 0n, SourceQueued{}, _}}:
      Advanced{State{ledger, rounds, replace_work_kind(operation, SourceReading{}, work),
        next_round, next_operation, admissions, dispatch}, ObservationStarted{} <> Nil{}}
    case _ _:
      Rejected{state, WrongStage{}}

def observation_completed_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch}
        Some{Work{_, _, _, _, 0n, SourceReading{}, _}}:
      Advanced{State{ledger, rounds, remove_work(operation, work),
        next_round, next_operation, admissions, dispatch}, ObservationCompleted{} <> Nil{}}
    case _ _:
      Rejected{state, WrongStage{}}

def start_observation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch}:
      observation_started_found(state, observation,
        find_work(partition, lifetime, round, observation, work))

def complete_observation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch}:
      observation_completed_found(state, observation,
        find_work(partition, lifetime, round, observation, work))

def interrupt_observation_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch}
        Some{Work{_, _, _, _, 0n, SourceQueued{}, _}}:
      Advanced{State{ledger, rounds, remove_work(operation, work),
        next_round, next_operation, admissions, dispatch}, ObservationInterrupted{} <> Nil{}}
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch}
        Some{Work{_, _, _, _, 0n, SourceReading{}, _}}:
      Advanced{State{ledger, rounds, remove_work(operation, work),
        next_round, next_operation, admissions, dispatch}, ObservationInterrupted{} <> Nil{}}
    case _ _:
      Rejected{state, WrongStage{}}

def interrupt_observation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch}:
      interrupt_observation_found(state, observation,
        find_work(partition, lifetime, round, observation, work))

def begin_result(state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +parent: Nat, result: Ledger.LedgerResult) -> Step:
  match state:
    case State{_, rounds, work, next_round, +next_operation, +admissions, +dispatch}:
      match result:
        case Ledger.Granted{ledger, +charge}:
          Advanced{State{ledger, rounds,
            List.append(&2, Work, work, Work{partition, lifetime, round,
              next_operation, charge, Preparing{}, parent} <> Nil{}),
            next_round, (next_operation + 1n : Nat), admissions, dispatch},
            Prepare{next_operation, charge} <> Nil{}}
        case Ledger.Rejected{_}:
          Advanced{state, PreparationRefused{} <> Nil{}}

def begin_found(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +bytes: Nat, +parent: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch} Some{+current}:
      Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
        Bool.and(Bool.not(is_deciding(current)), Nat.is_gt(bytes, 0n))),
        begin_result(state, partition, lifetime, round, parent,
          Ledger.reserve_for(ledger, partition, bytes, Ledger.Preparation{})),
        Rejected{state, StaleRound{}})
    case _ None{}:
      Rejected{state, StaleRound{}}

def begin(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat, +bytes: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch}:
      begin_found(state, partition, lifetime, round, bytes, 0n, find_round(partition, rounds))

def begin_observed_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat, +bytes: Nat, found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{_, rounds, _, _, _, _, +dispatch} Some{Work{_, _, _, _, 0n, SourceReading{}, _}}:
      begin_found(state, partition, lifetime, round, bytes, observation,
        find_round(partition, rounds))
    case _ _:
      Rejected{state, WrongStage{}}

def begin_observed(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat, +bytes: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch}:
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
    case State{_, rounds, work, next_round, _, +admissions, +dispatch} Batch{ledger, units, next, commands}:
      Advanced{State{ledger, rounds,
        List.append(&2, Work, remove_work(operation, work), units), next_round, next, admissions, dispatch},
        PreparationReleased{charge, capacity_view(released, partition)} <> commands}

def prepared_released(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +charge: Nat, +parent: Nat, bytes: List<&2, Nat>,
    result: Ledger.LedgerResult) -> Step:
  match state bytes result:
    case _ _ Ledger.Rejected{_}:
      Rejected{state, InconsistentLedger{}}
    case State{_, _, _, _, next_operation, _, +dispatch} Nil{} Ledger.Granted{+released, _}:
      prepared_batch(state, operation, charge, partition, released,
        Batch{released, Nil{}, next_operation, Nil{}})
    case State{_, _, _, _, next_operation, _, +dispatch} +size <> +rest Ledger.Granted{+released, _}:
      prepared_batch(state, operation, charge, partition, released,
        admit_units(size <> rest, Batch{released, Nil{}, next_operation, Nil{}},
          partition, lifetime, round, 1n, parent))

def prepared_release(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +charge: Nat, +parent: Nat, bytes: List<&2, Nat>) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch}:
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
    case State{_, +rounds, +work, _, _, _, +dispatch}:
      prepared_found(state, partition, lifetime, round, operation, bytes,
        find_round(partition, rounds),
        find_work(partition, lifetime, round, operation, work))

def interrupt_preparation(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  prepared(state, partition, lifetime, round, operation, Nil{})

def start_review_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, next_operation, admissions, +dispatch}
        Some{Work{_, _, _, _, _, Reviewing{}, _}}:
      Advanced{State{ledger, rounds, replace_work_kind(operation, AtJev{}, work),
        next_round, next_operation, admissions, dispatch}, ReviewStarted{} <> Nil{}}
    case _ _:
      Rejected{state, WrongStage{}}

def start_review(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch}:
      start_review_found(state, operation,
        find_work(partition, lifetime, round, operation, work))

def reviewed_released(+state: State, +operation: Nat, outcome: Outcome,
    +charge: Nat, result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch} Ledger.Granted{updated, _}:
      Advanced{State{updated, rounds, remove_work(operation, work),
        next_round, next_operation, admissions, dispatch},
        ReservationReleased{charge} <> ReviewRecorded{outcome} <> Nil{}}
    case _ Ledger.Rejected{_}:
      Rejected{state, InconsistentLedger{}}

def reviewed_retained_result(+state: State, +operation: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch}
        Ledger.Granted{updated, _}:
      Advanced{State{updated, rounds,
        replace_work_kind(operation, PendingFinding{}, work),
        next_round, next_operation, admissions, dispatch},
        ReviewRecorded{Finding{}} <> Nil{}}
    case _ Ledger.Rejected{_}:
      Rejected{state, InconsistentLedger{}}

def reviewed_retained_charge(+state: State, +operation: Nat, +charge: Nat,
    found: Maybe<&2, Ledger.Charge>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch} Some{Ledger.Charge{_, _, bytes, _}}:
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
    case State{ledger, _, _, _, _, _, +dispatch} Finding{}:
      Bool.pick(Step, Nat.is_gt(parent, 0n),
        reviewed_retained_find(state, operation, charge, ledger),
        reviewed_released(state, operation, Finding{}, charge,
          Ledger.release(ledger, charge)))
    case State{ledger, _, _, _, _, _, +dispatch} Clear{}:
      reviewed_released(state, operation, Clear{}, charge, Ledger.release(ledger, charge))
    case State{ledger, _, _, _, _, _, +dispatch} Unavailable{}:
      reviewed_released(state, operation, Unavailable{}, charge, Ledger.release(ledger, charge))
    case State{ledger, _, _, _, _, _, +dispatch} Interrupted{}:
      reviewed_released(state, operation, Interrupted{}, charge, Ledger.release(ledger, charge))
    case State{ledger, _, _, _, _, _, +dispatch} Discarded{}:
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
    case State{_, _, work, _, _, _, +dispatch}:
      reviewed_found(state, operation, outcome,
        find_work(partition, lifetime, round, operation, work))

def retire_review_found(+state: State, +operation: Nat,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch}
        Some{Work{_, _, _, _, +charge, PendingFinding{}, _}}:
      reviewed_released(state, operation, Discarded{}, charge,
        Ledger.release(ledger, charge))
    case _ _:
      Rejected{state, StaleOperation{}}

def retire_review(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch}:
      retire_review_found(state, operation,
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
    case State{ledger, _, _, _, _, _, +dispatch}
        Some{Work{_, _, _, _, +charge, Reviewing{}, _}}:
      reviewed_released(state, operation, Finding{}, charge, Ledger.release(ledger, charge))
    case State{ledger, _, _, _, _, _, +dispatch}
        Some{Work{_, _, _, _, +charge, AtJev{}, _}}:
      reviewed_released(state, operation, Finding{}, charge, Ledger.release(ledger, charge))
    case _ _:
      Rejected{state, StaleOperation{}}

def reviewed_stale(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch}:
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
    has_non_skipped: Bool, ticketed: Bool) -> Step:
  empty_prepared_result(state,
    WorkPolicy.empty_prepared(ready_count, has_non_skipped, ticketed))

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
    case Round{partition, generation, current, _, _, write, uncertain}:
      Round{partition, generation, current, waiting, deciding, write, uncertain} <> tail

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
        case Round{partition, generation, current, _, _, _, _}:
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

def cancel_dispatch_entries(items: List<&2, Dispatch.Entry>, +lifetime: Nat,
    +scopes: List<&2, StopScope>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case Dispatch.Entry{partition, generation, round, operation, _, _, cancelled} <> rest:
      cancel_pick(operation, cancel_dispatch_entries(rest, lifetime, scopes),
        Bool.and(Bool.not(cancelled), Bool.and(Nat.is_eq(generation, lifetime),
          scope_contains(scopes, partition, round))))

def cancel_scoped_dispatch(dispatch: Dispatch.State, +lifetime: Nat,
    +scopes: List<&2, StopScope>) -> List<&2, Command>:
  match dispatch:
    case Dispatch.State{pending, active, running, _, _, _}:
      List.append(&2, Command, cancel_dispatch_entries(pending, lifetime, scopes),
        List.append(&2, Command, cancel_dispatch_entries(active, lifetime, scopes),
          cancel_dispatch_entries(running, lifetime, scopes)))

def stop_group_wait(+state: State, +group: Nat, +lifetime: Nat,
    +round: Nat, scopes: List<&2, StopScope>) -> Step:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, admissions, dispatch}:
      Advanced{State{ledger, mark_stop_rounds(rounds, group, lifetime, round,
        scopes, True{}, False{}), work, next_round, next_operation, admissions, dispatch},
        WaitForWork{} <> Nil{}}

def stop_group_ready(+state: State, +group: Nat, +lifetime: Nat,
    +round: Nat, +scopes: List<&2, StopScope>, continuations: Nat) -> Step:
  match state:
    case State{ledger, rounds, +work, next_round, next_operation, admissions, +dispatch}:
      Advanced{State{release_scoped_charges(work, ledger, lifetime, scopes),
        mark_stop_rounds(rounds, group, lifetime, round, scopes, False{}, True{}),
        retain_scoped_work(work, lifetime, scopes), next_round, next_operation,
        admissions, dispatch},
        List.append(&2, Command, release_scoped_commands(work, lifetime, scopes),
          List.append(&2, Command, cancel_scoped_dispatch(dispatch, lifetime, scopes),
            Bool.pick(Command, Nat.is_lt(continuations, 4n),
              FinishReady{}, FinishLimit{}) <> Nil{}))}

def stop_group_checked(+state: State, +group: Nat, +lifetime: Nat,
    +round: Nat, +scopes: List<&2, StopScope>, deadline: Bool,
    extra_pending: Bool, continuations: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{_, rounds, work, _, _, _, _} Some{+current}:
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
    case State{_, rounds, _, _, _, _, _}:
      stop_group_checked(state, group, lifetime, round, scopes, deadline,
        extra_pending, continuations, find_round(group, rounds))

def stop_group_end_apply(state: State, group: Nat, lifetime: Nat,
    round: Nat, scopes: List<&2, StopScope>) -> Step:
  match state:
    case State{ledger, rounds, work, next_round, next_operation, admissions, dispatch}:
      Advanced{State{ledger, mark_stop_rounds(rounds, group, lifetime, round,
        scopes, False{}, False{}), work, next_round, next_operation, admissions,
        dispatch}, StopEnded{} <> Nil{}}

def stop_group_end_valid(+state: State, group: Nat, lifetime: Nat,
    round: Nat, scopes: List<&2, StopScope>, valid: Bool) -> Step:
  Bool.pick(Step, valid, stop_group_end_apply(state, group, lifetime, round, scopes),
    Rejected{state, StaleRound{}})

def stop_group_end_checked(+state: State, +group: Nat, +lifetime: Nat,
    +round: Nat, +scopes: List<&2, StopScope>, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{_, rounds, _, _, _, _, _} Some{current}:
      stop_group_end_valid(state, group, lifetime, round, scopes,
        Bool.and(same_round(group, lifetime, round, current),
          valid_end_scopes(rounds, lifetime, scopes)))
    case _ _:
      Rejected{state, StaleRound{}}

def stop_group_end(+state: State, +group: Nat, +lifetime: Nat, +round: Nat,
    scopes: List<&2, StopScope>) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, _}:
      stop_group_end_checked(state, group, lifetime, round, scopes,
        find_round(group, rounds))

def stop_ready(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, deadline: Bool, +uncertain: Bool) -> Step:
  match state:
    case State{ledger, rounds, +work, next_round, next_operation, +admissions, +dispatch}:
      Advanced{State{release_unfinished_charges(work, ledger, partition, lifetime, round),
        Round{partition, lifetime, round, False{}, True{}, None{}, uncertain} <>
          remove_round(partition, rounds),
        retain_after_stop(work, partition, lifetime, round),
        next_round, next_operation, admissions, dispatch},
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
    case State{ledger, rounds, work, next_round, next_operation, +admissions, +dispatch}:
      Bool.pick(Step, Bool.and(has_pending, Bool.not(deadline)),
        Advanced{State{ledger,
          Round{partition, lifetime, round, True{}, False{}, write, uncertain} <>
            remove_round(partition, rounds), work, next_round, next_operation, admissions, dispatch},
          WaitForWork{} <> Nil{}},
        stop_output(state, partition, lifetime, round, deadline, write, uncertain))

def match_pending(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, deadline: Bool, current: Round) -> Step:
  match state:
    case State{_, _, work, _, _, _, +dispatch}:
      match current:
        case Round{_, _, _, _, _, write, uncertain}:
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
    case State{_, rounds, _, _, _, _, +dispatch}:
      stop_found(state, partition, lifetime, round, deadline,
        find_round(partition, rounds))


def output_start_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, +next_operation, +admissions, +dispatch} Some{+current}:
      match current:
        case Round{_, _, _, waiting, deciding, None{}, uncertain}:
          Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
              Bool.not(deciding)),
            Advanced{State{ledger,
              Round{partition, lifetime, round, waiting, False{},
                Some{next_operation}, uncertain} <> remove_round(partition, rounds),
              work, next_round, (next_operation + 1n : Nat), admissions, dispatch},
              WriteAuthorized{next_operation} <> Nil{}},
            Rejected{state, StaleRound{}})
        case _:
          Rejected{state, StaleOperation{}}
    case _ None{}:
      Rejected{state, StaleRound{}}

def output_start(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _, _, +dispatch}:
      output_start_found(state, partition, lifetime, round, find_round(partition, rounds))

def write_is_unknown(outcome: WriteOutcome) -> Bool:
  match outcome:
    case Unknown{}:
      True{}
    case _:
      False{}

def output_terminal_current(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +outcome: WriteOutcome,
    current: Round) -> Step:
  match state current:
    case State{ledger, rounds, work, next_round, next_operation, +admissions, +dispatch} Round{_, _, _, +waiting, +deciding, Some{+token}, _}:
      Bool.pick(Step,
        Bool.and(same_round(partition, lifetime, round, current), Nat.is_eq(token, operation)),
        Advanced{State{ledger,
          Round{partition, lifetime, round, waiting, deciding, None{},
            write_is_unknown(outcome)} <> remove_round(partition, rounds),
          work, next_round, next_operation, admissions, dispatch},
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
    case State{_, rounds, _, _, _, _, +dispatch}:
      output_terminal_found(state, partition, lifetime, round, operation,
        outcome, find_round(partition, rounds))

def retire_current(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat) -> Step:
  match state:
    case State{ledger, rounds, +work, next_round, next_operation, +admissions, +dispatch}:
      Advanced{State{release_round_charges(work, ledger, partition, lifetime, round),
        remove_round(partition, rounds),
        retain_other_work(work, partition, lifetime, round),
        next_round, next_operation, admissions, dispatch},
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
    case State{_, rounds, _, _, _, _, +dispatch}:
      retire_found(state, partition, lifetime, round, find_round(partition, rounds))

def capacity_reserve_result(state: State, +partition: Nat, +bytes: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch} Ledger.Granted{+ledger, id}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch},
        CapacityGranted{id, capacity_view(ledger, partition)} <> Nil{}}
    case _ Ledger.Rejected{+ledger}:
      Advanced{state, CapacityRefused{Ledger.admission(ledger, partition, bytes),
        capacity_view(ledger, partition)} <> Nil{}}

def capacity_reserve(+state: State, +partition: Nat, +bytes: Nat,
    purpose: Ledger.Purpose) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch}:
      capacity_reserve_result(state, partition, bytes,
        Ledger.reserve_for(ledger, partition, bytes, purpose))

def capacity_resize_result(state: State, +id: Nat, +partition: Nat, +bytes: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch} Ledger.Granted{+ledger, _}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch},
        CapacityResized{id, capacity_view(ledger, partition)} <> Nil{}}
    case State{_, _, _, _, _, _, +dispatch} Ledger.Rejected{+ledger}:
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
    case State{ledger, _, _, _, _, _, +dispatch} Some{Ledger.Charge{_, partition, _, _}}:
      capacity_resize_result(state, id, partition, bytes,
        Ledger.resize_for(ledger, id, bytes, purpose))

def capacity_resize(+state: State, +id: Nat, +bytes: Nat,
    purpose: Ledger.Purpose) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch}:
      match ledger:
        case Ledger.Ledger{_, _, charges}:
          capacity_resize_found(state, id, bytes, purpose, Ledger.find(id, charges))

def capacity_release_result(state: State, +id: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch} Ledger.Granted{ledger, _}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch},
        ReservationReleased{id} <> Nil{}}
    case _ Ledger.Rejected{_}:
      Rejected{state, StaleOperation{}}

def capacity_release(+state: State, +id: Nat) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch}:
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
    case State{_, rounds, work, next_round, next_operation, +admissions, +dispatch} CapacityBatch{ledger, commands}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch},
        PreparationReleased{id, capacity_view(released, partition)} <> commands}

def capacity_replace_released(state: State, +id: Nat, +partition: Nat,
    sizes: List<&2, Nat>, result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation, _, +dispatch} Ledger.Granted{+released, _}:
      capacity_replace_batch(state, id, partition, released,
        capacity_replace_units(sizes, CapacityBatch{released, Nil{}}, partition, 1n))
    case _ Ledger.Rejected{_}:
      Rejected{state, StaleOperation{}}

def capacity_replace_found(+state: State, +id: Nat, sizes: List<&2, Nat>,
    found: Maybe<&2, Ledger.Charge>) -> Step:
  match state found:
    case State{ledger, _, _, _, _, _, +dispatch} Some{Ledger.Charge{_, partition, _, Ledger.Preparation{}}}:
      capacity_replace_released(state, id, partition, sizes,
        Ledger.release(ledger, id))
    case _ _:
      Rejected{state, StaleOperation{}}

def capacity_replace(+state: State, +id: Nat, sizes: List<&2, Nat>) -> Step:
  match state:
    case State{ledger, _, _, _, _, _, +dispatch}:
      match ledger:
        case Ledger.Ledger{_, _, charges}:
          capacity_replace_found(state, id, sizes, Ledger.find(id, charges))

def dispatch_commands(items: List<&2, Dispatch.Command>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case Dispatch.Started{operation, sequence, cycle} <> rest:
      DispatchStarted{operation, sequence, cycle} <> dispatch_commands(rest)
    case Dispatch.CycleCompleted{cycle} <> rest:
      DispatchCycleCompleted{cycle} <> dispatch_commands(rest)
    case Dispatch.Discarded{operation, running} <> rest:
      DispatchDiscarded{operation, running} <> dispatch_commands(rest)

def dispatch_result(state: State, result: Dispatch.DispatchResult) -> Step:
  match state result:
    case State{ledger, rounds, work, next_round, next_operation, admissions, _}
        Dispatch.Advanced{dispatch, commands}:
      Advanced{State{ledger, rounds, work, next_round, next_operation, admissions, dispatch},
        dispatch_commands(commands)}
    case _ Dispatch.Denied{_}:
      Rejected{state, StaleOperation{}}

def work_dispatchable(found: Maybe<&2, Work>) -> Bool:
  match found:
    case Some{Work{_, _, _, _, _, SourceQueued{}, _}}:
      True{}
    case Some{Work{_, _, _, _, _, Reviewing{}, _}}:
      True{}
    case _:
      False{}

def queue_dispatch(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, work, _, _, _, dispatch}:
      Bool.pick(Step,
        work_dispatchable(find_work(partition, lifetime, round, operation, work)),
        dispatch_result(state, Dispatch.enqueue(dispatch, partition, lifetime, round, operation)),
        Rejected{state, StaleOperation{}})

def settle_dispatch(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch}:
      dispatch_result(state, Dispatch.settle(dispatch, partition, lifetime, round, operation))

def discard_dispatch(+state: State, operations: List<&2, Nat>) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch}:
      dispatch_result(state, Dispatch.discard(dispatch, operations))

def close_dispatch(+state: State) -> Step:
  match state:
    case State{_, _, _, _, _, _, dispatch}:
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

def step(state: State, event: CanonicalEvent) -> Step:
  match event:
    case ReserveCapacity{partition, bytes, purpose}:
      capacity_reserve(state, partition, bytes, purpose)
    case ResizeCapacity{reservation, bytes, purpose}:
      capacity_resize(state, reservation, bytes, purpose)
    case ReleaseCapacity{reservation}:
      capacity_release(state, reservation)
    case ReplaceCapacity{reservation, unit_bytes}:
      capacity_replace(state, reservation, unit_bytes)
    case IssuePermit{partition, lifetime, tool, started, deadline, now, facts}:
      issue_permit(state, partition, lifetime, tool, started, deadline, now, facts)
    case ConsumePermit{partition, lifetime, token, tool, now}:
      consume_permit(state, partition, lifetime, token, tool, now)
    case ReleasePermit{partition, lifetime, token}:
      release_permit(state, partition, lifetime, token)
    case ExpirePermit{partition, lifetime, token, deadline_reached}:
      expire_permit(state, partition, lifetime, token, deadline_reached)
    case ClosePermitRound{partition, lifetime, round, at, prospective}:
      close_permit_round(state, partition, lifetime, round, at, prospective)
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
    case ReviewCompleted{partition, lifetime, round, operation, outcome}:
      reviewed(state, partition, lifetime, round, operation, outcome)
    case RetireReview{partition, lifetime, round, operation}:
      retire_review(state, partition, lifetime, round, operation)
    case ReviewObserved{partition, lifetime, round, operation, outcome, current_work}:
      review_observed(state, partition, lifetime, round, operation, outcome, current_work)
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
    case EmptyPreparedCheck{ready_count, has_non_skipped, ticketed}:
      empty_prepared_check(state, ready_count, has_non_skipped, ticketed)
    case ReviewFailureCheck{backend_or_timeout, credential, missing}:
      review_failure_check(state, backend_or_timeout, credential, missing)
    case StopPolled{partition, lifetime, round, deadline}:
      stop(state, partition, lifetime, round, deadline)
    case StopGroupPolled{group, lifetime, round, scopes, deadline, extra_pending, continuations}:
      stop_group(state, group, lifetime, round, scopes, deadline, extra_pending,
        continuations)
    case StopGroupEnded{group, lifetime, round, scopes}:
      stop_group_end(state, group, lifetime, round, scopes)
    case OutputStarted{partition, lifetime, round}:
      output_start(state, partition, lifetime, round)
    case OutputTerminal{partition, lifetime, round, operation, outcome}:
      output_terminal(state, partition, lifetime, round, operation, outcome)
    case RetirePartition{partition, lifetime, round}:
      retire(state, partition, lifetime, round)

def main() -> Step:
  step(initial(Ledger.Limits{4n, 100n, 2n, 60n}), OpenRound{1n, 1n})
