import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ./BoundaryValidationSpecification.bend as Boundary
import ./Types.bend as T
import ./python-module/Session.bend as Python
import ./python-module/ArtifactProtocol.bend as P
import ./ComposedBudget.bend as Budget
import ./WholeObservation.bend as O
import ./Environment.bend as E
import ./ExpansionSpecification.bend as X
import ./ForestSpecification.bend as F
import ./SPEC.bend as Root
import ../../../../agent-flow-bend/ImportGraph.bend as G

# Sole reference driver state and attachment/completion boundary transitions.
# Discovery and language orchestration consume this owner; attachment proofs
# do not import their full command interpreter. Definitions are moved intact.
type Config is Data:
  Config{invocation: Nat, root_path: String, language: T.Language,
    frontend: T.FrontendContext, clock: T.ClockToken, cache: Maybe<&2, T.CacheToken>}
type Target is Data:
  FileTarget{path: String, name: String, edge: X.Edge}
  BundledTarget{declaration: T.FactDeclaration, source: T.SourceFacts,
    catalog: Root.Source, edge: X.Edge}
type TargetEntry is Data:
  TargetEntry{id: Nat, target: Target}
type TargetId is Data:
  TargetId{key: String, id: Nat}
type Stage is Data:
  Iteration{}
  AwaitDeadline{}
  Command{}
  AfterCommand{skip_phase: Bool}
  Resolve{edge: X.Edge}
  Scan{edge: X.Edge, choices: List<&2, String>, existing: List<&2, String>}
  AwaitStatus{edge: X.Edge, path: String, remaining: List<&2, String>, existing: List<&2, String>}
  Check{id: Nat, target: Target}
  AwaitChecked{id: Nat, target: Target}
  Read{id: Nat, target: Target}
  AwaitAuthorized{id: Nat, target: Target}
  AwaitSnapshot{id: Nat, target: Target, path: String, selection: T.SelectionToken}
  AwaitLookup{id: Nat, target: Target, path: String, selection: T.SelectionToken}
  AwaitCapture{id: Nat, target: Target, path: String, selection: T.SelectionToken}
  AwaitStored{id: Nat, target: Target, path: String, capture: T.CaptureToken, bytes: Nat}
  AwaitDiagnostic{}
  AwaitFrontend{id: Nat, target: Target, path: String, capture: T.CaptureToken,
    bytes: Nat, local_work_before: Nat}
  AwaitBundleBytes{id: Nat, target: Target}
  Transaction{transaction: X.Transaction}
  Completion{partial: Maybe<&2, G.Reason>}
  AwaitCompletion{product: ArtifactValue.ProductValue}
  PythonImporting{edge: X.Edge, pending: Maybe<&2, T.Request>}
  PythonInspectStart{
    id: Nat,
    target: Target,
    path: String,
    capture: T.CaptureToken,
    bytes: Nat,
    before: Nat
  }
  PythonInspecting{
    id: Nat,
    target: Target,
    path: String,
    bytes: Nat,
    before: Nat,
    pending: Maybe<&2, T.Request>
  }
  PythonValidationStart{product: ArtifactValue.ProductValue}
  PythonValidating{product: ArtifactValue.ProductValue, pending: Maybe<&2, T.Request>}
  AwaitFinalDeadline{product: ArtifactValue.ProductValue}
type PythonContext is Data:
  PythonContext{session: Python.Session, cache: T.CacheToken, census: Budget.Census}
type State is Data:
  State{config: Config, frame: X.Frame, targets: List<&2, TargetEntry>,
    ids: List<&2, TargetId>, next_target: Nat, next_request: Nat,
    iterations: Nat, stage: Stage, python: Maybe<&2, PythonContext>}
type Selection is Data:
  Internal{state: State}
  Selected{state: State, operation: T.Operation}
  ChildBegin{state: State, command: P.PythonCommand}
  ChildResume{state: State, request: T.Request, reply: T.Reply}
  Success{state: State, product: Maybe<&2, ArtifactValue.ProductValue>}
  EvaluationExhausted{state: State}
  InvariantFailed{state: State}
  Rejected{state: State, failure: T.TechnicalFailure}
type Progress<-World: Data> is Data:
  DriverReady{state: State, world: E.WorldState<World>}
  DriverSelected{state: State, operation: T.Operation, world: E.WorldState<World>}
  DriverWaiting{state: State, exchange: E.Exchange<World>}
  DriverChildBegin{state: State, command: P.PythonCommand, world: E.WorldState<World>}
  DriverChildResume{state: State, request: T.Request, reply: T.Reply, world: E.WorldState<World>}
  DriverFinished{
    state: State,
    product: Maybe<&2, ArtifactValue.ProductValue>,
    world: E.WorldState<World>
  }
  DriverExhausted{state: State, world: E.WorldState<World>}
  DriverInvalid{state: State, world: E.WorldState<World>}
  DriverFailed{state: State, failure: T.TechnicalFailure, world: E.WorldState<World>}

