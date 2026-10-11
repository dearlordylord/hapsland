import Base
import ./Types.bend as T
import ./RuntimeModel.bend as R
import ./RuntimeSpecification.bend as Specification
import ./RuntimeLawObservation.bend as Observation
import ./WholeObservation.bend as O

# PROPOSAL: exact statements awaiting Astra approval; no proofs begun.
# Every one-step row is exact, including foreign/duplicate identity, matching
# completion once, arbitrary nested effects, and error observation before close.
# Raw-state correspondence does not assert malformed states are reachable.
law scheduler_step_exact:
  for ~World: Data
  for ~respond: T.Operation -> World -> R.ProviderResponse<World>
  for ~observe: T.ExceptionToken -> World -> O.Error
  for +state: R.State<World>
  for +item: R.RuntimeEvent<World>
  {R.event(World, state, item, respond, observe)
    == Specification.event(World, state, item, respond, observe) : R.State<World>}

# Entire finite prefixes preserve the complete state, world and ordered traces;
# neither interpreter is fed an expected graph-query script.
law scheduler_prefix_exact:
  for ~World: Data
  for ~respond: T.Operation -> World -> R.ProviderResponse<World>
  for ~observe: T.ExceptionToken -> World -> O.Error
  for +input: T.ResolverInput
  for +world: World
  for +events: List<&2, R.RuntimeEvent<World>>
  {R.run_events(~World, ~respond, ~observe, events, R.initial(World, input, world))
    == Specification.run_events(~World, ~respond, ~observe, events,
      Specification.initial(World, input, world)) : R.State<World>}

# Matching cancellation after any reachable prefix fences every later suffix.
# Provider world/effects and lease retirement may still change; machine state,
# allocation counter and machine-owned actions (including close) cannot change.
law cancellation_suffix_machine_fenced:
  for ~World: Data
  for ~respond: T.Operation -> World -> R.ProviderResponse<World>
  for ~observe: T.ExceptionToken -> World -> O.Error
  for +input: T.ResolverInput
  for +world: World
  for +prefix: List<&2, R.RuntimeEvent<World>>
  for suffix: List<&2, R.RuntimeEvent<World>>
  {Observation.machine(World,
      Observation.cancelled_suffix(~World, ~respond, ~observe, input, world, prefix, suffix))
    == Observation.machine(World,
      Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix))
    : Observation.MachineObservation}

# Preserve every original action byte-for-byte. After cancellation the only
# possible appended action is the pending lease's first matching retirement;
# foreign and duplicate completions cannot delete history or retire twice.
law cancellation_suffix_actions_exact:
  for ~World: Data
  for ~respond: T.Operation -> World -> R.ProviderResponse<World>
  for ~observe: T.ExceptionToken -> World -> O.Error
  for +input: T.ResolverInput
  for +world: World
  for +prefix: List<&2, R.RuntimeEvent<World>>
  for +suffix: List<&2, R.RuntimeEvent<World>>
  {Observation.actions(World,
      Observation.cancelled_suffix(~World, ~respond, ~observe, input, world, prefix, suffix))
    == List.append(&2, R.Action,
      Observation.actions(World,
        Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix)),
      Observation.retirement_suffix(~World, suffix,
        Observation.provider(World,
          Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix))))
    : List<&2, R.Action>}
