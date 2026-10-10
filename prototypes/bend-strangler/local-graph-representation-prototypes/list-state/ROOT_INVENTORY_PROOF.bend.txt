import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./ROOT_STEP_PROOF.bend as Step

def empty_root_bound_type(+visited: Own.Dictionary<Bool>, +declaration: Core.Declaration) -> Data:
  {Step.root_claim(visited, declaration, Own.DNil{}) == True{} : Bool}

def suffix_root_type(
  +rest: Own.Dictionary<Maybe<&2, Core.Declaration>>,
  +visited: Own.Dictionary<Bool>,
  key: Nat,
  +declaration: Core.Declaration
) -> Type:
  {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, rest, key)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  } -> {Step.root_claim(visited, declaration, rest) == True{} : Bool}

law selected_root_inventory_bound:
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  for +visited: Own.Dictionary<Bool>
  for +key: Nat
  for +declaration: Core.Declaration
  for selected: {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, catalog, key)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      (Rank.unseen_catalog(
        Own.set(Bool, visited, Core.declaration_identity(declaration), True{}),
        catalog
      ) + Core.declaration_reference_count(Some{declaration}) : Nat),
      Core.trie_reference_count(catalog)
    )
    == True{}
    : Bool
  }

# Exact selected-root inventory bound.

def selected_root_inventory_bound(catalog, visited, key, declaration, selected):
  match catalog:
    case Own.DNil{}:
      Empty.absurd(
        empty_root_bound_type(visited, declaration),
        Step.none_not_selected(declaration, selected)
      )
    case Own.DCon{+name, +head, +rest, +count}:
      continue = {selection => selected_root_inventory_bound(rest, visited, key, declaration, selection) : suffix_root_type(rest, visited, key, declaration)}
      Step.selected_root_step(
        Nat.is_eq(name, key),
        head,
        rest,
        key,
        visited,
        declaration,
        name,
        count,
        selected,
        continue
      )
