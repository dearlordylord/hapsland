import Base
import ./Types.bend as EngineTypes
import ./Engine.bend as Engine
import ./Workload.bend as Workload
import ./StopScenario.bend as StopScenario
import ./AdviceeLifecycle.bend as AdviceeLifecycle
import ./Driver.bend as Driver
import ./Callbacks.bend as Callbacks
import ./OutputScenario.bend as OutputScenario
import ./CollectorScenario.bend as CollectorScenario
import ./CacheRuntime.bend as CacheRuntime
import ./PreparationScenario.bend as PreparationScenario
import ./Numeric.bend as Numeric
import ./NativeGenerated.bend as NativeGenerated
import ./CollectionScenario.bend as CollectionScenario
import ./WriterScenario.bend as WriterScenario
import ./FreshnessScenario.bend as FreshnessScenario
import ./FaultTargets.bend as FaultTargets
import ./NoticeScenario.bend as NoticeScenario
import ./PermitScenario.bend as PermitScenario
import ./ExpiryScenario.bend as ExpiryScenario
import ./TreeFacts.bend as TreeFacts
import ./SharingScenario.bend as SharingScenario
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ../agent-flow-bend/Ledger.bend as Ledger

# Public source-free consumer facts. Presentation concepts never enter this ABI.
type Advicee is Data:
  Advicee{identity: Nat, seed: Nat, profile: Maybe<&2, Workload.Profile>}
type OutputProfile is Data:
  OutputProfile{outcome: OutputScenario.Outcome, candidate_bytes: Maybe<&2, Nat>}
type Environment is Data:
  Environment{
    jev_delay: Nat,
    outcome: Maybe<&2, Canonical.RequestOutcome>,
    weights: List<&2, Numeric.Words>,
    preparation_delay: Nat,
    tree_profile: TreeFacts.Profile,
    graph_limits: ImportGraph.Limits,
    output_delay: Nat,
    output_lease: Nat,
    current_work: Bool,
    credential_ready: Bool,
    credential_generation: Nat,
    source_readable: Bool,
    advice_lifetime: Nat,
    output_profile: OutputProfile
  }
type Config is Data:
  Config{
    limits: Ledger.Limits,
    advicees: List<&2, Advicee>,
    environment: Environment,
    collectors: Maybe<&2, CollectorScenario.Profile>
  }
type TreeCapture is Data:
  TreeCapture{
    identity: Nat,
    profile: TreeFacts.Profile,
    limits: ImportGraph.Limits,
    profile_label: Nat,
    limits_label: Nat
  }
type JobFacts is Data:
  JobFacts{
    freshness: Maybe<&2, FreshnessScenario.Source>,
    keys: List<&2, SharingScenario.SharingKey>,
    tree: Maybe<&2, TreeCapture>,
    tool: Maybe<&2, Nat>,
    permit_capture: Maybe<&2, PermitScenario.Capture>,
    origin: Nat,
    original: Maybe<&2, Workload.Emission>
  }
type Job is Data:
  Job{
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    bytes: Nat,
    units: List<&2, Nat>,
    revision: Nat,
    repair: Bool,
    duration: Maybe<&2, Nat>,
    source_job: Maybe<&2, Driver.SourceJob>,
    facts: List<&2, Maybe<&2, JobFacts>>
  }
type StoredJob is Data:
  StoredJob{operation: Nat, job: Job}
type EmissionContext is Data:
  EmissionContext{
    context: Driver.Context,
    receipt: Maybe<&2, Driver.OutcomeReceipt>,
    response: Maybe<&2, CollectionScenario.Identity>,
    writer: Bool
  }
