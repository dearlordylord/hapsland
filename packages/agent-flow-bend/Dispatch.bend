import Base

# A finite dispatch cohort is fixed when the previous cohort becomes idle.
# Native job handles and promises are outside this source-free state.
type Entry is Data:
  Entry{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    sequence: Nat, cycle: Nat, cancelled: Bool, preparation: Bool}

type Request is Data:
  Request{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    request: Nat, started: Bool, interrupted: Bool}

type State is Data:
  State{pending: List<&2, Entry>, active: List<&2, Entry>,
    running: List<&2, Entry>, next_sequence: Nat, cycle: Nat, closed: Bool,
    requests: List<&2, Request>}

type Command is Data:
  Started{operation: Nat, sequence: Nat, cycle: Nat}
  CycleCompleted{cycle: Nat}
  Discarded{operation: Nat, running: Bool}

type DispatchResult is Data:
  Advanced{state: State, commands: List<&2, Command>}
  Denied{state: State}

def initial() -> State:
  State{Nil{}, Nil{}, Nil{}, 0n, 0n, False{}, Nil{}}

# Native preparation jobs have their own finite bound. Review evaluation
# reaches the separate Jev request pool only after final measurements.
def max_running() -> Nat:
  8n

def max_requests() -> Nat:
  8n

def preparation_count(items: List<&2, Entry>) -> Nat:
  match items:
    case Nil{}: 0n
    case Entry{_, _, _, _, _, _, _, True{}} <> rest:
      (1n + preparation_count(rest) : Nat)
    case _ <> rest:
      preparation_count(rest)

def preparation_idle(active: List<&2, Entry>, running: List<&2, Entry>) -> Bool:
  Bool.and(Nat.is_eq(preparation_count(active), 0n),
    Nat.is_eq(preparation_count(running), 0n))

