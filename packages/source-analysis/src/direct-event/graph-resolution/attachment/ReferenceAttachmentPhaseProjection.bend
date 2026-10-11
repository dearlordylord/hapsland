import Base
import ./AttachmentPhaseView.bend as Phase
import ./AttachmentFrameView.bend as V
import ./ReferenceAttachmentFrameProjection.bend as Frame
import ../Types.bend as T
import ../ForestSpecification.bend as F
import ../ExpansionSpecification.bend as X
import ../ExpansionDriverSpecification.bend as D
import ../SignedLocalSpecification.bend as Signed
import ../traversal/core.bend as Local
import ../traversal/SPEC.bend as Recursive

# Independent ready-phase view. State/attempt/created fields are read from the
# reference driver, never copied from an actual phase or an expected outcome.
# Equal successful views establish correspondence; the actual projection and
# reachable relation supply creation, catalog, slot and freshness invariants.
def pending(items: List<&2, F.Pending>) -> List<&2, V.PendingPayload>:
  match items:
    case []: []
    case head <> tail: Frame.payload(head) <> pending(tail)

def file_exports(kind: X.ChildKind, source: T.SourceFacts) -> Map<&2, Bool>:
  match kind:
    case X.FileChild{_}: Frame.source_exports(source)
    case X.BundledChild{}: Map.new(&2, Bool)

def child_view(child: X.Child, history: Phase.ChildHistory,
    visited: Maybe<&2, List<&2, String>>) -> Maybe<&2, Phase.Child>:
  match child history visited:
    case X.Child{X.Attempt{+target, edge, +kind, +source, +bytes, name, expected,
        Local.Declaration{+handle, +identity, function, bundled, references}, +catalog, +before},
      F.Created{root, nodes, addresses},
      Signed.State{Recursive.State{_, budget, _, _}, signed}, edges}
      Phase.ChildHistory{_, _, _, capture, _} Some{visited}:
      Some{Phase.Child{target,
        X.attempt_path(X.Attempt{target, edge, kind, source, bytes, name, expected,
          Local.Declaration{handle, identity, function, bundled, references}, catalog, before}),
        kind, capture, bytes,
        T.CapturedFacts{Frame.facts(catalog), file_exports(kind, source), bytes},
        handle, identity, before, F.Forest{Some{root}, nodes}, addresses,
        pending(edges), visited, V.budget(budget, signed), source, catalog}}
    case _ _ _: None{}

def child_project(+child: X.Child, +history: Phase.ChildHistory) -> Maybe<&2, Phase.Child>:
  match child history:
    case X.Child{_, _, Signed.State{Recursive.State{values, _, _, _}, _}, _}
      Phase.ChildHistory{_, _, _, _, order}:
      child_view(child, history, Frame.visited(order, values))

def capsule(state: D.State, child: X.Child) -> Phase.Capsule:
  match state child:
    case D.State{D.Config{invocation, path, language, context, clock, cache},
      _, _, _, _, next, iterations, _}
      X.Child{X.Attempt{target, edge, _, _, _, _, _, _, _, _}, _, _, _}:
      Phase.Capsule{invocation, path, language, context, clock, cache,
        next, iterations, target, Frame.edge_payload(edge)}

def assembled(frame: Maybe<&2, V.Frame>, child: Maybe<&2, Phase.Child>,
    capsule: Phase.Capsule) -> Maybe<&2, Phase.Phase>:
  match frame child:
    case Some{frame} Some{child}: Some{Phase.Phase{frame, child, capsule}}
    case _ _: None{}

def project(+state: D.State, +child: X.Child, history: V.History,
    child_history: Phase.ChildHistory) -> Maybe<&2, Phase.Phase>:
  assembled(
    Frame.project(state, history),
    child_project(child, child_history),
    capsule(state, child)
  )

def main() -> Unit:
  Unit{}
