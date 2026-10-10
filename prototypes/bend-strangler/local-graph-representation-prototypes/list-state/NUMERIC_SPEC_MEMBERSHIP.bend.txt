import Base
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure

# Membership transport for the entire independent recursive interpreter.
def reference_state(result: Spec.ReferenceResult) -> Spec.State:
  match result:
    case Spec.ReferenceResult{state, _}: state
    case Spec.ReferenceFailure{state}: state

def reference_visited(result: Spec.ReferenceResult) -> Own.Dictionary<Bool>:
  Measure.visited(reference_state(result))

def member(state: Spec.State, identity: Nat) -> Bool:
  Own.contains(Bool, Measure.visited(state), identity)

def reference_member(result: Spec.ReferenceResult, identity: Nat) -> Bool:
  member(reference_state(result), identity)

def request_member(request: Spec.Request, identity: Nat) -> Bool:
  member(Measure.request_state(request), identity)

def result_member(result: Spec.DispatchResult, identity: Nat) -> Bool:
  member(Measure.result_state(result), identity)

def contract(+fuel: Nat, +identity: Nat) -> Type:
  @+request: Spec.Request ->
  {request_member(request, identity) == True{} : Bool} ->
  {result_member(Spec.interpret(fuel, request), identity) == True{} : Bool}
