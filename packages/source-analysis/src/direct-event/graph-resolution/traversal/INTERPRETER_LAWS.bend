import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RANK.bend as Rank
import ./INTERPRETER_MEASURE.bend as Measure
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Entire actual independent interpreter, including partial failures. The catalog
# being measured is arbitrary; no catalog routing or uniqueness premise is used.
law interpret_preserves_inventory:
  for +fuel: Nat
  for +request: Spec.Request
  for +catalog: Map<&2, Maybe<&2, Core.Declaration>>
  for valid: {
    Patricia.canonical(Bool, Measure.visited(Measure.request_state(request))) == True{} : Bool
  }
  {
    Bool.and(
      Patricia.canonical(
        Bool,
        Measure.visited(Measure.result_state(Spec.interpret(fuel, request)))
      ),
      Nat.is_le(
        Rank.unseen_catalog(
          Measure.visited(Measure.result_state(Spec.interpret(fuel, request))),
          catalog
        ),
        Rank.unseen_catalog(Measure.visited(Measure.request_state(request)), catalog)
      )
    )
    == True{}
    : Bool
  }

# Adequate independent request rank completes both interpretation and the full
# flatten projection of its actual result, at the same fuel. No tree-size premise.
law interpret_and_flatten_complete:
  for +fuel: Nat
  for +request: Spec.Request
  for valid: {
    Patricia.canonical(Bool, Measure.visited(Measure.request_state(request))) == True{} : Bool
  }
  for enough: {Nat.is_le(Measure.request_rank(request), fuel) == True{} : Bool}
  {
    Measure.projected_success(fuel, request, Spec.interpret(fuel, request)) == True{} : Bool
  }
