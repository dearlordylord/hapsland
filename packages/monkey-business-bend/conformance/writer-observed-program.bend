import Base
import ./writer-observed-context.bend as Context
import ./writer-original-inputs.bend as Inputs
import ./writer-observed-driver.bend as Writer
import ./writer-intersection-controls.bend as IntersectionInputs
import ./writer-intersection-driver.bend as Intersection
import ./writer-observed-hook.bend as Hook
import ./writer-observed-transport.bend as Originals
import ./sharing-observed-initial.bend as Initial
import ./writer-observed-initial.bend as WriterInitial
import ./sharing-observed-hook.bend as SharingHook
import ./sharing-original-captures.bend as Captures
import ./sharing-original-inputs.bend as SharedInputs
import ./sharing-observed-driver.bend as Sharing
import ./sharing-observed-provenance.bend as Provenance
import ../AdviceeLifecycleCleanup.bend as Cleanup
import ./sharing-observed-transport.bend as Transport
import ./output-scenario-driver.bend as Output
import ./advicee-lifecycle-driver.bend as Edge
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../WriterScenario.bend as WriterCore
import ../Scheduler.bend as Scheduler
import ../CollectionScenario.bend as Response
import ../Callbacks.bend as Callbacks
import ../AdviceeLifecycle.bend as Lifecycle
import ../Workload.bend as Workload
import ../../agent-flow-bend/Canonical.bend as C

# One actual Edge interpreter. Additional fields retain original input labels
# and queue payload custody; all writer decisions remain in the shared Engine.
type OriginalInputs is Data:
  OriginalInputs{edits: List<&2,Inputs.Edit>, sharing: List<&2,Initial.QueuedOriginal>}

def edits(value: OriginalInputs) -> List<&2,Inputs.Edit>:
  match value:
    case OriginalInputs{edits,_}: edits

def sharing_original(value: OriginalInputs, order: Nat) -> Maybe<&2,SharedInputs.Edit>:
  match value:
    case OriginalInputs{_,sharing}: Provenance.original(sharing,order)

def propagated(value: OriginalInputs, runtime: List<&2,Edge.Runtime>, cutoff: Nat, current: Maybe<&2,SharedInputs.Edit>) -> OriginalInputs:
  match value:
    case OriginalInputs{edits,sharing}: OriginalInputs{edits,Provenance.appended(Sharing.appended_orders(Edge.runtime_items(runtime),cutoff),current,sharing)}

type Trace is Data:
  Trace{writer: Writer.Runtime, agents: List<&2,Initial.Agent>,
    queued: OriginalInputs, labels: Captures.Labels,
    originals: List<&2,Captures.Original>, issued: Nat}
type Guarded is Data:
  Guarded{runtime: List<&2,Edge.Runtime>, deliver: Bool, valid: Bool}

def initialized(value: Initial.Initialized, queued: List<&2,Inputs.Edit>) -> Trace:
  match value:
    case Initial.Initialized{runtime,agents,sharing,valid}:
      Trace{Writer.Runtime{runtime,[],[],0n,valid},agents,OriginalInputs{queued,sharing},Captures.Labels{[],1n},[],0n}

def fault(value: Trace) -> Trace:
  match value:
    case Trace{Writer.Runtime{runtime,bindings,frames,consumed,_},agents,queued,labels,originals,issued}:
      Trace{Writer.Runtime{runtime,bindings,List.append(&2,Writer.Frame,frames,[Writer.InvalidTransport{}]),consumed,False{}},agents,queued,labels,originals,issued}

def replace_selected(equal: Bool, item: Edge.Item, event: C.CanonicalEvent) -> Edge.Item:
  match equal item:
    case True{} Edge.Item{at,order,Edge.Event{Driver.Action{_,delay,candidate,job,expiry},payload,source}}:
      Edge.Item{at,order,Edge.Event{Driver.Action{event,delay,candidate,job,expiry},payload,source}}
    case _ item: item

def replace(items: List<&2,Edge.Item>, +order: Nat, +event: C.CanonicalEvent) -> List<&2,Edge.Item>:
  match items:
    case Nil{}: []
    case Edge.Item{+at,+candidate,+input} <> tail:
      replace_selected(Nat.is_eq(candidate,order),Edge.Item{at,candidate,input},event) <> replace(tail,order,event)

def dropped(value: Engine.Taken, runtime: List<&2,Edge.Runtime>, input: Edge.Input, +order: Nat) -> Guarded:
  match value runtime:
    case Engine.Taken{state,Some{_}} Edge.Runtime{_,Edge.Queue{items,sequence,synced},jobs,delay} <> Nil{}:
      Guarded{[Edge.Runtime{Edge.delivered_state(input,state,order),Edge.Queue{Edge.remove(items,order),sequence,synced},jobs,delay}],False{},True{}}
    case _ runtime: Guarded{runtime,False{},False{}}

