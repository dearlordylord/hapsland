import Base
import ./RetainedForestProjection.bend as P
import ./AttachmentMapping.bend as Mapping
import ./AttachmentFrameView.bend as V
import ./ActualAttachmentPhaseProjection.bend as Ready
import ../Composition.bend as Compose
import ../ForestSpecification.bend as F
import ../Types.bend as T
import ../WholeObservation.bend as O
import ../traversal/core.bend as Local
import ../traversal/INTERPRETER_NAT_FACTS.bend as N

# Exact mathlib nat.bend comparison transport, add_comm supplied by existing N owner.
# Source SHA256 445fb22805af3d01f9c9a08cefcf0e5d02f2ac750a424aeb1e0f0b6836f87991
law add_left_cancel_iff:
  for k: Nat
  for -a: Nat
  for -b: Nat
  {Nat.is_eq(a, b) == Nat.is_eq(Nat.add(k, a), Nat.add(k, b)) : Bool}

def add_left_cancel_iff(k, a, b):
  match k:
    case 0n:
      {==}
    case 1n+p:
      add_left_cancel_iff(p, a, b)

# Adding the same amount on the right does not change the equality test: a = b tests as a + k = b + k.
law add_right_cancel_iff:
  for a: Nat
  for b: Nat
  for k: Nat
  {Nat.is_eq(a, b) == Nat.is_eq(Nat.add(a, k), Nat.add(b, k)) : Bool}

def add_right_cancel_iff(a, b, k):
  +a = a
  +b = b
  +k = k
  %N.add_comm(k, a) : {Nat.is_eq(a, b) == Nat.is_eq(_, Nat.add(b, k)) : Bool}
  %N.add_comm(k, b) : {Nat.is_eq(a, b) == Nat.is_eq(Nat.add(k, a), _) : Bool}
  add_left_cancel_iff(k, a, b)

def node_count(items: List<&2, Local.PlannedNode>, +id: Nat, +offset: Nat) ->
    {P.node_count(items, id) == P.node_count(Compose.shift_nodes(items, offset), (id + offset : Nat)) : Nat}:
  match items:
    case []: {==}
    case Local.PlannedNode{+other, handle} <> +tail:
      %add_right_cancel_iff(id, other, offset): {P.node_count(Local.PlannedNode{other, handle} <> tail, id) == (Bool.pick(Nat, _, 1n, 0n) + P.node_count(Compose.shift_nodes(tail, offset), (id + offset : Nat)) : Nat) : Nat}
      %node_count(tail, id, offset): {P.node_count(Local.PlannedNode{other, handle} <> tail, id) == (Bool.pick(Nat, Nat.is_eq(id, other), 1n, 0n) + _ : Nat) : Nat}
      {==}

def address_count(items: List<&2, F.AddressEntry>, +address: O.NodeAddress, +offset: Nat) ->
    {P.address_count(items, address) == P.address_count(Mapping.shifted(items, offset), address) : Nat}:
  match items:
    case []: {==}
    case F.AddressEntry{id, other} <> +tail:
      %address_count(tail, address, offset): {P.address_count(F.AddressEntry{id, other} <> tail, address) == (Bool.pick(Nat, F.same_address(address, other), 1n, 0n) + _ : Nat) : Nat}
      {==}

def aligned(items: List<&2, Local.PlannedNode>, entries: List<&2, F.AddressEntry>,
    +all: List<&2, Local.PlannedNode>, +all_addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {P.aligned(items, entries, all, all_addresses) ==
      P.aligned(Compose.shift_nodes(items, offset), Mapping.shifted(entries, offset),
        Compose.shift_nodes(all, offset), Mapping.shifted(all_addresses, offset)) : Bool}:
  match items entries:
    case Nil{} Nil{}: {==}
    case Con{Local.PlannedNode{+id, handle}, +tail} Con{F.AddressEntry{+other, +address}, +rest}:
      %add_right_cancel_iff(id, other, offset): {P.aligned(Local.PlannedNode{id, handle} <> tail, F.AddressEntry{other, address} <> rest, all, all_addresses) == Bool.and(_, Bool.and(Nat.is_eq(P.node_count(Compose.shift_nodes(all, offset), (id + offset : Nat)), 1n), Bool.and(Nat.is_eq(P.address_count(Mapping.shifted(all_addresses, offset), address), 1n), P.aligned(Compose.shift_nodes(tail, offset), Mapping.shifted(rest, offset), Compose.shift_nodes(all, offset), Mapping.shifted(all_addresses, offset))))) : Bool}
      %node_count(all, id, offset): {P.aligned(Local.PlannedNode{id, handle} <> tail, F.AddressEntry{other, address} <> rest, all, all_addresses) == Bool.and(Nat.is_eq(id, other), Bool.and(Nat.is_eq(_, 1n), Bool.and(Nat.is_eq(P.address_count(Mapping.shifted(all_addresses, offset), address), 1n), P.aligned(Compose.shift_nodes(tail, offset), Mapping.shifted(rest, offset), Compose.shift_nodes(all, offset), Mapping.shifted(all_addresses, offset))))) : Bool}
      %address_count(all_addresses, address, offset): {P.aligned(Local.PlannedNode{id, handle} <> tail, F.AddressEntry{other, address} <> rest, all, all_addresses) == Bool.and(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(all, id), 1n), Bool.and(Nat.is_eq(_, 1n), P.aligned(Compose.shift_nodes(tail, offset), Mapping.shifted(rest, offset), Compose.shift_nodes(all, offset), Mapping.shifted(all_addresses, offset))))) : Bool}
      %aligned(tail, rest, all, all_addresses, offset): {P.aligned(Local.PlannedNode{id, handle} <> tail, F.AddressEntry{other, address} <> rest, all, all_addresses) == Bool.and(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(all, id), 1n), Bool.and(Nat.is_eq(P.address_count(all_addresses, address), 1n), _))) : Bool}
      {==}
    case Nil{} Con{F.AddressEntry{_, _}, _}: {==}
    case Con{Local.PlannedNode{_, _}, _} Nil{}: {==}

