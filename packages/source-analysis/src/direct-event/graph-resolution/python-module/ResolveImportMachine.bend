import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ../Clock.bend as Clock
import ./Session.bend as S
import ./ModuleTargetMachine.bend as Target
import ./CaptureMachine.bend as Capture
import ./Authority.bend as Authority

# Whole resolveImport loop. Foreign frontend supplies extraction facts;
# reexport decisions and authority/canonical accounting belong to this child.
type Parts is Data:
  Parts{head: String, tail: String}
type Resolution is Data:
  Resolution{path: String, name: String}
type Stage is Data:
  CheckingPermit{}
  ResolvingTarget{}
  Capturing{}
  ParsingAuthority{}
  Inspecting{}
  ResolvingForward{}
type Child is Data:
  TargetChild{step: Target.Step}
  CaptureChild{step: Capture.Step}
type State is Data:
  State{
    session: S.Session,
    clock: T.ClockToken,
    cache: T.CacheToken,
    separator: String,
    invocation: Nat,
    next_request: Nat,
    root_path: String,
    owner: String,
    module: String,
    member: String,
    target: String,
    turns: Nat,
    visited: List<&2, String>,
    syntax: Maybe<&2, T.PythonSyntax>,
    forwarded: Maybe<&2, T.FactImport>,
    capture: Maybe<&2, T.CaptureToken>,
    stage: Stage,
    child: Maybe<&2, Child>
  }
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{session: S.Session, resolution: Maybe<&2, Resolution>, next_request: Nat}
  Failed{failure: T.TechnicalFailure, session: S.Session, next_request: Nat}
type Transition is Data:
  Settled{step: Step}
  Receive{state: State, child: Child}
  NextTurn{state: State}

def state_session(state: State) -> S.Session:
  match state:
    case State{session, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: session

def with_session(state: State, replacement: S.Session) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{replacement, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_clock(state: State) -> T.ClockToken:
  match state:
    case State{_, clock, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: clock

def with_clock(state: State, replacement: T.ClockToken) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, replacement, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_cache(state: State) -> T.CacheToken:
  match state:
    case State{_, _, cache, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: cache

def with_cache(state: State, replacement: T.CacheToken) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, replacement, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_separator(state: State) -> String:
  match state:
    case State{_, _, _, separator, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: separator

def with_separator(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, replacement, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, _, invocation, _, _, _, _, _, _, _, _, _, _, _, _, _}: invocation

def with_invocation(state: State, replacement: Nat) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, replacement, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, next_request, _, _, _, _, _, _, _, _, _, _, _, _}: next_request

def with_next_request(state: State, replacement: Nat) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, replacement, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_root_path(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, root_path, _, _, _, _, _, _, _, _, _, _, _}: root_path

def with_root_path(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, replacement, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_owner(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, _, owner, _, _, _, _, _, _, _, _, _, _}: owner

def with_owner(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, replacement, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_module(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, _, _, module, _, _, _, _, _, _, _, _, _}: module

def with_module(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, replacement, member, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_member(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, _, _, _, member, _, _, _, _, _, _, _, _}: member

def with_member(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, replacement, target, turns, visited, syntax, forwarded, capture, stage, child}

def state_target(state: State) -> String:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, target, _, _, _, _, _, _, _}: target

def with_target(state: State, replacement: String) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, replacement, turns, visited, syntax, forwarded, capture, stage, child}

def state_turns(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, turns, _, _, _, _, _, _}: turns

def with_turns(state: State, replacement: Nat) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, replacement, visited, syntax, forwarded, capture, stage, child}

def state_visited(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, visited, _, _, _, _, _}: visited

def with_visited(state: State, replacement: List<&2, String>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, replacement, syntax, forwarded, capture, stage, child}

def state_syntax(state: State) -> Maybe<&2, T.PythonSyntax>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, syntax, _, _, _, _}: syntax

def with_syntax(state: State, replacement: Maybe<&2, T.PythonSyntax>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, replacement, forwarded, capture, stage, child}

def state_forwarded(state: State) -> Maybe<&2, T.FactImport>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, _, forwarded, _, _, _}: forwarded

def with_forwarded(state: State, replacement: Maybe<&2, T.FactImport>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, replacement, capture, stage, child}

def state_capture(state: State) -> Maybe<&2, T.CaptureToken>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, capture, _, _}: capture

def with_capture(state: State, replacement: Maybe<&2, T.CaptureToken>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, replacement, stage, child}

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, stage, _}: stage

def with_stage(state: State, replacement: Stage) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, replacement, child}

def state_child(state: State) -> Maybe<&2, Child>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, child}: child

def with_child(state: State, replacement: Maybe<&2, Child>) -> State:
  match state:
    case State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, child}:
      State{session, clock, cache, separator, invocation, next_request, root_path, owner, module, member, target, turns, visited, syntax, forwarded, capture, stage, replacement}

