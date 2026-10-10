import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./TREE_MACHINE_RELATION.bend as Relation

# Entire numeric planner equals the independent recursive tree/flatten observation.
# Raw Own dictionaries may contain duplicate keys and inconsistent cached sizes.
law whole_numeric_graph_exact:
  for +facts: Core.Facts
  for +path: Nat
  for +name: Core.Label
  for +expected: Core.ExpectedKind
  for +visited: Own.Dictionary<Bool>
  for +budget: Core.Budget
  for +depth: Nat
  {
    Relation.core_observation(facts, path, name, expected, visited, budget, depth)
    == Relation.recursive_observation(facts, path, name, expected, visited, budget, depth)
    : Relation.Observation
  }

# Equality cannot be satisfied by two failures: actual production traversal completes.
law numeric_production_completes:
  for facts: Core.Facts
  for path: Nat
  for name: Core.Label
  for expected: Core.ExpectedKind
  for visited: Own.Dictionary<Bool>
  for budget: Core.Budget
  for depth: Nat
  {
    Relation.successful(
      Relation.core_observation(facts, path, name, expected, visited, budget, depth)
    )
    == True{}
    : Bool
  }

# Independent recursive DFS and full flatten both complete at the declared bound.
law numeric_recursive_completes:
  for facts: Core.Facts
  for path: Nat
  for name: Core.Label
  for expected: Core.ExpectedKind
  for visited: Own.Dictionary<Bool>
  for budget: Core.Budget
  for depth: Nat
  {
    Relation.successful(
      Relation.recursive_observation(facts, path, name, expected, visited, budget, depth)
    )
    == True{}
    : Bool
  }
