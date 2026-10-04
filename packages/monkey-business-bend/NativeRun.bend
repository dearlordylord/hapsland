import Base
import ./NativeRunTypes.bend as T
import ./CollectorScenario.bend as CollectorScenario
import ./Engine.bend as Engine
import ./Types.bend as EngineTypes
import ./Advicees.bend as Advicees
import ./Workload.bend as Workload
import ./Driver.bend as Driver
import ./Callbacks.bend as Callbacks
import ./CacheRuntime.bend as CacheRuntime
import ./Numeric.bend as Numeric
import ./PreparationScenario.bend as PreparationScenario
import ./TreeFacts.bend as TreeFacts
import ./NativeFinish.bend as NativeFinish
import ./StopScenario.bend as StopScenario
import ./OutputScenario.bend as OutputScenario
import ./Scheduler.bend as Scheduler
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ../agent-flow-bend/Ledger.bend as Ledger
import ../agent-flow-bend/Dispatch.bend as Dispatch
import ./AdviceeLifecycle.bend as AdviceeLifecycle
import ./AdviceeLifecycleCleanup.bend as LifecycleCleanup

# Generic factual orchestration over the shared decision/effect owner. Every
# dated input goes through Engine.enqueue/take; this module never selects order.
def core_value(values: List<&2, EngineTypes.State>) -> EngineTypes.State:
  match values:
    case value <> _: value
    case Nil{}: Engine.initial(Ledger.Limits{0n, 0n, 0n, 0n})

def core(state: T.State) -> EngineTypes.State:
  match state:
    case T.State{value, _, _, _, _, _, _, _, _,jobs}: core_value(value)

def replace_core(state: T.State, value: EngineTypes.State) -> T.State:
  match state:
    case T.State{_, items, next, count, seed, environment, latest, valid, prepared,jobs}:
      T.State{[value], items, next, count, seed, environment, latest, valid, prepared,jobs}

def invalid(state: T.State) -> T.State:
  match state:
    case T.State{core, items, next, count, seed, environment, latest, _, prepared,jobs}:
      T.State{core, items, next, count, seed, environment, latest, False{}, prepared,jobs}

def clock(state: T.State) -> Nat:
  Engine.clock(core(state))

def next_order(state: T.State) -> Nat:
  match state:
    case T.State{_, _, next, _, _, _, _, _, _,jobs}: next

def maximum() -> Nat:
  Advicees.maximum()

def enqueued(valid: Bool, state: T.State, time: Nat, input: T.Input) -> T.State:
  match valid state:
    case True{} T.State{core, items, +next, count, seed, environment, latest, valid, prepared,jobs}:
      T.State{[Engine.enqueue(core_value(core), time, next)], List.append(&2, T.Item, items, [T.Item{next, input}]), (next + 1n : Nat), count, seed, environment, latest, valid, prepared,jobs}
    case False{} state: invalid(state)

def enqueue(+state: T.State, +time: Nat, input: T.Input) -> T.State:
  enqueued(Nat.is_le(clock(state), time) && Nat.is_le(time, maximum()) && Nat.is_lt(next_order(state), maximum()), state, time, input)

def arrival_time(emission: Workload.Emission) -> Nat:
  match emission:
    case Workload.Emission{time, _, _, _, _, _, _, _, _, _}: time

def activity_incarnation(value: Maybe<&2,Nat>) -> Nat:
  match value:
    case Some{value}: value
    case None{}: 1n

def arrival_activity(state: T.State, emission: Workload.Emission) -> Nat:
  match emission:
    case Workload.Emission{_,partition,_,_,_,_,_,_,_,_}:
      activity_incarnation(Engine.activity_scope(core(state),partition))

def arrivals(events: List<&2, Workload.Emission>, +state: T.State) -> T.State:
  match events:
    case Nil{}: state
    case +head <> tail: arrivals(tail, enqueue(state, arrival_time(head), T.Arrival{head,arrival_activity(state,head)}))

def workload_changed(state: T.State, changed: Engine.WorkloadTransition) -> T.State:
  match changed:
    case Engine.WorkloadTransition{core, events, True{}}: arrivals(events, replace_core(state, core))
    case _: invalid(state)

def workload(+state: T.State, partition: Nat, action: Workload.Action) -> T.State:
  workload_changed(state, Engine.workload_action(core(state), partition, action))

def configure_profile(+state: T.State, partition: Nat, profile: Maybe<&2,Workload.Profile>) -> T.State:
  match profile:
    case None{}: state
    case Some{profile}: replace_core(state,Engine.configure_workload(core(state),partition,profile))

def configured_scope(state: T.State, profile: Maybe<&2,Workload.Profile>, scope: Maybe<&2,Advicees.Scope>) -> T.State:
  match scope:
    case Some{Advicees.Scope{_,partition,_}}: configure_profile(state,partition,profile)
    case None{}: invalid(state)

def declared(state: T.State, profile: Maybe<&2,Workload.Profile>, result: Engine.AdviceeDeclared) -> T.State:
  match result:
    case Engine.AdviceeDeclared{core,scope,True{}}: configured_scope(replace_core(state,core),profile,scope)
    case _: invalid(state)

def configure(advicees: List<&2,T.Advicee>, +state: T.State) -> T.State:
  match advicees:
    case Nil{}: state
    case T.Advicee{identity,seed,profile} <> tail:
      configure(tail,declared(state,profile,Engine.declare_advicee(core(state),identity,seed)))

def startup_scope(+state: T.State, scope: Maybe<&2,Advicees.Scope>) -> T.State:
  match scope:
    case Some{Advicees.Scope{_,partition,_}}: workload(state,partition,Workload.Next{})
    case None{}: invalid(state)

def startup_profile(+state: T.State, identity: Nat, profile: Maybe<&2,Workload.Profile>) -> T.State:
  match profile:
    case None{}: state
    case Some{_}: startup_scope(state,Engine.advicee_identity(core(state),identity))

def startup(advicees: List<&2,T.Advicee>, +state: T.State) -> T.State:
  match advicees:
    case Nil{}: state
    case T.Advicee{identity,_,profile} <> tail:
      startup(tail,startup_profile(state,identity,profile))

def initial_core(environment: T.Environment, limits: Ledger.Limits, seed: Nat) -> EngineTypes.State:
  match environment:
    case T.Environment{_, _, _, _, _, _, _, _, _, ready, generation, _, _}:
      Engine.configure_credentials(Engine.configure_seed(Engine.initial(limits), seed), ready, generation)

def weight_valid(weight: Numeric.Words) -> Bool:
  match weight:
    case Numeric.Words{+high, +low}:
      Nat.is_le(low, 4294967295n) && Nat.is_le(high, 1079574528n) &&
        (Nat.is_lt(high, 1079574528n) || Nat.is_eq(low, 0n))

def weights_valid(weights: List<&2, Numeric.Words>) -> Bool:
  match weights:
    case Nil{}: True{}
    case head <> tail: weight_valid(head) && weights_valid(tail)

def weights_enabled(weights: List<&2, Numeric.Words>) -> Bool:
  match weights:
    case Nil{}: False{}
    case Numeric.Words{high, low} <> tail: Nat.is_gt(high, 0n) || Nat.is_gt(low, 0n) || weights_enabled(tail)

def initial_environment_supported(environment: T.Environment) -> Bool:
  match environment:
    case T.Environment{jev, _, +weights, preparation, _, _, output, +lease, _, _, +generation, _, +lifetime}:
      Nat.is_le(jev, maximum()) && Nat.is_le(preparation, maximum()) &&
        Nat.is_le(output, 1000000000n) && Nat.is_gt(lease, 0n) && Nat.is_le(lease, 1000000000n) &&
        Nat.is_gt(generation, 0n) && Nat.is_le(generation, 1000000000n) &&
        Nat.is_gt(lifetime, 0n) && Nat.is_le(lifetime, maximum()) &&
        Nat.is_eq(List.length(&2, Numeric.Words, weights), 6n) && weights_valid(weights) && weights_enabled(weights)

def created(supported: Bool, +advicees: List<&2, T.Advicee>, limits: Ledger.Limits,
    +environment: T.Environment, +seed: Nat, collectors: Maybe<&2,CollectorScenario.Profile>) -> T.State:
  match supported:
    case True{}:
      startup(advicees,configure(advicees,T.State{[Engine.collector_configure(initial_core(environment,limits,seed),collectors)],[],0n,0n,seed,environment,[],True{},[],[]}))
    case False{}:
      T.State{[Engine.initial(limits)], [], 0n, 0n, 0n, environment, [], False{}, [],[]}

def create(config: T.Config, +seed: Nat) -> T.State:
  match config:
    case T.Config{limits, advicees, +environment, +collectors}:
      created(Nat.is_le(seed, maximum()) && initial_environment_supported(environment) && CollectorScenario.profile_valid(collectors), advicees, limits, environment, seed, collectors)

def latest_frame(frames: List<&2, T.Frame>) -> Maybe<&2, T.Frame>:
  match frames:
    case head <> _: Some{head}
    case Nil{}: None{}

def runtime_snapshot(state: T.State) -> T.RuntimeSnapshot:
  match state:
    case T.State{core,items,next,count,seed,environment,_,valid,_,jobs}:
      T.RuntimeSnapshot{core,items,next,count,seed,environment,valid,jobs}

def observed(+state: T.State) -> T.Observation:
  match state:
    case T.State{+core, +items, _, count, _, _, latest, valid, _,jobs}:
      T.Observation{Engine.clock(core_value(core)), count, Engine.canonical(core_value(core)), latest_frame(latest), List.length(&2, T.Item, items), valid,runtime_snapshot(state)}

def observe(state: T.State) -> T.Observation:
  observed(state)

def located_item(equal: Bool, item: T.Item, rest: List<&2, T.Item>, found: T.Located) -> T.Located:
  match equal item found:
    case True{} T.Item{_, input} _: T.Located{Some{input}, rest}
    case False{} item T.Located{input, remaining}: T.Located{input, item <> remaining}

def locate(items: List<&2, T.Item>, +order: Nat) -> T.Located:
  match items:
    case Nil{}: T.Located{None{}, []}
    case +head <> +tail:
      match head:
        case T.Item{+key, input}:
          located_item(Nat.is_eq(key, order), T.Item{key, input}, tail, locate(tail, order))

def replaced_items(state: T.State, items: List<&2, T.Item>) -> T.State:
  match state:
    case T.State{core, _, next, count, seed, environment, latest, valid, prepared,jobs}:
      T.State{core, items, next, count, seed, environment, latest, valid, prepared,jobs}

def callback_registered(state: T.State, issued: Engine.CallbackIssued) -> T.State:
  match issued:
    case Engine.CallbackIssued{updated,_}: replace_core(state,updated)

def callback_owned(+state: T.State, owner: Maybe<&2,Callbacks.Owner>, order: Nat, time: Nat,
    action: Driver.Action, capture: Maybe<&2,OutputScenario.Capture>) -> T.State:
  match owner capture:
    case Some{owner} Some{capture}: callback_registered(state,Engine.callback_issue_output(core(state),owner,order,time,action,capture))
    case Some{owner} None{}: callback_registered(state,Engine.callback_issue(core(state),owner,order,time,action))
    case None{} _: state

