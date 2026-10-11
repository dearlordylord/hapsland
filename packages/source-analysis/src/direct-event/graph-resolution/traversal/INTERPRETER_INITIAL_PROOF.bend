import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./RANK.bend as Rank
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_COMPLETION_RANK_PROOF.bend as RequestRank
import ./RANK_INVENTORY_LAWS.bend as Inventory
import ./RANK_INVENTORY_PROOF.bend as InventoryProof
import ./MAP_WEIGHT_LAWS.bend as Weight
import ./MAP_WEIGHT_PROOF.bend as WeightProof
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia
import ../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

# Exact independent counting bridge, including every raw Map.values entry.
def count_declaration_exact(+declaration: Maybe<&2, Core.Declaration>) -> {
  Relation.count_declaration(declaration) == CoreTraversal.declaration_reference_count(declaration) : Nat
}:
  match declaration:
    case None{}: {==}
    case Some{Core.Declaration{handle, identity, function, bundled, references}}: {==}

def count_catalog_exact(+items: List<&2, Maybe<&2, Core.Declaration>>) -> {
  Relation.count_catalog(items) == CoreTraversal.catalog_reference_count(items) : Nat
}:
  match items:
    case []: {==}
    case +head <> +tail:
      %Equal.sym(Nat, Relation.count_declaration(head), CoreTraversal.declaration_reference_count(head),
        count_declaration_exact(head)):
        {
          (_ + Relation.count_catalog(tail) : Nat)
          == (CoreTraversal.declaration_reference_count(head) + CoreTraversal.catalog_reference_count(tail) : Nat)
          : Nat
        }
      %Equal.sym(Nat, Relation.count_catalog(tail), CoreTraversal.catalog_reference_count(tail),
        count_catalog_exact(tail)):
        {
          (CoreTraversal.declaration_reference_count(head) + _ : Nat)
          == (CoreTraversal.declaration_reference_count(head) + CoreTraversal.catalog_reference_count(tail) : Nat)
          : Nat
        }
      {==}

def catalog_inventory_exact(+catalog: Map<&2, Maybe<&2, Core.Declaration>>) -> {
  Relation.count_catalog(Map.values(&2, Maybe<&2, Core.Declaration>, catalog))
    == Weight.inventory(catalog) : Nat
}:
  Equal.trans(Nat,
    Relation.count_catalog(Map.values(&2, Maybe<&2, Core.Declaration>, catalog)),
    CoreTraversal.catalog_reference_count(Map.values(&2, Maybe<&2, Core.Declaration>, catalog)),
    Weight.inventory(catalog),
    count_catalog_exact(Map.values(&2, Maybe<&2, Core.Declaration>, catalog)),
    Weight.catalog_inventory_exact(catalog))

def found_rank_bounded(
  +facts: Core.Facts,
  +name: String,
  +expected: Core.ExpectedKind,
  +visited: Map<&2, Bool>,
  +found: Maybe<&2, Core.Declaration>,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  selected: {Spec.find_declaration(facts, name, expected) == found : Maybe<&2, Core.Declaration>}
) -> {
  Nat.is_le((3n * Measure.root_load(Rank.declaration_catalog(facts), visited, found) + 3n : Nat),
    Relation.spec_bound(facts)) == True{} : Bool
}:
  match facts found:
    case Core.Facts{aware, +catalog, imports, supporting} None{}:
      NatFacts.le_add_left(3n,
        (3n * Relation.count_catalog(Map.values(&2, Maybe<&2, Core.Declaration>, catalog)) : Nat))
    case Core.Facts{+aware, +catalog, imports, supporting}
      Some{Core.Declaration{+handle, +identity, +function, +bundled, +references}}:
      +declaration = {Core.Declaration{handle, identity, function, bundled, references} : Core.Declaration}
      +key = Spec.key(aware, expected, name)
      +load = (Rank.unseen_catalog(Map.set(&2, Bool, visited, identity, True{}), catalog)
        + List.length(&2, Core.Reference, references) : Nat)
      +total = Weight.inventory(catalog)
      bound = Inventory.selected_root_inventory_bound(catalog, visited, key, declaration, valid,
        Equal.trans(Maybe<&2, Core.Declaration>,
          Core.map_result(Maybe<&2, Core.Declaration>,
            Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, key)),
          Spec.value(Maybe<&2, Core.Declaration>,
            Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, key)),
          Some{declaration},
          RequestRank.selected_value_exact(Maybe<&2, Core.Declaration>,
            Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, key)), selected))
      %Equal.sym(Nat,
        Relation.count_catalog(Map.values(&2, Maybe<&2, Core.Declaration>, catalog)), total,
        catalog_inventory_exact(catalog)):
        {Nat.is_le((3n * load + 3n : Nat), (3n * _ + 3n : Nat)) == True{} : Bool}
      NatFacts.add_le_add_right((3n * load : Nat), (3n * total : Nat), 3n,
        NatFacts.mul_le_mul_left(load, total, 3n, bound))

def root_rank_bounded(+facts: Core.Facts, +name: String, +expected: Core.ExpectedKind,
    +visited: Map<&2, Bool>,
    valid: {Patricia.canonical(Bool, visited) == True{} : Bool}) -> {
      Nat.is_le(Measure.root_rank(facts, name, expected, visited), Relation.spec_bound(facts))
      == True{}
      : Bool
    }:
  found_rank_bounded(facts, name, expected, visited,
    Spec.find_declaration(facts, name, expected), valid, {==})
