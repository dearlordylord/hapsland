import Base
import ./AttachmentMapPayloadTransport.bend as Payload
import ../traversal/patricia-proof/PATRICIA_RELATION.bend as Patricia
import ./AttachmentNaturalArithmeticFacts.bend as Arithmetic
import ../traversal/INTERPRETER_BOOL_FACTS.bend as BoolFacts
import ../traversal/INTERPRETER_NAT_FACTS.bend as NatFacts
import ../traversal/INTERPRETER_STRING_FACTS.bend as StringFacts
import ./AttachmentParentAppendTransport.bend as Parent
import ./AttachmentMaterializationTransport.bend as Materialization
import ../../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import ./RetainedForestProjection.bend as P
import ./ForestRelation.bend as Relation
import ../ForestSpecification.bend as F
import ./AttachmentProjectionAllowanceProof.bend as Count
import ../BoundaryValidationSpecification.bend as Boundary
import ./AttachmentProjectionContentsProof.bend as Contents
import ../traversal/core.bend as Local
import ./AttachmentTransactionContract.bend as Contract
import ./AttachmentFrameView.bend as V
import ./AttachmentPhaseView.bend as Phase
import ./AttachmentBoundaryView.bend as B
import ./ActualAttachmentPhaseProjection.bend as ActualReady
import ./ReferenceAttachmentPhaseProjection.bend as ReferenceReady
import ./ActualAttachmentFrameProjection.bend as ActualFrame
import ./ReferenceAttachmentFrameProjection.bend as ReferenceFrame
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
import ../ExpansionDriverState.bend as D

# Eliminate the law's successful actual projection into the real state-owned
# frame, tentative child and selected edge. These are conclusions, not new
# readiness assumptions supplied to the transaction.
def actual_parts_result(+frame: Maybe<&2, T.ResolverFrame>,
    +child: Maybe<&2, T.TentativeChild>, +edge: Maybe<&2, Local.Pending>) -> Type:
  Exists(T.ResolverFrame, retained => Exists(T.TentativeChild, tentative =>
    Exists(Local.Pending, selected =>
      {frame == Some{retained} : Maybe<&2, T.ResolverFrame>} &
      {child == Some{tentative} : Maybe<&2, T.TentativeChild>} &
      {edge == Some{selected} : Maybe<&2, Local.Pending>})))

def actual_parts(+state: T.ResolverState, +frame: Maybe<&2, T.ResolverFrame>,
    +child: Maybe<&2, T.TentativeChild>, +edge: Maybe<&2, Local.Pending>,
    +history: V.History, +child_history: Phase.ChildHistory, +phase: Phase.Phase,
    ready: {ActualReady.parts(state, frame, child, edge, history, child_history)
      == Some{phase} : Maybe<&2, Phase.Phase>}) -> actual_parts_result(frame, child, edge):
  match frame child edge history:
    case Some{retained} Some{tentative} Some{selected} _:
      Tuple{retained, Tuple{tentative, Tuple{selected, Tuple{{==}, Tuple{{==}, {==}}}}}}
    case None{} _ _ V.History{_, _, _, _, _, _, _}:
      Empty.absurd(actual_parts_result(None{}, child, edge),
        Contents.none_some(Phase.Phase, phase, ready))
    case Some{_} None{} _ V.History{_, _, _, _, _, _, _}:
      Empty.absurd(actual_parts_result(frame, None{}, edge),
        Contents.none_some(Phase.Phase, phase, ready))
    case Some{_} Some{_} None{} V.History{_, _, _, _, _, _, _}:
      Empty.absurd(actual_parts_result(frame, child, None{}),
        Contents.none_some(Phase.Phase, phase, ready))

def actual_ready_parts(+state: T.ResolverState, +history: V.History,
    +child_history: Phase.ChildHistory, +phase: Phase.Phase,
    ready: {ActualReady.project(state, history, child_history)
      == Some{phase} : Maybe<&2, Phase.Phase>}) ->
    actual_parts_result(S.state_frame(state), S.scratch_tentative(S.state_scratch(state)),
      S.scratch_pending_edge(S.state_scratch(state))):
  actual_parts(state, S.state_frame(state), S.scratch_tentative(S.state_scratch(state)),
    S.scratch_pending_edge(S.state_scratch(state)), history, child_history, phase, ready)

# Lossless elimination of the common Phase: both sides retain all frame,
# child and continuation fields, rather than assuming selected summaries agree.
def assembled_result(+frame: Maybe<&2, V.Frame>, +child: Maybe<&2, Phase.Child>,
    +capsule: Maybe<&2, Phase.Capsule>, phase: Phase.Phase) -> Type:
  match phase:
    case Phase.Phase{expected_frame, expected_child, expected_capsule}:
      {frame == Some{expected_frame} : Maybe<&2, V.Frame>} &
      {child == Some{expected_child} : Maybe<&2, Phase.Child>} &
      {capsule == Some{expected_capsule} : Maybe<&2, Phase.Capsule>}

def assembled_contents(+frame: Maybe<&2, V.Frame>, +child: Maybe<&2, Phase.Child>,
    +capsule: Maybe<&2, Phase.Capsule>, +phase: Phase.Phase,
    ready: {ActualReady.assembled(frame, child, capsule) == Some{phase} : Maybe<&2, Phase.Phase>}) ->
    assembled_result(frame, child, capsule, phase):
  match frame child capsule:
    case Some{+retained} Some{+tentative} Some{+continuation}:
      %Count.some_equal(Phase.Phase, Phase.Phase{retained, tentative, continuation}, phase, ready):
        assembled_result(Some{retained}, Some{tentative}, Some{continuation}, _)
      Tuple{{==}, Tuple{{==}, {==}}}
    case None{} _ _:
      Empty.absurd(assembled_result(None{}, child, capsule, phase), Contents.none_some(Phase.Phase, phase, ready))
    case Some{_} None{} _:
      Empty.absurd(assembled_result(frame, None{}, capsule, phase), Contents.none_some(Phase.Phase, phase, ready))
    case Some{_} Some{_} None{}:
      Empty.absurd(assembled_result(frame, child, None{}, phase), Contents.none_some(Phase.Phase, phase, ready))

def reference_assembled_contents(+frame: Maybe<&2, V.Frame>, +child: Maybe<&2, Phase.Child>,
    +capsule: Phase.Capsule, +phase: Phase.Phase,
    ready: {ReferenceReady.assembled(frame, child, capsule) == Some{phase} : Maybe<&2, Phase.Phase>}) ->
    assembled_result(frame, child, Some{capsule}, phase):
  match frame child:
    case Some{retained} Some{tentative}:
      assembled_contents(Some{retained}, Some{tentative}, Some{capsule}, phase, ready)
    case None{} _:
      Empty.absurd(assembled_result(None{}, child, Some{capsule}, phase), Contents.none_some(Phase.Phase, phase, ready))
    case Some{_} None{}:
      Empty.absurd(assembled_result(frame, None{}, Some{capsule}, phase), Contents.none_some(Phase.Phase, phase, ready))

def projected_phase_result(+valid: Bool, +state: T.ResolverState, +frame: T.ResolverFrame,
    +child: T.TentativeChild, +edge: Local.Pending, +history: V.History,
    +child_history: Phase.ChildHistory, +phase: Phase.Phase) -> Type:
  match history:
    case V.History{addresses, _, _, _, _, _, episode}:
      {valid == True{} : Bool} & assembled_result(
        ActualFrame.project(frame, history),
        ActualReady.child_project(child, edge, child_history, S.frame_artifacts(frame), episode),
        ActualReady.capsule(S.state_clock(state), S.state_language(state),
          S.scratch_active_target(S.state_scratch(state)), V.pending_payload(edge, addresses), state),
        phase)

def projected_phase_contents(+valid: Bool, +state: T.ResolverState, +frame: T.ResolverFrame,
    +child: T.TentativeChild, +edge: Local.Pending, +history: V.History,
    +child_history: Phase.ChildHistory, +phase: Phase.Phase,
    ready: {ActualReady.projected(valid, state, frame, child, edge, history, child_history)
      == Some{phase} : Maybe<&2, Phase.Phase>}) ->
    projected_phase_result(valid, state, frame, child, edge, history, child_history, phase):
  match valid history:
    case True{} V.History{addresses, _, _, _, _, _, episode}:
      Tuple{{==}, assembled_contents(ActualFrame.project(frame, history),
        ActualReady.child_project(child, edge, child_history, S.frame_artifacts(frame), episode),
        ActualReady.capsule(S.state_clock(state), S.state_language(state),
          S.scratch_active_target(S.state_scratch(state)), V.pending_payload(edge, addresses), state), phase, ready)}
    case False{} _:
      Empty.absurd(projected_phase_result(False{}, state, frame, child, edge, history, child_history, phase),
        Contents.none_some(Phase.Phase, phase, ready))

def reference_ready_contents(+state: D.State, +child: X.Child, +history: V.History,
    +child_history: Phase.ChildHistory, +phase: Phase.Phase,
    ready: {ReferenceReady.project(state, child, history, child_history)
      == Some{phase} : Maybe<&2, Phase.Phase>}) ->
    assembled_result(ReferenceFrame.project(state, history),
      ReferenceReady.child_project(child, child_history), Some{ReferenceReady.capsule(state, child)}, phase):
  reference_assembled_contents(ReferenceFrame.project(state, history),
    ReferenceReady.child_project(child, child_history), ReferenceReady.capsule(state, child), phase, ready)

