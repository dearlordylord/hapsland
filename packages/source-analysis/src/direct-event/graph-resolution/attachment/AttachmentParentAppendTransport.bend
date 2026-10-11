import Base
import ./RetainedForestProjection.bend as P
import ./AttachmentMapping.bend as Mapping
import ./AttachmentRemapProjectionProof.bend as Remap
import ./AttachmentNodeReplacementTransport.bend as Replacement
import ./AttachmentProjectionAllowanceProof.bend as Count
import ./AttachmentProjectionContentsProof.bend as Contents
import ./AttachmentReplacementStructureProof.bend as Structure
import ../traversal/INTERPRETER_NAT_FACTS.bend as N
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
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

def references_append_row(+slot: Local.ReferenceSlot, +tail: List<&2, Local.ReferenceSlot>,
    +addresses: List<&2, F.AddressEntry>, +suffix: List<&2, F.AddressEntry>, +refs: List<&2, F.Reference>,
    recursive: @+rest: List<&2, F.Reference> ->
      {P.references(tail, addresses) == Some{rest} : Maybe<&2, List<&2, F.Reference>>} ->
      {P.references(tail, List.append(&2, F.AddressEntry, addresses, suffix)) == Some{rest} : Maybe<&2, List<&2, F.Reference>>},
    parts: Exists(F.Reference, head => Exists(List<&2, F.Reference>, rest =>
      {P.reference(slot, addresses) == Some{head} : Maybe<&2, F.Reference>} &
      {P.references(tail, addresses) == Some{rest} : Maybe<&2, List<&2, F.Reference>>} &
      {Some{head <> rest} == Some{refs} : Maybe<&2, List<&2, F.Reference>>}))) ->
    {P.references(slot <> tail, List.append(&2, F.AddressEntry, addresses, suffix)) == Some{refs} : Maybe<&2, List<&2, F.Reference>>}:
  match parts:
    case (+head, (+rest, (head_done, (tail_done, same)))):
      %Count.some_equal(List<&2, F.Reference>, head <> rest, refs, same):
        {P.references(slot <> tail, List.append(&2, F.AddressEntry, addresses, suffix)) == Some{_} : Maybe<&2, List<&2, F.Reference>>}
      %Equal.sym(Maybe<&2, F.Reference>, P.reference(slot, List.append(&2, F.AddressEntry, addresses, suffix)), Some{head},
        reference_append(slot, addresses, suffix, head, head_done)):
        {P.reference_prefix(_, P.references(tail, List.append(&2, F.AddressEntry, addresses, suffix))) == Some{head <> rest} : Maybe<&2, List<&2, F.Reference>>}
      %Equal.sym(Maybe<&2, List<&2, F.Reference>>, P.references(tail, List.append(&2, F.AddressEntry, addresses, suffix)), Some{rest}, recursive(rest)(tail_done)):
        {P.reference_prefix(Some{head}, _) == Some{head <> rest} : Maybe<&2, List<&2, F.Reference>>}
      {==}

def references_append(items: List<&2, Local.ReferenceSlot>, +addresses: List<&2, F.AddressEntry>,
    +suffix: List<&2, F.AddressEntry>, +refs: List<&2, F.Reference>,
    present: {P.references(items, addresses) == Some{refs} : Maybe<&2, List<&2, F.Reference>>}) ->
    {P.references(items, List.append(&2, F.AddressEntry, addresses, suffix)) == Some{refs} : Maybe<&2, List<&2, F.Reference>>}:
  match items:
    case []: present
    case +slot <> +tail:
      references_append_row(slot, tail, addresses, suffix, refs,
        rest => done => references_append(tail, addresses, suffix, rest, done),
        Count.reference_prefix_contents(P.reference(slot, addresses), P.references(tail, addresses), refs, present))

