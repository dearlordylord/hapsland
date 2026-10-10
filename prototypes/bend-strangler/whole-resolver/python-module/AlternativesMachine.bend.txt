import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ./Session.bend as S
import ./StatMachine.bend as Stat

# Whole moduleAlternatives search. Source precedence applies independently to
# module and package tails; an unavailable later tail discards earlier choices.
type Stage is Data:
  CheckingBase{}
  NormalizingSource{}
  SourceStat{}
  SelectingStub{}
  StubStat{}
type State is Data:
  State{
    session: S.Session,
    base: String,
    path: String,
    clock: T.ClockToken,
    separator: String,
    invocation: Nat,
    next_request: Nat,
    tails: List<&2, String>,
    found: List<&2, String>,
    stage: Stage,
    child: Maybe<&2, Stat.Step>
  }
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{session: S.Session, paths: Maybe<&2, List<&2, String>>, next_request: Nat}
  Failed{failure: T.TechnicalFailure, session: S.Session, next_request: Nat}
type Transition is Data:
  Settled{step: Step}
  Child{state: State, step: Stat.Step}
  NextTail{state: State}

def state_session(state: State) -> S.Session:
  match state:
    case State{session, _, _, _, _, _, _, _, _, _, _}: session

def with_session(state: State, replacement: S.Session) -> State:
  match state:
    case State{_, base, path, clock, separator, invocation, next_request, tails, found, stage, child}:
      State{replacement, base, path, clock, separator, invocation, next_request, tails, found, stage, child}

def state_base(state: State) -> String:
  match state:
    case State{_, base, _, _, _, _, _, _, _, _, _}: base

def with_base(state: State, replacement: String) -> State:
  match state:
    case State{session, _, path, clock, separator, invocation, next_request, tails, found, stage, child}:
      State{session, replacement, path, clock, separator, invocation, next_request, tails, found, stage, child}

def state_path(state: State) -> String:
  match state:
    case State{_, _, path, _, _, _, _, _, _, _, _}: path

def with_path(state: State, replacement: String) -> State:
  match state:
    case State{session, base, _, clock, separator, invocation, next_request, tails, found, stage, child}:
      State{session, base, replacement, clock, separator, invocation, next_request, tails, found, stage, child}

def state_clock(state: State) -> T.ClockToken:
  match state:
    case State{_, _, _, clock, _, _, _, _, _, _, _}: clock

def with_clock(state: State, replacement: T.ClockToken) -> State:
  match state:
    case State{session, base, path, _, separator, invocation, next_request, tails, found, stage, child}:
      State{session, base, path, replacement, separator, invocation, next_request, tails, found, stage, child}

def state_separator(state: State) -> String:
  match state:
    case State{_, _, _, _, separator, _, _, _, _, _, _}: separator

def with_separator(state: State, replacement: String) -> State:
  match state:
    case State{session, base, path, clock, _, invocation, next_request, tails, found, stage, child}:
      State{session, base, path, clock, replacement, invocation, next_request, tails, found, stage, child}

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, invocation, _, _, _, _, _}: invocation

def with_invocation(state: State, replacement: Nat) -> State:
  match state:
    case State{session, base, path, clock, separator, _, next_request, tails, found, stage, child}:
      State{session, base, path, clock, separator, replacement, next_request, tails, found, stage, child}

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, _, next_request, _, _, _, _}: next_request

def with_next_request(state: State, replacement: Nat) -> State:
  match state:
    case State{session, base, path, clock, separator, invocation, _, tails, found, stage, child}:
      State{session, base, path, clock, separator, invocation, replacement, tails, found, stage, child}

def state_tails(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, tails, _, _, _}: tails

def with_tails(state: State, replacement: List<&2, String>) -> State:
  match state:
    case State{session, base, path, clock, separator, invocation, next_request, _, found, stage, child}:
      State{session, base, path, clock, separator, invocation, next_request, replacement, found, stage, child}

def state_found(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, _, found, _, _}: found

def with_found(state: State, replacement: List<&2, String>) -> State:
  match state:
    case State{session, base, path, clock, separator, invocation, next_request, tails, _, stage, child}:
      State{session, base, path, clock, separator, invocation, next_request, tails, replacement, stage, child}

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, _, _, _, stage, _}: stage

def with_stage(state: State, replacement: Stage) -> State:
  match state:
    case State{session, base, path, clock, separator, invocation, next_request, tails, found, _, child}:
      State{session, base, path, clock, separator, invocation, next_request, tails, found, replacement, child}

def state_child(state: State) -> Maybe<&2, Stat.Step>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, child}: child

def with_child(state: State, replacement: Maybe<&2, Stat.Step>) -> State:
  match state:
    case State{session, base, path, clock, separator, invocation, next_request, tails, found, stage, _}:
      State{session, base, path, clock, separator, invocation, next_request, tails, found, stage, replacement}

def returned(+state: State, paths: Maybe<&2, List<&2, String>>) -> Transition:
  Settled{Returned{state_session(state), paths, state_next_request(state)}}

def failed(failure: T.TechnicalFailure, +state: State) -> Transition:
  Settled{Failed{failure, state_session(state), state_next_request(state)}}

def request(+state: State, stage: Stage, operation: T.Operation) -> Transition:
  Settled{Await{with_next_request(with_stage(state, stage), Nat.add(state_next_request(state), 1n)),
    T.Request{state_invocation(state), state_next_request(state), operation}}}

def stat_path(+state: State, stage: Stage) -> Transition:
  Child{with_stage(state, stage), Stat.begin(state_session(state), state_path(state), state_clock(state),
    state_separator(state), state_invocation(state), state_next_request(state))}

