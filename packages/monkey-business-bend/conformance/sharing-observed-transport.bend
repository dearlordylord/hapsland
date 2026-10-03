import Base
import ./advicee-lifecycle-driver.bend as Edge
import ./callback-native-driver.bend as CallbacksEdge
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../Callbacks.bend as Callbacks
import ../Scheduler.bend as Scheduler
import ../../agent-flow-bend/Canonical.bend as C

# Reuse the actual callback issuer and factual Edge. This module allocates no
# callback identities and makes no routing, lifetime or scheduler decisions.
type Captured is Data:
  Captured{runtime: List<&2,Edge.Runtime>, issued: Nat}
type Stepped<-F: Data> is Type:
  Stepped{observed: Edge.Observed<F>, receipt: Maybe<&2,Callbacks.Target>}

def action(input: Edge.Input) -> Maybe<&2,Driver.Action>:
  match input:
    case Edge.Event{action,_}: Some{action}
    case _: None{}

def issue_fresh(fresh: Bool, input: Edge.Input, state: Types.State, order: Nat, at: Nat) -> Types.State:
  match fresh:
    case False{}: state
    case True{}: CallbacksEdge.issue_action(action(input),state,order,at)

def issue_items(items: List<&2,Edge.Item>, state: Types.State, +issued: Nat) -> Types.State:
  match items:
    case []: state
    case Edge.Item{at,+order,input} <> tail:
      issue_items(tail,issue_fresh(Nat.is_le(issued,order),input,state,order,at),issued)

def capture(runtime: Edge.Runtime, issued: Nat) -> Captured:
  match runtime:
    case Edge.Runtime{state,Edge.Queue{+items,+sequence,synced},jobs,delay}:
      Captured{[Edge.Runtime{issue_items(items,state,issued),Edge.Queue{items,sequence,synced},jobs,delay}],sequence}

def delivered(input: Edge.Input, state: Types.State, order: Nat) -> Types.State:
  match input:
    case Edge.Event{_ ,_}: Engine.callback_delivered(state,order)
    case _: state

def take_selected(-F: Data, runtime: Edge.Runtime, +input: Edge.Input, +order: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match runtime:
    case Edge.Runtime{+state,queue,jobs,delay}:
      Stepped{Edge.observe_step_with(F,Edge.Runtime{delivered(input,state,order),queue,jobs,delay},environment,factory),
        CallbacksEdge.original_receipt(Engine.callback_originals(state),order,None{})}

def routed(-F: Data, next: Engine.SharingNext, runtime: Edge.Runtime, +input: Edge.Input,
    +now: Nat, order: Nat, job: Edge.Job,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match next runtime:
    case Engine.SharingNext{state,Some{Engine.SharingFrame{before,after,event,result}},events}
        Edge.Runtime{_,queue,jobs,delay}:
      Stepped{Edge.Observed{[Edge.Runtime{state,Edge.actions(Engine.sharing_actions(events),queue,now,job),jobs,delay}],
        Some{Edge.CanonicalFrame{[before],[after],now,order,event,[result]}},factory([])},None{}}
    case Engine.SharingNext{_,None{},_} runtime: take_selected(F,runtime,input,order,environment,factory)

def preprocess(-F: Data, input: Edge.Input, +runtime: Edge.Runtime, now: Nat, +order: Nat,
    endpoint: Nat, environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match input runtime:
    case Edge.Event{Driver.Action{+event,delay,candidate,binding,expiry},+job}
        Edge.Runtime{+state,queue,jobs,run_delay}:
      routed(F,Engine.sharing_preprocess(state,event,order,Some{endpoint}),Edge.Runtime{state,queue,jobs,run_delay},
        Edge.Event{Driver.Action{event,delay,candidate,binding,expiry},job},now,order,job,environment,factory)
    case input runtime: take_selected(F,runtime,input,order,environment,factory)

def within(-F: Data, allowed: Bool, input: Edge.Input, runtime: Edge.Runtime, at: Nat, order: Nat,
    endpoint: Nat, environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match allowed:
    case True{}: preprocess(F,input,runtime,at,order,endpoint,environment,factory)
    case False{}: Stepped{Edge.Observed{[runtime],None{},factory([])},None{}}

def selected(-F: Data, head: List<&2,Scheduler.Entry>, +runtime: Edge.Runtime, +endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match head runtime:
    case Scheduler.Entry{+at,+order} <> _ Edge.Runtime{state,Edge.Queue{+items,sequence,synced},jobs,delay}:
      within(F,Nat.is_le(at,endpoint),Edge.lookup(items,order),Edge.Runtime{state,Edge.Queue{items,sequence,synced},jobs,delay},at,order,endpoint,environment,factory)
    case Nil{} runtime: Stepped{Edge.Observed{[runtime],None{},factory([])},None{}}


def step(-F: Data, runtime: Edge.Runtime, endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match runtime:
    case Edge.Runtime{state,Edge.Queue{+items,+sequence,synced},jobs,delay}:
      +state=Edge.sync(items,state,synced)
      selected(F,Engine.queued(state),Edge.Runtime{state,Edge.Queue{items,sequence,sequence},jobs,delay},endpoint,environment,factory)
