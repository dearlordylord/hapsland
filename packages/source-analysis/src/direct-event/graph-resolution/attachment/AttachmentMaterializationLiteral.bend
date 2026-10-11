import Base
import ../Core.bend as Render
import ../WholeObservation.bend as O
import ./RetainedForestProjection.bend as P
import ./ActualAttachmentFrameProjection.bend as ActualFrame
import ./ForestRelation.bend as Relation
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../ForestAllowance.bend as Allowance
import ../Types.bend as T
import ../traversal/core.bend as Local

# Private dependency of the approved whole attachment law. Astra agreed the
# statement before proof. This is not another migration acceptance frontier.
# Both successful rendering and exact ordered product equality are conclusions.
def common_product(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +forest: F.Forest, +deps: List<&2, String>, +value: T.ProductValue) -> Type:
  {Core.review_unit(root, nodes, slots, artifacts, deps) == Some{value}
    : Maybe<&2, T.ProductValue>} &
  {F.unit(Allowance.materialization(forest), forest, deps) == F.Materialized{value}
    : F.Materialization}


def fixture_root() -> Nat:
  0n

def fixture_nodes() -> List<&2, Local.PlannedNode>:
  Con{Local.PlannedNode{0n, 0n}, Nil{}}

def fixture_slots() -> List<&2, Local.ReferenceSlot>:
  Con{Local.ReferenceSlot{0n, 0n, "", Local.Omitted{Local.Unresolved{}, ""}}, Nil{}}

def fixture_artifacts() -> List<&2, T.ArtifactEntry>:
  Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}

def fixture_addresses() -> List<&2, F.AddressEntry>:
  Con{F.AddressEntry{0n, O.NodeAddress{0n, Nil{}}}, Nil{}}

def fixture_forest() -> F.Forest:
  F.Forest{Some{O.NodeAddress{0n, Nil{}}}, Con{F.Node{O.NodeAddress{0n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}}

def fixture_deps() -> List<&2, String>:
  ["dep", "dep", ""]
def fixture_product() -> T.ProductValue:
  Render.unit_product(Render.object([
    Render.field("artifact", Render.object([
      Render.field("id", Render.text("")), Render.field("kind", Render.text("function")),
      Render.field("name", Render.text("")), Render.field("source", Render.text("")),
      Render.field("sourceHash", Render.text(""))])),
    Render.field("references", T.ProductArray{[Render.object([
      Render.field("kind", Render.text("omitted")),
      Render.field("site", Render.object([Render.field("symbol", Render.text(""))])),
      Render.field("target", Render.object([Render.field("kind", Render.text("unresolved")), Render.field("symbol", Render.text(""))])),
      Render.field("reason", Render.text("unresolved"))])]})]), fixture_deps())
def projected_premise() -> {P.project(fixture_root(), fixture_nodes(), fixture_slots(), fixture_artifacts(), fixture_addresses()) == Some{fixture_forest()} : Maybe<&2, F.Forest>}:
  {==}
def catalog_premise() -> {ActualFrame.catalog_valid(fixture_artifacts()) == True{} : Bool}:
  {==}
def forest_premise() -> {Relation.frame_forest(fixture_forest(), 1n) == True{} : Bool}:
  {==}
def exact_claim() -> Exists(T.ProductValue, value => common_product(fixture_root(), fixture_nodes(), fixture_slots(), fixture_artifacts(), fixture_forest(), fixture_deps(), value)):
  Tuple{fixture_product(), ({==}, {==})}
def main() -> Unit:
  Unit{}
