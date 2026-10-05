import Base
import ./minimal-scenario.bend as Minimal
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Driver.bend as Driver
import ../JevEffects.bend as JevEffects
import ../FaultTargets.bend as Targets
import ../CredentialFacts.bend as Credentials
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/ImportGraph.bend as Graph

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

type Trigger is Data:
  BeforeStart{}
  AfterStart{}
  AfterSettlement{}

type Control is Data:
  Control{trigger: Trigger, target: Targets.Target, outcome: Canonical.RequestOutcome}

type AppliedControl is Data:
  AppliedControl{state: Types.State, queue: Minimal.Queue, code: Nat, applied: Bool}

def matching(input: Minimal.Input, target: Targets.Target) -> Bool:
  match input:
    case Minimal.Event{Driver.Action{event, _, _, _, _}}: Targets.callback(event, target)
    case _: False{}

def cancel_item(matched: Bool, state: Types.State, order: Nat, item: Minimal.Item, tail: List<&2, Minimal.Item>) -> Types.State & List<&2, Minimal.Item>:
  match matched:
    case True{}: (Engine.cancel(state, order), tail)
    case False{}: (state, item <> tail)

def cancelled_tail(pair: Types.State & List<&2, Minimal.Item>, +item: Minimal.Item, target: Targets.Target) -> Types.State & List<&2, Minimal.Item>:
  match pair item:
    case (state, tail) Minimal.Item{at, +order, +input}:
      cancel_item(matching(input, target), state, order, Minimal.Item{at, order, input}, tail)

def cancel_items(items: List<&2, Minimal.Item>, state: Types.State, +target: Targets.Target) -> Types.State & List<&2, Minimal.Item>:
  match items:
    case Nil{}: (state, Nil{})
    case +item <> tail: cancelled_tail(cancel_items(tail, state, target), item, target)

def cancelled_queue(pair: Types.State & List<&2, Minimal.Item>, sequence: Nat, synced: Nat) -> Types.State & Minimal.Queue:
  match pair:
    case (state, items): (state, Minimal.Queue{items, sequence, synced})

def cancel(pair: Types.State & Minimal.Queue, target: Targets.Target) -> Types.State & Minimal.Queue:
  match pair:
    case (state, Minimal.Queue{items, sequence, synced}): cancelled_queue(cancel_items(items, state, target), sequence, synced)

def facts(items: List<&2, JevEffects.ScheduledFact>, queue: Minimal.Queue, +now: Nat) -> Minimal.Queue:
  match items:
    case Nil{}: queue
    case JevEffects.ScheduledFact{event, +delay} <> tail:
      facts(tail, Minimal.append(queue, Nat.add(now, delay), Minimal.Event{Driver.Action{event, delay, None{}, False{}, None{}}}), now)

def applied(pair: Types.State & Minimal.Queue, items: List<&2, JevEffects.ScheduledFact>, now: Nat) -> AppliedControl:
  match pair:
    case (state, queue): AppliedControl{state, facts(items, queue, now), 1n, True{}}

def refused(pair: Types.State & Minimal.Queue, code: Nat) -> AppliedControl:
  match pair:
    case (state, queue): AppliedControl{state, queue, code, False{}}

def controlled(result: JevEffects.Intervention, pair: Types.State & Minimal.Queue, target: Targets.Target, now: Nat) -> AppliedControl:
  match result:
    case JevEffects.Applied{facts}: applied(cancel(pair, target), facts, now)
    case JevEffects.RefusedMissing{}: refused(pair, 2n)
    case JevEffects.RefusedStarted{}: refused(pair, 3n)
    case JevEffects.RefusedInterrupted{}: refused(pair, 4n)

def control(pair: Types.State & Minimal.Queue, +target: Targets.Target, outcome: Canonical.RequestOutcome, +now: Nat) -> AppliedControl:
  match pair:
    case (+state, queue): controlled(Engine.intervene_request(state, target, outcome, Nat.sub(7n, now)), (state, queue), target, now)

def report(now: Nat, code: Nat, target: Targets.Target) -> List<&2, Nat>:
  match target:
    case Targets.Target{p, l, r, o, id}: [30n, now, code, p, l, r, o, id]