def guarded_event(found: Maybe<&2,C.CanonicalEvent>, +runtime: List<&2,Edge.Runtime>, input: Edge.Input,
    +order: Nat) -> Guarded:
  match found runtime:
    case Some{event} Edge.Runtime{state,Edge.Queue{items,sequence,synced},jobs,delay} <> Nil{}:
      Guarded{[Edge.Runtime{state,Edge.Queue{replace(items,order,event),sequence,synced},jobs,delay}],True{},True{}}
    case None{} Edge.Runtime{state,queue,jobs,delay} <> Nil{}:
      dropped(Engine.take(state),runtime,input,order)
    case _ runtime: Guarded{runtime,False{},False{}}

def guard_input(input: Edge.Input, states: List<&2,Types.State>, runtime: List<&2,Edge.Runtime>,
    original: Maybe<&2,Originals.Capsule>, now: Nat, order: Nat) -> Guarded:
  match input states:
    case Edge.Event{Driver.Action{+event,+d,+c,+j,+e},+payload,source} state <> Nil{}:
      guarded_event(Originals.event(original,state,event,now),runtime,
        Edge.Event{Driver.Action{event,d,c,j,e},payload,source},order)
    case _ _ <> Nil{}: Guarded{runtime,True{},True{}}
    case _ _: Guarded{runtime,False{},False{}}

def guard(+input: Edge.Input, +runtime: List<&2,Edge.Runtime>, original: Maybe<&2,Originals.Capsule>, now: Nat, order: Nat) -> Guarded:
  guard_input(input,Edge.runtime_states(runtime),runtime,original,now,order)

def installed(pair: Edge.Queue & List<&2,Originals.Binding>, state: Types.State,
    jobs: List<&2,Edge.Stored>, delay: Nat) -> Hook.Captured:
  match pair:
    case (queue,bindings): Hook.Captured{[Edge.Runtime{state,queue,jobs,delay}],bindings,True{}}

def emitted(actions: List<&2,Driver.Action>, runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>,
    capsule: Maybe<&2,Originals.Capsule>, job: Edge.Job) -> Hook.Captured:
  match runtime:
    case Edge.Runtime{+state,queue,jobs,delay} <> Nil{}:
      installed(Writer.enqueued(actions,queue,bindings,capsule,Engine.clock(state),job,state),state,jobs,delay)
    case runtime: Hook.Captured{runtime,bindings,False{}}

def state_with(state: Types.State, runtime: List<&2,Edge.Runtime>) -> List<&2,Edge.Runtime>:
  match runtime:
    case Edge.Runtime{_,queue,jobs,delay} <> Nil{}: [Edge.Runtime{state,queue,jobs,delay}]
    case _: []

def target_of_pending(pending: WriterCore.Pending) -> WriterCore.Target:
  match pending:
    case WriterCore.Pending{facts,_}: WriterCore.facts_target(facts)

def pending_capsule(capture: Maybe<&2,WriterCore.Capture>, pending: WriterCore.Pending) -> Maybe<&2,Originals.Capsule>:
  match capture:
    case Some{capture}: Some{Originals.Release{capture}}
    case None{}: Some{Originals.UnissuedRelease{pending}}

def following_capsule(original: Maybe<&2,Originals.Capsule>, state: Types.State) -> Maybe<&2,Originals.Capsule>:
  match original:
    case Some{Originals.Pending{+pending}}: pending_capsule(Engine.writer_capture(state,target_of_pending(pending)),pending)
    case Some{Originals.Response{identity}}: Some{Originals.Response{identity}}
    case _: None{}

def with_after(frame: Edge.ObservedFrame, after: List<&2,Types.State>, following: List<&2,Edge.Runtime>) -> Edge.ObservedFrame:
  match frame:
    case Edge.CanonicalFrame{before,_,time,order,event,result,runtime_before,_,provided,scopes,receipt,physical}:
      Edge.CanonicalFrame{before,after,time,order,event,result,runtime_before,following,provided,scopes,receipt,physical}
    case Edge.CacheFrame{before,_,time,order,fact,event,result,runtime_before,_,provided,scopes,receipt,physical}:
      Edge.CacheFrame{before,after,time,order,fact,event,result,runtime_before,following,provided,scopes,receipt,physical}
    case frame: frame

# The emitted action lists, release custody and report are returned together;
# native frame recording must consume that publication once, never re-run it.
type Finished is Data:
  Finished{runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>,
    report: Maybe<&2,Engine.ResponseResult>, valid: Bool}

