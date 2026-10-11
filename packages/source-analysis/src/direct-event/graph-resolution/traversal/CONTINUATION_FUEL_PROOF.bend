import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./RANK.bend as Rank
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_BOUND_PROOF.bend as Bound
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_LAWS.bend as Interpreter
import ./INTERPRETER_PROOF.bend as InterpreterProof
import ./INTERPRETER_FLATTEN_PROOF.bend as Flatten
import ./INTERPRETER_ORDER_PROOF.bend as Order
import ./FUEL_COHERENCE.bend as Coherence
import ./FUEL_COHERENCE_LAWS.bend as Fuel
import ./FUEL_COHERENCE_PROOF.bend as FuelProof
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Bound changes are normalized only after actual complete results are available.
def suffix_contract(+facts: Core.Facts, +frames: List<&2, Core.Frame>, +path: String,
    +left: Nat, +right: Nat) -> Type:
  @+state: Spec.State -> @+prefix: Spec.Flat ->
  {Patricia.canonical(Bool, Measure.visited(state)) == True{} : Bool} ->
  {Measure.flat_success(prefix) == True{} : Bool} ->
  {
    Continuation.resume(frames, facts, path, left, Continuation.Progress{state, prefix})
    == Continuation.resume(frames, facts, path, right, Continuation.Progress{state, prefix})
    : Relation.Observation
  }

def reference_projection(fuel: Nat, owner: Nat, index: Nat, result: Spec.DispatchResult) -> Bool:
  match result:
    case Spec.ListResult{Spec.ReferencesResult{_, references}}:
      Measure.flat_success(Spec.flatten(fuel, Spec.FlattenReferences{owner, index, references}))
    case _: False{}

def projection_exact(
  +fuel: Nat,
  +items: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State,
  +result: Spec.DispatchResult
) -> {
      Measure.projected_success(
        fuel,
        Spec.ReferencesRequest{items, facts, path, owner, index, depth, state},
        result
      )
      == reference_projection(fuel, owner, index, result)
      : Bool
    }:
  match result:
    case Spec.ListResult{Spec.ReferencesResult{_, _}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{_}}: {==}
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: {==}

def projection_completed(+fuel: Nat, +owner: Nat, +index: Nat, +result: Spec.DispatchResult,
    complete: {reference_projection(fuel, owner, index, result) == True{} : Bool}) -> {
  Coherence.completed(result) == True{} : Bool
}:
  match result:
    case Spec.ListResult{Spec.ReferencesResult{_, _}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{_}}: complete
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: complete

def same_flat_equal(+flat: Spec.Flat, +state: Spec.State, +prefix: Spec.Flat,
    +facts: Core.Facts, +frames: List<&2, Core.Frame>, +path: String, +left: Nat, +right: Nat,
    valid: {Patricia.canonical(Bool, Measure.visited(state)) == True{} : Bool},
    prefix_complete: {Measure.flat_success(prefix) == True{} : Bool},
    flat_complete: {Measure.flat_success(flat) == True{} : Bool},
    suffix: suffix_contract(facts, frames, path, left, right)) -> {
      Continuation.after_flat(flat, state, prefix, Continuation.resume(frames, facts, path, left))
      == Continuation.after_flat(
        flat,
        state,
        prefix,
        Continuation.resume(frames, facts, path, right)
      )
      : Relation.Observation
    }:
  match flat:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{+nodes, +slots}:
      suffix(state, Spec.flat_join(prefix, Spec.Flat{nodes, slots}), valid,
        Flatten.join_complete(prefix, Spec.Flat{nodes, slots}, prefix_complete, {==}))

def after_flat_at(state: Spec.State, prefix: Spec.Flat, facts: Core.Facts,
    frames: List<&2, Core.Frame>, path: String, fuel: Nat, flat: Spec.Flat) -> Relation.Observation:
  Continuation.after_flat(flat, state, prefix, Continuation.resume(frames, facts, path, fuel))

def same_result_equal(
  +result: Spec.DispatchResult,
  +owner: Nat,
  +index: Nat,
  +prefix: Spec.Flat,
  +facts: Core.Facts,
  +frames: List<&2, Core.Frame>,
  +path: String,
  +left: Nat,
  +right: Nat,
  valid: {Patricia.canonical(Bool, Measure.visited(Measure.result_state(result))) == True{} : Bool},
  prefix_complete: {Measure.flat_success(prefix) == True{} : Bool},
  +left_complete: {reference_projection(left, owner, index, result) == True{} : Bool},
  right_complete: {reference_projection(right, owner, index, result) == True{} : Bool},
  suffix: suffix_contract(facts, frames, path, left, right)
) -> {
      Continuation.after_references(
        result,
        owner,
        index,
        prefix,
        left,
        Continuation.resume(frames, facts, path, left)
      )
      == Continuation.after_references(
        result,
        owner,
        index,
        prefix,
        right,
        Continuation.resume(frames, facts, path, right)
      )
      : Relation.Observation
    }:
  match result:
    case Spec.ListResult{Spec.ReferencesResult{+state, +references}}:
      +request = {Spec.FlattenReferences{owner, index, references} : Spec.FlattenRequest}
      +a = Spec.flatten(left, request)
      +b = Spec.flatten(right, request)
      Equal.trans(
        Relation.Observation,
        after_flat_at(state, prefix, facts, frames, path, left, a),
        after_flat_at(state, prefix, facts, frames, path, right, a),
        after_flat_at(state, prefix, facts, frames, path, right, b),
        same_flat_equal(
          a,
          state,
          prefix,
          facts,
          frames,
          path,
          left,
          right,
          valid,
          prefix_complete,
          left_complete,
          suffix
        ),
        Equal.cong(
          Spec.Flat,
          Relation.Observation,
          after_flat_at(state, prefix, facts, frames, path, right),
          a,
          b,
          Fuel.successful_flattenings_equal(left, right, request, left_complete, right_complete)
        )
      )
    case Spec.ListResult{Spec.ReferencesFailure{_}}: {==}
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: {==}

