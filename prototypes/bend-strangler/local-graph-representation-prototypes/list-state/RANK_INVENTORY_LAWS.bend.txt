import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_SUPPORT_LAWS.bend as Support

# Each selected contribution is bounded by its full structural weight.
law weight_bounded:
  for +seen: Bool
  for +amount: Nat
  {Nat.is_le(Support.weight(seen, amount), amount) == True{} : Bool}

# A declaration contributes at most its full reference count.
law unseen_declaration_bounded:
  for visited: Own.Dictionary<Bool>
  for +declaration: Maybe<&2, Core.Declaration>
  {
    Nat.is_le(
      Rank.unseen_declaration(visited, declaration),
      Core.declaration_reference_count(declaration)
    )
    == True{}
    : Bool
  }

# All unseen contributions fit the complete raw catalog weight.
law unseen_catalog_bounded:
  for +visited: Own.Dictionary<Bool>
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  {
    Nat.is_le(Rank.unseen_catalog(visited, catalog), Core.trie_reference_count(catalog))
    == True{}
    : Bool
  }

# Inserting a declaration identity removes that declaration's entire weight.
# This holds even when the identity was already present.
law unseen_insert_selected_zero:
  for +visited: Own.Dictionary<Bool>
  for +declaration: Core.Declaration
  {
    Rank.unseen_declaration(
      Own.set(Bool, visited, Core.declaration_identity(declaration), True{}),
      Some{declaration}
    )
    == 0n
    : Nat
  }
