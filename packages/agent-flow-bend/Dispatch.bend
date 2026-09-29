import Base

# A finite dispatch cohort is fixed when the previous cohort becomes idle.
# Native job handles and promises are outside this source-free state.
type Entry is Data:
  Entry{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    sequence: Nat, cycle: Nat, cancelled: Bool}

type State is Data:
  State{pending: List<&2, Entry>, active: List<&2, Entry>,
    running: List<&2, Entry>, next_sequence: Nat, cycle: Nat, closed: Bool}

type Command is Data:
  Started{operation: Nat, sequence: Nat, cycle: Nat}
  CycleCompleted{cycle: Nat}
  Discarded{operation: Nat, running: Bool}

type DispatchResult is Data:
  Advanced{state: State, commands: List<&2, Command>}
  Denied{state: State}

def initial() -> State:
  State{Nil{}, Nil{}, Nil{}, 0n, 0n, False{}}

# Shared preparation and unit-evaluation jobs, not a Jev-only call limit.
def max_running() -> Nat:
  8n

def same_entry(entry: Entry, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Bool:
  match entry:
    case Entry{owner, generation, current, id, _, _, _}:
      Bool.and(Nat.is_eq(owner, partition), Bool.and(Nat.is_eq(generation, lifetime),
        Bool.and(Nat.is_eq(current, round), Nat.is_eq(id, operation))))

def contains(items: List<&2, Entry>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Bool:
  match items:
    case Nil{}:
      False{}
    case +entry <> +rest:
      Bool.or(same_entry(entry, partition, lifetime, round, operation),
        contains(rest, partition, lifetime, round, operation))

def known(state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Bool:
  match state:
    case State{pending, active, running, _, _, _}:
      Bool.or(contains(pending, partition, lifetime, round, operation),
        Bool.or(contains(active, partition, lifetime, round, operation),
          contains(running, partition, lifetime, round, operation)))

def start(entry: Entry, cycle: Nat) -> Entry:
  match entry:
    case Entry{partition, lifetime, round, operation, sequence, _, cancelled}:
      Entry{partition, lifetime, round, operation, sequence, cycle, cancelled}

def start_command(entry: Entry) -> Command:
  match entry:
    case Entry{_, _, _, operation, sequence, cycle, _}:
      Started{operation, sequence, cycle}

def pump_one(state: State) -> DispatchResult:
  match state:
    case State{pending, +entry <> active, running, next_sequence, +cycle, closed}:
      match entry:
        case Entry{_, _, _, _, _, _, True{}}:
          pump_one(State{pending, active, running, next_sequence, cycle, closed})
        case _:
          +next = start(entry, cycle)
          Advanced{State{pending, active,
            List.append(&2, Entry, running, next <> Nil{}), next_sequence, cycle, closed},
            start_command(next) <> Nil{}}
    case _:
      Advanced{state, Nil{}}

def pump_next_result(first: State, commands: List<&2, Command>,
    result: DispatchResult) -> DispatchResult:
  match result:
    case Advanced{second, more}:
      Advanced{second, List.append(&2, Command, commands, more)}
    case Denied{_}:
      Denied{first}

def pump_next(+first: State, commands: List<&2, Command>) -> DispatchResult:
  pump_next_result(first, commands, pump_one(first))

def pump_remaining(remaining: Nat, result: DispatchResult) -> DispatchResult:
  match remaining:
    case 0n:
      result
    case 1n+rest:
      match result:
        case Advanced{+state, +commands}:
          match state:
            case State{_, _, running, _, _, _}:
              Bool.pick(DispatchResult, Nat.is_lt(List.length(&2, Entry, running), max_running()),
                pump_remaining(rest, pump_next(state, commands)),
                Advanced{state, commands})
        case Denied{state}:
          Denied{state}

def pump_available(+state: State) -> DispatchResult:
  match state:
    case State{_, active, _, _, _, _}:
      # A cancelled entry consumes no slot but must still leave the active cohort.
      pump_remaining(List.length(&2, Entry, active), Advanced{state, Nil{}})

def enqueue(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> DispatchResult:
  match state:
    case State{+pending, +active, +running, +next_sequence, +cycle, +closed}:
      Bool.pick(DispatchResult, Bool.or(closed,
          known(state, partition, lifetime, round, operation)),
        Denied{state},
        Bool.pick(DispatchResult,
          Bool.and(Nat.is_eq(List.length(&2, Entry, active), 0n),
            Nat.is_eq(List.length(&2, Entry, running), 0n)),
          pump_available(State{pending,
            Entry{partition, lifetime, round, operation, next_sequence,
              (cycle + 1n : Nat), False{}} <> Nil{}, running,
            (next_sequence + 1n : Nat), (cycle + 1n : Nat), closed}),
          Advanced{State{List.append(&2, Entry, pending,
              Entry{partition, lifetime, round, operation, next_sequence, 0n, False{}} <> Nil{}),
            active, running, (next_sequence + 1n : Nat), cycle, closed}, Nil{}}))

def remove_entry(items: List<&2, Entry>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> List<&2, Entry>:
  match items:
    case Nil{}:
      Nil{}
    case +entry <> +rest:
      Bool.pick(List<&2, Entry>, same_entry(entry, partition, lifetime, round, operation),
        rest, entry <> remove_entry(rest, partition, lifetime, round, operation))

def promote(items: List<&2, Entry>, +cycle: Nat) -> List<&2, Entry>:
  match items:
    case Nil{}:
      Nil{}
    case +entry <> rest:
      start(entry, cycle) <> promote(rest, cycle)

def promoted_pumped(state: State, +cycle: Nat, result: DispatchResult) -> DispatchResult:
  match result:
    case Advanced{next, starts}:
      Advanced{next, CycleCompleted{cycle} <> starts}
    case Denied{_}:
      Denied{state}

def promoted_result(state: State, +pending: List<&2, Entry>, +next_sequence: Nat,
    +cycle: Nat, closed: Bool) -> DispatchResult:
  promoted_pumped(state, cycle,
    pump_available(State{Nil{}, promote(pending, (cycle + 1n : Nat)), Nil{},
      next_sequence, (cycle + 1n : Nat), closed}))

def after_settle(+state: State) -> DispatchResult:
  match state:
    case State{+pending, +active, +running, +next_sequence, +cycle, +closed}:
      Bool.pick(DispatchResult,
        Bool.and(Nat.is_eq(List.length(&2, Entry, active), 0n),
          Nat.is_eq(List.length(&2, Entry, running), 0n)),
        Bool.pick(DispatchResult, Nat.is_eq(List.length(&2, Entry, pending), 0n),
          Advanced{state, CycleCompleted{cycle} <> Nil{}},
          promoted_result(state, pending, next_sequence, cycle, closed)),
        pump_available(state))

def settle(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> DispatchResult:
  match state:
    case State{pending, active, +running, next_sequence, cycle, closed}:
      Bool.pick(DispatchResult, contains(running, partition, lifetime, round, operation),
        after_settle(State{pending, active,
          remove_entry(running, partition, lifetime, round, operation),
          next_sequence, cycle, closed}),
        Denied{state})

def listed(ids: List<&2, Nat>, +operation: Nat) -> Bool:
  match ids:
    case Nil{}:
      False{}
    case id <> rest:
      Bool.or(Nat.is_eq(id, operation), listed(rest, operation))

type Filtered is Data:
  Filtered{entries: List<&2, Entry>, commands: List<&2, Command>}

def discarded_entry(entry: Entry, running: Bool) -> Command:
  match entry:
    case Entry{_, _, _, operation, _, _, _}:
      Discarded{operation, running}

def filter_queued_one(entry: Entry, hit: Bool, tail: Filtered) -> Filtered:
  match hit:
    case True{}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{entries, discarded_entry(entry, False{}) <> commands}
    case False{}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{entry <> entries, commands}

def filter_queued(items: List<&2, Entry>, +ids: List<&2, Nat>) -> Filtered:
  match items:
    case Nil{}:
      Filtered{Nil{}, Nil{}}
    case +entry <> rest:
      match entry:
        case Entry{_, _, _, operation, _, _, _}:
          filter_queued_one(entry, listed(ids, operation), filter_queued(rest, ids))

def cancelled_entry(entry: Entry) -> Entry:
  match entry:
    case Entry{partition, lifetime, round, operation, sequence, cycle, _}:
      Entry{partition, lifetime, round, operation, sequence, cycle, True{}}

def filter_running_hit(+entry: Entry, hit: Bool, tail: Filtered) -> Filtered:
  match hit:
    case False{}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{entry <> entries, commands}
    case True{}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{cancelled_entry(entry) <> entries,
            discarded_entry(entry, True{}) <> commands}

def filter_running_one(entry: Entry, hit: Bool, tail: Filtered) -> Filtered:
  match entry:
    case Entry{_, _, _, _, _, _, True{}}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{entry <> entries, commands}
    case _:
      filter_running_hit(entry, hit, tail)

def filter_running(items: List<&2, Entry>, +ids: List<&2, Nat>) -> Filtered:
  match items:
    case Nil{}:
      Filtered{Nil{}, Nil{}}
    case +entry <> rest:
      match entry:
        case Entry{_, _, _, operation, _, _, _}:
          filter_running_one(entry, listed(ids, operation), filter_running(rest, ids))

def discarded_result(state: State, queued: Filtered, active: Filtered,
    running: Filtered) -> DispatchResult:
  match state queued active running:
    case State{_, _, _, next_sequence, cycle, closed}
        Filtered{pending, pending_commands}
        Filtered{current, current_commands}
        Filtered{executing, executing_commands}:
      Advanced{State{pending, current, executing, next_sequence, cycle, closed},
        List.append(&2, Command, pending_commands,
          List.append(&2, Command, current_commands, executing_commands))}

def discard(+state: State, +ids: List<&2, Nat>) -> DispatchResult:
  match state:
    case State{+pending, +active, +running, _, _, _}:
      discarded_result(state, filter_queued(pending, ids),
        filter_queued(active, ids), filter_running(running, ids))

def discard_all(items: List<&2, Entry>) -> List<&2, Command>:
  match items:
    case Nil{}:
      Nil{}
    case entry <> rest:
      discarded_entry(entry, False{}) <> discard_all(rest)

def close(state: State) -> DispatchResult:
  match state:
    case State{pending, active, running, next_sequence, cycle, _}:
      Advanced{State{Nil{}, Nil{}, running, next_sequence, cycle, True{}},
        List.append(&2, Command, discard_all(pending), discard_all(active))}
