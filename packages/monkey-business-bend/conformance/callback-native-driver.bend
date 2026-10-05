import Base
import ./minimal-scenario.bend as Minimal
import ./jev-native-step.bend as NativeStep
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../Workload.bend as Workload
import ../Session.bend as Session
import ../Callbacks.bend as Callbacks
import ../AdviceeLifecycle.bend as Lifecycle
import ../AdviceeLifecycleCleanup.bend as Cleanup
import ../TreeFacts.bend as TreeFacts
import ../PreparationScenario.bend as Preparation
import ../Scheduler.bend as Scheduler
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ../../agent-flow-bend/Ledger.bend as Ledger

# Immutable actual boundaries, including rejected callbacks. The compact native
# adapter rows are auxiliary evidence and cannot substitute for these snapshots.
type Frame is Data:
  CanonicalFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, at: Nat, order: Nat,
    event: Canonical.CanonicalEvent, result: List<&2,Canonical.Step>, receipt: Maybe<&2,Callbacks.Target>}
  GraphFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, at: Nat, order: Nat,
    key: Types.GraphKey, position: Nat, event: Graph.GraphEvent, result: List<&2,Types.GraphTransition>}
  ControlFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, at: Nat,
    target: Callbacks.Target, action: Callbacks.Control, result: Callbacks.Applicability, scheduled: List<&2,Callbacks.Scheduled>}
  LifecycleFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, result: List<&2,Engine.LifecycleTransition>, partition: Nat, action: Lifecycle.Action}
  SourceScheduled{at: Nat, event: Canonical.CanonicalEvent}
  FuelExhausted{}
  UnexpectedCoreNil{}

type Runtime is Data:
  Runtime{state: List<&2,Types.State>, queue: Minimal.Queue, issued: Nat, frames: List<&2, Frame>}

def declared(result: Engine.AdviceeDeclared) -> Types.State:
  match result:
    case Engine.AdviceeDeclared{state, _, _}: state

def initial() -> Runtime:
  Runtime{[declared(Engine.declare_advicee(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),7n,11n))],
    Minimal.Queue{[Minimal.Item{0n,0n,Minimal.Edit{}}],1n,0n},0n,[]}

# The late-PRE original includes a labelled quiet session. Shared Workload
# emits task(0), then edit(1000000); task is metadata-only, as in public Run.
# Its consumed order0 and pending arrival order2 preserve original queue keys.
def labeled_edit(result: Engine.WorkloadTransition) -> Runtime:
  match result:
    case Engine.WorkloadTransition{state,Workload.Emission{at,_,_,_,_,_,_,_,_,_} <> Nil{},True{}}:
      Runtime{[state],Minimal.Queue{[Minimal.Item{0n,1n,Minimal.Edit{}},Minimal.Item{at,2n,Minimal.Edit{}}],3n,0n},0n,[]}
    case Engine.WorkloadTransition{state,_,_}:
      Runtime{[state],Minimal.Queue{[],0n,0n},0n,[UnexpectedCoreNil{}]}

def labeled_task(result: Engine.WorkloadTransition) -> Runtime:
  match result:
    case Engine.WorkloadTransition{state,_,True{}}:
      labeled_edit(Engine.workload_action(state,1n,Workload.Next{}))
    case Engine.WorkloadTransition{state,_,_}:
      Runtime{[state],Minimal.Queue{[],0n,0n},0n,[UnexpectedCoreNil{}]}

def initial_labeled() -> Runtime:
  labeled_task(Engine.workload_action(Engine.configure_workload(
    declared(Engine.declare_advicee(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),1n,11n)),1n,
    Workload.Profile{Session.Settings{1000000,0,1000,500,0,300},11,[112],10n,[5n],None{}}),1n,Workload.Next{}))

def event_action(input: Minimal.Input) -> Maybe<&2, Driver.Action>:
  match input:
    case Minimal.Event{action}: Some{action}
    case _: None{}

def issued_state(result: Engine.CallbackIssued) -> Types.State:
  match result:
    case Engine.CallbackIssued{state,_}: state

def issue_owned(owner: Maybe<&2, Callbacks.Owner>, state: Types.State,
    order: Nat, at: Nat, action: Driver.Action) -> Types.State:
  match owner:
    case None{}: state
    case Some{owner}: issued_state(Engine.callback_issue(state,owner,order,at,action))

