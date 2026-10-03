import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../StopScenario.bend as StopScenario
import ../OutputScenario.bend as OutputScenario
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
  Finish{input: StopScenario.Input}
  FinishIntent{partition: Nat, started: Nat, cutoff: Nat, recurring: Bool}
  Event{action: Driver.Action, job: Job}
  FitEvent{action: Driver.Action, job: Job, attempt: Nat}
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
type StopProfile is Data:
  StopProfile{outcome: OutputScenario.Outcome, bytes: Maybe<&2,Nat>}
  FitProfile{outcome: OutputScenario.Outcome, bytes: Maybe<&2,Nat>, attempt: Nat}
type Environment is Data:
  Environment{seed: Nat, tree: TreeFacts.Profile, graph: Graph.Limits,
    preparation_delay: Nat, output_delay: Nat, output_lease: Nat, stop_profile: Maybe<&2,StopProfile>}

def default_environment() -> Environment:
  Environment{7n,tree_profile(),graph_limits(),2n,0n,30n,None{}}

def environment_graph(environment: Environment) -> Graph.Limits:
  match environment:
    case Environment{_,_,graph,_,_,_,_}: graph

def context_with(environment: Environment, +state: Types.State, job: Job, delay: Nat,
    candidate: Maybe<&2,Driver.Candidate>) -> Driver.Context:
  match environment job:
    case Environment{_,_,_,_,output_delay,output_lease,_} Job{+partition,+lifetime,bytes,_,outcome}:
      Driver.Context{partition,lifetime,round(Engine.canonical(state),partition),bytes,True{},delay,
        outcome,True{},True{},True{},True{},600000n,candidate,Bool.not(Engine.collector_configured(state)) && Bool.not(Engine.stop_active(state,partition)),True{},True{},True{},
        output_delay,output_lease,Engine.workload_configured(state,partition),True{}}

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
    case Driver.Handled{False{},Nil{}} Environment{seed,tree,graph,preparation_delay,_,_,_} Canonical.Prepare{+operation,_}:
      Runtime{state,generated_with(Engine.generate_tree(seed,operation,0n,tree,graph),queue,
        now,operation,round(Engine.canonical(state),job_partition(job)),job,preparation_delay),jobs,delay}
    case result _ _:
      handled(result,state,queue,jobs,now,job,delay)

def collector_combined(first: Driver.Handled, second: Driver.Handled) -> Driver.Handled:
  match first second:
    case Driver.Handled{handled,actions} Driver.Handled{following,rest}:
      Driver.Handled{handled || following,List.append(&2,Driver.Action,actions,rest)}

def stop_item_input(item: Item) -> Input:
  match item:
    case Item{_,_,input}: input

def stop_poll_owned(input: Input, finish: StopScenario.Finish) -> Bool:
  match input finish:
    case Event{Driver.Action{Canonical.StopPolled{p,l,r,_},_,_,_,_},_}
      StopScenario.Finish{owner,generation,round,_,_,_,_,_,_,_,_,_,_}:
      Nat.is_eq(p,owner) && Nat.is_eq(l,generation) && Nat.is_eq(r,round)
    case _ _: False{}

def stop_poll_cancel(cancel: Bool, state: Types.State, order: Nat) -> Types.State:
  match cancel:
    case True{}: Engine.cancel(state,order)
    case False{}: state

def stop_poll_keep(keep: Bool, item: Item, tail: List<&2,Item>) -> List<&2,Item>:
  match keep:
    case True{}: item <> tail
    case False{}: tail

def stop_poll_items(items: List<&2,Item>, +finish: StopScenario.Finish) -> List<&2,Item>:
  match items:
    case Nil{}: []
    case +item <> tail:
      stop_poll_keep(Bool.not(stop_poll_owned(stop_item_input(item),finish)),item,stop_poll_items(tail,finish))

def stop_poll_orders(items: List<&2,Item>, state: Types.State, +finish: StopScenario.Finish) -> Types.State:
  match items:
    case Nil{}: state
    case Item{_,order,input} <> tail:
      stop_poll_orders(tail,stop_poll_cancel(stop_poll_owned(input,finish),state,order),finish)

def stop_cancelled(state: Types.State, queue: Queue, jobs: List<&2,Stored>, delay: Nat, +finish: StopScenario.Finish) -> Runtime:
  match queue:
    case Queue{+items,sequence,synced}: Runtime{stop_poll_orders(items,state,finish),Queue{stop_poll_items(items,finish),sequence,synced},jobs,delay}

def stop_ended_runtime(ended: Maybe<&2,StopScenario.Ended>, state: Types.State, queue: Queue, jobs: List<&2,Stored>, delay: Nat) -> Runtime:
  match ended:
    case Some{StopScenario.Ended{finish,_}}: stop_cancelled(state,queue,jobs,delay,finish)
    case None{}: Runtime{state,queue,jobs,delay}

