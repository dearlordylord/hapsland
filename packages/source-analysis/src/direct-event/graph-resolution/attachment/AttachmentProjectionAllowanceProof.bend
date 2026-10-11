import Base
import ./RetainedForestProjection.bend as P
import ./AttachmentProjectionContentsProof.bend as C
import ./AttachmentRenderedSuffix.bend as Suffix
import ../ForestSpecification.bend as F
import ../ForestAllowance.bend as Allowance
import ../WholeObservation.bend as O
import ../Types.bend as T
import ../traversal/core.bend as Local

# Direct allowance transport for projected_unit_total. Includes every retained
# node and its ordered reference slots; detached nodes are counted as well.
def value_of(-A: Data, +fallback: A, value: Maybe<&2, A>) -> A:
  match value:
    case None{}: fallback
    case Some{value}: value

def some_equal(-A: Data, +left: A, +right: A,
    same: {Some{left} == Some{right} : Maybe<&2, A>}) -> {left == right : A}:
  Equal.cong(Maybe<&2, A>, A, value => value_of(A, left, value), Some{left}, Some{right}, same)

def reference_prefix_contents(+item: Maybe<&2, F.Reference>,
    +rest: Maybe<&2, List<&2, F.Reference>>, +refs: List<&2, F.Reference>,
    success: {P.reference_prefix(item, rest) == Some{refs} : Maybe<&2, List<&2, F.Reference>>}) ->
    Exists(F.Reference, head => Exists(List<&2, F.Reference>, tail =>
      {item == Some{head} : Maybe<&2, F.Reference>} &
      {rest == Some{tail} : Maybe<&2, List<&2, F.Reference>>} &
      {Some{head <> tail} == Some{refs} : Maybe<&2, List<&2, F.Reference>>})):
  match item rest:
    case Some{head} Some{tail}:
      Tuple{head, Tuple{tail, Tuple{{==}, Tuple{{==}, success}}}}
    case None{} _:
      Empty.absurd(Exists(F.Reference, head => Exists(List<&2, F.Reference>, tail =>
        {None{} == Some{head} : Maybe<&2, F.Reference>} &
        {rest == Some{tail} : Maybe<&2, List<&2, F.Reference>>} &
        {Some{head <> tail} == Some{refs} : Maybe<&2, List<&2, F.Reference>>})),
        C.none_some(List<&2, F.Reference>, refs, success))
    case Some{_} None{}:
      Empty.absurd(Exists(F.Reference, head => Exists(List<&2, F.Reference>, tail =>
        {item == Some{head} : Maybe<&2, F.Reference>} &
        {None{} == Some{tail} : Maybe<&2, List<&2, F.Reference>>} &
        {Some{head <> tail} == Some{refs} : Maybe<&2, List<&2, F.Reference>>})),
        C.none_some(List<&2, F.Reference>, refs, success))

def references_cons(+slot: Local.ReferenceSlot, +tail: List<&2, Local.ReferenceSlot>,
    +addresses: List<&2, F.AddressEntry>, +refs: List<&2, F.Reference>,
    tail_count: @+rest: List<&2, F.Reference> ->
      {P.references(tail, addresses) == Some{rest} : Maybe<&2, List<&2, F.Reference>>} ->
      {Allowance.references(rest) == List.length(&2, Local.ReferenceSlot, tail) : Nat},
    contents: Exists(F.Reference, head => Exists(List<&2, F.Reference>, rest =>
      {P.reference(slot, addresses) == Some{head} : Maybe<&2, F.Reference>} &
      {P.references(tail, addresses) == Some{rest} : Maybe<&2, List<&2, F.Reference>>} &
      {Some{head <> rest} == Some{refs} : Maybe<&2, List<&2, F.Reference>>}))) ->
    {Allowance.references(refs) == List.length(&2, Local.ReferenceSlot, slot <> tail) : Nat}:
  match contents:
    case (+head, (+rest, (_, (tail_done, same)))):
      %some_equal(List<&2, F.Reference>, head <> rest, refs, same):
        {Allowance.references(_) == 1n+List.length(&2, Local.ReferenceSlot, tail) : Nat}
      Equal.cong(Nat, Nat, value => 1n+value, Allowance.references(rest),
        List.length(&2, Local.ReferenceSlot, tail), tail_count(rest, tail_done))

