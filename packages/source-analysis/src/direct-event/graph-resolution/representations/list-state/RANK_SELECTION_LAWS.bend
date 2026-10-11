import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank

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
law selected_child_step:
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
  for +absent: {
    Core.has_identity(visited, Core.declaration_identity(declaration))
    == False{}
    : Bool
  }
  for suffix: {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, rest, key)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  } -> {child_claim(visited, declaration, rest) == True{} : Bool}
  {child_claim(visited, declaration, Own.DCon{name, head, rest, count}) == True{} : Bool}