def stop_hook_runtime(runtime: Runtime, first: Driver.Handled, following: Driver.Handled, +environment: Environment, +value: Canonical.Command,
    +event: Canonical.CanonicalEvent, now: Nat, +job: Job, +candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> Runtime:
  match runtime:
    case Runtime{+state,queue,jobs,+delay}:
      interpreted_with(collector_combined(first,collector_combined(handler(state,event,value,context_with(environment,state,job,delay,candidate)),following)),
        environment,value,state,queue,jobs,now,job,delay)

# The owner supplies an original fit attempt only for the newly issued action.
# Existing queue entries retain their input, order, time and environmental facts.
def stop_fit_input(input: Input, attempt: Nat) -> Input:
  match input:
    case Event{Driver.Action{Canonical.CollectionFitCheck{items,bytes},delay,candidate,binding,expiry},job}:
      FitEvent{Driver.Action{Canonical.CollectionFitCheck{items,bytes},delay,candidate,binding,expiry},job,attempt}
    case input: input

def stop_fit_item(fresh: Bool, item: Item, attempt: Nat) -> Item:
  match fresh item:
    case True{} Item{at,order,input}: Item{at,order,stop_fit_input(input,attempt)}
    case False{} item: item

def stop_fit_order(item: Item) -> Nat:
  match item:
    case Item{_,order,_}: order

def stop_fit_items(items: List<&2,Item>, +first: Nat, +attempt: Nat) -> List<&2,Item>:
  match items:
    case Nil{}: []
    case +item <> tail:
      stop_fit_item(Nat.is_le(first,stop_fit_order(item)),item,attempt) <> stop_fit_items(tail,first,attempt)

def stop_fit_queue(queue: Queue, first: Nat, attempt: Nat) -> Queue:
  match queue:
    case Queue{items,sequence,synced}: Queue{stop_fit_items(items,first,attempt),sequence,synced}

def stop_fit_runtime(runtime: Runtime, original: Queue, attempt: Maybe<&2,Nat>) -> Runtime:
  match runtime original attempt:
    case Runtime{state,queue,jobs,delay} Queue{_,first,_} Some{attempt}:
      Runtime{state,stop_fit_queue(queue,first,attempt),jobs,delay}
    case runtime _ None{}: runtime

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

# A checked private result carries a refusal beside the unchanged full runtime.
type Interpreted is Data:
  Interpreted{runtime: List<&2,Runtime>, valid: Bool}

def stop_finished_transition(changed: Engine.WorkloadTransition, original: List<&2,Runtime>) -> Interpreted:
  match changed original:
    case Engine.WorkloadTransition{+state,events,True{}} Runtime{_,queue,jobs,delay} <> Nil{}:
      Interpreted{[Runtime{state,emissions(events,queue,state),jobs,delay}],True{}}
    case _ original: Interpreted{original,False{}}

def stop_finished_runtime(runtime_box: List<&2,Runtime>, ended: Maybe<&2,StopScenario.Ended>) -> Interpreted:
  match runtime_box ended:
    case Runtime{+state,+queue,+jobs,+delay} <> Nil{}
      Some{StopScenario.Ended{StopScenario.Finish{p,_,_,_,_,_,True{},_,_,_,_,_,_},continuation}}:
      stop_finished_transition(Engine.workload_action(state,p,Workload.Finished{continuation}),
        [Runtime{state,queue,jobs,delay}])
    case original _: Interpreted{original,True{}}

# Compact callers cannot accept Finish inputs. Their old Runtime ABI remains;
# an unexpected refusal preserves the actual incoming runtime atomically.
def interpreted_original(result: Interpreted, original: Runtime) -> Runtime:
  match result:
    case Interpreted{runtime <> Nil{},True{}}: runtime
    case _: original

def interpret_stopped(stopped: Engine.StopHandled, first: Driver.Handled,
    environment: Environment, value: Canonical.Command, event: Canonical.CanonicalEvent,
    +queue: Queue, jobs: List<&2,Stored>, now: Nat, job: Job, delay: Nat, candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> Interpreted:
  match stopped:
    case Engine.StopHandled{state,following,+ended,attempt,_}:
      stop_finished_runtime([stop_fit_runtime(stop_hook_runtime(stop_ended_runtime(ended,state,queue,jobs,delay),first,following,
        environment,value,event,now,job,candidate,handler),queue,attempt)],ended)

def stop_profile_facts(profile: Maybe<&2,StopProfile>, now: Nat, delay: Nat, lease: Nat) -> StopScenario.CommandFacts:
  match profile:
    case None{}: StopScenario.CommandFacts{now,OutputScenario.Certain{},delay,lease,None{},None{}}
    case Some{StopProfile{outcome,bytes}}: StopScenario.CommandFacts{now,outcome,delay,lease,bytes,None{}}
    case Some{FitProfile{outcome,bytes,attempt}}: StopScenario.CommandFacts{now,outcome,delay,lease,bytes,Some{attempt}}

def stop_command_facts(environment: Environment, now: Nat) -> StopScenario.CommandFacts:
  match environment:
    case Environment{_,_,_,_,delay,lease,profile}: stop_profile_facts(profile,now,delay,lease)

def interpret_collected(changed: Engine.CollectorHandled, +environment: Environment, +value: Canonical.Command,
    +event: Canonical.CanonicalEvent, +queue: Queue, +jobs: List<&2,Stored>, +now: Nat,
    +job: Job, +delay: Nat, +candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> Interpreted:
  match changed:
    case Engine.CollectorHandled{+state,first}:
      interpret_stopped(Engine.stop_command(state,event,value,context_with(environment,state,job,delay,candidate),stop_command_facts(environment,now)),
        first,environment,value,event,queue,jobs,now,job,delay,candidate,handler)

def interpret_with_handler(+environment: Environment, +value: Canonical.Command, +state: Types.State,
    +event: Canonical.CanonicalEvent, +queue: Queue, +jobs: List<&2,Stored>, +now: Nat,
    +job: Job, +delay: Nat, +candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> Interpreted:
  interpret_collected(Engine.collector_command(state,event,value,context_with(environment,state,job,delay,candidate)),
    environment,value,event,queue,jobs,now,job,delay,candidate,handler)

def default_handler(state: Types.State, event: Canonical.CanonicalEvent,
    command: Canonical.Command, context: Driver.Context) -> Driver.Handled:
  Engine.handle(state,event,command,context)

def interpret_with(environment: Environment, value: Canonical.Command, +state: Types.State,
    event: Canonical.CanonicalEvent, +queue: Queue, +jobs: List<&2,Stored>, now: Nat,
    job: Job, +delay: Nat, candidate: Maybe<&2,Driver.Candidate>) -> Runtime:
  interpreted_original(interpret_with_handler(environment,value,state,event,queue,jobs,now,job,delay,candidate,
    state => event => command => context => default_handler(state,event,command,context)),Runtime{state,queue,jobs,delay})

def interpret(value: Canonical.Command, state: Types.State, event: Canonical.CanonicalEvent,
    queue: Queue, jobs: List<&2,Stored>, now: Nat, job: Job, delay: Nat,
    candidate: Maybe<&2,Driver.Candidate>) -> Runtime:
  interpret_with(default_environment(),value,state,event,queue,jobs,now,job,delay,candidate)

def command_interpret_with_handler(environment: Environment, +command: Canonical.Command,
    +state: Types.State, event: Canonical.CanonicalEvent, queue: Queue, +jobs: List<&2,Stored>,
    now: Nat, +job: Job, delay: Nat, candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> Interpreted:
  +actual=command_job(command,jobs,job)
  interpret_with_handler(environment,command,state,event,queue,remember(command,jobs,actual),now,actual,delay,candidate,handler)

def command_interpret_with(environment: Environment, command: Canonical.Command,
    +state: Types.State, event: Canonical.CanonicalEvent, +queue: Queue, +jobs: List<&2,Stored>,
    now: Nat, job: Job, +delay: Nat, candidate: Maybe<&2,Driver.Candidate>) -> Runtime:
  interpreted_original(command_interpret_with_handler(environment,command,state,event,queue,jobs,now,job,delay,candidate,
    state => event => command => context => default_handler(state,event,command,context)),Runtime{state,queue,jobs,delay})

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
    case Finish{_}: [[97n]]
    case FinishIntent{_,_,_,_}: [[97n]]
    case FitEvent{_,_,_}: [[97n]]
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

# Immutable physical facts are read at the actual selected transition, never
# synthesized from an endpoint or the configured output profile.
def frame_receipt_items(originals: List<&2,Callbacks.Original>, +order: Nat) -> Maybe<&2,Callbacks.Fact>:
  match originals:
    case Nil{}: None{}
    case Callbacks.Original{+fact,_,scheduled} <> tail:
      Bool.pick(Maybe<&2,Callbacks.Fact>,Nat.is_eq(scheduled,order),Some{fact},frame_receipt_items(tail,order))

def frame_receipt(before: List<&2,Runtime>, order: Nat) -> Maybe<&2,Callbacks.Fact>:
  frame_receipt_items(runtime_originals(before),order)

def frame_scope_commands(commands: List<&2,Canonical.Command>, +before: Types.State,
    +after: Types.State, +provided: Maybe<&2,Nat>) -> List<&2,Maybe<&2,Nat>>:
  match commands:
    case Nil{}: []
    case command <> tail:
      Engine.scope_command(before,after,command,provided) <> frame_scope_commands(tail,before,after,provided)

def frame_scope_states(before: List<&2,Types.State>, after: List<&2,Types.State>,
    commands: List<&2,Canonical.Command>, provided: Maybe<&2,Nat>) -> List<&2,Maybe<&2,Nat>>:
  match before after:
    case before <> Nil{} after <> Nil{}: frame_scope_commands(commands,before,after,provided)
    case _ _: []

def frame_scopes(result: Canonical.Step, before: List<&2,Runtime>, after: List<&2,Runtime>,
    provided: Maybe<&2,Nat>) -> List<&2,Maybe<&2,Nat>>:
  match result:
    case Canonical.Advanced{_,commands}: frame_scope_states(runtime_states(before),runtime_states(after),commands,provided)
    case Canonical.Rejected{_,_}: []

# Full structural observation seam for consumers of this same factual edge.
# Existing compact fixture entry points remain unchanged. A command hook supplies
# original input captures; all commands and transitions still come from Engine.
type PhysicalDelivery is Data:
  PhysicalDelivery{before: List<&2,Runtime>, after: List<&2,Runtime>, action: Maybe<&2,Driver.Action>}

type ObservedFrame is Data:
  CanonicalFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    order: Nat, event: Canonical.CanonicalEvent, result: List<&2,Canonical.Step>, runtime_before: List<&2,Runtime>, runtime_after: List<&2,Runtime>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,PhysicalDelivery>}
  GraphFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    order: Nat, key: Types.GraphKey, position: Nat, event: Graph.GraphEvent, result: List<&2,Types.GraphTransition>, runtime_before: List<&2,Runtime>, runtime_after: List<&2,Runtime>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,PhysicalDelivery>}
  CacheFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    order: Nat, fact: CacheRuntime.Fact, event: Canonical.CanonicalEvent, result: List<&2,Canonical.Step>, runtime_before: List<&2,Runtime>, runtime_after: List<&2,Runtime>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,PhysicalDelivery>}
  FinishFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    order: Nat, input: StopScenario.Input, finish: Maybe<&2,StopScenario.Finish>, created: Bool, runtime_before: List<&2,Runtime>, runtime_after: List<&2,Runtime>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,PhysicalDelivery>}
  UnexpectedInput{}
# A callback is linear (Type). It returns the next callback with the updated
# factual captures. Factories must build this finite chain from the actual
# shrinking command list; neither callback nor initial captures are copied.
type CommandHook<-F: Data> is Type:
  HookEnd{facts: F}
  HookFault{facts: F}
  HookNext{facts: F, handle: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled, apply: F -> Canonical.Command -> List<&2,Runtime> -> (List<&2,Runtime> & CommandHook<F>)}
type TransitionHook<-F: Data> is Type:
  TransitionHook{hook: CommandHook<F>, apply: List<&2,Runtime> -> List<&2,Runtime> -> Canonical.CanonicalEvent -> Canonical.Step -> Nat -> CommandHook<F> -> (List<&2,Runtime> & CommandHook<F>)}

def transition_identity(-F: Data, _before: List<&2,Runtime>, after: List<&2,Runtime>,
    _event: Canonical.CanonicalEvent, _result: Canonical.Step, _now: Nat,
    hook: CommandHook<F>) -> List<&2,Runtime> & CommandHook<F>:
  after & hook

def transition_hook(-F: Data, hook: CommandHook<F>) -> TransitionHook<F>:
  TransitionHook{hook,transition_identity(F)}

def transition_commands(-F: Data, transition: TransitionHook<F>) -> CommandHook<F>:
  match transition:
    case TransitionHook{hook,_}: hook

type Commanded<-F: Data> is Type:
  Commanded{runtime: List<&2,Runtime>, hook: CommandHook<F>, valid: Bool}
type Observed<-F: Data> is Type:
  Observed{runtime: List<&2,Runtime>, frame: Maybe<&2,ObservedFrame>, hook: CommandHook<F>}

def snapshot_after(before: List<&2,Types.State>, after: List<&2,Types.State>,
    event: Canonical.CanonicalEvent) -> List<&2,Driver.Action>:
  match before after:
    case before <> Nil{} after <> Nil{}: Engine.after(before,after,event)
    case _ _: []

# Wake facts use the same captured Stop scope and cutoff as public/NativeRun.
# The transport only avoids a duplicate original poll at the same queue time.
def stop_wake_event(event: Canonical.CanonicalEvent) -> Bool:
  match event:
    case Canonical.PreparationCompleted{_,_,_,_,_}: True{}
    case Canonical.JevRequestSettled{_,_,_,_,_,_,_}: True{}
    case Canonical.SubmissionTerminal{_,_,_}: True{}
    case Canonical.CollectionReleaseLease{_,_}: True{}
    case _: False{}

def stop_wake_queued(items: List<&2,Item>, +finish: StopScenario.Finish, +now: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case Item{at,_,input} <> tail:
      (Nat.is_eq(at,now) && stop_poll_owned(input,finish)) || stop_wake_queued(tail,finish,now)

def stop_wake_present(queue: Queue, finish: StopScenario.Finish, now: Nat) -> Bool:
  match queue:
    case Queue{items,_,_}: stop_wake_queued(items,finish,now)

def stop_wake_append(found: Bool, queue: Queue, finish: StopScenario.Finish, +now: Nat) -> Queue:
  match found finish:
    case False{} StopScenario.Finish{+p,+l,r,a,t,cutoff,recurring,selected,waiting,count,started,fit,output}:
      append(queue,now,Event{Driver.immediate(StopScenario.poll(
        StopScenario.Capture{p,l,r,a,t,started,cutoff},now),False{}),Job{p,l,0n,[],Canonical.NeverSent{}}})
    case True{} _: queue

def stop_wake_finish(+queue: Queue, +finish: StopScenario.Finish, +now: Nat) -> Queue:
  match finish:
    case StopScenario.Finish{_,_,_,_,_,_,_,_,True{},_,_,_,_}:
      stop_wake_append(stop_wake_present(queue,finish,now),queue,finish,now)
    case _: queue

def stop_wake_finishes(finishes: List<&2,StopScenario.Finish>, queue: Queue, +now: Nat) -> Queue:
  match finishes:
    case Nil{}: queue
    case finish <> tail: stop_wake_finishes(tail,stop_wake_finish(queue,finish,now),now)

def stop_wake_queue(wake: Bool, state: Types.State, queue: Queue, now: Nat) -> Queue:
  match wake:
    case True{}: stop_wake_finishes(Engine.stop_entries(state),queue,now)
    case False{}: queue

def observed_collector_finished(-F: Data, changed: Engine.CollectorHandled, emitted: List<&2,Driver.Action>,
    queue: Queue, jobs: List<&2,Stored>, delay: Nat, +before: List<&2,Runtime>,
    +event: Canonical.CanonicalEvent, +now: Nat, +order: Nat, +job: Job,
    +result: Canonical.Step, hook: CommandHook<F>) -> Observed<F>:
  match changed:
    case Engine.CollectorHandled{+state,Driver.Handled{_,following}}:
      +after:List<&2,Runtime>=runtime_sync([Runtime{state,stop_wake_queue(stop_wake_event(event),state,
          actions(List.append(&2,Driver.Action,emitted,following),queue,now,job),now),jobs,delay}])
      Observed{after,
        Some{CanonicalFrame{runtime_states(before),runtime_states(after),now,order,event,[result],before,after,Some{job_partition(job)},frame_scopes(result,before,after,Some{job_partition(job)}),None{},[]}},hook}

def observed_finished_ready(-F: Data, emitted: List<&2,Driver.Action>, runtime: List<&2,Runtime>,
    before: List<&2,Runtime>, +event: Canonical.CanonicalEvent, now: Nat, order: Nat,
    job: Job, result: Canonical.Step, hook: CommandHook<F>) -> Observed<F>:
  match runtime:
    case Runtime{state,queue,jobs,delay} <> Nil{}:
      observed_collector_finished(F,Engine.collector_after(state,event),emitted,queue,jobs,delay,before,event,now,order,job,result,hook)
    case runtime: Observed{runtime,Some{UnexpectedInput{}},hook}

def snapshot_valid(states: List<&2,Types.State>) -> Bool:
  match states:
    case _ <> Nil{}: True{}
    case _: False{}

def observed_finished_valid(-F: Data, valid: Bool, +runtime: List<&2,Runtime>, +before: List<&2,Runtime>,
    +event: Canonical.CanonicalEvent, now: Nat, order: Nat, job: Job,
    result: Canonical.Step, hook: CommandHook<F>) -> Observed<F>:
  match valid:
    case True{}:
      observed_finished_ready(F,snapshot_after(runtime_states(before),runtime_states(runtime),event),runtime,
        before,event,now,order,job,result,hook)
    case False{}: Observed{runtime,Some{UnexpectedInput{}},hook}

def observed_finished(-F: Data, runtime: List<&2,Runtime>, +before: List<&2,Runtime>,
    event: Canonical.CanonicalEvent, now: Nat, order: Nat, job: Job,
    result: Canonical.Step, hook: CommandHook<F>) -> Observed<F>:
  observed_finished_valid(F,snapshot_valid(runtime_states(before)),runtime,before,event,now,order,job,result,hook)

def observed_following(-F: Data, pair: List<&2,Runtime> & CommandHook<F>,
    ih: List<&2,Runtime> -> CommandHook<F> -> Commanded<F>) -> Commanded<F>:
  (next,following)=pair
  ih(runtime_sync(next),following)

# The event remains in its direct linear carrier; callbacks keep the incoming
# runtime carrier instead of exposing all fields in their continuation.
def observed_interpret(events: Array<Canonical.CanonicalEvent>, runtime: List<&2,Runtime>,
    environment: Environment, command: Canonical.Command, now: Nat, job: Job,
    candidate: Maybe<&2,Driver.Candidate>,
    handler: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled) -> Interpreted:
  match events runtime:
    case ALeaf{event} Runtime{state,queue,jobs,delay} <> Nil{}:
      command_interpret_with_handler(environment,command,state,event,queue,jobs,now,job,delay,candidate,handler)
    case _ runtime: Interpreted{runtime,False{}}

def observed_interpreted(-F: Data, result: Interpreted, facts: F, +command: Canonical.Command,
    apply: F -> Canonical.Command -> List<&2,Runtime> -> (List<&2,Runtime> & CommandHook<F>),
    ih: List<&2,Runtime> -> CommandHook<F> -> Commanded<F>) -> Commanded<F>:
  match result:
    case Interpreted{runtime,True{}}: observed_following(F,apply(facts,command,runtime_sync(runtime)),ih)
    case Interpreted{runtime,False{}}: Commanded{runtime,HookFault{facts},False{}}

def observed_apply(-F: Data, valid: Bool, events: Array<Canonical.CanonicalEvent>, runtime: List<&2,Runtime>,
    environment: Environment, +command: Canonical.Command, now: Nat, job: Job,
    candidate: Maybe<&2,Driver.Candidate>, facts: F,
    handle: Types.State -> Canonical.CanonicalEvent -> Canonical.Command -> Driver.Context -> Driver.Handled,
    apply: F -> Canonical.Command -> List<&2,Runtime> -> (List<&2,Runtime> & CommandHook<F>),
    ih: List<&2,Runtime> -> CommandHook<F> -> Commanded<F>) -> Commanded<F>:
  match valid events:
    case True{} ALeaf{event}:
      observed_interpreted(F,observed_interpret(ALeaf{event},runtime,environment,command,now,job,candidate,handle),facts,command,apply,ih)
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

def observed_commanded(-F: Data, commanded: Commanded<F>, before: List<&2,Runtime>,
    event: Canonical.CanonicalEvent, now: Nat, order: Nat, job: Job,
    result: Canonical.Step) -> Observed<F>:
  match commanded:
    case Commanded{runtime,hook,True{}}: observed_finished(F,runtime,before,event,now,order,job,result,hook)
    case Commanded{runtime,hook,_}: Observed{runtime,Some{UnexpectedInput{}},hook}

def actual_commands(result: Canonical.Step) -> List<&2,Canonical.Command>:
  match result:
    case Canonical.Advanced{_,commands}: commands
    case Canonical.Rejected{_,_}: []

# The event transition runs once, including rejected/zero-command steps. Cache
# facts already queued by the existing publication path remain before its facts;
# command actions follow it, matching the public runner's enqueue order.
def observed_transition_ready(-F: Data, transitioned: List<&2,Runtime> & CommandHook<F>,
    +result: Canonical.Step, before: List<&2,Runtime>, +event: Canonical.CanonicalEvent,
    +job: Job, +now: Nat, order: Nat, candidate: Maybe<&2,Driver.Candidate>,
    environment: Environment) -> Observed<F>:
  match transitioned:
    case (runtime,hook):
      observed_commanded(F,observed_commands(F,actual_commands(result),runtime_sync(runtime),event,now,job,candidate,environment,hook),
        before,event,now,order,job,result)

def observed_transition_hook(-F: Data, transition: TransitionHook<F>, +result: Canonical.Step,
    runtime: List<&2,Runtime>, +before: List<&2,Runtime>, +event: Canonical.CanonicalEvent,
    job: Job, +now: Nat, order: Nat, candidate: Maybe<&2,Driver.Candidate>,
    environment: Environment) -> Observed<F>:
  match transition:
    case TransitionHook{hook,apply}:
      observed_transition_ready(F,apply(before,runtime_sync(runtime),event,result,now,hook),result,before,event,job,now,order,candidate,environment)

def observed_result(-F: Data, +result: Canonical.Step, runtime: List<&2,Runtime>, before: List<&2,Runtime>,
    event: Canonical.CanonicalEvent, job: Job, now: Nat, order: Nat,
    candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_transition_hook(F,factory(actual_commands(result)),result,runtime,before,event,job,now,order,candidate,environment)

def cache_facts(list: List<&2,CacheRuntime.Fact>, queue: Queue, +now: Nat, +job: Job) -> Queue:
  match list:
    case Nil{}: queue
    case fact <> tail: cache_facts(tail,append(queue,now,Cache{fact,job}),now,job)


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
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  match published runtime:
    case Engine.CachePublished{state,facts,releases} <> Nil{} Runtime{_,queue,jobs,delay} <> Nil{}:
      observed_result(F,result,[Runtime{state,
        actions(Engine.sharing_actions(List.append(&2,Canonical.CanonicalEvent,removed,releases)),cache_facts(facts,queue,now,job),now,job),
        jobs,delay}],runtime,event,job,now,order,candidate,environment,factory)
    case _ runtime: Observed{runtime,Some{UnexpectedInput{}},transition_commands(F,factory([]))}

def observed_transition(-F: Data, transition: List<&2,Engine.Transition>, +runtime: List<&2,Runtime>,
    +event: Canonical.CanonicalEvent, job: Job, now: Nat, order: Nat,
    candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  match transition:
    case Engine.Transition{state,+result} <> Nil{}:
      observed_published(F,runtime_cache_begin(runtime,state,event,actual_commands(result)),runtime,event,
        job,now,order,candidate,environment,result,runtime_cache_removed(runtime,actual_commands(result)),factory)
    case _: Observed{runtime,Some{UnexpectedInput{}},transition_commands(F,factory([]))}

def cache_observed(-F: Data, observed: Observed<F>, fact: CacheRuntime.Fact) -> Observed<F>:
  match observed:
    case Observed{runtime,Some{CanonicalFrame{before,after,time,order,event,result,runtime_before,runtime_after,provided,scopes,receipt,physical}},hook}:
      Observed{runtime,Some{CacheFrame{before,after,time,order,fact,event,result,runtime_before,runtime_after,provided,scopes,receipt,physical}},hook}
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
    runtime: List<&2,Runtime>, before: List<&2,Runtime>, fact: CacheRuntime.Fact,
    job: Job, now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  match queue applied runtime:
    case queue <> Nil{} Engine.CacheApplied{state,event,result,_,_,True{}} <> Nil{}
        Runtime{_,_,jobs,delay} <> Nil{}:
      cache_observed(F,observed_result(F,result,[Runtime{state,queue,jobs,delay}],before,event,job,now,order,None{},environment,factory),fact)
    case _ _ runtime: Observed{runtime,Some{UnexpectedInput{}},transition_commands(F,factory([]))}

def observed_cache_valid(-F: Data, valid: Bool, +applied: List<&2,Engine.CacheApplied>, +runtime: List<&2,Runtime>,
    fact: CacheRuntime.Fact, +job: Job, +now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  match valid:
    case True{}:
      observed_cache_ready(F,cache_applied_queue(applied,runtime_queues(runtime),
        cache_applied_actions(applied,runtime_cache_removed(runtime,cache_applied_commands(applied))),now,job),
        applied,runtime,runtime,fact,job,now,order,environment,factory)
    case False{}: Observed{runtime,Some{UnexpectedInput{}},transition_commands(F,factory([]))}

def observed_cache(-F: Data, +applied: List<&2,Engine.CacheApplied>, runtime: List<&2,Runtime>,
    fact: CacheRuntime.Fact, job: Job, now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_cache_valid(F,cache_applied_valid(applied),applied,runtime,fact,job,now,order,environment,factory)

def observed_cache_input(-F: Data, +runtime: List<&2,Runtime>, +fact: CacheRuntime.Fact,
    job: Job, now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_cache(F,runtime_cache_apply(runtime,fact),runtime,fact,job,now,order,environment,factory)

def runtime_step(runtime: List<&2,Runtime>, event: Canonical.CanonicalEvent) -> List<&2,Engine.Transition>:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: [Engine.step(state,event)]
    case _: []

def observed_completion(-F: Data, completion: List<&2,SharingRuntime.Completion>, +runtime: List<&2,Runtime>,
    job: Job, now: Nat, order: Nat, candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  match completion:
    case SharingRuntime.Completion{+event,True{}} <> Nil{}:
      observed_transition(F,runtime_step(runtime,event),runtime,event,job,now,order,candidate,environment,factory)
    case _: Observed{runtime,Some{UnexpectedInput{}},transition_commands(F,factory([]))}

def runtime_completion(runtime: List<&2,Runtime>, event: Canonical.CanonicalEvent) -> List<&2,SharingRuntime.Completion>:
  match runtime:
    case Runtime{state,_,_,_} <> Nil{}: [Engine.sharing_completion(state,event)]
    case _: []

def observed_fenced(-F: Data, events: List<&2,Canonical.CanonicalEvent>, +runtime: List<&2,Runtime>,
    job: Job, now: Nat, order: Nat, candidate: Maybe<&2,Driver.Candidate>, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  match events:
    case event <> Nil{}:
      observed_completion(F,runtime_completion(runtime,event),runtime,job,now,order,candidate,environment,factory)
    case _: Observed{runtime,Some{UnexpectedInput{}},transition_commands(F,factory([]))}

def runtime_fence(runtime: List<&2,Runtime>, event: Canonical.CanonicalEvent, environment: Environment,
    job: Job, candidate: Maybe<&2,Driver.Candidate>) -> List<&2,Canonical.CanonicalEvent>:
  match runtime:
    case Runtime{+state,_,_,delay} <> Nil{}:
      [Engine.fence(state,event,True{},context_with(environment,state,job,delay,candidate))]
    case _: []

def observed_event(-F: Data, +runtime: List<&2,Runtime>, event: Canonical.CanonicalEvent,
    +job: Job, now: Nat, order: Nat, +candidate: Maybe<&2,Driver.Candidate>, +environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_fenced(F,runtime_fence(runtime,event,environment,job,candidate),runtime,job,now,order,candidate,environment,factory)

def observed_edit(-F: Data, attempt: Engine.EditAttempt, queue: Queue, jobs: List<&2,Stored>,
    +job: Job, +now: Nat, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match attempt:
    case Engine.EditAttempt{state,Driver.EditPlan{retry,emitted}}:
      Observed{runtime_sync([Runtime{state,retry_edit(retry,actions(emitted,queue,now,job),now,job),jobs,delay}]),None{},hook}

def observed_graph(-F: Data, +result: Types.GraphTransition, +before: List<&2,Runtime>, queue: Queue,
    jobs: List<&2,Stored>, now: Nat, order: Nat, key: Types.GraphKey, position: Nat,
    event: Graph.GraphEvent, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match result:
    case Types.GraphTransition{+state,_,_}:
      +after:List<&2,Runtime>=runtime_sync([Runtime{state,queue,jobs,delay}])
      Observed{after,Some{GraphFrame{runtime_states(before),runtime_states(after),now,order,key,position,event,[result],before,after,None{},[],None{},[]}},hook}
    case Types.GraphRejected{+state}:
      +after:List<&2,Runtime>=runtime_sync([Runtime{state,queue,jobs,delay}])
      Observed{after,Some{GraphFrame{runtime_states(before),runtime_states(after),now,order,key,position,event,[result],before,after,None{},[],None{},[]}},hook}

def observed_workload(-F: Data, result: Engine.WorkloadTransition, queue: Queue,
    jobs: List<&2,Stored>, delay: Nat, hook: CommandHook<F>) -> Observed<F>:
  match result:
    case Engine.WorkloadTransition{+state,events,True{}}:
      Observed{runtime_sync([Runtime{state,emissions(events,queue,state),jobs,delay}]),None{},hook}
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

def observed_graph_valid(-F: Data, valid: Bool, +state: Types.State, +queue: Queue, +jobs: List<&2,Stored>,
    +p: Nat, +l: Nat, +r: Nat, +o: Nat, +position: Nat, +event: Graph.GraphEvent,
    now: Nat, order: Nat, +delay: Nat, limits: Graph.Limits, hook: CommandHook<F>) -> Observed<F>:
  match valid:
    case True{}:
      observed_graph(F,Engine.graph_step(state,Types.GraphKey{p,l,r,o,0n},position,limits,event),[Runtime{state,queue,jobs,delay}],queue,jobs,now,order,Types.GraphKey{p,l,r,o,0n},position,event,delay,hook)
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

def stop_input_job(input: StopScenario.Input) -> Job:
  match input:
    case StopScenario.Input{p,l,_,_,_,_}: Job{p,l,0n,[],Canonical.NeverSent{}}

def stop_fact_queue(facts: List<&2,StopScenario.Fact>, queue: Queue, +job: Job) -> Queue:
  match facts:
    case Nil{}: queue
    case StopScenario.Fact{at,event} <> tail:
      stop_fact_queue(tail,append(queue,at,Event{Driver.immediate(event,False{}),job}),job)

def stop_registration_queue(created: Bool, found: Maybe<&2,StopScenario.Finish>, queue: Queue, job: Job) -> Queue:
  match created found:
    case True{} Some{finish}: stop_fact_queue(Engine.stop_initial(StopScenario.finish_capture(finish)),queue,job)
    case _ _: queue

def observed_finish_registered(-F: Data, registered: Engine.StopRegistered, +before: List<&2,Runtime>,
    queue: Queue, jobs: List<&2,Stored>, delay: Nat, +input: StopScenario.Input, now: Nat, order: Nat,
    hook: CommandHook<F>) -> Observed<F>:
  match registered:
    case Engine.StopRegistered{+state,+finish,+created}:
      +after:List<&2,Runtime>=runtime_sync([Runtime{state,stop_registration_queue(created,finish,queue,stop_input_job(input)),jobs,delay}])
      Observed{after,
        Some{FinishFrame{runtime_states(before),runtime_states(after),now,order,input,finish,created,before,after,Some{job_partition(stop_input_job(input))},[],None{},[]}},hook}

def observed_finish(-F: Data, +runtime: List<&2,Runtime>, +input: StopScenario.Input, now: Nat, order: Nat,
    hook: CommandHook<F>) -> Observed<F>:
  match runtime:
    case Runtime{+state,+queue,+jobs,+delay} <> Nil{}:
      observed_finish_registered(F,Engine.stop_register(state,input),[Runtime{state,queue,jobs,delay}],queue,jobs,delay,input,now,order,hook)
    case runtime: Observed{runtime,Some{UnexpectedInput{}},hook}

def observed_finish_started(-F: Data, registered: Engine.StopRegistered, +before: List<&2,Runtime>,
    queue: Queue, jobs: List<&2,Stored>, delay: Nat, now: Nat, order: Nat, hook: CommandHook<F>) -> Observed<F>:
  match registered:
    case Engine.StopRegistered{+state,Some{+finish},created}:
      observed_finish_registered(F,Engine.StopRegistered{state,Some{finish},created},before,queue,jobs,delay,
        StopScenario.input_capture(finish),now,order,hook)
    case Engine.StopRegistered{state,None{},_}:
      Observed{[Runtime{state,queue,jobs,delay}],Some{UnexpectedInput{}},hook}

def observed_finish_intent(-F: Data, runtime: List<&2,Runtime>, p: Nat, started: Nat, cutoff: Nat,
    recurring: Bool, now: Nat, order: Nat, hook: CommandHook<F>) -> Observed<F>:
  match runtime:
    case Runtime{+state,+queue,+jobs,+delay} <> Nil{}:
      observed_finish_started(F,Engine.stop_start(state,p,started,cutoff,recurring),[Runtime{state,queue,jobs,delay}],queue,jobs,delay,now,order,hook)
    case runtime: Observed{runtime,Some{UnexpectedInput{}},hook}

def observed_input_state(-F: Data, +value: Input, +runtime: List<&2,Runtime>,
    now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_input_ready(F,input_valid(value,runtime),value,runtime,now,order,environment_graph(environment),transition_commands(F,factory([])))

def stop_fit_profile(profile: Maybe<&2,StopProfile>, attempt: Nat) -> Maybe<&2,StopProfile>:
  match profile:
    case None{}: Some{FitProfile{OutputScenario.Certain{},None{},attempt}}
    case Some{StopProfile{outcome,bytes}}: Some{FitProfile{outcome,bytes,attempt}}
    case Some{FitProfile{outcome,bytes,_}}: Some{FitProfile{outcome,bytes,attempt}}

def stop_fit_environment(environment: Environment, attempt: Nat) -> Environment:
  match environment:
    case Environment{seed,tree,graph,prep,delay,lease,profile}:
      Environment{seed,tree,graph,prep,delay,lease,stop_fit_profile(profile,attempt)}

def observed_input(-F: Data, value: Input, runtime: List<&2,Runtime>,
    now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  match value:
    case Event{Driver.Action{event,_,candidate,_,_},job}:
      observed_event(F,runtime,event,job,now,order,candidate,environment,factory)
    case FitEvent{Driver.Action{event,_,candidate,_,_},job,attempt}:
      observed_event(F,runtime,event,job,now,order,candidate,stop_fit_environment(environment,attempt),factory)
    case Cache{fact,job}: observed_cache_input(F,runtime,fact,job,now,order,environment,factory)
    case Finish{input}: observed_finish(F,runtime,input,now,order,transition_commands(F,factory([])))
    case FinishIntent{p,started,cutoff,recurring}: observed_finish_intent(F,runtime,p,started,cutoff,recurring,now,order,transition_commands(F,factory([])))
    case Missing{}: Observed{runtime,Some{UnexpectedInput{}},transition_commands(F,factory([]))}
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

# Carry the exact selected fact across physical consumption. The callback owner
# removes delivered originals, so a later lookup is not evidence of issuance.
def observed_receipt_frame(frame: ObservedFrame, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,PhysicalDelivery>) -> ObservedFrame:
  match frame:
    case CanonicalFrame{before,after,time,order,event,result,runtime_before,runtime_after,provided,scopes,_,_}:
      CanonicalFrame{before,after,time,order,event,result,runtime_before,runtime_after,provided,scopes,receipt,physical}
    case GraphFrame{before,after,time,order,key,position,event,result,runtime_before,runtime_after,provided,scopes,_,_}:
      GraphFrame{before,after,time,order,key,position,event,result,runtime_before,runtime_after,provided,scopes,receipt,physical}
    case CacheFrame{before,after,time,order,fact,event,result,runtime_before,runtime_after,provided,scopes,_,_}:
      CacheFrame{before,after,time,order,fact,event,result,runtime_before,runtime_after,provided,scopes,receipt,physical}
    case FinishFrame{before,after,time,order,input,finish,created,runtime_before,runtime_after,provided,scopes,_,_}:
      FinishFrame{before,after,time,order,input,finish,created,runtime_before,runtime_after,provided,scopes,receipt,physical}
    case UnexpectedInput{}: UnexpectedInput{}

def observed_receipted(-F: Data, observed: Observed<F>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,PhysicalDelivery>) -> Observed<F>:
  match observed:
    case Observed{runtime,Some{frame},hook}: Observed{runtime,Some{observed_receipt_frame(frame,receipt,physical)},hook}
    case observed: observed

def delivered_input(action: Maybe<&2,Driver.Action>, input: Input) -> Input:
  match action input:
    case Some{action} Event{_,job}: Event{action,job}
    case Some{action} FitEvent{_,job,attempt}: FitEvent{action,job,attempt}
    case _ input: input

def delivered_state(input: Input, state: Types.State, order: Nat) -> Types.State:
  match input:
    case Event{_,_}: Engine.callback_delivered(state,order)
    case FitEvent{_,_,_}: Engine.callback_delivered(state,order)
    case _: state

def delivered_runtime(input: Input, runtime: List<&2,Runtime>, order: Nat) -> List<&2,Runtime>:
  match runtime:
    case Runtime{state,queue,jobs,delay} <> Nil{}:
      [Runtime{delivered_state(input,state,order),queue,jobs,delay}]
    case runtime: runtime

def physical_delivery(receipt: Maybe<&2,Callbacks.Fact>, before: List<&2,Runtime>,
    after: List<&2,Runtime>, action: Maybe<&2,Driver.Action>) -> List<&2,PhysicalDelivery>:
  match receipt:
    case Some{_}: [PhysicalDelivery{before,after,action}]
    case None{}: []

def observed_delivered(-F: Data, input: Input, +before: List<&2,Runtime>, +after: List<&2,Runtime>,
    +receipt: Maybe<&2,Callbacks.Fact>, +action: Maybe<&2,Driver.Action>,
    now: Nat, order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_receipted(F,observed_input(F,delivered_input(action,input),after,now,order,environment,factory),
    receipt,physical_delivery(receipt,before,after,action))

def receipt_delivery(receipt: Maybe<&2,Callbacks.Fact>, now: Nat) -> Maybe<&2,Driver.Action>:
  match receipt:
    case Some{fact}: Engine.output_deliver(fact,now)
    case None{}: None{}

def observed_delivery(-F: Data, +input: Input, +runtime: List<&2,Runtime>, +receipt: Maybe<&2,Callbacks.Fact>,
    +now: Nat, +order: Nat, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_delivered(F,input,runtime,delivered_runtime(input,runtime,order),receipt,
    receipt_delivery(receipt,now),now,order,environment,factory)

def observed_taken(-F: Data, +taken: List<&2,Engine.Taken>, +runtime: List<&2,Runtime>, receipt: Maybe<&2,Callbacks.Fact>,
    environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  match taken:
    case Engine.Taken{_,Some{Scheduler.Entry{now,+order}}} <> Nil{}:
      observed_delivery(F,lookup(runtime_items(runtime),order),taken_runtime(taken,runtime),receipt,now,order,environment,factory)
    case Engine.Taken{_,None{}} <> Nil{}:
      Observed{taken_runtime(taken,runtime),None{},transition_commands(F,factory([]))}
    case _: Observed{runtime,Some{UnexpectedInput{}},transition_commands(F,factory([]))}

# Projection runs on one copy; the original recursive carrier stays closed
# across both sync and take, just as it does across command callbacks.
def observed_take(runtime: List<&2,Runtime>) -> List<&2,Engine.Taken>:
  match runtime:
    case Runtime{state,Queue{items,_,synced},_,_} <> Nil{}:
      [Engine.take(sync(items,state,synced))]
    case _: []

def observed_take_ready(-F: Data, taken: List<&2,Engine.Taken>, runtime: List<&2,Runtime>, receipt: Maybe<&2,Callbacks.Fact>,
    environment: Environment, factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_taken(F,taken,runtime,receipt,environment,factory)

def observe_step_with(-F: Data, +runtime: List<&2,Runtime>, receipt: Maybe<&2,Callbacks.Fact>, environment: Environment,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observed_take_ready(F,observed_take(runtime),runtime,receipt,environment,factory)

def observe_step(-F: Data, runtime: List<&2,Runtime>,
    factory: List<&2,Canonical.Command> -> TransitionHook<F>) -> Observed<F>:
  observe_step_with(F,runtime,None{},default_environment(),factory)