def address_at(items: List<&2, F.AddressEntry>, +id: Nat, +offset: Nat) ->
    {F.address_at(items, id) == F.address_at(Mapping.shifted(items, offset), (id + offset : Nat)) : Maybe<&2, O.NodeAddress>}:
  match items:
    case []: {==}
    case F.AddressEntry{+other, address} <> +tail:
      %add_right_cancel_iff(other, id, offset): {F.address_at(F.AddressEntry{other, address} <> tail, id) == Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{address}, F.address_at(Mapping.shifted(tail, offset), (id + offset : Nat))) : Maybe<&2, O.NodeAddress>}
      %address_at(tail, id, offset): {F.address_at(F.AddressEntry{other, address} <> tail, id) == Bool.pick(Maybe<&2, O.NodeAddress>, Nat.is_eq(other, id), Some{address}, _) : Maybe<&2, O.NodeAddress>}
      {==}

def forward_reference(reference: Local.PlannedReference, +later: List<&2, Local.PlannedNode>, +offset: Nat) ->
    {P.forward_reference(reference, later) == P.forward_reference(Compose.shift_reference(reference, offset), Compose.shift_nodes(later, offset)) : Bool}:
  match reference:
    case Local.Expanded{+id}:
      %node_count(later, id, offset): {P.forward_reference(Local.Expanded{id}, later) == Nat.is_eq(_, 1n) : Bool}
      {==}
    case Local.Included{_}: {==}
    case Local.Omitted{_, _}: {==}

def indexed(items: List<&2, Local.ReferenceSlot>, +next: Nat, +later: List<&2, Local.PlannedNode>, +offset: Nat) ->
    {P.indexed(items, next, later) == P.indexed(Compose.shift_slots(items, offset), next, Compose.shift_nodes(later, offset)) : Bool}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{owner, +index, symbol, +reference} <> +tail:
      %forward_reference(reference, later, offset): {P.indexed(Local.ReferenceSlot{owner, index, symbol, reference} <> tail, next, later) == Bool.and(Nat.is_eq(index, next), Bool.and(_, P.indexed(Compose.shift_slots(tail, offset), (next + 1n : Nat), Compose.shift_nodes(later, offset)))) : Bool}
      %indexed(tail, (next + 1n : Nat), later, offset): {P.indexed(Local.ReferenceSlot{owner, index, symbol, reference} <> tail, next, later) == Bool.and(Nat.is_eq(index, next), Bool.and(P.forward_reference(reference, later), _)) : Bool}
      {==}

def owner_pick(+flag: Bool, +id: Nat, +index: Nat, +symbol: String, +reference: Local.PlannedReference,
    +rest: List<&2, Local.ReferenceSlot>, +offset: Nat) ->
    {Compose.shift_slots(Bool.pick(List<&2, Local.ReferenceSlot>, flag,
        Local.ReferenceSlot{id, index, symbol, reference} <> rest, rest), offset)
      == Bool.pick(List<&2, Local.ReferenceSlot>, flag,
        Local.ReferenceSlot{(id + offset : Nat), index, symbol, Compose.shift_reference(reference, offset)} <>
          Compose.shift_slots(rest, offset), Compose.shift_slots(rest, offset)) : List<&2, Local.ReferenceSlot>}:
  match flag:
    case True{}: {==}
    case False{}: {==}

