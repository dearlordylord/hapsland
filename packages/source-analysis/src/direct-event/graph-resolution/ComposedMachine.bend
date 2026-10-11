import Base
import ./Types.bend as T
import ./State.bend as S
import ./Loop.bend as Loop
import ./Machine.bend as Machine
import ./Resolve.bend as Resolve
import ./Read.bend as Read
import ./LoopPolicy.bend as LoopPolicy
import ./Clock.bend as Clock
import ./Protocol.bend as Protocol
import ./TerminalMachine.bend as Terminal
import ./ComposedBudget.bend as Budget
import ./python-module/ResolveImportMachine.bend as Import
import ./traversal/core.bend as Local
import ./python-module/Session.bend as Python
import ../../../../review-execution/src/direct-event/preparation/PreparationMachine.bend as Preparation
import ./python-module/InspectMachine.bend as Inspect
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

# Source-bearing child state stays outside the shared protocol types.
# Import/capture/terminal composition is still required before adoption.
type Step is Data:
  TerminalChild{child: Terminal.Step}
  ResolvingImport{context: Terminal.Context, state: T.ResolverState, edge: Local.Pending, child: Import.Step}
  Generic{context: Terminal.Context, continuation: Loop.Continuation}
  Preparing{context: Terminal.Context, state: T.ResolverState, child: Preparation.Step}
  InspectingTarget{context: Terminal.Context, state: T.ResolverState, child: Inspect.Step}
  InspectingRoot{context: Terminal.Context, state: T.ResolverState, child: Inspect.Step}

def context_census(context: Terminal.Context) -> Budget.Census:
  match context:
    case Terminal.Context{_, _, census}: census

def synchronized(state: T.ResolverState, next: Nat) -> T.ResolverState:
  S.with_state_next_request(state, next)

def after_request(+state: T.ResolverState, request: T.Request) -> T.ResolverState:
  match request:
    case T.Request{_, id, _}: S.with_state_next_request(state, Nat.add(id, 1n))

def preparation_result(context: Terminal.Context, state: T.ResolverState, child: Preparation.Step) -> Step:
  match child:
    case Preparation.Await{child_state, +request}: Preparing{context, after_request(state, request), Preparation.Await{child_state, request}}
    case Preparation.Returned{None{}, _}: Generic{context, Machine.unavailable()}
    case Preparation.Returned{Some{Preparation.Prepared{session, +cache}}, next}:
      Generic{Terminal.Context{Some{session}, Some{cache}, context_census(context)}, Machine.root_budget(synchronized(state, next))}
    case Preparation.Failed{failure}: Generic{context, Loop.ServiceStep{T.FailedResolver{failure}}}

def prepare_clock(clock: Maybe<&2, T.ClockToken>, context: Terminal.Context, +state: T.ResolverState) -> Step:
  match clock:
    case None{}: Generic{context, Machine.malformed()}
    case Some{clock}:
      +input = S.state_input(state)
      +limits = S.input_limits(input)
      preparation_result(context, state, Preparation.begin(Preparation.Input{
        S.input_root_path(input), S.input_root_capture(input), S.input_root_bytes(input),
        Graph.file_cap(limits), Graph.read_cap(limits), Graph.work_cap(limits),
        Graph.source_cap(limits), Graph.depth_cap(limits), clock,
        S.input_invocation(input), S.input_caller_cache(input)}, S.state_next_request(state)))

def inspect_result(context: Terminal.Context, state: T.ResolverState, child: Inspect.Step) -> Step:
  match child:
    case Inspect.Await{child_state, +request}: InspectingRoot{context, after_request(state, request), Inspect.Await{child_state, request}}
    case Inspect.Returned{None{}, next}: Generic{context, Machine.inspected_root(T.SourceUnsupported{}, S.with_state_next_request(state, next))}
    case Inspect.Returned{Some{facts}, next}: Generic{context, Machine.inspected_root(T.SourceInspected{facts}, S.with_state_next_request(state, next))}
    case Inspect.Failed{failure}: Generic{context, Loop.ServiceStep{T.FailedResolver{failure}}}

def inspect_root(context: Terminal.Context, +state: T.ResolverState) -> Step:
  +input = S.state_input(state)
  inspect_result(context, state, Inspect.begin(S.input_branch(input), S.input_root_path(input),
    S.input_root_path(input), S.input_root_capture(input), S.input_invocation(input), S.state_next_request(state)))

