import Base
import ./jev-recovery.bend as Scenario
import ./minimal-scenario.bend as Minimal
import ./jev-native-step.bend as Step
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Driver.bend as Driver
import ../CredentialFacts.bend as Credentials
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger

# Original unavailable script: control before edit0; restore after operation3
# releases at2; fresh edit11. Each edge input returns its actual Engine state
# and projected rows, avoiding higher-order continuation specialization inside
# the command driver. Commands and lifecycle decisions remain shared Engine code.
type Advance is Data:
  Advance{step: Step.NativeStep, more: Bool}

def restored(pair: Types.State & Minimal.Queue, rows: List<&2,List<&2,Nat>>) -> Step.NativeStep:
  match pair:
    case (state,queue): Step.NativeStep{state,queue,rows}

def boundary(input: Minimal.Input, step: Step.NativeStep, +now: Nat) -> Step.NativeStep:
  match input step:
    case Minimal.Event{Driver.Action{Canonical.DispatchSettled{_,_,_,3n},_,_,_,_}} Step.NativeStep{+state,queue,rows}:
      restored(Scenario.credential_control(state,queue,now,2n),List.append(&2,List<&2,Nat>,rows,[Scenario.credential_report(state,now,2n)]))
    case Minimal.Event{Driver.Action{Canonical.JevRequestStarted{_,_,_,+operation,_},_,_,_,_}} Step.NativeStep{+state,queue,rows}:
      Step.NativeStep{state,queue,List.append(&2,List<&2,Nat>,rows,[[35n,now,operation,Scenario.captured(Credentials.captured(Engine.credentials(state),operation))]])}
    case _ step: step

def scripted(+input: Minimal.Input, state: Types.State, queue: Minimal.Queue, +now: Nat) -> Step.NativeStep:
  boundary(input,Step.interpreted(input,state,queue,now),now)

def endpoint(+state: Types.State, queue: Minimal.Queue) -> Advance:
  Advance{Step.NativeStep{state,queue,[Scenario.credential_snapshot(state,33n,Engine.clock(state))]},False{}}

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
    case Advance{Step.NativeStep{state,queue,rows},True{}}: List.append(&2,List<&2,Nat>,rows,ih((state,queue)))
    case Advance{Step.NativeStep{_,_,rows},False{}}: rows

def loop(fuel: Nat, pair: Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>:
  match fuel:
    case 0n: [[99n]]
    case 1n+rest: resumed(next(pair),pair => loop(rest,pair))

def initial(+state: Types.State, queue: Minimal.Queue) -> List<&2,List<&2,Nat>>:
  Scenario.credential_report(state,0n,1n) <> loop(200n,Scenario.credential_control(state,queue,0n,1n))

def scenario() -> List<&2,List<&2,Nat>>:
  initial(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),Minimal.append(Minimal.initial_queue(1n),11n,Minimal.Edit{}))
