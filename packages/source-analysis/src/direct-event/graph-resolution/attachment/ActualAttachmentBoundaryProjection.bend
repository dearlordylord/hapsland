import Base
import ./AttachmentBoundaryView.bend as B
import ./AttachmentPhaseView.bend as Phase
import ./AttachmentFrameView.bend as V
import ./ActualAttachmentPhaseProjection.bend as Ready
import ./ActualAttachmentFrameProjection.bend as Frame
import ../Types.bend as T
import ../State.bend as S
import ../Loop.bend as Loop
import ../traversal/core.bend as Local
import ../ForestSpecification.bend as F

def ready_edge(
  value: Maybe<&2, Local.Pending>,
  addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, V.PendingPayload>:
  match value:
    case Some{value}: V.pending_payload(value, addresses)
    case None{}: None{}

# The actual Await state has already allocated the request counter. The common
# continuation capsule observes that successor, not the request ID itself.
def capsule(+state: T.ResolverState, history: V.History) -> Maybe<&2, Phase.Capsule>:
  match history:
    case V.History{addresses, _, _, _, _, _, _}:
      Ready.capsule(S.state_clock(state), S.state_language(state),
        S.scratch_active_target(S.state_scratch(state)),
        ready_edge(S.scratch_pending_edge(S.state_scratch(state)), addresses), state)

def finished(
  product: Maybe<&2, T.ProductValue>,
  frame: Maybe<&2, V.Frame>
) -> Maybe<&2, B.Boundary>:
  match frame:
    case Some{frame}: Some{B.Finished{product, frame}}
    case None{}: None{}

def frame(value: Maybe<&2, T.ResolverFrame>, history: V.History) -> Maybe<&2, V.Frame>:
  match value:
    case Some{value}: Frame.project(value, history)
    case None{}: None{}

def completion(
  capsule: Maybe<&2, Phase.Capsule>,
  measured: Maybe<&2, T.ProductValue>
) -> Maybe<&2, B.Continuation>:
  match capsule measured:
    case Some{capsule} Some{measured}: Some{B.MeasuringCompletion{capsule, measured}}
    case _ _: None{}

def iteration(capsule: Maybe<&2, Phase.Capsule>) -> Maybe<&2, B.Continuation>:
  match capsule:
    case Some{capsule}: Some{B.CheckingIteration{capsule}}
    case None{}: None{}

def continuation(
  stage: T.ResolverStage,
  +state: T.ResolverState,
  history: V.History
) -> Maybe<&2, B.Continuation>:
  match stage:
    case T.CheckingIterationDeadline{}: iteration(capsule(state, history))
    case T.MeasuringCompletion{}: completion(
      capsule(state, history),
      S.scratch_measured_product(S.state_scratch(state))
    )
    case _: None{}

def selected(
  request: T.Request,
  frame: Maybe<&2, V.Frame>,
  continuation: Maybe<&2, B.Continuation>
) -> Maybe<&2, B.Boundary>:
  match frame continuation:
    case Some{frame} Some{continuation}: Some{B.Selected{request, frame, continuation}}
    case _ _: None{}

def product(result: T.ProductResult) -> Maybe<&2, T.ProductValue>:
  match result:
    case T.ReviewUnitResult{value}: Some{value}
    case T.NoReviewUnit{}: None{}

def step(value: T.ResolverStep, +history: V.History) -> Maybe<&2, B.Boundary>:
  match value:
    case T.FailedResolver{failure}: Some{B.Failed{failure}}
    case T.FinishedResolver{result, final_frame}: finished(
      product(result),
      frame(final_frame, history)
    )
    case T.AwaitService{+state, request}: selected(
      request,
      frame(S.state_frame(state), history),
      continuation(S.state_stage(state), state, history)
    )

def project(value: Loop.Continuation, history: V.History) -> Maybe<&2, B.Boundary>:
  match value:
    case Loop.ServiceStep{value}: step(value, history)
    case _: None{}

def main() -> Unit:
  Unit{}
