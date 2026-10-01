import Base

# Native job handles and promises are outside this source-free state.
type Entry is Data:
  Entry{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    sequence: Nat, cancelled: Bool, preparation: Bool}

type Request is Data:
  Request{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    request: Nat, started: Bool, interrupted: Bool}

type State is Data:
  State{queued: List<&2, Entry>, running: List<&2, Entry>,
    next_sequence: Nat, closed: Bool, requests: List<&2, Request>}

type Command is Data:
  Started{operation: Nat, sequence: Nat}
  Discarded{operation: Nat, running: Bool}

type DispatchResult is Data:
  Advanced{state: State, commands: List<&2, Command>}
  Denied{state: State}

def initial() -> State:
  State{Nil{}, Nil{}, 0n, False{}, Nil{}}

# Native preparation jobs have their own finite bound. Review evaluation
# reaches the separate Jev request pool only after final measurements.
def max_running() -> Nat:
  8n

def max_requests() -> Nat:
  8n

def preparation_count(items: List<&2, Entry>) -> Nat:
  match items:
    case Nil{}: 0n
    case Entry{_, _, _, _, _, _, True{}} <> rest:
      (1n + preparation_count(rest) : Nat)
    case _ <> rest:
      preparation_count(rest)

def same_entry(entry: Entry, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Bool:
  match entry:
    case Entry{owner, generation, current, id, _, _, _}:
      Bool.and(Nat.is_eq(owner, partition), Bool.and(Nat.is_eq(generation, lifetime),
        Bool.and(Nat.is_eq(current, round), Nat.is_eq(id, operation))))

def contains(items: List<&2, Entry>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case +entry <> +rest:
      Bool.or(same_entry(entry, partition, lifetime, round, operation),
        contains(rest, partition, lifetime, round, operation))

def known(state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Bool:
  match state:
    case State{queued, running, _, _, _}:
      Bool.or(contains(queued, partition, lifetime, round, operation),
        contains(running, partition, lifetime, round, operation))

def start_command(entry: Entry) -> Command:
  match entry:
    case Entry{_, _, _, operation, sequence, _, _}: Started{operation, sequence}

def can_start(entry: Entry, running: List<&2, Entry>) -> Bool:
  match entry:
    case Entry{_, _, _, _, _, _, False{}}: True{}
    case _:
      Nat.is_lt(preparation_count(running), max_running())

def prepend_waiting(entry: Entry, result: DispatchResult) -> DispatchResult:
  match result:
    case Advanced{state, commands}:
      match state:
        case State{queued, running, next_sequence, closed, requests}:
          Advanced{State{entry <> queued, running, next_sequence, closed, requests}, commands}
    case Denied{state}: Denied{state}

def pump_queued(+queued: List<&2, Entry>, +running: List<&2, Entry>,
    +next_sequence: Nat, +closed: Bool, +requests: List<&2, Request>) -> DispatchResult:
  match queued:
    case Nil{}: Advanced{State{Nil{}, running, next_sequence, closed, requests}, Nil{}}
    case +entry <> rest:
      Bool.pick(DispatchResult, can_start(entry, running),
        Advanced{State{rest, List.append(&2, Entry, running, entry <> Nil{}),
          next_sequence, closed, requests}, start_command(entry) <> Nil{}},
        prepend_waiting(entry,
          pump_queued(rest, running, next_sequence, closed, requests)))

def pump_one(state: State) -> DispatchResult:
  match state:
    case State{queued, running, next_sequence, closed, requests}:
      pump_queued(queued, running, next_sequence, closed, requests)

def pump_next_result(first: State, commands: List<&2, Command>,
    result: DispatchResult) -> DispatchResult:
  match result:
    case Advanced{second, more}:
      Advanced{second, List.append(&2, Command, commands, more)}
    case Denied{_}: Denied{first}

def pump_next(+first: State, commands: List<&2, Command>) -> DispatchResult:
  pump_next_result(first, commands, pump_one(first))

def may_pump(queued: List<&2, Entry>, +running: List<&2, Entry>) -> Bool:
  match queued:
    case Nil{}: False{}
    case +entry <> rest:
      Bool.or(can_start(entry, running), may_pump(rest, running))

def pump_remaining(remaining: Nat, result: DispatchResult) -> DispatchResult:
  match remaining:
    case 0n: result
    case 1n+rest:
      match result:
        case Advanced{+state, +commands}:
          match state:
            case State{queued, running, _, _, _}:
              Bool.pick(DispatchResult, may_pump(queued, running),
                pump_remaining(rest, pump_next(state, commands)),
                Advanced{state, commands})
        case Denied{state}: Denied{state}

def pump_available(+state: State) -> DispatchResult:
  match state:
    case State{queued, _, _, _, _}:
      pump_remaining(List.length(&2, Entry, queued), Advanced{state, Nil{}})

def enqueue(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +preparation: Bool) -> DispatchResult:
  match state:
    case State{+queued, +running, +next_sequence, +closed, +requests}:
      Bool.pick(DispatchResult, Bool.or(closed,
          known(state, partition, lifetime, round, operation)),
        Denied{state},
        pump_available(State{List.append(&2, Entry, queued,
          Entry{partition, lifetime, round, operation, next_sequence,
            False{}, preparation} <> Nil{}), running,
          (next_sequence + 1n : Nat), closed, requests}))

def remove_entry(items: List<&2, Entry>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> List<&2, Entry>:
  match items:
    case Nil{}: Nil{}
    case +entry <> +rest:
      Bool.pick(List<&2, Entry>, same_entry(entry, partition, lifetime, round, operation),
        rest, entry <> remove_entry(rest, partition, lifetime, round, operation))

def settle(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> DispatchResult:
  match state:
    case State{queued, +running, next_sequence, closed, requests}:
      Bool.pick(DispatchResult, contains(running, partition, lifetime, round, operation),
        pump_available(State{queued,
          remove_entry(running, partition, lifetime, round, operation),
          next_sequence, closed, requests}),
        Denied{state})

def listed(ids: List<&2, Nat>, +operation: Nat) -> Bool:
  match ids:
    case Nil{}: False{}
    case id <> rest:
      Bool.or(Nat.is_eq(id, operation), listed(rest, operation))

type Filtered is Data:
  Filtered{entries: List<&2, Entry>, commands: List<&2, Command>}

def discarded_entry(entry: Entry, running: Bool) -> Command:
  match entry:
    case Entry{_, _, _, operation, _, _, _}: Discarded{operation, running}

def filter_queued_one(entry: Entry, hit: Bool, tail: Filtered) -> Filtered:
  match hit:
    case True{}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{entries, discarded_entry(entry, False{}) <> commands}
    case False{}:
      match tail:
        case Filtered{entries, commands}: Filtered{entry <> entries, commands}

def filter_queued(items: List<&2, Entry>, +ids: List<&2, Nat>) -> Filtered:
  match items:
    case Nil{}: Filtered{Nil{}, Nil{}}
    case +entry <> rest:
      match entry:
        case Entry{_, _, _, operation, _, _, _}:
          filter_queued_one(entry, listed(ids, operation), filter_queued(rest, ids))

def cancelled_entry(entry: Entry) -> Entry:
  match entry:
    case Entry{partition, lifetime, round, operation, sequence, _, preparation}:
      Entry{partition, lifetime, round, operation, sequence, True{}, preparation}

def filter_running_hit(+entry: Entry, hit: Bool, tail: Filtered) -> Filtered:
  match hit:
    case False{}:
      match tail:
        case Filtered{entries, commands}: Filtered{entry <> entries, commands}
    case True{}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{cancelled_entry(entry) <> entries,
            discarded_entry(entry, True{}) <> commands}

def filter_running_one(entry: Entry, hit: Bool, tail: Filtered) -> Filtered:
  match entry:
    case Entry{_, _, _, _, _, True{}, _}:
      match tail:
        case Filtered{entries, commands}: Filtered{entry <> entries, commands}
    case _: filter_running_hit(entry, hit, tail)

def filter_running(items: List<&2, Entry>, +ids: List<&2, Nat>) -> Filtered:
  match items:
    case Nil{}: Filtered{Nil{}, Nil{}}
    case +entry <> rest:
      match entry:
        case Entry{_, _, _, operation, _, _, _}:
          filter_running_one(entry, listed(ids, operation), filter_running(rest, ids))

def discarded_result(state: State, queued: Filtered, running: Filtered) -> DispatchResult:
  match state queued running:
    case State{_, _, next_sequence, closed, requests}
        Filtered{waiting, waiting_commands}
        Filtered{executing, executing_commands}:
      Advanced{State{waiting, executing, next_sequence, closed, requests},
        List.append(&2, Command, waiting_commands, executing_commands)}

def discard(+state: State, +ids: List<&2, Nat>) -> DispatchResult:
  match state:
    case State{+queued, +running, _, _, _}:
      discarded_result(state, filter_queued(queued, ids), filter_running(running, ids))

def discard_all(items: List<&2, Entry>) -> List<&2, Command>:
  match items:
    case Nil{}: Nil{}
    case entry <> rest: discarded_entry(entry, False{}) <> discard_all(rest)

def close(state: State) -> DispatchResult:
  match state:
    case State{queued, running, next_sequence, _, requests}:
      Advanced{State{Nil{}, running, next_sequence, True{}, requests}, discard_all(queued)}

# These are request permits, independent of preparation dispatch.
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
    case State{queued, running, next_sequence, closed, +requests}:
      Bool.pick(RequestResult,
        Bool.or(closed, Bool.or(request_for_work(requests, operation),
          Bool.not(Nat.is_lt(List.length(&2, Request, requests), max_requests())))),
        RequestDenied{state},
        RequestAccepted{State{queued, running, next_sequence, closed,
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
    case State{queued, running, next_sequence, closed, +requests}
        Some{Request{_, _, _, _, _, +started, interrupted}}:
      Bool.pick(RequestResult,
        Bool.or(Bool.and(start, started),
          Bool.or(Bool.and(interrupt, interrupted),
            Bool.and(interrupt, Bool.not(started)))),
        RequestDenied{state},
        RequestAccepted{State{queued, running, next_sequence, closed,
          Bool.pick(List<&2, Request>, settle,
            request_remove(requests, partition, lifetime, round, operation, request),
            Bool.pick(List<&2, Request>, start,
              request_started(requests, partition, lifetime, round, operation, request),
              request_interrupted(requests, partition, lifetime, round, operation, request)))}})

def request_update(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +request: Nat, start: Bool,
    interrupt: Bool, settle: Bool) -> RequestResult:
  match state:
    case State{_, _, _, _, requests}:
      request_update_found(state, partition, lifetime, round, operation, request,
        start, interrupt, settle,
        request_phase(requests, partition, lifetime, round, operation, request))
