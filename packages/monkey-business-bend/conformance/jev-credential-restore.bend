import Base
import ./jev-recovery.bend as Scenario
import ./minimal-scenario.bend as Minimal
import ./jev-native-step.bend as Step
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger

# One original credential script, with only its own two control boundaries
# reachable from the native entrypoint. All transitions use Minimal/Engine.
def controlled(pair: Types.State & Minimal.Queue, +now: Nat, +action: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair:
    case (+state,queue): Scenario.credential_report(state,now,action) <> ih(Scenario.credential_control(state,queue,now,action))

def input(+input: Minimal.Input, state: Types.State, queue: Minimal.Queue, +now: Nat, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match input stage:
    case Minimal.Event{Driver.Action{Canonical.JevRequestSettled{_,_,_,3n,_,_,_},_,_,_,_}} 0n:
      Step.resume(Step.interpreted(input,state,queue,now),pair => controlled(pair,now,1n,pair => ih((pair,1n))))
    case _ _:
      Step.resume(Step.interpreted(input,state,queue,now),pair => ih((pair,stage)))

def endpoint(pair: Types.State & Minimal.Queue, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair stage:
    case (+state,queue) 1n: controlled((state,queue),Engine.clock(state),2n,pair => ih((pair,2n)))
    case (+state,_) _: [Scenario.credential_snapshot(state,33n,Engine.clock(state))]

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
    case 1n: 8n
    case _: 10n

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
  loop(200n,((Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),Minimal.initial_queue(1n)),0n))
