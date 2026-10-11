import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./BOUNDARY.bend as Boundary
import ./RELATION.bend as Relation
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_LAWS.bend as Interpreter
import ./INTERPRETER_PROOF.bend as InterpreterProof
import ./INTERPRETER_INITIAL_PROOF.bend as Initial
import ./VISITED_PROOF.bend as Visited
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Actual observation discriminators; no tree shape or address premise is added.
def observed_flat_success(+flat: Spec.Flat, +state: Spec.State) -> {
  Relation.successful(Relation.observe_flat(flat, state)) == Measure.flat_success(flat) : Bool
}:
  match flat state:
    case Spec.Flat{_, _} Spec.State{_, _, _, _}: {==}
    case Spec.FlatFailure{} Spec.State{_, _, _, _}: {==}

def observed_dispatch_success(+fuel: Nat, +facts: Core.Facts, +path: String,
    +name: String, +expected: Core.ExpectedKind, +depth: Nat, +state: Spec.State,
    +result: Spec.DispatchResult) -> {
  Relation.successful(Relation.observe_dispatch(result, fuel))
    == Measure.projected_success(
      fuel,
      Spec.Request{facts, path, name, expected, depth, state},
      result
    )
    : Bool
}:
  match result:
    case Spec.BuildResult{Spec.Missing{Spec.State{_, _, _, _}}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: {==}
    case Spec.BuildResult{Spec.Built{+built_state, +tree}}:
      observed_flat_success(Spec.flatten(fuel, Spec.FlattenTree{tree}), built_state)
    case Spec.ListResult{Spec.ReferencesResult{_, _}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{_}}: {==}

def visited_valid(+state: Boundary.BoundaryState) -> {
  Patricia.canonical(Bool, Boundary.state_visited(state)) == True{} : Bool
}:
  match state:
    case Boundary.BoundaryState{visited, _, _, _, _, _, _}:
      Visited.identities_go_canonical(visited, MTip{}, {==})

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

def recursive_specification_completes(input, state, path, name, expected, depth):
  +saved = state
  +facts = Boundary.facts(input)
  +visited = Boundary.state_visited(saved)
  +budget = Boundary.state_budget(saved)
  +path = path
  +name = name
  +expected = expected
  +depth = depth
  +initial = {Spec.State{visited, budget, 0n, []} : Spec.State}
  +request = {Spec.Request{facts, path, name, expected, depth, initial} : Spec.Request}
  +fuel = Relation.spec_bound(facts)
  +result = Spec.interpret(fuel, request)
  %Equal.sym(Bool, Relation.successful(Relation.observe_dispatch(result, fuel)),
    Measure.projected_success(fuel, request, result),
    observed_dispatch_success(fuel, facts, path, name, expected, depth, initial, result)):
    {_ == True{} : Bool}
  Interpreter.interpret_and_flatten_complete(fuel, request, visited_valid(saved),
    Initial.root_rank_bounded(facts, name, expected, visited, visited_valid(saved)))

def main() -> Unit:
  Unit{}