def returned(+state: State, result: Maybe<&2, Resolution>) -> Transition:
  Settled{Returned{state_session(state), result, state_next_request(state)}}

def failed(failure: T.TechnicalFailure, +state: State) -> Transition:
  Settled{Failed{failure, state_session(state), state_next_request(state)}}

def request(+state: State, stage: Stage, operation: T.Operation) -> Transition:
  Settled{Await{with_next_request(with_stage(state, stage), Nat.add(state_next_request(state), 1n)),
    T.Request{state_invocation(state), state_next_request(state), operation}}}

def contains(keys: List<&2, String>, +key: String) -> Bool:
  match keys:
    case []: False{}
    case head <> tail: Bool.or(String.eq(head, key), contains(tail, key))

def has_dot(text: String) -> Bool:
  match text:
    case SNil{}: False{}
    case SCon{head, tail}: Bool.or(String.eq(SCon{head, SNil{}}, "."), has_dot(tail))

# splitFirst preserves empty head and tail exactly as JS split('.').
def pair_prefix(head: String, pair: Parts) -> Parts:
  match pair:
    case Parts{prefix, tail}: Parts{String.append(head, prefix), tail}

def split_first_dot(dot: Bool, head: String, tail: String, proceed: Unit -> Parts) -> Parts:
  match dot:
    case True{}: Parts{"", tail}
    case False{}: pair_prefix(head, proceed(Unit{}))

def split_first(text: String) -> Parts:
  match text:
    case SNil{}: Parts{"", ""}
    case SCon{+head, +tail}: split_first_dot(String.eq(SCon{head, SNil{}}, "."), SCon{head, SNil{}}, tail,
      _ => split_first(tail))

def owns_declaration(rows: List<&2, T.FactDeclaration>, +name: String) -> Bool:
  match rows:
    case []: False{}
    case T.FactDeclaration{key, _, _, _} <> tail: Bool.or(String.eq(key, name), owns_declaration(tail, name))

def pick_import(same: Bool, row: T.FactImport, proceed: Unit -> Maybe<&2, T.FactImport>) -> Maybe<&2, T.FactImport>:
  match same:
    case True{}: Some{row}
    case False{}: proceed(Unit{})

def import_row(row: T.FactImport, +name: String, proceed: Unit -> Maybe<&2, T.FactImport>) -> Maybe<&2, T.FactImport>:
  match row:
    case T.FactImport{+key, path, member, type_only}: pick_import(String.eq(key, name), T.FactImport{key, path, member, type_only}, proceed)

def import_for(rows: List<&2, T.FactImport>, +name: String) -> Maybe<&2, T.FactImport>:
  match rows:
    case []: None{}
    case +row <> tail: import_row(row, name, _ => import_for(tail, name))

def target_request(+state: State, from: String, module: String, stage: Stage) -> Transition:
  Receive{with_stage(state, stage), TargetChild{Target.begin(state_session(state), from, module,
    state_root_path(state), state_clock(state), state_cache(state), state_separator(state),
    state_invocation(state), state_next_request(state))}}

def permit(allowed: Bool, +state: State) -> Transition:
  match allowed:
    case False{}: returned(state, None{})
    case True{}: target_request(state, state_owner(state), state_module(state), ResolvingTarget{})

def clock_turn(available: Bool, +state: State) -> Transition:
  match available:
    case False{}: returned(state, None{})
    case True{}: request(state, CheckingPermit{}, T.ReadClock{state_clock(state)})

def next_turn(turns: Nat, +state: State) -> Transition:
  match turns:
    case 0n: returned(state, None{})
    case 1n++rest: clock_turn(S.available(state_session(state)), with_turns(state, rest))

def capture_request(+state: State) -> Transition:
  Receive{with_stage(state, Capturing{}), CaptureChild{Capture.begin(state_session(state), state_target(state),
    state_clock(state), state_cache(state), state_invocation(state), state_next_request(state))}}

def ordinary(dotted: Bool, +state: State) -> Transition:
  match dotted:
    case True{}: returned(state, None{})
    case False{}: returned(state, Some{Resolution{state_target(state), state_member(state)}})

def initializer(initializer: Bool, +state: State) -> Transition:
  match initializer:
    case True{}: capture_request(state)
    case False{}: ordinary(has_dot(state_member(state)), state)

def visited(seen: Bool, +key: String, +state: State) -> Transition:
  match seen:
    case True{}: returned(state, None{})
    case False{}: initializer(Bool.or(String.ends_with(state_target(state), "__init__.py"),
      String.ends_with(state_target(state), "__init__.pyi")),
      with_visited(state, List.append(&2, String, state_visited(state), key <> [])))