def callback_register(+state: T.State, +order: Nat, +time: Nat, +action: Driver.Action,
    capture: Maybe<&2,OutputScenario.Capture>) -> T.State:
  match action:
    case Driver.Action{+event,delay,candidate,job,expiry}:
      callback_owned(state,Engine.callback_owner(core(state),event),order,time,
        Driver.Action{event,delay,candidate,job,expiry},capture)

def original_source(job: Maybe<&2,T.Job>) -> Maybe<&2,Driver.SourceJob>:
  match job:
    case Some{T.Job{_,_,_,_,_,_,_,_,source}}: source
    case None{}: None{}


def job_partition(job: Maybe<&2,T.Job>) -> Nat:
  match job:
    case Some{T.Job{p,_,_,_,_,_,_,_,_}}: p
    case None{}: 0n


def active_job(action: Driver.Action, job: Maybe<&2,T.Job>) -> Maybe<&2,T.Job>:
  match action:
    case Driver.Action{_,_,_,True{},_}: job
    case _: None{}

def stored_jobs(state: T.State) -> List<&2,T.StoredJob>:
  match state:
    case T.State{_,_,_,_,_,_,_,_,_,jobs}: jobs

def replace_jobs(state: T.State, jobs: List<&2,T.StoredJob>) -> T.State:
  match state:
    case T.State{core,items,next,count,seed,environment,latest,valid,prepared,_}:
      T.State{core,items,next,count,seed,environment,latest,valid,prepared,jobs}

def removed_job(equal: Bool, job: T.StoredJob, next: List<&2,T.StoredJob>) -> List<&2,T.StoredJob>:
  match equal:
    case True{}: next
    case False{}: job <> next

def remove_job(jobs: List<&2,T.StoredJob>, +operation: Nat) -> List<&2,T.StoredJob>:
  match jobs:
    case Nil{}: []
    case T.StoredJob{+owner,job} <> tail:
      removed_job(Nat.is_eq(owner,operation),T.StoredJob{owner,job},remove_job(tail,operation))

def stored_found(equal: Bool, job: T.Job, next: Maybe<&2,T.Job>) -> Maybe<&2,T.Job>:
  match equal:
    case True{}: Some{job}
    case False{}: next

def find_stored(jobs: List<&2,T.StoredJob>, +operation: Nat) -> Maybe<&2,T.Job>:
  match jobs:
    case Nil{}: None{}
    case T.StoredJob{owner,job} <> tail:
      stored_found(Nat.is_eq(owner,operation),job,find_stored(tail,operation))

def command_operation(command: Canonical.Command) -> Maybe<&2,Nat>:
  match command:
    case Canonical.Prepare{operation,_}: Some{operation}
    case Canonical.UnitAdmitted{operation,_,_,_,_}: Some{operation}
    case Canonical.JevRequestIssued{_,_,_,operation,_}: Some{operation}
    case Canonical.DispatchStarted{operation,_}: Some{operation}
    case Canonical.DispatchDiscarded{operation,_}: Some{operation}
    case Canonical.CancelWork{operation}: Some{operation}
    case _: None{}

def lookup_operation(jobs: List<&2,T.StoredJob>, operation: Maybe<&2,Nat>) -> Maybe<&2,T.Job>:
  match operation:
    case Some{operation}: find_stored(jobs,operation)
    case None{}: None{}

def lookup_command_job(state: T.State, command: Canonical.Command) -> Maybe<&2,T.Job>:
  lookup_operation(stored_jobs(state),command_operation(command))

def scoped_fallback(job: Maybe<&2,T.Job>, scope: Maybe<&2,Nat>) -> Maybe<&2,T.Job>:
  match job scope:
    case Some{+job} Some{partition}:
      Bool.pick(Maybe<&2,T.Job>,Nat.is_eq(job_partition(Some{job}),partition),Some{job},None{})
    case _ _: None{}

def source_partition(source: Driver.SourceJob) -> Nat:
  match source:
    case Driver.SourceJob{partition,_,_,_,_}: partition

def scoped_source(source: Maybe<&2,Driver.SourceJob>, scope: Maybe<&2,Nat>) -> Maybe<&2,Driver.SourceJob>:
  match source scope:
    case Some{+source} Some{partition}:
      Bool.pick(Maybe<&2,Driver.SourceJob>,Nat.is_eq(source_partition(source),partition),Some{source},None{})
    case _ _: None{}

def remember_job(+state: T.State, +operation: Nat, job: Maybe<&2,T.Job>) -> T.State:
  match job:
    case Some{job}: replace_jobs(state,List.append(&2,T.StoredJob,remove_job(stored_jobs(state),operation),[T.StoredJob{operation,job}]))
    case None{}: invalid(state)

def remember_command(state: T.State, command: Canonical.Command, job: Maybe<&2,T.Job>) -> T.State:
  match command:
    case Canonical.ObservationAdmitted{operation}: remember_job(state,operation,job)
    case Canonical.Prepare{operation,_}: remember_job(state,operation,job)
    case Canonical.UnitAdmitted{operation,_,_,_,_}: remember_job(state,operation,job)
    case _: state

def drop_job(+state: T.State, operation: Nat) -> T.State:
  replace_jobs(state,remove_job(stored_jobs(state),operation))

def pending_job(work: List<&2,Canonical.Work>, +operation: Nat) -> Bool:
  match work:
    case Nil{}: False{}
    case Canonical.Work{_,_,_,owner,_,Canonical.PendingFinding{_},_} <> tail:
      Nat.is_eq(owner,operation) || pending_job(tail,operation)
    case _ <> tail: pending_job(tail,operation)

def settled_job_selected(keep: Bool, state: T.State, operation: Nat) -> T.State:
  match keep:
    case True{}: state
    case False{}: drop_job(state,operation)

def settled_job(+state: T.State, +operation: Nat) -> T.State:
  settled_job_selected(pending_job(Driver.work_list(Engine.canonical(core(state))),operation),state,operation)

def preparation_parent(found: Maybe<&2,Canonical.Work>) -> Maybe<&2,Nat>:
  match found:
    case Some{Canonical.Work{_,_,_,_,_,_,+parent}}:
      Bool.pick(Maybe<&2,Nat>,Nat.is_gt(parent,0n),Some{parent},None{})
    case None{}: None{}

def drop_parent(state: T.State, parent: Maybe<&2,Nat>) -> T.State:
  match parent:
    case Some{operation}: drop_job(state,operation)
    case None{}: state

def running_operation(entries: List<&2,Dispatch.Entry>, +operation: Nat) -> Bool:
  match entries:
    case Nil{}: False{}
    case Dispatch.Entry{_,_,_,owner,_,_,_} <> tail:
      Nat.is_eq(owner,operation) || running_operation(tail,operation)

def running_before(before: Canonical.State, operation: Nat) -> Bool:
  match before:
    case Canonical.State{_,_,_,_,_,_,Dispatch.State{_,running,_,_,_},_,_}:
      running_operation(running,operation)

def refused_job(remove: Bool, state: T.State, operation: Nat) -> T.State:
  match remove:
    case True{}: drop_job(state,operation)
    case False{}: state

def refusal_command(command: Canonical.Command, event: Canonical.CanonicalEvent,
    before: Canonical.State, state: T.State) -> T.State:
  match command event:
    case Canonical.PreparationRefused{} Canonical.BeginObservedPreparation{_,_,_,operation,_}:
      drop_job(state,operation)
    case Canonical.JevRequestUnavailable{} Canonical.JevRequestReady{_,_,_,+operation,_,_,_,_,_,_}:
      refused_job(running_before(before,operation),state,operation)
    case _ _: state

def refusal_jobs(commands: List<&2,Canonical.Command>, +event: Canonical.CanonicalEvent,
    +before: Canonical.State, state: T.State) -> T.State:
  match commands:
    case Nil{}: state
    case command <> tail: refusal_jobs(tail,event,before,refusal_command(command,event,before,state))

def event_jobs(state: T.State, event: Canonical.CanonicalEvent, before: Canonical.State) -> T.State:
  match event:
    case Canonical.PreparationCompleted{p,l,r,+operation,_}:
      drop_parent(drop_job(state,operation),preparation_parent(Canonical.find_work(p,l,r,operation,Driver.work_list(before))))
    case Canonical.JevRequestSettled{_,_,_,operation,_,_,_}: settled_job(state,operation)
    case Canonical.ReviewObserved{_,_,_,operation,_,_}: settled_job(state,operation)
    case Canonical.ReviewCompleted{_,_,_,operation,_}: settled_job(state,operation)
    case Canonical.RetireReview{_,_,_,operation}: settled_job(state,operation)
    case _: state

def queued_action(valid: Bool, +state: T.State, +time: Nat, +action: Driver.Action,
    job: Maybe<&2,T.Job>, source: Maybe<&2,T.EmissionContext>, capture: Maybe<&2,OutputScenario.Capture>) -> T.State:
  match valid:
    case True{}: callback_register(enqueue(state,time,T.Event{action,active_job(action,job),source,original_source(job)}),next_order(state),time,action,capture)
    case False{}: invalid(state)

def scheduled_action(valid: Bool, state: T.State, time: Nat, action: Driver.Action, job: Maybe<&2,T.Job>) -> T.State:
  queued_action(valid,state,time,action,job,None{},None{})

def action_delay(action: Driver.Action) -> Nat:
  match action:
    case Driver.Action{_, delay, _, _, _}: delay

def schedule_action(+state: T.State, +action: Driver.Action, job: Maybe<&2, T.Job>) -> T.State:
  +now = clock(state)
  +delay = action_delay(action)
  scheduled_action(Nat.is_le(delay, Nat.sub(maximum(), now)), state, Nat.add(now, delay), action, job)

def schedule_actions(actions: List<&2, Driver.Action>, state: T.State, +job: Maybe<&2, T.Job>) -> T.State:
  match actions:
    case Nil{}: state
    case action <> tail: schedule_actions(tail, schedule_action(state, action, job), job)

def issued_actions(state: T.State, job: Maybe<&2, T.Job>, issued: Engine.IssuedActions) -> T.State:
  match issued:
    case Engine.IssuedActions{core, actions}: schedule_actions(actions, replace_core(state, core), job)

def issue(+state: T.State, actions: List<&2, Driver.Action>, job: Maybe<&2, T.Job>) -> T.State:
  issued_actions(state, job, Engine.issue_actions(core(state), actions))

def capsule_scheduled(valid: Bool, state: T.State, time: Nat, action: Driver.Action,
    job: Maybe<&2,T.Job>, capsule: T.EmissionContext, capture: Maybe<&2,OutputScenario.Capture>) -> T.State:
  queued_action(valid,state,time,action,job,Some{capsule},capture)

def capsule_actions(actions: List<&2,Driver.Action>, +state: T.State,
    +job: Maybe<&2,T.Job>, +capsule: T.EmissionContext, +capture: Maybe<&2,OutputScenario.Capture>) -> T.State:
  match actions:
    case Nil{}: state
    case +action <> tail:
      capsule_actions(tail,capsule_scheduled(Nat.is_le(action_delay(action),Nat.sub(maximum(),clock(state))),
        state,Nat.add(clock(state),action_delay(action)),action,job,capsule,capture),job,capsule,capture)

