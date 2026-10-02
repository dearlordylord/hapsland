import Base
import ./Types.bend as Types
import ./Preparation.bend as Preparation
import ./Driver.bend as Driver
import ./Scheduler.bend as Scheduler
import ./Postprocess.bend as Postprocess
import ./Workload.bend as Workload
import ./Random.bend as Random
import ./Numeric.bend as Numeric
import ../session-bend/Session.bend as Session
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ../agent-flow-bend/Ledger.bend as Ledger

type Transition is Data:
  Transition{state: Types.State, result: Canonical.Step}

def initial(limits: Ledger.Limits) -> Types.State:
  Types.State{Canonical.initial(limits), Nil{}, Scheduler.initial(), Nil{}, Random.streams(1n)}

def settle(graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, result: Canonical.Step) -> Transition:
  match result:
    case Canonical.Advanced{+state, +commands}: Transition{Types.State{state, graphs, scheduler, workloads, random}, Canonical.Advanced{state, commands}}
    case Canonical.Rejected{+state, +reason}: Transition{Types.State{state, graphs, scheduler, workloads, random}, Canonical.Rejected{state, reason}}

def step(state: Types.State, event: Canonical.CanonicalEvent) -> Transition:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random}: settle(graphs, scheduler, workloads, random, Canonical.step(canonical, event))

def canonical(state: Types.State) -> Canonical.State:
  match state:
    case Types.State{canonical, _, _, _, _}: canonical

def graph_step(state: Types.State, key: Types.GraphKey, position: Nat, limits: ImportGraph.Limits, event: ImportGraph.GraphEvent) -> Types.GraphTransition:
  Preparation.step(state, key, position, limits, event)

def retire(state: Types.State, operation: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random}: Types.State{canonical, Preparation.retire_entries(graphs, operation), scheduler, workloads, random}

def handle(state: Types.State, event: Canonical.CanonicalEvent, command: Canonical.Command, context: Driver.Context) -> Driver.Handled:
  Driver.handle(canonical(state), event, command, context)

def edit(state: Types.State, partition: Nat, lifetime: Nat) -> Driver.EditPlan:
  Driver.edit(canonical(state), partition, lifetime)

def preparation_completed(partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit_bytes: List<&2, Nat>, delay: Nat) -> Driver.Action:
  Driver.preparation_completed(partition, lifetime, round, operation, unit_bytes, delay)

def after(before: Types.State, state: Types.State, event: Canonical.CanonicalEvent) -> List<&2, Driver.Action>:
  Postprocess.actions(canonical(before), canonical(state), event)

type Taken is Data:
  Taken{state: Types.State, entry: Maybe<&2, Scheduler.Entry>}

def enqueue(state: Types.State, at: Nat, order: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random}: Types.State{canonical, graphs, Scheduler.enqueue(scheduler, at, order), workloads, random}

def take_result(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, workloads: List<&2, Workload.Advicee>, random: Random.State, taken: Scheduler.Taken) -> Taken:
  match taken:
    case Scheduler.Taken{scheduler, entry}: Taken{Types.State{canonical, graphs, scheduler, workloads, random}, entry}

def take(state: Types.State) -> Taken:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random}: take_result(canonical, graphs, workloads, random, Scheduler.take(scheduler))

def queued(state: Types.State) -> List<&2, Scheduler.Entry>:
  match state:
    case Types.State{_, _, scheduler, _, _}: Scheduler.entries(scheduler)

def cancel(state: Types.State, order: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random}: Types.State{canonical, graphs, Scheduler.cancel(scheduler, order), workloads, random}

def fence(state: Types.State, event: Canonical.CanonicalEvent, generated: Bool, context: Driver.Context) -> Canonical.CanonicalEvent:
  Driver.fence(canonical(state), event, generated, context)

def preparation_fact_time(delay: Nat, index: Nat, count: Nat) -> Nat:
  Driver.fact_time(delay, index, count)

def revalidate(state: Types.State, context: Driver.Context) -> List<&2, Driver.Action>:
  Driver.revalidate(canonical(state), context)

def clock(state: Types.State) -> Nat:
  match state:
    case Types.State{_, _, scheduler, _, _}: Scheduler.clock(scheduler)

def configure_seed(state: Types.State, seed: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, _}: Types.State{canonical, graphs, scheduler, workloads, Random.streams(seed)}

def configure_workload(state: Types.State, partition: Nat, profile: Workload.Profile) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random}: Types.State{canonical, graphs, scheduler, Workload.configure(workloads, partition, profile), random}

type WorkloadTransition is Data:
  WorkloadTransition{state: Types.State, events: List<&2, Workload.Emission>, valid: Bool}

def workload_changed(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, random: Random.State, changed: Workload.Changed) -> WorkloadTransition:
  match changed:
    case Workload.Changed{workloads, events, valid}: WorkloadTransition{Types.State{canonical, graphs, scheduler, workloads, random}, events, valid}

def workload_action(state: Types.State, partition: Nat, action: Workload.Action) -> WorkloadTransition:
  match state:
    case Types.State{canonical, graphs, +scheduler, workloads, random}: workload_changed(canonical, graphs, scheduler, random, Workload.run(workloads, partition, Scheduler.clock(scheduler), action))

def workload_valid(state: Types.State, partition: Nat, generation: Nat, recurring: Bool) -> Bool:
  match state:
    case Types.State{_, _, _, workloads, _}: Workload.valid(workloads, partition, generation, recurring)

def workload_duration(state: Types.State, partition: Nat, fallback: Nat) -> Nat:
  match state:
    case Types.State{_, _, _, workloads, _}: Workload.duration(workloads, partition, fallback)

type OutcomeTransition is Data:
  OutcomeTransition{state: Types.State, outcome: Nat}

def sampled_outcome(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, streams: Random.State, sample: Random.Sampled) -> OutcomeTransition:
  match sample:
    case Random.Sampled{random, outcome}: OutcomeTransition{Types.State{canonical, graphs, scheduler, workloads, Random.set_outcomes(streams, random)}, outcome}

def sample_outcome(state: Types.State, weights: List<&2, Numeric.Words>) -> OutcomeTransition:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, +random}: sampled_outcome(canonical, graphs, scheduler, workloads, random, Random.sample(Random.outcomes(random), weights))

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
    case Types.State{_, _, scheduler, workloads, _}: Workload.pre_timing(workloads, partition, Scheduler.clock(scheduler), provided, fallback, lifetime)

def pre_issue(state: Types.State, facts: Workload.PermitFacts) -> Driver.Handled:
  match state:
    case Types.State{_, _, scheduler, workloads, _}: Workload.issue(workloads, Scheduler.clock(scheduler), facts)

def permit_actions(state: Types.State, capture: Workload.PermitCapture) -> Driver.Handled:
  Workload.post_actions(capture, clock(state))

def session_delay(settings: Session.Config, random: U32) -> U32:
  Session.sample_delay(settings, random)
