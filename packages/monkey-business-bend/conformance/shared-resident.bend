import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../Advicees.bend as Advicees
import ../AdviceeScope.bend as Scope
import ../Scheduler.bend as Scheduler
import ../TreeFacts.bend as TreeFacts
import ../PreparationScenario.bend as Preparation
import ../Workload.bend as Workload
import ../../session-bend/Session.bend as Session
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/Dispatch.bend as Dispatch
import ./minimal-scenario.bend as Minimal

# One source-free input stream, resident, queue and clock. Job facts are payload
# storage only; actual Driver actions and Canonical commands own the lifecycle.
type Job is Data:
  Job{partition: Nat, bytes: Nat, units: List<&2, Nat>, outcome: Canonical.RequestOutcome}
type Stored is Data:
  Stored{operation: Nat, job: Job}
type Input is Data:
  Edit{job: Job}
  Event{action: Driver.Action, job: Job}
  Fact{partition: Nat, round: Nat, operation: Nat, position: Nat, event: Graph.GraphEvent}
  Missing{}
type Item is Data:
  Item{at: Nat, order: Nat, input: Input}
type Queue is Data:
  Queue{items: List<&2, Item>, sequence: Nat, synced: Nat}
type Runtime is Data:
  Runtime{state: Types.State, queue: Queue, jobs: List<&2, Stored>, delay: Nat}

def job_partition(job: Job) -> Nat:
  match job:
    case Job{partition, _, _, _}: partition

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
    case Canonical.StopPolled{_, _, _, _}: 26n
    case Canonical.JevRequestInterrupted{_, _, _, _, _}: 25n
    case event: Minimal.event_code(event)

