import Base
import ./AttachmentNaturalArithmeticFacts.bend as Arithmetic
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ./RetainedForestProjection.bend as P
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T
import ../traversal/core.bend as Local

# Inversion of the existing successful projection, never a projection of a tail.
def present(-A: Data, value: Maybe<&2, A>) -> Type:
  match value:
    case None{}: Unit
    case Some{_}: Empty

def none_some(-A: Data, +value: A, proof: {None{} == Some{value} : Maybe<&2, A>}) -> Empty:
  %proof: present(A, _)
  Unit{}

def node_contents(+address: Maybe<&2, O.NodeAddress>, +artifact: Maybe<&2, T.Artifact>,
    +references: Maybe<&2, List<&2, F.Reference>>, +node: F.Node,
    success: {P.projected_node(address, artifact, references) == Some{node} : Maybe<&2, F.Node>}) ->
    Exists(O.NodeAddress, birth => Exists(T.Artifact, value => Exists(List<&2, F.Reference>, refs =>
      {address == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {artifact == Some{value} : Maybe<&2, T.Artifact>} &
      {references == Some{refs} : Maybe<&2, List<&2, F.Reference>>} &
      {Some{F.Node{birth, value, refs}} == Some{node} : Maybe<&2, F.Node>}))):
  match address artifact references:
    case Some{birth} Some{value} Some{refs}:
      Tuple{birth, Tuple{value, Tuple{refs, Tuple{{==}, Tuple{{==}, Tuple{{==}, success}}}}}}
    case None{} _ _:
      Empty.absurd(Exists(O.NodeAddress, birth => Exists(T.Artifact, value => Exists(List<&2, F.Reference>, refs =>
        {None{} == Some{birth} : Maybe<&2, O.NodeAddress>} &
        {artifact == Some{value} : Maybe<&2, T.Artifact>} &
        {references == Some{refs} : Maybe<&2, List<&2, F.Reference>>} &
        {Some{F.Node{birth, value, refs}} == Some{node} : Maybe<&2, F.Node>}))), none_some(F.Node, node, success))
    case Some{_} None{} _:
      Empty.absurd(Exists(O.NodeAddress, birth => Exists(T.Artifact, value => Exists(List<&2, F.Reference>, refs =>
        {address == Some{birth} : Maybe<&2, O.NodeAddress>} &
        {None{} == Some{value} : Maybe<&2, T.Artifact>} &
        {references == Some{refs} : Maybe<&2, List<&2, F.Reference>>} &
        {Some{F.Node{birth, value, refs}} == Some{node} : Maybe<&2, F.Node>}))), none_some(F.Node, node, success))
    case Some{_} Some{_} None{}:
      Empty.absurd(Exists(O.NodeAddress, birth => Exists(T.Artifact, value => Exists(List<&2, F.Reference>, refs =>
        {address == Some{birth} : Maybe<&2, O.NodeAddress>} &
        {artifact == Some{value} : Maybe<&2, T.Artifact>} &
        {None{} == Some{refs} : Maybe<&2, List<&2, F.Reference>>} &
        {Some{F.Node{birth, value, refs}} == Some{node} : Maybe<&2, F.Node>}))), none_some(F.Node, node, success))

def prefix_contents(+item: Maybe<&2, F.Node>, +rest: Maybe<&2, List<&2, F.Node>>, +nodes: List<&2, F.Node>,
    success: {P.node_prefix(item, rest) == Some{nodes} : Maybe<&2, List<&2, F.Node>>}) ->
    Exists(F.Node, head => Exists(List<&2, F.Node>, tail =>
      {item == Some{head} : Maybe<&2, F.Node>} &
      {rest == Some{tail} : Maybe<&2, List<&2, F.Node>>} &
      {Some{head <> tail} == Some{nodes} : Maybe<&2, List<&2, F.Node>>})):
  match item rest:
    case Some{head} Some{tail}:
      Tuple{head, Tuple{tail, Tuple{{==}, Tuple{{==}, success}}}}
    case None{} _:
      Empty.absurd(Exists(F.Node, head => Exists(List<&2, F.Node>, tail =>
        {None{} == Some{head} : Maybe<&2, F.Node>} &
        {rest == Some{tail} : Maybe<&2, List<&2, F.Node>>} &
        {Some{head <> tail} == Some{nodes} : Maybe<&2, List<&2, F.Node>>})), none_some(List<&2, F.Node>, nodes, success))
    case Some{_} None{}:
      Empty.absurd(Exists(F.Node, head => Exists(List<&2, F.Node>, tail =>
        {item == Some{head} : Maybe<&2, F.Node>} &
        {None{} == Some{tail} : Maybe<&2, List<&2, F.Node>>} &
        {Some{head <> tail} == Some{nodes} : Maybe<&2, List<&2, F.Node>>})), none_some(List<&2, F.Node>, nodes, success))

def forest_contents(+root: Maybe<&2, O.NodeAddress>, +items: Maybe<&2, List<&2, F.Node>>, +forest: F.Forest,
    success: {P.forest(root, items) == Some{forest} : Maybe<&2, F.Forest>}) ->
    Exists(O.NodeAddress, birth => Exists(List<&2, F.Node>, retained =>
      {root == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {items == Some{retained} : Maybe<&2, List<&2, F.Node>>} &
      {Some{F.Forest{Some{birth}, retained}} == Some{forest} : Maybe<&2, F.Forest>})):
  match root items:
    case Some{birth} Some{retained}:
      Tuple{birth, Tuple{retained, Tuple{{==}, Tuple{{==}, success}}}}
    case None{} _:
      Empty.absurd(Exists(O.NodeAddress, birth => Exists(List<&2, F.Node>, retained =>
      {None{} == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {items == Some{retained} : Maybe<&2, List<&2, F.Node>>} &
      {Some{F.Forest{Some{birth}, retained}} == Some{forest} : Maybe<&2, F.Forest>})), none_some(F.Forest, forest, success))
    case Some{_} None{}:
      Empty.absurd(Exists(O.NodeAddress, birth => Exists(List<&2, F.Node>, retained =>
      {root == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {None{} == Some{retained} : Maybe<&2, List<&2, F.Node>>} &
      {Some{F.Forest{Some{birth}, retained}} == Some{forest} : Maybe<&2, F.Forest>})), none_some(F.Forest, forest, success))

def validated_contents(+valid: Bool, +root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +forest: F.Forest,
    success: {P.validated(valid, root, nodes, slots, artifacts, addresses) == Some{forest} : Maybe<&2, F.Forest>}) ->
    {valid == True{} : Bool} &
    {P.forest(F.address_at(addresses, root), P.nodes(nodes, slots, artifacts, addresses)) == Some{forest} : Maybe<&2, F.Forest>}:
  match valid:
    case True{}: Tuple{{==}, success}
    case False{}:
      Empty.absurd({False{} == True{} : Bool} &
        {P.forest(F.address_at(addresses, root), P.nodes(nodes, slots, artifacts, addresses)) == Some{forest} : Maybe<&2, F.Forest>},
        none_some(F.Forest, forest, success))

def project_contents(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +forest: F.Forest,
    success: {P.project(root, nodes, slots, artifacts, addresses) == Some{forest} : Maybe<&2, F.Forest>}) ->
    {Bool.and(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts),
      Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots)))) == True{} : Bool} &
    {P.forest(F.address_at(addresses, root), P.nodes(nodes, slots, artifacts, addresses)) == Some{forest} : Maybe<&2, F.Forest>}:
  validated_contents(Bool.and(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts),
    Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots)))), root, nodes, slots, artifacts, addresses, forest, success)