# State access/update retains every ordered association and counter.
type OmissionResult is Data:
  OmissionsObserved{present: Bool}
  OmissionExhausted{}
  OmissionInvalid{}
type OmissionWork is Data:
  OmissionAddress{address: O.NodeAddress}
  OmissionReferences{references: List<&2, F.Reference>}

def frame(+state: State) -> X.Frame:
  match state:
    case State{_, +frame, _, _, _, _, _, _, _}: frame

def stage(+state: State, +next: Stage) -> State:
  match state:
    case State{+config, +frame, +targets, +ids, +target, +request, +iterations, _, +python}:
      State{config, frame, targets, ids, target, request, iterations, next, python}

def with_frame(+state: State, +frame: X.Frame) -> State:
  match state:
    case State{+config, _, +targets, +ids, +target, +request, +iterations, +stage, +python}:
      State{config, frame, targets, ids, target, request, iterations, stage, python}

def internal(+state: State, +next: Stage) -> Selection:
  Internal{stage(state, next)}

def request(+state: State, +next: Stage, +operation: T.Operation) -> Selection:
  Selected{stage(state, next), operation}

def no_unit(+state: State) -> Selection:
  Success{state, None{}}

def invocation(+config: Config) -> Nat:
  match config:
    case Config{+invocation, _, _, _, _, _}: invocation

# The reference owns the orchestration and accounting; the existing specialized
# Python policy child is shared. This is not an independent Python-policy proof.
def phase_completion(+state: State, +phase: G.Phase) -> Selection:
  match phase:
    case G.Complete{}: internal(state, Completion{None{}})
    case G.Incomplete{+reason}: internal(state, Completion{Some{reason}})
    case _: internal(state, Iteration{})

def after_command(+state: State, +frame: X.Frame, +skip: Bool) -> Selection:
  match frame skip:
    case _ True{}: internal(state, Iteration{})
    case X.Frame{
      G.Bounded{G.Graph{+phase, _, _, _, _, _, _, _, _, _, _}, _},
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
    , _} False{}:
      phase_completion(state, phase)

def iteration_clock(+state: State, +config: Config) -> Selection:
  match config:
    case Config{_, _, _, _, +clock, _}: request(state, AwaitDeadline{}, T.ReadClock{clock})

def iteration(+state: State) -> Selection:
  match state:
    case State{_, _, _, _, _, _, 0n, _, +python}: no_unit(state)
    case State{+config, +frame, +targets, +ids, +target, +next_request, 1n+++remaining, _, +python}:
      iteration_clock(
        State{config, frame, targets, ids, target, next_request, remaining, Iteration{}, python},
        config
      )

def transaction_selection(+state: State, +selection: X.Selection) -> Selection:
  match selection:
    case X.Request{+transaction, +operation}: request(state, Transaction{transaction}, operation)
    case X.Continue{X.TransactionFinished{+frame}}: internal(
      with_frame(state, frame),
      AfterCommand{False{}}
    )
    case X.Continue{X.TransactionFailed{+frame, +failure}}: Rejected{
      with_frame(state, frame),
      failure
    }
    case X.Continue{X.TransactionExhausted{+frame}}: EvaluationExhausted{with_frame(state, frame)}
    case X.Continue{X.TransactionInvalid{+frame}}: InvariantFailed{with_frame(state, frame)}
    case X.Continue{+transaction}: internal(state, Transaction{transaction})

# Traverse only root-reachable semantic references. Detached rollback nodes
# are excluded. Mathematical evaluation exhaustion is an explicit result.
def omission_node(
  +found: Maybe<&2, F.Node>,
  +rest: List<&2, OmissionWork>
) -> Maybe<&2, List<&2, OmissionWork>>:
  match found:
    case None{}: None{}
    case Some{F.Node{_, _, +references}}: Some{OmissionReferences{references} <> rest}

def omission_step(
  +work: OmissionWork,
  +rest: List<&2, OmissionWork>,
  +nodes: List<&2, F.Node>
) -> Maybe<&2, List<&2, OmissionWork>>:
  match work:
    case OmissionAddress{+address}: omission_node(F.node_at(nodes, address), rest)
    case OmissionReferences{[]}: Some{rest}
    case OmissionReferences{F.Included{_, _} <> +tail}: Some{OmissionReferences{tail} <> rest}
    case OmissionReferences{F.Expanded{_, +child} <> +tail}:
      Some{OmissionAddress{child} <> OmissionReferences{tail} <> rest}
    case OmissionReferences{F.Omitted{_, _, _} <> _}: Some{[]}

def omission_found(+work: OmissionWork) -> Bool:
  match work:
    case OmissionReferences{F.Omitted{_, _, _} <> _}: True{}
    case _: False{}

