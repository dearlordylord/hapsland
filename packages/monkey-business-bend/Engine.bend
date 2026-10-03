import Base
import ./QuietScenario.bend as QuietScenario
import ./CollectionScenario.bend as CollectionScenario
import ./WriterScenario.bend as WriterScenario
import ./CacheRuntime.bend as CacheRuntime
import ./CacheScenario.bend as CacheScenario
import ./SharingRuntime.bend as SharingRuntime
import ./SharingScenario.bend as SharingScenario
import ./FreshnessContext.bend as FreshnessContext
import ./FreshnessScenario.bend as FreshnessScenario
import ./ScopedRevision.bend as ScopedRevision
import ./Callbacks.bend as Callbacks
import ./StopScenario.bend as StopScenario
import ./CollectorScenario.bend as CollectorScenario
import ./OutputScenario.bend as OutputScenario
import ./OutputCompletion.bend as OutputCompletion
import ./NoticeScenario.bend as NoticeScenario
import ./ExpiryScenario.bend as ExpiryScenario
import ./RuntimeScenarios.bend as RuntimeScenarios
import ./AdviceeLifecycle.bend as AdviceeLifecycle
import ./AdviceeLifecycleCleanup.bend as AdviceeLifecycleCleanup
import ./AdviceeActivity.bend as AdviceeActivity
import ./PermitScenario.bend as PermitScenario
import ./CredentialContext.bend as CredentialContext
import ./PendingEffects.bend as PendingEffects
import ./AdmissionAttempts.bend as AdmissionAttempts
import ./AdviceeScope.bend as AdviceeScope
import ./PreparationScenario.bend as PreparationScenario
import ./TreeFacts.bend as TreeFacts
import ./Advicees.bend as Advicees
import ./JevEffects.bend as JevEffects
import ./FaultTargets.bend as FaultTargets
import ./CredentialFacts.bend as CredentialFacts
import ./Types.bend as Types
import ./Preparation.bend as Preparation
import ./Driver.bend as Driver
import ./Scheduler.bend as Scheduler
import ./Postprocess.bend as Postprocess
import ./Workload.bend as Workload
import ./Random.bend as Random
import ./Numeric.bend as Numeric
import ./Session.bend as Session
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ../agent-flow-bend/Ledger.bend as Ledger
import ../agent-flow-bend/Dispatch.bend as Dispatch

type Transition is Data:
  Transition{state: Types.State, result: Canonical.Step}

type SharingDeparture is Data:
  SharingDeparture{state: Types.State, events: List<&2,Canonical.CanonicalEvent>, valid: Bool}

def initial(limits: Ledger.Limits) -> Types.State:
  Types.State{Canonical.initial(limits), Nil{}, Scheduler.initial(), Nil{}, Random.streams(1n), Advicees.initial(), CredentialFacts.initial(), Nil{}, Nil{}, Nil{}, Nil{}, Nil{}, RuntimeScenarios.initial()}

def captured_commands(commands: List<&2, Canonical.Command>, credentials: CredentialFacts.State) -> CredentialFacts.State:
  match commands:
    case Nil{}: credentials
    case Canonical.JevRequestIssued{_, _, _, operation, _} <> tail:
      captured_commands(tail, CredentialFacts.capture(credentials, operation))
    case _ <> tail: captured_commands(tail, credentials)

# Captures belong to retained Canonical work, including findings awaiting handoff.
# Historical settled operations no longer carry authorization authority.
def captured_work_present(+operation: Nat, work: List<&2, Canonical.Work>) -> Bool:
  match work:
    case Nil{}: False{}
    case Canonical.Work{_, _, _, candidate, _, _, _} <> tail:
      Nat.is_eq(operation, candidate) || captured_work_present(operation, tail)

def captured_request_present(+operation: Nat, requests: List<&2, Dispatch.Request>) -> Bool:
  match requests:
    case Nil{}: False{}
    case Dispatch.Request{_, _, _, candidate, _, _, _} <> tail:
      Nat.is_eq(operation, candidate) || captured_request_present(operation, tail)

def captured_authority_present(+operation: Nat, canonical: Canonical.State) -> Bool:
  match canonical:
    case Canonical.State{_, _, work, _, _, _, Dispatch.State{_, _, _, _, requests}, _, _}:
      captured_work_present(operation, work) || captured_request_present(operation, requests)

def retained_capture_pick(keep: Bool, item: CredentialFacts.Capture, remaining: List<&2, CredentialFacts.Capture>) -> List<&2, CredentialFacts.Capture>:
  match keep:
    case True{}: item <> remaining
    case False{}: remaining

def retained_captures(items: List<&2, CredentialFacts.Capture>, +canonical: Canonical.State) -> List<&2, CredentialFacts.Capture>:
  match items:
    case Nil{}: Nil{}
    case +item <> tail:
      match item:
        case CredentialFacts.Capture{operation, _}:
          retained_capture_pick(captured_authority_present(operation, canonical), item, retained_captures(tail, canonical))

def retained_credentials(credentials: CredentialFacts.State, canonical: Canonical.State) -> CredentialFacts.State:
  match credentials:
    case CredentialFacts.State{available, generation, issued}:
      CredentialFacts.State{available, generation, retained_captures(issued, canonical)}

def retained_retirement(keep: Bool, operation: Nat, tail: List<&2, Nat>) -> List<&2, Nat>:
  match keep:
    case True{}: operation <> tail
    case False{}: tail

def retained_retirements(pending: List<&2, Nat>, +work: List<&2, Canonical.Work>) -> List<&2, Nat>:
  match pending:
    case Nil{}: []
    case +operation <> tail: retained_retirement(captured_work_present(operation, work), operation, retained_retirements(tail, work))

def retirements(pending: List<&2, Nat>, canonical: Canonical.State) -> List<&2, Nat>:
  match canonical:
    case Canonical.State{_, _, work, _, _, _, _, _, _}: retained_retirements(pending, work)

def lifecycle_accepted(entries: List<&2, AdviceeLifecycle.Entry>, canonical: Canonical.State, event: Canonical.CanonicalEvent) -> List<&2, AdviceeLifecycle.Entry>:
  match event:
    case Canonical.OpenRound{partition, _}: AdviceeActivity.synchronize(entries, canonical, partition)
    case _: entries

# Cancellation releases logical work first, but the original PRE callback still
# owns its physical parent slot. Capture that tuple from the actual CancelWork
# command before Canonical's removed work disappears. Late delivery uses the
# existing factual preparation_actions path, including rejected logical results.
def preparation_capture_present(items: List<&2,AdviceeLifecycleCleanup.CapturedPreparation>, +capture: AdviceeLifecycleCleanup.CapturedPreparation) -> Bool:
  match items capture:
    case Nil{} _: False{}
    case AdviceeLifecycleCleanup.CapturedPreparation{p,l,r,o,parent} <> tail
      AdviceeLifecycleCleanup.CapturedPreparation{+cp,+cl,+cr,+co,+cparent}:
      (Nat.is_eq(p,cp) && Nat.is_eq(l,cl) && Nat.is_eq(r,cr) && Nat.is_eq(o,co) && Nat.is_eq(parent,cparent)) ||
        preparation_capture_present(tail,AdviceeLifecycleCleanup.CapturedPreparation{cp,cl,cr,co,cparent})

def preparation_capture_insert(present: Bool, capture: AdviceeLifecycleCleanup.CapturedPreparation, items: List<&2,AdviceeLifecycleCleanup.CapturedPreparation>) -> List<&2,AdviceeLifecycleCleanup.CapturedPreparation>:
  match present:
    case True{}: items
    case False{}: List.append(&2,AdviceeLifecycleCleanup.CapturedPreparation,items,[capture])

def canceled_preparation_parent(parent_valid: Bool, +capture: AdviceeLifecycleCleanup.CapturedPreparation, +items: List<&2,AdviceeLifecycleCleanup.CapturedPreparation>) -> List<&2,AdviceeLifecycleCleanup.CapturedPreparation>:
  match parent_valid:
    case False{}: items
    case True{}: preparation_capture_insert(preparation_capture_present(items,capture),capture,items)

def canceled_preparation(found: Maybe<&2,Canonical.Work>, items: List<&2,AdviceeLifecycleCleanup.CapturedPreparation>) -> List<&2,AdviceeLifecycleCleanup.CapturedPreparation>:
  match found:
    case Some{Canonical.Work{p,l,r,o,_,Canonical.Preparing{},+parent}}:
      canceled_preparation_parent(Nat.is_gt(parent,0n),AdviceeLifecycleCleanup.CapturedPreparation{p,l,r,o,parent},items)
    case _: items

def cancellation_preparations(commands: List<&2,Canonical.Command>, +work: List<&2,Canonical.Work>, items: List<&2,AdviceeLifecycleCleanup.CapturedPreparation>) -> List<&2,AdviceeLifecycleCleanup.CapturedPreparation>:
  match commands:
    case Nil{}: items
    case Canonical.CancelWork{operation} <> tail:
      cancellation_preparations(tail,work,canceled_preparation(Driver.find_operation(work,operation),items))
    case _ <> tail: cancellation_preparations(tail,work,items)

def settle(+before: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, result: Canonical.Step, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, scenarios: RuntimeScenarios.State, +event: Canonical.CanonicalEvent) -> Transition:
  match result:
    case Canonical.Advanced{+state, +commands}: Transition{Types.State{state, Preparation.retained(graphs, state), scheduler, workloads, random, advicees, retained_credentials(captured_commands(commands, credentials), state), AdmissionAttempts.consumed(opening, event), retirements(PendingEffects.consumed(retiring, event), state), lifecycle_accepted(lifecycles, state, event), cancellation_preparations(commands,Driver.work_list(before),preparations), activity_scopes, RuntimeScenarios.accepted(scenarios,before,state,event,commands)}, Canonical.Advanced{state, commands}}
    case Canonical.Rejected{+state, +reason}: Transition{Types.State{state, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}, Canonical.Rejected{state, reason}}

def step(state: Types.State, +event: Canonical.CanonicalEvent) -> Transition:
  match state:
    case Types.State{+canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}: settle(canonical, graphs, scheduler, workloads, random, Canonical.step(canonical, event), advicees, credentials, opening, retiring, lifecycles, AdviceeLifecycleCleanup.remaining_preparations(preparations, event), activity_scopes, scenarios, event)

def canonical(state: Types.State) -> Canonical.State:
  match state:
    case Types.State{canonical, _, _, _, _, _, _, _, _, _, _, _, _}: canonical

def graph_step(state: Types.State, key: Types.GraphKey, position: Nat, limits: ImportGraph.Limits, event: ImportGraph.GraphEvent) -> Types.GraphTransition:
  Preparation.step(state, key, position, limits, event)

def credential_state(state: Types.State) -> CredentialFacts.State:
  match state:
    case Types.State{_, _, _, _, _, _, credentials, _, _, _, _, _, _}: credentials

def freshness_state(state: Types.State) -> FreshnessScenario.State:
  match state:
    case Types.State{_,_,_,_,_,_,_,_,_,_,_,_,scenarios}: RuntimeScenarios.freshness(scenarios)

def cached_review_work(found: Maybe<&2,Canonical.Work>) -> Bool:
  match found:
    case Some{Canonical.Work{_,_,_,_,_,Canonical.Reviewing{},_}}: True{}
    case _: False{}

def cached_review_owned(+state: Types.State, +scope: FreshnessScenario.Scope) -> Bool:
  match scope:
    case FreshnessScenario.Scope{p,l,r,o}:
      cached_review_work(Canonical.find_work(p,l,r,o,Driver.work_list(canonical(state)))) && CacheRuntime.current_found(FreshnessScenario.current(freshness_state(state),canonical(state),scope))