def finished_emitted(value: Hook.Captured, report: Engine.ResponseResult) -> Finished:
  match value:
    case Hook.Captured{runtime,bindings,valid}: Finished{runtime,bindings,Some{report},valid}

def finished_publication(value: Originals.Publication, runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>,
    +original: Maybe<&2,Originals.Capsule>, job: Edge.Job) -> Finished:
  match value:
    case Originals.Publication{+state <> Nil{},report,actions}:
      finished_emitted(emitted(actions,state_with(state,runtime),bindings,following_capsule(original,state),job),report)
    case _: Finished{runtime,bindings,None{},False{}}

def released(value: Hook.Captured, report: Maybe<&2,Engine.ResponseResult>) -> Finished:
  match value:
    case Hook.Captured{runtime,bindings,valid}: Finished{runtime,bindings,report,valid}

# Retirement custody is captured from the actual before state and accepted
# after state. Each release keeps its original response and writer token.
def departures(facts: List<&2,WriterCore.PhysicalRelease>, value: Finished, +job: Edge.Job) -> Finished:
  match facts value:
    case Nil{} value: value
    case WriterCore.PhysicalRelease{capture,event} <> tail Finished{runtime,bindings,report,True{}}:
      departures(tail,released(emitted([Driver.immediate(event,False{})],runtime,bindings,
        Some{Originals.Release{capture}},job),report),job)
    case _ value: value

def departures_states(states: List<&2,Types.State>, before: Types.State, event: C.CanonicalEvent,
    value: Finished, job: Edge.Job) -> Finished:
  match states:
    case state <> Nil{}: departures(Engine.writer_departures(before,state,event),value,job)
    case _: value

def finished_departures(value: Finished, before: List<&2,Types.State>, event: C.CanonicalEvent, job: Edge.Job) -> Finished:
  match value before:
    case Finished{+runtime,bindings,report,True{}} before <> Nil{}:
      departures_states(Edge.runtime_states(runtime),before,event,Finished{runtime,bindings,report,True{}},job)
    case value _: value

def finish(+original: Maybe<&2,Originals.Capsule>, +runtime: List<&2,Edge.Runtime>,
    frame: Maybe<&2,Edge.ObservedFrame>, bindings: List<&2,Originals.Binding>, job: Maybe<&2,Edge.Job>) -> Finished:
  match runtime frame job:
    case Edge.Runtime{state,_,_,_} <> Nil{} Some{Edge.CanonicalFrame{before,_,time,_,+event,result <> Nil{},_,_,_,_,_,_}} Some{+job}:
      finished_departures(finished_publication(Originals.after(original,state,event,result,time),runtime,bindings,original,job),before,event,job)
    case runtime _ _: Finished{runtime,bindings,None{},True{}}

def grant(original: Maybe<&2,Originals.Capsule>, frame: Edge.ObservedFrame, after: List<&2,Types.State>,
    report: Maybe<&2,Engine.ResponseResult>, frames: List<&2,Writer.Frame>) -> List<&2,Writer.Frame>:
  match original frame report:
    case Some{Originals.Pending{pending}} Edge.CanonicalFrame{before,_,time,order,event,result <> Nil{},_,_,_,_,_,_} Some{report}:
      List.append(&2,Writer.Frame,frames,[Writer.GrantFrame{before,after,time,pending,event,result,report,order}])
    case _ _ _: frames

def context(job: Maybe<&2,Edge.Job>) -> Maybe<&2,Nat>:
  match job:
    case Some{job}: Some{Edge.job_partition(job)}
    case None{}: None{}

def recorded(frame: Maybe<&2,Edge.ObservedFrame>, +after: List<&2,Types.State>, following: List<&2,Edge.Runtime>,
    receipt: Maybe<&2,Callbacks.Target>, job: Maybe<&2,Edge.Job>, payload: Maybe<&2,Context.Payload>, +original: Maybe<&2,Originals.Capsule>,
    report: Maybe<&2,Engine.ResponseResult>, frames: List<&2,Writer.Frame>) -> List<&2,Writer.Frame>:
  match frame:
    case Some{+frame}:
      List.append(&2,Writer.Frame,grant(original,frame,after,report,frames),
        [Writer.Observed{with_after(frame,after,following),receipt,Sharing.frame_scopes(frame,Context.observed_owner(frame,payload,context(job)))}])
    case None{}: frames

def count(frame: Maybe<&2,Edge.ObservedFrame>, before: Nat) -> Nat:
  match frame:
    case Some{Edge.FinishFrame{_,_,_,_,_,_,_,_,_,_,_,_,_}}: before
    case Some{_}: Nat.add(before,1n)
    case None{}: before

