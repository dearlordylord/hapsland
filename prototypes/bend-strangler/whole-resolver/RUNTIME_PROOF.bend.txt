import Base
import ./RUNTIME_LAWS.bend as Laws
import ./RuntimeCorrespondenceProof.bend as Correspondence
import ./RuntimeMachineFenceProof.bend as Fence
import ./RuntimeHistoryProof.bend as History

def Laws.scheduler_step_exact(World, respond, observe, state, item):
  Correspondence.step_exact(~World, ~respond, ~observe, state, item)

def Laws.scheduler_prefix_exact(World, respond, observe, input, world, events):
  Correspondence.prefix_exact(~World, ~respond, ~observe, input, world, events)

def Laws.cancellation_suffix_machine_fenced(World, respond, observe, input, world, prefix, suffix):
  Fence.cancellation_suffix_machine_fenced(~World, ~respond, ~observe, input, world, prefix, suffix)

def Laws.cancellation_suffix_actions_exact(World, respond, observe, input, world, prefix, suffix):
  History.cancellation_suffix_actions_exact(
    ~World,
    ~respond,
    ~observe,
    input,
    world,
    prefix,
    suffix
  )
def main() -> Unit:
  Unit{}