def nodes_addresses_row(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +suffix: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>,
    parts: Replacement.row_contents(id, handle, tail, slots, catalog, addresses, retained),
    recursive: @+rest: List<&2, F.Node> ->
      {P.nodes(tail, slots, catalog, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} ->
      {P.nodes(tail, slots, catalog, List.append(&2, F.AddressEntry, addresses, suffix)) == Some{rest} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.nodes(Local.PlannedNode{id, handle} <> tail, slots, catalog, List.append(&2, F.AddressEntry, addresses, suffix))
      == Some{retained} : Maybe<&2, List<&2, F.Node>>}:
  match parts:
    case (+birth, (+artifact, (+refs, (+rest, (located, (selected, (references, (tail_done, same)))))))):
      %same:
        {P.nodes(Local.PlannedNode{id, handle} <> tail, slots, catalog, List.append(&2, F.AddressEntry, addresses, suffix))
          == Some{_} : Maybe<&2, List<&2, F.Node>>}
      Replacement.projected_cons(id, handle, tail, slots, catalog, List.append(&2, F.AddressEntry, addresses, suffix),
        birth, artifact, refs, rest, address_append_present(addresses, suffix, id, birth, located), selected,
        references_append(P.owner_slots(slots, id), addresses, suffix, refs, references), recursive(rest)(tail_done))

def nodes_addresses(items: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +catalog: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +suffix: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>,
    present: {P.nodes(items, slots, catalog, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.nodes(items, slots, catalog, List.append(&2, F.AddressEntry, addresses, suffix)) == Some{retained} : Maybe<&2, List<&2, F.Node>>}:
  match items:
    case []: present
    case Local.PlannedNode{+id, +handle} <> +tail:
      nodes_addresses_row(id, handle, tail, slots, catalog, addresses, suffix, retained,
        Replacement.split_nodes(id, handle, tail, slots, catalog, addresses, retained, present),
        rest => done => nodes_addresses(tail, slots, catalog, addresses, suffix, rest, done))

def owner_slot_append(flag: Bool, +id: Nat, +index: Nat, +symbol: String,
    +reference: Local.PlannedReference, +left: List<&2, Local.ReferenceSlot>, +right: List<&2, Local.ReferenceSlot>) ->
    {Bool.pick(List<&2, Local.ReferenceSlot>, flag,
      Local.ReferenceSlot{id, index, symbol, reference} <> List.append(&2, Local.ReferenceSlot, left, right),
      List.append(&2, Local.ReferenceSlot, left, right))
      == List.append(&2, Local.ReferenceSlot,
        Bool.pick(List<&2, Local.ReferenceSlot>, flag, Local.ReferenceSlot{id, index, symbol, reference} <> left, left), right)
      : List<&2, Local.ReferenceSlot>}:
  match flag:
    case True{}: {==}
    case False{}: {==}

# Slot filtering is stable in the actual concatenation order; no regrouping or
# assumed adjacency of references is introduced by attachment.
def owner_slots_append(left: List<&2, Local.ReferenceSlot>, +right: List<&2, Local.ReferenceSlot>, +owner: Nat) ->
    {P.owner_slots(List.append(&2, Local.ReferenceSlot, left, right), owner)
      == List.append(&2, Local.ReferenceSlot, P.owner_slots(left, owner), P.owner_slots(right, owner)) : List<&2, Local.ReferenceSlot>}:
  match left:
    case []: {==}
    case Local.ReferenceSlot{+id, +index, +symbol, +reference} <> +tail:
      %Equal.sym(List<&2, Local.ReferenceSlot>,
        P.owner_slots(List.append(&2, Local.ReferenceSlot, tail, right), owner),
        List.append(&2, Local.ReferenceSlot, P.owner_slots(tail, owner), P.owner_slots(right, owner)),
        owner_slots_append(tail, right, owner)):
        {P.owner_slot(Local.ReferenceSlot{id, index, symbol, reference}, owner, _)
          == List.append(&2, Local.ReferenceSlot,
            P.owner_slot(Local.ReferenceSlot{id, index, symbol, reference}, owner, P.owner_slots(tail, owner)), P.owner_slots(right, owner))
          : List<&2, Local.ReferenceSlot>}
      owner_slot_append(Nat.is_eq(id, owner), id, index, symbol, reference, P.owner_slots(tail, owner), P.owner_slots(right, owner))

def shifted_owner_distinct(+id: Nat, +offset: Nat, +query: Nat,
    below: {Nat.is_lt(query, offset) == True{} : Bool}) ->
    {Nat.is_eq((id + offset : Nat), query) == False{} : Bool}:
  Equal.trans(Bool, Nat.is_eq((id + offset : Nat), query), Nat.is_eq(query, (id + offset : Nat)), False{},
    Structure.is_eq_comm((id + offset : Nat), query),
    Structure.unequal_below(query, (id + offset : Nat),
      N.lt_of_lt_of_le(query, offset, (id + offset : Nat), below,
        N.add_le_add_right(0n, id, offset, N.zero_le(id)))))

def shifted_slots_exclude_parent(items: List<&2, Local.ReferenceSlot>, +offset: Nat, +owner: Nat,
    +below: {Nat.is_lt(owner, offset) == True{} : Bool}) ->
    {P.owner_slots(Compose.shift_slots(items, offset), owner) == [] : List<&2, Local.ReferenceSlot>}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+id, +index, +symbol, +reference} <> +tail:
      %Equal.sym(Bool, Nat.is_eq((id + offset : Nat), owner), False{}, shifted_owner_distinct(id, offset, owner, below)):
        {Bool.pick(List<&2, Local.ReferenceSlot>, _,
          Local.ReferenceSlot{(id + offset : Nat), index, symbol, Compose.shift_reference(reference, offset)} <>
            P.owner_slots(Compose.shift_slots(tail, offset), owner),
          P.owner_slots(Compose.shift_slots(tail, offset), owner)) == [] : List<&2, Local.ReferenceSlot>}
      shifted_slots_exclude_parent(tail, offset, owner, below)

def slots_append_nil(items: List<&2, Local.ReferenceSlot>) ->
    {List.append(&2, Local.ReferenceSlot, items, []) == items : List<&2, Local.ReferenceSlot>}:
  match items:
    case []: {==}
    case +head <> +tail:
      Equal.cong(List<&2, Local.ReferenceSlot>, List<&2, Local.ReferenceSlot>, rest => head <> rest,
        List.append(&2, Local.ReferenceSlot, tail, []), tail, slots_append_nil(tail))

def parent_owner_slots(+slots: List<&2, Local.ReferenceSlot>, +children: List<&2, Local.ReferenceSlot>,
    +offset: Nat, +owner: Nat, below: {Nat.is_lt(owner, offset) == True{} : Bool}) ->
    {P.owner_slots(List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, offset)), owner)
      == P.owner_slots(slots, owner) : List<&2, Local.ReferenceSlot>}:
  Equal.trans(List<&2, Local.ReferenceSlot>,
    P.owner_slots(List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, offset)), owner),
    List.append(&2, Local.ReferenceSlot, P.owner_slots(slots, owner), P.owner_slots(Compose.shift_slots(children, offset), owner)),
    P.owner_slots(slots, owner), owner_slots_append(slots, Compose.shift_slots(children, offset), owner),
    %Equal.sym(List<&2, Local.ReferenceSlot>, P.owner_slots(Compose.shift_slots(children, offset), owner), [],
      shifted_slots_exclude_parent(children, offset, owner, below)):
      {List.append(&2, Local.ReferenceSlot, P.owner_slots(slots, owner), _) == P.owner_slots(slots, owner) : List<&2, Local.ReferenceSlot>}
    slots_append_nil(P.owner_slots(slots, owner)))

