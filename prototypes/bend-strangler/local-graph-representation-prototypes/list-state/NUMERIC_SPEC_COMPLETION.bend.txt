import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure

# Actual full recursive completion contracts, not alternative interpreter semantics.
def reference_success(result: Spec.ReferenceResult) -> Bool:
  match result:
    case Spec.ReferenceResult{_, _}: True{}
    case Spec.ReferenceFailure{_}: False{}

def allowance(facts: Core.Facts, state: Spec.State) -> Nat:
  (3n * Measure.unseen(facts, Measure.visited(state)) + 3n : Nat)

def contract(+fuel: Nat) -> Type:
  @+request: Spec.Request ->
  {Nat.is_le(Measure.request_rank(request), fuel) == True{} : Bool} ->
  {Measure.successful(Spec.interpret(fuel, request)) == True{} : Bool}
