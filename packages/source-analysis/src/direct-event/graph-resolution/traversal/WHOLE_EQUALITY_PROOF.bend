import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./BOUNDARY.bend as Boundary
import ./RELATION.bend as Relation
import ./RANK.bend as Rank
import ./INITIAL_RANK_PROOF.bend as Initial
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_RUN_PROOF.bend as Run
import ./CONTINUATION_INITIAL_PROOF.bend as Recursive
import ./CONTINUATION_STATE_PROOF.bend as State
import ./PRODUCTION_COMPLETION_PROOF.bend as Production
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia
import ../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

def found_exact(+found: Maybe<&2, Core.Declaration>, +facts: Core.Facts,
    +path: String, +visited: Map<&2, Bool>, +budget: Core.Budget, +depth: Nat, +key: String,
    +valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
    selected: {Core.map_result(Maybe<&2, Core.Declaration>,
      Map.get(Maybe<&2, Core.Declaration>, None{}, Rank.declaration_catalog(facts), key))
      == found : Maybe<&2, Core.Declaration>}) -> {
  Relation.observe_core(CoreTraversal.plan_found(found, facts, path, visited, budget, depth))
    == Continuation.start(found, facts, path, visited, budget, depth) : Relation.Observation
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
      Run.run_observation_exact(fuel, machine,
        Production.entered_valid(facts, path, visited, budget, declaration, depth, valid), enough)

def plan_initial_exact(+facts: Core.Facts, +path: String, +name: String,
    +expected: Core.ExpectedKind, +visited: Map<&2, Bool>, +budget: Core.Budget, +depth: Nat,
    valid: {Patricia.canonical(Bool, visited) == True{} : Bool}) -> {
      Relation.observe_core(CoreTraversal.plan(facts, path, name, expected, visited, budget, depth))
      == Continuation.initial(facts, path, name, expected, visited, budget, depth)
      : Relation.Observation
    }:
  match facts:
    case Core.Facts{+aware, +declarations, +imports, +supporting}:
      +saved = {Core.Facts{aware, declarations, imports, supporting} : Core.Facts}
      %State.declaration_lookup_exact(saved, name, expected):
        {Relation.observe_core(CoreTraversal.plan(saved, path, name, expected, visited, budget, depth))
          == Continuation.start(_, saved, path, visited, budget, depth) : Relation.Observation}
      found_exact(
        CoreTraversal.declaration_lookup(saved, name, expected),
        saved,
        path,
        visited,
        budget,
        depth,
        CoreTraversal.lookup_key(aware, expected, name),
        valid,
        {==}
      )

# Exact original whole-law statement; no new premises or replacement domain.
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

def whole_local_graph_exact(input, state, path, name, expected, depth):
  +facts = Boundary.facts(input)
  +visited = Boundary.state_visited(state)
  +budget = Boundary.state_budget(state)
  +valid = Production.visited_valid(state)
  Equal.trans(Relation.Observation,
    Relation.observe_core(CoreTraversal.plan(facts, path, name, expected, visited, budget, depth)),
    Continuation.initial(facts, path, name, expected, visited, budget, depth),
    Relation.spec_observation(facts, path, name, expected, visited, budget, depth),
    plan_initial_exact(facts, path, name, expected, visited, budget, depth, valid),
    Recursive.initial_recursive_exact(facts, path, name, expected, visited, budget, depth, valid))