def references(items: List<&2, Local.ReferenceSlot>, +addresses: List<&2, F.AddressEntry>,
    +refs: List<&2, F.Reference>,
    success: {P.references(items, addresses) == Some{refs} : Maybe<&2, List<&2, F.Reference>>}) ->
    {Allowance.references(refs) == List.length(&2, Local.ReferenceSlot, items) : Nat}:
  match items:
    case []:
      %some_equal(List<&2, F.Reference>, [], refs, success):
        {Allowance.references(_) == 0n : Nat}
      {==}
    case +slot <> +tail:
      references_cons(slot, tail, addresses, refs,
        rest => done => references(tail, addresses, rest, done),
        reference_prefix_contents(P.reference(slot, addresses), P.references(tail, addresses), refs, success))

def node_weight(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +head: F.Node, +rest: List<&2, F.Node>,
    tail_weight: {Allowance.nodes(rest) == Suffix.suffix_weight(tail, slots) : Nat},
    contents: Exists(O.NodeAddress, birth => Exists(T.Artifact, value => Exists(List<&2, F.Reference>, refs =>
      {F.address_at(addresses, id) == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {F.artifact_at(artifacts, handle) == Some{value} : Maybe<&2, T.Artifact>} &
      {P.references(P.owner_slots(slots, id), addresses) == Some{refs} : Maybe<&2, List<&2, F.Reference>>} &
      {Some{F.Node{birth, value, refs}} == Some{head} : Maybe<&2, F.Node>})))) ->
    {Allowance.nodes(head <> rest) == Suffix.suffix_weight(Local.PlannedNode{id, handle} <> tail, slots) : Nat}:
  match contents:
    case (+birth, (+value, (+refs, (_, (_, (refs_done, same)))))):
      %some_equal(F.Node, F.Node{birth, value, refs}, head, same):
        {Allowance.nodes(_ <> rest) == Suffix.suffix_weight(Local.PlannedNode{id, handle} <> tail, slots) : Nat}
      %references(P.owner_slots(slots, id), addresses, refs, refs_done):
        {(2n + Allowance.references(refs) + Allowance.nodes(rest) : Nat)
          == (2n + _ + Suffix.suffix_weight(tail, slots) : Nat) : Nat}
      %tail_weight:
        {(2n + Allowance.references(refs) + Allowance.nodes(rest) : Nat)
          == (2n + Allowance.references(refs) + _ : Nat) : Nat}
      {==}

def nodes_cons(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +retained: List<&2, F.Node>,
    tail_count: @+rest: List<&2, F.Node> ->
      {P.nodes(tail, slots, artifacts, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} ->
      {Allowance.nodes(rest) == Suffix.suffix_weight(tail, slots) : Nat},
    contents: Exists(F.Node, head => Exists(List<&2, F.Node>, rest =>
      {P.projected_node(F.address_at(addresses, id), F.artifact_at(artifacts, handle),
        P.references(P.owner_slots(slots, id), addresses)) == Some{head} : Maybe<&2, F.Node>} &
      {P.nodes(tail, slots, artifacts, addresses) == Some{rest} : Maybe<&2, List<&2, F.Node>>} &
      {Some{head <> rest} == Some{retained} : Maybe<&2, List<&2, F.Node>>}))) ->
    {Allowance.nodes(retained) == Suffix.suffix_weight(Local.PlannedNode{id, handle} <> tail, slots) : Nat}:
  match contents:
    case (+head, (+rest, (head_done, (tail_done, same)))):
      %some_equal(List<&2, F.Node>, head <> rest, retained, same):
        {Allowance.nodes(_) == Suffix.suffix_weight(Local.PlannedNode{id, handle} <> tail, slots) : Nat}
      node_weight(id, handle, tail, slots, artifacts, addresses, head, rest, tail_count(rest, tail_done),
        C.node_contents(F.address_at(addresses, id), F.artifact_at(artifacts, handle),
          P.references(P.owner_slots(slots, id), addresses), head, head_done))


def nodes(items: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>,
    +retained: List<&2, F.Node>,
    success: {P.nodes(items, slots, artifacts, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>}) ->
    {Allowance.nodes(retained) == Suffix.suffix_weight(items, slots) : Nat}:
  match items:
    case []:
      %some_equal(List<&2, F.Node>, [], retained, success):
        {Allowance.nodes(_) == 0n : Nat}
      {==}
    case Local.PlannedNode{+id, +handle} <> +tail:
      nodes_cons(id, handle, tail, slots, artifacts, addresses, retained,
        rest => done => nodes(tail, slots, artifacts, addresses, rest, done),
        C.prefix_contents(P.projected_node(F.address_at(addresses, id), F.artifact_at(artifacts, handle),
          P.references(P.owner_slots(slots, id), addresses)), P.nodes(tail, slots, artifacts, addresses), retained, success))

def main() -> Unit:
  Unit{}
