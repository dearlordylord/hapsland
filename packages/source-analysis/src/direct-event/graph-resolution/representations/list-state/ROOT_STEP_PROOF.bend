import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_INVENTORY_LAWS.bend as Inventory
import ./INVENTORY_PROOF.bend as InventoryProof
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

def selected_value(
  found: Bool,
  head: Maybe<&2, Core.Declaration>,
  rest: Own.Dictionary<Maybe<&2, Core.Declaration>>,
  key: Nat
) -> Maybe<&2, Core.Declaration>:
  fallback = Own.lookup(Maybe<&2, Core.Declaration>, None{}, rest, key)
  Own.choose(Maybe<&2, Core.Declaration>, found, head, next => fallback)

def root_claim(
  +visited: Own.Dictionary<Bool>,
  +declaration: Core.Declaration,
  +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
) -> Bool:
  after = Rank.unseen_catalog(
    Own.set(Bool, visited, Core.declaration_identity(declaration), True{}),
    catalog
  )
  combined = (after + Core.declaration_reference_count(Some{declaration}) : Nat)
  Nat.is_le(combined, Core.trie_reference_count(catalog))

def child_claim(
  +visited: Own.Dictionary<Bool>,
  +declaration: Core.Declaration,
  +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
) -> Bool:
  after = Rank.unseen_catalog(
    Own.set(Bool, visited, Core.declaration_identity(declaration), True{}),
    catalog
  )
  combined = (after + Core.declaration_reference_count(Some{declaration}) : Nat)
  Nat.is_le(combined, Rank.unseen_catalog(visited, catalog))

# The empty catalog cannot supply the selected declaration.

def is_some(value: Maybe<&2, Core.Declaration>) -> Bool:
  match value:
    case None{}: False{}
    case Some{_}: True{}

law none_not_selected:
  for declaration: Core.Declaration
  for selected: {None{} == Some{declaration} : Maybe<&2, Core.Declaration>}
  Empty

# Reassemble a root bound from the strictly smaller suffix selection theorem.

law selected_root_step:
  for +found: Bool
  for +head: Maybe<&2, Core.Declaration>
  for +rest: Own.Dictionary<Maybe<&2, Core.Declaration>>
  for +key: Nat
  for +visited: Own.Dictionary<Bool>
  for +declaration: Core.Declaration
  for +name: Nat
  for +count: Nat
  for +selected: {
    selected_value(found, head, rest, key)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for suffix: {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, rest, key)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  } -> {root_claim(visited, declaration, rest) == True{} : Bool}
  {root_claim(visited, declaration, Own.DCon{name, head, rest, count}) == True{} : Bool}

# Reassemble a child decrease from the strictly smaller suffix selection theorem.

def none_not_selected(declaration, selected):
  present = Equal.cong(
    Maybe<&2, Core.Declaration>,
    Bool,
    is_some,
    None{},
    Some{declaration},
    selected
  )
  BoolFacts.internal_false_ne_true(present)

def selected_root_step(found, head, rest, key, visited, declaration, name, count, selected, suffix):
  match found:
    case True{}:
      +added = Own.set(Bool, visited, Core.declaration_identity(declaration), True{})
      +remaining = Rank.unseen_catalog(added, rest)
      +amount = Core.declaration_reference_count(Some{declaration})
      %Equal.sym(Maybe<&2, Core.Declaration>, head, Some{declaration}, selected):
        {
          Nat.is_le(
            Nat.add(Nat.add(Rank.unseen_declaration(added, _), remaining), amount),
            Nat.add(Core.declaration_reference_count(head), Core.trie_reference_count(rest))
          )
          == True{}
          : Bool
        }
      %Equal.sym(Maybe<&2, Core.Declaration>, head, Some{declaration}, selected):
        {
          Nat.is_le(
            Nat.add(Nat.add(Rank.unseen_declaration(added, Some{declaration}), remaining), amount),
            Nat.add(Core.declaration_reference_count(_), Core.trie_reference_count(rest))
          )
          == True{}
          : Bool
        }
      %Equal.sym(
        Nat,
        Rank.unseen_declaration(added, Some{declaration}),
        0n,
        Inventory.unseen_insert_selected_zero(visited, declaration)
      ):
        {
          Nat.is_le(
            Nat.add(Nat.add(_, remaining), amount),
            Nat.add(amount, Core.trie_reference_count(rest))
          )
          == True{}
          : Bool
        }
      %NatFacts.add_comm(amount, remaining):
        {Nat.is_le(_, Nat.add(amount, Core.trie_reference_count(rest))) == True{} : Bool}
      NatFacts.add_le_add_left(
        remaining,
        Core.trie_reference_count(rest),
        amount,
        Inventory.unseen_catalog_bounded(added, rest)
      )
    case False{}:
      +added = Own.set(Bool, visited, Core.declaration_identity(declaration), True{})
      +head_after = Rank.unseen_declaration(added, head)
      +rest_after = Rank.unseen_catalog(added, rest)
      +amount = Core.declaration_reference_count(Some{declaration})
      head_bound = Inventory.unseen_declaration_bounded(added, head)
      tail_bound = suffix(selected)
      %NatFacts.add_assoc_sym(head_after, rest_after, amount):
        {
          Nat.is_le(
            _,
            Nat.add(Core.declaration_reference_count(head), Core.trie_reference_count(rest))
          )
          == True{}
          : Bool
        }
      NatFacts.add_le_add(
        head_after,
        Nat.add(rest_after, amount),
        Core.declaration_reference_count(head),
        Core.trie_reference_count(rest),
        head_bound,
        tail_bound
      )
