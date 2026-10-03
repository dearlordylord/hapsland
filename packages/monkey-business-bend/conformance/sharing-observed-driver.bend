import Base
import ./advicee-lifecycle-driver.bend as Edge
import ./sharing-original-inputs.bend as Inputs
import ./sharing-original-captures.bend as Originals
import ./sharing-observed-initial.bend as Initial
import ./sharing-observed-hook.bend as Hook
import ./sharing-observed-provenance.bend as Provenance
import ./sharing-observed-transport.bend as Transport
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Callbacks.bend as Callbacks
import ../FreshnessScenario.bend as Freshness
import ../../agent-flow-bend/Canonical.bend as C

# Full factual histories from the same Edge interpreter, not milestone rows.
type Frame is Data:
  Observed{frame: Edge.ObservedFrame, receipt: Maybe<&2,Callbacks.Target>,
    provided: Maybe<&2,Nat>, scopes: Maybe<&2,List<&2,Maybe<&2,Nat>>>}
  Control{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    input: Inputs.Boundary, target: Maybe<&2,Freshness.Scope>,
    events: List<&2,C.CanonicalEvent>, applied: Bool}
  Boundary{endpoint: Nat, budget: Nat, consumed: Nat, state: List<&2,Types.State>}
  InvalidTransport{}
type Trace is Data:
  Trace{runtime: List<&2,Edge.Runtime>, agents: List<&2,Initial.Agent>,
    queued: List<&2,Initial.QueuedOriginal>, labels: Originals.Labels,
    originals: List<&2,Originals.Original>, issued: Nat, consumed: Nat,
    frames: List<&2,Frame>, valid: Bool}

def initialized(value: Initial.Initialized) -> Trace:
  match value:
    case Initial.Initialized{runtime,agents,queued,valid}:
      Trace{runtime,agents,queued,Originals.Labels{[],1n},[],0n,0n,[],valid}

def fail(value: Trace) -> Trace:
  match value:
    case Trace{runtime,agents,queued,labels,originals,issued,consumed,frames,_}:
      Trace{runtime,agents,queued,labels,originals,issued,consumed,
        List.append(&2,Frame,frames,[InvalidTransport{}]),False{}}

def include_order(fresh: Bool, order: Nat, tail: List<&2,Nat>) -> List<&2,Nat>:
  match fresh:
    case True{}: order <> tail
    case False{}: tail

def appended_orders(items: List<&2,Edge.Item>, +cutoff: Nat) -> List<&2,Nat>:
  match items:
    case Nil{}: []
    case Edge.Item{_,+order,_} <> tail:
      include_order(Nat.is_le(cutoff,order),order,appended_orders(tail,cutoff))

def provided(job: Maybe<&2,Edge.Job>) -> Maybe<&2,Nat>:
  match job:
    case Some{Edge.Job{p,_,_,_,_}}: Some{p}
    case None{}: None{}

def command_scopes(list: List<&2,C.Command>, +before: Types.State, +after: Types.State,
    +context: Maybe<&2,Nat>) -> List<&2,Maybe<&2,Nat>>:
  match list:
    case Nil{}: []
    case command <> tail:
      Engine.scope_command(before,after,command,context) <> command_scopes(tail,before,after,context)

def result_scopes(before: List<&2,Types.State>, after: List<&2,Types.State>,
    result: List<&2,C.Step>, context: Maybe<&2,Nat>) -> Maybe<&2,List<&2,Maybe<&2,Nat>>>:
  match before after result:
    case before <> Nil{} after <> Nil{} C.Advanced{_,commands} <> Nil{}:
      Some{command_scopes(commands,before,after,context)}
    case _ <> Nil{} _ <> Nil{} C.Rejected{_,_} <> Nil{}: Some{[]}
    case _ _ _: None{}

def frame_scopes(frame: Edge.ObservedFrame, context: Maybe<&2,Nat>) -> Maybe<&2,List<&2,Maybe<&2,Nat>>>:
  match frame:
    case Edge.CanonicalFrame{before,after,_,_,_,result}: result_scopes(before,after,result,context)
    case Edge.CacheFrame{before,after,_,_,_,_,result}: result_scopes(before,after,result,context)
    case Edge.GraphFrame{_,_,_,_,_,_,_,_}: Some{[]}
    case Edge.UnexpectedInput{}: None{}

