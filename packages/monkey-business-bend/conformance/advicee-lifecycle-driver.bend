import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../Advicees.bend as Advicees
import ../AdviceeScope.bend as Scope
import ../AdviceeLifecycle.bend as Lifecycle
import ../AdviceeLifecycleCleanup.bend as Cleanup
import ../Scheduler.bend as Scheduler
import ../TreeFacts.bend as TreeFacts
import ../PreparationScenario.bend as Preparation
import ../Workload.bend as Workload
import ../Session.bend as Session
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

def facts(events: List<&2, Graph.GraphEvent>, queue: Queue, +partition: Nat, +lifetime: Nat,
    +round: Nat, +operation: Nat, +now: Nat, +position: Nat, +count: Nat) -> Queue:
  match events:
    case Nil{}: queue
    case event <> tail:
      facts(tail, append(queue, Nat.add(now, Engine.preparation_fact_time(2n, position, count)),
        Fact{partition, lifetime, round, operation, position, event}), partition, lifetime, round, operation, now, Nat.add(position, 1n), count)

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

def context(state: Types.State, job: Job, delay: Nat, candidate: Maybe<&2, Driver.Candidate>) -> Driver.Context:
  match job:
    case Job{+partition, +lifetime, bytes, _, outcome}:
      Driver.Context{partition, lifetime, round(Engine.canonical(state), partition), bytes, True{}, delay,
        outcome, True{}, True{}, True{}, True{}, 600000n, candidate, True{}, True{}, True{}, True{},
        0n, 30n, True{}, True{}}

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

def generated(generated: Preparation.Generated, queue: Queue, +now: Nat,
    +operation: Nat, +round: Nat, job: Job) -> Queue:
  match generated job:
    case Preparation.Generated{_, +events, _, True{}, _, _} Job{+partition, +lifetime, bytes, +units, outcome}:
      actions([Engine.preparation_completed(partition, lifetime, round, operation, units, 2n)],
        facts(events, queue, partition, lifetime, round, operation, now, 0n, List.length(&2, Graph.GraphEvent, events)),
        now, Job{partition, lifetime, bytes, units, outcome})
    case _ _: queue

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

def interpret(value: Canonical.Command, +state: Types.State, +event: Canonical.CanonicalEvent,
    queue: Queue, jobs: List<&2, Stored>, +now: Nat, +job: Job, +delay: Nat, candidate: Maybe<&2, Driver.Candidate>) -> Runtime:
  match value:
    case Canonical.Prepare{+operation, _}:
      Runtime{state, generated(Engine.generate_tree(7n, operation, 0n, tree_profile(), graph_limits()), queue,
        now, operation, round(Engine.canonical(state), job_partition(job)), job), jobs, delay}
    case command: handled(Engine.handle(state, event, command, context(state, job, delay, candidate)), state, queue, jobs, now, job, delay)

def command_step(+command: Canonical.Command,
    +state: Types.State, +event: Canonical.CanonicalEvent, queue: Queue, +jobs: List<&2, Stored>,
    +now: Nat, +job: Job, +delay: Nat, candidate: Maybe<&2, Driver.Candidate>,
    ih: Runtime -> Runtime) -> Runtime:
  +actual = command_job(command, jobs, job)
  ih(interpret(command, state, event, queue, remember(command, jobs, actual), now, actual, delay, candidate))

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
    case Missing{}: [[97n]]

def taken(taken: Engine.Taken, +items: List<&2, Item>, +sequence: Nat,
    jobs: List<&2, Stored>, delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match taken:
    case Engine.Taken{state, Some{Scheduler.Entry{now, +order}}}:
      input(lookup(items, order), state, Queue{remove(items, order), sequence, sequence}, jobs, now, delay, ih)
    case Engine.Taken{_, None{}}: []

def selected(runtime: Runtime, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match runtime:
    case Runtime{state, Queue{+items, +sequence, synced}, jobs, delay}:
      taken(Engine.take(sync(items, state, synced)), items, sequence, jobs, delay, ih)



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

def ending(stage: Stage, +runtime: Runtime, action: Lifecycle.Action, boundary: Nat, new_at: Nat,
    ih: Runtime -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match stage runtime:
    case Started{} Runtime{state, queue, jobs, delay}:
      lifecycle(Engine.lifecycle_action(state, 1n, action), queue, jobs, delay, next => ih(next, Departed{}))
    case Departed{} Runtime{state, queue, jobs, delay}:
      lifecycle(Engine.lifecycle_action(state, 1n, Lifecycle.Resume{}), queue, jobs, delay, next => ih(fresh(next, new_at), Resumed{}))
    case Resumed{} _: []

def in_bound(valid: Bool, runtime: Runtime, +stage: Stage, action: Lifecycle.Action, boundary: Nat, new_at: Nat,
    ih: Runtime -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match valid:
    case True{}: selected(runtime, next => ih(next, stage))
    case False{}: ending(stage, runtime, action, boundary, new_at, ih)

def bounded(entries: List<&2, Scheduler.Entry>, runtime: Runtime, +stage: Stage, action: Lifecycle.Action,
    +boundary: Nat, new_at: Nat, ih: Runtime -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match entries:
    case Scheduler.Entry{at, _} <> _: in_bound(Nat.is_le(at, stage_bound(stage, boundary)), runtime, stage, action, boundary, new_at, ih)
    case Nil{}: ending(stage, runtime, action, boundary, new_at, ih)

def next(runtime: Runtime, stage: Stage, action: Lifecycle.Action, boundary: Nat, new_at: Nat,
    ih: Runtime -> Stage -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match runtime:
    case Runtime{state, Queue{+items, +sequence, synced}, jobs, delay}:
      +state = sync(items, state, synced)
      bounded(Engine.queued(state), Runtime{state, Queue{items, sequence, sequence}, jobs, delay}, stage, action, boundary, new_at, ih)

def loop(fuel: Nat, runtime: Runtime, stage: Stage, +action: Lifecycle.Action, +boundary: Nat, +new_at: Nat) -> List<&2, List<&2, Nat>>:
  match fuel:
    case 0n: [[98n]]
    case 1n+rest: next(runtime, stage, action, boundary, new_at, next => stage => loop(rest, next, stage, action, boundary, new_at))

def original_inputs(initial: Initialized, action: Lifecycle.Action, boundary: Nat, new_at: Nat) -> List<&2, List<&2, Nat>>:
  match initial:
    case Initialized{state, queue}:
      loop(120n, Runtime{state,
        append(append(append(queue, 0n, Edit{Job{1n, 1n, 10n, [5n], Canonical.RequestFinding{}}}),
          0n, Edit{Job{2n, 1n, 20n, [7n], Canonical.RequestFinding{}}}),
          4n, Edit{Job{1n, 1n, 90n, [90n], Canonical.RequestFinding{}}}), [], 20n}, Started{}, action, boundary, new_at)

def run(action: Lifecycle.Action, boundary: Nat, new_at: Nat) -> List<&2, List<&2, Nat>>:
  original_inputs(initial(), action, boundary, new_at)
