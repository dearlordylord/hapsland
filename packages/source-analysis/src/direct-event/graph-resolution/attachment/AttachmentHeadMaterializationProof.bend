import Base
import ./AttachmentReferenceMaterializationProof.bend as References
import ./AttachmentBuildCopiesProof.bend as Copies
import ./AttachmentRenderedSuffix.bend as Suffix
import ./AttachmentNodeMaterializationProof.bend as Node
import ./AttachmentProjectedArtifactValidityProof.bend as Artifact
import ./AttachmentNaturalArithmeticFacts.bend as N
import ./RetainedForestProjection.bend as P
import ../traversal/core.bend as Local
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T

def some_equal(-A: Data, +left: A, +right: A, same: {Some{left} == Some{right} : Maybe<&2, A>}) -> {left == right : A}:
  Equal.cong(Maybe<&2, A>, A, value => Artifact.value_of(A, left, value), Some{left}, Some{right}, same)

def reference_agreement(+slots: List<&2, Local.ReferenceSlot>, +addresses: List<&2, F.AddressEntry>,
    +forest: F.Forest, +built: Map<&2, Maybe<&2, T.ProductValue>>, +fuel: Nat,
    +static_refs: List<&2, F.Reference>, +static_values: List<&2, T.ProductValue>,
    common: Exists(List<&2, F.Reference>, refs => Exists(List<&2, T.ProductValue>, values =>
      References.list_common(slots, addresses, forest, built, fuel, refs, values))),
    projected: {P.references(slots, addresses) == Some{static_refs} : Maybe<&2, List<&2, F.Reference>>},
    actual: {Core.reference_products(slots, built) == Some{static_values} : Maybe<&2, List<&2, T.ProductValue>>}) ->
    {F.as_products(F.product_interpret(fuel, F.ReferencesProductRequest{forest, static_refs})) == F.ProductReferences{static_values} : F.ProductReferences}:
  match common:
    case (+refs, (+values, (fresh_projected, (fresh_actual, materialized)))):
      same_refs: {refs == static_refs : List<&2, F.Reference>} = some_equal(List<&2, F.Reference>, refs, static_refs,
        Equal.trans(Maybe<&2, List<&2, F.Reference>>, Some{refs}, P.references(slots, addresses), Some{static_refs},
          Equal.sym(Maybe<&2, List<&2, F.Reference>>, P.references(slots, addresses), Some{refs}, fresh_projected), projected))
      same_values: {values == static_values : List<&2, T.ProductValue>} = some_equal(List<&2, T.ProductValue>, values, static_values,
        Equal.trans(Maybe<&2, List<&2, T.ProductValue>>, Some{values}, Core.reference_products(slots, built), Some{static_values},
          Equal.sym(Maybe<&2, List<&2, T.ProductValue>>, Core.reference_products(slots, built), Some{values}, fresh_actual), actual))
      %same_refs: {F.as_products(F.product_interpret(fuel, F.ReferencesProductRequest{forest, _})) == F.ProductReferences{static_values} : F.ProductReferences}
      %same_values: {F.as_products(F.product_interpret(fuel, F.ReferencesProductRequest{forest, refs})) == F.ProductReferences{_} : F.ProductReferences}
      materialized

def allowance(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>) ->
    {Suffix.suffix_allowance(Local.PlannedNode{id, handle} <> tail, slots)
      == Nat.add(2n, Nat.add(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Suffix.suffix_allowance(tail, slots))) : Nat}:
  Equal.trans(Nat,
    Nat.add(Nat.add(Nat.add(2n, List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id))), Suffix.suffix_weight(tail, slots)), 2n),
    Nat.add(Nat.add(2n, List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id))), Nat.add(Suffix.suffix_weight(tail, slots), 2n)),
    Nat.add(2n, Nat.add(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Nat.add(Suffix.suffix_weight(tail, slots), 2n))),
    N.add_assoc(Nat.add(2n, List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id))), Suffix.suffix_weight(tail, slots), 2n),
    N.add_assoc(2n, List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Nat.add(Suffix.suffix_weight(tail, slots), 2n)))

