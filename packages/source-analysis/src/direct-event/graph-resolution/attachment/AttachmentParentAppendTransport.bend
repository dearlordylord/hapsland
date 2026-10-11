import Base
import ./RetainedForestProjection.bend as P
import ./AttachmentMapping.bend as Mapping
import ./AttachmentNaturalArithmeticFacts.bend as Arithmetic
import ./AttachmentUnaffectedNodesProof.bend as Unaffected
import ./AttachmentRemapProjectionProof.bend as Remap
import ./AttachmentNodeReplacementTransport.bend as Replacement
import ./AttachmentRootSelectionProof.bend as RootSelection
import ./AttachmentProjectionAllowanceProof.bend as Count
import ./AttachmentProjectionContentsProof.bend as Contents
import ./AttachmentReplacementStructureProof.bend as Structure
import ../traversal/INTERPRETER_NAT_FACTS.bend as N
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ../traversal/GRAPH_LIST_FACTS.bend as Lists
import ./AttachmentParentAllocationProof.bend as Allocation
import ./ActualAttachmentFrameProjection.bend as Frame
import ./ActualAttachmentPhaseProjection.bend as Ready
import ./ForestRelation.bend as Relation
import ./ForestRollbackProof.bend as Rollback
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

# Both complete projections now share the actual post-allocation context.
# Local lets abbreviate existing lists; they do not introduce a second forest.
def parent_common_nodes(+parents: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +child_slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +child_addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>,
    dense: {Frame.dense(parents, 0n) == True{} : Bool},
    present: {P.nodes(parents, slots, catalog, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.nodes(parents, List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))), catalog,
      List.append(&2, F.AddressEntry, addresses, Mapping.shifted(child_addresses, List.length(&2, Local.PlannedNode, parents))))
      == Some{retained} : Maybe<&2, List<&2, F.Node>>}:
  +offset: Nat = List.length(&2, Local.PlannedNode, parents)
  +combined_slots: List<&2, Local.ReferenceSlot> = List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, offset))
  +suffix: List<&2, F.AddressEntry> = Mapping.shifted(child_addresses, offset)
  +combined_addresses: List<&2, F.AddressEntry> = List.append(&2, F.AddressEntry, addresses, suffix)
  Equal.trans(Maybe<&2, List<&2, F.Node>>,
    P.nodes(parents, combined_slots, catalog, combined_addresses), P.nodes(parents, slots, catalog, combined_addresses), Some{retained},
    nodes_child_slots(parents, 0n, offset, slots, child_slots, catalog, combined_addresses, dense, N.le_refl(offset)),
    nodes_addresses(parents, slots, catalog, addresses, suffix, retained, present))

def child_common_nodes(+parents: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +catalog: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +child_addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>,
    +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    aligned: {P.aligned(parents, addresses, parents, addresses) == True{} : Bool},
    owned: {P.slots_owned(slots, parents) == True{} : Bool},
    present: {P.nodes(children, child_slots, catalog, child_addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.nodes(Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents)),
      List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))), catalog,
      List.append(&2, F.AddressEntry, addresses, Mapping.shifted(child_addresses, List.length(&2, Local.PlannedNode, parents))))
      == Some{retained} : Maybe<&2, List<&2, F.Node>>}:
  +offset: Nat = List.length(&2, Local.PlannedNode, parents)
  +shifted_nodes: List<&2, Local.PlannedNode> = Compose.shift_nodes(children, offset)
  +shifted_slots: List<&2, Local.ReferenceSlot> = Compose.shift_slots(child_slots, offset)
  +combined_slots: List<&2, Local.ReferenceSlot> = List.append(&2, Local.ReferenceSlot, slots, shifted_slots)
  +suffix: List<&2, F.AddressEntry> = Mapping.shifted(child_addresses, offset)
  +combined_addresses: List<&2, F.AddressEntry> = List.append(&2, F.AddressEntry, addresses, suffix)
  Equal.trans(Maybe<&2, List<&2, F.Node>>,
    P.nodes(shifted_nodes, combined_slots, catalog, combined_addresses), P.nodes(shifted_nodes, shifted_slots, catalog, combined_addresses), Some{retained},
    nodes_parent_slots(children, parents, slots, child_slots, catalog, combined_addresses, dense, owned),
    Equal.trans(Maybe<&2, List<&2, F.Node>>,
      P.nodes(shifted_nodes, shifted_slots, catalog, combined_addresses), P.nodes(shifted_nodes, shifted_slots, catalog, suffix), Some{retained},
      shifted_nodes_prefix(children, child_slots, catalog, parents, addresses, child_addresses, aligned, dense),
      %Remap.nodes(children, child_slots, catalog, child_addresses, offset): {_ == Some{retained} : Maybe<&2, List<&2, F.Node>>}
      present))

# Exact complete retained-node append, before the selected reference changes.
def appended_nodes(+parents: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +catalog: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +child_addresses: List<&2, F.AddressEntry>,
    +parent_values: List<&2, F.Node>, +child_values: List<&2, F.Node>,
    +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    aligned: {P.aligned(parents, addresses, parents, addresses) == True{} : Bool},
    owned: {P.slots_owned(slots, parents) == True{} : Bool},
    parent_present: {P.nodes(parents, slots, catalog, addresses) == Some{parent_values} : Maybe<&2, List<&2, F.Node>>},
    child_present: {P.nodes(children, child_slots, catalog, child_addresses) == Some{child_values} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.nodes(List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))), catalog,
      List.append(&2, F.AddressEntry, addresses, Mapping.shifted(child_addresses, List.length(&2, Local.PlannedNode, parents))))
      == Some{List.append(&2, F.Node, parent_values, child_values)} : Maybe<&2, List<&2, F.Node>>}:
  nodes_append(parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents)),
    List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))), catalog,
    List.append(&2, F.AddressEntry, addresses, Mapping.shifted(child_addresses, List.length(&2, Local.PlannedNode, parents))), parent_values, child_values,
    parent_common_nodes(parents, slots, child_slots, catalog, addresses, child_addresses, parent_values, dense, parent_present),
    child_common_nodes(parents, slots, children, child_slots, catalog, addresses, child_addresses, child_values, dense, aligned, owned, child_present))

# Fresh constructions and the retained parent occupy disjoint episodes. The
# routes remain arbitrary; no path equality or tree-shape premise is added.
def later_address_distinct(+prior: Nat, +later: Nat, +prior_route: List<&2, Nat>, +later_route: List<&2, Nat>,
    below: {Nat.is_lt(prior, later) == True{} : Bool}) ->
    {F.same_address(O.NodeAddress{later, later_route}, O.NodeAddress{prior, prior_route}) == False{} : Bool}:
  %Equal.sym(Bool, Nat.is_eq(later, prior), False{},
    Equal.trans(Bool, Nat.is_eq(later, prior), Nat.is_eq(prior, later), False{}, Structure.is_eq_comm(later, prior), Structure.unequal_below(prior, later, below))):
    {Bool.and(_, F.same_route(later_route, prior_route)) == False{} : Bool}
  {==}

def prior_nodes_exclude_fresh(items: List<&2, F.Node>, +episode: Nat, +route: List<&2, Nat>,
    +before: {Relation.episodes_before(items, episode) == True{} : Bool}) ->
    {F.count_address(items, O.NodeAddress{episode, route}) == 0n : Nat}:
  match items:
    case []: {==}
    case F.Node{O.NodeAddress{+prior, +prior_route}, _, _} <> +tail:
      %Equal.sym(Bool, F.same_address(O.NodeAddress{episode, route}, O.NodeAddress{prior, prior_route}), False{},
        later_address_distinct(prior, episode, prior_route, route,
          B.eq_true_of_and_left(Nat.is_lt(prior, episode), Relation.episodes_before(tail, episode), before))):
        {(Bool.pick(Nat, _, 1n, 0n) + F.count_address(tail, O.NodeAddress{episode, route}) : Nat) == 0n : Nat}
      prior_nodes_exclude_fresh(tail, episode, route,
        B.eq_true_of_and_right(Nat.is_lt(prior, episode), Relation.episodes_before(tail, episode), before))

def fresh_nodes_exclude_prior(items: List<&2, F.Node>, +episode: Nat, +prior: Nat, +route: List<&2, Nat>,
    +fresh: {Ready.episode_nodes(items, episode) == True{} : Bool},
    +below: {Nat.is_lt(prior, episode) == True{} : Bool}) ->
    {F.count_address(items, O.NodeAddress{prior, route}) == 0n : Nat}:
  match items:
    case []: {==}
    case F.Node{O.NodeAddress{+actual, +actual_route}, _, _} <> +tail:
      %Equal.sym(Bool, Nat.is_eq(prior, actual), False{},
        %Equal.sym(Nat, actual, episode,
          N.eq_of_is_eq(actual, episode, B.eq_true_of_and_left(Nat.is_eq(actual, episode), Ready.episode_nodes(tail, episode), fresh))):
          {Nat.is_eq(prior, _) == False{} : Bool}
        Structure.unequal_below(prior, episode, below)):
        {(Bool.pick(Nat, Bool.and(_, F.same_route(route, actual_route)), 1n, 0n) + F.count_address(tail, O.NodeAddress{prior, route}) : Nat) == 0n : Nat}
      fresh_nodes_exclude_prior(tail, episode, prior, route,
        B.eq_true_of_and_right(Nat.is_eq(actual, episode), Ready.episode_nodes(tail, episode), fresh), below)

# The complete slot ownership guard is preserved across allocation, including
# interleaved slots and retained nodes that no longer have a rendered parent.

def shifted_nodes_exclude_parent(items: List<&2, Local.PlannedNode>, +offset: Nat, +owner: Nat,
    +below: {Nat.is_lt(owner, offset) == True{} : Bool}) ->
    {P.node_count(Compose.shift_nodes(items, offset), owner) == 0n : Nat}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, _} <> +tail:
      %Equal.sym(Bool, Nat.is_eq(owner, (id + offset : Nat)), False{},
        Equal.trans(Bool, Nat.is_eq(owner, (id + offset : Nat)), Nat.is_eq((id + offset : Nat), owner), False{},
          Structure.is_eq_comm(owner, (id + offset : Nat)), shifted_owner_distinct(id, offset, owner, below))):
        {(Bool.pick(Nat, _, 1n, 0n) + P.node_count(Compose.shift_nodes(tail, offset), owner) : Nat) == 0n : Nat}
      shifted_nodes_exclude_parent(tail, offset, owner, below)

def parent_owned_appended(items: List<&2, Local.ReferenceSlot>, +parents: List<&2, Local.PlannedNode>,
    +children: List<&2, Local.PlannedNode>, +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +owned: {P.slots_owned(items, parents) == True{} : Bool}) ->
    {P.slots_owned(items, List.append(&2, Local.PlannedNode, parents,
      Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+id, _, _, _} <> +tail:
      +offset: Nat = List.length(&2, Local.PlannedNode, parents)
      +shifted: List<&2, Local.PlannedNode> = Compose.shift_nodes(children, offset)
      +one: {P.node_count(parents, id) == 1n : Nat} = N.eq_of_is_eq(P.node_count(parents, id), 1n,
        B.eq_true_of_and_left(Nat.is_eq(P.node_count(parents, id), 1n), P.slots_owned(tail, parents), owned))
      B.and_eq_true(Nat.is_eq(P.node_count(List.append(&2, Local.PlannedNode, parents, shifted), id), 1n),
        P.slots_owned(tail, List.append(&2, Local.PlannedNode, parents, shifted)),
        %Equal.sym(Nat, P.node_count(List.append(&2, Local.PlannedNode, parents, shifted), id),
          (P.node_count(parents, id) + P.node_count(shifted, id) : Nat), Contents.node_count_append(parents, shifted, id)):
          {Nat.is_eq(_, 1n) == True{} : Bool}
        %Equal.sym(Nat, P.node_count(shifted, id), 0n,
          shifted_nodes_exclude_parent(children, offset, id, dense_owner_below(parents, id, dense, one))):
          {Nat.is_eq((P.node_count(parents, id) + _ : Nat), 1n) == True{} : Bool}
        %Equal.sym(Nat, P.node_count(parents, id), 1n, one):
          {Nat.is_eq((_ + 0n : Nat), 1n) == True{} : Bool}
        {==},
        parent_owned_appended(tail, parents, children, dense,
          B.eq_true_of_and_right(Nat.is_eq(P.node_count(parents, id), 1n), P.slots_owned(tail, parents), owned)))

def child_owned_appended(items: List<&2, Local.ReferenceSlot>, +parents: List<&2, Local.PlannedNode>,
    +children: List<&2, Local.PlannedNode>, +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +owned: {P.slots_owned(items, children) == True{} : Bool}) ->
    {P.slots_owned(Compose.shift_slots(items, List.length(&2, Local.PlannedNode, parents)),
      List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+id, _, _, _} <> +tail:
      +offset: Nat = List.length(&2, Local.PlannedNode, parents)
      +shifted: List<&2, Local.PlannedNode> = Compose.shift_nodes(children, offset)
      +query: Nat = (id + offset : Nat)
      +one: {P.node_count(children, id) == 1n : Nat} = N.eq_of_is_eq(P.node_count(children, id), 1n,
        B.eq_true_of_and_left(Nat.is_eq(P.node_count(children, id), 1n), P.slots_owned(tail, children), owned))
      B.and_eq_true(Nat.is_eq(P.node_count(List.append(&2, Local.PlannedNode, parents, shifted), query), 1n),
        P.slots_owned(Compose.shift_slots(tail, offset), List.append(&2, Local.PlannedNode, parents, shifted)),
        %Equal.sym(Nat, P.node_count(List.append(&2, Local.PlannedNode, parents, shifted), query),
          (P.node_count(parents, query) + P.node_count(shifted, query) : Nat), Contents.node_count_append(parents, shifted, query)):
          {Nat.is_eq(_, 1n) == True{} : Bool}
        %Equal.sym(Nat, P.node_count(parents, query), 0n,
          dense_count_upper(parents, 0n, query, dense, N.add_le_add_right(0n, id, offset, N.zero_le(id)))):
          {Nat.is_eq((_ + P.node_count(shifted, query) : Nat), 1n) == True{} : Bool}
        %Remap.node_count(children, id, offset): {Nat.is_eq(_, 1n) == True{} : Bool}
        %Equal.sym(Nat, P.node_count(children, id), 1n, one): {Nat.is_eq(_, 1n) == True{} : Bool}
        {==},
        child_owned_appended(tail, parents, children, dense,
          B.eq_true_of_and_right(Nat.is_eq(P.node_count(children, id), 1n), P.slots_owned(tail, children), owned)))

def slots_owned_append(items: List<&2, Local.ReferenceSlot>, +suffix: List<&2, Local.ReferenceSlot>,
    +nodes: List<&2, Local.PlannedNode>, +first: {P.slots_owned(items, nodes) == True{} : Bool},
    +last: {P.slots_owned(suffix, nodes) == True{} : Bool}) ->
    {P.slots_owned(List.append(&2, Local.ReferenceSlot, items, suffix), nodes) == True{} : Bool}:
  match items:
    case []: last
    case Local.ReferenceSlot{+id, _, _, _} <> +tail:
      B.and_eq_true(Nat.is_eq(P.node_count(nodes, id), 1n),
        P.slots_owned(List.append(&2, Local.ReferenceSlot, tail, suffix), nodes),
        B.eq_true_of_and_left(Nat.is_eq(P.node_count(nodes, id), 1n), P.slots_owned(tail, nodes), first),
        slots_owned_append(tail, suffix, nodes,
          B.eq_true_of_and_right(Nat.is_eq(P.node_count(nodes, id), 1n), P.slots_owned(tail, nodes), first), last))

def appended_slots_owned(+parents: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    parent_owned: {P.slots_owned(slots, parents) == True{} : Bool},
    child_owned: {P.slots_owned(child_slots, children) == True{} : Bool}) ->
    {P.slots_owned(List.append(&2, Local.ReferenceSlot, slots,
        Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}:
  slots_owned_append(slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents)),
    List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
    parent_owned_appended(slots, parents, children, dense, parent_owned),
    child_owned_appended(child_slots, parents, children, dense, child_owned))

def dense_owner_room_branch(+items: List<&2, Local.PlannedNode>, +start: Nat, +owner: Nat, +limit: Nat,
    dense: {Frame.dense(items, start) == True{} : Bool},
    room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, items) : Nat), limit) == True{} : Bool},
    present: {P.node_count(items, owner) == 1n : Nat},
    flag: Bool, branch: {Nat.is_lt(owner, limit) == flag : Bool}) ->
    {Nat.is_lt(owner, limit) == True{} : Bool}:
  match flag:
    case True{}: branch
    case False{}:
      Empty.absurd({Nat.is_lt(owner, limit) == True{} : Bool},
        Structure.zero_ne_one(Equal.trans(Nat, 0n, P.node_count(items, owner), 1n,
          Equal.sym(Nat, P.node_count(items, owner), 0n,
            dense_count_upper(items, start, owner, dense,
              N.le_trans((start + List.length(&2, Local.PlannedNode, items) : Nat), limit, owner,
                room, N.le_of_not_lt(owner, limit, branch)))), present)))