type Input is Data:
  WriterPendingReleaseInput{action: Driver.Action, pending: WriterScenario.Pending}
  NoticeInput{
    action: Driver.Action,
    scope: NoticeScenario.Scope,
    diagnostic: Maybe<&2, String>,
    source_partition: Nat
  }
  ResponseInput{
    action: Driver.Action,
    target: Maybe<&2, CollectionScenario.Identity>,
    pending: Maybe<&2, WriterScenario.Pending>,
    writer: Bool
  }
  WriterReleaseInput{action: Driver.Action, receipt: WriterScenario.PhysicalRelease}
  CapturedEdit{job: Job, activity: Nat}
  StartFinish{partition: Nat, activity: Nat, recurring: Bool}
  RawEvent{action: Driver.Action, partition: Nat}
  Arrival{
    emission: Workload.Emission,
    activity: Nat,
    supplied_outcome: Maybe<&2, Canonical.RequestOutcome>
  }
  Event{
    action: Driver.Action,
    job: Maybe<&2, Job>,
    context: List<&2, Maybe<&2, EmissionContext>>,
    source_job: Maybe<&2, Driver.SourceJob>
  }
  CacheFact{fact: CacheRuntime.Fact, source_partition: Nat}
  FinishInput{
    action: Driver.Action,
    job: Job,
    attempt: Nat,
    context: List<&2, Maybe<&2, EmissionContext>>
  }
  GraphFact{
    key: EngineTypes.GraphKey,
    position: Nat,
    fact: ImportGraph.GraphEvent,
    limits: ImportGraph.Limits,
    generated: List<&2, Maybe<&2, PreparationScenario.Generated>>,
    tree: List<&2, Maybe<&2, TreeCapture>>
  }
type Item is Data:
  Item{order: Nat, input: Input, receipt: List<&2, Maybe<&2, Callbacks.Fact>>}
type Located is Data:
  Located{input: Maybe<&2, Input>, remaining: List<&2, Item>}
# Resident runtime excludes the observer history itself; frames retain that history.
# This prevents recursive snapshots of previous frame snapshots.
type IssuedRequest is Data:
  IssuedRequest{request: Nat, output: Canonical.Output}
type RetainedCallback is Data:
  RetainedCallback{order: Nat, issued_at: Nat, due_at: Nat, payload: Input, fact: Callbacks.Fact}
type PermitProfile is Data:
  PermitProfile{
    duration: Nat,
    lifetime: Nat,
    outcome: PermitScenario.PostOutcome,
    advicee_limit: Nat,
    resident_limit: Nat
  }
type RuntimeProfile is Data:
  RuntimeProfile{finish_deadline: Nat, next_tool: Nat, queue_takes: Nat,
    permit: Maybe<&2, PermitProfile>, expiry: ExpiryScenario.Profile,
    quiet_window: Maybe<&2, Nat>, reuse: Bool, tree_label: Nat, limits_label: Nat}
type DeliveryContinuation is Data:
  DeliveryContinuation{
    order: Nat,
    original: List<&2, Input>,
    payload: List<&2, Input>,
    receipt: Maybe<&2, Callbacks.Fact>
  }
type HostFacts is Data:
  HostFacts{
    issued_requests: List<&2, IssuedRequest>,
    retained_callbacks: List<&2, RetainedCallback>,
    generator_partitions: List<&2, Nat>,
    runtime: RuntimeProfile,
    generated: NativeGenerated.State,
    pending: List<&2, Maybe<&2, DeliveryContinuation>>
  }
type RuntimeSnapshot is Data:
  RuntimeSnapshot{core: List<&2, EngineTypes.State>, items: List<&2, Item>, next: Nat, count: Nat,
    seed: Nat, environment: Environment, valid: Bool, jobs: List<&2, StoredJob>, host: HostFacts}
type FinishRegistered is Data:
  FinishRegistered{finish: StopScenario.Finish, created: Bool}
type PhysicalDelivery is Data:
  PhysicalDelivery{
    before: RuntimeSnapshot,
    after: RuntimeSnapshot,
    action: Maybe<&2, Driver.Action>,
    fact: Maybe<&2, Callbacks.Fact>,
    consumed: Maybe<&2, ConsumedInput>,
    registration: Maybe<&2, FinishRegistered>
  }
type ConsumedInput is Data:
  ConsumedInput{order: Nat, input: Input, action_delay: Maybe<&2, Nat>}
type FrameDetails is Data:
  FrameDetails{
    before: RuntimeSnapshot,
    after: RuntimeSnapshot,
    prepared: List<&2, EmissionContext>,
    source: Maybe<&2, EmissionContext>,
    transition_after: List<&2, EngineTypes.State>,
    receipt: Maybe<&2, Callbacks.Fact>,
    physical: List<&2, PhysicalDelivery>,
    provided: Maybe<&2, Nat>,
    output_scopes: List<&2, Maybe<&2, Nat>>,
    consumed: Maybe<&2, ConsumedInput>,
    control_result: Maybe<&2, Engine.ResponseResult>
  }
