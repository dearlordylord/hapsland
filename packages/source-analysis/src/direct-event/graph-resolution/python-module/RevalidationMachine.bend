import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ../Clock.bend as Clock
import ./Session.bend as S
import ./MembershipMachine.bend as M

# Refresh the original insertion-order membership snapshot. Abort at the first
# unavailable/signature mismatch; only a complete pass reaches final permit.
type Stage is Data:
  Refreshing{}
  CheckingPermit{}
type State is Data:
  State{
    session: S.Session,
    clock: T.ClockToken,
    separator: String,
    invocation: Nat,
    next_request: Nat,
    snapshot: List<&2, S.Membership>,
    expected: Maybe<&2, T.PathMembership>,
    child: Maybe<&2, M.Step>,
    stage: Stage
  }
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{session: S.Session, valid: Bool, next_request: Nat}
  Failed{failure: T.TechnicalFailure}
type Transition is Data:
  Settled{step: Step}
  Next{state: State}
  Child{state: State, step: M.Step}

def state_session(state: State) -> S.Session:
  match state:
    case State{session, _, _, _, _, _, _, _, _}: session

def with_session(state: State, replacement: S.Session) -> State:
  match state:
    case State{_, clock, separator, invocation, next_request, snapshot, expected, child, stage}:
      State{replacement, clock, separator, invocation, next_request, snapshot, expected, child, stage}

def state_clock(state: State) -> T.ClockToken:
  match state:
    case State{_, clock, _, _, _, _, _, _, _}: clock

def with_clock(state: State, replacement: T.ClockToken) -> State:
  match state:
    case State{session, _, separator, invocation, next_request, snapshot, expected, child, stage}:
      State{session, replacement, separator, invocation, next_request, snapshot, expected, child, stage}

def state_separator(state: State) -> String:
  match state:
    case State{_, _, separator, _, _, _, _, _, _}: separator

def with_separator(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, _, invocation, next_request, snapshot, expected, child, stage}:
      State{session, clock, replacement, invocation, next_request, snapshot, expected, child, stage}

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, invocation, _, _, _, _, _}: invocation

def with_invocation(state: State, replacement: Nat) -> State:
  match state:
    case State{session, clock, separator, _, next_request, snapshot, expected, child, stage}:
      State{session, clock, separator, replacement, next_request, snapshot, expected, child, stage}

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, next_request, _, _, _, _}: next_request

def with_next_request(state: State, replacement: Nat) -> State:
  match state:
    case State{session, clock, separator, invocation, _, snapshot, expected, child, stage}:
      State{session, clock, separator, invocation, replacement, snapshot, expected, child, stage}

def state_snapshot(state: State) -> List<&2, S.Membership>:
  match state:
    case State{_, _, _, _, _, snapshot, _, _, _}: snapshot

def with_snapshot(state: State, replacement: List<&2, S.Membership>) -> State:
  match state:
    case State{session, clock, separator, invocation, next_request, _, expected, child, stage}:
      State{session, clock, separator, invocation, next_request, replacement, expected, child, stage}

def state_expected(state: State) -> Maybe<&2, T.PathMembership>:
  match state:
    case State{_, _, _, _, _, _, expected, _, _}: expected

def with_expected(state: State, replacement: Maybe<&2, T.PathMembership>) -> State:
  match state:
    case State{session, clock, separator, invocation, next_request, snapshot, _, child, stage}:
      State{session, clock, separator, invocation, next_request, snapshot, replacement, child, stage}

def state_child(state: State) -> Maybe<&2, M.Step>:
  match state:
    case State{_, _, _, _, _, _, _, child, _}: child

def with_child(state: State, replacement: Maybe<&2, M.Step>) -> State:
  match state:
    case State{session, clock, separator, invocation, next_request, snapshot, expected, _, stage}:
      State{session, clock, separator, invocation, next_request, snapshot, expected, replacement, stage}

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, _, _, stage}: stage

