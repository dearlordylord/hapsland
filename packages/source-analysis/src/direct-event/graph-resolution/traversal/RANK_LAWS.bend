import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./RANK.bend as Rank
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# The actual selected root fits unchanged production fuel, even when already seen.
law initial_rank_bound:
  for +facts: Core.Facts
  for +path: String
  for +visited: Map<&2, Bool>
  for +budget: Core.Budget
  for +key: String
  for +declaration: Core.Declaration
  for +depth: Nat
  for valid: {Patricia.canonical(Bool, visited) == True{} : Bool}
  for selected: {
    Core.map_result(Maybe<&2, Core.Declaration>,
      Map.get(Maybe<&2, Core.Declaration>, None{}, Rank.declaration_catalog(facts), key))
    == Some{declaration} : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      (Rank.rank(
        CoreTraversal.enter_node(Rank.initial(facts, path, visited, budget), declaration, depth)
      ) + 1n : Nat),
      CoreTraversal.traversal_bound(facts)
    )
    == True{}
    : Bool
  }

# All raw catalogs and frame contents are admitted. Only visited routing is lawful.
# One active actual step both preserves that invariant and consumes rank.
law step_decreases_preserving_visited:
  for +machine: Core.Machine
  for valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool}
  for active: {CoreTraversal.done(machine) == False{} : Bool}
  {
    Bool.and(
      Patricia.canonical(Bool, CoreTraversal.machine_visited(CoreTraversal.step(machine))),
      Nat.is_le((Rank.rank(CoreTraversal.step(machine)) + 1n : Nat), Rank.rank(machine))
    ) == True{} : Bool
  }

# Adequate fuel terminates the actual String planner; failure is not success.
law run_completes_from_rank:
  for +fuel: Nat
  for +machine: Core.Machine
  for valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool}
  for enough: {Nat.is_le(Rank.rank(machine), fuel) == True{} : Bool}
  {Rank.successful(CoreTraversal.run(fuel, machine)) == True{} : Bool}
