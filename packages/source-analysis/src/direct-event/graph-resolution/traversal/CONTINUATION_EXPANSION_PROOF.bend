import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_CHILD_PROOF.bend as Child
import ./CONTINUATION_STATE_PROOF.bend as State
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_COMPLETION_RELATION.bend as C
import ./INTERPRETER_INITIAL_PROOF.bend as Initial
import ./INTERPRETER_LAWS.bend as Interpreter
import ./INTERPRETER_PROOF.bend as InterpreterProof
import ./INTERPRETER_ORDER_PROOF.bend as Order
import ./FUEL_COHERENCE.bend as Coherence
import ./FUEL_COHERENCE_LAWS.bend as Fuel
import ./FUEL_COHERENCE_PROOF.bend as FuelProof
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# The original universal root bound suffices at every selected local child.
# No unseen-root or reachability premise is introduced for this transport.
def root_projection(
  +fuel: Nat,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  +state: Spec.State,
  +result: Spec.DispatchResult
) -> {
  Measure.projected_success(fuel, Spec.Request{facts, path, symbol, expected, depth, state}, result)
    == C.build_complete(fuel, Spec.as_build(result)) : Bool
}:
  match result:
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: {==}
    case Spec.ListResult{Spec.ReferencesResult{_, _}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{_}}: {==}

def root_complete(
  +fuel: Nat,
  +machine: Core.Machine,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  +valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool}
) -> {
  C.build_complete(fuel, Child.root_result(fuel, machine, symbol, expected, depth)) == True{} : Bool
}:
  match machine:
    case Core.Machine{+facts, +path, _, +visited, +budget, +address, _, _, +pending}:
      +state = {Spec.State{visited, budget, address, pending} : Spec.State}
      +request = {Spec.Request{facts, path, symbol, expected, depth, state} : Spec.Request}
      actual = Interpreter.interpret_and_flatten_complete(
        fuel,
        request,
        valid,
        Order.le_trans(
          Measure.root_rank(facts, symbol, expected, visited),
          Relation.spec_bound(facts),
          fuel,
          Initial.root_rank_bounded(facts, symbol, expected, visited, valid),
          enough
        )
      )
      Equal.trans(
        Bool,
        C.build_complete(fuel, Spec.as_build(Spec.interpret(fuel, request))),
        Measure.projected_success(fuel, request, Spec.interpret(fuel, request)),
        True{},
        Equal.sym(
          Bool,
          Measure.projected_success(fuel, request, Spec.interpret(fuel, request)),
          C.build_complete(fuel, Spec.as_build(Spec.interpret(fuel, request))),
          root_projection(
            fuel,
            facts,
            path,
            symbol,
            expected,
            depth,
            state,
            Spec.interpret(fuel, request)
          )
        ),
        actual
      )

def build_projection_completed(+fuel: Nat, +result: Spec.DispatchResult,
    complete: {C.build_complete(fuel, Spec.as_build(result)) == True{} : Bool}) -> {
  Coherence.completed(result) == True{} : Bool
}:
  match result:
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: complete
    case Spec.ListResult{Spec.ReferencesResult{_, _}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{_}}: complete

def root_results_equal(
  +left: Nat,
  +right: Nat,
  +machine: Core.Machine,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  left_complete: {
    C.build_complete(left, Child.root_result(left, machine, symbol, expected, depth))
    == True{}
    : Bool
  },
  right_complete: {
    C.build_complete(right, Child.root_result(right, machine, symbol, expected, depth))
    == True{}
    : Bool
  }
) -> {
  Child.root_result(left, machine, symbol, expected, depth)
    == Child.root_result(right, machine, symbol, expected, depth) : Spec.Build
}:
  +request = {Spec.Request{CoreTraversal.machine_facts(machine), CoreTraversal.machine_path(machine), symbol,
    expected, depth, State.state(machine)} : Spec.Request}
  Equal.cong(Spec.DispatchResult, Spec.Build, Spec.as_build,
    Spec.interpret(left, request), Spec.interpret(right, request),
    Fuel.completed_interpretations_equal(left, right, request,
      build_projection_completed(left, Spec.interpret(left, request), left_complete),
      build_projection_completed(right, Spec.interpret(right, request), right_complete)))

