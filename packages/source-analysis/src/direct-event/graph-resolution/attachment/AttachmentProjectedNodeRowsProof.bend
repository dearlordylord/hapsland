import Base
import ./AttachmentProjectedNodeModel.bend as Model
import ./AttachmentProjectionContentsProof.bend as C
import ./AttachmentNodeMaterializationProof.bend as Node
import ./AttachmentProjectedArtifactValidityProof.bend as Artifact
import ./AttachmentForestLookupProof.bend as Lookup
import ./AttachmentNaturalArithmeticFacts.bend as N
import ./AttachmentCatalogValidation.bend as ActualFrame
import ./RetainedForestProjection.bend as P
import ./ForestRelation.bend as Relation
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ../traversal/INTERPRETER_NAT_FACTS.bend as NatFacts
import ../traversal/GRAPH_LIST_FACTS.bend as Lists
import ../traversal/core.bend as Local
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../SourceValidationSpecification.bend as V
import ../Types.bend as T

# Shared proof-only row owner; extraction below proves these exact predicates.
def row(id: Nat, handle: Nat, tail: List<&2, Local.PlannedNode>, slots: List<&2, Local.ReferenceSlot>,
    artifacts: List<&2, T.ArtifactEntry>, addresses: List<&2, F.AddressEntry>, full: List<&2, F.Node>) -> Type:
  Model.row(id, handle, tail, slots, artifacts, addresses, full)

def rows(nodes: List<&2, Local.PlannedNode>, slots: List<&2, Local.ReferenceSlot>, artifacts: List<&2, T.ArtifactEntry>,
    addresses: List<&2, F.AddressEntry>, full: List<&2, F.Node>) -> Type:
  Model.rows(nodes, slots, artifacts, addresses, full)

def unique_rows(nodes: List<&2, Local.PlannedNode>, +all: List<&2, Local.PlannedNode>) -> Type:
  match nodes:
    case []: Unit
    case Local.PlannedNode{id, _} <> tail:
      {P.node_count(all, id) == 1n : Nat} & unique_rows(tail, all)

def aligned_uniques(nodes: List<&2, Local.PlannedNode>, addresses: List<&2, F.AddressEntry>,
    +all: List<&2, Local.PlannedNode>, +all_addresses: List<&2, F.AddressEntry>,
    +valid: {P.aligned(nodes, addresses, all, all_addresses) == True{} : Bool}) -> unique_rows(nodes, all):
  match nodes addresses:
    case Nil{} Nil{}: Unit{}
    case Con{Local.PlannedNode{+id, _}, +tail} Con{F.AddressEntry{other, +address}, +rest}:
      +after_id: {Bool.and(Nat.is_eq(P.node_count(all, id), 1n), Bool.and(Nat.is_eq(P.address_count(all_addresses, address), 1n), P.aligned(tail, rest, all, all_addresses))) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(all, id), 1n), Bool.and(Nat.is_eq(P.address_count(all_addresses, address), 1n), P.aligned(tail, rest, all, all_addresses))), valid)
      Tuple{NatFacts.eq_of_is_eq(P.node_count(all, id), 1n,
        B.eq_true_of_and_left(Nat.is_eq(P.node_count(all, id), 1n), Bool.and(Nat.is_eq(P.address_count(all_addresses, address), 1n), P.aligned(tail, rest, all, all_addresses)), after_id)),
        aligned_uniques(tail, rest, all, all_addresses,
          B.eq_true_of_and_right(Nat.is_eq(P.address_count(all_addresses, address), 1n), P.aligned(tail, rest, all, all_addresses),
            B.eq_true_of_and_right(Nat.is_eq(P.node_count(all, id), 1n), Bool.and(Nat.is_eq(P.address_count(all_addresses, address), 1n), P.aligned(tail, rest, all, all_addresses)), after_id)))}
    case Nil{} Con{_, _}: Empty.absurd(unique_rows(nodes, all), B.internal_false_ne_true(valid))
    case Con{_, _} Nil{}: Empty.absurd(unique_rows(nodes, all), B.internal_false_ne_true(valid))

