import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./BOUNDARY.bend as Boundary

# Observations preserve the complete flat plan, handles, ordered pending and state.
# Exhaustion is explicit and is excluded by separate success laws.
type Observation is Data:
  Present{plan: Core.Plan}
  Absent{visited: Map<&2, Bool>, budget: Core.Budget}
  Failed{}

def observe_core(result: Core.RunResult) -> Observation:
  match result:
    case Core.CompletePlan{plan}: Present{plan}
    case Core.MissingRoot{visited, budget}: Absent{visited, budget}
    case Core.InvariantFailure{_}: Failed{}

def count_declaration(declaration: Maybe<&2, Core.Declaration>) -> Nat:
  match declaration:
    case None{}: 0n
    case Some{Core.Declaration{_, _, _, _, references}}: List.length(&2, Core.Reference, references)

def count_catalog(items: List<&2, Maybe<&2, Core.Declaration>>) -> Nat:
  match items:
    case []: 0n
    case head <> tail: (count_declaration(head) + count_catalog(tail) : Nat)

# Independent recursive dispatcher: E+2B calls, E<=R and B<=E+1.
# The proposed bound still requires a universal proof, not a test assumption.
def spec_bound(facts: Core.Facts) -> Nat:
  match facts:
    case Core.Facts{_, declarations, _, _}:
      (3n * count_catalog(Map.values(&2, Maybe<&2, Core.Declaration>, declarations)) + 3n : Nat)

def observe_flat(flat: Spec.Flat, state: Spec.State) -> Observation:
  match flat state:
    case Spec.Flat{nodes, references} Spec.State{visited, budget, _, pending_rev}:
      Present{
        Core.Plan{
          0n,
          nodes,
          references,
          List.reverse(&2, Core.Pending, pending_rev),
          visited,
          budget
        }
      }
    case _ _: Failed{}

def observe_build(build: Spec.Build, fuel: Nat) -> Observation:
  match build:
    case Spec.Missing{Spec.State{visited, budget, _, _}}: Absent{visited, budget}
    case Spec.InsufficientBound{_}: Failed{}
    case Spec.Built{state, tree}: observe_flat(Spec.flatten(fuel, Spec.FlattenTree{tree}), state)

def observe_dispatch(result: Spec.DispatchResult, fuel: Nat) -> Observation:
  match result:
    case Spec.BuildResult{build}: observe_build(build, fuel)
    case Spec.ListResult{_}: Failed{}

def spec_observation(+facts: Core.Facts, path: String, name: String, expected: Core.ExpectedKind,
    visited: Map<&2, Bool>, budget: Core.Budget, depth: Nat) -> Observation:
  observe_dispatch(Spec.interpret(spec_bound(facts), Spec.Request{facts, path, name, expected,
    depth, Spec.State{visited, budget, 0n, []}}), spec_bound(facts))

def core_observation(input: Boundary.BoundaryFacts, +state: Boundary.BoundaryState,
    path: String, name: String, expected: Core.ExpectedKind, depth: Nat) -> Observation:
  observe_core(Core.plan(Boundary.facts(input), path, name, expected,
    Boundary.state_visited(state), Boundary.state_budget(state), depth))

def recursive_observation(input: Boundary.BoundaryFacts, +state: Boundary.BoundaryState,
    path: String, name: String, expected: Core.ExpectedKind, depth: Nat) -> Observation:
  spec_observation(Boundary.facts(input), path, name, expected,
    Boundary.state_visited(state), Boundary.state_budget(state), depth)

def successful(observation: Observation) -> Bool:
  match observation:
    case Failed{}: False{}
    case _: True{}