def dense_head_room(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>, +start: Nat, +limit: Nat,
    dense: {Frame.dense(Local.PlannedNode{id, handle} <> tail, start) == True{} : Bool},
    room: {Nat.is_le((start + 1n+List.length(&2, Local.PlannedNode, tail) : Nat), limit) == True{} : Bool}) ->
    {Nat.is_lt(id, limit) == True{} : Bool}:
  %Equal.sym(Nat, id, start, N.eq_of_is_eq(id, start,
    B.eq_true_of_and_left(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense))):
    {Nat.is_lt(_, limit) == True{} : Bool}
  N.lt_of_lt_of_le(start, (start + 1n : Nat), limit,
    %Equal.sym(Nat, (start + 1n : Nat), 1n+start, Allocation.next_add(start)):
      {Nat.is_lt(start, _) == True{} : Bool}
    N.lt_succ_self(start),
    N.le_trans((start + 1n : Nat), ((start + 1n : Nat) + List.length(&2, Local.PlannedNode, tail) : Nat), limit,
      %N.add_zero((start + 1n : Nat)):
        {Nat.is_le(_, ((start + 1n : Nat) + List.length(&2, Local.PlannedNode, tail) : Nat)) == True{} : Bool}
      N.add_le_add_left(0n, List.length(&2, Local.PlannedNode, tail), (start + 1n : Nat), N.zero_le(List.length(&2, Local.PlannedNode, tail))),
      %Allocation.length_step(start, List.length(&2, Local.PlannedNode, tail)):
        {Nat.is_le(_, limit) == True{} : Bool}
      room))

