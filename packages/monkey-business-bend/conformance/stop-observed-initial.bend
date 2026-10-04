import Base
import ./stop-original-inputs.bend as Inputs
import ./advicee-lifecycle-driver.bend as Edge
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Advicees.bend as Advicees
import ../Driver.bend as Driver
import ../Workload.bend as Workload
import ../../agent-flow-bend/Canonical.bend as Canonical

type Agent is Data:
  Agent{agent: String, partition: Nat}
type Initialized is Data:
  Initialized{runtime: List<&2,Edge.Runtime>, agents: List<&2,Agent>, valid: Bool}

def selected(equal: Bool, head: Agent, rest: Maybe<&2,Agent>) -> Maybe<&2,Agent>:
  match equal:
    case True{}: Some{head}
    case False{}: rest

def name(value: Agent) -> String:
  match value:
    case Agent{name,_}: name

def find(agents: List<&2,Agent>, +requested: String) -> Maybe<&2,Agent>:
  match agents:
    case Nil{}: None{}
    case +head <> tail:
      selected(String.eq(name(head),requested),head,find(tail,requested))

def first_agent(agents: List<&2,Agent>) -> Maybe<&2,Agent>:
  match agents:
    case head <> _: Some{head}
    case Nil{}: None{}

def agent(agents: List<&2,Agent>, requested: Maybe<&2,String>) -> Maybe<&2,Agent>:
  match requested:
    case Some{requested}: find(agents,requested)
    case None{}: first_agent(agents)

def configured(state: Types.State, p: Nat, profile: Maybe<&2,Workload.Profile>) -> Types.State:
  match profile:
    case Some{profile}: Engine.configure_workload(state,p,profile)
    case None{}: state

def declared(result: Engine.AdviceeDeclared, name: String, profile: Maybe<&2,Workload.Profile>,
    agents: List<&2,Agent>, ih: Types.State -> List<&2,Agent> -> Initialized) -> Initialized:
  match result:
    case Engine.AdviceeDeclared{state,Some{Advicees.Scope{_,+p,_}},True{}}:
      ih(configured(state,p,profile),List.append(&2,Agent,agents,[Agent{name,p}]))
    case Engine.AdviceeDeclared{state,_,_}:
      Initialized{[Edge.Runtime{state,Edge.Queue{[],0n,0n},[],0n}],agents,False{}}

def advicees(list: List<&2,Inputs.Advicee>, state: Types.State, agents: List<&2,Agent>) -> Initialized:
  match list:
    case Nil{}: Initialized{[Edge.Runtime{state,Edge.Queue{[],0n,0n},[],0n}],agents,True{}}
    case Inputs.Advicee{name,identity,seed,profile} <> tail:
      declared(Engine.declare_advicee(state,identity,seed),name,profile,agents,
        next => captured => advicees(tail,next,captured))

def started(changed: Engine.WorkloadTransition, queue: Edge.Queue, jobs: List<&2,Edge.Stored>, delay: Nat,
    agents: List<&2,Agent>, ih: Edge.Runtime -> Initialized) -> Initialized:
  match changed:
    case Engine.WorkloadTransition{+state,events,True{}}:
      ih(Edge.Runtime{state,Edge.emissions(events,queue,state),jobs,delay})
    case Engine.WorkloadTransition{state,_,False{}}: Initialized{[Edge.Runtime{state,queue,jobs,delay}],agents,False{}}

def start_agent(active: Bool, +state: Types.State, queue: Edge.Queue, jobs: List<&2,Edge.Stored>, delay: Nat,
    p: Nat, agents: List<&2,Agent>, ih: Edge.Runtime -> Initialized) -> Initialized:
  match active:
    case True{}: started(Engine.workload_action(state,p,Workload.Next{}),queue,jobs,delay,agents,ih)
    case False{}: ih(Edge.Runtime{state,queue,jobs,delay})

def startup(list: List<&2,Agent>, runtime: Edge.Runtime, +agents: List<&2,Agent>) -> Initialized:
  match list runtime:
    case Nil{} runtime: Initialized{[runtime],agents,True{}}
    case Agent{_,+p} <> tail Edge.Runtime{+state,queue,jobs,delay}:
      start_agent(Engine.workload_configured(state,p),state,queue,jobs,delay,p,agents,
        next => startup(tail,next,agents))

# Raw caller inputs keep the arrival fence. Their physical source lifetime is
# captured by actual SourceEdit consumption, before issuance or preparation.
def activity(scope: Maybe<&2,Nat>) -> Nat:
  match scope:
    case Some{value}: value
    case None{}: 0n

