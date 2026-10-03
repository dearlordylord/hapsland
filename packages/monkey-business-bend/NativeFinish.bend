import Base
import ./NativeRunTypes.bend as T
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/CollectionState.bend as CollectionState
import ../agent-flow-bend/DeliveryState.bend as DeliveryState
import ../agent-flow-bend/Handoff.bend as Handoff

type Ready is Data:
  Ready{finish: T.Finish, actions: List<&2, Driver.Action>}

# Captured host facts for the ordinary Finish adapter. Canonical alone decides
# wait, deadline, continuation, reservation, authorization and terminal acceptance.
def partition(finish: T.Finish) -> Nat:
  match finish:
    case T.Finish{p, _, _, _, _, _, _, _, _, _}: p

def found(equal: Bool, finish: T.Finish, rest: Maybe<&2, T.Finish>) -> Maybe<&2, T.Finish>:
  match equal:
    case True{}: Some{finish}
    case False{}: rest

def find(finishes: List<&2, T.Finish>, +p: Nat) -> Maybe<&2, T.Finish>:
  match finishes:
    case Nil{}: None{}
    case +head <> tail: found(Nat.is_eq(partition(head), p), head, find(tail, p))

def retained(equal: Bool, finish: T.Finish, rest: List<&2, T.Finish>) -> List<&2, T.Finish>:
  match equal:
    case True{}: rest
    case False{}: finish <> rest

def remove(finishes: List<&2, T.Finish>, +p: Nat) -> List<&2, T.Finish>:
  match finishes:
    case Nil{}: []
    case +head <> tail: retained(Nat.is_eq(partition(head), p), head, remove(tail, p))

def replace(finishes: List<&2, T.Finish>, +finish: T.Finish) -> List<&2, T.Finish>:
  finish <> remove(finishes, partition(finish))

def waiting(finish: T.Finish, value: Bool) -> T.Finish:
  match finish:
    case T.Finish{p, l, r, attempt, token, deadline, recurring, selected, _, validating}:
      T.Finish{p, l, r, attempt, token, deadline, recurring, selected, value, validating}

def empty_selection(finish: T.Finish) -> T.Finish:
  match finish:
    case T.Finish{p, l, r, attempt, token, deadline, recurring, _, waiting, validating}:
      T.Finish{p, l, r, attempt, token, deadline, recurring, [], waiting, validating}

def validation_count(finish: T.Finish) -> Nat:
  match finish:
    case T.Finish{_, _, _, _, _, _, _, _, _, count}: count

def poll(finish: T.Finish, +now: Nat, +delay: Nat) -> Driver.Action:
  match finish:
    case T.Finish{p, l, r, _, _, deadline, _, _, _, _}:
      Driver.Action{Canonical.StopPolled{p, l, r, Nat.is_le(deadline, Nat.add(now, delay))}, delay, None{}, False{}, None{}}

def counter(state: Canonical.State, p: Nat, r: Nat) -> Nat:
  match state:
    case Canonical.State{_, _, _, _, _, _, _, CollectionState.State{_, _, _, DeliveryState.State{_, counters, _}, _, _, _}, _}:
      DeliveryState.count(p, r, counters)

def budget(finish: T.Finish, state: Canonical.State) -> Driver.Action:
  match finish:
    case T.Finish{p, _, r, _, _, _, _, _, _, _}:
      Driver.immediate(Canonical.RoundContinuationBudgetCheck{True{}, counter(state, p, r)}, False{})

def reserve(finish: T.Finish, now: Nat) -> Driver.Action:
  match finish:
    case T.Finish{p, l, r, attempt, token, deadline, _, selected, _, _}:
      Driver.immediate(Canonical.FinishReserve{p, l, r, attempt, token, selected, False{}, True{}, True{}, True{}, Nat.is_le(deadline, now)}, False{})

def ended(finish: T.Finish) -> Driver.Action:
  match finish:
    case T.Finish{+p, l, +r, _, _, _, _, _, _, _}:
      Driver.immediate(Canonical.StopGroupEnded{p, l, r, [Canonical.StopScope{p, r}]}, False{})

def consumed(finish: T.Finish) -> List<&2, Driver.Action>:
  match finish:
    case T.Finish{+p, _, +r, attempt, token, _, _, _, _, _}:
      [Driver.immediate(Canonical.ContinuationConsume{p, r}, False{}),
       Driver.immediate(Canonical.FinishEnd{p, r, attempt, token}, False{})]

def pending(work: Canonical.Work, p: Nat, r: Nat) -> Maybe<&2, Nat>:
  match work:
    case Canonical.Work{wp, _, wr, operation, _, Canonical.PendingFinding{_}, _}:
      Bool.pick(Maybe<&2, Nat>, Nat.is_eq(wp, p) && Nat.is_eq(wr, r), Some{operation}, None{})
    case _: None{}

def collected(value: Maybe<&2, Nat>, rest: List<&2, Nat>) -> List<&2, Nat>:
  match value:
    case Some{operation}: operation <> rest
    case None{}: rest

def candidates(work: List<&2, Canonical.Work>, +p: Nat, +r: Nat) -> List<&2, Nat>:
  match work:
    case Nil{}: []
    case head <> tail: collected(pending(head, p, r), candidates(tail, p, r))

def validate(advicees: List<&2, Nat>, +p: Nat, +r: Nat, +token: Nat,
    +current: Bool, +credential: Bool, +generation: Bool, +readable: Bool) -> List<&2, Driver.Action>:
  match advicees:
    case Nil{}: []
    case +advice <> tail:
      Driver.Action{Canonical.FinalCandidateCheck{True{}, generation, credential, False{}, current && readable, True{}},
        0n, Some{Driver.Candidate{p, advice, r, token, Handoff.Stop{}, True{}}}, False{}, None{}} <>
        validate(tail, p, r, token, current, credential, generation, readable)

