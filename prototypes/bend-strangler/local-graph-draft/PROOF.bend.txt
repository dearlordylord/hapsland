import Base
import ./LAWS.bend as Laws
import ./PRODUCTION_COMPLETION_PROOF.bend as Production
import ./RECURSIVE_COMPLETION_PROOF.bend as Recursive
import ./WHOLE_EQUALITY_PROOF.bend as Equality

# Canonical original contract: exact whole equality and both independent completion obligations.
def Laws.whole_local_graph_exact(input, state, path, name, expected, depth):
  Equality.whole_local_graph_exact(input, state, path, name, expected, depth)
def Laws.production_traversal_completes(input, state, path, name, expected, depth):
  Production.production_traversal_completes(input, state, path, name, expected, depth)

def Laws.recursive_specification_completes(input, state, path, name, expected, depth):
  Recursive.recursive_specification_completes(input, state, path, name, expected, depth)

def main() -> Unit:
  Unit{}