def dense_owner_room(+items: List<&2, Local.PlannedNode>, +start: Nat, +owner: Nat, +limit: Nat,
    dense: {Frame.dense(items, start) == True{} : Bool},
    room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, items) : Nat), limit) == True{} : Bool},
    present: {P.node_count(items, owner) == 1n : Nat}) ->
    {Nat.is_lt(owner, limit) == True{} : Bool}:
  dense_owner_room_branch(items, start, owner, limit, dense, room, present, Nat.is_lt(owner, limit), {==})

def forward_reference_appended(reference: Local.PlannedReference, +later: List<&2, Local.PlannedNode>,
    +children: List<&2, Local.PlannedNode>, +start: Nat, +offset: Nat,
    dense: {Frame.dense(later, start) == True{} : Bool},
    room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, later) : Nat), offset) == True{} : Bool},
    forward: {P.forward_reference(reference, later) == True{} : Bool}) ->
    {P.forward_reference(reference, List.append(&2, Local.PlannedNode, later, Compose.shift_nodes(children, offset))) == True{} : Bool}:
  match reference:
    case Local.Expanded{+id}:
      +one: {P.node_count(later, id) == 1n : Nat} = N.eq_of_is_eq(P.node_count(later, id), 1n, forward)
      %Equal.sym(Nat, P.node_count(List.append(&2, Local.PlannedNode, later, Compose.shift_nodes(children, offset)), id),
        (P.node_count(later, id) + P.node_count(Compose.shift_nodes(children, offset), id) : Nat),
        Contents.node_count_append(later, Compose.shift_nodes(children, offset), id)):
        {Nat.is_eq(_, 1n) == True{} : Bool}
      %Equal.sym(Nat, P.node_count(Compose.shift_nodes(children, offset), id), 0n,
        shifted_nodes_exclude_parent(children, offset, id, dense_owner_room(later, start, id, offset, dense, room, one))):
        {Nat.is_eq((P.node_count(later, id) + _ : Nat), 1n) == True{} : Bool}
      %Equal.sym(Nat, P.node_count(later, id), 1n, one): {Nat.is_eq((_ + 0n : Nat), 1n) == True{} : Bool}
      {==}
    case Local.Included{_}: {==}
    case Local.Omitted{_, _}: {==}

def indexed_appended(items: List<&2, Local.ReferenceSlot>, +next: Nat, +later: List<&2, Local.PlannedNode>,
    +children: List<&2, Local.PlannedNode>, +start: Nat, +offset: Nat,
    +dense: {Frame.dense(later, start) == True{} : Bool},
    +room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, later) : Nat), offset) == True{} : Bool},
    +indexed: {P.indexed(items, next, later) == True{} : Bool}) ->
    {P.indexed(items, next, List.append(&2, Local.PlannedNode, later, Compose.shift_nodes(children, offset))) == True{} : Bool}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{_, +index, _, +reference} <> +tail:
      +rest: {Bool.and(P.forward_reference(reference, later), P.indexed(tail, (next + 1n : Nat), later)) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(index, next),
          Bool.and(P.forward_reference(reference, later), P.indexed(tail, (next + 1n : Nat), later)), indexed)
      B.and_eq_true(Nat.is_eq(index, next),
        Bool.and(P.forward_reference(reference, List.append(&2, Local.PlannedNode, later, Compose.shift_nodes(children, offset))),
          P.indexed(tail, (next + 1n : Nat), List.append(&2, Local.PlannedNode, later, Compose.shift_nodes(children, offset)))),
        B.eq_true_of_and_left(Nat.is_eq(index, next),
          Bool.and(P.forward_reference(reference, later), P.indexed(tail, (next + 1n : Nat), later)), indexed),
        B.and_eq_true(P.forward_reference(reference, List.append(&2, Local.PlannedNode, later, Compose.shift_nodes(children, offset))),
          P.indexed(tail, (next + 1n : Nat), List.append(&2, Local.PlannedNode, later, Compose.shift_nodes(children, offset))),
          forward_reference_appended(reference, later, children, start, offset, dense, room,
            B.eq_true_of_and_left(P.forward_reference(reference, later), P.indexed(tail, (next + 1n : Nat), later), rest)),
          indexed_appended(tail, (next + 1n : Nat), later, children, start, offset, dense, room,
            B.eq_true_of_and_right(P.forward_reference(reference, later), P.indexed(tail, (next + 1n : Nat), later), rest))))

def child_forward_combined(items: List<&2, Local.PlannedNode>, +parents: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +child_slots: List<&2, Local.ReferenceSlot>,
    +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +owned: {P.slots_owned(slots, parents) == True{} : Bool},
    +forward: {P.forward_nodes(items, child_slots) == True{} : Bool}) ->
    {P.forward_nodes(Compose.shift_nodes(items, List.length(&2, Local.PlannedNode, parents)),
      List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, _} <> +tail:
      +offset: Nat = List.length(&2, Local.PlannedNode, parents)
      +combined: List<&2, Local.ReferenceSlot> = List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, offset))
      B.and_eq_true(P.indexed(P.owner_slots(combined, (id + offset : Nat)), 0n, Compose.shift_nodes(tail, offset)),
        P.forward_nodes(Compose.shift_nodes(tail, offset), combined),
        %Equal.sym(List<&2, Local.ReferenceSlot>, P.owner_slots(combined, (id + offset : Nat)),
          P.owner_slots(Compose.shift_slots(child_slots, offset), (id + offset : Nat)),
          child_owner_slots(slots, child_slots, parents, id, dense, owned)):
          {P.indexed(_, 0n, Compose.shift_nodes(tail, offset)) == True{} : Bool}
        %Remap.owner_slots(child_slots, id, offset):
          {P.indexed(_, 0n, Compose.shift_nodes(tail, offset)) == True{} : Bool}
        %Remap.indexed(P.owner_slots(child_slots, id), 0n, tail, offset): {_ == True{} : Bool}
        B.eq_true_of_and_left(P.indexed(P.owner_slots(child_slots, id), 0n, tail), P.forward_nodes(tail, child_slots), forward),
        child_forward_combined(tail, parents, slots, child_slots, dense, owned,
          B.eq_true_of_and_right(P.indexed(P.owner_slots(child_slots, id), 0n, tail), P.forward_nodes(tail, child_slots), forward)))

def forward_appended_cursor(items: List<&2, Local.PlannedNode>, +children: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +child_slots: List<&2, Local.ReferenceSlot>, +start: Nat, +offset: Nat,
    +dense: {Frame.dense(items, start) == True{} : Bool},
    +room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, items) : Nat), offset) == True{} : Bool},
    +forward: {P.forward_nodes(items, slots) == True{} : Bool},
    +child_forward: {P.forward_nodes(Compose.shift_nodes(children, offset),
      List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, offset))) == True{} : Bool}) ->
    {P.forward_nodes(List.append(&2, Local.PlannedNode, items, Compose.shift_nodes(children, offset)),
      List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, offset))) == True{} : Bool}:
  match items:
    case []: child_forward
    case Local.PlannedNode{+id, +handle} <> +tail:
      +combined: List<&2, Local.ReferenceSlot> = List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, offset))
      +tail_dense: {Frame.dense(tail, (start + 1n : Nat)) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense)
      +tail_room: {Nat.is_le(((start + 1n : Nat) + List.length(&2, Local.PlannedNode, tail) : Nat), offset) == True{} : Bool} =
        %Allocation.length_step(start, List.length(&2, Local.PlannedNode, tail)): {Nat.is_le(_, offset) == True{} : Bool}
        room
      B.and_eq_true(P.indexed(P.owner_slots(combined, id), 0n,
          List.append(&2, Local.PlannedNode, tail, Compose.shift_nodes(children, offset))),
        P.forward_nodes(List.append(&2, Local.PlannedNode, tail, Compose.shift_nodes(children, offset)), combined),
        %Equal.sym(List<&2, Local.ReferenceSlot>, P.owner_slots(combined, id), P.owner_slots(slots, id),
          parent_owner_slots(slots, child_slots, offset, id, dense_head_room(id, handle, tail, start, offset, dense, room))):
          {P.indexed(_, 0n, List.append(&2, Local.PlannedNode, tail, Compose.shift_nodes(children, offset))) == True{} : Bool}
        indexed_appended(P.owner_slots(slots, id), 0n, tail, children, (start + 1n : Nat), offset, tail_dense, tail_room,
          B.eq_true_of_and_left(P.indexed(P.owner_slots(slots, id), 0n, tail), P.forward_nodes(tail, slots), forward)),
        forward_appended_cursor(tail, children, slots, child_slots, (start + 1n : Nat), offset, tail_dense, tail_room,
          B.eq_true_of_and_right(P.indexed(P.owner_slots(slots, id), 0n, tail), P.forward_nodes(tail, slots), forward), child_forward))

def appended_forward(+parents: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +dense: {Frame.dense(parents, 0n) == True{} : Bool},
    owned: {P.slots_owned(slots, parents) == True{} : Bool},
    parent_forward: {P.forward_nodes(parents, slots) == True{} : Bool},
    child_forward: {P.forward_nodes(children, child_slots) == True{} : Bool}) ->
    {P.forward_nodes(List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}:
  forward_appended_cursor(parents, children, slots, child_slots, 0n, List.length(&2, Local.PlannedNode, parents), dense,
    N.le_refl(List.length(&2, Local.PlannedNode, parents)), parent_forward,
    child_forward_combined(children, parents, slots, child_slots, dense, owned, child_forward))

# A synchronized address prefix cannot shadow an absent numeric node. This
# uses the original zipper, not a new well-formedness condition on its caller.
def aligned_absent_lookup_step(+id: Nat, +other: Nat, +birth: O.NodeAddress,
    +rest: List<&2, F.AddressEntry>, +tail: List<&2, Local.PlannedNode>, +query: Nat,
    same: {id == other : Nat},
    parts: {Nat.is_eq(query, id) == False{} : Bool} & {P.node_count(tail, query) == 0n : Nat},
    recursive: {P.node_count(tail, query) == 0n : Nat} -> {F.address_at(rest, query) == None{} : Maybe<&2, O.NodeAddress>}) ->
    {F.address_at(F.AddressEntry{other, birth} <> rest, query) == None{} : Maybe<&2, O.NodeAddress>}:
  match parts:
    case (different, tail_absent):
      %Equal.sym(Bool, Nat.is_eq(other, query), False{},
        %same: {Nat.is_eq(_, query) == False{} : Bool}
        Equal.trans(Bool, Nat.is_eq(id, query), Nat.is_eq(query, id), False{},
          Structure.is_eq_comm(id, query), different)):
        {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(rest, query)) == None{} : Maybe<&2, O.NodeAddress>}
      recursive(tail_absent)

def aligned_absent_lookup(nodes: List<&2, Local.PlannedNode>, entries: List<&2, F.AddressEntry>,
    +all_nodes: List<&2, Local.PlannedNode>, +all_entries: List<&2, F.AddressEntry>, +query: Nat,
    +aligned: {P.aligned(nodes, entries, all_nodes, all_entries) == True{} : Bool},
    absent: {P.node_count(nodes, query) == 0n : Nat}) ->
    {F.address_at(entries, query) == None{} : Maybe<&2, O.NodeAddress>}:
  match nodes entries:
    case Nil{} Nil{}: {==}
    case Con{Local.PlannedNode{+id, _}, +tail} Con{F.AddressEntry{+other, +birth}, +rest}:
      +after_id: {Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
        Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(id, other),
          Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))), aligned)
      +same: {id == other : Nat} = N.eq_of_is_eq(id, other,
        B.eq_true_of_and_left(Nat.is_eq(id, other),
          Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))), aligned))
      aligned_absent_lookup_step(id, other, birth, rest, tail, query, same,
        Unaffected.zero_parts(Nat.is_eq(query, id), P.node_count(tail, query), absent),
        tail_absent => aligned_absent_lookup(tail, rest, all_nodes, all_entries, query,
          B.eq_true_of_and_right(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries),
            B.eq_true_of_and_right(Nat.is_eq(P.node_count(all_nodes, id), 1n),
              Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries)), after_id)), tail_absent))
    case Nil{} Con{_, _}:
      Empty.absurd({F.address_at(entries, query) == None{} : Maybe<&2, O.NodeAddress>}, B.internal_false_ne_true(aligned))
    case Con{_, _} Nil{}:
      Empty.absurd({F.address_at(entries, query) == None{} : Maybe<&2, O.NodeAddress>}, B.internal_false_ne_true(aligned))


def cursor_address_lookup(+prefix_nodes: List<&2, Local.PlannedNode>, +prefix_entries: List<&2, F.AddressEntry>,
    +all_nodes: List<&2, Local.PlannedNode>, +all_entries: List<&2, F.AddressEntry>,
    +id: Nat, +birth: O.NodeAddress, +rest: List<&2, F.AddressEntry>,
    aligned: {P.aligned(prefix_nodes, prefix_entries, all_nodes, all_entries) == True{} : Bool},
    dense: {Frame.dense(prefix_nodes, 0n) == True{} : Bool},
    room: {Nat.is_le(List.length(&2, Local.PlannedNode, prefix_nodes), id) == True{} : Bool},
    current: {all_entries == List.append(&2, F.AddressEntry, prefix_entries, F.AddressEntry{id, birth} <> rest) : List<&2, F.AddressEntry>}) ->
    {F.address_at(all_entries, id) == Some{birth} : Maybe<&2, O.NodeAddress>}:
  %Equal.sym(List<&2, F.AddressEntry>, all_entries,
    List.append(&2, F.AddressEntry, prefix_entries, F.AddressEntry{id, birth} <> rest), current):
    {F.address_at(_, id) == Some{birth} : Maybe<&2, O.NodeAddress>}
  Equal.trans(Maybe<&2, O.NodeAddress>,
    F.address_at(List.append(&2, F.AddressEntry, prefix_entries, F.AddressEntry{id, birth} <> rest), id),
    F.address_at(F.AddressEntry{id, birth} <> rest, id), Some{birth},
    address_append_absent(prefix_entries, F.AddressEntry{id, birth} <> rest, id,
      aligned_absent_lookup(prefix_nodes, prefix_entries, all_nodes, all_entries, id, aligned,
        dense_count_upper(prefix_nodes, 0n, id, dense, room))),
    %Equal.sym(Bool, Nat.is_eq(id, id), True{}, Structure.is_eq_refl(id)):
      {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(rest, id)) == Some{birth} : Maybe<&2, O.NodeAddress>}
    {==})

