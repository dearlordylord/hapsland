import Base
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonPlanSpecification.bend as Spec

# Astra-approved whole planner boundary: arbitrary malformed streams included.
# Counts and rope shape are internal proof obligations, never caller premises.
law compile_exact:
  for +operations: List<&2, Plan.Operation>
  {
    Plan.compile(operations) == Spec.compile(operations)
    : Maybe<&2, List<&2, Plan.Piece>>
  }

def main() -> Unit:
  Unit{}