def record(frame: Maybe<&2,Edge.ObservedFrame>, receipt: Maybe<&2,Callbacks.Target>,
    +context: Maybe<&2,Nat>,
    frames: List<&2,Frame>) -> List<&2,Frame>:
  match frame:
    case Some{+frame}: List.append(&2,Frame,frames,[Observed{frame,receipt,context,frame_scopes(frame,context)}])
    case None{}: frames

def consumed_frame(frame: Maybe<&2,Edge.ObservedFrame>, count: Nat) -> Nat:
  match frame:
    case Some{_}: Nat.add(count,1n)
    case None{}: count

def completed_runtime(runtime: List<&2,Edge.Runtime>, +frame: Maybe<&2,Edge.ObservedFrame>,
    receipt: Maybe<&2,Callbacks.Target>, facts: Hook.Facts, cutoff: Nat, previous: Trace) -> Trace:
  match runtime facts previous:
    case Edge.Runtime{state,Edge.Queue{+items,sequence,synced},jobs,delay} <> Nil{}
        Hook.Facts{labels,originals,current,_,_,job}
        Trace{_,agents,queued,_,_,issued,consumed,frames,valid}:
      Trace{[Edge.Runtime{state,Edge.Queue{items,sequence,synced},jobs,delay}],agents,
        Provenance.appended(appended_orders(items,cutoff),current,queued),labels,originals,issued,
        consumed_frame(frame,consumed),record(frame,receipt,provided(job),frames),valid}
    case _ _ previous: fail(previous)

def completed(observed: Edge.Observed<Hook.Facts>, receipt: Maybe<&2,Callbacks.Target>,
    cutoff: Nat, previous: Trace) -> Trace:
  match observed:
    case Edge.Observed{_,Some{Edge.UnexpectedInput{}},_}: fail(previous)
    case Edge.Observed{runtime,frame,Edge.HookEnd{facts}}:
      completed_runtime(runtime,frame,receipt,facts,cutoff,previous)
    case _: fail(previous)

def stepped(value: Transport.Stepped<Hook.Facts>, cutoff: Nat, previous: Trace) -> Trace:
  match value:
    case Transport.Stepped{observed,receipt}: completed(observed,receipt,cutoff,previous)

def selected(head: List<&2,Scheduler.Entry>, +runtime: Edge.Runtime,
    environment: Edge.Environment, +endpoint: Nat, +previous: Trace) -> Trace:
  match head runtime previous:
    case Scheduler.Entry{at,+order} <> _ Edge.Runtime{state,Edge.Queue{+items,+sequence,synced},jobs,delay}
        Trace{_,agents,+queued,+labels,+originals,issued,consumed,frames,valid}:
      +facts=Hook.selected(Edge.lookup(items,order),labels,originals,Provenance.original(queued,order),at)
      stepped(Transport.step(Hook.Facts,Edge.Runtime{state,Edge.Queue{items,sequence,synced},jobs,delay},endpoint,
        environment,commands => Hook.factory(commands,facts)),sequence,previous)
    case _ _ previous: fail(previous)

def captured(value: Transport.Captured, environment: Edge.Environment, endpoint: Nat,
    previous: Trace) -> Trace:
  match value previous:
    case Transport.Captured{Edge.Runtime{+state,Edge.Queue{+items,+sequence,synced},+jobs,+delay} <> Nil{},issued}
        Trace{_,agents,queued,labels,originals,_,consumed,frames,valid}:
      +state=Edge.sync(items,state,synced)
      selected(Engine.queued(state),Edge.Runtime{state,Edge.Queue{items,sequence,sequence},jobs,delay},environment,endpoint,
        Trace{[Edge.Runtime{state,Edge.Queue{items,sequence,sequence},jobs,delay}],agents,queued,labels,originals,issued,consumed,frames,valid})
    case _ previous: fail(previous)

def step(+trace: Trace, environment: Edge.Environment, endpoint: Nat) -> Trace:
  match trace:
    case Trace{runtime <> Nil{},_,_,_,_,issued,_,_,True{}}:
      captured(Transport.capture(runtime,issued),environment,endpoint,trace)
    case _: fail(trace)

