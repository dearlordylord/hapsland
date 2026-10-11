import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ./Session.bend as S
import ./MembershipMachine.bend as M

# Exact stat(path) composition: context policy, root-to-leaf ancestor directory
# membership, then leaf observation. Negative ancestor membership stays available.
type Stage is Data:
  CheckingPath{}
  CheckingSelection{}
  CollectingDirectory{}
  ObservingAncestor{}
  ObservingLeaf{}
type State is Data:
  State{
    session: S.Session,
    path: String,
    clock: T.ClockToken,
    separator: String,
    invocation: Nat,
    next_request: Nat,
    ancestors: List<&2, String>,
    stage: Stage,
    child: Maybe<&2, M.Step>
  }
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{session: S.Session, observation: Maybe<&2, T.PathMembership>, next_request: Nat}
  Failed{failure: T.TechnicalFailure}
type Transition is Data:
  Settled{step: Step}
  Observe{state: State, path: String, leaf: Bool}
  Received{state: State, child: M.Step}
  NextAncestor{state: State}

def state_session(state: State) -> S.Session:
  match state:
    case State{session, _, _, _, _, _, _, _, _}: session

def with_session(state: State, replacement: S.Session) -> State:
  match state:
    case State{_, path, clock, separator, invocation, next_request, ancestors, stage, child}:
      State{replacement, path, clock, separator, invocation, next_request, ancestors, stage, child}

def state_path(state: State) -> String:
  match state:
    case State{_, path, _, _, _, _, _, _, _}: path

def with_path(state: State, replacement: String) -> State:
  match state:
    case State{session, _, clock, separator, invocation, next_request, ancestors, stage, child}:
      State{session, replacement, clock, separator, invocation, next_request, ancestors, stage, child}

def state_clock(state: State) -> T.ClockToken:
  match state:
    case State{_, _, clock, _, _, _, _, _, _}: clock

def with_clock(state: State, replacement: T.ClockToken) -> State:
  match state:
    case State{session, path, _, separator, invocation, next_request, ancestors, stage, child}:
      State{session, path, replacement, separator, invocation, next_request, ancestors, stage, child}

def state_separator(state: State) -> String:
  match state:
    case State{_, _, _, separator, _, _, _, _, _}: separator

def with_separator(state: State, replacement: String) -> State:
  match state:
    case State{session, path, clock, _, invocation, next_request, ancestors, stage, child}:
      State{session, path, clock, replacement, invocation, next_request, ancestors, stage, child}

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, _, invocation, _, _, _, _}: invocation

def with_invocation(state: State, replacement: Nat) -> State:
  match state:
    case State{session, path, clock, separator, _, next_request, ancestors, stage, child}:
      State{session, path, clock, separator, replacement, next_request, ancestors, stage, child}

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, next_request, _, _, _}: next_request

def with_next_request(state: State, replacement: Nat) -> State:
  match state:
    case State{session, path, clock, separator, invocation, _, ancestors, stage, child}:
      State{session, path, clock, separator, invocation, replacement, ancestors, stage, child}

def state_ancestors(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, _, ancestors, _, _}: ancestors

def with_ancestors(state: State, replacement: List<&2, String>) -> State:
  match state:
    case State{session, path, clock, separator, invocation, next_request, _, stage, child}:
      State{session, path, clock, separator, invocation, next_request, replacement, stage, child}

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, _, stage, _}: stage

def with_stage(state: State, replacement: Stage) -> State:
  match state:
    case State{session, path, clock, separator, invocation, next_request, ancestors, _, child}:
      State{session, path, clock, separator, invocation, next_request, ancestors, replacement, child}

def state_child(state: State) -> Maybe<&2, M.Step>:
  match state:
    case State{_, _, _, _, _, _, _, _, child}: child

def with_child(state: State, replacement: Maybe<&2, M.Step>) -> State:
  match state:
    case State{session, path, clock, separator, invocation, next_request, ancestors, stage, _}:
      State{session, path, clock, separator, invocation, next_request, ancestors, stage, replacement}

def request(+state: State, stage: Stage, operation: T.Operation) -> Transition:
  Settled{Await{with_next_request(with_stage(state, stage), Nat.add(state_next_request(state), 1n)),
    T.Request{state_invocation(state), state_next_request(state), operation}}}

def returned(+state: State, observation: Maybe<&2, T.PathMembership>) -> Transition:
  Settled{Returned{state_session(state), observation, state_next_request(state)}}

def refused(state: State) -> Transition:
  returned(state, None{})

def unavailable(+state: State) -> Transition:
  refused(with_session(state, S.with_available(state_session(state), False{})))

def directory_status(observation: T.PathMembership, +state: State) -> Transition:
  match observation:
    case T.MembershipAbsent{}: refused(state)
    case T.MembershipFailed{}: refused(state)
    case T.MembershipPresent{_, True{}, _, _}: NextAncestor{state}
    case T.MembershipPresent{_, False{}, _, _}: unavailable(state)

def ancestor_status(observation: Maybe<&2, T.PathMembership>, state: State) -> Transition:
  match observation:
    case None{}: refused(state)
    case Some{observation}: directory_status(observation, state)

def ancestor_available(available: Bool, state: State, observation: Maybe<&2, T.PathMembership>) -> Transition:
  match available:
    case False{}: refused(state)
    case True{}: ancestor_status(observation, state)