# Shared count and paired-row projection transport.
def node_count_append(items: List<&2, Local.PlannedNode>, +suffix: List<&2, Local.PlannedNode>, +query: Nat) ->
    {P.node_count(List.append(&2, Local.PlannedNode, items, suffix), query)
      == (P.node_count(items, query) + P.node_count(suffix, query) : Nat) : Nat}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, _} <> +tail:
      %Equal.sym(Nat, P.node_count(List.append(&2, Local.PlannedNode, tail, suffix), query),
        (P.node_count(tail, query) + P.node_count(suffix, query) : Nat), node_count_append(tail, suffix, query)):
        {(Bool.pick(Nat, Nat.is_eq(query, id), 1n, 0n) + _ : Nat)
          == ((Bool.pick(Nat, Nat.is_eq(query, id), 1n, 0n) + P.node_count(tail, query) : Nat) + P.node_count(suffix, query) : Nat) : Nat}
      Equal.sym(Nat,
        ((Bool.pick(Nat, Nat.is_eq(query, id), 1n, 0n) + P.node_count(tail, query) : Nat) + P.node_count(suffix, query) : Nat),
        (Bool.pick(Nat, Nat.is_eq(query, id), 1n, 0n) + (P.node_count(tail, query) + P.node_count(suffix, query) : Nat) : Nat),
        Arithmetic.add_assoc(Bool.pick(Nat, Nat.is_eq(query, id), 1n, 0n), P.node_count(tail, query), P.node_count(suffix, query)))

