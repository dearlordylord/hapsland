import Base
import ./Types.bend as EngineTypes
import ./Workload.bend as Workload
import ./AdviceeLifecycle.bend as AdviceeLifecycle
import ./Driver.bend as Driver
import ./Callbacks.bend as Callbacks
import ./OutputScenario.bend as OutputScenario
import ./CollectorScenario.bend as CollectorScenario
import ./CacheRuntime.bend as CacheRuntime
import ./Numeric.bend as Numeric
import ./TreeFacts.bend as TreeFacts
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ../agent-flow-bend/Ledger.bend as Ledger

# Public source-free consumer facts. Presentation concepts never enter this ABI.
type Advicee is Data:
  Advicee{identity: Nat, seed: Nat, profile: Maybe<&2,Workload.Profile>}
type OutputProfile is Data:
  OutputProfile{outcome: OutputScenario.Outcome, candidate_bytes: Maybe<&2,Nat>}
type Environment is Data:
  Environment{jev_delay: Nat, outcome: Maybe<&2, Canonical.RequestOutcome>, weights: List<&2, Numeric.Words>,
    preparation_delay: Nat, tree_profile: TreeFacts.Profile, graph_limits: ImportGraph.Limits,
    output_delay: Nat, output_lease: Nat, current_work: Bool, credential_ready: Bool,
    credential_generation: Nat, source_readable: Bool, advice_lifetime: Nat, output_profile: OutputProfile}
type Config is Data:
  Config{limits: Ledger.Limits, advicees: List<&2, Advicee>, environment: Environment, collectors: Maybe<&2,CollectorScenario.Profile>}
type Job is Data:
  Job{partition: Nat, lifetime: Nat, round: Nat, bytes: Nat, units: List<&2, Nat>,
    revision: Nat, repair: Bool, duration: Maybe<&2, Nat>, source_job: Maybe<&2,Driver.SourceJob>}
type StoredJob is Data:
  StoredJob{operation: Nat, job: Job}
type EmissionContext is Data:
  EmissionContext{context: Driver.Context, receipt: Maybe<&2,Driver.OutcomeReceipt>}
type Input is Data:
  Arrival{emission: Workload.Emission, activity: Nat}
  Edit{job: Job}
  Event{action: Driver.Action, job: Maybe<&2, Job>, context: Maybe<&2,EmissionContext>, source_job: Maybe<&2,Driver.SourceJob>}
  CacheFact{fact: CacheRuntime.Fact}
  FinishInput{action: Driver.Action, job: Job, attempt: Nat, context: Maybe<&2,EmissionContext>}
  GraphFact{key: EngineTypes.GraphKey, position: Nat, fact: ImportGraph.GraphEvent, limits: ImportGraph.Limits}
type Item is Data:
  Item{order: Nat, input: Input}
type Located is Data:
  Located{input: Maybe<&2, Input>, remaining: List<&2, Item>}
# Resident runtime excludes the observer history itself; frames retain that history.
# This prevents recursive snapshots of previous frame snapshots.
type IssuedRequest is Data:
  IssuedRequest{request: Nat, command: Canonical.Command}
type RetainedCallback is Data:
  RetainedCallback{order: Nat, issued_at: Nat, due_at: Nat, payload: Input, fact: Callbacks.Fact}
type HostFacts is Data:
  HostFacts{issued_requests: List<&2,IssuedRequest>, retained_callbacks: List<&2,RetainedCallback>, generator_partitions: List<&2,Nat>}
type RuntimeSnapshot is Data:
  RuntimeSnapshot{core: List<&2,EngineTypes.State>, items: List<&2,Item>, next: Nat, count: Nat,
    seed: Nat, environment: Environment, valid: Bool, jobs: List<&2,StoredJob>, host: HostFacts}
type PhysicalDelivery is Data:
  PhysicalDelivery{before: RuntimeSnapshot, after: RuntimeSnapshot, action: Maybe<&2,Driver.Action>}
type ConsumedInput is Data:
  ConsumedInput{order: Nat, input: Input, action_delay: Maybe<&2,Nat>}
type FrameDetails is Data:
  FrameDetails{before: RuntimeSnapshot, after: RuntimeSnapshot,
    prepared: List<&2,EmissionContext>, source: Maybe<&2,EmissionContext>, transition_after: List<&2,EngineTypes.State>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,PhysicalDelivery>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>, consumed: Maybe<&2,ConsumedInput>}
type Frame is Data:
  ProductFrame{sequence: Nat, time: Nat, event: Canonical.CanonicalEvent,
    before: List<&2, Canonical.State>, after: List<&2, Canonical.State>, commands: List<&2, Canonical.Command>, rejection: Maybe<&2, Canonical.Reason>, details: FrameDetails}
  GraphFrame{sequence: Nat, time: Nat, key: EngineTypes.GraphKey, position: Nat,
    fact: ImportGraph.GraphEvent, before: List<&2, ImportGraph.Bounded>, after: List<&2, ImportGraph.Bounded>, command: ImportGraph.Command, details: FrameDetails}
type State is Data:
  State{core: List<&2, EngineTypes.State>, items: List<&2, Item>, next: Nat, count: Nat,
    seed: Nat, environment: Environment, latest: List<&2, Frame>, valid: Bool, prepared: List<&2,EmissionContext>, jobs: List<&2,StoredJob>, host: HostFacts}
type Observation is Data:
  Observation{time: Nat, event_count: Nat, canonical: Canonical.State, latest: Maybe<&2, Frame>, queued: Nat, valid: Bool, runtime: RuntimeSnapshot}
type Step is Data:
  Step{state: State, frame: Maybe<&2, Frame>, physical: List<&2,PhysicalDelivery>}
type Advanced is Data:
  Advanced{state: State, frames: List<&2, Frame>, physical: List<&2,PhysicalDelivery>}
type Control is Data:
  OutputProfileControl{outcome: OutputScenario.Outcome, delay: Nat, lease: Nat}
  AdviceeLifecycleControl{identity: Nat, action: AdviceeLifecycle.Action}
  WorkloadControl{identity: Maybe<&2, Nat>, control: Workload.Control}
  JevProfile{delay: Nat, weights: List<&2, Numeric.Words>}
  EnvironmentControl{current_work: Bool, credential_ready: Bool, credential_generation: Nat, source_readable: Bool}
  JevDelay{delay: Nat}
type Controlled is Data:
  Controlled{state: State, applied: Bool}