def capsule_issued(state: T.State, job: Maybe<&2,T.Job>, capsule: T.EmissionContext, capture: Maybe<&2,OutputScenario.Capture>, issued: Engine.IssuedActions) -> T.State:
  match issued:
    case Engine.IssuedActions{updated,actions}: capsule_actions(actions,replace_core(state,updated),job,capsule,capture)

def issue_prepared(+state: T.State, actions: List<&2,Driver.Action>, job: Maybe<&2,T.Job>, capsule: T.EmissionContext) -> T.State:
  capsule_issued(state,job,capsule,None{},Engine.issue_actions(core(state),actions))

def issue_prepared_output(+state: T.State, actions: List<&2,Driver.Action>, job: Maybe<&2,T.Job>, capsule: T.EmissionContext, capture: Maybe<&2,OutputScenario.Capture>) -> T.State:
  capsule_issued(state,job,capsule,capture,Engine.issue_actions(core(state),actions))

def issue_context(state: T.State, actions: List<&2,Driver.Action>, job: Maybe<&2,T.Job>, source: Maybe<&2,T.EmissionContext>) -> T.State:
  match source:
    case Some{capsule}: issue_prepared(state,actions,job,capsule)
    case None{}: issue(state,actions,job)

def prepared_record(state: T.State, capsule: T.EmissionContext) -> T.State:
  match state:
    case T.State{core,items,next,count,seed,environment,latest,valid,prepared,jobs}:
      T.State{core,items,next,count,seed,environment,latest,valid,List.append(&2,T.EmissionContext,prepared,[capsule]),jobs}

def action_event(action: Driver.Action) -> Canonical.CanonicalEvent:
  match action:
    case Driver.Action{event,_,_,_,_}: event

def context_environment(job: T.Job, supplied: Bool, action: Driver.Action, outcome: Maybe<&2,Canonical.RequestOutcome>, environment: T.Environment, collection: Bool) -> Driver.Context:
  match job action environment:
    case T.Job{p, l, r, bytes, _, _, _, _, _} Driver.Action{_, _, candidate, _, _}
      T.Environment{delay, _, _, _, _, _, output, lease, current, credential, _, readable, lifetime}:
      Driver.Context{p, l, r, bytes, supplied, delay, outcome, current, credential, True{}, readable,
        lifetime, candidate, collection, True{}, True{}, True{}, output, lease, True{}, True{}}

def source_present(source: Maybe<&2,Driver.SourceJob>) -> Bool:
  match source:
    case Some{_}: True{}
    case None{}: False{}

def job_context(job: Maybe<&2, T.Job>, action: Driver.Action, outcome: Maybe<&2,Canonical.RequestOutcome>, environment: T.Environment, collection: Bool) -> Driver.Context:
  match job:
    case Some{+job}: context_environment(job,source_present(original_source(Some{job})),action,outcome,environment,collection)
    case None{}: context_environment(T.Job{0n, 1n, 0n, 0n, [], 0n, False{}, None{}, None{}}, False{}, action, outcome, environment,collection)

def finish_present(finish: Maybe<&2,StopScenario.Finish>) -> Bool:
  match finish:
    case Some{_}: True{}
    case None{}: False{}

def active_finish(state: T.State, p: Nat) -> Bool:
  Engine.stop_active(core(state),p)

def context(+state: T.State, action: Driver.Action, +job: Maybe<&2,T.Job>, outcome: Maybe<&2,Canonical.RequestOutcome>) -> Driver.Context:
  match state:
    case T.State{_, _, _, _, _, environment, _, _, _,jobs}:
      Driver.with_scope(job_context(job,action,outcome,environment,
        Bool.not(Engine.collector_configured(core(state))) && Bool.not(active_finish(state,job_partition(job)))),
        Driver.context_scope(action_event(action),job_partition(job)))

# Both recorded frames and their after snapshots use this same genuine count transition.
def recorded_runtime(state: T.State) -> T.State:
  match state:
    case T.State{core,items,next,count,seed,environment,latest,valid,_,jobs}:
      T.State{core,items,next,Nat.add(count,1n),seed,environment,latest,valid,[],jobs}

def recorded_latest(state: T.State, frame: T.Frame) -> T.State:
  match state:
    case T.State{core,items,next,count,seed,environment,_,valid,prepared,jobs}:
      T.State{core,items,next,count,seed,environment,[frame],valid,prepared,jobs}

def recorded(+state: T.State, +frame: T.Frame) -> T.Step:
  T.Step{recorded_latest(recorded_runtime(state),frame),Some{frame},[]}

def after_snapshot(state: T.State) -> T.RuntimeSnapshot:
  runtime_snapshot(recorded_runtime(state))

def provided_job(job: Maybe<&2,T.Job>) -> Maybe<&2,Nat>:
  match job:
    case Some{T.Job{partition,_,_,_,_,_,_,_,_}}: Some{partition}
    case None{}: None{}

def scope_commands(commands: List<&2,Canonical.Command>, +before: EngineTypes.State,
    +after: EngineTypes.State, +provided: Maybe<&2,Nat>) -> List<&2,Maybe<&2,Nat>>:
  match commands:
    case Nil{}: []
    case command <> tail: Engine.scope_command(before,after,command,provided) <> scope_commands(tail,before,after,provided)

def snapshot_core(before: T.RuntimeSnapshot) -> EngineTypes.State:
  match before:
    case T.RuntimeSnapshot{states,_,_,_,_,_,_,_}: core_value(states)

def scope_snapshot_commands(before: T.RuntimeSnapshot, after: List<&2,EngineTypes.State>, commands: List<&2,Canonical.Command>, provided: Maybe<&2,Nat>) -> List<&2,Maybe<&2,Nat>>:
  match before:
    case T.RuntimeSnapshot{states,_,_,_,_,_,_,_}: scope_commands(commands,core_value(states),core_value(after),provided)

def scope_details(details: T.FrameDetails, commands: List<&2,Canonical.Command>, +provided: Maybe<&2,Nat>) -> T.FrameDetails:
  match details:
    case T.FrameDetails{+before,after,prepared,source,+transition_after,receipt,physical,_,_}:
      T.FrameDetails{before,after,prepared,source,transition_after,receipt,physical,provided,
        scope_snapshot_commands(before,transition_after,commands,provided)}

def frame_details(before: T.RuntimeSnapshot, +state: T.State, source: Maybe<&2,T.EmissionContext>, transition_after: List<&2,EngineTypes.State>) -> T.FrameDetails:
  match state:
    case T.State{_,_,_,_,_,_,_,_,prepared,jobs}: T.FrameDetails{before,after_snapshot(state),prepared,source,transition_after,None{},[],None{},[]}

def product_frame(+state: T.State, event: Canonical.CanonicalEvent, before: Canonical.State,
    after: Canonical.State, +commands: List<&2,Canonical.Command>, reason: Maybe<&2,Canonical.Reason>,
    runtime_before: T.RuntimeSnapshot, source: Maybe<&2,T.EmissionContext>, transition_after: List<&2,EngineTypes.State>, provided: Maybe<&2,Nat>) -> T.Step:
  match state:
    case T.State{+core,_,_,+count,_,_,_,_,_,jobs}:
      recorded(state,T.ProductFrame{count,Engine.clock(core_value(core)),event,[before],[after],commands,reason,
        scope_details(frame_details(runtime_before,state,source,transition_after),commands,provided)})

def graph_partition(key: EngineTypes.GraphKey) -> Nat:
  match key:
    case EngineTypes.GraphKey{partition,_,_,_,_}: partition

def graph_frame(+state: T.State, +key: EngineTypes.GraphKey, position: Nat, fact: ImportGraph.GraphEvent,
    before: ImportGraph.Bounded, after: ImportGraph.Bounded, command: ImportGraph.Command,
    runtime_before: T.RuntimeSnapshot) -> T.Step:
  match state:
    case T.State{+core,_,_,+count,_,_,_,_,_,jobs}:
      recorded(state,T.GraphFrame{count,Engine.clock(core_value(core)),key,position,fact,[before],[after],command,
        scope_details(frame_details(runtime_before,state,None{},[core_value(core)]),[],Some{graph_partition(key)})})

def graph_transition(state: T.State, key: EngineTypes.GraphKey, position: Nat,
    fact: ImportGraph.GraphEvent, result: EngineTypes.GraphTransition) -> T.Step:
  match result:
    case EngineTypes.GraphTransition{core, before, ImportGraph.BoundedStep{after, command}}:
      graph_frame(replace_core(state, core), key, position, fact, before, after, command,runtime_snapshot(state))
    case EngineTypes.GraphRejected{core}: T.Step{invalid(replace_core(state, core)), None{},[]}

def graph_active(active: Bool, +state: T.State, +key: EngineTypes.GraphKey, +position: Nat,
    +fact: ImportGraph.GraphEvent, limits: ImportGraph.Limits) -> T.Step:
  match active:
    case True{}: graph_transition(state, key, position, fact, Engine.graph_step(core(state), key, position, limits, fact))
    case False{}: T.Step{state, None{},[]}

def graph(+state: T.State, key: EngineTypes.GraphKey, position: Nat,
    fact: ImportGraph.GraphEvent, limits: ImportGraph.Limits) -> T.Step:
  match key:
    case EngineTypes.GraphKey{+p, +l, +r, +operation, unit}:
      graph_active(Engine.preparation_active(core(state), p, l, r, operation), state,
        EngineTypes.GraphKey{p, l, r, operation, unit}, position, fact, limits)

def graph_inputs(facts: List<&2, ImportGraph.GraphEvent>, +key: EngineTypes.GraphKey,
    +position: Nat, +limits: ImportGraph.Limits) -> List<&2, T.Input>:
  match facts:
    case Nil{}: []
    case fact <> tail:
      T.GraphFact{key, position, fact, limits} <> graph_inputs(tail, key, Nat.add(position, 1n), limits)

def generated_inputs(result: PreparationScenario.Generated, key: EngineTypes.GraphKey, limits: ImportGraph.Limits) -> List<&2, T.Input>:
  match result:
    case PreparationScenario.Generated{_, facts, _, _, _, _}: graph_inputs(facts, key, 0n, limits)

def unit_inputs(units: List<&2, Nat>, +seed: Nat, +p: Nat, +l: Nat, +r: Nat, +operation: Nat,
    +position: Nat, +profile: TreeFacts.Profile, +limits: ImportGraph.Limits) -> List<&2, T.Input>:
  match units:
    case Nil{}: []
    case _ <> tail:
      List.append(&2, T.Input,
        generated_inputs(Engine.generate_tree(seed, operation, position, profile, limits), EngineTypes.GraphKey{p, l, r, operation, position}, limits),
        unit_inputs(tail, seed, p, l, r, operation, Nat.add(position, 1n), profile, limits))

def timed_inputs(inputs: List<&2, T.Input>, state: T.State, +start: Nat, +delay: Nat, +position: Nat, +count: Nat) -> T.State:
  match inputs:
    case Nil{}: state
    case input <> tail:
      timed_inputs(tail, enqueue(state, Nat.add(start, Engine.preparation_fact_time(delay, position, count)), input),
        start, delay, Nat.add(position, 1n), count)

