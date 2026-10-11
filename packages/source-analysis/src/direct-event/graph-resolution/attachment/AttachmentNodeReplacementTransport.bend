import Base
import ./AttachmentNaturalArithmeticFacts.bend as Arithmetic
import ./AttachmentForestLookupProof.bend as Lookup
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

def absent_target(+items: List<&2, F.AddressEntry>, +query: Nat, +target: O.NodeAddress,
    zero: {P.address_count(items, target) == 0n : Nat},
    present: {F.address_at(items, query) == Some{target} : Maybe<&2, O.NodeAddress>}) -> Empty:
  B.internal_false_ne_true(Equal.trans(Bool, False{}, F.same_address(target, target), True{},
    Equal.sym(Bool, F.same_address(target, target), False{}, address_lookup_zero(items, query, target, target, zero, present)),
    Lookup.address_refl(target)))

def address_tail_zero(+target: O.NodeAddress, +birth: O.NodeAddress, +tail: List<&2, F.AddressEntry>,
    same: {F.same_address(target, birth) == True{} : Bool},
    unique: {Nat.add(Bool.pick(Nat, F.same_address(target, birth), 1n, 0n), P.address_count(tail, target)) == 1n : Nat}) ->
    {P.address_count(tail, target) == 0n : Nat}:
  Arithmetic.succ_inj(P.address_count(tail, target), 0n,
    %same: {Nat.add(Bool.pick(Nat, _, 1n, 0n), P.address_count(tail, target)) == 1n : Nat}
    unique)

def address_keys_step(+id: Nat, +birth: O.NodeAddress, +tail: List<&2, F.AddressEntry>,
    +owner: Nat, +query: Nat, +target: O.NodeAddress, +found: O.NodeAddress,
    +unique: {P.address_count(F.AddressEntry{id, birth} <> tail, target) == 1n : Nat},
    located: {F.address_at(F.AddressEntry{id, birth} <> tail, owner) == Some{target} : Maybe<&2, O.NodeAddress>},
    present: {F.address_at(F.AddressEntry{id, birth} <> tail, query) == Some{found} : Maybe<&2, O.NodeAddress>},
    recursive: {P.address_count(tail, target) == 1n : Nat} ->
      {F.address_at(tail, owner) == Some{target} : Maybe<&2, O.NodeAddress>} ->
      {F.address_at(tail, query) == Some{found} : Maybe<&2, O.NodeAddress>} ->
      {F.same_address(target, found) == Nat.is_eq(owner, query) : Bool},
    left: Bool, +left_branch: {Nat.is_eq(id, owner) == left : Bool},
    right: Bool, +right_branch: {Nat.is_eq(id, query) == right : Bool},
    hit: Bool, +hit_branch: {F.same_address(target, birth) == hit : Bool}) ->
    {F.same_address(target, found) == Nat.is_eq(owner, query) : Bool}:
  match left right hit:
    case True{} True{} _:
      +left_value: {birth == target : O.NodeAddress} = Count.some_equal(O.NodeAddress, birth, target,
        %left_branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, owner)) == Some{target} : Maybe<&2, O.NodeAddress>}
        located)
      right_value: {birth == found : O.NodeAddress} = Count.some_equal(O.NodeAddress, birth, found,
        %right_branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, query)) == Some{found} : Maybe<&2, O.NodeAddress>}
        present)
      %N.eq_of_is_eq(id, owner, left_branch): {F.same_address(target, found) == Nat.is_eq(_, query) : Bool}
      %N.eq_of_is_eq(id, query, right_branch): {F.same_address(target, found) == Nat.is_eq(id, _) : Bool}
      %left_value: {F.same_address(_, found) == Nat.is_eq(id, id) : Bool}
      %right_value: {F.same_address(birth, _) == Nat.is_eq(id, id) : Bool}
      Equal.trans(Bool, F.same_address(birth, birth), True{}, Nat.is_eq(id, id), Lookup.address_refl(birth),
        Equal.sym(Bool, Nat.is_eq(id, id), True{}, Arithmetic.is_eq_refl(id)))
    case True{} False{} _:
      same: {birth == target : O.NodeAddress} = Count.some_equal(O.NodeAddress, birth, target,
        %left_branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, owner)) == Some{target} : Maybe<&2, O.NodeAddress>}
        located)
      semantic: {F.same_address(target, found) == False{} : Bool} = address_lookup_zero(tail, query, target, found,
        address_tail_zero(target, birth, tail,
          %same: {F.same_address(_, birth) == True{} : Bool}
          Lookup.address_refl(birth), unique),
        %right_branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, query)) == Some{found} : Maybe<&2, O.NodeAddress>}
        present)
      %N.eq_of_is_eq(id, owner, left_branch): {F.same_address(target, found) == Nat.is_eq(_, query) : Bool}
      Equal.trans(Bool, F.same_address(target, found), False{}, Nat.is_eq(id, query), semantic,
        Equal.sym(Bool, Nat.is_eq(id, query), False{}, right_branch))
    case False{} _ True{}:
      Empty.absurd({F.same_address(target, found) == Nat.is_eq(owner, query) : Bool},
        absent_target(tail, owner, target, address_tail_zero(target, birth, tail, hit_branch, unique),
          %left_branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, owner)) == Some{target} : Maybe<&2, O.NodeAddress>}
          located))
    case False{} True{} False{}:
      same: {birth == found : O.NodeAddress} = Count.some_equal(O.NodeAddress, birth, found,
        %right_branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, query)) == Some{found} : Maybe<&2, O.NodeAddress>}
        present)
      %same: {F.same_address(target, _) == Nat.is_eq(owner, query) : Bool}
      %N.eq_of_is_eq(id, query, right_branch): {F.same_address(target, birth) == Nat.is_eq(owner, _) : Bool}
      Equal.trans(Bool, F.same_address(target, birth), False{}, Nat.is_eq(owner, id), hit_branch,
        Equal.sym(Bool, Nat.is_eq(owner, id), False{},
          Equal.trans(Bool, Nat.is_eq(owner, id), Nat.is_eq(id, owner), False{}, Arithmetic.is_eq_comm(owner, id), left_branch)))
    case False{} False{} False{}:
      recursive(
        %hit_branch: {Nat.add(Bool.pick(Nat, _, 1n, 0n), P.address_count(tail, target)) == 1n : Nat}
        unique)(
        %left_branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, owner)) == Some{target} : Maybe<&2, O.NodeAddress>}
        located)(
        %right_branch: {Bool.pick(Maybe<&2, O.NodeAddress>, _, Some{birth}, F.address_at(tail, query)) == Some{found} : Maybe<&2, O.NodeAddress>}
        present)

