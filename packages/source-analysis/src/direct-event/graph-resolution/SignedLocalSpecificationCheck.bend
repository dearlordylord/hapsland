import Base
import ./Types.bend as T
import ./SPEC.bend as Whole
import ./SignedLocalSpecification.bend as Signed
import ./traversal/SPEC.bend as Recursive
import ./traversal/core.bend as Local
import ../../../../agent-flow-bend/ImportGraph.bend as G

def visited(seen_bundle: Bool) -> Map<&2, Bool>:
  match seen_bundle:
    case False{}: MTip{}
    case True{}: Map.set(&2, Bool, MTip{}, "bundle", True{})

def initial(limits: G.Limits, seen_bundle: Bool) -> Recursive.State:
  Recursive.State{visited(seen_bundle),
    Local.Budget{Whole.local_limits(limits), MTip{}, 0n, 0n, 0n, 0n}, 0n, []}

def source(facts: T.SourceFacts) -> Whole.Source:
  Whole.source(facts, 0n)

def build(fuel: Nat, signed: Signed.State, facts: Local.Facts,
    path: String, name: String, depth: Nat) -> Signed.Build:
  match signed:
    case Signed.State{state, work}:
      Signed.build(fuel, work, facts, path, name, Local.AnyKind{}, depth, state)

def seen(+state: Recursive.State, identity: String) -> Bool:
  Recursive.seen(state, identity)

def contains_target(+state: Recursive.State, path: String, identity: String) -> Bool:
  Recursive.value(
    Bool,
    Map.has(&2, Bool, Recursive.path_set(Recursive.state_budget(state), path), identity)
  )

def main() -> Unit:
  Unit{}
