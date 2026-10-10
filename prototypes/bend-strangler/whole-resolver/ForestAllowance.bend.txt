import Base
import ./ForestSpecification.bend as F

# Proof/specification evaluation allowance, never a product traversal budget.
# Count the actual retained forest, including detached rollback nodes. A path
# in an acyclic forest cannot visit more nodes or reference positions than
# these totals. Two node transitions plus the reference positions and terminal
# dispatch give a conservative allowance without a fixture-size constant.
# Adequacy still requires the reachable-forest relation: this definition makes
# no completion claim for arbitrary cyclic or ambiguous-address raw forests.
def references(items: List<&2, F.Reference>) -> Nat:
  match items:
    case []: 0n
    case _ <> tail: (1n + references(tail) : Nat)

def nodes(items: List<&2, F.Node>) -> Nat:
  match items:
    case []: 0n
    case F.Node{_, _, refs} <> tail:
      (2n + references(refs) + nodes(tail) : Nat)

def materialization(forest: F.Forest) -> Nat:
  match forest:
    case F.Forest{_, items}: (nodes(items) + 2n : Nat)

def main() -> Unit:
  Unit{}
