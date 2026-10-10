import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ./Session.bend as S
import ./ImportName.bend as Name
import ./RootsMachine.bend as Roots
import ./PackageParentsMachine.bend as Parents
import ./AlternativesMachine.bend as Alternatives
import ./StatMachine.bend as Stat

# Entire native moduleTarget: original-root relative policy, ordered roots,
# complete alternatives before uniqueness, initializer source/stub asymmetry.
type Choice is Data:
  Choice{path: String, root: String}
type Stage is Data:
  ParsingName{}
  RelativeParents{}
  FallbackRoots{}
  FilterRelative{}
  FilterAbsolute{}
  FallbackParents{}
  InitialDirectory{}
  Ascending{}
  BoundaryRelative{}
  BoundaryAbsolute{}
  RelativeJoin{}
  JoiningSource{}
  JoiningStub{}
  SourceStat{}
  StubStat{}
  AbsoluteRoots{}
  AbsoluteJoin{}
  RelativeAlternatives{}
  AbsoluteAlternatives{}
  FinalParents{}
type Child is Data:
  RootsChild{step: Roots.Step}
  ParentsChild{step: Parents.Step}
  AlternativesChild{step: Alternatives.Step}
  StatChild{step: Stat.Step}
type State is Data:
  State{
    session: S.Session,
    clock: T.ClockToken,
    cache: T.CacheToken,
    separator: String,
    invocation: Nat,
    next_request: Nat,
    from: String,
    root: String,
    directory: String,
    path: String,
    stub: String,
    segments: List<&2, String>,
    ascents: Nat,
    roots: List<&2, String>,
    eligible: List<&2, String>,
    choices: List<&2, Choice>,
    stage: Stage,
    child: Maybe<&2, Child>
  }
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{session: S.Session, path: Maybe<&2, String>, next_request: Nat}
  Failed{failure: T.TechnicalFailure, session: S.Session, next_request: Nat}
type Transition is Data:
  Settled{step: Step}
  Receive{state: State, child: Child}
  FilterNext{state: State}
  AbsoluteNext{state: State}
  Finalize{state: State}

