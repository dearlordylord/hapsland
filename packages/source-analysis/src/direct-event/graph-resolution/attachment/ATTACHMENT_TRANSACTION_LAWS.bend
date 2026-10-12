import Base
import ../Composition.bend as Compose
import ../SPEC.bend as RootSpec
import ./AttachmentNaturalKeyEqualityProof.bend as NaturalKeys
import ../Root.bend as PreparedRoot
import ../ForestAllowance.bend as Allowance
import ../traversal/patricia-proof/PATRICIA_MEMBERSHIP_PROOF.bend as Membership
import ../traversal/patricia-proof/PATRICIA_INSERT_PROOF.bend as Insert
import ../SignedLocalSpecification.bend as Signed
import ../traversal/SPEC.bend as Recursive
import ../../../../../agent-flow-bend/ImportGraph.bend as G
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

# Extract the existing coverage guard; no extra visited-map assumption is used.
def ready_visited_order(order: V.Order) -> List<&2, String>:
  match order:
    case V.Order{_, _, _, _, _, visited}: visited

def ready_visited_unique(+order: V.Order,
    valid: {ActualFrame.order_valid(order) == True{} : Bool}) ->
    {ActualFrame.strings_unique(ready_visited_order(order), ready_visited_order(order)) == True{} : Bool}:
  match order:
    case V.Order{+pending, +targets, +ids, +captured, +identities, +visited}:
      BoolFacts.eq_true_of_and_right(ActualFrame.nats_unique(identities, identities), ActualFrame.strings_unique(visited, visited), BoolFacts.eq_true_of_and_right(ActualFrame.strings_unique(captured, captured), Bool.and(ActualFrame.nats_unique(identities, identities), ActualFrame.strings_unique(visited, visited)), BoolFacts.eq_true_of_and_right(ActualFrame.strings_unique(ids, ids), Bool.and(ActualFrame.strings_unique(captured, captured), Bool.and(ActualFrame.nats_unique(identities, identities), ActualFrame.strings_unique(visited, visited))), BoolFacts.eq_true_of_and_right(ActualFrame.nats_unique(targets, targets), Bool.and(ActualFrame.strings_unique(ids, ids), Bool.and(ActualFrame.strings_unique(captured, captured), Bool.and(ActualFrame.nats_unique(identities, identities), ActualFrame.strings_unique(visited, visited)))), BoolFacts.eq_true_of_and_right(ActualFrame.nats_unique(pending, pending), Bool.and(ActualFrame.nats_unique(targets, targets), Bool.and(ActualFrame.strings_unique(ids, ids), Bool.and(ActualFrame.strings_unique(captured, captured), Bool.and(ActualFrame.nats_unique(identities, identities), ActualFrame.strings_unique(visited, visited))))), valid)))))

def ready_visited_size(+order: V.Order, +frame: T.ResolverFrame,
    valid: {ActualFrame.coverage(order, frame) == True{} : Bool}) ->
    {Nat.is_eq(List.length(&2, String, ready_visited_order(order)),
      List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame)))) == True{} : Bool}:
  match order:
    case V.Order{+pending, +targets, +ids, +captured, +identities, +visited}:
      BoolFacts.eq_true_of_and_right(Nat.is_eq(List.length(&2, Nat, identities), List.length(&2, String, Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame)))), Nat.is_eq(List.length(&2, String, visited), List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame)))), BoolFacts.eq_true_of_and_right(Nat.is_eq(List.length(&2, String, captured), List.length(&2, String, Map.keys(&2, Maybe<&2, T.CapturedFacts>, S.frame_captured(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, identities), List.length(&2, String, Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame)))), Nat.is_eq(List.length(&2, String, visited), List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame))))), BoolFacts.eq_true_of_and_right(Nat.is_eq(List.length(&2, String, ids), List.length(&2, String, Map.keys(&2, Maybe<&2, Nat>, S.frame_target_ids(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, captured), List.length(&2, String, Map.keys(&2, Maybe<&2, T.CapturedFacts>, S.frame_captured(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, identities), List.length(&2, String, Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame)))), Nat.is_eq(List.length(&2, String, visited), List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame)))))), BoolFacts.eq_true_of_and_right(Nat.is_eq(List.length(&2, Nat, targets), List.length(&2, String, Map.keys(&2, Maybe<&2, T.Target>, S.frame_target_paths(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, ids), List.length(&2, String, Map.keys(&2, Maybe<&2, Nat>, S.frame_target_ids(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, captured), List.length(&2, String, Map.keys(&2, Maybe<&2, T.CapturedFacts>, S.frame_captured(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, identities), List.length(&2, String, Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame)))), Nat.is_eq(List.length(&2, String, visited), List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame))))))), BoolFacts.eq_true_of_and_right(Nat.is_eq(List.length(&2, Nat, pending), List.length(&2, String, Map.keys(&2, Maybe<&2, Local.Pending>, S.frame_pending(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, targets), List.length(&2, String, Map.keys(&2, Maybe<&2, T.Target>, S.frame_target_paths(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, ids), List.length(&2, String, Map.keys(&2, Maybe<&2, Nat>, S.frame_target_ids(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, captured), List.length(&2, String, Map.keys(&2, Maybe<&2, T.CapturedFacts>, S.frame_captured(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, identities), List.length(&2, String, Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame)))), Nat.is_eq(List.length(&2, String, visited), List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame)))))))), BoolFacts.eq_true_of_and_right(ActualFrame.order_valid(order), Bool.and(Nat.is_eq(List.length(&2, Nat, pending), List.length(&2, String, Map.keys(&2, Maybe<&2, Local.Pending>, S.frame_pending(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, targets), List.length(&2, String, Map.keys(&2, Maybe<&2, T.Target>, S.frame_target_paths(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, ids), List.length(&2, String, Map.keys(&2, Maybe<&2, Nat>, S.frame_target_ids(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, captured), List.length(&2, String, Map.keys(&2, Maybe<&2, T.CapturedFacts>, S.frame_captured(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, identities), List.length(&2, String, Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame)))), Nat.is_eq(List.length(&2, String, visited), List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame))))))))), valid))))))

def ready_visited_coverage(+order: V.Order, +frame: T.ResolverFrame,
    +valid: {ActualFrame.coverage(order, frame) == True{} : Bool}) ->
    {ActualFrame.strings_unique(ready_visited_order(order), ready_visited_order(order)) == True{} : Bool} &
    {Nat.is_eq(List.length(&2, String, ready_visited_order(order)),
      List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame)))) == True{} : Bool}:
  match order:
    case V.Order{+pending, +targets, +ids, +captured, +identities, +visited}:
      Tuple{ready_visited_unique(order,
        BoolFacts.eq_true_of_and_left(ActualFrame.order_valid(order),
          Bool.and(Nat.is_eq(List.length(&2, Nat, pending), List.length(&2, String, Map.keys(&2, Maybe<&2, Local.Pending>, S.frame_pending(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, targets), List.length(&2, String, Map.keys(&2, Maybe<&2, T.Target>, S.frame_target_paths(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, ids), List.length(&2, String, Map.keys(&2, Maybe<&2, Nat>, S.frame_target_ids(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, captured), List.length(&2, String, Map.keys(&2, Maybe<&2, T.CapturedFacts>, S.frame_captured(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, identities), List.length(&2, String, Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame)))), Nat.is_eq(List.length(&2, String, visited), List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame))))))))), valid)),
        ready_visited_size(order, frame, valid)}

def ready_view_visited(view: V.Frame) -> List<&2, String>:
  match view:
    case V.Frame{_, _, _, _, _, _, _, _, _, _, _, visited, _, _, _, _, _, _, _, _}: visited

def ready_history_visited(history: V.History) -> List<&2, String>:
  match history:
    case V.History{_, order, _, _, _, _, _}: ready_visited_order(order)

