import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
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
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# This continuation contract is instantiated only by smaller actual frame tails.
def suffix_contract(
  +facts: Core.Facts,
  +frames: List<&2, Core.Frame>,
  +path: String,
  +fuel: Nat
) -> Type:
  @+state: Spec.State -> @+prefix: Spec.Flat ->
  {Patricia.canonical(Bool, Measure.visited(state)) == True{} : Bool} ->
  {Measure.flat_success(prefix) == True{} : Bool} ->
  {Relation.successful(Continuation.resume(frames, facts, path, fuel,
    Continuation.Progress{state, prefix})) == True{} : Bool}

def flat_observation_complete(+flat: Spec.Flat, +state: Spec.State,
    complete: {Measure.flat_success(flat) == True{} : Bool}) -> {
  Relation.successful(Relation.observe_flat(flat, state)) == True{} : Bool
}:
  match flat state:
    case Spec.Flat{_, _} Spec.State{_, _, _, _}: {==}
    case Spec.FlatFailure{} Spec.State{_, _, _, _}: complete

def after_flat_complete(+flat: Spec.Flat, +state: Spec.State, +prefix: Spec.Flat,
    +facts: Core.Facts, +frames: List<&2, Core.Frame>, +path: String, +fuel: Nat,
    valid: {Patricia.canonical(Bool, Measure.visited(state)) == True{} : Bool},
    prefix_complete: {Measure.flat_success(prefix) == True{} : Bool},
    complete: {Measure.flat_success(flat) == True{} : Bool},
    suffix: suffix_contract(facts, frames, path, fuel)) -> {
  Relation.successful(Continuation.after_flat(flat, state, prefix,
    Continuation.resume(frames, facts, path, fuel))) == True{} : Bool
}:
  match flat:
    case Spec.Flat{+nodes, +slots}:
      suffix(state, Spec.flat_join(prefix, Spec.Flat{nodes, slots}), valid,
        Flatten.join_complete(prefix, Spec.Flat{nodes, slots}, prefix_complete, {==}))
    case Spec.FlatFailure{}: complete

def after_references_complete(
  +result: Spec.DispatchResult,
  +owner: Nat,
  +index: Nat,
  +prefix: Spec.Flat,
  +facts: Core.Facts,
  +frames: List<&2, Core.Frame>,
  +path: String,
  +fuel: Nat,
  +items: List<&2, Core.Reference>,
  +depth: Nat,
  +initial: Spec.State,
  valid: {Patricia.canonical(Bool, Measure.visited(Measure.result_state(result))) == True{} : Bool},
  prefix_complete: {Measure.flat_success(prefix) == True{} : Bool},
  complete: {
    Measure.projected_success(
      fuel,
      Spec.ReferencesRequest{items, facts, path, owner, index, depth, initial},
      result
    )
    == True{}
    : Bool
  },
  suffix: suffix_contract(facts, frames, path, fuel)
) -> {
  Relation.successful(Continuation.after_references(result, owner, index, prefix, fuel,
    Continuation.resume(frames, facts, path, fuel))) == True{} : Bool
}:
  match result:
    case Spec.ListResult{Spec.ReferencesResult{+state, +references}}:
      after_flat_complete(Spec.flatten(fuel, Spec.FlattenReferences{owner, index, references}),
        state, prefix, facts, frames, path, fuel, valid, prefix_complete, complete, suffix)
    case Spec.ListResult{Spec.ReferencesFailure{_}}: complete
    case Spec.BuildResult{Spec.Built{_, _}}: complete
    case Spec.BuildResult{Spec.Missing{_}}: complete
    case Spec.BuildResult{Spec.InsufficientBound{_}}: complete

def resume_complete(frames: List<&2, Core.Frame>, +facts: Core.Facts, +path: String,
    +fuel: Nat, +state: Spec.State, +prefix: Spec.Flat,
    +valid: {Patricia.canonical(Bool, Measure.visited(state)) == True{} : Bool},
    prefix_complete: {Measure.flat_success(prefix) == True{} : Bool},
    +adequate: {Bound.adequate(facts, fuel, frames) == True{} : Bool}) -> {
  Relation.successful(Continuation.resume(frames, facts, path, fuel,
    Continuation.Progress{state, prefix})) == True{} : Bool
}:
  match frames:
    case []: flat_observation_complete(prefix, state, prefix_complete)
    case Core.Frame{+owner, +depth, +index, +items} <> +rest:
      +request = {Spec.ReferencesRequest{items, facts, path, owner, index, depth, state} : Spec.Request}
      +result = Spec.interpret(fuel, request)
      head_enough = Order.eq_true_of_and_left(
        Nat.is_le(Bound.cap(facts, List.length(&2, Core.Reference, items)), fuel),
        Bound.adequate(facts, fuel, rest), adequate)
      +tail_enough = Order.eq_true_of_and_right(
        Nat.is_le(Bound.cap(facts, List.length(&2, Core.Reference, items)), fuel),
        Bound.adequate(facts, fuel, rest), adequate)
      enough = Order.le_trans(Measure.request_rank(request),
        Bound.cap(facts, List.length(&2, Core.Reference, items)), fuel,
        Bound.request_cap(facts, items, path, owner, index, depth, state), head_enough)
      final_valid = Order.eq_true_of_and_left(
        Patricia.canonical(Bool, Measure.visited(Measure.result_state(result))),
        Nat.is_le(Rank.unseen_catalog(Measure.visited(Measure.result_state(result)), MTip{}),
          Rank.unseen_catalog(Measure.visited(state), MTip{})),
        Interpreter.interpret_preserves_inventory(fuel, request, MTip{}, valid))
      suffix = {next_state => next_prefix => next_valid => next_complete =>
        resume_complete(rest, facts, path, fuel, next_state, next_prefix, next_valid, next_complete, tail_enough)
        : suffix_contract(facts, rest, path, fuel)}
      after_references_complete(result, owner, index, prefix, facts, rest, path, fuel,
        items, depth, state, final_valid, prefix_complete,
        Interpreter.interpret_and_flatten_complete(fuel, request, valid, enough),
        suffix)

law continuation_completes:
  for +machine: Core.Machine
  for valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool}
  {Relation.successful(Continuation.observe(machine)) == True{} : Bool}

def continuation_completes(machine, valid):
  match machine:
    case Core.Machine{
      +facts,
      +path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      resume_complete(
        frames,
        facts,
        path,
        Continuation.bound(facts, frames),
        Spec.State{visited, budget, address, pending},
        Spec.Flat{
          List.reverse(&2, Core.PlannedNode, nodes),
          List.reverse(&2, Core.ReferenceSlot, slots)
        },
        valid,
        {==},
        Bound.actual_bound_adequate(facts, frames)
      )
