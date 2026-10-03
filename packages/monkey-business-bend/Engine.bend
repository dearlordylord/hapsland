import Base
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

def initial(limits: Ledger.Limits) -> Types.State:
  Types.State{Canonical.initial(limits), Nil{}, Scheduler.initial(), Nil{}, Random.streams(1n), Advicees.initial(), CredentialFacts.initial(), Nil{}, Nil{}, Nil{}, Nil{}, Nil{}}

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

def settle(graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, result: Canonical.Step, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, +event: Canonical.CanonicalEvent) -> Transition:
  match result:
    case Canonical.Advanced{+state, +commands}: Transition{Types.State{state, Preparation.retained(graphs, state), scheduler, workloads, random, advicees, retained_credentials(captured_commands(commands, credentials), state), AdmissionAttempts.consumed(opening, event), retirements(PendingEffects.consumed(retiring, event), state), lifecycle_accepted(lifecycles, state, event), preparations, activity_scopes}, Canonical.Advanced{state, commands}}
    case Canonical.Rejected{+state, +reason}: Transition{Types.State{state, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}, Canonical.Rejected{state, reason}}

def prepared_remaining(settlement: AdviceeLifecycleCleanup.PreparedSettlement) -> List<&2, AdviceeLifecycleCleanup.CapturedPreparation>:
  match settlement:
    case AdviceeLifecycleCleanup.PreparedSettlement{remaining, _}: remaining

def prepared_actions(settlement: AdviceeLifecycleCleanup.PreparedSettlement) -> List<&2, Driver.Action>:
  match settlement:
    case AdviceeLifecycleCleanup.PreparedSettlement{_, actions}: actions

def step(state: Types.State, +event: Canonical.CanonicalEvent) -> Transition:
  match state:
    case Types.State{+canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}: settle(graphs, scheduler, workloads, random, Canonical.step(canonical, event), advicees, credentials, opening, retiring, lifecycles, prepared_remaining(AdviceeLifecycleCleanup.settle_preparations(preparations, canonical, event)), activity_scopes, event)

def canonical(state: Types.State) -> Canonical.State:
  match state:
    case Types.State{canonical, _, _, _, _, _, _, _, _, _, _, _}: canonical

def graph_step(state: Types.State, key: Types.GraphKey, position: Nat, limits: ImportGraph.Limits, event: ImportGraph.GraphEvent) -> Types.GraphTransition:
  Preparation.step(state, key, position, limits, event)

def credential_state(state: Types.State) -> CredentialFacts.State:
  match state:
    case Types.State{_, _, _, _, _, _, credentials, _, _, _, _, _}: credentials

def handle(+state: Types.State, +event: Canonical.CanonicalEvent, command: Canonical.Command, context: Driver.Context) -> Driver.Handled:
  Driver.handle(canonical(state), event, command, CredentialContext.apply(credential_state(state), event, context))

def edit(state: Types.State, partition: Nat, lifetime: Nat) -> Driver.EditPlan:
  Driver.edit(canonical(state), partition, lifetime)

def preparation_completed(partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit_bytes: List<&2, Nat>, delay: Nat) -> Driver.Action:
  Driver.preparation_completed(partition, lifetime, round, operation, unit_bytes, delay)

def after(before: Types.State, state: Types.State, +event: Canonical.CanonicalEvent) -> List<&2, Driver.Action>:
  match before:
    case Types.State{+previous, _, _, _, _, _, _, _, _, _, captures, _}:
      List.append(&2, Driver.Action, Postprocess.actions(previous, canonical(state), event), prepared_actions(AdviceeLifecycleCleanup.settle_preparations(captures, previous, event)))

type Taken is Data:
  Taken{state: Types.State, entry: Maybe<&2, Scheduler.Entry>}

def enqueue(state: Types.State, at: Nat, order: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}: Types.State{canonical, graphs, Scheduler.enqueue(scheduler, at, order), workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}

def take_result(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, workloads: List<&2, Workload.Advicee>, random: Random.State, taken: Scheduler.Taken, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>) -> Taken:
  match taken:
    case Scheduler.Taken{scheduler, entry}: Taken{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}, entry}

def take(state: Types.State) -> Taken:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}: take_result(canonical, graphs, workloads, random, Scheduler.take(scheduler), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes)

def queued(state: Types.State) -> List<&2, Scheduler.Entry>:
  match state:
    case Types.State{_, _, scheduler, _, _, _, _, _, _, _, _, _}: Scheduler.entries(scheduler)

def cancel(state: Types.State, order: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}: Types.State{canonical, graphs, Scheduler.cancel(scheduler, order), workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}

