import Base
import ./callback-native-driver.bend as Run
import ./minimal-scenario.bend as Minimal
import ../Engine.bend as Engine
import ../Callbacks.bend as Callbacks
import ../Driver.bend as Driver
import ../Scheduler.bend as Scheduler
import ../../agent-flow-bend/Canonical.bend as Canonical

# Original program, not a Canonical trace recorded by JavaScript. Receipts below
# are captured from actual issuance and carried unchanged through interventions.
# Structural rendering preserves actual complete canonical and graph boundaries;
# source configuration and ordered interventions are the only scenario inputs.

def fact_target(fact: Callbacks.Fact) -> Callbacks.Target:
  match fact:
    case Callbacks.Fact{target,_,_,_}: target

def apply(runtime: Run.Runtime, +fact: Callbacks.Fact, action: Callbacks.Control) -> Run.Runtime:
  Run.control(runtime,fact_target(fact),action,Some{fact})

def pending(entries: List<&2,Scheduler.Entry>) -> Bool:
  match entries:
    case Nil{}: False{}
    case Scheduler.Entry{at,_} <> _: Nat.is_le(at,30n)

def drained(done: Bool, runtime: Run.Runtime, ih: Run.Runtime -> Run.Runtime) -> Run.Runtime:
  match done:
    case True{}: runtime
    case False{}: ih(Run.step(runtime))

def queue_state(runtime: Run.Runtime) -> Bool:
  match runtime:
    case Run.Runtime{state <> Nil{},Minimal.Queue{+items,_,synced},_,_}:
      pending(Engine.queued(Minimal.sync(items,state,synced)))
    case _: False{}

def drain(fuel: Nat, +runtime: Run.Runtime) -> Run.Runtime:
  match fuel:
    case 0n: Run.append_frame(runtime,Run.FuelExhausted{})
    case 1n+rest: drained(Bool.not(queue_state(runtime)),runtime,next => drain(rest,next))

def ordered_pair(runtime: Run.Runtime, +start: Callbacks.Fact, +end: Callbacks.Fact, reverse: Bool) -> Run.Runtime:
  match reverse:
    case False{}: apply(apply(runtime,start,Callbacks.Hold{}),end,Callbacks.Reorder{})
    case True{}: apply(apply(runtime,end,Callbacks.Reorder{}),start,Callbacks.Hold{})

def wrong_stage_facts(runtime: Run.Runtime, reverse: Bool, started: Maybe<&2,Callbacks.Fact>, settled: Maybe<&2,Callbacks.Fact>) -> Run.Runtime:
  match started settled:
    case Some{+start} Some{+end}:
      +runtime = ordered_pair(runtime,start,end,reverse)
      +runtime = drain(200n,runtime)
      drain(200n,apply(apply(runtime,start,Callbacks.Release{}),end,Callbacks.Duplicate{}))
    case _ _: Run.append_frame(runtime,Run.FuelExhausted{})

def wrong_stage() -> Run.Runtime:
  +runtime = Run.until(100n,Run.initial(),2n)
  wrong_stage_facts(runtime,False{},Run.receipt(runtime,1n),Run.receipt(runtime,2n))

def reverse_order() -> Run.Runtime:
  +runtime = Run.until(100n,Run.initial(),2n)
  wrong_stage_facts(runtime,True{},Run.receipt(runtime,1n),Run.receipt(runtime,2n))

def stop_event(fact: Callbacks.Fact) -> Canonical.CanonicalEvent:
  match fact:
    case Callbacks.Fact{Callbacks.Target{Callbacks.Owner{p,l,r,_},_,_},_,_,_}:
      Canonical.StopPolled{p,l,r,True{}}

def schedule_stop(runtime: Run.Runtime, +fact: Callbacks.Fact) -> Run.Runtime:
  match runtime:
    case Run.Runtime{state,queue,issued,frames}:
      Run.append_frame(Run.capture(Run.Runtime{state,Minimal.append(queue,5n,Minimal.Event{Driver.immediate(stop_event(fact),False{})}),issued,frames}),Run.SourceScheduled{5n,stop_event(fact)})

def canceled_fact(runtime: Run.Runtime, found: Maybe<&2,Callbacks.Fact>) -> Run.Runtime:
  match found:
    case Some{+fact}:
      +runtime = drain(200n,schedule_stop(apply(runtime,fact,Callbacks.Hold{}),fact))
      +runtime = drain(200n,apply(runtime,fact,Callbacks.Release{}))
      drain(200n,apply(runtime,fact,Callbacks.Duplicate{}))
    case None{}: Run.append_frame(runtime,Run.FuelExhausted{})

def canceled() -> Run.Runtime:
  +runtime = Run.until(100n,Run.initial(),2n)
  canceled_fact(runtime,Run.receipt(runtime,2n))

def wrong_target(fact: Callbacks.Fact) -> Callbacks.Target:
  match fact:
    case Callbacks.Fact{Callbacks.Target{Callbacks.Owner{p,l,r,o},effect,order},_,_,_}:
      Callbacks.Target{Callbacks.Owner{p,Nat.add(l,1n),r,o},effect,order}

def unknown_target(fact: Callbacks.Fact) -> Callbacks.Target:
  match fact:
    case Callbacks.Fact{Callbacks.Target{owner,effect,order},_,_,_}:
      Callbacks.Target{owner,effect,Nat.add(order,1000n)}

def dropped_fact(runtime: Run.Runtime, found: Maybe<&2,Callbacks.Fact>) -> Run.Runtime:
  match found:
    case Some{+fact}:
      +runtime = Run.control(runtime,wrong_target(fact),Callbacks.Duplicate{},Some{fact})
      +runtime = Run.control(runtime,unknown_target(fact),Callbacks.Duplicate{},Some{fact})
      drain(200n,apply(runtime,fact,Callbacks.Drop{}))
    case None{}: Run.append_frame(runtime,Run.FuelExhausted{})

def dropped() -> Run.Runtime:
  +runtime = Run.until(100n,Run.initial(),2n)
  dropped_fact(runtime,Run.receipt(runtime,2n))

def late_preparation_fact(runtime: Run.Runtime, found: Maybe<&2,Callbacks.Fact>) -> Run.Runtime:
  match found:
    case Some{+fact}:
      +runtime = drain(200n,Run.depart(apply(runtime,fact,Callbacks.Hold{})))
      drain(200n,apply(runtime,fact,Callbacks.Release{}))
    case None{}: Run.append_frame(runtime,Run.FuelExhausted{})

def late_preparation() -> Run.Runtime:
  +runtime = Run.until(100n,Run.initial_labeled(),3n)
  late_preparation_fact(runtime,Run.receipt(runtime,3n))
