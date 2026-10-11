import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./RANK.bend as Rank
import ./MAP_WEIGHT_LAWS.bend as Weight
import ./MAP_WEIGHT_PROOF.bend as WeightProof
import ./RANK_INVENTORY_LAWS.bend as Laws
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia
import ../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

import ./CHILD_INVENTORY_PROOF.bend as Child

def Laws.selected_child_inventory_decrease(
  catalog,
  visited,
  key,
  declaration,
  valid,
  selected,
  absent
):
  Child.selected_child_inventory_decrease(
    catalog,
    visited,
    key,
    declaration,
    valid,
    selected,
    absent
  )

def weight_bounded(+seen: Bool, +amount: Nat) -> {
  Nat.is_le(Rank.unseen_weight(seen, amount), amount) == True{} : Bool
}:
  match seen:
    case True{}: NatFacts.zero_le(amount)
    case False{}: NatFacts.le_refl(amount)

def declaration_bounded(visited: Map<&2, Bool>, declaration: Maybe<&2, Core.Declaration>) -> {
  Nat.is_le(
    Rank.unseen_declaration(visited, declaration),
    CoreTraversal.declaration_reference_count(declaration)
  )
  == True{}
  : Bool
}:
  match declaration:
    case None{}: {==}
    case Some{Core.Declaration{_, identity, _, _, references}}:
      weight_bounded(
        CoreTraversal.has_identity(visited, identity),
        List.length(&2, Core.Reference, references)
      )

def catalog_bounded(catalog: Map<&2, Maybe<&2, Core.Declaration>>, +visited: Map<&2, Bool>) -> {
  Nat.is_le(Rank.unseen_catalog(visited, catalog), Weight.inventory(catalog)) == True{} : Bool
}:
  match catalog:
    case MTip{}: {==}
    case MLeaf{_, declaration}: declaration_bounded(visited, declaration)
    case MNode{_, +lo, +hi}:
      NatFacts.add_le_add(
        Rank.unseen_catalog(visited, lo),
        Rank.unseen_catalog(visited, hi),
        Weight.inventory(lo),
        Weight.inventory(hi),
        catalog_bounded(lo, visited),
        catalog_bounded(hi, visited)
      )

def root_claim(+catalog: Map<&2, Maybe<&2, Core.Declaration>>, +visited: Map<&2, Bool>,
  +declaration: Core.Declaration) -> Bool:
  Nat.is_le(
    (Rank.unseen_catalog(
      Map.set(&2, Bool, visited, CoreTraversal.declaration_identity(declaration), True{}),
      catalog
    ) + CoreTraversal.declaration_reference_count(Some{declaration}) : Nat),
    Weight.inventory(catalog)
  )

def leaf_root_bound(+name: String, +value: Maybe<&2, Core.Declaration>,
  +visited: Map<&2, Bool>, +declaration: Core.Declaration,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  +selected: {value == Some{declaration} : Maybe<&2, Core.Declaration>}) -> {
  root_claim(MLeaf{name, value}, visited, declaration) == True{} : Bool
}:
  +updated = Map.set(&2, Bool, visited, CoreTraversal.declaration_identity(declaration), True{})
  +amount = CoreTraversal.declaration_reference_count(Some{declaration})
  %Equal.sym(Maybe<&2, Core.Declaration>, value, Some{declaration}, selected):
    {
      Nat.is_le(
        (Rank.unseen_declaration(updated, _) + amount : Nat),
        CoreTraversal.declaration_reference_count(value)
      )
      == True{}
      : Bool
    }
  %Equal.sym(Maybe<&2, Core.Declaration>, value, Some{declaration}, selected):
    {
      Nat.is_le(
        (Rank.unseen_declaration(updated, Some{declaration}) + amount : Nat),
        CoreTraversal.declaration_reference_count(_)
      )
      == True{}
      : Bool
    }
  %Equal.sym(
    Nat,
    Rank.unseen_declaration(updated, Some{declaration}),
    0n,
    Child.inserted_zero(visited, declaration, valid)
  ):
    {Nat.is_le((_ + amount : Nat), amount) == True{} : Bool}
  NatFacts.le_refl(amount)

