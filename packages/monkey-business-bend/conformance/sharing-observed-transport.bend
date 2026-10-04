import Base
import ./advicee-lifecycle-driver.bend as Edge
import ./callback-native-driver.bend as CallbacksEdge
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../StopScenario.bend as Stop
import ../OutputScenario.bend as Output
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
    case Edge.Event{action,_,_}: Some{action}
    case Edge.FitEvent{action,_,_,_}: Some{action}
    case _: None{}

# Original Finish completion facts come from the same registry populated by
# Stop.command_authorized. Callbacks validates the full target/selected tuple;
# the transport neither rebuilds a capture nor decides output acceptance.
def finish_output_list(values: List<&2,Output.Capture>) -> Maybe<&2,Output.Capture>:
  match values:
    case Output.Capture{_,_,Output.Failed{},_,_} <> Nil{}: None{}
    case capture <> Nil{}: Some{capture}
    case _: None{}

def finish_output(found: Maybe<&2,Stop.Finish>) -> Maybe<&2,Output.Capture>:
  match found:
    case Some{Stop.Finish{_,_,_,_,_,_,_,_,_,_,_,_,output}}: finish_output_list(output)
    case None{}: None{}

def action_output(event: C.CanonicalEvent, state: Types.State) -> Maybe<&2,Output.Capture>:
  match event:
    case C.FinishTerminal{partition,_,_,_,_,_}: finish_output(Engine.stop_find(state,partition))
    case _: None{}

def issue_output_owned(owner: Maybe<&2,Callbacks.Owner>, state: Types.State, order: Nat, at: Nat,
    action: Driver.Action, capture: Output.Capture) -> Types.State:
  match owner:
    case Some{owner}: CallbacksEdge.issued_state(Engine.callback_issue_output(state,owner,order,at,action,capture))
    case None{}: state

def issue_output(capture: Maybe<&2,Output.Capture>, +state: Types.State, order: Nat, at: Nat,
    +action: Driver.Action) -> Types.State:
  match capture:
    case Some{capture}: issue_output_owned(Engine.callback_owner(state,Callbacks.event_of(action)),state,order,at,action,capture)
    case None{}: CallbacksEdge.issue_action(Some{action},state,order,at)

def issue_action(action: Maybe<&2,Driver.Action>, +state: Types.State, order: Nat, at: Nat) -> Types.State:
  match action:
    case Some{+action}: issue_output(action_output(Callbacks.event_of(action),state),state,order,at,action)
    case None{}: state

def issue_fresh(fresh: Bool, input: Edge.Input, state: Types.State, order: Nat, at: Nat) -> Types.State:
  match fresh:
    case False{}: state
    case True{}: issue_action(action(input),state,order,at)

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

def receipt_target(receipt: Maybe<&2,Callbacks.Fact>) -> Maybe<&2,Callbacks.Target>:
  match receipt:
    case Some{Callbacks.Fact{target,_,_,_}}: Some{target}
    case None{}: None{}

