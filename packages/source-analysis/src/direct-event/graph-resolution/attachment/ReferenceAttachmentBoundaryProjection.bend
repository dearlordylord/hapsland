import ./AttachmentProjectionAllowanceProof.bend as Count
import ./ActualAttachmentPhaseProjection.bend as ActualReady
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


# Actual completion updates scratch/stage/request only; the whole frame stays.
def completion_actual_frame(
  +state: T.ResolverState,
  +product: ArtifactValue.ProductValue
) -> {
  State.state_frame(
    State.with_state_next_request(
      State.with_state_stage(
        State.with_state_scratch(
          state,
          State.with_scratch_measured_product(State.state_scratch(state), Some{product})
        ),
        T.MeasuringCompletion{}
      ),
      (State.state_next_request(state) + 1n : Nat)
    )
  )
  == State.state_frame(state)
  : Maybe<&2, T.ResolverFrame>
}:
  match state:
    case T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, _}: {==}

# Observation of the existing capsule allocation, including failed projections.
def completion_allocated_capsule(value: Maybe<&2, Phase.Capsule>) -> Maybe<&2, Phase.Capsule>:
  match value:
    case None{}: None{}
    case Some{value}: Some{allocated(value)}

def completion_actual_capsule_parts(
  +clock: Maybe<&2, T.ClockToken>,
  +language: Maybe<&2, T.Language>,
  +active: Maybe<&2, Nat>,
  +edge: Maybe<&2, V.PendingPayload>,
  +state: T.ResolverState,
  +product: ArtifactValue.ProductValue
) -> {
  ActualReady.capsule(
    clock,
    language,
    active,
    edge,
    State.with_state_next_request(
      State.with_state_stage(
        State.with_state_scratch(
          state,
          State.with_scratch_measured_product(State.state_scratch(state), Some{product})
        ),
        T.MeasuringCompletion{}
      ),
      (State.state_next_request(state) + 1n : Nat)
    )
  )
  == completion_allocated_capsule(ActualReady.capsule(clock, language, active, edge, state))
  : Maybe<&2, Phase.Capsule>
}:
  match clock language active edge state:
    case Some{_} Some{_} Some{_} Some{_} T.ResolverState{
      T.ResolverInput{_, _, _, _, _, _, _, _, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case None{} _ _ _ T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, _}: {==}
    case Some{_} None{} _ _ T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, _}: {==}
    case Some{_} Some{_} None{} _ T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, _}: {==}
    case Some{_} Some{_} Some{_} None{} T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, _}: {==}

def completion_actual_capsule(
  +state: T.ResolverState,
  +history: V.History,
  +product: ArtifactValue.ProductValue
) -> {
  ActualBoundary.capsule(
    State.with_state_next_request(
      State.with_state_stage(
        State.with_state_scratch(
          state,
          State.with_scratch_measured_product(State.state_scratch(state), Some{product})
        ),
        T.MeasuringCompletion{}
      ),
      (State.state_next_request(state) + 1n : Nat)
    ),
    history
  )
  == completion_allocated_capsule(ActualBoundary.capsule(state, history))
  : Maybe<&2, Phase.Capsule>
}:
  match state history:
    case T.ResolverState{
      _,
      _,
      clock,
      _,
      _,
      language,
      _,
      _,
      _,
      _,
      T.ResolverScratch{_, _, active, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, pending, _},
      _,
      _
    } V.History{addresses, _, _, _, _, _, _}:
      completion_actual_capsule_parts(
        clock,
        language,
        active,
        ActualBoundary.ready_edge(pending, addresses),
        state,
        product
      )