def inspect_target_result(context: Terminal.Context, state: T.ResolverState, child: Inspect.Step) -> Step:
  match child:
    case Inspect.Await{child_state, +request}: InspectingTarget{context, after_request(state, request), Inspect.Await{child_state, request}}
    case Inspect.Returned{None{}, next}: Generic{context, Read.inspected(T.SourceUnsupported{}, S.with_state_next_request(state, next))}
    case Inspect.Returned{Some{facts}, next}: Generic{context, Read.inspected(T.SourceInspected{facts}, S.with_state_next_request(state, next))}
    case Inspect.Failed{failure}: Generic{context, Loop.ServiceStep{T.FailedResolver{failure}}}

def inspect_target(context: Terminal.Context, +state: T.ResolverState, capture: T.CaptureToken) -> Step:
  +input = S.state_input(state)
  inspect_target_result(context, state, Inspect.begin(S.input_branch(input), S.scratch_capture_path(S.state_scratch(state)),
    S.input_root_path(input), capture, S.input_invocation(input), S.state_next_request(state)))

def rename(edge: Local.Pending, name: String) -> Local.Pending:
  match edge:
    case Local.Pending{owner, slot, from, key, _, depth, expected, target}:
      Local.Pending{owner, slot, from, key, name, depth, expected, target}

def python_unresolved(frame: Maybe<&2, T.ResolverFrame>, state: T.ResolverState) -> Loop.Continuation:
  match frame:
    case None{}: Machine.malformed()
    case Some{frame}: Resolve.progressed(False{}, state, Resolve.allocated(frame, Graph.Unhandled{}))

def import_selected(result: Maybe<&2, Import.Resolution>, +edge: Local.Pending, +state: T.ResolverState) -> Loop.Continuation:
  match result:
    case None{}: python_unresolved(S.state_frame(state), state)
    case Some{Import.Resolution{path, name}}: Resolve.select_path(S.state_frame(state), Some{rename(edge, name)}, path, state)

def import_admitted(allowed: Bool, result: Maybe<&2, Import.Resolution>, edge: Local.Pending, +state: T.ResolverState) -> Loop.Continuation:
  match allowed:
    case False{}: python_unresolved(S.state_frame(state), state)
    case True{}: import_selected(result, edge, state)

def import_frame(frame: Maybe<&2, T.ResolverFrame>, census: Budget.Census, +session: Python.Session,
    result: Maybe<&2, Import.Resolution>, edge: Local.Pending, state: T.ResolverState) -> Loop.Continuation:
  match frame:
    case None{}: Machine.malformed()
    case Some{+frame}: import_admitted(Budget.available(census, session, frame), result, edge,
      S.with_state_frame(state, Some{S.with_frame_dependencies(frame, Python.dependencies(session))}))

def context_cache(context: Terminal.Context) -> Maybe<&2, T.CacheToken>:
  match context:
    case Terminal.Context{_, cache, _}: cache

def import_result_owned(child: Import.Step, +context: Terminal.Context, +state: T.ResolverState,
    edge: Local.Pending, +session: Python.Session, next: Nat, +census: Budget.Census) -> Step:
  match child:
    case Import.Await{child_state, request}: ResolvingImport{
      Terminal.Context{Some{session}, context_cache(context), census}, S.with_state_next_request(state, next), edge,
      Import.Await{child_state, request}}
    case Import.Returned{_, result, _}: Generic{Terminal.Context{Some{session}, context_cache(context), census},
      import_frame(S.state_frame(state), census, session, result, edge, S.with_state_next_request(state, next))}
    case Import.Failed{failure, _, _}: Generic{Terminal.Context{Some{session}, context_cache(context), census},
      Loop.ServiceStep{T.FailedResolver{failure}}}

def import_result(+context: Terminal.Context, state: T.ResolverState, edge: Local.Pending, +child: Import.Step) -> Step:
  import_result_owned(child, context, state, edge, Import.step_session(child), Import.step_next(child), context_census(context))

