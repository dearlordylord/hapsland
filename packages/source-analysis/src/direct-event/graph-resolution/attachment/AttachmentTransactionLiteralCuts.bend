import Base
import ./AttachmentTransactionContract.bend as Contract
import ../traversal/core.bend as Local
import ../traversal/SPEC.bend as Recursive
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../SPEC.bend as Root
import ../SignedLocalSpecification.bend as Signed
import ../../../../../agent-flow-bend/ImportGraph.bend as G
import ./AttachmentFrameView.bend as V
import ./AttachmentPhaseView.bend as Phase
import ./AttachmentBoundaryView.bend as B
import ./ActualAttachmentPhaseProjection.bend as ActualReady
import ./ReferenceAttachmentPhaseProjection.bend as ReferenceReady
import ./ActualAttachmentFrameProjection.bend as ActualFrame
import ./AttachmentStagedReferenceProjection.bend as Staged
import ./ActualAttachmentBoundaryProjection.bend as ActualBoundary
import ./ReferenceAttachmentBoundaryProjection.bend as ReferenceBoundaryView
import ./AttachmentReferenceBoundary.bend as ReferenceBoundary
import ./AttachmentHistory.bend as History
import ../Types.bend as T
import ../State.bend as S
import ../Loop.bend as Loop
import ../Machine.bend as Machine
import ../Attach.bend as Attach
import ../Environment.bend as E
import ../ExpansionSpecification.bend as X
import ../ExpansionDriverSpecification.bend as D

# DRAFT: one complete attachment transaction, not a provider/scheduler law.
# Successful ready projections are internal relational premises to be derived
# from whole entry execution. External resolver inputs are not restricted here.
# No successful materialization, selected query or accepted reply is assumed.
# The existential conclusion requires real Some observations on both sides.
# Reply includes arbitrary correlation, variant, bytes and exception ownership.
# World already contains provider effects; this pure law neither creates those
# effects nor erases scheduler cancellation stutters between pure transitions.