def same_entry(entry: Entry, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Bool:
  match entry:
    case Entry{owner, generation, current, id, _, _, _, _}:
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
    case State{pending, active, running, _, _, _, _}:
      Bool.or(contains(pending, partition, lifetime, round, operation),
        Bool.or(contains(active, partition, lifetime, round, operation),
          contains(running, partition, lifetime, round, operation)))

def start(entry: Entry, cycle: Nat) -> Entry:
  match entry:
    case Entry{partition, lifetime, round, operation, sequence, _, cancelled, preparation}:
      Entry{partition, lifetime, round, operation, sequence, cycle, cancelled, preparation}

def start_command(entry: Entry) -> Command:
  match entry:
    case Entry{_, _, _, operation, sequence, cycle, _, _}:
      Started{operation, sequence, cycle}

def pump_active(active: List<&2, Entry>, pending: List<&2, Entry>,
    running: List<&2, Entry>, next_sequence: Nat, +cycle: Nat,
    closed: Bool, requests: List<&2, Request>) -> DispatchResult:
  match active:
    case Entry{_, _, _, _, _, _, True{}, _} <> rest:
      pump_active(rest, pending, running, next_sequence, cycle, closed, requests)
    case +entry <> rest:
      +next = start(entry, cycle)
      Advanced{State{pending, rest,
        List.append(&2, Entry, running, next <> Nil{}), next_sequence, cycle, closed, requests},
        start_command(next) <> Nil{}}
    case Nil{}:
      Advanced{State{pending, Nil{}, running, next_sequence, cycle, closed, requests}, Nil{}}

# Recurse on the active list itself so both Bend checkers see the decrease.
def pump_one(state: State) -> DispatchResult:
  match state:
    case State{pending, active, running, next_sequence, cycle, closed, requests}:
      pump_active(active, pending, running, next_sequence, cycle, closed, requests)

def pump_next_result(first: State, commands: List<&2, Command>,
    result: DispatchResult) -> DispatchResult:
  match result:
    case Advanced{second, more}:
      Advanced{second, List.append(&2, Command, commands, more)}
    case Denied{_}:
      Denied{first}

def pump_next(+first: State, commands: List<&2, Command>) -> DispatchResult:
  pump_next_result(first, commands, pump_one(first))

def may_pump(active: List<&2, Entry>, running: List<&2, Entry>) -> Bool:
  match active:
    case Nil{}: False{}
    case Entry{_, _, _, _, _, _, _, False{}} <> _: True{}
    case _ <> _:
      Nat.is_lt(preparation_count(running), max_running())

def pump_remaining(remaining: Nat, result: DispatchResult) -> DispatchResult:
  match remaining:
    case 0n:
      result
    case 1n+rest:
      match result:
        case Advanced{+state, +commands}:
          match state:
            case State{_, active, running, _, _, _, _}:
              Bool.pick(DispatchResult, may_pump(active, running),
                pump_remaining(rest, pump_next(state, commands)),
                Advanced{state, commands})
        case Denied{state}:
          Denied{state}

def pump_available(+state: State) -> DispatchResult:
  match state:
    case State{_, active, _, _, _, _, _}:
      # A cancelled entry consumes no slot but must still leave the active cohort.
      pump_remaining(List.length(&2, Entry, active), Advanced{state, Nil{}})

def review_cycle(pending: List<&2, Entry>, active: List<&2, Entry>,
    running: List<&2, Entry>, +cycle: Nat) -> Nat:
  Bool.pick(Nat,
    Bool.and(Nat.is_eq(List.length(&2, Entry, pending), 0n),
      Bool.and(Nat.is_eq(List.length(&2, Entry, active), 0n),
        Nat.is_eq(List.length(&2, Entry, running), 0n))),
    (cycle + 1n : Nat), cycle)

def enqueue_review(+pending: List<&2, Entry>, +active: List<&2, Entry>,
    +running: List<&2, Entry>, +next_sequence: Nat, cycle: Nat, closed: Bool,
    requests: List<&2, Request>, partition: Nat, lifetime: Nat,
    round: Nat, operation: Nat) -> DispatchResult:
  +current_cycle = review_cycle(pending, active, running, cycle)
  pump_available(State{pending,
    Entry{partition, lifetime, round, operation, next_sequence,
      current_cycle, False{}, False{}} <> active,
    running, (next_sequence + 1n : Nat), current_cycle, closed, requests})

def enqueue(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +preparation: Bool) -> DispatchResult:
  match state:
    case State{+pending, +active, +running, +next_sequence, +cycle, +closed, +requests}:
      Bool.pick(DispatchResult, Bool.or(closed,
          known(state, partition, lifetime, round, operation)),
        Denied{state},
        Bool.pick(DispatchResult, preparation,
          Bool.pick(DispatchResult,
            Bool.and(preparation_idle(active, running),
              Nat.is_eq(List.length(&2, Entry, pending), 0n)),
            pump_available(State{pending,
              Entry{partition, lifetime, round, operation, next_sequence,
                (cycle + 1n : Nat), False{}, True{}} <> active, running,
              (next_sequence + 1n : Nat), (cycle + 1n : Nat), closed, requests}),
            Advanced{State{List.append(&2, Entry, pending,
                Entry{partition, lifetime, round, operation, next_sequence, 0n, False{}, True{}} <> Nil{}),
              active, running, (next_sequence + 1n : Nat), cycle, closed, requests}, Nil{}}),
          enqueue_review(pending, active, running, next_sequence, cycle,
            closed, requests, partition, lifetime, round, operation)))

def remove_entry(items: List<&2, Entry>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> List<&2, Entry>:
  match items:
    case Nil{}:
      Nil{}
    case +entry <> +rest:
      Bool.pick(List<&2, Entry>, same_entry(entry, partition, lifetime, round, operation),
        rest, entry <> remove_entry(rest, partition, lifetime, round, operation))

def entry_cycle(items: List<&2, Entry>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Nat:
  match items:
    case Nil{}: 0n
    case +entry <> rest:
      match entry:
        case Entry{_, _, _, _, _, cycle, _, _}:
          Bool.pick(Nat, same_entry(entry, partition, lifetime, round, operation),
            cycle, entry_cycle(rest, partition, lifetime, round, operation))

def has_cycle(items: List<&2, Entry>, +cycle: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case Entry{_, _, _, _, _, current, _, _} <> rest:
      Bool.or(Nat.is_eq(current, cycle), has_cycle(rest, cycle))

def completed_cycle(commands: List<&2, Command>, +cycle: Nat) -> Bool:
  match commands:
    case Nil{}: False{}
    case CycleCompleted{current} <> rest:
      Bool.or(Nat.is_eq(current, cycle), completed_cycle(rest, cycle))
    case _ <> rest: completed_cycle(rest, cycle)

def settled_cycle_result(result: DispatchResult, +settled_cycle: Nat) -> DispatchResult:
  match result:
    case Advanced{+state, +commands}:
      match state:
        case State{_, active, running, _, cycle, _, _}:
          Bool.pick(DispatchResult,
            Bool.and(Nat.is_ne(settled_cycle, cycle),
              Bool.not(Bool.or(completed_cycle(commands, settled_cycle),
                Bool.or(has_cycle(active, settled_cycle),
                  has_cycle(running, settled_cycle))))),
            Advanced{state, List.append(&2, Command, commands,
              CycleCompleted{settled_cycle} <> Nil{})},
            Advanced{state, commands})
    case Denied{state}: Denied{state}

def promote(items: List<&2, Entry>, +cycle: Nat) -> List<&2, Entry>:
  match items:
    case Nil{}:
      Nil{}
    case +entry <> rest:
      start(entry, cycle) <> promote(rest, cycle)

def promoted_pumped(state: State, +cycle: Nat, announce: Bool,
    result: DispatchResult) -> DispatchResult:
  match result:
    case Advanced{next, +starts}:
      Advanced{next, Bool.pick(List<&2, Command>, announce,
        CycleCompleted{cycle} <> starts, starts)}
    case Denied{_}:
      Denied{state}

def promoted_result(state: State, +pending: List<&2, Entry>,
    active: List<&2, Entry>, +running: List<&2, Entry>, +next_sequence: Nat,
    +cycle: Nat, closed: Bool, requests: List<&2, Request>) -> DispatchResult:
  promoted_pumped(state, cycle,
    Nat.is_eq(List.length(&2, Entry, running), 0n),
    pump_available(State{Nil{},
      List.append(&2, Entry, active, promote(pending, (cycle + 1n : Nat))), running,
      next_sequence, (cycle + 1n : Nat), closed, requests}))

def after_settle(+state: State) -> DispatchResult:
  match state:
    case State{+pending, +active, +running, +next_sequence, +cycle, +closed, +requests}:
      Bool.pick(DispatchResult,
        preparation_idle(active, running),
        Bool.pick(DispatchResult, Nat.is_eq(List.length(&2, Entry, pending), 0n),
          Bool.pick(DispatchResult,
            Bool.and(Nat.is_eq(List.length(&2, Entry, active), 0n),
              Nat.is_eq(List.length(&2, Entry, running), 0n)),
            Advanced{state, CycleCompleted{cycle} <> Nil{}},
            pump_available(state)),
          promoted_result(state, pending, active, running, next_sequence, cycle,
            closed, requests)),
        pump_available(state))

def settle(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> DispatchResult:
  match state:
    case State{pending, active, +running, next_sequence, cycle, closed, requests}:
      Bool.pick(DispatchResult, contains(running, partition, lifetime, round, operation),
        settled_cycle_result(after_settle(State{pending, active,
          remove_entry(running, partition, lifetime, round, operation),
          next_sequence, cycle, closed, requests}),
          entry_cycle(running, partition, lifetime, round, operation)),
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
    case Entry{_, _, _, operation, _, _, _, _}:
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
        case Entry{_, _, _, operation, _, _, _, _}:
          filter_queued_one(entry, listed(ids, operation), filter_queued(rest, ids))

def cancelled_entry(entry: Entry) -> Entry:
  match entry:
    case Entry{partition, lifetime, round, operation, sequence, cycle, _, preparation}:
      Entry{partition, lifetime, round, operation, sequence, cycle, True{}, preparation}

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
    case Entry{_, _, _, _, _, _, True{}, _}:
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
        case Entry{_, _, _, operation, _, _, _, _}:
          filter_running_one(entry, listed(ids, operation), filter_running(rest, ids))

def discarded_result(state: State, queued: Filtered, active: Filtered,
    running: Filtered) -> DispatchResult:
  match state queued active running:
    case State{_, _, _, next_sequence, cycle, closed, requests}
        Filtered{pending, pending_commands}
        Filtered{current, current_commands}
        Filtered{executing, executing_commands}:
      Advanced{State{pending, current, executing, next_sequence, cycle, closed, requests},
        List.append(&2, Command, pending_commands,
          List.append(&2, Command, current_commands, executing_commands))}

def discard(+state: State, +ids: List<&2, Nat>) -> DispatchResult:
  match state:
    case State{+pending, +active, +running, _, _, _, _}:
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
    case State{pending, active, running, next_sequence, cycle, _, requests}:
      Advanced{State{Nil{}, Nil{}, running, next_sequence, cycle, True{}, requests},
        List.append(&2, Command, discard_all(pending), discard_all(active))}

# These are request permits, independent of preparation dispatch cohorts.
# A permit is kept through interruption until the native Effect settles.
type RequestResult is Data:
  RequestAccepted{state: State}
  RequestDenied{state: State}

def request_matches(item: Request, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> Bool:
  match item:
    case Request{owner, generation, current, work, id, _, _}:
      Bool.and(Nat.is_eq(owner, partition), Bool.and(Nat.is_eq(generation, lifetime),
        Bool.and(Nat.is_eq(current, round), Bool.and(Nat.is_eq(work, operation),
          Nat.is_eq(id, request)))))

def request_known(items: List<&2, Request>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case +item <> rest:
      Bool.or(request_matches(item, partition, lifetime, round, operation, request),
        request_known(rest, partition, lifetime, round, operation, request))

def request_for_work(items: List<&2, Request>, +operation: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case Request{_, _, _, work, _, _, _} <> rest:
      Bool.or(Nat.is_eq(work, operation), request_for_work(rest, operation))

def reserve_request(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> RequestResult:
  match state:
    case State{pending, active, running, next_sequence, cycle, closed, +requests}:
      Bool.pick(RequestResult,
        Bool.or(closed, Bool.or(request_for_work(requests, operation),
          Bool.not(Nat.is_lt(List.length(&2, Request, requests), max_requests())))),
        RequestDenied{state},
        RequestAccepted{State{pending, active, running, next_sequence, cycle, closed,
          Request{partition, lifetime, round, operation, request, False{}, False{}} <> requests}})

def request_started(items: List<&2, Request>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> List<&2, Request>:
  match items:
    case Nil{}: Nil{}
    case +item <> +rest:
      match item:
        case Request{owner, generation, current, work, id, _, interrupted}:
          Bool.pick(List<&2, Request>,
            request_matches(item, partition, lifetime, round, operation, request),
            Request{owner, generation, current, work, id, True{}, interrupted} <> rest,
            item <> request_started(rest, partition, lifetime, round, operation, request))

def request_interrupted(items: List<&2, Request>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> List<&2, Request>:
  match items:
    case Nil{}: Nil{}
    case +item <> +rest:
      match item:
        case Request{owner, generation, current, work, id, started, _}:
          Bool.pick(List<&2, Request>,
            request_matches(item, partition, lifetime, round, operation, request),
            Request{owner, generation, current, work, id, started, True{}} <> rest,
            item <> request_interrupted(rest, partition, lifetime, round, operation, request))

def request_remove(items: List<&2, Request>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> List<&2, Request>:
  match items:
    case Nil{}: Nil{}
    case +item <> +rest:
      Bool.pick(List<&2, Request>,
        request_matches(item, partition, lifetime, round, operation, request),
        rest, item <> request_remove(rest, partition, lifetime, round, operation, request))

def request_phase(items: List<&2, Request>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat) -> Maybe<&2, Request>:
  match items:
    case Nil{}: None{}
    case +item <> rest:
      Bool.pick(Maybe<&2, Request>,
        request_matches(item, partition, lifetime, round, operation, request),
        Some{item}, request_phase(rest, partition, lifetime, round, operation, request))

def request_update_found(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat, +start: Bool,
    +interrupt: Bool, +settle: Bool, found: Maybe<&2, Request>) -> RequestResult:
  match state found:
    case _ None{}: RequestDenied{state}
    case State{pending, active, running, next_sequence, cycle, closed, +requests}
        Some{Request{_, _, _, _, _, +started, interrupted}}:
      Bool.pick(RequestResult,
        Bool.or(Bool.and(start, started),
          Bool.or(Bool.and(interrupt, interrupted),
            Bool.and(interrupt, Bool.not(started)))),
        RequestDenied{state},
        RequestAccepted{State{pending, active, running, next_sequence, cycle, closed,
          Bool.pick(List<&2, Request>, settle,
            request_remove(requests, partition, lifetime, round, operation, request),
            Bool.pick(List<&2, Request>, start,
              request_started(requests, partition, lifetime, round, operation, request),
              request_interrupted(requests, partition, lifetime, round, operation, request)))}})

def request_update(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat, start: Bool,
    interrupt: Bool, settle: Bool) -> RequestResult:
  match state:
    case State{_, _, _, _, _, _, requests}:
      request_update_found(state, partition, lifetime, round, operation, request,
        start, interrupt, settle,
        request_phase(requests, partition, lifetime, round, operation, request))