def leaf_lookup_root(
  +name: String,
  +value: Maybe<&2, Core.Declaration>,
  comparison: (String & String) & Cmp,
  +visited: Map<&2, Bool>,
  +declaration: Core.Declaration,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  selected: {
    Core.map_result(
      Maybe<&2, Core.Declaration>,
      Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, comparison)
    )
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
  root_claim(MLeaf{name, value}, visited, declaration) == True{} : Bool
}:
  match comparison:
    case Tuple{Tuple{_, _}, EQ{}}: leaf_root_bound(
      name,
      value,
      visited,
      declaration,
      valid,
      selected
    )
    case Tuple{Tuple{_, _}, LT{}}:
      Empty.absurd({root_claim(MLeaf{name, value}, visited, declaration) == True{} : Bool},
        Child.none_not_selected(declaration, selected))
    case Tuple{Tuple{_, _}, GT{}}:
      Empty.absurd({root_claim(MLeaf{name, value}, visited, declaration) == True{} : Bool},
        Child.none_not_selected(declaration, selected))

def root_left(
  +position: Nat,
  +lo: Map<&2, Maybe<&2, Core.Declaration>>,
  +hi: Map<&2, Maybe<&2, Core.Declaration>>,
  +visited: Map<&2, Bool>,
  +declaration: Core.Declaration,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  child: {root_claim(lo, visited, declaration) == True{} : Bool}
) -> {
  root_claim(MNode{position, lo, hi}, visited, declaration) == True{} : Bool
}:
  +updated = Map.set(&2, Bool, visited, CoreTraversal.declaration_identity(declaration), True{})
  +a = Rank.unseen_catalog(updated, lo)
  +b = Rank.unseen_catalog(updated, hi)
  +c = CoreTraversal.declaration_reference_count(Some{declaration})
  %NatFacts.add_assoc_sym(a, b, c):
    {
      Nat.is_le(_, (Weight.inventory(lo) + Weight.inventory(hi) : Nat))
      == True{}
      : Bool
    }
  %NatFacts.add_comm(c, b):
    {
      Nat.is_le(
        (a + _ : Nat),
        (Weight.inventory(lo) + Weight.inventory(hi) : Nat)
      )
      == True{}
      : Bool
    }
  %NatFacts.add_assoc(a, c, b):
    {
      Nat.is_le(_, (Weight.inventory(lo) + Weight.inventory(hi) : Nat))
      == True{}
      : Bool
    }
  NatFacts.add_le_add(
    (a + c : Nat),
    b,
    Weight.inventory(lo),
    Weight.inventory(hi),
    child,
    catalog_bounded(hi, updated)
  )

def root_right(
  +position: Nat,
  +lo: Map<&2, Maybe<&2, Core.Declaration>>,
  +hi: Map<&2, Maybe<&2, Core.Declaration>>,
  +visited: Map<&2, Bool>,
  +declaration: Core.Declaration,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  child: {root_claim(hi, visited, declaration) == True{} : Bool}
) -> {
  root_claim(MNode{position, lo, hi}, visited, declaration) == True{} : Bool
}:
  +updated = Map.set(&2, Bool, visited, CoreTraversal.declaration_identity(declaration), True{})
  +a = Rank.unseen_catalog(updated, lo)
  +b = Rank.unseen_catalog(updated, hi)
  +c = CoreTraversal.declaration_reference_count(Some{declaration})
  %NatFacts.add_assoc_sym(a, b, c):
    {
      Nat.is_le(_, (Weight.inventory(lo) + Weight.inventory(hi) : Nat))
      == True{}
      : Bool
    }
  NatFacts.add_le_add(
    a,
    (b + c : Nat),
    Weight.inventory(lo),
    Weight.inventory(hi),
    catalog_bounded(lo, updated),
    child
  )

