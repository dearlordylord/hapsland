import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./TREE_MACHINE_RELATION.bend as Relation

# Any amount of recursive fuel preserves all existing visited memberships.
# Failure carries partial state; it must not forget a previously visited key.
law interpret_preserves_visited:
  for fuel: Nat
  for +request: Spec.Request
  for +identity: Nat
  for present: {
    Own.contains(Bool, Measure.visited(Measure.request_state(request)), identity)
    == True{} : Bool
  }
  {
    Own.contains(
      Bool,
      Measure.visited(Measure.result_state(Spec.interpret(fuel, request))),
      identity
    )
    == True{}
    : Bool
  }

# Every raw recursive request completes when its independent measure fits fuel.
law interpret_completes_from_rank:
  for +fuel: Nat
  for +request: Spec.Request
  for enough: {Nat.is_le(Measure.request_rank(request), fuel) == True{} : Bool}
  {Measure.successful(Spec.interpret(fuel, request)) == True{} : Bool}

# The original declared whole-source bound covers seen and unseen roots alike.
law initial_rank_within_original_bound:
  for +facts: Core.Facts
  for name: Core.Label
  for expected: Core.ExpectedKind
  for visited: Own.Dictionary<Bool>
  {
    Nat.is_le(Measure.root_rank(facts, name, expected, visited), Relation.spec_bound(facts))
    == True{} : Bool
  }