def after_references_at(
  owner: Nat,
  index: Nat,
  prefix: Spec.Flat,
  facts: Core.Facts,
  frames: List<&2, Core.Frame>,
  path: String,
  +fuel: Nat,
  result: Spec.DispatchResult
) -> Relation.Observation:
  Continuation.after_references(
    result,
    owner,
    index,
    prefix,
    fuel,
    Continuation.resume(frames, facts, path, fuel)
  )

def request_projection_complete(
  +fuel: Nat,
  +items: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State,
  valid: {Patricia.canonical(Bool, Measure.visited(state)) == True{} : Bool},
  enough: {
    Nat.is_le(Bound.cap(facts, List.length(&2, Core.Reference, items)), fuel)
    == True{}
    : Bool
  }
) -> {
      reference_projection(
        fuel,
        owner,
        index,
        Spec.interpret(fuel, Spec.ReferencesRequest{items, facts, path, owner, index, depth, state})
      )
      == True{}
      : Bool
    }:
  +request = {Spec.ReferencesRequest{items, facts, path, owner, index, depth, state} : Spec.Request}
  %projection_exact(
    fuel,
    items,
    facts,
    path,
    owner,
    index,
    depth,
    state,
    Spec.interpret(fuel, request)
  ):
    {_ == True{} : Bool}
  Interpreter.interpret_and_flatten_complete(
    fuel,
    request,
    valid,
    Order.le_trans(
      Measure.request_rank(request),
      Bound.cap(facts, List.length(&2, Core.Reference, items)),
      fuel,
      Bound.request_cap(facts, items, path, owner, index, depth, state),
      enough
    )
  )

def resume_equal(frames: List<&2, Core.Frame>, +facts: Core.Facts, +path: String,
    +left: Nat, +right: Nat, +state: Spec.State, +prefix: Spec.Flat,
    +valid: {Patricia.canonical(Bool, Measure.visited(state)) == True{} : Bool},
    prefix_complete: {Measure.flat_success(prefix) == True{} : Bool},
    +left_adequate: {Bound.adequate(facts, left, frames) == True{} : Bool},
    +right_adequate: {Bound.adequate(facts, right, frames) == True{} : Bool}) -> {
      Continuation.resume(frames, facts, path, left, Continuation.Progress{state, prefix})
      == Continuation.resume(frames, facts, path, right, Continuation.Progress{state, prefix})
      : Relation.Observation
    }:
  match frames:
    case []: {==}
    case Core.Frame{+owner, +depth, +index, +items} <> +rest:
      +request = {Spec.ReferencesRequest{items, facts, path, owner, index, depth, state} : Spec.Request}
      +a = Spec.interpret(left, request)
      +b = Spec.interpret(right, request)
      +head_cap = Bound.cap(facts, List.length(&2, Core.Reference, items))
      +left_complete = request_projection_complete(
        left,
        items,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        valid,
        Order.eq_true_of_and_left(
          Nat.is_le(head_cap, left),
          Bound.adequate(facts, left, rest),
          left_adequate
        )
      )
      +right_complete = request_projection_complete(
        right,
        items,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        valid,
        Order.eq_true_of_and_left(
          Nat.is_le(head_cap, right),
          Bound.adequate(facts, right, rest),
          right_adequate
        )
      )
      +same = Fuel.completed_interpretations_equal(left, right, request,
        projection_completed(left, owner, index, a, left_complete),
        projection_completed(right, owner, index, b, right_complete))
      right_at_left = Equal.trans(
        Bool,
        reference_projection(right, owner, index, a),
        reference_projection(right, owner, index, b),
        True{},
        Equal.cong(
          Spec.DispatchResult,
          Bool,
          reference_projection(right, owner, index),
          a,
          b,
          same
        ),
        right_complete
      )
      final_valid = Order.eq_true_of_and_left(
        Patricia.canonical(Bool, Measure.visited(Measure.result_state(a))),
        Nat.is_le(Rank.unseen_catalog(Measure.visited(Measure.result_state(a)), MTip{}),
          Rank.unseen_catalog(Measure.visited(state), MTip{})),
        Interpreter.interpret_preserves_inventory(left, request, MTip{}, valid))
      suffix = {next_state => next_prefix => next_valid => next_complete =>
        resume_equal(rest, facts, path, left, right, next_state, next_prefix, next_valid, next_complete,
          Order.eq_true_of_and_right(Nat.is_le(head_cap, left), Bound.adequate(facts, left, rest), left_adequate),
          Order.eq_true_of_and_right(Nat.is_le(head_cap, right), Bound.adequate(facts, right, rest), right_adequate))
        : suffix_contract(facts, rest, path, left, right)}
      Equal.trans(Relation.Observation,
        after_references_at(owner, index, prefix, facts, rest, path, left, a),
        after_references_at(owner, index, prefix, facts, rest, path, right, a),
        after_references_at(owner, index, prefix, facts, rest, path, right, b),
        same_result_equal(a, owner, index, prefix, facts, rest, path, left, right,
          final_valid, prefix_complete, left_complete, right_at_left, suffix),
        Equal.cong(Spec.DispatchResult, Relation.Observation,
          after_references_at(owner, index, prefix, facts, rest, path, right), a, b, same))