def fence(+state: Types.State, +event: Canonical.CanonicalEvent, generated: Bool, context: Driver.Context) -> Canonical.CanonicalEvent:
  Driver.fence(canonical(state), event, generated, CredentialContext.apply(credential_state(state), event, context))

def preparation_fact_time(delay: Nat, index: Nat, count: Nat) -> Nat:
  Driver.fact_time(delay, index, count)

def revalidate(state: Types.State, context: Driver.Context) -> List<&2, Driver.Action>:
  Driver.revalidate(canonical(state), context)

def clock(state: Types.State) -> Nat:
  match state:
    case Types.State{_, _, scheduler, _, _, _, _, _, _, _, _, _}: Scheduler.clock(scheduler)

def configure_seed(state: Types.State, seed: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, _, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}: Types.State{canonical, graphs, scheduler, workloads, Random.streams(seed), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}

def configure_workload(state: Types.State, partition: Nat, profile: Workload.Profile) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}: Types.State{canonical, graphs, scheduler, Workload.configure(workloads, partition, profile), random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}

type WorkloadTransition is Data:
  WorkloadTransition{state: Types.State, events: List<&2, Workload.Emission>, valid: Bool}

def workload_changed(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, random: Random.State, changed: Workload.Changed, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>) -> WorkloadTransition:
  match changed:
    case Workload.Changed{workloads, events, valid}: WorkloadTransition{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}, events, valid}

def workload_action(state: Types.State, partition: Nat, action: Workload.Action) -> WorkloadTransition:
  match state:
    case Types.State{canonical, graphs, +scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}: workload_changed(canonical, graphs, scheduler, random, Workload.run(workloads, partition, Scheduler.clock(scheduler), action), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes)

def workload_valid(state: Types.State, partition: Nat, generation: Nat, recurring: Bool) -> Bool:
  match state:
    case Types.State{_, _, _, workloads, _, _, _, _, _, _, _, _}: Workload.valid(workloads, partition, generation, recurring)

def workload_duration(state: Types.State, partition: Nat, fallback: Nat) -> Nat:
  match state:
    case Types.State{_, _, _, workloads, _, _, _, _, _, _, _, _}: Workload.duration(workloads, partition, fallback)

type OutcomeTransition is Data:
  OutcomeTransition{state: Types.State, outcome: Nat}

def sampled_outcome(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, streams: Random.State, sample: Random.Sampled, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>) -> OutcomeTransition:
  match sample:
    case Random.Sampled{random, outcome}: OutcomeTransition{Types.State{canonical, graphs, scheduler, workloads, Random.set_outcomes(streams, random), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}, outcome}

def sample_outcome(state: Types.State, weights: List<&2, Numeric.Words>) -> OutcomeTransition:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, +random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}: sampled_outcome(canonical, graphs, scheduler, workloads, random, Random.sample(Random.outcomes(random), weights), advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes)

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
    case Types.State{_, _, scheduler, workloads, _, _, _, _, _, _, _, _}: Workload.pre_timing(workloads, partition, Scheduler.clock(scheduler), provided, fallback, lifetime)

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

def declared_state(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, credentials: CredentialFacts.State, declared: Advicees.Declared, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>) -> AdviceeDeclared:
  match declared:
    case Advicees.Declared{advicees, +scope, valid}:
      AdviceeDeclared{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, declared_lifecycle(lifecycles, scope), preparations, declared_activity(activity_scopes, scope)}, scope, valid}

def declare_advicee(state: Types.State, identity: Nat, seed: U32) -> AdviceeDeclared:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}:
      declared_state(canonical, graphs, scheduler, workloads, random, credentials, Advicees.declare(advicees, identity, seed), opening, retiring, lifecycles, preparations, activity_scopes)

def advicee_identity(state: Types.State, identity: Nat) -> Maybe<&2, Advicees.Scope>:
  match state:
    case Types.State{_, _, _, _, _, advicees, _, _, _, _, _, _}: Advicees.lookup_identity(advicees, identity)

def advicee_partition(state: Types.State, partition: Nat) -> Maybe<&2, Advicees.Scope>:
  match state:
    case Types.State{_, _, _, _, _, advicees, _, _, _, _, _, _}: Advicees.lookup_partition(advicees, partition)

def advicee_targets(state: Types.State, identity: Maybe<&2, Nat>) -> Advicees.Targeted:
  match state:
    case Types.State{_, _, _, _, _, advicees, _, _, _, _, _, _}: Advicees.targets(advicees, identity)

def credentials(state: Types.State) -> CredentialFacts.State:
  match state:
    case Types.State{_, _, _, _, _, _, credentials, _, _, _, _, _}: credentials

