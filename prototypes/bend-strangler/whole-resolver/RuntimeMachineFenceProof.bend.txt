import Base
import ./RuntimeModel.bend as R
import ./RuntimeInvariant.bend as I
import ./RuntimeInvocationProof.bend as Invocation
import ./RuntimeValidityProof.bend as Validity
import ./RuntimeCancellationPhaseProof.bend as Cancellation
import ./RuntimeLawObservation.bend as Observation
import ./Types.bend as T
import ./Loop.bend as L
import ./Environment.bend as E
import ./WholeObservation.bend as O

# Exact original cancellation prefix; arbitrary providers and finite prefixes.
import ./RuntimeFrozenRowsProof.bend as Rows

def prefix_frozen(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
 ~observe: T.ExceptionToken -> World -> O.Error, +input: T.ResolverInput, +world: World,
 +prefix: List<&2, R.RuntimeEvent<World>>) -> {
   True{}
   == I.frozen(
     World,
     Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix)
   )
   : Bool
 }:
  %Invocation.initialized_inv(~World, ~respond, ~observe, input, world, prefix) : {
    True{}
    == I.frozen(
      World,
      R.cancel(
        World,
        R.run_events(~World, ~respond, ~observe, prefix, R.initial(World, input, world)),
        _
      )
    )
    : Bool
  }
  Cancellation.matching_cancel_frozen(~World,
    R.run_events(~World, ~respond, ~observe, prefix, R.initial(World, input, world)),
    Validity.initialized_valid(~World, ~respond, ~observe, input, world, prefix))

def cancellation_suffix_machine_fenced(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +input: T.ResolverInput,
  +world: World,
  +prefix: List<&2, R.RuntimeEvent<World>>,
  suffix: List<&2, R.RuntimeEvent<World>>
) -> {
   Observation.machine(
     World,
     Observation.cancelled_suffix(~World, ~respond, ~observe, input, world, prefix, suffix)
   )
   == Observation.machine(
     World,
     Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix)
   )
   : Observation.MachineObservation
 }:
  Rows.suffix_machine(
    ~World,
    ~respond,
    ~observe,
    suffix,
    Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix),
    prefix_frozen(~World, ~respond, ~observe, input, world, prefix)
  )

def main() -> Unit:
  Unit{}