# The child suffix cannot alter the projection of any dense parent occurrence.
def nodes_child_slots(items: List<&2, Local.PlannedNode>, +start: Nat, +offset: Nat,
    +slots: List<&2, Local.ReferenceSlot>, +children: List<&2, Local.ReferenceSlot>,
    +catalog: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +dense: {Frame.dense(items, start) == True{} : Bool},
    +room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, items) : Nat), offset) == True{} : Bool}) ->
    {P.nodes(items, List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, offset)), catalog, addresses)
      == P.nodes(items, slots, catalog, addresses) : Maybe<&2, List<&2, F.Node>>}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, +handle} <> +tail:
      %Equal.sym(List<&2, Local.ReferenceSlot>,
        P.owner_slots(List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, offset)), id), P.owner_slots(slots, id),
        parent_owner_slots(slots, children, offset, id, dense_head_room(id, handle, tail, start, offset, dense, room))):
        {P.node_prefix(P.projected_node(F.address_at(addresses, id), F.artifact_at(catalog, handle), P.references(_, addresses)),
          P.nodes(tail, List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, offset)), catalog, addresses))
          == P.nodes(Local.PlannedNode{id, handle} <> tail, slots, catalog, addresses) : Maybe<&2, List<&2, F.Node>>}
      %Equal.sym(Maybe<&2, List<&2, F.Node>>,
        P.nodes(tail, List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, offset)), catalog, addresses),
        P.nodes(tail, slots, catalog, addresses),
        nodes_child_slots(tail, (start + 1n : Nat), offset, slots, children, catalog, addresses,
          B.eq_true_of_and_right(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense),
          %Allocation.length_step(start, List.length(&2, Local.PlannedNode, tail)):
            {Nat.is_le(_, offset) == True{} : Bool}
          room)):
        {P.node_prefix(P.projected_node(F.address_at(addresses, id), F.artifact_at(catalog, handle), P.references(P.owner_slots(slots, id), addresses)), _)
          == P.nodes(Local.PlannedNode{id, handle} <> tail, slots, catalog, addresses) : Maybe<&2, List<&2, F.Node>>}
      {==}

def dense_count_upper(items: List<&2, Local.PlannedNode>, +start: Nat, +query: Nat,
    +dense: {Frame.dense(items, start) == True{} : Bool},
    +room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, items) : Nat), query) == True{} : Bool}) ->
    {P.node_count(items, query) == 0n : Nat}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, +handle} <> +tail:
      %Equal.sym(Bool, Nat.is_eq(query, id), False{},
        Equal.trans(Bool, Nat.is_eq(query, id), Nat.is_eq(id, query), False{}, Structure.is_eq_comm(query, id),
          Structure.unequal_below(id, query, dense_head_room(id, handle, tail, start, query, dense, room)))):
        {(Bool.pick(Nat, _, 1n, 0n) + P.node_count(tail, query) : Nat) == 0n : Nat}
      dense_count_upper(tail, (start + 1n : Nat), query,
        B.eq_true_of_and_right(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense),
        %Allocation.length_step(start, List.length(&2, Local.PlannedNode, tail)):
          {Nat.is_le(_, query) == True{} : Bool}
        room)

def dense_owner_branch(+items: List<&2, Local.PlannedNode>, +owner: Nat,
    dense: {Frame.dense(items, 0n) == True{} : Bool},
    present: {P.node_count(items, owner) == 1n : Nat},
    flag: Bool, branch: {Nat.is_lt(owner, List.length(&2, Local.PlannedNode, items)) == flag : Bool}) ->
    {Nat.is_lt(owner, List.length(&2, Local.PlannedNode, items)) == True{} : Bool}:
  match flag:
    case True{}: branch
    case False{}:
      Empty.absurd({Nat.is_lt(owner, List.length(&2, Local.PlannedNode, items)) == True{} : Bool},
        Structure.zero_ne_one(Equal.trans(Nat, 0n, P.node_count(items, owner), 1n,
          Equal.sym(Nat, P.node_count(items, owner), 0n,
            dense_count_upper(items, 0n, owner, dense, N.le_of_not_lt(owner, List.length(&2, Local.PlannedNode, items), branch))), present)))

def dense_owner_below(+items: List<&2, Local.PlannedNode>, +owner: Nat,
    dense: {Frame.dense(items, 0n) == True{} : Bool},
    present: {P.node_count(items, owner) == 1n : Nat}) ->
    {Nat.is_lt(owner, List.length(&2, Local.PlannedNode, items)) == True{} : Bool}:
  dense_owner_branch(items, owner, dense, present, Nat.is_lt(owner, List.length(&2, Local.PlannedNode, items)), {==})

