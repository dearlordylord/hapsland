import Base
import ./core.bend as Core
import ./Own.bend as Own

# Full catalog inventory bound remains unchanged, including raw malformed tries.
law direct_inventory_exact:
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  {Core.trie_reference_count(catalog)
    == Core.catalog_reference_count(Own.values(Maybe<&2, Core.Declaration>, catalog)) : Nat}

# Supporting list lemma; does not assert DFS completion or String bridge.
law reference_inventory_append_exact:
  for +left: List<&2, Maybe<&2, Core.Declaration>>
  for +right: List<&2, Maybe<&2, Core.Declaration>>
  {Core.catalog_reference_count(List.append(&2, Maybe<&2, Core.Declaration>, left, right))
    == (Core.catalog_reference_count(left) + Core.catalog_reference_count(right) : Nat) : Nat}