def ready_candidates(finish: T.Finish, +state: Canonical.State, +advicees: List<&2, Nat>, environment: T.Environment) -> Ready:
  match finish environment:
    case T.Finish{+p, l, +r, attempt, +token, deadline, recurring, _, _, _}
      T.Environment{_, _, _, _, _, _, _, _, current, credential, _, readable, _}:
      +updated = {T.Finish{p, l, r, attempt, token, deadline, recurring, [], False{}, List.length(&2, Nat, advicees)} : T.Finish}
      Ready{updated, Bool.pick(List<&2, Driver.Action>, Nat.is_eq(List.length(&2, Nat, advicees), 0n),
        [budget(updated, state)], validate(advicees, p, r, token, current, credential, True{}, readable))}

def ready(finish: T.Finish, +state: Canonical.State, environment: T.Environment, limit: Bool) -> Ready:
  match finish:
    case T.Finish{+p, +l, +r, attempt, token, deadline, recurring, selected, waiting, validating}:
      ready_candidates(T.Finish{p, l, r, attempt, token, deadline, recurring, selected, waiting, validating}, state,
        Bool.pick(List<&2, Nat>, limit, [], candidates(Driver.work_list(state), p, r)), environment)

def selected(finish: T.Finish, advice: Nat, keep: Bool) -> T.Finish:
  match finish:
    case T.Finish{p, l, r, attempt, token, deadline, recurring, +selected, waiting, validating}:
      T.Finish{p, l, r, attempt, token, deadline, recurring,
        Bool.pick(List<&2, Nat>, keep, List.append(&2, Nat, selected, [advice]), selected), waiting, Nat.sub(validating, 1n)}

def reserve_selected(advicees: List<&2, Nat>, +p: Nat, +r: Nat, +token: Nat) -> List<&2, Driver.Action>:
  match advicees:
    case Nil{}: []
    case +advice <> tail:
      Driver.immediate(Canonical.CollectionReserveLease{advice, token}, False{}) <>
      Driver.immediate(Canonical.SubmissionBegin{advice, p, r, token, Handoff.Stop{}, False{}, [advice], [advice]}, False{}) <>
      reserve_selected(tail, p, r, token)

def reserved(finish: T.Finish) -> List<&2, Driver.Action>:
  match finish:
    case T.Finish{+p, _, +r, +attempt, +token, _, _, +selected, _, _}:
      List.append(&2, Driver.Action, reserve_selected(selected, p, r, token),
        [Driver.immediate(Canonical.FinishAuthorize{p, r, attempt, token, selected}, False{})])

def release_selected(advicees: List<&2, Nat>, +token: Nat, +expired: Bool, +delay: Nat) -> List<&2, Driver.Action>:
  match advicees:
    case Nil{}: []
    case +advice <> tail:
      Driver.Action{Canonical.CollectionLeaseCheck{advice, token, expired, False{}, True{}, False{}}, delay, None{}, False{}, None{}} <>
      Driver.Action{Canonical.CollectionReleaseLease{advice, token}, delay, None{}, False{}, None{}} <>
      release_selected(tail, token, expired, delay)

def authorized(finish: T.Finish, +delay: Nat, +lease: Nat) -> List<&2, Driver.Action>:
  match finish:
    case T.Finish{p, _, r, attempt, +token, _, _, +selected, _, _}:
      +due = Nat.min(delay, lease)
      Driver.Action{Canonical.FinishTerminal{p, r, attempt, token, selected,
        Bool.pick(Canonical.WriteOutcome, Nat.is_lt(delay, lease), Canonical.Acknowledged{}, Canonical.Unknown{})}, due, None{}, False{}, None{}} <>
        release_selected(selected, token, Nat.is_le(lease, delay), due)

def pending_kind(kind: Canonical.WorkKind) -> Bool:
  match kind:
    case Canonical.PendingFinding{_}: True{}
    case _: False{}

def retire_pending(work: List<&2, Canonical.Work>, +p: Nat, +r: Nat) -> List<&2, Driver.Action>:
  match work:
    case Nil{}: []
    case +head <> tail:
      match head:
        case Canonical.Work{+wp, l, +wr, +operation, _, +kind, _}:
          List.append(&2, Driver.Action,
            Bool.pick(List<&2, Driver.Action>, Nat.is_eq(wp, p) && Nat.is_eq(wr, r) && pending_kind(kind),
              [Driver.immediate(Canonical.CollectionRetireAdvice{operation}, False{}),
               Driver.immediate(Canonical.SubmissionForget{operation}, False{}),
               Driver.immediate(Canonical.RetireReview{wp, l, wr, operation}, False{})], []), retire_pending(tail, p, r))

def end_actions(finish: T.Finish, +state: Canonical.State, continuation: Bool) -> List<&2, Driver.Action>:
  match finish:
    case T.Finish{+p, +l, +r, attempt, token, deadline, recurring, selected, waiting, validating}:
      ended(T.Finish{p, l, r, attempt, token, deadline, recurring, selected, waiting, validating}) <>
        Bool.pick(List<&2, Driver.Action>, continuation, [],
          List.append(&2, Driver.Action, retire_pending(Driver.work_list(state), p, r),
            [Driver.immediate(Canonical.RetirePartition{p, l, r}, False{})]))