# Ownership validation supplies the bound for every parent slot, even when its
# list order interleaves many owners or contains detached constructions.
def parent_slots_exclude_child(items: List<&2, Local.ReferenceSlot>, +parents: List<&2, Local.PlannedNode>,
    +child_id: Nat, +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +owned: {P.slots_owned(items, parents) == True{} : Bool}) ->
    {P.owner_slots(items, (child_id + List.length(&2, Local.PlannedNode, parents) : Nat)) == [] : List<&2, Local.ReferenceSlot>}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+id, +index, +symbol, +reference} <> +tail:
      %Equal.sym(Bool, Nat.is_eq(id, (child_id + List.length(&2, Local.PlannedNode, parents) : Nat)), False{},
        Equal.trans(Bool, Nat.is_eq(id, (child_id + List.length(&2, Local.PlannedNode, parents) : Nat)),
          Nat.is_eq((child_id + List.length(&2, Local.PlannedNode, parents) : Nat), id), False{},
          Structure.is_eq_comm(id, (child_id + List.length(&2, Local.PlannedNode, parents) : Nat)),
          shifted_owner_distinct(child_id, List.length(&2, Local.PlannedNode, parents), id,
            dense_owner_below(parents, id, dense, N.eq_of_is_eq(P.node_count(parents, id), 1n,
              B.eq_true_of_and_left(Nat.is_eq(P.node_count(parents, id), 1n), P.slots_owned(tail, parents), owned)))))):
        {Bool.pick(List<&2, Local.ReferenceSlot>, _,
          Local.ReferenceSlot{id, index, symbol, reference} <> P.owner_slots(tail, (child_id + List.length(&2, Local.PlannedNode, parents) : Nat)),
          P.owner_slots(tail, (child_id + List.length(&2, Local.PlannedNode, parents) : Nat))) == [] : List<&2, Local.ReferenceSlot>}
      parent_slots_exclude_child(tail, parents, child_id, dense,
        B.eq_true_of_and_right(Nat.is_eq(P.node_count(parents, id), 1n), P.slots_owned(tail, parents), owned))

def child_owner_slots(+slots: List<&2, Local.ReferenceSlot>, +children: List<&2, Local.ReferenceSlot>,
    +parents: List<&2, Local.PlannedNode>, +id: Nat,
    dense: {Frame.dense(parents, 0n) == True{} : Bool},
    owned: {P.slots_owned(slots, parents) == True{} : Bool}) ->
    {P.owner_slots(List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents))),
      (id + List.length(&2, Local.PlannedNode, parents) : Nat))
      == P.owner_slots(Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)),
        (id + List.length(&2, Local.PlannedNode, parents) : Nat)) : List<&2, Local.ReferenceSlot>}:
  Equal.trans(List<&2, Local.ReferenceSlot>,
    P.owner_slots(List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents))),
      (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
    List.append(&2, Local.ReferenceSlot, P.owner_slots(slots, (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
      P.owner_slots(Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat))),
    P.owner_slots(Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
    owner_slots_append(slots, Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
    %Equal.sym(List<&2, Local.ReferenceSlot>, P.owner_slots(slots, (id + List.length(&2, Local.PlannedNode, parents) : Nat)), [],
      parent_slots_exclude_child(slots, parents, id, dense, owned)):
      {List.append(&2, Local.ReferenceSlot, _,
        P.owner_slots(Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)))
        == P.owner_slots(Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)) : List<&2, Local.ReferenceSlot>}
    {==})

def nodes_parent_slots(items: List<&2, Local.PlannedNode>, +parents: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +children: List<&2, Local.ReferenceSlot>,
    +catalog: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +owned: {P.slots_owned(slots, parents) == True{} : Bool}) ->
    {P.nodes(Compose.shift_nodes(items, List.length(&2, Local.PlannedNode, parents)),
      List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents))), catalog, addresses)
      == P.nodes(Compose.shift_nodes(items, List.length(&2, Local.PlannedNode, parents)),
        Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), catalog, addresses) : Maybe<&2, List<&2, F.Node>>}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, +handle} <> +tail:
      %Equal.sym(List<&2, Local.ReferenceSlot>,
        P.owner_slots(List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents))), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
        P.owner_slots(Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
        child_owner_slots(slots, children, parents, id, dense, owned)):
        {P.node_prefix(P.projected_node(F.address_at(addresses, (id + List.length(&2, Local.PlannedNode, parents) : Nat)), F.artifact_at(catalog, handle), P.references(_, addresses)),
          P.nodes(Compose.shift_nodes(tail, List.length(&2, Local.PlannedNode, parents)), List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents))), catalog, addresses))
          == P.nodes(Compose.shift_nodes(Local.PlannedNode{id, handle} <> tail, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), catalog, addresses) : Maybe<&2, List<&2, F.Node>>}
      Equal.cong(Maybe<&2, List<&2, F.Node>>, Maybe<&2, List<&2, F.Node>>,
        rest => P.node_prefix(P.projected_node(F.address_at(addresses, (id + List.length(&2, Local.PlannedNode, parents) : Nat)), F.artifact_at(catalog, handle),
          P.references(P.owner_slots(Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)), addresses)), rest),
        P.nodes(Compose.shift_nodes(tail, List.length(&2, Local.PlannedNode, parents)), List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents))), catalog, addresses),
        P.nodes(Compose.shift_nodes(tail, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(children, List.length(&2, Local.PlannedNode, parents)), catalog, addresses),
        nodes_parent_slots(tail, parents, slots, children, catalog, addresses, dense, owned))

