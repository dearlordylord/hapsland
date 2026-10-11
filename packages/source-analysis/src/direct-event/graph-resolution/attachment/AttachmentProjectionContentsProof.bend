import Base
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

def main() -> Unit:
  Unit{}