def count_append(prefix: List<&2, Local.PlannedNode>, +tail: List<&2, Local.PlannedNode>, +id: Nat) ->
    {P.node_count(List.append(&2, Local.PlannedNode, prefix, tail), id) == Nat.add(P.node_count(prefix, id), P.node_count(tail, id)) : Nat}:
  match prefix:
    case []: {==}
    case Local.PlannedNode{+other, _} <> +rest:
      %Equal.sym(Nat, P.node_count(List.append(&2, Local.PlannedNode, rest, tail), id), Nat.add(P.node_count(rest, id), P.node_count(tail, id)), count_append(rest, tail, id)):
        {Nat.add(Bool.pick(Nat, Nat.is_eq(id, other), 1n, 0n), _) == Nat.add(Nat.add(Bool.pick(Nat, Nat.is_eq(id, other), 1n, 0n), P.node_count(rest, id)), P.node_count(tail, id)) : Nat}
      Equal.sym(Nat, Nat.add(Nat.add(Bool.pick(Nat, Nat.is_eq(id, other), 1n, 0n), P.node_count(rest, id)), P.node_count(tail, id)),
        Nat.add(Bool.pick(Nat, Nat.is_eq(id, other), 1n, 0n), Nat.add(P.node_count(rest, id), P.node_count(tail, id))),
        N.add_assoc(Bool.pick(Nat, Nat.is_eq(id, other), 1n, 0n), P.node_count(rest, id), P.node_count(tail, id)))

def tail_absent(+prefix: List<&2, Local.PlannedNode>, +id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    unique: {P.node_count(List.append(&2, Local.PlannedNode, prefix, Local.PlannedNode{id, handle} <> tail), id) == 1n : Nat}) ->
    {P.node_count(tail, id) == 0n : Nat}:
  count: {Nat.add(P.node_count(prefix, id), Nat.add(Bool.pick(Nat, Nat.is_eq(id, id), 1n, 0n), P.node_count(tail, id))) == 1n : Nat} =
    %count_append(prefix, Local.PlannedNode{id, handle} <> tail, id): {_ == 1n : Nat}
    unique
  one: {Nat.add(P.node_count(prefix, id), 1n+P.node_count(tail, id)) == 1n : Nat} =
    %N.is_eq_refl(id): {Nat.add(P.node_count(prefix, id), Nat.add(Bool.pick(Nat, _, 1n, 0n), P.node_count(tail, id))) == 1n : Nat}
    count
  successor: {1n+Nat.add(P.node_count(prefix, id), P.node_count(tail, id)) == 1n : Nat} =
    %N.add_succ(P.node_count(prefix, id), P.node_count(tail, id)): {_ == 1n : Nat}
    one
  zero: {Nat.add(P.node_count(prefix, id), P.node_count(tail, id)) == 0n : Nat} =
    N.succ_inj(Nat.add(P.node_count(prefix, id), P.node_count(tail, id)), 0n, successor)
  Lookup.sum_zero_left(P.node_count(tail, id), P.node_count(prefix, id),
    %N.add_comm(P.node_count(prefix, id), P.node_count(tail, id)): {_ == 0n : Nat}
    zero)

def move_cursor(-A: Data, +all: List<&2, A>, +prefix: List<&2, A>, +head: A, +tail: List<&2, A>,
    current: {all == List.append(&2, A, prefix, head <> tail) : List<&2, A>}) ->
    {all == List.append(&2, A, List.append(&2, A, prefix, [head]), tail) : List<&2, A>}:
  Equal.trans(List<&2, A>, all, List.append(&2, A, prefix, head <> tail), List.append(&2, A, List.append(&2, A, prefix, [head]), tail), current,
    Equal.sym(List<&2, A>, List.append(&2, A, List.append(&2, A, prefix, [head]), tail), List.append(&2, A, prefix, head <> tail),
      Lists.append_assoc(&2, A, prefix, [head], tail)))

def node_address(node: F.Node) -> O.NodeAddress:
  match node:
    case F.Node{address, _, _}: address