def address_count_append(items: List<&2, F.AddressEntry>, +suffix: List<&2, F.AddressEntry>, +target: O.NodeAddress) ->
    {P.address_count(List.append(&2, F.AddressEntry, items, suffix), target)
      == (P.address_count(items, target) + P.address_count(suffix, target) : Nat) : Nat}:
  match items:
    case []: {==}
    case F.AddressEntry{_, +birth} <> +tail:
      %Equal.sym(Nat, P.address_count(List.append(&2, F.AddressEntry, tail, suffix), target),
        (P.address_count(tail, target) + P.address_count(suffix, target) : Nat), address_count_append(tail, suffix, target)):
        {(Bool.pick(Nat, F.same_address(target, birth), 1n, 0n) + _ : Nat)
          == ((Bool.pick(Nat, F.same_address(target, birth), 1n, 0n) + P.address_count(tail, target) : Nat) + P.address_count(suffix, target) : Nat) : Nat}
      Equal.sym(Nat,
        ((Bool.pick(Nat, F.same_address(target, birth), 1n, 0n) + P.address_count(tail, target) : Nat) + P.address_count(suffix, target) : Nat),
        (Bool.pick(Nat, F.same_address(target, birth), 1n, 0n) + (P.address_count(tail, target) + P.address_count(suffix, target) : Nat) : Nat),
        Arithmetic.add_assoc(Bool.pick(Nat, F.same_address(target, birth), 1n, 0n), P.address_count(tail, target), P.address_count(suffix, target)))

