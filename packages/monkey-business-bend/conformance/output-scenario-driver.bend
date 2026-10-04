import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../OutputScenario.bend as Output
import ../Callbacks.bend as Callbacks
import ../Scheduler.bend as Scheduler
import ../Workload.bend as Workload
import ../Session.bend as Session
import ../TreeFacts.bend as TreeFacts
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Ledger.bend as Ledger
import ./advicee-lifecycle-driver.bend as Edge
import ./callback-native-driver.bend as Receipts
import ./sharing-observed-transport.bend as Transport

# Full original-input evidence through the actual shared issuer, intervention,
# scheduler and delivery owner. The edge supplies facts, never output policy.
type Frame is Data:
  Observed{frame: Edge.ObservedFrame, receipt: Maybe<&2,Callbacks.Fact>, command_scopes: List<&2,Maybe<&2,Nat>>}
  OutcomeControl{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    target: Callbacks.Target, outcome: Output.Outcome, result: Callbacks.Applicability,
    schedule: List<&2,Callbacks.Scheduled>}
  CallbackControl{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    target: Callbacks.Target, action: Callbacks.Control, result: Callbacks.Applicability,
    schedule: List<&2,Callbacks.Scheduled>}
  InvalidTransport{}
type Trace is Data:
  Trace{frames: List<&2,Frame>, endpoint: List<&2,Types.State>, valid: Bool}
type Envelope is Data:
  Envelope{traces: List<&2,Trace>}
type Runtime is Data:
  Runtime{runtime: List<&2,Edge.Runtime>, issued: Nat, frames: List<&2,Frame>, valid: Bool}
type Facts is Data:
  Facts{cutoff: Nat, frames: List<&2,Frame>, outcome: Output.Outcome, delay: Nat, lease: Nat}
type Issued is Data:
  Issued{state: Types.State, receipt: Maybe<&2,Callbacks.Fact>}

def capture_attempt(event: C.CanonicalEvent, now: Nat, delay: Nat, lease: Nat) -> Maybe<&2,Output.Capture>:
  match event:
    case C.SubmissionTerminal{advice,token,_}:
      Some{Output.Capture{Output.Individual{advice,token},now,Output.Certain{},delay,lease}}
    case C.SubmissionExpiryCheck{advice,token,_,_}:
      Some{Output.Capture{Output.Individual{advice,token},now,Output.Certain{},delay,lease}}
    case C.FinishTerminal{group,round,attempt,token,selected,_}:
      Some{Output.Capture{Output.Finish{group,round,attempt,token,selected},now,Output.Certain{},delay,lease}}
    case _: None{}

def issued(result: Engine.CallbackIssued) -> Issued:
  match result:
    case Engine.CallbackIssued{state,receipt}: Issued{state,receipt}

def issued_owned(owner: Maybe<&2,Callbacks.Owner>, state: Types.State, order: Nat, at: Nat,
    action: Driver.Action, capture: Output.Capture) -> Issued:
  match owner:
    case Some{owner}: issued(Engine.callback_issue_output(state,owner,order,at,action,capture))
    case None{}: Issued{state,None{}}

# These three event kinds receive environmental receipts only inside the
# actual authorization command hook. Their other producer is CanonicalFeedback,
# which has no new environmental completion or issuance authority.
def issue_uncaptured(+action: Driver.Action, state: Types.State, order: Nat, at: Nat) -> Issued:
  match action:
    case Driver.Action{C.SubmissionTerminal{_,_,_},_,_,_,_}: Issued{state,None{}}
    case Driver.Action{C.SubmissionExpiryCheck{_,_,_,_},_,_,_,_}: Issued{state,None{}}
    case Driver.Action{C.FinishTerminal{_,_,_,_,_,_},_,_,_,_}: Issued{state,None{}}
    case _: Issued{Receipts.issue_action(Some{action},state,order,at),None{}}

def authorized_capture(allowed: Bool, event: C.CanonicalEvent, now: Nat, delay: Nat, lease: Nat) -> Maybe<&2,Output.Capture>:
  match allowed:
    case True{}: capture_attempt(event,now,delay,lease)
    case False{}: None{}

def issue_captured(capture: Maybe<&2,Output.Capture>, +state: Types.State, order: Nat, at: Nat,
    +action: Driver.Action) -> Issued:
  match capture action:
    case Some{capture} Driver.Action{+event,delay,candidate,job,expiry}:
      issued_owned(Engine.callback_owner(state,event),state,order,at,Driver.Action{event,delay,candidate,job,expiry},capture)
    case None{} action: issue_uncaptured(action,state,order,at)

