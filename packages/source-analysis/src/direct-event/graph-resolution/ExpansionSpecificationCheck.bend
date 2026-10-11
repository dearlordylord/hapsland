import Base
import ./traversal/SPEC.bend as Recursive

# Test observations and initial-state mutation; no production or SPEC policy.
def mark_visited(state: Recursive.State, identity: String) -> Recursive.State:
  match state:
    case Recursive.State{visited, budget, address, pending}:
      Recursive.State{Map.set(&2, Bool, visited, identity, True{}), budget, address, pending}

def seen(state: Recursive.State, identity: String) -> Bool:
  Recursive.seen(state, identity)

def visited_count(state: Recursive.State) -> Nat:
  match state:
    case Recursive.State{visited, _, _, _}: Map.size(&2, Bool, visited)

def main() -> Unit:
  Unit{}
