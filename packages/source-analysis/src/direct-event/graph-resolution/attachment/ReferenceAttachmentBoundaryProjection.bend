import Base
import ./AttachmentBoundaryView.bend as B
import ./AttachmentFrameView.bend as V
import ./AttachmentPhaseView.bend as Phase
import ./ReferenceAttachmentFrameProjection.bend as Frame
import ./ReferenceAttachmentPhaseProjection.bend as Ready
import ./AttachmentReferenceBoundary.bend as Boundary
import ../Types.bend as T
import ../ExpansionSpecification.bend as X
import ../ExpansionDriverSpecification.bend as D

# Independent next-boundary observation. The supplied child is the fixed
# transaction child, not a new continuation chosen after observing a reply.
# Worlds/effects are deliberately not projected away by an equality claim:
# the enclosing transaction law separately requires exact post-provider World.
def allocated(capsule: Phase.Capsule) -> Phase.Capsule:
  match capsule:
    case Phase.Capsule{invocation, path, language, context, clock, cache,
      next, iterations, target, edge}:
      Phase.Capsule{invocation, path, language, context, clock, cache,
        (next + 1n : Nat), iterations, target, edge}

def selected(request: Maybe<&2, T.Request>, frame: Maybe<&2, V.Frame>,
    continuation: B.Continuation) -> Maybe<&2, B.Boundary>:
  match request frame:
    case Some{request} Some{frame}: Some{B.Selected{request, frame, continuation}}
    case _ _: None{}

# Request payload and continuation-owned measured product are both retained.
# Fixed D.completion constructs them identically; observing the stage value
# prevents a forged raw selection from hiding a different continuation value.
def selected_stage(+state: D.State, +operation: T.Operation,
    child: X.Child, history: V.History) -> Maybe<&2, B.Boundary>:
  match state operation:
    case D.State{_, _, _, _, _, _, _, D.AwaitDeadline{}} T.ReadClock{_}:
      selected(Boundary.selected_request(D.Selected{state, operation}),
        Frame.project(state, history), B.CheckingIteration{allocated(Ready.capsule(state, child))})
    case D.State{_, _, _, _, _, _, _, D.AwaitCompletion{product}} T.EncodeProduct{_}:
      selected(
        Boundary.selected_request(D.Selected{state, operation}),
        Frame.project(state, history),
        B.MeasuringCompletion{allocated(Ready.capsule(state, child)), product}
      )
    case _ _: None{}

def finished(
  product: Maybe<&2, T.ProductValue>,
  frame: Maybe<&2, V.Frame>
) -> Maybe<&2, B.Boundary>:
  match frame:
    case Some{frame}: Some{B.Finished{product, frame}}
    case None{}: None{}

def project(-World: Data, progress: D.Progress<World>, child: X.Child,
    history: V.History) -> Maybe<&2, B.Boundary>:
  match progress:
    case D.DriverFailed{_, failure, _}: Some{B.Failed{failure}}
    case D.DriverFinished{state, product, _}: finished(product, Frame.project(state, history))
    case D.DriverSelected{state, operation, _}: selected_stage(state, operation, child, history)
    case _: None{}

def main() -> Unit:
  Unit{}
