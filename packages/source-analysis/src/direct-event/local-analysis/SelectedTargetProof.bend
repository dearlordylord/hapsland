import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Potential.bend as P
import ./SelectedTargetLaws.bend as Laws
import ./WeightedInventory.bend as W
import ./WeightedInventoryProof.bend as Weighted

# Instantiate the shared lookup certificate at the unchanged actual cursor
# inventory. Structural bridges keep production measure independent of proofs.
def fresh_exact(+already: Bool, +declaration: M.Declaration) -> {
  W.fresh_weight(~M.declaration_inventory, already, declaration)
  == P.fresh_weight(already, declaration)
  : Nat
}:
  match already:
    case True{}: {==}
    case False{}: {==}

def declarations_exact(+items: List<&2, M.Declaration>, +seen: List<&2, String>) -> {
  W.declarations_unvisited(~M.declaration_inventory, items, seen)
  == P.declarations_unvisited(items, seen)
  : Nat
}:
  match items:
    case []: {==}
    case +head <> +tail:
      %declarations_exact(tail, seen) : {
        W.declarations_unvisited(~M.declaration_inventory, head <> tail, seen)
        == Nat.add(P.selected_credit(Some{head}, seen), _) : Nat}
      %fresh_exact(C.contains(C.declaration_identity(head), seen), head) : {
        W.declarations_unvisited(~M.declaration_inventory, head <> tail, seen)
        == Nat.add(_, W.declarations_unvisited(~M.declaration_inventory, tail, seen)) : Nat}
      {==}

def supporting_exact(+items: List<&2, M.Supporting>, +seen: List<&2, String>) -> {
  W.supporting_unvisited(~M.declaration_inventory, items, seen)
  == P.supporting_unvisited(items, seen)
  : Nat
}:
  match items:
    case []: {==}
    case M.Supporting{+key, +head} <> +tail:
      %supporting_exact(tail, seen) : {
        W.supporting_unvisited(~M.declaration_inventory, M.Supporting{key, head} <> tail, seen)
        == Nat.add(P.selected_credit(Some{head}, seen), _) : Nat}
      %fresh_exact(C.contains(C.declaration_identity(head), seen), head) : {
        W.supporting_unvisited(~M.declaration_inventory, M.Supporting{key, head} <> tail, seen)
        == Nat.add(_, W.supporting_unvisited(~M.declaration_inventory, tail, seen)) : Nat}
      {==}

def catalog_exact(+catalog: M.Catalog, +seen: List<&2, String>) -> {
  W.catalog_unvisited(~M.declaration_inventory, catalog, seen)
  == P.catalog_unvisited(catalog, seen)
  : Nat
}:
  match catalog:
    case M.Catalog{+declarations, +supporting}:
      %declarations_exact(declarations, seen) : {
        W.catalog_unvisited(~M.declaration_inventory, M.Catalog{declarations, supporting}, seen)
        == Nat.add(_, P.supporting_unvisited(supporting, seen)) : Nat}
      %supporting_exact(supporting, seen) : {
        W.catalog_unvisited(~M.declaration_inventory, M.Catalog{declarations, supporting}, seen)
        == Nat.add(W.declarations_unvisited(~M.declaration_inventory, declarations, seen), _) : Nat}
      {==}

def credit_exact(+selected: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> {
  W.selected_credit(~M.declaration_inventory, selected, seen)
  == P.selected_credit(selected, seen)
  : Nat
}:
  match selected:
    case None{}: {==}
    case Some{+target}: fresh_exact(C.contains(C.declaration_identity(target), seen), target)

def Laws.selected_target_drop(catalog, name, target_id, expanded):
  %credit_exact(C.lookup(catalog, name, target_id), expanded) : {
    Nat.is_le(
      Nat.add(
        _,
        P.catalog_unvisited(
          catalog,
          P.selected_expanded(C.lookup(catalog, name, target_id), expanded)
        )
      ),
      P.catalog_unvisited(catalog, expanded)
    )
    == True{}
    : Bool
  }
  %catalog_exact(catalog, P.selected_expanded(C.lookup(catalog, name, target_id), expanded)) : {
    Nat.is_le(
      Nat.add(
        W.selected_credit(~M.declaration_inventory, C.lookup(catalog, name, target_id), expanded),
        _
      ),
      P.catalog_unvisited(catalog, expanded)
    )
    == True{}
    : Bool
  }
  %catalog_exact(catalog, expanded) : {
    Nat.is_le(
      Nat.add(
        W.selected_credit(~M.declaration_inventory, C.lookup(catalog, name, target_id), expanded),
        W.catalog_unvisited(
          ~M.declaration_inventory,
          catalog,
          P.selected_expanded(C.lookup(catalog, name, target_id), expanded)
        )
      ),
      _
    )
    == True{}
    : Bool
  }
  Weighted.selected_target_drop(~M.declaration_inventory, catalog, name, target_id, expanded)

def main() -> Unit:
  Unit{}