# Only payload transport changes. Selection, replacement applicability and the
# replacement time/order are supplied by Engine.output_intervene.
def replaced_item(matches: Bool, original: Edge.Item, at: Nat, order: Nat,
    action: Driver.Action, input: Edge.Input) -> Edge.Item:
  match matches input:
    case True{} Edge.Event{_,job,source}: Edge.Item{at,order,Edge.Event{action,job,source}}
    case _ _: original

def replace_item(item: Edge.Item, +order: Nat, at: Nat, action: Driver.Action) -> Edge.Item:
  match item:
    case Edge.Item{old_at,+id,+input}:
      replaced_item(Nat.is_eq(id,order),Edge.Item{old_at,id,input},at,id,action,input)

def replace_items(items: List<&2,Edge.Item>, +order: Nat, +at: Nat, +action: Driver.Action) -> List<&2,Edge.Item>:
  match items:
    case Nil{}: Nil{}
    case item <> tail: replace_item(item,order,at,action) <> replace_items(tail,order,at,action)

def cancel_orders(orders: List<&2,Nat>, state: Types.State) -> Types.State:
  match orders:
    case Nil{}: state
    case order <> tail: cancel_orders(tail,Engine.cancel(state,order))

def schedule_items(schedule: List<&2,Callbacks.Scheduled>, state: Types.State,
    items: List<&2,Edge.Item>) -> Types.State & List<&2,Edge.Item>:
  match schedule:
    case Nil{}: (state,items)
    case Callbacks.Scheduled{+at,+order,action} <> tail:
      schedule_items(tail,Engine.enqueue(state,at,order),replace_items(items,order,at,action))

def controlled_schedule(pair: Types.State & List<&2,Edge.Item>, +sequence: Nat,
    jobs: List<&2,Edge.Stored>, delay: Nat, issued: Nat, frames: List<&2,Frame>, valid: Bool) -> Runtime:
  (state,items)=pair
  Runtime{[Edge.Runtime{state,Edge.Queue{items,sequence,sequence},jobs,delay}],issued,frames,valid}

def outcome_frame(+before: List<&2,Types.State>, after: List<&2,Types.State>, target: Callbacks.Target,
    outcome: Output.Outcome, result: Callbacks.Applicability, schedule: List<&2,Callbacks.Scheduled>) -> Frame:
  match before:
    case state <> Nil{}: OutcomeControl{before,after,Engine.clock(state),target,outcome,result,schedule}
    case _: InvalidTransport{}

def outcome_result(result: List<&2,Engine.OutputIntervention>, +runtime: List<&2,Edge.Runtime>,
    target: Callbacks.Target, outcome: Output.Outcome, issued: Nat, frames: List<&2,Frame>) -> Runtime:
  match result runtime:
    case Engine.OutputIntervention{+state,+result,cancel,+schedule,_} <> Nil{}
        Edge.Runtime{_,Edge.Queue{items,sequence,_},jobs,delay} <> Nil{}:
      controlled_schedule(schedule_items(schedule,cancel_orders(cancel,state),items),sequence,jobs,delay,issued,
        List.append(&2,Frame,frames,[outcome_frame(Edge.runtime_states(runtime),[state],target,outcome,result,schedule)]),True{})
    case _ runtime: Runtime{runtime,issued,List.append(&2,Frame,frames,[InvalidTransport{}]),False{}}

def target_of_fact(fact: Callbacks.Fact) -> Callbacks.Target:
  match fact:
    case Callbacks.Fact{target,_,_,_}: target

def intervention(runtime: List<&2,Edge.Runtime>, target: Callbacks.Target, outcome: Output.Outcome,
    fact: Callbacks.Fact) -> List<&2,Engine.OutputIntervention>:
  match runtime:
    case Edge.Runtime{state,_,_,_} <> Nil{}: [Engine.output_intervene(state,target,outcome,Some{fact})]
    case _: []

def intervene(receipt: Maybe<&2,Callbacks.Fact>, +runtime: List<&2,Edge.Runtime>,
    issued: Nat, frames: List<&2,Frame>, +outcome: Output.Outcome) -> Runtime:
  match receipt:
    case Some{+fact}:
      outcome_result(intervention(runtime,target_of_fact(fact),outcome,fact),runtime,
        target_of_fact(fact),outcome,issued,frames)
    case None{}: Runtime{runtime,issued,frames,Edge.runtime_valid(runtime)}