def issue_action(action: Maybe<&2, Driver.Action>, +state: Types.State,
    order: Nat, at: Nat) -> Types.State:
  match action:
    case None{}: state
    case Some{+action}: issue_owned(Engine.callback_owner(state,Callbacks.event_of(action)),state,order,at,action)

def issue_fresh(fresh: Bool, state: Types.State, input: Minimal.Input,
    order: Nat, at: Nat) -> Types.State:
  match fresh:
    case False{}: state
    case True{}: issue_action(event_action(input),state,order,at)

# Queue payloads are IO storage only. Target identity and applicability are
# derived exclusively from the same Engine callback registry as public Run.
def issue_items(items: List<&2, Minimal.Item>, state: Types.State, +issued: Nat) -> Types.State:
  match items:
    case Nil{}: state
    case Minimal.Item{at,+order,input} <> tail:
      issue_items(tail,issue_fresh(Nat.is_le(issued,order),state,input,order,at),issued)

def capture(runtime: Runtime) -> Runtime:
  match runtime:
    case Runtime{state <> Nil{},Minimal.Queue{+items,+sequence,synced},issued,frames}:
      Runtime{[issue_items(items,state,issued)],Minimal.Queue{items,sequence,synced},sequence,frames}
    case Runtime{core,queue,issued,frames}:
      Runtime{core,queue,issued,List.append(&2,Frame,frames,[UnexpectedCoreNil{}])}

def delivered(input: Minimal.Input, state: Types.State, order: Nat) -> Types.State:
  match input:
    case Minimal.Event{_}: Engine.callback_delivered(state,order)
    case _: state

def append_frame(runtime: Runtime, frame: Frame) -> Runtime:
  match runtime:
    case Runtime{state,queue,issued,frames}:
      Runtime{state,queue,issued,List.append(&2,Frame,frames,[frame])}

def graph_limits() -> Graph.Limits:
  Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n}

def tree_profile() -> TreeFacts.Profile:
  TreeFacts.Profile{2n,2n,1n,1n,0n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n}

def graph_facts(events: List<&2,Graph.GraphEvent>, queue: Minimal.Queue,
    +op: Nat, +now: Nat, +position: Nat, +count: Nat) -> Minimal.Queue:
  match events:
    case Nil{}: queue
    case event <> tail:
      graph_facts(tail,Minimal.append(queue,Nat.add(now,Engine.preparation_fact_time(2n,position,count)),
        Minimal.Fact{op,position,event}),op,now,Nat.add(position,1n),count)

def generated(result: Preparation.Generated, queue: Minimal.Queue, +op: Nat, +now: Nat) -> Minimal.Queue:
  match result:
    case Preparation.Generated{_,+events,_,True{},_,_}:
      Minimal.enqueue([Engine.preparation_completed(1n,1n,1n,op,[5n],2n)],
        graph_facts(events,queue,op,now,0n,List.length(&2,Graph.GraphEvent,events)),now)
    case _: queue

# This is factual preparation adaptation only. All other commands are consumed
# by the existing shared adapter and actual Driver owner.
def command(command: Canonical.Command, +state: Types.State, queue: Minimal.Queue,
    +event: Canonical.CanonicalEvent, +now: Nat, +context: Driver.Context) -> Types.State & Minimal.Queue:
  match command:
    case Canonical.Prepare{+op,_}:
      (state,generated(Engine.generate_tree(17n,op,0n,tree_profile(),graph_limits()),queue,op,now))
    case command: Minimal.command(queue,now,state,event,command,context)

def command_next(pair: Types.State & Minimal.Queue,
    ih: Types.State -> Minimal.Queue -> Types.State & Minimal.Queue) -> Types.State & Minimal.Queue:
  match pair:
    case (state,queue): ih(state,queue)

def commands(list: List<&2,Canonical.Command>, +state: Types.State, queue: Minimal.Queue,
    +event: Canonical.CanonicalEvent, +now: Nat, +context: Driver.Context) -> Types.State & Minimal.Queue:
  match list:
    case Nil{}: (state,queue)
    case head <> tail: command_next(command(head,state,queue,event,now,context),
      next => q => commands(tail,next,q,event,now,context))