# One step of the same paired cursor: the successful projection's birth is
# forced by the exact numeric lookup, and its tail contributes the exact count.
def cursor_count_row(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +all_entries: List<&2, F.AddressEntry>, +birth: O.NodeAddress, +entries: List<&2, F.AddressEntry>,
    +retained: List<&2, F.Node>, +target: O.NodeAddress,
    located: {F.address_at(all_entries, id) == Some{birth} : Maybe<&2, O.NodeAddress>},
    recursive: @+rest: List<&2, F.Node> ->
      {P.nodes(tail, slots, catalog, all_entries) == Some{rest} : Maybe<&2, List<&2, F.Node>>} ->
      {P.address_count(entries, target) == F.count_address(rest, target) : Nat},
    parts: Replacement.row_contents(id, handle, tail, slots, catalog, all_entries, retained)) ->
    {P.address_count(F.AddressEntry{id, birth} <> entries, target) == F.count_address(retained, target) : Nat}:
  match parts:
    case (+actual, (+artifact, (+refs, (+rest, (found, (_, (_, (tail_present, same)))))))):
      same_birth: {birth == actual : O.NodeAddress} = Count.some_equal(O.NodeAddress, birth, actual,
        Equal.trans(Maybe<&2, O.NodeAddress>, Some{birth}, F.address_at(all_entries, id), Some{actual},
          Equal.sym(Maybe<&2, O.NodeAddress>, F.address_at(all_entries, id), Some{birth}, located), found))
      Equal.trans(Nat, P.address_count(F.AddressEntry{id, birth} <> entries, target),
        F.count_address(F.Node{actual, artifact, refs} <> rest, target), F.count_address(retained, target),
        %same_birth:
          {P.address_count(F.AddressEntry{id, birth} <> entries, target)
            == (Bool.pick(Nat, F.same_address(target, _), 1n, 0n) + F.count_address(rest, target) : Nat) : Nat}
        Equal.cong(Nat, Nat, count => (Bool.pick(Nat, F.same_address(target, birth), 1n, 0n) + count : Nat),
          P.address_count(entries, target), F.count_address(rest, target), recursive(rest)(tail_present)),
        Equal.cong(List<&2, F.Node>, Nat, nodes => F.count_address(nodes, target),
          F.Node{actual, artifact, refs} <> rest, retained, same))

# The paired cursor retains its original complete address table. Advancing
# proves prefix extension and transports counts; it does not rebuild a model.
def projected_address_count_cursor(nodes: List<&2, Local.PlannedNode>, entries: List<&2, F.AddressEntry>,
    +prefix_nodes: List<&2, Local.PlannedNode>, +prefix_entries: List<&2, F.AddressEntry>,
    +all_nodes: List<&2, Local.PlannedNode>, +all_entries: List<&2, F.AddressEntry>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +retained: List<&2, F.Node>, +target: O.NodeAddress,
    +prefix_aligned: {P.aligned(prefix_nodes, prefix_entries, all_nodes, all_entries) == True{} : Bool},
    +aligned: {P.aligned(nodes, entries, all_nodes, all_entries) == True{} : Bool},
    +prefix_dense: {Frame.dense(prefix_nodes, 0n) == True{} : Bool},
    +dense: {Frame.dense(nodes, List.length(&2, Local.PlannedNode, prefix_nodes)) == True{} : Bool},
    +current: {all_entries == List.append(&2, F.AddressEntry, prefix_entries, entries) : List<&2, F.AddressEntry>},
    projected: {P.nodes(nodes, slots, catalog, all_entries) == Some{retained} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.address_count(entries, target) == F.count_address(retained, target) : Nat}:
  match nodes entries:
    case Nil{} Nil{}:
      %Count.some_equal(List<&2, F.Node>, [], retained, projected):
        {0n == F.count_address(_, target) : Nat}
      {==}
    case Con{Local.PlannedNode{+id, +handle}, +tail} Con{F.AddressEntry{+other, +birth}, +rest}:
      +start: Nat = List.length(&2, Local.PlannedNode, prefix_nodes)
      +next_nodes: List<&2, Local.PlannedNode> = List.append(&2, Local.PlannedNode, prefix_nodes, [Local.PlannedNode{id, handle}])
      +next_entries: List<&2, F.AddressEntry> = List.append(&2, F.AddressEntry, prefix_entries, [F.AddressEntry{other, birth}])
      +after_id: {Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
        Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(id, other),
          Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))), aligned)
      +after_count: {Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries)) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(P.node_count(all_nodes, id), 1n),
          Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries)), after_id)
      +id_other: {id == other : Nat} = N.eq_of_is_eq(id, other,
        B.eq_true_of_and_left(Nat.is_eq(id, other),
          Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))), aligned))
      +id_start: {id == start : Nat} = N.eq_of_is_eq(id, start,
        B.eq_true_of_and_left(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense))
      +located: {F.address_at(all_entries, id) == Some{birth} : Maybe<&2, O.NodeAddress>} =
        %Equal.sym(Nat, id, other, id_other): {F.address_at(all_entries, _) == Some{birth} : Maybe<&2, O.NodeAddress>}
        cursor_address_lookup(prefix_nodes, prefix_entries, all_nodes, all_entries, other, birth, rest,
          prefix_aligned, prefix_dense,
          %Equal.trans(Nat, start, id, other, Equal.sym(Nat, id, start, id_start), id_other):
            {Nat.is_le(start, _) == True{} : Bool}
          N.le_refl(start), current)
      +next_aligned: {P.aligned(next_nodes, next_entries, all_nodes, all_entries) == True{} : Bool} =
        Contents.aligned_append_fixed(prefix_nodes, prefix_entries, [Local.PlannedNode{id, handle}], [F.AddressEntry{other, birth}],
          all_nodes, all_entries, prefix_aligned,
          B.and_eq_true(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), True{})),
            B.eq_true_of_and_left(Nat.is_eq(id, other),
              Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
                Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))), aligned),
            B.and_eq_true(Nat.is_eq(P.node_count(all_nodes, id), 1n), Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), True{}),
              B.eq_true_of_and_left(Nat.is_eq(P.node_count(all_nodes, id), 1n),
                Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries)), after_id),
              B.and_eq_true(Nat.is_eq(P.address_count(all_entries, birth), 1n), True{},
                B.eq_true_of_and_left(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries), after_count), {==}))))
      +next_dense: {Frame.dense(next_nodes, 0n) == True{} : Bool} =
        Allocation.dense_append(prefix_nodes, [Local.PlannedNode{id, handle}], 0n, prefix_dense,
          B.and_eq_true(Nat.is_eq(id, start), True{},
            B.eq_true_of_and_left(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense), {==}))
      +tail_dense: {Frame.dense(tail, List.length(&2, Local.PlannedNode, next_nodes)) == True{} : Bool} =
        %Equal.sym(Nat, List.length(&2, Local.PlannedNode, next_nodes), (start + 1n : Nat),
          Allocation.length_append(prefix_nodes, [Local.PlannedNode{id, handle}])):
          {Frame.dense(tail, _) == True{} : Bool}
        B.eq_true_of_and_right(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense)
      +next_current: {all_entries == List.append(&2, F.AddressEntry, next_entries, rest) : List<&2, F.AddressEntry>} =
        Equal.trans(List<&2, F.AddressEntry>, all_entries,
          List.append(&2, F.AddressEntry, prefix_entries, F.AddressEntry{other, birth} <> rest),
          List.append(&2, F.AddressEntry, next_entries, rest), current,
          Equal.sym(List<&2, F.AddressEntry>, List.append(&2, F.AddressEntry, next_entries, rest),
            List.append(&2, F.AddressEntry, prefix_entries, F.AddressEntry{other, birth} <> rest),
            Lists.append_assoc(&2, F.AddressEntry, prefix_entries, [F.AddressEntry{other, birth}], rest)))
      cursor_count_row(id, handle, tail, slots, catalog, all_entries, birth, rest, retained, target, located,
        values => present => projected_address_count_cursor(tail, rest, next_nodes, next_entries, all_nodes, all_entries,
          slots, catalog, values, target, next_aligned,
          B.eq_true_of_and_right(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries), after_count),
          next_dense, tail_dense, next_current, present),
        Replacement.split_nodes(id, handle, tail, slots, catalog, all_entries, retained, projected))
    case Nil{} Con{_, _}:
      Empty.absurd({P.address_count(entries, target) == F.count_address(retained, target) : Nat}, B.internal_false_ne_true(aligned))
    case Con{_, _} Nil{}:
      Empty.absurd({P.address_count(entries, target) == F.count_address(retained, target) : Nat}, B.internal_false_ne_true(aligned))

def projected_address_count(+nodes: List<&2, Local.PlannedNode>, +entries: List<&2, F.AddressEntry>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>, +retained: List<&2, F.Node>, +target: O.NodeAddress,
    aligned: {P.aligned(nodes, entries, nodes, entries) == True{} : Bool},
    dense: {Frame.dense(nodes, 0n) == True{} : Bool},
    projected: {P.nodes(nodes, slots, catalog, entries) == Some{retained} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.address_count(entries, target) == F.count_address(retained, target) : Nat}:
  projected_address_count_cursor(nodes, entries, [], [], nodes, entries, slots, catalog, retained, target,
    {==}, aligned, {==}, dense, {==}, projected)

def episodes_before_raise(items: List<&2, F.Node>, +lower: Nat, +upper: Nat,
    +before: {Relation.episodes_before(items, lower) == True{} : Bool},
    +bound: {Nat.is_le(lower, upper) == True{} : Bool}) ->
    {Relation.episodes_before(items, upper) == True{} : Bool}:
  match items:
    case []: {==}
    case F.Node{O.NodeAddress{+episode, _}, _, _} <> +tail:
      B.and_eq_true(Nat.is_lt(episode, upper), Relation.episodes_before(tail, upper),
        N.lt_of_lt_of_le(episode, lower, upper,
          B.eq_true_of_and_left(Nat.is_lt(episode, lower), Relation.episodes_before(tail, lower), before), bound),
        episodes_before_raise(tail, lower, upper,
          B.eq_true_of_and_right(Nat.is_lt(episode, lower), Relation.episodes_before(tail, lower), before), bound))

def counted_episode_before_branch(+items: List<&2, F.Node>, +episode: Nat, +route: List<&2, Nat>, +limit: Nat,
    before: {Relation.episodes_before(items, limit) == True{} : Bool},
    counted: {F.count_address(items, O.NodeAddress{episode, route}) == 1n : Nat},
    flag: Bool, branch: {Nat.is_lt(episode, limit) == flag : Bool}) ->
    {Nat.is_lt(episode, limit) == True{} : Bool}:
  match flag:
    case True{}: branch
    case False{}:
      Empty.absurd({Nat.is_lt(episode, limit) == True{} : Bool},
        Structure.zero_ne_one(Equal.trans(Nat, 0n, F.count_address(items, O.NodeAddress{episode, route}), 1n,
          Equal.sym(Nat, F.count_address(items, O.NodeAddress{episode, route}), 0n,
            prior_nodes_exclude_fresh(items, episode, route,
              episodes_before_raise(items, limit, episode, before, N.le_of_not_lt(episode, limit, branch)))), counted)))

def counted_episode_before(+items: List<&2, F.Node>, +episode: Nat, +route: List<&2, Nat>, +limit: Nat,
    before: {Relation.episodes_before(items, limit) == True{} : Bool},
    counted: {F.count_address(items, O.NodeAddress{episode, route}) == 1n : Nat}) ->
    {Nat.is_lt(episode, limit) == True{} : Bool}:
  counted_episode_before_branch(items, episode, route, limit, before, counted, Nat.is_lt(episode, limit), {==})

def fresh_nodes_exclude_other(items: List<&2, F.Node>, +episode: Nat, +query: Nat, +route: List<&2, Nat>,
    +fresh: {Ready.episode_nodes(items, episode) == True{} : Bool},
    +different: {Nat.is_eq(query, episode) == False{} : Bool}) ->
    {F.count_address(items, O.NodeAddress{query, route}) == 0n : Nat}:
  match items:
    case []: {==}
    case F.Node{O.NodeAddress{+actual, +actual_route}, _, _} <> +tail:
      %Equal.sym(Bool, Nat.is_eq(query, actual), False{},
        %Equal.sym(Nat, actual, episode, N.eq_of_is_eq(actual, episode,
          B.eq_true_of_and_left(Nat.is_eq(actual, episode), Ready.episode_nodes(tail, episode), fresh))):
          {Nat.is_eq(query, _) == False{} : Bool}
        different):
        {(Bool.pick(Nat, Bool.and(_, F.same_route(route, actual_route)), 1n, 0n) + F.count_address(tail, O.NodeAddress{query, route}) : Nat) == 0n : Nat}
      fresh_nodes_exclude_other(tail, episode, query, route,
        B.eq_true_of_and_right(Nat.is_eq(actual, episode), Ready.episode_nodes(tail, episode), fresh), different)

def fresh_counted_episode_branch(+items: List<&2, F.Node>, +episode: Nat, +query: Nat, +route: List<&2, Nat>,
    fresh: {Ready.episode_nodes(items, episode) == True{} : Bool},
    counted: {F.count_address(items, O.NodeAddress{query, route}) == 1n : Nat},
    flag: Bool, branch: {Nat.is_eq(query, episode) == flag : Bool}) ->
    {query == episode : Nat}:
  match flag:
    case True{}: N.eq_of_is_eq(query, episode, branch)
    case False{}:
      Empty.absurd({query == episode : Nat},
        Structure.zero_ne_one(Equal.trans(Nat, 0n, F.count_address(items, O.NodeAddress{query, route}), 1n,
          Equal.sym(Nat, F.count_address(items, O.NodeAddress{query, route}), 0n,
            fresh_nodes_exclude_other(items, episode, query, route, fresh, branch)), counted)))

def fresh_counted_episode(+items: List<&2, F.Node>, +episode: Nat, +query: Nat, +route: List<&2, Nat>,
    fresh: {Ready.episode_nodes(items, episode) == True{} : Bool},
    counted: {F.count_address(items, O.NodeAddress{query, route}) == 1n : Nat}) ->
    {query == episode : Nat}:
  fresh_counted_episode_branch(items, episode, query, route, fresh, counted, Nat.is_eq(query, episode), {==})

# These cross-count conclusions follow from the original forest episodes and
# exact projection counts; neither disjointness nor freshness is added as a law premise.
def child_entries_exclude_parent_address(+parents: List<&2, Local.PlannedNode>, +parent_slots: List<&2, Local.ReferenceSlot>,
    +parent_entries: List<&2, F.AddressEntry>, +parent_values: List<&2, F.Node>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +child_entries: List<&2, F.AddressEntry>, +child_values: List<&2, F.Node>, +catalog: List<&2, T.ArtifactEntry>,
    +episode: Nat, target: O.NodeAddress,
    parent_aligned: {P.aligned(parents, parent_entries, parents, parent_entries) == True{} : Bool},
    parent_dense: {Frame.dense(parents, 0n) == True{} : Bool},
    parent_projected: {P.nodes(parents, parent_slots, catalog, parent_entries) == Some{parent_values} : Maybe<&2, List<&2, F.Node>>},
    parent_before: {Relation.episodes_before(parent_values, episode) == True{} : Bool},
    child_aligned: {P.aligned(children, child_entries, children, child_entries) == True{} : Bool},
    child_dense: {Frame.dense(children, 0n) == True{} : Bool},
    child_projected: {P.nodes(children, child_slots, catalog, child_entries) == Some{child_values} : Maybe<&2, List<&2, F.Node>>},
    child_fresh: {Ready.episode_nodes(child_values, episode) == True{} : Bool},
    counted: {P.address_count(parent_entries, target) == 1n : Nat}) ->
    {P.address_count(child_entries, target) == 0n : Nat}:
  match target:
    case O.NodeAddress{+prior, +route}:
      Equal.trans(Nat, P.address_count(child_entries, O.NodeAddress{prior, route}), F.count_address(child_values, O.NodeAddress{prior, route}), 0n,
        projected_address_count(children, child_entries, child_slots, catalog, child_values, O.NodeAddress{prior, route},
          child_aligned, child_dense, child_projected),
        fresh_nodes_exclude_prior(child_values, episode, prior, route, child_fresh,
          counted_episode_before(parent_values, prior, route, episode, parent_before,
            Equal.trans(Nat, F.count_address(parent_values, O.NodeAddress{prior, route}), P.address_count(parent_entries, O.NodeAddress{prior, route}), 1n,
              Equal.sym(Nat, P.address_count(parent_entries, O.NodeAddress{prior, route}), F.count_address(parent_values, O.NodeAddress{prior, route}),
                projected_address_count(parents, parent_entries, parent_slots, catalog, parent_values, O.NodeAddress{prior, route},
                  parent_aligned, parent_dense, parent_projected)), counted))))

def parent_entries_exclude_child_address(+parents: List<&2, Local.PlannedNode>, +parent_slots: List<&2, Local.ReferenceSlot>,
    +parent_entries: List<&2, F.AddressEntry>, +parent_values: List<&2, F.Node>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +child_entries: List<&2, F.AddressEntry>, +child_values: List<&2, F.Node>, +catalog: List<&2, T.ArtifactEntry>,
    +episode: Nat, target: O.NodeAddress,
    parent_aligned: {P.aligned(parents, parent_entries, parents, parent_entries) == True{} : Bool},
    parent_dense: {Frame.dense(parents, 0n) == True{} : Bool},
    parent_projected: {P.nodes(parents, parent_slots, catalog, parent_entries) == Some{parent_values} : Maybe<&2, List<&2, F.Node>>},
    parent_before: {Relation.episodes_before(parent_values, episode) == True{} : Bool},
    child_aligned: {P.aligned(children, child_entries, children, child_entries) == True{} : Bool},
    child_dense: {Frame.dense(children, 0n) == True{} : Bool},
    child_projected: {P.nodes(children, child_slots, catalog, child_entries) == Some{child_values} : Maybe<&2, List<&2, F.Node>>},
    child_fresh: {Ready.episode_nodes(child_values, episode) == True{} : Bool},
    counted: {P.address_count(child_entries, target) == 1n : Nat}) ->
    {P.address_count(parent_entries, target) == 0n : Nat}:
  match target:
    case O.NodeAddress{+actual, +route}:
      Equal.trans(Nat, P.address_count(parent_entries, O.NodeAddress{actual, route}), F.count_address(parent_values, O.NodeAddress{actual, route}), 0n,
        projected_address_count(parents, parent_entries, parent_slots, catalog, parent_values, O.NodeAddress{actual, route},
          parent_aligned, parent_dense, parent_projected),
        %Equal.sym(Nat, actual, episode,
          fresh_counted_episode(child_values, episode, actual, route, child_fresh,
            Equal.trans(Nat, F.count_address(child_values, O.NodeAddress{actual, route}), P.address_count(child_entries, O.NodeAddress{actual, route}), 1n,
              Equal.sym(Nat, P.address_count(child_entries, O.NodeAddress{actual, route}), F.count_address(child_values, O.NodeAddress{actual, route}),
                projected_address_count(children, child_entries, child_slots, catalog, child_values, O.NodeAddress{actual, route},
                  child_aligned, child_dense, child_projected)), counted))):
          {F.count_address(parent_values, O.NodeAddress{_, route}) == 0n : Nat}
        prior_nodes_exclude_fresh(parent_values, episode, route, parent_before))



# Numeric counts in the full allocation domain: the prefix ends strictly
# before every shifted child ID, irrespective of the child list's ordering.
def appended_parent_node_count(+parents: List<&2, Local.PlannedNode>, +children: List<&2, Local.PlannedNode>, +id: Nat,
    dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +counted: {P.node_count(parents, id) == 1n : Nat}) ->
    {P.node_count(List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))), id) == 1n : Nat}:
  +offset: Nat = List.length(&2, Local.PlannedNode, parents)
  +shifted: List<&2, Local.PlannedNode> = Compose.shift_nodes(children, offset)
  %Equal.sym(Nat, P.node_count(List.append(&2, Local.PlannedNode, parents, shifted), id),
    (P.node_count(parents, id) + P.node_count(shifted, id) : Nat), Contents.node_count_append(parents, shifted, id)):
    {_ == 1n : Nat}
  %Equal.sym(Nat, P.node_count(shifted, id), 0n,
    shifted_nodes_exclude_parent(children, offset, id, dense_owner_below(parents, id, dense, counted))):
    {(P.node_count(parents, id) + _ : Nat) == 1n : Nat}
  %Equal.sym(Nat, P.node_count(parents, id), 1n, counted):
    {(_ + 0n : Nat) == 1n : Nat}
  {==}