def preparation_inputs(+state: T.State, +job: T.Job, operation: Nat) -> List<&2, T.Input>:
  match state job:
    case T.State{_, _, _, _, seed, T.Environment{_, _, _, _, profile, limits, _, _, _, _, _, _, _}, _, _, _,jobs}
      T.Job{p, l, r, _, units, _, _, _, _}:
      unit_inputs(units, seed, p, l, r, operation, 0n, profile, limits)

def preparation_delay(state: T.State) -> Nat:
  match state:
    case T.State{_, _, _, _, _, T.Environment{_, _, _, delay, _, _, _, _, _, _, _, _, _}, _, _, _,jobs}: delay

def preparation_completed(state: T.State, job: T.Job, operation: Nat, delay: Nat) -> T.State:
  match job:
    case T.Job{+p, +l, +r, bytes, +units, revision, repair, duration, source_job}:
      issue(state, [Engine.preparation_completed(p, l, r, operation, units, delay)],
        Some{T.Job{p, l, r, bytes, units, revision, repair, duration, source_job}})

def preparation_bounded(valid: Bool, +state: T.State, +job: T.Job, +operation: Nat, +delay: Nat) -> T.State:
  match valid:
    case False{}: invalid(state)
    case True{}:
      +facts = preparation_inputs(state, job, operation)
      preparation_completed(timed_inputs(facts, state, clock(state), delay, 0n, List.length(&2, T.Input, facts)), job, operation, delay)

def prepare(+state: T.State, job: T.Job, operation: Nat) -> T.State:
  +delay = preparation_delay(state)
  preparation_bounded(Nat.is_le(delay, Nat.sub(maximum(), clock(state))), state, job, operation, delay)

def handled_prepared(state: T.State, job: Maybe<&2, T.Job>, result: Driver.Handled, capsule: T.EmissionContext) -> T.State:
  match result:
    case Driver.Handled{_, actions}: issue_prepared(state, actions, job,capsule)

def handled_actions(state: T.State, job: Maybe<&2,T.Job>, result: Driver.Handled) -> T.State:
  match result:
    case Driver.Handled{_,actions}: issue(state,actions,job)

def outcome_environment(state: T.State) -> Driver.OutcomeEnvironment:
  match state:
    case T.State{_,_,_,_,_,T.Environment{_,outcome,weights,_,_,_,_,_,_,_,_,_,_},_,_, _,jobs}:
      Driver.OutcomeEnvironment{outcome,weights}

def collector_handled(+state: T.State, +action: Driver.Action, +job: Maybe<&2,T.Job>,
    command: Canonical.Command, +prepared: Driver.Context, +receipt: Maybe<&2,Driver.OutcomeReceipt>, changed: Engine.CollectorHandled) -> T.State:
  match changed:
    case Engine.CollectorHandled{updated,Driver.Handled{True{},actions}}:
      issue_prepared(replace_core(state,updated),actions,job,T.EmissionContext{prepared,receipt})
    case Engine.CollectorHandled{updated,_}:
      +replaced = replace_core(state,updated)
      handled_prepared(replaced,job,Engine.handle(core(replaced),action_event(action),command,prepared),T.EmissionContext{prepared,receipt})

def handle_prepared(+state: T.State, +action: Driver.Action, +job: Maybe<&2,T.Job>,
    +command: Canonical.Command, +prepared: Driver.Context, +receipt: Maybe<&2,Driver.OutcomeReceipt>) -> T.State:
  collector_handled(state,action,job,command,prepared,receipt,
    Engine.collector_command(core(state),action_event(action),command,prepared))

def prepare_job(state: T.State, job: Maybe<&2, T.Job>, operation: Nat) -> T.State:
  match job:
    case Some{job}: prepare(state, job, operation)
    case None{}: invalid(state)

def finish_job(finish: StopScenario.Finish) -> T.Job:
  match finish:
    case StopScenario.Finish{p, l, r, _, _, _, _, _, _, _, started, fit_pending, output}: T.Job{p, l, r, 0n, [], 0n, False{}, None{}, None{}}

def finish_attempt(finish: StopScenario.Finish) -> Nat:
  match finish:
    case StopScenario.Finish{_, _, _, attempt, _, _, _, _, _, _, started, fit_pending, output}: attempt

def finish_scopes(state: T.State) -> List<&2, StopScenario.Finish>:
  Engine.stop_entries(core(state))

def finish_input(valid: Bool, +state: T.State, +time: Nat, +action: Driver.Action, +finish: StopScenario.Finish, source: Maybe<&2,T.EmissionContext>) -> T.State:
  match valid:
    case True{}: callback_register(enqueue(state,time,T.FinishInput{action,finish_job(finish),finish_attempt(finish),source}),next_order(state),time,action,None{})
    case False{}: invalid(state)

def finish_action(+state: T.State, +action: Driver.Action, finish: StopScenario.Finish, source: Maybe<&2,T.EmissionContext>) -> T.State:
  +now = clock(state)
  +delay = action_delay(action)
  finish_input(Nat.is_le(delay, Nat.sub(maximum(), now)), state, Nat.add(now, delay), action, finish,source)

def finish_actions_context(actions: List<&2, Driver.Action>, state: T.State, +finish: StopScenario.Finish, +source: Maybe<&2,T.EmissionContext>) -> T.State:
  match actions:
    case Nil{}: state
    case action <> tail: finish_actions_context(tail, finish_action(state, action, finish,source), finish,source)

def finish_actions(actions: List<&2,Driver.Action>, state: T.State, finish: StopScenario.Finish) -> T.State:
  finish_actions_context(actions,state,finish,None{})

def finish_found(state: T.State, job: Maybe<&2,T.Job>) -> Maybe<&2,StopScenario.Finish>:
  match job:
    case Some{T.Job{p,_,_,_,_,_,_,_,_}}: Engine.stop_find(core(state),p)
    case None{}: None{}

def input_finish(input: T.Input) -> Maybe<&2, Nat>:
  match input:
    case T.FinishInput{_, _, attempt, _}: Some{attempt}
    case _: None{}

def finish_equal(value: Maybe<&2, Nat>, attempt: Nat) -> Bool:
  match value:
    case Some{value}: Nat.is_eq(value, attempt)
    case None{}: False{}

def cancel_finish_items(items: List<&2, T.Item>, +state: T.State, +attempt: Nat, +kept: List<&2, T.Item>) -> T.State:
  match items:
    case Nil{}: replaced_items(state, List.reverse(&2, T.Item, kept))
    case T.Item{+order, +input} <> tail:
      +remove = finish_equal(input_finish(input), attempt)
      cancel_finish_items(tail, Bool.pick(T.State, remove, replace_core(state, Engine.cancel(core(state), order)), state), attempt,
        Bool.pick(List<&2, T.Item>, remove, kept, T.Item{order, input} <> kept))

def cancel_finish(state: T.State, attempt: Nat) -> T.State:
  match state:
    case T.State{core, +items, next, count, seed, environment, latest, valid, prepared,jobs}:
      cancel_finish_items(items, T.State{core, items, next, count, seed, environment, latest, valid, prepared,jobs}, attempt, [])

def finish_feedback(state: T.State, finish: StopScenario.Finish, continuation: Bool) -> T.State:
  match finish:
    case StopScenario.Finish{p, _, _, _, _, _, True{}, _, _, _, started, fit_pending, output}: workload(state, p, Workload.Finished{continuation})
    case _: state

def expiry_matches(input: T.Input, advice: Nat) -> Bool:
  match input:
    case T.Event{Driver.Action{_, _, _, _, Some{value}}, _, _,_}: Nat.is_eq(value, advice)
    case T.FinishInput{Driver.Action{_, _, _, _, Some{value}}, _, _, _}: Nat.is_eq(value, advice)
    case _: False{}

def cancel_expiry_items(items: List<&2, T.Item>, +state: T.State, +advice: Nat, +kept: List<&2, T.Item>) -> T.State:
  match items:
    case Nil{}: replaced_items(state, List.reverse(&2, T.Item, kept))
    case T.Item{+order, +input} <> tail:
      +remove = expiry_matches(input, advice)
      cancel_expiry_items(tail, Bool.pick(T.State, remove, replace_core(state, Engine.cancel(core(state), order)), state), advice,
        Bool.pick(List<&2, T.Item>, remove, kept, T.Item{order, input} <> kept))

def cancel_expiry(state: T.State, advice: Nat) -> T.State:
  match state:
    case T.State{core, +items, next, count, seed, environment, latest, valid, prepared,jobs}:
      cancel_expiry_items(items, T.State{core, items, next, count, seed, environment, latest, valid, prepared,remove_job(jobs,advice)}, advice, [])

def cancel_retired(state: T.State, action: Driver.Action) -> T.State:
  match action:
    case Driver.Action{Canonical.CollectionRetireAdvice{advice}, _, _, _, _}: cancel_expiry(state, advice)
    case _: state

def expired(+state: T.State, job: Maybe<&2, T.Job>, advice: Maybe<&2, Nat>) -> T.State:
  match advice:
    case Some{+advice}:
      handled_actions(drop_job(state,advice), job, Driver.retired_work(Driver.find_operation(Driver.work_list(Engine.canonical(core(state))), advice), advice))
    case None{}: state

def expired_action(state: T.State, action: Driver.Action, job: Maybe<&2, T.Job>) -> T.State:
  match action:
    case Driver.Action{_, _, _, _, advice}: expired(state, job, advice)

def retired_candidate(state: T.State, action: Driver.Action) -> T.State:
  match action:
    case Driver.Action{_,_,Some{Driver.Candidate{_,advice,_,_,_,_}},_,_}: cancel_expiry(state,advice)
    case _: state

def ordinary_fallback(+state: T.State, +action: Driver.Action, +job: Maybe<&2, T.Job>, command: Canonical.Command, prepared: Driver.Context, receipt: Maybe<&2,Driver.OutcomeReceipt>) -> T.State:
  match command:
    case Canonical.CollectionAdviceRetired{}: cancel_retired(state, action)
    case Canonical.CollectionExpired{}: expired_action(state, action, job)
    case Canonical.SubmissionUnsuppressed{}: handle_prepared(state,action,job,Canonical.SubmissionUnsuppressed{},prepared,receipt)
    case Canonical.RetireCandidate{}: retired_candidate(handle_prepared(state,action,job,Canonical.RetireCandidate{},prepared,receipt),action)
    case Canonical.Prepare{operation, _}: prepare_job(state, job, operation)
    case command: handle_prepared(state, action, job, command, prepared,receipt)

def native_stop_facts(state: T.State) -> StopScenario.CommandFacts:
  match state:
    case T.State{+core,_,_,_,_,T.Environment{_,_,_,_,_,_,delay,lease,_,_,_,_,_},_,_, _,jobs}:
      StopScenario.CommandFacts{Engine.clock(core_value(core)),OutputScenario.Certain{},delay,lease,None{},None{}}