def completed(value: Finished, +frame: Maybe<&2,Edge.ObservedFrame>, receipt: Maybe<&2,Callbacks.Target>,
    facts: Hook.Facts, job: Maybe<&2,Edge.Job>, cutoff: Nat, previous: Trace) -> Trace:
  match value facts previous:
    case Finished{+runtime,bindings,report,True{}}
        Hook.Facts{SharingHook.Facts{labels,originals,+current,_,_,_},_,+original,issued,_,payload}
        Trace{Writer.Runtime{_,_,frames,consumed,True{}},agents,queued,_,_,_}:
      Trace{Writer.Runtime{runtime,bindings,
        recorded(frame,Edge.runtime_states(runtime),runtime,receipt,job,payload,original,report,frames),count(frame,consumed),True{}},
        agents,propagated(queued,runtime,cutoff,current),labels,originals,issued}
    case _ _ previous: fault(previous)

def observed_facts(runtime: List<&2,Edge.Runtime>, +frame: Maybe<&2,Edge.ObservedFrame>,
    +facts: Hook.Facts, receipt: Maybe<&2,Callbacks.Target>, +job: Maybe<&2,Edge.Job>, cutoff: Nat, previous: Trace) -> Trace:
  match facts:
    case Hook.Facts{_,bindings,+original,_,_,_}:
      completed(finish(original,runtime,frame,bindings,job),frame,receipt,facts,job,cutoff,previous)

def observed(value: Transport.Stepped<Hook.Facts>, job: Maybe<&2,Edge.Job>, cutoff: Nat, previous: Trace) -> Trace:
  match value:
    case Transport.Stepped{Edge.Observed{runtime,frame,Edge.HookEnd{facts}},receipt}:
      observed_facts(runtime,frame,facts,receipt,job,cutoff,previous)
    case _: fault(previous)

def input_job(input: Edge.Input) -> Maybe<&2,Edge.Job>:
  match input:
    case Edge.Event{_,job,_}: Some{job}
    case Edge.Edit{job}: Some{job}
    case Edge.Cache{_,job}: Some{job}
    case _: None{}

# Original response expiry emits only the Engine's exact provisional releases.
# These cleanup actions are global Canonical facts, as in public Run's fallback
# route; no new response origin is attached to them.
def expired(value: Engine.ResponseTransition, runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>) -> Hook.Captured:
  match value:
    case Engine.ResponseTransition{state,_,actions}:
      emitted(actions,state_with(state,runtime),bindings,None{},Edge.NoJob{0n,0n})

def expiration_states(states: List<&2,Types.State>, +runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>, now: Nat) -> Hook.Captured:
  match states:
    case state <> Nil{}: expired(Engine.collection_response_expire(state,now),runtime,bindings)
    case _: Hook.Captured{runtime,bindings,False{}}

def expiration_result(result: Hook.Captured, trace: Trace) -> Trace:
  match result trace:
    case Hook.Captured{runtime,bindings,True{}} Trace{Writer.Runtime{_,_,frames,consumed,valid},agents,queued,labels,originals,issued}:
      Trace{Writer.Runtime{runtime,bindings,frames,consumed,valid},agents,queued,labels,originals,issued}
    case _ trace: fault(trace)

def expiration(+trace: Trace, now: Nat) -> Trace:
  match trace:
    case Trace{Writer.Runtime{+runtime,bindings,_,_,_},_,_,_,_,_}:
      expiration_result(expiration_states(Edge.runtime_states(runtime),runtime,bindings,now),trace)

def selected_guard(guarded: Guarded, +input: Edge.Input, +at: Nat, +order: Nat,
    +original: Maybe<&2,Originals.Capsule>, +endpoint: Nat, +environment: Edge.Environment, previous: Trace) -> Trace:
  match guarded previous:
    case Guarded{+runtime,True{},True{}} Trace{Writer.Runtime{_,+bindings,frames,consumed,True{}},agents,+queued,+labels,+originals,+issued}:
      +payload=Context.preparation(Originals.lookup_context(bindings,order),input,Edge.runtime_states(runtime))
      +facts=SharingHook.selected(input,labels,originals,sharing_original(queued,order),at)
      observed(Transport.step(Hook.Facts,runtime,endpoint,environment,
        commands => Edge.transition_hook(Hook.Facts,Hook.factory(commands,Hook.Facts{facts,Originals.consume(bindings,order),original,issued,environment,payload}))),
        input_job(input),Edge.runtime_sequence(runtime),previous)
    case Guarded{runtime,False{},True{}} Trace{Writer.Runtime{_,bindings,frames,consumed,valid},agents,queued,labels,originals,issued}:
      Trace{Writer.Runtime{runtime,Originals.consume(bindings,order),frames,consumed,valid},agents,queued,labels,originals,issued}
    case _ previous: fault(previous)

