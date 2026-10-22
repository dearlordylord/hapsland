import Base

# Native job handles and promises are outside this source-free state.
# Preparation or review work queued or running under the resident scheduler.
type ScheduledReviewWork is Data:
  ScheduledReviewWork{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    sequence: Nat, cancelled: Bool, preparation: Bool}

# A locally tracked call to the selected review service. It holds a request slot
# from reservation until settlement, including calls that never start.
type ReviewServiceRequestRecord is Data:
  ReviewServiceRequestRecord{partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    review_service_request_id: Nat, started: Bool, interrupted: Bool}

type State is Data:
  State{queued: List<&2, ScheduledReviewWork>, running: List<&2, ScheduledReviewWork>,
    next_sequence: Nat, closed: Bool, review_service_requests: List<&2, ReviewServiceRequestRecord>}

type Command is Data:
  Started{operation: Nat, sequence: Nat}
  Discarded{operation: Nat, running: Bool}

type DispatchResult is Data:
  Advanced{state: State, commands: List<&2, Command>}
  Denied{state: State}

def initial() -> State:
  State{Nil{}, Nil{}, 0n, False{}, Nil{}}

# Native preparation jobs have their own finite bound. Review evaluation
# reaches the separate review service request pool only after final measurements.
def max_running() -> Nat:
  8n

def max_requests() -> Nat:
  8n

def preparation_count(items: List<&2, ScheduledReviewWork>) -> Nat:
  match items:
    case Nil{}: 0n
    case ScheduledReviewWork{_, _, _, _, _, _, True{}} <> rest:
      (1n + preparation_count(rest) : Nat)
    case _ <> rest:
      preparation_count(rest)

