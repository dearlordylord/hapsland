import Base
import ./RuntimeModel.bend as R
import ./RuntimeInvariant.bend as Invariant
import ./Types.bend as T
import ./WholeObservation.bend as O
import ./RuntimeLawObservation.bend as Observation

# PROPOSAL: minimal supporting lifecycle statements; awaiting Astra approval.
# Raw malformed states remain covered by the existing exact scheduler rows.
law invocation_step_preserved:
  for ~World: Data
  for ~respond: T.Operation -> World -> R.ProviderResponse<World>
  for ~observe: T.ExceptionToken -> World -> O.Error
  for +state: R.State<World>
  for item: R.RuntimeEvent<World>
  {Invariant.invocation(World, R.event(World, state, item, respond, observe))
    == Invariant.invocation(World, state) : Nat}

law valid_step_preserved:
  for ~World: Data
  for ~respond: T.Operation -> World -> R.ProviderResponse<World>
  for ~observe: T.ExceptionToken -> World -> O.Error
  for +state: R.State<World>
  for item: R.RuntimeEvent<World>
  for valid: {True{} == Invariant.valid(World, state) : Bool}
  {True{} == Invariant.valid(World, R.event(World, state, item, respond, observe)) : Bool}

law initialized_prefix_valid:
  for ~World: Data
  for ~respond: T.Operation -> World -> R.ProviderResponse<World>
  for ~observe: T.ExceptionToken -> World -> O.Error
  for input: T.ResolverInput
  for world: World
  for events: List<&2, R.RuntimeEvent<World>>
  {True{} == Invariant.valid(World,
    R.run_events(~World, ~respond, ~observe, events, R.initial(World, input, world))) : Bool}

law initialized_prefix_invocation:
  for ~World: Data
  for ~respond: T.Operation -> World -> R.ProviderResponse<World>
  for ~observe: T.ExceptionToken -> World -> O.Error
  for +input: T.ResolverInput
  for world: World
  for events: List<&2, R.RuntimeEvent<World>>
  {Invariant.invocation(World,
    R.run_events(~World, ~respond, ~observe, events, R.initial(World, input, world)))
    == Observation.input_invocation(input) : Nat}

law matching_cancel_frozen:
  for ~World: Data
  for +state: R.State<World>
  for valid: {True{} == Invariant.valid(World, state) : Bool}
  {True{} == Invariant.frozen(World,
    R.cancel(World, state, Invariant.invocation(World, state))) : Bool}