def selected(entries: List<&2,Scheduler.Entry>, +runtime: List<&2,Edge.Runtime>,
    +endpoint: Nat, environment: Edge.Environment, +trace: Trace) -> Trace:
  match entries trace:
    case Scheduler.Entry{+at,+order} <> _ Trace{Writer.Runtime{_,+bindings,_,_,True{}},_,_,_,_,_}:
      +original=Originals.lookup(bindings,order)
      +input=Edge.lookup(Edge.runtime_items(runtime),order)
      selected_guard(guard(input,runtime,original,at,order),input,at,order,original,endpoint,environment,trace)
    case _ trace: trace

def delivery_selected(entries: List<&2,Scheduler.Entry>, +runtime: List<&2,Edge.Runtime>,
    endpoint: Nat, environment: Edge.Environment, trace: Trace) -> Trace:
  match entries:
    case Scheduler.Entry{at,order} <> _:
      selected(Edge.runtime_entries(runtime),runtime,endpoint,environment,trace)
    case Nil{}: trace

def expired_selected(+trace: Trace, +endpoint: Nat, environment: Edge.Environment) -> Trace:
  match trace:
    case Trace{Writer.Runtime{runtime,_,_,_,True{}},_,_,_,_,_}:
      delivery_selected(Edge.runtime_entries(Edge.runtime_sync(runtime)),Edge.runtime_sync(runtime),endpoint,environment,trace)
    case trace: fault(trace)

def selected_time(entries: List<&2,Scheduler.Entry>, trace: Trace, endpoint: Nat, environment: Edge.Environment) -> Trace:
  match entries:
    case Scheduler.Entry{at,_} <> _: expired_selected(expiration(trace,at),endpoint,environment)
    case Nil{}: trace

def captured(value: Transport.Captured, endpoint: Nat, environment: Edge.Environment, previous: Trace) -> Trace:
  match value previous:
    case Transport.Captured{+runtime,issued} Trace{Writer.Runtime{_,bindings,frames,consumed,valid},agents,queued,labels,originals,_}:
      selected_time(Edge.runtime_entries(Edge.runtime_sync(runtime)),
        Trace{Writer.Runtime{runtime,bindings,frames,consumed,valid},agents,queued,labels,originals,issued},endpoint,environment)

def step(+trace: Trace, endpoint: Nat, environment: Edge.Environment) -> Trace:
  match trace:
    case Trace{Writer.Runtime{runtime,_,_,_,True{}},_,_,_,_,issued}:
      captured(Transport.capture(runtime,issued),endpoint,environment,trace)
    case trace: fault(trace)

def in_horizon(entries: List<&2,Scheduler.Entry>, endpoint: Nat) -> Bool:
  match entries:
    case Scheduler.Entry{at,_} <> _: Nat.is_le(at,endpoint)
    case Nil{}: False{}

def pending(trace: Trace, endpoint: Nat) -> Bool:
  match trace:
    case Trace{Writer.Runtime{runtime,_,_,_,True{}},_,_,_,_,_}:
      in_horizon(Edge.runtime_entries(Edge.runtime_sync(runtime)),endpoint)
    case _: False{}

def remaining(before: Nat, after: Nat, +budget: Nat) -> Nat:
  Bool.pick(Nat,Nat.is_lt(before,after),Nat.sub(budget,1n),budget)

def advance_step(+trace: Trace, before: Nat, budget: Nat, ih: Trace -> Nat -> Trace) -> Trace:
  match trace:
    case Trace{Writer.Runtime{_,_,_,after,_},_,_,_,_,_}: ih(trace,remaining(before,after,budget))

def advance_pending(allowed: Bool, trace: Trace, endpoint: Nat, environment: Edge.Environment,
    before: Nat, budget: Nat, ih: Trace -> Nat -> Trace) -> Trace:
  match allowed:
    case True{}: advance_step(step(trace,endpoint,environment),before,budget,ih)
    case False{}: trace

# As in the existing shared factual transport: only a complete Edge observation
# spends the public event budget. Finite transport fuel diagnoses a bad fixture;
# it is not another product scheduling or writer-concurrency policy.
def advance(fuel: Nat, budget: Nat, +trace: Trace, +endpoint: Nat, +environment: Edge.Environment) -> Trace:
  match fuel budget trace:
    case 0n _ trace: fault(trace)
    case _ 0n trace: trace
    case 1n+rest budget Trace{Writer.Runtime{_,_,_,before,_},_,_,_,_,_}:
      advance_pending(pending(trace,endpoint),trace,endpoint,environment,before,budget,
        next => available => advance(rest,available,next,endpoint,environment))