def shifted_counted_above_branch(+children: List<&2, Local.PlannedNode>, +offset: Nat, +id: Nat,
    counted: {P.node_count(Compose.shift_nodes(children, offset), id) == 1n : Nat},
    flag: Bool, branch: {Nat.is_lt(id, offset) == flag : Bool}) ->
    {Nat.is_le(offset, id) == True{} : Bool}:
  match flag:
    case False{}: N.le_of_not_lt(id, offset, branch)
    case True{}:
      Empty.absurd({Nat.is_le(offset, id) == True{} : Bool},
        Structure.zero_ne_one(Equal.trans(Nat, 0n, P.node_count(Compose.shift_nodes(children, offset), id), 1n,
          Equal.sym(Nat, P.node_count(Compose.shift_nodes(children, offset), id), 0n,
            shifted_nodes_exclude_parent(children, offset, id, branch)), counted)))

def appended_child_node_count(+parents: List<&2, Local.PlannedNode>, +children: List<&2, Local.PlannedNode>, +id: Nat,
    dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +counted: {P.node_count(Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents)), id) == 1n : Nat}) ->
    {P.node_count(List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))), id) == 1n : Nat}:
  +offset: Nat = List.length(&2, Local.PlannedNode, parents)
  +shifted: List<&2, Local.PlannedNode> = Compose.shift_nodes(children, offset)
  %Equal.sym(Nat, P.node_count(List.append(&2, Local.PlannedNode, parents, shifted), id),
    (P.node_count(parents, id) + P.node_count(shifted, id) : Nat), Contents.node_count_append(parents, shifted, id)):
    {_ == 1n : Nat}
  %Equal.sym(Nat, P.node_count(parents, id), 0n,
    dense_count_upper(parents, 0n, id, dense,
      shifted_counted_above_branch(children, offset, id, counted, Nat.is_lt(id, offset), {==}))):
    {(_ + P.node_count(shifted, id) : Nat) == 1n : Nat}
  counted

# Semantic addresses do not shift: fresh-episode disjointness supplies the
# zero count, while numeric relocation preserves the child address count.
def appended_parent_address_count(+parents: List<&2, F.AddressEntry>, +children: List<&2, F.AddressEntry>,
    +offset: Nat, +target: O.NodeAddress,
    counted: {P.address_count(parents, target) == 1n : Nat},
    absent: {P.address_count(children, target) == 0n : Nat}) ->
    {P.address_count(List.append(&2, F.AddressEntry, parents, Mapping.shifted(children, offset)), target) == 1n : Nat}:
  %Equal.sym(Nat, P.address_count(List.append(&2, F.AddressEntry, parents, Mapping.shifted(children, offset)), target),
    (P.address_count(parents, target) + P.address_count(Mapping.shifted(children, offset), target) : Nat),
    Contents.address_count_append(parents, Mapping.shifted(children, offset), target)):
    {_ == 1n : Nat}
  %Remap.address_count(children, target, offset):
    {(P.address_count(parents, target) + _ : Nat) == 1n : Nat}
  %Equal.sym(Nat, P.address_count(children, target), 0n, absent):
    {(P.address_count(parents, target) + _ : Nat) == 1n : Nat}
  %Equal.sym(Nat, P.address_count(parents, target), 1n, counted):
    {(_ + 0n : Nat) == 1n : Nat}
  {==}

def appended_child_address_count(+parents: List<&2, F.AddressEntry>, +children: List<&2, F.AddressEntry>,
    +offset: Nat, +target: O.NodeAddress,
    absent: {P.address_count(parents, target) == 0n : Nat},
    counted: {P.address_count(Mapping.shifted(children, offset), target) == 1n : Nat}) ->
    {P.address_count(List.append(&2, F.AddressEntry, parents, Mapping.shifted(children, offset)), target) == 1n : Nat}:
  %Equal.sym(Nat, P.address_count(List.append(&2, F.AddressEntry, parents, Mapping.shifted(children, offset)), target),
    (P.address_count(parents, target) + P.address_count(Mapping.shifted(children, offset), target) : Nat),
    Contents.address_count_append(parents, Mapping.shifted(children, offset), target)):
    {_ == 1n : Nat}
  %Equal.sym(Nat, P.address_count(parents, target), 0n, absent):
    {(_ + P.address_count(Mapping.shifted(children, offset), target) : Nat) == 1n : Nat}
  counted

# Preserve the original paired cursor while changing its complete uniqueness domain.
def aligned_parent_appended(nodes: List<&2, Local.PlannedNode>, entries: List<&2, F.AddressEntry>,
    +parents: List<&2, Local.PlannedNode>, +parent_slots: List<&2, Local.ReferenceSlot>,
    +parent_entries: List<&2, F.AddressEntry>, +parent_values: List<&2, F.Node>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +child_entries: List<&2, F.AddressEntry>, +child_values: List<&2, F.Node>, +catalog: List<&2, T.ArtifactEntry>, +episode: Nat,
    +parent_aligned: {P.aligned(parents, parent_entries, parents, parent_entries) == True{} : Bool},
    +parent_dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +parent_projected: {P.nodes(parents, parent_slots, catalog, parent_entries) == Some{parent_values} : Maybe<&2, List<&2, F.Node>>},
    +parent_before: {Relation.episodes_before(parent_values, episode) == True{} : Bool},
    +child_aligned: {P.aligned(children, child_entries, children, child_entries) == True{} : Bool},
    +child_dense: {Frame.dense(children, 0n) == True{} : Bool},
    +child_projected: {P.nodes(children, child_slots, catalog, child_entries) == Some{child_values} : Maybe<&2, List<&2, F.Node>>},
    +child_fresh: {Ready.episode_nodes(child_values, episode) == True{} : Bool},
    +aligned: {P.aligned(nodes, entries, parents, parent_entries) == True{} : Bool}) ->
    {P.aligned(nodes, entries, List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}:
  match nodes entries:
    case Nil{} Nil{}: {==}
    case Con{Local.PlannedNode{+id, +artifact}, +tail} Con{F.AddressEntry{+other, +birth}, +rest}:
      +after_id: {Bool.and(Nat.is_eq(P.node_count(parents, id), 1n),
        Bool.and(Nat.is_eq(P.address_count(parent_entries, birth), 1n), P.aligned(tail, rest, parents, parent_entries))) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(id, other),
          Bool.and(Nat.is_eq(P.node_count(parents, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(parent_entries, birth), 1n), P.aligned(tail, rest, parents, parent_entries))), aligned)
      +after_count: {Bool.and(Nat.is_eq(P.address_count(parent_entries, birth), 1n), P.aligned(tail, rest, parents, parent_entries)) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(P.node_count(parents, id), 1n),
          Bool.and(Nat.is_eq(P.address_count(parent_entries, birth), 1n), P.aligned(tail, rest, parents, parent_entries)), after_id)
      +node_one: {P.node_count(parents, id) == 1n : Nat} =
        N.eq_of_is_eq(P.node_count(parents, id), 1n,
          B.eq_true_of_and_left(Nat.is_eq(P.node_count(parents, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(parent_entries, birth), 1n), P.aligned(tail, rest, parents, parent_entries)), after_id))
      +address_one: {P.address_count(parent_entries, birth) == 1n : Nat} =
        N.eq_of_is_eq(P.address_count(parent_entries, birth), 1n,
          B.eq_true_of_and_left(Nat.is_eq(P.address_count(parent_entries, birth), 1n), P.aligned(tail, rest, parents, parent_entries), after_count))
      Contents.aligned_context_row(id, other, artifact, birth, tail, rest, parents, parent_entries,
        List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
        List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents))), aligned,
        appended_parent_node_count(parents, children, id, parent_dense, node_one),
        appended_parent_address_count(parent_entries, child_entries, List.length(&2, Local.PlannedNode, parents), birth, address_one,
          child_entries_exclude_parent_address(parents, parent_slots, parent_entries, parent_values, children, child_slots, child_entries, child_values, catalog, episode, birth,
          parent_aligned, parent_dense, parent_projected, parent_before, child_aligned, child_dense, child_projected, child_fresh, address_one)),
        aligned_parent_appended(tail, rest, parents, parent_slots, parent_entries, parent_values, children, child_slots, child_entries, child_values, catalog, episode,
          parent_aligned, parent_dense, parent_projected, parent_before, child_aligned, child_dense, child_projected, child_fresh,
          B.eq_true_of_and_right(Nat.is_eq(P.address_count(parent_entries, birth), 1n), P.aligned(tail, rest, parents, parent_entries), after_count)))
    case Nil{} Con{_, _}:
      Empty.absurd({P.aligned(nodes, entries, List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
        List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}, B.internal_false_ne_true(aligned))
    case Con{_, _} Nil{}:
      Empty.absurd({P.aligned(nodes, entries, List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
        List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}, B.internal_false_ne_true(aligned))

# Preserve the original paired cursor while changing its complete uniqueness domain.
def aligned_child_appended(nodes: List<&2, Local.PlannedNode>, entries: List<&2, F.AddressEntry>,
    +parents: List<&2, Local.PlannedNode>, +parent_slots: List<&2, Local.ReferenceSlot>,
    +parent_entries: List<&2, F.AddressEntry>, +parent_values: List<&2, F.Node>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +child_entries: List<&2, F.AddressEntry>, +child_values: List<&2, F.Node>, +catalog: List<&2, T.ArtifactEntry>, +episode: Nat,
    +parent_aligned: {P.aligned(parents, parent_entries, parents, parent_entries) == True{} : Bool},
    +parent_dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +parent_projected: {P.nodes(parents, parent_slots, catalog, parent_entries) == Some{parent_values} : Maybe<&2, List<&2, F.Node>>},
    +parent_before: {Relation.episodes_before(parent_values, episode) == True{} : Bool},
    +child_aligned: {P.aligned(children, child_entries, children, child_entries) == True{} : Bool},
    +child_dense: {Frame.dense(children, 0n) == True{} : Bool},
    +child_projected: {P.nodes(children, child_slots, catalog, child_entries) == Some{child_values} : Maybe<&2, List<&2, F.Node>>},
    +child_fresh: {Ready.episode_nodes(child_values, episode) == True{} : Bool},
    +aligned: {P.aligned(nodes, entries, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents)), Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents))) == True{} : Bool}) ->
    {P.aligned(nodes, entries, List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}:
  match nodes entries:
    case Nil{} Nil{}: {==}
    case Con{Local.PlannedNode{+id, +artifact}, +tail} Con{F.AddressEntry{+other, +birth}, +rest}:
      +shifted_nodes: List<&2, Local.PlannedNode> = Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))
      +shifted_entries: List<&2, F.AddressEntry> = Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents))
      +after_id: {Bool.and(Nat.is_eq(P.node_count(shifted_nodes, id), 1n),
        Bool.and(Nat.is_eq(P.address_count(shifted_entries, birth), 1n), P.aligned(tail, rest, shifted_nodes, shifted_entries))) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(id, other),
          Bool.and(Nat.is_eq(P.node_count(shifted_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(shifted_entries, birth), 1n), P.aligned(tail, rest, shifted_nodes, shifted_entries))), aligned)
      +after_count: {Bool.and(Nat.is_eq(P.address_count(shifted_entries, birth), 1n), P.aligned(tail, rest, shifted_nodes, shifted_entries)) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(P.node_count(shifted_nodes, id), 1n),
          Bool.and(Nat.is_eq(P.address_count(shifted_entries, birth), 1n), P.aligned(tail, rest, shifted_nodes, shifted_entries)), after_id)
      +node_one: {P.node_count(shifted_nodes, id) == 1n : Nat} =
        N.eq_of_is_eq(P.node_count(shifted_nodes, id), 1n,
          B.eq_true_of_and_left(Nat.is_eq(P.node_count(shifted_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(shifted_entries, birth), 1n), P.aligned(tail, rest, shifted_nodes, shifted_entries)), after_id))
      +address_one: {P.address_count(shifted_entries, birth) == 1n : Nat} =
        N.eq_of_is_eq(P.address_count(shifted_entries, birth), 1n,
          B.eq_true_of_and_left(Nat.is_eq(P.address_count(shifted_entries, birth), 1n), P.aligned(tail, rest, shifted_nodes, shifted_entries), after_count))
      Contents.aligned_context_row(id, other, artifact, birth, tail, rest, shifted_nodes, shifted_entries,
        List.append(&2, Local.PlannedNode, parents, shifted_nodes),
        List.append(&2, F.AddressEntry, parent_entries, shifted_entries), aligned,
        appended_child_node_count(parents, children, id, parent_dense, node_one),
        appended_child_address_count(parent_entries, child_entries, List.length(&2, Local.PlannedNode, parents), birth,
          parent_entries_exclude_child_address(parents, parent_slots, parent_entries, parent_values, children, child_slots, child_entries, child_values, catalog, episode, birth,
          parent_aligned, parent_dense, parent_projected, parent_before, child_aligned, child_dense, child_projected, child_fresh,
            Equal.trans(Nat, P.address_count(child_entries, birth), P.address_count(shifted_entries, birth), 1n,
              Remap.address_count(child_entries, birth, List.length(&2, Local.PlannedNode, parents)), address_one)), address_one),
        aligned_child_appended(tail, rest, parents, parent_slots, parent_entries, parent_values, children, child_slots, child_entries, child_values, catalog, episode,
          parent_aligned, parent_dense, parent_projected, parent_before, child_aligned, child_dense, child_projected, child_fresh,
          B.eq_true_of_and_right(Nat.is_eq(P.address_count(shifted_entries, birth), 1n), P.aligned(tail, rest, shifted_nodes, shifted_entries), after_count)))
    case Nil{} Con{_, _}:
      Empty.absurd({P.aligned(nodes, entries, List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
        List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}, B.internal_false_ne_true(aligned))
    case Con{_, _} Nil{}:
      Empty.absurd({P.aligned(nodes, entries, List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
        List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}, B.internal_false_ne_true(aligned))

# Both complete row domains now coincide. The original paired-list append
# closes the full alignment guard, including every retained child occurrence.
def appended_aligned(
    +parents: List<&2, Local.PlannedNode>, +parent_slots: List<&2, Local.ReferenceSlot>,
    +parent_entries: List<&2, F.AddressEntry>, +parent_values: List<&2, F.Node>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +child_entries: List<&2, F.AddressEntry>, +child_values: List<&2, F.Node>, +catalog: List<&2, T.ArtifactEntry>, +episode: Nat,
    +parent_aligned: {P.aligned(parents, parent_entries, parents, parent_entries) == True{} : Bool},
    +parent_dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +parent_projected: {P.nodes(parents, parent_slots, catalog, parent_entries) == Some{parent_values} : Maybe<&2, List<&2, F.Node>>},
    +parent_before: {Relation.episodes_before(parent_values, episode) == True{} : Bool},
    +child_aligned: {P.aligned(children, child_entries, children, child_entries) == True{} : Bool},
    +child_dense: {Frame.dense(children, 0n) == True{} : Bool},
    +child_projected: {P.nodes(children, child_slots, catalog, child_entries) == Some{child_values} : Maybe<&2, List<&2, F.Node>>},
    +child_fresh: {Ready.episode_nodes(child_values, episode) == True{} : Bool}) ->
    {P.aligned(
      List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool}:
  +offset: Nat = List.length(&2, Local.PlannedNode, parents)
  +shifted_nodes: List<&2, Local.PlannedNode> = Compose.shift_nodes(children, offset)
  +shifted_entries: List<&2, F.AddressEntry> = Mapping.shifted(child_entries, offset)
  Contents.aligned_append_fixed(parents, parent_entries, shifted_nodes, shifted_entries,
    List.append(&2, Local.PlannedNode, parents, shifted_nodes),
    List.append(&2, F.AddressEntry, parent_entries, shifted_entries),
    aligned_parent_appended(parents, parent_entries, parents, parent_slots, parent_entries, parent_values, children, child_slots, child_entries, child_values, catalog, episode,
      parent_aligned, parent_dense, parent_projected, parent_before, child_aligned, child_dense, child_projected, child_fresh, parent_aligned),
    aligned_child_appended(shifted_nodes, shifted_entries, parents, parent_slots, parent_entries, parent_values, children, child_slots, child_entries, child_values, catalog, episode,
      parent_aligned, parent_dense, parent_projected, parent_before, child_aligned, child_dense, child_projected, child_fresh,
      %Remap.aligned(children, child_entries, children, child_entries, offset):
        {_ == True{} : Bool}
      child_aligned))

# Exact full projection of the appended frame before replacing the selected
# parent slot. All guards come from the two original successful projections.
def appended_projection(+root: Nat, +birth: O.NodeAddress,
    +parents: List<&2, Local.PlannedNode>, +parent_slots: List<&2, Local.ReferenceSlot>,
    +parent_entries: List<&2, F.AddressEntry>, +parent_values: List<&2, F.Node>,
    +children: List<&2, Local.PlannedNode>, +child_slots: List<&2, Local.ReferenceSlot>,
    +child_entries: List<&2, F.AddressEntry>, +child_values: List<&2, F.Node>, +catalog: List<&2, T.ArtifactEntry>, +episode: Nat,
    +parent_aligned: {P.aligned(parents, parent_entries, parents, parent_entries) == True{} : Bool},
    +parent_dense: {Frame.dense(parents, 0n) == True{} : Bool},
    +parent_projected: {P.nodes(parents, parent_slots, catalog, parent_entries) == Some{parent_values} : Maybe<&2, List<&2, F.Node>>},
    +parent_before: {Relation.episodes_before(parent_values, episode) == True{} : Bool},
    +child_aligned: {P.aligned(children, child_entries, children, child_entries) == True{} : Bool},
    +child_dense: {Frame.dense(children, 0n) == True{} : Bool},
    +child_projected: {P.nodes(children, child_slots, catalog, child_entries) == Some{child_values} : Maybe<&2, List<&2, F.Node>>},
    +child_fresh: {Ready.episode_nodes(child_values, episode) == True{} : Bool},
    +parent_owned: {P.slots_owned(parent_slots, parents) == True{} : Bool},
    child_owned: {P.slots_owned(child_slots, children) == True{} : Bool},
    parent_forward: {P.forward_nodes(parents, parent_slots) == True{} : Bool},
    child_forward: {P.forward_nodes(children, child_slots) == True{} : Bool},
    unique: {P.catalog_unique(catalog, catalog) == True{} : Bool},
    located: {F.address_at(parent_entries, root) == Some{birth} : Maybe<&2, O.NodeAddress>}) ->
    {P.project(root,
      List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      List.append(&2, Local.ReferenceSlot, parent_slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))), catalog,
      List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents))))
      == Some{F.Forest{Some{birth}, List.append(&2, F.Node, parent_values, child_values)}} : Maybe<&2, F.Forest>}:
  +offset: Nat = List.length(&2, Local.PlannedNode, parents)
  +nodes: List<&2, Local.PlannedNode> = List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, offset))
  +slots: List<&2, Local.ReferenceSlot> = List.append(&2, Local.ReferenceSlot, parent_slots, Compose.shift_slots(child_slots, offset))
  +entries: List<&2, F.AddressEntry> = List.append(&2, F.AddressEntry, parent_entries, Mapping.shifted(child_entries, offset))
  Contents.project_from_parts(root, nodes, slots, catalog, entries, birth, List.append(&2, F.Node, parent_values, child_values),
    appended_aligned(parents, parent_slots, parent_entries, parent_values, children, child_slots, child_entries, child_values, catalog, episode,
      parent_aligned, parent_dense, parent_projected, parent_before, child_aligned, child_dense, child_projected, child_fresh), unique,
    appended_slots_owned(parents, parent_slots, children, child_slots, parent_dense, parent_owned, child_owned),
    appended_forward(parents, parent_slots, children, child_slots, parent_dense, parent_owned, parent_forward, child_forward),
    address_append_present(parent_entries, Mapping.shifted(child_entries, offset), root, birth, located),
    appended_nodes(parents, parent_slots, children, child_slots, catalog, parent_entries, child_entries,
      parent_values, child_values, parent_dense, parent_aligned, parent_owned, parent_projected, child_projected))

