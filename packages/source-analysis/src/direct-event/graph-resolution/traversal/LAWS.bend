import Base
import ./core.bend as Core
import ./BOUNDARY.bend as Boundary
import ./RELATION.bend as Relation

# Every complete result, including missing root, equals independent recursive DFS.
# Ordered references/pending, artifact handles and every state field are preserved.
law whole_local_graph_exact:
  for +input: Boundary.BoundaryFacts
  for +state: Boundary.BoundaryState
  for +path: String
  for +name: String
  for +expected: Core.ExpectedKind
  for +depth: Nat
  {
    Relation.core_observation(input, state, path, name, expected, depth)
    == Relation.recursive_observation(input, state, path, name, expected, depth)
    : Relation.Observation
  }

# The production bound must never truncate a lawful finite input.
law production_traversal_completes:
  for input: Boundary.BoundaryFacts
  for state: Boundary.BoundaryState
  for path: String
  for name: String
  for expected: Core.ExpectedKind
  for depth: Nat
  {
    Relation.successful(Relation.core_observation(input, state, path, name, expected, depth))
    == True{}
    : Bool
  }

# The independent recursive interpreter and tree projection must also terminate.
# This prevents equality of two failures from satisfying the central law.
law recursive_specification_completes:
  for input: Boundary.BoundaryFacts
  for state: Boundary.BoundaryState
  for path: String
  for name: String
  for expected: Core.ExpectedKind
  for depth: Nat
  {
    Relation.successful(Relation.recursive_observation(input, state, path, name, expected, depth))
    == True{}
    : Bool
  }
