import Base
import ./Types.bend as T
import ./Loop.bend as Loop
import ./Machine.bend as Machine
import ./State.bend as S
import ./Environment.bend as E
import ./WholeObservation.bend as O

# Fixed pure runtime model, outside the production implementation. The graph
# machine is unchanged. Registry lifetime and a suspended provider's lifetime
# are separate: cancellation closes the former, not the latter by invention.
# Provider-owned late effects remain world data. This model fences machine
# resumes and publications; it does not prove descriptor or buffer cleanup.
type Registry is Data:
  RuntimeOpen{}
  RuntimeClosed{}

type Execution is Data:
  RuntimeReady{step: Loop.Continuation}
  RuntimeWaiting{step: Loop.Continuation}
  RuntimeReturned{step: Loop.Continuation, error: Maybe<&2, O.Error>}
  RuntimeCancelled{step: Loop.Continuation}

type RuntimeProvider is Data:
  RuntimeProvider{request: T.Request, lease: O.ProviderLease}

type ProviderResponse<-World: Data> is Data:
  ProviderReturned{world: World, outcome: T.ServiceOutcome, effects: List<&2, O.Effect>}
  ProviderSuspended{world: World, effects: List<&2, O.Effect>}

type Action is Data:
  ServiceInvoked{request: T.Request}
  ServiceResumed{reply: T.Reply}
  ProviderRetired{lease: O.ProviderLease}
  CancellationObserved{invocation: Nat}
  ExceptionObserved{exception: T.ExceptionToken, error: O.Error}
  RegistryClosed{invocation: Nat}

type State<-World: Data> is Data:
  State{
    invocation: Nat,
    registry: Registry,
    execution: Execution,
    provider: Maybe<&2, RuntimeProvider>,
    next_lease: Nat,
    world: E.WorldState<World>,
    actions: List<&2, Action>
  }

type RuntimeEvent<-World: Data> is Data:
  RuntimeAdvance{}
  RuntimeCancel{invocation: Nat}
  RuntimeComplete{completion: E.Completion<World>}

def actions_append(actions: List<&2, Action>, action: Action) -> List<&2, Action>:
  List.append(&2, Action, actions, action <> [])

def world_value(-World: Data, +world: E.WorldState<World>) -> World:
  match world:
    case E.WorldState{value, _}: value

def world_effects(-World: Data, +world: E.WorldState<World>) -> List<&2, O.Effect>:
  match world:
    case E.WorldState{_, effects}: effects

def initial(-World: Data, +input: T.ResolverInput, world: World) -> State<World>:
  State{S.input_invocation(input), RuntimeOpen{}, RuntimeReady{Machine.initial(input)}, None{}, 1n,
    E.WorldState{world, []}, []}

def returned(-World: Data, step: Loop.Continuation, failure: Maybe<&2, T.ExceptionToken>,
    observe: T.ExceptionToken -> World -> O.Error, +invocation: Nat, next_lease: Nat,
    +world: E.WorldState<World>, actions: List<&2, Action>) -> State<World>:
  match failure:
    case None{}: State{
      invocation,
      RuntimeClosed{},
      RuntimeReturned{step, None{}},
      None{},
      next_lease,
      world,
      actions_append(actions, RegistryClosed{invocation})
    }
    case Some{+exception}:
      +error = observe(exception, world_value(World, world))
      State{
        invocation,
        RuntimeClosed{},
        RuntimeReturned{step, Some{error}},
        None{},
        next_lease,
        world,
        actions_append(
          actions_append(actions, ExceptionObserved{exception, error}),
          RegistryClosed{invocation}
        )
      }

def terminal(-World: Data, +step: Loop.Continuation,
    observe: T.ExceptionToken -> World -> O.Error, +invocation: Nat, next_lease: Nat,
    +world: E.WorldState<World>, actions: List<&2, Action>) -> State<World>:
  match step:
    case Loop.ServiceStep{T.FailedResolver{T.ForeignProviderFailure{exception}}}:
      returned(World, step, Some{exception}, observe, invocation, next_lease, world, actions)
    case _: returned(World, step, None{}, observe, invocation, next_lease, world, actions)