def with_stage(state: State, replacement: Stage) -> State:
  match state:
    case State{session, clock, separator, invocation, next_request, snapshot, expected, child, _}:
      State{session, clock, separator, invocation, next_request, snapshot, expected, child, replacement}

def request(+state: State, stage: Stage, operation: T.Operation) -> Transition:
  Settled{Await{with_next_request(with_stage(state, stage), Nat.add(state_next_request(state), 1n)),
    T.Request{state_invocation(state), state_next_request(state), operation}}}

def returned(+state: State, valid: Bool) -> Transition:
  Settled{Returned{state_session(state), valid, state_next_request(state)}}

def permit_available(available: Bool, +state: State) -> Transition:
  match available:
    case False{}: returned(state, False{})
    case True{}: request(state, CheckingPermit{}, T.ReadClock{state_clock(state)})

def next(snapshot: List<&2, S.Membership>, +state: State) -> Transition:
  match snapshot:
    case []: permit_available(S.available(state_session(state)), state)
    case S.Membership{path, expected} <> tail: Child{
      with_expected(with_snapshot(state, tail), Some{expected}),
      M.begin(state_session(state), path, True{}, state_clock(state), state_separator(state),
        state_invocation(state), state_next_request(state))}

def continue_if(valid: Bool, state: State) -> Transition:
  match valid:
    case False{}: returned(state, False{})
    case True{}: Next{state}

def signature_matches(expected: Maybe<&2, T.PathMembership>, observed: Maybe<&2, T.PathMembership>,
    +state: State) -> Transition:
  match expected observed:
    case Some{expected} Some{observed}: continue_if(String.eq(S.signature(expected), S.signature(observed)), state)
    case _ _: returned(state, False{})

def refresh_available(available: Bool, +state: State, observation: Maybe<&2, T.PathMembership>) -> Transition:
  match available:
    case False{}: returned(state, False{})
    case True{}: signature_matches(state_expected(state), observation, state)

def child_received(child: M.Step, +state: State) -> Transition:
  match child:
    case M.Failed{failure}: Settled{Failed{failure}}
    case M.Await{+child_state, +request}: Settled{Await{
      with_child(with_next_request(with_session(state, M.state_session(child_state)), M.state_next_request(child_state)), Some{M.Await{child_state, request}}), request}}
    case M.Returned{+session, observation, next}: refresh_available(S.available(session),
      with_next_request(with_session(with_child(state, None{}), session), next), observation)

def settle(fuel: Nat, transition: Transition) -> Step:
  match fuel transition:
    case _ Settled{step}: step
    case 0n _: Failed{T.MalformedReply{}}
    case 1n++rest Next{+state}: settle(rest, next(state_snapshot(state), state))
    case 1n++rest Child{state, child}: settle(rest, child_received(child, state))

def checked(reply: Protocol.CheckedReply, +state: State) -> Transition:
  match reply:
    case Protocol.RejectedReply{failure}: Settled{Failed{failure}}
    case Protocol.CheckedOutcome{T.ClockRead{bits}}:
      returned(state, S.permit(state_session(state), Clock.expired(bits), 0n, 0n))
    case Protocol.CheckedOutcome{T.ProviderRejected{exception}}: Settled{Failed{T.ForeignProviderFailure{exception}}}
    case _: Settled{Failed{T.MalformedReply{}}}

def apply_reply(child: Maybe<&2, M.Step>, state: State, request: T.Request, reply: T.Reply) -> Transition:
  match child:
    case Some{child}: Child{state, M.resume(child, reply)}
    case None{}: checked(Protocol.check(request, reply), state)

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Await{+state, request}: settle(8n, apply_reply(state_child(state), state, request, reply))
    case _: Failed{T.MalformedReply{}}

def begin(+session: S.Session, clock: T.ClockToken, separator: String, invocation: Nat,
    next_request: Nat) -> Step:
  settle(8n, Next{State{session, clock, separator, invocation, next_request,
    S.membership(session), None{}, None{}, Refreshing{}}})

def main() -> Unit:
  Unit{}
