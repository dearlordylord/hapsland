import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_ROOT_RANK.bend as Root

# A declaration is charged exactly once across unseen and seen-root reentry.
law declaration_inventory_partition:
  for +visited: Own.Dictionary<Bool>
  for +declaration: Maybe<&2, Core.Declaration>
  {
    (Rank.unseen_declaration(visited, declaration) + Measure.reentry(visited, declaration) : Nat)
    == Core.declaration_reference_count(declaration) : Nat
  }

# A raw lookup step charges a selected seen head or continues into its suffix.
# The suffix premise is the same bound on a structurally smaller raw catalog.
law lookup_inventory_step:
  for +visited: Own.Dictionary<Bool>
  for +head: Maybe<&2, Core.Declaration>
  for +rest: Own.Dictionary<Maybe<&2, Core.Declaration>>
  for +key: Nat
  for +found: Bool
  for suffix: {
    Nat.is_le(
      (Rank.unseen_catalog(
        visited,
        rest
      ) + Measure.reentry(
        visited,
        Own.lookup(Maybe<&2, Core.Declaration>, None{}, rest, key)
      ) : Nat),
      Core.trie_reference_count(rest)
    )
    == True{}
    : Bool
  }
  {
    Nat.is_le(
      (Rank.unseen_declaration(
        visited,
        head
      ) + Rank.unseen_catalog(
        visited,
        rest
      ) + Measure.reentry(visited, Root.lookup_step(found, head, rest, key)) : Nat),
      (Core.declaration_reference_count(head) + Core.trie_reference_count(rest) : Nat)
    )
    == True{}
    : Bool
  }

# Every raw declaration catalog covers unseen weight plus selected-root reentry.
# No uniqueness, valid cache, positive key or initially unseen-root premise.
law lookup_inventory_bound:
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  for +visited: Own.Dictionary<Bool>
  for +key: Nat
  {
    Nat.is_le(
      (Rank.unseen_catalog(
        visited,
        catalog
      ) + Measure.reentry(
        visited,
        Own.lookup(Maybe<&2, Core.Declaration>, None{}, catalog, key)
      ) : Nat),
      Core.trie_reference_count(catalog)
    )
    == True{}
    : Bool
  }
