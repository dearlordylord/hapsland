import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ./Session.bend as S
import ./StatMachine.bend as Stat
import ./CaptureMachine.bend as Capture
import ./Authority.bend as Authority

# Full packageParents discovery and authority flow, including ordered captures.
type Stage is Data:
  InitialDirectory{}
  CheckingRelative{}
  CheckingAbsolute{}
  ParentDirectory{}
  JoiningInitializer{}
  SourceStat{}
  StubStat{}
  Capturing{}
  Parsing{}
type State is Data:
  State{
    session: S.Session,
    directory: String,
    root: String,
    path: String,
    clock: T.ClockToken,
    cache: T.CacheToken,
    separator: String,
    invocation: Nat,
    next_request: Nat,
    directories: List<&2, String>,
    stat_child: Maybe<&2, Stat.Step>,
    capture_child: Maybe<&2, Capture.Step>,
    stage: Stage
  }
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{session: S.Session, valid: Bool, next_request: Nat}
  Failed{failure: T.TechnicalFailure, session: S.Session, next_request: Nat}
type Transition is Data:
  Settled{step: Step}
  StatChild{state: State, step: Stat.Step}
  CaptureChild{state: State, step: Capture.Step}
  Collect{state: State}
  NextDirectory{state: State}

def state_session(state: State) -> S.Session:
  match state:
    case State{session, _, _, _, _, _, _, _, _, _, _, _, _}: session

def with_session(state: State, replacement: S.Session) -> State:
  match state:
    case State{_, directory, root, path, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}:
      State{replacement, directory, root, path, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}

def state_directory(state: State) -> String:
  match state:
    case State{_, directory, _, _, _, _, _, _, _, _, _, _, _}: directory

def with_directory(state: State, replacement: String) -> State:
  match state:
    case State{session, _, root, path, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}:
      State{session, replacement, root, path, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}

def state_root(state: State) -> String:
  match state:
    case State{_, _, root, _, _, _, _, _, _, _, _, _, _}: root

def with_root(state: State, replacement: String) -> State:
  match state:
    case State{session, directory, _, path, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}:
      State{session, directory, replacement, path, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}

def state_path(state: State) -> String:
  match state:
    case State{_, _, _, path, _, _, _, _, _, _, _, _, _}: path

def with_path(state: State, replacement: String) -> State:
  match state:
    case State{session, directory, root, _, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}:
      State{session, directory, root, replacement, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}

def state_clock(state: State) -> T.ClockToken:
  match state:
    case State{_, _, _, _, clock, _, _, _, _, _, _, _, _}: clock

def with_clock(state: State, replacement: T.ClockToken) -> State:
  match state:
    case State{session, directory, root, path, _, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}:
      State{session, directory, root, path, replacement, cache, separator, invocation, next_request, directories, stat_child, capture_child, stage}

def state_cache(state: State) -> T.CacheToken:
  match state:
    case State{_, _, _, _, _, cache, _, _, _, _, _, _, _}: cache

def with_cache(state: State, replacement: T.CacheToken) -> State:
  match state:
    case State{session, directory, root, path, clock, _, separator, invocation, next_request, directories, stat_child, capture_child, stage}:
      State{session, directory, root, path, clock, replacement, separator, invocation, next_request, directories, stat_child, capture_child, stage}

def state_separator(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, separator, _, _, _, _, _, _}: separator

def with_separator(state: State, replacement: String) -> State:
  match state:
    case State{session, directory, root, path, clock, cache, _, invocation, next_request, directories, stat_child, capture_child, stage}:
      State{session, directory, root, path, clock, cache, replacement, invocation, next_request, directories, stat_child, capture_child, stage}

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, _, _, invocation, _, _, _, _, _}: invocation

def with_invocation(state: State, replacement: Nat) -> State:
  match state:
    case State{session, directory, root, path, clock, cache, separator, _, next_request, directories, stat_child, capture_child, stage}:
      State{session, directory, root, path, clock, cache, separator, replacement, next_request, directories, stat_child, capture_child, stage}

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, _, _, _, next_request, _, _, _, _}: next_request

def with_next_request(state: State, replacement: Nat) -> State:
  match state:
    case State{session, directory, root, path, clock, cache, separator, invocation, _, directories, stat_child, capture_child, stage}:
      State{session, directory, root, path, clock, cache, separator, invocation, replacement, directories, stat_child, capture_child, stage}

def state_directories(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, directories, _, _, _}: directories

def with_directories(state: State, replacement: List<&2, String>) -> State:
  match state:
    case State{session, directory, root, path, clock, cache, separator, invocation, next_request, _, stat_child, capture_child, stage}:
      State{session, directory, root, path, clock, cache, separator, invocation, next_request, replacement, stat_child, capture_child, stage}

def state_stat_child(state: State) -> Maybe<&2, Stat.Step>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, stat_child, _, _}: stat_child