def take_receipted(-F: Data, +receipt: Maybe<&2,Callbacks.Fact>, runtime: List<&2,Edge.Runtime>,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  Stepped{Edge.observe_step_with(F,runtime,receipt,environment,factory),receipt_target(receipt)}

def take_selected(-F: Data, +runtime: List<&2,Edge.Runtime>, input: Edge.Input, +order: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  take_receipted(F,Edge.frame_receipt(runtime,order),runtime,environment,factory)

# Finish actions and hook construction while complete state stays inside next.
def routed_queue(next: List<&2,Engine.SharingNext>, runtime: List<&2,Edge.Runtime>,
    now: Nat, job: Edge.Job) -> List<&2,Edge.Queue>:
  match next runtime:
    case Engine.SharingNext{_,Some{_},events} <> Nil{} Edge.Runtime{_,queue,_,_} <> Nil{}:
      [Edge.actions(Engine.sharing_actions(events),queue,now,job)]
    case _ _: []

def routed_ready(-F: Data, queue: List<&2,Edge.Queue>, next: List<&2,Engine.SharingNext>,
    +runtime: List<&2,Edge.Runtime>, now: Nat, order: Nat, hook: Edge.CommandHook<F>) -> Stepped<F>:
  match queue next runtime:
    case queue <> Nil{} Engine.SharingNext{state,Some{Engine.SharingFrame{+before,+after,event,+result}},_} <> Nil{}
        Edge.Runtime{_,_,jobs,delay} <> Nil{}:
      +following:List<&2,Edge.Runtime>=[Edge.Runtime{state,queue,jobs,delay}]
      Stepped{Edge.Observed{following,
        Some{Edge.CanonicalFrame{[before],[after],now,order,event,[result],runtime,following,None{},Edge.frame_scope_states([before],[after],Edge.actual_commands(result),None{}),None{},[]}},hook},None{}}
    case _ _ runtime: Stepped{Edge.Observed{runtime,Some{Edge.UnexpectedInput{}},hook},None{}}

def routed_mode(next: List<&2,Engine.SharingNext>) -> Nat:
  match next:
    case Engine.SharingNext{_,Some{_},_} <> Nil{}: 2n
    case Engine.SharingNext{_,None{},_} <> Nil{}: 1n
    case _: 0n

def routed_selected(-F: Data, mode: Nat, +next: List<&2,Engine.SharingNext>, +runtime: List<&2,Edge.Runtime>,
    input: Edge.Input, +now: Nat, order: Nat, job: Edge.Job,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  match mode:
    case 2n: routed_ready(F,routed_queue(next,runtime,now,job),next,runtime,now,order,Edge.transition_commands(F,factory([])))
    case 1n: take_selected(F,runtime,input,order,environment,factory)
    case _: Stepped{Edge.Observed{runtime,Some{Edge.UnexpectedInput{}},Edge.transition_commands(F,factory([]))},None{}}

def routed(-F: Data, +next: List<&2,Engine.SharingNext>, runtime: List<&2,Edge.Runtime>, input: Edge.Input,
    now: Nat, order: Nat, job: Edge.Job,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  routed_selected(F,routed_mode(next),next,runtime,input,now,order,job,environment,factory)

def preprocess_next(runtime: List<&2,Edge.Runtime>, event: C.CanonicalEvent,
    order: Nat, endpoint: Nat) -> List<&2,Engine.SharingNext>:
  match runtime:
    case Edge.Runtime{state,_,_,_} <> Nil{}:
      [Engine.sharing_preprocess(state,event,order,Some{endpoint})]
    case _: []

def preprocess(-F: Data, input: Edge.Input, +runtime: List<&2,Edge.Runtime>, now: Nat, +order: Nat,
    endpoint: Nat, environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  match input:
    case Edge.Event{Driver.Action{+event,delay,candidate,binding,expiry},+job,source}:
      routed(F,preprocess_next(runtime,event,order,endpoint),runtime,
        Edge.Event{Driver.Action{event,delay,candidate,binding,expiry},job,source},now,order,job,environment,factory)
    case Edge.FitEvent{Driver.Action{+event,delay,candidate,binding,expiry},+job,attempt,source}:
      routed(F,preprocess_next(runtime,event,order,endpoint),runtime,
        Edge.FitEvent{Driver.Action{event,delay,candidate,binding,expiry},job,attempt,source},now,order,job,environment,factory)
    case input: take_selected(F,runtime,input,order,environment,factory)

def within(-F: Data, allowed: Bool, input: Edge.Input, runtime: List<&2,Edge.Runtime>, at: Nat, order: Nat,
    endpoint: Nat, environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  match allowed:
    case True{}: preprocess(F,input,runtime,at,order,endpoint,environment,factory)
    case False{}: Stepped{Edge.Observed{runtime,None{},Edge.transition_commands(F,factory([]))},None{}}

def selected(-F: Data, head: List<&2,Scheduler.Entry>, +runtime: List<&2,Edge.Runtime>, +endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  match head:
    case Scheduler.Entry{+at,+order} <> _:
      within(F,Nat.is_le(at,endpoint),Edge.lookup(Edge.runtime_items(runtime),order),runtime,at,order,endpoint,environment,factory)
    case Nil{}: Stepped{Edge.Observed{runtime,None{},Edge.transition_commands(F,factory([]))},None{}}

def step_valid(-F: Data, valid: Bool, +runtime: List<&2,Edge.Runtime>, endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  match valid:
    case True{}: selected(F,Edge.runtime_entries(runtime),runtime,endpoint,environment,factory)
    case False{}: Stepped{Edge.Observed{runtime,Some{Edge.UnexpectedInput{}},Edge.transition_commands(F,factory([]))},None{}}

def step_synced(-F: Data, +runtime: List<&2,Edge.Runtime>, endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  step_valid(F,Edge.runtime_valid(runtime),runtime,endpoint,environment,factory)

def step(-F: Data, runtime: List<&2,Edge.Runtime>, endpoint: Nat,
    environment: Edge.Environment, factory: List<&2,C.Command> -> Edge.TransitionHook<F>) -> Stepped<F>:
  step_synced(F,Edge.runtime_sync(runtime),endpoint,environment,factory)
