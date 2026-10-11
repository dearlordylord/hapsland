import Base
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
