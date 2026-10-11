import Base
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
import ../ExpansionDriverSpecification.bend as D

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
