import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./RANK.bend as Rank
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_BOUND_PROOF.bend as Bound
import ./CONTINUATION_FUEL_PROOF.bend as Fuel
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_LAWS.bend as Interpreter
import ./INTERPRETER_PROOF.bend as InterpreterProof
import ./INTERPRETER_ORDER_PROOF.bend as Order
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Change only the parent continuation fuel; the actual first-frame interpreter
# and its flatten fuel stay fixed. This is an internal full-step transport.
def result_suffix(
  +result: Spec.DispatchResult,
  +owner: Nat,
  +index: Nat,
  +prefix: Spec.Flat,
  +facts: Core.Facts,
  +parents: List<&2, Core.Frame>,
  +path: String,
  +head_fuel: Nat,
  +left: Nat,
  +right: Nat,
  valid: {Patricia.canonical(Bool, Measure.visited(Measure.result_state(result))) == True{} : Bool},
  prefix_complete: {Measure.flat_success(prefix) == True{} : Bool},
  complete: {Fuel.reference_projection(head_fuel, owner, index, result) == True{} : Bool},
  suffix: Fuel.suffix_contract(facts, parents, path, left, right)
) -> {
      Continuation.after_references(
        result,
        owner,
        index,
        prefix,
        head_fuel,
        Continuation.resume(parents, facts, path, left)
      )
      == Continuation.after_references(
        result,
        owner,
        index,
        prefix,
        head_fuel,
        Continuation.resume(parents, facts, path, right)
      )
      : Relation.Observation
    }:
  match result:
    case Spec.ListResult{Spec.ReferencesResult{state, references}}:
      Fuel.same_flat_equal(
        Spec.flatten(head_fuel, Spec.FlattenReferences{owner, index, references}),
        state,
        prefix,
        facts,
        parents,
        path,
        left,
        right,
        valid,
        prefix_complete,
        complete,
        suffix
      )
    case Spec.ListResult{Spec.ReferencesFailure{_}}: {==}
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: {==}

def first_frame_suffix(
  +items: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State,
  +prefix: Spec.Flat,
  +parents: List<&2, Core.Frame>,
  +head_fuel: Nat,
  +left: Nat,
  +right: Nat,
  +valid: {Patricia.canonical(Bool, Measure.visited(state)) == True{} : Bool},
  prefix_complete: {Measure.flat_success(prefix) == True{} : Bool},
  enough: {
    Nat.is_le(Bound.cap(facts, List.length(&2, Core.Reference, items)), head_fuel)
    == True{}
    : Bool
  },
  +left_adequate: {Bound.adequate(facts, left, parents) == True{} : Bool},
  +right_adequate: {Bound.adequate(facts, right, parents) == True{} : Bool}
) -> {
      Continuation.after_references(
        Spec.interpret(
          head_fuel,
          Spec.ReferencesRequest{items, facts, path, owner, index, depth, state}
        ),
        owner,
        index,
        prefix,
        head_fuel,
        Continuation.resume(parents, facts, path, left)
      )
      == Continuation.after_references(
        Spec.interpret(
          head_fuel,
          Spec.ReferencesRequest{items, facts, path, owner, index, depth, state}
        ),
        owner,
        index,
        prefix,
        head_fuel,
        Continuation.resume(parents, facts, path, right)
      )
      : Relation.Observation
    }:
  +request = {Spec.ReferencesRequest{items, facts, path, owner, index, depth, state} : Spec.Request}
  +result = Spec.interpret(head_fuel, request)
  final_valid = Order.eq_true_of_and_left(
    Patricia.canonical(Bool, Measure.visited(Measure.result_state(result))),
    Nat.is_le(Rank.unseen_catalog(Measure.visited(Measure.result_state(result)), MTip{}),
      Rank.unseen_catalog(Measure.visited(state), MTip{})),
    Interpreter.interpret_preserves_inventory(head_fuel, request, MTip{}, valid))
  complete = Fuel.request_projection_complete(
    head_fuel,
    items,
    facts,
    path,
    owner,
    index,
    depth,
    state,
    valid,
    enough
  )
  suffix = {next_state => next_prefix => next_valid => next_complete =>
    Fuel.resume_equal(parents, facts, path, left, right, next_state, next_prefix, next_valid, next_complete,
      left_adequate, right_adequate) : Fuel.suffix_contract(facts, parents, path, left, right)}
  result_suffix(result, owner, index, prefix, facts, parents, path, head_fuel, left, right,
    final_valid, prefix_complete, complete, suffix)
