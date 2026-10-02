import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Workload.bend as Workload
import ../Scheduler.bend as Scheduler
import ../Driver.bend as Driver
import ../../session-bend/Session.bend as Session
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Admission.bend as Admission
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

def sum(units: List<&2, Nat>) -> Nat:
  match units:
    case Nil{}: 0n
    case head <> tail: Nat.add(head, sum(tail))

def emissions(events: List<&2, Workload.Emission>) -> List<&2, List<&2, Nat>>:
  match events:
    case Nil{}: []
    case Workload.Emission{at, partition, generation, kind, task, revision, bytes, units, repair, recurring} <> tail:
      [at, partition, generation, U32.to_nat(kind), task, revision, bytes,
        sum(units), Bool.pick(Nat, repair, 1n, 0n), Bool.pick(Nat, recurring, 1n, 0n)] <> emissions(tail)

def action_result(transition: Engine.WorkloadTransition, actions: List<&2, Workload.Action>) -> List<&2, List<&2, Nat>>:
  match transition:
    case Engine.WorkloadTransition{state, events, True{}}:
      List.append(&2, List<&2, Nat>, emissions(events), actions_run(state, actions))
    case _: [[97n]]

def actions_run(state: Types.State, actions: List<&2, Workload.Action>) -> List<&2, List<&2, Nat>>:
  match actions:
    case Nil{}:
      [[80n, Bool.pick(Nat, Engine.workload_valid(state, 1n, 0n, True{}), 1n, 0n),
        Bool.pick(Nat, Engine.workload_valid(state, 1n, 1n, True{}), 1n, 0n),
        Bool.pick(Nat, Engine.workload_valid(state, 1n, 0n, False{}), 1n, 0n)]]
    case action <> tail: action_result(Engine.workload_action(state, 1n, action), tail)

# Supplied finish/advice facts cross the actual owner; no Stop policy is modeled.
def feedback() -> List<&2, List<&2, Nat>>:
  actions_run(at(Engine.configure_workload(Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}),
    1n, Workload.Profile{Session.Settings{10, 0, 1, 100, 3, 20}, 7,
      [119, 114, 105, 116, 101, 114], 10n, [5n], None{}}), 50n, 1000n),
    [Workload.Next{}, Workload.Next{}, Workload.Controlled{Workload.Suspend{True{}}},
     Workload.Advice{}, Workload.Controlled{Workload.Burst{2n}}, Workload.Finished{True{}},
     Workload.Controlled{Workload.Sizes{25n, [7n, 8n]}}, Workload.Controlled{Workload.Burst{1n}}])

def permit_count(admissions: List<&2, Admission.AdmissionState>) -> Nat:
  match admissions:
    case Nil{}: 0n
    case Admission.AdmissionState{_, _, _, _, _, _, permits} <> tail:
      Nat.add(List.length(&2, Admission.Permit, permits), permit_count(tail))

def permit_state(state: Types.State) -> List<&2, Nat>:
  match Engine.canonical(state):
    case Canonical.State{_, rounds, _, _, _, admissions, _, _, _}:
      [permit_count(admissions), List.length(&2, Canonical.Round, rounds)]

def permit_command(command: Canonical.Command) -> Nat:
  match command:
    case Canonical.PermitIssued{_, _}: 1n
    case Canonical.PermitConsumed{_}: 2n
    case Canonical.PermitExpired{}: 3n
    case Canonical.RoundStarted{_}: 4n
    case _: 99n

def permit_codes(commands: List<&2, Canonical.Command>) -> List<&2, Nat>:
  match commands:
    case Nil{}: []
    case head <> tail: permit_command(head) <> permit_codes(tail)

def issued_token(commands: List<&2, Canonical.Command>) -> Nat:
  match commands:
    case Nil{}: 0n
    case Canonical.PermitIssued{token, _} <> _: token
    case _ <> tail: issued_token(tail)

def permit_event(event: Canonical.CanonicalEvent, commands: List<&2, Canonical.Command>) -> List<&2, Nat>:
  match event:
    case Canonical.IssuePermit{_, _, _, _, deadline, _, _, _}: [31n, issued_token(commands), deadline]
    case Canonical.ConsumePermit{_, _, token, _, _}: [32n, token, 0n]
    case Canonical.ExpirePermit{_, _, token, _}: [33n, token, 0n]
    case _: [99n, 0n, 0n]