def ready_view_visited_contents(+forest: Maybe<&2, F.Forest>, +pending: Maybe<&2, List<&2, V.PendingEntry>>, +targets: Maybe<&2, List<&2, V.TargetEntry>>, +ids: Maybe<&2, List<&2, V.TargetId>>, +captured: Maybe<&2, List<&2, V.CapturedEntry>>, +identities: Maybe<&2, List<&2, V.TargetArtifact>>, +visited: Maybe<&2, List<&2, String>>, +actual: T.ResolverFrame, +remaining: Nat, +episode: Nat, +view: V.Frame,
    ready: {ActualFrame.frame_view(forest, pending, targets, ids, captured, identities, visited, actual, remaining, episode) == Some{view} : Maybe<&2, V.Frame>}) ->
    {visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}:
  match forest pending targets ids captured identities visited actual:
    case Some{+forest_value} Some{+pending_value} Some{+targets_value} Some{+ids_value} Some{+captured_value} Some{+identities_value} Some{+visited_value}
      T.ResolverFrame{branch, limits, graph, command, deps, _, _, _, _, budget, node, edge, target, artifact, _, _, _, _, _, artifacts}:
      %Count.some_equal(V.Frame, V.Frame{branch, limits, graph, command, deps, forest_value, pending_value, targets_value, ids_value, captured_value, identities_value, visited_value, V.actual_budget(budget), node, edge, target, artifact, artifacts, remaining, episode}, view, ready):
        {Some{visited_value} == Some{ready_view_visited(_)} : Maybe<&2, List<&2, String>>}
      {==}
    case None{} _ _ _ _ _ _ _:
      Empty.absurd({visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))
    case Some{_} None{} _ _ _ _ _ _:
      Empty.absurd({visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} None{} _ _ _ _ _:
      Empty.absurd({visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} Some{_} None{} _ _ _ _:
      Empty.absurd({visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} Some{_} Some{_} None{} _ _ _:
      Empty.absurd({visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} Some{_} Some{_} Some{_} None{} _ _:
      Empty.absurd({visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))
    case Some{_} Some{_} Some{_} Some{_} Some{_} Some{_} None{} _:
      Empty.absurd({visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))

def ready_projected_visited(+frame: T.ResolverFrame, +history: V.History, +view: V.Frame,
    ready: {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {ActualFrame.visited(ready_history_visited(history), S.frame_visited(frame))
      == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}:
  match history:
    case V.History{+addresses, V.Order{+pending_order, +target_order, +id_order, +capture_order, +identity_order, +visited_order}, +sources, +captures, _, +remaining, +episode}:
      ready_view_visited_contents(ActualFrame.forest_valid(P.project(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame), S.frame_artifacts(frame), addresses), episode), ActualFrame.pending(pending_order, S.frame_pending(frame), sources, addresses), ActualFrame.targets(target_order, S.frame_target_paths(frame), addresses), ActualFrame.ids(id_order, S.frame_target_ids(frame)), ActualFrame.captured(capture_order, S.frame_captured(frame), captures), ActualFrame.identities(identity_order, S.frame_target_artifacts(frame)), ActualFrame.visited(visited_order, S.frame_visited(frame)), frame, remaining, episode, view, ready)

def ready_reference_visited(state: D.State) -> Map<&2, Bool>:
  match state:
    case D.State{_, X.Frame{_, _, _, Signed.State{Recursive.State{values, _, _, _}, _},
      _, _, _, _, _, _, _, _}, _, _, _, _, _, _, _}: values

def ready_reference_assembled(+state: D.State, +history: V.History,
    +projected_targets: Maybe<&2, List<&2, V.TargetEntry>>,
    +projected_captured: Maybe<&2, List<&2, V.CapturedEntry>>,
    +projected_visited: Maybe<&2, List<&2, String>>, +view: V.Frame,
    ready: {ReferenceFrame.assembled(state, history, projected_targets,
      projected_captured, projected_visited) == Some{view} : Maybe<&2, V.Frame>}) ->
    {projected_visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}:
  match state history projected_targets projected_captured projected_visited:
    case D.State{D.Config{_, _, _, context, _, _},
      X.Frame{G.Bounded{+graph, remaining}, command, +forest,
        Signed.State{Recursive.State{_, budget, _, _}, signed}, edges, _, artifacts_by_target,
        next_edge, episode, next_artifact, dependencies, _}, _, target_ids, next_target, _, _, _, _}
      V.History{_, _, _, _, artifacts, _, _}
      Some{targets} Some{captures} Some{+seen}:
      %Count.some_equal(V.Frame,
        V.Frame{ReferenceFrame.branch(context), ReferenceFrame.graph_limits(graph), graph, command, dependencies, forest,
          ReferenceFrame.pending(edges), targets, ReferenceFrame.ids(target_ids), captures, ReferenceFrame.identities(artifacts_by_target),
          seen, V.budget(budget, signed), ReferenceFrame.node_count(forest), next_edge,
          next_target, next_artifact, artifacts, remaining, episode}, view, ready):
        {Some{seen} == Some{ready_view_visited(_)} : Maybe<&2, List<&2, String>>}
      {==}
    case _ _ None{} _ _:
      Empty.absurd({projected_visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))
    case _ _ Some{_} None{} _:
      Empty.absurd({projected_visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))
    case _ _ Some{_} Some{_} None{}:
      Empty.absurd({projected_visited == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}, Contents.none_some(V.Frame, view, ready))

def ready_reference_projected(+state: D.State, +history: V.History, +view: V.Frame,
    ready: {ReferenceFrame.project(state, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {ReferenceFrame.visited(ready_history_visited(history), ready_reference_visited(state))
      == Some{ready_view_visited(view)} : Maybe<&2, List<&2, String>>}:
  match state history:
    case D.State{_, X.Frame{_, _, _, Signed.State{Recursive.State{+values, _, _, _}, _},
      _, +captures, _, _, _, _, _, _}, +target_values, _, _, _, _, _, _}
      V.History{_, V.Order{_, _, _, _, _, +seen}, _, +sources, _, _, _}:
      ready_reference_assembled(state, history, ReferenceFrame.targets(target_values),
        ReferenceFrame.captured(captures, sources), ReferenceFrame.visited(seen, values), view, ready)

def ready_coverage_order(+order: V.Order, +frame: T.ResolverFrame,
    +valid: {ActualFrame.coverage(order, frame) == True{} : Bool}) ->
    {ActualFrame.order_valid(order) == True{} : Bool}:
  match order:
    case V.Order{+pending, +targets, +ids, +captured, +identities, +visited}:
      BoolFacts.eq_true_of_and_left(ActualFrame.order_valid(order),
          Bool.and(Nat.is_eq(List.length(&2, Nat, pending), List.length(&2, String, Map.keys(&2, Maybe<&2, Local.Pending>, S.frame_pending(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, targets), List.length(&2, String, Map.keys(&2, Maybe<&2, T.Target>, S.frame_target_paths(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, ids), List.length(&2, String, Map.keys(&2, Maybe<&2, Nat>, S.frame_target_ids(frame)))), Bool.and(Nat.is_eq(List.length(&2, String, captured), List.length(&2, String, Map.keys(&2, Maybe<&2, T.CapturedFacts>, S.frame_captured(frame)))), Bool.and(Nat.is_eq(List.length(&2, Nat, identities), List.length(&2, String, Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame)))), Nat.is_eq(List.length(&2, String, visited), List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame))))))))), valid)

def ready_history_order(history: V.History) -> V.Order:
  match history:
    case V.History{_, order, _, _, _, _, _}: order

def ready_frame_coverage(+frame: T.ResolverFrame, +history: V.History,
    checks: {frame_checks(frame, history) == True{} : Bool}) ->
    {ActualFrame.coverage(ready_history_order(history), frame) == True{} : Bool}:
  match history:
    case V.History{_, +order, _, _, _, _, _}:
      BoolFacts.eq_true_of_and_left(ActualFrame.coverage(order, frame),
        Bool.and(ActualFrame.dense(S.frame_nodes(frame), 0n),
          Bool.and(Nat.is_eq(S.frame_next_node(frame), List.length(&2, Local.PlannedNode, S.frame_nodes(frame))),
            ActualFrame.catalog_valid(S.frame_artifacts(frame)))), checks)

def ready_lookup_observed(+frame: T.ResolverFrame, +reference: D.State,
    +history: V.History, +view: V.Frame, +query: String,
    +checks: {frame_checks(frame, history) == True{} : Bool},
    actual_ready: {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>},
    reference_ready: {ReferenceFrame.project(reference, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(frame), query))
      == Local.map_result(Bool, Map.get(Bool, False{}, ready_reference_visited(reference), query)) : Bool}:
  match history:
    case V.History{_, +order, _, _, _, _, _}:
      visited_lookup_exact(ready_visited_order(order), S.frame_visited(frame), ready_reference_visited(reference),
        ready_view_visited(view), query,
        ready_projected_visited(frame, history, view, actual_ready),
        ready_reference_projected(reference, history, view, reference_ready),
        ready_visited_unique(order,
          ready_coverage_order(order, frame,
            ready_frame_coverage(frame, history, checks))),
        ready_visited_size(order, frame, ready_frame_coverage(frame, history, checks)))

def ready_lookup_parts(+frame: T.ResolverFrame, +reference: D.State,
    +history: V.History, +view: V.Frame, +query: String,
    evidence: {frame_checks(frame, history) == True{} : Bool} &
      {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>},
    reference_ready: {ReferenceFrame.project(reference, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(frame), query))
      == Local.map_result(Bool, Map.get(Bool, False{}, ready_reference_visited(reference), query)) : Bool}:
  match evidence:
    case (checks, actual_ready):
      ready_lookup_observed(frame, reference, history, view, query, checks, actual_ready, reference_ready)

def ready_frame_lookup_exact(+frame: T.ResolverFrame, +reference: D.State,
    +history: V.History, +view: V.Frame, +query: String,
    actual_ready: {ActualFrame.project(frame, history) == Some{view} : Maybe<&2, V.Frame>},
    reference_ready: {ReferenceFrame.project(reference, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(frame), query))
      == Local.map_result(Bool, Map.get(Bool, False{}, ready_reference_visited(reference), query)) : Bool}:
  ready_lookup_parts(frame, reference, history, view, query,
    actual_frame_contents(frame, history, view, actual_ready), reference_ready)

def ready_known_kind(kind: X.ChildKind, entries: Map<&2, Bool>, identity: String) -> Bool:
  match kind:
    case X.FileChild{_}: Local.map_result(Bool, Map.get(Bool, False{}, entries, identity))
    case X.BundledChild{}: False{}

def ready_actual_identity(child: T.TentativeChild) -> String:
  match child:
    case T.TentativeChild{_, _, _, _, _, _, identity, _, _, _, _, _}: identity

def ready_actual_path(child: T.TentativeChild) -> String:
  match child:
    case T.TentativeChild{_, path, _, _, _, _, _, _, _, _, _, _}: path

def ready_edge_known_target(target: Local.PendingTarget, path: String,
    +entries: Map<&2, Bool>, +identity: String) ->
    {Bool.and(Bool.not(Attach.bundled_target(target)),
      Local.map_result(Bool, Map.get(Bool, False{}, entries, identity)))
      == ready_known_kind(ActualReady.kind(target, path), entries, identity) : Bool}:
  match target:
    case Local.BundledTarget{_}: {==}
    case Local.Imported{_, _}: {==}

def ready_edge_known(edge: Local.Pending, +path: String,
    +entries: Map<&2, Bool>, +identity: String) ->
    {Bool.and(Bool.not(Attach.bundled_edge(edge)),
      Local.map_result(Bool, Map.get(Bool, False{}, entries, identity)))
      == ready_known_kind(ActualReady.edge_kind(edge, path), entries, identity) : Bool}:
  match edge:
    case Local.Pending{_, _, _, _, _, _, _, target}:
      ready_edge_known_target(target, path, entries, identity)

def ready_reference_kind(child: X.Child) -> X.ChildKind:
  match child:
    case X.Child{X.Attempt{_, _, kind, _, _, _, _, _, _, _}, _, _, _}: kind

def ready_reference_identity(child: X.Child) -> String:
  match child:
    case X.Child{X.Attempt{_, _, _, _, _, _, _, declaration, _, _}, _, _, _}: X.identity(declaration)

def observed_selected_choice(side: Bool, +left: Maybe<&2, String>, +right: Maybe<&2, String>, +query: String) ->
    {Membership.selected_equal(Insert.selected_choice(side, left, right), query)
      == Bool.pick(Bool, side, Membership.selected_equal(right, query), Membership.selected_equal(left, query)) : Bool}:
  match side:
    case False{}: {==}
    case True{}: {==}

def observed_selected_positive(tree: Map<&2, Bool>, +query: String,
    ready: {Membership.selected_equal(Insert.selected(Bool, tree, query), query) == True{} : Bool}) ->
    NatFacts.le(1n, observed_map_count(tree, query)):
  match tree:
    case MTip{}:
      Empty.absurd(NatFacts.le(1n, 0n), StringFacts.internal_false_ne_true(ready))
    case MLeaf{+name, _}:
      %Equal.sym(Bool, String.eq(query, name), True{}, ready):
        NatFacts.le(1n, Bool.pick(Nat, _, 1n, 0n))
      {==}
    case MNode{+position, +lo, +hi}:
      observed_node_positive(Patricia.route(query, position),
        Membership.selected_equal(Insert.selected(Bool, lo, query), query),
        Membership.selected_equal(Insert.selected(Bool, hi, query), query),
        observed_map_count(lo, query), observed_map_count(hi, query),
        Equal.trans(Bool,
          Bool.pick(Bool, Patricia.route(query, position),
            Membership.selected_equal(Insert.selected(Bool, hi, query), query),
            Membership.selected_equal(Insert.selected(Bool, lo, query), query)),
          Membership.selected_equal(Insert.selected(Bool, MNode{position, lo, hi}, query), query), True{},
          Equal.sym(Bool,
            Membership.selected_equal(Insert.selected(Bool, MNode{position, lo, hi}, query), query),
            Bool.pick(Bool, Patricia.route(query, position),
              Membership.selected_equal(Insert.selected(Bool, hi, query), query),
              Membership.selected_equal(Insert.selected(Bool, lo, query), query)),
            observed_selected_choice(Patricia.route(query, position), Insert.selected(Bool, lo, query), Insert.selected(Bool, hi, query), query)), ready),
        proof => observed_selected_positive(lo, query, proof),
        proof => observed_selected_positive(hi, query, proof))

def observed_presence_positive(+tree: Map<&2, Bool>, +query: String,
    ready: {Recursive.value(Bool, Map.has(&2, Bool, tree, query)) == True{} : Bool}) ->
    NatFacts.le(1n, observed_key_count(Map.keys(&2, Bool, tree), query)):
  %Equal.sym(Nat, observed_key_count(Map.keys(&2, Bool, tree), query), observed_map_count(tree, query),
    observed_map_keys(tree, query)): NatFacts.le(1n, _)
  observed_selected_positive(tree, query,
    Equal.trans(Bool, Membership.selected_equal(Insert.selected(Bool, tree, query), query),
      Recursive.value(Bool, Map.has(&2, Bool, tree, query)), True{},
      Equal.sym(Bool, Recursive.value(Bool, Map.has(&2, Bool, tree, query)),
        Membership.selected_equal(Insert.selected(Bool, tree, query), query),
        Equal.cong(Map<&2, Bool> & Bool, Bool, result => Recursive.value(Bool, result),
          Map.has(&2, Bool, tree, query), Tuple{tree, Membership.selected_equal(Insert.selected(Bool, tree, query), query)},
          Membership.has_exact(Bool, tree, query))), ready))

def observed_value_present(same: Bool, value: Bool,
    ready: {Bool.pick(Bool, same, value, False{}) == True{} : Bool}) -> {same == True{} : Bool}:
  match same:
    case True{}: {==}
    case False{}: Empty.absurd({False{} == True{} : Bool}, StringFacts.internal_false_ne_true(ready))

def observed_presence_route(side: Bool, +left: Bool, +right: Bool, +left_seen: Bool, +right_seen: Bool,
    ready: {Bool.pick(Bool, side, right, left) == True{} : Bool},
    left_proof: {left == True{} : Bool} -> {left_seen == True{} : Bool},
    right_proof: {right == True{} : Bool} -> {right_seen == True{} : Bool}) ->
    {Bool.pick(Bool, side, right_seen, left_seen) == True{} : Bool}:
  match side:
    case False{}: left_proof(ready)
    case True{}: right_proof(ready)

def observed_routed_presence(tree: Map<&2, Bool>, +query: String,
    ready: {Payload.routed_value(Bool, False{}, tree, query) == True{} : Bool}) ->
    {Membership.selected_equal(Insert.selected(Bool, tree, query), query) == True{} : Bool}:
  match tree:
    case MTip{}: Empty.absurd({False{} == True{} : Bool}, StringFacts.internal_false_ne_true(ready))
    case MLeaf{+name, +value}:
      observed_value_present(String.eq(query, name), value,
        Equal.trans(Bool, Bool.pick(Bool, String.eq(query, name), value, False{}),
          Local.map_result(Bool, Map.get(Bool, False{}, MLeaf{name, value}, query)), True{},
          Equal.sym(Bool, Local.map_result(Bool, Map.get(Bool, False{}, MLeaf{name, value}, query)),
            Bool.pick(Bool, String.eq(query, name), value, False{}),
            Payload.leaf_read_exact(Bool, False{}, name, value, query)), ready))
    case MNode{+position, +lo, +hi}:
      Equal.trans(Bool, Membership.selected_equal(Insert.selected(Bool, MNode{position, lo, hi}, query), query),
        Bool.pick(Bool, Patricia.route(query, position),
          Membership.selected_equal(Insert.selected(Bool, hi, query), query),
          Membership.selected_equal(Insert.selected(Bool, lo, query), query)), True{},
        observed_selected_choice(Patricia.route(query, position), Insert.selected(Bool, lo, query), Insert.selected(Bool, hi, query), query),
        observed_presence_route(Patricia.route(query, position), Payload.routed_value(Bool, False{}, lo, query), Payload.routed_value(Bool, False{}, hi, query),
          Membership.selected_equal(Insert.selected(Bool, lo, query), query), Membership.selected_equal(Insert.selected(Bool, hi, query), query), ready,
          proof => observed_routed_presence(lo, query, proof), proof => observed_routed_presence(hi, query, proof)))

def observed_lookup_presence(+tree: Map<&2, Bool>, +query: String,
    ready: {Local.map_result(Bool, Map.get(Bool, False{}, tree, query)) == True{} : Bool}) ->
    {Recursive.value(Bool, Map.has(&2, Bool, tree, query)) == True{} : Bool}:
  Equal.trans(Bool, Recursive.value(Bool, Map.has(&2, Bool, tree, query)),
    Membership.selected_equal(Insert.selected(Bool, tree, query), query), True{},
    Equal.cong(Map<&2, Bool> & Bool, Bool, result => Recursive.value(Bool, result),
      Map.has(&2, Bool, tree, query), Tuple{tree, Membership.selected_equal(Insert.selected(Bool, tree, query), query)},
      Membership.has_exact(Bool, tree, query)),
    observed_routed_presence(tree, query,
      Equal.trans(Bool, Payload.routed_value(Bool, False{}, tree, query),
        Local.map_result(Bool, Map.get(Bool, False{}, tree, query)), True{},
        Equal.sym(Bool, Local.map_result(Bool, Map.get(Bool, False{}, tree, query)),
          Payload.routed_value(Bool, False{}, tree, query), Payload.lookup_routed(Bool, False{}, tree, query)), ready)))

def visited_absent_presence_selected(+present: Bool, +order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>, +query: String,
    lookup: {Recursive.value(Bool, Map.has(&2, Bool, entries, query)) == present : Bool},
    ready: {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>},
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    same_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries))) == True{} : Bool},
    absent: {List.contains(String, String.eq, order, query) == False{} : Bool}) ->
    {Recursive.value(Bool, Map.has(&2, Bool, entries, query)) == False{} : Bool}:
  match present:
    case False{}: lookup
    case True{}:
      Empty.absurd({Recursive.value(Bool, Map.has(&2, Bool, entries, query)) == False{} : Bool},
        observed_extra_impossible(order, Map.keys(&2, Bool, entries), query, unique, same_size, absent,
          visited_positive(order, entries, observed, ready), observed_presence_positive(entries, query, lookup)))

def visited_absent_presence(+order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>, +query: String,
    ready: {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>},
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    same_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries))) == True{} : Bool},
    absent: {List.contains(String, String.eq, order, query) == False{} : Bool}) ->
    {Recursive.value(Bool, Map.has(&2, Bool, entries, query)) == False{} : Bool}:
  visited_absent_presence_selected(Recursive.value(Bool, Map.has(&2, Bool, entries, query)), order, entries, observed, query,
    {==}, ready, unique, same_size, absent)

