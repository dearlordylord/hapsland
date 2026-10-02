import Base
import ./minimal-scenario.bend as Minimal
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger

# Original source-free script: 24 edits, alternating a selected fault and healthy
# finding every 20 virtual milliseconds. One actual resident state is retained.
# Minimal supplies the same declared graph facts and shared command interpreter;
# this adapter only selects the scripted future outcome at an input boundary.
def edits(count: Nat, +queue: Minimal.Queue, +at: Nat) -> Minimal.Queue:
  match count:
    case 0n: queue
    case 1n+rest: edits(rest, Minimal.append(queue, at, Minimal.Edit{}), Nat.add(at, 20n))

def config(fault: Canonical.RequestOutcome, now: Nat) -> Minimal.Config:
  Minimal.Config{Bool.pick(Canonical.RequestOutcome, Nat.is_eq(Nat.mod(Nat.div(now, 20n), 2n), 0n), fault, Canonical.RequestFinding{}), True{}, True{}, True{}, True{}, 1n}

def taken(taken: Engine.Taken, +items: List<&2, Minimal.Item>, +sequence: Nat, +fault: Canonical.RequestOutcome,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match taken:
    case Engine.Taken{state, Some{Scheduler.Entry{+at, +order}}}:
      Minimal.input(Minimal.lookup(items, order), state, Minimal.Queue{Minimal.remove(items, order), sequence, sequence}, at, config(fault, at), ih)
    case Engine.Taken{_, None{}}: Nil{}

def bounded(in_budget: Bool, state: Types.State, items: List<&2, Minimal.Item>, sequence: Nat, fault: Canonical.RequestOutcome,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match in_budget:
    case False{}: Nil{}
    case True{}: taken(Engine.take(state), items, sequence, fault, ih)

def selected(entries: List<&2, Scheduler.Entry>, state: Types.State, items: List<&2, Minimal.Item>, sequence: Nat, fault: Canonical.RequestOutcome,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match entries:
    case Nil{}: Nil{}
    case Scheduler.Entry{at, _} <> _:
      bounded(Nat.is_le(at, 470n), state, items, sequence, fault, ih)

def next(pair: Types.State & Minimal.Queue, fault: Canonical.RequestOutcome,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match pair:
    case (state, Minimal.Queue{+items, sequence, synced}):
      +state = Minimal.sync(items, state, synced)
      selected(Engine.queued(state), state, items, sequence, fault, ih)

def loop(fuel: Nat, pair: Types.State & Minimal.Queue, +fault: Canonical.RequestOutcome) -> List<&2, List<&2, Nat>>:
  match fuel:
    case 0n: Nil{}
    case 1n+rest: next(pair, fault, pair => loop(rest, pair, fault))

def scenario(fault: Canonical.RequestOutcome) -> List<&2, List<&2, Nat>>:
  loop(1000n, (Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}), edits(24n, Minimal.Queue{Nil{}, 0n, 0n}, 0n)), fault)

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_traces([scenario(Canonical.NeverSent{}), scenario(Canonical.RequestBackendFailure{}), scenario(Canonical.RequestTimeout{}), scenario(Canonical.RequestInterrupted{})])))