# Every shifted child owner lies outside the allocated parent interval, so the
# exact replacement operation leaves that entire ordered suffix unchanged.
def shifted_slots_untouched(items: List<&2, Local.ReferenceSlot>, +offset: Nat,
    +owner: Nat, +index: Nat, +reference: Local.PlannedReference,
    +below: {Nat.is_lt(owner, offset) == True{} : Bool}) ->
    {Compose.replace_slot(Compose.shift_slots(items, offset), owner, index, reference)
      == Compose.ReplacedSlots{0n, Compose.shift_slots(items, offset)} : Compose.ReplacedSlots}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +symbol, +previous} <> +tail:
      %Equal.sym(Compose.ReplacedSlots, Compose.replace_slot(Compose.shift_slots(tail, offset), owner, index, reference),
        Compose.ReplacedSlots{0n, Compose.shift_slots(tail, offset)}, shifted_slots_untouched(tail, offset, owner, index, reference, below)):
        {Compose.replaced_prefix(_, Bool.and(Nat.is_eq(owner, (actual_owner + offset : Nat)), Nat.is_eq(index, actual_index)),
          (actual_owner + offset : Nat), actual_index, symbol, Compose.shift_reference(previous, offset), reference)
          == Compose.ReplacedSlots{0n, Compose.shift_slots(Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail, offset)} : Compose.ReplacedSlots}
      %Equal.sym(Bool, Nat.is_eq(owner, (actual_owner + offset : Nat)), False{},
        Equal.trans(Bool, Nat.is_eq(owner, (actual_owner + offset : Nat)), Nat.is_eq((actual_owner + offset : Nat), owner), False{},
          Structure.is_eq_comm(owner, (actual_owner + offset : Nat)), shifted_owner_distinct(actual_owner, offset, owner, below))):
        {Compose.replaced_prefix(Compose.ReplacedSlots{0n, Compose.shift_slots(tail, offset)}, Bool.and(_, Nat.is_eq(index, actual_index)),
          (actual_owner + offset : Nat), actual_index, symbol, Compose.shift_reference(previous, offset), reference)
          == Compose.ReplacedSlots{0n, Compose.shift_slots(Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail, offset)} : Compose.ReplacedSlots}
      {==}

def shifted_slots_selected_absent(items: List<&2, Local.ReferenceSlot>, +offset: Nat,
    +owner: Nat, +index: Nat, +symbol: String,
    +below: {Nat.is_lt(owner, offset) == True{} : Bool}) ->
    {Ready.slot_count(Compose.shift_slots(items, offset), owner, index, symbol) == 0n : Nat}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +text, _} <> +tail:
      %Equal.sym(Bool, Nat.is_eq(owner, (actual_owner + offset : Nat)), False{},
        Equal.trans(Bool, Nat.is_eq(owner, (actual_owner + offset : Nat)), Nat.is_eq((actual_owner + offset : Nat), owner), False{},
          Structure.is_eq_comm(owner, (actual_owner + offset : Nat)), shifted_owner_distinct(actual_owner, offset, owner, below))):
        {(Bool.pick(Nat, Bool.and(_, Bool.and(Nat.is_eq(index, actual_index), String.eq(symbol, text))), 1n, 0n)
          + Ready.slot_count(Compose.shift_slots(tail, offset), owner, index, symbol) : Nat) == 0n : Nat}
      shifted_slots_selected_absent(tail, offset, owner, index, symbol, below)

def slot_count_append(items: List<&2, Local.ReferenceSlot>, +suffix: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +index: Nat, +symbol: String) ->
    {Ready.slot_count(List.append(&2, Local.ReferenceSlot, items, suffix), owner, index, symbol)
      == (Ready.slot_count(items, owner, index, symbol) + Ready.slot_count(suffix, owner, index, symbol) : Nat) : Nat}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +text, _} <> +tail:
      +flag: Nat = Bool.pick(Nat, Bool.and(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(index, actual_index), String.eq(symbol, text))), 1n, 0n)
      %Equal.sym(Nat, Ready.slot_count(List.append(&2, Local.ReferenceSlot, tail, suffix), owner, index, symbol),
        (Ready.slot_count(tail, owner, index, symbol) + Ready.slot_count(suffix, owner, index, symbol) : Nat),
        slot_count_append(tail, suffix, owner, index, symbol)):
        {(flag + _ : Nat) == ((flag + Ready.slot_count(tail, owner, index, symbol) : Nat) + Ready.slot_count(suffix, owner, index, symbol) : Nat) : Nat}
      Equal.sym(Nat,
        ((flag + Ready.slot_count(tail, owner, index, symbol) : Nat) + Ready.slot_count(suffix, owner, index, symbol) : Nat),
        (flag + (Ready.slot_count(tail, owner, index, symbol) + Ready.slot_count(suffix, owner, index, symbol) : Nat) : Nat),
        Arithmetic.add_assoc(flag, Ready.slot_count(tail, owner, index, symbol), Ready.slot_count(suffix, owner, index, symbol)))

def appended_selected(+parents: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +entries: List<&2, F.AddressEntry>, +child_slots: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +index: Nat, +symbol: String, +birth: O.NodeAddress,
    dense: {Frame.dense(parents, 0n) == True{} : Bool},
    aligned: {P.aligned(parents, entries, parents, entries) == True{} : Bool},
    located: {F.address_at(entries, owner) == Some{birth} : Maybe<&2, O.NodeAddress>},
    selected: {Ready.slot_count(slots, owner, index, symbol) == 1n : Nat}) ->
    {Ready.slot_count(List.append(&2, Local.ReferenceSlot, slots, Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))),
      owner, index, symbol) == 1n : Nat}:
  +suffix: List<&2, Local.ReferenceSlot> = Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))
  %Equal.sym(Nat, Ready.slot_count(List.append(&2, Local.ReferenceSlot, slots, suffix), owner, index, symbol),
    (Ready.slot_count(slots, owner, index, symbol) + Ready.slot_count(suffix, owner, index, symbol) : Nat),
    slot_count_append(slots, suffix, owner, index, symbol)):
    {_ == 1n : Nat}
  %Equal.sym(Nat, Ready.slot_count(suffix, owner, index, symbol), 0n,
    shifted_slots_selected_absent(child_slots, List.length(&2, Local.PlannedNode, parents), owner, index, symbol,
      dense_owner_below(parents, owner, dense, RootSelection.count(parents, entries, parents, entries, owner, birth, aligned, located)))):
    {(Ready.slot_count(slots, owner, index, symbol) + _ : Nat) == 1n : Nat}
  %Equal.sym(Nat, Ready.slot_count(slots, owner, index, symbol), 1n, selected):
    {(_ + 0n : Nat) == 1n : Nat}
  {==}

# Successful replacement of the combined frame determines the original parent
# payload; the untouched suffix cannot manufacture or hide a replacement.
def replacement_suffix_selected(+count: Nat, +items: List<&2, Local.ReferenceSlot>,
    +suffix: List<&2, Local.ReferenceSlot>, +changed: List<&2, Local.ReferenceSlot>,
    selected: Bool, branch: {Nat.is_eq(count, 1n) == selected : Bool},
    success: {Bool.pick(Maybe<&2, List<&2, Local.ReferenceSlot>>, selected,
      Some{List.append(&2, Local.ReferenceSlot, items, suffix)}, None{}) == Some{changed} : Maybe<&2, List<&2, Local.ReferenceSlot>>}) ->
    {Compose.replacement(Compose.ReplacedSlots{count, items}) == Some{items} : Maybe<&2, List<&2, Local.ReferenceSlot>>} &
    {changed == List.append(&2, Local.ReferenceSlot, items, suffix) : List<&2, Local.ReferenceSlot>}:
  match selected:
    case True{}:
      Tuple{
        %Equal.sym(Bool, Nat.is_eq(count, 1n), True{}, branch):
          {Bool.pick(Maybe<&2, List<&2, Local.ReferenceSlot>>, _, Some{items}, None{}) == Some{items} : Maybe<&2, List<&2, Local.ReferenceSlot>>}
        {==},
        Equal.sym(List<&2, Local.ReferenceSlot>, List.append(&2, Local.ReferenceSlot, items, suffix), changed,
          Count.some_equal(List<&2, Local.ReferenceSlot>, List.append(&2, Local.ReferenceSlot, items, suffix), changed, success))}
    case False{}:
      Empty.absurd(
        {Compose.replacement(Compose.ReplacedSlots{count, items}) == Some{items} : Maybe<&2, List<&2, Local.ReferenceSlot>>} &
        {changed == List.append(&2, Local.ReferenceSlot, items, suffix) : List<&2, Local.ReferenceSlot>},
        Contents.none_some(List<&2, Local.ReferenceSlot>, changed, success))

