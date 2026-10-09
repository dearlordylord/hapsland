import Base
import ./core.bend as Core

# These inventory bounds require no Patricia routing invariant: lookup either
# returns the None default or a value of a leaf it actually visits.
def inventory(catalog: Map<&2, Maybe<&2, Core.Declaration>>) -> Nat:
  match catalog:
    case MTip{}: 0n
    case MLeaf{_, value}: Core.declaration_reference_count(value)
    case MNode{_, lo, hi}: (inventory(lo) + inventory(hi) : Nat)

def lookup_weight(catalog: Map<&2, Maybe<&2, Core.Declaration>>, key: String) -> Nat:
  Core.declaration_reference_count(Core.map_result(Maybe<&2, Core.Declaration>,
    Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, key)))

# The production bound counts every leaf's reference inventory exactly once.
law catalog_inventory_exact:
  for +catalog: Map<&2, Maybe<&2, Core.Declaration>>
  {Core.catalog_reference_count(Map.values(&2, Maybe<&2, Core.Declaration>, catalog))
    == inventory(catalog) : Nat}

# A selected declaration's cost is bounded by the total catalog inventory.
# This is a supporting bound, not the proof that each identity expands once.
law lookup_inventory_bounded:
  for +catalog: Map<&2, Maybe<&2, Core.Declaration>>
  for key: String
  {Nat.is_le(lookup_weight(catalog, key), inventory(catalog)) == True{} : Bool}

# Accumulator form makes the structural Map.values induction compositional.
law catalog_inventory_accumulator_exact:
  for +catalog: Map<&2, Maybe<&2, Core.Declaration>>
  for +acc: List<&2, Maybe<&2, Core.Declaration>>
  {Core.catalog_reference_count(Map.values.go(&2, Maybe<&2, Core.Declaration>, catalog, acc))
    == (inventory(catalog) + Core.catalog_reference_count(acc) : Nat) : Nat}

# Reattaching a traversal result to either sibling preserves its returned value.
def result_weight(
  result: Map<&2, Maybe<&2, Core.Declaration>> & Maybe<&2, Core.Declaration>
) -> Nat:
  Core.declaration_reference_count(Core.map_result(Maybe<&2, Core.Declaration>, result))

law left_reconstruction_weight_exact:
  for position: Nat
  for sibling: Map<&2, Maybe<&2, Core.Declaration>>
  for result: Map<&2, Maybe<&2, Core.Declaration>> & Maybe<&2, Core.Declaration>
  {
    result_weight(
      Map.lo(
        &2,
        Maybe<&2, Core.Declaration>,
        Maybe<&2, Core.Declaration>,
        position,
        sibling,
        result
      )
    )
    == result_weight(result)
    : Nat
  }

law right_reconstruction_weight_exact:
  for position: Nat
  for sibling: Map<&2, Maybe<&2, Core.Declaration>>
  for result: Map<&2, Maybe<&2, Core.Declaration>> & Maybe<&2, Core.Declaration>
  {
    result_weight(
      Map.hi(
        &2,
        Maybe<&2, Core.Declaration>,
        Maybe<&2, Core.Declaration>,
        position,
        sibling,
        result
      )
    )
    == result_weight(result)
    : Nat
  }

# The equality branch returns this leaf; other comparisons return None.
law leaf_lookup_inventory_bounded:
  for +value: Maybe<&2, Core.Declaration>
  for comparison: (String & String) & Cmp
  {Nat.is_le(result_weight(Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, comparison)),
    Core.declaration_reference_count(value)) == True{} : Bool}

# Any chosen bit takes one actual subtree or returns None, even in a malformed Map.
law routed_lookup_inventory_bounded:
  for +catalog: Map<&2, Maybe<&2, Core.Declaration>>
  for route: String & Bool
  {Nat.is_le(result_weight(Map.get.go(Maybe<&2, Core.Declaration>, catalog, None{}, route)),
    inventory(catalog)) == True{} : Bool}
