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

def credential_resumed(pair: Types.State & Minimal.Queue, now: Nat, action: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match pair action:
    case (+state, queue) 3n: credential_snapshot(state, 34n, now) <> ih((state, queue))
    case (state, queue) _: ih((state, queue))

def credential_after(pair: Types.State & Minimal.Queue, +now: Nat, +action: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match pair:
    case (+state, queue): credential_report(state, now, action) <> credential_resumed(credential_control(state, queue, now, action), now, action, ih)

def credential_live(pair: Types.State & Minimal.Queue, +operation: Nat, now: Nat,
    ih: (Types.State & Minimal.Queue) -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match pair:
    case (+state,queue): [35n,now,operation,captured(Credentials.captured(Engine.credentials(state),operation))] <> ih((state,queue))

def credential_input(+input: Minimal.Input, state: Types.State, queue: Minimal.Queue, +now: Nat, +mode: Nat, +stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match input mode stage:
    case Minimal.Event{Driver.Action{Canonical.DispatchSettled{_, _, _, 3n}, _, _, _, _}} 0n 0n:
      Minimal.input(input, state, queue, now, config(Canonical.RequestFinding{}, now), pair => credential_after(pair, now, 2n, pair => ih((pair, 1n))))
    case Minimal.Event{Driver.Action{Canonical.JevRequestSettled{_, _, _, 3n, _, _, _}, _, _, _, _}} 1n 0n:
      Minimal.input(input, state, queue, now, config(Canonical.RequestFinding{}, now), pair => credential_after(pair, now, 1n, pair => ih((pair, 1n))))
    case Minimal.Event{Driver.Action{Canonical.JevRequestStarted{_, _, _, 3n, _}, _, _, _, _}} 2n 0n:
      Minimal.input(input, state, queue, now, config(Canonical.RequestFinding{}, now), pair => credential_after(pair, now, 3n, pair => ih((pair, 1n))))
    case Minimal.Event{Driver.Action{Canonical.JevRequestStarted{_,_,_,+operation,_},_,_,_,_}} 0n _:
      Minimal.input(input,state,queue,now,config(Canonical.RequestFinding{},now),pair => credential_live(pair,operation,now,pair => ih((pair,stage))))
    case _ _ _:
      Minimal.input(input, state, queue, now, config(Canonical.RequestFinding{}, now), pair => ih((pair, stage)))

def credential_endpoint(pair: Types.State & Minimal.Queue, +mode: Nat, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match pair mode stage:
    case (+state, queue) 1n 1n:
      credential_after((state, queue), Engine.clock(state), 2n, pair => ih((pair, 2n)))
    case (+state, queue) 2n 1n:
      credential_snapshot(state, 32n, Engine.clock(state)) <> ih(((state, queue), 2n))
    case (+state, _) _ _:
      [credential_snapshot(state, 33n, Engine.clock(state))]

def credential_limit(mode: Nat, stage: Nat) -> Nat:
  match mode stage:
    case 1n 1n: 8n
    case 2n 1n: 10n
    case 1n _: 10n
    case _ _: 20n

def credential_taken(taken: Engine.Taken, +items: List<&2, Minimal.Item>, +sequence: Nat, mode: Nat, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match taken:
    case Engine.Taken{state, Some{Scheduler.Entry{at, +order}}}:
      credential_input(Minimal.lookup(items, order), state, Minimal.Queue{Minimal.remove(items, order), sequence, sequence}, at, mode, stage, ih)
    case Engine.Taken{+state, None{}}: [credential_snapshot(state, 33n, Engine.clock(state))]

def credential_bounded(in_budget: Bool, state: Types.State, queue: Minimal.Queue, mode: Nat, stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match in_budget queue:
    case True{} Minimal.Queue{items, sequence, _}: credential_taken(Engine.take(state), items, sequence, mode, stage, ih)
    case False{} _: credential_endpoint((state, queue), mode, stage, ih)

def credential_selected(entries: List<&2, Scheduler.Entry>, state: Types.State, queue: Minimal.Queue, +mode: Nat, +stage: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match entries:
    case Nil{}: credential_endpoint((state, queue), mode, stage, ih)
    case Scheduler.Entry{at, _} <> _: credential_bounded(Nat.is_le(at, credential_limit(mode, stage)), state, queue, mode, stage, ih)

def credential_next(pair: (Types.State & Minimal.Queue) & Nat, mode: Nat,
    ih: ((Types.State & Minimal.Queue) & Nat) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match pair:
    case ((state, Minimal.Queue{+items, +sequence, synced}), stage):
      +state = Minimal.sync(items, state, synced)
      credential_selected(Engine.queued(state), state, Minimal.Queue{items, sequence, sequence}, mode, stage, ih)

def credential_loop(fuel: Nat, pair: (Types.State & Minimal.Queue) & Nat, +mode: Nat) -> List<&2, List<&2, Nat>>:
  match fuel:
    case 0n: [[99n]]
    case 1n+rest: credential_next(pair, mode, pair => credential_loop(rest, pair, mode))

def credential_queue(mode: Nat) -> Minimal.Queue:
  match mode:
    case 1n: Minimal.initial_queue(1n)
    case _: Minimal.append(Minimal.initial_queue(1n), 11n, Minimal.Edit{})

def credential_scenario(+mode: Nat) -> List<&2, List<&2, Nat>>:
  match mode:
    case 0n:
      credential_after((Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}), credential_queue(0n)), 0n, 1n, pair => credential_loop(200n, (pair, 0n), 0n))
    case _:
      credential_loop(200n, ((Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}), credential_queue(mode)), 0n), mode)

# Compact original 2050-cycle campaign. Each step returns only state, pending
# payloads and seven counters; no transition history survives the next step.
# The adapter delegates every edit, graph fact and command to the same Engine.
type Totals is Data:
  Totals{started: Nat, clear: Nat, finding: Nat, output: Nat, refused: Nat, graphs: Nat, frames: Nat}

type Compact is Data:
  Compact{state: Types.State, queue: Minimal.Queue, totals: Totals, remaining: Nat, healed: Bool}

def terminal_context(action: Driver.Action, healed: Bool) -> Driver.Context:
  match action:
    case Driver.Action{_, _, candidate, _, _}:
      Driver.Context{1n, 1n, 1n, 10n, True{}, 1n, Bool.pick(Canonical.RequestOutcome, healed, Canonical.RequestFinding{}, Canonical.RequestClear{}), True{}, True{}, True{}, True{}, 600000n, candidate, True{}, True{}, True{}, True{}, 0n, 30n, False{}, True{}}

def terminal_count(event: Canonical.CanonicalEvent, totals: Totals, rejected: Nat) -> Totals:
  match event totals:
    case Canonical.JevRequestStarted{_, _, _, _, _} Totals{s,c,f,o,r,g,n}: Totals{Nat.add(s,1n),c,f,o,Nat.add(r,rejected),g,Nat.add(n,1n)}
    case Canonical.JevRequestSettled{_, _, _, _, _, Canonical.RequestClear{}, _} Totals{s,c,f,o,r,g,n}: Totals{s,Nat.add(c,1n),f,o,Nat.add(r,rejected),g,Nat.add(n,1n)}
    case Canonical.JevRequestSettled{_, _, _, _, _, Canonical.RequestFinding{}, _} Totals{s,c,f,o,r,g,n}: Totals{s,c,Nat.add(f,1n),o,Nat.add(r,rejected),g,Nat.add(n,1n)}
    case Canonical.SubmissionTerminal{_, _, _} Totals{s,c,f,o,r,g,n}: Totals{s,c,f,Nat.add(o,1n),Nat.add(r,rejected),g,Nat.add(n,1n)}
    case _ Totals{s,c,f,o,r,g,n}: Totals{s,c,f,o,Nat.add(r,rejected),g,Nat.add(n,1n)}

def terminal_remaining(event: Canonical.CanonicalEvent, remaining: Nat) -> Nat:
  match event:
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}: Nat.sub(remaining,1n)
    case _: remaining

def terminal_retire(event: Canonical.CanonicalEvent, state: Types.State) -> Types.State:
  match event:
    case Canonical.PreparationCompleted{_,_,_,operation,_}: Engine.retire(state,operation)
    case _: state

def terminal_transition(transition: Engine.Transition, +before: Types.State, action: Driver.Action, queue: Minimal.Queue, +now: Nat, totals: Totals, +remaining: Nat, +healed: Bool) -> Compact:
  match transition action:
    case Engine.Transition{+state, Canonical.Advanced{_, commands}} Driver.Action{+event, delay, candidate, job, expiry}:
      +state = terminal_retire(event,state)
      +q = Minimal.commands(commands,queue,now,state,event,terminal_context(Driver.Action{event,delay,candidate,job,expiry},healed))
      +q = Minimal.enqueue(Engine.after(before,state,event),q,now)
      Compact{state,q,terminal_count(event,totals,0n),terminal_remaining(event,remaining),healed}
    case Engine.Transition{+state, Canonical.Rejected{_, _}} Driver.Action{+event, _, _, _, _}:
      Compact{state,Minimal.enqueue(Engine.after(before,state,event),queue,now),terminal_count(event,totals,1n),terminal_remaining(event,remaining),healed}

def terminal_execute(+state: Types.State, action: Driver.Action, queue: Minimal.Queue, +now: Nat, totals: Totals, remaining: Nat, +healed: Bool) -> Compact:
  match action:
    case Driver.Action{+event, +delay, +candidate, +job, +expiry}:
      +event = Engine.fence(state,event,True{},terminal_context(Driver.Action{event,delay,candidate,job,expiry},healed))
      terminal_transition(Engine.step(state,event),state,Driver.Action{event,delay,candidate,job,expiry},queue,now,totals,remaining,healed)

def terminal_edit(plan: Driver.EditPlan, state: Types.State, queue: Minimal.Queue, +now: Nat, totals: Totals, remaining: Nat, healed: Bool) -> Compact:
  match plan:
    case Driver.EditPlan{retry,actions}: Compact{state,Minimal.edit_retry(retry,Minimal.enqueue(actions,queue,now),now),totals,remaining,healed}

def terminal_graph(transition: Types.GraphTransition, queue: Minimal.Queue, totals: Totals, remaining: Nat, healed: Bool) -> Compact:
  match transition totals:
    case Types.GraphTransition{state,_,_} Totals{s,c,f,o,r,g,n}: Compact{state,queue,Totals{s,c,f,o,r,Nat.add(g,1n),Nat.add(n,1n)},remaining,healed}
    case Types.GraphRejected{state} Totals{s,c,f,o,r,g,n}: Compact{state,queue,Totals{s,c,f,o,Nat.add(r,1n),g,n},remaining,healed}

def terminal_input(input: Minimal.Input, +state: Types.State, queue: Minimal.Queue, +now: Nat, totals: Totals, remaining: Nat, healed: Bool) -> Compact:
  match input:
    case Minimal.Edit{}: terminal_edit(Engine.edit(state,1n,1n),state,queue,now,totals,remaining,healed)
    case Minimal.Event{action}: terminal_execute(state,action,queue,now,totals,remaining,healed)
    case Minimal.Fact{operation,step,event}:
      terminal_graph(Engine.graph_step(state,Types.GraphKey{1n,1n,1n,operation,0n},step,Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},event),queue,totals,remaining,healed)

def terminal_taken(taken: Engine.Taken, +items: List<&2,Minimal.Item>, +sequence: Nat, totals: Totals, remaining: Nat, healed: Bool) -> Compact:
  match taken:
    case Engine.Taken{state,Some{Scheduler.Entry{at,+order}}}: terminal_input(Minimal.lookup(items,order),state,Minimal.Queue{Minimal.remove(items,order),sequence,sequence},at,totals,remaining,healed)
    case Engine.Taken{state,None{}}: Compact{state,Minimal.Queue{items,sequence,sequence},totals,remaining,healed}

def terminal_controls(pair: Types.State & Minimal.Queue, action: Nat) -> Types.State & Minimal.Queue:
  match pair:
    case (+state,queue): credential_control(state,queue,Engine.clock(state),action)

def terminal_healed(pair: Types.State & Minimal.Queue, totals: Totals) -> Compact:
  match pair:
    case (+state,queue): Compact{state,Minimal.append(queue,Nat.add(Engine.clock(state),1n),Minimal.Edit{}),totals,0n,True{}}

def terminal_empty(+state: Types.State, queue: Minimal.Queue, totals: Totals, +remaining: Nat, healed: Bool) -> Compact:
  match remaining healed:
    case 0n False{}: terminal_healed(terminal_controls(terminal_controls(terminal_controls((state,queue),1n),2n),3n),totals)
    case _ _: Compact{state,Minimal.append(queue,Nat.mul(Nat.sub(2050n,remaining),10n),Minimal.Edit{}),totals,remaining,healed}

def terminal_selected(entries: List<&2,Scheduler.Entry>, +state: Types.State, queue: Minimal.Queue, totals: Totals, remaining: Nat, healed: Bool) -> Compact:
  match entries queue:
    case Nil{} _: terminal_empty(state,queue,totals,remaining,healed)
    case _ Minimal.Queue{items,sequence,_}: terminal_taken(Engine.take(state),items,sequence,totals,remaining,healed)

def terminal_next(compact: Compact) -> Compact:
  match compact:
    case Compact{state,Minimal.Queue{+items,+sequence,synced},totals,remaining,healed}:
      +state = Minimal.sync(items,state,synced)
      terminal_selected(Engine.queued(state),state,Minimal.Queue{items,sequence,sequence},totals,remaining,healed)

def terminal_values(credentials: Credentials.State, +state: Types.State, totals: Totals) -> List<&2,Nat>:
  match credentials totals:
    case Credentials.State{_,generation,issued} Totals{s,c,f,o,r,g,n}:
      List.append(&2,Nat,[s,c,f,o,r,g,n,Engine.clock(state)],List.append(&2,Nat,Minimal.state_counts(state),[generation,List.length(&2,Credentials.Capture,issued)]))

# Original advance horizon: final clear edit20490 + PRE2 + Jev1;
# fresh edit20494 + PRE2 + Jev1 completes20497. Final advance starts20493 and uses +20, so drain only through20513,
# preserving the captured600000 expiry in both scheduler and payload queue.
def terminal_done(entries: List<&2,Scheduler.Entry>, compact: Compact) -> Bool:
  match entries compact:
    case Scheduler.Entry{at,_} <> _ Compact{_,_,_,0n,True{}}: Bool.not(Nat.is_le(at,20513n))
    case Nil{} Compact{_,Minimal.Queue{Nil{},_,_},_,0n,True{}}: True{}
    case _ _: False{}

def terminal_continue(done: Bool, +compact: Compact, ih: Compact -> List<&2,Nat>) -> List<&2,Nat>:
  match done compact:
    case True{} Compact{+state,_,totals,_,_}: terminal_values(Engine.credentials(state),state,totals)
    case False{} _: ih(terminal_next(compact))

def terminal_finished(+compact: Compact) -> Bool:
  match compact:
    case Compact{+state,queue,totals,remaining,healed}: terminal_done(Engine.queued(state),Compact{state,queue,totals,remaining,healed})

def terminal_loop(fuel: Nat, +compact: Compact) -> List<&2,Nat>:
  match fuel:
    case 0n: [99n]
    case 1n+rest: terminal_continue(terminal_finished(compact),compact,next => terminal_loop(rest,next))

def terminal_campaign() -> List<&2,Nat>:
  terminal_loop(60000n,Compact{Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),Minimal.initial_queue(1n),Totals{0n,0n,0n,0n,0n,0n,0n},2050n,False{}})