def replacement_suffix_payload(+result: Compose.ReplacedSlots, +suffix: List<&2, Local.ReferenceSlot>,
    +changed: List<&2, Local.ReferenceSlot>,
    success: {Compose.replacement(Structure.with_suffix(result, suffix)) == Some{changed} : Maybe<&2, List<&2, Local.ReferenceSlot>>}) ->
    {Compose.replacement(result) == Some{Structure.slots(result)} : Maybe<&2, List<&2, Local.ReferenceSlot>>} &
    {changed == List.append(&2, Local.ReferenceSlot, Structure.slots(result), suffix) : List<&2, Local.ReferenceSlot>}:
  match result:
    case Compose.ReplacedSlots{+count, +items}:
      replacement_suffix_selected(count, items, suffix, changed, Nat.is_eq(count, 1n), {==}, success)

# This is the exact payload needed by tentative_attachment, recovered from the
# existing whole-node replacement theorem rather than assumed successful.
def appended_replacement_payload(+parents: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +entries: List<&2, F.AddressEntry>, +child_slots: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +index: Nat, +reference: Local.PlannedReference, +birth: O.NodeAddress,
    +changed: List<&2, Local.ReferenceSlot>,
    dense: {Frame.dense(parents, 0n) == True{} : Bool},
    aligned: {P.aligned(parents, entries, parents, entries) == True{} : Bool},
    located: {F.address_at(entries, owner) == Some{birth} : Maybe<&2, O.NodeAddress>},
    success: {Compose.replacement(Compose.replace_slot(List.append(&2, Local.ReferenceSlot, slots,
      Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))), owner, index, reference))
      == Some{changed} : Maybe<&2, List<&2, Local.ReferenceSlot>>}) ->
    {Compose.replacement(Compose.replace_slot(slots, owner, index, reference))
      == Some{Structure.slots(Compose.replace_slot(slots, owner, index, reference))} : Maybe<&2, List<&2, Local.ReferenceSlot>>} &
    {changed == List.append(&2, Local.ReferenceSlot, Structure.slots(Compose.replace_slot(slots, owner, index, reference)),
      Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))) : List<&2, Local.ReferenceSlot>}:
  +suffix: List<&2, Local.ReferenceSlot> = Compose.shift_slots(child_slots, List.length(&2, Local.PlannedNode, parents))
  replacement_suffix_payload(Compose.replace_slot(slots, owner, index, reference), suffix, changed,
    %Structure.replace_untouched_suffix(slots, suffix, owner, index, reference,
      shifted_slots_untouched(child_slots, List.length(&2, Local.PlannedNode, parents), owner, index, reference,
        dense_owner_below(parents, owner, dense, RootSelection.count(parents, entries, parents, entries, owner, birth, aligned, located)))):
      {Compose.replacement(_) == Some{changed} : Maybe<&2, List<&2, Local.ReferenceSlot>>}
    success)

def appended_child_address(+parents: List<&2, Local.PlannedNode>, +entries: List<&2, F.AddressEntry>,
    +child_entries: List<&2, F.AddressEntry>, +child_root: Nat, +birth: O.NodeAddress,
    aligned: {P.aligned(parents, entries, parents, entries) == True{} : Bool},
    dense: {Frame.dense(parents, 0n) == True{} : Bool},
    located: {F.address_at(child_entries, child_root) == Some{birth} : Maybe<&2, O.NodeAddress>}) ->
    {F.address_at(List.append(&2, F.AddressEntry, entries, Mapping.shifted(child_entries, List.length(&2, Local.PlannedNode, parents))),
      (child_root + List.length(&2, Local.PlannedNode, parents) : Nat)) == Some{birth} : Maybe<&2, O.NodeAddress>}:
  +offset: Nat = List.length(&2, Local.PlannedNode, parents)
  Equal.trans(Maybe<&2, O.NodeAddress>,
    F.address_at(List.append(&2, F.AddressEntry, entries, Mapping.shifted(child_entries, offset)), (child_root + offset : Nat)),
    F.address_at(Mapping.shifted(child_entries, offset), (child_root + offset : Nat)), Some{birth},
    shifted_address_prefix(parents, entries, child_entries, child_root, aligned, dense),
    %Remap.address_at(child_entries, child_root, offset):
      {_ == Some{birth} : Maybe<&2, O.NodeAddress>}
    located)

def appended_attachment_reference(known: Bool, +owner: Nat, +index: Nat, +symbol: String, +identity: String,
    +child_root: Nat, +offset: Nat, +birth: O.NodeAddress,
    +child_values: List<&2, F.Node>, +child_entries: List<&2, F.AddressEntry>,
    +entries: List<&2, F.AddressEntry>,
    located: {F.address_at(entries, (child_root + offset : Nat)) == Some{birth} : Maybe<&2, O.NodeAddress>}) ->
    {P.reference(Local.ReferenceSlot{owner, index, symbol,
      Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{(child_root + offset : Nat)})}, entries)
      == Some{X.attachment_reference(known, F.Created{birth, child_values, child_entries}, symbol, identity)} : Maybe<&2, F.Reference>}:
  match known:
    case True{}: {==}
    case False{}:
      %Equal.sym(Maybe<&2, O.NodeAddress>, F.address_at(entries, (child_root + offset : Nat)), Some{birth}, located):
        {P.expanded_reference(_, symbol) == Some{F.Expanded{F.ReferenceSymbol{symbol}, birth}} : Maybe<&2, F.Reference>}
      {==}

def projected_lookup_count(+nodes: List<&2, Local.PlannedNode>, +entries: List<&2, F.AddressEntry>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>, +values: List<&2, F.Node>,
    +query: Nat, +birth: O.NodeAddress,
    +aligned: {P.aligned(nodes, entries, nodes, entries) == True{} : Bool},
    dense: {Frame.dense(nodes, 0n) == True{} : Bool},
    projected: {P.nodes(nodes, slots, catalog, entries) == Some{values} : Maybe<&2, List<&2, F.Node>>},
    located: {F.address_at(entries, query) == Some{birth} : Maybe<&2, O.NodeAddress>}) ->
    {F.count_address(values, birth) == 1n : Nat}:
  Equal.trans(Nat, F.count_address(values, birth), P.address_count(entries, birth), 1n,
    Equal.sym(Nat, P.address_count(entries, birth), F.count_address(values, birth),
      projected_address_count(nodes, entries, slots, catalog, values, birth, aligned, dense, projected)),
    Replacement.aligned_lookup_unique(nodes, entries, nodes, entries, query, birth, aligned, located))

# Birth order follows solely from the original episode frontier; routes remain
# arbitrary, including the empty routes of both roots.
def born_later_episode(prior: Nat, later: Nat, +route: List<&2, Nat>, +rest: List<&2, Nat>,
    below: {Nat.is_lt(prior, later) == True{} : Bool}) ->
    {F.born_after(O.NodeAddress{prior, route}, O.NodeAddress{later, rest}) == True{} : Bool}:
  match prior later:
    case 0n 0n:
      Empty.absurd({F.born_after(O.NodeAddress{0n, route}, O.NodeAddress{0n, rest}) == True{} : Bool}, B.internal_false_ne_true(below))
    case 0n 1n++next: {==}
    case 1n++old 0n:
      Empty.absurd({F.born_after(O.NodeAddress{1n+old, route}, O.NodeAddress{0n, rest}) == True{} : Bool}, B.internal_false_ne_true(below))
    case 1n++old 1n++next:
      born_later_episode(old, next, route, rest, below)

def fresh_attachment_born(+parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    owner: O.NodeAddress, child: O.NodeAddress,
    before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    owner_present: {F.count_address(parents, owner) == 1n : Nat},
    child_present: {F.count_address(children, child) == 1n : Nat}) ->
    {F.born_after(owner, child) == True{} : Bool}:
  match owner child:
    case O.NodeAddress{+prior, +route} O.NodeAddress{+later, +rest}:
      %Equal.sym(Nat, later, episode, fresh_counted_episode(children, episode, later, rest, fresh, child_present)):
        {F.born_after(O.NodeAddress{prior, route}, O.NodeAddress{_, rest}) == True{} : Bool}
      born_later_episode(prior, episode, route, rest, counted_episode_before(parents, prior, route, episode, before, owner_present))

def attachment_reference_valid(known: Bool, +owner: O.NodeAddress, +child: O.NodeAddress,
    +children: List<&2, F.Node>, +child_entries: List<&2, F.AddressEntry>, +all: List<&2, F.Node>,
    +symbol: String, +identity: String,
    counted: {F.count_address(all, child) == 1n : Nat},
    born: {F.born_after(owner, child) == True{} : Bool}) ->
    {F.reference_valid(X.attachment_reference(known, F.Created{child, children, child_entries}, symbol, identity), owner, all) == True{} : Bool}:
  match known:
    case True{}: {==}
    case False{}:
      B.and_eq_true(Nat.is_eq(F.count_address(all, child), 1n), F.born_after(owner, child),
        %Equal.sym(Nat, F.count_address(all, child), 1n, counted): {Nat.is_eq(_, 1n) == True{} : Bool}
        {==}, born)

# Lift the exact existing node-replacement result through F's checked wrapper.
def forest_replacement_completed(+root: O.NodeAddress, +retained: List<&2, F.Node>, +owner: O.NodeAddress,
    +index: Nat, +reference: F.Reference, +changed: List<&2, F.Node>,
    owner_present: {F.count_address(retained, owner) == 1n : Nat},
    reference_valid: {F.reference_valid(reference, owner, retained) == True{} : Bool},
    replaced: {F.replace_nodes(retained, owner, index, reference) == F.Nodes{changed, 1n} : F.Nodes}) ->
    {F.replace(F.Forest{Some{root}, retained}, owner, index, reference) == F.Replaced{F.Forest{Some{root}, changed}} : F.Replacement}:
  %Equal.sym(Bool, Bool.and(Nat.is_eq(F.count_address(retained, owner), 1n), F.reference_valid(reference, owner, retained)), True{},
    B.and_eq_true(Nat.is_eq(F.count_address(retained, owner), 1n), F.reference_valid(reference, owner, retained),
      %Equal.sym(Nat, F.count_address(retained, owner), 1n, owner_present): {Nat.is_eq(_, 1n) == True{} : Bool}
      {==}, reference_valid)):
    {F.replace_allowed(_, F.Forest{Some{root}, retained}, owner, index, reference) == F.Replaced{F.Forest{Some{root}, changed}} : F.Replacement}
  %Equal.sym(F.Nodes, F.replace_nodes(retained, owner, index, reference), F.Nodes{changed, 1n}, replaced):
    {F.replacement(_, Some{root}) == F.Replaced{F.Forest{Some{root}, changed}} : F.Replacement}
  {==}

# The new expanded reference always targets the child suffix; it is forward
# from every retained parent row, not merely from the selected row.
def appended_new_forward(known: Bool, +identity: String, +child_root: Nat,
    +later: List<&2, Local.PlannedNode>, +children: List<&2, Local.PlannedNode>, +start: Nat, +offset: Nat,
    dense: {Frame.dense(later, start) == True{} : Bool},
    room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, later) : Nat), offset) == True{} : Bool},
    child_count: {P.node_count(children, child_root) == 1n : Nat}) ->
    {P.forward_reference(Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{(child_root + offset : Nat)}),
      List.append(&2, Local.PlannedNode, later, Compose.shift_nodes(children, offset))) == True{} : Bool}:
  match known:
    case True{}: {==}
    case False{}:
      +target: Nat = (child_root + offset : Nat)
      +shifted: List<&2, Local.PlannedNode> = Compose.shift_nodes(children, offset)
      %Equal.sym(Nat, P.node_count(List.append(&2, Local.PlannedNode, later, shifted), target),
        (P.node_count(later, target) + P.node_count(shifted, target) : Nat), Contents.node_count_append(later, shifted, target)):
        {Nat.is_eq(_, 1n) == True{} : Bool}
      %Equal.sym(Nat, P.node_count(later, target), 0n,
        dense_count_upper(later, start, target, dense,
          N.le_trans((start + List.length(&2, Local.PlannedNode, later) : Nat), offset, target, room,
            N.add_le_add_right(0n, child_root, offset, N.zero_le(child_root))))):
        {Nat.is_eq((_ + P.node_count(shifted, target) : Nat), 1n) == True{} : Bool}
      %Remap.node_count(children, child_root, offset): {Nat.is_eq(_, 1n) == True{} : Bool}
      %Equal.sym(Nat, P.node_count(children, child_root), 1n, child_count): {Nat.is_eq(_, 1n) == True{} : Bool}
      {==}

def shifted_forward_unaffected(items: List<&2, Local.PlannedNode>, +offset: Nat,
    +slots: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat, +reference: Local.PlannedReference,
    +below: {Nat.is_lt(owner, offset) == True{} : Bool},
    +forward: {P.forward_nodes(Compose.shift_nodes(items, offset), slots) == True{} : Bool}) ->
    {P.forward_nodes(Compose.shift_nodes(items, offset), Structure.slots(Compose.replace_slot(slots, owner, index, reference))) == True{} : Bool}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, _} <> +tail:
      B.and_eq_true(P.indexed(P.owner_slots(Structure.slots(Compose.replace_slot(slots, owner, index, reference)), (id + offset : Nat)), 0n,
          Compose.shift_nodes(tail, offset)),
        P.forward_nodes(Compose.shift_nodes(tail, offset), Structure.slots(Compose.replace_slot(slots, owner, index, reference))),
        %Equal.sym(List<&2, Local.ReferenceSlot>, P.owner_slots(Structure.slots(Compose.replace_slot(slots, owner, index, reference)), (id + offset : Nat)),
          P.owner_slots(slots, (id + offset : Nat)), Structure.filter_other_owner(slots, owner, index, reference, (id + offset : Nat), shifted_owner_distinct(id, offset, owner, below))):
          {P.indexed(_, 0n, Compose.shift_nodes(tail, offset)) == True{} : Bool}
        B.eq_true_of_and_left(P.indexed(P.owner_slots(slots, (id + offset : Nat)), 0n, Compose.shift_nodes(tail, offset)),
          P.forward_nodes(Compose.shift_nodes(tail, offset), slots), forward),
        shifted_forward_unaffected(tail, offset, slots, owner, index, reference, below,
          B.eq_true_of_and_right(P.indexed(P.owner_slots(slots, (id + offset : Nat)), 0n, Compose.shift_nodes(tail, offset)),
            P.forward_nodes(Compose.shift_nodes(tail, offset), slots), forward)))

def replaced_forward_cursor(items: List<&2, Local.PlannedNode>, +children: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat, +known: Bool, +identity: String,
    +child_root: Nat, +start: Nat, +offset: Nat,
    +dense: {Frame.dense(items, start) == True{} : Bool},
    +room: {Nat.is_le((start + List.length(&2, Local.PlannedNode, items) : Nat), offset) == True{} : Bool},
    +below: {Nat.is_lt(owner, offset) == True{} : Bool},
    +child_count: {P.node_count(children, child_root) == 1n : Nat},
    +forward: {P.forward_nodes(List.append(&2, Local.PlannedNode, items, Compose.shift_nodes(children, offset)), slots) == True{} : Bool}) ->
    {P.forward_nodes(List.append(&2, Local.PlannedNode, items, Compose.shift_nodes(children, offset)),
      Structure.slots(Compose.replace_slot(slots, owner, index,
        Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{(child_root + offset : Nat)})))) == True{} : Bool}:
  match items:
    case []:
      shifted_forward_unaffected(children, offset, slots, owner, index,
        Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{(child_root + offset : Nat)}), below, forward)
    case Local.PlannedNode{+id, _} <> +tail:
      +new_reference: Local.PlannedReference = Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{(child_root + offset : Nat)})
      +changed: List<&2, Local.ReferenceSlot> = Structure.slots(Compose.replace_slot(slots, owner, index, new_reference))
      +later: List<&2, Local.PlannedNode> = List.append(&2, Local.PlannedNode, tail, Compose.shift_nodes(children, offset))
      +tail_dense: {Frame.dense(tail, (start + 1n : Nat)) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(id, start), Frame.dense(tail, (start + 1n : Nat)), dense)
      +tail_room: {Nat.is_le(((start + 1n : Nat) + List.length(&2, Local.PlannedNode, tail) : Nat), offset) == True{} : Bool} =
        %Allocation.length_step(start, List.length(&2, Local.PlannedNode, tail)): {Nat.is_le(_, offset) == True{} : Bool}
        room
      B.and_eq_true(P.indexed(P.owner_slots(changed, id), 0n, later), P.forward_nodes(later, changed),
        Structure.replacement_owner_indexed(slots, owner, index, new_reference, id, 0n, later,
          B.eq_true_of_and_left(P.indexed(P.owner_slots(slots, id), 0n, later), P.forward_nodes(later, slots), forward),
          appended_new_forward(known, identity, child_root, tail, children, (start + 1n : Nat), offset, tail_dense, tail_room, child_count)),
        replaced_forward_cursor(tail, children, slots, owner, index, known, identity, child_root, (start + 1n : Nat), offset,
          tail_dense, tail_room, below, child_count,
          B.eq_true_of_and_right(P.indexed(P.owner_slots(slots, id), 0n, later), P.forward_nodes(later, slots), forward)))


