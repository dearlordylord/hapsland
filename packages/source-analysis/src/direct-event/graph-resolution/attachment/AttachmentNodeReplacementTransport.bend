import Base
import ./AttachmentProjectionAllowanceProof.bend as Count
import ../traversal/INTERPRETER_NAT_FACTS.bend as N
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ./RetainedForestProjection.bend as P
import ./ActualAttachmentPhaseProjection.bend as Ready
import ./AttachmentInterleavedReplacementProof.bend as Interleaved
import ./AttachmentUnaffectedNodesProof.bend as Unaffected
import ./AttachmentProjectionContentsProof.bend as Contents
import ../Composition.bend as Compose
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T
import ../traversal/core.bend as Local

# Private address-custody inversion used by the complete node zipper below.
# An absent semantic address cannot be returned by any successful numeric lookup.
def address_lookup_zero_step(+id: Nat, +birth: O.NodeAddress, +tail: List<&2, F.AddressEntry>,
    +query: Nat, +target: O.NodeAddress, +found: O.NodeAddress,
    parts: {F.same_address(target, birth) == False{} : Bool} & {P.address_count(tail, target) == 0n : Nat},
    present: {F.address_at(F.AddressEntry{id, birth} <> tail, query) == Some{found} : Maybe<&2, O.NodeAddress>},
    recursive: {P.address_count(tail, target) == 0n : Nat} ->
      {F.address_at(tail, query) == Some{found} : Maybe<&2, O.NodeAddress>} ->
      {F.same_address(target, found) == False{} : Bool},
    equal: Bool, branch: {Nat.is_eq(id, query) == equal : Bool}) ->
    {F.same_address(target, found) == False{} : Bool}:
  match parts equal:
    case (different, _) True{}:
      same: {birth == found : O.NodeAddress} = Count.some_equal(O.NodeAddress, birth, found,
        %branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, query)) == Some{found} : Maybe<&2, O.NodeAddress>}
        present)
      %same: {F.same_address(target, _) == False{} : Bool}
      different
    case (_, absent) False{}:
      recursive(absent)(
        %branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, query)) == Some{found} : Maybe<&2, O.NodeAddress>}
        present)

def address_lookup_zero(items: List<&2, F.AddressEntry>, +query: Nat, +target: O.NodeAddress, +found: O.NodeAddress,
    zero: {P.address_count(items, target) == 0n : Nat},
    present: {F.address_at(items, query) == Some{found} : Maybe<&2, O.NodeAddress>}) ->
    {F.same_address(target, found) == False{} : Bool}:
  match items:
    case []: Empty.absurd({F.same_address(target, found) == False{} : Bool}, Contents.none_some(O.NodeAddress, found, present))
    case F.AddressEntry{+id, +birth} <> +tail:
      address_lookup_zero_step(id, birth, tail, query, target, found,
        Unaffected.zero_parts(F.same_address(target, birth), P.address_count(tail, target), zero), present,
        absent => selected => address_lookup_zero(tail, query, target, found, absent, selected),
        Nat.is_eq(id, query), {==})

def aligned_lookup_step(+id: Nat, +handle: Nat, +nodes: List<&2, Local.PlannedNode>,
    +other: Nat, +birth: O.NodeAddress, +addresses: List<&2, F.AddressEntry>,
    +all_nodes: List<&2, Local.PlannedNode>, +all_addresses: List<&2, F.AddressEntry>,
    +query: Nat, +found: O.NodeAddress,
    +last: {Bool.and(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(nodes, addresses, all_nodes, all_addresses)) == True{} : Bool},
    present: {F.address_at(F.AddressEntry{other, birth} <> addresses, query) == Some{found} : Maybe<&2, O.NodeAddress>},
    recursive: {P.aligned(nodes, addresses, all_nodes, all_addresses) == True{} : Bool} ->
      {F.address_at(addresses, query) == Some{found} : Maybe<&2, O.NodeAddress>} ->
      {P.address_count(all_addresses, found) == 1n : Nat},
    equal: Bool, branch: {Nat.is_eq(other, query) == equal : Bool}) ->
    {P.address_count(all_addresses, found) == 1n : Nat}:
  match equal:
    case True{}:
      same: {birth == found : O.NodeAddress} = Count.some_equal(O.NodeAddress, birth, found,
        %branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(addresses, query)) == Some{found} : Maybe<&2, O.NodeAddress>}
        present)
      %same: {P.address_count(all_addresses, _) == 1n : Nat}
      N.eq_of_is_eq(P.address_count(all_addresses, birth), 1n,
        B.eq_true_of_and_left(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(nodes, addresses, all_nodes, all_addresses), last))
    case False{}:
      recursive(B.eq_true_of_and_right(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(nodes, addresses, all_nodes, all_addresses), last))(
        %branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(addresses, query)) == Some{found} : Maybe<&2, O.NodeAddress>}
        present)