def full_head(+prefix: List<&2, F.Node>, +head: F.Node, +rest: List<&2, F.Node>, +full: List<&2, F.Node>,
    +current: {full == List.append(&2, F.Node, prefix, head <> rest) : List<&2, F.Node>},
    unique: {F.count_address(full, node_address(head)) == 1n : Nat}) ->
    {F.node_at(full, node_address(head)) == Some{head} : Maybe<&2, F.Node>}:
  match head:
    case F.Node{+address, +artifact, +references}:
      %Equal.sym(List<&2, F.Node>, full, List.append(&2, F.Node, prefix, F.Node{address, artifact, references} <> rest), current): {F.node_at(_, address) == Some{F.Node{address, artifact, references}} : Maybe<&2, F.Node>}
      Lookup.exact_node(prefix, address, artifact, references, rest,
        %current:
          {F.count_address(_, address) == 1n : Nat}
        unique)

def head_unique(+head: F.Node, +rest: List<&2, F.Node>, +full: List<&2, F.Node>,
    valid: {Relation.nodes_valid(head <> rest, full) == True{} : Bool}) ->
    {F.count_address(full, node_address(head)) == 1n : Nat}:
  match head:
    case F.Node{+address, _, +refs}:
      NatFacts.eq_of_is_eq(F.count_address(full, address), 1n,
        B.eq_true_of_and_left(Nat.is_eq(F.count_address(full, address), 1n),
          Bool.and(Nat.is_le(Relation.incoming(full, address), 1n), Bool.and(Relation.references_valid(refs, address, full), Relation.nodes_valid(rest, full))), valid))

def tail_valid(+head: F.Node, +rest: List<&2, F.Node>, +full: List<&2, F.Node>,
    valid: {Relation.nodes_valid(head <> rest, full) == True{} : Bool}) ->
    {Relation.nodes_valid(rest, full) == True{} : Bool}:
  match head:
    case F.Node{+address, _, +refs}:
      B.eq_true_of_and_right(Relation.references_valid(refs, address, full), Relation.nodes_valid(rest, full),
        B.eq_true_of_and_right(Nat.is_le(Relation.incoming(full, address), 1n), Bool.and(Relation.references_valid(refs, address, full), Relation.nodes_valid(rest, full)),
          B.eq_true_of_and_right(Nat.is_eq(F.count_address(full, address), 1n),
            Bool.and(Nat.is_le(Relation.incoming(full, address), 1n), Bool.and(Relation.references_valid(refs, address, full), Relation.nodes_valid(rest, full))), valid)))