def owner_slots(items: List<&2, Local.ReferenceSlot>, +owner: Nat, +offset: Nat) ->
    {Compose.shift_slots(P.owner_slots(items, owner), offset) ==
      P.owner_slots(Compose.shift_slots(items, offset), (owner + offset : Nat)) : List<&2, Local.ReferenceSlot>}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+id, +index, +symbol, +reference} <> +tail:
      %add_right_cancel_iff(id, owner, offset): {Compose.shift_slots(P.owner_slots(Local.ReferenceSlot{id, index, symbol, reference} <> tail, owner), offset) == Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{(id + offset : Nat), index, symbol, Compose.shift_reference(reference, offset)} <> P.owner_slots(Compose.shift_slots(tail, offset), (owner + offset : Nat)), P.owner_slots(Compose.shift_slots(tail, offset), (owner + offset : Nat))) : List<&2, Local.ReferenceSlot>}
      %owner_slots(tail, owner, offset): {Compose.shift_slots(P.owner_slots(Local.ReferenceSlot{id, index, symbol, reference} <> tail, owner), offset) == Bool.pick(List<&2, Local.ReferenceSlot>, Nat.is_eq(id, owner), Local.ReferenceSlot{(id + offset : Nat), index, symbol, Compose.shift_reference(reference, offset)} <> _, P.owner_slots(Compose.shift_slots(tail, offset), (owner + offset : Nat))) : List<&2, Local.ReferenceSlot>}
      %owner_slots(tail, owner, offset): {Compose.shift_slots(P.owner_slots(Local.ReferenceSlot{id, index, symbol, reference} <> tail, owner), offset) == Bool.pick(List<&2, Local.ReferenceSlot>, Nat.is_eq(id, owner), Local.ReferenceSlot{(id + offset : Nat), index, symbol, Compose.shift_reference(reference, offset)} <> Compose.shift_slots(P.owner_slots(tail, owner), offset), _) : List<&2, Local.ReferenceSlot>}
      owner_pick(Nat.is_eq(id, owner), id, index, symbol, reference, P.owner_slots(tail, owner), offset)

def reference(+owner: Nat, +index: Nat, +symbol: String, value: Local.PlannedReference,
    +addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {P.reference(Local.ReferenceSlot{owner, index, symbol, value}, addresses) ==
      P.reference(Local.ReferenceSlot{(owner + offset : Nat), index, symbol, Compose.shift_reference(value, offset)},
        Mapping.shifted(addresses, offset)) : Maybe<&2, F.Reference>}:
  match value:
    case Local.Expanded{+id}:
      %address_at(addresses, id, offset): {P.reference(Local.ReferenceSlot{owner, index, symbol, Local.Expanded{id}}, addresses) == P.expanded_reference(_, symbol) : Maybe<&2, F.Reference>}
      {==}
    case Local.Included{_}: {==}
    case Local.Omitted{_, _}: {==}

def references(items: List<&2, Local.ReferenceSlot>, +addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {P.references(items, addresses) == P.references(Compose.shift_slots(items, offset), Mapping.shifted(addresses, offset))
      : Maybe<&2, List<&2, F.Reference>>}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+owner, +index, +symbol, +value} <> +tail:
      %reference(owner, index, symbol, value, addresses, offset): {P.references(Local.ReferenceSlot{owner, index, symbol, value} <> tail, addresses) == P.reference_prefix(_, P.references(Compose.shift_slots(tail, offset), Mapping.shifted(addresses, offset))) : Maybe<&2, List<&2, F.Reference>>}
      %references(tail, addresses, offset): {P.references(Local.ReferenceSlot{owner, index, symbol, value} <> tail, addresses) == P.reference_prefix(P.reference(Local.ReferenceSlot{owner, index, symbol, value}, addresses), _) : Maybe<&2, List<&2, F.Reference>>}
      {==}

def nodes(items: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {P.nodes(items, slots, artifacts, addresses) == P.nodes(Compose.shift_nodes(items, offset),
      Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset)) : Maybe<&2, List<&2, F.Node>>}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, +handle} <> +tail:
      %address_at(addresses, id, offset): {P.nodes(Local.PlannedNode{id, handle} <> tail, slots, artifacts, addresses) == P.node_prefix(P.projected_node(_, F.artifact_at(artifacts, handle), P.references(P.owner_slots(Compose.shift_slots(slots, offset), (id + offset : Nat)), Mapping.shifted(addresses, offset))), P.nodes(Compose.shift_nodes(tail, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset))) : Maybe<&2, List<&2, F.Node>>}
      %owner_slots(slots, id, offset): {P.nodes(Local.PlannedNode{id, handle} <> tail, slots, artifacts, addresses) == P.node_prefix(P.projected_node(F.address_at(addresses, id), F.artifact_at(artifacts, handle), P.references(_, Mapping.shifted(addresses, offset))), P.nodes(Compose.shift_nodes(tail, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset))) : Maybe<&2, List<&2, F.Node>>}
      %references(P.owner_slots(slots, id), addresses, offset): {P.nodes(Local.PlannedNode{id, handle} <> tail, slots, artifacts, addresses) == P.node_prefix(P.projected_node(F.address_at(addresses, id), F.artifact_at(artifacts, handle), _), P.nodes(Compose.shift_nodes(tail, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset))) : Maybe<&2, List<&2, F.Node>>}
      %nodes(tail, slots, artifacts, addresses, offset): {P.nodes(Local.PlannedNode{id, handle} <> tail, slots, artifacts, addresses) == P.node_prefix(P.projected_node(F.address_at(addresses, id), F.artifact_at(artifacts, handle), P.references(P.owner_slots(slots, id), addresses)), _) : Maybe<&2, List<&2, F.Node>>}
      {==}

def main() -> Unit:
  Unit{}