def observed(stage: Stage, +state: State, observation: Maybe<&2, T.PathMembership>) -> Transition:
  match stage:
    case ObservingLeaf{}: returned(state, observation)
    case ObservingAncestor{}: ancestor_available(S.available(state_session(state)), state, observation)
    case _: Settled{Failed{T.MalformedReply{}}}

def child_received(child: M.Step, +state: State) -> Transition:
  match child:
    case M.Await{+child_state, +request}:
      Settled{Await{with_child(with_next_request(with_session(state, M.state_session(child_state)), M.state_next_request(child_state)),
        Some{M.Await{child_state, request}}), request}}
    case M.Returned{session, observation, next}:
      observed(state_stage(state), with_next_request(with_session(with_child(state, None{}), session), next), observation)
    case M.Failed{failure}: Settled{Failed{failure}}

def observe(leaf: Bool, +state: State, path: String) -> Transition:
  match leaf:
    case True{}: Received{with_stage(state, ObservingLeaf{}), M.begin(state_session(state), path, False{},
      state_clock(state), state_separator(state), state_invocation(state), state_next_request(state))}
    case False{}: Received{with_stage(state, ObservingAncestor{}), M.begin(state_session(state), path, False{},
      state_clock(state), state_separator(state), state_invocation(state), state_next_request(state))}

def next_ancestor(ancestors: List<&2, String>, +state: State) -> Transition:
  match ancestors:
    case []: Observe{state, state_path(state), True{}}
    case head <> tail: Observe{with_ancestors(state, tail), head, False{}}

# Only synchronous cached-membership transitions are reduced here. This fuel
# exceeds twice the stat ancestor bound; it is not an observable budget/deadline.
def settle(fuel: Nat, transition: Transition) -> Step:
  match fuel transition:
    case _ Settled{step}: step
    case 0n _: Failed{T.MalformedReply{}}
    case 1n++rest Observe{state, path, leaf}: settle(rest, observe(leaf, state, path))
    case 1n++rest Received{state, child}: settle(rest, child_received(child, state))
    case 1n++rest NextAncestor{+state}: settle(rest, next_ancestor(state_ancestors(state), state))

def fuel(+state: State, transition: Transition) -> Step:
  settle((S.depth(state_session(state)) * 4n + 16n : Nat), transition)

def directory_bounded(allowed: Bool, +state: State, +directory: String) -> Transition:
  match allowed:
    case False{}: unavailable(state)
    case True{}: request(with_ancestors(state, directory <> state_ancestors(state)),
      CollectingDirectory{}, T.PathDirname{directory})

def directory_result(directory: String, +state: State) -> Transition:
  match directory:
    case ".": NextAncestor{state}
    case +directory: directory_bounded(
      Nat.is_le(List.length(&2, String, state_ancestors(state)), (S.depth(state_session(state)) + 1n : Nat)),
      state, directory)

def selection_result(selected: Bool, +state: State) -> Transition:
  match selected:
    case False{}: unavailable(state)
    case True{}: request(state, CollectingDirectory{}, T.PathDirname{state_path(state)})

def within(allowed: Bool, +state: State) -> Transition:
  match allowed:
    case False{}: unavailable(state)
    case True{}: request(state, CheckingSelection{}, T.SelectContextPath{state_path(state)})

def path_reply(absolute: Bool, +state: State) -> Transition:
  within(Bool.and(Bool.not(absolute), Bool.and(Bool.not(String.eq(state_path(state), "..")),
    Bool.not(String.starts_with(state_path(state), String.append("..", state_separator(state)))))), state)

def apply_outcome(stage: Stage, +state: State, outcome: T.ServiceOutcome) -> Transition:
  match stage outcome:
    case CheckingPath{} T.AbsoluteResult{absolute}: path_reply(absolute, state)
    case CheckingSelection{} T.ContextSelectionResult{selected}: selection_result(selected, state)
    case CollectingDirectory{} T.DirnameResult{directory}: directory_result(directory, state)
    case _ T.ProviderRejected{exception}: Settled{Failed{T.ForeignProviderFailure{exception}}}
    case _ _: Settled{Failed{T.MalformedReply{}}}

def checked(reply: Protocol.CheckedReply, +state: State) -> Transition:
  match reply:
    case Protocol.RejectedReply{failure}: Settled{Failed{failure}}
    case Protocol.CheckedOutcome{outcome}: apply_outcome(state_stage(state), state, outcome)

def apply_reply(child: Maybe<&2, M.Step>, +state: State, request: T.Request, reply: T.Reply) -> Transition:
  match child:
    case Some{child}: Received{state, M.resume(child, reply)}
    case None{}: checked(Protocol.check(request, reply), state)

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Await{+state, request}: fuel(state, apply_reply(state_child(state), state, request, reply))
    case _: Failed{T.MalformedReply{}}

def begin(session: S.Session, +path: String, clock: T.ClockToken, separator: String,
    invocation: Nat, next_request: Nat) -> Step:
  settle(1n, request(State{session, path, clock, separator, invocation, next_request, [], CheckingPath{}, None{}},
    CheckingPath{}, T.PathIsAbsolute{path}))

def main() -> Unit:
  Unit{}
