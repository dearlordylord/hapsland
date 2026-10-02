import Base
import ./jev-recovery.bend as Scenario
import ./minimal-scenario.bend as Minimal
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger

# Original unavailable-at-issuance script: unavailable before edit0, restore
# after refused operation3 releases at2, then original fresh edit11. This
# entrypoint cannot reach the separate restore/rotation scripts. All transition
# interpretation remains in the same actual shared Minimal/Engine driver.
def controlled(pair: Types.State & Minimal.Queue, +now: Nat, +action: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair:
    case (+state,queue): Scenario.credential_report(state,now,action) <> ih(Scenario.credential_control(state,queue,now,action))

def input(+input: Minimal.Input, state: Types.State, queue: Minimal.Queue, +now: Nat, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match input stage:
    case Minimal.Event{Driver.Action{Canonical.DispatchSettled{_,_,_,3n},_,_,_,_}} 0n:
      Minimal.input(input,state,queue,now,Scenario.config(Canonical.RequestFinding{},now),pair => controlled(pair,now,2n,pair => ih((pair,1n))))
    case Minimal.Event{Driver.Action{Canonical.JevRequestStarted{_,_,_,+operation,_},_,_,_,_}} _:
      Minimal.input(input,state,queue,now,Scenario.config(Canonical.RequestFinding{},now),pair => Scenario.credential_live(pair,operation,now,pair => ih((pair,stage))))
    case _ _:
      Minimal.input(input,state,queue,now,Scenario.config(Canonical.RequestFinding{},now),pair => ih((pair,stage)))

def endpoint(pair: Types.State & Minimal.Queue, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair:
    case (+state,_): [Scenario.credential_snapshot(state,33n,Engine.clock(state))]

def taken(taken: Engine.Taken, +items: List<&2,Minimal.Item>, +sequence: Nat, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match taken:
    case Engine.Taken{state,Some{Scheduler.Entry{at,+order}}}: input(Minimal.lookup(items,order),state,Minimal.Queue{Minimal.remove(items,order),sequence,sequence},at,stage,ih)
    case Engine.Taken{state,None{}}: endpoint((state,Minimal.Queue{items,sequence,sequence}),stage,ih)

def bounded(allowed: Bool, state: Types.State, queue: Minimal.Queue, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match allowed queue:
    case True{} Minimal.Queue{items,sequence,_}: taken(Engine.take(state),items,sequence,stage,ih)
    case False{} _: endpoint((state,queue),stage,ih)

def limit(stage: Nat) -> Nat:
  match stage:
    case _: 20n

def selected(entries: List<&2,Scheduler.Entry>, state: Types.State, queue: Minimal.Queue, +stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match entries:
    case Nil{}: endpoint((state,queue),stage,ih)
    case Scheduler.Entry{at,_} <> _: bounded(Nat.is_le(at,limit(stage)),state,queue,stage,ih)

def next(pair: (Types.State & Minimal.Queue) & Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair:
    case ((state,Minimal.Queue{+items,+sequence,synced}),stage):
      +state = Minimal.sync(items,state,synced)
      selected(Engine.queued(state),state,Minimal.Queue{items,sequence,sequence},stage,ih)

def loop(fuel: Nat, pair: (Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>:
  match fuel:
    case 0n: [[99n]]
    case 1n+rest: next(pair,pair => loop(rest,pair))

def scenario() -> List<&2,List<&2,Nat>>:
  controlled((Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),Minimal.append(Minimal.initial_queue(1n),11n,Minimal.Edit{})),0n,1n,pair => loop(200n,(pair,0n)))
