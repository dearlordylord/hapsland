import ../../../../../agent-flow-bend/ImportGraph.bend as G
import ../SignedLocalSpecification.bend as Signed
import ../traversal/SPEC.bend as Recursive
import ./ActualAttachmentBoundaryProjection.bend as ActualBoundary
import ../State.bend as State
import ../LoopPolicy.bend as LoopPolicy
import ../Environment.bend as E
import ../../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ./AttachmentBoundaryView.bend as B
import ./AttachmentFrameView.bend as V
import ./AttachmentPhaseView.bend as Phase
import ./ReferenceAttachmentFrameProjection.bend as Frame
import ./ReferenceAttachmentPhaseProjection.bend as Ready
import ./AttachmentReferenceBoundary.bend as Boundary
import ../Types.bend as T
import ../ExpansionSpecification.bend as X
import ../ExpansionDriverState.bend as D

# Independent next-boundary observation. The supplied child is the fixed
# transaction child, not a new continuation chosen after observing a reply.
# Worlds/effects are deliberately not projected away by an equality claim:
# the enclosing transaction law separately requires exact post-provider World.
def allocated(capsule: Phase.Capsule) -> Phase.Capsule:
  match capsule:
    case Phase.Capsule{invocation, path, language, context, clock, cache,
      next, iterations, target, edge, fingerprint}:
      Phase.Capsule{invocation, path, language, context, clock, cache,
        (next + 1n : Nat), iterations, target, edge, fingerprint}

def selected(
  request: Maybe<&2, T.Request>,
  frame: Maybe<&2, V.Frame>,
  continuation: B.Continuation
) -> Maybe<&2, B.Boundary>:
  match request frame:
    case Some{request} Some{frame}: Some{B.Selected{request, frame, continuation}}
    case _ _: None{}

# Request payload and continuation-owned measured product are both retained.
# Fixed D.completion constructs them identically; observing the stage value
# prevents a forged raw selection from hiding a different continuation value.
def selected_stage(
  +state: D.State,
  +operation: T.Operation,
  child: X.Child,
  history: V.History
) -> Maybe<&2, B.Boundary>:
  match state operation:
    case D.State{_, _, _, _, _, _, _, D.AwaitDeadline{}, _} T.ReadClock{_}:
      selected(Boundary.selected_request(D.Selected{state, operation}),
        Frame.project(state, history), B.CheckingIteration{allocated(Ready.capsule(state, child))})
    case D.State{_, _, _, _, _, _, _, D.AwaitCompletion{product}, _} T.EncodeProduct{_}:
      selected(
        Boundary.selected_request(D.Selected{state, operation}),
        Frame.project(state, history),
        B.MeasuringCompletion{allocated(Ready.capsule(state, child)), product}
      )
    case D.State{_, _, _, _, _, _, _, D.AwaitFinalDeadline{product}, _} T.ReadClock{_}:
      selected(
        Boundary.selected_request(D.Selected{state, operation}),
        Frame.project(state, history),
        B.CheckingCompletion{allocated(Ready.capsule(state, child)), product}
      )
    case _ _: None{}

def finished(
  product: Maybe<&2, ArtifactValue.ProductValue>,
  frame: Maybe<&2, V.Frame>
) -> Maybe<&2, B.Boundary>:
  match frame:
    case Some{frame}: Some{B.Finished{product, frame}}
    case None{}: None{}

def project(
  -World: Data,
  progress: D.Progress<World>,
  child: X.Child,
  history: V.History
) -> Maybe<&2, B.Boundary>:
  match progress:
    case D.DriverFailed{_, failure, _}: Some{B.Failed{failure}}
    case D.DriverFinished{state, product, _}: finished(product, Frame.project(state, history))
    case D.DriverSelected{state, operation, _}: selected_stage(state, operation, child, history)
    case _: None{}

# Internal completion join for the original whole attachment transaction.
# Denied completion preserves the complete projected frame and retained World.
def completion_denied(
  -World: Data,
  +actual: T.ResolverState,
  +reference: D.State,
  +child: X.Child,
  +history: V.History,
  +view: V.Frame,
  +world: E.WorldState<World>,
  +frame: T.ResolverFrame,
  actual_frame: {
    ActualBoundary.frame(State.state_frame(actual), history)
    == Some{view}
    : Maybe<&2, V.Frame>
  },
  reference_frame: {Frame.project(reference, history) == Some{view} : Maybe<&2, V.Frame>}
) -> {
  ActualBoundary.project(LoopPolicy.request_completion(False{}, actual, frame), history)
  == Some{B.Finished{None{}, view}}
  : Maybe<&2, B.Boundary>
} & {
  project(World, D.consumed(World, D.no_unit(reference), world), child, history)
  == Some{B.Finished{None{}, view}}
  : Maybe<&2, B.Boundary>
}:
  Tuple{
    Equal.cong(Maybe<&2, V.Frame>, Maybe<&2, B.Boundary>,
      projected => ActualBoundary.finished(None{}, projected),
      ActualBoundary.frame(State.state_frame(actual), history), Some{view}, actual_frame),
    Equal.cong(Maybe<&2, V.Frame>, Maybe<&2, B.Boundary>,
      projected => finished(None{}, projected),
      Frame.project(reference, history), Some{view}, reference_frame)}