def cached_review_handled(scope: FreshnessScenario.Scope, allowed: Bool) -> Driver.Handled:
  match scope allowed:
    case FreshnessScenario.Scope{+p,+l,+r,+o} True{}:
      Driver.Handled{True{},[Driver.immediate(Canonical.StartReview{p,l,r,o},False{}),Driver.immediate(Canonical.ReviewObserved{p,l,r,o,Canonical.Finding{},True{}},False{})]}
    case _ False{}: Driver.Handled{True{},[]}

def handle_cached(+state: Types.State, +event: Canonical.CanonicalEvent, command: Canonical.Command, context: Driver.Context, found: Maybe<&2,FreshnessScenario.Scope>) -> Driver.Handled:
  match found:
    case Some{+scope}: cached_review_handled(scope,cached_review_owned(state,scope))
    case None{}: Driver.handle(canonical(state),event,command,FreshnessContext.apply(freshness_state(state),canonical(state),event,CredentialContext.apply(credential_state(state),event,context)))

def scenarios(state: Types.State) -> RuntimeScenarios.State:
  match state:
    case Types.State{_, _, _, _, _, _, _, _, _, _, _, _, scenarios}: scenarios

def handle_output(+state: Types.State, +event: Canonical.CanonicalEvent, +command: Canonical.Command, context: Driver.Context) -> Driver.Handled:
  match command:
    case Canonical.SubmissionExpired{}: Driver.Handled{True{},OutputCompletion.feedback(command,event)}
    case command: handle_cached(state,event,command,context,SharingRuntime.cached_review(RuntimeScenarios.sharing(scenarios(state)),command))

def handle(+state: Types.State, +event: Canonical.CanonicalEvent, +command: Canonical.Command, +context: Driver.Context) -> Driver.Handled:
  WriterScenario.handled(RuntimeScenarios.writers(scenarios(state)),command,context,CollectionScenario.handled(RuntimeScenarios.collection(scenarios(state)),command,context,handle_output(state,event,command,WriterScenario.driver_context(RuntimeScenarios.writers(scenarios(state)),CollectionScenario.driver_context(RuntimeScenarios.collection(scenarios(state)),context,False{})))))

def edit(state: Types.State, partition: Nat, lifetime: Nat) -> Driver.EditPlan:
  Driver.edit(canonical(state), partition, lifetime)

def preparation_completed(partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit_bytes: List<&2, Nat>, delay: Nat) -> Driver.Action:
  Driver.preparation_completed(partition, lifetime, round, operation, unit_bytes, delay)

def preparation_running(state: Canonical.State) -> List<&2,Dispatch.Entry>:
  match state:
    case Canonical.State{_,_,_,_,_,_,Dispatch.State{_,running,_,_,_},_,_}: running

def sharing_runtime(state: Types.State) -> SharingRuntime.State:
  match state:
    case Types.State{_,_,_,_,_,_,_,_,_,_,_,_,scenarios}: RuntimeScenarios.sharing(scenarios)

def sharing_actions(events: List<&2,Canonical.CanonicalEvent>) -> List<&2,Driver.Action>:
  match events:
    case Nil{}: []
    case event <> tail: Driver.immediate(event,False{}) <> sharing_actions(tail)

def after(+before: Types.State, +state: Types.State, +event: Canonical.CanonicalEvent) -> List<&2, Driver.Action>:
  match before:
    case Types.State{+previous, _, _, _, _, _, _, _, _, _, captures, _, scenarios}:
      List.append(&2, Driver.Action,
        sharing_actions(SharingRuntime.postprocess(RuntimeScenarios.sharing(scenarios),sharing_runtime(state),previous,canonical(state),freshness_state(state),event)),
        List.append(&2, Driver.Action, WriterScenario.departure_actions(WriterScenario.retired(RuntimeScenarios.writers(scenarios),previous,canonical(state),event),RuntimeScenarios.collection(scenarios)),List.append(&2, Driver.Action, Postprocess.actions(previous, canonical(state), event), AdviceeLifecycleCleanup.preparation_actions(captures, preparation_running(previous), event))))

type Taken is Data:
  Taken{state: Types.State, entry: Maybe<&2, Scheduler.Entry>}

def enqueue(state: Types.State, at: Nat, order: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}: Types.State{canonical, graphs, Scheduler.enqueue(scheduler, at, order), workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}

def take_result(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, workloads: List<&2, Workload.Advicee>, random: Random.State, taken: Scheduler.Taken, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, scenarios: RuntimeScenarios.State) -> Taken:
  match taken:
    case Scheduler.Taken{scheduler, entry}: Taken{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}, entry}

def take(state: Types.State) -> Taken:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}: take_result(canonical, graphs, workloads, random, Scheduler.take(scheduler), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios)

def queued(state: Types.State) -> List<&2, Scheduler.Entry>:
  match state:
    case Types.State{_, _, scheduler, _, _, _, _, _, _, _, _, _, _}: Scheduler.entries(scheduler)

def cancel(state: Types.State, order: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}: Types.State{canonical, graphs, Scheduler.cancel(scheduler, order), workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}

def fence(+state: Types.State, +event: Canonical.CanonicalEvent, generated: Bool, context: Driver.Context) -> Canonical.CanonicalEvent:
  Driver.fence(canonical(state), event, generated, FreshnessContext.apply(freshness_state(state),canonical(state),event,CredentialContext.apply(credential_state(state), event, context)))

def preparation_fact_time(delay: Nat, index: Nat, count: Nat) -> Nat:
  Driver.fact_time(delay, index, count)

def revalidate(+state: Types.State, +context: Driver.Context) -> List<&2, Driver.Action>:
  CollectionScenario.revalidated(Driver.revalidate(canonical(state), context),RuntimeScenarios.collection(scenarios(state)),context)

def clock(state: Types.State) -> Nat:
  match state:
    case Types.State{_, _, scheduler, _, _, _, _, _, _, _, _, _, _}: Scheduler.clock(scheduler)

def configure_seed(state: Types.State, seed: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, _, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}: Types.State{canonical, graphs, scheduler, workloads, Random.streams(seed), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}

def configure_workload(state: Types.State, partition: Nat, profile: Workload.Profile) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}: Types.State{canonical, graphs, scheduler, Workload.configure(workloads, partition, profile), random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}

type WorkloadTransition is Data:
  WorkloadTransition{state: Types.State, events: List<&2, Workload.Emission>, valid: Bool}

def workload_changed(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, random: Random.State, changed: Workload.Changed, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, scenarios: RuntimeScenarios.State) -> WorkloadTransition:
  match changed:
    case Workload.Changed{workloads, events, valid}: WorkloadTransition{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}, events, valid}

def workload_action(state: Types.State, partition: Nat, action: Workload.Action) -> WorkloadTransition:
  match state:
    case Types.State{canonical, graphs, +scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}: workload_changed(canonical, graphs, scheduler, random, Workload.run(workloads, partition, Scheduler.clock(scheduler), action), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios)

def workload_valid(state: Types.State, partition: Nat, generation: Nat, recurring: Bool) -> Bool:
  match state:
    case Types.State{_, _, _, workloads, _, _, _, _, _, _, _, _, _}: Workload.valid(workloads, partition, generation, recurring)

def workload_present(found: Maybe<&2,Workload.Advicee>) -> Bool:
  match found:
    case Some{_}: True{}
    case None{}: False{}

# Factual configured Background membership; Canonical still owns admission.
def workload_configured(state: Types.State, partition: Nat) -> Bool:
  match state:
    case Types.State{_,_,_,workloads,_,_,_,_,_,_,_,_,_}: workload_present(Workload.find(workloads,partition))

def workload_duration(state: Types.State, partition: Nat, fallback: Nat) -> Nat:
  match state:
    case Types.State{_, _, _, workloads, _, _, _, _, _, _, _, _, _}: Workload.duration(workloads, partition, fallback)

type OutcomeTransition is Data:
  OutcomeTransition{state: Types.State, outcome: Nat}

def sampled_outcome(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, streams: Random.State, sample: Random.Sampled, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, scenarios: RuntimeScenarios.State) -> OutcomeTransition:
  match sample:
    case Random.Sampled{random, outcome}: OutcomeTransition{Types.State{canonical, graphs, scheduler, workloads, Random.set_outcomes(streams, random), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}, outcome}

def sample_outcome(state: Types.State, weights: List<&2, Numeric.Words>) -> OutcomeTransition:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, +random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}: sampled_outcome(canonical, graphs, scheduler, workloads, random, Random.sample(Random.outcomes(random), weights), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios)

def numeric_add(a: Numeric.Words, b: Numeric.Words) -> Numeric.Words:
  Numeric.plus(a, b)

def numeric_divide(a: Numeric.Words, b: Numeric.Words) -> Numeric.Words:
  Numeric.divide(a, b)

def random_initial(seed: Nat) -> U32:
  Random.initial(seed)

def random_sample(random: U32, weights: List<&2, Numeric.Words>) -> Random.Sampled:
  Random.sample(random, weights)

def session_initial(settings: Session.Config, seed: U32, codes: List<&2, U32>, bytes: Nat, units: List<&2, Nat>) -> Session.State:
  Session.initial(settings, seed, codes, bytes, units)

def session_next(settings: Session.Config, stream: Session.State) -> Session.Transition:
  Session.next(settings, stream)

def session_generation(stream: Session.State) -> Nat:
  Session.state_generation(stream)

def session_sizes(stream: Session.State, bytes: Nat, units: List<&2, Nat>) -> Session.State:
  Session.sizes(stream, bytes, units)

def session_burst(count: Nat, stream: Session.State) -> Session.Transition:
  Session.burst(count, stream)

def session_interval(settings: Session.Config, interval: U32) -> Session.Config:
  Session.set_interval(settings, interval)

def session_rewind(settings: Session.Config, stream: Session.State) -> Session.Transition:
  Session.rewind(settings, stream)

def session_suspend(settings: Session.Config, stream: Session.State, suspended: Bool) -> Session.Transition:
  Session.suspend(settings, stream, suspended)

def session_finish(stream: Session.State, continuation: Bool) -> Session.State:
  Session.finish_state(stream, continuation)

def session_advice(settings: Session.Config, stream: Session.State) -> Session.Transition:
  Session.on_advice(settings, stream)

def pre_timing(state: Types.State, partition: Nat, provided: Maybe<&2, Nat>, fallback: Nat, lifetime: Nat) -> Workload.PreTiming:
  match state:
    case Types.State{_, _, scheduler, workloads, _, _, _, _, _, _, _, _, _}: Workload.pre_timing(workloads, partition, Scheduler.clock(scheduler), provided, fallback, lifetime)

def session_delay(settings: Session.Config, random: U32) -> U32:
  Session.sample_delay(settings, random)

# Explicit intervention changes future simulated callbacks, never product state.
def intervene_request(state: Types.State, target: FaultTargets.Target, outcome: Canonical.RequestOutcome, delay: Nat) -> JevEffects.Intervention:
  JevEffects.intervene(FaultTargets.request(canonical(state), target), outcome, delay)

def credential_initial() -> CredentialFacts.State:
  CredentialFacts.initial()

def credential_availability(state: CredentialFacts.State, available: Bool) -> CredentialFacts.State:
  CredentialFacts.availability(state, available)

def credential_rotate(state: CredentialFacts.State) -> CredentialFacts.State:
  CredentialFacts.rotate(state)

def credential_authorized(state: CredentialFacts.State, issued_generation: Nat) -> Bool:
  CredentialFacts.authorized(state, issued_generation)

type AdviceeDeclared is Data:
  AdviceeDeclared{state: Types.State, scope: Maybe<&2, Advicees.Scope>, valid: Bool}

def declared_lifecycle(entries: List<&2, AdviceeLifecycle.Entry>, scope: Maybe<&2, Advicees.Scope>) -> List<&2, AdviceeLifecycle.Entry>:
  match scope:
    case None{}: entries
    case Some{Advicees.Scope{_, partition, _}}: AdviceeLifecycle.register(entries, partition)