def address_append_absent_branch(+id: Nat, +birth: O.NodeAddress, +tail: List<&2, F.AddressEntry>,
    +suffix: List<&2, F.AddressEntry>, +query: Nat, flag: Bool,
    branch: {Nat.is_eq(id, query) == flag : Bool},
    absent: {Bool.pick(Maybe<&2, O.NodeAddress>, flag, Some{birth}, F.address_at(tail, query)) == None{} : Maybe<&2, O.NodeAddress>},
    recursive: {F.address_at(tail, query) == None{} : Maybe<&2, O.NodeAddress>} ->
      {F.address_at(List.append(&2, F.AddressEntry, tail, suffix), query) == F.address_at(suffix, query) : Maybe<&2, O.NodeAddress>}) ->
    {F.address_at(F.AddressEntry{id, birth} <> List.append(&2, F.AddressEntry, tail, suffix), query)
      == F.address_at(suffix, query) : Maybe<&2, O.NodeAddress>}:
  match flag:
    case True{}:
      Empty.absurd({F.address_at(F.AddressEntry{id, birth} <> List.append(&2, F.AddressEntry, tail, suffix), query)
        == F.address_at(suffix, query) : Maybe<&2, O.NodeAddress>},
        Contents.none_some(O.NodeAddress, birth, Equal.sym(Maybe<&2, O.NodeAddress>, Some{birth}, None{}, absent)))
    case False{}:
      %Equal.sym(Bool, Nat.is_eq(id, query), False{}, branch):
        {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(List.append(&2, F.AddressEntry, tail, suffix), query))
          == F.address_at(suffix, query) : Maybe<&2, O.NodeAddress>}
      recursive(absent)

def address_append_absent(prefix: List<&2, F.AddressEntry>, +suffix: List<&2, F.AddressEntry>, +query: Nat,
    absent: {F.address_at(prefix, query) == None{} : Maybe<&2, O.NodeAddress>}) ->
    {F.address_at(List.append(&2, F.AddressEntry, prefix, suffix), query) == F.address_at(suffix, query) : Maybe<&2, O.NodeAddress>}:
  match prefix:
    case []: {==}
    case F.AddressEntry{+id, +birth} <> +tail:
      address_append_absent_branch(id, birth, tail, suffix, query, Nat.is_eq(id, query), {==}, absent,
        missing => address_append_absent(tail, suffix, query, missing))

def aligned_address_upper(items: List<&2, Local.PlannedNode>, entries: List<&2, F.AddressEntry>,
    +all_nodes: List<&2, Local.PlannedNode>, +all_addresses: List<&2, F.AddressEntry>, +start: Nat, +query: Nat,
    +aligned: {P.aligned(items, entries, all_nodes, all_addresses) == True{} : Bool},
    +dense: {Frame.dense(items, start) == True{} : Bool},
    +room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, items) : Nat), query) == True{} : Bool}) ->
    {F.address_at(entries, query) == None{} : Maybe<&2, O.NodeAddress>}:
  match items entries:
    case Nil{} Nil{}: {==}
    case Con{Local.PlannedNode{+id, +handle}, +tail} Con{F.AddressEntry{+other, +birth}, +rest}:
      %Equal.sym(Bool, Nat.is_eq(other, query), False{},
        %N.eq_of_is_eq(id, other,
          B.eq_true_of_and_left(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(tail, rest, all_nodes, all_addresses))), aligned)):
          {Nat.is_eq(_, query) == False{} : Bool}
        Structure.unequal_below(id, query, dense_head_room(id, handle, tail, start, query, dense, room))):
        {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(rest, query)) == None{} : Maybe<&2, O.NodeAddress>}
      aligned_address_upper(tail, rest, all_nodes, all_addresses, (start + 1n : Nat), query,
        B.eq_true_of_and_right(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(tail, rest, all_nodes, all_addresses),
          B.eq_true_of_and_right(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(tail, rest, all_nodes, all_addresses)),
            B.eq_true_of_and_right(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
              Bool.and(Nat.is_eq(P.address_count(all_addresses, birth), 1n), P.aligned(tail, rest, all_nodes, all_addresses))), aligned))),
        B.eq_true_of_and_right(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense),
        %Allocation.length_step(start, List.length(&2, Local.PlannedNode, tail)):
          {Nat.is_le(_, query) == True{} : Bool}
        room)
    case Nil{} Con{_, _}:
      Empty.absurd({F.address_at(entries, query) == None{} : Maybe<&2, O.NodeAddress>}, B.internal_false_ne_true(aligned))
    case Con{_, _} Nil{}: {==}

