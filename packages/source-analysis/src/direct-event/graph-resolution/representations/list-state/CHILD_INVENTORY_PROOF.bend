import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./ROOT_STEP_PROOF.bend as RootStep
import ./CHILD_STEP_PROOF.bend as Step

def empty_child_bound_type(+visited: Own.Dictionary<Bool>, +declaration: Core.Declaration) -> Data:
  {RootStep.child_claim(visited, declaration, Own.DNil{}) == True{} : Bool}

def suffix_child_type(
  +rest: Own.Dictionary<Maybe<&2, Core.Declaration>>,
  +visited: Own.Dictionary<Bool>,
  key: Nat,
  +declaration: Core.Declaration
) -> Type:
  {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, rest, key)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  } -> {RootStep.child_claim(visited, declaration, rest) == True{} : Bool}

law selected_child_inventory_decrease:
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  for +visited: Own.Dictionary<Bool>
  for +key: Nat
  for +declaration: Core.Declaration
  for selected: {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, catalog, key)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for absent: {Core.has_identity(visited, Core.declaration_identity(declaration)) == False{} : Bool}
  {
    Nat.is_le(
      (Rank.unseen_catalog(
        Own.set(Bool, visited, Core.declaration_identity(declaration), True{}),
        catalog
      ) + Core.declaration_reference_count(Some{declaration}) : Nat),
      Rank.unseen_catalog(visited, catalog)
    )
    == True{}
    : Bool
  }

# Exact selected-child inventory decrease; root/fuel bounds are separate.

def selected_child_inventory_decrease(catalog, visited, key, declaration, selected, absent):
  match catalog:
    case Own.DNil{}:
      Empty.absurd(
        empty_child_bound_type(visited, declaration),
        RootStep.none_not_selected(declaration, selected)
      )
    case Own.DCon{+name, +head, +rest, +count}:
      +saved_absent = absent
      continue = {selection => selected_child_inventory_decrease(rest, visited, key, declaration, selection, saved_absent) : suffix_child_type(rest, visited, key, declaration)}
      Step.selected_child_step(
        Nat.is_eq(name, key),
        head,
        rest,
        key,
        visited,
        declaration,
        name,
        count,
        selected,
        saved_absent,
        continue
      )