def import_resources(frame: Maybe<&2, T.ResolverFrame>, clock: Maybe<&2, T.ClockToken>,
    +session: Python.Session, +cache: T.CacheToken, +census: Budget.Census,
    +state: T.ResolverState, +edge: Local.Pending) -> Step:
  match frame clock:
    case Some{frame} Some{clock}:
      +input = S.state_input(state)
      import_result(Terminal.Context{Some{session}, Some{cache}, census}, state, edge,
        Import.begin(session, Budget.remaining(census, frame), Resolve.from_path(edge), Resolve.import_path(edge),
          Resolve.pending_name(edge), S.input_root_path(input), clock, cache, S.state_separator(state),
          S.input_invocation(input), S.state_next_request(state)))
    case _ _: Generic{Terminal.Context{Some{session}, Some{cache}, census}, Machine.malformed()}

def import_begin(context: Terminal.Context, +state: T.ResolverState, edge: Local.Pending) -> Step:
  match context:
    case Terminal.Context{Some{session}, Some{cache}, census}:
      import_resources(S.state_frame(state), S.state_clock(state), session, cache, census, state, edge)
    case _: Generic{context, Machine.malformed()}

def cached_bytes(cached: T.CacheOutcome) -> Maybe<&2, Nat>:
  match cached:
    case T.CacheAbsent{}: None{}
    case T.CachePresent{_, bytes}: Some{bytes}

def admitted_cached(context: Terminal.Context, +state: T.ResolverState, cached: T.CacheOutcome) -> Step:
  match context cached:
    case Terminal.Context{session, cache, census} T.CachePresent{+capture, +bytes}:
      Generic{Terminal.Context{session, cache, Budget.succeeded(census, S.scratch_capture_path(S.state_scratch(state)), bytes)},
        Read.cache_lookup_unchecked(T.CachePresent{capture, bytes}, state)}
    case _ _: Generic{context, Read.cache_lookup_unchecked(cached, state)}

def admitted_capture(reserved: Maybe<&2, Budget.Census>, context: Terminal.Context, state: T.ResolverState,
    cached: T.CacheOutcome) -> Step:
  match reserved context:
    case None{} _: Generic{context, Read.failed(state)}
    case Some{census} Terminal.Context{session, cache, _}: admitted_cached(Terminal.Context{session, cache, census}, state, cached)

def admit_capture_frame(frame: Maybe<&2, T.ResolverFrame>, context: Terminal.Context, session: Python.Session,
    census: Budget.Census, +state: T.ResolverState, +cached: T.CacheOutcome) -> Step:
  match frame:
    case None{}: Generic{context, Machine.malformed()}
    case Some{frame}: admitted_capture(Budget.reserve(census, session, frame,
      S.scratch_capture_path(S.state_scratch(state)), cached_bytes(cached)), context, state, cached)

def admit_capture(context: Terminal.Context, +state: T.ResolverState, +cached: T.CacheOutcome) -> Step:
  match context:
    case Terminal.Context{Some{+session}, cache, +census}:
      admit_capture_frame(S.state_frame(state), Terminal.Context{Some{session}, cache, census}, session, census, state, cached)
    case _: Generic{context, Machine.malformed()}

def capture_finished(context: Terminal.Context, +state: T.ResolverState, outcome: T.CaptureOutcome) -> Step:
  match context outcome:
    case Terminal.Context{session, cache, census} T.SourceCaptured{+capture, +path, +bytes}:
      Generic{Terminal.Context{session, cache, Budget.succeeded(census, path, bytes)},
        Read.captured_unchecked(T.SourceCaptured{capture, path, bytes}, state)}
    case _ _: Generic{context, Read.captured_unchecked(outcome, state)}

def iteration_allowed(allowed: Bool, context: Terminal.Context, +state: T.ResolverState) -> Step:
  match allowed:
    case False{}: Generic{context, LoopPolicy.deadline(S.state_frame(state))}
    case True{}: Generic{context, LoopPolicy.iteration_frame(S.state_frame(state), state)}

def iteration_context(context: Terminal.Context, +state: T.ResolverState, frame: Maybe<&2, T.ResolverFrame>) -> Step:
  match context frame:
    case Terminal.Context{Some{+session}, cache, +census} Some{frame}:
      iteration_allowed(Budget.available(census, session, frame), Terminal.Context{Some{session}, cache, census}, state)
    case _ _: Generic{context, Machine.malformed()}

def terminal_result(child: Terminal.Step) -> Step:
  match child:
    case Terminal.Generic{context, continuation}: Generic{context, continuation}
    case _: TerminalChild{child}

