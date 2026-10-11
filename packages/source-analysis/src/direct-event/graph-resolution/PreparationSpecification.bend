import Base
import ./BoundaryValidationSpecification.bend as Boundary
import ./Types.bend as T
import ./Environment.bend as E
import ./WholeObservation.bend as O
import ./RustSpecification.bend as Rust
import ./RustTaskSpecification.bend as Task
import ./CargoSpecification.bend as Cargo

# Independent needs-binding preparation interpreter. Runtime supplies the
# existing clock and next request id; neither session is restarted here.
# Path algebra and Binary64 expiry must be fixed mechanical interpretations
# in the eventual runtime correspondence, not arbitrary theorem assumptions.
type Stage is Data:
  Searching{step: Rust.SearchStep}
  Acting{action: Rust.Action}
  Capturing{step: Rust.CaptureStep}
  Inspecting{step: Task.Step}

type State is Data:
  State{input: T.ResolverInput, clock: T.ClockToken, cache: Maybe<&2, T.CacheToken>,
    next_request: Nat, stage: Stage}

type Progress<-World: Data> is Data:
  PreparationReady{state: State, world: E.WorldState<World>}
  PreparationWaiting{state: State, exchange: E.Exchange<World>}
  PreparationFinished{state: State, preparation: Rust.Preparation, world: E.WorldState<World>}
  PreparationFailed{state: State, failure: T.TechnicalFailure, world: E.WorldState<World>}

def stage(state: State, stage: Stage) -> State:
  match state:
    case State{input, clock, cache, next, _}: State{input, clock, cache, next, stage}

def invocation(input: T.ResolverInput) -> Nat:
  match input:
    case T.ResolverInput{invocation, _, _, _, _, _, _, _, _}: invocation

def begin(-World: Data, +input: T.ResolverInput, clock: T.ClockToken,
    next_request: Nat, world: E.WorldState<World>) -> Progress<World>:
  PreparationReady{State{input, clock, None{}, next_request, Searching{Rust.begin(input)}}, world}

# Requests are selected here, independently of the environment responder.
# Consumption is separate, so suspension retains precisely the continuation.
type Selection is Data:
  Internal{state: State}
  Selected{state: State, operation: T.Operation}
  Success{state: State, preparation: Rust.Preparation}
  Rejected{state: State, failure: T.TechnicalFailure}

def selected(state: State, operation: T.Operation) -> Selection:
  Selected{state, operation}

def internal(state: State, next: Stage) -> Selection:
  Internal{stage(state, next)}

def match_search_finished(state: State, cache: T.CacheToken,
    preparation: Rust.Preparation) -> Selection:
  match state:
    case State{input, clock, _, next, _}:
      Internal{State{input, clock, Some{cache}, next, Acting{Rust.next_iteration(preparation)}}}

def search_selection(+state: State, step: Rust.SearchStep) -> Selection:
  match step:
    case Rust.SearchRequest{_, operation}: selected(state, operation)
    case Rust.SearchFinished{cache, prep}:
      match_search_finished(state, cache, prep)
    case Rust.SearchFailed{failure}: Rejected{state, failure}

def capture_selection(+state: State, step: Rust.CaptureStep) -> Selection:
  match step:
    case Rust.CaptureRequest{_, operation}: selected(state, operation)
    case Rust.CaptureFinished{action}: internal(state, Acting{action})
    case Rust.CaptureFailed{failure}: Rejected{state, failure}

def start_capture(+state: State, preparation: Rust.Preparation,
    selection: T.SelectionToken, path: String) -> Selection:
  match state:
    case State{_, _, Some{cache}, _, _}:
      internal(state, Capturing{Rust.capture_start(preparation, cache, selection, path)})
    case _: Rejected{state, T.MalformedReply{}}

def start_task(+state: State, preparation: Rust.Preparation,
    task: T.RustTask, capture: T.CaptureToken, bytes: Nat) -> Selection:
  match state:
    case State{input, _, _, _, _}:
      internal(state, Inspecting{Task.begin(input, preparation, task, capture, bytes)})

