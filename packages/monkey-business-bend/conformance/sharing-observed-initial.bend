import Base
import ./advicee-lifecycle-driver.bend as Edge
import ./sharing-original-inputs.bend as Inputs
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Advicees.bend as Advicees
import ../Workload.bend as Workload
import ../../agent-flow-bend/Canonical.bend as C

type Agent is Data:
  Agent{agent: String, partition: Nat, lifetime: Nat}
type QueuedOriginal is Data:
  QueuedOriginal{order: Nat, edit: Inputs.Edit}
type Initialized is Data:
  Initialized{runtime: List<&2,Edge.Runtime>, agents: List<&2,Agent>,
    originals: List<&2,QueuedOriginal>, valid: Bool}

def selected_agent(equal: Bool, agent: Agent, rest: Maybe<&2,Agent>) -> Maybe<&2,Agent>:
  match equal:
    case True{}: Some{agent}
    case False{}: rest

def agent(agents: List<&2,Agent>, +name: String) -> Maybe<&2,Agent>:
  match agents:
    case []: None{}
    case Agent{+other,+p,+l} <> tail:
      selected_agent(String.eq(other,name),Agent{other,p,l},agent(tail,name))

def declared(result: Engine.AdviceeDeclared, name: String, profile: Workload.Profile,
    agents: List<&2,Agent>, ih: Types.State -> List<&2,Agent> -> Initialized) -> Initialized:
  match result:
    case Engine.AdviceeDeclared{+state,Some{Advicees.Scope{_,+partition,_}},True{}}:
      ih(Engine.configure_workload(state,partition,profile),
        List.append(&2,Agent,agents,[Agent{name,partition,Edge.life_value(Engine.lifecycle_entry(state,partition))}]))
    case Engine.AdviceeDeclared{state,_,_}: Initialized{[Edge.Runtime{state,Edge.Queue{[],0n,0n},[],0n}],agents,[],False{}}

def session(profile: Workload.Profile, state: Types.State, identity: Nat, name: String,
    agents: List<&2,Agent>, ih: Types.State -> List<&2,Agent> -> Initialized) -> Initialized:
  match profile:
    case Workload.Profile{settings,+seed,codes,bytes,units,duration}:
      declared(Engine.declare_advicee(state,identity,U32.to_nat(seed)),name,
        Workload.Profile{settings,seed,codes,bytes,units,duration},agents,ih)

def sessions(list: List<&2,Inputs.SessionInput>, state: Types.State, agents: List<&2,Agent>) -> Initialized:
  match list:
    case []: Initialized{[Edge.Runtime{state,Edge.Queue{[],0n,0n},[],0n}],agents,[],True{}}
    case Inputs.SessionInput{name,identity,profile} <> rest:
      session(profile,state,identity,name,agents,next => captured => sessions(rest,next,captured))

def started(result: Engine.WorkloadTransition, queue: Edge.Queue,
    agents: List<&2,Agent>, ih: Edge.Runtime -> Initialized) -> Initialized:
  match result:
    case Engine.WorkloadTransition{+state,events,True{}}:
      ih(Edge.Runtime{state,Edge.emissions(events,queue,state),[],0n})
    case Engine.WorkloadTransition{state,_,False{}}:
      Initialized{[Edge.Runtime{state,queue,[],0n}],agents,[],False{}}

def start_sessions(list: List<&2,Agent>, runtime: Edge.Runtime, +agents: List<&2,Agent>) -> Initialized:
  match list runtime:
    case [] runtime: Initialized{[runtime],agents,[],True{}}
    case Agent{_,p,_} <> tail Edge.Runtime{state,queue,_,_}:
      started(Engine.workload_action(state,p,Workload.Next{}),queue,agents,next => start_sessions(tail,next,agents))

def start(initial: Initialized) -> Initialized:
  match initial:
    case Initialized{runtime <> Nil{},+agents,_,True{}}: start_sessions(agents,runtime,agents)
    case initial: initial

def edit_selected(selected: Maybe<&2,Agent>, +edit: Inputs.Edit,
    runtime: Edge.Runtime, +agents: List<&2,Agent>,
    originals: List<&2,QueuedOriginal>, ih: Edge.Runtime -> List<&2,QueuedOriginal> -> Initialized) -> Initialized:
  match selected edit runtime:
    case Some{Agent{_,p,l}} Inputs.Edit{name,+at,+bytes,+units,subject,input,namespace,+outcome}
        Edge.Runtime{state,Edge.Queue{items,+sequence,synced},jobs,delay}:
      ih(Edge.Runtime{state,Edge.append(Edge.Queue{items,sequence,synced},at,
        Edge.Edit{Edge.Job{p,l,bytes,units,outcome}}),jobs,delay},
        List.append(&2,QueuedOriginal,originals,[QueuedOriginal{sequence,Inputs.Edit{name,at,bytes,units,subject,input,namespace,outcome}}]))
    case _ _ runtime: Initialized{[runtime],agents,originals,False{}}

def edits(list: List<&2,Inputs.Edit>, runtime: Edge.Runtime,
    +agents: List<&2,Agent>, originals: List<&2,QueuedOriginal>) -> Initialized:
  match list:
    case []: Initialized{[runtime],agents,originals,True{}}
    case Inputs.Edit{+name,at,bytes,units,subject,input,namespace,+outcome} <> tail:
      edit_selected(agent(agents,name),Inputs.Edit{name,at,bytes,units,subject,input,namespace,outcome},runtime,agents,originals,next => captured => edits(tail,next,agents,captured))

def scripted(initial: Initialized, list: List<&2,Inputs.Edit>, delay: Nat) -> Initialized:
  match initial:
    case Initialized{Edge.Runtime{state,queue,jobs,_} <> Nil{},agents,originals,True{}}:
      edits(list,Edge.Runtime{state,queue,jobs,delay},agents,originals)
    case initial: initial

def sessions_configured(list: List<&2,Inputs.SessionInput>, state: Types.State) -> Initialized:
  sessions(list,state,[])

def configured(configuration: Inputs.Configuration) -> Initialized:
  match configuration:
    case Inputs.Configuration{seed,limits,_,sessions,_,_,_,_,_,entries,bytes,_}:
      start(sessions_configured(sessions,Engine.configure_cache(
        Engine.configure_credentials(Engine.configure_seed(Engine.initial(limits),seed),True{},1n),
        True{},entries,bytes)))


def initialize(scenario: Inputs.Scenario) -> Initialized:
  match scenario:
    case Inputs.Scenario{configuration,edits,delay,_}: scripted(configured(configuration),edits,delay)

def environment(configuration: Inputs.Configuration) -> Edge.Environment:
  match configuration:
    case Inputs.Configuration{seed,_,_,_,tree,graph,preparation_delay,output_delay,output_lease,_,_,outcomes}:
      Edge.Environment{seed,tree,graph,preparation_delay,output_delay,output_lease,None{},outcomes}