def routed_root(
  catalog: Map<&2, Maybe<&2, Core.Declaration>>,
  route: String & Bool,
  +visited: Map<&2, Bool>,
  +declaration: Core.Declaration,
  +valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  selected: {
    Core.map_result(
      Maybe<&2, Core.Declaration>,
      Map.get.go(Maybe<&2, Core.Declaration>, catalog, None{}, route)
    )
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
  root_claim(catalog, visited, declaration) == True{} : Bool
}:
  match catalog route:
    case MTip{} _:
      Empty.absurd(
        {root_claim(MTip{}, visited, declaration) == True{} : Bool},
        Child.none_not_selected(declaration, selected)
      )
    case MLeaf{+name, +value} _:
      Empty.absurd(
        {root_claim(MLeaf{name, value}, visited, declaration) == True{} : Bool},
        Child.none_not_selected(declaration, selected)
      )
    case MNode{+position, MTip{}, +sibling} Tuple{+key, False{}}:
      Empty.absurd(
        {root_claim(MNode{position, MTip{}, sibling}, visited, declaration) == True{} : Bool},
        Child.none_not_selected(declaration, selected)
      )
    case MNode{+position, MLeaf{+name, +value}, +sibling} Tuple{+key, False{}}:
      root_left(
        position,
        MLeaf{name, value},
        sibling,
        visited,
        declaration,
        valid,
        leaf_lookup_root(
          name,
          value,
          String.cmp(key, name),
          visited,
          declaration,
          valid,
          Child.left_selected(
            position,
            sibling,
            Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, name)),
            declaration,
            selected
          )
        )
      )
    case MNode{+position, MNode{+branch, +a, +b}, +sibling} Tuple{+key, False{}}:
      root_left(
        position,
        MNode{branch, a, b},
        sibling,
        visited,
        declaration,
        valid,
        routed_root(
          MNode{branch, a, b},
          Map.bit(key, branch),
          visited,
          declaration,
          valid,
          Child.left_selected(
            position,
            sibling,
            Map.get.go(
              Maybe<&2, Core.Declaration>,
              MNode{branch, a, b},
              None{},
              Map.bit(key, branch)
            ),
            declaration,
            selected
          )
        )
      )
    case MNode{+position, +sibling, MTip{}} Tuple{+key, True{}}:
      Empty.absurd(
        {root_claim(MNode{position, sibling, MTip{}}, visited, declaration) == True{} : Bool},
        Child.none_not_selected(declaration, selected)
      )
    case MNode{+position, +sibling, MLeaf{+name, +value}} Tuple{+key, True{}}:
      root_right(
        position,
        sibling,
        MLeaf{name, value},
        visited,
        declaration,
        valid,
        leaf_lookup_root(
          name,
          value,
          String.cmp(key, name),
          visited,
          declaration,
          valid,
          Child.right_selected(
            position,
            sibling,
            Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, name)),
            declaration,
            selected
          )
        )
      )
    case MNode{+position, +sibling, MNode{+branch, +a, +b}} Tuple{+key, True{}}:
      root_right(
        position,
        sibling,
        MNode{branch, a, b},
        visited,
        declaration,
        valid,
        routed_root(
          MNode{branch, a, b},
          Map.bit(key, branch),
          visited,
          declaration,
          valid,
          Child.right_selected(
            position,
            sibling,
            Map.get.go(
              Maybe<&2, Core.Declaration>,
              MNode{branch, a, b},
              None{},
              Map.bit(key, branch)
            ),
            declaration,
            selected
          )
        )
      )

def Laws.selected_root_inventory_bound(catalog, visited, key, declaration, valid, selected):
  match catalog:
    case MTip{}:
      Empty.absurd(
        {root_claim(MTip{}, visited, declaration) == True{} : Bool},
        Child.none_not_selected(declaration, selected)
      )
    case MLeaf{+name, +value}:
      leaf_lookup_root(name, value, String.cmp(key, name), visited, declaration, valid, selected)
    case MNode{+position, +lo, +hi}:
      routed_root(
        MNode{position, lo, hi},
        Map.bit(key, position),
        visited,
        declaration,
        valid,
        selected
      )

def main() -> Unit:
  Unit{}