def declared_activity(scopes: List<&2, AdviceeActivity.Scope>, scope: Maybe<&2, Advicees.Scope>) -> List<&2, AdviceeActivity.Scope>:
  match scope:
    case None{}: scopes
    case Some{Advicees.Scope{_, partition, _}}: AdviceeActivity.register(scopes, partition)

def declared_state(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, credentials: CredentialFacts.State, declared: Advicees.Declared, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, scenarios: RuntimeScenarios.State) -> AdviceeDeclared:
  match declared:
    case Advicees.Declared{advicees, +scope, valid}:
      AdviceeDeclared{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, declared_lifecycle(lifecycles, scope), preparations, declared_activity(activity_scopes, scope), scenarios}, scope, valid}

def declare_advicee(state: Types.State, identity: Nat, seed: U32) -> AdviceeDeclared:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}:
      declared_state(canonical, graphs, scheduler, workloads, random, credentials, Advicees.declare(advicees, identity, seed), opening, retiring, lifecycles, preparations, activity_scopes, scenarios)

def advicee_identity(state: Types.State, identity: Nat) -> Maybe<&2, Advicees.Scope>:
  match state:
    case Types.State{_, _, _, _, _, advicees, _, _, _, _, _, _, _}: Advicees.lookup_identity(advicees, identity)

def advicee_partition(state: Types.State, partition: Nat) -> Maybe<&2, Advicees.Scope>:
  match state:
    case Types.State{_, _, _, _, _, advicees, _, _, _, _, _, _, _}: Advicees.lookup_partition(advicees, partition)

def advicee_targets(state: Types.State, identity: Maybe<&2, Nat>) -> Advicees.Targeted:
  match state:
    case Types.State{_, _, _, _, _, advicees, _, _, _, _, _, _, _}: Advicees.targets(advicees, identity)

def credentials(state: Types.State) -> CredentialFacts.State:
  match state:
    case Types.State{_, _, _, _, _, _, credentials, _, _, _, _, _, _}: credentials

def configure_credentials(state: Types.State, available: Bool, generation: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}:
      Types.State{canonical, graphs, scheduler, workloads, random, advicees, CredentialFacts.configure(credentials, available, generation), opening, retiring, lifecycles, preparations, activity_scopes, scenarios}

def changed_credentials(credentials: CredentialFacts.State, available: Bool, rotation: Bool) -> CredentialFacts.State:
  match rotation:
    case True{}: CredentialFacts.rotate(credentials)
    case False{}: CredentialFacts.availability(credentials, available)

def credential_action(state: Types.State, available: Bool, rotation: Bool) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}:
      Types.State{canonical, graphs, scheduler, workloads, random, advicees, changed_credentials(credentials, available, rotation), opening, retiring, lifecycles, preparations, activity_scopes, scenarios}

def generate_tree(seed: Nat, operation: Nat, unit: Nat, profile: TreeFacts.Profile, limits: ImportGraph.Limits) -> PreparationScenario.Generated:
  PreparationScenario.generate(seed, operation, unit, profile, limits)

def scope_event(before: Types.State, after: Types.State, event: Canonical.CanonicalEvent, provided: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  AdviceeScope.event(canonical(before), canonical(after), event, provided)

def scope_command(before: Types.State, after: Types.State, command: Canonical.Command, provided: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  AdviceeScope.command(canonical(before), canonical(after), command, provided)

def scope_select(bindings: List<&2, AdviceeScope.Binding>, partition: Nat) -> List<&2, Nat>:
  AdviceeScope.select(bindings, partition)

type EditAttempt is Data:
  EditAttempt{state: Types.State, plan: Driver.EditPlan}

def attempted_edit(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, advicees: Advicees.Registry, credentials: CredentialFacts.State, attempt: AdmissionAttempts.Attempt, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, scenarios: RuntimeScenarios.State) -> EditAttempt:
  match attempt:
    case AdmissionAttempts.Attempt{opening, plan}:
      EditAttempt{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}, plan}

def edit_attempt(state: Types.State, +partition: Nat, lifetime: Nat) -> EditAttempt:
  match state:
    case Types.State{+canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}:
      attempted_edit(canonical, graphs, scheduler, workloads, random, advicees, credentials, AdmissionAttempts.edit(canonical, opening, partition, lifetime), retiring, lifecycles, preparations, activity_scopes, scenarios)

type IssuedActions is Data:
  IssuedActions{state: Types.State, actions: List<&2, Driver.Action>}

def issued_effects(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, issued: PendingEffects.Issued, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, scenarios: RuntimeScenarios.State) -> IssuedActions:
  match issued:
    case PendingEffects.Issued{retiring, actions}:
      IssuedActions{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}, actions}

def issue_actions(state: Types.State, actions: List<&2, Driver.Action>) -> IssuedActions:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}:
      issued_effects(canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, PendingEffects.issue(retiring, actions), lifecycles, preparations, activity_scopes, scenarios)

def credential_captured(state: Types.State, operation: Nat) -> Maybe<&2, Nat>:
  CredentialFacts.captured(credentials(state), operation)

def credential_matches(state: Types.State, operation: Nat) -> Bool:
  CredentialFacts.matches(credentials(state), operation)

def callback_matches(event: Canonical.CanonicalEvent, target: FaultTargets.Target) -> Bool:
  FaultTargets.callback(event, target)

def context_credentials(state: Types.State, event: Canonical.CanonicalEvent, context: Driver.Context) -> Driver.Context:
  CredentialContext.apply(credential_state(state), event, context)

def preparation_active(state: Types.State, partition: Nat, lifetime: Nat, round: Nat, operation: Nat) -> Bool:
  Preparation.active(canonical(state), partition, lifetime, round, operation)

def lifecycle_entries(state: Types.State) -> List<&2, AdviceeLifecycle.Entry>:
  match state:
    case Types.State{_, _, _, _, _, _, _, _, _, lifecycles, _, _, _}: lifecycles

def lifecycle_entry(state: Types.State, partition: Nat) -> Maybe<&2, AdviceeLifecycle.Entry>:
  AdviceeLifecycle.lookup(lifecycle_entries(state), partition)

def activity_scope(state: Types.State, partition: Nat) -> Maybe<&2, Nat>:
  match state:
    case Types.State{_, _, _, _, _, _, _, _, _, _, _, scopes, scenarios}: AdviceeActivity.lookup(scopes, partition)

def activity_valid(state: Types.State, partition: Nat, incarnation: Nat) -> Bool:
  match state:
    case Types.State{_, _, _, _, _, _, _, _, _, entries, _, scopes, scenarios}: AdviceeActivity.valid(scopes, entries, partition, incarnation)

def activity_lifetime(state: Types.State, partition: Nat) -> Nat:
  match state:
    case Types.State{canonical, _, _, _, _, _, _, _, _, entries, _, _, _}: AdviceeActivity.lifetime(canonical, entries, partition)

def inactive_edit(state: Types.State) -> EditAttempt:
  EditAttempt{state, Driver.EditPlan{False{}, []}}

def activity_edit_valid(valid: Bool, +state: Types.State, +partition: Nat) -> EditAttempt:
  match valid:
    case True{}: edit_attempt(state, partition, activity_lifetime(state, partition))
    case False{}: inactive_edit(state)

def activity_edit(+state: Types.State, +partition: Nat, incarnation: Nat) -> EditAttempt:
  activity_edit_valid(activity_valid(state, partition, incarnation), state, partition)

# Only generated activity starts use the private arrival fence. Original physical
# completions, POST and retirement facts still reach their actual Canonical tuple.
def activity_start(event: Canonical.CanonicalEvent) -> Bool:
  match event:
    case Canonical.OpenRound{_, _}: True{}
    case Canonical.AdmitObservation{_, _, _}: True{}
    case Canonical.StartObservation{_, _, _, _}: True{}
    case Canonical.BeginPreparation{_, _, _, _}: True{}
    case Canonical.BeginObservedPreparation{_, _, _, _, _}: True{}
    case Canonical.IssuePermit{_, _, _, _, _, _, _, _}: True{}
    case _: False{}

def activity_event_valid(state: Types.State, event: Canonical.CanonicalEvent, partition: Nat, incarnation: Nat) -> Bool:
  Bool.not(activity_start(event)) || activity_valid(state, partition, incarnation)

type LifecycleTransition is Data:
  LifecycleTransition{state: Types.State, changed: AdviceeLifecycle.Changed, cleanup: AdviceeLifecycleCleanup.CleanupPlan, events: List<&2, Workload.Emission>}

def lifecycle_resumed(previous: Maybe<&2, AdviceeLifecycle.Entry>, current: Maybe<&2, AdviceeLifecycle.Entry>) -> Bool:
  match previous current:
    case Some{previous} Some{current}: Bool.not(AdviceeLifecycle.entry_active(previous)) && AdviceeLifecycle.entry_active(current)
    case _ _: False{}

def lifecycle_changed_activity(valid: Bool, previous: Maybe<&2, AdviceeLifecycle.Entry>, current: Maybe<&2, AdviceeLifecycle.Entry>) -> Bool:
  match previous current:
    case Some{+previous} Some{+current}: valid && ((AdviceeLifecycle.entry_active(previous) && Bool.not(AdviceeLifecycle.entry_active(current))) || (Bool.not(AdviceeLifecycle.entry_active(previous)) && AdviceeLifecycle.entry_active(current)))
    case _ _: False{}

def lifecycle_scopes(resumed: Bool, scopes: List<&2, AdviceeActivity.Scope>, partition: Nat) -> List<&2, AdviceeActivity.Scope>:
  match resumed:
    case True{}: AdviceeActivity.resumed(scopes, partition)
    case False{}: scopes

def lifecycle_opening(changed: Bool, opening: List<&2, Nat>, partition: Nat) -> List<&2, Nat>:
  match changed:
    case True{}: AdmissionAttempts.remove(opening, partition)
    case False{}: opening

def lifecycle_workload(changed: Bool, +state: Types.State, partition: Nat, current: Maybe<&2, AdviceeLifecycle.Entry>) -> WorkloadTransition:
  match changed current:
    case True{} Some{entry}: workload_action(state, partition, Workload.Controlled{Workload.Suspend{Bool.not(AdviceeLifecycle.entry_active(entry))}})
    case _ _: WorkloadTransition{state, [], True{}}

def lifecycle_installed(transition: WorkloadTransition, +changed: AdviceeLifecycle.Changed, +cleanup: AdviceeLifecycleCleanup.CleanupPlan, +partition: Nat) -> LifecycleTransition:
  match transition changed cleanup:
    case WorkloadTransition{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, _, captures, scopes, scenarios}, events, _} AdviceeLifecycle.Changed{+entries, +previous, +current, +valid} AdviceeLifecycleCleanup.CleanupPlan{actions, operations, +preparations}:
      LifecycleTransition{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, lifecycle_opening(lifecycle_changed_activity(valid, previous, current), opening, partition), retiring, entries, List.append(&2, AdviceeLifecycleCleanup.CapturedPreparation, captures, preparations), lifecycle_scopes(valid && lifecycle_resumed(previous, current), scopes, partition), scenarios}, AdviceeLifecycle.Changed{entries, previous, current, valid}, AdviceeLifecycleCleanup.CleanupPlan{actions, operations, preparations}, events}

def lifecycle_changed(+state: Types.State, +partition: Nat, +changed: AdviceeLifecycle.Changed) -> LifecycleTransition:
  match changed:
    case AdviceeLifecycle.Changed{+entries, +previous, +current, +valid}:
      lifecycle_installed(lifecycle_workload(lifecycle_changed_activity(valid, previous, current), state, partition, current), AdviceeLifecycle.Changed{entries, previous, current, valid}, AdviceeLifecycleCleanup.plan(canonical(state), AdviceeLifecycle.Changed{entries, previous, current, valid}, clock(state)), partition)