def target_found(target: Maybe<&2, String>, +state: State) -> Transition:
  match target:
    case None{}: returned(state, None{})
    case Some{+path}: visited(contains(state_visited(state), String.append(path, String.append(":", state_member(state)))),
      String.append(path, String.append(":", state_member(state))), with_target(state, path))

def captured(capture: Maybe<&2, T.CaptureToken>, state: State) -> Transition:
  match capture:
    case None{}: returned(state, None{})
    case Some{+capture}: request(with_capture(state, Some{capture}), ParsingAuthority{}, T.ParsePythonSyntax{capture})

def inspect_capture(capture: Maybe<&2, T.CaptureToken>, +state: State) -> Transition:
  match capture:
    case None{}: failed(T.MalformedReply{}, state)
    case Some{capture}: request(state, Inspecting{}, T.InspectSource{state_target(state), capture,
      T.PythonSourceContext{T.TypeBranch{}}})

def authority(allowed: Bool, +syntax: T.PythonSyntax, +state: State) -> Transition:
  match allowed:
    case False{}: returned(state, None{})
    case True{}: inspect_capture(state_capture(state), with_syntax(state, Some{syntax}))

def join_nonempty(+head: String, +tail: String) -> String:
  Bool.pick(String, String.eq(head, ""), tail,
    Bool.pick(String, String.eq(tail, ""), head, String.append(head, String.append(".", tail))))

def filtered_tail(text: String, +current: String, +found: String) -> String:
  match text:
    case SNil{}: join_nonempty(found, current)
    case SCon{+head, tail}: filtered_tail(tail,
      Bool.pick(String, String.eq(SCon{head, SNil{}}, "."), "", String.append(current, SCon{head, SNil{}})),
      Bool.pick(String, String.eq(SCon{head, SNil{}}, "."), join_nonempty(found, current), found))

def forwarding_parts(head: String, tail: String) -> String:
  join_nonempty(head, filtered_tail(tail, "", ""))

def forwarded(row: Maybe<&2, T.FactImport>, +state: State) -> Transition:
  match row:
    case None{}: returned(state, None{})
    case Some{T.FactImport{_, path, name, _}}: NextTurn{with_member(with_module(with_owner(state,
      state_target(state)), path), name)}

def declaration(owns: Bool, imports: List<&2, T.FactImport>, +state: State) -> Transition:
  match owns:
    case True{}: returned(with_session(state, S.transfer_to_canonical(state_session(state), state_target(state))),
      Some{Resolution{state_target(state), state_member(state)}})
    case False{}: forwarded(import_for(imports, state_member(state)), state)

def fallback_parts(pair: Parts, +state: State) -> Transition:
  match pair:
    case Parts{head, tail}: NextTurn{with_member(with_module(state, String.append(state_module(state),
      String.append(Bool.pick(String, String.ends_with(state_module(state), "."), "", "."), head))), tail)}

def fallback(allowed: Bool, +state: State) -> Transition:
  match allowed:
    case False{}: returned(state, None{})
    case True{}: fallback_parts(split_first(state_member(state)), state)

def unbound(syntax: Maybe<&2, T.PythonSyntax>, head: String, state: State) -> Transition:
  match syntax:
    case None{}: failed(T.MalformedReply{}, state)
    case Some{syntax}: fallback(Bool.not(Authority.has_package_binding(syntax, head)), state)

def dotted_import(row: Maybe<&2, T.FactImport>, head: String, +state: State) -> Transition:
  match row:
    case None{}: unbound(state_syntax(state), head, state)
    case Some{T.FactImport{key, +path, name, type_only}}: target_request(with_forwarded(state, Some{T.FactImport{key, path, name, type_only}}),
      state_target(state), path, ResolvingForward{})

def inspected_parts(pair: Parts, imports: List<&2, T.FactImport>, +state: State) -> Transition:
  match pair:
    case Parts{+head, _}: dotted_import(import_for(imports, head), head, state)

def inspected_dotted(dotted: Bool, declarations: List<&2, T.FactDeclaration>, imports: List<&2, T.FactImport>, +state: State) -> Transition:
  match dotted:
    case True{}: inspected_parts(split_first(state_member(state)), imports, state)
    case False{}: declaration(owns_declaration(declarations, state_member(state)), imports, state)

def inspected(result: T.SourceOutcome, +state: State) -> Transition:
  match result:
    case T.SourceUnsupported{}: inspected_dotted(has_dot(state_member(state)), [], [], state)
    case T.SourceInspected{T.SourceFacts{_, declarations, imports, _}}:
      inspected_dotted(has_dot(state_member(state)), declarations, imports, state)

def forwarded_tail(pair: Parts, path: String, name: String, +state: State) -> Transition:
  match pair:
    case Parts{_, tail}: NextTurn{with_member(with_module(with_owner(state, state_target(state)), path), forwarding_parts(name, tail))}