# Recover the exact runtime frame checks needed by parent append and product
# totality. No successful materialization or registration is assumed.
def frame_validated_contents(+valid: Bool, +frame: T.ResolverFrame, +history: V.History,
    +view: V.Frame,
    ready: {ActualFrame.validated(valid, frame, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {valid == True{} : Bool} &
    {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>}:
  match valid:
    case True{}: Tuple{{==}, ready}
    case False{}:
      Empty.absurd({False{} == True{} : Bool} &
        {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>},
        Contents.none_some(V.Frame, view, ready))

def frame_checks(+frame: T.ResolverFrame, history: V.History) -> Bool:
  match history:
    case V.History{_, order, _, _, _, _, _}:
      Bool.and(ActualFrame.coverage(order, frame),
        Bool.and(ActualFrame.dense(S.frame_nodes(frame), 0n),
          Bool.and(Nat.is_eq(S.frame_next_node(frame), List.length(&2, Local.PlannedNode, S.frame_nodes(frame))),
            ActualFrame.catalog_valid(S.frame_artifacts(frame)))))

def actual_frame_contents(+frame: T.ResolverFrame, +history: V.History, +view: V.Frame,
    ready: {ActualFrame.project(frame, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {frame_checks(frame, history) == True{} : Bool} &
    {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>}:
  match history:
    case V.History{_, _, _, _, _, _, _}:
      frame_validated_contents(frame_checks(frame, history), frame, history, view, ready)

def forest_validated_contents(+valid: Bool, +forest: F.Forest, +retained: F.Forest,
    ready: {Bool.pick(Maybe<&2, F.Forest>, valid, Some{forest}, None{})
      == Some{retained} : Maybe<&2, F.Forest>}) ->
    {valid == True{} : Bool} & {Some{forest} == Some{retained} : Maybe<&2, F.Forest>}:
  match valid:
    case True{}: Tuple{{==}, ready}
    case False{}:
      Empty.absurd({False{} == True{} : Bool} & {Some{forest} == Some{retained} : Maybe<&2, F.Forest>},
        Contents.none_some(F.Forest, retained, ready))

def forest_retained_contents(+value: F.Forest, +episode: Nat, +retained: F.Forest,
    evidence: {Relation.frame_forest(value, episode) == True{} : Bool} &
      {Some{value} == Some{retained} : Maybe<&2, F.Forest>}) ->
    {Some{value} == Some{retained} : Maybe<&2, F.Forest>} &
    {Relation.frame_forest(retained, episode) == True{} : Bool}:
  match evidence:
    case (valid, +equal):
      Tuple{equal,
        %Count.some_equal(F.Forest, value, retained, equal): {Relation.frame_forest(_, episode) == True{} : Bool}
        valid}

def actual_forest_contents(+forest: Maybe<&2, F.Forest>, +episode: Nat, +retained: F.Forest,
    ready: {ActualFrame.forest_valid(forest, episode) == Some{retained} : Maybe<&2, F.Forest>}) ->
    {forest == Some{retained} : Maybe<&2, F.Forest>} &
    {Relation.frame_forest(retained, episode) == True{} : Bool}:
  match forest:
    case Some{+value}:
      forest_retained_contents(value, episode, retained,
        forest_validated_contents(Relation.frame_forest(value, episode), value, retained, ready))
    case None{}:
      Empty.absurd({None{} == Some{retained} : Maybe<&2, F.Forest>} &
        {Relation.frame_forest(retained, episode) == True{} : Bool}, Contents.none_some(F.Forest, retained, ready))

# Recover every projected forest/map list together from the real frame view.
# The complete view equality remains available to transport all scalar fields.
def frame_content_result(+forest: Maybe<&2, F.Forest>, +pending: Maybe<&2, List<&2, V.PendingEntry>>, +targets: Maybe<&2, List<&2, V.TargetEntry>>, +ids: Maybe<&2, List<&2, V.TargetId>>, +captured: Maybe<&2, List<&2, V.CapturedEntry>>, +identities: Maybe<&2, List<&2, V.TargetArtifact>>, +visited: Maybe<&2, List<&2, String>>, view: V.Frame) -> Type:
  match view:
    case V.Frame{_, _, _, _, _, forest_value, pending_value, targets_value, ids_value, captured_value, identities_value, visited_value, _, _, _, _, _, _, _, _}:
      {forest == Some{forest_value} : Maybe<&2, F.Forest>} &
      {pending == Some{pending_value} : Maybe<&2, List<&2, V.PendingEntry>>} &
      {targets == Some{targets_value} : Maybe<&2, List<&2, V.TargetEntry>>} &
      {ids == Some{ids_value} : Maybe<&2, List<&2, V.TargetId>>} &
      {captured == Some{captured_value} : Maybe<&2, List<&2, V.CapturedEntry>>} &
      {identities == Some{identities_value} : Maybe<&2, List<&2, V.TargetArtifact>>} &
      {visited == Some{visited_value} : Maybe<&2, List<&2, String>>}

def frame_view_contents(+forest: Maybe<&2, F.Forest>, +pending: Maybe<&2, List<&2, V.PendingEntry>>, +targets: Maybe<&2, List<&2, V.TargetEntry>>, +ids: Maybe<&2, List<&2, V.TargetId>>, +captured: Maybe<&2, List<&2, V.CapturedEntry>>, +identities: Maybe<&2, List<&2, V.TargetArtifact>>, +visited: Maybe<&2, List<&2, String>>, +actual: T.ResolverFrame, +remaining: Nat, +episode: Nat, +view: V.Frame,
    ready: {ActualFrame.frame_view(forest, pending, targets, ids, captured, identities, visited, actual, remaining, episode) == Some{view} : Maybe<&2, V.Frame>}) ->
    frame_content_result(forest, pending, targets, ids, captured, identities, visited, view):
  match forest pending targets ids captured identities visited actual:
    case Some{+forest_value} Some{+pending_value} Some{+targets_value} Some{+ids_value} Some{+captured_value} Some{+identities_value} Some{+visited_value}
      T.ResolverFrame{branch, limits, graph, command, deps, _, _, _, _, budget, node, edge, target, artifact, _, _, _, _, _, artifacts}:
      %Count.some_equal(V.Frame, V.Frame{branch, limits, graph, command, deps, forest_value, pending_value, targets_value, ids_value, captured_value, identities_value, visited_value, V.actual_budget(budget), node, edge, target, artifact, artifacts, remaining, episode}, view, ready):
        frame_content_result(Some{forest_value}, Some{pending_value}, Some{targets_value}, Some{ids_value}, Some{captured_value}, Some{identities_value}, Some{visited_value}, _)
      Tuple{{==}, Tuple{{==}, Tuple{{==}, Tuple{{==}, Tuple{{==}, Tuple{{==}, {==}}}}}}}
    case None{} _ _ _ _ _ _ _:
      Empty.absurd(frame_content_result(None{}, pending, targets, ids, captured, identities, visited, view), Contents.none_some(V.Frame, view, ready))
    case Some{_} None{} _ _ _ _ _ _:
      Empty.absurd(frame_content_result(forest, None{}, targets, ids, captured, identities, visited, view), Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} None{} _ _ _ _ _:
      Empty.absurd(frame_content_result(forest, pending, None{}, ids, captured, identities, visited, view), Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} Some{_} None{} _ _ _ _:
      Empty.absurd(frame_content_result(forest, pending, targets, None{}, captured, identities, visited, view), Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} Some{_} Some{_} None{} _ _ _:
      Empty.absurd(frame_content_result(forest, pending, targets, ids, None{}, identities, visited, view), Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} Some{_} Some{_} Some{_} None{} _ _:
      Empty.absurd(frame_content_result(forest, pending, targets, ids, captured, None{}, visited, view), Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} Some{_} Some{_} Some{_} Some{_} None{} _:
      Empty.absurd(frame_content_result(forest, pending, targets, ids, captured, identities, None{}, view), Contents.none_some(V.Frame, view, ready))

def frame_semantics(+frame: T.ResolverFrame, +addresses: List<&2, F.AddressEntry>,
    +episode: Nat, view: V.Frame) -> Type:
  match view:
    case V.Frame{_, _, _, _, _, forest, _, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      {P.project(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame),
        S.frame_artifacts(frame), addresses) == Some{forest} : Maybe<&2, F.Forest>} &
      {Relation.frame_forest(forest, episode) == True{} : Bool}

def frame_semantics_from_fields(+frame: T.ResolverFrame, +addresses: List<&2, F.AddressEntry>, +episode: Nat,
    +pending: Maybe<&2, List<&2, V.PendingEntry>>, +targets: Maybe<&2, List<&2, V.TargetEntry>>, +ids: Maybe<&2, List<&2, V.TargetId>>, +captured: Maybe<&2, List<&2, V.CapturedEntry>>, +identities: Maybe<&2, List<&2, V.TargetArtifact>>, +visited: Maybe<&2, List<&2, String>>, +view: V.Frame,
    fields: frame_content_result(ActualFrame.forest_valid(P.project(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame), S.frame_artifacts(frame), addresses), episode), pending, targets, ids, captured, identities, visited, view)) -> frame_semantics(frame, addresses, episode, view):
  match view:
    case V.Frame{_, _, _, _, _, +forest_value, pending_value, targets_value, ids_value, captured_value, identities_value, visited_value, _, _, _, _, _, _, _, _}:
      actual_forest_contents(P.project(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame), S.frame_artifacts(frame), addresses), episode, forest_value,
        Pair.fst({ActualFrame.forest_valid(P.project(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame), S.frame_artifacts(frame), addresses), episode) == Some{forest_value} : Maybe<&2, F.Forest>},
          {pending == Some{pending_value} : Maybe<&2, List<&2, V.PendingEntry>>} &
          {targets == Some{targets_value} : Maybe<&2, List<&2, V.TargetEntry>>} &
          {ids == Some{ids_value} : Maybe<&2, List<&2, V.TargetId>>} &
          {captured == Some{captured_value} : Maybe<&2, List<&2, V.CapturedEntry>>} &
          {identities == Some{identities_value} : Maybe<&2, List<&2, V.TargetArtifact>>} &
          {visited == Some{visited_value} : Maybe<&2, List<&2, String>>}, fields))

def projected_frame_semantics_result(+frame: T.ResolverFrame, history: V.History, +view: V.Frame) -> Type:
  match history:
    case V.History{addresses, _, _, _, _, _, episode}: frame_semantics(frame, addresses, episode, view)

def projected_frame_semantics(+frame: T.ResolverFrame, +history: V.History, +view: V.Frame,
    ready: {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    projected_frame_semantics_result(frame, history, view):
  match history:
    case V.History{+addresses, V.Order{+pending_order, +target_order, +id_order, +capture_order, +identity_order, +visited_order}, +sources, +captures, _, +remaining, +episode}:
      frame_semantics_from_fields(frame, addresses, episode, ActualFrame.pending(pending_order, S.frame_pending(frame), sources, addresses), ActualFrame.targets(target_order, S.frame_target_paths(frame), addresses), ActualFrame.ids(id_order, S.frame_target_ids(frame)), ActualFrame.captured(capture_order, S.frame_captured(frame), captures), ActualFrame.identities(identity_order, S.frame_target_artifacts(frame)), ActualFrame.visited(visited_order, S.frame_visited(frame)), view,
        frame_view_contents(ActualFrame.forest_valid(P.project(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame), S.frame_artifacts(frame), addresses), episode), ActualFrame.pending(pending_order, S.frame_pending(frame), sources, addresses), ActualFrame.targets(target_order, S.frame_target_paths(frame), addresses), ActualFrame.ids(id_order, S.frame_target_ids(frame)), ActualFrame.captured(capture_order, S.frame_captured(frame), captures), ActualFrame.identities(identity_order, S.frame_target_artifacts(frame)), ActualFrame.visited(visited_order, S.frame_visited(frame)), frame, remaining, episode, view, ready))

# The child inversion retains the fresh forest, pending payloads and visited
# order together; freshness is obtained from the existing runtime predicate.
def child_content_result(+forest: Maybe<&2, F.Forest>, +pending: Maybe<&2, List<&2, V.PendingPayload>>,
    +visited: Maybe<&2, List<&2, String>>, view: Phase.Child) -> Type:
  match view:
    case Phase.Child{_, _, _, _, _, _, _, _, _, forest_value, _, pending_value, visited_value, _, _, _}:
      {forest == Some{forest_value} : Maybe<&2, F.Forest>} &
      {pending == Some{pending_value} : Maybe<&2, List<&2, V.PendingPayload>>} &
      {visited == Some{visited_value} : Maybe<&2, List<&2, String>>}

def child_view_contents(+forest: Maybe<&2, F.Forest>, +pending: Maybe<&2, List<&2, V.PendingPayload>>,
    +visited: Maybe<&2, List<&2, String>>, +child: T.TentativeChild, +edge: Local.Pending,
    +history: Phase.ChildHistory, +view: Phase.Child,
    ready: {ActualReady.child_view(forest, pending, visited, child, edge, history)
      == Some{view} : Maybe<&2, Phase.Child>}) -> child_content_result(forest, pending, visited, view):
  match forest pending visited child history:
    case Some{+forest_value} Some{+pending_value} Some{+visited_value}
      T.TentativeChild{target, +path, capture, bytes, file, artifact, identity, before, Local.Plan{_, _, _, _, _, budget}, _, _, _}
      Phase.ChildHistory{F.Created{_, _, addresses}, source, catalog, _, _}:
      %Count.some_equal(Phase.Child, Phase.Child{target, path, ActualReady.edge_kind(edge, path), capture, bytes, file,
          artifact, identity, before, forest_value, addresses, pending_value, visited_value, V.actual_budget(budget), source, catalog}, view, ready):
        child_content_result(Some{forest_value}, Some{pending_value}, Some{visited_value}, _)
      Tuple{{==}, Tuple{{==}, {==}}}
    case None{} _ _ _ _:
      Empty.absurd(child_content_result(None{}, pending, visited, view), Contents.none_some(Phase.Child, view, ready))
    case Some{_} None{} _ _ _:
      Empty.absurd(child_content_result(forest, None{}, visited, view), Contents.none_some(Phase.Child, view, ready))
    case Some{_} Some{_} None{} _ _:
      Empty.absurd(child_content_result(forest, pending, None{}, view), Contents.none_some(Phase.Child, view, ready))

def fresh_retained_contents(+value: F.Forest, +episode: Nat, +retained: F.Forest,
    evidence: {ActualReady.fresh_forest(value, episode) == True{} : Bool} &
      {Some{value} == Some{retained} : Maybe<&2, F.Forest>}) ->
    {Some{value} == Some{retained} : Maybe<&2, F.Forest>} &
    {ActualReady.fresh_forest(retained, episode) == True{} : Bool}:
  match evidence:
    case (valid, +equal):
      Tuple{equal,
        %Count.some_equal(F.Forest, value, retained, equal): {ActualReady.fresh_forest(_, episode) == True{} : Bool}
        valid}

def child_forest_contents(+forest: Maybe<&2, F.Forest>, +episode: Nat, +retained: F.Forest,
    ready: {ActualReady.valid_forest(forest, episode) == Some{retained} : Maybe<&2, F.Forest>}) ->
    {forest == Some{retained} : Maybe<&2, F.Forest>} &
    {ActualReady.fresh_forest(retained, episode) == True{} : Bool}:
  match forest:
    case Some{+value}:
      fresh_retained_contents(value, episode, retained,
        forest_validated_contents(ActualReady.fresh_forest(value, episode), value, retained, ready))
    case None{}:
      Empty.absurd({None{} == Some{retained} : Maybe<&2, F.Forest>} &
        {ActualReady.fresh_forest(retained, episode) == True{} : Bool}, Contents.none_some(F.Forest, retained, ready))

def child_semantics(+root: Nat, +nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +episode: Nat, view: Phase.Child) -> Type:
  match view:
    case Phase.Child{_, _, _, _, _, _, _, _, _, forest, _, _, _, _, _, _}:
      {P.project(root, nodes, slots, artifacts, addresses) == Some{forest} : Maybe<&2, F.Forest>} &
      {ActualReady.fresh_forest(forest, episode) == True{} : Bool}

def child_semantics_from_fields(+root: Nat, +nodes: List<&2, Local.PlannedNode>, +slots: List<&2, Local.ReferenceSlot>,
    +artifacts: List<&2, T.ArtifactEntry>, +addresses: List<&2, F.AddressEntry>, +episode: Nat,
    +pending: Maybe<&2, List<&2, V.PendingPayload>>, +visited: Maybe<&2, List<&2, String>>, +view: Phase.Child,
    fields: child_content_result(ActualReady.valid_forest(P.project(root, nodes, slots, artifacts, addresses), episode), pending, visited, view)) ->
    child_semantics(root, nodes, slots, artifacts, addresses, episode, view):
  match view:
    case Phase.Child{_, _, _, _, _, _, _, _, _, +forest_value, _, pending_value, visited_value, _, _, _}:
      child_forest_contents(P.project(root, nodes, slots, artifacts, addresses), episode, forest_value,
        Pair.fst({ActualReady.valid_forest(P.project(root, nodes, slots, artifacts, addresses), episode)
          == Some{forest_value} : Maybe<&2, F.Forest>},
          {pending == Some{pending_value} : Maybe<&2, List<&2, V.PendingPayload>>} &
          {visited == Some{visited_value} : Maybe<&2, List<&2, String>>}, fields))

def child_projected_result(child: T.TentativeChild, +history: Phase.ChildHistory,
    +artifacts: List<&2, T.ArtifactEntry>, +episode: Nat, +view: Phase.Child) -> Type:
  match child history:
    case T.TentativeChild{_, _, _, _, _, _, _, _, Local.Plan{root, nodes, slots, _, _, _}, _, _, _}
      Phase.ChildHistory{F.Created{_, _, addresses}, _, _, _, _}:
      child_semantics(root, nodes, slots, artifacts, addresses, episode, view)

def child_projected_semantics(+child: T.TentativeChild, +edge: Local.Pending, +history: Phase.ChildHistory,
    +artifacts: List<&2, T.ArtifactEntry>, +episode: Nat, +view: Phase.Child,
    ready: {ActualReady.child_projected(child, edge, history, artifacts, episode)
      == Some{view} : Maybe<&2, Phase.Child>}) -> child_projected_result(child, history, artifacts, episode, view):
  match child history:
    case T.TentativeChild{_, _, _, _, _, _, _, _, Local.Plan{+root, +nodes, +slots, +edges, +visited, _}, _, _, _}
      Phase.ChildHistory{F.Created{_, _, +addresses}, _, _, _, +order}:
      child_semantics_from_fields(root, nodes, slots, artifacts, addresses, episode,
        ActualReady.pending(edges, addresses), ActualReady.visited_complete(order, visited), view,
        child_view_contents(ActualReady.valid_forest(P.project(root, nodes, slots, artifacts, addresses), episode),
          ActualReady.pending(edges, addresses), ActualReady.visited_complete(order, visited), child, edge, history, view, ready))

def child_validated_contents(+valid: Bool, +child: T.TentativeChild, +edge: Local.Pending,
    +history: Phase.ChildHistory, +artifacts: List<&2, T.ArtifactEntry>, +episode: Nat, +view: Phase.Child,
    ready: {ActualReady.child_validated(valid, child, edge, history, artifacts, episode)
      == Some{view} : Maybe<&2, Phase.Child>}) ->
    {valid == True{} : Bool} &
    {ActualReady.child_projected(child, edge, history, artifacts, episode) == Some{view} : Maybe<&2, Phase.Child>}:
  match valid:
    case True{}: Tuple{{==}, ready}
    case False{}:
      Empty.absurd({False{} == True{} : Bool} &
        {ActualReady.child_projected(child, edge, history, artifacts, episode) == Some{view} : Maybe<&2, Phase.Child>},
        Contents.none_some(Phase.Child, view, ready))

def child_checks(child: T.TentativeChild) -> Bool:
  match child:
    case T.TentativeChild{_, _, _, _, _, _, _, _, Local.Plan{_, +nodes, +slots, edges, _, _}, _, _, _}:
      Bool.and(ActualFrame.dense(nodes, 0n), ActualReady.pending_slots(edges, slots))

def actual_child_contents(+child: T.TentativeChild, +edge: Local.Pending, +history: Phase.ChildHistory,
    +artifacts: List<&2, T.ArtifactEntry>, +episode: Nat, +view: Phase.Child,
    ready: {ActualReady.child_project(child, edge, history, artifacts, episode)
      == Some{view} : Maybe<&2, Phase.Child>}) ->
    {child_checks(child) == True{} : Bool} &
    {ActualReady.child_projected(child, edge, history, artifacts, episode) == Some{view} : Maybe<&2, Phase.Child>}:
  match child:
    case T.TentativeChild{_, _, _, _, _, _, _, _, Local.Plan{_, _, _, _, _, _}, _, _, _}:
      child_validated_contents(child_checks(child), child, edge, history, artifacts, episode, view, ready)

def selected_phase_result(+state: T.ResolverState, +frame: T.ResolverFrame, +child: T.TentativeChild,
    +edge: Local.Pending, +history: V.History, +child_history: Phase.ChildHistory, +phase: Phase.Phase) -> Type:
  match history:
    case V.History{_, _, _, _, _, remaining, _}:
      projected_phase_result(Bool.and(ActualReady.mutable_maps_canonical(frame),
        Bool.and(ActualReady.fresh_registration(history, frame),
          Bool.and(Nat.is_gt(remaining, 0n), ActualReady.selected_slot(edge, S.frame_references(frame))))),
        state, frame, child, edge, history, child_history, phase)

def selected_phase_contents(+state: T.ResolverState, +frame: T.ResolverFrame, +child: T.TentativeChild,
    +edge: Local.Pending, +history: V.History, +child_history: Phase.ChildHistory, +phase: Phase.Phase,
    ready: {ActualReady.parts(state, Some{frame}, Some{child}, Some{edge}, history, child_history)
      == Some{phase} : Maybe<&2, Phase.Phase>}) ->
    selected_phase_result(state, frame, child, edge, history, child_history, phase):
  match history:
    case V.History{_, _, _, _, _, remaining, _}:
      projected_phase_contents(Bool.and(ActualReady.mutable_maps_canonical(frame),
        Bool.and(ActualReady.fresh_registration(history, frame),
          Bool.and(Nat.is_gt(remaining, 0n), ActualReady.selected_slot(edge, S.frame_references(frame))))),
        state, frame, child, edge, history, child_history, phase, ready)

# Once the proved materialization supplies its product, construct the actual
# measurement witness and the first three exact transaction observations.
def candidate_request_exact(+product: ArtifactValue.ProductValue, +child: T.TentativeChild,
    +ids: List<&2, Nat>, +previous: Nat, +state: T.ResolverState) ->
    Exists(T.ResolverState, measured => Exists(T.Request, request =>
      {Attach.request_candidate(Some{product}, child, ids, previous, state)
        == Loop.ServiceStep{T.AwaitService{measured, request}} : Loop.Continuation} &
      {Contract.operation(request) == T.EncodeProduct{product} : T.Operation} &
      {S.state_stage(measured) == T.MeasuringCandidateTree{} : T.ResolverStage})):
  match child state:
    case T.TentativeChild{target, path, capture, bytes, file, artifact, identity, before, plan, _, _, _}
      T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, _}:
      +prepared = S.with_state_scratch(state, S.with_scratch_tentative(S.state_scratch(state),
        Some{T.TentativeChild{target, path, capture, bytes, file, artifact, identity, before, plan, previous, product, ids}}))
      +measured = S.with_state_next_request(S.with_state_stage(prepared, T.MeasuringCandidateTree{}),
        (S.state_next_request(prepared) + 1n : Nat))
      +request: T.Request = T.Request{S.input_invocation(S.state_input(prepared)), S.state_next_request(prepared), T.EncodeProduct{product}}
      Tuple{measured, Tuple{request, Tuple{{==}, Tuple{{==}, {==}}}}}

# The ninth original claim transports the supplied post-provider world through
# arbitrary reply validation and the fixed pure completion suffix.
def consumed_world(-World: Data, +selection: D.Selection, +world: E.WorldState<World>) ->
    {Contract.progress_world(World, D.consumed(World, selection, world))
      == Some{world} : Maybe<&2, E.WorldState<World>>}:
  match selection:
    case D.Internal{_}: {==}
    case D.Selected{_, _}: {==}
    case D.ChildBegin{_, _}: {==}
    case D.ChildResume{_, _, _}: {==}
    case D.Success{_, _}: {==}
    case D.EvaluationExhausted{_}: {==}
    case D.InvariantFailed{_}: {==}
    case D.Rejected{_, _}: {==}

def normalized_consumed_world(-World: Data, +selection: D.Selection, +world: E.WorldState<World>) ->
    {Contract.progress_world(World, ReferenceBoundary.normalize_progress(World,
      D.consumed(World, selection, world))) == Some{world} : Maybe<&2, E.WorldState<World>>}:
  match selection:
    case D.Internal{state}:
      consumed_world(World, ReferenceBoundary.next_boundary(D.Internal{state}), world)
    case D.Selected{_, _}: {==}
    case D.ChildBegin{_, _}: {==}
    case D.ChildResume{_, _, _}: {==}
    case D.Success{_, _}: {==}
    case D.EvaluationExhausted{_}: {==}
    case D.InvariantFailed{_}: {==}
    case D.Rejected{_, _}: {==}

def validated_world(-World: Data, +failure: Maybe<&2, T.TechnicalFailure>, +state: D.State,
    +outcome: T.ServiceOutcome, +world: E.WorldState<World>) ->
    {Contract.progress_world(World, ReferenceBoundary.normalize_progress(World,
      D.validated(ReferenceBoundary.consume, World, failure, state, outcome, world)))
      == Some{world} : Maybe<&2, E.WorldState<World>>}:
  match failure:
    case Some{_}: {==}
    case None{}: normalized_consumed_world(World, ReferenceBoundary.consume(state, outcome), world)

def delivered_world(-World: Data, +request: T.Request, +state: D.State,
    +reply: T.Reply, +world: E.WorldState<World>) ->
    {Contract.progress_world(World, ReferenceBoundary.normalize_progress(World,
      D.delivered(ReferenceBoundary.consume, World, request, state, reply, world)))
      == Some{world} : Maybe<&2, E.WorldState<World>>}:
  match reply:
    case T.Reply{_, _, outcome}:
      validated_world(World, Boundary.check(request, reply), state, outcome, world)

def selected_world(-World: Data, +state: D.State, +operation: T.Operation,
    +reply: T.Reply, +world: E.WorldState<World>) ->
    {Contract.progress_world(World, ReferenceBoundary.deliver_next(World,
      D.Selected{state, operation}, reply, world)) == Some{world} : Maybe<&2, E.WorldState<World>>}:
  match state:
    case D.State{+config, frame, targets, ids, target, +next, iterations, stage, python}:
      delivered_world(World, T.Request{D.invocation(config), next, operation},
        D.State{config, frame, targets, ids, target, (next + 1n : Nat), iterations, stage, python}, reply, world)

def boundary_world(-World: Data, +selection: D.Selection, +reply: T.Reply,
    +world: E.WorldState<World>) ->
    {Contract.progress_world(World, ReferenceBoundary.deliver_next(World, selection, reply, world))
      == Some{world} : Maybe<&2, E.WorldState<World>>}:
  match selection:
    case D.Selected{state, operation}: selected_world(World, state, operation, reply, world)
    case D.Internal{_}: normalized_consumed_world(World, selection, world)
    case D.ChildBegin{_, _}: normalized_consumed_world(World, selection, world)
    case D.ChildResume{_, _, _}: normalized_consumed_world(World, selection, world)
    case D.Success{_, _}: normalized_consumed_world(World, selection, world)
    case D.EvaluationExhausted{_}: normalized_consumed_world(World, selection, world)
    case D.InvariantFailed{_}: normalized_consumed_world(World, selection, world)
    case D.Rejected{_, _}: normalized_consumed_world(World, selection, world)

# The ready views observe every listed visited identity through a True lookup.
# These inversions preserve the whole ordered observation; no canonical-map
# assumption is added to the original transaction relation.
def visited_member_selected(+same: Bool, +head: String, +tail: List<&2, String>,
    +entries: Map<&2, Bool>, +query: String,
    same_key: {String.eq(head, query) == same : Bool},
    head_true: {Local.map_result(Bool, Map.get(Bool, False{}, entries, head)) == True{} : Bool},
    member: {Bool.or(same, List.contains(String, String.eq, tail, query)) == True{} : Bool},
    recurse: {List.contains(String, String.eq, tail, query) == True{} : Bool} ->
      {Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == True{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == True{} : Bool}:
  match same:
    case True{}:
      %StringFacts.eq_of_eq_true(head, query, same_key):
        {Local.map_result(Bool, Map.get(Bool, False{}, entries, _)) == True{} : Bool}
      head_true
    case False{}: recurse(member)

def visited_member_cons(+present: Bool, +rest: Maybe<&2, List<&2, String>>,
    +head: String, +tail: List<&2, String>, +entries: Map<&2, Bool>, +observed: List<&2, String>, +query: String,
    lookup: {Local.map_result(Bool, Map.get(Bool, False{}, entries, head)) == present : Bool},
    tail_projection: {ActualFrame.visited(tail, entries) == rest : Maybe<&2, List<&2, String>>},
    ready: {ActualFrame.visited_prefix(ActualFrame.visited_entry(head, present), rest)
      == Some{observed} : Maybe<&2, List<&2, String>>},
    member: {List.contains(String, String.eq, head <> tail, query) == True{} : Bool},
    recurse: @value: List<&2, String> ->
      {ActualFrame.visited(tail, entries) == Some{value} : Maybe<&2, List<&2, String>>} ->
      {List.contains(String, String.eq, tail, query) == True{} : Bool} ->
      {Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == True{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == True{} : Bool}:
  match present rest:
    case True{} Some{value}:
      visited_member_selected(String.eq(head, query), head, tail, entries, query,
        {==}, lookup, member, recurse(value, tail_projection))
    case True{} None{}:
      Empty.absurd({Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == True{} : Bool},
        Contents.none_some(List<&2, String>, observed, ready))
    case False{} _:
      Empty.absurd({Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == True{} : Bool},
        Contents.none_some(List<&2, String>, observed, ready))

def visited_member_sound(order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>, +query: String,
    ready: {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>},
    member: {List.contains(String, String.eq, order, query) == True{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == True{} : Bool}:
  match order:
    case []:
      Empty.absurd({Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == True{} : Bool},
        StringFacts.internal_false_ne_true(member))
    case +head <> +tail:
      visited_member_cons(Local.map_result(Bool, Map.get(Bool, False{}, entries, head)),
        ActualFrame.visited(tail, entries), head, tail, entries, observed, query, {==}, {==}, ready, member,
        value => tail_ready => tail_member => visited_member_sound(tail, entries, value, query, tail_ready, tail_member))

def visited_prefix_correspondence(+head: String, +present: Bool,
    +rest: Maybe<&2, List<&2, String>>) ->
    {ReferenceFrame.prefix(String, ReferenceFrame.visited_item(head, present), rest)
      == ActualFrame.visited_prefix(ActualFrame.visited_entry(head, present), rest)
      : Maybe<&2, List<&2, String>>}:
  match present rest:
    case True{} Some{_}: {==}
    case True{} None{}: {==}
    case False{} _: {==}

def reference_visited_entries(order: List<&2, String>, +entries: Map<&2, Bool>) ->
    {ReferenceFrame.visited_entries(order, entries) == ActualFrame.visited(order, entries)
      : Maybe<&2, List<&2, String>>}:
  match order:
    case []: {==}
    case +head <> +tail:
      %Equal.sym(Maybe<&2, List<&2, String>>, ReferenceFrame.visited_entries(tail, entries),
        ActualFrame.visited(tail, entries), reference_visited_entries(tail, entries)):
        {ReferenceFrame.prefix(String,
          ReferenceFrame.visited_item(head, Local.map_result(Bool, Map.get(Bool, False{}, entries, head))),
          _) == ActualFrame.visited(head <> tail, entries) : Maybe<&2, List<&2, String>>}
      visited_prefix_correspondence(head, Local.map_result(Bool, Map.get(Bool, False{}, entries, head)),
        ActualFrame.visited(tail, entries))

def reference_visited_guard(+guard: Bool, +value: Maybe<&2, List<&2, String>>,
    +observed: List<&2, String>,
    ready: {Bool.pick(Maybe<&2, List<&2, String>>, guard, value, None{}) == Some{observed}
      : Maybe<&2, List<&2, String>>}) ->
    {value == Some{observed} : Maybe<&2, List<&2, String>>}:
  match guard:
    case True{}: ready
    case False{}:
      Empty.absurd({value == Some{observed} : Maybe<&2, List<&2, String>>},
        Contents.none_some(List<&2, String>, observed, ready))

def reference_visited_contents(+order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>,
    ready: {ReferenceFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>}) ->
    {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>}:
  %reference_visited_entries(order, entries):
    {_ == Some{observed} : Maybe<&2, List<&2, String>>}
  reference_visited_guard(
    Bool.and(ReferenceFrame.unique_strings(order, order),
      Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries)))),
    ReferenceFrame.visited_entries(order, entries), observed, ready)

def visited_present_correspondence(+order: List<&2, String>, +actual: Map<&2, Bool>,
    +reference: Map<&2, Bool>, +observed: List<&2, String>, +query: String,
    actual_ready: {ActualFrame.visited(order, actual) == Some{observed} : Maybe<&2, List<&2, String>>},
    reference_ready: {ReferenceFrame.visited(order, reference) == Some{observed} : Maybe<&2, List<&2, String>>},
    +member: {List.contains(String, String.eq, order, query) == True{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, actual, query))
      == Local.map_result(Bool, Map.get(Bool, False{}, reference, query)) : Bool}:
  Equal.trans(Bool, Local.map_result(Bool, Map.get(Bool, False{}, actual, query)), True{},
    Local.map_result(Bool, Map.get(Bool, False{}, reference, query)),
    visited_member_sound(order, actual, observed, query, actual_ready, member),
    Equal.sym(Bool, Local.map_result(Bool, Map.get(Bool, False{}, reference, query)), True{},
      visited_member_sound(order, reference, observed, query,
        reference_visited_contents(order, reference, observed, reference_ready), member)))

# Cardinality is derived from the ready view's existing unique-key guard.
# These counters are proof-local sums over the existing lists, not new state.
def unique_member_selected(+same: Bool, +head: String, +tail: List<&2, String>,
    +all: List<&2, String>, +query: String,
    same_key: {String.eq(head, query) == same : Bool},
    head_count: {ActualFrame.string_count(all, head) == 1n : Nat},
    member: {Bool.or(same, List.contains(String, String.eq, tail, query)) == True{} : Bool},
    recurse: {List.contains(String, String.eq, tail, query) == True{} : Bool} ->
      {ActualFrame.string_count(all, query) == 1n : Nat}) ->
    {ActualFrame.string_count(all, query) == 1n : Nat}:
  match same:
    case True{}:
      %StringFacts.eq_of_eq_true(head, query, same_key):
        {ActualFrame.string_count(all, _) == 1n : Nat}
      head_count
    case False{}: recurse(member)

def unique_member_count(items: List<&2, String>, +all: List<&2, String>, +query: String,
    +unique: {ActualFrame.strings_unique(items, all) == True{} : Bool},
    member: {List.contains(String, String.eq, items, query) == True{} : Bool}) ->
    {ActualFrame.string_count(all, query) == 1n : Nat}:
  match items:
    case []:
      Empty.absurd({ActualFrame.string_count(all, query) == 1n : Nat},
        StringFacts.internal_false_ne_true(member))
    case +head <> +tail:
      unique_member_selected(String.eq(head, query), head, tail, all, query, {==},
        NatFacts.eq_of_is_eq(ActualFrame.string_count(all, head), 1n,
          BoolFacts.eq_true_of_and_left(Nat.is_eq(ActualFrame.string_count(all, head), 1n),
            ActualFrame.strings_unique(tail, all), unique)), member,
        tail_member => unique_member_count(tail, all, query,
          BoolFacts.eq_true_of_and_right(Nat.is_eq(ActualFrame.string_count(all, head), 1n),
            ActualFrame.strings_unique(tail, all), unique), tail_member))

def absent_count_selected(+same: Bool, +count: Nat, +present: Bool,
    absent: {Bool.or(same, present) == False{} : Bool},
    recurse: {present == False{} : Bool} -> {count == 0n : Nat}) ->
    {(Bool.pick(Nat, same, 1n, 0n) + count : Nat) == 0n : Nat}:
  match same:
    case True{}:
      Empty.absurd({(1n + count : Nat) == 0n : Nat},
        StringFacts.internal_false_ne_true(Equal.sym(Bool, True{}, False{}, absent)))
    case False{}: recurse(absent)

def absent_count(items: List<&2, String>, +query: String,
    absent: {List.contains(String, String.eq, items, query) == False{} : Bool}) ->
    {ActualFrame.string_count(items, query) == 0n : Nat}:
  match items:
    case []: {==}
    case +head <> +tail:
      absent_count_selected(String.eq(head, query), ActualFrame.string_count(tail, query),
        List.contains(String, String.eq, tail, query), absent,
        tail_absent => absent_count(tail, query, tail_absent))

def unique_query_selected(+present: Bool, +items: List<&2, String>, +query: String,
    present_key: {List.contains(String, String.eq, items, query) == present : Bool},
    unique: {ActualFrame.strings_unique(items, items) == True{} : Bool}) ->
    NatFacts.le(ActualFrame.string_count(items, query), 1n):
  match present:
    case False{}:
      %Equal.sym(Nat, ActualFrame.string_count(items, query), 0n,
        absent_count(items, query, present_key)): NatFacts.le(_, 1n)
      {==}
    case True{}:
      %Equal.sym(Nat, ActualFrame.string_count(items, query), 1n,
        unique_member_count(items, items, query, unique, present_key)): NatFacts.le(_, 1n)
      {==}

def unique_query_bound(+items: List<&2, String>, +query: String,
    unique: {ActualFrame.strings_unique(items, items) == True{} : Bool}) ->
    NatFacts.le(ActualFrame.string_count(items, query), 1n):
  unique_query_selected(List.contains(String, String.eq, items, query), items, query, {==}, unique)

def observed_key_count(keys: List<&2, String>, +query: String) -> Nat:
  match keys:
    case []: 0n
    case head <> tail:
      (Bool.pick(Nat, String.eq(query, head), 1n, 0n) + observed_key_count(tail, query) : Nat)

def observed_pair_count(+order: List<&2, String>, keys: List<&2, String>) -> Nat:
  match keys:
    case []: 0n
    case head <> tail: (ActualFrame.string_count(order, head) + observed_pair_count(order, tail) : Nat)

def observed_pair_upper(+order: List<&2, String>, keys: List<&2, String>,
    +unique: {ActualFrame.strings_unique(order, order) == True{} : Bool}) ->
    NatFacts.le(observed_pair_count(order, keys), List.length(&2, String, keys)):
  match keys:
    case []: {==}
    case +head <> +tail:
      NatFacts.add_le_add(ActualFrame.string_count(order, head), observed_pair_count(order, tail),
        1n, List.length(&2, String, tail), unique_query_bound(order, head, unique),
        observed_pair_upper(order, tail, unique))

def pair_count_exchange(+a: Nat, +b: Nat, +c: Nat, +d: Nat) ->
    {((a + b : Nat) + (c + d : Nat) : Nat) == ((a + c : Nat) + (b + d : Nat) : Nat) : Nat}:
  Equal.trans(Nat, ((a + b : Nat) + (c + d : Nat) : Nat),
    (a + (b + (c + d : Nat) : Nat) : Nat), ((a + c : Nat) + (b + d : Nat) : Nat),
    Arithmetic.add_assoc(a, b, (c + d : Nat)),
    Equal.trans(Nat, (a + (b + (c + d : Nat) : Nat) : Nat),
      (a + (c + (b + d : Nat) : Nat) : Nat), ((a + c : Nat) + (b + d : Nat) : Nat),
      Equal.cong(Nat, Nat, value => (a + value : Nat),
        (b + (c + d : Nat) : Nat), (c + (b + d : Nat) : Nat),
        Equal.trans(Nat, (b + (c + d : Nat) : Nat), ((b + c : Nat) + d : Nat),
          (c + (b + d : Nat) : Nat),
          Equal.sym(Nat, ((b + c : Nat) + d : Nat), (b + (c + d : Nat) : Nat), Arithmetic.add_assoc(b, c, d)),
          Equal.trans(Nat, ((b + c : Nat) + d : Nat), ((c + b : Nat) + d : Nat),
            (c + (b + d : Nat) : Nat),
            Equal.cong(Nat, Nat, value => (value + d : Nat), (b + c : Nat), (c + b : Nat), NatFacts.add_comm(b, c)),
            Arithmetic.add_assoc(c, b, d)))),
      Equal.sym(Nat, ((a + c : Nat) + (b + d : Nat) : Nat),
        (a + (c + (b + d : Nat) : Nat) : Nat), Arithmetic.add_assoc(a, c, (b + d : Nat)))))

def observed_pair_row(+head: String, +tail: List<&2, String>, keys: List<&2, String>) ->
    {observed_pair_count(head <> tail, keys)
      == (observed_key_count(keys, head) + observed_pair_count(tail, keys) : Nat) : Nat}:
  match keys:
    case []: {==}
    case +key <> +rest:
      %Equal.sym(Nat, observed_pair_count(head <> tail, rest),
        (observed_key_count(rest, head) + observed_pair_count(tail, rest) : Nat),
        observed_pair_row(head, tail, rest)):
        {((Bool.pick(Nat, String.eq(head, key), 1n, 0n) + ActualFrame.string_count(tail, key) : Nat) + _ : Nat)
          == (observed_key_count(key <> rest, head) + observed_pair_count(tail, key <> rest) : Nat) : Nat}
      pair_count_exchange(Bool.pick(Nat, String.eq(head, key), 1n, 0n), ActualFrame.string_count(tail, key),
        observed_key_count(rest, head), observed_pair_count(tail, rest))

def observed_map_count(tree: Map<&2, Bool>, +query: String) -> Nat:
  match tree:
    case MTip{}: 0n
    case MLeaf{name, _}: Bool.pick(Nat, String.eq(query, name), 1n, 0n)
    case MNode{_, lo, hi}: (observed_map_count(lo, query) + observed_map_count(hi, query) : Nat)

def observed_map_keys_go(tree: Map<&2, Bool>, +acc: List<&2, String>, +query: String) ->
    {observed_key_count(Map.keys.go(&2, Bool, tree, acc), query)
      == (observed_map_count(tree, query) + observed_key_count(acc, query) : Nat) : Nat}:
  match tree:
    case MTip{}: {==}
    case MLeaf{_, _}: {==}
    case MNode{_, +lo, +hi}:
      Equal.trans(Nat, observed_key_count(Map.keys.go(&2, Bool, lo, Map.keys.go(&2, Bool, hi, acc)), query),
        (observed_map_count(lo, query) + observed_key_count(Map.keys.go(&2, Bool, hi, acc), query) : Nat),
        ((observed_map_count(lo, query) + observed_map_count(hi, query) : Nat) + observed_key_count(acc, query) : Nat),
        observed_map_keys_go(lo, Map.keys.go(&2, Bool, hi, acc), query),
        Equal.trans(Nat, (observed_map_count(lo, query) + observed_key_count(Map.keys.go(&2, Bool, hi, acc), query) : Nat),
          (observed_map_count(lo, query) + (observed_map_count(hi, query) + observed_key_count(acc, query) : Nat) : Nat),
          ((observed_map_count(lo, query) + observed_map_count(hi, query) : Nat) + observed_key_count(acc, query) : Nat),
          Equal.cong(Nat, Nat, value => (observed_map_count(lo, query) + value : Nat),
            observed_key_count(Map.keys.go(&2, Bool, hi, acc), query),
            (observed_map_count(hi, query) + observed_key_count(acc, query) : Nat),
            observed_map_keys_go(hi, acc, query)),
          Equal.sym(Nat, ((observed_map_count(lo, query) + observed_map_count(hi, query) : Nat) + observed_key_count(acc, query) : Nat),
            (observed_map_count(lo, query) + (observed_map_count(hi, query) + observed_key_count(acc, query) : Nat) : Nat),
            Arithmetic.add_assoc(observed_map_count(lo, query), observed_map_count(hi, query), observed_key_count(acc, query)))))

def observed_map_keys(+tree: Map<&2, Bool>, +query: String) ->
    {observed_key_count(Map.keys(&2, Bool, tree), query) == observed_map_count(tree, query) : Nat}:
  Equal.trans(Nat, observed_key_count(Map.keys(&2, Bool, tree), query),
    (observed_map_count(tree, query) + 0n : Nat), observed_map_count(tree, query),
    observed_map_keys_go(tree, [], query), NatFacts.add_zero(observed_map_count(tree, query)))

def observed_leaf_positive(same: Bool, +value: Bool,
    ready: {Bool.pick(Bool, same, value, False{}) == True{} : Bool}) ->
    NatFacts.le(1n, Bool.pick(Nat, same, 1n, 0n)):
  match same:
    case True{}: {==}
    case False{}:
      Empty.absurd(NatFacts.le(1n, 0n), StringFacts.internal_false_ne_true(ready))

def observed_node_positive(side: Bool, +left: Bool, +right: Bool, +left_count: Nat, +right_count: Nat,
    ready: {Bool.pick(Bool, side, right, left) == True{} : Bool},
    left_positive: {left == True{} : Bool} -> NatFacts.le(1n, left_count),
    right_positive: {right == True{} : Bool} -> NatFacts.le(1n, right_count)) ->
    NatFacts.le(1n, (left_count + right_count : Nat)):
  match side:
    case False{}:
      NatFacts.le_trans(1n, left_count, (left_count + right_count : Nat), left_positive(ready),
        Arithmetic.le_add_right(left_count, right_count))
    case True{}:
      NatFacts.le_trans(1n, right_count, (left_count + right_count : Nat), right_positive(ready),
        NatFacts.add_le_add(0n, right_count, left_count, right_count,
          Arithmetic.zero_le(left_count), NatFacts.le_refl(right_count)))

def observed_routed_positive(tree: Map<&2, Bool>, +query: String,
    ready: {Payload.routed_value(Bool, False{}, tree, query) == True{} : Bool}) ->
    NatFacts.le(1n, observed_map_count(tree, query)):
  match tree:
    case MTip{}:
      Empty.absurd(NatFacts.le(1n, 0n), StringFacts.internal_false_ne_true(ready))
    case MLeaf{+name, +value}:
      observed_leaf_positive(String.eq(query, name), value,
        Equal.trans(Bool, Bool.pick(Bool, String.eq(query, name), value, False{}),
          Local.map_result(Bool, Map.get(Bool, False{}, MLeaf{name, value}, query)), True{},
          Equal.sym(Bool, Local.map_result(Bool, Map.get(Bool, False{}, MLeaf{name, value}, query)),
            Bool.pick(Bool, String.eq(query, name), value, False{}),
            Payload.leaf_read_exact(Bool, False{}, name, value, query)), ready))
    case MNode{+position, +lo, +hi}:
      observed_node_positive(Patricia.route(query, position), Payload.routed_value(Bool, False{}, lo, query),
        Payload.routed_value(Bool, False{}, hi, query), observed_map_count(lo, query), observed_map_count(hi, query),
        ready, proof => observed_routed_positive(lo, query, proof), proof => observed_routed_positive(hi, query, proof))

def observed_lookup_positive(+tree: Map<&2, Bool>, +query: String,
    ready: {Local.map_result(Bool, Map.get(Bool, False{}, tree, query)) == True{} : Bool}) ->
    NatFacts.le(1n, observed_key_count(Map.keys(&2, Bool, tree), query)):
  %Equal.sym(Nat, observed_key_count(Map.keys(&2, Bool, tree), query), observed_map_count(tree, query),
    observed_map_keys(tree, query)): NatFacts.le(1n, _)
  observed_routed_positive(tree, query,
    Equal.trans(Bool, Payload.routed_value(Bool, False{}, tree, query),
      Local.map_result(Bool, Map.get(Bool, False{}, tree, query)), True{},
      Equal.sym(Bool, Local.map_result(Bool, Map.get(Bool, False{}, tree, query)),
        Payload.routed_value(Bool, False{}, tree, query), Payload.lookup_routed(Bool, False{}, tree, query)), ready))

def observed_positive(order: List<&2, String>, +keys: List<&2, String>) -> Bool:
  match order:
    case []: True{}
    case head <> tail:
      Bool.and(Nat.is_le(1n, observed_key_count(keys, head)), observed_positive(tail, keys))

def observed_pair_lower(order: List<&2, String>, +keys: List<&2, String>,
    +positive: {observed_positive(order, keys) == True{} : Bool}) ->
    NatFacts.le(List.length(&2, String, order), observed_pair_count(order, keys)):
  match order:
    case []: Arithmetic.zero_le(observed_pair_count([], keys))
    case +head <> +tail:
      %Equal.sym(Nat, observed_pair_count(head <> tail, keys),
        (observed_key_count(keys, head) + observed_pair_count(tail, keys) : Nat),
        observed_pair_row(head, tail, keys)): NatFacts.le(1n+List.length(&2, String, tail), _)
      NatFacts.add_le_add(1n, List.length(&2, String, tail), observed_key_count(keys, head),
        observed_pair_count(tail, keys),
        BoolFacts.eq_true_of_and_left(Nat.is_le(1n, observed_key_count(keys, head)), observed_positive(tail, keys), positive),
        observed_pair_lower(tail, keys,
          BoolFacts.eq_true_of_and_right(Nat.is_le(1n, observed_key_count(keys, head)), observed_positive(tail, keys), positive)))

def observed_cardinality_bound(+order: List<&2, String>, +keys: List<&2, String>,
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    positive: {observed_positive(order, keys) == True{} : Bool}) ->
    NatFacts.le(List.length(&2, String, order), List.length(&2, String, keys)):
  NatFacts.le_trans(List.length(&2, String, order), observed_pair_count(order, keys), List.length(&2, String, keys),
    observed_pair_lower(order, keys, positive), observed_pair_upper(order, keys, unique))

def visited_positive_selected(+head: String, +present: Bool, +rest: Maybe<&2, List<&2, String>>,
    +observed: List<&2, String>, +tail: List<&2, String>, +keys: List<&2, String>,
    ready: {ActualFrame.visited_prefix(ActualFrame.visited_entry(head, present), rest)
      == Some{observed} : Maybe<&2, List<&2, String>>},
    head_positive: {present == True{} : Bool} -> NatFacts.le(1n, observed_key_count(keys, head)),
    recurse: @value: List<&2, String> -> {rest == Some{value} : Maybe<&2, List<&2, String>>} ->
      {observed_positive(tail, keys) == True{} : Bool}) ->
    {observed_positive(head <> tail, keys) == True{} : Bool}:
  match present rest:
    case True{} Some{value}:
      BoolFacts.and_eq_true(Nat.is_le(1n, observed_key_count(keys, head)), observed_positive(tail, keys),
        head_positive({==}), recurse(value, {==}))
    case True{} None{}:
      Empty.absurd({observed_positive(head <> tail, keys) == True{} : Bool},
        Contents.none_some(List<&2, String>, observed, ready))
    case False{} _:
      Empty.absurd({observed_positive(head <> tail, keys) == True{} : Bool},
        Contents.none_some(List<&2, String>, observed, ready))

def visited_positive(order: List<&2, String>, +entries: Map<&2, Bool>, +observed: List<&2, String>,
    ready: {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>}) ->
    {observed_positive(order, Map.keys(&2, Bool, entries)) == True{} : Bool}:
  match order:
    case []: {==}
    case +head <> +tail:
      visited_positive_selected(head, Local.map_result(Bool, Map.get(Bool, False{}, entries, head)),
        ActualFrame.visited(tail, entries), observed, tail, Map.keys(&2, Bool, entries), ready,
        present => observed_lookup_positive(entries, head, present),
        value => tail_ready => visited_positive(tail, entries, value, tail_ready))

def observed_added_count(+same: Bool, +query: String, +head: String, +all: List<&2, String>,
    same_key: {String.eq(query, head) == same : Bool},
    head_count: {ActualFrame.string_count(all, head) == 1n : Nat},
    absent: {ActualFrame.string_count(all, query) == 0n : Nat}) ->
    {Nat.is_eq((Bool.pick(Nat, same, 1n, 0n) + ActualFrame.string_count(all, head) : Nat), 1n) == True{} : Bool}:
  match same:
    case False{}:
      Equal.trans(Bool, Nat.is_eq(ActualFrame.string_count(all, head), 1n), Nat.is_eq(1n, 1n), True{},
        Equal.cong(Nat, Bool, value => Nat.is_eq(value, 1n), ActualFrame.string_count(all, head), 1n, head_count), {==})
    case True{}:
      Empty.absurd({Nat.is_eq(1n+ActualFrame.string_count(all, head), 1n) == True{} : Bool},
        Arithmetic.internal_succ_ne_zero(0n,
          Equal.trans(Nat, 1n, ActualFrame.string_count(all, head), 0n,
            Equal.sym(Nat, ActualFrame.string_count(all, head), 1n, head_count),
            Equal.trans(Nat, ActualFrame.string_count(all, head), ActualFrame.string_count(all, query), 0n,
              Equal.sym(Nat, ActualFrame.string_count(all, query), ActualFrame.string_count(all, head),
                Equal.cong(String, Nat, value => ActualFrame.string_count(all, value), query, head,
                  StringFacts.eq_of_eq_true(query, head, same_key))), absent))))

def observed_extend_unique(items: List<&2, String>, +all: List<&2, String>, +query: String,
    +unique: {ActualFrame.strings_unique(items, all) == True{} : Bool},
    +absent: {ActualFrame.string_count(all, query) == 0n : Nat}) ->
    {ActualFrame.strings_unique(items, query <> all) == True{} : Bool}:
  match items:
    case []: {==}
    case +head <> +tail:
      BoolFacts.and_eq_true(Nat.is_eq(ActualFrame.string_count(query <> all, head), 1n),
        ActualFrame.strings_unique(tail, query <> all),
        observed_added_count(String.eq(query, head), query, head, all, {==},
          NatFacts.eq_of_is_eq(ActualFrame.string_count(all, head), 1n,
            BoolFacts.eq_true_of_and_left(Nat.is_eq(ActualFrame.string_count(all, head), 1n),
              ActualFrame.strings_unique(tail, all), unique)), absent),
        observed_extend_unique(tail, all, query,
          BoolFacts.eq_true_of_and_right(Nat.is_eq(ActualFrame.string_count(all, head), 1n),
            ActualFrame.strings_unique(tail, all), unique), absent))

def observed_prepend_count(+order: List<&2, String>, +query: String,
    absent: {ActualFrame.string_count(order, query) == 0n : Nat}) ->
    {ActualFrame.string_count(query <> order, query) == 1n : Nat}:
  Equal.trans(Nat, ActualFrame.string_count(query <> order, query),
    (1n + ActualFrame.string_count(order, query) : Nat), 1n,
    Equal.cong(Bool, Nat, same => (Bool.pick(Nat, same, 1n, 0n) + ActualFrame.string_count(order, query) : Nat),
      String.eq(query, query), True{}, StringFacts.eq_refl(query)),
    Equal.cong(Nat, Nat, value => 1n+value, ActualFrame.string_count(order, query), 0n, absent))

def observed_prepend_unique(+order: List<&2, String>, +query: String,
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    absent: {List.contains(String, String.eq, order, query) == False{} : Bool}) ->
    {ActualFrame.strings_unique(query <> order, query <> order) == True{} : Bool}:
  +zero = absent_count(order, query, absent)
  BoolFacts.and_eq_true(Nat.is_eq(ActualFrame.string_count(query <> order, query), 1n),
    ActualFrame.strings_unique(order, query <> order),
    Equal.trans(Bool, Nat.is_eq(ActualFrame.string_count(query <> order, query), 1n), Nat.is_eq(1n, 1n), True{},
      Equal.cong(Nat, Bool, value => Nat.is_eq(value, 1n), ActualFrame.string_count(query <> order, query), 1n,
        observed_prepend_count(order, query, zero)), {==}),
    observed_extend_unique(order, order, query, unique, zero))

def observed_successor_impossible(size: Nat, proof: NatFacts.le(1n+size, size)) -> Empty:
  match size:
    case 0n: StringFacts.internal_false_ne_true(proof)
    case 1n+rest: observed_successor_impossible(rest, proof)

def observed_extra_impossible(+order: List<&2, String>, +keys: List<&2, String>, +query: String,
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    same_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, keys)) == True{} : Bool},
    absent: {List.contains(String, String.eq, order, query) == False{} : Bool},
    positive: {observed_positive(order, keys) == True{} : Bool},
    extra: NatFacts.le(1n, observed_key_count(keys, query))) -> Empty:
  observed_successor_impossible(List.length(&2, String, order),
    Equal.trans(Bool, Nat.is_le(1n+List.length(&2, String, order), List.length(&2, String, order)),
      Nat.is_le(1n+List.length(&2, String, order), List.length(&2, String, keys)), True{},
      Equal.cong(Nat, Bool, size => Nat.is_le(1n+List.length(&2, String, order), size),
        List.length(&2, String, order), List.length(&2, String, keys),
        NatFacts.eq_of_is_eq(List.length(&2, String, order), List.length(&2, String, keys), same_size)),
      observed_cardinality_bound(query <> order, keys, observed_prepend_unique(order, query, unique, absent),
        BoolFacts.and_eq_true(Nat.is_le(1n, observed_key_count(keys, query)), observed_positive(order, keys), extra, positive))))

def visited_absent_selected(+present: Bool, +order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>, +query: String,
    lookup: {Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == present : Bool},
    ready: {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>},
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    same_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries))) == True{} : Bool},
    absent: {List.contains(String, String.eq, order, query) == False{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == False{} : Bool}:
  match present:
    case False{}: lookup
    case True{}:
      Empty.absurd({Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == False{} : Bool},
        observed_extra_impossible(order, Map.keys(&2, Bool, entries), query, unique, same_size, absent,
          visited_positive(order, entries, observed, ready), observed_lookup_positive(entries, query, lookup)))

def visited_absent_lookup(+order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>, +query: String,
    ready: {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>},
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    same_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries))) == True{} : Bool},
    absent: {List.contains(String, String.eq, order, query) == False{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, entries, query)) == False{} : Bool}:
  visited_absent_selected(Local.map_result(Bool, Map.get(Bool, False{}, entries, query)), order, entries, observed, query,
    {==}, ready, unique, same_size, absent)

