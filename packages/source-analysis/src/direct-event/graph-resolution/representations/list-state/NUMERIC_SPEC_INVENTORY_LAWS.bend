import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_SUPPORT_LAWS.bend as Weight
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure

# Supporting rank transport for the whole recursive graph, not a migration unit.
# Retaining a visited membership cannot increase its unseen reference weight.
law retained_weight_nonincreasing:
  for +before: Bool
  for +after: Bool
  for +amount: Nat
  for retains: {before == True{} : Bool} -> {after == True{} : Bool}
  {Nat.is_le(Weight.weight(after, amount), Weight.weight(before, amount)) == True{} : Bool}

# Actual interpretation preserves every declaration's structural unseen weight.
# Includes zero fuel, partial failures, duplicate identities and arbitrary caches.
law interpret_declaration_weight_nonincreasing:
  for +fuel: Nat
  for +request: Spec.Request
  for +declaration: Maybe<&2, Core.Declaration>
  {
    Nat.is_le(
      Rank.unseen_declaration(
        Measure.visited(Measure.result_state(Spec.interpret(fuel, request))),
        declaration
      ),
      Rank.unseen_declaration(Measure.visited(Measure.request_state(request)), declaration)
    )
    == True{}
    : Bool
  }

# Shared state returned by any child cannot increase the entire raw catalog weight.
# This is the sibling rank transport needed by full interpreter completion.
law interpret_catalog_weight_nonincreasing:
  for +fuel: Nat
  for +request: Spec.Request
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  {
    Nat.is_le(
      Rank.unseen_catalog(
        Measure.visited(Measure.result_state(Spec.interpret(fuel, request))),
        catalog
      ),
      Rank.unseen_catalog(Measure.visited(Measure.request_state(request)), catalog)
    )
    == True{}
    : Bool
  }
