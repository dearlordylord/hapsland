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

def slots_owned(items: List<&2, Local.ReferenceSlot>, +nodes: List<&2, Local.PlannedNode>, +offset: Nat) ->
    {P.slots_owned(items, nodes) == P.slots_owned(Compose.shift_slots(items, offset), Compose.shift_nodes(nodes, offset)) : Bool}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+owner, index, symbol, reference} <> +tail:
      %node_count(nodes, owner, offset): {P.slots_owned(Local.ReferenceSlot{owner, index, symbol, reference} <> tail, nodes) == Bool.and(Nat.is_eq(_, 1n), P.slots_owned(Compose.shift_slots(tail, offset), Compose.shift_nodes(nodes, offset))) : Bool}
      %slots_owned(tail, nodes, offset): {P.slots_owned(Local.ReferenceSlot{owner, index, symbol, reference} <> tail, nodes) == Bool.and(Nat.is_eq(P.node_count(nodes, owner), 1n), _) : Bool}
      {==}

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

def forward_nodes(items: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>, +offset: Nat) ->
    {P.forward_nodes(items, slots) == P.forward_nodes(Compose.shift_nodes(items, offset), Compose.shift_slots(slots, offset)) : Bool}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, handle} <> +tail:
      %owner_slots(slots, id, offset): {P.forward_nodes(Local.PlannedNode{id, handle} <> tail, slots) == Bool.and(P.indexed(_, 0n, Compose.shift_nodes(tail, offset)), P.forward_nodes(Compose.shift_nodes(tail, offset), Compose.shift_slots(slots, offset))) : Bool}
      %indexed(P.owner_slots(slots, id), 0n, tail, offset): {P.forward_nodes(Local.PlannedNode{id, handle} <> tail, slots) == Bool.and(_, P.forward_nodes(Compose.shift_nodes(tail, offset), Compose.shift_slots(slots, offset))) : Bool}
      %forward_nodes(tail, slots, offset): {P.forward_nodes(Local.PlannedNode{id, handle} <> tail, slots) == Bool.and(P.indexed(P.owner_slots(slots, id), 0n, tail), _) : Bool}
      {==}

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

def forest(+root: Nat, +items: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {P.forest(F.address_at(addresses, root), P.nodes(items, slots, artifacts, addresses)) ==
      P.forest(F.address_at(Mapping.shifted(addresses, offset), (root + offset : Nat)),
        P.nodes(Compose.shift_nodes(items, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset))) : Maybe<&2, F.Forest>}:
  %address_at(addresses, root, offset): {P.forest(F.address_at(addresses, root), P.nodes(items, slots, artifacts, addresses)) == P.forest(_, P.nodes(Compose.shift_nodes(items, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset))) : Maybe<&2, F.Forest>}
  %nodes(items, slots, artifacts, addresses, offset): {P.forest(F.address_at(addresses, root), P.nodes(items, slots, artifacts, addresses)) == P.forest(F.address_at(addresses, root), _) : Maybe<&2, F.Forest>}
  {==}

def validated(valid: Bool, +root: Nat, +items: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {P.validated(valid, root, items, slots, artifacts, addresses) == P.validated(valid, (root + offset : Nat),
      Compose.shift_nodes(items, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset)) : Maybe<&2, F.Forest>}:
  match valid:
    case False{}: {==}
    case True{}: forest(root, items, slots, artifacts, addresses, offset)

def project(+root: Nat, +nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {P.project(root, nodes, slots, artifacts, addresses) == P.project((root + offset : Nat), Compose.shift_nodes(nodes, offset),
      Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset)) : Maybe<&2, F.Forest>}:
  %aligned(nodes, addresses, nodes, addresses, offset): {P.project(root, nodes, slots, artifacts, addresses) == P.validated(Bool.and(_, Bool.and(P.catalog_unique(artifacts, artifacts), Bool.and(P.slots_owned(Compose.shift_slots(slots, offset), Compose.shift_nodes(nodes, offset)), P.forward_nodes(Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset))))), (root + offset : Nat), Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset)) : Maybe<&2, F.Forest>}
  %slots_owned(slots, nodes, offset): {P.project(root, nodes, slots, artifacts, addresses) == P.validated(Bool.and(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts), Bool.and(_, P.forward_nodes(Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset))))), (root + offset : Nat), Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset)) : Maybe<&2, F.Forest>}
  %forward_nodes(nodes, slots, offset): {P.project(root, nodes, slots, artifacts, addresses) == P.validated(Bool.and(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts), Bool.and(P.slots_owned(slots, nodes), _))), (root + offset : Nat), Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset)) : Maybe<&2, F.Forest>}
  validated(Bool.and(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts), Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots)))), root, nodes, slots, artifacts, addresses, offset)

# Astra-approved internal transport. No density, successful projection, or
# disjoint-parent premise: the complete Maybe forest is unchanged, including None.
# This does not establish that remap.next_node is an allocation highwater.
law projection_shift_exact:
  for +root: Nat
  for +nodes: List<&2, Local.PlannedNode>
  for +slots: List<&2, Local.ReferenceSlot>
  for +artifacts: List<&2, T.ArtifactEntry>
  for +addresses: List<&2, F.AddressEntry>
  for +offset: Nat
  {P.project((root + offset : Nat), Compose.shift_nodes(nodes, offset),
    Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset))
    == P.project(root, nodes, slots, artifacts, addresses) : Maybe<&2, F.Forest>}


