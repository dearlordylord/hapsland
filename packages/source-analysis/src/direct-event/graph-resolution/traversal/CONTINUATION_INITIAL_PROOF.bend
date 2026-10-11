import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RANK.bend as Rank
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_CHILD_PROOF.bend as Child
import ./CONTINUATION_EXPANSION_PROOF.bend as Expansion
import ./CONTINUATION_ROOT_PROJECTION_PROOF.bend as Projection
import ./CONTINUATION_ROOT_FUEL_PROOF.bend as Fuel
import ./CONTINUATION_MACHINE_PROOF.bend as Machine
import ./CONTINUATION_BOUND_PROOF.bend as Bound
import ./CONTINUATION_ADEQUATE_PROOF.bend as Adequate
import ./CONTINUATION_STATE_PROOF.bend as State
import ./INTERPRETER_ORDER_PROOF.bend as Order
import ./patricia-proof/PATRICIA_RELATION.bend as Patricia
import ./patricia-proof/PATRICIA_INSERT_PROOF.bend as Insert

def entered_valid(+facts: Core.Facts, +path: String, +visited: Map<&2, Bool>, +budget: Core.Budget,
    +declaration: Core.Declaration, +depth: Nat,
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
    case Core.Declaration{_, identity, _, _, _}: Insert.set_preserves_canonical(
      Bool,
      visited,
      identity,
      True{},
      valid
    )

def missing_exact(
  +fuel: Nat,
  +facts: Core.Facts,
  +path: String,
  +visited: Map<&2, Bool>,
  +budget: Core.Budget,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  found: {Spec.find_declaration(facts, symbol, expected) == None{} : Maybe<&2, Core.Declaration>}
) -> {
      Relation.observe_build(
        Child.root_result(
          (1n + fuel : Nat),
          Rank.initial(facts, path, visited, budget),
          symbol,
          expected,
          depth
        ),
        (1n + fuel : Nat)
      )
      == Relation.Absent{visited, budget}
      : Relation.Observation
    }:
  Equal.cong(
    Spec.Build,
    Relation.Observation,
    Fuel.observe_at((1n + fuel : Nat)),
    Child.root_result(
      (1n + fuel : Nat),
      Rank.initial(facts, path, visited, budget),
      symbol,
      expected,
      depth
    ),
    Spec.Missing{Spec.State{visited, budget, 0n, []}},
    Equal.cong(
      Maybe<&2, Core.Declaration>,
      Spec.Build,
      Child.walk_at(facts, path, Spec.State{visited, budget, 0n, []}, depth, fuel),
      Spec.find_declaration(facts, symbol, expected),
      None{},
      found
    )
  )

def selected_exact(
  +facts: Core.Facts,
  +path: String,
  +visited: Map<&2, Bool>,
  +budget: Core.Budget,
  +declaration: Core.Declaration,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  +valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  found: {
    Spec.find_declaration(facts, symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Continuation.observe(
        CoreTraversal.enter_node(Rank.initial(facts, path, visited, budget), declaration, depth)
      )
      == Relation.observe_build(
        Child.root_result(
          Relation.spec_bound(facts),
          Rank.initial(facts, path, visited, budget),
          symbol,
          expected,
          depth
        ),
        Relation.spec_bound(facts)
      )
      : Relation.Observation
    }:
  +base = Rank.initial(facts, path, visited, budget)
  +entered = CoreTraversal.enter_node(base, declaration, depth)
  +bound = Continuation.bound(CoreTraversal.machine_facts(entered), State.frames(entered))
  +original = Relation.spec_bound(facts)
  +fuel = Adequate.common(bound, 0n, original)
  +left = (1n + fuel : Nat)
  %Machine.adequate_evaluation_exact(
    fuel,
    entered,
    entered_valid(facts, path, visited, budget, declaration, depth, valid),
    Adequate.monotone(
      State.frames(entered),
      CoreTraversal.machine_facts(entered),
      bound,
      fuel,
      Bound.actual_bound_adequate(CoreTraversal.machine_facts(entered), State.frames(entered)),
      Adequate.first(bound, 0n, original)
    )
  ):
    {
      _
      == Relation.observe_build(
        Child.root_result(original, base, symbol, expected, depth),
        original
      )
      : Relation.Observation
    }
  %Projection.entered_root(
    facts,
    path,
    visited,
    budget,
    declaration,
    symbol,
    expected,
    depth,
    fuel,
    found
  ):
    {
      _
      == Relation.observe_build(
        Child.root_result(original, base, symbol, expected, depth),
        original
      )
      : Relation.Observation
    }
  Fuel.roots_equal(
    left,
    original,
    base,
    symbol,
    expected,
    depth,
    Expansion.root_complete(
      left,
      base,
      symbol,
      expected,
      depth,
      valid,
      Adequate.successor(original, fuel, Adequate.third(bound, 0n, original))
    ),
    Expansion.root_complete(original, base, symbol, expected, depth, valid, Order.le_refl(original))
  )

def found_exact(
  +found: Maybe<&2, Core.Declaration>,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +visited: Map<&2, Bool>,
  +budget: Core.Budget,
  +depth: Nat,
  +valid: {Patricia.canonical(Bool, visited) == True{} : Bool},
  selected: {Spec.find_declaration(facts, symbol, expected) == found : Maybe<&2, Core.Declaration>}
) -> {
      Continuation.start(found, facts, path, visited, budget, depth)
      == Relation.observe_build(
        Child.root_result(
          Relation.spec_bound(facts),
          Rank.initial(facts, path, visited, budget),
          symbol,
          expected,
          depth
        ),
        Relation.spec_bound(facts)
      )
      : Relation.Observation
    }:
  match found:
    case Some{declaration}: selected_exact(
      facts,
      path,
      visited,
      budget,
      declaration,
      symbol,
      expected,
      depth,
      valid,
      selected
    )
    case None{}:
      +base = Rank.initial(facts, path, visited, budget)
      +original = Relation.spec_bound(facts)
      +left = (1n + original : Nat)
      %missing_exact(original, facts, path, visited, budget, symbol, expected, depth, selected):
        {
          _
          == Relation.observe_build(
            Child.root_result(original, base, symbol, expected, depth),
            original
          )
          : Relation.Observation
        }
      Fuel.roots_equal(
        left,
        original,
        base,
        symbol,
        expected,
        depth,
        Expansion.root_complete(
          left,
          base,
          symbol,
          expected,
          depth,
          valid,
          Adequate.successor(original, original, Order.le_refl(original))
        ),
        Expansion.root_complete(
          original,
          base,
          symbol,
          expected,
          depth,
          valid,
          Order.le_refl(original)
        )
      )

law initial_recursive_exact:
  for +facts: Core.Facts
  for +path: String
  for +name: String
  for +expected: Core.ExpectedKind
  for +visited: Map<&2, Bool>
  for +budget: Core.Budget
  for +depth: Nat
  for valid: {Patricia.canonical(Bool, visited) == True{} : Bool}
  {
    Continuation.initial(facts, path, name, expected, visited, budget, depth)
    == Relation.spec_observation(facts, path, name, expected, visited, budget, depth)
    : Relation.Observation
  }

def initial_recursive_exact(facts, path, name, expected, visited, budget, depth, valid):
  %Fuel.dispatch_exact(
    Relation.spec_bound(facts),
    facts,
    path,
    name,
    expected,
    depth,
    Spec.State{visited, budget, 0n, []}
  ):
    {
      Continuation.initial(facts, path, name, expected, visited, budget, depth)
      == _
      : Relation.Observation
    }
  found_exact(
    Spec.find_declaration(facts, name, expected),
    facts,
    path,
    name,
    expected,
    visited,
    budget,
    depth,
    valid,
    {==}
  )
