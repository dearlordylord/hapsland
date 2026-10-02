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

# Original unavailable script: control before edit0; restore after operation3
# releases at2; fresh edit11. The original script contains exactly one physical
# DispatchSettled for operation3, so no scenario-mode/stage continuation is
# threaded through the shared driver. This fixture adds no product policy.
def restored(pair: Types.State & Minimal.Queue, +now: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair:
    case (+state,queue): Scenario.credential_report(state,now,2n) <> ih(Scenario.credential_control(state,queue,now,2n))

def live(pair: Types.State & Minimal.Queue, +operation: Nat, now: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair:
    case (+state,queue): [35n,now,operation,Scenario.captured(Credentials.captured(Engine.credentials(state),operation))] <> ih((state,queue))

def input(+input: Minimal.Input, state: Types.State, queue: Minimal.Queue, +now: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match input:
    case Minimal.Event{Driver.Action{Canonical.DispatchSettled{_,_,_,3n},_,_,_,_}}:
      Minimal.input(input,state,queue,now,Minimal.Config{Canonical.RequestFinding{},True{},True{},True{},True{},1n},pair => restored(pair,now,ih))
    case Minimal.Event{Driver.Action{Canonical.JevRequestStarted{_,_,_,operation,_},_,_,_,_}}:
      Minimal.input(input,state,queue,now,Minimal.Config{Canonical.RequestFinding{},True{},True{},True{},True{},1n},pair => live(pair,operation,now,ih))
    case _:
      Minimal.input(input,state,queue,now,Minimal.Config{Canonical.RequestFinding{},True{},True{},True{},True{},1n},ih)

def endpoint(pair: Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>:
  match pair:
    case (+state,_): [Scenario.credential_snapshot(state,33n,Engine.clock(state))]

def taken(taken: Engine.Taken, +items: List<&2,Minimal.Item>, +sequence: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match taken:
    case Engine.Taken{state,Some{Scheduler.Entry{at,+order}}}: input(Minimal.lookup(items,order),state,Minimal.Queue{Minimal.remove(items,order),sequence,sequence},at,ih)
    case Engine.Taken{state,None{}}: endpoint((state,Minimal.Queue{items,sequence,sequence}))

def bounded(allowed: Bool, state: Types.State, queue: Minimal.Queue,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match allowed queue:
    case True{} Minimal.Queue{items,sequence,_}: taken(Engine.take(state),items,sequence,ih)
    case False{} _: endpoint((state,queue))

def selected(entries: List<&2,Scheduler.Entry>, state: Types.State, queue: Minimal.Queue,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match entries:
    case Nil{}: endpoint((state,queue))
    case Scheduler.Entry{at,_} <> _: bounded(Nat.is_le(at,20n),state,queue,ih)

def next(pair: Types.State & Minimal.Queue,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair:
    case (state,Minimal.Queue{+items,+sequence,synced}):
      +state = Minimal.sync(items,state,synced)
      selected(Engine.queued(state),state,Minimal.Queue{items,sequence,sequence},ih)

def loop(fuel: Nat, pair: Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>:
  match fuel:
    case 0n: [[99n]]
    case 1n+rest: next(pair,pair => loop(rest,pair))

def initial(+state: Types.State, queue: Minimal.Queue) -> List<&2,List<&2,Nat>>:
  Scenario.credential_report(state,0n,1n) <> loop(200n,Scenario.credential_control(state,queue,0n,1n))

def scenario() -> List<&2,List<&2,Nat>>:
  initial(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),Minimal.append(Minimal.initial_queue(1n),11n,Minimal.Edit{}))
