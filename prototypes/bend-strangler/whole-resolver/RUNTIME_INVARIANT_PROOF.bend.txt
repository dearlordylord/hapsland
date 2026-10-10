import Base
import ./RUNTIME_INVARIANT_LAWS.bend as Laws
import ./RuntimeCancellationPhaseProof.bend as Cancellation
import ./RuntimeInvocationProof.bend as Invocation
import ./RuntimeValidityProof.bend as Validity

# Original approved owner: all five supporting lifecycle laws are filled.
def Laws.matching_cancel_frozen(World, state, valid):
  Cancellation.matching_cancel_frozen(~World, state, valid)

def Laws.invocation_step_preserved(World, respond, observe, state, item):
  Invocation.step_inv(~World, ~respond, ~observe, state, item)

def Laws.initialized_prefix_invocation(World, respond, observe, input, world, events):
  Invocation.initialized_inv(~World, ~respond, ~observe, input, world, events)

def Laws.valid_step_preserved(World, respond, observe, state, item, valid):
  Validity.step_valid(~World, ~respond, ~observe, state, item, valid)

def Laws.initialized_prefix_valid(World, respond, observe, input, world, events):
  Validity.initialized_valid(~World, ~respond, ~observe, input, world, events)

def main() -> Unit:
  Unit{}