def boundary(trace: Trace, endpoint: Nat, budget: Nat, before: Nat) -> Trace:
  match trace:
    case Trace{Writer.Runtime{+runtime,bindings,frames,+consumed,valid},agents,queued,labels,originals,issued}:
      Trace{Writer.Runtime{Edge.runtime_sync(runtime),bindings,List.append(&2,Writer.Frame,frames,
        [Writer.Boundary{endpoint,budget,Nat.sub(consumed,before),Edge.runtime_states(Edge.runtime_sync(runtime))}]),consumed,valid},
        agents,queued,labels,originals,issued}

def quiet_refused(original: Maybe<&2,Originals.Capsule>, input: Edge.Input, state: Types.State, now: Nat) -> Bool:
  match original input:
    case Some{Originals.Response{target}} Edge.Event{Driver.Action{event,_,_,_,_},_,_}:
      Bool.not(Engine.collection_response_delivery_valid(state,target,now,event))
    case _ _: False{}

def quiet_removed(+order: Nat, trace: Trace) -> Trace:
  match trace:
    case Trace{Writer.Runtime{Edge.Runtime{state,Edge.Queue{items,sequence,synced},jobs,delay} <> Nil{},bindings,frames,consumed,valid},agents,queued,labels,originals,issued}:
      Trace{Writer.Runtime{[Edge.Runtime{Engine.cancel(state,order),Edge.Queue{Edge.remove(items,order),sequence,synced},jobs,delay}],
        Originals.consume(bindings,order),frames,consumed,valid},agents,queued,labels,originals,issued}
    case trace: fault(trace)

def quiet_selected(refused: Bool, trace: Trace, order: Nat, ih: Trace -> Trace) -> Trace:
  match refused:
    case True{}: ih(quiet_removed(order,trace))
    case False{}: trace

def quiet_head(entries: List<&2,Scheduler.Entry>, +runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>,
    trace: Trace, ih: Trace -> Trace) -> Trace:
  match entries runtime:
    case Scheduler.Entry{at,+order} <> _ Edge.Runtime{+state,_,_,_} <> Nil{}:
      quiet_selected(Nat.is_le(at,Engine.clock(state)) &&
        quiet_refused(Originals.lookup(bindings,order),Edge.lookup(Edge.runtime_items(runtime),order),state,Engine.clock(state)),
        trace,order,ih)
    case _ _: trace

# The finite bound is the queue length after expiry cleanup. Every recursive
# step removes the exact scheduler head and its payload; it spends no event.
def quiet(fuel: Nat, +trace: Trace) -> Trace:
  match fuel trace:
    case 0n trace: trace
    case 1n+rest Trace{Writer.Runtime{+runtime,bindings,_,_,True{}},_,_,_,_,_}:
      quiet_head(Edge.runtime_entries(Edge.runtime_sync(runtime)),runtime,bindings,trace,next => quiet(rest,next))
    case _ trace: trace

def quiet_expired(+trace: Trace) -> Trace:
  match trace:
    case Trace{Writer.Runtime{runtime,_,_,_,True{}},_,_,_,_,_}:
      quiet(List.length(&2,Edge.Item,Edge.runtime_items(runtime)),trace)
    case trace: trace

def normalized(+trace: Trace) -> Trace:
  match trace:
    case Trace{Writer.Runtime{Edge.Runtime{state,_,_,_} <> Nil{},_,_,_,True{}},_,_,_,_,_}:
      quiet_expired(expiration(trace,Engine.clock(state)))
    case trace: trace

def advanced(+trace: Trace, +endpoint: Nat, +budget: Nat, environment: Edge.Environment) -> Trace:
  match trace:
    case Trace{Writer.Runtime{_,_,_,before,_},_,_,_,_,_}:
      boundary(normalized(advance(10000n,budget,trace,endpoint,environment)),endpoint,budget,before)

def input_agent(input: Writer.Control) -> String:
  match input:
    case Writer.Claim{agent,_}: agent
    case Writer.Attempt{agent,_,_}: agent
    case Writer.Release{agent,_}: agent
    case Writer.Expire{agent,_}: agent

def input_partition(input: Writer.Control) -> Nat:
  match input:
    case Writer.Claim{_,WriterCore.ClaimFacts{WriterCore.Target{p,_,_,_},_,_,_,_}}: p
    case Writer.Attempt{_,WriterCore.Target{p,_,_,_},_}: p
    case Writer.Release{_,WriterCore.Target{p,_,_,_}}: p
    case Writer.Expire{_,WriterCore.Target{p,_,_,_}}: p

