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

def capture_states(runtime: List<&2,Edge.Runtime>, issued: Nat) -> List<&2,Types.State>:
  match runtime:
    case Edge.Runtime{state,Edge.Queue{items,_,_},_,_} <> Nil{}:
      [issue_items(items,state,issued)]
    case _: []

def capture_ready(states: List<&2,Types.State>, runtime: List<&2,Edge.Runtime>, issued: Nat) -> Captured:
  match states runtime:
    case state <> Nil{} Edge.Runtime{_,Edge.Queue{items,+sequence,synced},jobs,delay} <> Nil{}:
      Captured{[Edge.Runtime{state,Edge.Queue{items,sequence,synced},jobs,delay}],sequence}
    case _ runtime: Captured{runtime,issued}

def capture(+runtime: List<&2,Edge.Runtime>, +issued: Nat) -> Captured:
  capture_ready(capture_states(runtime,issued),runtime,issued)

def delivered(input: Edge.Input, state: Types.State, order: Nat) -> Types.State:
  match input:
    case Edge.Event{_ ,_}: Engine.callback_delivered(state,order)
    case _: state

def delivered_runtime(input: Edge.Input, runtime: List<&2,Edge.Runtime>, order: Nat) -> List<&2,Edge.Runtime>:
  match runtime:
    case Edge.Runtime{state,queue,jobs,delay} <> Nil{}:
      [Edge.Runtime{delivered(input,state,order),queue,jobs,delay}]
    case runtime: runtime

def take_receipted(-F: Data, receipt: Maybe<&2,Callbacks.Target>, runtime: List<&2,Edge.Runtime>,
    input: Edge.Input, order: Nat, environment: Edge.Environment,
    factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  Stepped{Edge.observe_step_with(F,delivered_runtime(input,runtime,order),environment,factory),receipt}

def take_selected(-F: Data, +runtime: List<&2,Edge.Runtime>, input: Edge.Input, +order: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  take_receipted(F,CallbacksEdge.original_receipt(Edge.runtime_originals(runtime),order,None{}),
    runtime,input,order,environment,factory)

# Finish actions and hook construction while complete state stays inside next.
def routed_queue(next: List<&2,Engine.SharingNext>, runtime: List<&2,Edge.Runtime>,
    now: Nat, job: Edge.Job) -> List<&2,Edge.Queue>:
  match next runtime:
    case Engine.SharingNext{_,Some{_},events} <> Nil{} Edge.Runtime{_,queue,_,_} <> Nil{}:
      [Edge.actions(Engine.sharing_actions(events),queue,now,job)]
    case _ _: []

def routed_ready(-F: Data, queue: List<&2,Edge.Queue>, next: List<&2,Engine.SharingNext>,
    runtime: List<&2,Edge.Runtime>, now: Nat, order: Nat, hook: Edge.CommandHook<F>) -> Stepped<F>:
  match queue next runtime:
    case queue <> Nil{} Engine.SharingNext{state,Some{Engine.SharingFrame{before,after,event,result}},_} <> Nil{}
        Edge.Runtime{_,_,jobs,delay} <> Nil{}:
      Stepped{Edge.Observed{[Edge.Runtime{state,queue,jobs,delay}],
        Some{Edge.CanonicalFrame{[before],[after],now,order,event,[result]}},hook},None{}}
    case _ _ runtime: Stepped{Edge.Observed{runtime,Some{Edge.UnexpectedInput{}},hook},None{}}

def routed_mode(next: List<&2,Engine.SharingNext>) -> Nat:
  match next:
    case Engine.SharingNext{_,Some{_},_} <> Nil{}: 2n
    case Engine.SharingNext{_,None{},_} <> Nil{}: 1n
    case _: 0n

def routed_selected(-F: Data, mode: Nat, +next: List<&2,Engine.SharingNext>, +runtime: List<&2,Edge.Runtime>,
    input: Edge.Input, +now: Nat, order: Nat, job: Edge.Job,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match mode:
    case 2n: routed_ready(F,routed_queue(next,runtime,now,job),next,runtime,now,order,factory([]))
    case 1n: take_selected(F,runtime,input,order,environment,factory)
    case _: Stepped{Edge.Observed{runtime,Some{Edge.UnexpectedInput{}},factory([])},None{}}

def routed(-F: Data, +next: List<&2,Engine.SharingNext>, runtime: List<&2,Edge.Runtime>, input: Edge.Input,
    now: Nat, order: Nat, job: Edge.Job,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  routed_selected(F,routed_mode(next),next,runtime,input,now,order,job,environment,factory)

def preprocess_next(runtime: List<&2,Edge.Runtime>, event: C.CanonicalEvent,
    order: Nat, endpoint: Nat) -> List<&2,Engine.SharingNext>:
  match runtime:
    case Edge.Runtime{state,_,_,_} <> Nil{}:
      [Engine.sharing_preprocess(state,event,order,Some{endpoint})]
    case _: []

def preprocess(-F: Data, input: Edge.Input, +runtime: List<&2,Edge.Runtime>, now: Nat, +order: Nat,
    endpoint: Nat, environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match input:
    case Edge.Event{Driver.Action{+event,delay,candidate,binding,expiry},+job}:
      routed(F,preprocess_next(runtime,event,order,endpoint),runtime,
        Edge.Event{Driver.Action{event,delay,candidate,binding,expiry},job},now,order,job,environment,factory)
    case input: take_selected(F,runtime,input,order,environment,factory)

def within(-F: Data, allowed: Bool, input: Edge.Input, runtime: List<&2,Edge.Runtime>, at: Nat, order: Nat,
    endpoint: Nat, environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match allowed:
    case True{}: preprocess(F,input,runtime,at,order,endpoint,environment,factory)
    case False{}: Stepped{Edge.Observed{runtime,None{},factory([])},None{}}

def selected(-F: Data, head: List<&2,Scheduler.Entry>, +runtime: List<&2,Edge.Runtime>, +endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match head:
    case Scheduler.Entry{+at,+order} <> _:
      within(F,Nat.is_le(at,endpoint),Edge.lookup(Edge.runtime_items(runtime),order),runtime,at,order,endpoint,environment,factory)
    case Nil{}: Stepped{Edge.Observed{runtime,None{},factory([])},None{}}

def step_valid(-F: Data, valid: Bool, +runtime: List<&2,Edge.Runtime>, endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  match valid:
    case True{}: selected(F,Edge.runtime_entries(runtime),runtime,endpoint,environment,factory)
    case False{}: Stepped{Edge.Observed{runtime,Some{Edge.UnexpectedInput{}},factory([])},None{}}

def step_synced(-F: Data, +runtime: List<&2,Edge.Runtime>, endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  step_valid(F,Edge.runtime_valid(runtime),runtime,endpoint,environment,factory)

def step(-F: Data, runtime: List<&2,Edge.Runtime>, endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.CommandHook<F>) -> Stepped<F>:
  step_synced(F,Edge.runtime_sync(runtime),endpoint,environment,factory)
