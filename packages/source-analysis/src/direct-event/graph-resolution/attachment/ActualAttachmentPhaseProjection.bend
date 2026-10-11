import Base
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia
import ./AttachmentPhaseView.bend as Phase
import ./AttachmentFrameView.bend as V
import ./ActualAttachmentFrameProjection.bend as Frame
import ./RetainedForestProjection.bend as P
import ./ForestRelation.bend as Relation
import ../Types.bend as T
import ../State.bend as S
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../ExpansionSpecification.bend as X
import ../traversal/core.bend as Local

# Actual ready-phase projection uses state-owned scratch, not coherent-looking
# child/frame arguments supplied independently of the real entry.
def pending_prefix(
  value: Maybe<&2, V.PendingPayload>,
  rest: Maybe<&2, List<&2, V.PendingPayload>>
) -> Maybe<&2, List<&2, V.PendingPayload>>:
  match value rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def pending(
  items: List<&2, Local.Pending>,
  +addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, List<&2, V.PendingPayload>>:
  match items:
    case []: Some{[]}
    case head <> tail:
      pending_prefix(V.pending_payload(head, addresses), pending(tail, addresses))

def slot_count(
  items: List<&2, Local.ReferenceSlot>,
  +owner: Nat,
  +index: Nat,
  +symbol: String
) -> Nat:
  match items:
    case []: 0n
    case Local.ReferenceSlot{actual, position, text, _} <> tail:
      (Bool.pick(Nat, Bool.and(Nat.is_eq(owner, actual),
        Bool.and(Nat.is_eq(index, position), String.eq(symbol, text))), 1n, 0n)
        + slot_count(tail, owner, index, symbol) : Nat)

def selected_slot(edge: Local.Pending, items: List<&2, Local.ReferenceSlot>) -> Bool:
  match edge:
    case Local.Pending{owner, index, _, symbol, _, _, _, _}:
      Nat.is_eq(slot_count(items, owner, index, symbol), 1n)

def pending_slots(items: List<&2, Local.Pending>, +slots: List<&2, Local.ReferenceSlot>) -> Bool:
  match items:
    case []: True{}
    case head <> tail: Bool.and(selected_slot(head, slots), pending_slots(tail, slots))

def episode_nodes(items: List<&2, F.Node>, +episode: Nat) -> Bool:
  match items:
    case []: True{}
    case F.Node{O.NodeAddress{actual, _}, _, _} <> tail:
      Bool.and(Nat.is_eq(actual, episode), episode_nodes(tail, episode))

def fresh_forest(+forest: F.Forest, +episode: Nat) -> Bool:
  match forest:
    case F.Forest{Some{root}, nodes}:
      Bool.and(
        F.same_address(root, O.NodeAddress{episode, []}),
        Bool.and(episode_nodes(nodes, episode), Relation.frame_forest(forest, (episode + 1n : Nat)))
      )
    case _: False{}

def valid_forest(+forest: Maybe<&2, F.Forest>, episode: Nat) -> Maybe<&2, F.Forest>:
  match forest:
    case Some{value}: Bool.pick(Maybe<&2, F.Forest>, fresh_forest(value, episode), forest, None{})
    case None{}: None{}

def kind(target: Local.PendingTarget, path: String) -> X.ChildKind:
  match target:
    case Local.BundledTarget{_}: X.BundledChild{}
    case _: X.FileChild{path}

def edge_kind(edge: Local.Pending, path: String) -> X.ChildKind:
  match edge:
    case Local.Pending{_, _, _, _, _, _, _, target}: kind(target, path)

def child_view(forest: Maybe<&2, F.Forest>, pending: Maybe<&2, List<&2, V.PendingPayload>>,
    visited: Maybe<&2, List<&2, String>>, child: T.TentativeChild, edge: Local.Pending,
    history: Phase.ChildHistory) -> Maybe<&2, Phase.Child>:
  match forest pending visited child history:
    case Some{forest} Some{pending} Some{visited}
      T.TentativeChild{target, +path, capture, bytes, file, artifact, identity, before,
        Local.Plan{_, _, _, _, _, budget}, _, _, _}
      Phase.ChildHistory{F.Created{_, _, addresses}, source, catalog, _, _}:
      Some{Phase.Child{target, path, edge_kind(edge, path), capture, bytes, file,
        artifact, identity, before, forest, addresses, pending, visited,
        V.actual_budget(budget), source, catalog}}
    case _ _ _ _ _: None{}

def visited_validated(
  valid: Bool,
  order: List<&2, String>,
  entries: Map<&2, Bool>
) -> Maybe<&2, List<&2, String>>:
  match valid:
    case True{}: Frame.visited(order, entries)
    case False{}: None{}

def visited_complete(
  +order: List<&2, String>,
  +entries: Map<&2, Bool>
) -> Maybe<&2, List<&2, String>>:
  visited_validated(
    Bool.and(
      Frame.strings_unique(order, order),
      Nat.is_eq(
        List.length(&2, String, order),
        List.length(&2, String, Map.keys(&2, Bool, entries))
      )
    ),
    order,
    entries
  )

def child_projected(
  +child: T.TentativeChild,
  +edge: Local.Pending,
  history: Phase.ChildHistory,
  artifacts: List<&2, T.ArtifactEntry>,
  episode: Nat
) -> Maybe<&2, Phase.Child>:
  match child history:
    case T.TentativeChild{_, _, _, _, _, _, _, _,
      Local.Plan{root, +nodes, +slots, +edges, visited, _}, _, _, _}
      +provenance:
      match provenance:
        case Phase.ChildHistory{F.Created{_, _, +addresses}, _, _, _, order}:
          child_view(valid_forest(P.project(root, nodes, slots, artifacts, addresses), episode),
            pending(edges, addresses), visited_complete(order, visited), child, edge, provenance)

def child_validated(
  valid: Bool,
  child: T.TentativeChild,
  edge: Local.Pending,
  history: Phase.ChildHistory,
  artifacts: List<&2, T.ArtifactEntry>,
  episode: Nat
) -> Maybe<&2, Phase.Child>:
  match valid:
    case True{}: child_projected(child, edge, history, artifacts, episode)
    case False{}: None{}

def child_project(
  +child: T.TentativeChild,
  edge: Local.Pending,
  history: Phase.ChildHistory,
  artifacts: List<&2, T.ArtifactEntry>,
  episode: Nat
) -> Maybe<&2, Phase.Child>:
  match child:
    case T.TentativeChild{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      Local.Plan{_, +nodes, +slots, edges, _, _},
      _,
      _,
      _
    }:
      child_validated(
        Bool.and(Frame.dense(nodes, 0n), pending_slots(edges, slots)),
        child,
        edge,
        history,
        artifacts,
        episode
      )

def context(language: T.Language, branch: T.Branch, rust: T.RustContext) -> T.FrontendContext:
  match language:
    case T.TypeScriptLanguage{}: T.TypeScriptContext{branch}
    case T.RustLanguage{}: T.RustSourceContext{branch, rust}
    case T.BendLanguage{}: T.BendSourceContext{branch}
    case T.PythonLanguage{}: T.PythonSourceContext{branch}

def capsule(
  clock: Maybe<&2, T.ClockToken>,
  language: Maybe<&2, T.Language>,
  active: Maybe<&2, Nat>,
  edge: Maybe<&2, V.PendingPayload>,
  state: T.ResolverState
) -> Maybe<&2, Phase.Capsule>:
  match clock language active edge state:
    case Some{clock} Some{+language} Some{active} Some{edge}
      T.ResolverState{T.ResolverInput{invocation, path, _, _, _, _, branch, cache, _},
        _, _, next, iterations, _, _, rust, _, _, _, _, _}:
      Some{Phase.Capsule{invocation, path, language, context(language, branch, rust),
        clock, cache, next, iterations, active, edge}}
    case _ _ _ _ _: None{}

def assembled(frame: Maybe<&2, V.Frame>, child: Maybe<&2, Phase.Child>,
    capsule: Maybe<&2, Phase.Capsule>) -> Maybe<&2, Phase.Phase>:
  match frame child capsule:
    case Some{frame} Some{child} Some{capsule}: Some{Phase.Phase{frame, child, capsule}}
    case _ _ _: None{}

def projected(valid: Bool, +state: T.ResolverState, +frame: T.ResolverFrame,
    +child: T.TentativeChild, +edge: Local.Pending, +history: V.History,
    child_history: Phase.ChildHistory) -> Maybe<&2, Phase.Phase>:
  match valid history:
    case True{} V.History{addresses, _, _, _, _, _, episode}:
      assembled(
        Frame.project(frame, history),
        child_project(child, edge, child_history, S.frame_artifacts(frame), episode),
        capsule(
          S.state_clock(state),
          S.state_language(state),
          S.scratch_active_target(S.state_scratch(state)),
          V.pending_payload(edge, addresses),
          state
        )
      )
    case _ _: None{}

# Fresh registration IDs are an internal chronology invariant. Equal views
# alone do not prevent overwriting an existing pending association.
def pending_ids_before(items: List<&2, Nat>, +next: Nat) -> Bool:
  match items:
    case []: True{}
    case head <> tail: Bool.and(Nat.is_lt(head, next), pending_ids_before(tail, next))

def provenance_ids(items: List<&2, V.EdgeSource>) -> List<&2, Nat>:
  match items:
    case []: []
    case V.EdgeSource{id, _, _} <> tail: id <> provenance_ids(tail)

def provenance_members(items: List<&2, Nat>, +pending: List<&2, Nat>) -> Bool:
  match items:
    case []: True{}
    case head <> tail: Bool.and(
      Nat.is_eq(Frame.nat_count(pending, head), 1n),
      provenance_members(tail, pending)
    )

def provenance_complete(+ids: List<&2, Nat>, +pending: List<&2, Nat>) -> Bool:
  Bool.and(Frame.nats_unique(ids, ids), Bool.and(
    Nat.is_eq(List.length(&2, Nat, ids), List.length(&2, Nat, pending)),
    provenance_members(ids, pending)))

def mutable_maps_canonical(+frame: T.ResolverFrame) -> Bool:
  Bool.and(Patricia.canonical(Maybe<&2, Local.Pending>, S.frame_pending(frame)),
    Bool.and(Patricia.canonical(Maybe<&2, T.CapturedFacts>, S.frame_captured(frame)),
      Patricia.canonical(Maybe<&2, String>, S.frame_target_artifacts(frame))))

def fresh_registration(history: V.History, frame: T.ResolverFrame) -> Bool:
  match history:
    case V.History{_, V.Order{+pending, _, _, _, _, _}, edges, _, _, _, _}:
      Bool.and(
        pending_ids_before(pending, S.frame_next_edge(frame)),
        provenance_complete(provenance_ids(edges), pending)
      )

def parts(+state: T.ResolverState, frame: Maybe<&2, T.ResolverFrame>,
    child: Maybe<&2, T.TentativeChild>, edge: Maybe<&2, Local.Pending>,
    +history: V.History, child_history: Phase.ChildHistory) -> Maybe<&2, Phase.Phase>:
  match frame child edge history:
    case Some{+frame} Some{child} Some{+edge} V.History{_, _, _, _, _, remaining, _}:
      projected(Bool.and(mutable_maps_canonical(frame), Bool.and(fresh_registration(history, frame),
        Bool.and(Nat.is_gt(remaining, 0n), selected_slot(edge, S.frame_references(frame))))),
        state, frame, child, edge, history, child_history)
    case _ _ _ _: None{}

def project(+state: T.ResolverState, history: V.History,
    child_history: Phase.ChildHistory) -> Maybe<&2, Phase.Phase>:
  parts(state, S.state_frame(state), S.scratch_tentative(S.state_scratch(state)),
    S.scratch_pending_edge(S.state_scratch(state)), history, child_history)

def main() -> Unit:
  Unit{}