def state_session(state: State) -> S.Session:
  match state:
    case State{session, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: session

def with_session(state: State, replacement: S.Session) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{replacement, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_clock(state: State) -> T.ClockToken:
  match state:
    case State{_, clock, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: clock

def with_clock(state: State, replacement: T.ClockToken) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, replacement, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_cache(state: State) -> T.CacheToken:
  match state:
    case State{_, _, cache, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: cache

def with_cache(state: State, replacement: T.CacheToken) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, replacement, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_separator(state: State) -> String:
  match state:
    case State{_, _, _, separator, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: separator

def with_separator(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, replacement, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, _, invocation, _, _, _, _, _, _, _, _, _, _, _, _, _}: invocation

def with_invocation(state: State, replacement: Nat) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, replacement, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, next_request, _, _, _, _, _, _, _, _, _, _, _, _}: next_request

def with_next_request(state: State, replacement: Nat) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, replacement, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_from(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, from, _, _, _, _, _, _, _, _, _, _, _}: from

def with_from(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, replacement, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_root(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, _, root, _, _, _, _, _, _, _, _, _, _}: root

def with_root(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, replacement, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_directory(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, _, _, directory, _, _, _, _, _, _, _, _, _}: directory

def with_directory(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, replacement, path, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_path(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, _, _, _, path, _, _, _, _, _, _, _, _}: path

def with_path(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, replacement, stub, segments, ascents, roots, eligible, choices, stage, child}

def state_stub(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, stub, _, _, _, _, _, _, _}: stub

def with_stub(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, replacement, segments, ascents, roots, eligible, choices, stage, child}

def state_segments(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, segments, _, _, _, _, _, _}: segments

def with_segments(state: State, replacement: List<&2, String>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, replacement, ascents, roots, eligible, choices, stage, child}

def state_ascents(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, ascents, _, _, _, _, _}: ascents

def with_ascents(state: State, replacement: Nat) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, replacement, roots, eligible, choices, stage, child}

def state_roots(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, roots, _, _, _, _}: roots

def with_roots(state: State, replacement: List<&2, String>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, replacement, eligible, choices, stage, child}

def state_eligible(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, _, eligible, _, _, _}: eligible

def with_eligible(state: State, replacement: List<&2, String>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, replacement, choices, stage, child}

def state_choices(state: State) -> List<&2, Choice>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, choices, _, _}: choices

def with_choices(state: State, replacement: List<&2, Choice>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, replacement, stage, child}

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, stage, _}: stage

def with_stage(state: State, replacement: Stage) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, replacement, child}

def state_child(state: State) -> Maybe<&2, Child>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, child}: child

def with_child(state: State, replacement: Maybe<&2, Child>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, from, root, directory, path, stub, segments, ascents, roots, eligible, choices, stage, replacement}

def returned(+state: State, path: Maybe<&2, String>) -> Transition:
  Settled{Returned{state_session(state), path, state_next_request(state)}}

def failed(failure: T.TechnicalFailure, +state: State) -> Transition:
  Settled{Failed{failure, state_session(state), state_next_request(state)}}

def request(+state: State, stage: Stage, operation: T.Operation) -> Transition:
  Settled{Await{with_next_request(with_stage(state, stage), Nat.add(state_next_request(state), 1n)),
    T.Request{state_invocation(state), state_next_request(state), operation}}}

def roots(+state: State, stage: Stage) -> Transition:
  Receive{with_stage(state, stage), RootsChild{Roots.begin(state_session(state), state_clock(state),
    state_cache(state), state_separator(state), state_invocation(state), state_next_request(state))}}

def parents(+state: State, +path: String, root: String, stage: Stage) -> Transition:
  Receive{with_stage(with_path(state, path), stage), ParentsChild{Parents.begin(state_session(state), path,
    root, state_clock(state), state_cache(state), state_separator(state), state_invocation(state), state_next_request(state))}}

def alternatives(+state: State, base: String, stage: Stage) -> Transition:
  Receive{with_stage(state, stage), AlternativesChild{Alternatives.begin(state_session(state), base,
    state_clock(state), state_separator(state), state_invocation(state), state_next_request(state))}}

def stat(+state: State, path: String, stage: Stage) -> Transition:
  Receive{with_stage(state, stage), StatChild{Stat.begin(state_session(state), path, state_clock(state),
    state_separator(state), state_invocation(state), state_next_request(state))}}

def within(+path: String, separator: String, absolute: Bool) -> Bool:
  Bool.and(Bool.not(absolute), Bool.and(Bool.not(String.eq(path, "..")),
    Bool.not(String.starts_with(path, String.append("..", separator)))))

def choice_paths(paths: List<&2, String>, +root: String) -> List<&2, Choice>:
  match paths:
    case []: []
    case path <> tail: Choice{path, root} <> choice_paths(tail, root)

def initial_directory(+state: State) -> Transition:
  request(state, InitialDirectory{}, T.PathDirname{state_from(state)})

def names(name: Maybe<&2, Name.ModuleName>, +state: State) -> Transition:
  match name:
    case None{}: returned(state, None{})
    case Some{Name.ModuleName{0n, segments}}: roots(with_segments(state, segments), AbsoluteRoots{})
    case Some{Name.ModuleName{1n++rest, segments}}: parents(with_ascents(with_segments(state, segments), rest),
      state_from(state), state_root(state), RelativeParents{})

def eligible(roots: List<&2, String>, +state: State) -> Transition:
  match roots:
    case +root <> []: parents(with_root(state, root), state_from(state), root, FallbackParents{})
    case _: returned(state, None{})

def filter_root(skip: Bool, +root: String, +state: State) -> Transition:
  match skip:
    case True{}: FilterNext{state}
    case False{}: request(with_root(state, root), FilterRelative{}, T.PathRelative{root, state_from(state)})

def filter_next(roots: List<&2, String>, +state: State) -> Transition:
  match roots:
    case []: eligible(state_eligible(state), state)
    case +root <> tail: filter_root(String.eq(root, "."), root, with_roots(state, tail))

def filter_admit(admit: Bool, +state: State) -> Transition:
  match admit:
    case False{}: FilterNext{state}
    case True{}: FilterNext{with_eligible(state, List.append(&2, String, state_eligible(state), state_root(state) <> []))}

def ascend(remaining: Nat, +state: State) -> Transition:
  match remaining:
    case 0n: request(state, BoundaryRelative{}, T.PathRelative{state_root(state), state_directory(state)})
    case 1n++rest: request(with_ascents(state, rest), Ascending{}, T.PathDirname{state_directory(state)})

def relative_base(segments: List<&2, String>, +state: State) -> Transition:
  match segments:
    case []: request(state, JoiningSource{}, T.PathJoin{state_directory(state) <> "__init__.py" <> []})
    case +segments: request(state, RelativeJoin{}, T.PathJoin{state_directory(state) <> segments})

def boundary(admit: Bool, +state: State) -> Transition:
  match admit:
    case False{}: returned(state, None{})
    case True{}: relative_base(state_segments(state), state)

def absolute_next(roots: List<&2, String>, +state: State) -> Transition:
  match roots:
    case []: Finalize{state}
    case +root <> tail: request(with_roots(with_root(state, root), tail), AbsoluteJoin{},
      T.PathJoin{root <> state_segments(state)})

def alternatives_done(stage: Stage, paths: Maybe<&2, List<&2, String>>, +state: State) -> Transition:
  match stage paths:
    case _ None{}: returned(state, None{})
    case AbsoluteAlternatives{} Some{paths}: AbsoluteNext{with_choices(state,
      List.append(&2, Choice, state_choices(state), choice_paths(paths, state_root(state))))}
    case RelativeAlternatives{} Some{paths}: Finalize{with_choices(state, choice_paths(paths, state_root(state)))}
    case _ _: failed(T.MalformedReply{}, state)

def roots_done(stage: Stage, found: Maybe<&2, List<&2, String>>, state: State) -> Transition:
  match stage found:
    case _ None{}: returned(state, None{})
    case AbsoluteRoots{} Some{roots}: AbsoluteNext{with_roots(state, roots)}
    case FallbackRoots{} Some{roots}: FilterNext{with_roots(state, roots)}
    case _ _: failed(T.MalformedReply{}, state)

def parents_done(stage: Stage, allowed: Bool, +state: State) -> Transition:
  match stage allowed:
    case RelativeParents{} False{}: roots(state, FallbackRoots{})
    case RelativeParents{} True{}: initial_directory(state)
    case FallbackParents{} True{}: initial_directory(state)
    case FinalParents{} True{}: returned(state, Some{state_path(state)})
    case _ False{}: returned(state, None{})
    case _ _: failed(T.MalformedReply{}, state)

def is_file(observation: Maybe<&2, T.PathMembership>) -> Bool:
  match observation:
    case Some{T.MembershipPresent{file, _, _, _}}: file
    case _: False{}

def source_found(found: Bool, +state: State) -> Transition:
  match found:
    case False{}: stat(state, state_stub(state), StubStat{})
    case True{}: Finalize{with_choices(state, Choice{state_path(state), state_root(state)} <> [])}

def stub_found(found: Bool, +state: State) -> Transition:
  match found:
    case False{}: Finalize{state}
    case True{}: Finalize{with_choices(state, Choice{state_stub(state), state_root(state)} <> [])}

def stat_done(stage: Stage, observation: Maybe<&2, T.PathMembership>, +state: State, available: Bool) -> Transition:
  match stage available:
    case SourceStat{} False{}: returned(state, None{})
    case SourceStat{} True{}: source_found(is_file(observation), state)
    case StubStat{} _: stub_found(is_file(observation), state)
    case _ _: failed(T.MalformedReply{}, state)

def final_choice(choices: List<&2, Choice>, available: Bool, state: State) -> Transition:
  match choices available:
    case Choice{path, root} <> [] True{}: parents(state, path, root, FinalParents{})
    case _ _: returned(state, None{})

def child_request(+state: State, child: Child, session: S.Session, next: Nat, request: T.Request) -> Transition:
  Settled{Await{with_child(with_next_request(with_session(state, session), next), Some{child}), request}}

def receive(+state: State, child: Child) -> Transition:
  match child:
    case RootsChild{Roots.Await{+inner, +request}}: child_request(state, RootsChild{Roots.Await{inner, request}},
      Roots.state_session(inner), Roots.state_next_request(inner), request)
    case RootsChild{Roots.Returned{session, found, next}}: roots_done(state_stage(state), found,
      with_child(with_next_request(with_session(state, session), next), None{}))
    case RootsChild{Roots.Failed{failure, session, next}}: failed(failure, with_next_request(with_session(state, session), next))
    case ParentsChild{Parents.Await{+inner, +request}}: child_request(state, ParentsChild{Parents.Await{inner, request}},
      Parents.state_session(inner), Parents.state_next_request(inner), request)
    case ParentsChild{Parents.Returned{session, allowed, next}}: parents_done(state_stage(state), allowed,
      with_child(with_next_request(with_session(state, session), next), None{}))
    case ParentsChild{Parents.Failed{failure, session, next}}: failed(failure, with_next_request(with_session(state, session), next))
    case AlternativesChild{Alternatives.Await{+inner, +request}}: child_request(state, AlternativesChild{Alternatives.Await{inner, request}},
      Alternatives.state_session(inner), Alternatives.state_next_request(inner), request)
    case AlternativesChild{Alternatives.Returned{session, paths, next}}: alternatives_done(state_stage(state), paths,
      with_child(with_next_request(with_session(state, session), next), None{}))
    case AlternativesChild{Alternatives.Failed{failure, session, next}}: failed(failure, with_next_request(with_session(state, session), next))
    case StatChild{Stat.Await{+inner, +request}}: child_request(state, StatChild{Stat.Await{inner, request}},
      Stat.state_session(inner), Stat.state_next_request(inner), request)
    case StatChild{Stat.Returned{+session, observation, next}}: stat_done(state_stage(state), observation,
      with_child(with_next_request(with_session(state, session), next), None{}), S.available(session))
    case StatChild{Stat.Failed{failure}}: failed(failure, state)

def outcome(stage: Stage, +state: State, result: T.ServiceOutcome) -> Transition:
  match stage result:
    case ParsingName{} T.IdentifierCharactersResult{characters}: names(Name.parse(characters, S.depth(state_session(state))), state)
    case FilterRelative{} T.RelativeResult{+path}: request(with_path(state, path), FilterAbsolute{}, T.PathIsAbsolute{path})
    case FilterAbsolute{} T.AbsoluteResult{absolute}: filter_admit(Bool.and(Bool.not(String.eq(state_root(state), ".")),
      within(state_path(state), state_separator(state), absolute)), state)
    case InitialDirectory{} T.DirnameResult{directory}: ascend(state_ascents(state), with_directory(state, directory))
    case Ascending{} T.DirnameResult{directory}: ascend(state_ascents(state), with_directory(state, directory))
    case BoundaryRelative{} T.RelativeResult{+path}: request(with_path(state, path), BoundaryAbsolute{}, T.PathIsAbsolute{path})
    case BoundaryAbsolute{} T.AbsoluteResult{absolute}: boundary(Bool.and(
      within(state_path(state), state_separator(state), absolute), Bool.not(String.eq(state_directory(state), state_root(state)))), state)
    case RelativeJoin{} T.JoinedResult{path}: alternatives(state, path, RelativeAlternatives{})
    case AbsoluteJoin{} T.JoinedResult{path}: alternatives(state, path, AbsoluteAlternatives{})
    case JoiningSource{} T.JoinedResult{path}: request(with_path(state, path), JoiningStub{},
      T.PathJoin{state_directory(state) <> "__init__.pyi" <> []})
    case JoiningStub{} T.JoinedResult{+path}: stat(with_stub(state, path), state_path(state), SourceStat{})
    case _ T.ProviderRejected{exception}: failed(T.ForeignProviderFailure{exception}, state)
    case _ _: failed(T.MalformedReply{}, state)

def checked(reply: Protocol.CheckedReply, +state: State) -> Transition:
  match reply:
    case Protocol.RejectedReply{failure}: failed(failure, state)
    case Protocol.CheckedOutcome{result}: outcome(state_stage(state), state, result)

def child_resume(child: Child, reply: T.Reply) -> Child:
  match child:
    case RootsChild{step}: RootsChild{Roots.resume(step, reply)}
    case ParentsChild{step}: ParentsChild{Parents.resume(step, reply)}
    case AlternativesChild{step}: AlternativesChild{Alternatives.resume(step, reply)}
    case StatChild{step}: StatChild{Stat.resume(step, reply)}

def apply_reply(child: Maybe<&2, Child>, state: State, request: T.Request, reply: T.Reply) -> Transition:
  match child:
    case Some{child}: Receive{state, child_resume(child, reply)}
    case None{}: checked(Protocol.check(request, reply), state)

def transition_session(transition: Transition) -> S.Session:
  match transition:
    case Settled{Await{state, _}}: state_session(state)
    case Settled{Returned{session, _, _}}: session
    case Settled{Failed{_, session, _}}: session
    case Receive{state, _}: state_session(state)
    case FilterNext{state}: state_session(state)
    case AbsoluteNext{state}: state_session(state)
    case Finalize{state}: state_session(state)

def transition_next(transition: Transition) -> Nat:
  match transition:
    case Settled{Await{state, _}}: state_next_request(state)
    case Settled{Returned{_, _, next}}: next
    case Settled{Failed{_, _, next}}: next
    case Receive{state, _}: state_next_request(state)
    case FilterNext{state}: state_next_request(state)
    case AbsoluteNext{state}: state_next_request(state)
    case Finalize{state}: state_next_request(state)

def settle(fuel: Nat, +transition: Transition) -> Step:
  match fuel transition:
    case _ Settled{step}: step
    case 0n _: Failed{T.MalformedReply{}, transition_session(transition), transition_next(transition)}
    case 1n++rest Receive{state, child}: settle(rest, receive(state, child))
    case 1n++rest FilterNext{+state}: settle(rest, filter_next(state_roots(state), state))
    case 1n++rest AbsoluteNext{+state}: settle(rest, absolute_next(state_roots(state), state))
    case 1n++rest Finalize{+state}: settle(rest, final_choice(state_choices(state), S.available(state_session(state)), state))

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
    case Await{+state, request}: settle(16n, apply_reply(state_child(state), state, request, reply))
    case _: Failed{T.MalformedReply{}, step_session(step), step_next(step)}

def initial_root(src: Bool) -> String:
  match src:
    case True{}: "src"
    case False{}: "."

def begin(session: S.Session, from: String, import_path: String, root_path: String,
    clock: T.ClockToken, cache: T.CacheToken, +separator: String, invocation: Nat, next_request: Nat) -> Step:
  settle(16n, request(State{session, clock, cache, separator, invocation, next_request, from,
    initial_root(String.starts_with(root_path, String.append("src", separator))), "", "", "", [], 0n,
    [], [], [], ParsingName{}, None{}}, ParsingName{}, T.ReadIdentifierCharacters{import_path}))

def main() -> Unit:
  Unit{}