def order_member(orders: List<&2,Callbacks.Scheduled>, +order: Nat) -> Bool:
  match orders:
    case Nil{}: False{}
    case Callbacks.Scheduled{_,id,_} <> tail: Nat.is_eq(id,order) || order_member(tail,order)

def history_receipt(frames: List<&2,Frame>, +order: Nat) -> Maybe<&2,Callbacks.Target>:
  match frames:
    case Nil{}: None{}
    case ControlFrame{_,_,_,+target,_,_,orders} <> tail:
      Bool.pick(Maybe<&2,Callbacks.Target>,order_member(orders,order),Some{target},history_receipt(tail,order))
    case _ <> tail: history_receipt(tail,order)

def original_receipt(items: List<&2,Callbacks.Original>, +order: Nat,
    +fallback: Maybe<&2,Callbacks.Target>) -> Maybe<&2,Callbacks.Target>:
  match items:
    case Nil{}: fallback
    case Callbacks.Original{Callbacks.Fact{target,_,_,_},_,id} <> tail:
      Bool.pick(Maybe<&2,Callbacks.Target>,Nat.is_eq(id,order),Some{target},original_receipt(tail,order,fallback))

def canonical_done(pair: Types.State & Minimal.Queue, +before: Types.State,
    +event: Canonical.CanonicalEvent, result: Canonical.Step, +at: Nat, order: Nat,
    issued: Nat, frames: List<&2,Frame>, receipt: Maybe<&2,Callbacks.Target>) -> Runtime:
  match pair:
    case (+after,queue): capture(Runtime{[after],Minimal.enqueue(Engine.after(before,after,event),queue,at),issued,
      List.append(&2,Frame,frames,[CanonicalFrame{[before],[after],at,order,event,[result],receipt}])})

def transitioned(transition: Engine.Transition, before: Types.State,
    +action: Driver.Action, queue: Minimal.Queue, +at: Nat, order: Nat,
    issued: Nat, frames: List<&2,Frame>, receipt: Maybe<&2,Callbacks.Target>) -> Runtime:
  match transition action:
    case Engine.Transition{+state,Canonical.Advanced{+canonical,+list}} Driver.Action{+event,delay,candidate,job,expiry}:
      canonical_done(commands(list,state,queue,event,at,
        Minimal.context(Driver.Action{event,delay,candidate,job,expiry},NativeStep.config(),at)),
        before,event,Canonical.Advanced{canonical,list},at,order,issued,frames,receipt)
    case Engine.Transition{+state,+result} Driver.Action{+event,_,_,_,_}:
      canonical_done((state,queue),before,event,result,at,order,issued,frames,receipt)

def execute(+state: Types.State, action: Driver.Action, queue: Minimal.Queue,
    +at: Nat, order: Nat, issued: Nat, frames: List<&2,Frame>, receipt: Maybe<&2,Callbacks.Target>) -> Runtime:
  match action:
    case Driver.Action{+event,+delay,+candidate,+job,+expiry}:
      +event = Engine.fence(state,event,True{},Minimal.execution_context(event,
        Driver.Action{event,delay,candidate,job,expiry},NativeStep.config(),at))
      transitioned(Engine.step(state,event),state,Driver.Action{event,delay,candidate,job,expiry},queue,at,order,issued,frames,receipt)

def edited(attempt: Engine.EditAttempt, queue: Minimal.Queue, +at: Nat,
    issued: Nat, frames: List<&2,Frame>) -> Runtime:
  match attempt:
    case Engine.EditAttempt{state,Driver.EditPlan{retry,actions}}:
      capture(Runtime{[state],Minimal.edit_retry(retry,Minimal.enqueue(actions,queue,at),at),issued,frames})

def graphed(+result: Types.GraphTransition, before: Types.State, queue: Minimal.Queue,
    +key: Types.GraphKey, +position: Nat, +event: Graph.GraphEvent, at: Nat,
    order: Nat, issued: Nat, frames: List<&2,Frame>) -> Runtime:
  match result:
    case Types.GraphTransition{+state,_,_}:
      Runtime{[state],queue,issued,List.append(&2,Frame,frames,[GraphFrame{[before],[state],at,order,key,position,event,[result]}])}
    case Types.GraphRejected{+state}:
      Runtime{[state],queue,issued,List.append(&2,Frame,frames,[GraphFrame{[before],[state],at,order,key,position,event,[result]}])}