def visited_presence_selected(+member: Bool, +order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>, +query: String,
    +belongs: {List.contains(String, String.eq, order, query) == member : Bool},
    +ready: {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>},
    +unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    +same_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries))) == True{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, entries, query))
      == Recursive.value(Bool, Map.has(&2, Bool, entries, query)) : Bool}:
  match member:
    case True{}:
      Equal.trans(Bool, Local.map_result(Bool, Map.get(Bool, False{}, entries, query)), True{},
        Recursive.value(Bool, Map.has(&2, Bool, entries, query)),
        visited_member_sound(order, entries, observed, query, ready, belongs),
        Equal.sym(Bool, Recursive.value(Bool, Map.has(&2, Bool, entries, query)), True{},
          observed_lookup_presence(entries, query, visited_member_sound(order, entries, observed, query, ready, belongs))))
    case False{}:
      Equal.trans(Bool, Local.map_result(Bool, Map.get(Bool, False{}, entries, query)), False{},
        Recursive.value(Bool, Map.has(&2, Bool, entries, query)),
        visited_absent_lookup(order, entries, observed, query, ready, unique, same_size, belongs),
        Equal.sym(Bool, Recursive.value(Bool, Map.has(&2, Bool, entries, query)), False{},
          visited_absent_presence(order, entries, observed, query, ready, unique, same_size, belongs)))

def visited_presence_exact(+order: List<&2, String>, +entries: Map<&2, Bool>,
    +observed: List<&2, String>, +query: String,
    ready: {ActualFrame.visited(order, entries) == Some{observed} : Maybe<&2, List<&2, String>>},
    unique: {ActualFrame.strings_unique(order, order) == True{} : Bool},
    same_size: {Nat.is_eq(List.length(&2, String, order), List.length(&2, String, Map.keys(&2, Bool, entries))) == True{} : Bool}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, entries, query))
      == Recursive.value(Bool, Map.has(&2, Bool, entries, query)) : Bool}:
  visited_presence_selected(List.contains(String, String.eq, order, query), order, entries, observed, query,
    {==}, ready, unique, same_size)

def ready_frame_seen_observed(+frame: T.ResolverFrame, +reference: D.State,
    +history: V.History, +view: V.Frame, +query: String,
    +checks: {frame_checks(frame, history) == True{} : Bool},
    actual_ready: {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>},
    +reference_ready: {ReferenceFrame.project(reference, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(frame), query))
      == Recursive.value(Bool, Map.has(&2, Bool, ready_reference_visited(reference), query)) : Bool}:
  match history:
    case V.History{_, +order, _, _, _, _, _}:
      Equal.trans(Bool, Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(frame), query)),
        Local.map_result(Bool, Map.get(Bool, False{}, ready_reference_visited(reference), query)),
        Recursive.value(Bool, Map.has(&2, Bool, ready_reference_visited(reference), query)),
        ready_lookup_observed(frame, reference, history, view, query, checks, actual_ready, reference_ready),
        visited_presence_exact(ready_visited_order(order), ready_reference_visited(reference), ready_view_visited(view), query,
          reference_visited_contents(ready_visited_order(order), ready_reference_visited(reference), ready_view_visited(view),
            ready_reference_projected(reference, history, view, reference_ready)),
          ready_visited_unique(order, ready_coverage_order(order, frame, ready_frame_coverage(frame, history, checks))),
          reference_visited_cardinality(ready_visited_order(order), ready_reference_visited(reference), ready_view_visited(view),
            ready_reference_projected(reference, history, view, reference_ready))))

def ready_frame_seen_parts(+frame: T.ResolverFrame, +reference: D.State,
    +history: V.History, +view: V.Frame, +query: String,
    evidence: {frame_checks(frame, history) == True{} : Bool} &
      {ActualFrame.projected(frame, history) == Some{view} : Maybe<&2, V.Frame>},
    reference_ready: {ReferenceFrame.project(reference, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(frame), query))
      == Recursive.value(Bool, Map.has(&2, Bool, ready_reference_visited(reference), query)) : Bool}:
  match evidence:
    case (checks, actual_ready):
      ready_frame_seen_observed(frame, reference, history, view, query, checks, actual_ready, reference_ready)

def ready_frame_seen_exact(+frame: T.ResolverFrame, +reference: D.State,
    +history: V.History, +view: V.Frame, +query: String,
    actual_ready: {ActualFrame.project(frame, history) == Some{view} : Maybe<&2, V.Frame>},
    reference_ready: {ReferenceFrame.project(reference, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(frame), query))
      == Recursive.value(Bool, Map.has(&2, Bool, ready_reference_visited(reference), query)) : Bool}:
  ready_frame_seen_parts(frame, reference, history, view, query,
    actual_frame_contents(frame, history, view, actual_ready), reference_ready)

def ready_child_kind(child: Phase.Child) -> X.ChildKind:
  match child:
    case Phase.Child{_, _, kind, _, _, _, _, _, _, _, _, _, _, _, _, _}: kind

def ready_child_identity(child: Phase.Child) -> String:
  match child:
    case Phase.Child{_, _, _, _, _, _, _, identity, _, _, _, _, _, _, _, _}: identity

def ready_actual_child_shape(+forest: Maybe<&2, F.Forest>, +pending: Maybe<&2, List<&2, V.PendingPayload>>,
    +visited: Maybe<&2, List<&2, String>>, +child: T.TentativeChild, +edge: Local.Pending,
    +history: Phase.ChildHistory, +view: Phase.Child,
    ready: {ActualReady.child_view(forest, pending, visited, child, edge, history)
      == Some{view} : Maybe<&2, Phase.Child>}) ->
    {ActualReady.edge_kind(edge, ready_actual_path(child)) == ready_child_kind(view) : X.ChildKind} &
    {ready_actual_identity(child) == ready_child_identity(view) : String}:
  match forest pending visited child history:
    case Some{+forest_value} Some{+pending_value} Some{+visited_value}
      T.TentativeChild{target, +path, capture, bytes, file, artifact, +identity, before, Local.Plan{_, _, _, _, _, budget}, _, _, _}
      Phase.ChildHistory{F.Created{_, _, addresses}, source, catalog, _, _}:
      %Count.some_equal(Phase.Child, Phase.Child{target, path, ActualReady.edge_kind(edge, path), capture, bytes, file,
          artifact, identity, before, forest_value, addresses, pending_value, visited_value, V.actual_budget(budget), source, catalog}, view, ready):
        {ActualReady.edge_kind(edge, path) == ready_child_kind(_) : X.ChildKind} & {identity == ready_child_identity(_) : String}
      Tuple{{==}, {==}}
    case None{} _ _ _ _:
      Empty.absurd({ActualReady.edge_kind(edge, ready_actual_path(child)) == ready_child_kind(view) : X.ChildKind} &
    {ready_actual_identity(child) == ready_child_identity(view) : String}, Contents.none_some(Phase.Child, view, ready))
    case Some{_} None{} _ _ _:
      Empty.absurd({ActualReady.edge_kind(edge, ready_actual_path(child)) == ready_child_kind(view) : X.ChildKind} &
    {ready_actual_identity(child) == ready_child_identity(view) : String}, Contents.none_some(Phase.Child, view, ready))
    case Some{_} Some{_} None{} _ _:
      Empty.absurd({ActualReady.edge_kind(edge, ready_actual_path(child)) == ready_child_kind(view) : X.ChildKind} &
    {ready_actual_identity(child) == ready_child_identity(view) : String}, Contents.none_some(Phase.Child, view, ready))

def ready_reference_child_shape(+child: X.Child,
    +history: Phase.ChildHistory, +visited: Maybe<&2, List<&2, String>>, +view: Phase.Child,
    ready: {ReferenceReady.child_view(child, history, visited) == Some{view} : Maybe<&2, Phase.Child>}) ->
    {ready_reference_kind(child) == ready_child_kind(view) : X.ChildKind} &
    {ready_reference_identity(child) == ready_child_identity(view) : String}:
  match child history visited:
    case X.Child{
      X.Attempt{
        +target,
        edge,
        +kind,
        +source,
        +bytes,
        name,
        expected,
        Local.Declaration{+handle, +identity, function, bundled, references, +source_path},
        +catalog,
        +before
      },
      F.Created{root, nodes, addresses},
      Signed.State{Recursive.State{_, budget, _, _}, signed},
      edges
    }
      Phase.ChildHistory{_, _, _, capture, _} Some{+visited}:
      %Count.some_equal(Phase.Child,
        Phase.Child{
          target,
          X.attempt_path(
            X.Attempt{
              target,
              edge,
              kind,
              source,
              bytes,
              name,
              expected,
              Local.Declaration{handle, identity, function, bundled, references, source_path},
              catalog,
              before
            }
          ),
          kind,
          capture,
          bytes,
          T.CapturedFacts{ReferenceFrame.facts(catalog), ReferenceReady.file_exports(kind, source), bytes},
          handle,
          identity,
          before,
          F.Forest{Some{root}, nodes},
          addresses,
          ReferenceReady.pending(edges),
          visited,
          V.budget(budget, signed),
          source,
          catalog
        }, view, ready):
        {kind == ready_child_kind(_) : X.ChildKind} & {identity == ready_child_identity(_) : String}
      Tuple{{==}, {==}}
    case _ _ None{}:
      Empty.absurd({ready_reference_kind(child) == ready_child_kind(view) : X.ChildKind} & {ready_reference_identity(child) == ready_child_identity(view) : String}, Contents.none_some(Phase.Child, view, ready))

def ready_actual_shape_projected(+child: T.TentativeChild, +edge: Local.Pending,
    +history: Phase.ChildHistory, +artifacts: List<&2, T.ArtifactEntry>, +episode: Nat, +view: Phase.Child,
    ready: {ActualReady.child_projected(child, edge, history, artifacts, episode) == Some{view} : Maybe<&2, Phase.Child>}) ->
    {ActualReady.edge_kind(edge, ready_actual_path(child)) == ready_child_kind(view) : X.ChildKind} &
    {ready_actual_identity(child) == ready_child_identity(view) : String}:
  match child history:
    case T.TentativeChild{_, _, _, _, _, _, _, _, Local.Plan{+root, +nodes, +slots, +edges, +visited, _}, _, _, _}
      Phase.ChildHistory{F.Created{_, _, +addresses}, _, _, _, +order}:
      ready_actual_child_shape(ActualReady.valid_forest(P.project(root, nodes, slots, artifacts, addresses), episode),
        ActualReady.pending(edges, addresses), ActualReady.visited_complete(order, visited), child, edge, history, view, ready)

def ready_actual_shape_parts(+child: T.TentativeChild, +edge: Local.Pending,
    +history: Phase.ChildHistory, +artifacts: List<&2, T.ArtifactEntry>, +episode: Nat, +view: Phase.Child,
    evidence: {child_checks(child) == True{} : Bool} &
      {ActualReady.child_projected(child, edge, history, artifacts, episode) == Some{view} : Maybe<&2, Phase.Child>}) ->
    {ActualReady.edge_kind(edge, ready_actual_path(child)) == ready_child_kind(view) : X.ChildKind} &
    {ready_actual_identity(child) == ready_child_identity(view) : String}:
  match evidence:
    case (_, projected): ready_actual_shape_projected(child, edge, history, artifacts, episode, view, projected)

def ready_actual_shape_exact(+child: T.TentativeChild, +edge: Local.Pending,
    +history: Phase.ChildHistory, +artifacts: List<&2, T.ArtifactEntry>, +episode: Nat, +view: Phase.Child,
    ready: {ActualReady.child_project(child, edge, history, artifacts, episode) == Some{view} : Maybe<&2, Phase.Child>}) ->
    {ActualReady.edge_kind(edge, ready_actual_path(child)) == ready_child_kind(view) : X.ChildKind} &
    {ready_actual_identity(child) == ready_child_identity(view) : String}:
  ready_actual_shape_parts(child, edge, history, artifacts, episode, view,
    actual_child_contents(child, edge, history, artifacts, episode, view, ready))

def ready_reference_shape_exact(+child: X.Child, +history: Phase.ChildHistory, +view: Phase.Child,
    ready: {ReferenceReady.child_project(child, history) == Some{view} : Maybe<&2, Phase.Child>}) ->
    {ready_reference_kind(child) == ready_child_kind(view) : X.ChildKind} &
    {ready_reference_identity(child) == ready_child_identity(view) : String}:
  match child history:
    case X.Child{_, _, Signed.State{Recursive.State{+values, _, _, _}, _}, _}
      Phase.ChildHistory{_, _, _, _, +order}:
      ready_reference_child_shape(child, history, ReferenceFrame.visited(order, values), view, ready)

def ready_seen_kind(kind: X.ChildKind, entries: Map<&2, Bool>, identity: String) -> Bool:
  match kind:
    case X.FileChild{_}: Recursive.value(Bool, Map.has(&2, Bool, entries, identity))
    case X.BundledChild{}: False{}

def ready_reference_attempt(child: X.Child) -> X.Attempt:
  match child:
    case X.Child{attempt, _, _, _}: attempt

def ready_reference_known_exact(+state: D.State, +child: X.Child) ->
    {X.known_file(D.frame(state), ready_reference_attempt(child))
      == ready_seen_kind(ready_reference_kind(child), ready_reference_visited(state), ready_reference_identity(child)) : Bool}:
  match state child:
    case D.State{_, X.Frame{_, _, _, Signed.State{Recursive.State{_, _, _, _}, _}, _, _, _, _, _, _, _, _}, _, _, _, _, _, _, _}
      X.Child{X.Attempt{_, _, X.FileChild{_}, _, _, _, _, Local.Declaration{_, _, _, _, _, _}, _, _}, _, _, _}: {==}
    case _ X.Child{X.Attempt{_, _, X.BundledChild{}, _, _, _, _, _, _, _}, _, _, _}: {==}