def reference_visited_guard_true(+guard: Bool, +value: Maybe<&2, List<&2, String>>,
    +observed: List<&2, String>,
    ready: {Bool.pick(Maybe<&2, List<&2, String>>, guard, value, None{}) == Some{observed}
      : Maybe<&2, List<&2, String>>}) -> {guard == True{} : Bool}:
  match guard:
    case True{}: {==}
    case False{}:
      Empty.absurd({False{} == True{} : Bool}, Contents.none_some(List<&2, String>, observed, ready))

def reference_visited_cardinality(+order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>,
    ready: {ReferenceFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>}) ->
    {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries))) == True{} : Bool}:
  BoolFacts.eq_true_of_and_right(ReferenceFrame.unique_strings(order, order),
    Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries))),
    reference_visited_guard_true(
      Bool.and(ReferenceFrame.unique_strings(order, order),
        Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries)))),
      ReferenceFrame.visited_entries(order, entries), observed, ready))

def visited_lookup_selected(+present: Bool, +order: List<&2, String>, +actual: Map<&2, Bool>,
    +reference: Map<&2, Bool>, +observed: List<&2, String>, +query: String,
    +member: {List.contains(String, String.eq, order, query) == present : Bool},
    actual_ready: {ActualFrame.visited(order, actual) == Some{observed} : Maybe<&2, List<&2, String>>},
    +reference_ready: {ReferenceFrame.visited(order, reference) == Some{observed} : Maybe<&2, List<&2, String>>},
    +unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    actual_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, actual))) == True{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, actual, query))
      == Local.map_result(Bool, Map.get(Bool, False{}, reference, query)) : Bool}:
  match present:
    case True{}: visited_present_correspondence(order, actual, reference, observed, query, actual_ready, reference_ready, member)
    case False{}:
      Equal.trans(Bool, Local.map_result(Bool, Map.get(Bool, False{}, actual, query)), False{},
        Local.map_result(Bool, Map.get(Bool, False{}, reference, query)),
        visited_absent_lookup(order, actual, observed, query, actual_ready, unique, actual_size, member),
        Equal.sym(Bool, Local.map_result(Bool, Map.get(Bool, False{}, reference, query)), False{},
          visited_absent_lookup(order, reference, observed, query,
            reference_visited_contents(order, reference, observed, reference_ready), unique,
            reference_visited_cardinality(order, reference, observed, reference_ready), member)))

