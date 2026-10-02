import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Workload.bend as Workload
import ../Scheduler.bend as Scheduler
import ../../session-bend/Session.bend as Session
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/Canonical.bend as Canonical
import ./minimal-scenario.bend as Minimal

# Original session config creates arrivals. Existing finite graph facts are an
# edge fixture; all command interpretation and event scheduling use the owner.
def profile() -> Workload.Profile:
  Workload.Profile{Session.Settings{10, 0, 1, 100, 0, 20}, 7,
    [119, 114, 105, 116, 101, 114], 10n, [5n], None{}}

def clocked(taken: Engine.Taken) -> Types.State:
  match taken:
    case Engine.Taken{state, _}: state

def at(state: Types.State, time: Nat, order: Nat) -> Types.State:
  clocked(Engine.take(Engine.enqueue(state, time, order)))

def next(state_queue: Types.State & Minimal.Queue,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match state_queue:
    case (state, Minimal.Queue{+items, sequence, synced}):
      +state = Minimal.sync(items, state, synced)
      take_if(Engine.queued(state), state, items, sequence, ih)

def take_if(entries: List<&2, Scheduler.Entry>, state: Types.State,
    items: List<&2, Minimal.Item>, sequence: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match entries:
    case Scheduler.Entry{at, _} <> _: take_bounded(Nat.is_le(at, 20n), state, items, sequence, ih)
    case Nil{}: []

def take_bounded(valid: Bool, state: Types.State, items: List<&2, Minimal.Item>, sequence: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match valid:
    case False{}: []
    case True{}: Minimal.taken(Engine.take(state), items, sequence,
      Minimal.Config{Canonical.RequestClear{}, True{}, True{}, True{}, True{}, 1n}, ih)

def loop(fuel: Nat, state_queue: Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>:
  match fuel:
    case 0n: [[98n]]
    case 1n+rest: next(state_queue, pair => loop(rest, pair))

def arrival(events: List<&2, Workload.Emission>, state: Types.State) -> List<&2, List<&2, Nat>>:
  match events:
    case Workload.Emission{time, _, _, 1, _, _, _, _, _, _} <> Nil{}:
      suspend(Engine.workload_action(at(state, time, 1001n), 1n,
        Workload.Controlled{Workload.Suspend{True{}}}), time)
    case _: [[97n]]

def suspend(transition: Engine.WorkloadTransition, time: Nat) -> List<&2, List<&2, Nat>>:
  match transition:
    case Engine.WorkloadTransition{state, Nil{}, True{}}:
      loop(100n, (state, Minimal.Queue{[Minimal.Item{time, 0n, Minimal.Edit{}}], 1n, 0n}))
    case _: [[97n]]

def edited(transition: Engine.WorkloadTransition) -> List<&2, List<&2, Nat>>:
  match transition:
    case Engine.WorkloadTransition{state, events, True{}}: arrival(events, state)
    case _: [[97n]]

def tasked(transition: Engine.WorkloadTransition) -> List<&2, List<&2, Nat>>:
  match transition:
    case Engine.WorkloadTransition{state, Workload.Emission{time, _, _, 0, _, _, _, _, _, _} <> Nil{}, True{}}:
      edited(Engine.workload_action(at(state, time, 1000n), 1n, Workload.Next{}))
    case _: [[97n]]

def trace() -> List<&2, List<&2, Nat>>:
  tasked(Engine.workload_action(
    Engine.configure_workload(Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}),
      1n, profile()), 1n, Workload.Next{}))

def timing(value: Workload.PreTiming) -> List<&2, Nat>:
  match value:
    case Workload.PreTiming{started, deadline, post, duration, valid}:
      [started, deadline, post, duration, Bool.pick(Nat, valid, 1n, 0n)]

def duration_state(duration: Nat, time: Nat) -> Types.State:
  at(Engine.configure_workload(Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}),
    1n, Workload.Profile{Session.Settings{10, 0, 1, 100, 0, 20}, 7,
      [119, 114, 105, 116, 101, 114], 10n, [5n], Some{duration}}), time, 1000n)

def captured(duration: Nat, time: Nat) -> List<&2, Nat>:
  timing(Engine.pre_timing(duration_state(duration, time), 1n, None{}, 30n, 10n))

def changed_duration(transition: Engine.WorkloadTransition) -> List<&2, Nat>:
  match transition:
    case Engine.WorkloadTransition{state, Nil{}, True{}}:
      timing(Engine.pre_timing(state, 1n, None{}, 30n, 10n))
    case _: [97n]

def timings() -> List<&2, List<&2, Nat>>:
  [captured(9n, 10n), captured(10n, 10n), captured(11n, 10n),
   changed_duration(Engine.workload_action(duration_state(11n, 10n), 1n,
     Workload.Controlled{Workload.Duration{0n}})),
   captured(9n, Nat.add(U32.to_nat(4294967295), 18n))]

def main() -> IO(Unit):
  IO.print(String.append("[", String.append(Minimal.bracket(Minimal.show_rows(trace())),
    String.append(",", String.append(Minimal.bracket(Minimal.show_rows(timings())), "]")))))
