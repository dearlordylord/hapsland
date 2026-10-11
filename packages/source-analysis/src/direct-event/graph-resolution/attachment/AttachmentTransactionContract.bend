import Base
import ./AttachmentFrameView.bend as V
import ./AttachmentPhaseView.bend as Phase
import ./AttachmentBoundaryView.bend as B
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

# Shared contract for the whole attachment transaction and its literal instance.
# This consolidates the existing predicates; it adds no law or premise.
type Witness is Data:
  Witness{state: T.ResolverState, request: T.Request, product: T.ProductValue,
    staged: V.Frame, boundary: B.Boundary}

def witness_state(value: Witness) -> T.ResolverState:
  match value:
    case Witness{state, _, _, _, _}: state

def witness_request(value: Witness) -> T.Request:
  match value:
    case Witness{_, request, _, _, _}: request

def witness_product(value: Witness) -> T.ProductValue:
  match value:
    case Witness{_, _, product, _, _}: product

def witness_staged(value: Witness) -> V.Frame:
  match value:
    case Witness{_, _, _, staged, _}: staged

def witness_boundary(value: Witness) -> B.Boundary:
  match value:
    case Witness{_, _, _, _, boundary}: boundary

def operation(request: T.Request) -> T.Operation:
  match request:
    case T.Request{_, _, operation}: operation

def actual_frame(value: Maybe<&2, T.ResolverFrame>, history: V.History) -> Maybe<&2, V.Frame>:
  match value:
    case Some{frame}: ActualFrame.project(frame, history)
    case None{}: None{}

def progress_world(-World: Data, progress: D.Progress<World>) -> Maybe<&2, E.WorldState<World>>:
  match progress:
    case D.DriverReady{_, world}: Some{world}
    case D.DriverSelected{_, _, world}: Some{world}
    case D.DriverFinished{_, _, world}: Some{world}
    case D.DriverExhausted{_, world}: Some{world}
    case D.DriverInvalid{_, world}: Some{world}
    case D.DriverFailed{_, _, world}: Some{world}
    case D.DriverWaiting{_, _}: None{}

def claim(-World: Data, +actual: T.ResolverState, +reference: D.State,
    +child: X.Child, +phase: Phase.Phase, +history: V.History,
    +previous: Nat, +reply: T.Reply, +world: E.WorldState<World>, +witness: Witness) -> Type:
  {Attach.previous(previous, actual)
    == Loop.ServiceStep{T.AwaitService{witness_state(witness), witness_request(witness)}}
    : Loop.Continuation} &
  {operation(witness_request(witness)) == T.EncodeProduct{witness_product(witness)} : T.Operation} &
  {S.state_stage(witness_state(witness)) == T.MeasuringCandidateTree{} : T.ResolverStage} &
  {ReferenceBoundary.selected_request(ReferenceBoundary.enter(reference, child, previous))
    == Some{witness_request(witness)} : Maybe<&2, T.Request>} &
  {actual_frame(S.state_frame(witness_state(witness)), History.measurement(phase, history))
    == Some{witness_staged(witness)} : Maybe<&2, V.Frame>} &
  {
    Staged.project(
      ReferenceBoundary.enter(reference, child, previous),
      History.measurement(phase, history)
    )
    == Some{witness_staged(witness)}
    : Maybe<&2, V.Frame>
  } &
  {
    ActualBoundary.project(
      Machine.resume(Attach.previous(previous, actual), T.ServiceReply{reply}),
      History.reply(
        phase,
        History.measurement(phase, history),
        previous,
        witness_request(witness),
        reply
      )
    )
    == Some{witness_boundary(witness)}
    : Maybe<&2, B.Boundary>
  } &
  {
    ReferenceBoundaryView.project(
      World,
      ReferenceBoundary.deliver_next(
        World,
        ReferenceBoundary.enter(reference, child, previous),
        reply,
        world
      ),
      child,
      History.reply(
        phase,
        History.measurement(phase, history),
        previous,
        witness_request(witness),
        reply
      )
    )
    == Some{witness_boundary(witness)}
    : Maybe<&2, B.Boundary>
  } &
  {
    progress_world(
      World,
      ReferenceBoundary.deliver_next(
        World,
        ReferenceBoundary.enter(reference, child, previous),
        reply,
        world
      )
    )
    == Some{world}
    : Maybe<&2, E.WorldState<World>>
  }

def conclusion(-World: Data, +actual: T.ResolverState, +reference: D.State,
    +child: X.Child, +phase: Phase.Phase, +history: V.History,
    +previous: Nat, +reply: T.Reply, +world: E.WorldState<World>) -> Type:
  predicate : Witness -> Type = witness =>
    claim(World, actual, reference, child, phase, history, previous, reply, world, witness)
  Exists(Witness, witness => predicate(witness))

def phase_frame_budget(phase: Phase.Phase) -> V.Budget:
  match phase:
    case Phase.Phase{
      V.Frame{_, _, _, _, _, _, _, _, _, _, _, _, budget, _, _, _, _, _, _, _},
      _,
      _
    }:
      budget

def phase_child_budget(phase: Phase.Phase) -> V.Budget:
  match phase:
    case Phase.Phase{_, Phase.Child{_, _, _, _, _, _, _, _, _, _, _, _, _, budget, _, _}, _}:
      budget