# A reply is resumed and terminalized in the same synchronous runtime step.
# External cancellation cannot replace an already returned terminal/error.
def resumed(-World: Data, +step: Loop.Continuation,
    observe: T.ExceptionToken -> World -> O.Error, +invocation: Nat, next_lease: Nat,
    world: E.WorldState<World>, actions: List<&2, Action>) -> State<World>:
  match step:
    case Loop.ServiceStep{T.AwaitService{_, _}}:
      State{invocation, RuntimeOpen{}, RuntimeReady{step}, None{}, next_lease, world, actions}
    case _: terminal(World, step, observe, invocation, next_lease, world, actions)

def delivered(-World: Data, +reply: T.Reply, step: Loop.Continuation,
    observe: T.ExceptionToken -> World -> O.Error, invocation: Nat, next_lease: Nat,
    world: E.WorldState<World>, actions: List<&2, Action>) -> State<World>:
  resumed(World, Machine.resume(step, T.ServiceReply{reply}), observe,
    invocation, next_lease, world, actions_append(actions, ServiceResumed{reply}))

# Provider functions return values or suspend; they do not choose ownership or
# freshness. Runtime lease IDs use a separate counter from request correlation.
def provider_response(-World: Data, response: ProviderResponse<World>,
    +request: T.Request, +step: Loop.Continuation,
    observe: T.ExceptionToken -> World -> O.Error, +invocation: Nat, +next_lease: Nat,
    effects: List<&2, O.Effect>, actions: List<&2, Action>) -> State<World>:
  match response:
    case ProviderReturned{world, outcome, nested}:
      +reply = E.stamp(request, outcome)
      delivered(World, reply, step, observe, invocation, next_lease,
        E.WorldState{world, List.append(&2, O.Effect,
          List.append(&2, O.Effect, effects, nested), O.Responded{reply} <> [])}, actions)
    case ProviderSuspended{world, nested}:
      State{invocation, RuntimeOpen{}, RuntimeWaiting{step},
        Some{RuntimeProvider{request, O.ProviderLease{invocation, next_lease}}},
        (next_lease + 1n : Nat),
        E.WorldState{world, List.append(&2, O.Effect, effects, nested)}, actions}

def issue(-World: Data, respond: T.Operation -> World -> ProviderResponse<World>,
    +request: T.Request, step: Loop.Continuation,
    observe: T.ExceptionToken -> World -> O.Error, invocation: Nat, next_lease: Nat,
    world: E.WorldState<World>, actions: List<&2, Action>) -> State<World>:
  match request world:
    case T.Request{_, _, operation} E.WorldState{world, effects}:
      provider_response(World, respond(operation, world), request, step, observe,
        invocation, next_lease, List.append(&2, O.Effect, effects, O.Invoked{request} <> []),
        actions_append(actions, ServiceInvoked{request}))

def advance_step(-World: Data, +step: Loop.Continuation,
    respond: T.Operation -> World -> ProviderResponse<World>,
    observe: T.ExceptionToken -> World -> O.Error, +invocation: Nat, next_lease: Nat,
    +world: E.WorldState<World>, actions: List<&2, Action>) -> State<World>:
  match step:
    case Loop.ServiceStep{T.AwaitService{_, +request}}:
      issue(World, respond, request, step, observe, invocation, next_lease, world, actions)
    case _: terminal(World, step, observe, invocation, next_lease, world, actions)

def advance(-World: Data, +state: State<World>,
    respond: T.Operation -> World -> ProviderResponse<World>,
    observe: T.ExceptionToken -> World -> O.Error) -> State<World>:
  match state:
    case State{invocation, RuntimeOpen{}, RuntimeReady{step}, None{}, next_lease, world, actions}:
      advance_step(World, step, respond, observe, invocation, next_lease, world, actions)
    case _: state

def cancellation_execution(+execution: Execution) -> Execution:
  match execution:
    case RuntimeReady{step}: RuntimeCancelled{step}
    case RuntimeWaiting{step}: RuntimeCancelled{step}
    case _: execution

def cancellation(-World: Data, matches: Bool, +state: State<World>) -> State<World>:
  match matches state:
    case True{} State{+invocation, RuntimeOpen{}, execution, provider, next_lease, +world, actions}:
      State{invocation, RuntimeClosed{}, cancellation_execution(execution), provider, next_lease,
        E.WorldState{world_value(World, world), List.append(&2, O.Effect,
          world_effects(World, world), O.CancelledInvocation{invocation} <> [])},
        actions_append(actions_append(actions, CancellationObserved{invocation}),
          RegistryClosed{invocation})}
    case _ _: state