def append_selected(found: Maybe<&2,Agent>, input: Inputs.Input, runtime: Edge.Runtime,
    +agents: List<&2,Agent>, +wait: Nat, ih: Edge.Runtime -> Initialized) -> Initialized:
  match found input runtime:
    case Some{Agent{_,+p}} Inputs.Edit{at,_,bytes,units,outcome} Edge.Runtime{+state,queue,jobs,delay}:
      ih(Edge.Runtime{state,Edge.append(queue,at,
        Edge.SourceEdit{p,activity(Engine.activity_scope(state,p)),bytes,units,outcome}),jobs,delay})
    case Some{Agent{_,p}} Inputs.Finish{+at,_,recurring} Edge.Runtime{state,queue,jobs,delay}:
      ih(Edge.Runtime{state,Edge.append(queue,at,Edge.FinishIntent{p,at,Nat.add(at,wait),recurring}),jobs,delay})
    case _ _ runtime: Initialized{[runtime],agents,False{}}

def input_owner(value: Maybe<&2,Nat>) -> Nat:
  match value:
    case Some{p}: p
    case None{}: 0n

def append(input: Inputs.Input, runtime: Edge.Runtime, +agents: List<&2,Agent>, wait: Nat,
    ih: Edge.Runtime -> Initialized) -> Initialized:
  match input runtime:
    case Inputs.CanonicalInput{at,+event} Edge.Runtime{+state,queue,jobs,delay}:
      ih(Edge.Runtime{state,Edge.append(queue,at,Edge.Event{Driver.immediate(event,False{}),
        Edge.NoJob{input_owner(Engine.scope_event(state,state,event,Some{1n})),1n},None{}}),jobs,delay})
    case Inputs.Edit{at,+requested,bytes,units,outcome} runtime:
      append_selected(agent(agents,requested),Inputs.Edit{at,requested,bytes,units,outcome},runtime,agents,wait,ih)
    case Inputs.Finish{at,+requested,recurring} runtime:
      append_selected(agent(agents,requested),Inputs.Finish{at,requested,recurring},runtime,agents,wait,ih)

def inputs(list: List<&2,Inputs.Input>, runtime: Edge.Runtime, +agents: List<&2,Agent>, +wait: Nat) -> Initialized:
  match list:
    case Nil{}: Initialized{[runtime],agents,True{}}
    case input <> tail: append(input,runtime,agents,wait,next => inputs(tail,next,agents,wait))

def initialized_start(result: Initialized, list: List<&2,Inputs.Input>, wait: Nat) -> Initialized:
  match result:
    case Initialized{runtime <> Nil{},agents,True{}}: inputs(list,runtime,agents,wait)
    case result: result

def initialize(result: Initialized, list: List<&2,Inputs.Input>, delay: Nat, wait: Nat) -> Initialized:
  match result:
    case Initialized{Edge.Runtime{state,queue,jobs,_} <> Nil{},+agents,True{}}:
      initialized_start(startup(agents,Edge.Runtime{state,queue,jobs,delay},agents),list,wait)
    case result: result

def scenario(input: Inputs.Scenario) -> Initialized:
  match input:
    case Inputs.Scenario{Inputs.Configuration{seed,list,_,limits,_,_,_,delay,_,wait,_,_,_,_,collectors},originals,_}:
      initialize(advicees(list,Engine.collector_configure(
        Engine.configure_seed(Engine.initial(limits),seed),collectors),[]),originals,delay,wait)

def environment(configuration: Inputs.Configuration) -> Edge.Environment:
  match configuration:
    case Inputs.Configuration{seed,_,_,_,tree,graph,prep,_,outcomes,_,output,delay,lease,bytes,_}:
      Edge.Environment{seed,tree,graph,prep,delay,lease,Some{Edge.StopProfile{output,bytes}},outcomes}

# Later Schedule inputs resolve names through the genuine resident registry;
# they do not allocate advicees, reopen scopes or repeat startup.
def resolved(found: Maybe<&2,Advicees.Scope>, name: String, rest: List<&2,Agent>) -> List<&2,Agent>:
  match found:
    case Some{Advicees.Scope{_,p,_}}: Agent{name,p} <> rest
    case None{}: rest

def resolve(list: List<&2,Inputs.Advicee>, +state: Types.State) -> List<&2,Agent>:
  match list:
    case Nil{}: []
    case Inputs.Advicee{name,identity,_,_} <> tail:
      resolved(Engine.advicee_identity(state,identity),name,resolve(tail,state))

def scheduled(value: Inputs.Input, configuration: Inputs.Configuration, runtime: List<&2,Edge.Runtime>) -> Initialized:
  match configuration runtime:
    case Inputs.Configuration{_,declarations,_,_,_,_,_,_,_,wait,_,_,_,_,_}
        Edge.Runtime{+state,queue,jobs,delay} <> Nil{}:
      inputs([value],Edge.Runtime{state,queue,jobs,delay},resolve(declarations,state),wait)
    case _ runtime: Initialized{runtime,[],False{}}
