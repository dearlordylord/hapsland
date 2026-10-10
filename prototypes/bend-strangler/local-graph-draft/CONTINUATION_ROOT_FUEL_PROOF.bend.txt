import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION_CHILD_PROOF.bend as Child
import ./CONTINUATION_EXPANSION_PROOF.bend as Expansion
import ./INTERPRETER_COMPLETION_RELATION.bend as C
import ./FUEL_COHERENCE_LAWS.bend as Fuel
import ./FUEL_COHERENCE_PROOF.bend as FuelProof

# Compare the full completed root observation at two arbitrary adequate fuels.
def observe_at(fuel: Nat, result: Spec.Build) -> Relation.Observation:
  Relation.observe_build(result, fuel)

def flat_at(state: Spec.State, flat: Spec.Flat) -> Relation.Observation:
  Relation.observe_flat(flat, state)

def same_build(+result: Spec.Build, +left: Nat, +right: Nat,
    left_complete: {C.build_complete(left, result) == True{} : Bool},
    right_complete: {C.build_complete(right, result) == True{} : Bool}) -> {
      Relation.observe_build(result, left)
      == Relation.observe_build(result, right)
      : Relation.Observation
    }:
  match result:
    case Spec.Missing{Spec.State{_, _, _, _}}: {==}
    case Spec.InsufficientBound{_}: {==}
    case Spec.Built{state, +tree}:
      Equal.cong(
        Spec.Flat,
        Relation.Observation,
        flat_at(state),
        Spec.flatten(left, Spec.FlattenTree{tree}),
        Spec.flatten(right, Spec.FlattenTree{tree}),
        Fuel.successful_flattenings_equal(
          left,
          right,
          Spec.FlattenTree{tree},
          left_complete,
          right_complete
        )
      )

def equal_builds(+a: Spec.Build, +b: Spec.Build, +left: Nat, +right: Nat,
    +same: {a == b : Spec.Build},
    left_complete: {C.build_complete(left, a) == True{} : Bool},
    right_complete: {C.build_complete(right, b) == True{} : Bool}) -> {
  Relation.observe_build(a, left) == Relation.observe_build(b, right) : Relation.Observation
}:
  right_at_left = Equal.trans(Bool, C.build_complete(right, a), C.build_complete(right, b), True{},
    Equal.cong(Spec.Build, Bool, C.build_complete(right), a, b, same), right_complete)
  Equal.trans(
    Relation.Observation,
    Relation.observe_build(a, left),
    Relation.observe_build(a, right),
    Relation.observe_build(b, right),
    same_build(a, left, right, left_complete, right_at_left),
    Equal.cong(Spec.Build, Relation.Observation, observe_at(right), a, b, same)
  )

def roots_equal(
  +left: Nat,
  +right: Nat,
  +machine: Core.Machine,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  +left_complete: {
    C.build_complete(left, Child.root_result(left, machine, symbol, expected, depth))
    == True{}
    : Bool
  },
  +right_complete: {
    C.build_complete(right, Child.root_result(right, machine, symbol, expected, depth))
    == True{}
    : Bool
  }
) -> {
      Relation.observe_build(Child.root_result(left, machine, symbol, expected, depth), left)
      == Relation.observe_build(Child.root_result(right, machine, symbol, expected, depth), right)
      : Relation.Observation
    }:
  equal_builds(
    Child.root_result(left, machine, symbol, expected, depth),
    Child.root_result(right, machine, symbol, expected, depth),
    left,
    right,
    Expansion.root_results_equal(
      left,
      right,
      machine,
      symbol,
      expected,
      depth,
      left_complete,
      right_complete
    ),
    left_complete,
    right_complete
  )

def dispatch_exact(+fuel: Nat, +facts: Core.Facts, +path: String, +name: String,
    +expected: Core.ExpectedKind, +depth: Nat, +state: Spec.State) -> {
      Relation.observe_build(
        Spec.as_build(
          Spec.interpret(fuel, Spec.Request{facts, path, name, expected, depth, state})
        ),
        fuel
      )
      == Relation.observe_dispatch(
        Spec.interpret(fuel, Spec.Request{facts, path, name, expected, depth, state}),
        fuel
      )
      : Relation.Observation
    }:
  match fuel:
    case 0n: {==}
    case 1n++rest: {==}
