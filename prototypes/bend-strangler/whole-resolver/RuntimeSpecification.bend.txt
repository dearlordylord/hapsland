import Base
import ./RuntimeModel.bend as R
import ./Types.bend as T
import ./Loop.bend as L
import ./Machine.bend as M
import ./State.bend as S
import ./Environment.bend as E
import ./WholeObservation.bend as O

# Independent scheduler table. Share protocol/data constructors, not RuntimeModel
# transition helpers. Provider effects are arbitrary ordered world observations.
# Physical cleanup and graph semantics remain separate correspondence owners.
def initial(-World: Data, +input: T.ResolverInput, world: World) -> R.State<World>:
  R.State{S.input_invocation(input), R.RuntimeOpen{}, R.RuntimeReady{M.initial(input)},
    None{}, 1n, E.WorldState{world, []}, []}

def publish(-World: Data, +step: L.Continuation,
    observe: T.ExceptionToken -> World -> O.Error, +invocation: Nat, next: Nat,
    +world: World, effects: List<&2, O.Effect>, actions: List<&2, R.Action>) -> R.State<World>:
  match step:
    case L.ServiceStep{T.AwaitService{_, _}}:
      R.State{invocation, R.RuntimeOpen{}, R.RuntimeReady{step}, None{}, next,
        E.WorldState{world, effects}, actions}
    case L.ServiceStep{T.FailedResolver{T.ForeignProviderFailure{+exception}}}:
      +error = observe(exception, world)
      R.State{invocation, R.RuntimeClosed{}, R.RuntimeReturned{step, Some{error}},
        None{}, next, E.WorldState{world, effects}, List.append(&2, R.Action, actions,
          R.ExceptionObserved{exception, error} <> R.RegistryClosed{invocation} <> [])}
    case _:
      R.State{invocation, R.RuntimeClosed{}, R.RuntimeReturned{step, None{}},
        None{}, next, E.WorldState{world, effects},
        List.append(&2, R.Action, actions, R.RegistryClosed{invocation} <> [])}

def response(-World: Data, response: R.ProviderResponse<World>, +request: T.Request,
    step: L.Continuation, observe: T.ExceptionToken -> World -> O.Error,
    +invocation: Nat, +next: Nat, effects: List<&2, O.Effect>,
    actions: List<&2, R.Action>) -> R.State<World>:
  match response:
    case R.ProviderSuspended{world, nested}:
      R.State{invocation, R.RuntimeOpen{}, R.RuntimeWaiting{step},
        Some{R.RuntimeProvider{request, O.ProviderLease{invocation, next}}},
        (next + 1n : Nat), E.WorldState{world, List.append(&2, O.Effect, effects, nested)}, actions}
    case R.ProviderReturned{world, outcome, nested}:
      +reply = E.stamp(request, outcome)
      publish(World, M.resume(step, T.ServiceReply{reply}), observe, invocation, next, world,
        List.append(&2, O.Effect, effects,
          List.append(&2, O.Effect, nested, O.Responded{reply} <> [])),
        List.append(&2, R.Action, actions, R.ServiceResumed{reply} <> []))

def request_response(-World: Data, +request: T.Request, step: L.Continuation,
    respond: T.Operation -> World -> R.ProviderResponse<World>,
    observe: T.ExceptionToken -> World -> O.Error, invocation: Nat, next: Nat,
    world: World, effects: List<&2, O.Effect>, actions: List<&2, R.Action>) -> R.State<World>:
  match request:
    case T.Request{_, _, operation}:
      response(World, respond(operation, world), request, step, observe, invocation, next,
        List.append(&2, O.Effect, effects, O.Invoked{request} <> []),
        List.append(&2, R.Action, actions, R.ServiceInvoked{request} <> []))