# The numeric allocation offset and existing alignment jointly authorize lookup
# in the shifted child table; no semantic-address assumption is needed here.
def shifted_address_prefix(+parents: List<&2, Local.PlannedNode>, +addresses: List<&2, F.AddressEntry>,
    +children: List<&2, F.AddressEntry>, +id: Nat,
    aligned: {P.aligned(parents, addresses, parents, addresses) == True{} : Bool},
    dense: {Frame.dense(parents, 0n) == True{} : Bool}) ->
    {F.address_at(List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))),
      (id + List.length(&2, Local.PlannedNode, parents) : Nat))
      == F.address_at(Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)),
        (id + List.length(&2, Local.PlannedNode, parents) : Nat)) : Maybe<&2, O.NodeAddress>}:
  address_append_absent(addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)),
    (id + List.length(&2, Local.PlannedNode, parents) : Nat),
    aligned_address_upper(parents, addresses, parents, addresses, 0n,
      (id + List.length(&2, Local.PlannedNode, parents) : Nat), aligned, dense,
      N.add_le_add_right(0n, id, List.length(&2, Local.PlannedNode, parents), N.zero_le(id))))

def shifted_reference_prefix(+owner: Nat, +index: Nat, +symbol: String, reference: Local.PlannedReference,
    +parents: List<&2, Local.PlannedNode>, +addresses: List<&2, F.AddressEntry>, +children: List<&2, F.AddressEntry>,
    aligned: {P.aligned(parents, addresses, parents, addresses) == True{} : Bool},
    dense: {Frame.dense(parents, 0n) == True{} : Bool}) ->
    {P.reference(Local.ReferenceSlot{(owner + List.length(&2, Local.PlannedNode, parents) : Nat), index, symbol,
      Compose.shift_reference(reference, List.length(&2, Local.PlannedNode, parents))},
      List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))))
      == P.reference(Local.ReferenceSlot{(owner + List.length(&2, Local.PlannedNode, parents) : Nat), index, symbol,
        Compose.shift_reference(reference, List.length(&2, Local.PlannedNode, parents))}, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))
      : Maybe<&2, F.Reference>}:
  match reference:
    case Local.Included{_}: {==}
    case Local.Omitted{_, _}: {==}
    case Local.Expanded{+id}:
      Equal.cong(Maybe<&2, O.NodeAddress>, Maybe<&2, F.Reference>, found => P.expanded_reference(found, symbol),
        F.address_at(List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))),
          (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
        F.address_at(Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
        shifted_address_prefix(parents, addresses, children, id, aligned, dense))

def shifted_references_prefix(items: List<&2, Local.ReferenceSlot>, +parents: List<&2, Local.PlannedNode>,
    +addresses: List<&2, F.AddressEntry>, +children: List<&2, F.AddressEntry>,
    +aligned: {P.aligned(parents, addresses, parents, addresses) == True{} : Bool},
    +dense: {Frame.dense(parents, 0n) == True{} : Bool}) ->
    {P.references(Compose.shift_slots(items, List.length(&2, Local.PlannedNode, parents)),
      List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))))
      == P.references(Compose.shift_slots(items, List.length(&2, Local.PlannedNode, parents)),
        Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))) : Maybe<&2, List<&2, F.Reference>>}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+id, +index, +symbol, +reference} <> +tail:
      %Equal.sym(Maybe<&2, F.Reference>,
        P.reference(Local.ReferenceSlot{(id + List.length(&2, Local.PlannedNode, parents) : Nat), index, symbol, Compose.shift_reference(reference, List.length(&2, Local.PlannedNode, parents))},
          List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))),
        P.reference(Local.ReferenceSlot{(id + List.length(&2, Local.PlannedNode, parents) : Nat), index, symbol, Compose.shift_reference(reference, List.length(&2, Local.PlannedNode, parents))},
          Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))),
        shifted_reference_prefix(id, index, symbol, reference, parents, addresses, children, aligned, dense)):
        {P.reference_prefix(_, P.references(Compose.shift_slots(tail, List.length(&2, Local.PlannedNode, parents)),
          List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))))
          == P.references(Compose.shift_slots(Local.ReferenceSlot{id, index, symbol, reference} <> tail, List.length(&2, Local.PlannedNode, parents)), Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))
          : Maybe<&2, List<&2, F.Reference>>}
      Equal.cong(Maybe<&2, List<&2, F.Reference>>, Maybe<&2, List<&2, F.Reference>>,
        rest => P.reference_prefix(P.reference(Local.ReferenceSlot{(id + List.length(&2, Local.PlannedNode, parents) : Nat), index, symbol, Compose.shift_reference(reference, List.length(&2, Local.PlannedNode, parents))},
          Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))), rest),
        P.references(Compose.shift_slots(tail, List.length(&2, Local.PlannedNode, parents)), List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))),
        P.references(Compose.shift_slots(tail, List.length(&2, Local.PlannedNode, parents)), Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))),
        shifted_references_prefix(tail, parents, addresses, children, aligned, dense))

