import Base
import ./RuntimeModel.bend as R
import ./RuntimeSpecification.bend as Specification
import ./RuntimeLawObservation.bend as Observation
import ./Types.bend as T
import ./Loop.bend as L
import ./Machine.bend as M
import ./Environment.bend as E
import ./WholeObservation.bend as O
import ./RuntimeTraceProof.bend as Lists

# Direct row correspondence. Associativity only reconciles ordered trace
# grouping; it does not introduce a different graph representation.
def resumed_exact(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
    +step: L.Continuation, +invocation: Nat, +next: Nat, +world: World,
    +effects: List<&2, O.Effect>, +actions: List<&2, R.Action>) -> {
  R.resumed(World, step, observe, invocation, next, E.WorldState{world, effects}, actions)
  == Specification.publish(World, step, observe, invocation, next, world, effects, actions)
  : R.State<World>
}:
  match step:
    case L.ServiceStep{T.FailedResolver{T.ForeignProviderFailure{+exception}}}:
      Equal.cong(List<&2, R.Action>, R.State<World>,
        out => R.State{invocation, R.RuntimeClosed{},
          R.RuntimeReturned{step, Some{observe(exception, world)}}, None{}, next,
          E.WorldState{world, effects}, out},
        List.append(&2, R.Action,
          List.append(&2, R.Action, actions,
            R.ExceptionObserved{exception, observe(exception, world)} <> []),
          R.RegistryClosed{invocation} <> []),
        List.append(&2, R.Action, actions,
          R.ExceptionObserved{exception, observe(exception, world)} <>
          R.RegistryClosed{invocation} <> []),
        Lists.append_assoc(&2, R.Action, actions,
          R.ExceptionObserved{exception, observe(exception, world)} <> [],
          R.RegistryClosed{invocation} <> []))
    case L.ServiceStep{T.FailedResolver{T.WrongInvocation{_, _}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.WrongCorrelation{_, _}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.WrongReplyKind{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.MalformedReply{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.LocalTraversalFailure{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.NegativeGraphWork{_}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.RuntimeFailure{_}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.InvocationCancelled{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.ReplyAfterTerminal{}}}: {==}
    case L.ServiceStep{T.AwaitService{_, _}}: {==}
    case L.ServiceStep{T.FinishedResolver{_, _}}: {==}
    case L.PrepareRust{_}: {==}
    case L.PreparedRust{_, _, _}: {==}
    case L.RustAdvance{_, _}: {==}
    case L.RustInvalid{_}: {==}
    case L.RustFollowInvalid{_}: {==}
    case L.RustFindCargo{_}: {==}
    case L.RustCargoContinue{_}: {==}
    case L.RustFollow{_, _, _}: {==}
    case L.RustCargo{_, _}: {==}
    case L.RustModules{_, _}: {==}
    case L.RustTasks{_, _}: {==}
    case L.ResolvePending{_, _}: {==}
    case L.CheckTarget{_, _}: {==}
    case L.ReadTarget{_, _}: {==}
    case L.InspectCaptured{_, _}: {==}
    case L.ReadBundled{_, _, _, _}: {==}
    case L.PrepareImportedRust{_}: {==}

def response_exact(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
    +response: R.ProviderResponse<World>, +request: T.Request, +step: L.Continuation,
    +invocation: Nat, +next: Nat, +effects: List<&2, O.Effect>,
    +actions: List<&2, R.Action>) -> {
  R.provider_response(World, response, request, step, observe, invocation, next, effects, actions)
  == Specification.response(
    World,
    response,
    request,
    step,
    observe,
    invocation,
    next,
    effects,
    actions
  )
  : R.State<World>
}:
  match response:
    case R.ProviderSuspended{_, _}: {==}
    case R.ProviderReturned{+world, +outcome, +nested}:
      +reply = E.stamp(request, outcome)
      %Lists.append_assoc(&2, O.Effect, effects, nested, O.Responded{reply} <> []) : {
        R.provider_response(
          World,
          response,
          request,
          step,
          observe,
          invocation,
          next,
          effects,
          actions
        )
        == Specification.publish(
          World,
          M.resume(step, T.ServiceReply{reply}),
          observe,
          invocation,
          next,
          world,
          _,
          List.append(&2, R.Action, actions, R.ServiceResumed{reply} <> [])
        )
        : R.State<World>
      }
      resumed_exact(~World, ~observe, M.resume(step, T.ServiceReply{reply}), invocation, next,
        world, List.append(&2, O.Effect,
          List.append(&2, O.Effect, effects, nested), O.Responded{reply} <> []),
        List.append(&2, R.Action, actions, R.ServiceResumed{reply} <> []))

def issue_exact(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error, +request: T.Request,
    +step: L.Continuation, +invocation: Nat, +next: Nat, +world: World,
    +effects: List<&2, O.Effect>, +actions: List<&2, R.Action>) -> {
      R.issue(
        World,
        respond,
        request,
        step,
        observe,
        invocation,
        next,
        E.WorldState{world, effects},
        actions
      )
      == Specification.request_response(
        World,
        request,
        step,
        respond,
        observe,
        invocation,
        next,
        world,
        effects,
        actions
      )
      : R.State<World>
    }:
  match request:
    case T.Request{_, _, operation}:
      response_exact(~World, ~observe, respond(operation, world), request, step, invocation, next,
        List.append(&2, O.Effect, effects, O.Invoked{request} <> []),
        List.append(&2, R.Action, actions, R.ServiceInvoked{request} <> []))

def ready_exact(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error, +step: L.Continuation,
    +invocation: Nat, +next: Nat, +world: World,
    +effects: List<&2, O.Effect>, +actions: List<&2, R.Action>) -> {
  R.advance_step(
    World,
    step,
    respond,
    observe,
    invocation,
    next,
    E.WorldState{world, effects},
    actions
  )
  == Specification.ready(World, step, respond, observe, invocation, next, world, effects, actions)
  : R.State<World>
}:
  match step:
    case L.ServiceStep{T.AwaitService{_, +request}}:
      issue_exact(
        ~World,
        ~respond,
        ~observe,
        request,
        step,
        invocation,
        next,
        world,
        effects,
        actions
      )
    case L.ServiceStep{T.FailedResolver{_}}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.ServiceStep{T.FinishedResolver{_, _}}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.PrepareRust{_}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.PreparedRust{_, _, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustAdvance{_, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustInvalid{_}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustFollowInvalid{_}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustFindCargo{_}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustCargoContinue{_}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustFollow{_, _, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustCargo{_, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustModules{_, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.RustTasks{_, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.ResolvePending{_, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.CheckTarget{_, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.ReadTarget{_, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.InspectCaptured{_, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.ReadBundled{_, _, _, _}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)
    case L.PrepareImportedRust{_}:
      resumed_exact(~World, ~observe, step, invocation, next, world, effects, actions)

def advance_exact(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error, +state: R.State<World>) -> {
  R.advance(World, state, respond, observe)
  == Specification.advance(World, state, respond, observe) : R.State<World>
}:
  match state:
    case R.State{invocation, R.RuntimeOpen{}, R.RuntimeReady{step}, None{}, next,
        E.WorldState{world, effects}, actions}:
      ready_exact(~World, ~respond, ~observe, step, invocation, next, world, effects, actions)
    case R.State{_, R.RuntimeOpen{}, R.RuntimeReady{_}, Some{_}, _, _, _}: {==}
    case R.State{_, R.RuntimeOpen{}, R.RuntimeWaiting{_}, _, _, _, _}: {==}
    case R.State{_, R.RuntimeOpen{}, R.RuntimeReturned{_, _}, _, _, _, _}: {==}
    case R.State{_, R.RuntimeOpen{}, R.RuntimeCancelled{_}, _, _, _, _}: {==}
    case R.State{_, R.RuntimeClosed{}, _, _, _, _, _}: {==}

def stopped_exact(+execution: R.Execution) -> {
  R.cancellation_execution(execution) == Specification.stopped(execution) : R.Execution
}:
  match execution:
    case R.RuntimeReady{_}: {==}
    case R.RuntimeWaiting{_}: {==}
    case R.RuntimeReturned{_, _}: {==}
    case R.RuntimeCancelled{_}: {==}

def cancellation_exact(~World: Data, +matches: Bool, +state: R.State<World>) -> {
  R.cancellation(World, matches, state) == Specification.cancellation(World, matches, state)
  : R.State<World>
}:
  match matches state:
    case True{} R.State{+invocation, R.RuntimeOpen{}, +execution, +provider, +next,
        E.WorldState{+world, +effects}, +actions}:
      %stopped_exact(execution) : {
        R.State{invocation, R.RuntimeClosed{}, R.cancellation_execution(execution), provider,
          next, E.WorldState{world, List.append(&2, O.Effect, effects,
            O.CancelledInvocation{invocation} <> [])},
          R.actions_append(R.actions_append(actions, R.CancellationObserved{invocation}),
            R.RegistryClosed{invocation})}
        == R.State{invocation, R.RuntimeClosed{}, _, provider,
          next, E.WorldState{world, List.append(&2, O.Effect, effects,
            O.CancelledInvocation{invocation} <> [])},
          List.append(&2, R.Action, actions,
            R.CancellationObserved{invocation} <> R.RegistryClosed{invocation} <> [])}
        : R.State<World>}
      Equal.cong(List<&2, R.Action>, R.State<World>,
        out => R.State{invocation, R.RuntimeClosed{}, R.cancellation_execution(execution),
          provider, next, E.WorldState{world, List.append(&2, O.Effect, effects,
            O.CancelledInvocation{invocation} <> [])}, out},
        List.append(&2, R.Action,
          List.append(&2, R.Action, actions, R.CancellationObserved{invocation} <> []),
          R.RegistryClosed{invocation} <> []),
        List.append(&2, R.Action, actions,
          R.CancellationObserved{invocation} <> R.RegistryClosed{invocation} <> []),
        Lists.append_assoc(&2, R.Action, actions,
          R.CancellationObserved{invocation} <> [], R.RegistryClosed{invocation} <> []))
    case False{} _: {==}
    case True{} R.State{_, R.RuntimeClosed{}, _, _, _, _, _}: {==}

def cancel_exact(~World: Data, +state: R.State<World>, +actual: Nat) -> {
  R.cancel(World, state, actual) == Specification.cancel(World, state, actual) : R.State<World>
}:
  match state:
    case R.State{invocation, _, _, _, _, _, _}:
      cancellation_exact(~World, Nat.is_eq(invocation, actual), state)

def completed_execution_exact(~World: Data,
    ~observe: T.ExceptionToken -> World -> O.Error, +execution: R.Execution,
    +provider: R.RuntimeProvider, +completion: E.Completion<World>,
    +invocation: Nat, +registry: R.Registry, +next: Nat, +old: World,
    +effects: List<&2, O.Effect>, +actions: List<&2, R.Action>) -> {
      R.completed_execution(
        World,
        execution,
        completion,
        provider,
        invocation,
        next,
        observe,
        E.WorldState{old, effects},
        actions
      )
      == Specification.accepted_completion(
        World,
        True{},
        R.State{
          invocation,
          registry,
          execution,
          Some{provider},
          next,
          E.WorldState{old, effects},
          actions
        },
        completion,
        observe
      )
      : R.State<World>
    }:
  match execution provider completion:
    case R.RuntimeWaiting{+step} R.RuntimeProvider{+request, +expected}
        E.Completion{_, +world, +outcome, +nested}:
      +reply = E.stamp(request, outcome)
      %Lists.append_assoc(&2, O.Effect, effects, nested, O.Responded{reply} <> []) : {
        R.completed_execution(World, execution, completion, provider, invocation, next, observe,
          E.WorldState{old, effects}, actions)
        == Specification.publish(World, M.resume(step, T.ServiceReply{reply}), observe,
          invocation, next, world, _, List.append(&2, R.Action, actions,
            R.ProviderRetired{expected} <> R.ServiceResumed{reply} <> [])) : R.State<World>}
      %Lists.append_assoc(&2, R.Action, actions, R.ProviderRetired{expected} <> [],
          R.ServiceResumed{reply} <> []) : {
            R.completed_execution(
              World,
              execution,
              completion,
              provider,
              invocation,
              next,
              observe,
              E.WorldState{old, effects},
              actions
            )
            == Specification.publish(
              World,
              M.resume(step, T.ServiceReply{reply}),
              observe,
              invocation,
              next,
              world,
              List.append(
                &2,
                O.Effect,
                List.append(&2, O.Effect, effects, nested),
                O.Responded{reply} <> []
              ),
              _
            )
            : R.State<World>
          }
      resumed_exact(~World, ~observe, M.resume(step, T.ServiceReply{reply}), invocation, next,
        world, List.append(&2, O.Effect,
          List.append(&2, O.Effect, effects, nested), O.Responded{reply} <> []),
        List.append(&2, R.Action,
          List.append(&2, R.Action, actions, R.ProviderRetired{expected} <> []),
          R.ServiceResumed{reply} <> []))
    case R.RuntimeReady{_} R.RuntimeProvider{_, _} E.Completion{_, _, _, _}: {==}
    case R.RuntimeReturned{_, _} R.RuntimeProvider{_, _} E.Completion{_, _, _, _}: {==}
    case R.RuntimeCancelled{_} R.RuntimeProvider{_, _} E.Completion{_, _, _, _}: {==}

def completed_owner_exact(~World: Data,
    ~observe: T.ExceptionToken -> World -> O.Error, +matches: Bool,
    +state: R.State<World>, +completion: E.Completion<World>) -> {
  R.completed_owner(World, matches, state, completion, observe)
  == Specification.accepted_completion(World, matches, state, completion, observe) : R.State<World>
}:
  match matches state completion:
    case True{} R.State{invocation, registry, execution, Some{provider}, next,
        E.WorldState{old, effects}, actions} E.Completion{_, _, _, _}:
      completed_execution_exact(~World, ~observe, execution, provider, completion,
        invocation, registry, next, old, effects, actions)
    case False{} _ _: {==}
    case True{} R.State{_, _, R.RuntimeReady{_}, None{}, _, E.WorldState{_, _}, _}
        E.Completion{_, _, _, _}: {==}
    case True{} R.State{_, _, R.RuntimeWaiting{_}, None{}, _, E.WorldState{_, _}, _}
        E.Completion{_, _, _, _}: {==}
    case True{} R.State{_, _, R.RuntimeReturned{_, _}, None{}, _, E.WorldState{_, _}, _}
        E.Completion{_, _, _, _}: {==}
    case True{} R.State{_, _, R.RuntimeCancelled{_}, None{}, _, E.WorldState{_, _}, _}
        E.Completion{_, _, _, _}: {==}

def complete_exact(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
    +state: R.State<World>, +completion: E.Completion<World>) -> {
  R.complete(World, state, completion, observe)
  == Specification.completion(World, state, completion, observe) : R.State<World>
}:
  match state completion:
    case R.State{_, _, _, Some{R.RuntimeProvider{_, +expected}}, _, _, _}
        E.Completion{+actual, _, _, _}:
      completed_owner_exact(~World, ~observe, E.same_lease(expected, actual), state, completion)
    case R.State{_, _, _, None{}, _, _, _} E.Completion{_, _, _, _}: {==}

# Exact type of approved RUNTIME_LAWS.scheduler_step_exact.
def step_exact(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error, +state: R.State<World>,
    +item: R.RuntimeEvent<World>) -> {
  R.event(World, state, item, respond, observe)
  == Specification.event(World, state, item, respond, observe) : R.State<World>
}:
  match item:
    case R.RuntimeAdvance{}: advance_exact(~World, ~respond, ~observe, state)
    case R.RuntimeCancel{invocation}: cancel_exact(~World, state, invocation)
    case R.RuntimeComplete{completion}: complete_exact(~World, ~observe, state, completion)

def prefix_from_same_state(~World: Data,
    ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error,
    +events: List<&2, R.RuntimeEvent<World>>, +state: R.State<World>) -> {
  R.run_events(~World, ~respond, ~observe, events, state)
  == Specification.run_events(~World, ~respond, ~observe, events, state) : R.State<World>
}:
  match events:
    case []: {==}
    case +head <> +tail:
      %step_exact(~World, ~respond, ~observe, state, head) : {
        R.run_events(
          ~World,
          ~respond,
          ~observe,
          tail,
          R.event(World, state, head, respond, observe)
        )
        == Specification.run_events(~World, ~respond, ~observe, tail, _)
        : R.State<World>
      }
      prefix_from_same_state(~World, ~respond, ~observe, tail,
        R.event(World, state, head, respond, observe))

# Exact type of approved RUNTIME_LAWS.scheduler_prefix_exact.
def prefix_exact(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error, +input: T.ResolverInput,
    +world: World, +events: List<&2, R.RuntimeEvent<World>>) -> {
  R.run_events(~World, ~respond, ~observe, events, R.initial(World, input, world))
  == Specification.run_events(~World, ~respond, ~observe, events,
    Specification.initial(World, input, world)) : R.State<World>
}:
  prefix_from_same_state(~World, ~respond, ~observe, events, R.initial(World, input, world))

# Complete correspondence dependency; the four-law owner remains RUNTIME_LAWS.bend.
def main() -> Unit:
  Unit{}
