import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Execution.bend as E
import ./Joint.bend as J
import ./JointStep.bend as Step
import ./ExecutionMeasure.bend as Measure

# Approved internal supporting obligations. Public root completion retains
# no caller success or fuel premise; its bound is derived from initial_bound.
law decreases:
  for +root: M.Declaration
  for +invocation: C.Global
  for +reversed: List<&2, M.Op>
  for +step: C.Step
  for +ghosts: List<&2, J.Ghost>
  for valid: Step.valid(root, invocation, reversed, step, ghosts)
  for active: {Measure.active(step) == True{} : Bool}
  {Nat.is_le(1n+Measure.measure(Step.advance(step)), Measure.measure(step)) == True{} : Bool}

law positive:
  for +root: M.Declaration
  for +invocation: C.Global
  for +reversed: List<&2, M.Op>
  for +step: C.Step
  for +ghosts: List<&2, J.Ghost>
  for valid: Step.valid(root, invocation, reversed, step, ghosts)
  for active: {Measure.active(step) == True{} : Bool}
  {Nat.is_le(1n, Measure.measure(step)) == True{} : Bool}

law initial_bound:
  for +root: M.Declaration
  for +invocation: C.Global
  {
    Nat.is_le(
      Measure.measure(
        C.start_root(M.traversal_inventory(root, C.global_catalog(invocation)), invocation, root)
      ),
      Nat.sub(E.root_weight(root, C.global_catalog(invocation)), 1n)
    )
    == True{}
    : Bool
  }

def main() -> Unit:
  Unit{}