def projection_shift_exact(root, nodes, slots, artifacts, addresses, offset):
  +root = root
  +nodes = nodes
  +slots = slots
  +artifacts = artifacts
  +addresses = addresses
  +offset = offset
  Equal.sym(Maybe<&2, F.Forest>, P.project(root, nodes, slots, artifacts, addresses),
    P.project((root + offset : Nat), Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset), artifacts,
      Mapping.shifted(addresses, offset)), project(root, nodes, slots, artifacts, addresses, offset))

def child_projection(plan: Local.Plan, artifacts: List<&2, T.ArtifactEntry>, addresses: List<&2, F.AddressEntry>) -> Maybe<&2, F.Forest>:
  match plan:
    case Local.Plan{root, nodes, slots, _, _, _}: P.project(root, nodes, slots, artifacts, addresses)

def remapped_projection(plan: Compose.RemappedPlan, artifacts: List<&2, T.ArtifactEntry>, addresses: List<&2, F.AddressEntry>) -> Maybe<&2, F.Forest>:
  match plan:
    case Compose.RemappedPlan{root, _, nodes, slots, _, _, _}: P.project(root, nodes, slots, artifacts, addresses)

# Same child forest from the actual remap constructor, including malformed None.
law remap_projection_exact:
  for +plan: Local.Plan
  for +artifacts: List<&2, T.ArtifactEntry>
  for +addresses: List<&2, F.AddressEntry>
  for +offset: Nat
  {remapped_projection(Compose.remap(plan, offset), artifacts, Mapping.shifted(addresses, offset))
    == child_projection(plan, artifacts, addresses) : Maybe<&2, F.Forest>}

def remap_projection_exact(plan, artifacts, addresses, offset):
  match plan:
    case Local.Plan{root, nodes, slots, _, _, _}:
      projection_shift_exact(root, nodes, slots, artifacts, addresses, offset)

# Exact retained payload and counter formula; highwater/density is not asserted.
def remap_fields(+root: Nat, +nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +pending: List<&2, Local.Pending>, +visited: Map<&2, Bool>, +budget: Local.Budget, +offset: Nat) ->
    {Compose.remap(Local.Plan{root, nodes, slots, pending, visited, budget}, offset) ==
      Compose.RemappedPlan{(root + offset : Nat), (offset + List.length(&2, Local.PlannedNode, nodes) : Nat),
        Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset), Compose.shift_pending(pending, offset),
        visited, budget} : Compose.RemappedPlan}:
  {==}

def payload_at_same(address: Maybe<&2, O.NodeAddress>, +owner: Nat, +index: Nat, +from: String,
    +symbol: String, +name: String, +depth: Nat, +expected: Local.ExpectedKind, +target: Local.PendingTarget, +offset: Nat) ->
    {V.payload_at(address, Local.Pending{owner, index, from, symbol, name, depth, expected, target}) ==
      V.payload_at(address, Local.Pending{(owner + offset : Nat), index, from, symbol, name, depth, expected, target})
      : Maybe<&2, V.PendingPayload>}:
  match address:
    case None{}: {==}
    case Some{_}: {==}

def pending_payload(+owner: Nat, +index: Nat, +from: String, +symbol: String, +name: String,
    +depth: Nat, +expected: Local.ExpectedKind, +target: Local.PendingTarget,
    +addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {V.pending_payload(Local.Pending{owner, index, from, symbol, name, depth, expected, target}, addresses) ==
      V.pending_payload(Local.Pending{(owner + offset : Nat), index, from, symbol, name, depth, expected, target},
        Mapping.shifted(addresses, offset)) : Maybe<&2, V.PendingPayload>}:
  %address_at(addresses, owner, offset):
    {V.pending_payload(Local.Pending{owner, index, from, symbol, name, depth, expected, target}, addresses) ==
      V.payload_at(_, Local.Pending{(owner + offset : Nat), index, from, symbol, name, depth, expected, target})
      : Maybe<&2, V.PendingPayload>}
  payload_at_same(F.address_at(addresses, owner), owner, index, from, symbol, name, depth, expected, target, offset)

def pending(items: List<&2, Local.Pending>, +addresses: List<&2, F.AddressEntry>, +offset: Nat) ->
    {Ready.pending(items, addresses) == Ready.pending(Compose.shift_pending(items, offset), Mapping.shifted(addresses, offset))
      : Maybe<&2, List<&2, V.PendingPayload>>}:
  match items:
    case []: {==}
    case Local.Pending{+owner, +index, +from, +symbol, +name, +depth, +expected, +target} <> +tail:
      %pending_payload(owner, index, from, symbol, name, depth, expected, target, addresses, offset):
        {Ready.pending(Local.Pending{owner, index, from, symbol, name, depth, expected, target} <> tail, addresses) ==
          Ready.pending_prefix(_, Ready.pending(Compose.shift_pending(tail, offset), Mapping.shifted(addresses, offset)))
          : Maybe<&2, List<&2, V.PendingPayload>>}
      %pending(tail, addresses, offset):
        {Ready.pending(Local.Pending{owner, index, from, symbol, name, depth, expected, target} <> tail, addresses) ==
          Ready.pending_prefix(V.pending_payload(Local.Pending{owner, index, from, symbol, name, depth, expected, target}, addresses), _)
          : Maybe<&2, List<&2, V.PendingPayload>>}
      {==}

def main() -> Unit:
  Unit{}
