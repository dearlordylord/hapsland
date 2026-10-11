import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./RANK.bend as Rank
import ./MAP_WEIGHT_LAWS.bend as Weight
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Actual selected-child expansion removes at least its reference inventory.
# Only visited routing is required; the catalog may be any raw finite Map.
# Boundary identities are canonical, and actual insertion preserves canonicality.
law selected_child_inventory_decrease:
  for +catalog: Map<&2, Maybe<&2, Core.Declaration>>
  for +visited: Map<&2, Bool>
  for +key: String
  for +declaration: Core.Declaration
  for valid: {Patricia.canonical(Bool, visited) == True{} : Bool}
  for selected: {
    Core.map_result(Maybe<&2, Core.Declaration>,
      Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, key))
    == Some{declaration} : Maybe<&2, Core.Declaration>
  }

  for absent: {
    CoreTraversal.has_identity(visited, CoreTraversal.declaration_identity(declaration)) == False{} : Bool
  }
  {
    Nat.is_le(
      (Rank.unseen_catalog(
        Map.set(&2, Bool, visited, CoreTraversal.declaration_identity(declaration), True{}), catalog
      ) + CoreTraversal.declaration_reference_count(Some{declaration}) : Nat),
      Rank.unseen_catalog(visited, catalog)
    ) == True{} : Bool
  }

# Root entry is unconditional once lookup succeeds, including already-seen roots.
# Charge its references against the complete raw catalog inventory.
law selected_root_inventory_bound:
  for +catalog: Map<&2, Maybe<&2, Core.Declaration>>
  for +visited: Map<&2, Bool>
  for +key: String
  for +declaration: Core.Declaration
  for valid: {Patricia.canonical(Bool, visited) == True{} : Bool}
  for selected: {
    Core.map_result(Maybe<&2, Core.Declaration>,
      Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, key))
    == Some{declaration} : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      (Rank.unseen_catalog(
        Map.set(&2, Bool, visited, CoreTraversal.declaration_identity(declaration), True{}), catalog
      ) + CoreTraversal.declaration_reference_count(Some{declaration}) : Nat),
      Weight.inventory(catalog)
    ) == True{} : Bool
  }