def same_entry(entry: ScheduledReviewWork, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> Bool:
  match entry:
    case ScheduledReviewWork{owner, generation, current, id, _, _, _}:
      Bool.and(Nat.is_eq(owner, partition), Bool.and(Nat.is_eq(generation, lifetime),
        Bool.and(Nat.is_eq(current, round), Nat.is_eq(id, operation))))

def contains(items: List<&2, ScheduledReviewWork>, +partition: Nat, +lifetime: Nat,
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

def start_command(entry: ScheduledReviewWork) -> Command:
  match entry:
    case ScheduledReviewWork{_, _, _, operation, sequence, _, _}: Started{operation, sequence}

def can_start(entry: ScheduledReviewWork, running: List<&2, ScheduledReviewWork>) -> Bool:
  match entry:
    case ScheduledReviewWork{_, _, _, _, _, _, False{}}: True{}
    case _:
      Nat.is_lt(preparation_count(running), max_running())

def prepend_waiting(entry: ScheduledReviewWork, result: DispatchResult) -> DispatchResult:
  match result:
    case Advanced{state, commands}:
      match state:
        case State{queued, running, next_sequence, closed, review_service_requests}:
          Advanced{
            State{entry <> queued, running, next_sequence, closed, review_service_requests},
            commands
          }
    case Denied{state}: Denied{state}

def pump_queued(
  +queued: List<&2, ScheduledReviewWork>,
  +running: List<&2, ScheduledReviewWork>,
  +next_sequence: Nat,
  +closed: Bool,
  +review_service_requests: List<&2, ReviewServiceRequestRecord>
) -> DispatchResult:
  match queued:
    case Nil{}: Advanced{
      State{Nil{}, running, next_sequence, closed, review_service_requests},
      Nil{}
    }
    case +entry <> rest:
      Bool.pick(DispatchResult, can_start(entry, running),
        Advanced{State{rest, List.append(&2, ScheduledReviewWork, running, entry <> Nil{}),
          next_sequence, closed, review_service_requests}, start_command(entry) <> Nil{}},
        prepend_waiting(entry,
          pump_queued(rest, running, next_sequence, closed, review_service_requests)))

def pump_one(state: State) -> DispatchResult:
  match state:
    case State{queued, running, next_sequence, closed, review_service_requests}:
      pump_queued(queued, running, next_sequence, closed, review_service_requests)

def pump_next_result(first: State, commands: List<&2, Command>,
    result: DispatchResult) -> DispatchResult:
  match result:
    case Advanced{second, more}:
      Advanced{second, List.append(&2, Command, commands, more)}
    case Denied{_}: Denied{first}

def pump_next(+first: State, commands: List<&2, Command>) -> DispatchResult:
  pump_next_result(first, commands, pump_one(first))

def may_pump(
  queued: List<&2, ScheduledReviewWork>,
  +running: List<&2, ScheduledReviewWork>
) -> Bool:
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
      pump_remaining(List.length(&2, ScheduledReviewWork, queued), Advanced{state, Nil{}})

def enqueue(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +preparation: Bool) -> DispatchResult:
  match state:
    case State{+queued, +running, +next_sequence, +closed, +review_service_requests}:
      Bool.pick(DispatchResult, Bool.or(closed,
          known(state, partition, lifetime, round, operation)),
        Denied{state},
        pump_available(State{List.append(&2, ScheduledReviewWork, queued,
          ScheduledReviewWork{partition, lifetime, round, operation, next_sequence,
            False{}, preparation} <> Nil{}), running,
          (next_sequence + 1n : Nat), closed, review_service_requests}))

def remove_entry(items: List<&2, ScheduledReviewWork>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> List<&2, ScheduledReviewWork>:
  match items:
    case Nil{}: Nil{}
    case +entry <> +rest:
      Bool.pick(
        List<&2, ScheduledReviewWork>,
        same_entry(entry, partition, lifetime, round, operation),
        rest,
        entry <> remove_entry(rest, partition, lifetime, round, operation)
      )

def settle(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat) -> DispatchResult:
  match state:
    case State{queued, +running, next_sequence, closed, review_service_requests}:
      Bool.pick(DispatchResult, contains(running, partition, lifetime, round, operation),
        pump_available(State{queued,
          remove_entry(running, partition, lifetime, round, operation),
          next_sequence, closed, review_service_requests}),
        Denied{state})

def listed(ids: List<&2, Nat>, +operation: Nat) -> Bool:
  match ids:
    case Nil{}: False{}
    case id <> rest:
      Bool.or(Nat.is_eq(id, operation), listed(rest, operation))

type Filtered is Data:
  Filtered{entries: List<&2, ScheduledReviewWork>, commands: List<&2, Command>}

def discarded_entry(entry: ScheduledReviewWork, running: Bool) -> Command:
  match entry:
    case ScheduledReviewWork{_, _, _, operation, _, _, _}: Discarded{operation, running}

def filter_queued_one(entry: ScheduledReviewWork, hit: Bool, tail: Filtered) -> Filtered:
  match hit:
    case True{}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{entries, discarded_entry(entry, False{}) <> commands}
    case False{}:
      match tail:
        case Filtered{entries, commands}: Filtered{entry <> entries, commands}

def filter_queued(items: List<&2, ScheduledReviewWork>, +ids: List<&2, Nat>) -> Filtered:
  match items:
    case Nil{}: Filtered{Nil{}, Nil{}}
    case +entry <> rest:
      match entry:
        case ScheduledReviewWork{_, _, _, operation, _, _, _}:
          filter_queued_one(entry, listed(ids, operation), filter_queued(rest, ids))

def cancelled_entry(entry: ScheduledReviewWork) -> ScheduledReviewWork:
  match entry:
    case ScheduledReviewWork{partition, lifetime, round, operation, sequence, _, preparation}:
      ScheduledReviewWork{partition, lifetime, round, operation, sequence, True{}, preparation}

def filter_running_hit(+entry: ScheduledReviewWork, hit: Bool, tail: Filtered) -> Filtered:
  match hit:
    case False{}:
      match tail:
        case Filtered{entries, commands}: Filtered{entry <> entries, commands}
    case True{}:
      match tail:
        case Filtered{entries, commands}:
          Filtered{cancelled_entry(entry) <> entries,
            discarded_entry(entry, True{}) <> commands}

def filter_running_one(entry: ScheduledReviewWork, hit: Bool, tail: Filtered) -> Filtered:
  match entry:
    case ScheduledReviewWork{_, _, _, _, _, True{}, _}:
      match tail:
        case Filtered{entries, commands}: Filtered{entry <> entries, commands}
    case _: filter_running_hit(entry, hit, tail)

def filter_running(items: List<&2, ScheduledReviewWork>, +ids: List<&2, Nat>) -> Filtered:
  match items:
    case Nil{}: Filtered{Nil{}, Nil{}}
    case +entry <> rest:
      match entry:
        case ScheduledReviewWork{_, _, _, operation, _, _, _}:
          filter_running_one(entry, listed(ids, operation), filter_running(rest, ids))

def discarded_result(state: State, queued: Filtered, running: Filtered) -> DispatchResult:
  match state queued running:
    case State{_, _, next_sequence, closed, review_service_requests}
        Filtered{waiting, waiting_commands}
        Filtered{executing, executing_commands}:
      Advanced{State{waiting, executing, next_sequence, closed, review_service_requests},
        List.append(&2, Command, waiting_commands, executing_commands)}

def discard(+state: State, +ids: List<&2, Nat>) -> DispatchResult:
  match state:
    case State{+queued, +running, _, _, _}:
      discarded_result(state, filter_queued(queued, ids), filter_running(running, ids))

def discard_all(items: List<&2, ScheduledReviewWork>) -> List<&2, Command>:
  match items:
    case Nil{}: Nil{}
    case entry <> rest: discarded_entry(entry, False{}) <> discard_all(rest)

def close(state: State) -> DispatchResult:
  match state:
    case State{queued, running, next_sequence, _, review_service_requests}:
      Advanced{
        State{Nil{}, running, next_sequence, True{}, review_service_requests},
        discard_all(queued)
      }

# These are review service request records, independent of preparation dispatch.
# A permit is kept through interruption until the native Effect settles.
type ReviewServiceRequestResult is Data:
  ReviewServiceRequestAccepted{state: State}
  ReviewServiceRequestDenied{state: State}

def request_matches(item: ReviewServiceRequestRecord, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +review_service_request_id: Nat) -> Bool:
  match item:
    case ReviewServiceRequestRecord{owner, generation, current, work, id, _, _}:
      Bool.and(Nat.is_eq(owner, partition), Bool.and(Nat.is_eq(generation, lifetime),
        Bool.and(Nat.is_eq(current, round), Bool.and(Nat.is_eq(work, operation),
          Nat.is_eq(id, review_service_request_id)))))

def request_known(items: List<&2, ReviewServiceRequestRecord>, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +review_service_request_id: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case +item <> rest:
      Bool.or(
        request_matches(item, partition, lifetime, round, operation, review_service_request_id),
        request_known(rest, partition, lifetime, round, operation, review_service_request_id)
      )

def request_for_work(items: List<&2, ReviewServiceRequestRecord>, +operation: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case ReviewServiceRequestRecord{_, _, _, work, _, _, _} <> rest:
      Bool.or(Nat.is_eq(work, operation), request_for_work(rest, operation))

def reserve_request(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +review_service_request_id: Nat) -> ReviewServiceRequestResult:
  match state:
    case State{queued, running, next_sequence, closed, +review_service_requests}:
      Bool.pick(
        ReviewServiceRequestResult,
        Bool.or(
          closed,
          Bool.or(
            request_for_work(review_service_requests, operation),
            Bool.not(
              Nat.is_lt(
                List.length(&2, ReviewServiceRequestRecord, review_service_requests),
                max_requests()
              )
            )
          )
        ),
        ReviewServiceRequestDenied{state},
        ReviewServiceRequestAccepted{
          State{
            queued,
            running,
            next_sequence,
            closed,
            ReviewServiceRequestRecord{
              partition,
              lifetime,
              round,
              operation,
              review_service_request_id,
              False{},
              False{}
            } <> review_service_requests
          }
        }
      )

def request_started(
  items: List<&2, ReviewServiceRequestRecord>,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +review_service_request_id: Nat
) -> List<&2, ReviewServiceRequestRecord>:
  match items:
    case Nil{}: Nil{}
    case +item <> +rest:
      match item:
        case ReviewServiceRequestRecord{owner, generation, current, work, id, _, interrupted}:
          Bool.pick(
            List<&2, ReviewServiceRequestRecord>,
            request_matches(item, partition, lifetime, round, operation, review_service_request_id),
            ReviewServiceRequestRecord{
              owner,
              generation,
              current,
              work,
              id,
              True{},
              interrupted
            } <> rest,
            item <> request_started(
              rest,
              partition,
              lifetime,
              round,
              operation,
              review_service_request_id
            )
          )

def request_interrupted(
  items: List<&2, ReviewServiceRequestRecord>,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +review_service_request_id: Nat
) -> List<&2, ReviewServiceRequestRecord>:
  match items:
    case Nil{}: Nil{}
    case +item <> +rest:
      match item:
        case ReviewServiceRequestRecord{owner, generation, current, work, id, started, _}:
          Bool.pick(
            List<&2, ReviewServiceRequestRecord>,
            request_matches(item, partition, lifetime, round, operation, review_service_request_id),
            ReviewServiceRequestRecord{
              owner,
              generation,
              current,
              work,
              id,
              started,
              True{}
            } <> rest,
            item <> request_interrupted(
              rest,
              partition,
              lifetime,
              round,
              operation,
              review_service_request_id
            )
          )

def request_remove(
  items: List<&2, ReviewServiceRequestRecord>,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +review_service_request_id: Nat
) -> List<&2, ReviewServiceRequestRecord>:
  match items:
    case Nil{}: Nil{}
    case +item <> +rest:
      Bool.pick(
        List<&2, ReviewServiceRequestRecord>,
        request_matches(item, partition, lifetime, round, operation, review_service_request_id),
        rest,
        item <> request_remove(
          rest,
          partition,
          lifetime,
          round,
          operation,
          review_service_request_id
        )
      )

def request_phase(
  items: List<&2, ReviewServiceRequestRecord>,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +review_service_request_id: Nat
) -> Maybe<&2, ReviewServiceRequestRecord>:
  match items:
    case Nil{}: None{}
    case +item <> rest:
      Bool.pick(
        Maybe<&2, ReviewServiceRequestRecord>,
        request_matches(item, partition, lifetime, round, operation, review_service_request_id),
        Some{item},
        request_phase(rest, partition, lifetime, round, operation, review_service_request_id)
      )

def request_update_found(
  +state: State,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +review_service_request_id: Nat,
  +start: Bool,
  +interrupt: Bool,
  +settle: Bool,
  found: Maybe<&2, ReviewServiceRequestRecord>
) -> ReviewServiceRequestResult:
  match state found:
    case _ None{}: ReviewServiceRequestDenied{state}
    case State{queued, running, next_sequence, closed, +review_service_requests}
        Some{ReviewServiceRequestRecord{_, _, _, _, _, +started, interrupted}}:
      Bool.pick(
        ReviewServiceRequestResult,
        Bool.or(
          Bool.and(start, started),
          Bool.or(Bool.and(interrupt, interrupted), Bool.and(interrupt, Bool.not(started)))
        ),
        ReviewServiceRequestDenied{state},
        ReviewServiceRequestAccepted{
          State{
            queued,
            running,
            next_sequence,
            closed,
            Bool.pick(
              List<&2, ReviewServiceRequestRecord>,
              settle,
              request_remove(
                review_service_requests,
                partition,
                lifetime,
                round,
                operation,
                review_service_request_id
              ),
              Bool.pick(
                List<&2, ReviewServiceRequestRecord>,
                start,
                request_started(
                  review_service_requests,
                  partition,
                  lifetime,
                  round,
                  operation,
                  review_service_request_id
                ),
                request_interrupted(
                  review_service_requests,
                  partition,
                  lifetime,
                  round,
                  operation,
                  review_service_request_id
                )
              )
            )
          }
        }
      )

def request_update(+state: State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +review_service_request_id: Nat, start: Bool,
    interrupt: Bool, settle: Bool) -> ReviewServiceRequestResult:
  match state:
    case State{_, _, _, _, review_service_requests}:
      request_update_found(
        state,
        partition,
        lifetime,
        round,
        operation,
        review_service_request_id,
        start,
        interrupt,
        settle,
        request_phase(
          review_service_requests,
          partition,
          lifetime,
          round,
          operation,
          review_service_request_id
        )
      )
