import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./BOUNDARY.bend as Boundary
import ./RELATION.bend as Relation
import ./RANK.bend as Rank
import ./INITIAL_RANK_PROOF.bend as Initial
import ./RUN_RANK_PROOF.bend as Run
import ./VISITED_PROOF.bend as Visited
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia
import ../representations/list-state/PATRICIA_INSERT_PROOF.bend as Insert
import ../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

# The observation discriminator transports actual completion, not equality of failures.
def observed_success(+result: Core.RunResult) -> {
  Relation.successful(Relation.observe_core(result)) == Rank.successful(result) : Bool
}:
  match result:
    case Core.CompletePlan{_}: {==}
    case Core.MissingRoot{_, _}: {==}
    case Core.InvariantFailure{_}: {==}

def visited_valid(+state: Boundary.BoundaryState) -> {
  Patricia.canonical(Bool, Boundary.state_visited(state)) == True{} : Bool
}:
  match state:
    case Boundary.BoundaryState{visited, _, _, _, _, _, _}:
      Visited.identities_go_canonical(visited, MTip{}, {==})

def entered_valid(+facts: Core.Facts, +path: String, +visited: Map<&2, Bool>,
  +budget: Core.Budget, +declaration: Core.Declaration, +depth: Nat,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool}) -> {
    Patricia.canonical(
      Bool,
      CoreTraversal.machine_visited(
        CoreTraversal.enter_node(Rank.initial(facts, path, visited, budget), declaration, depth)
      )
    )
    == True{}
    : Bool
  }:
  match declaration:
    case Core.Declaration{_, identity, _, _, _}:
      Insert.set_preserves_canonical(Bool, visited, identity, True{}, valid)

def found_completes(+found: Maybe<&2, Core.Declaration>, +facts: Core.Facts,
  +path: String, +visited: Map<&2, Bool>, +budget: Core.Budget, +depth: Nat, +key: String,
  +valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  selected: {Core.map_result(Maybe<&2, Core.Declaration>,
    Map.get(Maybe<&2, Core.Declaration>, None{}, Rank.declaration_catalog(facts), key))
    == found : Maybe<&2, Core.Declaration>}) -> {
  Rank.successful(CoreTraversal.plan_found(found, facts, path, visited, budget, depth)) == True{} : Bool
}:
  match found:
    case None{}: {==}
    case Some{+declaration}:
      +machine = CoreTraversal.enter_node(Rank.initial(facts, path, visited, budget), declaration, depth)
      +fuel = CoreTraversal.traversal_bound(facts)
      bound = Initial.initial_rank_bound(
        facts,
        path,
        visited,
        budget,
        key,
        declaration,
        depth,
        valid,
        selected
      )
      enough = NatFacts.le_trans(Rank.rank(machine), (Rank.rank(machine) + 1n : Nat), fuel,
        NatFacts.le_add_right(Rank.rank(machine), 1n), bound)
      Run.run_completes_from_rank(fuel, machine,
        entered_valid(facts, path, visited, budget, declaration, depth, valid), enough)

def plan_completes(+facts: Core.Facts, +path: String, +name: String,
  +expected: Core.ExpectedKind, +visited: Map<&2, Bool>, +budget: Core.Budget, +depth: Nat,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool}) -> {
  Rank.successful(CoreTraversal.plan(facts, path, name, expected, visited, budget, depth)) == True{} : Bool
}:
  match facts:
    case Core.Facts{+aware, +declarations, +imports, +supporting}:
      +saved = {Core.Facts{aware, declarations, imports, supporting} : Core.Facts}
      found_completes(CoreTraversal.declaration_lookup(saved, name, expected), saved, path, visited, budget,
        depth, CoreTraversal.lookup_key(aware, expected, name), valid, {==})

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

def production_traversal_completes(input, state, path, name, expected, depth):
  +saved = state
  +facts = Boundary.facts(input)
  +visited = Boundary.state_visited(saved)
  +budget = Boundary.state_budget(saved)
  +path = path
  +name = name
  +expected = expected
  +depth = depth
  +result = CoreTraversal.plan(facts, path, name, expected, visited, budget, depth)
  %Equal.sym(Bool, Relation.successful(Relation.observe_core(result)), Rank.successful(result),
    observed_success(result)):
    {_ == True{} : Bool}
  plan_completes(facts, path, name, expected, visited, budget, depth, visited_valid(saved))

def main() -> Unit:
  Unit{}