def graph_active(valid: Bool, +state: Types.State, queue: Minimal.Queue,
    +key: Types.GraphKey, +position: Nat, +event: Graph.GraphEvent, at: Nat,
    order: Nat, issued: Nat, frames: List<&2,Frame>) -> Runtime:
  match valid:
    case True{}: graphed(Engine.graph_step(state,key,position,graph_limits(),event),state,queue,key,position,event,at,order,issued,frames)
    case False{}: Runtime{[state],queue,issued,frames}

def interpreted(input: Minimal.Input, +state: Types.State, queue: Minimal.Queue,
    at: Nat, order: Nat, issued: Nat, frames: List<&2,Frame>, receipt: Maybe<&2,Callbacks.Target>) -> Runtime:
  match input:
    case Minimal.Edit{}: edited(Engine.edit_attempt(state,1n,1n),queue,at,issued,frames)
    case Minimal.Event{action}: execute(state,action,queue,at,order,issued,frames,receipt)
    case Minimal.Fact{+operation,+position,+event}:
      +key: Types.GraphKey = Types.GraphKey{1n,1n,1n,operation,0n}
      graph_active(Engine.preparation_active(state,1n,1n,1n,operation),state,queue,key,position,event,at,order,issued,frames)

def taken(taken: Engine.Taken, +items: List<&2,Minimal.Item>, +sequence: Nat,
    issued: Nat, +frames: List<&2,Frame>) -> Runtime:
  match taken:
    case Engine.Taken{+state,Some{Scheduler.Entry{at,+order}}}:
      +input = Minimal.lookup(items,order)
      interpreted(input,delivered(input,state,order),Minimal.Queue{Minimal.remove(items,order),sequence,sequence},at,order,issued,frames,
        original_receipt(Engine.callback_originals(state),order,history_receipt(frames,order)))
    case Engine.Taken{state,None{}}: Runtime{[state],Minimal.Queue{items,sequence,sequence},issued,frames}

def step(runtime: Runtime) -> Runtime:
  match runtime:
    case Runtime{state <> Nil{},Minimal.Queue{+items,+sequence,synced},issued,frames}:
      taken(Engine.take(Minimal.sync(items,state,synced)),items,sequence,issued,frames)
    case Runtime{core,queue,issued,frames}:
      Runtime{core,queue,issued,List.append(&2,Frame,frames,[UnexpectedCoreNil{}])}

def target_kind(target: Callbacks.Target) -> Nat:
  match target:
    case Callbacks.Target{_,Callbacks.JevStarted{_},_}: 1n
    case Callbacks.Target{_,Callbacks.JevSettled{_},_}: 2n
    case Callbacks.Target{_,Callbacks.PreparationCompleted{},_}: 3n
    case _: 0n

def selected(hit: Bool, fact: Callbacks.Fact, tail: Maybe<&2,Callbacks.Fact>) -> Maybe<&2,Callbacks.Fact>:
  match hit:
    case True{}: Some{fact}
    case False{}: tail

def find(originals: List<&2,Callbacks.Original>, +kind: Nat) -> Maybe<&2,Callbacks.Fact>:
  match originals:
    case Nil{}: None{}
    case Callbacks.Original{Callbacks.Fact{+target,at,action,completion},_,_} <> tail:
      selected(Nat.is_eq(target_kind(target),kind),Callbacks.Fact{target,at,action,completion},find(tail,kind))

def receipt(runtime: Runtime, kind: Nat) -> Maybe<&2,Callbacks.Fact>:
  match runtime:
    case Runtime{state <> Nil{},_,_,_}: find(Engine.callback_originals(state),kind)
    case _: None{}