def omission_next(
  +next: Maybe<&2, List<&2, OmissionWork>>,
  proceed: List<&2, OmissionWork> -> OmissionResult
) -> OmissionResult:
  match next:
    case None{}: OmissionInvalid{}
    case Some{+items}: proceed(items)

def omission_dispatch(
  +found: Bool,
  +next: Maybe<&2, List<&2, OmissionWork>>,
  proceed: List<&2, OmissionWork> -> OmissionResult
) -> OmissionResult:
  match found:
    case True{}: OmissionsObserved{True{}}
    case False{}: omission_next(next, proceed)

def omissions(
  +fuel: Nat,
  +work: List<&2, OmissionWork>,
  +nodes: List<&2, F.Node>
) -> OmissionResult:
  match fuel work:
    case _ Nil{}: OmissionsObserved{False{}}
    case 0n _: OmissionExhausted{}
    case 1n+++remaining +head <> +tail:
      omission_dispatch(omission_found(head), omission_step(head, tail, nodes),
        items => omissions(remaining, items, nodes))

def forest_omissions(+fuel: Nat, +forest: F.Forest) -> OmissionResult:
  match forest:
    case F.Forest{None{}, _}: OmissionInvalid{}
    case F.Forest{Some{+root}, +nodes}: omissions(fuel, [OmissionAddress{root}], nodes)

def completion_selected(
  +state: State,
  +product: ArtifactValue.ProductValue,
  +allowed: Bool
) -> Selection:
  match allowed:
    case False{}: no_unit(state)
    case True{}: request(state, AwaitCompletion{product}, T.EncodeProduct{product})

def completion_product(+state: State, +result: F.Materialization) -> Selection:
  match result:
    case F.MaterializationExhausted{}: EvaluationExhausted{state}
    case F.MaterializationInvalid{}: InvariantFailed{state}
    case F.Materialized{+product}: completion_selected(state, product, True{})

def materialize_unit(+fuel: Nat, +state: State, +frame: X.Frame) -> Selection:
  match frame:
    case X.Frame{_, _, +forest, _, _, _, _, _, _, _, +dependencies, fingerprint}:
      completion_product(state, F.prepared_unit(fuel, forest, dependencies, fingerprint))

def partial_omissions(
  +fuel: Nat,
  +state: State,
  +frame: X.Frame,
  +result: OmissionResult
) -> Selection:
  match result:
    case OmissionsObserved{False{}}: no_unit(state)
    case OmissionsObserved{True{}}: materialize_unit(fuel, state, frame)
    case OmissionExhausted{}: EvaluationExhausted{state}
    case OmissionInvalid{}: InvariantFailed{state}

def completion_observed(
  +observed: X.Frame,
  +fuel: Nat,
  +state: State,
  +partial: Maybe<&2, G.Reason>
) -> Selection:
  match observed partial:
    case _ None{}: materialize_unit(fuel, state, observed)
    case _ Some{G.Deadline{}}: no_unit(state)
    case _ Some{G.ProtocolViolation{}}: no_unit(state)
    case X.Frame{
      G.Bounded{G.Graph{_, _, _, 0n, _, _, _, _, _, _, _}, _},
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
    , _} Some{_}: no_unit(state)
    case X.Frame{_, _, +forest, _, _, _, _, _, _, _, _, _} Some{_}:
      partial_omissions(fuel, state, observed, forest_omissions(fuel, forest))

def completion(+fuel: Nat, +state: State, +partial: Maybe<&2, G.Reason>) -> Selection:
  completion_observed(frame(state), fuel, state, partial)

def consumed(-World: Data, +selection: Selection, +world: E.WorldState<World>) -> Progress<World>:
  match selection:
    case Internal{+state}: DriverReady{state, world}
    case Success{+state, +product}: DriverFinished{state, product, world}
    case EvaluationExhausted{+state}: DriverExhausted{state, world}
    case InvariantFailed{+state}: DriverInvalid{state, world}
    case Rejected{+state, +failure}: DriverFailed{state, failure, world}
    case Selected{+state, +operation}: DriverSelected{state, operation, world}
    case ChildBegin{state, command}: DriverChildBegin{state, command, world}
    case ChildResume{state, request, reply}: DriverChildResume{state, request, reply, world}

def validated(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    failure: Maybe<&2, T.TechnicalFailure>, state: State,
    outcome: T.ServiceOutcome, world: E.WorldState<World>) -> Progress<World>:
  match failure:
    case Some{failure}: DriverFailed{state, failure, world}
    case None{}: consumed(World, consume(state, outcome), world)

def delivered(~consume: State -> T.ServiceOutcome -> Selection, -World: Data,
    +request: T.Request, state: State, +reply: T.Reply,
    world: E.WorldState<World>) -> Progress<World>:
  match reply:
    case T.Reply{_, _, outcome}:
      validated(consume, World, Boundary.check(request, reply), state, outcome, world)