def native_stop_issue(ended: Maybe<&2,StopScenario.Ended>, original: Maybe<&2,StopScenario.Finish>,
    state: T.State, actions: List<&2,Driver.Action>, job: Maybe<&2,T.Job>, output: Maybe<&2,OutputScenario.Capture>, +capsule: T.EmissionContext) -> T.State:
  match ended original output:
    case Some{StopScenario.Ended{+finish,continuation}} _ _:
      finish_feedback(issue_prepared(cancel_finish(state,finish_attempt(finish)),actions,Some{finish_job(finish)},capsule),finish,continuation)
    case None{} Some{finish} None{}: finish_actions_context(actions,state,finish,Some{capsule})
    case None{} Some{finish} Some{capture}: issue_prepared_output(state,actions,Some{finish_job(finish)},capsule,Some{capture})
    case None{} None{} _: issue_prepared(state,actions,job,capsule)

def native_stop_handled(state: T.State, changed: Engine.StopHandled, +action: Driver.Action, +job: Maybe<&2,T.Job>,
    command: Canonical.Command, original: Maybe<&2,StopScenario.Finish>, +prepared: Driver.Context, +receipt: Maybe<&2,Driver.OutcomeReceipt>) -> T.State:
  match changed:
    case Engine.StopHandled{updated,Driver.Handled{True{},actions},ended,_,output}:
      native_stop_issue(ended,original,ordinary_fallback(replace_core(state,updated),action,job,command,prepared,receipt),actions,job,output,T.EmissionContext{prepared,receipt})
    case Engine.StopHandled{updated,_,_,_,_}: ordinary_fallback(replace_core(state,updated),action,job,command,prepared,receipt)

def prepared_command(+state: T.State, +action: Driver.Action, +job: Maybe<&2,T.Job>,
    +command: Canonical.Command, prepared: Engine.PreparedCommandContext) -> T.State:
  match prepared:
    case Engine.PreparedCommandContext{updated,+selected,+receipt}:
      +installed = prepared_record(replace_core(state,updated),T.EmissionContext{selected,receipt})
      native_stop_handled(installed,Engine.stop_command(core(installed),action_event(action),command,
        selected,native_stop_facts(installed)),action,job,command,finish_found(installed,job),selected,receipt)

# An incoming capsule is immutable emission provenance. Current command facts
# are rebuilt from the actual job and environment before the shared selector.
def command_context(state: T.State, action: Driver.Action, job: Maybe<&2,T.Job>, _source: Maybe<&2,T.EmissionContext>) -> Driver.Context:
  context(state,action,job,None{})

def command_partition(+context: Driver.Context, scope: Maybe<&2,Nat>) -> Driver.Context:
  match context scope:
    case Driver.Context{_,lifetime,round,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_} Some{partition}:
      Driver.with_scope(context,Driver.ContextScope{partition,lifetime,round})
    case context None{}: context

def command_selected(+state: T.State, +action: Driver.Action, +job: Maybe<&2,T.Job>, +command: Canonical.Command,
    source: Maybe<&2,T.EmissionContext>, scope: Maybe<&2,Nat>, source_job: Maybe<&2,Driver.SourceJob>) -> T.State:
  prepared_command(remember_command(state,command,job),action,job,command,Engine.prepare_command_context(core(state),command,
    source_job,outcome_environment(state),command_partition(command_context(state,action,job,source),scope)))

def command_bound(state: T.State, action: Driver.Action, command: Canonical.Command,
    source: Maybe<&2,T.EmissionContext>, +scope: Maybe<&2,Nat>, fallback: Maybe<&2,T.Job>,
    source_job: Maybe<&2,Driver.SourceJob>, found: Maybe<&2,T.Job>) -> T.State:
  match found:
    case Some{+job}: command_selected(state,action,Some{job},command,source,scope,original_source(Some{job}))
    case None{}: command_selected(state,action,fallback,command,source,scope,scoped_source(source_job,scope))

def ordinary_command(+state: T.State, +action: Driver.Action, +job: Maybe<&2,T.Job>, +command: Canonical.Command,
    source: Maybe<&2,T.EmissionContext>, +scope: Maybe<&2,Nat>, source_job: Maybe<&2,Driver.SourceJob>) -> T.State:
  command_bound(state,action,command,source,scope,scoped_fallback(job,scope),source_job,lookup_command_job(state,command))

def provided_input(job: Maybe<&2,T.Job>, source_job: Maybe<&2,Driver.SourceJob>) -> Maybe<&2,Nat>:
  match job source_job:
    case Some{T.Job{partition,_,_,_,_,_,_,_,_}} _: Some{partition}
    case None{} Some{Driver.SourceJob{partition,_,_,_,_}}: Some{partition}
    case None{} None{}: None{}

def ordinary_commands(commands: List<&2, Canonical.Command>, state: T.State,
    +action: Driver.Action, +job: Maybe<&2, T.Job>, +source: Maybe<&2,T.EmissionContext>,
    +before: EngineTypes.State, +after: EngineTypes.State,+source_job: Maybe<&2,Driver.SourceJob>) -> T.State:
  match commands:
    case Nil{}: state
    case +command <> tail: ordinary_commands(tail,ordinary_command(state,action,job,command,source,
      Engine.scope_command(before,after,command,provided_input(job,source_job)),source_job),action,job,source,before,after,source_job)

def scoped_round(job: T.Job, found: Maybe<&2, Canonical.Round>) -> T.Job:
  match job found:
    case T.Job{p, l, 0n, bytes, units, revision, repair, duration, source_job} Some{Canonical.Round{_, _, round, _, _, _, _, _}}:
      T.Job{p, l, round, bytes, units, revision, repair, duration, source_job}
    case job _: job

def scoped_job(+state: T.State, job: Maybe<&2, T.Job>) -> Maybe<&2, T.Job>:
  match job:
    case None{}: None{}
    case Some{T.Job{+p, l, r, bytes, units, revision, repair, duration, source_job}}:
      Some{scoped_round(T.Job{p, l, r, bytes, units, revision, repair, duration, source_job}, Canonical.find_round(p, Driver.rounds(Engine.canonical(core(state)))))}

def scheduler_entries(state: EngineTypes.State) -> List<&2, Scheduler.Entry>:
  Engine.queued(state)