def available(found: Maybe<&2,Callbacks.Fact>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def until_if(found: Bool, runtime: Runtime, ih: Runtime -> Runtime) -> Runtime:
  match found:
    case True{}: runtime
    case False{}: ih(step(runtime))

def until(fuel: Nat, +runtime: Runtime, +kind: Nat) -> Runtime:
  match fuel:
    case 0n: append_frame(runtime,FuelExhausted{})
    case 1n+rest: until_if(available(receipt(runtime,kind)),runtime,next => until(rest,next,kind))

def canceled(orders: List<&2,Nat>, state: Types.State, items: List<&2,Minimal.Item>) -> Types.State & List<&2,Minimal.Item>:
  match orders:
    case Nil{}: (state,items)
    case +order <> tail: canceled(tail,Engine.cancel(state,order),Minimal.remove(items,order))

def scheduled(entries: List<&2,Callbacks.Scheduled>, queue: Minimal.Queue) -> Minimal.Queue:
  match entries queue:
    case Nil{} queue: queue
    case Callbacks.Scheduled{at,+order,action} <> tail Minimal.Queue{items,+sequence,synced}:
      scheduled(tail,Minimal.Queue{List.append(&2,Minimal.Item,items,[Minimal.Item{at,order,Minimal.Event{action}}]),Bool.pick(Nat,Nat.is_le(sequence,order),Nat.add(order,1n),sequence),synced})

def rescheduled(queue: Minimal.Queue, state: Types.State, frames: List<&2,Frame>) -> Runtime:
  match queue:
    case Minimal.Queue{items,+sequence,synced}: Runtime{[state],Minimal.Queue{items,sequence,synced},sequence,frames}

def controlled_pair(pair: Types.State & List<&2,Minimal.Item>, +entries: List<&2,Callbacks.Scheduled>,
    +before: Types.State, +target: Callbacks.Target, action: Callbacks.Control,
    result: Callbacks.Applicability, at: Nat, sequence: Nat, synced: Nat,
    frames: List<&2,Frame>) -> Runtime:
  match pair:
    case (+state,items):
      # Rescheduled actions retain the original issuance; do not mint receipts.
      rescheduled(scheduled(entries,Minimal.Queue{items,sequence,synced}),state,
        List.append(&2,Frame,frames,[ControlFrame{[before],[state],at,target,action,result,entries}]))

def controlled(transition: Engine.CallbackTransition, before: Types.State,
    target: Callbacks.Target, action: Callbacks.Control, at: Nat, queue: Minimal.Queue,
    frames: List<&2,Frame>) -> Runtime:
  match transition queue:
    case Engine.CallbackTransition{state,result,cancel,entries} Minimal.Queue{items,sequence,synced}:
      controlled_pair(canceled(cancel,state,items),entries,before,target,action,result,at,sequence,synced,frames)

def sequence(queue: Minimal.Queue) -> Nat:
  match queue:
    case Minimal.Queue{_,sequence,_}: sequence

def control(runtime: Runtime, +target: Callbacks.Target, +action: Callbacks.Control,
    fact: Maybe<&2,Callbacks.Fact>) -> Runtime:
  match runtime:
    case Runtime{+state <> Nil{},+queue,_,frames}:
      controlled(Engine.callback_action(state,target,action,fact,Engine.clock(state),sequence(queue)),state,
        target,action,Engine.clock(state),queue,frames)
    case Runtime{core,queue,issued,frames}:
      Runtime{core,queue,issued,List.append(&2,Frame,frames,[UnexpectedCoreNil{}])}

def departed_actions(result: Engine.IssuedActions, queue: Minimal.Queue, issued: Nat,
    frames: List<&2,Frame>, now: Nat) -> Runtime:
  match result:
    case Engine.IssuedActions{state,actions}: capture(Runtime{[state],Minimal.enqueue(actions,queue,now),issued,frames})

def departed(+result: Engine.LifecycleTransition, +before: Types.State, queue: Minimal.Queue,
    issued: Nat, frames: List<&2,Frame>, now: Nat) -> Runtime:
  match result:
    case Engine.LifecycleTransition{+state,_,Cleanup.CleanupPlan{actions,_,_},_}:
      departed_actions(Engine.issue_actions(state,actions),queue,issued,
        List.append(&2,Frame,frames,[LifecycleFrame{[before],[state],[result],1n,Lifecycle.Disconnect{}}]),now)

def depart(runtime: Runtime) -> Runtime:
  match runtime:
    case Runtime{+state <> Nil{},queue,issued,frames}:
      departed(Engine.lifecycle_action(state,1n,Lifecycle.Disconnect{}),state,queue,issued,frames,Engine.clock(state))
    case Runtime{core,queue,issued,frames}:
      Runtime{core,queue,issued,List.append(&2,Frame,frames,[UnexpectedCoreNil{}])}