def configure_credentials(state: Types.State, available: Bool, generation: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}:
      Types.State{canonical, graphs, scheduler, workloads, random, advicees, CredentialFacts.configure(credentials, available, generation), opening, retiring, lifecycles, preparations, activity_scopes}

def changed_credentials(credentials: CredentialFacts.State, available: Bool, rotation: Bool) -> CredentialFacts.State:
  match rotation:
    case True{}: CredentialFacts.rotate(credentials)
    case False{}: CredentialFacts.availability(credentials, available)

def credential_action(state: Types.State, available: Bool, rotation: Bool) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}:
      Types.State{canonical, graphs, scheduler, workloads, random, advicees, changed_credentials(credentials, available, rotation), opening, retiring, lifecycles, preparations, activity_scopes}

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

def attempted_edit(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, advicees: Advicees.Registry, credentials: CredentialFacts.State, attempt: AdmissionAttempts.Attempt, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>) -> EditAttempt:
  match attempt:
    case AdmissionAttempts.Attempt{opening, plan}:
      EditAttempt{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}, plan}

def edit_attempt(state: Types.State, +partition: Nat, lifetime: Nat) -> EditAttempt:
  match state:
    case Types.State{+canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}:
      attempted_edit(canonical, graphs, scheduler, workloads, random, advicees, credentials, AdmissionAttempts.edit(canonical, opening, partition, lifetime), retiring, lifecycles, preparations, activity_scopes)

type IssuedActions is Data:
  IssuedActions{state: Types.State, actions: List<&2, Driver.Action>}

def issued_effects(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, issued: PendingEffects.Issued, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>) -> IssuedActions:
  match issued:
    case PendingEffects.Issued{retiring, actions}:
      IssuedActions{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}, actions}

def issue_actions(state: Types.State, actions: List<&2, Driver.Action>) -> IssuedActions:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes}:
      issued_effects(canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, PendingEffects.issue(retiring, actions), lifecycles, preparations, activity_scopes)

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
    case Types.State{_, _, _, _, _, _, _, _, _, lifecycles, _, _}: lifecycles

def lifecycle_entry(state: Types.State, partition: Nat) -> Maybe<&2, AdviceeLifecycle.Entry>:
  AdviceeLifecycle.lookup(lifecycle_entries(state), partition)

def activity_scope(state: Types.State, partition: Nat) -> Maybe<&2, Nat>:
  match state:
    case Types.State{_, _, _, _, _, _, _, _, _, _, _, scopes}: AdviceeActivity.lookup(scopes, partition)

def activity_valid(state: Types.State, partition: Nat, incarnation: Nat) -> Bool:
  match state:
    case Types.State{_, _, _, _, _, _, _, _, _, entries, _, scopes}: AdviceeActivity.valid(scopes, entries, partition, incarnation)

def activity_lifetime(state: Types.State, partition: Nat) -> Nat:
  match state:
    case Types.State{canonical, _, _, _, _, _, _, _, _, entries, _, _}: AdviceeActivity.lifetime(canonical, entries, partition)

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
    case WorkloadTransition{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, _, captures, scopes}, events, _} AdviceeLifecycle.Changed{+entries, +previous, +current, +valid} AdviceeLifecycleCleanup.CleanupPlan{actions, operations, +preparations}:
      LifecycleTransition{Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, lifecycle_opening(lifecycle_changed_activity(valid, previous, current), opening, partition), retiring, entries, List.append(&2, AdviceeLifecycleCleanup.CapturedPreparation, captures, preparations), lifecycle_scopes(valid && lifecycle_resumed(previous, current), scopes, partition)}, AdviceeLifecycle.Changed{entries, previous, current, valid}, AdviceeLifecycleCleanup.CleanupPlan{actions, operations, preparations}, events}

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

def lifecycle_action(+state: Types.State, +partition: Nat, action: AdviceeLifecycle.Action) -> LifecycleTransition:
  lifecycle_changed(state, partition, lifecycle_requested(AdviceeActivity.synchronize(lifecycle_entries(state), canonical(state), partition), partition, action, activity_scope(state, partition)))

def permit_issue(capture: PermitScenario.Capture, now: Nat) -> Canonical.CanonicalEvent:
  PermitScenario.issue(capture, now)

def permit_issued(capture: PermitScenario.Capture, token: Nat) -> List<&2, PermitScenario.Fact>:
  PermitScenario.issued(capture, token)

def permit_consumed(state: Types.State, command: Canonical.Command, partition: Nat, lifetime: Nat) -> List<&2, PermitScenario.Fact>:
  PermitScenario.consumed(canonical(state), command, partition, lifetime)
