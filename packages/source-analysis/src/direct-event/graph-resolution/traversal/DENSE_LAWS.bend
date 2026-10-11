import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./DENSE.bend as Dense
import ../AttachPlanning.bend as AttachOwner

# Draft: actual successful planner output has IDs 0 through length(nodes)-1
# in allocation order. Raw catalogs, aliases, visited maps and budgets remain
# unrestricted; this conditional law does not assert planner completion.
# Together with remap's existing offset+length(nodes), this supplies the numeric
# half of the later numeric-ID/birth-address relation for every retained child.
law successful_plan_nodes_dense:
  for +facts: Core.Facts
  for +path: String
  for +name: String
  for +expected: Core.ExpectedKind
  for +visited: Map<&2, Bool>
  for +budget: Core.Budget
  for +depth: Nat
  for +plan: Core.Plan
  for completed: {
    CoreTraversal.plan(facts, path, name, expected, visited, budget, depth)
    == Core.CompletePlan{plan} : Core.RunResult
  }
  {Dense.plan_nodes(plan) == True{} : Bool}

# Actual known-child branch, including arbitrary unused raw arguments.
# Its returned node-list allocation extent is one; no recursive-state counter
# premise is permitted here or in the subsequent whole-frame relation.
law known_singleton_nodes_dense:
  for +facts: Core.Facts
  for +path: String
  for +edge: Core.Pending
  for +declaration: Core.Declaration
  for +visited: Map<&2, Bool>
  for +budget: Core.Budget
  for +plan: Core.Plan
  for completed: {
    AttachOwner.empty_or_plan(True{}, facts, path, edge, declaration, visited, budget)
    == Core.CompletePlan{plan} : Core.RunResult
  }
  {
    Bool.and(Dense.plan_nodes(plan), Nat.is_eq(Dense.allocation_count(plan), 1n))
    == True{} : Bool
  }
