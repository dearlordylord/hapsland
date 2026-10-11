import Base
import ./RetainedForestProjection.bend as P
import ./AttachmentMapping.bend as Mapping
import ./AttachmentNodeReplacementTransport.bend as Replacement
import ./AttachmentProjectionAllowanceProof.bend as Count
import ./AttachmentProjectionContentsProof.bend as Contents
import ./AttachmentParentAllocationProof.bend as Allocation
import ./ActualAttachmentFrameProjection.bend as Frame
import ./ActualAttachmentPhaseProjection.bend as Ready
import ./ForestRelation.bend as Relation
import ../Composition.bend as Compose
import ../ForestSpecification.bend as F
import ../ExpansionSpecification.bend as X
import ../WholeObservation.bend as O
import ../Types.bend as T
import ../traversal/core.bend as Local

# One coupled internal cut, extracted from the original ready phase.
# All success observations below are conclusions, not successful-attachment premises.
# Existing data owners only; no new runtime representation or attachment implementation.
def attachment_nodes(value: Compose.Attachment) -> List<&2, Local.PlannedNode>:
  match value:
    case Compose.Attachment{_, _, _, nodes, _, _, _, _, _}: nodes

def attachment_slots(value: Compose.Attachment) -> List<&2, Local.ReferenceSlot>:
  match value:
    case Compose.Attachment{_, _, _, _, slots, _, _, _, _}: slots

def attachment_next_node(value: Compose.Attachment) -> Nat:
  match value:
    case Compose.Attachment{_, node, _, _, _, _, _, _, _}: node

# Keep registration opaque: projection does not inspect pending-map contents.
def registered_fields(registration: Compose.RegisteredPending, +root: Nat, +next: Nat,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    edges: List<&2, Local.Pending>, visited: Map<&2, Bool>, budget: Local.Budget,
    +parents: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>) ->
    {attachment_nodes(Compose.attachment_registered(registration,
      Compose.RemappedPlan{root, next, children, child_slots, edges, visited, budget}, parents, slots))
      == List.append(&2, Local.PlannedNode, parents, children) : List<&2, Local.PlannedNode>} &
    {attachment_slots(Compose.attachment_registered(registration,
      Compose.RemappedPlan{root, next, children, child_slots, edges, visited, budget}, parents, slots))
      == List.append(&2, Local.ReferenceSlot, slots, child_slots) : List<&2, Local.ReferenceSlot>} &
    {attachment_next_node(Compose.attachment_registered(registration,
      Compose.RemappedPlan{root, next, children, child_slots, edges, visited, budget}, parents, slots)) == next : Nat}:
  match registration:
    case Compose.RegisteredPending{_, _, _}: Tuple{{==}, Tuple{{==}, {==}}}

# Once the original replacement equation is proved, the actual tentative
# transition preserves that very slot list and the exact pending registration.
def tentative_success(+root: Nat, +next: Nat, +children: List<&2, Local.PlannedNode>,
    +child_slots: List<&2, Local.ReferenceSlot>, +edges: List<&2, Local.Pending>,
    +visited: Map<&2, Bool>, +budget: Local.Budget, +parents: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat, known: Bool,
    +identity: String, +next_edge: Nat, +pending: Map<&2, Maybe<&2, Local.Pending>>,
    +replaced: List<&2, Local.ReferenceSlot>,
    success: {Compose.replacement(Compose.replace_slot(slots, owner, index,
      Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{root})))
      == Some{replaced} : Maybe<&2, List<&2, Local.ReferenceSlot>>}) ->
    {Compose.tentative_attachment(Compose.RemappedPlan{root, next, children, child_slots, edges, visited, budget},
      parents, slots, owner, index, Bool.pick(Maybe<&2, String>, known, Some{identity}, None{}), next_edge, pending)
      == Some{Compose.attachment_registered(Compose.register_pending(edges, next_edge, pending),
        Compose.RemappedPlan{root, next, children, child_slots, edges, visited, budget}, parents, replaced)} : Maybe<&2, Compose.Attachment>}:
  match known:
    case False{}:
      Equal.cong(Maybe<&2, List<&2, Local.ReferenceSlot>>, Maybe<&2, Compose.Attachment>,
        value => Compose.attach_replaced(value,
          Compose.RemappedPlan{root, next, children, child_slots, edges, visited, budget}, parents, next_edge, pending),
        Compose.replacement(Compose.replace_slot(slots, owner, index, Local.Expanded{root})), Some{replaced}, success)
    case True{}:
      Equal.cong(Maybe<&2, List<&2, Local.ReferenceSlot>>, Maybe<&2, Compose.Attachment>,
        value => Compose.attach_replaced(value,
          Compose.RemappedPlan{root, next, children, child_slots, edges, visited, budget}, parents, next_edge, pending),
        Compose.replacement(Compose.replace_slot(slots, owner, index, Local.Included{identity})), Some{replaced}, success)