def ready_kind_lookup_transport(+kind: X.ChildKind, +actual: Map<&2, Bool>, +reference: Map<&2, Bool>, +identity: String,
    lookup: {Local.map_result(Bool, Map.get(Bool, False{}, actual, identity))
      == Recursive.value(Bool, Map.has(&2, Bool, reference, identity)) : Bool}) ->
    {ready_known_kind(kind, actual, identity) == ready_seen_kind(kind, reference, identity) : Bool}:
  match kind:
    case X.FileChild{_}: lookup
    case X.BundledChild{}: {==}

def ready_selector_fields(+actual: T.TentativeChild, +edge: Local.Pending, +reference: X.Child,
    +actual_frame: T.ResolverFrame, +reference_state: D.State, +view: Phase.Child,
    actual_fields: {ActualReady.edge_kind(edge, ready_actual_path(actual)) == ready_child_kind(view) : X.ChildKind} &
      {ready_actual_identity(actual) == ready_child_identity(view) : String},
    reference_fields: {ready_reference_kind(reference) == ready_child_kind(view) : X.ChildKind} &
      {ready_reference_identity(reference) == ready_child_identity(view) : String},
    lookup: {Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(actual_frame), ready_child_identity(view)))
      == Recursive.value(Bool, Map.has(&2, Bool, ready_reference_visited(reference_state), ready_child_identity(view))) : Bool}) ->
    {Bool.and(Bool.not(Attach.bundled_edge(edge)),
      Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(actual_frame), ready_actual_identity(actual))))
      == X.known_file(D.frame(reference_state), ready_reference_attempt(reference)) : Bool}:
  match actual_fields reference_fields:
    case Tuple{+actual_kind, +actual_identity} Tuple{+reference_kind, +reference_identity}:
      Equal.trans(Bool,
        Bool.and(Bool.not(Attach.bundled_edge(edge)), Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(actual_frame), ready_actual_identity(actual)))),
        ready_known_kind(ActualReady.edge_kind(edge, ready_actual_path(actual)), S.frame_visited(actual_frame), ready_actual_identity(actual)),
        X.known_file(D.frame(reference_state), ready_reference_attempt(reference)),
        ready_edge_known(edge, ready_actual_path(actual), S.frame_visited(actual_frame), ready_actual_identity(actual)),
        %Equal.sym(X.ChildKind, ActualReady.edge_kind(edge, ready_actual_path(actual)), ready_child_kind(view), actual_kind):
          {ready_known_kind(_, S.frame_visited(actual_frame), ready_actual_identity(actual)) == X.known_file(D.frame(reference_state), ready_reference_attempt(reference)) : Bool}
        %Equal.sym(String, ready_actual_identity(actual), ready_child_identity(view), actual_identity):
          {ready_known_kind(ready_child_kind(view), S.frame_visited(actual_frame), _) == X.known_file(D.frame(reference_state), ready_reference_attempt(reference)) : Bool}
        Equal.trans(Bool, ready_known_kind(ready_child_kind(view), S.frame_visited(actual_frame), ready_child_identity(view)),
          ready_seen_kind(ready_child_kind(view), ready_reference_visited(reference_state), ready_child_identity(view)),
          X.known_file(D.frame(reference_state), ready_reference_attempt(reference)),
          ready_kind_lookup_transport(ready_child_kind(view), S.frame_visited(actual_frame), ready_reference_visited(reference_state), ready_child_identity(view), lookup),
          %reference_kind:
            {ready_seen_kind(_, ready_reference_visited(reference_state), ready_child_identity(view)) == X.known_file(D.frame(reference_state), ready_reference_attempt(reference)) : Bool}
          %reference_identity:
            {ready_seen_kind(ready_reference_kind(reference), ready_reference_visited(reference_state), _) == X.known_file(D.frame(reference_state), ready_reference_attempt(reference)) : Bool}
          Equal.sym(Bool, X.known_file(D.frame(reference_state), ready_reference_attempt(reference)),
            ready_seen_kind(ready_reference_kind(reference), ready_reference_visited(reference_state), ready_reference_identity(reference)),
            ready_reference_known_exact(reference_state, reference))))

def ready_history_episode(history: V.History) -> Nat:
  match history:
    case V.History{_, _, _, _, _, _, episode}: episode

def ready_attachment_selector_exact(+actual: T.TentativeChild, +edge: Local.Pending,
    +reference: X.Child, +actual_frame: T.ResolverFrame, +reference_state: D.State,
    +history: V.History, +child_history: Phase.ChildHistory, +frame_view: V.Frame, +child_view: Phase.Child,
    actual_frame_ready: {ActualFrame.project(actual_frame, history) == Some{frame_view} : Maybe<&2, V.Frame>},
    reference_frame_ready: {ReferenceFrame.project(reference_state, history) == Some{frame_view} : Maybe<&2, V.Frame>},
    actual_child_ready: {ActualReady.child_project(actual, edge, child_history, S.frame_artifacts(actual_frame), ready_history_episode(history))
      == Some{child_view} : Maybe<&2, Phase.Child>},
    reference_child_ready: {ReferenceReady.child_project(reference, child_history) == Some{child_view} : Maybe<&2, Phase.Child>}) ->
    {Bool.and(Bool.not(Attach.bundled_edge(edge)),
      Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(actual_frame), ready_actual_identity(actual))))
      == X.known_file(D.frame(reference_state), ready_reference_attempt(reference)) : Bool}:
  ready_selector_fields(actual, edge, reference, actual_frame, reference_state, child_view,
    ready_actual_shape_exact(actual, edge, child_history, S.frame_artifacts(actual_frame), ready_history_episode(history), child_view, actual_child_ready),
    ready_reference_shape_exact(reference, child_history, child_view, reference_child_ready),
    ready_frame_seen_exact(actual_frame, reference_state, history, frame_view, ready_child_identity(child_view), actual_frame_ready, reference_frame_ready))

def ready_prepared_fingerprint(prepared: T.PreparedLanguage) -> Maybe<&2, String>:
  match prepared:
    case T.PreparedLanguage{_, _, fingerprint}: fingerprint

def ready_frame_product(+frame: T.ResolverFrame, +prepared: T.PreparedLanguage,
    +forest: F.Forest, +value: ArtifactValue.ProductValue,
    evidence: Materialization.common_product(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame),
      S.frame_artifacts(frame), forest, S.frame_dependencies(frame), ready_prepared_fingerprint(prepared), value)) ->
    {PreparedRoot.prepared_unit(frame, prepared) == Some{value} : Maybe<&2, ArtifactValue.ProductValue>} &
    {F.prepared_unit(Allowance.materialization(forest), forest, S.frame_dependencies(frame), ready_prepared_fingerprint(prepared))
      == F.Materialized{value} : F.Materialization}:
  match frame prepared:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}
      T.PreparedLanguage{_, _, _}: evidence

def ready_frame_materialized_witness(+frame: T.ResolverFrame, +prepared: T.PreparedLanguage, +forest: F.Forest,
    result: Exists(ArtifactValue.ProductValue, value => Materialization.common_product(S.frame_root(frame), S.frame_nodes(frame),
      S.frame_references(frame), S.frame_artifacts(frame), forest, S.frame_dependencies(frame), ready_prepared_fingerprint(prepared), value))) ->
    Exists(ArtifactValue.ProductValue, value =>
      {PreparedRoot.prepared_unit(frame, prepared) == Some{value} : Maybe<&2, ArtifactValue.ProductValue>} &
      {F.prepared_unit(Allowance.materialization(forest), forest, S.frame_dependencies(frame), ready_prepared_fingerprint(prepared))
        == F.Materialized{value} : F.Materialization}):
  match result:
    case (+value, evidence): Tuple{value, ready_frame_product(frame, prepared, forest, value, evidence)}

def ready_frame_materialized_total(+frame: T.ResolverFrame, +prepared: T.PreparedLanguage, +forest: F.Forest,
    +addresses: List<&2, F.AddressEntry>, +episode: Nat,
    projected: {P.project(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame), S.frame_artifacts(frame), addresses)
      == Some{forest} : Maybe<&2, F.Forest>},
    artifacts_valid: {ActualFrame.catalog_valid(S.frame_artifacts(frame)) == True{} : Bool},
    forest_valid: {Relation.frame_forest(forest, episode) == True{} : Bool}) ->
    Exists(ArtifactValue.ProductValue, value =>
      {PreparedRoot.prepared_unit(frame, prepared) == Some{value} : Maybe<&2, ArtifactValue.ProductValue>} &
      {F.prepared_unit(Allowance.materialization(forest), forest, S.frame_dependencies(frame), ready_prepared_fingerprint(prepared))
        == F.Materialized{value} : F.Materialization}):
  ready_frame_materialized_witness(frame, prepared, forest,
    Materialization.projected_unit_total(S.frame_root(frame), S.frame_nodes(frame), S.frame_references(frame),
      S.frame_artifacts(frame), addresses, forest, episode, S.frame_dependencies(frame), ready_prepared_fingerprint(prepared),
      projected, artifacts_valid, forest_valid))

def ready_measurement_result(+continuation: Loop.Continuation, +product: ArtifactValue.ProductValue) -> Type:
  Exists(T.ResolverState, measured => Exists(T.Request, request =>
    {continuation == Loop.ServiceStep{T.AwaitService{measured, request}} : Loop.Continuation} &
    {Contract.operation(request) == T.EncodeProduct{product} : T.Operation} &
    {S.state_stage(measured) == T.MeasuringCandidateTree{} : T.ResolverStage}))

def ready_attachment_measurement(+attachment: Compose.Attachment, +frame: T.ResolverFrame,
    +child: T.TentativeChild, +state: T.ResolverState, +previous: Nat, +product: ArtifactValue.ProductValue,
    available: {PreparedRoot.prepared_unit(Attach.attached_frame(attachment, frame), S.state_prepared(state))
      == Some{product} : Maybe<&2, ArtifactValue.ProductValue>}) ->
    ready_measurement_result(Attach.attachment(Some{attachment}, child, previous, state, frame), product):
  match attachment:
    case Compose.Attachment{_, _, _, _, _, _, +ids, _, _}:
      %Equal.sym(Maybe<&2, ArtifactValue.ProductValue>,
        PreparedRoot.prepared_unit(Attach.attached_frame(attachment, frame), S.state_prepared(state)), Some{product}, available):
        ready_measurement_result(Attach.request_candidate(_, child, ids, previous,
          S.with_state_frame(state, Some{Attach.attached_frame(attachment, frame)})), product)
      candidate_request_exact(product, child, ids, previous, S.with_state_frame(state, Some{Attach.attached_frame(attachment, frame)}))

def ready_attached_measurement_witness(+attachment: Compose.Attachment, +frame: T.ResolverFrame,
    +child: T.TentativeChild, +state: T.ResolverState, +previous: Nat, +forest: F.Forest,
    result: Exists(ArtifactValue.ProductValue, value =>
      {PreparedRoot.prepared_unit(Attach.attached_frame(attachment, frame), S.state_prepared(state)) == Some{value} : Maybe<&2, ArtifactValue.ProductValue>} &
      {F.prepared_unit(Allowance.materialization(forest), forest, S.frame_dependencies(Attach.attached_frame(attachment, frame)), ready_prepared_fingerprint(S.state_prepared(state)))
        == F.Materialized{value} : F.Materialization})) ->
    Exists(ArtifactValue.ProductValue, value =>
      {F.prepared_unit(Allowance.materialization(forest), forest, S.frame_dependencies(Attach.attached_frame(attachment, frame)), ready_prepared_fingerprint(S.state_prepared(state)))
        == F.Materialized{value} : F.Materialization} &
      ready_measurement_result(Attach.attachment(Some{attachment}, child, previous, state, frame), value)):
  match result:
    case (+value, (actual, reference)):
      Tuple{value, Tuple{reference, ready_attachment_measurement(attachment, frame, child, state, previous, value, actual)}}

def ready_attached_measurement_total(+attachment: Compose.Attachment, +frame: T.ResolverFrame,
    +child: T.TentativeChild, +state: T.ResolverState, +previous: Nat, +forest: F.Forest,
    +addresses: List<&2, F.AddressEntry>, +episode: Nat,
    projected: {P.project(S.frame_root(Attach.attached_frame(attachment, frame)),
      S.frame_nodes(Attach.attached_frame(attachment, frame)), S.frame_references(Attach.attached_frame(attachment, frame)),
      S.frame_artifacts(Attach.attached_frame(attachment, frame)), addresses) == Some{forest} : Maybe<&2, F.Forest>},
    artifacts_valid: {ActualFrame.catalog_valid(S.frame_artifacts(Attach.attached_frame(attachment, frame))) == True{} : Bool},
    forest_valid: {Relation.frame_forest(forest, episode) == True{} : Bool}) ->
    Exists(ArtifactValue.ProductValue, value =>
      {F.prepared_unit(Allowance.materialization(forest), forest, S.frame_dependencies(Attach.attached_frame(attachment, frame)), ready_prepared_fingerprint(S.state_prepared(state)))
        == F.Materialized{value} : F.Materialization} &
      ready_measurement_result(Attach.attachment(Some{attachment}, child, previous, state, frame), value)):
  ready_attached_measurement_witness(attachment, frame, child, state, previous, forest,
    ready_frame_materialized_total(Attach.attached_frame(attachment, frame), S.state_prepared(state), forest, addresses, episode,
      projected, artifacts_valid, forest_valid))

def ready_reference_forest(frame: X.Frame) -> F.Forest:
  match frame:
    case X.Frame{_, _, forest, _, _, _, _, _, _, _, _, _}: forest

def ready_reference_dependencies(frame: X.Frame) -> List<&2, String>:
  match frame:
    case X.Frame{_, _, _, _, _, _, _, _, _, _, dependencies, _}: dependencies

