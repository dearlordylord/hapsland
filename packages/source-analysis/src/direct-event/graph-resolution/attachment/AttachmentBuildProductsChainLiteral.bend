import Base
import ./AttachmentBuildCopiesProof.bend as Copies
import ./AttachmentRenderedSuffix.bend as Suffix
import ./RetainedForestProjection.bend as P
import ./AttachmentCatalogValidation.bend as ActualFrame
import ./ForestRelation.bend as Relation
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T
import ../traversal/core.bend as Local
import ../traversal/patricia-proof/PATRICIA_RELATION.bend as Patricia

def copies(count: Nat, -Claim: Type) -> Type:
  Copies.copies(count, Claim)

# The exact existing review_unit construction before selecting its root.
def products(+nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>, artifacts: List<&2, T.ArtifactEntry>) ->
    Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>:
  Core.bind(Map<&2, Maybe<&2, T.Artifact>>, Map<&2, Maybe<&2, T.ProductValue>>, Core.index_artifacts(artifacts, MTip{}),
    indexed => Core.build_products(List.reverse(&2, Local.PlannedNode, nodes), Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots), MTip{}), indexed, MTip{}))

def artifact() -> T.Artifact:
  T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", [T.ArtifactIdKey{}, T.ArtifactKindKey{}, T.ArtifactNameKey{}, T.ArtifactSourceKey{}, T.ArtifactHashKey{}]}
def nodes() -> List<&2, Local.PlannedNode>:
  [Local.PlannedNode{0n, 0n}, Local.PlannedNode{1n, 0n}, Local.PlannedNode{2n, 0n}]
def slots() -> List<&2, Local.ReferenceSlot>:
  [Local.ReferenceSlot{0n, 0n, "first", Local.Expanded{1n}}, Local.ReferenceSlot{1n, 0n, "second", Local.Expanded{2n}}]
def artifacts() -> List<&2, T.ArtifactEntry>:
  [T.ArtifactEntry{0n, artifact()}]
def addresses() -> List<&2, F.AddressEntry>:
  [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{1n, []}}, F.AddressEntry{2n, O.NodeAddress{2n, []}}]
def forest() -> F.Forest:
  F.Forest{Some{O.NodeAddress{0n, []}}, [F.Node{O.NodeAddress{0n, []}, artifact(), [F.Expanded{F.ReferenceSymbol{"first"}, O.NodeAddress{1n, []}}]}, F.Node{O.NodeAddress{1n, []}, artifact(), [F.Expanded{F.ReferenceSymbol{"second"}, O.NodeAddress{2n, []}}]}, F.Node{O.NodeAddress{2n, []}, artifact(), []}]}
def artifact_value() -> T.ProductValue:
  Core.object([Core.field("id", Core.text("")), Core.field("kind", Core.text("function")), Core.field("name", Core.text("")), Core.field("source", Core.text("")), Core.field("sourceHash", Core.text(""))])
def node_value(references: List<&2, T.ProductValue>) -> T.ProductValue:
  Core.object([Core.field("artifact", artifact_value()), Core.field("references", T.ProductArray{references})])
def leaf_value() -> T.ProductValue:
  node_value([])
def expanded(symbol: String, value: T.ProductValue) -> T.ProductValue:
  Core.object([Core.field("kind", Core.text("expanded")), Core.field("site", Core.site(symbol)), Core.field("node", value)])
def middle_value() -> T.ProductValue:
  node_value([expanded("second", leaf_value())])
def root_value() -> T.ProductValue:
  node_value([expanded("first", middle_value())])
def built() -> Map<&2, Maybe<&2, T.ProductValue>>:
  Map.set(&2, Maybe<&2, T.ProductValue>, Map.set(&2, Maybe<&2, T.ProductValue>, Map.set(&2, Maybe<&2, T.ProductValue>, MTip{}, "2", Some{leaf_value()}), "1", Some{middle_value()}), "0", Some{root_value()})
def projected() -> {P.project(0n, nodes(), slots(), artifacts(), addresses()) == Some{forest()} : Maybe<&2, F.Forest>}:
  {==}
def catalog_valid() -> {ActualFrame.catalog_valid(artifacts()) == True{} : Bool}:
  {==}
def forest_valid() -> {Relation.frame_forest(forest(), 3n) == True{} : Bool}:
  {==}
def three_node_allowance5() -> {F.materialize(5n, forest(), O.NodeAddress{0n, []}) == F.Materialized{root_value()} : F.Materialization}:
  {==}
def uniform_0(+extra: Nat) -> {F.materialize(Nat.add(Suffix.suffix_allowance(nodes(), slots()), extra), forest(), O.NodeAddress{0n, []}) == F.Materialized{root_value()} : F.Materialization}:
  {==}
def uniform_1(+extra: Nat) -> {F.materialize(Nat.add(Suffix.suffix_allowance([Local.PlannedNode{1n, 0n}, Local.PlannedNode{2n, 0n}], slots()), extra), forest(), O.NodeAddress{1n, []}) == F.Materialized{middle_value()} : F.Materialization}:
  {==}
def uniform_2(+extra: Nat) -> {F.materialize(Nat.add(Suffix.suffix_allowance([Local.PlannedNode{2n, 0n}], slots()), extra), forest(), O.NodeAddress{2n, []}) == F.Materialized{leaf_value()} : F.Materialization}:
  {==}
def suffix() -> Suffix.rendered_suffix(nodes(), slots(), addresses(), forest(), built()):
  Tuple{Tuple{O.NodeAddress{0n, []}, Tuple{root_value(), Tuple{{==}, Tuple{{==}, extra => uniform_0(extra)}}}},
    Tuple{Tuple{O.NodeAddress{1n, []}, Tuple{middle_value(), Tuple{{==}, Tuple{{==}, extra => uniform_1(extra)}}}},
      Tuple{Tuple{O.NodeAddress{2n, []}, Tuple{leaf_value(), Tuple{{==}, Tuple{{==}, extra => uniform_2(extra)}}}}, Unit{}}}}
def claim_0() -> Exists(Map<&2, Maybe<&2, T.ProductValue>>, result => {products(nodes(), slots(), artifacts()) == Some{result} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>} & {Patricia.canonical(Maybe<&2, T.ProductValue>, result) == True{} : Bool} & copies(0n, Suffix.rendered_suffix(nodes(), slots(), addresses(), forest(), result))):
  Tuple{built(), Tuple{{==}, Tuple{{==}, Unit{}}}}
def claim_1() -> Exists(Map<&2, Maybe<&2, T.ProductValue>>, result => {products(nodes(), slots(), artifacts()) == Some{result} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>} & {Patricia.canonical(Maybe<&2, T.ProductValue>, result) == True{} : Bool} & copies(1n, Suffix.rendered_suffix(nodes(), slots(), addresses(), forest(), result))):
  Tuple{built(), Tuple{{==}, Tuple{{==}, Tuple{suffix(), Unit{}}}}}
def claim_2() -> Exists(Map<&2, Maybe<&2, T.ProductValue>>, result => {products(nodes(), slots(), artifacts()) == Some{result} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>} & {Patricia.canonical(Maybe<&2, T.ProductValue>, result) == True{} : Bool} & copies(2n, Suffix.rendered_suffix(nodes(), slots(), addresses(), forest(), result))):
  Tuple{built(), Tuple{{==}, Tuple{{==}, Tuple{suffix(), Tuple{suffix(), Unit{}}}}}}
def main() -> Unit:
  Unit{}