def forward_self(self: Bool, path: String, name: String, +state: State) -> Transition:
  match self:
    case True{}: fallback(True{}, state)
    case False{}: forwarded_tail(split_first(state_member(state)), path, name, state)

def forward_match(pair: Parts, target: Maybe<&2, String>, +path: String, +name: String, +state: State) -> Transition:
  match pair target:
    case Parts{head, _} Some{next}: forward_self(Bool.and(String.eq(next, state_target(state)), String.eq(name, head)), path, name, state)
    case _ None{}: forward_self(False{}, path, name, state)

def forward_target(row: Maybe<&2, T.FactImport>, target: Maybe<&2, String>, +state: State) -> Transition:
  match row:
    case None{}: failed(T.MalformedReply{}, state)
    case Some{T.FactImport{_, +path, +name, _}}: forward_match(split_first(state_member(state)), target, path, name, state)

def target_done(stage: Stage, path: Maybe<&2, String>, +state: State) -> Transition:
  match stage:
    case ResolvingTarget{}: target_found(path, state)
    case ResolvingForward{}: forward_target(state_forwarded(state), path, state)
    case _: failed(T.MalformedReply{}, state)

def receive(+state: State, child: Child) -> Transition:
  match child:
    case TargetChild{Target.Await{+inner, +request}}: Settled{Await{
      with_child(with_next_request(with_session(state, Target.state_session(inner)), Target.state_next_request(inner)),
        Some{TargetChild{Target.Await{inner, request}}}), request}}
    case TargetChild{Target.Returned{session, path, next}}: target_done(state_stage(state), path,
      with_child(with_next_request(with_session(state, session), next), None{}))
    case TargetChild{Target.Failed{failure, session, next}}: failed(failure, with_next_request(with_session(state, session), next))
    case CaptureChild{Capture.Await{+inner, +request}}: Settled{Await{
      with_child(with_next_request(with_session(state, Capture.state_session(inner)), Capture.state_next_request(inner)),
        Some{CaptureChild{Capture.Await{inner, request}}}), request}}
    case CaptureChild{Capture.Returned{session, capture, next}}: captured(capture,
      with_child(with_next_request(with_session(state, session), next), None{}))
    case CaptureChild{Capture.Failed{failure}}: failed(failure, state)

def outcome(stage: Stage, +state: State, result: T.ServiceOutcome) -> Transition:
  match stage result:
    case CheckingPermit{} T.ClockRead{bits}: permit(S.permit(state_session(state), Clock.expired(bits), 0n, 0n), state)
    case ParsingAuthority{} T.PythonSyntaxResult{+syntax}: authority(Authority.static_package_authority(syntax), syntax, state)
    case Inspecting{} T.FrontendResult{result}: inspected(result, state)
    case _ T.ProviderRejected{exception}: failed(T.ForeignProviderFailure{exception}, state)
    case _ _: failed(T.MalformedReply{}, state)

def checked(reply: Protocol.CheckedReply, +state: State) -> Transition:
  match reply:
    case Protocol.RejectedReply{failure}: failed(failure, state)
    case Protocol.CheckedOutcome{result}: outcome(state_stage(state), state, result)

def child_resume(child: Child, reply: T.Reply) -> Child:
  match child:
    case TargetChild{step}: TargetChild{Target.resume(step, reply)}
    case CaptureChild{step}: CaptureChild{Capture.resume(step, reply)}

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
    case NextTurn{state}: state_session(state)

def transition_next(transition: Transition) -> Nat:
  match transition:
    case Settled{Await{state, _}}: state_next_request(state)
    case Settled{Returned{_, _, next}}: next
    case Settled{Failed{_, _, next}}: next
    case Receive{state, _}: state_next_request(state)
    case NextTurn{state}: state_next_request(state)

def settle(fuel: Nat, +transition: Transition) -> Step:
  match fuel transition:
    case _ Settled{step}: step
    case 0n _: Failed{T.MalformedReply{}, transition_session(transition), transition_next(transition)}
    case 1n++rest Receive{state, child}: settle(rest, receive(state, child))
    case 1n++rest NextTurn{+state}: settle(rest, next_turn(state_turns(state), state))

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
    case Await{+state, request}: settle(12n, apply_reply(state_child(state), state, request, reply))
    case _: Failed{T.MalformedReply{}, step_session(step), step_next(step)}

def begin(+session: S.Session, remaining: S.Remaining, from: String, import_path: String, member: String,
    root_path: String, clock: T.ClockToken, cache: T.CacheToken, separator: String,
    invocation: Nat, next_request: Nat) -> Step:
  settle(12n, NextTurn{State{S.with_remaining(session, remaining), clock, cache, separator,
    invocation, next_request, root_path, from, import_path, member, "", Nat.add(S.depth(session), 1n),
    [], None{}, None{}, None{}, CheckingPermit{}, None{}}})

def main() -> Unit:
  Unit{}