type Frame is Data:
  ProductFrame{
    sequence: Nat,
    time: Nat,
    event: Canonical.CanonicalEvent,
    before: List<&2, Canonical.State>,
    after: List<&2, Canonical.State>,
    outputs: List<&2, Canonical.Output>,
    rejection: Maybe<&2, Canonical.Reason>,
    details: FrameDetails
  }
  GraphFrame{
    sequence: Nat,
    time: Nat,
    key: EngineTypes.GraphKey,
    position: Nat,
    fact: ImportGraph.GraphEvent,
    before: List<&2, ImportGraph.Bounded>,
    after: List<&2, ImportGraph.Bounded>,
    command: ImportGraph.Command,
    details: FrameDetails
  }
type State is Data:
  State{
    core: List<&2, EngineTypes.State>,
    items: List<&2, Item>,
    next: Nat,
    count: Nat,
    seed: Nat,
    environment: Environment,
    latest: List<&2, Frame>,
    valid: Bool,
    prepared: List<&2, EmissionContext>,
    jobs: List<&2, StoredJob>,
    host: HostFacts
  }
type Observation is Data:
  Observation{
    time: Nat,
    event_count: Nat,
    canonical: Canonical.State,
    latest: Maybe<&2, Frame>,
    queued: Nat,
    valid: Bool,
    runtime: RuntimeSnapshot
  }
type Step is Data:
  Step{state: State, frame: Maybe<&2, Frame>, physical: List<&2, PhysicalDelivery>}
type Advanced is Data:
  Advanced{state: State, frames: List<&2, Frame>, physical: List<&2, PhysicalDelivery>}
type AdvanceStatus is Data:
  ContinueAdvance{}
  AdvanceTimeLimit{}
  AdvanceEventLimit{}
  AdvanceIdle{}
type Control is Data:
  NoticeFailureControl{
    scope: NoticeScenario.Scope,
    key: Nat,
    sequence: Nat,
    diagnostic: Maybe<&2, String>
  }
  NoticeOwnedControl{scope: NoticeScenario.Scope, lease: Bool}
  NoticeCollectControl{
    scope: NoticeScenario.Scope,
    composed: Bool,
    authority_bound: Bool,
    allowed: List<&2, Nat>
  }
  ResponseOpenControl{response: CollectionScenario.Response}
  ResponseAttemptControl{target: CollectionScenario.Identity, current_block: Bool}
  ResponseCloseControl{target: CollectionScenario.Identity}
  WriterClaimControl{capture: WriterScenario.ClaimFacts}
  WriterAttemptControl{target: WriterScenario.Target, current_block: Bool}
  WriterReleaseControl{target: WriterScenario.Target, expire: Bool}
  SharingLeaveControl{target: FreshnessScenario.Scope}
  SharingLeaveAllControl{partition: Nat, lifetime: Nat}
  JevRequestControl{target: FaultTargets.Target, outcome: Canonical.RequestOutcome}
  ExpiryProfileControl{profile: ExpiryScenario.Profile}
  PermitProfileControl{duration: Nat, lifetime: Nat, outcome: PermitScenario.PostOutcome}
  PermitLimitsControl{advicee: Nat, resident: Nat}
  CallbackControl{
    target: Callbacks.Target,
    action: Callbacks.Control,
    historical_source: Maybe<&2, RetainedCallback>
  }
  OutputAttemptControl{
    target: Callbacks.Target,
    outcome: OutputScenario.Outcome,
    historical_source: Maybe<&2, RetainedCallback>
  }
  CredentialControl{available: Bool, rotate: Bool}
  FileTreesControl{profile: TreeFacts.Profile, identity: Nat}
  GraphLimitsControl{limits: ImportGraph.Limits, identity: Nat}
  JevOutcomeControl{delay: Nat, outcome: Canonical.RequestOutcome}
  OutputProfileControl{outcome: OutputScenario.Outcome, delay: Nat, lease: Nat}
  AdviceeLifecycleControl{identity: Nat, action: AdviceeLifecycle.Action}
  WorkloadControl{identity: Maybe<&2, Nat>, control: Workload.Control}
  JevProfile{delay: Nat, weights: List<&2, Numeric.Words>}
  EnvironmentControl{
    current_work: Bool,
    credential_ready: Bool,
    credential_generation: Nat,
    source_readable: Bool
  }
  JevDelay{delay: Nat}
type Controlled is Data:
  Controlled{state: State, applied: Bool}