def finish_flat(state: Spec.State, prefix: Spec.Flat, owner: Nat, index: Nat,
    symbol: String, address: Nat, next: Continuation.Progress -> Relation.Observation,
    flat: Spec.Flat) -> Relation.Observation:
  Continuation.after_flat(
    Spec.flat_slot(flat, owner, index, symbol, Core.Expanded{address}),
    state,
    prefix,
    next
  )

def same_build_fuels(+result: Spec.Build, +left: Nat, +right: Nat, +symbol: String,
    +owner: Nat, +index: Nat, +prefix: Spec.Flat,
    left_complete: {C.build_complete(left, result) == True{} : Bool},
    right_complete: {C.build_complete(right, result) == True{} : Bool},
    next: Continuation.Progress -> Relation.Observation) -> {
      Child.reference_next(Spec.expanded_result(result, symbol), left, owner, index, prefix, next)
      == Child.reference_next(
        Spec.expanded_result(result, symbol),
        right,
        owner,
        index,
        prefix,
        next
      )
      : Relation.Observation
    }:
  match result:
    case Spec.Missing{_}: {==}
    case Spec.InsufficientBound{_}: {==}
    case Spec.Built{+state, Spec.Tree{+address, +artifact, +references}}:
      +request = {Spec.FlattenTree{Spec.Tree{address, artifact, references}} : Spec.FlattenRequest}
      Equal.cong(
        Spec.Flat,
        Relation.Observation,
        finish_flat(state, prefix, owner, index, symbol, address, next),
        Spec.flatten(left, request),
        Spec.flatten(right, request),
        Fuel.successful_flattenings_equal(left, right, request, left_complete, right_complete)
      )

def equal_build_fuels(+left_result: Spec.Build, +right_result: Spec.Build,
    +left: Nat, +right: Nat, +symbol: String, +owner: Nat, +index: Nat, +prefix: Spec.Flat,
    left_complete: {C.build_complete(left, left_result) == True{} : Bool},
    right_complete: {C.build_complete(right, right_result) == True{} : Bool},
    +same: {left_result == right_result : Spec.Build},
    next: Continuation.Progress -> Relation.Observation) -> {
      Child.reference_next(
        Spec.expanded_result(left_result, symbol),
        left,
        owner,
        index,
        prefix,
        next
      )
      == Child.reference_next(
        Spec.expanded_result(right_result, symbol),
        right,
        owner,
        index,
        prefix,
        next
      )
      : Relation.Observation
    }:
  transported = Equal.trans(
    Bool,
    C.build_complete(right, left_result),
    C.build_complete(right, right_result),
    True{},
    Equal.cong(Spec.Build, Bool, C.build_complete(right), left_result, right_result, same),
    right_complete
  )
  %same:
    {
      Child.reference_next(
        Spec.expanded_result(left_result, symbol),
        left,
        owner,
        index,
        prefix,
        next
      )
      == Child.reference_next(Spec.expanded_result(_, symbol), right, owner, index, prefix, next)
      : Relation.Observation
    }
  same_build_fuels(
    left_result,
    left,
    right,
    symbol,
    owner,
    index,
    prefix,
    left_complete,
    transported,
    next
  )

def root_fuels_equal(
  +left: Nat,
  +right: Nat,
  +machine: Core.Machine,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  +owner: Nat,
  +index: Nat,
  +prefix: Spec.Flat,
  +left_complete: {
    C.build_complete(left, Child.root_result(left, machine, symbol, expected, depth))
    == True{}
    : Bool
  },
  +right_complete: {
    C.build_complete(right, Child.root_result(right, machine, symbol, expected, depth))
    == True{}
    : Bool
  },
  next: Continuation.Progress -> Relation.Observation
) -> {
      Child.reference_next(
        Spec.expanded_result(Child.root_result(left, machine, symbol, expected, depth), symbol),
        left,
        owner,
        index,
        prefix,
        next
      )
      == Child.reference_next(
        Spec.expanded_result(Child.root_result(right, machine, symbol, expected, depth), symbol),
        right,
        owner,
        index,
        prefix,
        next
      )
      : Relation.Observation
    }:
  equal_build_fuels(
    Child.root_result(left, machine, symbol, expected, depth),
    Child.root_result(right, machine, symbol, expected, depth),
    left,
    right,
    symbol,
    owner,
    index,
    prefix,
    left_complete,
    right_complete,
    root_results_equal(
      left,
      right,
      machine,
      symbol,
      expected,
      depth,
      left_complete,
      right_complete
    ),
    next
  )