def next_tail(tails: List<&2, String>, +state: State) -> Transition:
  match tails:
    case []: returned(state, Some{List.reverse(&2, String, state_found(state))})
    case tail <> rest: request(with_tails(state, rest), NormalizingSource{},
      T.PathNormalize{String.append(state_base(state), tail)})

def accept_file(is_file: Bool, +state: State) -> Transition:
  match is_file:
    case False{}: returned(state, None{})
    case True{}: NextTail{with_found(state, state_path(state) <> state_found(state))}

def stub_selected(selected: Bool, state: State) -> Transition:
  match selected:
    case False{}: NextTail{state}
    case True{}: stat_path(state, StubStat{})

def observed(stage: Stage, observation: Maybe<&2, T.PathMembership>, +state: State) -> Transition:
  match stage observation:
    case SourceStat{} Some{T.MembershipPresent{is_file, _, _, _}}: accept_file(is_file, state)
    case SourceStat{} _:
      +stub = String.append(state_path(state), "i")
      request(with_path(state, stub), SelectingStub{}, T.SelectContextPath{stub})
    case StubStat{} Some{T.MembershipPresent{is_file, _, _, _}}: accept_file(is_file, state)
    case StubStat{} _: NextTail{state}
    case _ _: failed(T.MalformedReply{}, state)

def observed_available(available: Bool, observation: Maybe<&2, T.PathMembership>, +state: State) -> Transition:
  match available:
    case False{}: returned(state, None{})
    case True{}: observed(state_stage(state), observation, state)

def child_received(step: Stat.Step, +state: State) -> Transition:
  match step:
    case Stat.Await{+child_state, +request}: Settled{Await{
      with_child(with_next_request(with_session(state, Stat.state_session(child_state)),
        Stat.state_next_request(child_state)), Some{Stat.Await{child_state, request}}), request}}
    case Stat.Returned{+session, observation, next}: observed_available(S.available(session), observation,
      with_child(with_next_request(with_session(state, session), next), None{}))
    case Stat.Failed{failure}: failed(failure, state)

def base_allowed(allowed: Bool, state: State) -> Transition:
  match allowed:
    case False{}: returned(state, None{})
    case True{}: NextTail{state}

def apply_outcome(stage: Stage, +state: State, outcome: T.ServiceOutcome) -> Transition:
  match stage outcome:
    case CheckingBase{} T.AbsoluteResult{absolute}: base_allowed(
      Bool.and(Bool.not(absolute), Bool.and(Bool.not(String.eq(state_base(state), "..")),
        Bool.not(String.starts_with(state_base(state), String.append("..", state_separator(state)))))), state)
    case NormalizingSource{} T.NormalizedResult{path}: stat_path(with_path(state, path), SourceStat{})
    case SelectingStub{} T.ContextSelectionResult{selected}: stub_selected(selected, state)
    case _ T.ProviderRejected{exception}: failed(T.ForeignProviderFailure{exception}, state)
    case _ _: failed(T.MalformedReply{}, state)

def checked(reply: Protocol.CheckedReply, +state: State) -> Transition:
  match reply:
    case Protocol.RejectedReply{failure}: failed(failure, state)
    case Protocol.CheckedOutcome{outcome}: apply_outcome(state_stage(state), state, outcome)

def apply_reply(child: Maybe<&2, Stat.Step>, state: State, request: T.Request, reply: T.Reply) -> Transition:
  match child:
    case Some{step}: Child{state, Stat.resume(step, reply)}
    case None{}: checked(Protocol.check(request, reply), state)

def transition_session(transition: Transition) -> S.Session:
  match transition:
    case Settled{Await{state, _}}: state_session(state)
    case Settled{Returned{session, _, _}}: session
    case Settled{Failed{_, session, _}}: session
    case Child{state, _}: state_session(state)
    case NextTail{state}: state_session(state)

def transition_next(transition: Transition) -> Nat:
  match transition:
    case Settled{Await{state, _}}: state_next_request(state)
    case Settled{Returned{_, _, next}}: next
    case Settled{Failed{_, _, next}}: next
    case Child{state, _}: state_next_request(state)
    case NextTail{state}: state_next_request(state)

def settle(fuel: Nat, +transition: Transition) -> Step:
  match fuel transition:
    case _ Settled{step}: step
    case 0n _: Failed{T.MalformedReply{}, transition_session(transition), transition_next(transition)}
    case 1n++rest Child{state, step}: settle(rest, child_received(step, state))
    case 1n++rest NextTail{+state}: settle(rest, next_tail(state_tails(state), state))

def step_session(step: Step) -> S.Session:
  match step:
    case Await{state, _}: state_session(state)
    case Returned{session, _, _}: session
    case Failed{_, session, _}: session

def step_next(step: Step) -> Nat:
  match step:
    case Await{state, _}: state_next_request(state)
    case Returned{_, _, next}: next
    case Failed{_, _, next}: next

def resume(+step: Step, reply: T.Reply) -> Step:
  match step:
    case Await{+state, request}: settle(8n, apply_reply(state_child(state), state, request, reply))
    case _: Failed{T.MalformedReply{}, step_session(step), step_next(step)}

def begin(session: S.Session, +base: String, clock: T.ClockToken, separator: String,
    invocation: Nat, next_request: Nat) -> Step:
  settle(8n, request(State{session, base, "", clock, separator, invocation, next_request,
    ".py" <> "/__init__.py" <> [], [], CheckingBase{}, None{}}, CheckingBase{}, T.PathIsAbsolute{base}))

def main() -> Unit:
  Unit{}