def lifecycle_resume(valid: Bool, +entries: List<&2, AdviceeLifecycle.Entry>, +partition: Nat) -> AdviceeLifecycle.Changed:
  match valid:
    case True{}: AdviceeLifecycle.change(entries, partition, AdviceeLifecycle.Resume{})
    case False{}: AdviceeLifecycle.Changed{entries, AdviceeLifecycle.lookup(entries, partition), AdviceeLifecycle.lookup(entries, partition), False{}}

def lifecycle_requested(entries: List<&2, AdviceeLifecycle.Entry>, partition: Nat, action: AdviceeLifecycle.Action, scope: Maybe<&2, Nat>) -> AdviceeLifecycle.Changed:
  match action:
    case AdviceeLifecycle.Resume{}: lifecycle_resume(AdviceeActivity.resumable(scope), entries, partition)
    case _: AdviceeLifecycle.change(entries, partition, action)

def departed_cache_scope(previous: Maybe<&2,AdviceeLifecycle.Entry>, current: Maybe<&2,AdviceeLifecycle.Entry>, valid: Bool) -> Maybe<&2,FreshnessScenario.Scope>:
  match previous current valid:
    case Some{AdviceeLifecycle.Entry{_,_,AdviceeLifecycle.Removed{}}} _ _: None{}
    case Some{AdviceeLifecycle.Entry{p,l,AdviceeLifecycle.Active{}}} Some{AdviceeLifecycle.Entry{_,_,AdviceeLifecycle.Disconnected{}}} True{}: Some{FreshnessScenario.Scope{p,l,0n,0n}}
    case Some{AdviceeLifecycle.Entry{p,l,_}} Some{AdviceeLifecycle.Entry{_,_,AdviceeLifecycle.Removed{}}} True{}: Some{FreshnessScenario.Scope{p,l,0n,0n}}
    case _ _ _: None{}

def cache_release_actions(events: List<&2,Canonical.CanonicalEvent>) -> List<&2,Driver.Action>:
  match events:
    case Nil{}: []
    case event <> tail: Driver.immediate(event,False{}) <> cache_release_actions(tail)

def with_scenarios(state: Types.State, scenarios: RuntimeScenarios.State) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, _}:
      Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}

def with_cache_runtime(+state: Types.State, cache: CacheRuntime.State) -> Types.State:
  with_scenarios(state,RuntimeScenarios.with_cache(scenarios(state),cache))

def lifecycle_cache_published(transition: LifecycleTransition, partition: Nat, feedback: CacheRuntime.Feedback) -> LifecycleTransition:
  match transition feedback:
    case LifecycleTransition{state,changed,AdviceeLifecycleCleanup.CleanupPlan{actions,operations,preparations},events} CacheRuntime.Feedback{cache,releases}:
      LifecycleTransition{with_cache_runtime(state,cache),changed,AdviceeLifecycleCleanup.CleanupPlan{List.append(&2,Driver.Action,Driver.immediate(Canonical.CacheDiscardPartition{partition},False{}) <> cache_release_actions(releases),actions),operations,preparations},events}

def cache_runtime(state: Types.State) -> CacheRuntime.State:
  RuntimeScenarios.cache(scenarios(state))

def lifecycle_sharing_departed(transition: LifecycleTransition, departure: SharingDeparture) -> LifecycleTransition:
  match transition departure:
    case LifecycleTransition{_,changed,AdviceeLifecycleCleanup.CleanupPlan{actions,operations,preparations},events} SharingDeparture{state,release,_}:
      LifecycleTransition{state,changed,AdviceeLifecycleCleanup.CleanupPlan{List.append(&2,Driver.Action,cache_release_actions(release),actions),operations,preparations},events}

def with_sharing_runtime(+state: Types.State, sharing: SharingRuntime.State) -> Types.State:
  with_scenarios(state,RuntimeScenarios.with_sharing(scenarios(state),sharing))

type SharingCapture is Data:
  SharingCapture{state: Types.State, routes: List<&2,SharingRuntime.Route>, valid: Bool}

def sharing_departed(+state: Types.State, departure: SharingRuntime.Departure) -> SharingDeparture:
  match departure:
    case SharingRuntime.Departure{sharing,events,True{}}:
      SharingDeparture{with_sharing_runtime(state,sharing),events,True{}}
    case SharingRuntime.Departure{_,_,False{}}: SharingDeparture{state,[],False{}}

def sharing_leave_all(+state: Types.State, partition: Nat, lifetime: Nat) -> SharingDeparture:
  sharing_departed(state,SharingRuntime.depart_all(sharing_runtime(state),canonical(state),partition,lifetime))

# The private metadata context is created only from an accepted original
# physical result and its before-transition source capture. Canonical formats
# and public raw reservation events have no cache continuation capability.
type CachePublished is Data:
  CachePublished{state: Types.State, facts: List<&2,CacheRuntime.Fact>, releases: List<&2,Canonical.CanonicalEvent>}
type CacheApplied is Data:
  CacheApplied{state: Types.State, event: Canonical.CanonicalEvent, result: Canonical.Step,
    facts: List<&2,CacheRuntime.Fact>, releases: List<&2,Canonical.CanonicalEvent>, valid: Bool}

def lifecycle_cache_scope(+transition: LifecycleTransition, scope: Maybe<&2,FreshnessScenario.Scope>) -> LifecycleTransition:
  match transition scope:
    case LifecycleTransition{+state,_,_,_} Some{FreshnessScenario.Scope{+p,+l,_,_}}:
      lifecycle_cache_published(lifecycle_sharing_departed(transition,sharing_leave_all(state,p,l)),p,CacheRuntime.departure(cache_runtime(state),canonical(state),p,l))
    case _ None{}: transition

def lifecycle_cache_removed(+transition: LifecycleTransition, partition: Nat) -> LifecycleTransition:
  match transition:
    case LifecycleTransition{_,AdviceeLifecycle.Changed{_,previous,current,valid},_,_}:
      lifecycle_cache_scope(transition,departed_cache_scope(previous,current,valid))

def lifecycle_action(+state: Types.State, +partition: Nat, action: AdviceeLifecycle.Action) -> LifecycleTransition:
  lifecycle_cache_removed(lifecycle_changed(state, partition, lifecycle_requested(AdviceeActivity.synchronize(lifecycle_entries(state), canonical(state), partition), partition, action, activity_scope(state, partition))),partition)

def permit_issue(capture: PermitScenario.Capture, now: Nat) -> Canonical.CanonicalEvent:
  PermitScenario.issue(capture, now)

def permit_issued(capture: PermitScenario.Capture, token: Nat) -> List<&2, PermitScenario.Fact>:
  PermitScenario.issued(capture, token)

def permit_consumed(state: Types.State, command: Canonical.Command, partition: Nat, lifetime: Nat) -> List<&2, PermitScenario.Fact>:
  PermitScenario.consumed(canonical(state), command, partition, lifetime)

# Scenario owners retain source-free issuance facts inside the same engine.
def callback_state(state: Types.State) -> Callbacks.State:
  RuntimeScenarios.callbacks(scenarios(state))

def with_callbacks(+state: Types.State, callbacks: Callbacks.State) -> Types.State:
  with_scenarios(state, RuntimeScenarios.with_callbacks(scenarios(state), callbacks))

type CallbackIssued is Data:
  CallbackIssued{state: Types.State, receipt: Maybe<&2,Callbacks.Fact>}

def callback_issued(+state: Types.State, receipt: Maybe<&2,Callbacks.Fact>) -> CallbackIssued:
  match receipt:
    case Some{+fact}: CallbackIssued{with_callbacks(state,Callbacks.append_fact(callback_state(state),fact)),Some{fact}}
    case None{}: CallbackIssued{state,None{}}

def callback_issue(state: Types.State, owner: Callbacks.Owner, order: Nat, at: Nat, action: Driver.Action) -> CallbackIssued:
  callback_issued(state,Callbacks.issue(owner,order,at,action))

def callback_issue_output(state: Types.State, owner: Callbacks.Owner, order: Nat, at: Nat,
    action: Driver.Action, capture: OutputScenario.Capture) -> CallbackIssued:
  callback_issued(state,Callbacks.issue_output(owner,order,at,action,capture))

type OutputIntervention is Data:
  OutputIntervention{state: Types.State, result: Callbacks.Applicability,
    cancel: List<&2,Nat>, schedule: List<&2,Callbacks.Scheduled>, receipt: Maybe<&2,Callbacks.Fact>}

def output_intervened(state: Types.State, changed: OutputCompletion.Intervention) -> OutputIntervention:
  match changed:
    case OutputCompletion.Intervention{callbacks,Callbacks.Applied{},cancel,schedule,receipt}:
      OutputIntervention{with_callbacks(state,callbacks),Callbacks.Applied{},cancel,schedule,receipt}
    case OutputCompletion.Intervention{_,result,_,_,_}:
      OutputIntervention{state,result,Nil{},Nil{},None{}}

def output_intervene(+state: Types.State, target: Callbacks.Target, outcome: OutputScenario.Outcome, receipt: Maybe<&2,Callbacks.Fact>) -> OutputIntervention:
  output_intervened(state,OutputCompletion.intervene_receipt(callback_state(state),target,outcome,receipt,queued(state),clock(state)))

def output_initial(capture: OutputScenario.Capture, terminal_only: Bool) -> List<&2,Driver.Action>:
  Driver.output_actions(OutputScenario.initial_actions(capture,terminal_only))

def output_deliver(receipt: Callbacks.Fact, now: Nat) -> Maybe<&2,Driver.Action>:
  OutputCompletion.delivered_fact(receipt,now)

def callback_delivered(+state: Types.State, order: Nat) -> Types.State:
  with_callbacks(state, Callbacks.delivered(callback_state(state), order))

def callback_originals(state: Types.State) -> List<&2, Callbacks.Original>:
  match state:
    case Types.State{_, _, _, _, _, _, _, _, _, _, _, _, RuntimeScenarios.State{Callbacks.State{originals}, _, _, _, _, _, _,_,_,_,_}}: originals

type CallbackTransition is Data:
  CallbackTransition{state: Types.State, result: Callbacks.Applicability, cancel: List<&2,Nat>, schedule: List<&2,Callbacks.Scheduled>}

def callback_changed(state: Types.State, changed: Callbacks.Changed) -> CallbackTransition:
  match changed:
    case Callbacks.Changed{callbacks, result, cancel, schedule}:
      CallbackTransition{with_callbacks(state, callbacks), result, cancel, schedule}

def callback_action(+state: Types.State, target: Callbacks.Target, control: Callbacks.Control,
    receipt: Maybe<&2,Callbacks.Fact>, at: Nat, order: Nat) -> CallbackTransition:
  callback_changed(state, Callbacks.apply_receipt(callback_state(state), target, control, receipt, at, order))

def callback_work_owner(work: List<&2,Canonical.Work>, +advice: Nat) -> Maybe<&2,Callbacks.Owner>:
  match work:
    case Nil{}: None{}
    case Canonical.Work{p,l,r,+operation,_,_,_} <> tail:
      Bool.pick(Maybe<&2,Callbacks.Owner>,Nat.is_eq(operation,advice),Some{Callbacks.Owner{p,l,r,operation}},callback_work_owner(tail,advice))

def callback_output_owner(canonical: Canonical.State, advice: Nat) -> Maybe<&2,Callbacks.Owner>:
  match canonical:
    case Canonical.State{_,_,work,_,_,_,_,_,_}: callback_work_owner(work,advice)

# Capture the original member owner while the authorized slot is issued. The
# receipt retains that owner; delivery never asks a later lifetime to adopt it.
def callback_finish_owner(state: Types.State, selected: List<&2,Nat>) -> Maybe<&2,Callbacks.Owner>:
  match selected:
    case Nil{}: None{}
    case advice <> _: callback_output_owner(canonical(state),advice)