def ready_reference_fingerprint(frame: X.Frame) -> Maybe<&2, String>:
  match frame:
    case X.Frame{_, _, _, _, _, _, _, _, _, _, _, fingerprint}: fingerprint

def ready_reference_materialized(+state: D.State, +frame: X.Frame, +child: X.Child, +previous: Nat,
    +product: ArtifactValue.ProductValue,
    materialized: {F.prepared_unit(Allowance.materialization(ready_reference_forest(frame)), ready_reference_forest(frame),
      ready_reference_dependencies(frame), ready_reference_fingerprint(frame)) == F.Materialized{product} : F.Materialization}) ->
    {ReferenceBoundary.attached(state, X.MeasureAfter{frame, child, previous})
      == D.request(state, D.Transaction{X.MeasureAfter{frame, child, previous}}, T.EncodeProduct{product}) : D.Selection}:
  match frame:
    case X.Frame{_, _, +forest, _, _, _, _, _, _, _, +dependencies, +fingerprint}:
      Equal.cong(F.Materialization, D.Selection,
        result => D.transaction_selection(state, X.measured(result, frame, X.MeasureAfter{frame, child, previous})),
        F.prepared_unit(Allowance.materialization(forest), forest, dependencies, fingerprint), F.Materialized{product}, materialized)

def ready_reference_replaced_measurement(+state: D.State, +child: X.Child, +previous: Nat,
    +forest: F.Forest, +product: ArtifactValue.ProductValue,
    replaced: {X.attachment(D.frame(state), child) == F.Replaced{forest} : F.Replacement},
    materialized: {F.prepared_unit(Allowance.materialization(forest), forest,
      ready_reference_dependencies(D.frame(state)), ready_reference_fingerprint(D.frame(state)))
      == F.Materialized{product} : F.Materialization}) ->
    {ReferenceBoundary.enter(state, child, previous)
      == D.request(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}, T.EncodeProduct{product}) : D.Selection}:
  match state child:
    case D.State{_, X.Frame{+graph, +command, _, +local, +pending, +captured, +identities,
      +edge, +episode, +artifact, +dependencies, +fingerprint}, _, _, _, _, _, _, _} X.Child{_, _, _, _}:
      Equal.trans(D.Selection, ReferenceBoundary.enter(state, child, previous),
        ReferenceBoundary.attached(state, X.attached(F.Replaced{forest}, D.frame(state), child, previous)),
        D.request(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}, T.EncodeProduct{product}),
        Equal.cong(F.Replacement, D.Selection, result => ReferenceBoundary.attached(state, X.attached(result, D.frame(state), child, previous)),
          X.attachment(D.frame(state), child), F.Replaced{forest}, replaced),
        ready_reference_materialized(state,
          X.Frame{graph, command, forest, local, pending, captured, identities, edge, (episode + 1n : Nat), artifact, dependencies, fingerprint},
          child, previous, product, materialized))

def ready_actual_request(+state: T.ResolverState, product: ArtifactValue.ProductValue) -> T.Request:
  T.Request{S.input_invocation(S.state_input(state)), S.state_next_request(state), T.EncodeProduct{product}}

def ready_reference_request(state: D.State, product: ArtifactValue.ProductValue) -> T.Request:
  match state:
    case D.State{config, _, _, _, _, next, _, _, _}: T.Request{D.invocation(config), next, T.EncodeProduct{product}}

def ready_capsule_request(capsule: Phase.Capsule, product: ArtifactValue.ProductValue) -> T.Request:
  match capsule:
    case Phase.Capsule{invocation, _, _, _, _, _, next, _, _, _, _}: T.Request{invocation, next, T.EncodeProduct{product}}

def ready_actual_capsule_request(+clock: Maybe<&2, T.ClockToken>, +language: Maybe<&2, T.Language>,
    +active: Maybe<&2, Nat>, +edge: Maybe<&2, V.PendingPayload>, +state: T.ResolverState,
    +capsule: Phase.Capsule, +product: ArtifactValue.ProductValue,
    ready: {ActualReady.capsule(clock, language, active, edge, state) == Some{capsule} : Maybe<&2, Phase.Capsule>}) ->
    {ready_actual_request(state, product) == ready_capsule_request(capsule, product) : T.Request}:
  match clock language active edge state:
    case Some{clock_value} Some{+language_value} Some{active_value} Some{edge_value}
      T.ResolverState{T.ResolverInput{+invocation, path, _, _, _, _, branch, cache, _}, _, _, +next, iterations, _, _, rust, _, _, _, _, _}:
      %Count.some_equal(Phase.Capsule,
        Phase.Capsule{invocation, path, language_value, ActualReady.context(language_value, branch, rust),
          clock_value, cache, next, iterations, active_value, edge_value, ActualReady.fingerprint(S.state_prepared(state))}, capsule, ready):
        {T.Request{invocation, next, T.EncodeProduct{product}} == ready_capsule_request(_, product) : T.Request}
      {==}
    case None{} _ _ _ _:
      Empty.absurd({ready_actual_request(state, product) == ready_capsule_request(capsule, product) : T.Request}, Contents.none_some(Phase.Capsule, capsule, ready))
    case Some{_} None{} _ _ _:
      Empty.absurd({ready_actual_request(state, product) == ready_capsule_request(capsule, product) : T.Request}, Contents.none_some(Phase.Capsule, capsule, ready))
    case Some{_} Some{_} None{} _ _:
      Empty.absurd({ready_actual_request(state, product) == ready_capsule_request(capsule, product) : T.Request}, Contents.none_some(Phase.Capsule, capsule, ready))
    case Some{_} Some{_} Some{_} None{} _:
      Empty.absurd({ready_actual_request(state, product) == ready_capsule_request(capsule, product) : T.Request}, Contents.none_some(Phase.Capsule, capsule, ready))

def ready_reference_capsule_request(+state: D.State, +child: X.Child, +product: ArtifactValue.ProductValue) ->
    {ready_reference_request(state, product) == ready_capsule_request(ReferenceReady.capsule(state, child), product) : T.Request}:
  match state child:
    case D.State{D.Config{_, _, _, _, _, _}, X.Frame{_, _, _, _, _, _, _, _, _, _, _, _}, _, _, _, _, _, _, _}
      X.Child{X.Attempt{_, _, _, _, _, _, _, _, _, _}, _, _, _}: {==}

def ready_request_identity_exact(+actual: T.ResolverState, +reference: D.State, +child: X.Child,
    +clock: Maybe<&2, T.ClockToken>, +language: Maybe<&2, T.Language>, +active: Maybe<&2, Nat>, +edge: Maybe<&2, V.PendingPayload>,
    +capsule: Phase.Capsule, +product: ArtifactValue.ProductValue,
    actual_ready: {ActualReady.capsule(clock, language, active, edge, actual) == Some{capsule} : Maybe<&2, Phase.Capsule>},
    reference_ready: {Some{ReferenceReady.capsule(reference, child)} == Some{capsule} : Maybe<&2, Phase.Capsule>}) ->
    {ready_actual_request(actual, product) == ready_reference_request(reference, product) : T.Request}:
  Equal.trans(T.Request, ready_actual_request(actual, product), ready_capsule_request(capsule, product), ready_reference_request(reference, product),
    ready_actual_capsule_request(clock, language, active, edge, actual, capsule, product, actual_ready),
    Equal.sym(T.Request, ready_reference_request(reference, product), ready_capsule_request(capsule, product),
      Equal.trans(T.Request, ready_reference_request(reference, product), ready_capsule_request(ReferenceReady.capsule(reference, child), product),
        ready_capsule_request(capsule, product), ready_reference_capsule_request(reference, child, product),
        Equal.cong(Phase.Capsule, T.Request, value => ready_capsule_request(value, product),
          ReferenceReady.capsule(reference, child), capsule, Count.some_equal(Phase.Capsule, ReferenceReady.capsule(reference, child), capsule, reference_ready)))))

def ready_loop_request(value: Loop.Continuation) -> Maybe<&2, T.Request>:
  match value:
    case Loop.ServiceStep{T.AwaitService{_, request}}: Some{request}
    case _: None{}

def ready_candidate_request_identity(+product: ArtifactValue.ProductValue, +child: T.TentativeChild,
    +ids: List<&2, Nat>, +previous: Nat, +state: T.ResolverState) ->
    {ready_loop_request(Attach.request_candidate(Some{product}, child, ids, previous, state))
      == Some{ready_actual_request(state, product)} : Maybe<&2, T.Request>}:
  match child state:
    case T.TentativeChild{_, _, _, _, _, _, _, _, _, _, _, _}
      T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, _}: {==}

def ready_attachment_request_identity(+attachment: Compose.Attachment, +frame: T.ResolverFrame,
    +child: T.TentativeChild, +state: T.ResolverState, +previous: Nat, +product: ArtifactValue.ProductValue,
    available: {PreparedRoot.prepared_unit(Attach.attached_frame(attachment, frame), S.state_prepared(state))
      == Some{product} : Maybe<&2, ArtifactValue.ProductValue>}) ->
    {ready_loop_request(Attach.attachment(Some{attachment}, child, previous, state, frame))
      == Some{ready_actual_request(state, product)} : Maybe<&2, T.Request>}:
  match attachment state:
    case Compose.Attachment{_, _, _, _, _, _, +ids, _, _} T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, _}:
      %Equal.sym(Maybe<&2, ArtifactValue.ProductValue>,
        PreparedRoot.prepared_unit(Attach.attached_frame(attachment, frame), S.state_prepared(state)), Some{product}, available):
        {ready_loop_request(Attach.request_candidate(_, child, ids, previous,
          S.with_state_frame(state, Some{Attach.attached_frame(attachment, frame)})))
          == Some{ready_actual_request(state, product)} : Maybe<&2, T.Request>}
      ready_candidate_request_identity(product, child, ids, previous, S.with_state_frame(state, Some{Attach.attached_frame(attachment, frame)}))

def ready_reference_selected_request(+state: D.State, +transaction: X.Transaction, +product: ArtifactValue.ProductValue) ->
    {ReferenceBoundary.selected_request(D.request(state, D.Transaction{transaction}, T.EncodeProduct{product}))
      == Some{ready_reference_request(state, product)} : Maybe<&2, T.Request>}:
  match state:
    case D.State{_, _, _, _, _, _, _, _, _}: {==}

def ready_reference_enter_request(+state: D.State, +child: X.Child, +previous: Nat,
    +forest: F.Forest, +product: ArtifactValue.ProductValue,
    replaced: {X.attachment(D.frame(state), child) == F.Replaced{forest} : F.Replacement},
    materialized: {F.prepared_unit(Allowance.materialization(forest), forest,
      ready_reference_dependencies(D.frame(state)), ready_reference_fingerprint(D.frame(state)))
      == F.Materialized{product} : F.Materialization}) ->
    {ReferenceBoundary.selected_request(ReferenceBoundary.enter(state, child, previous))
      == Some{ready_reference_request(state, product)} : Maybe<&2, T.Request>}:
  Equal.trans(Maybe<&2, T.Request>, ReferenceBoundary.selected_request(ReferenceBoundary.enter(state, child, previous)),
    ReferenceBoundary.selected_request(D.request(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}, T.EncodeProduct{product})),
    Some{ready_reference_request(state, product)},
    Equal.cong(D.Selection, Maybe<&2, T.Request>, selected => ReferenceBoundary.selected_request(selected),
      ReferenceBoundary.enter(state, child, previous),
      D.request(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}, T.EncodeProduct{product}),
      ready_reference_replaced_measurement(state, child, previous, forest, product, replaced, materialized)),
    ready_reference_selected_request(state, X.attached(F.Replaced{forest}, D.frame(state), child, previous), product))

def ready_selected_requests_exact(+attachment: Compose.Attachment, +frame: T.ResolverFrame,
    +actual_child: T.TentativeChild, +actual: T.ResolverState, +reference: D.State, +child: X.Child,
    +previous: Nat, +forest: F.Forest, +product: ArtifactValue.ProductValue,
    +clock: Maybe<&2, T.ClockToken>, +language: Maybe<&2, T.Language>, +active: Maybe<&2, Nat>, +edge: Maybe<&2, V.PendingPayload>,
    +capsule: Phase.Capsule,
    actual_ready: {ActualReady.capsule(clock, language, active, edge, actual) == Some{capsule} : Maybe<&2, Phase.Capsule>},
    reference_ready: {Some{ReferenceReady.capsule(reference, child)} == Some{capsule} : Maybe<&2, Phase.Capsule>},
    available: {PreparedRoot.prepared_unit(Attach.attached_frame(attachment, frame), S.state_prepared(actual))
      == Some{product} : Maybe<&2, ArtifactValue.ProductValue>},
    replaced: {X.attachment(D.frame(reference), child) == F.Replaced{forest} : F.Replacement},
    materialized: {F.prepared_unit(Allowance.materialization(forest), forest,
      ready_reference_dependencies(D.frame(reference)), ready_reference_fingerprint(D.frame(reference)))
      == F.Materialized{product} : F.Materialization}) ->
    {ready_loop_request(Attach.attachment(Some{attachment}, actual_child, previous, actual, frame))
      == ReferenceBoundary.selected_request(ReferenceBoundary.enter(reference, child, previous)) : Maybe<&2, T.Request>}:
  Equal.trans(Maybe<&2, T.Request>,
    ready_loop_request(Attach.attachment(Some{attachment}, actual_child, previous, actual, frame)),
    Some{ready_actual_request(actual, product)},
    ReferenceBoundary.selected_request(ReferenceBoundary.enter(reference, child, previous)),
    ready_attachment_request_identity(attachment, frame, actual_child, actual, previous, product, available),
    Equal.trans(Maybe<&2, T.Request>, Some{ready_actual_request(actual, product)}, Some{ready_reference_request(reference, product)},
      ReferenceBoundary.selected_request(ReferenceBoundary.enter(reference, child, previous)),
      Equal.cong(T.Request, Maybe<&2, T.Request>, request => Some{request},
        ready_actual_request(actual, product), ready_reference_request(reference, product),
        ready_request_identity_exact(actual, reference, child, clock, language, active, edge, capsule, product, actual_ready, reference_ready)),
      Equal.sym(Maybe<&2, T.Request>, ReferenceBoundary.selected_request(ReferenceBoundary.enter(reference, child, previous)),
        Some{ready_reference_request(reference, product)}, ready_reference_enter_request(reference, child, previous, forest, product, replaced, materialized))))