def in_horizon(head: List<&2,Scheduler.Entry>, +endpoint: Nat) -> Bool:
  match head:
    case Scheduler.Entry{at,_} <> _: Nat.is_le(at,endpoint)
    case Nil{}: False{}

def pending(trace: Trace, endpoint: Nat) -> Bool:
  match trace:
    case Trace{Edge.Runtime{state,Edge.Queue{items,_,synced},_,_} <> Nil{},_,_,_,_,_,_,_,True{}}:
      in_horizon(Engine.queued(Edge.sync(items,state,synced)),endpoint)
    case _: False{}

def remaining(before: Nat, after: Nat, +budget: Nat) -> Nat:
  Bool.pick(Nat,Nat.is_lt(before,after),Nat.sub(budget,1n),budget)

def advanced_step(+trace: Trace, before: Nat, budget: Nat,
    ih: Trace -> Nat -> Trace) -> Trace:
  match trace:
    case Trace{_,_,_,_,_,_,after,_,_}: ih(trace,remaining(before,after,budget))

def continue_pending(allowed: Bool, trace: Trace, environment: Edge.Environment,
    endpoint: Nat, budget: Nat, before: Nat, ih: Trace -> Nat -> Trace) -> Trace:
  match allowed:
    case True{}: advanced_step(step(trace,environment,endpoint),before,budget,ih)
    case False{}: trace

# Public Run.step recursively consumes metadata before returning an observation.
# Only an observed frame spends its event budget. Separate finite transport fuel
# detects an unexpectedly nonterminating source fixture and fails explicitly.
def advance(fuel: Nat, budget: Nat, +trace: Trace, +environment: Edge.Environment, +endpoint: Nat) -> Trace:
  match fuel:
    case 0n: fail(trace)
    case 1n+rest:
      match budget trace:
        case 0n trace: trace
        case budget Trace{_,_,_,_,_,_,before,_,_}:
          continue_pending(pending(trace,endpoint),trace,environment,endpoint,budget,before,
            next => remaining => advance(rest,remaining,next,environment,endpoint))

def boundary(trace: Trace, endpoint: Nat, budget: Nat, before: Nat) -> Trace:
  match trace:
    case Trace{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},agents,queued,labels,originals,issued,+consumed,frames,valid}:
      Trace{[Edge.Runtime{state,queue,jobs,delay}],agents,queued,labels,originals,issued,consumed,
        List.append(&2,Frame,frames,[Boundary{endpoint,budget,Nat.sub(consumed,before),[state]}]),valid}
    case trace: fail(trace)

def advanced(+trace: Trace, environment: Edge.Environment, +endpoint: Nat, +budget: Nat) -> Trace:
  match trace:
    case Trace{_,_,_,_,_,_,before,_,_}:
      boundary(advance(10000n,budget,trace,environment,endpoint),endpoint,budget,before)

# Membership controls select the original beginObservedPreparation admission,
# exactly as the public scenario does; preparation/unit IDs are not substitutes.
def member_selected(equal: Bool, scope: Freshness.Scope, index: Nat,
    ih: Nat -> Maybe<&2,Freshness.Scope>) -> Maybe<&2,Freshness.Scope>:
  match equal index:
    case True{} 0n: Some{scope}
    case True{} 1n+rest: ih(rest)
    case False{} index: ih(index)

def member(list: List<&2,Frame>, +partition: Nat, index: Nat) -> Maybe<&2,Freshness.Scope>:
  match list:
    case Nil{}: None{}
    case Observed{Edge.CanonicalFrame{_,_,_,_,C.BeginObservedPreparation{+p,l,r,observation,_},_},_,_,_} <> tail:
      member_selected(Nat.is_eq(p,partition),Freshness.Scope{p,l,r,observation},index,
        i => member(tail,partition,i))
    case _ <> tail: member(tail,partition,index)

def departure(result: Engine.SharingDeparture, +before: Types.State, queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, delay: Nat, job: Edge.Job, +input: Inputs.Boundary,
    +target: Maybe<&2,Freshness.Scope>, previous: Trace) -> Trace:
  match result previous:
    case Engine.SharingDeparture{+state,+events,applied}
        Trace{_,agents,queued,labels,originals,issued,consumed,frames,valid}:
      +now=Engine.clock(before)
      Trace{[Edge.Runtime{state,Edge.actions(Engine.sharing_actions(events),queue,now,job),jobs,delay}],
        agents,queued,labels,originals,issued,consumed,
        List.append(&2,Frame,frames,[Control{[before],[state],now,input,target,events,applied}]),valid}

