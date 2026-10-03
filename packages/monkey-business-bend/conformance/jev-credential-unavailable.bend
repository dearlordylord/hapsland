import Base
import ./jev-recovery.bend as Scenario
import ./minimal-scenario.bend as Minimal
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Driver.bend as Driver
import ../CredentialFacts.bend as Credentials
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/ImportGraph.bend as Graph

# Original unavailable script: control before edit0; restore after operation3
# releases at2; fresh edit11. Each edge input returns its actual Engine state
# and projected rows, avoiding higher-order continuation specialization inside
# the command driver. Commands and lifecycle decisions remain shared Engine code.
type NativeStep is Data:
  NativeStep{state: Types.State, queue: Minimal.Queue, rows: List<&2,List<&2,Nat>>}

type Advance is Data:
  Advance{step: NativeStep, more: Bool}

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

def restored(pair: Types.State & Minimal.Queue, rows: List<&2,List<&2,Nat>>) -> NativeStep:
  match pair:
    case (state,queue): NativeStep{state,queue,rows}

def boundary(input: Minimal.Input, step: NativeStep, +now: Nat) -> NativeStep:
  match input step:
    case Minimal.Event{Driver.Action{Canonical.DispatchSettled{_,_,_,3n},_,_,_,_}} NativeStep{+state,queue,rows}:
      restored(Scenario.credential_control(state,queue,now,2n),List.append(&2,List<&2,Nat>,rows,[Scenario.credential_report(state,now,2n)]))
    case Minimal.Event{Driver.Action{Canonical.JevRequestStarted{_,_,_,+operation,_},_,_,_,_}} NativeStep{+state,queue,rows}:
      NativeStep{state,queue,List.append(&2,List<&2,Nat>,rows,[[35n,now,operation,Scenario.captured(Credentials.captured(Engine.credentials(state),operation))]])}
    case _ step: step

def scripted(+input: Minimal.Input, state: Types.State, queue: Minimal.Queue, +now: Nat) -> NativeStep:
  boundary(input,interpreted(input,state,queue,now),now)

def endpoint(+state: Types.State, queue: Minimal.Queue) -> Advance:
  Advance{NativeStep{state,queue,[Scenario.credential_snapshot(state,33n,Engine.clock(state))]},False{}}

def taken(taken: Engine.Taken, +items: List<&2,Minimal.Item>, +sequence: Nat) -> Advance:
  match taken:
    case Engine.Taken{state,Some{Scheduler.Entry{at,+order}}}:
      Advance{scripted(Minimal.lookup(items,order),state,Minimal.Queue{Minimal.remove(items,order),sequence,sequence},at),True{}}
    case Engine.Taken{state,None{}}: endpoint(state,Minimal.Queue{items,sequence,sequence})

def bounded(allowed: Bool, state: Types.State, queue: Minimal.Queue) -> Advance:
  match allowed queue:
    case True{} Minimal.Queue{items,sequence,_}: taken(Engine.take(state),items,sequence)
    case False{} _: endpoint(state,queue)

def selected(entries: List<&2,Scheduler.Entry>, state: Types.State, queue: Minimal.Queue) -> Advance:
  match entries:
    case Nil{}: endpoint(state,queue)
    case Scheduler.Entry{at,_} <> _: bounded(Nat.is_le(at,20n),state,queue)

def next(pair: Types.State & Minimal.Queue) -> Advance:
  match pair:
    case (state,Minimal.Queue{+items,+sequence,synced}):
      +state = Minimal.sync(items,state,synced)
      selected(Engine.queued(state),state,Minimal.Queue{items,sequence,sequence})

def resumed(advance: Advance, ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match advance:
    case Advance{NativeStep{state,queue,rows},True{}}: List.append(&2,List<&2,Nat>,rows,ih((state,queue)))
    case Advance{NativeStep{_,_,rows},False{}}: rows

def loop(fuel: Nat, pair: Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>:
  match fuel:
    case 0n: [[99n]]
    case 1n+rest: resumed(next(pair),pair => loop(rest,pair))

def initial(+state: Types.State, queue: Minimal.Queue) -> List<&2,List<&2,Nat>>:
  Scenario.credential_report(state,0n,1n) <> loop(200n,Scenario.credential_control(state,queue,0n,1n))

def scenario() -> List<&2,List<&2,Nat>>:
  initial(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),Minimal.append(Minimal.initial_queue(1n),11n,Minimal.Edit{}))
