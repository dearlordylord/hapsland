import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RANK.bend as Rank
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_CHILD_PROOF.bend as Child
import ./CONTINUATION_STATE_PROOF.bend as State
import ./CONTINUATION_MACHINE_PROOF.bend as Machine

# Exact actual root construction and ordered node prefix, including failure.
def node_flat(+flat: Spec.Flat, +state: Spec.State, +owner: Nat, +artifact: Nat,
    +facts: Core.Facts, +path: String, +fuel: Nat) -> {
  Relation.observe_flat(Spec.flat_node(flat, owner, artifact), state)
    == Continuation.after_flat(flat, state, Spec.Flat{[Core.PlannedNode{owner, artifact}], []},
      Continuation.resume([], facts, path, fuel)) : Relation.Observation
}:
  match flat:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{_, _}: {==}

def result_node(+result: Spec.DispatchResult, +owner: Nat, +artifact: Nat,
    +facts: Core.Facts, +path: String, +fuel: Nat) -> {
      Relation.observe_build(
        Spec.tree_result(Spec.as_references(result), owner, artifact),
        (1n + fuel : Nat)
      )
      == Continuation.after_references(
        result,
        owner,
        0n,
        Spec.Flat{[Core.PlannedNode{owner, artifact}], []},
        fuel,
        Continuation.resume([], facts, path, fuel)
      )
      : Relation.Observation
    }:
  match result:
    case Spec.ListResult{Spec.ReferencesResult{state, references}}:
      node_flat(
        Spec.flatten(fuel, Spec.FlattenReferences{owner, 0n, references}),
        state,
        owner,
        artifact,
        facts,
        path,
        fuel
      )
    case Spec.ListResult{Spec.ReferencesFailure{_}}: {==}
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: {==}

def entered_root(
  +facts: Core.Facts,
  +path: String,
  +visited: Map<&2, Bool>,
  +budget: Core.Budget,
  +declaration: Core.Declaration,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  +fuel: Nat,
  found: {
    Spec.find_declaration(facts, symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
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
      == Machine.evaluate(
        fuel,
        CoreTraversal.enter_node(Rank.initial(facts, path, visited, budget), declaration, depth)
      )
      : Relation.Observation
    }:
  match declaration:
    case Core.Declaration{+artifact, +identity, +function, +bundled, +items}:
      +declaration = {Core.Declaration{artifact, identity, function, bundled, items} : Core.Declaration}
      +base = Rank.initial(facts, path, visited, budget)
      +entered = CoreTraversal.enter_node(base, declaration, depth)
      %Equal.sym(
        Spec.Build,
        Child.root_result((1n + fuel : Nat), base, symbol, expected, depth),
        Spec.tree_result(
          Spec.as_references(
            Spec.interpret(
              fuel,
              Child.child_request(
                base,
                declaration,
                depth,
                Spec.enter(State.state(base), path, identity)
              )
            )
          ),
          0n,
          artifact
        ),
        Child.root_build_exact(fuel, base, declaration, symbol, expected, depth, found)
      ):
        {
          Relation.observe_build(_, (1n + fuel : Nat))
          == Machine.evaluate(fuel, entered)
          : Relation.Observation
        }
      %Child.enter_state_exact(base, declaration, depth):
        {
          Relation.observe_build(
            Spec.tree_result(
              Spec.as_references(
                Spec.interpret(fuel, Spec.ReferencesRequest{items, facts, path, 0n, 0n, depth, _})
              ),
              0n,
              artifact
            ),
            (1n + fuel : Nat)
          )
          == Machine.evaluate(fuel, entered)
          : Relation.Observation
        }
      result_node(
        Spec.interpret(
          fuel,
          Spec.ReferencesRequest{items, facts, path, 0n, 0n, depth, State.state(entered)}
        ),
        0n,
        artifact,
        facts,
        path,
        fuel
      )