def aligned_append_fixed(nodes: List<&2, Local.PlannedNode>, entries: List<&2, F.AddressEntry>,
    +suffix_nodes: List<&2, Local.PlannedNode>, +suffix_entries: List<&2, F.AddressEntry>,
    +all_nodes: List<&2, Local.PlannedNode>, +all_entries: List<&2, F.AddressEntry>,
    +first: {P.aligned(nodes, entries, all_nodes, all_entries) == True{} : Bool},
    +last: {P.aligned(suffix_nodes, suffix_entries, all_nodes, all_entries) == True{} : Bool}) ->
    {P.aligned(List.append(&2, Local.PlannedNode, nodes, suffix_nodes),
      List.append(&2, F.AddressEntry, entries, suffix_entries), all_nodes, all_entries) == True{} : Bool}:
  match nodes entries:
    case Nil{} Nil{}: last
    case Con{Local.PlannedNode{+id, _}, +tail} Con{F.AddressEntry{+other, +birth}, +rest}:
      +after_id: {Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
        Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(id, other),
          Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))), first)
      +after_count: {Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries)) == True{} : Bool} =
        B.eq_true_of_and_right(Nat.is_eq(P.node_count(all_nodes, id), 1n),
          Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries)), after_id)
      +combined: Bool = P.aligned(List.append(&2, Local.PlannedNode, tail, suffix_nodes),
        List.append(&2, F.AddressEntry, rest, suffix_entries), all_nodes, all_entries)
      B.and_eq_true(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
        Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), combined)),
        B.eq_true_of_and_left(Nat.is_eq(id, other),
          Bool.and(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries))), first),
        B.and_eq_true(Nat.is_eq(P.node_count(all_nodes, id), 1n), Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), combined),
          B.eq_true_of_and_left(Nat.is_eq(P.node_count(all_nodes, id), 1n),
            Bool.and(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries)), after_id),
          B.and_eq_true(Nat.is_eq(P.address_count(all_entries, birth), 1n), combined,
            B.eq_true_of_and_left(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries), after_count),
            aligned_append_fixed(tail, rest, suffix_nodes, suffix_entries, all_nodes, all_entries,
              B.eq_true_of_and_right(Nat.is_eq(P.address_count(all_entries, birth), 1n), P.aligned(tail, rest, all_nodes, all_entries), after_count), last))))
    case Nil{} Con{_, _}:
      Empty.absurd({P.aligned(List.append(&2, Local.PlannedNode, nodes, suffix_nodes),
        List.append(&2, F.AddressEntry, entries, suffix_entries), all_nodes, all_entries) == True{} : Bool}, B.internal_false_ne_true(first))
    case Con{_, _} Nil{}:
      Empty.absurd({P.aligned(List.append(&2, Local.PlannedNode, nodes, suffix_nodes),
        List.append(&2, F.AddressEntry, entries, suffix_entries), all_nodes, all_entries) == True{} : Bool}, B.internal_false_ne_true(first))

def aligned_context_row(+id: Nat, +other: Nat, +artifact: Nat, +birth: O.NodeAddress,
    +tail: List<&2, Local.PlannedNode>, +rest: List<&2, F.AddressEntry>,
    +old_nodes: List<&2, Local.PlannedNode>, +old_entries: List<&2, F.AddressEntry>,
    +new_nodes: List<&2, Local.PlannedNode>, +new_entries: List<&2, F.AddressEntry>,
    aligned: {P.aligned(Local.PlannedNode{id, artifact} <> tail, F.AddressEntry{other, birth} <> rest, old_nodes, old_entries) == True{} : Bool},
    node_count: {P.node_count(new_nodes, id) == 1n : Nat},
    address_count: {P.address_count(new_entries, birth) == 1n : Nat},
    tail_aligned: {P.aligned(tail, rest, new_nodes, new_entries) == True{} : Bool}) ->
    {P.aligned(Local.PlannedNode{id, artifact} <> tail, F.AddressEntry{other, birth} <> rest, new_nodes, new_entries) == True{} : Bool}:
  B.and_eq_true(Nat.is_eq(id, other), Bool.and(Nat.is_eq(P.node_count(new_nodes, id), 1n),
    Bool.and(Nat.is_eq(P.address_count(new_entries, birth), 1n), P.aligned(tail, rest, new_nodes, new_entries))),
    B.eq_true_of_and_left(Nat.is_eq(id, other),
      Bool.and(Nat.is_eq(P.node_count(old_nodes, id), 1n),
        Bool.and(Nat.is_eq(P.address_count(old_entries, birth), 1n), P.aligned(tail, rest, old_nodes, old_entries))), aligned),
    B.and_eq_true(Nat.is_eq(P.node_count(new_nodes, id), 1n),
      Bool.and(Nat.is_eq(P.address_count(new_entries, birth), 1n), P.aligned(tail, rest, new_nodes, new_entries)),
      %Equal.sym(Nat, P.node_count(new_nodes, id), 1n, node_count):
        {Nat.is_eq(_, 1n) == True{} : Bool}
      {==},
      B.and_eq_true(Nat.is_eq(P.address_count(new_entries, birth), 1n), P.aligned(tail, rest, new_nodes, new_entries),
        %Equal.sym(Nat, P.address_count(new_entries, birth), 1n, address_count):
          {Nat.is_eq(_, 1n) == True{} : Bool}
        {==}, tail_aligned)))

def main() -> Unit:
  Unit{}