# Append projection is structural over retained occurrences, including detached
# nodes. Both sides use the final shared slot/address context.
def nodes_append_row(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +right: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +catalog: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +before: List<&2, F.Node>, +after: List<&2, F.Node>,
    parts: Replacement.row_contents(id, handle, tail, slots, catalog, addresses, before),
    recursive: @+rest: List<&2, F.Node> ->
      {P.nodes(tail, slots, catalog, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} ->
      {P.nodes(List.append(&2, Local.PlannedNode, tail, right), slots, catalog, addresses)
        == Some{List.append(&2, F.Node, rest, after)} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.nodes(Local.PlannedNode{id, handle} <> List.append(&2, Local.PlannedNode, tail, right), slots, catalog, addresses)
      == Some{List.append(&2, F.Node, before, after)} : Maybe<&2, List<&2, F.Node>>}:
  match parts:
    case (+birth, (+artifact, (+refs, (+rest, (located, (selected, (references, (tail_done, same)))))))):
      %same:
        {P.nodes(Local.PlannedNode{id, handle} <> List.append(&2, Local.PlannedNode, tail, right), slots, catalog, addresses)
          == Some{List.append(&2, F.Node, _, after)} : Maybe<&2, List<&2, F.Node>>}
      Replacement.projected_cons(id, handle, List.append(&2, Local.PlannedNode, tail, right), slots, catalog, addresses,
        birth, artifact, refs, List.append(&2, F.Node, rest, after), located, selected, references,
        recursive(rest)(tail_done))

def nodes_append(left: List<&2, Local.PlannedNode>, +right: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +before: List<&2, F.Node>, +after: List<&2, F.Node>,
    left_done: {P.nodes(left, slots, catalog, addresses) == Some{before} : Maybe<&2, List<&2, F.Node>>},
    right_done: {P.nodes(right, slots, catalog, addresses) == Some{after} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.nodes(List.append(&2, Local.PlannedNode, left, right), slots, catalog, addresses)
      == Some{List.append(&2, F.Node, before, after)} : Maybe<&2, List<&2, F.Node>>}:
  match left:
    case []:
      %Count.some_equal(List<&2, F.Node>, [], before, left_done):
        {P.nodes(right, slots, catalog, addresses) == Some{List.append(&2, F.Node, _, after)} : Maybe<&2, List<&2, F.Node>>}
      right_done
    case Local.PlannedNode{+id, +handle} <> +tail:
      nodes_append_row(id, handle, tail, right, slots, catalog, addresses, before, after,
        Replacement.split_nodes(id, handle, tail, slots, catalog, addresses, before, left_done),
        rest => done => nodes_append(tail, right, slots, catalog, addresses, rest, after, done, right_done))

# Extending an address table cannot change an already resolved parent address.
def address_append_selected(+id: Nat, +birth: O.NodeAddress, +tail: List<&2, F.AddressEntry>,
    +suffix: List<&2, F.AddressEntry>, +query: Nat, +found: O.NodeAddress,
    flag: Bool, branch: {Nat.is_eq(id, query) == flag : Bool},
    present: {Bool.pick(Maybe<&2, O.NodeAddress>, flag, Some{birth}, F.address_at(tail, query))
      == Some{found} : Maybe<&2, O.NodeAddress>},
    recursive: {F.address_at(tail, query) == Some{found} : Maybe<&2, O.NodeAddress>} ->
      {F.address_at(List.append(&2, F.AddressEntry, tail, suffix), query) == Some{found} : Maybe<&2, O.NodeAddress>}) ->
    {F.address_at(F.AddressEntry{id, birth} <> List.append(&2, F.AddressEntry, tail, suffix), query)
      == Some{found} : Maybe<&2, O.NodeAddress>}:
  match flag:
    case True{}:
      %Equal.sym(Bool, Nat.is_eq(id, query), True{}, branch):
        {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(List.append(&2, F.AddressEntry, tail, suffix), query))
          == Some{found} : Maybe<&2, O.NodeAddress>}
      present
    case False{}:
      %Equal.sym(Bool, Nat.is_eq(id, query), False{}, branch):
        {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(List.append(&2, F.AddressEntry, tail, suffix), query))
          == Some{found} : Maybe<&2, O.NodeAddress>}
      recursive(present)

def address_append_present(prefix: List<&2, F.AddressEntry>, +suffix: List<&2, F.AddressEntry>,
    +query: Nat, +found: O.NodeAddress,
    present: {F.address_at(prefix, query) == Some{found} : Maybe<&2, O.NodeAddress>}) ->
    {F.address_at(List.append(&2, F.AddressEntry, prefix, suffix), query) == Some{found} : Maybe<&2, O.NodeAddress>}:
  match prefix:
    case []:
      Empty.absurd({F.address_at(suffix, query) == Some{found} : Maybe<&2, O.NodeAddress>},
        Contents.none_some(O.NodeAddress, found, present))
    case F.AddressEntry{+id, +birth} <> +tail:
      address_append_selected(id, birth, tail, suffix, query, found, Nat.is_eq(id, query), {==}, present,
        done => address_append_present(tail, suffix, query, found, done))

def expanded_append(+addresses: List<&2, F.AddressEntry>, +suffix: List<&2, F.AddressEntry>,
    owner: Nat, index: Nat, +symbol: String, +child: Nat, +reference: F.Reference,
    observed: Maybe<&2, O.NodeAddress>, located: {F.address_at(addresses, child) == observed : Maybe<&2, O.NodeAddress>},
    present: {P.expanded_reference(observed, symbol) == Some{reference} : Maybe<&2, F.Reference>}) ->
    {P.reference(Local.ReferenceSlot{owner, index, symbol, Local.Expanded{child}}, List.append(&2, F.AddressEntry, addresses, suffix))
      == Some{reference} : Maybe<&2, F.Reference>}:
  match observed:
    case None{}:
      Empty.absurd({P.expanded_reference(F.address_at(List.append(&2, F.AddressEntry, addresses, suffix), child), symbol)
        == Some{reference} : Maybe<&2, F.Reference>}, Contents.none_some(F.Reference, reference, present))
    case Some{+birth}:
      %Equal.sym(Maybe<&2, O.NodeAddress>, F.address_at(List.append(&2, F.AddressEntry, addresses, suffix), child), Some{birth},
        address_append_present(addresses, suffix, child, birth, located)):
        {P.expanded_reference(_, symbol) == Some{reference} : Maybe<&2, F.Reference>}
      present


# Every old expanded reference is resolved before extending the table. Its
# original symbol and target address therefore survive extension unchanged.
def reference_append(slot: Local.ReferenceSlot, +addresses: List<&2, F.AddressEntry>,
    +suffix: List<&2, F.AddressEntry>, +reference: F.Reference,
    present: {P.reference(slot, addresses) == Some{reference} : Maybe<&2, F.Reference>}) ->
    {P.reference(slot, List.append(&2, F.AddressEntry, addresses, suffix)) == Some{reference} : Maybe<&2, F.Reference>}:
  match slot:
    case Local.ReferenceSlot{_, _, _, Local.Included{_}}: present
    case Local.ReferenceSlot{_, _, _, Local.Omitted{_, _}}: present
    case Local.ReferenceSlot{owner, index, symbol, Local.Expanded{+child}}:
      expanded_append(addresses, suffix, owner, index, symbol, child, reference, F.address_at(addresses, child), {==}, present)

law parent_attachment_exact:
  for +parent_root: Nat
  for +parent_nodes: List<&2, Local.PlannedNode>
  for +parent_slots: List<&2, Local.ReferenceSlot>
  for +parent_addresses: List<&2, F.AddressEntry>
  for +parent_forest: F.Forest
  for +child_root: Nat
  for +child_nodes: List<&2, Local.PlannedNode>
  for +child_slots: List<&2, Local.ReferenceSlot>
  for +child_pending: List<&2, Local.Pending>
  for +child_visited: Map<&2, Bool>
  for +child_budget: Local.Budget
  for +child_birth: O.NodeAddress
  for +child_semantic_nodes: List<&2, F.Node>
  for +child_addresses: List<&2, F.AddressEntry>
  for +catalog: List<&2, T.ArtifactEntry>
  for +episode: Nat
  for +owner: Nat
  for +index: Nat
  for +symbol: String
  for +owner_address: O.NodeAddress
  for +known: Bool
  for +identity: String
  for +next_edge: Nat
  for +pending: Map<&2, Maybe<&2, Local.Pending>>
  for parent_projection: {P.project(parent_root, parent_nodes, parent_slots, catalog, parent_addresses)
    == Some{parent_forest} : Maybe<&2, F.Forest>}
  for parent_dense: {Frame.dense(parent_nodes, 0n) == True{} : Bool}
  for parent_valid: {Relation.frame_forest(parent_forest, episode) == True{} : Bool}
  for child_projection: {P.project(child_root, child_nodes, child_slots, catalog, child_addresses)
    == Some{F.Forest{Some{child_birth}, child_semantic_nodes}} : Maybe<&2, F.Forest>}
  for child_dense: {Frame.dense(child_nodes, 0n) == True{} : Bool}
  for child_fresh: {Ready.fresh_forest(F.Forest{Some{child_birth}, child_semantic_nodes}, episode) == True{} : Bool}
  for selected: {Nat.is_eq(Ready.slot_count(parent_slots, owner, index, symbol), 1n) == True{} : Bool}
  for owner_present: {F.address_at(parent_addresses, owner) == Some{owner_address} : Maybe<&2, O.NodeAddress>}
  Exists(List<&2, Local.ReferenceSlot>, replaced => Exists(Compose.Attachment, attachment => Exists(F.Forest, updated =>
    {Compose.replacement(Compose.replace_slot(parent_slots, owner, index, Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{(child_root + List.length(&2, Local.PlannedNode, parent_nodes) : Nat)})))
      == Some{replaced} : Maybe<&2, List<&2, Local.ReferenceSlot>>} &
    {Compose.tentative_attachment(Compose.remap(Local.Plan{child_root, child_nodes, child_slots, child_pending, child_visited, child_budget}, List.length(&2, Local.PlannedNode, parent_nodes)), parent_nodes, parent_slots,
      owner, index, Bool.pick(Maybe<&2, String>, known, Some{identity}, None{}), next_edge, pending) == Some{attachment} : Maybe<&2, Compose.Attachment>} &
    {attachment == Compose.attachment_registered(Compose.register_pending(Compose.shift_pending(child_pending, List.length(&2, Local.PlannedNode, parent_nodes)),
      next_edge, pending), Compose.remap(Local.Plan{child_root, child_nodes, child_slots, child_pending, child_visited, child_budget}, List.length(&2, Local.PlannedNode, parent_nodes)), parent_nodes, replaced) : Compose.Attachment} &
    {F.replace(F.append(parent_forest, F.Created{child_birth, child_semantic_nodes, child_addresses}), owner_address, index,
      X.attachment_reference(known, F.Created{child_birth, child_semantic_nodes, child_addresses}, symbol, identity)) == F.Replaced{updated} : F.Replacement} &
    {P.project(parent_root, attachment_nodes(attachment), attachment_slots(attachment), catalog,
      Mapping.extended(parent_addresses, List.length(&2, Local.PlannedNode, parent_nodes), F.Created{child_birth, child_semantic_nodes, child_addresses})) == Some{updated} : Maybe<&2, F.Forest>} &
    {Relation.frame_forest(updated, (episode + 1n : Nat)) == True{} : Bool} &
    {attachment_next_node(attachment) == (List.length(&2, Local.PlannedNode, parent_nodes) + List.length(&2, Local.PlannedNode, child_nodes) : Nat) : Nat} &
    {Frame.dense(attachment_nodes(attachment), 0n) == True{} : Bool}
  )))

def main() -> Unit:
  Unit{}