def with_stat_child(state: State, replacement: Maybe<&2, Stat.Step>) -> State:
  match state:
    case State{session, directory, root, path, clock, cache, separator, invocation, next_request, directories, _, capture_child, stage}:
      State{session, directory, root, path, clock, cache, separator, invocation, next_request, directories, replacement, capture_child, stage}

def state_capture_child(state: State) -> Maybe<&2, Capture.Step>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, capture_child, _}: capture_child

def with_capture_child(state: State, replacement: Maybe<&2, Capture.Step>) -> State:
  match state:
    case State{session, directory, root, path, clock, cache, separator, invocation, next_request, directories, stat_child, _, stage}:
      State{session, directory, root, path, clock, cache, separator, invocation, next_request, directories, stat_child, replacement, stage}

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, stage}: stage

def with_stage(state: State, replacement: Stage) -> State:
  match state:
    case State{session, directory, root, path, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, _}:
      State{session, directory, root, path, clock, cache, separator, invocation, next_request, directories, stat_child, capture_child, replacement}

def returned(+state: State, valid: Bool) -> Transition:
  Settled{Returned{state_session(state), valid, state_next_request(state)}}

def failed(failure: T.TechnicalFailure, +state: State) -> Transition:
  Settled{Failed{failure, state_session(state), state_next_request(state)}}

def request(+state: State, stage: Stage, operation: T.Operation) -> Transition:
  Settled{Await{with_next_request(with_stage(state, stage), Nat.add(state_next_request(state), 1n)),
    T.Request{state_invocation(state), state_next_request(state), operation}}}

def stat_path(+state: State, stage: Stage) -> Transition:
  StatChild{with_stage(state, stage), Stat.begin(state_session(state), state_path(state), state_clock(state),
    state_separator(state), state_invocation(state), state_next_request(state))}

def capture_path(+state: State) -> Transition:
  CaptureChild{with_stage(state, Capturing{}), Capture.begin(state_session(state), state_path(state), state_clock(state),
    state_cache(state), state_invocation(state), state_next_request(state))}

def next_directory(directories: List<&2, String>, +state: State) -> Transition:
  match directories:
    case []: returned(state, True{})
    case directory <> rest: request(with_directories(state, rest), JoiningInitializer{},
      T.PathJoin{directory <> "__init__.py" <> []})

def collect_done(done: Bool, +state: State) -> Transition:
  match done:
    case True{}: NextDirectory{state}
    case False{}: request(state, CheckingRelative{}, T.PathRelative{state_root(state), state_directory(state)})

def relative_allowed(allowed: Bool, +state: State) -> Transition:
  match allowed:
    case False{}: returned(state, False{})
    case True{}: request(with_directories(state, state_directory(state) <> state_directories(state)),
      ParentDirectory{}, T.PathDirname{state_directory(state)})

def parent_changed(changed: Bool, state: State, directory: String) -> Transition:
  match changed:
    case False{}: returned(state, False{})
    case True{}: Collect{with_directory(state, directory)}

def source_absent(+state: State) -> Transition:
  stat_path(with_path(state, String.append(state_path(state), "i")), StubStat{})

def file_observed(file: Bool, state: State) -> Transition:
  match file:
    case False{}: returned(state, False{})
    case True{}: capture_path(state)

def observed(stage: Stage, observation: Maybe<&2, T.PathMembership>, state: State) -> Transition:
  match stage observation:
    case SourceStat{} Some{T.MembershipPresent{is_file, _, _, _}}: file_observed(is_file, state)
    case SourceStat{} _: source_absent(state)
    case StubStat{} Some{T.MembershipPresent{is_file, _, _, _}}: file_observed(is_file, state)
    case StubStat{} _: returned(state, False{})
    case _ _: failed(T.MalformedReply{}, state)

def observation_available(available: Bool, observation: Maybe<&2, T.PathMembership>, +state: State) -> Transition:
  match available:
    case False{}: returned(state, False{})
    case True{}: observed(state_stage(state), observation, state)

def stat_received(step: Stat.Step, +state: State) -> Transition:
  match step:
    case Stat.Await{+child_state, +request}: Settled{Await{
      with_stat_child(with_next_request(with_session(state, Stat.state_session(child_state)),
        Stat.state_next_request(child_state)), Some{Stat.Await{child_state, request}}), request}}
    case Stat.Returned{+session, observation, next}: observation_available(S.available(session), observation,
      with_stat_child(with_next_request(with_session(state, session), next), None{}))
    case Stat.Failed{failure}: failed(failure, state)

def captured(capture: Maybe<&2, T.CaptureToken>, state: State) -> Transition:
  match capture:
    case None{}: returned(state, False{})
    case Some{capture}: request(state, Parsing{}, T.ParsePythonSyntax{capture})

