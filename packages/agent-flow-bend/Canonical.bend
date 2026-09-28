import Base
import ./Ledger.bend as Ledger

# #119 boundary: one resident lifetime, shared ledger, active advicee rounds.
# Native IDs are bijectively mapped to positive Nat values before entry.
type Round is Data:
  Round{partition: Nat, lifetime: Nat, id: Nat, waiting: Bool, deciding: Bool,
    write: Maybe<&2, Nat>, uncertain: Bool}

type Work is Data:
  Work{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    charge: Nat, kind: WorkKind}

type WorkKind is Data:
  Preparing{}
  Reviewing{}

type State is Data:
  State{ledger: Ledger.Ledger, rounds: List<&2, Round>,
    work: List<&2, Work>, next_round: Nat, next_operation: Nat}

type Outcome is Data:
  Finding{}
  Clear{}
  Unavailable{}

type WriteOutcome is Data:
  Acknowledged{}
  Failed{}
  Unknown{}

type CanonicalEvent is Data:
  OpenRound{partition: Nat, lifetime: Nat}
  BeginPreparation{partition: Nat, lifetime: Nat, round: Nat, bytes: Nat}
  PreparationCompleted{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, unit_bytes: List<&2, Nat>}
  ReviewCompleted{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, outcome: Outcome}
  StopPolled{partition: Nat, lifetime: Nat, round: Nat, deadline: Bool}
  OutputStarted{partition: Nat, lifetime: Nat, round: Nat}
  OutputTerminal{partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, outcome: WriteOutcome}
  RetirePartition{partition: Nat, lifetime: Nat, round: Nat}

type Command is Data:
  RoundStarted{id: Nat}
  Prepare{operation: Nat, reservation: Nat}
  PreparationRefused{}
  UnitAdmitted{operation: Nat, reservation: Nat}
  UnitRefused{}
  ReservationReleased{id: Nat}
  ReviewRecorded{outcome: Outcome}
  WaitForWork{}
  CancelWork{operation: Nat}
  FinishReady{}
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
  InconsistentLedger{}

type Step is Data:
  Advanced{state: State, commands: List<&2, Command>}
  Rejected{state: State, reason: Reason}

def initial(limits: Ledger.Limits) -> State:
  State{Ledger.initial(limits), Nil{}, Nil{}, 1n, 1n}

def same_round(+partition: Nat, +lifetime: Nat, +id: Nat, round: Round) -> Bool:
  match round:
    case Round{owner, generation, current, _, _, _, _}:
      Bool.and(Nat.is_eq(owner, partition),
        Bool.and(Nat.is_eq(generation, lifetime), Nat.is_eq(current, id)))

def same_partition(+partition: Nat, round: Round) -> Bool:
  match round:
    case Round{owner, _, _, _, _, _, _}:
      Nat.is_eq(owner, partition)

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
    case Work{owner, generation, current, op, _, _}:
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
        case Work{_, _, _, op, _, _}:
          remove_work_pick(item, remove_work(operation, rest), Nat.is_eq(op, operation))

