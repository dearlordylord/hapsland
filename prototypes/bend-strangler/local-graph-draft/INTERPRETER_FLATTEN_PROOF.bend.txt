import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_ORDER_PROOF.bend as Order

# Internal actual-result transports for the approved coupled completion theorem.
# These preserve the interpreter's returned tree/references; no size surrogate
# or replacement flatten operation is introduced.
def join_complete(+left: Spec.Flat, +right: Spec.Flat,
    left_complete: {Measure.flat_success(left) == True{} : Bool},
    right_complete: {Measure.flat_success(right) == True{} : Bool}) -> {
  Measure.flat_success(Spec.flat_join(left, right)) == True{} : Bool
}:
  match left right:
    case Spec.Flat{nodes, slots} Spec.Flat{more_nodes, more_slots}: {==}
    case Spec.Flat{nodes, slots} Spec.FlatFailure{}:
      Empty.absurd({False{} == True{} : Bool}, Order.internal_false_ne_true(right_complete))
    case Spec.FlatFailure{} Spec.Flat{nodes, slots}:
      Empty.absurd({False{} == True{} : Bool}, Order.internal_false_ne_true(left_complete))
    case Spec.FlatFailure{} Spec.FlatFailure{}:
      Empty.absurd({False{} == True{} : Bool}, Order.internal_false_ne_true(left_complete))

def node_complete(+flat: Spec.Flat, +address: Nat, +artifact: Nat,
    complete: {Measure.flat_success(flat) == True{} : Bool}) -> {
  Measure.flat_success(Spec.flat_node(flat, address, artifact)) == True{} : Bool
}:
  match flat:
    case Spec.Flat{nodes, slots}: {==}
    case Spec.FlatFailure{}:
      Empty.absurd({False{} == True{} : Bool}, Order.internal_false_ne_true(complete))

def slot_complete(+flat: Spec.Flat, +owner: Nat, +index: Nat,
    +symbol: String, +reference: Core.PlannedReference,
    complete: {Measure.flat_success(flat) == True{} : Bool}) -> {
  Measure.flat_success(Spec.flat_slot(flat, owner, index, symbol, reference)) == True{} : Bool
}:
  match flat:
    case Spec.Flat{nodes, slots}: {==}
    case Spec.FlatFailure{}:
      Empty.absurd({False{} == True{} : Bool}, Order.internal_false_ne_true(complete))

def tree_complete(+fuel: Nat, +owner: Nat, +artifact: Nat,
    +references: List<&2, Spec.TreeReference>,
    complete: {Measure.flat_success(Spec.flatten(fuel,
      Spec.FlattenReferences{owner, 0n, references})) == True{} : Bool}) -> {
  Measure.flat_success(Spec.flatten((1n + fuel : Nat),
    Spec.FlattenTree{Spec.Tree{owner, artifact, references}})) == True{} : Bool
}:
  node_complete(Spec.flatten(fuel, Spec.FlattenReferences{owner, 0n, references}),
    owner, artifact, complete)

def references_complete(+fuel: Nat, +owner: Nat, +index: Nat,
    +head: Spec.TreeReference, +tail: List<&2, Spec.TreeReference>,
    head_complete: {Measure.flat_success(Spec.flat_head(head, owner, index,
      Spec.flatten(fuel))) == True{} : Bool},
    tail_complete: {Measure.flat_success(Spec.flatten(fuel,
      Spec.FlattenReferences{owner, (index + 1n : Nat), tail})) == True{} : Bool}) -> {
  Measure.flat_success(Spec.flatten((1n + fuel : Nat),
    Spec.FlattenReferences{owner, index, head <> tail})) == True{} : Bool
}:
  join_complete(Spec.flat_head(head, owner, index, Spec.flatten(fuel)),
    Spec.flatten(fuel, Spec.FlattenReferences{owner, (index + 1n : Nat), tail}),
    head_complete, tail_complete)