def ready_joint_measurement_witness(+continuation: Loop.Continuation, +selection: D.Selection,
    +product: ArtifactValue.ProductValue,
    selected: {ready_loop_request(continuation) == ReferenceBoundary.selected_request(selection) : Maybe<&2, T.Request>},
    measured: ready_measurement_result(continuation, product)) ->
    Exists(T.ResolverState, state => Exists(T.Request, request =>
      {continuation == Loop.ServiceStep{T.AwaitService{state, request}} : Loop.Continuation} &
      {Contract.operation(request) == T.EncodeProduct{product} : T.Operation} &
      {S.state_stage(state) == T.MeasuringCandidateTree{} : T.ResolverStage} &
      {ReferenceBoundary.selected_request(selection) == Some{request} : Maybe<&2, T.Request>})):
  match measured:
    case (+state, (+request, (+awaiting, (operation, stage)))):
      Tuple{state, Tuple{request, Tuple{awaiting, Tuple{operation, Tuple{stage,
        Equal.trans(Maybe<&2, T.Request>, ReferenceBoundary.selected_request(selection), ready_loop_request(continuation), Some{request},
          Equal.sym(Maybe<&2, T.Request>, ready_loop_request(continuation), ReferenceBoundary.selected_request(selection), selected),
          Equal.cong(Loop.Continuation, Maybe<&2, T.Request>, value => ready_loop_request(value),
            continuation, Loop.ServiceStep{T.AwaitService{state, request}}, awaiting))}}}}}

# The staged witness is the original Frame observation with only the fields
# changed by attachment/registration replaced. No runtime state is introduced.
def ready_staged_frame(view: V.Frame, +forest: F.Forest,
    more: List<&2, V.PendingEntry>, next: Nat) -> V.Frame:
  match view:
    case V.Frame{branch, limits, graph, command, deps, _, pending, targets, ids,
      captured, identities, visited, budget, _, _, target, artifact, artifacts, remaining, episode}:
      V.Frame{branch, limits, graph, command, deps, forest,
        List.append(&2, V.PendingEntry, pending, more), targets, ids, captured, identities,
        visited, budget, ReferenceFrame.node_count(forest), next, target, artifact,
        artifacts, remaining, (episode + 1n : Nat)}

def ready_staged_observation(value: Maybe<&2, V.Frame>, +forest: F.Forest,
    +more: List<&2, V.PendingEntry>, +next: Nat) -> Maybe<&2, V.Frame>:
  match value:
    case Some{view}: Some{ready_staged_frame(view, forest, more, next)}
    case None{}: None{}

def ready_reference_staged_state(+state: D.State, forest: F.Forest,
    more: List<&2, X.Edge>, next: Nat) -> D.State:
  match state:
    case D.State{_, X.Frame{graph, command, _, local, pending, captured, identities,
      _, episode, artifact, dependencies, fingerprint}, _, _, _, _, _, _, _}:
      D.with_frame(state, X.Frame{graph, command, forest, local,
        List.append(&2, X.Edge, pending, more), captured, identities,
        next, (episode + 1n : Nat), artifact, dependencies, fingerprint})

def ready_reference_pending_append(+items: List<&2, X.Edge>, +more: List<&2, X.Edge>) ->
    {ReferenceFrame.pending(List.append(&2, X.Edge, items, more))
      == List.append(&2, V.PendingEntry, ReferenceFrame.pending(items), ReferenceFrame.pending(more)) : List<&2, V.PendingEntry>}:
  match items:
    case []: {==}
    case X.Edge{id, value, source, catalog} <> tail:
      Equal.cong(List<&2, V.PendingEntry>, List<&2, V.PendingEntry>,
        rest => V.PendingEntry{id, ReferenceFrame.payload(value), source, catalog} <> rest,
        ReferenceFrame.pending(List.append(&2, X.Edge, tail, more)),
        List.append(&2, V.PendingEntry, ReferenceFrame.pending(tail), ReferenceFrame.pending(more)),
        ready_reference_pending_append(tail, more))

def ready_reference_staged_assembled(+state: D.State, +history: V.History,
    +forest: F.Forest, +more: List<&2, X.Edge>, +next: Nat,
    +targets: Maybe<&2, List<&2, V.TargetEntry>>, +captured: Maybe<&2, List<&2, V.CapturedEntry>>,
    +visited: Maybe<&2, List<&2, String>>) ->
    {ReferenceFrame.assembled(ready_reference_staged_state(state, forest, more, next), history, targets, captured, visited)
      == ready_staged_observation(ReferenceFrame.assembled(state, history, targets, captured, visited),
        forest, ReferenceFrame.pending(more), next) : Maybe<&2, V.Frame>}:
  match state history targets captured visited:
    case D.State{D.Config{_, _, _, context, _, _}, X.Frame{G.Bounded{+graph, remaining}, command, _,
        Signed.State{Recursive.State{_, budget, _, _}, signed}, +pending, _, identities,
        _, episode, artifact, dependencies, _}, _, target_ids, next_target, _, _, _, _}
      V.History{_, _, _, _, artifacts, _, _} Some{projected_targets} Some{projected_captured} Some{projected_visited}:
      Equal.cong(List<&2, V.PendingEntry>, Maybe<&2, V.Frame>, entries =>
        Some{V.Frame{ReferenceFrame.branch(context), ReferenceFrame.graph_limits(graph), graph, command,
          dependencies, forest, entries, projected_targets, ReferenceFrame.ids(target_ids), projected_captured,
          ReferenceFrame.identities(identities), projected_visited, V.budget(budget, signed),
          ReferenceFrame.node_count(forest), next, next_target, artifact, artifacts, remaining, (episode + 1n : Nat)}},
        ReferenceFrame.pending(List.append(&2, X.Edge, pending, more)),
        List.append(&2, V.PendingEntry, ReferenceFrame.pending(pending), ReferenceFrame.pending(more)),
        ready_reference_pending_append(pending, more))
    case _ _ None{} _ _: {==}
    case _ _ Some{_} None{} _: {==}
    case _ _ Some{_} Some{_} None{}: {==}

def ready_reference_staged_project(+state: D.State, +history: V.History,
    +forest: F.Forest, +more: List<&2, X.Edge>, +next: Nat) ->
    {ReferenceFrame.project(ready_reference_staged_state(state, forest, more, next), history)
      == ready_staged_observation(ReferenceFrame.project(state, history), forest, ReferenceFrame.pending(more), next) : Maybe<&2, V.Frame>}:
  match state history:
    case D.State{_, X.Frame{_, _, _, Signed.State{Recursive.State{values, _, _, _}, _},
      _, captures, _, _, _, _, _, _}, targets, _, _, _, _, _, _}
      V.History{_, V.Order{_, _, _, _, _, seen}, _, sources, _, _, _}:
      ready_reference_staged_assembled(state, history, forest, more, next,
        ReferenceFrame.targets(targets), ReferenceFrame.captured(captures, sources), ReferenceFrame.visited(seen, values))

def ready_reference_assembled_history(+state: D.State, +history: V.History,
    +addresses: List<&2, F.AddressEntry>, +offset: Nat, +ids: List<&2, Nat>,
    +source: T.SourceFacts, +catalog: RootSpec.Source,
    +targets: Maybe<&2, List<&2, V.TargetEntry>>, +captured: Maybe<&2, List<&2, V.CapturedEntry>>,
    +visited: Maybe<&2, List<&2, String>>) ->
    {ReferenceFrame.assembled(state, History.extend(history, addresses, offset, ids, source, catalog), targets, captured, visited)
      == ReferenceFrame.assembled(state, history, targets, captured, visited) : Maybe<&2, V.Frame>}:
  match state history targets captured visited:
    case D.State{D.Config{_, _, _, _, _, _}, X.Frame{G.Bounded{_, _}, _, _,
      Signed.State{Recursive.State{_, _, _, _}, _}, _, _, _, _, _, _, _, _}, _, _, _, _, _, _, _}
      V.History{_, V.Order{_, _, _, _, _, _}, _, _, _, _, _} Some{_} Some{_} Some{_}: {==}
    case _ V.History{_, V.Order{_, _, _, _, _, _}, _, _, _, _, _} None{} _ _: {==}
    case _ V.History{_, V.Order{_, _, _, _, _, _}, _, _, _, _, _} Some{_} None{} _: {==}
    case _ V.History{_, V.Order{_, _, _, _, _, _}, _, _, _, _, _} Some{_} Some{_} None{}: {==}

def ready_reference_history_extend(+state: D.State, +history: V.History,
    +addresses: List<&2, F.AddressEntry>, +offset: Nat, +ids: List<&2, Nat>,
    +source: T.SourceFacts, +catalog: RootSpec.Source) ->
    {ReferenceFrame.project(state, History.extend(history, addresses, offset, ids, source, catalog))
      == ReferenceFrame.project(state, history) : Maybe<&2, V.Frame>}:
  match state history:
    case D.State{_, X.Frame{_, _, _, Signed.State{Recursive.State{values, _, _, _}, _},
      _, captures, _, _, _, _, _, _}, targets, _, _, _, _, _, _}
      V.History{_, V.Order{_, _, _, _, _, seen}, _, sources, _, _, _}:
      ready_reference_assembled_history(state, history, addresses, offset, ids, source, catalog,
        ReferenceFrame.targets(targets), ReferenceFrame.captured(captures, sources), ReferenceFrame.visited(seen, values))

def ready_reference_staged_history(+state: D.State, +history: V.History,
    +addresses: List<&2, F.AddressEntry>, +offset: Nat, +ids: List<&2, Nat>,
    +source: T.SourceFacts, +catalog: RootSpec.Source, +forest: F.Forest,
    +more: List<&2, X.Edge>, +next: Nat, +view: V.Frame,
    ready: {ReferenceFrame.project(state, history) == Some{view} : Maybe<&2, V.Frame>}) ->
    {ReferenceFrame.project(ready_reference_staged_state(state, forest, more, next),
        History.extend(history, addresses, offset, ids, source, catalog))
      == Some{ready_staged_frame(view, forest, ReferenceFrame.pending(more), next)} : Maybe<&2, V.Frame>}:
  Equal.trans(Maybe<&2, V.Frame>,
    ReferenceFrame.project(ready_reference_staged_state(state, forest, more, next), History.extend(history, addresses, offset, ids, source, catalog)),
    ReferenceFrame.project(ready_reference_staged_state(state, forest, more, next), history),
    Some{ready_staged_frame(view, forest, ReferenceFrame.pending(more), next)},
    ready_reference_history_extend(ready_reference_staged_state(state, forest, more, next), history, addresses, offset, ids, source, catalog),
    Equal.trans(Maybe<&2, V.Frame>, ReferenceFrame.project(ready_reference_staged_state(state, forest, more, next), history),
      ready_staged_observation(ReferenceFrame.project(state, history), forest, ReferenceFrame.pending(more), next),
      Some{ready_staged_frame(view, forest, ReferenceFrame.pending(more), next)},
      ready_reference_staged_project(state, history, forest, more, next),
      Equal.cong(Maybe<&2, V.Frame>, Maybe<&2, V.Frame>, value => ready_staged_observation(value, forest, ReferenceFrame.pending(more), next),
        ReferenceFrame.project(state, history), Some{view}, ready)))

def ready_reference_stage_assembled(+state: D.State, +history: V.History, +stage: D.Stage,
    +targets: Maybe<&2, List<&2, V.TargetEntry>>, +captured: Maybe<&2, List<&2, V.CapturedEntry>>,
    +visited: Maybe<&2, List<&2, String>>) ->
    {ReferenceFrame.assembled(D.stage(state, stage), history, targets, captured, visited)
      == ReferenceFrame.assembled(state, history, targets, captured, visited) : Maybe<&2, V.Frame>}:
  match state history targets captured visited:
    case D.State{D.Config{_, _, _, _, _, _}, X.Frame{G.Bounded{_, _}, _, _,
      Signed.State{Recursive.State{_, _, _, _}, _}, _, _, _, _, _, _, _, _}, _, _, _, _, _, _, _}
      V.History{_, _, _, _, _, _, _} Some{_} Some{_} Some{_}: {==}
    case D.State{_, _, _, _, _, _, _, _, _} _ None{} _ _: {==}
    case D.State{_, _, _, _, _, _, _, _, _} _ Some{_} None{} _: {==}
    case D.State{_, _, _, _, _, _, _, _, _} _ Some{_} Some{_} None{}: {==}

def ready_reference_stage_project(+state: D.State, +history: V.History, +stage: D.Stage) ->
    {ReferenceFrame.project(D.stage(state, stage), history) == ReferenceFrame.project(state, history) : Maybe<&2, V.Frame>}:
  match state history:
    case D.State{_, X.Frame{_, _, _, Signed.State{Recursive.State{values, _, _, _}, _},
      _, captures, _, _, _, _, _, _}, targets, _, _, _, _, _, _}
      V.History{_, V.Order{_, _, _, _, _, seen}, _, sources, _, _, _}:
      ready_reference_stage_assembled(state, history, stage,
        ReferenceFrame.targets(targets), ReferenceFrame.captured(captures, sources), ReferenceFrame.visited(seen, values))

def ready_reference_registration(+state: D.State, child: X.Child) -> X.Registration:
  match state child:
    case D.State{_, X.Frame{_, _, _, _, _, _, _, edge, _, _, _, _}, _, _, _, _, _, _, _}
      X.Child{X.Attempt{_, _, _, source, _, _, _, _, catalog, _}, _, _, pending}:
      X.register(pending, source, catalog, edge)

def ready_registration_more(registration: X.Registration) -> List<&2, X.Edge>:
  match registration:
    case X.Registration{more, _, _}: more

def ready_registration_next(registration: X.Registration) -> Nat:
  match registration:
    case X.Registration{_, _, next}: next