def pending(+partition: Nat, +lifetime: Nat, +round: Nat, items: List<&2, Work>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Work{owner, generation, current, _, _, _} <> rest:
      Bool.or(same_ids(partition, lifetime, round, owner, generation, current),
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
    case Work{owner, generation, current, op, _, _} <> rest:
      cancel_pick(op, cancel_commands(partition, lifetime, round, rest),
        same_ids(partition, lifetime, round, owner, generation, current))

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
    case Work{owner, generation, current, _, charge, _} <> rest:
      release_pick(charge, release_commands(partition, lifetime, round, rest),
        same_ids(partition, lifetime, round, owner, generation, current))

def release_charge(ledger: Ledger.Ledger, charge: Nat) -> Ledger.Ledger:
  match ledger:
    case Ledger.Ledger{limits, next_id, charges}:
      Ledger.Ledger{limits, next_id, Ledger.remove(charge, charges)}

def release_round_charges(items: List<&2, Work>, +ledger: Ledger.Ledger,
    +partition: Nat, +lifetime: Nat, +round: Nat) -> Ledger.Ledger:
  match items:
    case Nil{}:
      ledger
    case Work{owner, generation, current, _, charge, _} <> rest:
      release_round_charges(rest,
        Bool.pick(Ledger.Ledger,
          same_ids(partition, lifetime, round, owner, generation, current),
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
        case Work{owner, generation, current, _, _, _}:
          retain_work_pick(item, retain_other_work(rest, partition, lifetime, round),
            same_ids(partition, lifetime, round, owner, generation, current))

def open_found(+state: State, +partition: Nat, +lifetime: Nat,
    found: Maybe<&2, Round>) -> Step:
  match state found:
    case _ Some{_}:
      Rejected{state, StaleRound{}}
    case State{ledger, rounds, work, next_round, next_operation} None{}:
      Bool.pick(Step, Bool.and(Nat.is_gt(partition, 0n),
          Bool.and(Nat.is_gt(lifetime, 0n),
            Nat.is_lt(List.length(&2, Round, rounds), 256n))),
        Advanced{State{ledger, Round{partition, lifetime, next_round, False{}, False{}, None{}, False{}} <> rounds,
          work, (next_round + 1n : Nat), next_operation}, RoundStarted{next_round} <> Nil{}},
        Rejected{state, Bool.pick(Reason,
          Bool.and(Nat.is_gt(partition, 0n), Nat.is_gt(lifetime, 0n)),
          RoundLimit{}, InvalidIdentity{})})

def open(+state: State, +partition: Nat, +lifetime: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _}:
      open_found(state, partition, lifetime, find_round(partition, rounds))

def begin_result(state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    result: Ledger.LedgerResult) -> Step:
  match state:
    case State{_, rounds, work, next_round, +next_operation}:
      match result:
        case Ledger.Granted{ledger, +charge}:
          Advanced{State{ledger, rounds,
            List.append(&2, Work, work, Work{partition, lifetime, round,
              next_operation, charge, Preparing{}} <> Nil{}),
            next_round, (next_operation + 1n : Nat)},
            Prepare{next_operation, charge} <> Nil{}}
        case Ledger.Rejected{_}:
          Advanced{state, PreparationRefused{} <> Nil{}}

def is_deciding(current: Round) -> Bool:
  match current:
    case Round{_, _, _, _, deciding, _, _}:
      deciding

def begin_found(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +bytes: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{ledger, _, _, _, _} Some{+current}:
      Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
        Bool.and(Bool.not(is_deciding(current)), Nat.is_gt(bytes, 0n))),
        begin_result(state, partition, lifetime, round,
          Ledger.reserve(ledger, partition, bytes)),
        Rejected{state, StaleRound{}})
    case _ None{}:
      Rejected{state, StaleRound{}}

def begin(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat, +bytes: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _}:
      begin_found(state, partition, lifetime, round, bytes, find_round(partition, rounds))

type Batch is Data:
  Batch{ledger: Ledger.Ledger, work: List<&2, Work>,
    +next_operation: Nat, commands: List<&2, Command>}

def admit_granted_batch(partition: Nat, lifetime: Nat, round: Nat,
    +operation: Nat, +charge: Nat, batch: Batch) -> Batch:
  match batch:
    case Batch{ledger, work, next, commands}:
      Batch{ledger, Work{partition, lifetime, round, operation,
        charge, Reviewing{}} <> work, next, UnitAdmitted{operation, charge} <> commands}

def admit_refused_batch(batch: Batch) -> Batch:
  match batch:
    case Batch{ledger, work, next, commands}:
      Batch{ledger, work, next, UnitRefused{} <> commands}

def admit_units(rest: List<&2, Nat>, result: Ledger.LedgerResult, +partition: Nat,
    +lifetime: Nat, +round: Nat, +next_operation: Nat) -> Batch:
  match rest result:
    case Nil{} Ledger.Granted{granted, +id}:
      Batch{granted, Work{partition, lifetime, round, next_operation,
        id, Reviewing{}} <> Nil{}, (next_operation + 1n : Nat),
        UnitAdmitted{next_operation, id} <> Nil{}}
    case Nil{} Ledger.Rejected{unchanged}:
      Batch{unchanged, Nil{}, next_operation, UnitRefused{} <> Nil{}}
    case +size <> +tail Ledger.Granted{granted, +id}:
      admit_granted_batch(partition, lifetime, round, next_operation, id,
        admit_units(tail, Ledger.reserve(granted, partition, size),
          partition, lifetime, round, (next_operation + 1n : Nat)))
    case +size <> +tail Ledger.Rejected{unchanged}:
      admit_refused_batch(admit_units(tail,
        Ledger.reserve(unchanged, partition, size), partition, lifetime,
        round, next_operation))

def prepared_batch(state: State, +operation: Nat, +charge: Nat, batch: Batch) -> Step:
  match state batch:
    case State{_, rounds, work, next_round, _} Batch{ledger, units, next, commands}:
      Advanced{State{ledger, rounds,
        List.append(&2, Work, remove_work(operation, work), units), next_round, next},
        ReservationReleased{charge} <> commands}

def prepared_released(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +charge: Nat, bytes: List<&2, Nat>,
    result: Ledger.LedgerResult) -> Step:
  match state bytes result:
    case _ _ Ledger.Rejected{_}:
      Rejected{state, InconsistentLedger{}}
    case State{_, _, _, _, next_operation} Nil{} Ledger.Granted{released, _}:
      prepared_batch(state, operation, charge,
        Batch{released, Nil{}, next_operation, Nil{}})
    case State{_, _, _, _, next_operation} +size <> +rest Ledger.Granted{released, _}:
      prepared_batch(state, operation, charge,
        admit_units(rest, Ledger.reserve(released, partition, size),
          partition, lifetime, round, next_operation))

def prepared_release(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +charge: Nat, bytes: List<&2, Nat>) -> Step:
  match state:
    case State{ledger, _, _, _, _}:
      prepared_released(state, partition, lifetime, round, operation, charge,
        bytes, Ledger.release(ledger, charge))

def prepared_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, bytes: List<&2, Nat>,
    found_round: Maybe<&2, Round>, found_work: Maybe<&2, Work>) -> Step:
  match found_round found_work:
    case Some{current} Some{Work{_, _, _, _, charge, Preparing{}}}:
      Bool.pick(Step, same_round(partition, lifetime, round, current),
        prepared_release(state, partition, lifetime, round, operation, charge, bytes),
        Rejected{state, StaleRound{}})
    case _ _:
      Rejected{state, StaleOperation{}}

def prepared(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +operation: Nat, bytes: List<&2, Nat>) -> Step:
  match state:
    case State{_, +rounds, +work, _, _}:
      prepared_found(state, partition, lifetime, round, operation, bytes,
        find_round(partition, rounds),
        find_work(partition, lifetime, round, operation, work))

def reviewed_released(+state: State, +operation: Nat, outcome: Outcome,
    +charge: Nat, result: Ledger.LedgerResult) -> Step:
  match state result:
    case State{_, rounds, work, next_round, next_operation} Ledger.Granted{updated, _}:
      Advanced{State{updated, rounds, remove_work(operation, work),
        next_round, next_operation},
        ReservationReleased{charge} <> ReviewRecorded{outcome} <> Nil{}}
    case _ Ledger.Rejected{_}:
      Rejected{state, InconsistentLedger{}}

def reviewed_found(+state: State, +operation: Nat, outcome: Outcome,
    found: Maybe<&2, Work>) -> Step:
  match state found:
    case State{ledger, _, _, _, _} Some{Work{_, _, _, _, +charge, Reviewing{}}}:
      reviewed_released(state, operation, outcome, charge, Ledger.release(ledger, charge))
    case _ _:
      Rejected{state, StaleOperation{}}

def reviewed(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat,
    +operation: Nat, outcome: Outcome) -> Step:
  match state:
    case State{_, _, work, _, _}:
      reviewed_found(state, operation, outcome,
        find_work(partition, lifetime, round, operation, work))

def stop_ready(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, deadline: Bool, +uncertain: Bool) -> Step:
  match state:
    case State{ledger, rounds, +work, next_round, next_operation}:
      Advanced{State{release_round_charges(work, ledger, partition, lifetime, round),
        Round{partition, lifetime, round, False{}, True{}, None{}, uncertain} <>
          remove_round(partition, rounds),
        retain_other_work(work, partition, lifetime, round),
        next_round, next_operation},
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
    case State{ledger, rounds, work, next_round, next_operation}:
      Bool.pick(Step, Bool.and(has_pending, Bool.not(deadline)),
        Advanced{State{ledger,
          Round{partition, lifetime, round, True{}, False{}, write, uncertain} <>
            remove_round(partition, rounds), work, next_round, next_operation},
          WaitForWork{} <> Nil{}},
        stop_output(state, partition, lifetime, round, deadline, write, uncertain))

def match_pending(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, deadline: Bool, current: Round) -> Step:
  match state:
    case State{_, _, work, _, _}:
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
    case State{_, rounds, _, _, _}:
      stop_found(state, partition, lifetime, round, deadline,
        find_round(partition, rounds))


def output_start_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, found: Maybe<&2, Round>) -> Step:
  match state found:
    case State{ledger, rounds, work, next_round, +next_operation} Some{+current}:
      match current:
        case Round{_, _, _, waiting, deciding, None{}, uncertain}:
          Bool.pick(Step, Bool.and(same_round(partition, lifetime, round, current),
              Bool.not(deciding)),
            Advanced{State{ledger,
              Round{partition, lifetime, round, waiting, False{},
                Some{next_operation}, uncertain} <> remove_round(partition, rounds),
              work, next_round, (next_operation + 1n : Nat)},
              WriteAuthorized{next_operation} <> Nil{}},
            Rejected{state, StaleRound{}})
        case _:
          Rejected{state, StaleOperation{}}
    case _ None{}:
      Rejected{state, StaleRound{}}

def output_start(+state: State, +partition: Nat, +lifetime: Nat, +round: Nat) -> Step:
  match state:
    case State{_, rounds, _, _, _}:
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
    case State{ledger, rounds, work, next_round, next_operation} Round{_, _, _, +waiting, +deciding, Some{+token}, _}:
      Bool.pick(Step,
        Bool.and(same_round(partition, lifetime, round, current), Nat.is_eq(token, operation)),
        Advanced{State{ledger,
          Round{partition, lifetime, round, waiting, deciding, None{},
            write_is_unknown(outcome)} <> remove_round(partition, rounds),
          work, next_round, next_operation},
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
    case State{_, rounds, _, _, _}:
      output_terminal_found(state, partition, lifetime, round, operation,
        outcome, find_round(partition, rounds))

def retire_current(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat) -> Step:
  match state:
    case State{ledger, rounds, +work, next_round, next_operation}:
      Advanced{State{release_round_charges(work, ledger, partition, lifetime, round),
        remove_round(partition, rounds),
        retain_other_work(work, partition, lifetime, round),
        next_round, next_operation},
        List.append(&2, Command,
          release_commands(partition, lifetime, round, work),
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
    case State{_, rounds, _, _, _}:
      retire_found(state, partition, lifetime, round, find_round(partition, rounds))

def step(state: State, event: CanonicalEvent) -> Step:
  match event:
    case OpenRound{partition, lifetime}:
      open(state, partition, lifetime)
    case BeginPreparation{partition, lifetime, round, bytes}:
      begin(state, partition, lifetime, round, bytes)
    case PreparationCompleted{partition, lifetime, round, operation, bytes}:
      prepared(state, partition, lifetime, round, operation, bytes)
    case ReviewCompleted{partition, lifetime, round, operation, outcome}:
      reviewed(state, partition, lifetime, round, operation, outcome)
    case StopPolled{partition, lifetime, round, deadline}:
      stop(state, partition, lifetime, round, deadline)
    case OutputStarted{partition, lifetime, round}:
      output_start(state, partition, lifetime, round)
    case OutputTerminal{partition, lifetime, round, operation, outcome}:
      output_terminal(state, partition, lifetime, round, operation, outcome)
    case RetirePartition{partition, lifetime, round}:
      retire(state, partition, lifetime, round)

def main() -> Step:
  step(initial(Ledger.Limits{4n, 100n, 2n, 60n}), OpenRound{1n, 1n})