# New action payloads are already present in Edge.queue. Publish their exact
# scheduler keys before intervention, so replacement cannot invent queue facts.
def issued_item(value: Issued, queue: Edge.Queue, jobs: List<&2,Edge.Stored>, delay: Nat,
    issued: Nat, frames: List<&2,Frame>, outcome: Output.Outcome) -> Runtime:
  match value:
    case Issued{state,receipt}:
      intervene(receipt,Edge.runtime_sync([Edge.Runtime{state,queue,jobs,delay}]),issued,frames,outcome)

# The capture pass processes one original newly appended action at a time;
# factual snapshots never reconstruct membership or callback identities.
def fresh_action(fresh: Bool, +action: Driver.Action, +state: Types.State, order: Nat, at: Nat,
    queue: Edge.Queue, jobs: List<&2,Edge.Stored>, delay: Nat, issued_count: Nat,
    frames: List<&2,Frame>, outcome: Output.Outcome, output_delay: Nat, lease: Nat, allowed: Bool) -> Runtime:
  match fresh action:
    case True{} Driver.Action{+event,d,c,j,e}:
      issued_item(issue_captured(authorized_capture(allowed,event,Engine.clock(state),output_delay,lease),state,order,at,
        Driver.Action{event,d,c,j,e}),queue,jobs,delay,issued_count,frames,outcome)
    case False{} _: Runtime{[Edge.Runtime{state,queue,jobs,delay}],issued_count,frames,True{}}

def fresh_item(item: Edge.Item, +runtime: List<&2,Edge.Runtime>, +issued_count: Nat, frames: List<&2,Frame>,
    outcome: Output.Outcome, output_delay: Nat, lease: Nat, allowed: Bool) -> Runtime:
  match item runtime:
    case Edge.Item{at,+order,Edge.Event{+action,_,_}} Edge.Runtime{+state,queue,jobs,delay} <> Nil{}:
      fresh_action(Nat.is_le(issued_count,order),action,state,order,at,queue,jobs,delay,issued_count,frames,outcome,output_delay,lease,allowed)
    case _ _ <> Nil{}: Runtime{runtime,issued_count,frames,True{}}
    case _ runtime: Runtime{runtime,issued_count,frames,False{}}

def captured_finished(+runtime: List<&2,Edge.Runtime>, frames: List<&2,Frame>) -> Runtime:
  match runtime:
    case Edge.Runtime{_,Edge.Queue{_,sequence,_},_,_} <> Nil{}:
      Runtime{runtime,sequence,frames,True{}}
    case runtime: Runtime{runtime,0n,frames,False{}}

def captured_tail(result: Runtime, ih: List<&2,Edge.Runtime> -> List<&2,Frame> -> Runtime) -> Runtime:
  match result:
    case Runtime{runtime,_,frames,True{}}: ih(runtime,frames)
    case _: result

def capture_items(items: List<&2,Edge.Item>, runtime: List<&2,Edge.Runtime>, +cutoff: Nat, frames: List<&2,Frame>,
    +outcome: Output.Outcome, +delay: Nat, +lease: Nat, +allowed: Bool) -> Runtime:
  match items:
    case Nil{}: captured_finished(runtime,frames)
    case item <> tail: captured_tail(fresh_item(item,runtime,cutoff,frames,outcome,delay,lease,allowed),next => frames => capture_items(tail,next,cutoff,frames,outcome,delay,lease,allowed))

def receipt_match(found: Bool, fact: Callbacks.Fact, rest: Maybe<&2,Callbacks.Fact>) -> Maybe<&2,Callbacks.Fact>:
  match found:
    case True{}: Some{fact}
    case False{}: rest

def selected_receipt(originals: List<&2,Callbacks.Original>, +order: Nat) -> Maybe<&2,Callbacks.Fact>:
  match originals:
    case Nil{}: None{}
    case Callbacks.Original{fact,Callbacks.Queued{},id} <> tail:
      receipt_match(Nat.is_eq(id,order),fact,selected_receipt(tail,order))
    case _ <> tail: selected_receipt(tail,order)

def frame_scopes(frame: Edge.ObservedFrame) -> List<&2,Maybe<&2,Nat>>:
  match frame:
    case Edge.CanonicalFrame{_,_,_,_,_,_,_,_,_,scopes,_,_}: scopes
    case _: Nil{}