def dispatch(context: Terminal.Context, continuation: Loop.Continuation) -> Step:
  match continuation:
    case Loop.PythonIteration{+state}: iteration_context(context, state, S.state_frame(state))
    case Loop.PythonTerminal{state, result}: terminal_result(Terminal.terminal_context(context, state, result))
    case Loop.AdmitPythonCapture{state, cached}: admit_capture(context, state, cached)
    case Loop.PythonCaptured{state, outcome}: capture_finished(context, state, outcome)
    case Loop.InspectPythonTarget{state, capture}: inspect_target(context, state, capture)
    case Loop.ResolvePython{state, edge}: import_begin(context, state, edge)
    case Loop.PreparePython{+state}: prepare_clock(S.state_clock(state), context, state)
    case Loop.InspectPythonRoot{state}: inspect_root(context, state)
    case _: Generic{context, continuation}

def advance_once(step: Step) -> Step:
  match step:
    case Generic{context, continuation}: dispatch(context, Machine.continue_action(continuation))
    case _: step

def boundary(step: Step) -> Bool:
  match step:
    case Generic{_, Loop.ServiceStep{_}}: True{}
    case Generic{_, _}: False{}
    case _: True{}

def settle_step(done: Bool, step: Step, recurse: Step -> Step) -> Step:
  match done:
    case True{}: step
    case False{}: recurse(advance_once(step))

def settle(fuel: Nat, +step: Step) -> Step:
  match fuel:
    case 0n: step
    case 1n++rest:
      next : Step -> Step = step => settle(rest, step)
      settle_step(boundary(step), step, next)

def advance(step: Step) -> Step:
  settle(16n, step)

def resume_reply(step: Step, reply: T.Reply) -> Step:
  match step:
    case TerminalChild{child}: advance(terminal_result(Terminal.resume(child, reply)))
    case InspectingTarget{context, state, child}: advance(inspect_target_result(context, state, Inspect.resume(child, reply)))
    case ResolvingImport{context, state, edge, child}: advance(import_result(context, state, edge, Import.resume(child, reply)))
    case Generic{context, continuation}: advance(Generic{context, Machine.resume(continuation, T.ServiceReply{reply})})
    case Preparing{context, state, child}: advance(preparation_result(context, state, Preparation.resume(child, reply)))
    case InspectingRoot{context, state, child}: advance(inspect_result(context, state, Inspect.resume(child, reply)))

# Projection is transport-only: the host sees the same service protocol for
# generic and child machines and does not choose a language continuation.
def view(step: Step) -> T.ResolverStep:
  match step:
    case TerminalChild{child}: Terminal.service(child)
    case InspectingTarget{_, state, Inspect.Await{_, request}}: T.AwaitService{state, request}
    case ResolvingImport{_, state, _, Import.Await{_, request}}: T.AwaitService{state, request}
    case Generic{_, Loop.ServiceStep{service}}: service
    case Preparing{_, state, Preparation.Await{_, request}}: T.AwaitService{state, request}
    case InspectingRoot{_, state, Inspect.Await{_, request}}: T.AwaitService{state, request}
    case _: T.FailedResolver{T.MalformedReply{}}

def cancel(service: T.ResolverStep, +invocation: Nat, context: Terminal.Context) -> Step:
  match service:
    case T.AwaitService{_, T.Request{+owner, _, _}}:
      Generic{context, Machine.cancelled(Nat.is_eq(owner, invocation), owner, invocation)}
    case _: Generic{context, Loop.ServiceStep{T.FailedResolver{T.ReplyAfterTerminal{}}}}

def step_context(step: Step) -> Terminal.Context:
  match step:
    case TerminalChild{child}: Terminal.get_context(child)
    case InspectingTarget{context, _, _}: context
    case ResolvingImport{context, _, _, _}: context
    case Generic{context, _}: context
    case Preparing{context, _, _}: context
    case InspectingRoot{context, _, _}: context

def resume(+step: Step, event: T.ResolverEvent) -> Step:
  match event:
    case T.ServiceReply{reply}: resume_reply(step, reply)
    case T.CancelInvocation{invocation}: cancel(view(step), invocation, step_context(step))

def initial(+input: T.ResolverInput) -> Step:
  advance(Generic{Terminal.Context{None{}, None{}, Budget.initial(S.input_root_path(input), S.input_root_bytes(input))}, Machine.initial(input)})

def main() -> Unit:
  Unit{}