def identity(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.StopPolled{p, l, r, _}: [p, l, r, 0n, 0n, 0n, 0n]
    case Canonical.JevRequestInterrupted{p, l, r, o, request}: [p, l, r, o, request, 0n, 0n]
    case event: Minimal.event_identity(event)

def event_facts(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.StopPolled{_, _, _, deadline}: [Bool.pick(Nat, deadline, 1n, 0n), 0n, 0n, 0n, 0n, 0n]
    case event: Minimal.event_facts(event)

def command_code(command: Canonical.Command) -> Nat:
  match command:
    case Canonical.JevObservationIgnored{}: 31n
    case Canonical.FinishReady{}: 32n
    case Canonical.CancelWork{_}: 33n
    case Canonical.JevRequestUnavailable{}: 29n
    case Canonical.JevInterruptionRecorded{}: 30n
    case command: Minimal.command_code(command)

def command_id(command: Canonical.Command) -> Nat:
  match command:
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

def original(+index: Nat) -> Job:
  Job{Nat.add((index % 2n : Nat), 1n), Bool.pick(Nat, Nat.is_eq((index % 2n : Nat), 0n), 10n, 20n),
    [Bool.pick(Nat, Nat.is_eq((index % 2n : Nat), 0n), 5n, 7n)],
    Bool.pick(Canonical.RequestOutcome, Nat.is_eq(index, 0n), Canonical.RequestInterrupted{}, Canonical.RequestClear{})}

def declared(declared: Engine.AdviceeDeclared) -> Types.State:
  match declared:
    case Engine.AdviceeDeclared{state, _, _}: state

def profile(seed: U32, bytes: Nat, units: List<&2, Nat>) -> Workload.Profile:
  Workload.Profile{Session.Settings{1000000, 0, 1000, 500, 0, 300}, seed, [], bytes, units, None{}}

def controlled(transition: Engine.WorkloadTransition, queue: Queue, jobs: List<&2, Stored>,
    ih: Runtime -> Bool -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match transition:
    case Engine.WorkloadTransition{+state, [], True{}}:
      [80n, Engine.clock(state), 5n] <> ih(Runtime{state, queue, jobs, 5n}, False{})
    case _: [[97n]]

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

def facts(events: List<&2, Graph.GraphEvent>, queue: Queue, +partition: Nat,
    +round: Nat, +operation: Nat, +now: Nat, +position: Nat, +count: Nat) -> Queue:
  match events:
    case Nil{}: queue
    case event <> tail:
      facts(tail, append(queue, Nat.add(now, Engine.preparation_fact_time(2n, position, count)),
        Fact{partition, round, operation, position, event}), partition, round, operation, now, Nat.add(position, 1n), count)

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

def originals(count: Nat, queue: Queue, +index: Nat) -> Queue:
  match count:
    case 0n: queue
    case 1n+rest: originals(rest, append(queue, 0n, Edit{original(index)}), Nat.add(index, 1n))

def initial() -> Types.State:
  Engine.configure_workload(Engine.configure_workload(declared(Engine.declare_advicee(
    declared(Engine.declare_advicee(Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}),
      Nat.add(U32.to_nat(4294967295), 18n), 11)), 99n, 12)),
    1n, profile(11, 10n, [5n])), 2n, profile(12, 20n, [7n]))

def healthy(runtime: Runtime, ih: Runtime -> Bool -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match runtime:
    case Runtime{state, queue, jobs, _}:
      controlled(Engine.workload_action(state, 1n, Workload.Controlled{Workload.Suspend{True{}}}), queue, jobs, ih)

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
    case Job{+partition, bytes, _, outcome}:
      Driver.Context{partition, 1n, round(Engine.canonical(state), partition), bytes, True{}, delay,
        outcome, True{}, True{}, True{}, True{}, 600000n, candidate, True{}, True{}, True{}, True{},
        0n, 30n, True{}, True{}}

def canonical_row(+before: Types.State, +after: Types.State, +event: Canonical.CanonicalEvent,
    +provided: Nat, now: Nat, rejected: Nat, commands: List<&2, Canonical.Command>) -> List<&2, Nat>:
  event_code(event) <> now <> maybe_owner(Engine.scope_event(before, after, event, Some{provided})) <>
    List.append(&2, Nat, identity(event), List.append(&2, Nat, event_facts(event),
      List.append(&2, Nat, state_counts(Engine.canonical(after)), rejected <> command_rows(commands, before, after, provided))))

def phase_end(phase: Bool, runtime: Runtime,
    ih: Runtime -> Bool -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match phase:
    case True{}: healthy(runtime, ih)
    case False{}: []

def issued(result: Engine.IssuedActions, queue: Queue, jobs: List<&2, Stored>, now: Nat, job: Job, delay: Nat) -> Runtime:
  match result:
    case Engine.IssuedActions{state, events}: Runtime{state, actions(events, queue, now, job), jobs, delay}

def handled(result: Driver.Handled, state: Types.State, queue: Queue, jobs: List<&2, Stored>, now: Nat, job: Job, delay: Nat) -> Runtime:
  match result:
    case Driver.Handled{_, events}: issued(Engine.issue_actions(state, events), queue, jobs, now, job, delay)

def generated(generated: Preparation.Generated, queue: Queue, +now: Nat,
    +operation: Nat, +round: Nat, job: Job) -> Queue:
  match generated job:
    case Preparation.Generated{_, +events, _, True{}, _, _} Job{+partition, bytes, +units, outcome}:
      actions([Engine.preparation_completed(partition, 1n, round, operation, units, 2n)],
        facts(events, queue, partition, round, operation, now, 0n, List.length(&2, Graph.GraphEvent, events)),
        now, Job{partition, bytes, units, outcome})
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
      canonical_row(before, state, event, job_partition(job), now, 1n, []) <> ih(Runtime{state, queue, jobs, delay})

def input(input: Input, +state: Types.State, queue: Queue, jobs: List<&2, Stored>,
    +now: Nat, +delay: Nat, ih: Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match input:
    case Edit{+job}: edit_plan(Engine.edit_attempt(state, job_partition(job), 1n), queue, jobs, job, now, delay, ih)
    case Event{Driver.Action{+event, _, +candidate, _, _}, +job}:
      +fenced = Engine.fence(state, event, True{}, context(state, job, delay, candidate))
      transitioned(Engine.step(state, fenced), state, fenced, queue, jobs, job, now, delay, candidate, ih)
    case Fact{+partition, round, +operation, position, event}:
      graph_result(Engine.graph_step(state, Types.GraphKey{partition, 1n, round, operation, 0n}, position, graph_limits(), event),
        queue, jobs, partition, operation, now, delay, ih)
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

def in_bound(valid: Bool, runtime: Runtime, phase: Bool,
    ih: Runtime -> Bool -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match valid:
    case True{}: selected(runtime, next => ih(next, phase))
    case False{}: phase_end(phase, runtime, ih)

def bounded(entries: List<&2, Scheduler.Entry>, runtime: Runtime, +phase: Bool,
    ih: Runtime -> Bool -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match entries:
    case Scheduler.Entry{at, _} <> _: in_bound(Nat.is_le(at, Bool.pick(Nat, phase, 25n, 40n)), runtime, phase, ih)
    case Nil{}: phase_end(phase, runtime, ih)

def next(runtime: Runtime, phase: Bool,
    ih: Runtime -> Bool -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match runtime:
    case Runtime{state, Queue{+items, +sequence, synced}, jobs, delay}:
      +state = sync(items, state, synced)
      bounded(Engine.queued(state), Runtime{state, Queue{items, sequence, sequence}, jobs, delay}, phase, ih)

def loop(fuel: Nat, runtime: Runtime, phase: Bool) -> List<&2, List<&2, Nat>>:
  match fuel:
    case 0n: [[98n]]
    case 1n+rest: next(runtime, phase, state => phase => loop(rest, state, phase))

def scope_row(scope: Maybe<&2, Advicees.Scope>) -> List<&2, Nat>:
  match scope:
    case Some{Advicees.Scope{identity, partition, seed}}: [identity, partition, U32.to_nat(seed)]
    case None{}: [0n, 0n, 0n]

def duplicate_row(declared: Engine.AdviceeDeclared) -> List<&2, Nat>:
  match declared:
    case Engine.AdviceeDeclared{state, _, valid}:
      91n <> Bool.pick(Nat, valid, 1n, 0n) <> scope_row(Engine.advicee_identity(state, Nat.add(U32.to_nat(4294967295), 18n)))

def registry_rows(+state: Types.State) -> List<&2, List<&2, Nat>>:
  [90n <> scope_row(Engine.advicee_identity(state, Nat.add(U32.to_nat(4294967295), 18n))),
    90n <> scope_row(Engine.advicee_identity(state, 99n)),
    duplicate_row(Engine.declare_advicee(state, Nat.add(U32.to_nat(4294967295), 18n), 777))]

def cancellation() -> List<&2, List<&2, Nat>>:
  loop(80n, Runtime{initial(),
    append(append(append(Queue{[], 0n, 0n}, 0n, Edit{Job{1n, 10n, [5n], Canonical.RequestClear{}}}),
      0n, Edit{Job{2n, 20n, [7n], Canonical.RequestFinding{}}}),
      5n, Event{Driver.immediate(Canonical.StopPolled{1n, 1n, 1n, True{}}, False{}),
        Job{1n, 10n, [5n], Canonical.RequestClear{}}}), [], 20n}, False{})

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_traces([
    List.append(&2, List<&2, Nat>, registry_rows(initial()), loop(250n, Runtime{initial(),
      append(append(originals(9n, Queue{[], 0n, 0n}, 0n),
        30n, Edit{Job{1n, 10n, [5n], Canonical.RequestClear{}}}),
        30n, Edit{Job{2n, 20n, [7n], Canonical.RequestClear{}}}), [], 20n}, True{})), cancellation()])))