def callback_finish_checked(valid: Bool, owner: Callbacks.Owner) -> Maybe<&2,Callbacks.Owner>:
  match valid:
    case True{}: Some{owner}
    case False{}: None{}

def callback_finish_slot(canonical: Canonical.State, found: Maybe<&2,Callbacks.Owner>,
    group: Nat, round: Nat, attempt: Nat, token: Nat, selected: List<&2,Nat>) -> Maybe<&2,Callbacks.Owner>:
  match canonical found:
    case Canonical.State{_,_,_,_,_,_,_,collection,_} Some{+owner}:
      callback_finish_checked(Callbacks.finish_owned(collection,owner,group,round,attempt,token,selected),owner)
    case _ None{}: None{}

def callback_owner(+state: Types.State, event: Canonical.CanonicalEvent) -> Maybe<&2,Callbacks.Owner>:
  match event:
    case Canonical.JevRequestStarted{p,l,r,o,_}: Some{Callbacks.Owner{p,l,r,o}}
    case Canonical.JevRequestInterrupted{p,l,r,o,_}: Some{Callbacks.Owner{p,l,r,o}}
    case Canonical.JevRequestSettled{p,l,r,o,_,_,_}: Some{Callbacks.Owner{p,l,r,o}}
    case Canonical.PreparationCompleted{p,l,r,o,_}: Some{Callbacks.Owner{p,l,r,o}}
    case Canonical.SubmissionTerminal{advice,_,_}: callback_output_owner(canonical(state),advice)
    case Canonical.SubmissionExpiryCheck{advice,_,_,_}: callback_output_owner(canonical(state),advice)
    case Canonical.FinishTerminal{group,round,attempt,token,+selected,_}:
      callback_finish_slot(canonical(state),callback_finish_owner(state,selected),group,round,attempt,token,selected)
    case _: None{}

type NoticeTransition is Data:
  NoticeTransition{state: Types.State, events: List<&2,Canonical.CanonicalEvent>}

def notice_followed(state: Types.State, followup: NoticeScenario.Followup) -> NoticeTransition:
  match state followup:
    case Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.State{callbacks,_,clocks,freshness,sources,sharing,cache,collection,writers,background_collection,stop}} NoticeScenario.Followup{notices,events}:
      NoticeTransition{Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.State{callbacks,notices,clocks,freshness,sources,sharing,cache,collection,writers,background_collection,stop}},events}

def notice_clocked(state: Types.State, scope: NoticeScenario.Scope, +key: Nat, +now: Nat, +commands: List<&2,Canonical.Command>, profile: ExpiryScenario.Profile) -> Types.State:
  match state:
    case Types.State{+canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.State{callbacks,notices,clocks,freshness,sources,sharing,cache,collection,writers,background_collection,stop}}:
      Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.State{callbacks,notices,NoticeScenario.expiry_feedback(NoticeScenario.clock_feedback(clocks,scope,key,now,commands),key,canonical,now,profile,commands),freshness,sources,sharing,cache,collection,writers,background_collection,stop}}

def notice_pruned(state: Types.State, key: Nat, commands: List<&2,Canonical.Command>) -> Types.State:
  match state:
    case Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.State{callbacks,notices,clocks,freshness,sources,sharing,cache,collection,writers,background_collection,stop}}:
      Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.State{callbacks,notices,NoticeScenario.prune_clocks(clocks,key,commands),freshness,sources,sharing,cache,collection,writers,background_collection,stop}}

def notice_lease_clocked(before: Types.State, state: Types.State, +key: Nat, now: Nat,
    commands: List<&2, Canonical.Command>, profile: ExpiryScenario.Profile) -> Types.State:
  match state profile:
    case Types.State{core,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.State{callbacks,notices,clocks,freshness,sources,sharing,cache,collection,writers,background_collection,stop}} ExpiryScenario.Profile{_,duration,_}:
      Types.State{core,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.State{callbacks,notices,NoticeScenario.lease_feedback(clocks,key,now,duration,NoticeScenario.new_lease(canonical(before),key,commands)),freshness,sources,sharing,cache,collection,writers,background_collection,stop}}

# Called with this event's actual accepted commands and captured exercise scope.
# The before state is required for releasing only a genuinely dropped key.
def notice_after(before: Types.State, +state: Types.State, +scope: NoticeScenario.Scope,
    event: Canonical.CanonicalEvent, +commands: List<&2,Canonical.Command>, +now: Nat, profile: ExpiryScenario.Profile) -> NoticeTransition:
  match event:
    case Canonical.NoticeAdvance{+key,_,_,_,sequence,_}:
      notice_followed(notice_clocked(state,scope,key,now,commands,profile),RuntimeScenarios.notice_requested(scenarios(state),scope,key,sequence,commands,now))
    case Canonical.ReserveCapacity{partition,_,Ledger.OperationalNotice{}}:
      notice_followed(state,RuntimeScenarios.notice_reserved(scenarios(state),partition,commands))
    case Canonical.NoticeCommit{key,_,_,reservation,_,_,_}:
      NoticeTransition{notice_clocked(state,scope,key,now,commands,profile),NoticeScenario.commit_feedback(reservation,commands)}
    case Canonical.NoticeLease{key,True{}}:
      NoticeTransition{notice_lease_clocked(before,state,key,now,commands,profile),Nil{}}
    case Canonical.NoticePrune{+key,_,_,_,_}:
      NoticeTransition{notice_pruned(state,key,commands),NoticeScenario.prune_feedback(canonical(before),key,commands)}
    case _: NoticeTransition{state,Nil{}}

def notice_exercise(scope: NoticeScenario.Scope) -> List<&2,NoticeScenario.Scheduled>:
  NoticeScenario.exercise(scope)

def notice_failure(state: Types.State, scope: NoticeScenario.Scope, now: Nat, key: Nat, sequence: Nat) -> Maybe<&2,Canonical.CanonicalEvent>:
  match state:
    case Types.State{_,_,_,_,_,_,_,_,_,_,_,_,RuntimeScenarios.State{_,_,clocks,_,_,_,_,_,_,_,_}}: NoticeScenario.supplied_failure(scope,clocks,now,key,sequence)

def notice_lease(state: Types.State, partition: Nat, group: Nat, key: Nat) -> Maybe<&2,Canonical.CanonicalEvent>:
  match state:
    case Types.State{_,_,_,_,_,_,_,_,_,_,_,_,RuntimeScenarios.State{_,_,clocks,_,_,_,_,_,_,_,_}}: NoticeScenario.scoped_lease(clocks,partition,group,key)

def notice_acknowledge(state: Types.State, partition: Nat, group: Nat, key: Nat) -> Maybe<&2,Canonical.CanonicalEvent>:
  match state:
    case Types.State{_,_,_,_,_,_,_,_,_,_,_,_,RuntimeScenarios.State{_,_,clocks,_,_,_,_,_,_,_,_}}: NoticeScenario.scoped_acknowledge(clocks,partition,group,key)

def callback_replaced(+state: Types.State, orders: List<&2,Nat>) -> Types.State:
  with_callbacks(state,Callbacks.replaced(callback_state(state),orders))

type FreshnessAdmission is Data:
  FreshnessAdmission{state: Types.State, source: Maybe<&2,FreshnessScenario.Source>, actions: List<&2,Driver.Action>}

def with_freshness(+state: Types.State, freshness: FreshnessScenario.State) -> Types.State:
  with_scenarios(state,RuntimeScenarios.with_freshness(scenarios(state),freshness))

def freshness_bound(+state: Types.State, scope: FreshnessScenario.Scope, +source: FreshnessScenario.Source, sources: ScopedRevision.State) -> FreshnessAdmission:
  FreshnessAdmission{with_scenarios(state,RuntimeScenarios.with_sources(RuntimeScenarios.with_freshness(scenarios(state),FreshnessScenario.retain(freshness_state(state),scope,source,0n)),sources)),Some{source},[FreshnessScenario.registration(source)]}

def freshness_resolved(+state: Types.State, scope: FreshnessScenario.Scope, resolved: ScopedRevision.Resolved) -> FreshnessAdmission:
  match resolved:
    case ScopedRevision.Resolved{_,None{}}: FreshnessAdmission{state,None{},[]}
    case ScopedRevision.Resolved{sources,Some{source}}: freshness_bound(state,scope,source,sources)

# Called only for the actual accepted ObservationAdmitted command. Its source
# labels are the original queued job facts, never a latest-advicee lookup.
def freshness_admitted(+state: Types.State, +scope: FreshnessScenario.Scope, source: FreshnessScenario.Source, command: Canonical.Command) -> FreshnessAdmission:
  match scope command:
    case FreshnessScenario.Scope{+p,+l,+r,+o} Canonical.ObservationAdmitted{id}:
      Bool.pick(FreshnessAdmission,Nat.is_eq(o,id) && FreshnessScenario.live(canonical(state),FreshnessScenario.Scope{p,l,r,o}),
        freshness_resolved(state,FreshnessScenario.Scope{p,l,r,o},ScopedRevision.resolve(RuntimeScenarios.sources(scenarios(state)),canonical(state),p,source)),
        FreshnessAdmission{state,None{},[]})
    case _ _: FreshnessAdmission{state,None{},[]}

# Shared membership is one accepted original admission, not one unit. Reused
# source registration increments once here; new/replaced source membership is
# still initialized by actual Canonical.RevisionRegister semantics.
def sharing_admission_result(admission: FreshnessAdmission) -> FreshnessAdmission:
  match admission:
    case FreshnessAdmission{state,Some{+source},_}:
      FreshnessAdmission{state,Some{source},[FreshnessScenario.registration_member(source,True{})]}
    case FreshnessAdmission{state,None{},_}: FreshnessAdmission{state,None{},[]}

def sharing_admission_found(+state: Types.State, scope: FreshnessScenario.Scope, source: FreshnessScenario.Source, command: Canonical.Command, known: Maybe<&2,FreshnessScenario.Binding>) -> FreshnessAdmission:
  match known:
    case Some{_}: FreshnessAdmission{state,None{},[]}
    case None{}: sharing_admission_result(freshness_admitted(state,scope,source,command))

def sharing_admitted(+state: Types.State, +scope: FreshnessScenario.Scope, source: FreshnessScenario.Source, command: Canonical.Command) -> FreshnessAdmission:
  sharing_admission_found(state,scope,source,command,FreshnessScenario.lookup(FreshnessScenario.bindings(freshness_state(state)),scope))

def freshness_current(+state: Types.State, scope: FreshnessScenario.Scope) -> Maybe<&2,Bool>:
  FreshnessScenario.current(freshness_state(state),canonical(state),scope)

def freshness_checks(state: Types.State, scope: FreshnessScenario.Scope) -> List<&2,Driver.Action>:
  FreshnessScenario.checks(freshness_state(state),scope)

def sharing_captured(+state: Types.State, capture: SharingRuntime.Captured) -> SharingCapture:
  match capture:
    case SharingRuntime.Captured{sharing,routes,True{}}: SharingCapture{with_sharing_runtime(state,sharing),routes,True{}}
    case SharingRuntime.Captured{_,_,False{}}: SharingCapture{state,[],False{}}

def sharing_prepare_found(+state: Types.State, +scope: FreshnessScenario.Scope, keys: List<&2,SharingScenario.SharingKey>, sizes: List<&2,Nat>, found: Maybe<&2,Canonical.Work>) -> SharingCapture:
  match found:
    case Some{Canonical.Work{p,l,r,_,_,Canonical.Preparing{},parent}}:
      sharing_captured(state,SharingRuntime.capture(sharing_runtime(state),freshness_state(state),scope,FreshnessScenario.Scope{p,l,r,parent},keys,sizes,RuntimeScenarios.cache(scenarios(state)),canonical(state)))
    case _: SharingCapture{state,[],False{}}