def completion_actual_boundary(
  +state: T.ResolverState,
  +history: V.History,
  +view: V.Frame,
  +capsule: Phase.Capsule,
  +product: ArtifactValue.ProductValue,
  frame_ready: {
    ActualBoundary.frame(State.state_frame(state), history)
    == Some{view}
    : Maybe<&2, V.Frame>
  },
  capsule_ready: {
    ActualBoundary.capsule(state, history)
    == Some{capsule}
    : Maybe<&2, Phase.Capsule>
  }
) -> {
  ActualBoundary.project(LoopPolicy.completion_product(Some{product}, state), history)
  == Some{
    B.Selected{
      T.Request{
        State.input_invocation(State.state_input(state)),
        State.state_next_request(state),
        T.EncodeProduct{product}
      },
      view,
      B.MeasuringCompletion{allocated(capsule), product}
    }
  }
  : Maybe<&2, B.Boundary>
}:
  match state:
    case T.ResolverState{
      T.ResolverInput{_, _, _, _, _, _, _, _, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      T.ResolverScratch{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _},
      _,
      _
    }:
      +updated = State.with_state_next_request(
        State.with_state_stage(
          State.with_state_scratch(
            state,
            State.with_scratch_measured_product(State.state_scratch(state), Some{product})
          ),
          T.MeasuringCompletion{}
        ),
        (State.state_next_request(state) + 1n : Nat)
      )
      +request : T.Request = T.Request{
        State.input_invocation(State.state_input(state)),
        State.state_next_request(state),
        T.EncodeProduct{product}
      }
      observe_state_frame : Maybe<&2, T.ResolverFrame> -> Maybe<&2, V.Frame> = value => ActualBoundary.frame(
        value,
        history
      )
      frame_after : {
        ActualBoundary.frame(State.state_frame(updated), history)
        == Some{view}
        : Maybe<&2, V.Frame>
      } =
        Equal.trans(
          Maybe<&2, V.Frame>,
          ActualBoundary.frame(State.state_frame(updated), history),
          ActualBoundary.frame(State.state_frame(state), history),
          Some{view},
          Equal.cong(
            Maybe<&2, T.ResolverFrame>,
            Maybe<&2, V.Frame>,
            observe_state_frame,
            State.state_frame(updated),
            State.state_frame(state),
            completion_actual_frame(state, product)
          ),
          frame_ready
        )
      capsule_after : {
        ActualBoundary.capsule(updated, history)
        == Some{allocated(capsule)}
        : Maybe<&2, Phase.Capsule>
      } =
        Equal.trans(
          Maybe<&2, Phase.Capsule>,
          ActualBoundary.capsule(updated, history),
          completion_allocated_capsule(ActualBoundary.capsule(state, history)),
          Some{allocated(capsule)},
          completion_actual_capsule(state, history, product),
          Equal.cong(
            Maybe<&2, Phase.Capsule>,
            Maybe<&2, Phase.Capsule>,
            completion_allocated_capsule,
            ActualBoundary.capsule(state, history),
            Some{capsule},
            capsule_ready
          )
        )
      observe_frame : Maybe<&2, V.Frame> -> Maybe<&2, B.Boundary> = value => ActualBoundary.selected(
        request,
        value,
        ActualBoundary.completion(ActualBoundary.capsule(updated, history), Some{product})
      )
      frame_observed : {
        ActualBoundary.project(LoopPolicy.completion_product(Some{product}, state), history)
        == ActualBoundary.selected(
          request,
          Some{view},
          ActualBoundary.completion(ActualBoundary.capsule(updated, history), Some{product})
        )
        : Maybe<&2, B.Boundary>
      } =
        Equal.cong(
          Maybe<&2, V.Frame>,
          Maybe<&2, B.Boundary>,
          observe_frame,
          ActualBoundary.frame(State.state_frame(updated), history),
          Some{view},
          frame_after
        )
      observe_capsule : Maybe<&2, Phase.Capsule> -> Maybe<&2, B.Boundary> = value => ActualBoundary.selected(
        request,
        Some{view},
        ActualBoundary.completion(value, Some{product})
      )
      capsule_observed : {
        ActualBoundary.selected(
          request,
          Some{view},
          ActualBoundary.completion(ActualBoundary.capsule(updated, history), Some{product})
        )
        == Some{B.Selected{request, view, B.MeasuringCompletion{allocated(capsule), product}}}
        : Maybe<&2, B.Boundary>
      } =
        Equal.cong(
          Maybe<&2, Phase.Capsule>,
          Maybe<&2, B.Boundary>,
          observe_capsule,
          ActualBoundary.capsule(updated, history),
          Some{allocated(capsule)},
          capsule_after
        )
      Equal.trans(
        Maybe<&2, B.Boundary>,
        ActualBoundary.project(LoopPolicy.completion_product(Some{product}, state), history),
        ActualBoundary.selected(
          request,
          Some{view},
          ActualBoundary.completion(ActualBoundary.capsule(updated, history), Some{product})
        ),
        Some{B.Selected{request, view, B.MeasuringCompletion{allocated(capsule), product}}},
        frame_observed,
        capsule_observed
      )

def completion_common_claim(
  -World: Data,
  +actual: T.ResolverState,
  +reference: D.State,
  +child: X.Child,
  +history: V.History,
  +product: ArtifactValue.ProductValue,
  +world: E.WorldState<World>
) -> @-boundary:B.Boundary -> Type:
  boundary => {
    ActualBoundary.project(LoopPolicy.completion_product(Some{product}, actual), history)
    == Some{boundary}
    : Maybe<&2, B.Boundary>
  } & {
    project(
      World,
      D.consumed(World, D.completion_selected(reference, product, True{}), world),
      child,
      history
    )
    == Some{boundary}
    : Maybe<&2, B.Boundary>
  }

def completion_common_selected_parts(
  -World: Data,
  +actual: T.ResolverState,
  +reference: D.State,
  +child: X.Child,
  +history: V.History,
  +view: V.Frame,
  +product: ArtifactValue.ProductValue,
  +world: E.WorldState<World>,
  +request: T.Request,
  actual_observed: {
    ActualBoundary.project(LoopPolicy.completion_product(Some{product}, actual), history)
    == Some{
      B.Selected{
        request,
        view,
        B.MeasuringCompletion{allocated(Ready.capsule(reference, child)), product}
      }
    }
    : Maybe<&2, B.Boundary>
  },
  request_ready: {
    Some{request}
    == Boundary.selected_request(D.completion_selected(reference, product, True{}))
    : Maybe<&2, T.Request>
  },
  reference_observed: Exists(
    T.Request,
    completion_selected_claim(World, reference, child, history, view, product, world)
  )
) -> Exists(
  B.Boundary,
  completion_common_claim(World, actual, reference, child, history, product, world)
):
  match reference_observed:
    case (+query, (observed, query_exact)):
      same : {query == request : T.Request} = Count.some_equal(
        T.Request,
        query,
        request,
        Equal.trans(
          Maybe<&2, T.Request>,
          Some{query},
          Boundary.selected_request(D.completion_selected(reference, product, True{})),
          Some{request},
          Equal.sym(
            Maybe<&2, T.Request>,
            Boundary.selected_request(D.completion_selected(reference, product, True{})),
            Some{query},
            query_exact
          ),
          Equal.sym(
            Maybe<&2, T.Request>,
            Some{request},
            Boundary.selected_request(D.completion_selected(reference, product, True{})),
            request_ready
          )
        )
      )
      observe : T.Request -> Maybe<&2, B.Boundary> = value => Some{
        B.Selected{
          value,
          view,
          B.MeasuringCompletion{allocated(Ready.capsule(reference, child)), product}
        }
      }
      reference_exact : {
        project(
          World,
          D.consumed(World, D.completion_selected(reference, product, True{}), world),
          child,
          history
        )
        == Some{
          B.Selected{
            request,
            view,
            B.MeasuringCompletion{allocated(Ready.capsule(reference, child)), product}
          }
        }
        : Maybe<&2, B.Boundary>
      } =
        Equal.trans(
          Maybe<&2, B.Boundary>,
          project(
            World,
            D.consumed(World, D.completion_selected(reference, product, True{}), world),
            child,
            history
          ),
          Some{
            B.Selected{
              query,
              view,
              B.MeasuringCompletion{allocated(Ready.capsule(reference, child)), product}
            }
          },
          Some{
            B.Selected{
              request,
              view,
              B.MeasuringCompletion{allocated(Ready.capsule(reference, child)), product}
            }
          },
          observed,
          Equal.cong(T.Request, Maybe<&2, B.Boundary>, observe, query, request, same)
        )
      Tuple{
        B.Selected{
          request,
          view,
          B.MeasuringCompletion{allocated(Ready.capsule(reference, child)), product}
        },
        Tuple{actual_observed, reference_exact}
      }

def completion_common_selected(
  -World: Data,
  +actual: T.ResolverState,
  +reference: D.State,
  +child: X.Child,
  +history: V.History,
  +view: V.Frame,
  +product: ArtifactValue.ProductValue,
  +world: E.WorldState<World>,
  actual_frame: {
    ActualBoundary.frame(State.state_frame(actual), history)
    == Some{view}
    : Maybe<&2, V.Frame>
  },
  reference_frame: {Frame.project(reference, history) == Some{view} : Maybe<&2, V.Frame>},
  capsule_ready: {
    ActualBoundary.capsule(actual, history)
    == Some{Ready.capsule(reference, child)}
    : Maybe<&2, Phase.Capsule>
  },
  request_ready: {
    Some{
      T.Request{
        State.input_invocation(State.state_input(actual)),
        State.state_next_request(actual),
        T.EncodeProduct{product}
      }
    }
    == Boundary.selected_request(D.completion_selected(reference, product, True{}))
    : Maybe<&2, T.Request>
  }
) -> Exists(
  B.Boundary,
  completion_common_claim(World, actual, reference, child, history, product, world)
):
  completion_common_selected_parts(
    World,
    actual,
    reference,
    child,
    history,
    view,
    product,
    world,
    T.Request{
      State.input_invocation(State.state_input(actual)),
      State.state_next_request(actual),
      T.EncodeProduct{product}
    },
    completion_actual_boundary(
      actual,
      history,
      view,
      Ready.capsule(reference, child),
      product,
      actual_frame,
      capsule_ready
    ),
    request_ready,
    completion_selected_boundary(
      World,
      reference,
      child,
      history,
      view,
      product,
      world,
      reference_frame
    )
  )

def main() -> Unit:
  Unit{}
