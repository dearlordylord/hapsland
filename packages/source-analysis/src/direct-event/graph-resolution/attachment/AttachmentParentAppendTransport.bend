import Base
import ./RetainedForestProjection.bend as P
import ./AttachmentMapping.bend as Mapping
import ./AttachmentNodeReplacementTransport.bend as Replacement
import ./AttachmentProjectionAllowanceProof.bend as Count
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
      match Replacement.split_nodes(id, handle, tail, slots, catalog, addresses, before, left_done):
        case (+birth, (+artifact, (+refs, (+rest, (located, (selected, (references, (tail_done, same)))))))):
          %same:
            {P.nodes(Local.PlannedNode{id, handle} <> List.append(&2, Local.PlannedNode, tail, right), slots, catalog, addresses)
              == Some{List.append(&2, F.Node, _, after)} : Maybe<&2, List<&2, F.Node>>}
          Replacement.projected_cons(id, handle, List.append(&2, Local.PlannedNode, tail, right), slots, catalog, addresses,
            birth, artifact, refs, List.append(&2, F.Node, rest, after), located, selected, references,
            nodes_append(tail, right, slots, catalog, addresses, rest, after, tail_done, right_done))

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