def finish_head(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +full: List<&2, F.Node>, +head: F.Node,
    contents: Exists(O.NodeAddress, birth => Exists(T.Artifact, value => Exists(List<&2, F.Reference>, refs =>
      {F.address_at(addresses, id) == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {F.artifact_at(artifacts, handle) == Some{value} : Maybe<&2, T.Artifact>} &
      {P.references(P.owner_slots(slots, id), addresses) == Some{refs} : Maybe<&2, List<&2, F.Reference>>} &
      {Some{F.Node{birth, value, refs}} == Some{head} : Maybe<&2, F.Node>}))),
    present: {F.node_at(full, node_address(head)) == Some{head} : Maybe<&2, F.Node>},
    catalog_valid: {ActualFrame.catalog_valid(artifacts) == True{} : Bool},
    absent: {P.node_count(tail, id) == 0n : Nat},
    indexed: {P.indexed(P.owner_slots(slots, id), 0n, tail) == True{} : Bool}) ->
    row(id, handle, tail, slots, artifacts, addresses, full):
  match contents:
    case (+birth, (+value, (+refs, (address, (+artifact, (references, same)))))):
      equal: {F.Node{birth, value, refs} == head : F.Node} =
        Equal.cong(Maybe<&2, F.Node>, F.Node, item => Artifact.value_of(F.Node, head, item), Some{F.Node{birth, value, refs}}, Some{head}, same)
      Tuple{birth, Tuple{value, Tuple{refs, Tuple{address, Tuple{artifact, Tuple{references, Tuple{
        %Equal.sym(F.Node, F.Node{birth, value, refs}, head, equal): {F.node_at(full, node_address(_)) == Some{_} : Maybe<&2, F.Node>}
        present,
        Tuple{Artifact.lookup_valid(artifacts, handle, value, catalog_valid, artifact), Tuple{absent, indexed}}}}}}}}}

def head_pack(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +prefix: List<&2, F.Node>, +retained: List<&2, F.Node>, +full: List<&2, F.Node>,
    contents: Exists(F.Node, head => Exists(List<&2, F.Node>, rest =>
      {P.projected_node(F.address_at(addresses, id), F.artifact_at(artifacts, handle), P.references(P.owner_slots(slots, id), addresses)) == Some{head} : Maybe<&2, F.Node>} &
      {P.nodes(tail, slots, artifacts, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} &
      {Some{head <> rest} == Some{retained} : Maybe<&2, List<&2, F.Node>>})),
    current: {full == List.append(&2, F.Node, prefix, retained) : List<&2, F.Node>},
    valid: {Relation.nodes_valid(retained, full) == True{} : Bool},
    catalog_valid: {ActualFrame.catalog_valid(artifacts) == True{} : Bool},
    absent: {P.node_count(tail, id) == 0n : Nat},
    indexed: {P.indexed(P.owner_slots(slots, id), 0n, tail) == True{} : Bool}) ->
    Exists(F.Node, head => Exists(List<&2, F.Node>, rest =>
      row(id, handle, tail, slots, artifacts, addresses, full) &
      {P.nodes(tail, slots, artifacts, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} &
      {full == List.append(&2, F.Node, prefix, head <> rest) : List<&2, F.Node>} &
      {Relation.nodes_valid(rest, full) == True{} : Bool})):
  match contents:
    case (+head, (+rest, (head_present, (rest_present, same)))):
      +equal: {head <> rest == retained : List<&2, F.Node>} = Equal.cong(Maybe<&2, List<&2, F.Node>>, List<&2, F.Node>,
        items => Artifact.value_of(List<&2, F.Node>, retained, items), Some{head <> rest}, Some{retained}, same)
      +cursor: {full == List.append(&2, F.Node, prefix, head <> rest) : List<&2, F.Node>} =
        %Equal.sym(List<&2, F.Node>, head <> rest, retained, equal): {full == List.append(&2, F.Node, prefix, _) : List<&2, F.Node>}
        current
      +head_valid: {Relation.nodes_valid(head <> rest, full) == True{} : Bool} =
        %Equal.sym(List<&2, F.Node>, head <> rest, retained, equal): {Relation.nodes_valid(_, full) == True{} : Bool}
        valid
      Tuple{head, Tuple{rest, Tuple{
        finish_head(id, handle, tail, slots, artifacts, addresses, full, head,
          C.node_contents(F.address_at(addresses, id), F.artifact_at(artifacts, handle), P.references(P.owner_slots(slots, id), addresses), head, head_present),
          full_head(prefix, head, rest, full, cursor, head_unique(head, rest, full, head_valid)), catalog_valid, absent, indexed),
        Tuple{rest_present, Tuple{cursor, tail_valid(head, rest, full, head_valid)}}}}}

def finish_rows(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +prefix: List<&2, F.Node>, +full: List<&2, F.Node>,
    pack: Exists(F.Node, head => Exists(List<&2, F.Node>, rest =>
      row(id, handle, tail, slots, artifacts, addresses, full) &
      {P.nodes(tail, slots, artifacts, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} &
      {full == List.append(&2, F.Node, prefix, head <> rest) : List<&2, F.Node>} &
      {Relation.nodes_valid(rest, full) == True{} : Bool})),
    recursive: @+head: F.Node -> @+rest: List<&2, F.Node> ->
      {P.nodes(tail, slots, artifacts, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} ->
      {full == List.append(&2, F.Node, prefix, head <> rest) : List<&2, F.Node>} ->
      {Relation.nodes_valid(rest, full) == True{} : Bool} -> rows(tail, slots, artifacts, addresses, full)) ->
    rows(Local.PlannedNode{id, handle} <> tail, slots, artifacts, addresses, full):
  match pack:
    case (head, (rest, (rendered, (present, (current, valid))))):
      Tuple{rendered, recursive(head)(rest)(present)(current)(valid)}

def extract_step(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +all: List<&2, Local.PlannedNode>, +source_prefix: List<&2, Local.PlannedNode>,
    +full: List<&2, F.Node>, +prefix: List<&2, F.Node>, +retained: List<&2, F.Node>,
    unique: unique_rows(Local.PlannedNode{id, handle} <> tail, all),
    source_current: {all == List.append(&2, Local.PlannedNode, source_prefix, Local.PlannedNode{id, handle} <> tail) : List<&2, Local.PlannedNode>},
    current: {full == List.append(&2, F.Node, prefix, retained) : List<&2, F.Node>},
    success: {P.nodes(Local.PlannedNode{id, handle} <> tail, slots, artifacts, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>},
    valid: {Relation.nodes_valid(retained, full) == True{} : Bool},
    +forward: {P.forward_nodes(Local.PlannedNode{id, handle} <> tail, slots) == True{} : Bool},
    catalog_valid: {ActualFrame.catalog_valid(artifacts) == True{} : Bool},
    recursive: unique_rows(tail, all) -> {P.forward_nodes(tail, slots) == True{} : Bool} ->
      @+head: F.Node -> @+rest: List<&2, F.Node> ->
      {P.nodes(tail, slots, artifacts, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} ->
      {full == List.append(&2, F.Node, prefix, head <> rest) : List<&2, F.Node>} ->
      {Relation.nodes_valid(rest, full) == True{} : Bool} -> rows(tail, slots, artifacts, addresses, full)) ->
    rows(Local.PlannedNode{id, handle} <> tail, slots, artifacts, addresses, full):
  match unique:
    case (one, rest_unique):
      finish_rows(id, handle, tail, slots, artifacts, addresses, prefix, full,
        head_pack(id, handle, tail, slots, artifacts, addresses, prefix, retained, full,
          C.prefix_contents(P.projected_node(F.address_at(addresses, id), F.artifact_at(artifacts, handle), P.references(P.owner_slots(slots, id), addresses)),
            P.nodes(tail, slots, artifacts, addresses), retained, success), current, valid, catalog_valid,
          tail_absent(source_prefix, id, handle, tail,
            %source_current: {P.node_count(_, id) == 1n : Nat}
            one),
          B.eq_true_of_and_left(P.indexed(P.owner_slots(slots, id), 0n, tail), P.forward_nodes(tail, slots), forward)),
        recursive(rest_unique)(B.eq_true_of_and_right(P.indexed(P.owner_slots(slots, id), 0n, tail), P.forward_nodes(tail, slots), forward)))

def extract_rows(nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +all: List<&2, Local.PlannedNode>, +source_prefix: List<&2, Local.PlannedNode>,
    +full: List<&2, F.Node>, +prefix: List<&2, F.Node>, +retained: List<&2, F.Node>,
    unique: unique_rows(nodes, all),
    +source_current: {all == List.append(&2, Local.PlannedNode, source_prefix, nodes) : List<&2, Local.PlannedNode>},
    current: {full == List.append(&2, F.Node, prefix, retained) : List<&2, F.Node>},
    success: {P.nodes(nodes, slots, artifacts, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>},
    valid: {Relation.nodes_valid(retained, full) == True{} : Bool},
    forward: {P.forward_nodes(nodes, slots) == True{} : Bool},
    +catalog_valid: {ActualFrame.catalog_valid(artifacts) == True{} : Bool}) ->
    rows(nodes, slots, artifacts, addresses, full):
  match nodes:
    case []: Unit{}
    case Local.PlannedNode{+id, +handle} <> +tail:
      extract_step(id, handle, tail, slots, artifacts, addresses, all, source_prefix, full, prefix, retained,
        unique, source_current, current, success, valid, forward, catalog_valid,
        tail_unique => tail_forward => head => rest => present => cursor => tail_valid =>
          extract_rows(tail, slots, artifacts, addresses, all, List.append(&2, Local.PlannedNode, source_prefix, [Local.PlannedNode{id, handle}]),
            full, List.append(&2, F.Node, prefix, [head]), rest, tail_unique,
            move_cursor(Local.PlannedNode, all, source_prefix, Local.PlannedNode{id, handle}, tail, source_current),
            move_cursor(F.Node, full, prefix, head, rest, cursor), present, tail_valid, tail_forward, catalog_valid))

def forest_nodes(forest: F.Forest) -> List<&2, F.Node>:
  Node.nodes_of(forest)

def frame_nodes_valid(+forest: F.Forest, +next: Nat, valid: {Relation.frame_forest(forest, next) == True{} : Bool}) ->
    {Relation.nodes_valid(forest_nodes(forest), forest_nodes(forest)) == True{} : Bool}:
  match forest:
    case F.Forest{+root, +nodes}:
      B.eq_true_of_and_right(Relation.root_valid(root, nodes), Relation.nodes_valid(nodes, nodes),
        B.eq_true_of_and_left(Relation.retained(F.Forest{root, nodes}), Relation.episodes_before(nodes, next), valid))

def forest_row_pack(+root: Nat, +nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +forest: F.Forest, +next: Nat,
    contents: Exists(O.NodeAddress, birth => Exists(List<&2, F.Node>, retained =>
      {F.address_at(addresses, root) == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {P.nodes(nodes, slots, artifacts, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>} &
      {Some{F.Forest{Some{birth}, retained}} == Some{forest} : Maybe<&2, F.Forest>})),
    unique: unique_rows(nodes, nodes),
    forward: {P.forward_nodes(nodes, slots) == True{} : Bool},
    catalog_valid: {ActualFrame.catalog_valid(artifacts) == True{} : Bool},
    frame_valid: {Relation.frame_forest(forest, next) == True{} : Bool}) ->
    rows(nodes, slots, artifacts, addresses, forest_nodes(forest)):
  match contents:
    case (+birth, (+retained, (_, (present, same)))):
      +equal: {F.Forest{Some{birth}, retained} == forest : F.Forest} =
        Equal.cong(Maybe<&2, F.Forest>, F.Forest, value => Artifact.value_of(F.Forest, forest, value), Some{F.Forest{Some{birth}, retained}}, Some{forest}, same)
      %equal: rows(nodes, slots, artifacts, addresses, forest_nodes(_))
      extract_rows(nodes, slots, artifacts, addresses, nodes, [], retained, [], retained, unique, {==}, {==}, present,
        frame_nodes_valid(F.Forest{Some{birth}, retained}, next,
          %Equal.sym(F.Forest, F.Forest{Some{birth}, retained}, forest, equal): {Relation.frame_forest(_, next) == True{} : Bool}
          frame_valid), forward, catalog_valid)

def project_row_pack(+root: Nat, +nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +forest: F.Forest, +next: Nat,
    contents: {Bool.and(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts),
      Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots)))) == True{} : Bool} &
      {P.forest(F.address_at(addresses, root), P.nodes(nodes, slots, artifacts, addresses)) == Some{forest} : Maybe<&2, F.Forest>},
    catalog_valid: {ActualFrame.catalog_valid(artifacts) == True{} : Bool},
    frame_valid: {Relation.frame_forest(forest, next) == True{} : Bool}) ->
    rows(nodes, slots, artifacts, addresses, forest_nodes(forest)):
  match contents:
    case (+guards, present):
      forest_row_pack(root, nodes, slots, artifacts, addresses, forest, next,
        C.forest_contents(F.address_at(addresses, root), P.nodes(nodes, slots, artifacts, addresses), forest, present),
        aligned_uniques(nodes, addresses, nodes, addresses,
          B.eq_true_of_and_left(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts), Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots))), guards)),
        B.eq_true_of_and_right(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots),
          B.eq_true_of_and_right(P.catalog_unique(artifacts, artifacts), Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots)),
            B.eq_true_of_and_right(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts), Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots))), guards))),
        catalog_valid, frame_valid)

def project_rows(+root: Nat, +nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +forest: F.Forest, +next: Nat,
    projected: {P.project(root, nodes, slots, artifacts, addresses) == Some{forest} : Maybe<&2, F.Forest>},
    catalog_valid: {ActualFrame.catalog_valid(artifacts) == True{} : Bool},
    frame_valid: {Relation.frame_forest(forest, next) == True{} : Bool}) ->
    rows(nodes, slots, artifacts, addresses, forest_nodes(forest)):
  project_row_pack(root, nodes, slots, artifacts, addresses, forest, next,
    C.project_contents(root, nodes, slots, artifacts, addresses, forest, projected), catalog_valid, frame_valid)

def main() -> Unit:
  Unit{}
