import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank

# Adding an identity never increases unseen catalog weight, including raw lists.
law unseen_insertion_nonincreasing:
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  for +visited: Own.Dictionary<Bool>
  for +identity: Nat
  {
    Nat.is_le(
      Rank.unseen_catalog(Own.set(Bool, visited, identity, True{}), catalog),
      Rank.unseen_catalog(visited, catalog)
    )
    == True{}
    : Bool
  }

# Every successful selected root is excluded from unseen weight after insertion.
# No absent-root-identity assumption: prior visited roots still satisfy this bound.
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

# A newly selected child removes at least its own structural reference weight.
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

# Entering a selected root fits the declared production fuel, even if seen before.
law initial_rank_bound:
  for +facts: Core.Facts
  for +path: Nat
  for +visited: Own.Dictionary<Bool>
  for +budget: Core.Budget
  for +key: Nat
  for +declaration: Core.Declaration
  for +depth: Nat
  for selected: {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, Rank.declaration_catalog(facts), key)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      (Rank.rank(
        Core.enter_node(Rank.initial(facts, path, visited, budget), declaration, depth)
      ) + 1n : Nat),
      Core.traversal_bound(facts)
    )
    == True{}
    : Bool
  }

# Every nonterminal raw machine step consumes at least one unit of rank.
# No reachable-state premise; arbitrary finite frame contents are covered.
law step_decreases_rank:
  for +machine: Core.Machine
  for active: {Core.done(machine) == False{} : Bool}
  {Nat.is_le((Rank.rank(Core.step(machine)) + 1n : Nat), Rank.rank(machine)) == True{} : Bool}

# Adequate rank fuel always completes, so equality cannot hide two failures.
law run_completes_from_rank:
  for +fuel: Nat
  for +machine: Core.Machine
  for enough: {Nat.is_le(Rank.rank(machine), fuel) == True{} : Bool}
  {Rank.successful(Core.run(fuel, machine)) == True{} : Bool}

# Entire list-representation production planner completes on every finite raw input.
law plan_completes:
  for +facts: Core.Facts
  for +path: Nat
  for +name: Core.Label
  for +expected: Core.ExpectedKind
  for +visited: Own.Dictionary<Bool>
  for +budget: Core.Budget
  for +depth: Nat
  {Rank.successful(Core.plan(facts, path, name, expected, visited, budget, depth)) == True{} : Bool}