def sharing_prepare(+state: Types.State, +scope: FreshnessScenario.Scope, keys: List<&2,SharingScenario.SharingKey>, sizes: List<&2,Nat>) -> SharingCapture:
  match scope:
    case FreshnessScenario.Scope{+p,+l,+r,+o}:
      sharing_prepare_found(state,scope,keys,sizes,Canonical.find_work(p,l,r,o,Driver.work_list(canonical(state))))

def sharing_route(+state: Types.State, route: SharingRuntime.Route) -> List<&2,Canonical.CanonicalEvent>:
  SharingRuntime.route_event(canonical(state),freshness_state(state),sharing_runtime(state),route)

type SharingRouted is Data:
  SharingRouted{state: Types.State, events: List<&2,Canonical.CanonicalEvent>}

def sharing_cached_route(+state: Types.State, +route: SharingRuntime.Route, +commands: List<&2,Canonical.Command>, +payload: Maybe<&2,CacheScenario.Payload>) -> SharingRouted:
  SharingRouted{with_sharing_runtime(state,SharingRuntime.cached_routed(SharingRuntime.routed(sharing_runtime(state),route,commands),route,payload)),
    List.append(&2,Canonical.CanonicalEvent,SharingRuntime.route_followups(sharing_runtime(state),route,commands),SharingRuntime.cached_followups(canonical(state),freshness_state(state),route,payload))}

def sharing_routed(+state: Types.State, +route: SharingRuntime.Route, +commands: List<&2,Canonical.Command>) -> SharingRouted:
  match route:
    case SharingRuntime.Route{_,_,_,evaluation}:
      sharing_cached_route(state,route,commands,CacheRuntime.hit(RuntimeScenarios.cache(scenarios(state)),canonical(state),evaluation,commands))

def sharing_completion(state: Types.State, event: Canonical.CanonicalEvent) -> SharingRuntime.Completion:
  SharingRuntime.completion(sharing_runtime(state),event)

def sharing_binding(state: Types.State, scope: FreshnessScenario.Scope) -> Maybe<&2,SharingRuntime.Binding>:
  SharingRuntime.lookup_binding(sharing_runtime(state),scope)

def sharing_result(state: Types.State, evaluation: Nat) -> Maybe<&2,Canonical.RequestOutcome>:
  SharingRuntime.result(sharing_runtime(state),evaluation)



def sharing_leave(+state: Types.State, scope: FreshnessScenario.Scope) -> SharingDeparture:
  sharing_departed(state,SharingRuntime.depart_canonical(sharing_runtime(state),canonical(state),scope))

# A still-queued original callback may need source-free route decisions first.
# One actual Canonical step per call preserves public event budgets and lets
# controls between steps observe the current state, never a precomputed batch.
type SharingFrame is Data:
  SharingFrame{before: Types.State, after: Types.State, event: Canonical.CanonicalEvent, result: Canonical.Step}
type SharingNext is Data:
  SharingNext{state: Types.State, frame: Maybe<&2,SharingFrame>, events: List<&2,Canonical.CanonicalEvent>}

def sharing_route_published(before: Types.State, event: Canonical.CanonicalEvent, canonical: Canonical.State, commands: List<&2,Canonical.Command>, routed: SharingRouted) -> SharingNext:
  match routed:
    case SharingRouted{+next,events}:
      SharingNext{next,Some{SharingFrame{before,next,event,Canonical.Advanced{canonical,commands}}},events}

def sharing_route_result(+before: Types.State, +route: SharingRuntime.Route, +event: Canonical.CanonicalEvent, transition: Transition) -> SharingNext:
  match transition:
    case Transition{+state,Canonical.Advanced{+canonical,+commands}}:
      sharing_route_published(before,event,canonical,commands,sharing_routed(state,route,commands))
    case Transition{+state,+result}: SharingNext{state,Some{SharingFrame{before,state,event,result}},[]}

def sharing_route_events(+state: Types.State, +route: SharingRuntime.Route, events: List<&2,Canonical.CanonicalEvent>) -> SharingNext:
  match events:
    case Nil{}: SharingNext{state,None{},[]}
    case +event <> Nil{}: sharing_route_result(state,route,event,step(state,event))
    case _ <> _ <> _: SharingNext{state,None{},[]}

def sharing_first(+state: Types.State, routes: List<&2,SharingRuntime.Route>) -> SharingNext:
  match routes:
    case Nil{}: SharingNext{state,None{},[]}
    case +route <> _: sharing_route_events(state,route,sharing_route(state,route))

def sharing_metadata_clock(state: Types.State, now: Nat) -> Types.State:
  match state:
    case Types.State{canonical,graphs,Scheduler.State{queue,_},workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,scenarios}:
      Types.State{canonical,graphs,Scheduler.State{queue,now},workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,scenarios}

def sharing_within(now: Nat, horizon: Maybe<&2,Nat>) -> Bool:
  match horizon:
    case None{}: True{}
    case Some{end}: Nat.is_le(now,end)

def sharing_preparation_live(+state: Types.State, event: Canonical.CanonicalEvent) -> Bool:
  match event:
    case Canonical.PreparationCompleted{+p,+l,r,o,_}:
      preparation_active(state,p,l,r,o) && AdviceeLifecycle.permits_activity(lifecycle_entries(state),p,l)
    case _: False{}

def sharing_head_pending(+state: Types.State, at: Nat, routes: List<&2,SharingRuntime.Route>) -> SharingNext:
  match routes:
    case Nil{}: SharingNext{state,None{},[]}
    case route <> tail: sharing_first(sharing_metadata_clock(state,at),route <> tail)

def sharing_head_checked(+state: Types.State, +event: Canonical.CanonicalEvent, at: Nat, allowed: Bool) -> SharingNext:
  match allowed:
    case False{}: SharingNext{state,None{},[]}
    case True{}: sharing_head_pending(state,at,SharingRuntime.pending(sharing_runtime(state),event))

def sharing_at_head(+state: Types.State, +event: Canonical.CanonicalEvent, order: Nat, horizon: Maybe<&2,Nat>, head: Maybe<&2,Scheduler.Entry>) -> SharingNext:
  match head:
    case None{}: SharingNext{state,None{},[]}
    case Some{Scheduler.Entry{+at,id}}:
      sharing_head_checked(state,event,at,Nat.is_eq(order,id) && sharing_within(at,horizon) && sharing_preparation_live(state,event))

def sharing_preprocess(+state: Types.State, event: Canonical.CanonicalEvent, order: Nat, horizon: Maybe<&2,Nat>) -> SharingNext:
  match state:
    case Types.State{_,_,scheduler,_,_,_,_,_,_,_,_,_,_}:
      sharing_at_head(state,event,order,horizon,Scheduler.peek(scheduler))


def sharing_after(before: Types.State, +after: Types.State, event: Canonical.CanonicalEvent, commands: List<&2,Canonical.Command>) -> List<&2,Canonical.CanonicalEvent>:
  SharingRuntime.fanout(sharing_runtime(before),sharing_runtime(after),canonical(after),freshness_state(after),event,commands)


def cache_published(state: Types.State, published: CacheRuntime.Published) -> CachePublished:
  match published:
    case CacheRuntime.Published{cache,facts,releases}: CachePublished{with_cache_runtime(state,cache),facts,releases}

def recorded_cache_result(commands: List<&2,Canonical.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case Canonical.JevRequestOutcomeRecorded{_} <> _: True{}
    case _ <> tail: recorded_cache_result(tail)

def cache_begin_current(+state: Types.State, offer: CacheScenario.Offer, binding: FreshnessScenario.Binding, allowed: Bool) -> CachePublished:
  match allowed:
    case True{}: cache_published(state,CacheRuntime.begin_configured(cache_runtime(state),offer,binding))
    case False{}: CachePublished{state,[],CacheRuntime.terminal_claim(offer)}

def cache_begin_captured(before: Types.State, +state: Types.State, +offer: CacheScenario.Offer, source: Maybe<&2,FreshnessScenario.Binding>) -> CachePublished:
  match source:
    case Some{+binding}: cache_begin_current(state,offer,binding,CacheRuntime.current_found(FreshnessScenario.current_binding(canonical(before),Some{binding})))
    case None{}: CachePublished{state,[],CacheRuntime.terminal_claim(offer)}

def cache_begin_eligible(+before: Types.State, +state: Types.State, +offer: CacheScenario.Offer, eligible: Bool) -> CachePublished:
  match eligible:
    case True{}: cache_begin_captured(before,state,offer,FreshnessScenario.lookup(FreshnessScenario.bindings(freshness_state(before)),CacheScenario.original(offer)))
    case False{}: CachePublished{state,[],CacheRuntime.terminal_claim(offer)}

def cache_begin_offer(before: Types.State, state: Types.State, offer: Maybe<&2,CacheScenario.Offer>, eligible: Bool) -> CachePublished:
  match offer:
    case None{}: CachePublished{state,[],[]}
    case Some{offer}: cache_begin_eligible(before,state,offer,eligible)

def cache_begin_checked(before: Types.State, +state: Types.State, event: Canonical.CanonicalEvent, allowed: Bool, eligible: Bool) -> CachePublished:
  match allowed:
    case True{}: cache_begin_offer(before,state,SharingRuntime.cache_offer(sharing_runtime(state),event),eligible)
    case False{}: CachePublished{state,[],[]}

def cache_original_found(found: Maybe<&2,Dispatch.Request>) -> Bool:
  match found:
    case Some{_}: True{}
    case None{}: False{}

def cache_original_request(state: Canonical.State, event: Canonical.CanonicalEvent) -> Bool:
  match event:
    case Canonical.JevRequestSettled{p,l,r,o,request,_,_}: cache_original_found(FaultTargets.request(state,FaultTargets.Target{p,l,r,o,request}))
    case _: False{}

# A stale original result can authentically settle its physical request while
# being ineligible for caching. Its existing claim still ends; only current
# recorded results may start the unchanged cache reservation/commit route.
def cache_begin(+before: Types.State, state: Types.State, +event: Canonical.CanonicalEvent, +commands: List<&2,Canonical.Command>) -> CachePublished:
  cache_begin_checked(before,state,event,SharingRuntime.original_consumed(commands) && cache_original_request(canonical(before),event),recorded_cache_result(commands))

def cache_removed_result(feedback: CacheRuntime.Feedback) -> List<&2,Canonical.CanonicalEvent>:
  match feedback:
    case CacheRuntime.Feedback{_,events}: events

def cache_removed(+before: Types.State, commands: List<&2,Canonical.Command>) -> List<&2,Canonical.CanonicalEvent>:
  cache_removed_result(CacheRuntime.existing_removed(cache_runtime(before),canonical(before),commands))

def cache_applied_published(state: Types.State, event: Canonical.CanonicalEvent, result: Canonical.Step, published: CacheRuntime.Published) -> CacheApplied:
  match published:
    case CacheRuntime.Published{cache,facts,releases}:
      CacheApplied{with_cache_runtime(state,cache),event,result,facts,releases,True{}}

def canonical_state(state: Types.State) -> Canonical.State:
  canonical(state)

def cache_applied_feedback(+before: Types.State, state: Types.State, +event: Canonical.CanonicalEvent, fact: CacheRuntime.Fact, transition: Transition) -> CacheApplied:
  match transition:
    case Transition{+after,Canonical.Advanced{+canonical,+commands}}:
      cache_applied_published(after,event,Canonical.Advanced{canonical,commands},CacheRuntime.feedback_fact(cache_runtime(after),canonical_state(before),canonical,fact,commands))
    case Transition{after,result}: CacheApplied{after,event,result,[],[],True{}}

def cache_apply_checked(+state: Types.State, +fact: CacheRuntime.Fact, allowed: Bool) -> CacheApplied:
  match allowed:
    case False{}: CacheApplied{state,CacheRuntime.fact_event(fact),Canonical.Rejected{canonical(state),Canonical.StaleOperation{}},[],[],True{}}
    case True{}: cache_applied_feedback(state,state,CacheRuntime.fact_event(fact),fact,step(state,CacheRuntime.fact_event(fact)))

def cache_apply(+state: Types.State, +fact: CacheRuntime.Fact) -> CacheApplied:
  cache_apply_checked(state,fact,CacheRuntime.valid_fact(cache_runtime(state),fact))

def configure_cache(+state: Types.State, enabled: Bool, entries: Nat, bytes: Nat) -> Types.State:
  with_cache_runtime(state,CacheRuntime.configure(cache_runtime(state),enabled,entries,bytes))

# First-class response contexts are scoped original capabilities, independently
# minted and closed. They never infer a response from the latest advicee round.
type ResponseResult is Data:
  ResponseResult{result: CollectionScenario.Applicability, issued: Maybe<&2, CollectionScenario.Identity>}

type ResponseTransition is Data:
  ResponseTransition{state: Types.State, result: ResponseResult, actions: List<&2, Driver.Action>}

def collection_responses(state: Types.State) -> List<&2, CollectionScenario.Context>:
  CollectionScenario.contexts(RuntimeScenarios.collection(scenarios(state)))

def collection_with(state: Types.State, collection: CollectionScenario.State) -> Types.State:
  match state:
    case Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,scenarios}:
      Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.with_collection(scenarios,collection)}

