import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./DENSE.bend as Dense
import ../AttachPlanning.bend as AttachOwner

def planned(facts: Core.Facts, path: String, name: String, expected: Core.ExpectedKind,
    visited: Map<&2, Bool>, budget: Core.Budget, depth: Nat) -> Core.RunResult:
  CoreTraversal.plan(facts, path, name, expected, visited, budget, depth)

def known(facts: Core.Facts, path: String, edge: Core.Pending, declaration: Core.Declaration,
    visited: Map<&2, Bool>, budget: Core.Budget) -> Core.RunResult:
  AttachOwner.empty_or_plan(True{}, facts, path, edge, declaration, visited, budget)

def dense(plan: Core.Plan) -> Bool:
  Dense.plan_nodes(plan)

def count(plan: Core.Plan) -> Nat:
  Dense.allocation_count(plan)

def main() -> Unit:
  Unit{}
