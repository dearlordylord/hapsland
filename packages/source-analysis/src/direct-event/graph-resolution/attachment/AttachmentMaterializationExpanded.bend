import ../../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
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
    +forest: F.Forest, +deps: List<&2, String>, +value: ArtifactValue.ProductValue) -> Type:
  {Core.review_unit(root, nodes, slots, artifacts, deps) == Some{value}
    : Maybe<&2, ArtifactValue.ProductValue>} &
  {F.unit(Allowance.materialization(forest), forest, deps) == F.Materialized{value}
    : F.Materialization}


def fixture_root() -> Nat:
  0n

def fixture_nodes() -> List<&2, Local.PlannedNode>:
  Con{Local.PlannedNode{0n, 0n}, Con{Local.PlannedNode{1n, 0n}, Nil{}}}

def fixture_slots() -> List<&2, Local.ReferenceSlot>:
  Con{Local.ReferenceSlot{0n, 0n, "", Local.Expanded{1n}}, Con{Local.ReferenceSlot{1n, 0n, "", Local.Omitted{Local.Unresolved{}, ""}}, Nil{}}}

def fixture_artifacts() -> List<&2, T.ArtifactEntry>:
  Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}

def fixture_addresses() -> List<&2, F.AddressEntry>:
  Con{F.AddressEntry{0n, O.NodeAddress{0n, Nil{}}}, Con{F.AddressEntry{1n, O.NodeAddress{1n, Nil{}}}, Nil{}}}

def fixture_forest() -> F.Forest:
  F.Forest{Some{O.NodeAddress{0n, Nil{}}}, Con{F.Node{O.NodeAddress{0n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Expanded{F.ReferenceSymbol{""}, O.NodeAddress{1n, Nil{}}}, Nil{}}}, Con{F.Node{O.NodeAddress{1n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}}}

def fixture_deps() -> List<&2, String>:
  ["dep", "dep", ""]
def fixture_product() -> ArtifactValue.ProductValue:
  Render.unit_product(ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"artifact", ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"id", ArtifactValue.ProductText{""}}, Con{ArtifactValue.OrderedField{"kind", ArtifactValue.ProductText{"function"}}, Con{ArtifactValue.OrderedField{"name", ArtifactValue.ProductText{""}}, Con{ArtifactValue.OrderedField{"source", ArtifactValue.ProductText{""}}, Con{ArtifactValue.OrderedField{"sourceHash", ArtifactValue.ProductText{""}}, Nil{}}}}}}}}, Con{ArtifactValue.OrderedField{"references", ArtifactValue.ProductArray{Con{ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"kind", ArtifactValue.ProductText{"expanded"}}, Con{ArtifactValue.OrderedField{"site", ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"symbol", ArtifactValue.ProductText{""}}, Nil{}}}}, Con{ArtifactValue.OrderedField{"node", ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"artifact", ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"id", ArtifactValue.ProductText{""}}, Con{ArtifactValue.OrderedField{"kind", ArtifactValue.ProductText{"function"}}, Con{ArtifactValue.OrderedField{"name", ArtifactValue.ProductText{""}}, Con{ArtifactValue.OrderedField{"source", ArtifactValue.ProductText{""}}, Con{ArtifactValue.OrderedField{"sourceHash", ArtifactValue.ProductText{""}}, Nil{}}}}}}}}, Con{ArtifactValue.OrderedField{"references", ArtifactValue.ProductArray{Con{ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"kind", ArtifactValue.ProductText{"omitted"}}, Con{ArtifactValue.OrderedField{"site", ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"symbol", ArtifactValue.ProductText{""}}, Nil{}}}}, Con{ArtifactValue.OrderedField{"target", ArtifactValue.ProductObject{Con{ArtifactValue.OrderedField{"kind", ArtifactValue.ProductText{"unresolved"}}, Con{ArtifactValue.OrderedField{"symbol", ArtifactValue.ProductText{""}}, Nil{}}}}}, Con{ArtifactValue.OrderedField{"reason", ArtifactValue.ProductText{"unresolved"}}, Nil{}}}}}}, Nil{}}}}, Nil{}}}}}, Nil{}}}}}, Nil{}}}}, Nil{}}}}, fixture_deps())
def projected_premise() -> {P.project(fixture_root(), fixture_nodes(), fixture_slots(), fixture_artifacts(), fixture_addresses()) == Some{fixture_forest()} : Maybe<&2, F.Forest>}:
  {==}
def catalog_premise() -> {ActualFrame.catalog_valid(fixture_artifacts()) == True{} : Bool}:
  {==}
def forest_premise() -> {Relation.frame_forest(fixture_forest(), 2n) == True{} : Bool}:
  {==}
def exact_claim() -> Exists(ArtifactValue.ProductValue, value => common_product(fixture_root(), fixture_nodes(), fixture_slots(), fixture_artifacts(), fixture_forest(), fixture_deps(), value)):
  Tuple{fixture_product(), ({==}, {==})}
def main() -> Unit:
  Unit{}