def visited_lookup_exact(+order: List<&2, String>, +actual: Map<&2, Bool>,
    +reference: Map<&2, Bool>, +observed: List<&2, String>, +query: String,
    actual_ready: {ActualFrame.visited(order, actual) == Some{observed} : Maybe<&2, List<&2, String>>},
    reference_ready: {ReferenceFrame.visited(order, reference) == Some{observed} : Maybe<&2, List<&2, String>>},
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    actual_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, actual))) == True{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, actual, query))
      == Local.map_result(Bool, Map.get(Bool, False{}, reference, query)) : Bool}:
  visited_lookup_selected(List.contains(String, String.eq, order, query), order, actual, reference, observed, query,
    {==}, actual_ready, reference_ready, unique, actual_size)

# DRAFT: one complete attachment transaction, not a provider/scheduler law.
# Successful ready projections are internal relational premises to be derived
# from whole entry execution. External resolver inputs are not restricted here.
# No successful materialization, selected query or accepted reply is assumed.
# The existential conclusion requires real Some observations on both sides.
# Reply includes arbitrary correlation, variant, bytes and exception ownership.
# World already contains provider effects; this pure law neither creates those
# effects nor erases scheduler cancellation stutters between pure transitions.
law attachment_transaction_exact:
  for ~World: Data
  for +actual: T.ResolverState
  for +reference: D.State
  for +child: X.Child
  for +phase: Phase.Phase
  for +history: V.History
  for +child_history: Phase.ChildHistory
  for +previous: Nat
  for +reply: T.Reply
  for +world: E.WorldState<World>
  for actual_ready: {
    ActualReady.project(actual, history, child_history) == Some{phase} : Maybe<&2, Phase.Phase>
  }
  for reference_ready: {
    ReferenceReady.project(reference, child, history, child_history)
    == Some{phase}
    : Maybe<&2, Phase.Phase>
  }
  # Actual Attach.built_allowed installs plan_budget before measurement;
  # reference X.guarded/retain_budget establishes the same retained budget.
  # This exact internal coherence is derived at entry, never imposed on raw
  # ResolverInput or replaced with a partial Boolean map comparison.
  for budget_coherent: {
    Contract.phase_frame_budget(phase) == Contract.phase_child_budget(phase) : V.Budget
  }
  Contract.conclusion(World, actual, reference, child, phase, history, previous, reply, world)

def main() -> Unit:
  Unit{}