def leave_original(found: Maybe<&2,Originals.Original>, +scope: Freshness.Scope,
    +runtime: Edge.Runtime, input: Inputs.Boundary, previous: Trace) -> Trace:
  match found scope runtime:
    case Some{Originals.Original{_,Inputs.Edit{_,_,bytes,units,_,_,_}}} Freshness.Scope{p,l,_,_}
        Edge.Runtime{+state,queue,jobs,delay}:
      departure(Engine.sharing_leave(state,scope),state,queue,jobs,delay,
        Edge.Job{p,l,bytes,units,C.RequestFinding{}},input,Some{scope},previous)
    case _ _ _: fail(previous)

def leave_scope(scope: Maybe<&2,Freshness.Scope>, runtime: Edge.Runtime,
    originals: List<&2,Originals.Original>, input: Inputs.Boundary, previous: Trace) -> Trace:
  match scope:
    case Some{+scope}: leave_original(Originals.original(originals,scope),scope,runtime,input,previous)
    case None{}: fail(previous)

def leave_agent(agent: Maybe<&2,Initial.Agent>, index: Nat, +trace: Trace, input: Inputs.Boundary) -> Trace:
  match agent trace:
    case Some{Initial.Agent{_,p,_}} Trace{runtime <> Nil{},_,_,_,originals,_,_,frames,True{}}:
      leave_scope(member(frames,p,index),runtime,originals,input,trace)
    case _ trace: fail(trace)

def all_original(found: Maybe<&2,Originals.Original>, +runtime: Edge.Runtime,
    +p: Nat, +l: Nat, input: Inputs.Boundary, previous: Trace) -> Trace:
  match found runtime:
    case Some{Originals.Original{_,Inputs.Edit{_,_,bytes,units,_,_,_}}} Edge.Runtime{+state,queue,jobs,delay}:
      departure(Engine.sharing_leave_all(state,p,l),state,queue,jobs,delay,
        Edge.Job{p,l,bytes,units,C.RequestFinding{}},input,None{},previous)
    case _ _: fail(previous)

def all_scope(scope: Maybe<&2,Freshness.Scope>, runtime: Edge.Runtime,
    originals: List<&2,Originals.Original>, p: Nat, l: Nat, input: Inputs.Boundary, previous: Trace) -> Trace:
  match scope:
    case Some{scope}: all_original(Originals.original(originals,scope),runtime,p,l,input,previous)
    case None{}: fail(previous)

def all_agent(agent: Maybe<&2,Initial.Agent>, +trace: Trace, input: Inputs.Boundary) -> Trace:
  match agent trace:
    case Some{Initial.Agent{_,+p,l}} Trace{runtime <> Nil{},_,_,_,originals,_,_,frames,True{}}:
      all_scope(member(frames,p,0n),runtime,originals,p,l,input,trace)
    case _ trace: fail(trace)

def apply(+input: Inputs.Boundary, +trace: Trace, environment: Edge.Environment) -> Trace:
  match input trace:
    case Inputs.Advance{endpoint,budget} trace: advanced(trace,environment,endpoint,budget)
    case Inputs.Leave{agent,index} Trace{_,agents,_,_,_,_,_,_,_}:
      leave_agent(Initial.agent(agents,agent),index,trace,input)
    case Inputs.LeaveAll{agent} Trace{_,agents,_,_,_,_,_,_,_}:
      all_agent(Initial.agent(agents,agent),trace,input)

def boundaries(list: List<&2,Inputs.Boundary>, trace: Trace, +environment: Edge.Environment) -> Trace:
  match list:
    case Nil{}: trace
    case input <> tail: boundaries(tail,apply(input,trace,environment),environment)

def scenario(+input: Inputs.Scenario) -> Trace:
  match input:
    case Inputs.Scenario{configuration,_,_,list}:
      boundaries(list,initialized(Initial.initialize(input)),Initial.environment(configuration))