def aligned_lookup_unique(nodes: List<&2, Local.PlannedNode>, addresses: List<&2, F.AddressEntry>,
    +all_nodes: List<&2, Local.PlannedNode>, +all_addresses: List<&2, F.AddressEntry>, +query: Nat, +found: O.NodeAddress,
    valid: {P.aligned(nodes, addresses, all_nodes, all_addresses) == True{} : Bool},
    present: {F.address_at(addresses, query) == Some{found} : Maybe<&2, O.NodeAddress>}) ->
    {P.address_count(all_addresses, found) == 1n : Nat}:
  match nodes addresses:
    case Nil{} Nil{}: Empty.absurd({P.address_count(all_addresses, found) == 1n : Nat}, Contents.none_some(O.NodeAddress, found, present))
    case Con{Local.PlannedNode{+id, +handle}, +tail} Con{F.AddressEntry{+other, +birth}, +rest}:
      aligned_lookup_step(id, handle, tail, other, birth, rest, all_nodes, all_addresses, query, found,
        B.eq_true_of_and_right(Nat.is_eq(P.node_count(all_nodes, id), 1n),
      Bool.and(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(tail, rest, all_nodes, all_addresses)),
      B.eq_true_of_and_right(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
        Bool.and(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(tail, rest, all_nodes, all_addresses))), valid)), present,
        aligned => located => aligned_lookup_unique(tail, rest, all_nodes, all_addresses, query, found, aligned, located),
        Nat.is_eq(other, query), {==})
    case Nil{} Con{_, _}: Empty.absurd({P.address_count(all_addresses, found) == 1n : Nat}, B.internal_false_ne_true(valid))
    case Con{_, _} Nil{}: Empty.absurd({P.address_count(all_addresses, found) == 1n : Nat}, B.internal_false_ne_true(valid))

# Astra-approved complete node zipper cut for parent_attachment_exact.
# Original successful projection is the only projection premise.
# No validity or replacement-success premise; no new runtime representation.
# This cut intentionally makes no forward/birth validity claim for arbitrary new_actual.
law node_replacement_exact:
  for +root: Nat
  for +nodes: List<&2, Local.PlannedNode>
  for +slots: List<&2, Local.ReferenceSlot>
  for +catalog: List<&2, T.ArtifactEntry>
  for +addresses: List<&2, F.AddressEntry>
  for +root_birth: O.NodeAddress
  for +retained: List<&2, F.Node>
  for +owner: Nat
  for +index: Nat
  for +symbol: String
  for +owner_address: O.NodeAddress
  for +new_actual: Local.PlannedReference
  for +new_semantic: F.Reference
  for projected: {P.project(root, nodes, slots, catalog, addresses) ==
    Some{F.Forest{Some{root_birth}, retained}} : Maybe<&2, F.Forest>}
  for selected: {Ready.slot_count(slots, owner, index, symbol) == 1n : Nat}
  for owner_present: {F.address_at(addresses, owner) == Some{owner_address} : Maybe<&2, O.NodeAddress>}
  for new_reference: {P.reference(Local.ReferenceSlot{owner, index, symbol, new_actual}, addresses) ==
    Some{new_semantic} : Maybe<&2, F.Reference>}
  Exists(List<&2, Local.ReferenceSlot>, changed_slots => Exists(List<&2, F.Node>, changed_nodes =>
    {Compose.replacement(Compose.replace_slot(slots, owner, index, new_actual)) ==
      Some{changed_slots} : Maybe<&2, List<&2, Local.ReferenceSlot>>} &
    {P.nodes(nodes, changed_slots, catalog, addresses) == Some{changed_nodes} : Maybe<&2, List<&2, F.Node>>} &
    {F.replace_nodes(retained, owner_address, index, new_semantic) == F.Nodes{changed_nodes, 1n} : F.Nodes}
  ))

def main() -> Unit:
  Unit{}
