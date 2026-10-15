import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Potential.bend as P
import ./WeightedInventory.bend as W
import ./WeightedInventoryProof.bend as Weighted
import ./SelectedTargetProof.bend as CoreInventory
import ./ChildBudgetLaws.bend as Laws
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N

# Internal arithmetic for the actual fresh-child branch. Prefix counts the
# retained parent's pending references and every ancestor's pending references.
def core_numeric(+prefix: Nat, +child: Nat, +after: Nat, +before: Nat, +rest: Nat,
  drop: N.le(1n+Nat.add(child, after), before),
  bound: N.le(1n+Nat.add(prefix, before), 2n+rest)) ->
  N.le(Nat.add(prefix, Nat.add(child, after)), rest):
  N.le_trans(2n+Nat.add(prefix, Nat.add(child, after)), 1n+Nat.add(prefix, before), 2n+rest,
    N.succ_le_succ(1n+Nat.add(prefix, Nat.add(child, after)), Nat.add(prefix, before),
      Equal.trans(Bool,
        Nat.is_le(1n+Nat.add(prefix, Nat.add(child, after)), Nat.add(prefix, before)),
        Nat.is_le(Nat.add(prefix, 1n+Nat.add(child, after)), Nat.add(prefix, before)), True{},
        Equal.cong(Nat, Bool, value => Nat.is_le(value, Nat.add(prefix, before)),
          1n+Nat.add(prefix, Nat.add(child, after)), Nat.add(prefix, 1n+Nat.add(child, after)),
          Equal.sym(Nat, Nat.add(prefix, 1n+Nat.add(child, after)), 1n+Nat.add(prefix, Nat.add(child, after)),
            N.add_succ(prefix, Nat.add(child, after)))),
        N.add_le_add_left(1n+Nat.add(child, after), before, prefix, drop))), bound)

def specification_child_numeric(+tail: Nat, +child: Nat, +after: Nat, +before: Nat, +depth: Nat,
  drop: N.le(2n+Nat.add(child, after), before),
  bound: N.le(2n+Nat.add(tail, before), 2n+depth)) ->
  N.le(1n+Nat.add(child, after), depth):
  N.le_trans(1n+Nat.add(child, after), before, depth,
    N.le_trans(1n+Nat.add(child, after), 2n+Nat.add(child, after), before,
      N.le_succ(1n+Nat.add(child, after)), drop),
    N.le_trans(before, Nat.add(tail, before), depth, N.le_add_left(before, tail), bound))

def specification_parent_numeric(+tail: Nat, +after: Nat, +before: Nat, +depth: Nat,
  mono: N.le(after, before),
  bound: N.le(2n+Nat.add(tail, before), 2n+depth)) ->
  N.le(1n+Nat.add(tail, after), 1n+depth):
  N.succ_le_succ(Nat.add(tail, after), depth,
    N.le_trans(Nat.add(tail, after), Nat.add(tail, before), depth,
      N.add_le_add_left(after, before, tail, mono), bound))

# The actual lookup, not an arbitrary chosen declaration, supplies the charge.
def chosen_drop(~weight: M.Declaration -> Nat, +catalog: M.Catalog, +name: String,
  +target_id: Maybe<&2, String>, +target: M.Declaration, +seen: List<&2, String>,
  found: {C.lookup(catalog, name, target_id) == Some{target} : Maybe<&2, M.Declaration>},
  fresh: {C.contains(C.declaration_identity(target), seen) == False{} : Bool}) -> N.le(
    Nat.add(weight(target), W.catalog_unvisited(~weight, catalog, C.declaration_identity(target) <> seen)),
    W.catalog_unvisited(~weight, catalog, seen)):
  %fresh : N.le(Nat.add(W.fresh_weight(~weight, _, target),
    W.catalog_unvisited(~weight, catalog, C.declaration_identity(target) <> seen)),
    W.catalog_unvisited(~weight, catalog, seen))
  %found : {W.selected_drop_result(~weight, _, catalog, seen) == True{} : Bool}
  Weighted.selected_target_drop(~weight, catalog, name, target_id, seen)

def core_chosen_drop(+catalog: M.Catalog, +name: String, +target_id: Maybe<&2, String>, +target: M.Declaration,
  +seen: List<&2, String>, found: {C.lookup(catalog, name, target_id) == Some{target} : Maybe<&2, M.Declaration>},
  fresh: {C.contains(C.declaration_identity(target), seen) == False{} : Bool}) -> N.le(
    Nat.add(M.declaration_inventory(target), P.catalog_unvisited(catalog, C.declaration_identity(target) <> seen)),
    P.catalog_unvisited(catalog, seen)):
  %CoreInventory.catalog_exact(catalog, C.declaration_identity(target) <> seen) : N.le(
    Nat.add(M.declaration_inventory(target), _), P.catalog_unvisited(catalog, seen))
  %CoreInventory.catalog_exact(catalog, seen) : N.le(
    Nat.add(M.declaration_inventory(target), W.catalog_unvisited(~M.declaration_inventory, catalog, C.declaration_identity(target) <> seen)), _)
  chosen_drop(~M.declaration_inventory, catalog, name, target_id, target, seen, found, fresh)

def catalog_mono(~weight: M.Declaration -> Nat, +catalog: M.Catalog, +key: String, +seen: List<&2, String>) -> N.le(
  W.catalog_unvisited(~weight, catalog, key <> seen), W.catalog_unvisited(~weight, catalog, seen)):
  match catalog:
    case M.Catalog{+declarations, +supporting}:
      N.add_le_add(W.declarations_unvisited(~weight, declarations, key <> seen), W.supporting_unvisited(~weight, supporting, key <> seen),
        W.declarations_unvisited(~weight, declarations, seen), W.supporting_unvisited(~weight, supporting, seen),
        Weighted.declarations_mono(~weight, declarations, key, seen), Weighted.supporting_mono(~weight, supporting, key, seen))

def Laws.fresh_child_budgets(catalog, name, target_id, slot, identity, target_name, references, expanded,
  parent_tail, ancestors, rest, depth, found, fresh, core_bound, spec_bound):
  (core_numeric(Nat.add(List.length(&2, M.Reference, parent_tail), P.pending_references(ancestors)),
    List.length(&2, M.Reference, references), P.catalog_unvisited(catalog, identity <> expanded),
    P.catalog_unvisited(catalog, expanded), rest,
    core_chosen_drop(catalog, name, target_id, M.Declaration{slot, identity, target_name, references}, expanded, found, fresh), core_bound),
  (specification_child_numeric(List.length(&2, M.Reference, parent_tail), List.length(&2, M.Reference, references),
    W.catalog_unvisited(~W.specification_weight, catalog, identity <> expanded),
    W.catalog_unvisited(~W.specification_weight, catalog, expanded), depth,
    chosen_drop(~W.specification_weight, catalog, name, target_id, M.Declaration{slot, identity, target_name, references}, expanded, found, fresh), spec_bound),
  specification_parent_numeric(List.length(&2, M.Reference, parent_tail),
    W.catalog_unvisited(~W.specification_weight, catalog, identity <> expanded),
    W.catalog_unvisited(~W.specification_weight, catalog, expanded), depth,
    catalog_mono(~W.specification_weight, catalog, identity, expanded), spec_bound)))

def main() -> Unit:
  Unit{}