def action_selection(~absolute: String -> Bool, +separator: String,
    +state: State, action: Rust.Action) -> Selection:
  match state action:
    case State{_, clock, _, _, _} Rust.ReadDeadline{_}:
      selected(state, T.ReadClock{clock})
    case _ Rust.CheckAccess{_, path}: selected(state, T.AccessPath{path})
    case _ Rust.RecheckAccess{_, path}: selected(state, T.AccessPath{path})
    case _ Rust.ResolvePath{prep, +path}:
      internal(
        state,
        Acting{Rust.resolved_path(Cargo.within(~absolute, path, separator), prep, path)}
      )
    case _ Rust.CaptureAuthorized{prep, selection, path}: start_capture(
      state,
      prep,
      selection,
      path
    )
    case _ Rust.InspectTask{prep, task, capture, bytes}: start_task(
      state,
      prep,
      task,
      capture,
      bytes
    )
    case _ Rust.PreparationFinished{prep}: Success{state, prep}

def task_selection(~absolute: String -> Bool, ~dirname: String -> String,
    ~relative: String -> String -> String, separator: String,
    +state: State, step: Task.Step) -> Selection:
  match step:
    case Task.ContinueTask{task}:
      internal(state, Inspecting{Task.advance(~absolute, ~dirname, ~relative, task, separator)})
    case Task.TaskRequest{_, operation}: selected(state, operation)
    case Task.TaskFinished{action}: internal(state, Acting{action})
    case Task.TaskFailed{failure}: Rejected{state, failure}

def choose(~absolute: String -> Bool, ~dirname: String -> String,
    ~relative: String -> String -> String, separator: String, +state: State) -> Selection:
  match state:
    case State{_, _, _, _, Searching{step}}: search_selection(state, step)
    case State{_, _, _, _, Acting{action}}: action_selection(~absolute, separator, state, action)
    case State{_, _, _, _, Capturing{step}}: capture_selection(state, step)
    case State{_, _, _, _, Inspecting{step}}:
      task_selection(~absolute, ~dirname, ~relative, separator, state, step)

def access_allowed(access: T.AccessOutcome) -> Bool:
  match access:
    case T.AccessDenied{}: False{}
    case T.AccessAllowed{_, _}: True{}

def action_reply(~expired: T.Binary64 -> Bool, state: State,
    action: Rust.Action, outcome: T.ServiceOutcome) -> Selection:
  match action outcome:
    case Rust.ReadDeadline{prep} T.ClockRead{bits}:
      internal(state, Acting{Rust.deadline(expired(bits), prep)})
    case Rust.CheckAccess{prep, _} T.AccessResult{access}:
      internal(state, Acting{Rust.checked_path(prep, access_allowed(access))})
    case Rust.RecheckAccess{prep, _} T.AccessResult{access}:
      internal(state, Acting{Rust.authorized(prep, access)})
    case _ _: Rejected{state, T.WrongReplyKind{}}

def consume(~absolute: String -> Bool, ~dirname: String -> String,
    ~basename: String -> Maybe<&2, String> -> String,
    ~join: List<&2, String> -> String, ~relative: String -> String -> String,
    ~extension: String -> String, ~normalize: String -> String,
    ~expired: T.Binary64 -> Bool, separator: String,
    +state: State, outcome: T.ServiceOutcome) -> Selection:
  match state outcome:
    case _ T.ProviderRejected{exception}: Rejected{state, T.ForeignProviderFailure{exception}}
    case State{_, _, _, _, Searching{Rust.SearchRequest{search, _}}} _:
      internal(state, Searching{Rust.search_reply(search, outcome)})
    case State{_, _, _, _, Acting{action}} _:
      action_reply(~expired, state, action, outcome)
    case State{_, _, _, _, Capturing{Rust.CaptureRequest{capture, _}}} _:
      internal(state, Capturing{Rust.capture_reply(capture, outcome)})
    case State{_, _, _, _, Inspecting{Task.TaskRequest{task, _}}} _:
      internal(state, Inspecting{Task.reply(~absolute, ~dirname, ~basename, ~join,
        ~relative, ~extension, ~normalize, task, outcome, separator)})
    case _ _: Rejected{state, T.WrongReplyKind{}}

