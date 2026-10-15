import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Joint.bend as J
import ./JointStep.bend as Step

# Bootstrap the actual root-entry queue, with no assumed Spec success,
# caller budget or trace premise.
law initial_root:
  for +root: M.Declaration
  for +invocation: C.Global
  Step.valid(root, invocation, [],
    C.start_root(M.traversal_inventory(root, C.global_catalog(invocation)), invocation, root),
    [J.initial_ghost(root, C.global_catalog(invocation))])

# One actual Core transition, including matching Ack and exact emitted trace,
# preserves a successful root path. Invalid/exhausted states are Empty in
# Step.valid. Required successor budgets follow from the invariant itself.
law step_preserves:
  for +root: M.Declaration
  for +invocation: C.Global
  for +reversed: List<&2, M.Op>
  for +step: C.Step
  for +ghosts: List<&2, J.Ghost>
  for valid: Step.valid(root, invocation, reversed, step, ghosts)
  Exists(List<&2, J.Ghost>, next =>
    Step.valid(root, invocation, Step.record(step, reversed), Step.advance(step), next))

def main() -> Unit:
  Unit{}