# Completion changes the stage only; projected frame and capsule stay retained.
def completion_assembled_stage(
  +state: D.State,
  +history: V.History,
  +stage: D.Stage,
  +targets: Maybe<&2, List<&2, V.TargetEntry>>,
  +captured: Maybe<&2, List<&2, V.CapturedEntry>>,
  +visited: Maybe<&2, List<&2, String>>
) -> {
  Frame.assembled(D.stage(state, stage), history, targets, captured, visited)
  == Frame.assembled(state, history, targets, captured, visited)
  : Maybe<&2, V.Frame>
}:
  match state history targets captured visited:
    case D.State{
      D.Config{_, _, _, _, _, _},
      X.Frame{
        G.Bounded{_, _},
        _,
        _,
        Signed.State{Recursive.State{_, _, _, _}, _},
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        _
      },
      _,
      _,
      _,
      _,
      _,
      _,
      _
    } V.History{_, _, _, _, _, _, _} Some{_} Some{_} Some{_}: {==}
    case D.State{_, _, _, _, _, _, _, _, _} _ None{} _ _: {==}
    case D.State{_, _, _, _, _, _, _, _, _} _ Some{_} None{} _: {==}
    case D.State{_, _, _, _, _, _, _, _, _} _ Some{_} Some{_} None{}: {==}

def completion_frame_stage(
  +state: D.State,
  +history: V.History,
  +stage: D.Stage
) -> {
  Frame.project(D.stage(state, stage), history)
  == Frame.project(state, history)
  : Maybe<&2, V.Frame>
}:
  match state history:
    case D.State{
      _,
      X.Frame{
        _,
        _,
        _,
        Signed.State{Recursive.State{values, _, _, _}, _},
        _,
        captures,
        _,
        _,
        _,
        _,
        _,
        _
      },
      targets,
      _,
      _,
      _,
      _,
      _,
      _
    } V.History{_, V.Order{_, _, _, _, _, seen}, _, sources, _, _, _}:
      completion_assembled_stage(
        state,
        history,
        stage,
        Frame.targets(targets),
        Frame.captured(captures, sources),
        Frame.visited(seen, values)
      )

def completion_selected_claim(
  -World: Data,
  +state: D.State,
  +child: X.Child,
  +history: V.History,
  +view: V.Frame,
  +product: ArtifactValue.ProductValue,
  +world: E.WorldState<World>
) -> @-request:T.Request -> Type:
  request => {
    project(
      World,
      D.consumed(World, D.completion_selected(state, product, True{}), world),
      child,
      history
    )
    == Some{
      B.Selected{
        request,
        view,
        B.MeasuringCompletion{allocated(Ready.capsule(state, child)), product}
      }
    }
    : Maybe<&2, B.Boundary>
  } & {
    Boundary.selected_request(D.completion_selected(state, product, True{}))
    == Some{request}
    : Maybe<&2, T.Request>
  }

def completion_selected_boundary(
  -World: Data,
  +state: D.State,
  +child: X.Child,
  +history: V.History,
  +view: V.Frame,
  +product: ArtifactValue.ProductValue,
  +world: E.WorldState<World>,
  ready: {Frame.project(state, history) == Some{view} : Maybe<&2, V.Frame>}
) -> Exists(
  T.Request,
  completion_selected_claim(World, state, child, history, view, product, world)
):
  match state child:
    case D.State{
      D.Config{+invocation, _, _, _, _, _},
      X.Frame{_, _, _, _, _, _, _, _, _, _, _, _},
      _,
      _,
      _,
      +next,
      _,
      _,
      _
    } X.Child{X.Attempt{_, _, _, _, _, _, _, _, _, _}, _, _, _}:
      observe : Maybe<&2, V.Frame> -> Maybe<&2, B.Boundary> = projected => selected(
        Some{T.Request{invocation, next, T.EncodeProduct{product}}},
        projected,
        B.MeasuringCompletion{
          allocated(Ready.capsule(D.stage(state, D.AwaitCompletion{product}), child)),
          product
        }
      )
      observed : {
        project(
          World,
          D.consumed(World, D.completion_selected(state, product, True{}), world),
          child,
          history
        )
        == Some{
          B.Selected{
            T.Request{invocation, next, T.EncodeProduct{product}},
            view,
            B.MeasuringCompletion{allocated(Ready.capsule(state, child)), product}
          }
        }
        : Maybe<&2, B.Boundary>
      } =
        Equal.cong(
          Maybe<&2, V.Frame>,
          Maybe<&2, B.Boundary>,
          observe,
          Frame.project(D.stage(state, D.AwaitCompletion{product}), history),
          Some{view},
          Equal.trans(
            Maybe<&2, V.Frame>,
            Frame.project(D.stage(state, D.AwaitCompletion{product}), history),
            Frame.project(state, history),
            Some{view},
            completion_frame_stage(state, history, D.AwaitCompletion{product}),
            ready
          )
        )
      request_equal : {
        Boundary.selected_request(D.completion_selected(state, product, True{}))
        == Some{T.Request{invocation, next, T.EncodeProduct{product}}}
        : Maybe<&2, T.Request>
      } = {==}
      Tuple{T.Request{invocation, next, T.EncodeProduct{product}}, Tuple{observed, request_equal}}


def main() -> Unit:
  Unit{}
