import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Potential.bend as P
import ./WeightedInventory.bend as W

# Internal fresh-child branch of the joint continuation invariant. The public
# root theorem must derive these successor budgets and lookup witnesses.
# The actual Core stack includes ancestors; each Spec frame has its own depth.
law fresh_child_budgets:
  for +catalog: M.Catalog
  for +name: String
  for +target_id: Maybe<&2, String>
  for +slot: Nat
  for +identity: String
  for +target_name: String
  for +references: List<&2, M.Reference>
  for +expanded: List<&2, String>
  for +parent_tail: List<&2, M.Reference>
  for +ancestors: List<&2, C.Frame>
  for +rest: Nat
  for +depth: Nat
  for +found: {
    C.lookup(catalog, name, target_id)
    == Some{M.Declaration{slot, identity, target_name, references}}
    : Maybe<&2, M.Declaration>
  }
  for +fresh: {C.contains(identity, expanded) == False{} : Bool}
  for core_bound: {
    Nat.is_le(
      1n+Nat.add(
        Nat.add(List.length(&2, M.Reference, parent_tail), P.pending_references(ancestors)),
        P.catalog_unvisited(catalog, expanded)
      ),
      2n+rest
    )
    == True{}
    : Bool
  }
  for +spec_bound: {Nat.is_le(2n+Nat.add(List.length(&2, M.Reference, parent_tail),
      W.catalog_unvisited(~W.specification_weight, catalog, expanded)), 2n+depth) == True{} : Bool}
  {
    Nat.is_le(
      Nat.add(
        Nat.add(List.length(&2, M.Reference, parent_tail), P.pending_references(ancestors)),
        Nat.add(
          List.length(&2, M.Reference, references),
          P.catalog_unvisited(catalog, identity <> expanded)
        )
      ),
      rest
    )
    == True{}
    : Bool
  }
  & {
    Nat.is_le(
      1n+Nat.add(
        List.length(&2, M.Reference, references),
        W.catalog_unvisited(~W.specification_weight, catalog, identity <> expanded)
      ),
      depth
    )
    == True{}
    : Bool
  }
  & {
    Nat.is_le(
      1n+Nat.add(
        List.length(&2, M.Reference, parent_tail),
        W.catalog_unvisited(~W.specification_weight, catalog, identity <> expanded)
      ),
      1n+depth
    )
    == True{}
    : Bool
  }

def main() -> Unit:
  Unit{}