# Reassemble the complete projection at the exact replacement witness. The
# node equation is the conclusion of node_replacement_exact; all structural
# guards here are transported from the original appended frame.
def replaced_appended_projection(+root: Nat, +birth: O.NodeAddress,
    +parents: List<&2, Local.PlannedNode>, +children: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +entries: List<&2, F.AddressEntry>, +owner: Nat, +index: Nat,
    +known: Bool, +identity: String, +child_root: Nat,
    +changed_slots: List<&2, Local.ReferenceSlot>, +changed_nodes: List<&2, F.Node>,
    aligned: {P.aligned(List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))), entries,
      List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))), entries) == True{} : Bool},
    unique: {P.catalog_unique(catalog, catalog) == True{} : Bool},
    owned: {P.slots_owned(slots, List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents)))) == True{} : Bool},
    forward: {P.forward_nodes(List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))), slots) == True{} : Bool},
    dense: {Frame.dense(parents, 0n) == True{} : Bool},
    below: {Nat.is_lt(owner, List.length(&2, Local.PlannedNode, parents)) == True{} : Bool},
    child_count: {P.node_count(children, child_root) == 1n : Nat},
    located: {F.address_at(entries, root) == Some{birth} : Maybe<&2, O.NodeAddress>},
    replaced: {Compose.replacement(Compose.replace_slot(slots, owner, index,
      Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{(child_root + List.length(&2, Local.PlannedNode, parents) : Nat)})))
      == Some{changed_slots} : Maybe<&2, List<&2, Local.ReferenceSlot>>},
    projected: {P.nodes(List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      changed_slots, catalog, entries) == Some{changed_nodes} : Maybe<&2, List<&2, F.Node>>}) ->
    {P.project(root, List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, List.length(&2, Local.PlannedNode, parents))),
      changed_slots, catalog, entries) == Some{F.Forest{Some{birth}, changed_nodes}} : Maybe<&2, F.Forest>}:
  +offset: Nat = List.length(&2, Local.PlannedNode, parents)
  +nodes: List<&2, Local.PlannedNode> = List.append(&2, Local.PlannedNode, parents, Compose.shift_nodes(children, offset))
  +reference: Local.PlannedReference = Bool.pick(Local.PlannedReference, known, Local.Included{identity}, Local.Expanded{(child_root + offset : Nat)})
  +payload: {Structure.slots(Compose.replace_slot(slots, owner, index, reference)) == changed_slots : List<&2, Local.ReferenceSlot>} =
    Replacement.replacement_payload(Compose.replace_slot(slots, owner, index, reference), changed_slots, replaced)
  Contents.project_from_parts(root, nodes, changed_slots, catalog, entries, birth, changed_nodes, aligned, unique,
    %payload: {P.slots_owned(_, nodes) == True{} : Bool}
      Structure.replacement_owned(slots, owner, index, reference, nodes, owned),
    %payload: {P.forward_nodes(nodes, _) == True{} : Bool}
      replaced_forward_cursor(parents, children, slots, owner, index, known, identity, child_root, 0n, offset,
        dense, N.le_refl(offset), below, child_count, forward),
    located, projected)

def fresh_attachment_distinct(+parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    prior: O.NodeAddress, child: O.NodeAddress,
    before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    prior_present: {F.count_address(parents, prior) == 1n : Nat},
    child_present: {F.count_address(children, child) == 1n : Nat}) ->
    {F.same_address(child, prior) == False{} : Bool}:
  match prior child:
    case O.NodeAddress{+old, +route} O.NodeAddress{+next, +rest}:
      %Equal.sym(Nat, next, episode, fresh_counted_episode(children, episode, next, rest, fresh, child_present)):
        {F.same_address(O.NodeAddress{_, rest}, O.NodeAddress{old, route}) == False{} : Bool}
      later_address_distinct(old, episode, route, rest, counted_episode_before(parents, old, route, episode, before, prior_present))

def attachment_reference_absent(known: Bool, +prior: O.NodeAddress, +child: O.NodeAddress,
    +children: List<&2, F.Node>, +entries: List<&2, F.AddressEntry>, +symbol: String, +identity: String,
    distinct: {F.same_address(child, prior) == False{} : Bool}) ->
    {Rollback.reference_weight(X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity), prior) == 0n : Nat}:
  match known:
    case True{}: {==}
    case False{}:
      %Equal.sym(Bool, F.same_address(child, prior), False{}, distinct): {Bool.pick(Nat, _, 1n, 0n) == 0n : Nat}
      {==}

def attachment_old_root_valid(+parents: List<&2, F.Node>, +children: List<&2, F.Node>, +all: List<&2, F.Node>,
    +entries: List<&2, F.AddressEntry>, +episode: Nat, +root: O.NodeAddress, +child: O.NodeAddress,
    +owner: O.NodeAddress, +index: Nat, +known: Bool, +symbol: String, +identity: String,
    before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    root_present: {F.count_address(parents, root) == 1n : Nat},
    child_present: {F.count_address(children, child) == 1n : Nat},
    valid: {True{} == Relation.root_valid(Some{root}, all) : Bool}) ->
    {True{} == Relation.root_valid(Some{root}, Rollback.result_nodes(F.replace_nodes(all, owner, index,
      X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity)))) : Bool}:
  Rollback.replacement_root_valid(root, all, owner, index, X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity),
    attachment_reference_absent(known, root, child, children, entries, symbol, identity,
      fresh_attachment_distinct(parents, children, episode, root, child, before, fresh, root_present, child_present)), valid)

def attachment_incoming_branch(+all: List<&2, F.Node>, +owner: O.NodeAddress, +index: Nat,
    known: Bool, +child: O.NodeAddress, +children: List<&2, F.Node>, +entries: List<&2, F.AddressEntry>,
    +symbol: String, +identity: String, +query: O.NodeAddress, same: Bool,
    selected: {F.count_address(all, owner) == 1n : Nat},
    fresh: {Relation.incoming(all, child) == 0n : Nat},
    previous: {Nat.is_le(Relation.incoming(all, query), 1n) == True{} : Bool},
    equal: {F.same_address(child, query) == same : Bool}) ->
    {Nat.is_le(Relation.incoming(Rollback.result_nodes(F.replace_nodes(all, owner, index,
      X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity))), query), 1n) == True{} : Bool}:
  match known same:
    case True{} _:
      N.le_trans(Relation.incoming(Rollback.result_nodes(F.replace_nodes(all, owner, index, F.Included{F.ReferenceSymbol{symbol}, F.ArtifactIdentity{identity}})), query),
        Relation.incoming(all, query), 1n,
        Rollback.replacement_non_target_incoming(all, owner, index, F.Included{F.ReferenceSymbol{symbol}, F.ArtifactIdentity{identity}}, query, {==}), previous)
    case False{} False{}:
      N.le_trans(Relation.incoming(Rollback.result_nodes(F.replace_nodes(all, owner, index, F.Expanded{F.ReferenceSymbol{symbol}, child})), query),
        Relation.incoming(all, query), 1n,
        Rollback.replacement_non_target_incoming(all, owner, index, F.Expanded{F.ReferenceSymbol{symbol}, child}, query,
          %Equal.sym(Bool, F.same_address(child, query), False{}, equal): {Bool.pick(Nat, _, 1n, 0n) == 0n : Nat}
          {==}), previous)
    case False{} True{}:
      %Rollback.same_address_equal(child, query, equal):
        {Nat.is_le(Relation.incoming(Rollback.result_nodes(F.replace_nodes(all, owner, index, F.Expanded{F.ReferenceSymbol{symbol}, child})), _), 1n) == True{} : Bool}
      Rollback.replacement_fresh_incoming(all, owner, index, F.Expanded{F.ReferenceSymbol{symbol}, child}, child, selected, fresh)

def attachment_incoming_valid(+all: List<&2, F.Node>, +owner: O.NodeAddress, +index: Nat,
    +known: Bool, +child: O.NodeAddress, +children: List<&2, F.Node>, +entries: List<&2, F.AddressEntry>,
    +symbol: String, +identity: String, +query: O.NodeAddress,
    selected: {F.count_address(all, owner) == 1n : Nat},
    fresh: {Relation.incoming(all, child) == 0n : Nat},
    previous: {Nat.is_le(Relation.incoming(all, query), 1n) == True{} : Bool}) ->
    {Nat.is_le(Relation.incoming(Rollback.result_nodes(F.replace_nodes(all, owner, index,
      X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity))), query), 1n) == True{} : Bool}:
  attachment_incoming_branch(all, owner, index, known, child, children, entries, symbol, identity, query,
    F.same_address(child, query), selected, fresh, previous, {==})

def parent_excludes_child(+parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    child: O.NodeAddress,
    before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    present: {F.count_address(children, child) == 1n : Nat}) ->
    {F.count_address(parents, child) == 0n : Nat}:
  match child:
    case O.NodeAddress{+actual, +route}:
      %Equal.sym(Nat, actual, episode, fresh_counted_episode(children, episode, actual, route, fresh, present)):
        {F.count_address(parents, O.NodeAddress{_, route}) == 0n : Nat}
      prior_nodes_exclude_fresh(parents, episode, route, before)

def child_excludes_parent(+parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    prior: O.NodeAddress,
    before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    present: {F.count_address(parents, prior) == 1n : Nat}) ->
    {F.count_address(children, prior) == 0n : Nat}:
  match prior:
    case O.NodeAddress{+actual, +route}:
      fresh_nodes_exclude_prior(children, episode, actual, route, fresh,
        counted_episode_before(parents, actual, route, episode, before, present))

def appended_fresh_incoming(+parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    +child: O.NodeAddress,
    before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    valid: {True{} == Relation.nodes_valid(parents, parents) : Bool},
    present: {F.count_address(children, child) == 1n : Nat},
    empty: {Relation.incoming(children, child) == 0n : Nat}) ->
    {Relation.incoming(List.append(&2, F.Node, parents, children), child) == 0n : Nat}:
  %Equal.sym(Nat, Relation.incoming(List.append(&2, F.Node, parents, children), child),
    (Relation.incoming(parents, child) + Relation.incoming(children, child) : Nat), Rollback.incoming_append(parents, children, child)):
    {_ == 0n : Nat}
  %Equal.sym(Nat, Relation.incoming(parents, child), 0n,
    Rollback.valid_nodes_absent_incoming(parents, parents, child, valid,
      parent_excludes_child(parents, children, episode, child, before, fresh, present))):
    {(_ + Relation.incoming(children, child) : Nat) == 0n : Nat}
  empty

def appended_old_root_valid(+parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    +root: O.NodeAddress,
    before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    valid: {True{} == Relation.nodes_valid(children, children) : Bool},
    +present: {F.count_address(parents, root) == 1n : Nat},
    empty: {Relation.incoming(parents, root) == 0n : Nat}) ->
    {True{} == Relation.root_valid(Some{root}, List.append(&2, F.Node, parents, children)) : Bool}:
  +absent: {F.count_address(children, root) == 0n : Nat} = child_excludes_parent(parents, children, episode, root, before, fresh, present)
  +no_incoming: {Relation.incoming(children, root) == 0n : Nat} = Rollback.valid_nodes_absent_incoming(children, children, root, valid, absent)
  Rollback.and_both(Nat.is_eq(F.count_address(List.append(&2, F.Node, parents, children), root), 1n),
    Nat.is_eq(Relation.incoming(List.append(&2, F.Node, parents, children), root), 0n),
    %Equal.sym(Nat, F.count_address(List.append(&2, F.Node, parents, children), root),
      (F.count_address(parents, root) + F.count_address(children, root) : Nat), Rollback.count_append(parents, children, root)):
      {True{} == Nat.is_eq(_, 1n) : Bool}
    %Equal.sym(Nat, F.count_address(parents, root), 1n, present): {True{} == Nat.is_eq((_ + F.count_address(children, root) : Nat), 1n) : Bool}
    %Equal.sym(Nat, F.count_address(children, root), 0n, absent): {True{} == Nat.is_eq((1n + _ : Nat), 1n) : Bool}
    {==},
    %Equal.sym(Nat, Relation.incoming(List.append(&2, F.Node, parents, children), root),
      (Relation.incoming(parents, root) + Relation.incoming(children, root) : Nat), Rollback.incoming_append(parents, children, root)):
      {True{} == Nat.is_eq(_, 0n) : Bool}
    %Equal.sym(Nat, Relation.incoming(parents, root), 0n, empty): {True{} == Nat.is_eq((_ + Relation.incoming(children, root) : Nat), 0n) : Bool}
    %Equal.sym(Nat, Relation.incoming(children, root), 0n, no_incoming): {True{} == Nat.is_eq(_, 0n) : Bool}
    {==})

def appended_semantic_count(side: Bool, +parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    +query: O.NodeAddress,
    +before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    +fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    +counted: {F.count_address(Bool.pick(List<&2, F.Node>, side, parents, children), query) == 1n : Nat}) ->
    {F.count_address(List.append(&2, F.Node, parents, children), query) == 1n : Nat}:
  match side:
    case True{}:
      %Equal.sym(Nat, F.count_address(List.append(&2, F.Node, parents, children), query),
        (F.count_address(parents, query) + F.count_address(children, query) : Nat), Rollback.count_append(parents, children, query)):
        {_ == 1n : Nat}
      %Equal.sym(Nat, F.count_address(parents, query), 1n, counted): {(_ + F.count_address(children, query) : Nat) == 1n : Nat}
      %Equal.sym(Nat, F.count_address(children, query), 0n, child_excludes_parent(parents, children, episode, query, before, fresh, counted)):
        {(1n + _ : Nat) == 1n : Nat}
      {==}
    case False{}:
      %Equal.sym(Nat, F.count_address(List.append(&2, F.Node, parents, children), query),
        (F.count_address(parents, query) + F.count_address(children, query) : Nat), Rollback.count_append(parents, children, query)):
        {_ == 1n : Nat}
      %Equal.sym(Nat, F.count_address(parents, query), 0n, parent_excludes_child(parents, children, episode, query, before, fresh, counted)):
        {(_ + F.count_address(children, query) : Nat) == 1n : Nat}
      counted

def appended_semantic_incoming(side: Bool, +parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    +query: O.NodeAddress,
    before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    parent_valid: {True{} == Relation.nodes_valid(parents, parents) : Bool},
    child_valid: {True{} == Relation.nodes_valid(children, children) : Bool},
    counted: {F.count_address(Bool.pick(List<&2, F.Node>, side, parents, children), query) == 1n : Nat}) ->
    {Relation.incoming(List.append(&2, F.Node, parents, children), query)
      == Relation.incoming(Bool.pick(List<&2, F.Node>, side, parents, children), query) : Nat}:
  match side:
    case True{}:
      %Equal.sym(Nat, Relation.incoming(List.append(&2, F.Node, parents, children), query),
        (Relation.incoming(parents, query) + Relation.incoming(children, query) : Nat), Rollback.incoming_append(parents, children, query)):
        {_ == Relation.incoming(parents, query) : Nat}
      %Equal.sym(Nat, Relation.incoming(children, query), 0n,
        Rollback.valid_nodes_absent_incoming(children, children, query, child_valid,
          child_excludes_parent(parents, children, episode, query, before, fresh, counted))):
        {(Relation.incoming(parents, query) + _ : Nat) == Relation.incoming(parents, query) : Nat}
      Arithmetic.add_zero(Relation.incoming(parents, query))
    case False{}:
      %Equal.sym(Nat, Relation.incoming(List.append(&2, F.Node, parents, children), query),
        (Relation.incoming(parents, query) + Relation.incoming(children, query) : Nat), Rollback.incoming_append(parents, children, query)):
        {_ == Relation.incoming(children, query) : Nat}
      %Equal.sym(Nat, Relation.incoming(parents, query), 0n,
        Rollback.valid_nodes_absent_incoming(parents, parents, query, parent_valid,
          parent_excludes_child(parents, children, episode, query, before, fresh, counted))):
        {(_ + Relation.incoming(children, query) : Nat) == Relation.incoming(children, query) : Nat}
      {==}