def collection_changed(state: Types.State, change: CollectionScenario.Change) -> ResponseTransition:
  match change:
    case CollectionScenario.Change{collection,result,issued,actions}:
      ResponseTransition{collection_with(state,collection),ResponseResult{result,issued},actions}

def current_credential_generation(credentials: CredentialFacts.State) -> Nat:
  match credentials:
    case CredentialFacts.State{_,generation,_}: generation

def collection_response_open_at(valid: Bool, +state: Types.State, response: CollectionScenario.Response) -> ResponseTransition:
  match valid:
    case True{}: collection_changed(state,CollectionScenario.issue(RuntimeScenarios.collection(scenarios(state)),response,current_credential_generation(credential_state(state)),canonical(state)))
    case False{}: ResponseTransition{state,ResponseResult{CollectionScenario.WrongScope{},None{}},[]}

def collection_response_open(+state: Types.State, +response: CollectionScenario.Response) -> ResponseTransition:
  collection_response_open_at(CollectionScenario.issuance_time(response,clock(state)),state,response)

def collection_response_close(+state: Types.State, id: Nat, p: Nat, l: Nat, r: Nat) -> ResponseTransition:
  collection_changed(state,CollectionScenario.close(RuntimeScenarios.collection(scenarios(state)),CollectionScenario.Identity{id,p,l,r}))

def collection_response_attempt(+state: Types.State, id: Nat, p: Nat, l: Nat, r: Nat, now: Nat, current_block: Bool) -> ResponseTransition:
  collection_changed(state,CollectionScenario.attempt(RuntimeScenarios.collection(scenarios(state)),CollectionScenario.Identity{id,p,l,r},canonical(state),now,current_block,credential_state(state)))

def collection_response_after(+state: Types.State, target: CollectionScenario.Identity, event: Canonical.CanonicalEvent, commands: List<&2, Canonical.Command>) -> ResponseTransition:
  collection_changed(state,CollectionScenario.after(RuntimeScenarios.collection(scenarios(state)),target,event,commands,canonical(state)))

def collection_response_valid(+state: Types.State, +target: CollectionScenario.Identity, +now: Nat) -> Bool:
  WriterScenario.response_fence(RuntimeScenarios.writers(scenarios(state)),target,canonical(state),now) && CollectionScenario.valid(RuntimeScenarios.collection(scenarios(state)),target,canonical(state),now,credential_state(state))

def collection_response_automatic(state: Types.State, partition: Nat) -> Bool:
  CollectionScenario.automatic(RuntimeScenarios.collection(scenarios(state)),partition)


def collection_response_handle(+state: Types.State, event: Canonical.CanonicalEvent, command: Canonical.Command, context: Driver.Context, target: CollectionScenario.Identity) -> Driver.Handled:
  WriterScenario.handle_response(RuntimeScenarios.writers(scenarios(state)),canonical(state),event,command,CollectionScenario.driver_context(RuntimeScenarios.collection(scenarios(state)),context,True{}),target)


def writer_with(state: Types.State, writers: WriterScenario.State) -> Types.State:
  match state:
    case Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,scenarios}:
      Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,RuntimeScenarios.with_writers(scenarios,writers)}

def writer_reconciled(state: Types.State, change: WriterScenario.Reconciled) -> ResponseTransition:
  match change:
    case WriterScenario.Reconciled{writers,responses,actions}:
      ResponseTransition{writer_with(collection_with(state,responses),writers),ResponseResult{CollectionScenario.Applied{},None{}},actions}

def writer_reconcile(+state: Types.State, now: Nat) -> ResponseTransition:
  writer_reconciled(state,WriterScenario.reconcile(RuntimeScenarios.writers(scenarios(state)),RuntimeScenarios.collection(scenarios(state)),canonical(state),now))

def collection_expired_change(state: Types.State, release: List<&2,Driver.Action>, changed: CollectionScenario.Change) -> ResponseTransition:
  match changed:
    case CollectionScenario.Change{collection,result,issued,actions}:
      ResponseTransition{collection_with(state,collection),ResponseResult{result,issued},List.append(&2,Driver.Action,release,actions)}

def collection_expired_writer(change: ResponseTransition, now: Nat) -> ResponseTransition:
  match change:
    case ResponseTransition{+state,_,release}:
      collection_expired_change(state,release,CollectionScenario.expire(RuntimeScenarios.collection(scenarios(state)),now))

# Writer ownership is reconciled before generic response expiry/publication.
# Physical authorized output remains owned by its existing submission lease.
def collection_response_expire(+state: Types.State, +now: Nat) -> ResponseTransition:
  collection_expired_writer(writer_reconcile(state,now),now)


def collection_response_delivery_valid(+state: Types.State, +target: CollectionScenario.Identity, +now: Nat, event: Canonical.CanonicalEvent) -> Bool:
  WriterScenario.response_fence(RuntimeScenarios.writers(scenarios(state)),target,canonical(state),now) && CollectionScenario.delivery_valid(RuntimeScenarios.collection(scenarios(state)),target,canonical(state),now,credential_state(state),event)

# A pending trigger has no response identity and no advice lease. Credential,
# start and cutoff are captured once here; a later claim grant does not refresh
# them. The host only transports this immutable original pending capsule.
type WriterPrepared is Data:
  WriterPrepared{state: Types.State, pending: Maybe<&2,WriterScenario.Pending>, actions: List<&2,Driver.Action>}

def writer_prepared(valid: Bool, +state: Types.State, +facts: WriterScenario.ClaimFacts) -> WriterPrepared:
  match valid:
    case False{}: WriterPrepared{state,None{},[]}
    case True{}:
      WriterPrepared{writer_with(state,WriterScenario.declare(RuntimeScenarios.writers(scenarios(state)),facts,canonical(state))),Some{WriterScenario.Pending{facts,current_credential_generation(credential_state(state))}},[Driver.immediate(WriterScenario.claim_facts(facts,canonical(state),clock(state)),False{})]}

def writer_prepare(+state: Types.State, +facts: WriterScenario.ClaimFacts) -> WriterPrepared:
  writer_prepared(WriterScenario.original_time(facts,clock(state)) && WriterScenario.facts_live(facts,canonical(state),clock(state)),state,facts)

# Rebuild ONLY the original queued claim's current active bit before Canonical
# mutates. All source owner/token/capacity/clock fields come from Pending.
def writer_claim_event(+state: Types.State, pending: WriterScenario.Pending, now: Nat) -> Canonical.CanonicalEvent:
  WriterScenario.pending_claim(pending,canonical(state),now)

def writer_issued(+state: Types.State, +facts: WriterScenario.ClaimFacts, change: CollectionScenario.Change, now: Nat) -> ResponseTransition:
  match change:
    case CollectionScenario.Change{collection,result,Some{+identity},actions}:
      +capture: WriterScenario.Capture = WriterScenario.issued_capture(facts,identity)
      ResponseTransition{writer_with(collection_with(state,collection),WriterScenario.retain(RuntimeScenarios.writers(scenarios(state)),capture,True{})),ResponseResult{result,Some{identity}},List.append(&2,Driver.Action,actions,[WriterScenario.expiry_action(capture,now)])}
    case CollectionScenario.Change{collection,result,None{},actions}:
      ResponseTransition{collection_with(state,collection),ResponseResult{result,None{}},List.append(&2,Driver.Action,actions,[Driver.immediate(WriterScenario.facts_release(facts),False{})])}

def writer_granted(valid: Bool, +state: Types.State, pending: WriterScenario.Pending, now: Nat) -> ResponseTransition:
  match valid pending:
    case False{} _: ResponseTransition{state,ResponseResult{CollectionScenario.Missing{},None{}},[]}
    case True{} WriterScenario.Pending{+facts,credential}:
      writer_issued(state,facts,CollectionScenario.issue(RuntimeScenarios.collection(scenarios(state)),WriterScenario.facts_response(facts),credential,canonical(state)),now)

# Only the actual original Canonical grant can mint this response. Bridge
# publication must validate complete reports/actions before retaining state and
# may call this only with its private original event/commands predecessor.
def writer_feedback(+state: Types.State, +pending: WriterScenario.Pending,
    event: Canonical.CanonicalEvent, commands: List<&2,Canonical.Command>, +now: Nat) -> ResponseTransition:
  writer_granted(WriterScenario.pending_granted(pending,event,commands,canonical(state),now),state,pending,now)

def writer_release(state: Types.State, target: WriterScenario.Target) -> List<&2,Canonical.CanonicalEvent>:
  WriterScenario.release(RuntimeScenarios.writers(scenarios(state)),target)

def writer_expire(state: Types.State, target: WriterScenario.Target, now: Nat) -> List<&2,Canonical.CanonicalEvent>:
  WriterScenario.expire(RuntimeScenarios.writers(scenarios(state)),target,now)

type WriterAttempt is Data:
  WriterAttempt{changed: ResponseTransition, target: Maybe<&2,CollectionScenario.Identity>}

def writer_attempt_identity(state: Types.State, identity: CollectionScenario.Identity, now: Nat, current_block: Bool) -> WriterAttempt:
  match identity:
    case CollectionScenario.Identity{+id,+p,+l,+r}:
      WriterAttempt{collection_response_attempt(state,id,p,l,r,now,current_block),Some{CollectionScenario.Identity{id,p,l,r}}}

def writer_attempt_live(valid: Bool, state: Types.State, capture: WriterScenario.Capture, now: Nat, current_block: Bool) -> WriterAttempt:
  match valid:
    case False{}: WriterAttempt{ResponseTransition{state,ResponseResult{CollectionScenario.Missing{},None{}},[]},None{}}
    case True{}: writer_attempt_identity(state,WriterScenario.response_identity(capture),now,current_block)

def writer_attempt_found(found: Maybe<&2,WriterScenario.Capture>, +state: Types.State, +now: Nat, current_block: Bool) -> WriterAttempt:
  match found:
    case None{}: WriterAttempt{ResponseTransition{state,ResponseResult{CollectionScenario.Missing{},None{}},[]},None{}}
    case Some{+capture}: writer_attempt_live(WriterScenario.capture_live(capture,canonical(state),now),state,capture,now,current_block)