def permit_follow(event: Canonical.CanonicalEvent, +commands: List<&2, Canonical.Command>,
    +state: Types.State, queue: Minimal.Queue, +duration: Nat, now: Nat) -> Minimal.Queue:
  match event:
    case Canonical.IssuePermit{partition, lifetime, tool, _, deadline, _, _, _}:
      Minimal.handled(queue, now, Engine.permit_actions(state,
        Workload.PermitCapture{partition, lifetime, issued_token(commands), tool, deadline, duration, 0}))
    case _: queue

def control_state(transition: Engine.WorkloadTransition) -> Types.State:
  match transition:
    case Engine.WorkloadTransition{state, _, _}: state

def permit_control(+state: Types.State, event: Canonical.CanonicalEvent) -> Types.State:
  match event:
    case Canonical.IssuePermit{_, _, _, _, _, _, _, _}:
      control_state(Engine.workload_action(control_state(Engine.workload_action(state, 1n,
        Workload.Controlled{Workload.Duration{0n}})), 1n, Workload.Controlled{Workload.Suspend{True{}}}))
    case _: state

def permit_transition(transition: Engine.Transition, +event: Canonical.CanonicalEvent,
    queue: Minimal.Queue, +duration: Nat, +now: Nat, fuel: Nat) -> List<&2, List<&2, Nat>>:
  match transition:
    case Engine.Transition{+state, Canonical.Advanced{_, +commands}}:
      +queue = permit_follow(event, commands, state, queue, duration, now)
      List.append(&2, Nat, [now], List.append(&2, Nat, permit_event(event, commands),
        List.append(&2, Nat, permit_state(state), 0n <> permit_codes(commands)))) <>
        permit_loop(fuel, permit_control(state, event), queue, duration)
    case Engine.Transition{+state, Canonical.Rejected{_, _}}:
      List.append(&2, Nat, [now], List.append(&2, Nat, permit_event(event, []),
        List.append(&2, Nat, permit_state(state), [1n]))) <> permit_loop(fuel, state, queue, duration)

def permit_taken(taken: Engine.Taken, +items: List<&2, Minimal.Item>, +sequence: Nat,
    duration: Nat, fuel: Nat) -> List<&2, List<&2, Nat>>:
  match taken:
    case Engine.Taken{+state, Some{Scheduler.Entry{+now, +order}}}:
      match Minimal.lookup(items, order):
        case Minimal.Event{Driver.Action{+event, _, _, _, _}}:
          permit_transition(Engine.step(state, event), event,
            Minimal.Queue{Minimal.remove(items, order), sequence, sequence}, duration, now, fuel)
        case _: [[97n]]
    case Engine.Taken{_, None{}}: []

def permit_loop(fuel: Nat, state: Types.State, queue: Minimal.Queue, duration: Nat) -> List<&2, List<&2, Nat>>:
  match fuel queue:
    case 0n _: [[98n]]
    case 1n+rest Minimal.Queue{+items, sequence, synced}:
      permit_taken(Engine.take(Minimal.sync(items, state, synced)), items, sequence, duration, rest)

def permit_scenario(+duration: Nat) -> List<&2, List<&2, Nat>>:
  +state = duration_state(duration, 10n)
  permit_loop(10n, state, Minimal.handled(Minimal.Queue{[], 0n, 0n}, 10n,
    Engine.pre_issue(state, Workload.PermitFacts{1n, 1n, 1n, None{}, 1n, 10n, 2n, 2n})), duration)

def permits() -> List<&2, List<&2, List<&2, Nat>>>:
  [permit_scenario(9n), permit_scenario(10n), permit_scenario(11n)]

def main() -> IO(Unit):
  IO.print(String.append("[", String.append(Minimal.bracket(Minimal.show_rows(trace())),
    String.append(",", String.append(Minimal.bracket(Minimal.show_rows(timings())),
      String.append(",", String.append(Minimal.bracket(Minimal.show_rows(feedback())),
        String.append(",", String.append(Minimal.bracket(Minimal.show_traces(permits())), "]")))))))))