def address_keys(items: List<&2, F.AddressEntry>, +owner: Nat, +query: Nat,
    +target: O.NodeAddress, +found: O.NodeAddress,
    unique: {P.address_count(items, target) == 1n : Nat},
    located: {F.address_at(items, owner) == Some{target} : Maybe<&2, O.NodeAddress>},
    present: {F.address_at(items, query) == Some{found} : Maybe<&2, O.NodeAddress>}) ->
    {F.same_address(target, found) == Nat.is_eq(owner, query) : Bool}:
  match items:
    case []: Empty.absurd({F.same_address(target, found) == Nat.is_eq(owner, query) : Bool}, Contents.none_some(O.NodeAddress, target, located))
    case F.AddressEntry{+id, +birth} <> +tail:
      address_keys_step(id, birth, tail, owner, query, target, found, unique, located, present,
        one => selected => at => address_keys(tail, owner, query, target, found, one, selected, at),
        Nat.is_eq(id, owner), {==}, Nat.is_eq(id, query), {==}, F.same_address(target, birth), {==})

def row_contents(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>) -> Type:
  Exists(O.NodeAddress, birth => Exists(T.Artifact, artifact => Exists(List<&2, F.Reference>, refs => Exists(List<&2, F.Node>, rest =>
    {F.address_at(addresses, id) == Some{birth} : Maybe<&2, O.NodeAddress>} &
    {F.artifact_at(catalog, handle) == Some{artifact} : Maybe<&2, T.Artifact>} &
    {P.references(P.owner_slots(slots, id), addresses) == Some{refs} : Maybe<&2, List<&2, F.Reference>>} &
    {P.nodes(tail, slots, catalog, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} &
    {F.Node{birth, artifact, refs} <> rest == retained : List<&2, F.Node>}))))

def split_head(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>, +head: F.Node, +rest: List<&2, F.Node>,
    tail_done: {P.nodes(tail, slots, catalog, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>},
    same: {Some{head <> rest} == Some{retained} : Maybe<&2, List<&2, F.Node>>},
    parts: Exists(O.NodeAddress, birth => Exists(T.Artifact, artifact => Exists(List<&2, F.Reference>, refs =>
      {F.address_at(addresses, id) == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {F.artifact_at(catalog, handle) == Some{artifact} : Maybe<&2, T.Artifact>} &
      {P.references(P.owner_slots(slots, id), addresses) == Some{refs} : Maybe<&2, List<&2, F.Reference>>} &
      {Some{F.Node{birth, artifact, refs}} == Some{head} : Maybe<&2, F.Node>})))) ->
    row_contents(id, handle, tail, slots, catalog, addresses, retained):
  match parts:
    case (+birth, (+artifact, (+refs, (located, (selected, (references, head_same)))))):
      Tuple{birth, Tuple{artifact, Tuple{refs, Tuple{rest, Tuple{located, Tuple{selected, Tuple{references, Tuple{tail_done,
        %Equal.sym(F.Node, F.Node{birth, artifact, refs}, head, Count.some_equal(F.Node, F.Node{birth, artifact, refs}, head, head_same)):
          {_ <> rest == retained : List<&2, F.Node>}
        Count.some_equal(List<&2, F.Node>, head <> rest, retained, same)}}}}}}}}

def split_prefix(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>,
    parts: Exists(F.Node, head => Exists(List<&2, F.Node>, rest =>
      {P.projected_node(F.address_at(addresses, id), F.artifact_at(catalog, handle), P.references(P.owner_slots(slots, id), addresses)) == Some{head} : Maybe<&2, F.Node>} &
      {P.nodes(tail, slots, catalog, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} &
      {Some{head <> rest} == Some{retained} : Maybe<&2, List<&2, F.Node>>}))) ->
    row_contents(id, handle, tail, slots, catalog, addresses, retained):
  match parts:
    case (+head, (+rest, (head_done, (tail_done, same)))):
      split_head(id, handle, tail, slots, catalog, addresses, retained, head, rest, tail_done, same,
        Contents.node_contents(F.address_at(addresses, id), F.artifact_at(catalog, handle),
          P.references(P.owner_slots(slots, id), addresses), head, head_done))

def split_nodes(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>,
    done: {P.nodes(Local.PlannedNode{id, handle} <> tail, slots, catalog, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>}) ->
    row_contents(id, handle, tail, slots, catalog, addresses, retained):
  split_prefix(id, handle, tail, slots, catalog, addresses, retained,
    Contents.prefix_contents(P.projected_node(F.address_at(addresses, id), F.artifact_at(catalog, handle),
      P.references(P.owner_slots(slots, id), addresses)), P.nodes(tail, slots, catalog, addresses), retained, done))

def semantic_absent_rows(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>,
    +owner: Nat, +index: Nat, +target: O.NodeAddress, +replacement: F.Reference,
    unique: {P.address_count(addresses, target) == 1n : Nat},
    located: {F.address_at(addresses, owner) == Some{target} : Maybe<&2, O.NodeAddress>},
    recursive: {P.node_count(tail, owner) == 0n : Nat} ->
      @+rest: List<&2, F.Node> -> {P.nodes(tail, slots, catalog, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} ->
      {F.replace_nodes(rest, target, index, replacement) == F.Nodes{rest, 0n} : F.Nodes},
    parts: {Nat.is_eq(owner, id) == False{} : Bool} & {P.node_count(tail, owner) == 0n : Nat},
    row: row_contents(id, handle, tail, slots, catalog, addresses, retained)) ->
    {F.replace_nodes(retained, target, index, replacement) == F.Nodes{retained, 0n} : F.Nodes}:
  match parts row:
    case Tuple{different, absent} Tuple{+birth, Tuple{+artifact, Tuple{+refs, Tuple{+rest, Tuple{at, Tuple{_, Tuple{_, Tuple{tail_done, same}}}}}}}}:
      %same: {F.replace_nodes(_, target, index, replacement) == F.Nodes{_, 0n} : F.Nodes}
      %Equal.sym(Bool, F.same_address(target, birth), False{},
        Equal.trans(Bool, F.same_address(target, birth), Nat.is_eq(owner, id), False{},
          address_keys(addresses, owner, id, target, birth, unique, located, at), different)):
        {F.replace_node(_, F.Node{birth, artifact, refs}, F.replace_nodes(rest, target, index, replacement), index, replacement) ==
          F.Nodes{F.Node{birth, artifact, refs} <> rest, 0n} : F.Nodes}
      %Equal.sym(F.Nodes, F.replace_nodes(rest, target, index, replacement), F.Nodes{rest, 0n}, recursive(absent)(rest)(tail_done)):
        {F.nodes_prefix(_, F.Node{birth, artifact, refs}, 0n) == F.Nodes{F.Node{birth, artifact, refs} <> rest, 0n} : F.Nodes}
      {==}

def semantic_absent(nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>, +catalog: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>, +owner: Nat, +index: Nat, +target: O.NodeAddress, +replacement: F.Reference,
    +unique: {P.address_count(addresses, target) == 1n : Nat},
    +located: {F.address_at(addresses, owner) == Some{target} : Maybe<&2, O.NodeAddress>},
    absent: {P.node_count(nodes, owner) == 0n : Nat},
    done: {P.nodes(nodes, slots, catalog, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>}) ->
    {F.replace_nodes(retained, target, index, replacement) == F.Nodes{retained, 0n} : F.Nodes}:
  match nodes:
    case []:
      %Count.some_equal(List<&2, F.Node>, [], retained, done):
        {F.replace_nodes(_, target, index, replacement) == F.Nodes{_, 0n} : F.Nodes}
      {==}
    case Local.PlannedNode{+id, +handle} <> +tail:
      semantic_absent_rows(id, handle, tail, slots, catalog, addresses, retained, owner, index, target, replacement, unique, located,
        zero => +rest => projected => semantic_absent(tail, slots, catalog, addresses, rest, owner, index, target, replacement, unique, located, zero, projected),
        Unaffected.zero_parts(Nat.is_eq(owner, id), P.node_count(tail, owner), absent),
        split_nodes(id, handle, tail, slots, catalog, addresses, retained, done))

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