def appended_semantic_references(items: List<&2, F.Reference>, +owner: O.NodeAddress, +side: Bool,
    +parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    +before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    +fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    +valid: {True{} == Relation.references_valid(items, owner, Bool.pick(List<&2, F.Node>, side, parents, children)) : Bool}) ->
    {True{} == Relation.references_valid(items, owner, List.append(&2, F.Node, parents, children)) : Bool}:
  match items:
    case []: {==}
    case F.Included{_, _} <> tail: appended_semantic_references(tail, owner, side, parents, children, episode, before, fresh, valid)
    case F.Omitted{_, _, _} <> tail: appended_semantic_references(tail, owner, side, parents, children, episode, before, fresh, valid)
    case F.Expanded{_, +child} <> +tail:
      +old: List<&2, F.Node> = Bool.pick(List<&2, F.Node>, side, parents, children)
      +all: List<&2, F.Node> = List.append(&2, F.Node, parents, children)
      +counted: {F.count_address(old, child) == 1n : Nat} =
        N.eq_of_is_eq(F.count_address(old, child), 1n,
          Equal.sym(Bool, True{}, Nat.is_eq(F.count_address(old, child), 1n),
            Rollback.and_left(Nat.is_eq(F.count_address(old, child), 1n),
              Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, old)), valid)))
      +rest: {True{} == Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, old)) : Bool} =
        Rollback.and_right(Nat.is_eq(F.count_address(old, child), 1n),
          Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, old)), valid)
      Rollback.and_both(Nat.is_eq(F.count_address(all, child), 1n),
        Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, all)),
        %Equal.sym(Nat, F.count_address(all, child), 1n, appended_semantic_count(side, parents, children, episode, child, before, fresh, counted)):
          {True{} == Nat.is_eq(_, 1n) : Bool}
        {==},
        Rollback.and_both(F.born_after(owner, child), Relation.references_valid(tail, owner, all),
          Rollback.and_left(F.born_after(owner, child), Relation.references_valid(tail, owner, old), rest),
          appended_semantic_references(tail, owner, side, parents, children, episode, before, fresh,
            Rollback.and_right(F.born_after(owner, child), Relation.references_valid(tail, owner, old), rest))))

def appended_semantic_nodes(items: List<&2, F.Node>, +side: Bool,
    +parents: List<&2, F.Node>, +children: List<&2, F.Node>, +episode: Nat,
    +before: {Relation.episodes_before(parents, episode) == True{} : Bool},
    +fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    +parent_valid: {True{} == Relation.nodes_valid(parents, parents) : Bool},
    +child_valid: {True{} == Relation.nodes_valid(children, children) : Bool},
    +valid: {True{} == Relation.nodes_valid(items, Bool.pick(List<&2, F.Node>, side, parents, children)) : Bool}) ->
    {True{} == Relation.nodes_valid(items, List.append(&2, F.Node, parents, children)) : Bool}:
  match items:
    case []: {==}
    case F.Node{+address, _, +references} <> +tail:
      +old: List<&2, F.Node> = Bool.pick(List<&2, F.Node>, side, parents, children)
      +all: List<&2, F.Node> = List.append(&2, F.Node, parents, children)
      +one: {True{} == Nat.is_eq(F.count_address(old, address), 1n) : Bool} =
        Rollback.and_left(Nat.is_eq(F.count_address(old, address), 1n),
          Bool.and(Nat.is_le(Relation.incoming(old, address), 1n),
            Bool.and(Relation.references_valid(references, address, old), Relation.nodes_valid(tail, old))), valid)
      +counted: {F.count_address(old, address) == 1n : Nat} =
        N.eq_of_is_eq(F.count_address(old, address), 1n, Equal.sym(Bool, True{}, Nat.is_eq(F.count_address(old, address), 1n), one))
      +rest: {True{} == Bool.and(Nat.is_le(Relation.incoming(old, address), 1n),
        Bool.and(Relation.references_valid(references, address, old), Relation.nodes_valid(tail, old))) : Bool} =
        Rollback.and_right(Nat.is_eq(F.count_address(old, address), 1n),
          Bool.and(Nat.is_le(Relation.incoming(old, address), 1n),
            Bool.and(Relation.references_valid(references, address, old), Relation.nodes_valid(tail, old))), valid)
      +last: {True{} == Bool.and(Relation.references_valid(references, address, old), Relation.nodes_valid(tail, old)) : Bool} =
        Rollback.and_right(Nat.is_le(Relation.incoming(old, address), 1n),
          Bool.and(Relation.references_valid(references, address, old), Relation.nodes_valid(tail, old)), rest)
      Rollback.and_both(Nat.is_eq(F.count_address(all, address), 1n),
        Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all))),
        %Equal.sym(Nat, F.count_address(all, address), 1n, appended_semantic_count(side, parents, children, episode, address, before, fresh, counted)):
          {True{} == Nat.is_eq(_, 1n) : Bool}
        {==},
        Rollback.and_both(Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)),
          %Equal.sym(Nat, Relation.incoming(all, address), Relation.incoming(old, address),
            appended_semantic_incoming(side, parents, children, episode, address, before, fresh, parent_valid, child_valid, counted)):
            {True{} == Nat.is_le(_, 1n) : Bool}
          Rollback.and_left(Nat.is_le(Relation.incoming(old, address), 1n),
            Bool.and(Relation.references_valid(references, address, old), Relation.nodes_valid(tail, old)), rest),
          Rollback.and_both(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all),
            appended_semantic_references(references, address, side, parents, children, episode, before, fresh,
              Rollback.and_left(Relation.references_valid(references, address, old), Relation.nodes_valid(tail, old), last)),
            appended_semantic_nodes(tail, side, parents, children, episode, before, fresh, parent_valid, child_valid,
              Rollback.and_right(Relation.references_valid(references, address, old), Relation.nodes_valid(tail, old), last)))))

def attachment_changed_nodes(items: List<&2, F.Node>, +all: List<&2, F.Node>,
    +owner: O.NodeAddress, +index: Nat, +known: Bool, +child: O.NodeAddress,
    +children: List<&2, F.Node>, +entries: List<&2, F.AddressEntry>, +symbol: String, +identity: String,
    +selected: {F.count_address(all, owner) == 1n : Nat},
    +fresh: {Relation.incoming(all, child) == 0n : Nat},
    +reference_valid: {True{} == F.reference_valid(X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity), owner, all) : Bool},
    +valid: {True{} == Relation.nodes_valid(items, all) : Bool}) ->
    {True{} == Relation.nodes_valid(Rollback.result_nodes(F.replace_nodes(items, owner, index,
      X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity))),
      Rollback.result_nodes(F.replace_nodes(all, owner, index,
        X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity)))) : Bool}:
  match items:
    case []: {==}
    case F.Node{+address, +artifact, +references} <> +tail:
      +reference: F.Reference = X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity)
      +next: List<&2, F.Node> = Rollback.result_nodes(F.replace_nodes(all, owner, index, reference))
      +exact: {Rollback.node_addresses(next) == Rollback.node_addresses(all) : List<&2, O.NodeAddress>} =
        Rollback.replace_nodes_addresses(all, owner, index, reference)
      +rest: {True{} == Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
        Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all))) : Bool} =
        Rollback.and_right(Nat.is_eq(F.count_address(all, address), 1n),
          Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
            Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all))), valid)
      +last: {True{} == Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)) : Bool} =
        Rollback.and_right(Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)), rest)
      Rollback.replacement_node_conditions(F.same_address(owner, address), F.Node{address, artifact, references},
        F.replace_nodes(tail, owner, index, reference), owner, index, reference, next, {==},
        Rollback.replacement_reference_valid(reference, owner, all, next, exact, reference_valid),
        Rollback.count_valid(F.count_address(all, address), F.count_address(next, address),
          Rollback.replace_nodes_occurrences(all, owner, index, reference, address),
          Rollback.and_left(Nat.is_eq(F.count_address(all, address), 1n),
            Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
              Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all))), valid)),
        Equal.sym(Bool, Nat.is_le(Relation.incoming(next, address), 1n), True{},
          attachment_incoming_valid(all, owner, index, known, child, children, entries, symbol, identity, address, selected, fresh,
            Equal.sym(Bool, True{}, Nat.is_le(Relation.incoming(all, address), 1n),
              Rollback.and_left(Nat.is_le(Relation.incoming(all, address), 1n),
                Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)), rest)))),
        Rollback.references_transport(references, address, all, next, exact,
          Rollback.and_left(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all), last)),
        attachment_changed_nodes(tail, all, owner, index, known, child, children, entries, symbol, identity, selected, fresh, reference_valid,
          Rollback.and_right(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all), last)))

# Complete semantic forest validity after the actual parent replacement.
# The only hypotheses are the two original forests, freshness, and the
# selected owner's occurrence; all union/replacement guards are derived here.
def attachment_changed_frame(+parents: List<&2, F.Node>, +children: List<&2, F.Node>,
    +root: O.NodeAddress, +child: O.NodeAddress, +entries: List<&2, F.AddressEntry>, +episode: Nat,
    +owner: O.NodeAddress, +index: Nat, +known: Bool, +symbol: String, +identity: String,
    +parent_frame: {Relation.frame_forest(F.Forest{Some{root}, parents}, episode) == True{} : Bool},
    +child_frame: {Relation.frame_forest(F.Forest{Some{child}, children}, (episode + 1n : Nat)) == True{} : Bool},
    +fresh: {Ready.episode_nodes(children, episode) == True{} : Bool},
    +owner_present: {F.count_address(parents, owner) == 1n : Nat}) ->
    {True{} == Relation.frame_forest(F.Forest{Some{root}, Rollback.result_nodes(F.replace_nodes(
      List.append(&2, F.Node, parents, children), owner, index,
      X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity)))}, (episode + 1n : Nat)) : Bool}:
  +all: List<&2, F.Node> = List.append(&2, F.Node, parents, children)
  +reference: F.Reference = X.attachment_reference(known, F.Created{child, children, entries}, symbol, identity)
  +changed: List<&2, F.Node> = Rollback.result_nodes(F.replace_nodes(all, owner, index, reference))
  +parent_retained: {Relation.retained(F.Forest{Some{root}, parents}) == True{} : Bool} =
    B.eq_true_of_and_left(Relation.retained(F.Forest{Some{root}, parents}), Relation.episodes_before(parents, episode), parent_frame)
  +child_retained: {Relation.retained(F.Forest{Some{child}, children}) == True{} : Bool} =
    B.eq_true_of_and_left(Relation.retained(F.Forest{Some{child}, children}), Relation.episodes_before(children, (episode + 1n : Nat)), child_frame)
  +before: {Relation.episodes_before(parents, episode) == True{} : Bool} =
    B.eq_true_of_and_right(Relation.retained(F.Forest{Some{root}, parents}), Relation.episodes_before(parents, episode), parent_frame)
  +parent_valid: {True{} == Relation.nodes_valid(parents, parents) : Bool} =
    Equal.sym(Bool, Relation.nodes_valid(parents, parents), True{},
      B.eq_true_of_and_right(Relation.root_valid(Some{root}, parents), Relation.nodes_valid(parents, parents), parent_retained))
  +child_valid: {True{} == Relation.nodes_valid(children, children) : Bool} =
    Equal.sym(Bool, Relation.nodes_valid(children, children), True{},
      B.eq_true_of_and_right(Relation.root_valid(Some{child}, children), Relation.nodes_valid(children, children), child_retained))
  +parent_root: {Relation.root_valid(Some{root}, parents) == True{} : Bool} =
    B.eq_true_of_and_left(Relation.root_valid(Some{root}, parents), Relation.nodes_valid(parents, parents), parent_retained)
  +child_root: {Relation.root_valid(Some{child}, children) == True{} : Bool} =
    B.eq_true_of_and_left(Relation.root_valid(Some{child}, children), Relation.nodes_valid(children, children), child_retained)
  +root_count: {F.count_address(parents, root) == 1n : Nat} = N.eq_of_is_eq(F.count_address(parents, root), 1n,
    B.eq_true_of_and_left(Nat.is_eq(F.count_address(parents, root), 1n), Nat.is_eq(Relation.incoming(parents, root), 0n), parent_root))
  +child_count: {F.count_address(children, child) == 1n : Nat} = N.eq_of_is_eq(F.count_address(children, child), 1n,
    B.eq_true_of_and_left(Nat.is_eq(F.count_address(children, child), 1n), Nat.is_eq(Relation.incoming(children, child), 0n), child_root))
  +root_empty: {Relation.incoming(parents, root) == 0n : Nat} = N.eq_of_is_eq(Relation.incoming(parents, root), 0n,
    B.eq_true_of_and_right(Nat.is_eq(F.count_address(parents, root), 1n), Nat.is_eq(Relation.incoming(parents, root), 0n), parent_root))
  +child_empty: {Relation.incoming(children, child) == 0n : Nat} = N.eq_of_is_eq(Relation.incoming(children, child), 0n,
    B.eq_true_of_and_right(Nat.is_eq(F.count_address(children, child), 1n), Nat.is_eq(Relation.incoming(children, child), 0n), child_root))
  Rollback.and_both(Relation.retained(F.Forest{Some{root}, changed}), Relation.episodes_before(changed, (episode + 1n : Nat)),
    Rollback.and_both(Relation.root_valid(Some{root}, changed), Relation.nodes_valid(changed, changed),
      attachment_old_root_valid(parents, children, all, entries, episode, root, child, owner, index, known, symbol, identity,
        before, fresh, root_count, child_count,
        appended_old_root_valid(parents, children, episode, root, before, fresh, child_valid, root_count, root_empty)),
      attachment_changed_nodes(all, all, owner, index, known, child, children, entries, symbol, identity,
        appended_semantic_count(True{}, parents, children, episode, owner, before, fresh, owner_present),
        appended_fresh_incoming(parents, children, episode, child, before, fresh, parent_valid, child_count, child_empty),
        Equal.sym(Bool, F.reference_valid(reference, owner, all), True{},
          attachment_reference_valid(known, owner, child, children, entries, all, symbol, identity,
            appended_semantic_count(False{}, parents, children, episode, child, before, fresh, child_count),
            fresh_attachment_born(parents, children, episode, owner, child, before, fresh, owner_present, child_count))),
        Rollback.nodes_valid_append(parents, children, all,
          appended_semantic_nodes(parents, True{}, parents, children, episode, before, fresh, parent_valid, child_valid, parent_valid),
          appended_semantic_nodes(children, False{}, parents, children, episode, before, fresh, parent_valid, child_valid, child_valid)))),
    %Equal.sym(Bool, Relation.episodes_before(changed, (episode + 1n : Nat)), Relation.episodes_before(all, (episode + 1n : Nat)),
      Rollback.replace_nodes_episodes(all, owner, index, reference, (episode + 1n : Nat))):
      {True{} == _ : Bool}
    Rollback.episodes_before_append(parents, children, (episode + 1n : Nat),
      Equal.sym(Bool, Relation.episodes_before(parents, (episode + 1n : Nat)), True{},
        episodes_before_raise(parents, episode, (episode + 1n : Nat), before,
          %Arithmetic.add_comm(1n, episode): {Nat.is_le(episode, _) == True{} : Bool}
          N.le_succ(episode))),
      Equal.sym(Bool, Relation.episodes_before(children, (episode + 1n : Nat)), True{},
        B.eq_true_of_and_right(Relation.retained(F.Forest{Some{child}, children}), Relation.episodes_before(children, (episode + 1n : Nat)), child_frame))))

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