def ready_reference_registered_projection(+state: D.State, +child: X.Child, +previous: Nat,
    +forest: F.Forest, +product: ArtifactValue.ProductValue, +history: V.History,
    +registration: X.Registration,
    registered: {ready_reference_registration(state, child) == registration : X.Registration}) ->
    {Staged.project(D.request(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}, T.EncodeProduct{product}), history)
      == ReferenceFrame.project(D.stage(ready_reference_staged_state(state, forest,
          ready_registration_more(registration), ready_registration_next(registration)),
          D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}), history) : Maybe<&2, V.Frame>}:
  match state child registration:
    case D.State{_, X.Frame{+graph, +command, _, +local, +pending, +captured, +identities,
        +edge, +episode, +artifact, +dependencies, +fingerprint}, _, _, _, _, _, _, _}
      X.Child{X.Attempt{_, _, _, +source, _, _, _, _, +catalog, _}, _, _, +new_pending}
      X.Registration{+more, _, +next}:
      Equal.cong(X.Registration, Maybe<&2, V.Frame>, value => ReferenceFrame.project(
        D.with_frame(D.stage(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}),
          Staged.registered(X.Frame{graph, command, forest, local, pending, captured, identities,
            edge, (episode + 1n : Nat), artifact, dependencies, fingerprint}, value)), history),
        X.register(new_pending, source, catalog, edge), registration, registered)

def ready_reference_staged_enter(+state: D.State, +child: X.Child, +previous: Nat,
    +forest: F.Forest, +product: ArtifactValue.ProductValue, +history: V.History,
    +addresses: List<&2, F.AddressEntry>, +offset: Nat, +ids: List<&2, Nat>,
    +source: T.SourceFacts, +catalog: RootSpec.Source, +view: V.Frame,
    ready: {ReferenceFrame.project(state, history) == Some{view} : Maybe<&2, V.Frame>},
    replaced: {X.attachment(D.frame(state), child) == F.Replaced{forest} : F.Replacement},
    materialized: {F.prepared_unit(Allowance.materialization(forest), forest,
      ready_reference_dependencies(D.frame(state)), ready_reference_fingerprint(D.frame(state)))
      == F.Materialized{product} : F.Materialization}) ->
    {Staged.project(ReferenceBoundary.enter(state, child, previous),
        History.extend(history, addresses, offset, ids, source, catalog))
      == Some{ready_staged_frame(view, forest,
        ReferenceFrame.pending(ready_registration_more(ready_reference_registration(state, child))),
        ready_registration_next(ready_reference_registration(state, child)))} : Maybe<&2, V.Frame>}:
  Equal.trans(Maybe<&2, V.Frame>,
    Staged.project(ReferenceBoundary.enter(state, child, previous), History.extend(history, addresses, offset, ids, source, catalog)),
    Staged.project(D.request(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}, T.EncodeProduct{product}),
      History.extend(history, addresses, offset, ids, source, catalog)),
    Some{ready_staged_frame(view, forest, ReferenceFrame.pending(ready_registration_more(ready_reference_registration(state, child))),
      ready_registration_next(ready_reference_registration(state, child)))},
    Equal.cong(D.Selection, Maybe<&2, V.Frame>, selected => Staged.project(selected, History.extend(history, addresses, offset, ids, source, catalog)),
      ReferenceBoundary.enter(state, child, previous),
      D.request(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}, T.EncodeProduct{product}),
      ready_reference_replaced_measurement(state, child, previous, forest, product, replaced, materialized)),
    Equal.trans(Maybe<&2, V.Frame>,
      Staged.project(D.request(state, D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}, T.EncodeProduct{product}),
        History.extend(history, addresses, offset, ids, source, catalog)),
      ReferenceFrame.project(D.stage(ready_reference_staged_state(state, forest,
          ready_registration_more(ready_reference_registration(state, child)), ready_registration_next(ready_reference_registration(state, child))),
          D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}),
        History.extend(history, addresses, offset, ids, source, catalog)),
      Some{ready_staged_frame(view, forest, ReferenceFrame.pending(ready_registration_more(ready_reference_registration(state, child))),
        ready_registration_next(ready_reference_registration(state, child)))},
      ready_reference_registered_projection(state, child, previous, forest, product,
        History.extend(history, addresses, offset, ids, source, catalog), ready_reference_registration(state, child), {==}),
      Equal.trans(Maybe<&2, V.Frame>,
        ReferenceFrame.project(D.stage(ready_reference_staged_state(state, forest,
            ready_registration_more(ready_reference_registration(state, child)), ready_registration_next(ready_reference_registration(state, child))),
            D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}),
          History.extend(history, addresses, offset, ids, source, catalog)),
        ReferenceFrame.project(ready_reference_staged_state(state, forest,
            ready_registration_more(ready_reference_registration(state, child)), ready_registration_next(ready_reference_registration(state, child))),
          History.extend(history, addresses, offset, ids, source, catalog)),
        Some{ready_staged_frame(view, forest, ReferenceFrame.pending(ready_registration_more(ready_reference_registration(state, child))),
          ready_registration_next(ready_reference_registration(state, child)))},
        ready_reference_stage_project(ready_reference_staged_state(state, forest,
            ready_registration_more(ready_reference_registration(state, child)), ready_registration_next(ready_reference_registration(state, child))),
          History.extend(history, addresses, offset, ids, source, catalog), D.Transaction{X.attached(F.Replaced{forest}, D.frame(state), child, previous)}),
        ready_reference_staged_history(state, history, addresses, offset, ids, source, catalog, forest,
          ready_registration_more(ready_reference_registration(state, child)), ready_registration_next(ready_reference_registration(state, child)), view, ready))))

def ready_registered_pending(registration: Compose.RegisteredPending) -> Map<&2, Maybe<&2, Local.Pending>>:
  match registration:
    case Compose.RegisteredPending{_, _, entries}: entries

# Exact observation of the existing registration writes at one arbitrary key.
# This is not an additional map or runtime registration representation.
def ready_registered_value(items: List<&2, Local.Pending>, +next: Nat, +query: String,
    previous: Maybe<&2, Local.Pending>) -> Maybe<&2, Local.Pending>:
  match items:
    case []: previous
    case head <> tail:
      ready_registered_value(tail, (next + 1n : Nat), query,
        Bool.pick(Maybe<&2, Local.Pending>, String.eq(query, Nat.show(next)), Some{head}, previous))

def ready_registered_prefix_map(+registration: Compose.RegisteredPending, +next: Nat) ->
    {ready_registered_pending(Compose.registered_prefix(registration, next))
      == ready_registered_pending(registration) : Map<&2, Maybe<&2, Local.Pending>>}:
  match registration:
    case Compose.RegisteredPending{_, _, _}: {==}

def ready_registered_lookup(+items: List<&2, Local.Pending>, +next: Nat,
    +entries: Map<&2, Maybe<&2, Local.Pending>>, +query: String,
    +valid: {Patricia.canonical(Maybe<&2, Local.Pending>, entries) == True{} : Bool}) ->
    {Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{},
        ready_registered_pending(Compose.register_pending(items, next, entries)), query))
      == ready_registered_value(items, next, query,
        Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, query))) : Maybe<&2, Local.Pending>}:
  match items:
    case []: {==}
    case +head <> +tail:
      %Equal.sym(Map<&2, Maybe<&2, Local.Pending>>,
        ready_registered_pending(Compose.registered_prefix(Compose.register_pending(tail, (next + 1n : Nat),
          Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head})), next)),
        ready_registered_pending(Compose.register_pending(tail, (next + 1n : Nat),
          Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}))),
        ready_registered_prefix_map(Compose.register_pending(tail, (next + 1n : Nat),
          Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head})), next)):
        {Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, _, query))
          == ready_registered_value(head <> tail, next, query,
            Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, query))) : Maybe<&2, Local.Pending>}
      Equal.trans(Maybe<&2, Local.Pending>,
        Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{},
          ready_registered_pending(Compose.register_pending(tail, (next + 1n : Nat),
            Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}))), query)),
        ready_registered_value(tail, (next + 1n : Nat), query,
          Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{},
            Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}), query))),
        ready_registered_value(head <> tail, next, query,
          Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, query))),
        ready_registered_lookup(tail, (next + 1n : Nat), Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}), query,
          Insert.set_preserves_canonical(Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}, valid)),
        Equal.cong(Maybe<&2, Local.Pending>, Maybe<&2, Local.Pending>, value => ready_registered_value(tail, (next + 1n : Nat), query, value),
          Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{},
            Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}), query)),
          Bool.pick(Maybe<&2, Local.Pending>, String.eq(query, Nat.show(next)), Some{head},
            Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, query))),
          Payload.lookup_after_set(Maybe<&2, Local.Pending>, entries, Nat.show(next), query, Some{head}, None{}, valid)))

def ready_before_distinct(+left: Nat, +right: Nat,
    before: {Nat.is_lt(left, right) == True{} : Bool}) -> {Nat.is_eq(left, right) == False{} : Bool}:
  match left right:
    case 0n 0n: Empty.absurd({Nat.is_eq(0n, 0n) == False{} : Bool}, NatFacts.internal_false_ne_true(before))
    case 0n 1n+_: {==}
    case 1n+_ 0n: Empty.absurd({Nat.is_eq(left, 0n) == False{} : Bool}, NatFacts.internal_false_ne_true(before))
    case 1n+a 1n+b: ready_before_distinct(a, b, before)

def ready_registered_old_value(+items: List<&2, Local.Pending>, +next: Nat, +id: Nat,
    +previous: Maybe<&2, Local.Pending>, +before: {Nat.is_lt(id, next) == True{} : Bool}) ->
    {ready_registered_value(items, next, Nat.show(id), previous) == previous : Maybe<&2, Local.Pending>}:
  match items:
    case []: {==}
    case +head <> +tail:
      Equal.trans(Maybe<&2, Local.Pending>, ready_registered_value(head <> tail, next, Nat.show(id), previous),
        ready_registered_value(tail, (next + 1n : Nat), Nat.show(id), previous), previous,
        Equal.cong(Bool, Maybe<&2, Local.Pending>, same =>
          ready_registered_value(tail, (next + 1n : Nat), Nat.show(id), Bool.pick(Maybe<&2, Local.Pending>, same, Some{head}, previous)),
          String.eq(Nat.show(id), Nat.show(next)), False{},
          Equal.trans(Bool, String.eq(Nat.show(id), Nat.show(next)), Nat.is_eq(id, next), False{},
            NaturalKeys.natural_key_equality(id, next), ready_before_distinct(id, next, before))),
        ready_registered_old_value(tail, (next + 1n : Nat), id, previous,
          Arithmetic.lt_of_lt_of_le(id, next, (next + 1n : Nat), before, Arithmetic.le_add_right(next, 1n))))

def ready_registered_old_lookup(+items: List<&2, Local.Pending>, +next: Nat,
    +entries: Map<&2, Maybe<&2, Local.Pending>>, +id: Nat,
    valid: {Patricia.canonical(Maybe<&2, Local.Pending>, entries) == True{} : Bool},
    before: {Nat.is_lt(id, next) == True{} : Bool}) ->
    {Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{},
        ready_registered_pending(Compose.register_pending(items, next, entries)), Nat.show(id)))
      == Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(id))) : Maybe<&2, Local.Pending>}:
  Equal.trans(Maybe<&2, Local.Pending>,
    Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{},
      ready_registered_pending(Compose.register_pending(items, next, entries)), Nat.show(id))),
    ready_registered_value(items, next, Nat.show(id),
      Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(id)))),
    Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(id))),
    ready_registered_lookup(items, next, entries, Nat.show(id), valid),
    ready_registered_old_value(items, next, id,
      Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(id))), before))

def ready_registered_canonical(+items: List<&2, Local.Pending>, +next: Nat,
    +entries: Map<&2, Maybe<&2, Local.Pending>>,
    valid: {Patricia.canonical(Maybe<&2, Local.Pending>, entries) == True{} : Bool}) ->
    {Patricia.canonical(Maybe<&2, Local.Pending>, ready_registered_pending(Compose.register_pending(items, next, entries))) == True{} : Bool}:
  match items:
    case []: valid
    case +head <> +tail:
      %Equal.sym(Map<&2, Maybe<&2, Local.Pending>>,
        ready_registered_pending(Compose.registered_prefix(Compose.register_pending(tail, (next + 1n : Nat),
          Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head})), next)),
        ready_registered_pending(Compose.register_pending(tail, (next + 1n : Nat),
          Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}))),
        ready_registered_prefix_map(Compose.register_pending(tail, (next + 1n : Nat),
          Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head})), next)):
        {Patricia.canonical(Maybe<&2, Local.Pending>, _) == True{} : Bool}
      ready_registered_canonical(tail, (next + 1n : Nat),
        Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}),
        Insert.set_preserves_canonical(Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}, valid))

def ready_registered_head_value(+head: Local.Pending, +tail: List<&2, Local.Pending>, +next: Nat,
    +previous: Maybe<&2, Local.Pending>) ->
    {ready_registered_value(head <> tail, next, Nat.show(next), previous) == Some{head} : Maybe<&2, Local.Pending>}:
  Equal.trans(Maybe<&2, Local.Pending>, ready_registered_value(head <> tail, next, Nat.show(next), previous),
    ready_registered_value(tail, (next + 1n : Nat), Nat.show(next), Some{head}), Some{head},
    Equal.cong(Bool, Maybe<&2, Local.Pending>, same =>
      ready_registered_value(tail, (next + 1n : Nat), Nat.show(next), Bool.pick(Maybe<&2, Local.Pending>, same, Some{head}, previous)),
      String.eq(Nat.show(next), Nat.show(next)), True{}, StringFacts.eq_refl(Nat.show(next))),
    ready_registered_old_value(tail, (next + 1n : Nat), next, Some{head},
      Equal.trans(Bool, Nat.is_lt(next, (next + 1n : Nat)), Nat.is_lt(next, (1n + next : Nat)), True{},
        Equal.cong(Nat, Bool, bound => Nat.is_lt(next, bound), (next + 1n : Nat), (1n + next : Nat), Arithmetic.add_comm(next, 1n)),
        NatFacts.lt_succ_self(next))))