def scheduled_found(found: Bool, time: Nat, other: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case True{}: Some{time}
    case False{}: other

def scheduled_at(entries: List<&2, Scheduler.Entry>, +order: Nat) -> Maybe<&2, Nat>:
  match entries:
    case Nil{}: None{}
    case Scheduler.Entry{time, key} <> tail: scheduled_found(Nat.is_eq(key, order), time, scheduled_at(tail, order))

def time_equal(time: Maybe<&2, Nat>, now: Nat) -> Bool:
  match time:
    case Some{time}: Nat.is_eq(time, now)
    case None{}: False{}

def input_poll(input: T.Input, attempt: Nat) -> Bool:
  match input:
    case T.FinishInput{Driver.Action{Canonical.StopPolled{_, _, _, _}, _, _, _, _}, _, value, _}: Nat.is_eq(value, attempt)
    case _: False{}

def queued_poll(items: List<&2, T.Item>, +entries: List<&2, Scheduler.Entry>, +attempt: Nat, +now: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case T.Item{order, input} <> tail:
      (input_poll(input, attempt) && time_equal(scheduled_at(entries, order), now)) || queued_poll(tail, entries, attempt, now)

def has_poll(state: T.State, attempt: Nat) -> Bool:
  match state:
    case T.State{+core, items, _, _, _, _, _, _, _,jobs}: queued_poll(items, scheduler_entries(core_value(core)), attempt, Engine.clock(core_value(core)))

def wake_finish(+state: T.State, finish: StopScenario.Finish) -> T.State:
  match finish:
    case StopScenario.Finish{p, l, r, +attempt, token, deadline, recurring, selected, True{}, validating, started, fit_pending, output}:
      +finish = {StopScenario.Finish{p, l, r, attempt, token, deadline, recurring, selected, True{}, validating, started, fit_pending, output} : StopScenario.Finish}
      Bool.pick(T.State, has_poll(state, attempt), state, finish_action(state, NativeFinish.poll(finish, clock(state), 0n), finish,None{}))
    case _: state

def wake_finishes(finishes: List<&2, StopScenario.Finish>, state: T.State) -> T.State:
  match finishes:
    case Nil{}: state
    case finish <> tail: wake_finishes(tail, wake_finish(state, finish))

def wake_event(+state: T.State, event: Canonical.CanonicalEvent) -> T.State:
  match event:
    case Canonical.PreparationCompleted{_, _, _, _, _}: wake_finishes(finish_scopes(state), state)
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}: wake_finishes(finish_scopes(state), state)
    case Canonical.SubmissionTerminal{_, _, _}: wake_finishes(finish_scopes(state), state)
    case Canonical.CollectionReleaseLease{_, _}: wake_finishes(finish_scopes(state), state)
    case _: state

def submission_recorded(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case Canonical.SubmissionRecorded{} <> _: True{}
    case _ <> tail: submission_recorded(tail)

def finish_recorded(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case Canonical.FinishRecorded{Canonical.Acknowledged{}} <> _: True{}
    case _ <> tail: finish_recorded(tail)

def advice_recorded(event: Canonical.CanonicalEvent, commands: List<&2, Canonical.Command>) -> Bool:
  match event:
    case Canonical.SubmissionTerminal{_, _, _}: submission_recorded(commands)
    case Canonical.FinishTerminal{_, _, _, _, _, Canonical.Acknowledged{}}: finish_recorded(commands)
    case _: False{}

def advice_scope(state: T.State, scope: Maybe<&2, Nat>) -> T.State:
  match scope:
    case Some{p}: workload(state, p, Workload.Advice{})
    case None{}: state

def advice_job(+state: T.State, event: Canonical.CanonicalEvent, job: Maybe<&2, T.Job>) -> T.State:
  match job:
    case Some{T.Job{p, _, _, _, _, _, _, _, _}}: workload(state, p, Workload.Advice{})
    case None{}: advice_scope(state, Engine.scope_event(core(state), core(state), event, None{}))

def advice_feedback(accepted: Bool, state: T.State, event: Canonical.CanonicalEvent, job: Maybe<&2, T.Job>) -> T.State:
  match accepted:
    case True{}: advice_job(state, event, job)
    case False{}: state

def collector_completed(state: T.State, job: Maybe<&2,T.Job>, changed: Engine.CollectorHandled, source: Maybe<&2,T.EmissionContext>) -> T.State:
  match changed:
    case Engine.CollectorHandled{updated,Driver.Handled{_,actions}}:
      issue_context(replace_core(state,updated),actions,job,source)

def product_feedback(+state: T.State, +event: Canonical.CanonicalEvent, commands: List<&2,Canonical.Command>, +job: Maybe<&2,T.Job>, source: Maybe<&2,T.EmissionContext>) -> T.State:
  advice_feedback(advice_recorded(event,commands),
    wake_event(collector_completed(state,job,Engine.collector_after(core(state),event),source),event),event,job)

def advanced_product(+state: T.State, +event: Canonical.CanonicalEvent, +action: Driver.Action,
    +job: Maybe<&2, T.Job>, +before: Canonical.State, +after: Canonical.State, +commands: List<&2, Canonical.Command>, post: List<&2, Driver.Action>, +runtime_before: T.RuntimeSnapshot, +source: Maybe<&2,T.EmissionContext>, +transition_after: List<&2,EngineTypes.State>,+source_job: Maybe<&2,Driver.SourceJob>) -> T.Step:
  product_frame(event_jobs(refusal_jobs(commands,event,before,product_feedback(issue_context(ordinary_commands(commands,state,action,job,source,snapshot_core(runtime_before),core_value(transition_after),source_job),post,job,source),event,commands,job,source)),event,before), event, before, after, commands, None{},runtime_before,source,transition_after,provided_input(job,source_job))

def product_result(+state: T.State, +event: Canonical.CanonicalEvent, action: Driver.Action,
    +job: Maybe<&2, T.Job>, before: Canonical.State, result: Canonical.Step, post: List<&2, Driver.Action>, +runtime_before: T.RuntimeSnapshot, +source: Maybe<&2,T.EmissionContext>, +transition_after: List<&2,EngineTypes.State>,+source_job: Maybe<&2,Driver.SourceJob>) -> T.Step:
  match result:
    case Canonical.Advanced{after, commands}: advanced_product(state, event, action, job, before, after, commands, post,runtime_before,source,transition_after,source_job)
    case Canonical.Rejected{after, reason}: product_frame(event_jobs(wake_event(issue_context(state,post,job,source),event),event,before), event, before, after, [], Some{reason},runtime_before,source,transition_after,provided_input(job,source_job))

def transition_commands(result: Canonical.Step) -> List<&2,Canonical.Command>:
  match result:
    case Canonical.Advanced{_,commands}: commands
    case Canonical.Rejected{_,_}: []

def cache_events(events: List<&2,Canonical.CanonicalEvent>, state: T.State) -> T.State:
  match events:
    case Nil{}: state
    case event <> tail: cache_events(tail,issue(state,[Driver.immediate(event,False{})],None{}))

def cache_facts(facts: List<&2,CacheRuntime.Fact>, +state: T.State) -> T.State:
  match facts:
    case Nil{}: state
    case fact <> tail: cache_facts(tail,enqueue(state,Engine.clock(core(state)),T.CacheFact{fact}))

def cache_published_native(state: T.State, published: Engine.CachePublished, releases: List<&2,Canonical.CanonicalEvent>) -> T.State:
  match published:
    case Engine.CachePublished{updated,facts,extra}:
      cache_events(List.append(&2,Canonical.CanonicalEvent,releases,extra),cache_facts(facts,replace_core(state,updated)))

def product_transition(+state: T.State, +event: Canonical.CanonicalEvent, action: Driver.Action,
    +job: Maybe<&2, T.Job>, transition: Engine.Transition, source: Maybe<&2,T.EmissionContext>,+source_job: Maybe<&2,Driver.SourceJob>) -> T.Step:
  match transition:
    case Engine.Transition{+updated, +result}:
      +settled = cache_published_native(replace_core(state, updated),Engine.cache_begin(core(state),updated,event,transition_commands(result)),Engine.cache_removed(core(state),transition_commands(result)))
      product_result(settled, event, action,
        scoped_job(settled, job), Engine.canonical(core(state)), result, Engine.after(core(state), updated, event),runtime_snapshot(state),source,[updated],source_job)

def fenced_product(+state: T.State, +event: Canonical.CanonicalEvent, action: Driver.Action, +job: Maybe<&2, T.Job>, source: Maybe<&2,T.EmissionContext>,+source_job: Maybe<&2,Driver.SourceJob>) -> T.Step:
  match action:
    case Driver.Action{_, delay, candidate, supplied, expiry}:
      product_transition(state, event, Driver.Action{event, delay, candidate, supplied, expiry}, job, Engine.step(core(state), event),source,source_job)

def product(+state: T.State, action: Driver.Action, +job: Maybe<&2, T.Job>, +source: Maybe<&2,T.EmissionContext>,+source_job: Maybe<&2,Driver.SourceJob>) -> T.Step:
  match action:
    case Driver.Action{+event, +delay, +candidate, +supplied, +expiry}:
      +action = {Driver.Action{event, delay, candidate, supplied, expiry} : Driver.Action}
      fenced_product(state, Engine.fence(core(state), event, True{}, command_context(state,action,job,source)), action, job,source,source_job)

def retry_edit(retry: Bool, +state: T.State, job: T.Job) -> T.State:
  match retry:
    case True{}: enqueue(state, clock(state), T.Edit{job})
    case False{}: state

def edit_planned(state: T.State, +job: T.Job, attempted: Engine.EditAttempt) -> T.State:
  match attempted:
    case Engine.EditAttempt{core, Driver.EditPlan{retry, actions}}:
      retry_edit(retry, issue(replace_core(state, core), actions, Some{job}), job)

def edit(+state: T.State, +job: T.Job) -> T.State:
  match job:
    case T.Job{+p, +l, r, bytes, units, revision, repair, duration, source_job}:
      edit_planned(state, T.Job{p, l, r, bytes, units, revision, repair, duration, source_job}, Engine.edit_attempt(core(state), p, l))

def finish_registered(state: T.State, registered: Engine.StopRegistered) -> T.State:
  match registered:
    case Engine.StopRegistered{value,Some{+finish},True{}}:
      +updated = replace_core(state,value)
      finish_actions([NativeFinish.poll(finish,clock(updated),0n),NativeFinish.poll(finish,clock(updated),200n)],updated,finish)
    case Engine.StopRegistered{value,Some{_},False{}}: replace_core(state,value)
    case _: invalid(state)

def finish_stored(+state: T.State, p: Nat, l: Nat, r: Nat, recurring: Bool) -> T.State:
  finish_registered(state,Engine.stop_register(core(state),StopScenario.Input{p,l,r,clock(state),Nat.add(clock(state),200n),recurring}))

def next_finish(state: T.State) -> Nat:
  StopScenario.next_identity(Engine.stop_state(core(state)))

def finish_available(found: Maybe<&2, StopScenario.Finish>, +state: T.State, p: Nat, l: Nat, r: Nat, recurring: Bool) -> T.State:
  match found:
    case Some{_}: state
    case None{}:
      Bool.pick(T.State, Nat.is_le(200n, Nat.sub(maximum(), clock(state))) && Nat.is_lt(next_finish(state), maximum()),
        finish_stored(state, p, l, r, recurring), invalid(state))

def finish_round(+state: T.State, +p: Nat, +recurring: Bool, round: Maybe<&2, Canonical.Round>) -> T.State:
  match round:
    case None{}: Bool.pick(T.State, recurring, workload(state, p, Workload.Next{}), state)
    case Some{Canonical.Round{_, l, r, _, _, _, _, _}}:
      finish_available(StopScenario.find(finish_scopes(state), p), state, p, l, r, recurring)

def start_finish(+state: T.State, +p: Nat, recurring: Bool) -> T.State:
  finish_round(state, p, recurring, Canonical.find_round(p, Driver.rounds(Engine.canonical(core(state)))))

def recurring_next(+state: T.State, +p: Nat, recurring: Bool) -> T.State:
  Bool.pick(T.State, recurring, workload(state, p, Workload.Next{}), state)

def activity_job(+state: T.State, +partition: Nat, activity: Nat, +bytes: Nat, +units: List<&2,Nat>, revision: Nat, repair: Bool) -> T.State:
  +lifetime = Engine.activity_lifetime(core(state),partition)
  edit_planned(state,T.Job{partition,lifetime,0n,bytes,units,revision,repair,None{},
    Some{Driver.SourceJob{partition,lifetime,bytes,units,None{}}}},Engine.activity_edit(core(state),partition,activity))

def arrival_kind(kind: U32, +state: T.State, +p: Nat, activity: Nat, revision: Nat, bytes: Nat, units: List<&2, Nat>, repair: Bool, recurring: Bool) -> T.State:
  match kind:
    case 0: recurring_next(state, p, recurring)
    case 1: activity_job(recurring_next(state,p,recurring),p,activity,bytes,units,revision,repair)
    case 2: start_finish(state, p, recurring)
    case _: invalid(state)

def valid_arrival(valid: Bool, state: T.State, emission: Workload.Emission, activity: Nat) -> T.State:
  match valid emission:
    case False{} _: state
    case True{} Workload.Emission{_, p, _, kind, _, revision, bytes, units, repair, recurring}:
      arrival_kind(kind, state, p, activity, revision, bytes, units, repair, recurring)

def arrival(+state: T.State, emission: Workload.Emission, +activity: Nat) -> T.State:
  match emission:
    case Workload.Emission{time, +p, +generation, kind, task, revision, bytes, units, repair, +recurring}:
      valid_arrival(Engine.workload_valid(core(state), p, generation, recurring) && Engine.activity_valid(core(state),p,activity), state,
        Workload.Emission{time, p, generation, kind, task, revision, bytes, units, repair, recurring},activity)

def finish_live_found(found: Maybe<&2, StopScenario.Finish>, attempt: Nat) -> Bool:
  match found:
    case None{}: False{}
    case Some{finish}: Nat.is_eq(finish_attempt(finish), attempt)

def finish_live(state: T.State, job: T.Job, attempt: Nat) -> Bool:
  match job:
    case T.Job{p, _, _, _, _, _, _, _, _}:
      finish_live_found(StopScenario.find(finish_scopes(state), p), attempt)

def finish_product(live: Bool, state: T.State, action: Driver.Action, job: T.Job, source: Maybe<&2,T.EmissionContext>) -> T.Step:
  match live:
    case True{}: product(state,action,Some{job},source,original_source(Some{job}))
    case False{}: T.Step{state, None{},[]}

def cache_product_applied(+state: T.State, +before: EngineTypes.State, applied: Engine.CacheApplied) -> T.Step:
  match applied:
    case Engine.CacheApplied{+updated,+event,+result,facts,releases,True{}}:
      product_result(cache_events(List.append(&2,Canonical.CanonicalEvent,releases,Engine.cache_removed(before,transition_commands(result))),cache_facts(facts,replace_core(state,updated))),event,Driver.immediate(event,False{}),None{},Engine.canonical(before),result,Engine.after(before,updated,event),runtime_snapshot(state),None{},[updated],None{})
    case _: T.Step{invalid(state),None{},[]}

def cache_product(+state: T.State, fact: CacheRuntime.Fact) -> T.Step:
  cache_product_applied(state,core(state),Engine.cache_apply(core(state),fact))
def input(+state: T.State, input: T.Input) -> T.Step:
  match input:
    case T.Arrival{emission,activity}: T.Step{arrival(state, emission,activity), None{},[]}
    case T.Edit{job}: T.Step{edit(state, job), None{},[]}
    case T.Event{action,job,source,source_job}: product(state,action,job,source,source_job)
    case T.CacheFact{fact}: cache_product(state,fact)
    case T.FinishInput{action, +job, attempt, source}: finish_product(finish_live(state, job, attempt), state, action, job,source)
    case T.GraphFact{key, position, fact, limits}: graph(state, key, position, fact, limits)

def callback_receipt(originals: List<&2,Callbacks.Original>, +order: Nat) -> Maybe<&2,Callbacks.Fact>:
  match originals:
    case Nil{}: None{}
    case Callbacks.Original{+fact,_,scheduled} <> tail:
      Bool.pick(Maybe<&2,Callbacks.Fact>,Nat.is_eq(scheduled,order),Some{fact},callback_receipt(tail,order))

def physical_action(receipt: Maybe<&2,Callbacks.Fact>, now: Nat) -> Maybe<&2,Driver.Action>:
  match receipt:
    case Some{fact}: Engine.output_deliver(fact,now)
    case None{}: None{}

def delivered_input(action: Maybe<&2,Driver.Action>, input: T.Input) -> T.Input:
  match action input:
    case Some{action} T.Event{_,job,source,source_job}: T.Event{action,job,source,source_job}
    case Some{action} T.FinishInput{_,job,attempt,source}: T.FinishInput{action,job,attempt,source}
    case _ input: input

def delivered_state(+state: T.State, input: T.Input, order: Nat) -> T.State:
  match input:
    case T.Event{_,_,_,_}: replace_core(state,Engine.callback_delivered(core(state),order))
    case T.FinishInput{_,_,_,_}: replace_core(state,Engine.callback_delivered(core(state),order))
    case _: state

def physical_delivery(receipt: Maybe<&2,Callbacks.Fact>, before: T.RuntimeSnapshot,
    after: T.RuntimeSnapshot, action: Maybe<&2,Driver.Action>) -> List<&2,T.PhysicalDelivery>:
  match receipt:
    case Some{_}: [T.PhysicalDelivery{before,after,action}]
    case None{}: []

def physical_details(details: T.FrameDetails, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,T.PhysicalDelivery>) -> T.FrameDetails:
  match details:
    case T.FrameDetails{before,after,prepared,source,transition_after,_,_,provided,scopes}:
      T.FrameDetails{before,after,prepared,source,transition_after,receipt,physical,provided,scopes}

def physical_frame(frame: T.Frame, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,T.PhysicalDelivery>) -> T.Frame:
  match frame:
    case T.ProductFrame{sequence,time,event,before,after,commands,reason,details}:
      T.ProductFrame{sequence,time,event,before,after,commands,reason,physical_details(details,receipt,physical)}
    case T.GraphFrame{sequence,time,key,position,fact,before,after,command,details}:
      T.GraphFrame{sequence,time,key,position,fact,before,after,command,physical_details(details,receipt,physical)}

def physical_record_with(state: T.State, +frame: T.Frame, physical: List<&2,T.PhysicalDelivery>) -> T.Step:
  T.Step{recorded_latest(state,frame),Some{frame},physical}

def physical_step(step: T.Step, receipt: Maybe<&2,Callbacks.Fact>, +physical: List<&2,T.PhysicalDelivery>) -> T.Step:
  match step:
    case T.Step{state,Some{frame},prior}: physical_record_with(state,physical_frame(frame,receipt,physical),List.append(&2,T.PhysicalDelivery,prior,physical))
    case T.Step{state,None{},prior}: T.Step{state,None{},List.append(&2,T.PhysicalDelivery,prior,physical)}

def delivered_run(+before: T.State, +after: T.State, +receipt: Maybe<&2,Callbacks.Fact>,
    +action: Maybe<&2,Driver.Action>, value: T.Input) -> T.Step:
  physical_step(input(after,delivered_input(action,value)),receipt,
    physical_delivery(receipt,runtime_snapshot(before),runtime_snapshot(after),action))

def original_delivery(+state: T.State, +value: T.Input, +order: Nat, +receipt: Maybe<&2,Callbacks.Fact>) -> T.Step:
  delivered_run(state,delivered_state(state,value,order),receipt,physical_action(receipt,clock(state)),value)

def located_run(+state: T.State, located: T.Located, +order: Nat) -> T.Step:
  match located:
    case T.Located{Some{value},remaining}:
      original_delivery(replaced_items(state,remaining),value,order,callback_receipt(Engine.callback_originals(core(state)),order))
    case T.Located{None{},_}: T.Step{invalid(state),None{},[]}

def take_payload(state: T.State, order: Nat) -> T.Step:
  match state:
    case T.State{core, +items, next, count, seed, environment, latest, valid, prepared,jobs}:
      located_run(T.State{core, items, next, count, seed, environment, latest, valid, prepared,jobs}, locate(items, order),order)

def queue_head(entries: List<&2, Scheduler.Entry>) -> Maybe<&2, Scheduler.Entry>:
  match entries:
    case head <> _: Some{head}
    case Nil{}: None{}

def peek_core(state: EngineTypes.State) -> Maybe<&2, Scheduler.Entry>:
  queue_head(Engine.queued(state))

def peek(state: T.State) -> Maybe<&2, Scheduler.Entry>:
  peek_core(core(state))

def within(entry: Maybe<&2, Scheduler.Entry>, endpoint: Nat) -> Bool:
  match entry:
    case Some{Scheduler.Entry{time, _}}: Nat.is_le(time, endpoint)
    case None{}: False{}

def state_valid(state: T.State) -> Bool:
  match state:
    case T.State{_, _, _, _, _, _, _, valid, prepared,jobs}: valid

# Candidate private transport only: keep the entire native state opaque to
# recursive forwarding. Public T.State and all facts/controls remain unchanged.
# Only this allocator creates a carrier, always with its actual single state.
# Recursive result lists also keep private outputs boxed; unlike Maybe<Step>,
# they cannot flatten the embedded whole state back into every continuation.
type Carrier is Data:
  Carrier{states: List<&2, T.State>}

def carrier(state: T.State) -> Carrier:
  Carrier{[state]}

def finished_step(states: List<&2, T.State>) -> List<&2, T.Step>:
  match states:
    case state <> _: [T.Step{state,None{},[]}]
    case Nil{}: []

def continued_physical(steps: List<&2,T.Step>, physical: List<&2,T.PhysicalDelivery>) -> List<&2,T.Step>:
  match steps:
    case T.Step{state,frame,later} <> tail:
      T.Step{state,frame,List.append(&2,T.PhysicalDelivery,physical,later)} <> tail
    case Nil{}: []

def continued_step(step: T.Step, rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match step:
    case T.Step{state,None{},physical}: continued_physical(rest(carrier(state)),physical)
    case step: [step]

def taken_carrier(taken: Engine.Taken, states: List<&2, T.State>,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match taken states:
    case Engine.Taken{core,None{}} state <> _: [T.Step{replace_core(state,core),None{},[]}]
    case Engine.Taken{core,Some{Scheduler.Entry{_,order}}} state <> _:
      continued_step(take_payload(replace_core(state,core),order),rest)
    case _ Nil{}: []

def take_carrier(states: List<&2, T.State>, rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match states:
    case +state <> _: taken_carrier(Engine.take(core(state)),[state],rest)
    case Nil{}: []

# Metadata uses the same core owner as the public consumer. The original
# payload and scheduler entry stay untouched until its genuine take boundary.
def sharing_followups(events: List<&2, Canonical.CanonicalEvent>, state: T.State) -> T.State:
  match events:
    case Nil{}: state
    case event <> tail:
      sharing_followups(tail, schedule_action(state, Driver.Action{event,0n,None{},False{},None{}}, None{}))

def sharing_frame(state: T.State, frame: Engine.SharingFrame, original: T.State) -> T.Step:
  match frame:
    case Engine.SharingFrame{before,after,event,Canonical.Advanced{canonical,commands}}:
      product_frame(state,event,Engine.canonical(before),canonical,commands,None{},runtime_snapshot(original),None{},[after],None{})
    case Engine.SharingFrame{before,after,event,Canonical.Rejected{canonical,reason}}:
      product_frame(state,event,Engine.canonical(before),canonical,[],Some{reason},runtime_snapshot(original),None{},[after],None{})

def sharing_selected(state: T.State, next: Engine.SharingNext,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match next:
    case Engine.SharingNext{updated,Some{frame},events}:
      [sharing_frame(sharing_followups(events,replace_core(state,updated)),frame,state)]
    case Engine.SharingNext{_,None{},_}: take_carrier([state],rest)

def sharing_action(+state: T.State, action: Driver.Action, order: Nat, endpoint: Nat,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match action:
    case Driver.Action{event,_,_,_,_}:
      sharing_selected(state,Engine.sharing_preprocess(core(state),event,order,Some{endpoint}),rest)

def sharing_input(state: T.State, located: T.Located, order: Nat, endpoint: Nat,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match located:
    case T.Located{Some{T.Event{action,_, _,_}},_}: sharing_action(state,action,order,endpoint,rest)
    case T.Located{Some{T.FinishInput{action,_,_, _}},_}: sharing_action(state,action,order,endpoint,rest)
    case _: take_carrier([state],rest)

def sharing_peek(+value: T.State, entry: Maybe<&2, Scheduler.Entry>, endpoint: Nat,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match value entry:
    case T.State{core, +items, next, count, seed, environment, latest, valid, prepared,jobs} Some{Scheduler.Entry{_,+order}}:
      sharing_input(T.State{core, items, next, count, seed, environment, latest, valid, prepared,jobs},locate(items,order),order,endpoint,rest)
    case value None{}: take_carrier([value],rest)

def sharing_carrier(states: List<&2,T.State>, endpoint: Nat,
    rest: Carrier -> List<&2,T.Step>) -> List<&2,T.Step>:
  match states:
    case +state <> _: sharing_peek(state,peek(state),endpoint,rest)
    case Nil{}: []

def take_allowed(allowed: Bool, states: List<&2, T.State>, endpoint: Nat,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match allowed:
    case True{}: sharing_carrier(states,endpoint,rest)
    case False{}: finished_step(states)

def selected_state(states: List<&2, T.State>, +endpoint: Nat,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match states:
    case +state <> _:
      take_allowed(state_valid(state) && within(peek(state),endpoint),[state],endpoint,rest)
    case Nil{}: []

def selected_carrier(value: Carrier, endpoint: Nat,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match value:
    case Carrier{states}: selected_state(states,endpoint,rest)

def stopped_carrier(value: Carrier) -> List<&2, T.Step>:
  match value:
    case Carrier{states}: finished_step(states)

def step_carrier(fuel: Nat, value: Carrier, +endpoint: Nat) -> List<&2, T.Step>:
  match fuel:
    case 0n: stopped_carrier(value)
    case 1n+rest: selected_carrier(value,endpoint,next => step_carrier(rest,next,endpoint))

# Nil cannot arise from the singleton allocator. The outer boundary keeps its
# original input atomically if that private invariant is ever violated.
def step_result(result: List<&2, T.Step>, original: T.State) -> T.Step:
  match result:
    case step <> _: step
    case Nil{}: T.Step{original,None{},[]}

def step_loop(fuel: Nat, +state: T.State, endpoint: Nat) -> T.Step:
  step_result(step_carrier(fuel,carrier(state),endpoint),state)

def step(state: T.State) -> T.Step:
  step_loop(1000n,state,maximum())

def finished_advance(states: List<&2, T.State>, frames: List<&2, T.Frame>) -> List<&2, T.Advanced>:
  match states:
    case state <> _: [T.Advanced{state,List.reverse(&2,T.Frame,frames),[]}]
    case Nil{}: []

def stopped_advance(value: Carrier, frames: List<&2, T.Frame>) -> List<&2, T.Advanced>:
  match value:
    case Carrier{states}: finished_advance(states,frames)

def advanced_physical(values: List<&2,T.Advanced>, physical: List<&2,T.PhysicalDelivery>) -> List<&2,T.Advanced>:
  match values:
    case T.Advanced{state,frames,later} <> tail:
      T.Advanced{state,frames,List.append(&2,T.PhysicalDelivery,physical,later)} <> tail
    case Nil{}: []

def advanced_carrier(result: List<&2, T.Step>, frames: List<&2, T.Frame>,
    rest: Carrier -> List<&2, T.Frame> -> List<&2, T.Advanced>) -> List<&2, T.Advanced>:
  match result:
    case T.Step{state,Some{frame},physical} <> _: advanced_physical(rest(carrier(state),frame <> frames),physical)
    case T.Step{state,None{},physical} <> _: [T.Advanced{state,List.reverse(&2,T.Frame,frames),physical}]
    case Nil{}: []

def advance_carrier(budget: Nat, value: Carrier, +endpoint: Nat,
    frames: List<&2, T.Frame>) -> List<&2, T.Advanced>:
  match budget:
    case 0n: stopped_advance(value,frames)
    case 1n+rest:
      advanced_carrier(step_carrier(1000n,value,endpoint),frames,
        next => fs => advance_carrier(rest,next,endpoint,fs))

def advance_result(result: List<&2, T.Advanced>, original: T.State) -> T.Advanced:
  match result:
    case advanced <> _: advanced
    case Nil{}: T.Advanced{original,[],[]}

def advance_loop(budget: Nat, +state: T.State, endpoint: Nat, frames: List<&2, T.Frame>) -> T.Advanced:
  advance_result(advance_carrier(budget,carrier(state),endpoint,frames),state)

def advance_input_supported(state: T.State, budget: Nat, +endpoint: Nat) -> Bool:
  Nat.is_le(budget, maximum()) && Nat.is_le(endpoint, maximum()) && Nat.is_le(clock(state), endpoint)

def advance_checked(supported: Bool, state: T.State, budget: Nat, endpoint: Nat) -> T.Advanced:
  match supported:
    case True{}: advance_loop(budget, state, endpoint, [])
    case False{}: T.Advanced{invalid(state), [],[]}

def advance(+state: T.State, +budget: Nat, +endpoint: Nat) -> T.Advanced:
  advance_checked(advance_input_supported(state, budget, endpoint), state, budget, endpoint)

# Obsolete recurring arrivals stay in the ordered queue. The actual shared
# scheduler advances its clock when they are taken; arrival validation then
# suppresses their business facts, preserving public metadata-only endpoints.
def atomic_control(valid: Bool, original: T.State, changed: T.State) -> T.Controlled:
  match valid:
    case True{}: T.Controlled{changed, True{}}
    case False{}: T.Controlled{original, False{}}

def controlled_scopes(scopes: List<&2, Advicees.Scope>, state: T.State, +control: Workload.Control) -> T.State:
  match scopes:
    case Nil{}: state
    case Advicees.Scope{_, partition, _} <> tail:
      controlled_scopes(tail, workload(state, partition, Workload.Controlled{control}), control)

def workload_control(+state: T.State, control: Workload.Control, targets: Advicees.Targeted) -> T.Controlled:
  match targets:
    case Advicees.Targeted{scopes, True{}}:
      +changed = controlled_scopes(scopes, state, control)
      atomic_control(state_valid(changed), state, changed)
    case _: T.Controlled{state, False{}}

def revalidate_environment(+state: T.State) -> T.State:
  +action = {Driver.immediate(Canonical.FinalCandidateCheck{True{}, True{}, True{}, False{}, True{}, True{}}, False{}) : Driver.Action}
  issue(state, Engine.revalidate(core(state), context(state, action, None{}, None{})), None{})

def environment_control(+state: T.State, current: Bool, +ready: Bool, +generation: Nat, readable: Bool) -> T.Controlled:
  match state:
    case T.State{core, items, next, count, seed, T.Environment{delay, outcome, weights, prep, tree, limits, output, lease, _, _, _, _, lifetime}, latest, valid, prepared,jobs}:
      +changed = revalidate_environment(T.State{[Engine.configure_credentials(core_value(core), ready, generation)], items, next, count, seed, T.Environment{delay, outcome, weights, prep, tree, limits, output, lease, current, ready, generation, readable, lifetime}, latest, valid, prepared,jobs})
      atomic_control(state_valid(changed), state, changed)

def jev_control(state: T.State, delay: Nat, weights: List<&2, Numeric.Words>) -> T.Controlled:
  match state:
    case T.State{core, items, next, count, seed, T.Environment{_, _, _, prep, tree, limits, output, lease, current, ready, generation, readable, lifetime}, latest, valid, prepared,jobs}:
      T.Controlled{T.State{core, items, next, count, seed, T.Environment{delay, None{}, weights, prep, tree, limits, output, lease, current, ready, generation, readable, lifetime}, latest, valid, prepared,jobs}, True{}}

def jev_supported(valid: Bool, state: T.State, delay: Nat, weights: List<&2, Numeric.Words>) -> T.Controlled:
  match valid:
    case True{}: jev_control(state, delay, weights)
    case False{}: T.Controlled{state, False{}}

def unit_sizes(units: List<&2, Nat>) -> Bool:
  match units:
    case Nil{}: True{}
    case +head <> tail: Nat.is_gt(head, 0n) && Nat.is_le(head, Nat.div(maximum(), 2n)) && unit_sizes(tail)

def workload_supported(control: Workload.Control) -> Bool:
  match control:
    case Workload.Pace{+interval}: Nat.is_gt(U32.to_nat(interval), 0n) && Nat.is_le(U32.to_nat(interval), 1000000000n)
    case Workload.Sizes{+bytes, +units}: Nat.is_gt(bytes, 0n) && Nat.is_le(bytes, Nat.div(maximum(), 2n)) && Nat.is_le(List.length(&2, Nat, units), 1024n) && unit_sizes(units)
    case Workload.Burst{+count}: Nat.is_gt(count, 0n) && Nat.is_le(count, 1024n)
    case Workload.Duration{duration}: Nat.is_le(duration, 1000000000n)
    case Workload.Suspend{_}: True{}

def controlled_workload(valid: Bool, +state: T.State, identity: Maybe<&2, Nat>, value: Workload.Control) -> T.Controlled:
  match valid:
    case True{}: workload_control(state, value, Engine.advicee_targets(core(state), identity))
    case False{}: T.Controlled{state, False{}}

def controlled_environment(valid: Bool, state: T.State, current: Bool, ready: Bool, generation: Nat, readable: Bool) -> T.Controlled:
  match valid:
    case True{}: environment_control(state, current, ready, generation, readable)
    case False{}: T.Controlled{state, False{}}

def drop_operations(operations: List<&2,Nat>, state: T.State) -> T.State:
  match operations:
    case Nil{}: state
    case operation <> tail: drop_operations(tail,drop_job(state,operation))

def retained_finish_item(remove: Bool, item: T.Item, rest: List<&2,T.Item>) -> List<&2,T.Item>:
  match remove:
    case True{}: rest
    case False{}: item <> rest

def lifecycle_finish_items(items: List<&2,T.Item>, +partition: Nat, +attempt: Nat) -> List<&2,T.Item>:
  match items:
    case Nil{}: []
    case T.Item{order,T.FinishInput{action,T.Job{+p,l,r,bytes,units,revision,repair,duration,source_job},+token,source}} <> tail:
      retained_finish_item(Nat.is_eq(p,partition) && Nat.is_eq(token,attempt),
        T.Item{order,T.FinishInput{action,T.Job{p,l,r,bytes,units,revision,repair,duration,source_job},token,source}},
        lifecycle_finish_items(tail,partition,attempt))
    case item <> tail: item <> lifecycle_finish_items(tail,partition,attempt)

# Public lifecycle departure removes queued Stop payloads; the original physical
# callback registry and its scheduler facts remain under their existing owner.
def lifecycle_finish_removed(state: T.State, +partition: Nat, attempt: Nat) -> T.State:
  match state:
    case T.State{+core,items,next,count,seed,environment,latest,valid,prepared,jobs}:
      T.State{[Engine.stop_close(core_value(core),partition)],lifecycle_finish_items(items,partition,attempt),next,count,seed,environment,latest,valid,prepared,jobs}


def lifecycle_finish(+state: T.State, partition: Nat, finish: Maybe<&2,StopScenario.Finish>) -> T.State:
  match finish:
    case Some{value}: lifecycle_finish_removed(state,partition,finish_attempt(value))
    case None{}: state

def lifecycle_current(+state: T.State, +partition: Nat, entry: Maybe<&2,AdviceeLifecycle.Entry>) -> T.State:
  match entry:
    case Some{AdviceeLifecycle.Entry{_,_,AdviceeLifecycle.Active{}}}: state
    case Some{_}: lifecycle_finish(state,partition,StopScenario.find(finish_scopes(state),partition))
    case None{}: state

def lifecycle_cleanup(state: T.State, cleanup: LifecycleCleanup.CleanupPlan, events: List<&2,Workload.Emission>) -> T.State:
  match cleanup:
    case LifecycleCleanup.CleanupPlan{actions,operations,_}:
      arrivals(events,issue(drop_operations(operations,state),actions,None{}))

def lifecycle_result(original: T.State, partition: Nat, transition: Engine.LifecycleTransition) -> T.Controlled:
  match transition:
    case Engine.LifecycleTransition{+core,AdviceeLifecycle.Changed{_,_,+current,valid},cleanup,events}:
      T.Controlled{lifecycle_cleanup(lifecycle_current(replace_core(original,core),partition,current),cleanup,events),valid}

def lifecycle_scope(+state: T.State, scope: Maybe<&2,Advicees.Scope>, action: AdviceeLifecycle.Action) -> T.Controlled:
  match scope:
    case Some{Advicees.Scope{_,+partition,_}}:
      lifecycle_result(state,partition,Engine.lifecycle_action(core(state),partition,action))
    case None{}: T.Controlled{state,False{}}

def lifecycle(+state: T.State, identity: Nat, action: AdviceeLifecycle.Action) -> T.Controlled:
  lifecycle_scope(state,Engine.advicee_identity(core(state),identity),action)

def control(+state: T.State, control: T.Control) -> T.Controlled:
  match control:
    case T.AdviceeLifecycleControl{identity,action}: lifecycle(state,identity,action)
    case T.WorkloadControl{identity, +value}: controlled_workload(workload_supported(value), state, identity, value)
    case T.JevProfile{+delay, +weights}:
      jev_supported(Nat.is_le(delay, 1000000000n) && Nat.is_eq(List.length(&2, Numeric.Words, weights), 6n) && weights_valid(weights) && weights_enabled(weights), state, delay, weights)
    case T.EnvironmentControl{current, ready, +generation, readable}:
      controlled_environment(Nat.is_gt(generation, 0n) && Nat.is_le(generation, 1000000000n), state, current, ready, generation, readable)

# Private stage facts preserve the exact shared original offer. They are not
# ordinary raw Reserve inputs and never borrow an unrelated pending offer.