def capture_received(step: Capture.Step, +state: State) -> Transition:
  match step:
    case Capture.Await{+child_state, +request}: Settled{Await{
      with_capture_child(with_next_request(with_session(state, Capture.state_session(child_state)),
        Capture.state_next_request(child_state)), Some{Capture.Await{child_state, request}}), request}}
    case Capture.Returned{session, capture, next}: captured(capture,
      with_capture_child(with_next_request(with_session(state, session), next), None{}))
    case Capture.Failed{failure}: failed(failure, state)

def authority_allowed(allowed: Bool, state: State) -> Transition:
  match allowed:
    case False{}: returned(state, False{})
    case True{}: NextDirectory{state}

def apply_outcome(stage: Stage, +state: State, outcome: T.ServiceOutcome) -> Transition:
  match stage outcome:
    case InitialDirectory{} T.DirnameResult{directory}: Collect{with_directory(state, directory)}
    case CheckingRelative{} T.RelativeResult{+path}: request(with_path(state, path), CheckingAbsolute{}, T.PathIsAbsolute{path})
    case CheckingAbsolute{} T.AbsoluteResult{absolute}: relative_allowed(Bool.and(Bool.not(absolute),
      Bool.and(Bool.not(String.eq(state_path(state), "..")), Bool.and(
        Bool.not(String.starts_with(state_path(state), String.append("..", state_separator(state)))),
        Nat.is_lt(List.length(&2, String, state_directories(state)), S.depth(state_session(state)))))), state)
    case ParentDirectory{} T.DirnameResult{+directory}: parent_changed(Bool.not(String.eq(directory, state_directory(state))), state, directory)
    case JoiningInitializer{} T.JoinedResult{path}: stat_path(with_path(state, path), SourceStat{})
    case Parsing{} T.PythonSyntaxResult{syntax}: authority_allowed(Authority.static_package_authority(syntax), state)
    case _ T.ProviderRejected{exception}: failed(T.ForeignProviderFailure{exception}, state)
    case _ _: failed(T.MalformedReply{}, state)

def checked(reply: Protocol.CheckedReply, +state: State) -> Transition:
  match reply:
    case Protocol.RejectedReply{failure}: failed(failure, state)
    case Protocol.CheckedOutcome{outcome}: apply_outcome(state_stage(state), state, outcome)

def apply_reply(stat: Maybe<&2, Stat.Step>, capture: Maybe<&2, Capture.Step>, state: State,
    request: T.Request, reply: T.Reply) -> Transition:
  match stat capture:
    case Some{child} _: StatChild{state, Stat.resume(child, reply)}
    case None{} Some{child}: CaptureChild{state, Capture.resume(child, reply)}
    case None{} None{}: checked(Protocol.check(request, reply), state)

def transition_session(transition: Transition) -> S.Session:
  match transition:
    case Settled{Await{state, _}}: state_session(state)
    case Settled{Returned{session, _, _}}: session
    case Settled{Failed{_, session, _}}: session
    case StatChild{state, _}: state_session(state)
    case CaptureChild{state, _}: state_session(state)
    case Collect{state}: state_session(state)
    case NextDirectory{state}: state_session(state)

def transition_next(transition: Transition) -> Nat:
  match transition:
    case Settled{Await{state, _}}: state_next_request(state)
    case Settled{Returned{_, _, next}}: next
    case Settled{Failed{_, _, next}}: next
    case StatChild{state, _}: state_next_request(state)
    case CaptureChild{state, _}: state_next_request(state)
    case Collect{state}: state_next_request(state)
    case NextDirectory{state}: state_next_request(state)

def settle(fuel: Nat, +transition: Transition) -> Step:
  match fuel transition:
    case _ Settled{step}: step
    case 0n _: Failed{T.MalformedReply{}, transition_session(transition), transition_next(transition)}
    case 1n++rest StatChild{state, step}: settle(rest, stat_received(step, state))
    case 1n++rest CaptureChild{state, step}: settle(rest, capture_received(step, state))
    case 1n++rest Collect{+state}: settle(rest, collect_done(String.eq(state_directory(state), state_root(state)), state))
    case 1n++rest NextDirectory{+state}: settle(rest, next_directory(state_directories(state), state))

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
    case Await{+state, request}: settle(12n, apply_reply(state_stat_child(state), state_capture_child(state), state, request, reply))
    case _: Failed{T.MalformedReply{}, step_session(step), step_next(step)}

def begin(session: S.Session, path: String, root: String, clock: T.ClockToken, cache: T.CacheToken,
    separator: String, invocation: Nat, next_request: Nat) -> Step:
  settle(12n, request(State{session, "", root, "", clock, cache, separator, invocation, next_request,
    [], None{}, None{}, InitialDirectory{}}, InitialDirectory{}, T.PathDirname{path}))

def main() -> Unit:
  Unit{}