def ready_registered_head_lookup(+head: Local.Pending, +tail: List<&2, Local.Pending>, +next: Nat,
    +entries: Map<&2, Maybe<&2, Local.Pending>>,
    valid: {Patricia.canonical(Maybe<&2, Local.Pending>, entries) == True{} : Bool}) ->
    {Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{},
        ready_registered_pending(Compose.register_pending(head <> tail, next, entries)), Nat.show(next)))
      == Some{head} : Maybe<&2, Local.Pending>}:
  Equal.trans(Maybe<&2, Local.Pending>,
    Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{},
      ready_registered_pending(Compose.register_pending(head <> tail, next, entries)), Nat.show(next))),
    ready_registered_value(head <> tail, next, Nat.show(next),
      Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(next)))), Some{head},
    ready_registered_lookup(head <> tail, next, entries, Nat.show(next), valid),
    ready_registered_head_value(head, tail, next,
      Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(next)))))

def ready_pending_ids(items: List<&2, Local.Pending>, +next: Nat) -> List<&2, Nat>:
  match items:
    case []: []
    case _ <> tail: next <> ready_pending_ids(tail, (next + 1n : Nat))

def ready_pending_rows(items: List<&2, Local.Pending>, +next: Nat,
    +sources: List<&2, V.EdgeSource>, +addresses: List<&2, F.AddressEntry>) -> Maybe<&2, List<&2, V.PendingEntry>>:
  match items:
    case []: Some{[]}
    case head <> tail:
      ActualFrame.pending_prefix(ActualFrame.pending_entry(next, V.pending_payload(head, addresses), V.edge_at(sources, next)),
        ready_pending_rows(tail, (next + 1n : Nat), sources, addresses))

def ready_registered_pending_rows(+items: List<&2, Local.Pending>, +next: Nat,
    +entries: Map<&2, Maybe<&2, Local.Pending>>, +sources: List<&2, V.EdgeSource>,
    +addresses: List<&2, F.AddressEntry>,
    +valid: {Patricia.canonical(Maybe<&2, Local.Pending>, entries) == True{} : Bool}) ->
    {ActualFrame.pending(ready_pending_ids(items, next), ready_registered_pending(Compose.register_pending(items, next, entries)), sources, addresses)
      == ready_pending_rows(items, next, sources, addresses) : Maybe<&2, List<&2, V.PendingEntry>>}:
  match items:
    case []: {==}
    case +head <> +tail:
      +registered: Compose.RegisteredPending = Compose.register_pending(tail, (next + 1n : Nat),
        Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}))
      +values: Map<&2, Maybe<&2, Local.Pending>> = ready_registered_pending(Compose.registered_prefix(registered, next))
      Equal.trans(Maybe<&2, List<&2, V.PendingEntry>>,
        ActualFrame.pending(next <> ready_pending_ids(tail, (next + 1n : Nat)), values, sources, addresses),
        ActualFrame.pending_prefix(ActualFrame.pending_entry(next, V.pending_payload(head, addresses), V.edge_at(sources, next)),
          ActualFrame.pending(ready_pending_ids(tail, (next + 1n : Nat)), values, sources, addresses)),
        ready_pending_rows(head <> tail, next, sources, addresses),
        Equal.cong(Maybe<&2, Local.Pending>, Maybe<&2, List<&2, V.PendingEntry>>, found =>
          ActualFrame.pending_prefix(ActualFrame.pending_entry(next, ActualFrame.pending_value(found, addresses), V.edge_at(sources, next)),
            ActualFrame.pending(ready_pending_ids(tail, (next + 1n : Nat)), values, sources, addresses)),
          Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, values, Nat.show(next))), Some{head},
          ready_registered_head_lookup(head, tail, next, entries, valid)),
        Equal.cong(Maybe<&2, List<&2, V.PendingEntry>>, Maybe<&2, List<&2, V.PendingEntry>>, rest =>
          ActualFrame.pending_prefix(ActualFrame.pending_entry(next, V.pending_payload(head, addresses), V.edge_at(sources, next)), rest),
          ActualFrame.pending(ready_pending_ids(tail, (next + 1n : Nat)), values, sources, addresses),
          ready_pending_rows(tail, (next + 1n : Nat), sources, addresses),
          Equal.trans(Maybe<&2, List<&2, V.PendingEntry>>,
            ActualFrame.pending(ready_pending_ids(tail, (next + 1n : Nat)), values, sources, addresses),
            ActualFrame.pending(ready_pending_ids(tail, (next + 1n : Nat)), ready_registered_pending(registered), sources, addresses),
            ready_pending_rows(tail, (next + 1n : Nat), sources, addresses),
            Equal.cong(Map<&2, Maybe<&2, Local.Pending>>, Maybe<&2, List<&2, V.PendingEntry>>, map =>
              ActualFrame.pending(ready_pending_ids(tail, (next + 1n : Nat)), map, sources, addresses),
              values, ready_registered_pending(registered), ready_registered_prefix_map(registered, next)),
            ready_registered_pending_rows(tail, (next + 1n : Nat),
              Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}), sources, addresses,
              Insert.set_preserves_canonical(Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{head}, valid)))))

def ready_registered_old_rows(+order: List<&2, Nat>, +items: List<&2, Local.Pending>, +next: Nat,
    +entries: Map<&2, Maybe<&2, Local.Pending>>, +sources: List<&2, V.EdgeSource>,
    +addresses: List<&2, F.AddressEntry>,
    +valid: {Patricia.canonical(Maybe<&2, Local.Pending>, entries) == True{} : Bool},
    +before: {ActualReady.pending_ids_before(order, next) == True{} : Bool}) ->
    {ActualFrame.pending(order, ready_registered_pending(Compose.register_pending(items, next, entries)), sources, addresses)
      == ActualFrame.pending(order, entries, sources, addresses) : Maybe<&2, List<&2, V.PendingEntry>>}:
  match order:
    case []: {==}
    case +head <> +tail:
      +values: Map<&2, Maybe<&2, Local.Pending>> = ready_registered_pending(Compose.register_pending(items, next, entries))
      Equal.trans(Maybe<&2, List<&2, V.PendingEntry>>,
        ActualFrame.pending(head <> tail, values, sources, addresses),
        ActualFrame.pending_prefix(ActualFrame.pending_entry(head,
          ActualFrame.pending_value(Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(head))), addresses),
          V.edge_at(sources, head)), ActualFrame.pending(tail, values, sources, addresses)),
        ActualFrame.pending(head <> tail, entries, sources, addresses),
        Equal.cong(Maybe<&2, Local.Pending>, Maybe<&2, List<&2, V.PendingEntry>>, found =>
          ActualFrame.pending_prefix(ActualFrame.pending_entry(head, ActualFrame.pending_value(found, addresses), V.edge_at(sources, head)),
            ActualFrame.pending(tail, values, sources, addresses)),
          Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, values, Nat.show(head))),
          Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(head))),
          ready_registered_old_lookup(items, next, entries, head, valid,
            BoolFacts.eq_true_of_and_left(Nat.is_lt(head, next), ActualReady.pending_ids_before(tail, next), before))),
        Equal.cong(Maybe<&2, List<&2, V.PendingEntry>>, Maybe<&2, List<&2, V.PendingEntry>>, rest =>
          ActualFrame.pending_prefix(ActualFrame.pending_entry(head,
            ActualFrame.pending_value(Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(head))), addresses),
            V.edge_at(sources, head)), rest),
          ActualFrame.pending(tail, values, sources, addresses), ActualFrame.pending(tail, entries, sources, addresses),
          ready_registered_old_rows(tail, items, next, entries, sources, addresses, valid,
            BoolFacts.eq_true_of_and_right(Nat.is_lt(head, next), ActualReady.pending_ids_before(tail, next), before))))

def ready_pending_join(left: Maybe<&2, List<&2, V.PendingEntry>>,
    right: Maybe<&2, List<&2, V.PendingEntry>>) -> Maybe<&2, List<&2, V.PendingEntry>>:
  match left right:
    case Some{left} Some{right}: Some{List.append(&2, V.PendingEntry, left, right)}
    case _ _: None{}

def ready_pending_join_prefix(+head: Maybe<&2, V.PendingEntry>, +rest: Maybe<&2, List<&2, V.PendingEntry>>,
    +tail: Maybe<&2, List<&2, V.PendingEntry>>) ->
    {ActualFrame.pending_prefix(head, ready_pending_join(rest, tail))
      == ready_pending_join(ActualFrame.pending_prefix(head, rest), tail) : Maybe<&2, List<&2, V.PendingEntry>>}:
  match head rest tail:
    case Some{_} Some{_} Some{_}: {==}
    case None{} _ _: {==}
    case Some{_} None{} _: {==}
    case Some{_} Some{_} None{}: {==}

def ready_pending_join_nil(+value: Maybe<&2, List<&2, V.PendingEntry>>) ->
    {value == ready_pending_join(Some{[]}, value) : Maybe<&2, List<&2, V.PendingEntry>>}:
  match value:
    case Some{_}: {==}
    case None{}: {==}

def ready_pending_split(+order: List<&2, Nat>, +more: List<&2, Nat>,
    +entries: Map<&2, Maybe<&2, Local.Pending>>, +sources: List<&2, V.EdgeSource>, +addresses: List<&2, F.AddressEntry>) ->
    {ActualFrame.pending(List.append(&2, Nat, order, more), entries, sources, addresses)
      == ready_pending_join(ActualFrame.pending(order, entries, sources, addresses), ActualFrame.pending(more, entries, sources, addresses)) : Maybe<&2, List<&2, V.PendingEntry>>}:
  match order:
    case []: ready_pending_join_nil(ActualFrame.pending(more, entries, sources, addresses))
    case +head <> +tail:
      +item: Maybe<&2, V.PendingEntry> = ActualFrame.pending_entry(head,
        ActualFrame.pending_value(Local.map_result(Maybe<&2, Local.Pending>, Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(head))), addresses),
        V.edge_at(sources, head))
      Equal.trans(Maybe<&2, List<&2, V.PendingEntry>>,
        ActualFrame.pending(List.append(&2, Nat, head <> tail, more), entries, sources, addresses),
        ActualFrame.pending_prefix(item, ready_pending_join(ActualFrame.pending(tail, entries, sources, addresses), ActualFrame.pending(more, entries, sources, addresses))),
        ready_pending_join(ActualFrame.pending(head <> tail, entries, sources, addresses), ActualFrame.pending(more, entries, sources, addresses)),
        Equal.cong(Maybe<&2, List<&2, V.PendingEntry>>, Maybe<&2, List<&2, V.PendingEntry>>, rest => ActualFrame.pending_prefix(item, rest),
          ActualFrame.pending(List.append(&2, Nat, tail, more), entries, sources, addresses),
          ready_pending_join(ActualFrame.pending(tail, entries, sources, addresses), ActualFrame.pending(more, entries, sources, addresses)),
          ready_pending_split(tail, more, entries, sources, addresses)),
        ready_pending_join_prefix(item, ActualFrame.pending(tail, entries, sources, addresses), ActualFrame.pending(more, entries, sources, addresses)))

def ready_registered_all_rows(+order: List<&2, Nat>, +items: List<&2, Local.Pending>, +next: Nat,
    +entries: Map<&2, Maybe<&2, Local.Pending>>, +sources: List<&2, V.EdgeSource>, +addresses: List<&2, F.AddressEntry>,
    +valid: {Patricia.canonical(Maybe<&2, Local.Pending>, entries) == True{} : Bool},
    before: {ActualReady.pending_ids_before(order, next) == True{} : Bool}) ->
    {ActualFrame.pending(List.append(&2, Nat, order, ready_pending_ids(items, next)),
        ready_registered_pending(Compose.register_pending(items, next, entries)), sources, addresses)
      == ready_pending_join(ActualFrame.pending(order, entries, sources, addresses), ready_pending_rows(items, next, sources, addresses)) : Maybe<&2, List<&2, V.PendingEntry>>}:
  +values: Map<&2, Maybe<&2, Local.Pending>> = ready_registered_pending(Compose.register_pending(items, next, entries))
  Equal.trans(Maybe<&2, List<&2, V.PendingEntry>>,
    ActualFrame.pending(List.append(&2, Nat, order, ready_pending_ids(items, next)), values, sources, addresses),
    ready_pending_join(ActualFrame.pending(order, values, sources, addresses), ActualFrame.pending(ready_pending_ids(items, next), values, sources, addresses)),
    ready_pending_join(ActualFrame.pending(order, entries, sources, addresses), ready_pending_rows(items, next, sources, addresses)),
    ready_pending_split(order, ready_pending_ids(items, next), values, sources, addresses),
    Equal.trans(Maybe<&2, List<&2, V.PendingEntry>>,
      ready_pending_join(ActualFrame.pending(order, values, sources, addresses), ActualFrame.pending(ready_pending_ids(items, next), values, sources, addresses)),
      ready_pending_join(ActualFrame.pending(order, entries, sources, addresses), ActualFrame.pending(ready_pending_ids(items, next), values, sources, addresses)),
      ready_pending_join(ActualFrame.pending(order, entries, sources, addresses), ready_pending_rows(items, next, sources, addresses)),
      Equal.cong(Maybe<&2, List<&2, V.PendingEntry>>, Maybe<&2, List<&2, V.PendingEntry>>, rows =>
        ready_pending_join(rows, ActualFrame.pending(ready_pending_ids(items, next), values, sources, addresses)),
        ActualFrame.pending(order, values, sources, addresses), ActualFrame.pending(order, entries, sources, addresses),
        ready_registered_old_rows(order, items, next, entries, sources, addresses, valid, before)),
      Equal.cong(Maybe<&2, List<&2, V.PendingEntry>>, Maybe<&2, List<&2, V.PendingEntry>>, rows =>
        ready_pending_join(ActualFrame.pending(order, entries, sources, addresses), rows),
        ActualFrame.pending(ready_pending_ids(items, next), values, sources, addresses), ready_pending_rows(items, next, sources, addresses),
        ready_registered_pending_rows(items, next, entries, sources, addresses, valid))))

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
