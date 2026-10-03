import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../Advicees.bend as Advicees
import ../AdviceeScope.bend as Scope
import ../AdviceeLifecycle.bend as Lifecycle
import ../AdviceeLifecycleCleanup.bend as Cleanup
import ../Scheduler.bend as Scheduler
import ../Callbacks.bend as Callbacks
import ../TreeFacts.bend as TreeFacts
import ../PreparationScenario.bend as Preparation
import ../Workload.bend as Workload
import ../Session.bend as Session
import ../CacheRuntime.bend as CacheRuntime
import ../SharingRuntime.bend as SharingRuntime
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/Dispatch.bend as Dispatch
import ./minimal-scenario.bend as Minimal

# One source-free input stream, resident, queue and clock. Job facts are payload
# storage only; actual Driver actions and Canonical commands own the lifecycle.
type Job is Data:
  Job{partition: Nat, lifetime: Nat, bytes: Nat, units: List<&2, Nat>, outcome: Canonical.RequestOutcome}
type Stored is Data:
  Stored{operation: Nat, job: Job}
type Input is Data:
  Edit{job: Job}
  Event{action: Driver.Action, job: Job}
  Fact{partition: Nat, lifetime: Nat, round: Nat, operation: Nat, position: Nat, event: Graph.GraphEvent}
  Arrival{event: Workload.Emission, lifetime: Nat}
  Cache{fact: CacheRuntime.Fact, job: Job}
  Missing{}
type Item is Data:
  Item{at: Nat, order: Nat, input: Input}
type Queue is Data:
  Queue{items: List<&2, Item>, sequence: Nat, synced: Nat}
type Stage is Data:
  Started{}
  Departed{}
  Resumed{}
type Runtime is Data:
  Runtime{state: Types.State, queue: Queue, jobs: List<&2, Stored>, delay: Nat}

# Candidate transport boundary: carry shared state behind a recursive list
# through scheduler continuations. Lowering benefit is unvalidated.
# Edge.Runtime remains unchanged for external fixture consumers.
type Carrier is Data:
  Carrier{states: List<&2, Types.State>, queue: Queue, jobs: List<&2, Stored>, delay: Nat}

def carrier(runtime: Runtime) -> Carrier:
  match runtime:
    case Runtime{state,queue,jobs,delay}: Carrier{[state],queue,jobs,delay}

type Initialized is Data:
  Initialized{state: Types.State, queue: Queue}

def job_partition(job: Job) -> Nat:
  match job:
    case Job{partition, _, _, _, _}: partition

def maybe_owner(owner: Maybe<&2, Nat>) -> Nat:
  match owner:
    case Some{partition}: partition
    case None{}: 0n

def found_job(found: Bool, job: Job, tail: Job) -> Job:
  match found:
    case True{}: job
    case False{}: tail

def remember(command: Canonical.Command, jobs: List<&2, Stored>, job: Job) -> List<&2, Stored>:
  match command:
    case Canonical.ObservationAdmitted{operation}: Stored{operation, job} <> jobs
    case Canonical.Prepare{operation, _}: Stored{operation, job} <> jobs
    case Canonical.UnitAdmitted{operation, _, _, _, _}: Stored{operation, job} <> jobs
    case _: jobs

def append(queue: Queue, at: Nat, input: Input) -> Queue:
  match queue:
    case Queue{items, +sequence, synced}:
      Queue{List.append(&2, Item, items, [Item{at, sequence, input}]), Nat.add(sequence, 1n), synced}

def round_value(round: Maybe<&2, Canonical.Round>) -> Nat:
  match round:
    case Some{Canonical.Round{_, _, id, _, _, _, _, _}}: id
    case None{}: 0n

def graph_limits() -> Graph.Limits:
  Graph.Limits{1n, 262144n, 20480n, 8n, 1572864n, 16n, 4n, 128n}

def tree_profile() -> TreeFacts.Profile:
  TreeFacts.Profile{1n, 1n, 0n, 3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 100n, 100n, 20n, 20n}

def state_counts(state: Canonical.State) -> List<&2, Nat>:
  match state:
    case Canonical.State{Ledger.Ledger{_, _, +charges}, _, _, _, _, _, Dispatch.State{_, running, _, _, requests}, _, _}:
      List.append(&2, Nat, Minimal.usage_counts(Ledger.total(charges)),
        List.append(&2, Nat, Minimal.usage_counts(Ledger.partition_usage(charges, 1n)),
          List.append(&2, Nat, Minimal.usage_counts(Ledger.partition_usage(charges, 2n)),
            [Dispatch.preparation_count(running), List.length(&2, Dispatch.Request, requests)])))

def event_code(event: Canonical.CanonicalEvent) -> Nat:
  match event:
    case Canonical.RetirePartition{_, _, _}: 27n
    case Canonical.DiscardDispatch{_}: 28n
    case Canonical.ClosePermitRound{_, _, _, _}: 29n
    case Canonical.ForgetAdmission{_, _}: 30n
    case Canonical.StopPolled{_, _, _, _}: 26n
    case Canonical.JevRequestInterrupted{_, _, _, _, _}: 25n
    case event: Minimal.event_code(event)