def consumed(-World: Data, selection: Selection,
    world: E.WorldState<World>) -> Progress<World>:
  match selection:
    case Internal{state}: PreparationReady{state, world}
    case Success{state, prep}: PreparationFinished{state, prep, world}
    case Rejected{state, failure}: PreparationFailed{state, failure, world}
    case Selected{state, _}: PreparationFailed{state, T.MalformedReply{}, world}

# These templates are bound to choose/consume above with the same fixed
# mechanical algebra. They are not alternative application-policy inputs.
def validated(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    failure: Maybe<&2, T.TechnicalFailure>, state: State,
    outcome: T.ServiceOutcome, world: E.WorldState<World>) -> Progress<World>:
  match failure:
    case Some{failure}: PreparationFailed{state, failure, world}
    case None{}: consumed(World, consume(state, outcome), world)

def delivered(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    +request: T.Request, state: State, +reply: T.Reply,
    world: E.WorldState<World>) -> Progress<World>:
  match reply:
    case T.Reply{_, _, outcome}:
      validated(consume, World, Boundary.check(request, reply), state, outcome, world)

def exchanged(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    request: T.Request, state: State, +exchange: E.Exchange<World>) -> Progress<World>:
  match exchange:
    case E.Delivered{world, +reply}:
      delivered(consume, World, request, state, reply, world)
    case E.Waiting{_, _, _}: PreparationWaiting{state, exchange}


def issue(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    respond: T.Operation -> World -> E.Response<World>,
    state: State, +operation: T.Operation, world: E.WorldState<World>) -> Progress<World>:
  match state:
    case State{+input, clock, cache, +next, stage}:
      exchanged(
        ~consume,
        World,
        T.Request{invocation(input), next, operation},
        State{input, clock, cache, (next + 1n : Nat), stage},
        E.step(World, respond, T.Request{invocation(input), next, operation}, world)
      )

def selected_step(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    respond: T.Operation -> World -> E.Response<World>,
    selection: Selection, world: E.WorldState<World>) -> Progress<World>:
  match selection:
    case Selected{state, operation}: issue(~consume, World, respond, state, operation, world)
    case other: consumed(World, other, world)

def advance(
  ~choose: State -> Selection,
  ~consume: State -> T.ServiceOutcome -> Selection,
  -World: Data,
  respond: T.Operation -> World -> E.Response<World>,
  progress: Progress<World>
) -> Progress<World>:
  match progress:
    case PreparationReady{state, world}: selected_step(
      ~consume,
      World,
      respond,
      choose(state),
      world
    )
    case other: other

def completed_exchange(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    state: State, +exchange: E.Exchange<World>, completion: E.Completion<World>) -> Progress<World>:
  match exchange:
    case E.Waiting{_, request, _}:
      exchanged(consume, World, request, state, E.complete(World, exchange, completion))
    case E.Delivered{_, _}: PreparationWaiting{state, exchange}

def complete(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    progress: Progress<World>, completion: E.Completion<World>) -> Progress<World>:
  match progress:
    case PreparationWaiting{state, exchange}:
      completed_exchange(~consume, World, state, exchange, completion)
    case other: other

def cancelled_world(-World: Data, world: E.WorldState<World>,
    invocation: Nat) -> E.WorldState<World>:
  match world:
    case E.WorldState{world, effects}: E.WorldState{world,
      List.append(&2, O.Effect, effects, [O.CancelledInvocation{invocation}])}

def cancelled(-World: Data, +state: State,
    world: E.WorldState<World>) -> Progress<World>:
  match state:
    case State{input, _, _, _, _}:
      PreparationFailed{
        state,
        T.InvocationCancelled{},
        cancelled_world(World, world, invocation(input))
      }

def cancel(-World: Data, progress: Progress<World>) -> Progress<World>:
  match progress:
    case PreparationReady{state, world}: cancelled(World, state, world)
    case PreparationWaiting{state, E.Waiting{world, _, _}}: cancelled(World, state, world)
    case other: other

# Reusing an old immutable PreparationWaiting can replay its completion. At-most-once
# lease consumption, late provider cleanup and shared world publication must
# be enforced by the fixed runtime model; this local interpreter proves none.
def main() -> Unit:
  Unit{}