def cancel(-World: Data, +state: State<World>, actual: Nat) -> State<World>:
  match state:
    case State{invocation, _, _, _, _, _, _}:
      cancellation(World, Nat.is_eq(invocation, actual), state)

# A response arriving after cancellation belongs to provider cleanup. Its world
# and effects are retained, while its reply is never passed into Machine.resume.
# Nested provider effects may themselves be arbitrary world observations.
def late_completion(
  -World: Data,
  completion: E.Completion<World>,
  +invocation: Nat,
  next_lease: Nat,
  +execution: Execution,
  +old_world: E.WorldState<World>,
  actions: List<&2, Action>
) -> State<World>:
  match completion:
    case E.Completion{+lease, world, _, nested}: State{invocation, RuntimeClosed{}, execution,
      None{}, next_lease, E.WorldState{world, List.append(&2, O.Effect,
        world_effects(World, old_world), nested)}, actions_append(actions, ProviderRetired{lease})}

def complete_active(-World: Data, completion: E.Completion<World>, request: T.Request,
    step: Loop.Continuation, observe: T.ExceptionToken -> World -> O.Error,
    invocation: Nat, next_lease: Nat, old_world: E.WorldState<World>,
    actions: List<&2, Action>) -> State<World>:
  match completion:
    case E.Completion{_, world, outcome, nested}:
      +reply = E.stamp(request, outcome)
      delivered(World, reply, step, observe, invocation, next_lease,
        E.WorldState{world, List.append(&2, O.Effect,
          List.append(&2, O.Effect, world_effects(World, old_world), nested),
          O.Responded{reply} <> [])}, actions)

def completed_execution(
  -World: Data,
  +execution: Execution,
  +completion: E.Completion<World>,
  +provider: RuntimeProvider,
  +invocation: Nat,
  next_lease: Nat,
  observe: T.ExceptionToken -> World -> O.Error,
  +world: E.WorldState<World>,
  actions: List<&2, Action>
) -> State<World>:
  match execution provider:
    case RuntimeWaiting{+step} RuntimeProvider{request, +lease}:
      complete_active(World, completion, request, step, observe, invocation, next_lease,
        world, actions_append(actions, ProviderRetired{lease}))
    case RuntimeCancelled{_} _:
      late_completion(World, completion, invocation, next_lease, execution, world, actions)
    case _ _: State{
      invocation,
      RuntimeClosed{},
      execution,
      Some{provider},
      next_lease,
      world,
      actions
    }

def completed_owner(-World: Data, matches: Bool, +state: State<World>,
    completion: E.Completion<World>,
    observe: T.ExceptionToken -> World -> O.Error) -> State<World>:
  match matches state:
    case True{} State{invocation, _, execution, Some{provider}, next_lease, world, actions}:
      completed_execution(
        World,
        execution,
        completion,
        provider,
        invocation,
        next_lease,
        observe,
        world,
        actions
      )
    case _ _: state

def complete(-World: Data, +state: State<World>, +completion: E.Completion<World>,
    observe: T.ExceptionToken -> World -> O.Error) -> State<World>:
  match state completion:
    case State{_, _, _, Some{RuntimeProvider{_, expected}}, _, _, _} E.Completion{actual, _, _, _}:
      completed_owner(World, E.same_lease(expected, actual), state, completion, observe)
    case _ _: state

def event(-World: Data, state: State<World>, item: RuntimeEvent<World>,
    respond: T.Operation -> World -> ProviderResponse<World>,
    observe: T.ExceptionToken -> World -> O.Error) -> State<World>:
  match item:
    case RuntimeAdvance{}: advance(World, state, respond, observe)
    case RuntimeCancel{invocation}: cancel(World, state, invocation)
    case RuntimeComplete{completion}: complete(World, state, completion, observe)

# A finite external event prefix is an observation bound, not a production
# request cap and not a termination theorem for the graph machine.
def run_events(~World: Data, ~respond: T.Operation -> World -> ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error,
    events: List<&2, RuntimeEvent<World>>, state: State<World>) -> State<World>:
  match events:
    case []: state
    case head <> tail: run_events(
      ~World,
      ~respond,
      ~observe,
      tail,
      event(World, state, head, respond, observe)
    )

def main() -> Unit:
  Unit{}