def writer_attempt(+state: Types.State, target: WriterScenario.Target, now: Nat, current_block: Bool) -> WriterAttempt:
  writer_attempt_found(WriterScenario.lookup(RuntimeScenarios.writers(scenarios(state)),target),state,now,current_block)

def writer_capture(state: Types.State, target: WriterScenario.Target) -> Maybe<&2,WriterScenario.Capture>:
  WriterScenario.lookup(RuntimeScenarios.writers(scenarios(state)),target)

def writer_departures(+before: Types.State, +state: Types.State, event: Canonical.CanonicalEvent) -> List<&2,WriterScenario.PhysicalRelease>:
  WriterScenario.retired(RuntimeScenarios.writers(scenarios(before)),canonical(before),canonical(state),event)

def writer_release_delivery(+state: Types.State, capture: WriterScenario.Capture, event: Canonical.CanonicalEvent, now: Nat) -> Maybe<&2,Canonical.CanonicalEvent>:
  WriterScenario.release_delivery(RuntimeScenarios.writers(scenarios(state)),canonical(state),capture,event,now)

# Original safe-hook facts; Canonical retains all Finish decision authority.
def stop_initial(capture: StopScenario.Capture) -> List<&2,StopScenario.Fact>:
  StopScenario.initial(capture)

def stop_wake(capture: StopScenario.Capture, now: Nat) -> List<&2,StopScenario.Fact>:
  [StopScenario.wake(capture,now)]

# Quiet owns generated facts and follow-up actions. Canonical keeps the actual
# quiescence, active admission and inclusive duration decisions.
def quiet_event(state: Types.State, event: Canonical.CanonicalEvent, native_idle: Bool, stop_absent: Bool) -> Canonical.CanonicalEvent:
  QuietScenario.generated_tick(canonical(state),event,native_idle,stop_absent)

def quiet_after(state: Types.State, event: Canonical.CanonicalEvent, partition: Nat,
    now: Nat, window: Nat, native_idle: Bool, stop_absent: Bool) -> List<&2,Driver.Action>:
  QuietScenario.after(canonical(state),event,partition,now,window,native_idle,stop_absent)

def quiet_command(state: Types.State, command: Canonical.Command, event: Canonical.CanonicalEvent, partition: Nat, now: Nat) -> List<&2,Driver.Action>:
  QuietScenario.command(canonical(state),command,event,partition,now)
def writer_unissued_release_delivery(+state: Types.State, pending: WriterScenario.Pending, now: Nat) -> Maybe<&2,Canonical.CanonicalEvent>:
  WriterScenario.unissued_release(RuntimeScenarios.writers(scenarios(state)),canonical(state),pending,now)

def stop_reserve(capture: StopScenario.Capture, selected: List<&2,Nat>, now: Nat) -> List<&2,Driver.Action>:
  [StopScenario.reserve(capture,selected,now)]

def stop_continued(capture: StopScenario.Capture) -> List<&2,Driver.Action>:
  StopScenario.continued(capture)

def stop_reserved(capture: StopScenario.Capture, selected: List<&2,Nat>, failed: Bool, delay: Nat) -> List<&2,Driver.Action>:
  StopScenario.reserved(capture,selected,failed,delay)

def stop_budget(state: Types.State, capture: StopScenario.Capture) -> List<&2,Driver.Action>:
  [StopScenario.budget(canonical(state),capture)]

def stop_candidates(state: Types.State, capture: StopScenario.Capture) -> List<&2,Nat>:
  match capture:
    case StopScenario.Capture{p,l,r,_,_,_,_}: StopScenario.candidates(Driver.work_list(canonical(state)),p,l,r)

def stop_end(state: Types.State, capture: StopScenario.Capture, continuation: Bool) -> List<&2,Driver.Action>:
  StopScenario.end(canonical(state),capture,continuation)

def stop_validation(capture: StopScenario.Capture, advice: Nat, current: Bool,
    credential: Bool, generation: Bool, readable: Bool) -> List<&2,Driver.Action>:
  match capture:
    case StopScenario.Capture{p,_,r,_,token,_,_}:
      [StopScenario.validation(advice,p,r,token,current,credential,generation,readable)]

# Factual background-collection feedback publishes its state and actions as one
# checked result. Admission decisions remain in the accepted Canonical step.
type CollectorHandled is Data:
  CollectorHandled{state: Types.State, handled: Driver.Handled}

def collector_with(state: Types.State, collector: CollectorScenario.State) -> Types.State:
  match state:
    case Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,scenarios}:
      Types.State{canonical,graphs,scheduler,workloads,random,advicees,credentials,opening,retiring,lifecycles,preparations,activity_scopes,
        RuntimeScenarios.with_background_collection(scenarios,collector)}

def collector_changed(state: Types.State, changed: CollectorScenario.Changed) -> CollectorHandled:
  match changed:
    case CollectorScenario.Changed{collector,handled}: CollectorHandled{collector_with(state,collector),handled}

def collector_configure(+state: Types.State, profile: Maybe<&2,CollectorScenario.Profile>) -> Types.State:
  collector_with(state,CollectorScenario.configure(RuntimeScenarios.background_collection(scenarios(state)),profile))

def collector_configured(state: Types.State) -> Bool:
  CollectorScenario.configured(RuntimeScenarios.background_collection(scenarios(state)))

# Original Finish facts live inside the same complete Engine state used by every
# frontend. These projections never reconstruct or substitute Canonical state.
def stop_state(state: Types.State) -> StopScenario.State:
  RuntimeScenarios.stop(scenarios(state))

def stop_with(+state: Types.State, stop: StopScenario.State) -> Types.State:
  with_scenarios(state,RuntimeScenarios.with_stop(scenarios(state),stop))

def stop_entries(state: Types.State) -> List<&2,StopScenario.Finish>:
  StopScenario.entries(stop_state(state))

def stop_find(state: Types.State, partition: Nat) -> Maybe<&2,StopScenario.Finish>:
  StopScenario.find(stop_entries(state),partition)

def stop_scope_active(finish: Maybe<&2,StopScenario.Finish>, current: Maybe<&2,Canonical.Round>) -> Bool:
  match finish current:
    case Some{StopScenario.Finish{p,l,r,_,_,_,_,_,_,_,_,_,_}} Some{Canonical.Round{owner,generation,round,_,_,_,_,_}}:
      Nat.is_eq(p,owner) && Nat.is_eq(l,generation) && Nat.is_eq(r,round)
    case _ _: False{}

def stop_active(+state: Types.State, +partition: Nat) -> Bool:
  stop_scope_active(stop_find(state,partition),Canonical.find_round(partition,Driver.rounds(canonical(state))))

def stop_put(+state: Types.State, finish: StopScenario.Finish) -> Types.State:
  stop_with(state,StopScenario.put(stop_state(state),finish))

def stop_close(+state: Types.State, partition: Nat) -> Types.State:
  stop_with(state,StopScenario.close(stop_state(state),partition))


type StopRegistered is Data:
  StopRegistered{state: Types.State, finish: Maybe<&2,StopScenario.Finish>, created: Bool}

def stop_registered(state: Types.State, registered: StopScenario.Registered) -> StopRegistered:
  match registered:
    case StopScenario.Registered{stop,finish,created}: StopRegistered{stop_with(state,stop),finish,created}

def stop_original_scope(found: Maybe<&2,Canonical.Round>, input: StopScenario.Input, now: Nat) -> Bool:
  match found input:
    case Some{Canonical.Round{p,l,r,_,_,_,_,_}} StopScenario.Input{owner,generation,round,+started,+cutoff,_}:
      Nat.is_eq(p,owner) && Nat.is_eq(l,generation) && Nat.is_eq(r,round) &&
        Nat.is_eq(started,now) && Nat.is_le(started,cutoff) && Nat.is_le(cutoff,Nat.add(Nat.mul(65536n,4294967295n),65535n))
    case _ _: False{}

def stop_registration_valid(+state: Types.State, +input: StopScenario.Input) -> Bool:
  match input:
    case StopScenario.Input{p,_,_,_,_,_}:
      stop_original_scope(Canonical.find_round(p,Driver.rounds(canonical(state))),input,clock(state))

def stop_register(+state: Types.State, +input: StopScenario.Input) -> StopRegistered:
  stop_registered(state,StopScenario.register(stop_state(state),input,stop_registration_valid(state,input)))


# Resolve only the factual original scope when a caller's Finish input is
# actually dequeued. Registration remains the same checked Stop owner.
def stop_start_scope(found: Maybe<&2,Canonical.Round>, state: Types.State,
    started: Nat, cutoff: Nat, recurring: Bool) -> StopRegistered:
  match found:
    case Some{Canonical.Round{p,l,r,_,_,_,_,_}}:
      stop_register(state,StopScenario.Input{p,l,r,started,cutoff,recurring})
    case None{}: StopRegistered{state,None{},False{}}

def stop_start(+state: Types.State, partition: Nat, started: Nat, cutoff: Nat, recurring: Bool) -> StopRegistered:
  stop_start_scope(Canonical.find_round(partition,Driver.rounds(canonical(state))),state,started,cutoff,recurring)


def stop_progress(+state: Types.State, partition: Nat, attempt: Nat, change: StopScenario.Progress) -> Types.State:
  stop_with(state,StopScenario.progress(stop_state(state),partition,attempt,change))


def collector_partition(context: Driver.Context) -> Nat:
  match context:
    case Driver.Context{partition,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_}: partition

def collector_command(+state: Types.State, +event: Canonical.CanonicalEvent, command: Canonical.Command,
    +context: Driver.Context) -> CollectorHandled:
  collector_changed(state,CollectorScenario.handle(RuntimeScenarios.background_collection(scenarios(state)),event,command,
    canonical(state),CredentialContext.apply(credential_state(state),event,
      CollectorScenario.candidate_context(RuntimeScenarios.background_collection(scenarios(state)),event,context)),stop_active(state,collector_partition(context))))

def collector_after(+state: Types.State, event: Canonical.CanonicalEvent) -> CollectorHandled:
  collector_changed(state,CollectorScenario.after(RuntimeScenarios.background_collection(scenarios(state)),canonical(state),event))

type StopHandled is Data:
  StopHandled{state: Types.State, handled: Driver.Handled, ended: Maybe<&2,StopScenario.Ended>,
    fit_attempt: Maybe<&2,Nat>, output: Maybe<&2,OutputScenario.Capture>}

def stop_changed(state: Types.State, changed: StopScenario.Changed) -> StopHandled:
  match changed:
    case StopScenario.Changed{stop,handled,ended,fit_attempt,output}:
      StopHandled{stop_with(state,stop),handled,ended,fit_attempt,output}

def stop_command_valid(valid: Bool, +state: Types.State, event: Canonical.CanonicalEvent,
    command: Canonical.Command, context: Driver.Context, facts: StopScenario.CommandFacts) -> StopHandled:
  match valid:
    case True{}:
      stop_changed(state,StopScenario.handle(stop_state(state),canonical(state),facts,
        CredentialContext.apply(credential_state(state),event,context),command))
    case False{}: StopHandled{state,Driver.Handled{False{},[]},None{},None{},None{}}

def stop_command(+state: Types.State, event: Canonical.CanonicalEvent, command: Canonical.Command,
    +context: Driver.Context, facts: StopScenario.CommandFacts) -> StopHandled:
  stop_command_valid(stop_active(state,collector_partition(context)),state,event,command,context,facts)


# Sample expiry facts before ordinary collection; returned events still pass
# through the same Canonical step and notice feedback as every other event.
def notice_collection_prune(state: Types.State, partition: Nat, group: Nat,
    now: Nat) -> List<&2, Canonical.CanonicalEvent>:
  match state:
    case Types.State{canonical,_,_,_,_,_,_,_,_,_,_,_,RuntimeScenarios.State{_,_,clocks,_,_,_,_,_,_,_,_}}:
      NoticeScenario.collection_prune(clocks,canonical,partition,group,now)
