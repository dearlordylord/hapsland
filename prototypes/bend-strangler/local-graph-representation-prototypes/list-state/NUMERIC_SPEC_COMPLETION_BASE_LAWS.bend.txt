import Base
import ./Own.bend as Own
import ./RANK.bend as Rank
import ./core.bend as Core
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_COMPLETION.bend as Complete

# The actual root dispatcher returns the build variant, even at zero fuel.
law interpret_root_conversion_exact:
  for +fuel: Nat
  for +facts: Core.Facts
  for +path: Nat
  for +name: Core.Label
  for +expected: Core.ExpectedKind
  for +depth: Nat
  for +state: Spec.State
  {
    Measure.successful_build(
      Spec.as_build(Spec.interpret(fuel, Spec.Request{facts, path, name, expected, depth, state}))
    )
    == Measure.successful(
      Spec.interpret(fuel, Spec.Request{facts, path, name, expected, depth, state})
    )
    : Bool
  }

# The actual references dispatcher returns the list variant, even at zero fuel.
law interpret_references_conversion_exact:
  for +fuel: Nat
  for +items: List<&2, Core.Reference>
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  {
    Measure.successful_references(
      Spec.as_references(
        Spec.interpret(fuel, Spec.ReferencesRequest{items, facts, path, owner, index, depth, state})
      )
    )
    == Measure.successful(
      Spec.interpret(fuel, Spec.ReferencesRequest{items, facts, path, owner, index, depth, state})
    )
    : Bool
  }

# Seen uses dictionary membership, including a stored False and raw duplicate keys.
law seen_membership_exact:
  for +state: Spec.State
  for +identity: Nat
  {Spec.seen(state, identity) == Own.contains(Bool, Measure.visited(state), identity) : Bool}

# Root entry performs the exact visited insertion used by the rank decrease.
law enter_visited_exact:
  for +state: Spec.State
  for +path: Nat
  for +identity: Nat
  {
    Measure.visited(Spec.enter(state, path, identity))
    == Own.set(Bool, Measure.visited(state), identity, True{})
    : Own.Dictionary<Bool>
  }

# Full reference interpretation cannot increase any raw catalog's unseen weight.
# This does not assume completion and includes partial recursive failures.
law reference_catalog_weight_nonincreasing:
  for +fuel: Nat
  for +reference: Core.Reference
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  {
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
        ), catalog
      ),
      Rank.unseen_catalog(Measure.visited(state), catalog)
    )
    == True{}
    : Bool
  }

# Declaration case transport for the full raw-catalog reference weight bound.
law reference_declaration_weight_nonincreasing:
  for +fuel: Nat
  for +reference: Core.Reference
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  for +declaration: Maybe<&2, Core.Declaration>
  {
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
    == True{}
    : Bool
  }