def observed_frame(+runtime: List<&2,Edge.Runtime>, frame: Maybe<&2,Edge.ObservedFrame>,
    receipt: Maybe<&2,Callbacks.Fact>, issued: Nat, frames: List<&2,Frame>) -> Runtime:
  match frame:
    case Some{Edge.UnexpectedInput{}}: Runtime{runtime,issued,List.append(&2,Frame,frames,[InvalidTransport{}]),False{}}
    case Some{+frame}: Runtime{runtime,issued,List.append(&2,Frame,frames,[Observed{frame,receipt,frame_scopes(frame)}]),Edge.runtime_valid(runtime)}
    case None{}: Runtime{runtime,issued,frames,Edge.runtime_valid(runtime)}

def authorized(command: C.Command) -> Bool:
  match command:
    case C.SubmissionAuthorized{}: True{}
    case C.SubmissionBegun{}: True{}
    case _: False{}

def hook_runtime(result: Runtime, facts: Facts,
    ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match result facts:
    case Runtime{runtime,cutoff,frames,True{}} Facts{_,_,outcome,delay,lease}:
      (runtime,ih(Facts{cutoff,frames,outcome,delay,lease}))
    case Runtime{runtime,_,_,_} facts: (runtime,Edge.HookFault{facts})

def hook_command(command: C.Command, +runtime: List<&2,Edge.Runtime>, +facts: Facts,
    ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match facts:
    case Facts{cutoff,frames,outcome,delay,lease}:
      hook_runtime(capture_items(Edge.runtime_items(runtime),runtime,cutoff,frames,outcome,delay,lease,authorized(command)),facts,ih)

def hook(commands: List<&2,C.Command>, facts: Facts) -> Edge.CommandHook<Facts>:
  match commands:
    case Nil{}: Edge.HookEnd{facts}
    case _ <> rest: Edge.HookNext{facts,state => event => command => context => Edge.default_handler(state,event,command,context),current => actual => runtime =>
      hook_command(actual,runtime,current,next => hook(rest,next))}

def observed(value: Transport.Stepped<Facts>, previous: Runtime, receipt: Maybe<&2,Callbacks.Fact>) -> Runtime:
  match value previous:
    case Transport.Stepped{Edge.Observed{runtime,frame,Edge.HookEnd{Facts{issued,frames,_,_,_}}},_} Runtime{_,_,_,True{}}:
      observed_frame(runtime,frame,receipt,issued,frames)
    case Transport.Stepped{Edge.Observed{runtime,_,_},_} Runtime{_,issued,frames,_}:
      Runtime{runtime,issued,List.append(&2,Frame,frames,[InvalidTransport{}]),False{}}

def step_receipted(receipt: Maybe<&2,Callbacks.Fact>, runtime: List<&2,Edge.Runtime>,
    environment: Edge.Environment, previous: Runtime, +facts: Facts) -> Runtime:
  observed(Transport.step(Facts,runtime,20n,environment,commands => Edge.transition_hook(Facts,hook(commands,facts))),previous,receipt)

def step_selected(queue: List<&2,Scheduler.Entry>, +runtime: List<&2,Edge.Runtime>, environment: Edge.Environment,
    previous: Runtime, facts: Facts) -> Runtime:
  match queue:
    case Scheduler.Entry{at,+order} <> _:
      step_receipted(selected_receipt(Edge.runtime_originals(runtime),order),runtime,environment,previous,facts)
    case _: previous

def in_horizon(queue: List<&2,Scheduler.Entry>) -> Bool:
  match queue:
    case Scheduler.Entry{at,_} <> _: Nat.is_le(at,20n)
    case Nil{}: False{}

def endpoint(previous: Runtime, states: List<&2,Types.State>) -> Trace:
  match previous:
    case Runtime{_,_,frames,valid}: Trace{frames,states,valid}

def exhausted(previous: Runtime, states: List<&2,Types.State>) -> Trace:
  match previous:
    case Runtime{_,_,frames,_}: Trace{List.append(&2,Frame,frames,[InvalidTransport{}]),states,False{}}

def facts_for(runtime: Runtime, cutoff: Nat, outcome: Output.Outcome, delay: Nat, lease: Nat) -> Facts:
  match runtime:
    case Runtime{_,_,frames,_}: Facts{cutoff,frames,outcome,delay,lease}

def advance_horizon(within: Bool, fuel: Nat, +runtime: List<&2,Edge.Runtime>, +previous: Runtime,
    environment: Edge.Environment, outcome: Output.Outcome, delay: Nat, lease: Nat, ih: Runtime -> Trace) -> Trace:
  match within fuel:
    case False{} _: endpoint(previous,Edge.runtime_states(runtime))
    case True{} 0n: exhausted(previous,Edge.runtime_states(runtime))
    case True{} 1n+rest:
      ih(step_selected(Edge.runtime_entries(runtime),runtime,environment,previous,
        facts_for(previous,Edge.runtime_sequence(runtime),outcome,delay,lease)))

def advance_valid(valid: Bool, +runtime: List<&2,Edge.Runtime>, previous: Runtime,
    fuel: Nat, environment: Edge.Environment, outcome: Output.Outcome, delay: Nat, lease: Nat,
    ih: Runtime -> Trace) -> Trace:
  match valid:
    case True{}:
      advance_horizon(in_horizon(Edge.runtime_entries(runtime)),fuel,runtime,previous,environment,outcome,delay,lease,ih)
    case False{}: exhausted(previous,Edge.runtime_states(runtime))

def advance_synced(+runtime: List<&2,Edge.Runtime>, previous: Runtime, fuel: Nat,
    environment: Edge.Environment, outcome: Output.Outcome, delay: Nat, lease: Nat, ih: Runtime -> Trace) -> Trace:
  advance_valid(Edge.runtime_valid(runtime),runtime,previous,fuel,environment,outcome,delay,lease,ih)

def advance_captured(+captured: Runtime, fuel: Nat, environment: Edge.Environment, outcome: Output.Outcome, delay: Nat, lease: Nat, ih: Runtime -> Trace) -> Trace:
  match captured:
    case Runtime{runtime,_,_,True{}}:
      advance_synced(Edge.runtime_sync(runtime),captured,fuel,environment,outcome,delay,lease,ih)
    case Runtime{runtime,_,frames,_}: Trace{frames,Edge.runtime_states(runtime),False{}}

# The zero-fuel continuation is not invoked by advance_horizon; retain the
# actual endpoint projection and validity of the provided carrier.
def terminal(runtime: Runtime) -> Trace:
  match runtime:
    case Runtime{+runtime,_,frames,valid}:
      Trace{frames,Edge.runtime_states(runtime),Bool.and(valid,Edge.runtime_valid(runtime))}

def advance(fuel: Nat, runtime: Runtime, +environment: Edge.Environment,
    +outcome: Output.Outcome, +delay: Nat, +lease: Nat) -> Trace:
  match fuel runtime:
    case 0n Runtime{+runtime,cutoff,frames,True{}}:
      advance_captured(capture_items(Edge.runtime_items(runtime),runtime,cutoff,frames,outcome,delay,lease,False{}),
        0n,environment,outcome,delay,lease,next => terminal(next))
    case 1n+rest Runtime{+runtime,cutoff,frames,True{}}:
      advance_captured(capture_items(Edge.runtime_items(runtime),runtime,cutoff,frames,outcome,delay,lease,False{}),
        1n,environment,outcome,delay,lease,next => advance(rest,next,environment,outcome,delay,lease))
    case _ Runtime{runtime,_,frames,_}: Trace{frames,Edge.runtime_states(runtime),False{}}

# Exact original public quiet session: root/workload seed7, agent-1,
# defaults100 bytes, task0 before explicit edit0, next edit1000000 retained.
def initial_emitted(result: Engine.WorkloadTransition) -> Runtime:
  match result:
    case Engine.WorkloadTransition{+state,events,True{}}:
      Runtime{[Edge.Runtime{state,Edge.append(Edge.emissions(events,Edge.Queue{[],0n,0n},state),0n,
        Edge.Edit{Edge.Job{1n,1n,10n,[5n],Some{C.RequestFinding{}}}}),[],5n}],0n,[],True{}}
    case Engine.WorkloadTransition{state,_,_}: Runtime{[Edge.Runtime{state,Edge.Queue{[],0n,0n},[],5n}],0n,[InvalidTransport{}],False{}}

def initial() -> Runtime:
  initial_emitted(Engine.workload_action(Engine.configure_workload(
    Edge.declared(Engine.declare_advicee(Engine.configure_seed(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),7n),1n,7)),1n,
    Workload.Profile{Session.Settings{1000000,0,1000,500,0,300},7,[97,103,101,110,116,45,49],100n,[100n],None{}}),1n,Workload.Next{}))

def run(outcome: Output.Outcome, +delay: Nat, +lease: Nat) -> Trace:
  advance(150n,initial(),Edge.Environment{7n,TreeFacts.Profile{1n,1n,0n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n},Edge.graph_limits(),2n,delay,lease,None{},Edge.outcome_environment(None{})},outcome,delay,lease)