def execute_after(result: AppliedControl, +now: Nat, +target: Targets.Target,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match result:
    case AppliedControl{state, queue, code, _}: report(now, code, target) <> ih((state, queue))

def execute_before(result: AppliedControl, +input: Minimal.Input, +now: Nat, +target: Targets.Target,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match result:
    case AppliedControl{state, queue, code, True{}}: report(now, code, target) <> ih((state, queue))
    case AppliedControl{state, queue, code, False{}}:
      report(now, code, target) <> Minimal.input(input, state, queue, now, config(Canonical.RequestFinding{}, now), ih)

def scripted_input(+input: Minimal.Input, +state: Types.State, +queue: Minimal.Queue, +now: Nat, script: Maybe<&2, Control>,
    ih: ((Types.State & Minimal.Queue) & Maybe<&2, Control>) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match input script:
    case Minimal.Event{Driver.Action{Canonical.JevRequestStarted{_, _, _, _, _}, _, _, _, _}} Some{Control{BeforeStart{}, +target, outcome}}:
      execute_before(control((state, queue), target, outcome, now), input, now, target, pair => ih((pair, None{})))
    case Minimal.Event{Driver.Action{Canonical.JevRequestStarted{_, _, _, _, _}, _, _, _, _}} Some{Control{AfterStart{}, +target, +outcome}}:
      Minimal.input(input, state, queue, now, config(Canonical.RequestFinding{}, now), pair => execute_after(control(pair, target, outcome, now), now, target, pair => ih((pair, None{}))))
    case Minimal.Event{Driver.Action{Canonical.JevRequestSettled{_, _, _, _, _, _, _}, _, _, _, _}} Some{Control{AfterSettlement{}, +target, +outcome}}:
      Minimal.input(input, state, queue, now, config(Canonical.RequestFinding{}, now), pair => execute_after(control(pair, target, outcome, now), now, target, pair => ih((pair, None{}))))
    case _ _:
      Minimal.input(input, state, queue, now, config(Canonical.RequestFinding{}, now), pair => ih((pair, script)))

def scripted_taken(taken: Engine.Taken, +items: List<&2, Minimal.Item>, +sequence: Nat, script: Maybe<&2, Control>,
    ih: ((Types.State & Minimal.Queue) & Maybe<&2, Control>) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match taken:
    case Engine.Taken{state, Some{Scheduler.Entry{at, +order}}}:
      scripted_input(Minimal.lookup(items, order), state, Minimal.Queue{Minimal.remove(items, order), sequence, sequence}, at, script, ih)
    case Engine.Taken{_, None{}}: Nil{}

def scripted_bounded(in_budget: Bool, state: Types.State, items: List<&2, Minimal.Item>, sequence: Nat, script: Maybe<&2, Control>,
    ih: ((Types.State & Minimal.Queue) & Maybe<&2, Control>) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match in_budget:
    case True{}: scripted_taken(Engine.take(state), items, sequence, script, ih)
    case False{}: Nil{}

def scripted_selected(entries: List<&2, Scheduler.Entry>, state: Types.State, items: List<&2, Minimal.Item>, sequence: Nat, script: Maybe<&2, Control>,
    ih: ((Types.State & Minimal.Queue) & Maybe<&2, Control>) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match entries:
    case Nil{}: Nil{}
    case Scheduler.Entry{at, _} <> _: scripted_bounded(Nat.is_le(at, 10n), state, items, sequence, script, ih)

def scripted_next(pair: (Types.State & Minimal.Queue) & Maybe<&2, Control>,
    ih: ((Types.State & Minimal.Queue) & Maybe<&2, Control>) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match pair:
    case ((state, Minimal.Queue{+items, sequence, synced}), script):
      +state = Minimal.sync(items, state, synced)
      scripted_selected(Engine.queued(state), state, items, sequence, script, ih)

def scripted_loop(fuel: Nat, pair: (Types.State & Minimal.Queue) & Maybe<&2, Control>) -> List<&2, List<&2, Nat>>:
  match fuel:
    case 0n: Nil{}
    case 1n+rest: scripted_next(pair, pair => scripted_loop(rest, pair))

def targeted(trigger: Trigger, outcome: Canonical.RequestOutcome, lifetime: Nat) -> List<&2, List<&2, Nat>>:
  scripted_loop(100n, ((Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}), Minimal.initial_queue(1n)), Some{Control{trigger, Targets.Target{1n, lifetime, 1n, 3n, 4n}, outcome}}))

def target_scenarios() -> List<&2, List<&2, List<&2, Nat>>>:
  [targeted(BeforeStart{}, Canonical.NeverSent{}, 1n), targeted(AfterStart{}, Canonical.RequestTimeout{}, 1n),
   targeted(AfterStart{}, Canonical.RequestInterrupted{}, 1n), targeted(AfterStart{}, Canonical.NeverSent{}, 1n),
   targeted(BeforeStart{}, Canonical.RequestTimeout{}, 2n), targeted(AfterSettlement{}, Canonical.RequestInterrupted{}, 1n)]

# Three original credential scripts, all retaining the same resident:
# 0 unavailable before edit -> restore after refusal/release -> fresh edit at11;
# 1 unavailable after finding -> drain through8 -> restore same finding;
# 2 rotate after start -> drain through10 -> fresh edit at11.
def credential_report(+state: Types.State, now: Nat, action: Nat) -> List<&2, Nat>:
  List.append(&2, Nat, [31n, now, action, 1n], Minimal.state_counts(state))

def captured(found: Maybe<&2, Nat>) -> Nat:
  match found:
    case None{}: 0n
    case Some{generation}: generation

def credential_snapshot_values(credentials: Credentials.State, +state: Types.State, marker: Nat, now: Nat) -> List<&2, Nat>:
  match credentials:
    case Credentials.State{_, generation, _}:
      List.append(&2, Nat, [marker, now], List.append(&2, Nat, Minimal.state_counts(state), [generation,
        captured(Credentials.captured(Engine.credentials(state), 3n)), captured(Credentials.captured(Engine.credentials(state), 5n)), captured(Credentials.captured(Engine.credentials(state), 7n))]))

def credential_snapshot(+state: Types.State, marker: Nat, now: Nat) -> List<&2, Nat>:
  credential_snapshot_values(Engine.credentials(state), state, marker, now)

def credential_control(+state: Types.State, queue: Minimal.Queue, +now: Nat, +action: Nat) -> Types.State & Minimal.Queue:
  +state = Engine.credential_action(state, Bool.not(Nat.is_eq(action, 1n)), Nat.is_eq(action, 3n))
  +context = Minimal.context(Driver.immediate(Canonical.FinalCandidateCheck{True{}, True{}, True{}, False{}, True{}, True{}}, False{}), config(Canonical.RequestFinding{}, now), now)
  (state, Minimal.enqueue(Engine.revalidate(state, context), queue, now))