def shifted_owner_references_prefix(+slots: List<&2, Local.ReferenceSlot>, +owner: Nat,
    +parents: List<&2, Local.PlannedNode>, +addresses: List<&2, F.AddressEntry>, +children: List<&2, F.AddressEntry>,
    aligned: {P.aligned(parents, addresses, parents, addresses) == True{} : Bool},
    dense: {Frame.dense(parents, 0n) == True{} : Bool}) ->
    {P.references(P.owner_slots(Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), (owner + List.length(&2, Local.PlannedNode, parents) : Nat)),
      List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))))
      == P.references(P.owner_slots(Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), (owner + List.length(&2, Local.PlannedNode, parents) : Nat)),
        Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))) : Maybe<&2, List<&2, F.Reference>>}:
  %Remap.owner_slots(slots, owner, List.length(&2, Local.PlannedNode, parents)):
    {P.references(_, List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))))
      == P.references(_, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))) : Maybe<&2, List<&2, F.Reference>>}
  shifted_references_prefix(P.owner_slots(slots, owner), parents, addresses, children, aligned, dense)

def shifted_nodes_prefix(items: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +catalog: List<&2, T.ArtifactEntry>, +parents: List<&2, Local.PlannedNode>,
    +addresses: List<&2, F.AddressEntry>, +children: List<&2, F.AddressEntry>,
    +aligned: {P.aligned(parents, addresses, parents, addresses) == True{} : Bool},
    +dense: {Frame.dense(parents, 0n) == True{} : Bool}) ->
    {P.nodes(Compose.shift_nodes(items, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), catalog,
      List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))))
      == P.nodes(Compose.shift_nodes(items, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), catalog,
        Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))) : Maybe<&2, List<&2, F.Node>>}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, +handle} <> +tail:
      %Equal.sym(Maybe<&2, O.NodeAddress>,
        F.address_at(List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
        F.address_at(Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
        shifted_address_prefix(parents, addresses, children, id, aligned, dense)):
        {P.node_prefix(P.projected_node(_, F.artifact_at(catalog, handle),
          P.references(P.owner_slots(Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
            List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))))),
          P.nodes(Compose.shift_nodes(tail, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), catalog,
            List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))))
          == P.nodes(Compose.shift_nodes(Local.PlannedNode{id, handle} <> tail, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), catalog,
            Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))) : Maybe<&2, List<&2, F.Node>>}
      %Equal.sym(Maybe<&2, List<&2, F.Reference>>,
        P.references(P.owner_slots(Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)),
          List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))),
        P.references(P.owner_slots(Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)), Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))),
        shifted_owner_references_prefix(slots, id, parents, addresses, children, aligned, dense)):
        {P.node_prefix(P.projected_node(F.address_at(Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)), F.artifact_at(catalog, handle), _),
          P.nodes(Compose.shift_nodes(tail, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), catalog,
            List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))))
          == P.nodes(Compose.shift_nodes(Local.PlannedNode{id, handle} <> tail, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), catalog,
            Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))) : Maybe<&2, List<&2, F.Node>>}
      Equal.cong(Maybe<&2, List<&2, F.Node>>, Maybe<&2, List<&2, F.Node>>,
        rest => P.node_prefix(P.projected_node(F.address_at(Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)), F.artifact_at(catalog, handle),
          P.references(P.owner_slots(Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), (id + List.length(&2, Local.PlannedNode, parents) : Nat)), Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))), rest),
        P.nodes(Compose.shift_nodes(tail, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), catalog,
          List.append(&2, F.AddressEntry, addresses, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents)))),
        P.nodes(Compose.shift_nodes(tail, List.length(&2, Local.PlannedNode, parents)), Compose.shift_slots(slots, List.length(&2, Local.PlannedNode, parents)), catalog, Mapping.shifted(children, List.length(&2, Local.PlannedNode, parents))),
        shifted_nodes_prefix(tail, slots, catalog, parents, addresses, children, aligned, dense))

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