def ready(-World: Data, +step: L.Continuation,
    respond: T.Operation -> World -> R.ProviderResponse<World>,
    observe: T.ExceptionToken -> World -> O.Error, invocation: Nat, next: Nat,
    world: World, effects: List<&2, O.Effect>, actions: List<&2, R.Action>) -> R.State<World>:
  match step:
    case L.ServiceStep{T.AwaitService{_, request}}:
      request_response(
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
    case _: publish(World, step, observe, invocation, next, world, effects, actions)

def advance(-World: Data, +state: R.State<World>,
    respond: T.Operation -> World -> R.ProviderResponse<World>,
    observe: T.ExceptionToken -> World -> O.Error) -> R.State<World>:
  match state:
    case R.State{invocation, R.RuntimeOpen{}, R.RuntimeReady{step}, None{}, next,
        E.WorldState{world, effects}, actions}:
      ready(World, step, respond, observe, invocation, next, world, effects, actions)
    case _: state

def stopped(+execution: R.Execution) -> R.Execution:
  match execution:
    case R.RuntimeReady{step}: R.RuntimeCancelled{step}
    case R.RuntimeWaiting{step}: R.RuntimeCancelled{step}
    case _: execution

def cancellation(-World: Data, matches: Bool, +state: R.State<World>) -> R.State<World>:
  match matches state:
    case True{} R.State{+invocation, R.RuntimeOpen{}, execution, provider, next,
        E.WorldState{world, effects}, actions}:
      R.State{invocation, R.RuntimeClosed{}, stopped(execution), provider, next,
        E.WorldState{world, List.append(&2, O.Effect, effects,
          O.CancelledInvocation{invocation} <> [])},
        List.append(&2, R.Action, actions,
          R.CancellationObserved{invocation} <> R.RegistryClosed{invocation} <> [])}
    case _ _: state

def cancel(-World: Data, +state: R.State<World>, actual: Nat) -> R.State<World>:
  match state:
    case R.State{invocation, _, _, _, _, _, _}:
      cancellation(World, Nat.is_eq(invocation, actual), state)

# This row only specifies malformed raw combinations; reachable executions
# enter completion with Waiting/Open or Cancelled/Closed and a pending lease.
def closed_raw(-World: Data, state: R.State<World>) -> R.State<World>:
  match state:
    case R.State{invocation, _, execution, provider, next, world, actions}:
      R.State{invocation, R.RuntimeClosed{}, execution, provider, next, world, actions}

def cancelled_completion(
  -World: Data,
  +execution: R.Execution,
  +state: R.State<World>,
  invocation: Nat,
  next: Nat,
  world: World,
  effects: List<&2, O.Effect>,
  nested: List<&2, O.Effect>,
  actions: List<&2, R.Action>,
  actual: O.ProviderLease
) -> R.State<World>:
  match execution:
    case R.RuntimeCancelled{_}:
      R.State{invocation, R.RuntimeClosed{}, execution, None{}, next,
        E.WorldState{world, List.append(&2, O.Effect, effects, nested)},
        List.append(&2, R.Action, actions, R.ProviderRetired{actual} <> [])}
    case _: closed_raw(World, state)

def accepted_completion(-World: Data, matches: Bool, +state: R.State<World>,
    +completion: E.Completion<World>,
    observe: T.ExceptionToken -> World -> O.Error) -> R.State<World>:
  match matches state completion:
    case True{} R.State{invocation, _, R.RuntimeWaiting{step},
        Some{R.RuntimeProvider{request, expected}}, next, E.WorldState{_, effects}, actions}
        E.Completion{_, world, outcome, nested}:
      +reply = E.stamp(request, outcome)
      publish(World, M.resume(step, T.ServiceReply{reply}), observe, invocation, next, world,
        List.append(&2, O.Effect, effects,
          List.append(&2, O.Effect, nested, O.Responded{reply} <> [])),
        List.append(&2, R.Action, actions,
          R.ProviderRetired{expected} <> R.ServiceResumed{reply} <> []))
    case True{} R.State{invocation, _, +execution, Some{_}, next,
        E.WorldState{_, effects}, actions} E.Completion{actual, world, _, nested}:
      cancelled_completion(
        World,
        execution,
        state,
        invocation,
        next,
        world,
        effects,
        nested,
        actions,
        actual
      )
    case _ _ _: state

def completion(-World: Data, +state: R.State<World>, +completion: E.Completion<World>,
    observe: T.ExceptionToken -> World -> O.Error) -> R.State<World>:
  match state completion:
    case R.State{_, _, _, Some{R.RuntimeProvider{_, expected}}, _, _, _}
        E.Completion{actual, _, _, _}:
      accepted_completion(World, E.same_lease(expected, actual), state, completion, observe)
    case _ _: state

def event(-World: Data, state: R.State<World>, item: R.RuntimeEvent<World>,
    respond: T.Operation -> World -> R.ProviderResponse<World>,
    observe: T.ExceptionToken -> World -> O.Error) -> R.State<World>:
  match item:
    case R.RuntimeAdvance{}: advance(World, state, respond, observe)
    case R.RuntimeCancel{invocation}: cancel(World, state, invocation)
    case R.RuntimeComplete{value}: completion(World, state, value, observe)

def run_events(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error,
    events: List<&2, R.RuntimeEvent<World>>, state: R.State<World>) -> R.State<World>:
  match events:
    case []: state
    case head <> tail:
      run_events(~World, ~respond, ~observe, tail, event(World, state, head, respond, observe))

def main() -> Unit:
  Unit{}
