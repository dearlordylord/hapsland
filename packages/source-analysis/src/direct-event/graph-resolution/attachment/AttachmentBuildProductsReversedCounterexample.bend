import Base
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

def artifact() -> T.Artifact:
  T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", [T.ArtifactIdKey{}, T.ArtifactKindKey{}, T.ArtifactNameKey{}, T.ArtifactSourceKey{}, T.ArtifactHashKey{}]}
def nodes() -> List<&2, Local.PlannedNode>:
  [Local.PlannedNode{0n, 0n}, Local.PlannedNode{1n, 0n}, Local.PlannedNode{2n, 0n}, Local.PlannedNode{3n, 0n}, Local.PlannedNode{4n, 0n}, Local.PlannedNode{5n, 0n}]
def slots() -> List<&2, Local.ReferenceSlot>:
  [Local.ReferenceSlot{0n, 0n, "step", Local.Expanded{1n}}, Local.ReferenceSlot{1n, 0n, "step", Local.Expanded{2n}}, Local.ReferenceSlot{2n, 0n, "step", Local.Expanded{3n}}, Local.ReferenceSlot{3n, 0n, "step", Local.Expanded{4n}}, Local.ReferenceSlot{4n, 0n, "step", Local.Expanded{5n}}]
def artifacts() -> List<&2, T.ArtifactEntry>:
  [T.ArtifactEntry{0n, artifact()}]
def addresses() -> List<&2, F.AddressEntry>:
  [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{1n, []}}, F.AddressEntry{2n, O.NodeAddress{2n, []}}, F.AddressEntry{3n, O.NodeAddress{3n, []}}, F.AddressEntry{4n, O.NodeAddress{4n, []}}, F.AddressEntry{5n, O.NodeAddress{5n, []}}]
def forest() -> F.Forest:
  F.Forest{Some{O.NodeAddress{0n, []}}, [F.Node{O.NodeAddress{0n, []}, artifact(), [F.Expanded{F.ReferenceSymbol{"step"}, O.NodeAddress{1n, []}}]}, F.Node{O.NodeAddress{1n, []}, artifact(), [F.Expanded{F.ReferenceSymbol{"step"}, O.NodeAddress{2n, []}}]}, F.Node{O.NodeAddress{2n, []}, artifact(), [F.Expanded{F.ReferenceSymbol{"step"}, O.NodeAddress{3n, []}}]}, F.Node{O.NodeAddress{3n, []}, artifact(), [F.Expanded{F.ReferenceSymbol{"step"}, O.NodeAddress{4n, []}}]}, F.Node{O.NodeAddress{4n, []}, artifact(), [F.Expanded{F.ReferenceSymbol{"step"}, O.NodeAddress{5n, []}}]}, F.Node{O.NodeAddress{5n, []}, artifact(), []}]}
def projected() -> {P.project(0n, nodes(), slots(), artifacts(), addresses()) == Some{forest()} : Maybe<&2, F.Forest>}:
  {==}
def catalog_valid() -> {ActualFrame.catalog_valid(artifacts()) == True{} : Bool}:
  {==}
def forest_valid() -> {Relation.frame_forest(forest(), 6n) == True{} : Bool}:
  {==}
def old_reversed_root_allowance() -> {Suffix.suffix_allowance([Local.PlannedNode{0n, 0n}], slots()) == 5n : Nat}:
  {==}
def old_reversed_exhausted() -> {F.materialize(5n, forest(), O.NodeAddress{0n, []}) == F.MaterializationExhausted{} : F.Materialization}:
  {==}
def main() -> Unit:
  Unit{}
