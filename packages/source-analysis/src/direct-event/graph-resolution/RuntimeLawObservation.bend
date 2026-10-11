import Base
import ./RuntimeModel.bend as R
import ./Types.bend as T
import ./WholeObservation.bend as O
import ./Environment.bend as E

# Machine-owned actions are separate from provider retirement. Late provider
# world/effects and retirement remain legal after machine cancellation.
type MachineObservation is Data:
  MachineObservation{invocation: Nat, registry: R.Registry, execution: R.Execution,
    next_lease: Nat, actions: List<&2, R.Action>}

def machine_actions(actions: List<&2, R.Action>) -> List<&2, R.Action>:
  match actions:
    case []: []
    case R.ProviderRetired{_} <> tail: machine_actions(tail)
    case head <> tail: head <> machine_actions(tail)

def machine(-World: Data, state: R.State<World>) -> MachineObservation:
  match state:
    case R.State{invocation, registry, execution, _, next, _, actions}:
      MachineObservation{invocation, registry, execution, next, machine_actions(actions)}

def input_invocation(input: T.ResolverInput) -> Nat:
  match input:
    case T.ResolverInput{invocation, _, _, _, _, _, _, _, _}: invocation

def cancelled_prefix(~World: Data,
    ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error,
    +input: T.ResolverInput, world: World,
    prefix: List<&2, R.RuntimeEvent<World>>) -> R.State<World>:
  R.cancel(World, R.run_events(~World, ~respond, ~observe, prefix,
    R.initial(World, input, world)), input_invocation(input))

def cancelled_suffix(~World: Data,
    ~respond: T.Operation -> World -> R.ProviderResponse<World>,
    ~observe: T.ExceptionToken -> World -> O.Error,
    input: T.ResolverInput, world: World,
    prefix: List<&2, R.RuntimeEvent<World>>,
    suffix: List<&2, R.RuntimeEvent<World>>) -> R.State<World>:
  R.run_events(~World, ~respond, ~observe, suffix,
    cancelled_prefix(~World, ~respond, ~observe, input, world, prefix))

def actions(-World: Data, state: R.State<World>) -> List<&2, R.Action>:
  match state:
    case R.State{_, _, _, _, _, _, actions}: actions

def provider(-World: Data, state: R.State<World>) -> Maybe<&2, R.RuntimeProvider>:
  match state:
    case R.State{_, _, _, provider, _, _, _}: provider

def completion_matches(-World: Data, item: R.RuntimeEvent<World>, lease: O.ProviderLease) -> Bool:
  match item:
    case R.RuntimeComplete{E.Completion{actual, _, _, _}}: E.same_lease(lease, actual)
    case _: False{}

def retirement_row(~World: Data, matches: Bool, lease: O.ProviderLease,
    later: List<&2, R.Action>) -> List<&2, R.Action>:
  match matches:
    case True{}: R.ProviderRetired{lease} <> []
    case False{}: later

def retirement_for_lease(~World: Data, events: List<&2, R.RuntimeEvent<World>>,
    +lease: O.ProviderLease) -> List<&2, R.Action>:
  match events:
    case []: []
    case head <> tail:
      retirement_row(~World, completion_matches(World, head, lease), lease,
        retirement_for_lease(~World, tail, lease))

def retirement_suffix(~World: Data, events: List<&2, R.RuntimeEvent<World>>,
    pending: Maybe<&2, R.RuntimeProvider>) -> List<&2, R.Action>:
  match pending:
    case None{}: []
    case Some{R.RuntimeProvider{_, lease}}: retirement_for_lease(~World, events, lease)

def main() -> Unit:
  Unit{}
