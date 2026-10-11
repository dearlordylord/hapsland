import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_COMPLETION.bend as Complete

# Actual typed expressions for pre-proof complete-dispatch falsification.
def root_conversion(fuel: Nat, facts: Core.Facts, path: Nat, name: Core.Label,
    expected: Core.ExpectedKind, depth: Nat, state: Spec.State) -> Bool:
  Measure.successful_build(
    Spec.as_build(Spec.interpret(fuel, Spec.Request{facts, path, name, expected, depth, state}))
  )

def references_conversion(fuel: Nat, items: List<&2, Core.Reference>, facts: Core.Facts,
    path: Nat, owner: Nat, index: Nat, depth: Nat, state: Spec.State) -> Bool:
  Measure.successful_references(
    Spec.as_references(
      Spec.interpret(fuel, Spec.ReferencesRequest{items, facts, path, owner, index, depth, state})
    )
  )

def seen_membership(state: Spec.State, identity: Nat) -> Bool:
  Spec.seen(state, identity)

def enter_visited(state: Spec.State, path: Nat, identity: Nat) -> Own.Dictionary<Bool>:
  Measure.visited(Spec.enter(state, path, identity))

def expected_enter(visited: Own.Dictionary<Bool>, identity: Nat) -> Own.Dictionary<Bool>:
  Own.set(Bool, visited, identity, True{})

def reference_catalog_weight_nonincreasing(fuel: Nat, reference: Core.Reference,
    facts: Core.Facts, path: Nat, owner: Nat, index: Nat, depth: Nat,
    +state: Spec.State, +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>) -> Bool:
  Nat.is_le(
    Rank.unseen_catalog(
      Member.reference_visited(
        Spec.reference(
          reference,
          facts,
          path,
          owner,
          index,
          depth,
          state,
          Spec.build_child(Spec.interpret(fuel))
        )
      ),
      catalog
    ),
    Rank.unseen_catalog(Measure.visited(state), catalog)
  )

def reference_declaration_weight_nonincreasing(fuel: Nat, reference: Core.Reference,
    facts: Core.Facts, path: Nat, owner: Nat, index: Nat, depth: Nat,
    +state: Spec.State, +declaration: Maybe<&2, Core.Declaration>) -> Bool:
  Nat.is_le(
    Rank.unseen_declaration(
      Member.reference_visited(
        Spec.reference(
          reference,
          facts,
          path,
          owner,
          index,
          depth,
          state,
          Spec.build_child(Spec.interpret(fuel))
        )
      ),
      declaration
    ),
    Rank.unseen_declaration(Measure.visited(state), declaration)
  )