def identity(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.RetirePartition{p, l, r}: [p, l, r, 0n, 0n, 0n, 0n]
    case Canonical.DiscardDispatch{_}: [0n, 0n, 0n, 0n, 0n, 0n, 0n]
    case Canonical.ClosePermitRound{p, l, r, _}: [p, l, r, 0n, 0n, 0n, 0n]
    case Canonical.ForgetAdmission{p, l}: [p, l, 0n, 0n, 0n, 0n, 0n]
    case Canonical.StopPolled{p, l, r, _}: [p, l, r, 0n, 0n, 0n, 0n]
    case Canonical.JevRequestInterrupted{p, l, r, o, request}: [p, l, r, o, request, 0n, 0n]
    case event: Minimal.event_identity(event)

def event_facts(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.StopPolled{_, _, _, deadline}: [Bool.pick(Nat, deadline, 1n, 0n), 0n, 0n, 0n, 0n, 0n]
    case event: Minimal.event_facts(event)

def command_code(command: Canonical.Command) -> Nat:
  match command:
    case Canonical.PartitionRetired{_}: 34n
    case Canonical.DispatchDiscarded{_, _}: 35n
    case Canonical.PermitRoundClosed{_}: 36n
    case Canonical.PermitReleased{}: 37n
    case Canonical.AdmissionForgotten{}: 38n
    case Canonical.JevObservationIgnored{}: 31n
    case Canonical.FinishReady{}: 32n
    case Canonical.CancelWork{_}: 33n
    case Canonical.JevRequestUnavailable{}: 29n
    case Canonical.JevInterruptionRecorded{}: 30n
    case command: Minimal.command_code(command)

def command_id(command: Canonical.Command) -> Nat:
  match command:
    case Canonical.PartitionRetired{id}: id
    case Canonical.DispatchDiscarded{id, _}: id
    case Canonical.PermitRoundClosed{id}: id
    case Canonical.CancelWork{id}: id
    case Canonical.RoundStarted{id}: id
    case Canonical.ObservationAdmitted{id}: id
    case Canonical.DispatchStarted{id, _}: id
    case Canonical.Prepare{id, _}: id
    case Canonical.UnitAdmitted{id, _, _, _, _}: id
    case Canonical.JevRequestIssued{_, _, _, _, id}: id
    case Canonical.PreparationReleased{id, _}: id
    case Canonical.ReservationReleased{id}: id
    case _: 0n

def lookup_if(found: Bool, input: Input, tail: Input) -> Input:
  match found:
    case True{}: input
    case False{}: tail

def keep(found: Bool, item: Item, tail: List<&2, Item>) -> List<&2, Item>:
  match found:
    case True{}: tail
    case False{}: item <> tail

def sync_if(fresh: Bool, state: Types.State, at: Nat, order: Nat) -> Types.State:
  match fresh:
    case True{}: Engine.enqueue(state, at, order)
    case False{}: state

def declared(declared: Engine.AdviceeDeclared) -> Types.State:
  match declared:
    case Engine.AdviceeDeclared{state, _, _}: state

def profile(seed: U32, bytes: Nat, units: List<&2, Nat>) -> Workload.Profile:
  Workload.Profile{Session.Settings{1000000, 0, 1000, 500, 0, 300}, seed, [], bytes, units, None{}}


def lookup_job(jobs: List<&2, Stored>, +operation: Nat, +fallback: Job) -> Job:
  match jobs:
    case Nil{}: fallback
    case Stored{id, job} <> tail:
      found_job(Nat.is_eq(id, operation), job, lookup_job(tail, operation, fallback))

def action_append(action: Driver.Action, queue: Queue,
    now: Nat, job: Job, ih: Queue -> Queue) -> Queue:
  match action:
    case Driver.Action{event, +delay, candidate, binding, expiry}:
      ih(append(queue, Nat.add(now, delay), Event{Driver.Action{event, delay, candidate, binding, expiry}, job}))

def round(state: Canonical.State, partition: Nat) -> Nat:
  match state:
    case Canonical.State{_, rounds, _, _, _, _, _, _, _}:
      round_value(Canonical.find_round(partition, rounds))

def facts_with(events: List<&2,Graph.GraphEvent>, queue: Queue, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +now: Nat, +position: Nat, +count: Nat, +delay: Nat) -> Queue:
  match events:
    case []: queue
    case event <> tail:
      facts_with(tail,append(queue,Nat.add(now,Engine.preparation_fact_time(delay,position,count)),
        Fact{partition,lifetime,round,operation,position,event}),partition,lifetime,round,operation,now,Nat.add(position,1n),count,delay)

def facts(events: List<&2,Graph.GraphEvent>, queue: Queue, partition: Nat, lifetime: Nat,
    round: Nat, operation: Nat, now: Nat, position: Nat, count: Nat) -> Queue:
  facts_with(events,queue,partition,lifetime,round,operation,now,position,count,2n)

def command_rows(list: List<&2, Canonical.Command>, +before: Types.State, +after: Types.State,
    +provided: Nat) -> List<&2, Nat>:
  match list:
    case Nil{}: []
    case +head <> tail:
      command_code(head) <> maybe_owner(Engine.scope_command(before, after, head, Some{provided})) <>
        command_id(head) <> command_rows(tail, before, after, provided)

def graph_result(transition: Types.GraphTransition, queue: Queue, jobs: List<&2, Stored>,
    +partition: Nat, +operation: Nat, now: Nat, delay: Nat,
    ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match transition:
    case Types.GraphTransition{+state, _, Graph.BoundedStep{graph, command}}:
      (21n <> now <> partition <> operation <> List.append(&2, Nat, Minimal.graph_row(graph, command, 0n), state_counts(Engine.canonical(state)))) <>
        ih(Runtime{state, queue, jobs, delay})
    case Types.GraphRejected{_}: [[97n]]

def retry_edit(retry: Bool, queue: Queue, now: Nat, job: Job) -> Queue:
  match retry:
    case True{}: append(queue, now, Edit{job})
    case False{}: queue

def lookup(items: List<&2, Item>, +order: Nat) -> Input:
  match items:
    case Nil{}: Missing{}
    case Item{_, id, input} <> tail: lookup_if(Nat.is_eq(id, order), input, lookup(tail, order))

def remove(items: List<&2, Item>, +order: Nat) -> List<&2, Item>:
  match items:
    case Nil{}: []
    case Item{at, +id, input} <> tail:
      keep(Nat.is_eq(id, order), Item{at, id, input}, remove(tail, order))

def sync(items: List<&2, Item>, state: Types.State, +synced: Nat) -> Types.State:
  match items:
    case Nil{}: state
    case Item{at, +order, _} <> tail: sync(tail, sync_if(Nat.is_le(synced, order), state, at, order), synced)

def configured() -> Types.State:
  Engine.configure_workload(Engine.configure_workload(declared(Engine.declare_advicee(
    declared(Engine.declare_advicee(Engine.configure_seed(Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}), 7n),
      Nat.add(U32.to_nat(4294967295), 18n), 11)), 99n, 12)),
    1n, profile(11, 10n, [5n])), 2n, profile(12, 20n, [7n]))


def command_job(command: Canonical.Command, jobs: List<&2, Stored>, fallback: Job) -> Job:
  match command:
    case Canonical.DispatchStarted{operation, _}: lookup_job(jobs, operation, fallback)
    case Canonical.JevRequestIssued{_, _, _, operation, _}: lookup_job(jobs, operation, fallback)
    case _: fallback

def actions(list: List<&2, Driver.Action>, queue: Queue, +now: Nat, +job: Job) -> Queue:
  match list:
    case Nil{}: queue
    case action <> tail: action_append(action, queue, now, job, q => actions(tail, q, now, job))

# Captured environment facts for the same interpreter. These are transport,
# timing and tree inputs, never review/admission/routing eligibility decisions.
type Environment is Data:
  Environment{seed: Nat, tree: TreeFacts.Profile, graph: Graph.Limits,
    preparation_delay: Nat, output_delay: Nat, output_lease: Nat}

def default_environment() -> Environment:
  Environment{7n,tree_profile(),graph_limits(),2n,0n,30n}

def environment_graph(environment: Environment) -> Graph.Limits:
  match environment:
    case Environment{_,_,graph,_,_,_}: graph

def context_with(environment: Environment, state: Types.State, job: Job, delay: Nat,
    candidate: Maybe<&2,Driver.Candidate>) -> Driver.Context:
  match environment job:
    case Environment{_,_,_,_,output_delay,output_lease} Job{+partition,+lifetime,bytes,_,outcome}:
      Driver.Context{partition,lifetime,round(Engine.canonical(state),partition),bytes,True{},delay,
        outcome,True{},True{},True{},True{},600000n,candidate,True{},True{},True{},True{},
        output_delay,output_lease,True{},True{}}

def context(state: Types.State, job: Job, delay: Nat, candidate: Maybe<&2,Driver.Candidate>) -> Driver.Context:
  context_with(default_environment(),state,job,delay,candidate)

def canonical_row(+before: Types.State, +after: Types.State, +event: Canonical.CanonicalEvent,
    +provided: Nat, now: Nat, rejected: Nat, commands: List<&2, Canonical.Command>) -> List<&2, Nat>:
  event_code(event) <> now <> maybe_owner(Engine.scope_event(before, after, event, Some{provided})) <>
    List.append(&2, Nat, identity(event), List.append(&2, Nat, event_facts(event),
      List.append(&2, Nat, state_counts(Engine.canonical(after)), rejected <> command_rows(commands, before, after, provided))))


def issued(result: Engine.IssuedActions, queue: Queue, jobs: List<&2, Stored>, now: Nat, job: Job, delay: Nat) -> Runtime:
  match result:
    case Engine.IssuedActions{state, events}: Runtime{state, actions(events, queue, now, job), jobs, delay}

def handled(result: Driver.Handled, state: Types.State, queue: Queue, jobs: List<&2, Stored>, now: Nat, job: Job, delay: Nat) -> Runtime:
  match result:
    case Driver.Handled{_, events}: issued(Engine.issue_actions(state, events), queue, jobs, now, job, delay)


def generated_with(generated: Preparation.Generated, queue: Queue, +now: Nat,
    +operation: Nat, +round: Nat, job: Job, +preparation_delay: Nat) -> Queue:
  match generated job:
    case Preparation.Generated{_,+events,_,True{},_,_} Job{+partition,+lifetime,bytes,+units,outcome}:
      actions([Engine.preparation_completed(partition,lifetime,round,operation,units,preparation_delay)],
        facts_with(events,queue,partition,lifetime,round,operation,now,0n,List.length(&2,Graph.GraphEvent,events),preparation_delay),
        now,Job{partition,lifetime,bytes,units,outcome})
    case _ _: queue

def generated(generated: Preparation.Generated, queue: Queue, now: Nat,
    operation: Nat, round: Nat, job: Job) -> Queue:
  generated_with(generated,queue,now,operation,round,job,2n)

def continued(runtime: Runtime, +before: Types.State,
    +event: Canonical.CanonicalEvent, +job: Job, +now: Nat, +delay: Nat,
    list: List<&2, Canonical.Command>, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match runtime:
    case Runtime{+state, queue, jobs, _}: canonical_row(before, state, event, job_partition(job), now, 0n, list) <>
      ih(Runtime{state, actions(Engine.after(before, state, event), queue, now, job), jobs, delay})

def edit_plan(attempt: Engine.EditAttempt, queue: Queue, jobs: List<&2, Stored>,
    +job: Job, +now: Nat, delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match attempt:
    case Engine.EditAttempt{state, Driver.EditPlan{retry, emitted}}:
      ih(Runtime{state, retry_edit(retry, actions(emitted, queue, now, job), now, job), jobs, delay})

# Invoke the supplied owner once before factual transport. Prepare's generated
# tree remains the existing environmental fallback only for an unhandled command.
def interpreted_with(result: Driver.Handled, environment: Environment, value: Canonical.Command,
    +state: Types.State, queue: Queue, jobs: List<&2,Stored>, +now: Nat, +job: Job, delay: Nat) -> Runtime:
  match result environment value:
    case Driver.Handled{False{},Nil{}} Environment{seed,tree,graph,preparation_delay,_,_} Canonical.Prepare{+operation,_}:
      Runtime{state,generated_with(Engine.generate_tree(seed,operation,0n,tree,graph),queue,
        now,operation,round(Engine.canonical(state),job_partition(job)),job,preparation_delay),jobs,delay}
    case result _ _:
      handled(result,state,queue,jobs,now,job,delay)

def interpret_with_handler(+environment: Environment, +value: Canonical.Command, +state: Types.State,
    event: Canonical.CanonicalEvent, queue: Queue, jobs: List<&2,Stored>, now: Nat,
    +job: Job, +delay: Nat, candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> Runtime:
  interpreted_with(handler(state,event,value,context_with(environment,state,job,delay,candidate)),
    environment,value,state,queue,jobs,now,job,delay)

def default_handler(state: Types.State, event: Canonical.CanonicalEvent,
    command: Canonical.Command, context: Driver.Context) -> Driver.Handled:
  Engine.handle(state,event,command,context)

def interpret_with(environment: Environment, value: Canonical.Command, state: Types.State,
    event: Canonical.CanonicalEvent, queue: Queue, jobs: List<&2,Stored>, now: Nat,
    job: Job, delay: Nat, candidate: Maybe<&2,Driver.Candidate>) -> Runtime:
  interpret_with_handler(environment,value,state,event,queue,jobs,now,job,delay,candidate,
    state => event => command => context => default_handler(state,event,command,context))

def interpret(value: Canonical.Command, state: Types.State, event: Canonical.CanonicalEvent,
    queue: Queue, jobs: List<&2,Stored>, now: Nat, job: Job, delay: Nat,
    candidate: Maybe<&2,Driver.Candidate>) -> Runtime:
  interpret_with(default_environment(),value,state,event,queue,jobs,now,job,delay,candidate)

def command_interpret_with_handler(environment: Environment, +command: Canonical.Command,
    +state: Types.State, event: Canonical.CanonicalEvent, queue: Queue, +jobs: List<&2,Stored>,
    now: Nat, +job: Job, delay: Nat, candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> Runtime:
  +actual=command_job(command,jobs,job)
  interpret_with_handler(environment,command,state,event,queue,remember(command,jobs,actual),now,actual,delay,candidate,handler)

def command_interpret_with(environment: Environment, command: Canonical.Command,
    state: Types.State, event: Canonical.CanonicalEvent, queue: Queue, jobs: List<&2,Stored>,
    now: Nat, job: Job, delay: Nat, candidate: Maybe<&2,Driver.Candidate>) -> Runtime:
  command_interpret_with_handler(environment,command,state,event,queue,jobs,now,job,delay,candidate,
    state => event => command => context => default_handler(state,event,command,context))

def command_step_with(environment: Environment, command: Canonical.Command,
    state: Types.State, event: Canonical.CanonicalEvent, queue: Queue, jobs: List<&2,Stored>,
    now: Nat, job: Job, delay: Nat, candidate: Maybe<&2,Driver.Candidate>, ih: Runtime -> Runtime) -> Runtime:
  ih(command_interpret_with(environment,command,state,event,queue,jobs,now,job,delay,candidate))

def command_step(command: Canonical.Command, state: Types.State, event: Canonical.CanonicalEvent,
    queue: Queue, jobs: List<&2,Stored>, now: Nat, job: Job, delay: Nat,
    candidate: Maybe<&2,Driver.Candidate>, ih: Runtime -> Runtime) -> Runtime:
  command_step_with(default_environment(),command,state,event,queue,jobs,now,job,delay,candidate,ih)

def commands(list: List<&2, Canonical.Command>, runtime: Runtime, +event: Canonical.CanonicalEvent,
    +now: Nat, +job: Job, +candidate: Maybe<&2, Driver.Candidate>) -> Runtime:
  match list runtime:
    case Nil{} runtime: runtime
    case head <> tail Runtime{state, queue, jobs, delay}:
      command_step(head, state, event, queue, jobs, now, job, delay, candidate,
        next => commands(tail, next, event, now, job, candidate))

def transitioned(transition: Engine.Transition, +before: Types.State, +event: Canonical.CanonicalEvent,
    queue: Queue, jobs: List<&2, Stored>, +job: Job, +now: Nat, +delay: Nat,
    candidate: Maybe<&2, Driver.Candidate>, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match transition:
    case Engine.Transition{+state, Canonical.Advanced{_, +list}}:
      continued(commands(list, Runtime{state, queue, jobs, delay}, event, now, job, candidate), before, event, job, now, delay, list, ih)
    case Engine.Transition{+state, Canonical.Rejected{_, _}}:
      canonical_row(before, state, event, job_partition(job), now, 1n, []) <>
        ih(Runtime{state, actions(Engine.after(before, state, event), queue, now, job), jobs, delay})

def job_lifetime(job: Job) -> Nat:
  match job:
    case Job{_, lifetime, _, _, _}: lifetime

def edit_valid(valid: Bool, +state: Types.State, queue: Queue, jobs: List<&2, Stored>,
    +job: Job, now: Nat, delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match valid:
    case True{}: edit_plan(Engine.edit_attempt(state, job_partition(job), job_lifetime(job)), queue, jobs, job, now, delay, ih)
    case False{}: ih(Runtime{state, queue, jobs, delay})

def graph_valid(valid: Bool, +state: Types.State, queue: Queue, jobs: List<&2, Stored>, +p: Nat, l: Nat,
    r: Nat, +op: Nat, position: Nat, event: Graph.GraphEvent, now: Nat, delay: Nat,
    ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match valid:
    case True{}: graph_result(Engine.graph_step(state, Types.GraphKey{p, l, r, op, 0n}, position, graph_limits(), event), queue, jobs, p, op, now, delay, ih)
    case False{}: ih(Runtime{state, queue, jobs, delay})



def emission_append(event: Workload.Emission, queue: Queue, lifetime: Nat, ih: Queue -> Queue) -> Queue:
  match event:
    case Workload.Emission{+at, p, g, k, task, revision, bytes, units, repair, recurring}:
      ih(append(queue, at, Arrival{Workload.Emission{at, p, g, k, task, revision, bytes, units, repair, recurring}, lifetime}))

def life_value(entry: Maybe<&2, Lifecycle.Entry>) -> Nat:
  match entry:
    case Some{Lifecycle.Entry{_, lifetime, _}}: lifetime
    case None{}: 0n

def emission_owner(event: Workload.Emission) -> Nat:
  match event:
    case Workload.Emission{_, owner, _, _, _, _, _, _, _, _}: owner

def emissions(events: List<&2, Workload.Emission>, queue: Queue, +state: Types.State) -> Queue:
  match events:
    case Nil{}: queue
    case +event <> tail:
      emission_append(event, queue, life_value(Engine.lifecycle_entry(state, emission_owner(event))),
        q => emissions(tail, q, state))

def workload_changed(changed: Engine.WorkloadTransition, queue: Queue, jobs: List<&2, Stored>, delay: Nat,
    ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match changed:
    case Engine.WorkloadTransition{+state, events, True{}}: ih(Runtime{state, emissions(events, queue, state), jobs, delay})
    case _: [[97n]]

def arrival_valid(valid: Bool, event: Workload.Emission, +lifetime: Nat, +state: Types.State,
    queue: Queue, jobs: List<&2, Stored>, delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match valid event:
    case False{} _: ih(Runtime{state, queue, jobs, delay})
    case True{} Workload.Emission{_, owner, _, 0, _, _, _, _, _, _}:
      workload_changed(Engine.workload_action(state, owner, Workload.Next{}), queue, jobs, delay, ih)
    case True{} Workload.Emission{at, +owner, _, 1, _, _, bytes, units, _, _}:
      edit_plan(Engine.edit_attempt(state, owner, lifetime), queue, jobs, Job{owner, lifetime, bytes, units, Canonical.RequestFinding{}}, at, delay, ih)
    case True{} _: ih(Runtime{state, queue, jobs, delay})

def arrival_checked(event: Workload.Emission, +lifetime: Nat, +state: Types.State, queue: Queue,
    jobs: List<&2, Stored>, delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match event:
    case Workload.Emission{at, +p, +g, k, task, revision, bytes, units, repair, +recurring}:
      arrival_valid(Engine.activity_valid(state, p, lifetime) && Engine.workload_valid(state, p, g, recurring),
        Workload.Emission{at, p, g, k, task, revision, bytes, units, repair, recurring}, lifetime, state, queue, jobs, delay, ih)

def arrival(+event: Workload.Emission, +lifetime: Nat, +state: Types.State, queue: Queue,
    jobs: List<&2, Stored>, delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  arrival_checked(event, lifetime, state, queue, jobs, delay, ih)

def input(input: Input, +state: Types.State, queue: Queue, jobs: List<&2, Stored>,
    +now: Nat, +delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match input:
    case Edit{+job}: edit_valid(Engine.activity_valid(state, job_partition(job), job_lifetime(job)), state, queue, jobs, job, now, delay, ih)
    case Event{Driver.Action{+event, _, +candidate, _, _}, +job}:
      +fenced = Engine.fence(state, event, True{}, context(state, job, delay, candidate))
      transitioned(Engine.step(state, fenced), state, fenced, queue, jobs, job, now, delay, candidate, ih)
    case Fact{+partition, +lifetime, +round, +operation, position, event}:
      graph_valid(Engine.preparation_active(state, partition, lifetime, round, operation), state, queue, jobs, partition, lifetime, round, operation, position, event, now, delay, ih)
    case Arrival{event, lifetime}: arrival(event, lifetime, state, queue, jobs, delay, ih)
    case Cache{_,_}: [[97n]]
    case Missing{}: [[97n]]

def taken(taken: Engine.Taken, +items: List<&2, Item>, +sequence: Nat,
    jobs: List<&2, Stored>, delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match taken:
    case Engine.Taken{state, Some{Scheduler.Entry{now, +order}}}:
      input(lookup(items, order), state, Queue{remove(items, order), sequence, sequence}, jobs, now, delay, ih)
    case Engine.Taken{_, None{}}: []

def selected_state(states: List<&2, Types.State>, +items: List<&2, Item>, +sequence: Nat,
    synced: Nat, jobs: List<&2, Stored>, delay: Nat,
    ih: Carrier -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match states:
    case Nil{}: [[97n]]
    case state <> _:
      taken(Engine.take(sync(items,state,synced)),items,sequence,jobs,delay,next => ih(carrier(next)))

def selected(runtime: Carrier, ih: Carrier -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match runtime:
    case Carrier{states,Queue{items,sequence,synced},jobs,delay}:
      selected_state(states,items,sequence,synced,jobs,delay,ih)




def initialized(changed: Engine.WorkloadTransition, queue: Queue) -> Initialized:
  match changed:
    case Engine.WorkloadTransition{+state, events, True{}}: Initialized{state, emissions(events, queue, state)}
    case Engine.WorkloadTransition{state, _, False{}}: Initialized{state, Queue{[Item{0n, 0n, Missing{}}], 1n, 0n}}

def second(initial: Initialized) -> Initialized:
  match initial:
    case Initialized{state, queue}: initialized(Engine.workload_action(state, 2n, Workload.Next{}), queue)

def initial() -> Initialized:
  second(initialized(Engine.workload_action(configured(), 1n, Workload.Next{}), Queue{[], 0n, 0n}))

def state_code(status: Lifecycle.Status) -> Nat:
  match status:
    case Lifecycle.Active{}: 0n
    case Lifecycle.Disconnected{}: 1n
    case Lifecycle.Removed{}: 2n

def lifecycle(result: Engine.LifecycleTransition, queue: Queue, jobs: List<&2, Stored>, delay: Nat,
    ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match result:
    case Engine.LifecycleTransition{+state, Lifecycle.Changed{_, Some{Lifecycle.Entry{+p, +old, _}},
        Some{Lifecycle.Entry{_, new, status}}, True{}}, Cleanup.CleanupPlan{list, _, _}, events}:
      [80n, Engine.clock(state), p, old, new, state_code(status)] <>
        ih(Runtime{state, emissions(events, actions(list, queue, Engine.clock(state),
          Job{p, old, 10n, [5n], Canonical.RequestFinding{}}), state), jobs, delay})
    case _: [[97n]]

def stage_bound(stage: Stage, boundary: Nat) -> Nat:
  match stage:
    case Resumed{}: 30n
    case _: boundary

def fresh(runtime: Runtime, at: Nat) -> Runtime:
  match runtime:
    case Runtime{state, queue, jobs, delay}:
      Runtime{state, append(queue, at, Edit{Job{1n, 2n, 10n, [5n], Canonical.RequestFinding{}}}), jobs, delay}

def ending_state(states: List<&2, Types.State>, stage: Stage, queue: Queue,
    jobs: List<&2, Stored>, delay: Nat, action: Lifecycle.Action, new_at: Nat,
    ih: Carrier -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match states stage:
    case state <> _ Started{}:
      lifecycle(Engine.lifecycle_action(state,1n,action),queue,jobs,delay,next => ih(carrier(next),Departed{}))
    case state <> _ Departed{}:
      lifecycle(Engine.lifecycle_action(state,1n,Lifecycle.Resume{}),queue,jobs,delay,next => ih(carrier(fresh(next,new_at)),Resumed{}))
    case _ Resumed{}: []
    case Nil{} _: [[97n]]

def ending(stage: Stage, runtime: Carrier, action: Lifecycle.Action, new_at: Nat,
    ih: Carrier -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match runtime:
    case Carrier{states,queue,jobs,delay}: ending_state(states,stage,queue,jobs,delay,action,new_at,ih)

def in_bound(valid: Bool, runtime: Carrier, +stage: Stage, action: Lifecycle.Action, new_at: Nat,
    ih: Carrier -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match valid:
    case True{}: selected(runtime,next => ih(next,stage))
    case False{}: ending(stage,runtime,action,new_at,ih)

def bounded(entries: List<&2, Scheduler.Entry>, runtime: Carrier, +stage: Stage, action: Lifecycle.Action,
    boundary: Nat, new_at: Nat, ih: Carrier -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match entries:
    case Scheduler.Entry{at,_} <> _: in_bound(Nat.is_le(at,stage_bound(stage,boundary)),runtime,stage,action,new_at,ih)
    case Nil{}: ending(stage,runtime,action,new_at,ih)

def published(states: List<&2, Types.State>, +items: List<&2, Item>, +sequence: Nat,
    synced: Nat, jobs: List<&2, Stored>, delay: Nat, stage: Stage, action: Lifecycle.Action,
    boundary: Nat, new_at: Nat, ih: Carrier -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match states:
    case Nil{}: [[97n]]
    case state <> _:
      +state = sync(items,state,synced)
      bounded(Engine.queued(state),Carrier{[state],Queue{items,sequence,sequence},jobs,delay},stage,action,boundary,new_at,ih)

def next(runtime: Carrier, stage: Stage, action: Lifecycle.Action, boundary: Nat, new_at: Nat,
    ih: Carrier -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match runtime:
    case Carrier{states,Queue{items,sequence,synced},jobs,delay}:
      published(states,items,sequence,synced,jobs,delay,stage,action,boundary,new_at,ih)

def loop_carrier(fuel: Nat, runtime: Carrier, stage: Stage, +action: Lifecycle.Action, +boundary: Nat, +new_at: Nat) -> List<&2, List<&2, Nat>>:
  match fuel:
    case 0n: [[98n]]
    case 1n+rest: next(runtime,stage,action,boundary,new_at,following => following_stage => loop_carrier(rest,following,following_stage,action,boundary,new_at))

def loop(fuel: Nat, runtime: Runtime, stage: Stage, action: Lifecycle.Action, boundary: Nat, new_at: Nat) -> List<&2, List<&2, Nat>>:
  loop_carrier(fuel,carrier(runtime),stage,action,boundary,new_at)

def original_inputs(initial: Initialized, action: Lifecycle.Action, boundary: Nat, new_at: Nat) -> List<&2, List<&2, Nat>>:
  match initial:
    case Initialized{state, queue}:
      loop(120n, Runtime{state,
        append(append(append(queue, 0n, Edit{Job{1n, 1n, 10n, [5n], Canonical.RequestFinding{}}}),
          0n, Edit{Job{2n, 1n, 20n, [7n], Canonical.RequestFinding{}}}),
          4n, Edit{Job{1n, 1n, 90n, [90n], Canonical.RequestFinding{}}}), [], 20n}, Started{}, action, boundary, new_at)

def run(action: Lifecycle.Action, boundary: Nat, new_at: Nat) -> List<&2, List<&2, Nat>>:
  original_inputs(initial(), action, boundary, new_at)

# Internal transport retains this existing recursive carrier across projections.
# Types.State stays opaque here, including every present and future scenario field.
def runtime_valid(runtime: List<&2,Runtime>) -> Bool:
  match runtime:
    case _ <> Nil{}: True{}
    case _: False{}

def runtime_states(runtime: List<&2,Runtime>) -> List<&2,Types.State>:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: [state]
    case _: []

def runtime_items(runtime: List<&2,Runtime>) -> List<&2,Item>:
  match runtime:
    case Runtime{_,Queue{items,_,_},_,_} <> Nil{}: items
    case _: []

def runtime_sequence(runtime: List<&2,Runtime>) -> Nat:
  match runtime:
    case Runtime{_,Queue{_,sequence,_},_,_} <> Nil{}: sequence
    case _: 0n

def runtime_entries(runtime: List<&2,Runtime>) -> List<&2,Scheduler.Entry>:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: Engine.queued(state)
    case _: []

def runtime_originals(runtime: List<&2,Runtime>) -> List<&2,Callbacks.Original>:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: Engine.callback_originals(state)
    case _: []

def runtime_synced_state(runtime: List<&2,Runtime>) -> List<&2,Types.State>:
  match runtime:
    case Runtime{state,Queue{items,_,synced},_,_} <> Nil{}: [sync(items,state,synced)]
    case _: []

def runtime_synced(states: List<&2,Types.State>, runtime: List<&2,Runtime>) -> List<&2,Runtime>:
  match states runtime:
    case state <> Nil{} Runtime{_,Queue{items,+sequence,_},jobs,delay} <> Nil{}:
      [Runtime{state,Queue{items,sequence,sequence},jobs,delay}]
    case _ runtime: runtime

def runtime_sync(+runtime: List<&2,Runtime>) -> List<&2,Runtime>:
  runtime_synced(runtime_synced_state(runtime),runtime)

# Full structural observation seam for consumers of this same factual edge.
# Existing compact fixture entry points remain unchanged. A command hook supplies
# original input captures; all commands and transitions still come from Engine.
type ObservedFrame is Data:
  CanonicalFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    order: Nat, event: Canonical.CanonicalEvent, result: List<&2,Canonical.Step>}
  GraphFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    order: Nat, key: Types.GraphKey, position: Nat, event: Graph.GraphEvent, result: List<&2,Types.GraphTransition>}
  CacheFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    order: Nat, fact: CacheRuntime.Fact, event: Canonical.CanonicalEvent, result: List<&2,Canonical.Step>}
  UnexpectedInput{}
# A callback is linear (Type). It returns the next callback with the updated
# factual captures. Factories must build this finite chain from the actual
# shrinking command list; neither callback nor initial captures are copied.
type CommandHook<-F: Data> is Type:
  HookEnd{facts: F}
  HookFault{facts: F}
  HookNext{facts: F, handle: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled, apply: F -> Canonical.Command -> List<&2,Runtime> -> (List<&2,Runtime> & CommandHook<F>)}
type Commanded<-F: Data> is Type:
  Commanded{runtime: List<&2,Runtime>, hook: CommandHook<F>, valid: Bool}
type Observed<-F: Data> is Type:
  Observed{runtime: List<&2,Runtime>, frame: Maybe<&2,ObservedFrame>, hook: CommandHook<F>}

def snapshot_after(before: List<&2,Types.State>, after: List<&2,Types.State>,
    event: Canonical.CanonicalEvent) -> List<&2,Driver.Action>:
  match before after:
    case before <> Nil{} after <> Nil{}: Engine.after(before,after,event)
    case _ _: []

def observed_finished_ready(-F: Data, emitted: List<&2,Driver.Action>, runtime: List<&2,Runtime>,
    before: List<&2,Types.State>, event: Canonical.CanonicalEvent, +now: Nat, order: Nat,
    job: Job, result: Canonical.Step, hook: CommandHook<F>) -> Observed<F>:
  match runtime:
    case Runtime{+state,queue,jobs,delay} <> Nil{}:
      Observed{[Runtime{state,actions(emitted,queue,now,job),jobs,delay}],
        Some{CanonicalFrame{before,[state],now,order,event,[result]}},hook}
    case runtime: Observed{runtime,Some{UnexpectedInput{}},hook}

def snapshot_valid(states: List<&2,Types.State>) -> Bool:
  match states:
    case _ <> Nil{}: True{}
    case _: False{}

def observed_finished_valid(-F: Data, valid: Bool, +runtime: List<&2,Runtime>, +before: List<&2,Types.State>,
    +event: Canonical.CanonicalEvent, now: Nat, order: Nat, job: Job,
    result: Canonical.Step, hook: CommandHook<F>) -> Observed<F>:
  match valid:
    case True{}:
      observed_finished_ready(F,snapshot_after(before,runtime_states(runtime),event),runtime,
        before,event,now,order,job,result,hook)
    case False{}: Observed{runtime,Some{UnexpectedInput{}},hook}

def observed_finished(-F: Data, runtime: List<&2,Runtime>, +before: List<&2,Types.State>,
    event: Canonical.CanonicalEvent, now: Nat, order: Nat, job: Job,
    result: Canonical.Step, hook: CommandHook<F>) -> Observed<F>:
  observed_finished_valid(F,snapshot_valid(before),runtime,before,event,now,order,job,result,hook)

def observed_following(-F: Data, pair: List<&2,Runtime> & CommandHook<F>,
    ih: List<&2,Runtime> -> CommandHook<F> -> Commanded<F>) -> Commanded<F>:
  (next,following)=pair
  ih(next,following)

# The event remains in its direct linear carrier; callbacks keep the incoming
# runtime carrier instead of exposing all fields in their continuation.
def observed_interpret(events: Array<Canonical.CanonicalEvent>, runtime: List<&2,Runtime>,
    environment: Environment, command: Canonical.Command, now: Nat, job: Job,
    candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> List<&2,Runtime>:
  match events runtime:
    case ALeaf{event} Runtime{state,queue,jobs,delay} <> Nil{}:
      [command_interpret_with_handler(environment,command,state,event,queue,jobs,now,job,delay,candidate,handler)]
    case _ runtime: runtime

def observed_apply(-F: Data, valid: Bool, events: Array<Canonical.CanonicalEvent>, runtime: List<&2,Runtime>,
    environment: Environment, +command: Canonical.Command, now: Nat, job: Job,
    candidate: Maybe<&2,Driver.Candidate>, facts: F,
    handle: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled,
    apply: F -> Canonical.Command -> List<&2,Runtime> -> (List<&2,Runtime> & CommandHook<F>),
    ih: List<&2,Runtime> -> CommandHook<F> -> Commanded<F>) -> Commanded<F>:
  match valid events:
    case True{} ALeaf{event}:
      observed_following(F,apply(facts,command,observed_interpret(ALeaf{event},runtime,environment,command,now,job,candidate,handle)),ih)
    case _ _: Commanded{runtime,HookFault{facts},False{}}

def observed_commands(-F: Data, list: List<&2,Canonical.Command>, +runtime: List<&2,Runtime>,
    +event: Canonical.CanonicalEvent, +now: Nat, +job: Job,
    +candidate: Maybe<&2,Driver.Candidate>, +environment: Environment, hook: CommandHook<F>) -> Commanded<F>:
  match list hook:
    case Nil{} HookEnd{facts}: Commanded{runtime,HookEnd{facts},runtime_valid(runtime)}
    case head <> tail HookNext{facts,handle,apply}:
      observed_apply(F,runtime_valid(runtime),ALeaf{event},runtime,environment,head,now,job,candidate,facts,handle,apply,
        next => following => observed_commands(F,tail,next,event,now,job,candidate,environment,following))
    case _ hook: Commanded{runtime,hook,False{}}

def observed_commanded(-F: Data, commanded: Commanded<F>, before: List<&2,Types.State>,
    event: Canonical.CanonicalEvent, now: Nat, order: Nat, job: Job,
    result: Canonical.Step) -> Observed<F>:
  match commanded:
    case Commanded{runtime,hook,True{}}: observed_finished(F,runtime,before,event,now,order,job,result,hook)
    case Commanded{runtime,hook,_}: Observed{runtime,Some{UnexpectedInput{}},hook}

def observed_result(-F: Data, +result: Canonical.Step, runtime: List<&2,Runtime>, before: List<&2,Types.State>,
    +event: Canonical.CanonicalEvent, +job: Job, +now: Nat, order: Nat,
    candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match result:
    case Canonical.Advanced{_,+list}:
      observed_commanded(F,observed_commands(F,list,runtime,event,now,job,candidate,environment,factory(list)),before,event,now,order,job,result)
    case Canonical.Rejected{_,_}:
      observed_finished(F,runtime,before,event,now,order,job,result,factory([]))

def cache_facts(list: List<&2,CacheRuntime.Fact>, queue: Queue, +now: Nat, +job: Job) -> Queue:
  match list:
    case Nil{}: queue
    case fact <> tail: cache_facts(tail,append(queue,now,Cache{fact,job}),now,job)

def actual_commands(result: Canonical.Step) -> List<&2,Canonical.Command>:
  match result:
    case Canonical.Advanced{_,commands}: commands
    case Canonical.Rejected{_,_}: []

def runtime_cache_begin(runtime: List<&2,Runtime>, state: Types.State, event: Canonical.CanonicalEvent,
    commands: List<&2,Canonical.Command>) -> List<&2,Engine.CachePublished>:
  match runtime:
    case Runtime{before,_,_,_} <> Nil{}: [Engine.cache_begin(before,state,event,commands)]
    case _: []

def runtime_cache_removed(runtime: List<&2,Runtime>, commands: List<&2,Canonical.Command>) -> List<&2,Canonical.CanonicalEvent>:
  match runtime:
    case Runtime{before,_,_,_} <> Nil{}: Engine.cache_removed(before,commands)
    case _: []

def observed_published(-F: Data, published: List<&2,Engine.CachePublished>, +runtime: List<&2,Runtime>,
    event: Canonical.CanonicalEvent, +job: Job, +now: Nat, order: Nat,
    candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    result: Canonical.Step, removed: List<&2,Canonical.CanonicalEvent>,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match published runtime:
    case Engine.CachePublished{state,facts,releases} <> Nil{} Runtime{_,queue,jobs,delay} <> Nil{}:
      observed_result(F,result,[Runtime{state,
        actions(Engine.sharing_actions(List.append(&2,Canonical.CanonicalEvent,removed,releases)),cache_facts(facts,queue,now,job),now,job),
        jobs,delay}],runtime_states(runtime),event,job,now,order,candidate,environment,factory)
    case _ runtime: Observed{runtime,Some{UnexpectedInput{}},factory([])}

def observed_transition(-F: Data, transition: List<&2,Engine.Transition>, +runtime: List<&2,Runtime>,
    +event: Canonical.CanonicalEvent, job: Job, now: Nat, order: Nat,
    candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match transition:
    case Engine.Transition{state,+result} <> Nil{}:
      observed_published(F,runtime_cache_begin(runtime,state,event,actual_commands(result)),runtime,event,
        job,now,order,candidate,environment,result,runtime_cache_removed(runtime,actual_commands(result)),factory)
    case _: Observed{runtime,Some{UnexpectedInput{}},factory([])}

def cache_observed(-F: Data, observed: Observed<F>, fact: CacheRuntime.Fact) -> Observed<F>:
  match observed:
    case Observed{runtime,Some{CanonicalFrame{before,after,time,order,event,result}},hook}:
      Observed{runtime,Some{CacheFrame{before,after,time,order,fact,event,result}},hook}
    case observed: observed

def runtime_cache_apply(runtime: List<&2,Runtime>, fact: CacheRuntime.Fact) -> List<&2,Engine.CacheApplied>:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: [Engine.cache_apply(state,fact)]
    case _: []

def cache_applied_commands(applied: List<&2,Engine.CacheApplied>) -> List<&2,Canonical.Command>:
  match applied:
    case Engine.CacheApplied{_,_,result,_,_,True{}} <> Nil{}: actual_commands(result)
    case _: []

def cache_applied_valid(applied: List<&2,Engine.CacheApplied>) -> Bool:
  match applied:
    case Engine.CacheApplied{_,_,_,_,_,True{}} <> Nil{}: True{}
    case _: False{}

def runtime_queues(runtime: List<&2,Runtime>) -> List<&2,Queue>:
  match runtime:
    case Runtime{_,queue,_,_} <> Nil{}: [queue]
    case _: []

def cache_applied_actions(applied: List<&2,Engine.CacheApplied>, removed: List<&2,Canonical.CanonicalEvent>) -> List<&2,Driver.Action>:
  match applied:
    case Engine.CacheApplied{_,_,_,_,releases,True{}} <> Nil{}:
      Engine.sharing_actions(List.append(&2,Canonical.CanonicalEvent,releases,removed))
    case _: []

def cache_applied_queue(applied: List<&2,Engine.CacheApplied>, queue: List<&2,Queue>,
    emitted: List<&2,Driver.Action>, +now: Nat, +job: Job) -> List<&2,Queue>:
  match applied queue:
    case Engine.CacheApplied{_,_,_,facts,_,True{}} <> Nil{} queue <> Nil{}:
      [actions(emitted,cache_facts(facts,queue,now,job),now,job)]
    case _ _: []

def observed_cache_ready(-F: Data, queue: List<&2,Queue>, applied: List<&2,Engine.CacheApplied>,
    runtime: List<&2,Runtime>, before: List<&2,Types.State>, fact: CacheRuntime.Fact,
    job: Job, now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match queue applied runtime:
    case queue <> Nil{} Engine.CacheApplied{state,event,result,_,_,True{}} <> Nil{}
        Runtime{_,_,jobs,delay} <> Nil{}:
      cache_observed(F,observed_result(F,result,[Runtime{state,queue,jobs,delay}],before,event,job,now,order,None{},environment,factory),fact)
    case _ _ runtime: Observed{runtime,Some{UnexpectedInput{}},factory([])}

def observed_cache_valid(-F: Data, valid: Bool, +applied: List<&2,Engine.CacheApplied>, +runtime: List<&2,Runtime>,
    fact: CacheRuntime.Fact, +job: Job, +now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match valid:
    case True{}:
      observed_cache_ready(F,cache_applied_queue(applied,runtime_queues(runtime),
        cache_applied_actions(applied,runtime_cache_removed(runtime,cache_applied_commands(applied))),now,job),
        applied,runtime,runtime_states(runtime),fact,job,now,order,environment,factory)
    case False{}: Observed{runtime,Some{UnexpectedInput{}},factory([])}

def observed_cache(-F: Data, +applied: List<&2,Engine.CacheApplied>, runtime: List<&2,Runtime>,
    fact: CacheRuntime.Fact, job: Job, now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  observed_cache_valid(F,cache_applied_valid(applied),applied,runtime,fact,job,now,order,environment,factory)

def observed_cache_input(-F: Data, +runtime: List<&2,Runtime>, +fact: CacheRuntime.Fact,
    job: Job, now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  observed_cache(F,runtime_cache_apply(runtime,fact),runtime,fact,job,now,order,environment,factory)

def runtime_step(runtime: List<&2,Runtime>, event: Canonical.CanonicalEvent) -> List<&2,Engine.Transition>:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: [Engine.step(state,event)]
    case _: []

def observed_completion(-F: Data, completion: List<&2,SharingRuntime.Completion>, +runtime: List<&2,Runtime>,
    job: Job, now: Nat, order: Nat, candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match completion:
    case SharingRuntime.Completion{+event,True{}} <> Nil{}:
      observed_transition(F,runtime_step(runtime,event),runtime,event,job,now,order,candidate,environment,factory)
    case _: Observed{runtime,Some{UnexpectedInput{}},factory([])}

def runtime_completion(runtime: List<&2,Runtime>, event: Canonical.CanonicalEvent) -> List<&2,SharingRuntime.Completion>:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: [Engine.sharing_completion(state,event)]
    case _: []

def observed_fenced(-F: Data, events: List<&2,Canonical.CanonicalEvent>, +runtime: List<&2,Runtime>,
    job: Job, now: Nat, order: Nat, candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match events:
    case event <> Nil{}:
      observed_completion(F,runtime_completion(runtime,event),runtime,job,now,order,candidate,environment,factory)
    case _: Observed{runtime,Some{UnexpectedInput{}},factory([])}

def runtime_fence(runtime: List<&2,Runtime>, event: Canonical.CanonicalEvent, environment: Environment,
    job: Job, candidate: Maybe<&2,Driver.Candidate>) -> List<&2,Canonical.CanonicalEvent>:
  match runtime:
    case Runtime{+state,_,_,delay} <> Nil{}:
      [Engine.fence(state,event,True{},context_with(environment,state,job,delay,candidate))]
    case _: []

def observed_event(-F: Data, +runtime: List<&2,Runtime>, event: Canonical.CanonicalEvent,
    +job: Job, now: Nat, order: Nat, +candidate: Maybe<&2,Driver.Candidate>, +environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  observed_fenced(F,runtime_fence(runtime,event,environment,job,candidate),runtime,job,now,order,candidate,environment,factory)

def observed_edit(-F: Data, attempt: Engine.EditAttempt, queue: Queue, jobs: List<&2,Stored>,
    +job: Job, +now: Nat, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match attempt:
    case Engine.EditAttempt{state,Driver.EditPlan{retry,emitted}}:
      Observed{[Runtime{state,retry_edit(retry,actions(emitted,queue,now,job),now,job),jobs,delay}],None{},hook}

def observed_graph(-F: Data, +result: Types.GraphTransition, before: List<&2,Types.State>, queue: Queue,
    jobs: List<&2,Stored>, now: Nat, order: Nat, key: Types.GraphKey, position: Nat,
    event: Graph.GraphEvent, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match result:
    case Types.GraphTransition{+state,_,_}:
      Observed{[Runtime{state,queue,jobs,delay}],Some{GraphFrame{before,[state],now,order,key,position,event,[result]}},hook}
    case Types.GraphRejected{+state}:
      Observed{[Runtime{state,queue,jobs,delay}],Some{GraphFrame{before,[state],now,order,key,position,event,[result]}},hook}

def observed_workload(-F: Data, result: Engine.WorkloadTransition, queue: Queue,
    jobs: List<&2,Stored>, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match result:
    case Engine.WorkloadTransition{+state,events,True{}}:
      Observed{[Runtime{state,emissions(events,queue,state),jobs,delay}],None{},hook}
    case Engine.WorkloadTransition{state,_,False{}}:
      Observed{[Runtime{state,queue,jobs,delay}],Some{UnexpectedInput{}},hook}

def observed_arrival_valid(-F: Data, valid: Bool, event: Workload.Emission, +lifetime: Nat,
    +state: Types.State, queue: Queue, jobs: List<&2,Stored>, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match valid event:
    case False{} _: Observed{[Runtime{state,queue,jobs,delay}],None{},hook}
    case True{} Workload.Emission{_,owner,_,0,_,_,_,_,_,_}:
      observed_workload(F,Engine.workload_action(state,owner,Workload.Next{}),queue,jobs,delay,hook)
    case True{} Workload.Emission{at,+owner,_,1,_,_,bytes,units,_,_}:
      observed_edit(F,Engine.edit_attempt(state,owner,lifetime),queue,jobs,Job{owner,lifetime,bytes,units,Canonical.RequestFinding{}},at,delay,hook)
    case True{} _: Observed{[Runtime{state,queue,jobs,delay}],None{},hook}

def observed_arrival(-F: Data, event: Workload.Emission, +lifetime: Nat, +state: Types.State,
    queue: Queue, jobs: List<&2,Stored>, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match event:
    case Workload.Emission{at,+p,+g,k,task,revision,bytes,units,repair,+recurring}:
      observed_arrival_valid(F,Engine.activity_valid(state,p,lifetime) && Engine.workload_valid(state,p,g,recurring),
        Workload.Emission{at,p,g,k,task,revision,bytes,units,repair,recurring},lifetime,state,queue,jobs,delay,hook)

def observed_edit_valid(-F: Data, valid: Bool, +state: Types.State, queue: Queue,
    jobs: List<&2,Stored>, +job: Job, now: Nat, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match valid:
    case True{}: observed_edit(F,Engine.edit_attempt(state,job_partition(job),job_lifetime(job)),queue,jobs,job,now,delay,hook)
    case False{}: Observed{[Runtime{state,queue,jobs,delay}],None{},hook}

def observed_graph_valid(-F: Data, valid: Bool, +state: Types.State, queue: Queue, jobs: List<&2,Stored>,
    +p: Nat, +l: Nat, +r: Nat, +o: Nat, +position: Nat, +event: Graph.GraphEvent,
    now: Nat, order: Nat, delay: Nat, limits: Graph.Limits, hook: CommandHook<F>) -> Observed<F>:
  match valid:
    case True{}:
      observed_graph(F,Engine.graph_step(state,Types.GraphKey{p,l,r,o,0n},position,limits,event),[state],queue,jobs,now,order,Types.GraphKey{p,l,r,o,0n},position,event,delay,hook)
    case False{}: Observed{[Runtime{state,queue,jobs,delay}],None{},hook}

# Compute refusal predicates on a projection before exposing retained runtime fields.
def runtime_activity(runtime: List<&2,Runtime>, p: Nat, l: Nat) -> Bool:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: Engine.activity_valid(state,p,l)
    case _: False{}

def runtime_preparation(runtime: List<&2,Runtime>, p: Nat, l: Nat, r: Nat, o: Nat) -> Bool:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: Engine.preparation_active(state,p,l,r,o)
    case _: False{}

def runtime_workload(runtime: List<&2,Runtime>, p: Nat, g: Nat, recurring: Bool) -> Bool:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: Engine.workload_valid(state,p,g,recurring)
    case _: False{}

def input_valid(value: Input, +runtime: List<&2,Runtime>) -> Bool:
  match value:
    case Edit{+job}: runtime_activity(runtime,job_partition(job),job_lifetime(job))
    case Fact{p,l,r,o,_,_}: runtime_preparation(runtime,p,l,r,o)
    case Arrival{Workload.Emission{_,+p,g,_,_,_,_,_,_,recurring},lifetime}:
      runtime_activity(runtime,p,lifetime) && runtime_workload(runtime,p,g,recurring)
    case _: False{}

def observed_input_ready(-F: Data, valid: Bool, value: Input, runtime: List<&2,Runtime>,
    +now: Nat, order: Nat, limits: Graph.Limits, hook: CommandHook<F>) -> Observed<F>:
  match value runtime:
    case Edit{job} Runtime{state,queue,jobs,delay} <> Nil{}:
      observed_edit_valid(F,valid,state,queue,jobs,job,now,delay,hook)
    case Fact{p,l,r,o,position,event} Runtime{state,queue,jobs,delay} <> Nil{}:
      observed_graph_valid(F,valid,state,queue,jobs,p,l,r,o,position,event,now,order,delay,limits,hook)
    case Arrival{event,lifetime} Runtime{state,queue,jobs,delay} <> Nil{}:
      observed_arrival_valid(F,valid,event,lifetime,state,queue,jobs,delay,hook)
    case _ runtime: Observed{runtime,Some{UnexpectedInput{}},hook}

def observed_input_state(-F: Data, +value: Input, +runtime: List<&2,Runtime>,
    now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  observed_input_ready(F,input_valid(value,runtime),value,runtime,now,order,environment_graph(environment),factory([]))

def observed_input(-F: Data, value: Input, runtime: List<&2,Runtime>,
    now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match value:
    case Event{Driver.Action{event,_,candidate,_,_},job}:
      observed_event(F,runtime,event,job,now,order,candidate,environment,factory)
    case Cache{fact,job}: observed_cache_input(F,runtime,fact,job,now,order,environment,factory)
    case Missing{}: Observed{runtime,Some{UnexpectedInput{}},factory([])}
    case value: observed_input_state(F,value,runtime,now,order,environment,factory)

def taken_items(taken: List<&2,Engine.Taken>, runtime: List<&2,Runtime>) -> List<&2,Item>:
  match taken:
    case Engine.Taken{_,Some{Scheduler.Entry{_,order}}} <> Nil{}:
      remove(runtime_items(runtime),order)
    case _: runtime_items(runtime)

def taken_runtime_ready(items: List<&2,Item>, taken: List<&2,Engine.Taken>, runtime: List<&2,Runtime>) -> List<&2,Runtime>:
  match taken runtime:
    case Engine.Taken{state,_} <> Nil{} Runtime{_,Queue{_,+sequence,_},jobs,delay} <> Nil{}:
      [Runtime{state,Queue{items,sequence,sequence},jobs,delay}]
    case _ runtime: runtime

def taken_runtime(+taken: List<&2,Engine.Taken>, +runtime: List<&2,Runtime>) -> List<&2,Runtime>:
  taken_runtime_ready(taken_items(taken,runtime),taken,runtime)

def observed_taken(-F: Data, +taken: List<&2,Engine.Taken>, +runtime: List<&2,Runtime>,
    environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  match taken:
    case Engine.Taken{_,Some{Scheduler.Entry{now,+order}}} <> Nil{}:
      observed_input(F,lookup(runtime_items(runtime),order),taken_runtime(taken,runtime),now,order,environment,factory)
    case Engine.Taken{_,None{}} <> Nil{}:
      Observed{taken_runtime(taken,runtime),None{},factory([])}
    case _: Observed{runtime,Some{UnexpectedInput{}},factory([])}

# Projection runs on one copy; the original recursive carrier stays closed
# across both sync and take, just as it does across command callbacks.
def observed_take(runtime: List<&2,Runtime>) -> List<&2,Engine.Taken>:
  match runtime:
    case Runtime{state,Queue{items,_,synced},_,_} <> Nil{}:
      [Engine.take(sync(items,state,synced))]
    case _: []

def observed_take_ready(-F: Data, taken: List<&2,Engine.Taken>, runtime: List<&2,Runtime>,
    environment: Environment, factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  observed_taken(F,taken,runtime,environment,factory)

def observe_step_with(-F: Data, +runtime: List<&2,Runtime>, environment: Environment,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  observed_take_ready(F,observed_take(runtime),runtime,environment,factory)

def observe_step(-F: Data, runtime: List<&2,Runtime>,
    factory: List<&2,Canonical.Command> -> CommandHook<F>) -> Observed<F>:
  observe_step_with(F,runtime,default_environment(),factory)