def fixture_actual() -> T.ResolverState:
  T.ResolverState{T.ResolverInput{1n, "root", T.CaptureToken{1n, 3n}, 10n, "x", "", T.FunctionBranch{}, None{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}}, T.MeasuringPreviousTree{}, Some{T.ClockToken{1n, 2n}}, 7n, 20n, Some{T.BendLanguage{}}, "", T.RustContext{None{}, None{}, None{}}, Some{T.ResolverFrame{T.FunctionBranch{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}, G.Graph{G.Capturing{G.Edge{0n, 1n}, 7n}, Nil{}, Nil{}, 1n, 0n, 0n, 0n, False{}, False{}, False{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}}, G.ReadSource{7n}, Nil{}, 0n, Con{Local.PlannedNode{0n, 0n}, Nil{}}, Con{Local.ReferenceSlot{0n, 0n, "", Local.Omitted{Local.Unresolved{}, ""}}, Nil{}}, MTip{}, Local.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, 0n, 0n}, 1n, 1n, 8n, 1n, MLeaf{"0", Some{Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}, MLeaf{"7", Some{T.FileTarget{"child", "x", Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}}, MLeaf{"child", Some{7n}}, MTip{}, MTip{}, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, None{}, T.ResolverScratch{Nil{}, Nil{}, Some{7n}, None{}, None{}, 0n, None{}, Some{T.TentativeChild{7n, "child", T.CaptureToken{1n, 3n}, 10n, T.CapturedFacts{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, MLeaf{"x", False{}}, 10n}, 0n, "", 0n, Local.Plan{0n, Con{Local.PlannedNode{0n, 0n}, Nil{}}, Con{Local.ReferenceSlot{0n, 0n, "", Local.Omitted{Local.Unresolved{}, ""}}, Nil{}}, Con{Local.Pending{0n, 0n, "child", "", "x", 2n, Local.FunctionKind{}, Local.Imported{"next", "x"}}, Nil{}}, MTip{}, Local.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, 0n, 0n}}, 0n, T.ProductNull{}, Nil{}}}, "", "", "", 0n, None{}, None{}, None{}, Nil{}, None{}, None{}, Some{Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}, 0n}, T.PreparedLanguage{G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}, Nil{}}, T.RustWork{False{}, 0n, None{}, Nil{}, Nil{}, Nil{}, "", Nil{}, Nil{}, "", False{}, T.CapturedTaskReturn{}}}

def fixture_reference() -> D.State:
  D.State{D.Config{1n, "root", T.BendLanguage{}, T.BendSourceContext{T.FunctionBranch{}}, T.ClockToken{1n, 2n}, None{}}, X.Frame{G.Bounded{G.Graph{G.Capturing{G.Edge{0n, 1n}, 7n}, Nil{}, Nil{}, 1n, 0n, 0n, 0n, False{}, False{}, False{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}}, 3n}, G.ReadSource{7n}, F.Forest{Some{O.NodeAddress{0n, Nil{}}}, Con{F.Node{O.NodeAddress{0n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}}, Signed.State{Recursive.State{MTip{}, Local.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, 0n, 0n}, 0n, Nil{}}, O.Nonnegative{0n}}, Con{X.Edge{0n, F.Pending{O.NodeAddress{0n, Nil{}}, Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, Nil{}}, Nil{}, Nil{}, 1n, 1n, 1n, Nil{}}, Con{D.TargetEntry{7n, D.FileTarget{"child", "x", X.Edge{0n, F.Pending{O.NodeAddress{0n, Nil{}}, Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}}}, Nil{}}, Con{D.TargetId{"child", 7n}, Nil{}}, 8n, 7n, 20n, D.Iteration{}}

def fixture_child() -> X.Child:
  X.Child{X.Attempt{7n, X.Edge{0n, F.Pending{O.NodeAddress{0n, Nil{}}, Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, X.FileChild{"child"}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, 10n, "x", Local.FunctionKind{}, Local.Declaration{0n, "", True{}, False{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}, 0n}, F.Created{O.NodeAddress{1n, Nil{}}, Con{F.Node{O.NodeAddress{1n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}, Con{F.AddressEntry{0n, O.NodeAddress{1n, Nil{}}}, Nil{}}}, Signed.State{Recursive.State{MTip{}, Local.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, 0n, 0n}, 0n, Nil{}}, O.Nonnegative{0n}}, Con{F.Pending{O.NodeAddress{1n, Nil{}}, Local.Pending{0n, 0n, "child", "", "x", 2n, Local.FunctionKind{}, Local.Imported{"next", "x"}}}, Nil{}}}

def fixture_phase() -> Phase.Phase:
  Phase.Phase{V.Frame{T.FunctionBranch{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}, G.Graph{G.Capturing{G.Edge{0n, 1n}, 7n}, Nil{}, Nil{}, 1n, 0n, 0n, 0n, False{}, False{}, False{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}}, G.ReadSource{7n}, Nil{}, F.Forest{Some{O.NodeAddress{0n, Nil{}}}, Con{F.Node{O.NodeAddress{0n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}}, Con{V.PendingEntry{0n, V.PendingPayload{O.NodeAddress{0n, Nil{}}, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, Nil{}}, Con{V.TargetEntry{7n, V.FileTarget{"child", "x", V.PendingPayload{O.NodeAddress{0n, Nil{}}, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}, Nil{}}, Con{V.TargetId{"child", 7n}, Nil{}}, Nil{}, Nil{}, Nil{}, V.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, O.Nonnegative{0n}, 0n}, 1n, 1n, 8n, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}, 3n, 1n}, Phase.Child{7n, "child", X.FileChild{"child"}, T.CaptureToken{1n, 3n}, 10n, T.CapturedFacts{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, MLeaf{"x", False{}}, 10n}, 0n, "", 0n, F.Forest{Some{O.NodeAddress{1n, Nil{}}}, Con{F.Node{O.NodeAddress{1n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}}, Con{F.AddressEntry{0n, O.NodeAddress{1n, Nil{}}}, Nil{}}, Con{V.PendingPayload{O.NodeAddress{1n, Nil{}}, 0n, "child", "", "x", 2n, Local.FunctionKind{}, Local.Imported{"next", "x"}}, Nil{}}, Nil{}, V.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, O.Nonnegative{0n}, 0n}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, Phase.Capsule{1n, "root", T.BendLanguage{}, T.BendSourceContext{T.FunctionBranch{}}, T.ClockToken{1n, 2n}, None{}, 7n, 20n, 7n, V.PendingPayload{O.NodeAddress{0n, Nil{}}, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}

def fixture_history() -> V.History:
  V.History{Con{F.AddressEntry{0n, O.NodeAddress{0n, Nil{}}}, Nil{}}, V.Order{Con{0n, Nil{}}, Con{7n, Nil{}}, Con{"child", Nil{}}, Nil{}, Nil{}, Nil{}}, Con{V.EdgeSource{0n, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, Nil{}}, Nil{}, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}, 3n, 1n}

def fixture_child_history() -> Phase.ChildHistory:
  Phase.ChildHistory{F.Created{O.NodeAddress{1n, Nil{}}, Con{F.Node{O.NodeAddress{1n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}, Con{F.AddressEntry{0n, O.NodeAddress{1n, Nil{}}}, Nil{}}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}, T.CaptureToken{1n, 3n}, Nil{}}

def fixture_reply() -> T.Reply:
  T.Reply{1n, 7n, T.ProductEncoded{1n}}

def fixture_world() -> E.WorldState<Unit>:
  E.WorldState{Unit{}, Nil{}}

def fixture_witness() -> Contract.Witness:
  Contract.Witness{T.ResolverState{T.ResolverInput{1n, "root", T.CaptureToken{1n, 3n}, 10n, "x", "", T.FunctionBranch{}, None{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}}, T.MeasuringCandidateTree{}, Some{T.ClockToken{1n, 2n}}, 8n, 20n, Some{T.BendLanguage{}}, "", T.RustContext{None{}, None{}, None{}}, Some{T.ResolverFrame{T.FunctionBranch{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}, G.Graph{G.Capturing{G.Edge{0n, 1n}, 7n}, Nil{}, Nil{}, 1n, 0n, 0n, 0n, False{}, False{}, False{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}}, G.ReadSource{7n}, Nil{}, 0n, Con{Local.PlannedNode{0n, 0n}, Con{Local.PlannedNode{1n, 0n}, Nil{}}}, Con{Local.ReferenceSlot{0n, 0n, "", Local.Expanded{1n}}, Con{Local.ReferenceSlot{1n, 0n, "", Local.Omitted{Local.Unresolved{}, ""}}, Nil{}}}, MTip{}, Local.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, 0n, 0n}, 2n, 2n, 8n, 1n, MNode{32n, MLeaf{"0", Some{Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}, MLeaf{"1", Some{Local.Pending{1n, 0n, "child", "", "x", 2n, Local.FunctionKind{}, Local.Imported{"next", "x"}}}}}, MLeaf{"7", Some{T.FileTarget{"child", "x", Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}}, MLeaf{"child", Some{7n}}, MTip{}, MTip{}, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, None{}, T.ResolverScratch{Nil{}, Nil{}, Some{7n}, None{}, None{}, 0n, None{}, Some{T.TentativeChild{7n, "child", T.CaptureToken{1n, 3n}, 10n, T.CapturedFacts{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, MLeaf{"x", False{}}, 10n}, 0n, "", 0n, Local.Plan{0n, Con{Local.PlannedNode{0n, 0n}, Nil{}}, Con{Local.ReferenceSlot{0n, 0n, "", Local.Omitted{Local.Unresolved{}, ""}}, Nil{}}, Con{Local.Pending{0n, 0n, "child", "", "x", 2n, Local.FunctionKind{}, Local.Imported{"next", "x"}}, Nil{}}, MTip{}, Local.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, 0n, 0n}}, 0n, T.ProductObject{Con{T.OrderedField{"root", T.ProductObject{Con{T.OrderedField{"artifact", T.ProductObject{Con{T.OrderedField{"id", T.ProductText{""}}, Con{T.OrderedField{"kind", T.ProductText{"function"}}, Con{T.OrderedField{"name", T.ProductText{""}}, Con{T.OrderedField{"source", T.ProductText{""}}, Con{T.OrderedField{"sourceHash", T.ProductText{""}}, Nil{}}}}}}}}, Con{T.OrderedField{"references", T.ProductArray{Con{T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"expanded"}}, Con{T.OrderedField{"site", T.ProductObject{Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}, Con{T.OrderedField{"node", T.ProductObject{Con{T.OrderedField{"artifact", T.ProductObject{Con{T.OrderedField{"id", T.ProductText{""}}, Con{T.OrderedField{"kind", T.ProductText{"function"}}, Con{T.OrderedField{"name", T.ProductText{""}}, Con{T.OrderedField{"source", T.ProductText{""}}, Con{T.OrderedField{"sourceHash", T.ProductText{""}}, Nil{}}}}}}}}, Con{T.OrderedField{"references", T.ProductArray{Con{T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"omitted"}}, Con{T.OrderedField{"site", T.ProductObject{Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}, Con{T.OrderedField{"target", T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"unresolved"}}, Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}}, Con{T.OrderedField{"reason", T.ProductText{"unresolved"}}, Nil{}}}}}}, Nil{}}}}, Nil{}}}}}, Nil{}}}}}, Nil{}}}}, Nil{}}}}}, Con{T.OrderedField{"sourceDependencies", T.ProductArray{Nil{}}}, Nil{}}}}, Con{1n, Nil{}}}}, "", "", "", 0n, None{}, None{}, None{}, Nil{}, None{}, None{}, Some{Local.Pending{0n, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}, 0n}, T.PreparedLanguage{G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}, Nil{}}, T.RustWork{False{}, 0n, None{}, Nil{}, Nil{}, Nil{}, "", Nil{}, Nil{}, "", False{}, T.CapturedTaskReturn{}}}, T.Request{1n, 7n, T.EncodeProduct{T.ProductObject{Con{T.OrderedField{"root", T.ProductObject{Con{T.OrderedField{"artifact", T.ProductObject{Con{T.OrderedField{"id", T.ProductText{""}}, Con{T.OrderedField{"kind", T.ProductText{"function"}}, Con{T.OrderedField{"name", T.ProductText{""}}, Con{T.OrderedField{"source", T.ProductText{""}}, Con{T.OrderedField{"sourceHash", T.ProductText{""}}, Nil{}}}}}}}}, Con{T.OrderedField{"references", T.ProductArray{Con{T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"expanded"}}, Con{T.OrderedField{"site", T.ProductObject{Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}, Con{T.OrderedField{"node", T.ProductObject{Con{T.OrderedField{"artifact", T.ProductObject{Con{T.OrderedField{"id", T.ProductText{""}}, Con{T.OrderedField{"kind", T.ProductText{"function"}}, Con{T.OrderedField{"name", T.ProductText{""}}, Con{T.OrderedField{"source", T.ProductText{""}}, Con{T.OrderedField{"sourceHash", T.ProductText{""}}, Nil{}}}}}}}}, Con{T.OrderedField{"references", T.ProductArray{Con{T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"omitted"}}, Con{T.OrderedField{"site", T.ProductObject{Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}, Con{T.OrderedField{"target", T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"unresolved"}}, Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}}, Con{T.OrderedField{"reason", T.ProductText{"unresolved"}}, Nil{}}}}}}, Nil{}}}}, Nil{}}}}}, Nil{}}}}}, Nil{}}}}, Nil{}}}}}, Con{T.OrderedField{"sourceDependencies", T.ProductArray{Nil{}}}, Nil{}}}}}}, T.ProductObject{Con{T.OrderedField{"root", T.ProductObject{Con{T.OrderedField{"artifact", T.ProductObject{Con{T.OrderedField{"id", T.ProductText{""}}, Con{T.OrderedField{"kind", T.ProductText{"function"}}, Con{T.OrderedField{"name", T.ProductText{""}}, Con{T.OrderedField{"source", T.ProductText{""}}, Con{T.OrderedField{"sourceHash", T.ProductText{""}}, Nil{}}}}}}}}, Con{T.OrderedField{"references", T.ProductArray{Con{T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"expanded"}}, Con{T.OrderedField{"site", T.ProductObject{Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}, Con{T.OrderedField{"node", T.ProductObject{Con{T.OrderedField{"artifact", T.ProductObject{Con{T.OrderedField{"id", T.ProductText{""}}, Con{T.OrderedField{"kind", T.ProductText{"function"}}, Con{T.OrderedField{"name", T.ProductText{""}}, Con{T.OrderedField{"source", T.ProductText{""}}, Con{T.OrderedField{"sourceHash", T.ProductText{""}}, Nil{}}}}}}}}, Con{T.OrderedField{"references", T.ProductArray{Con{T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"omitted"}}, Con{T.OrderedField{"site", T.ProductObject{Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}, Con{T.OrderedField{"target", T.ProductObject{Con{T.OrderedField{"kind", T.ProductText{"unresolved"}}, Con{T.OrderedField{"symbol", T.ProductText{""}}, Nil{}}}}}, Con{T.OrderedField{"reason", T.ProductText{"unresolved"}}, Nil{}}}}}}, Nil{}}}}, Nil{}}}}}, Nil{}}}}}, Nil{}}}}, Nil{}}}}}, Con{T.OrderedField{"sourceDependencies", T.ProductArray{Nil{}}}, Nil{}}}}, V.Frame{T.FunctionBranch{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}, G.Graph{G.Capturing{G.Edge{0n, 1n}, 7n}, Nil{}, Nil{}, 1n, 0n, 0n, 0n, False{}, False{}, False{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}}, G.ReadSource{7n}, Nil{}, F.Forest{Some{O.NodeAddress{0n, Nil{}}}, Con{F.Node{O.NodeAddress{0n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Expanded{F.ReferenceSymbol{""}, O.NodeAddress{1n, Nil{}}}, Nil{}}}, Con{F.Node{O.NodeAddress{1n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}}}, Con{V.PendingEntry{0n, V.PendingPayload{O.NodeAddress{0n, Nil{}}, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, Con{V.PendingEntry{1n, V.PendingPayload{O.NodeAddress{1n, Nil{}}, 0n, "child", "", "x", 2n, Local.FunctionKind{}, Local.Imported{"next", "x"}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, Nil{}}}, Con{V.TargetEntry{7n, V.FileTarget{"child", "x", V.PendingPayload{O.NodeAddress{0n, Nil{}}, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}, Nil{}}, Con{V.TargetId{"child", 7n}, Nil{}}, Nil{}, Nil{}, Nil{}, V.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, O.Nonnegative{0n}, 0n}, 2n, 2n, 8n, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}, 3n, 2n}, B.Selected{T.Request{1n, 8n, T.ReadClock{T.ClockToken{1n, 2n}}}, V.Frame{T.FunctionBranch{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}, G.Graph{G.GraphReady{}, Con{G.Edge{1n, 2n}, Nil{}}, Con{7n, Nil{}}, 2n, 10n, 1n, 0n, False{}, False{}, False{}, G.Limits{1n, 20n, 20n, 100n, 20n, 20n, 100n, 20n}}, G.NoCommand{}, Nil{}, F.Forest{Some{O.NodeAddress{0n, Nil{}}}, Con{F.Node{O.NodeAddress{0n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Expanded{F.ReferenceSymbol{""}, O.NodeAddress{1n, Nil{}}}, Nil{}}}, Con{F.Node{O.NodeAddress{1n, Nil{}}, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Con{F.Omitted{F.ReferenceSymbol{""}, F.ReferenceSymbol{""}, Local.Unresolved{}}, Nil{}}}, Nil{}}}}, Con{V.PendingEntry{0n, V.PendingPayload{O.NodeAddress{0n, Nil{}}, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, Con{V.PendingEntry{1n, V.PendingPayload{O.NodeAddress{1n, Nil{}}, 0n, "child", "", "x", 2n, Local.FunctionKind{}, Local.Imported{"next", "x"}}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}, Root.Source{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}}}, Nil{}}}, Con{V.TargetEntry{7n, V.FileTarget{"child", "x", V.PendingPayload{O.NodeAddress{0n, Nil{}}, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}, Nil{}}, Con{V.TargetId{"child", 7n}, Nil{}}, Con{V.CapturedEntry{"child", T.CapturedFacts{Local.Facts{False{}, MLeaf{"x", Some{Local.Declaration{0n, "", True{}, False{}, Nil{}}}}, MTip{}, MTip{}}, MLeaf{"x", False{}}, 10n}, T.SourceFacts{Some{False{}}, Con{T.FactDeclaration{"x", T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}, Nil{}, False{}}, Nil{}}, Nil{}, Nil{}}}, Nil{}}, Con{V.TargetArtifact{7n, ""}, Nil{}}, Nil{}, V.Budget{Local.LocalLimits{20n, 100n, 100n}, MTip{}, 0n, 0n, O.Nonnegative{0n}, 0n}, 2n, 2n, 8n, 1n, Con{T.ArtifactEntry{0n, T.Artifact{None{}, None{}, "", T.FunctionArtifact{}, "", "", "", Con{T.ArtifactIdKey{}, Con{T.ArtifactKindKey{}, Con{T.ArtifactNameKey{}, Con{T.ArtifactSourceKey{}, Con{T.ArtifactHashKey{}, Nil{}}}}}}}}, Nil{}}, 2n, 2n}, B.CheckingIteration{Phase.Capsule{1n, "root", T.BendLanguage{}, T.BendSourceContext{T.FunctionBranch{}}, T.ClockToken{1n, 2n}, None{}, 9n, 19n, 7n, V.PendingPayload{O.NodeAddress{0n, Nil{}}, 0n, "root", "", "x", 1n, Local.FunctionKind{}, Local.Imported{"child", "x"}}}}}}

def literal_claim_1() ->
  {Attach.previous(0n, fixture_actual())
    == Loop.ServiceStep{T.AwaitService{Contract.witness_state(fixture_witness()), Contract.witness_request(fixture_witness())}}
    : Loop.Continuation}:
  {==}

def literal_claim_2() ->
  {Contract.operation(Contract.witness_request(fixture_witness())) == T.EncodeProduct{Contract.witness_product(fixture_witness())} : T.Operation}:
  {==}

def literal_claim_3() ->
  {S.state_stage(Contract.witness_state(fixture_witness())) == T.MeasuringCandidateTree{} : T.ResolverStage}:
  {==}

def literal_claim_4() ->
  {ReferenceBoundary.selected_request(ReferenceBoundary.enter(fixture_reference(), fixture_child(), 0n))
    == Some{Contract.witness_request(fixture_witness())} : Maybe<&2, T.Request>}:
  {==}

def literal_claim_5() ->
  {Contract.actual_frame(S.state_frame(Contract.witness_state(fixture_witness())), History.measurement(fixture_phase(), fixture_history()))
    == Some{Contract.witness_staged(fixture_witness())} : Maybe<&2, V.Frame>}:
  {==}

def literal_claim_6() ->
  {
    Staged.project(
      ReferenceBoundary.enter(fixture_reference(), fixture_child(), 0n),
      History.measurement(fixture_phase(), fixture_history())
    )
    == Some{Contract.witness_staged(fixture_witness())}
    : Maybe<&2, V.Frame>
  }:
  {==}

def literal_claim_7() ->
  {
    ActualBoundary.project(
      Machine.resume(Attach.previous(0n, fixture_actual()), T.ServiceReply{fixture_reply()}),
      History.reply(
        fixture_phase(),
        History.measurement(fixture_phase(), fixture_history()),
        0n,
        Contract.witness_request(fixture_witness()),
        fixture_reply()
      )
    )
    == Some{Contract.witness_boundary(fixture_witness())}
    : Maybe<&2, B.Boundary>
  }:
  {==}

def literal_claim_8() ->
  {
    ReferenceBoundaryView.project(
      Unit,
      ReferenceBoundary.deliver_next(
        Unit,
        ReferenceBoundary.enter(fixture_reference(), fixture_child(), 0n),
        fixture_reply(),
        fixture_world()
      ),
      fixture_child(),
      History.reply(
        fixture_phase(),
        History.measurement(fixture_phase(), fixture_history()),
        0n,
        Contract.witness_request(fixture_witness()),
        fixture_reply()
      )
    )
    == Some{Contract.witness_boundary(fixture_witness())}
    : Maybe<&2, B.Boundary>
  }:
  {==}

def literal_claim_9() ->
  {
    Contract.progress_world(
      Unit,
      ReferenceBoundary.deliver_next(
        Unit,
        ReferenceBoundary.enter(fixture_reference(), fixture_child(), 0n),
        fixture_reply(),
        fixture_world()
      )
    )
    == Some{fixture_world()}
    : Maybe<&2, E.WorldState<Unit>>
  }:
  {==}
def actual_ready_instance() -> {ActualReady.project(fixture_actual(), fixture_history(), fixture_child_history()) == Some{fixture_phase()} : Maybe<&2, Phase.Phase>}:
  {==}
def reference_ready_instance() -> {ReferenceReady.project(fixture_reference(), fixture_child(), fixture_history(), fixture_child_history()) == Some{fixture_phase()} : Maybe<&2, Phase.Phase>}:
  {==}
def budget_instance() -> {Contract.phase_frame_budget(fixture_phase()) == Contract.phase_child_budget(fixture_phase()) : V.Budget}:
  {==}

def original_law_instance() -> Contract.claim(Unit, fixture_actual(), fixture_reference(), fixture_child(), fixture_phase(), fixture_history(), 0n, fixture_reply(), fixture_world(), fixture_witness()):
  (literal_claim_1(), (literal_claim_2(), (literal_claim_3(), (literal_claim_4(), (literal_claim_5(), (literal_claim_6(), (literal_claim_7(), (literal_claim_8(), literal_claim_9()))))))))

def original_existential_instance() -> Contract.conclusion(Unit, fixture_actual(), fixture_reference(), fixture_child(), fixture_phase(), fixture_history(), 0n, fixture_reply(), fixture_world()):
  Tuple{fixture_witness(), original_law_instance()}

def main() -> Unit:
  Unit{}
