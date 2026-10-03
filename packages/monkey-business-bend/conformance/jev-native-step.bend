import Base
import ./minimal-scenario.bend as Minimal
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/ImportGraph.bend as Graph

# Shared factual native edge. Commands publish the exact state returned by
# Engine.issue_actions before subsequent commands, Engine.after and observation.
# This adapter supplies original graph facts and projects full rows; all policy
# and lifecycle generation remain in actual Engine/Driver/Canonical modules.
type NativeStep is Data:
  NativeStep{state: Types.State, queue: Minimal.Queue, rows: List<&2,List<&2,Nat>>}

def config() -> Minimal.Config:
  Minimal.Config{Canonical.RequestFinding{},True{},True{},True{},True{},1n}

def advanced(pair: Types.State & Minimal.Queue, before: Types.State, +event: Canonical.CanonicalEvent,
    +now: Nat, commands: List<&2,Canonical.Command>) -> NativeStep:
  match pair:
    case (+state,q):
      NativeStep{state,Minimal.enqueue(Engine.after(before,state,event),q,now),[(Minimal.event_code(event) <> now <> List.append(&2,Nat,Minimal.event_identity(event),List.append(&2,Nat,Minimal.event_facts(event),List.append(&2,Nat,Minimal.state_counts(state),0n <> Minimal.command_codes(commands)))))]}

def transition(transition: Engine.Transition, +before: Types.State, action: Driver.Action, queue: Minimal.Queue, +now: Nat) -> NativeStep:
  match transition action:
    case Engine.Transition{+state,Canonical.Advanced{_,+commands}} Driver.Action{+event,+delay,+candidate,+job,+expiry}:
      advanced(Minimal.commands(commands,queue,now,state,event,Minimal.context(Driver.Action{event,delay,candidate,job,expiry},config(),now)),before,event,now,commands)
    case Engine.Transition{+state,Canonical.Rejected{_,_}} Driver.Action{+event,_,_,_,_}:
      NativeStep{state,Minimal.enqueue(Engine.after(before,state,event),queue,now),[(Minimal.event_code(event) <> now <> List.append(&2,Nat,Minimal.event_identity(event),List.append(&2,Nat,Minimal.event_facts(event),List.append(&2,Nat,Minimal.state_counts(state),[1n]))))]}

def execute(+state: Types.State, action: Driver.Action, queue: Minimal.Queue, +now: Nat) -> NativeStep:
  match action:
    case Driver.Action{+event,+delay,+candidate,+job,+expiry}:
      +a = {Driver.Action{event,delay,candidate,job,expiry} : Driver.Action}
      +event = Engine.fence(state,event,True{},Minimal.execution_context(event,a,config(),now))
      transition(Engine.step(state,event),state,Driver.Action{event,delay,candidate,job,expiry},queue,now)

def edited(plan: Driver.EditPlan, state: Types.State, queue: Minimal.Queue, +now: Nat) -> NativeStep:
  match plan:
    case Driver.EditPlan{retry,actions}: NativeStep{state,Minimal.edit_retry(retry,Minimal.enqueue(actions,queue,now),now),Nil{}}

def graphed(transition: Types.GraphTransition, queue: Minimal.Queue, now: Nat) -> NativeStep:
  match transition:
    case Types.GraphTransition{+state,_,Graph.BoundedStep{graph,command}}:
      NativeStep{state,queue,[List.append(&2,Nat,Minimal.graph_row(graph,command,now),Minimal.state_counts(state))]}
    case Types.GraphRejected{state}: NativeStep{state,queue,[[97n,now]]}

def interpreted(input: Minimal.Input, +state: Types.State, queue: Minimal.Queue, now: Nat) -> NativeStep:
  match input:
    case Minimal.Edit{}: edited(Engine.edit(state,1n,1n),state,queue,now)
    case Minimal.Event{action}: execute(state,action,queue,now)
    case Minimal.Fact{operation,step,event}:
      graphed(Engine.graph_step(state,Types.GraphKey{1n,1n,1n,operation,0n},step,Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},event),queue,now)

def resume(step: NativeStep, ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match step:
    case NativeStep{state,queue,rows}: List.append(&2,List<&2,Nat>,rows,ih((state,queue)))