def fuel_arithmetic(+length: Nat, +tail: Nat, +extra: Nat) ->
    {Nat.add(Nat.add(2n, Nat.add(length, tail)), extra) == 1n+Nat.add(length, Nat.add(tail, 1n+extra)) : Nat}:
  %Equal.sym(Nat, Nat.add(tail, 1n+extra), 1n+Nat.add(tail, extra), N.add_succ(tail, extra)):
    {Nat.add(Nat.add(2n, Nat.add(length, tail)), extra) == 1n+Nat.add(length, _) : Nat}
  %Equal.sym(Nat, Nat.add(length, 1n+Nat.add(tail, extra)), 1n+Nat.add(length, Nat.add(tail, extra)), N.add_succ(length, Nat.add(tail, extra))):
    {Nat.add(Nat.add(2n, Nat.add(length, tail)), extra) == 1n+_ : Nat}
  Equal.cong(Nat, Nat, value => 2n+value, Nat.add(Nat.add(length, tail), extra), Nat.add(length, Nat.add(tail, extra)), N.add_assoc(length, tail, extra))

def head_fuel(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>, +extra: Nat) ->
    {Nat.add(Suffix.suffix_allowance(Local.PlannedNode{id, handle} <> tail, slots), extra)
      == 1n+Nat.add(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Nat.add(Suffix.suffix_allowance(tail, slots), 1n+extra)) : Nat}:
  %Equal.sym(Nat, Suffix.suffix_allowance(Local.PlannedNode{id, handle} <> tail, slots), Nat.add(2n, Nat.add(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Suffix.suffix_allowance(tail, slots))), allowance(id, handle, tail, slots)):
    {Nat.add(_, extra) == 1n+Nat.add(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Nat.add(Suffix.suffix_allowance(tail, slots), 1n+extra)) : Nat}
  fuel_arithmetic(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Suffix.suffix_allowance(tail, slots), extra)

def materialized_head(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +addresses: List<&2, F.AddressEntry>, +forest: F.Forest, +built: Map<&2, Maybe<&2, T.ProductValue>>,
    +address: O.NodeAddress, +artifact: T.Artifact, +refs: List<&2, F.Reference>, +artifact_value: T.ProductValue,
    +values: List<&2, T.ProductValue>, +extra: Nat,
    node_present: {F.node_at(Node.nodes_of(forest), address) == Some{F.Node{address, artifact, refs}} : Maybe<&2, F.Node>},
    artifact_present: {F.artifact(artifact) == Some{artifact_value} : Maybe<&2, T.ProductValue>},
    projected: {P.references(P.owner_slots(slots, id), addresses) == Some{refs} : Maybe<&2, List<&2, F.Reference>>},
    actual: {Core.reference_products(P.owner_slots(slots, id), built) == Some{values} : Maybe<&2, List<&2, T.ProductValue>>},
    indexed: {P.indexed(P.owner_slots(slots, id), 0n, tail) == True{} : Bool},
    proof: Copies.copies(References.expanded_count(P.owner_slots(slots, id)), Suffix.rendered_suffix(tail, slots, addresses, forest, built))) ->
    {F.materialize(Nat.add(Suffix.suffix_allowance(Local.PlannedNode{id, handle} <> tail, slots), extra), forest, address)
      == F.Materialized{Node.node_value(artifact_value, values)} : F.Materialization}:
  %Equal.sym(Nat, Nat.add(Suffix.suffix_allowance(Local.PlannedNode{id, handle} <> tail, slots), extra),
    1n+Nat.add(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Nat.add(Suffix.suffix_allowance(tail, slots), 1n+extra)), head_fuel(id, handle, tail, slots, extra)):
    {F.materialize(_, forest, address) == F.Materialized{Node.node_value(artifact_value, values)} : F.Materialization}
  Node.node_materialized(forest, address, artifact, refs,
    Nat.add(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Nat.add(Suffix.suffix_allowance(tail, slots), 1n+extra)), artifact_value, values,
    node_present, artifact_present,
    reference_agreement(P.owner_slots(slots, id), addresses, forest, built,
      1n+Nat.add(List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id)), Nat.add(Suffix.suffix_allowance(tail, slots), 1n+extra)), refs, values,
      References.prepared_products(P.owner_slots(slots, id), 0n, tail, slots, addresses, forest, built, 1n+extra, indexed, proof), projected, actual))

def main() -> Unit:
  Unit{}