def input_lifetime(input: Writer.Control) -> Nat:
  match input:
    case Writer.Claim{_,WriterCore.ClaimFacts{WriterCore.Target{_,l,_,_},_,_,_,_}}: l
    case Writer.Attempt{_,WriterCore.Target{_,l,_,_},_}: l
    case Writer.Release{_,WriterCore.Target{_,l,_,_}}: l
    case Writer.Expire{_,WriterCore.Target{_,l,_,_}}: l

def edit_selected(equal: Bool, edit: Inputs.Edit, rest: Maybe<&2,Inputs.Edit>) -> Maybe<&2,Inputs.Edit>:
  match equal:
    case True{}: Some{edit}
    case False{}: rest

def original_edit(list: List<&2,Inputs.Edit>, +agent: String) -> Maybe<&2,Inputs.Edit>:
  match list:
    case Nil{}: None{}
    case Inputs.SharedEdit{SharedInputs.Edit{+name,+at,+bytes,+units,_,_,_,+outcome}} <> tail:
      edit_selected(String.eq(name,agent),Inputs.Edit{name,at,bytes,units,outcome},original_edit(tail,agent))
    case Inputs.Edit{+name,+at,+bytes,+units,+outcome} <> tail:
      edit_selected(String.eq(name,agent),Inputs.Edit{name,at,bytes,units,outcome},original_edit(tail,agent))

# Control job bytes/units come from the immutable original scripted edit, not
# from a latest live owner lookup. It grants no writer/response authority.
def control_edit(edit: Maybe<&2,Inputs.Edit>, +input: Writer.Control, trace: Trace) -> Trace:
  match edit trace:
    case Some{Inputs.Edit{_,_,bytes,units,+outcome}}
        Trace{writer,agents,queued,labels,originals,issued}:
      Trace{Writer.apply(input,writer,Edge.Job{input_partition(input),input_lifetime(input),bytes,units,outcome}),agents,queued,labels,originals,issued}
    case _ trace: fault(trace)

def control(+input: Writer.Control, +trace: Trace) -> Trace:
  match trace:
    case Trace{_,_,queued,_,_,_}: control_edit(original_edit(edits(queued),input_agent(input)),input,trace)

def lifecycle_cleanup(+cleanup: Cleanup.CleanupPlan, +state: Types.State, +before: Types.State, queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, delay: Nat, bindings: List<&2,Originals.Binding>, frames: List<&2,Writer.Frame>,
    consumed: Nat, valid: Bool, agents: List<&2,Initial.Agent>, queued: OriginalInputs,
    labels: Captures.Labels, originals: List<&2,Captures.Original>, issued: Nat,
    agent: String, +partition: Nat, action: Lifecycle.Action, changed: Lifecycle.Changed,
    +events: List<&2,Workload.Emission>, bytes: Nat, units: List<&2,Nat>, outcome: Maybe<&2,C.RequestOutcome>) -> Trace:
  match cleanup:
    case Cleanup.CleanupPlan{actions,_,_}:
      Trace{Writer.Runtime{[Edge.Runtime{state,Edge.emissions(events,
        Edge.actions(actions,queue,Engine.clock(before),Edge.Job{partition,Edge.life_value(Engine.lifecycle_entry(before,partition)),bytes,units,outcome}),state),jobs,delay}],
        bindings,List.append(&2,Writer.Frame,frames,[Writer.LifecycleFrame{[before],[state],Engine.clock(before),agent,partition,action,changed,cleanup,events}]),consumed,valid},
        agents,queued,labels,originals,issued}

def lifecycle_published(value: Engine.LifecycleTransition, +before: Types.State, queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, delay: Nat, bindings: List<&2,Originals.Binding>, frames: List<&2,Writer.Frame>,
    consumed: Nat, valid: Bool, agents: List<&2,Initial.Agent>, queued: OriginalInputs,
    labels: Captures.Labels, originals: List<&2,Captures.Original>, issued: Nat,
    agent: String, +partition: Nat, action: Lifecycle.Action, bytes: Nat, units: List<&2,Nat>, outcome: Maybe<&2,C.RequestOutcome>) -> Trace:
  match value:
    case Engine.LifecycleTransition{+state,+changed,+cleanup,+events}:
      lifecycle_cleanup(cleanup,state,before,queue,jobs,delay,bindings,frames,consumed,valid,
        agents,queued,labels,originals,issued,agent,partition,action,changed,events,bytes,units,outcome)

def lifecycle_edit(edit: Maybe<&2,Inputs.Edit>, agent: String, +partition: Nat, +action: Lifecycle.Action, trace: Trace) -> Trace:
  match edit trace:
    case Some{Inputs.Edit{_,_,bytes,units,+outcome}}
        Trace{Writer.Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid},agents,queued,labels,originals,issued}:
      lifecycle_published(Engine.lifecycle_action(state,partition,action),state,queue,jobs,delay,bindings,frames,
        consumed,valid,agents,queued,labels,originals,issued,agent,partition,action,bytes,units,outcome)
    case _ trace: fault(trace)

def departure_partition(valid: Bool, edit: Maybe<&2,Inputs.Edit>, agent: String,
    partition: Nat, action: Lifecycle.Action, trace: Trace) -> Trace:
  match valid:
    case True{}: lifecycle_edit(edit,agent,partition,action,trace)
    case False{}: fault(trace)

def departure_agent(found: Maybe<&2,Initial.Agent>, edit: Maybe<&2,Inputs.Edit>,
    agent: String, +partition: Nat, action: Lifecycle.Action, trace: Trace) -> Trace:
  match found:
    case Some{Initial.Agent{_,p,_}}:
      departure_partition(Nat.is_eq(p,partition),edit,agent,partition,action,trace)
    case None{}: fault(trace)

def departure(+agent: String, +partition: Nat, action: Lifecycle.Action, +trace: Trace) -> Trace:
  match trace:
    case Trace{_,agents,queued,_,_,_}:
      departure_agent(Initial.agent(agents,agent),original_edit(edits(queued),agent),agent,partition,action,trace)

def intersection_agent(input: IntersectionInputs.Control) -> Maybe<&2,String>:
  match input:
    case IntersectionInputs.OpenResponse{agent,_}: Some{agent}
    case IntersectionInputs.AttemptIssuedResponse{agent,_,_}: Some{agent}
    case IntersectionInputs.LeaveMember{agent,_}: Some{agent}
    case IntersectionInputs.OutputProfile{_,_}: None{}


def intersection_edit(edit: Maybe<&2,Inputs.Edit>, scope: Maybe<&2,Initial.Agent>, input: IntersectionInputs.Control, trace: Trace) -> Trace:
  match edit scope trace:
    case Some{Inputs.Edit{_,_,bytes,units,+outcome}} Some{Initial.Agent{_,p,l}} Trace{writer,agents,queued,labels,+originals,issued}:
      Trace{Intersection.apply(input,writer,Edge.Job{p,l,bytes,units,outcome},originals),agents,queued,labels,originals,issued}
    case _ _ trace: fault(trace)


def intersection_selected(found: Maybe<&2,String>, input: IntersectionInputs.Control, +trace: Trace) -> Trace:
  match found trace:
    case Some{+agent} Trace{_,+agents,+queued,_,_,_}:
      intersection_edit(original_edit(edits(queued),agent),Initial.agent(agents,agent),input,trace)
    case None{} Trace{writer,agents,queued,labels,+originals,issued}:
      Trace{Intersection.apply(input,writer,Edge.NoJob{0n,0n},originals),agents,queued,labels,originals,issued}

def intersection(+input: IntersectionInputs.Control, trace: Trace) -> Trace:
  intersection_selected(intersection_agent(input),input,trace)

def apply(input: Inputs.Boundary, trace: Trace, environment: Edge.Environment) -> Trace:
  match input:
    case Inputs.Advance{endpoint,budget}: advanced(trace,endpoint,budget,environment)
    case Inputs.WriterControl{input}: control(input,trace)
    case Inputs.Departure{agent,p,action}: departure(agent,p,action,trace)
    case Inputs.IntersectionControl{input}: intersection(input,trace)

def next_environment(input: Inputs.Boundary, environment: Edge.Environment) -> Edge.Environment:
  match input environment:
    case Inputs.IntersectionControl{IntersectionInputs.OutputProfile{delay,lease}} Edge.Environment{seed,tree,graph,preparation,_,_,stop_profile,outcomes}:
      Edge.Environment{seed,tree,graph,preparation,delay,lease,stop_profile,outcomes}
    case _ environment: environment


def boundaries(list: List<&2,Inputs.Boundary>, trace: Trace, +environment: Edge.Environment) -> Trace:
  match list:
    case Nil{}: trace
    case +input <> tail: boundaries(tail,apply(input,trace,environment),next_environment(input,environment))

def scenario(+input: Inputs.Scenario) -> Trace:
  match input:
    case Inputs.Scenario{+configuration,+edits,delay,bounds}:
      boundaries(bounds,initialized(WriterInitial.initialize(configuration,edits,delay),edits),Initial.environment(configuration))
