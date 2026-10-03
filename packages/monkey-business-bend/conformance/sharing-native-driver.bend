import Base
import ../SharingScenario.bend as Sharing
import ../FreshnessScenario.bend as Freshness
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../Scheduler.bend as Scheduler
import ../../agent-flow-bend/Canonical.bend as C
import ./advicee-lifecycle-driver.bend as Edge
import ./minimal-scenario.bend as Minimal

# Explicit central TDD seam. Existing generic edge retains original graph,
# callback and output payloads. Engine.sharing_* owns actual Canonical routing,
# member disposition, reserved bytes and cancellation; no local host policy.
def initialized(initial: Edge.Initialized, mode: Nat) -> Edge.Runtime:
  match initial mode:
    case Edge.Initialized{state,queue} 3n:
      Edge.Runtime{state,Edge.append(Edge.append(Edge.append(queue,0n,Edge.Edit{Edge.Job{1n,1n,10n,[5n],C.RequestFinding{}}}),
        0n,Edge.Edit{Edge.Job{1n,1n,10n,[5n],C.RequestFinding{}}}),
        0n,Edge.Edit{Edge.Job{2n,1n,10n,[5n],C.RequestFinding{}}}),[],30n}
    case Edge.Initialized{state,queue} 5n:
      Edge.Runtime{state,Edge.append(Edge.append(queue,0n,Edge.Edit{Edge.Job{1n,1n,10n,[5n],C.RequestFinding{}}}),
        10n,Edge.Edit{Edge.Job{1n,1n,10n,[5n],C.RequestFinding{}}}),[],5n}
    case Edge.Initialized{state,queue} _:
      Edge.Runtime{state,Edge.append(Edge.append(queue,0n,Edge.Edit{Edge.Job{1n,1n,10n,[5n],C.RequestFinding{}}}),
        0n,Edge.Edit{Edge.Job{1n,1n,10n,[5n],C.RequestFinding{}}}),[],30n}

def sharing_edit(state: Types.State, queue: Edge.Queue, jobs: List<&2,Edge.Stored>,
    +job: Edge.Job, now: Nat, delay: Nat, ih: Edge.Runtime -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match job:
    case Edge.Job{+partition,lifetime,_,_,_}:
      Edge.edit_plan(Engine.sharing_edit_attempt(state,partition,lifetime,Sharing.Key{partition,7n},
        Freshness.Source{(partition+10n:Nat),13n}),queue,jobs,job,now,delay,ih)

def input(input: Edge.Input, state: Types.State, queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, now: Nat, delay: Nat,
    ih: Edge.Runtime -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match input:
    case Edge.Edit{job}: sharing_edit(state,queue,jobs,job,now,delay,ih)
    case input: Edge.input(input,state,queue,jobs,now,delay,ih)

def actions(list: List<&2,Driver.Action>, queue: Edge.Queue, +now: Nat) -> Edge.Queue:
  match list:
    case []: queue
    case action <> tail:
      Edge.action_append(action,queue,now,Edge.Job{1n,1n,10n,[5n],C.RequestFinding{}},q=>actions(tail,q,now))

def issued(result: Engine.IssuedActions, queue: Edge.Queue, jobs: List<&2,Edge.Stored>, delay: Nat) -> Edge.Runtime:
  match result:
    case Engine.IssuedActions{state,list}: Edge.Runtime{state,actions(list,queue,2n),jobs,delay}

def changed(result: Engine.SharingTransition, runtime: Edge.Runtime) -> Edge.Runtime:
  match result runtime:
    case Engine.SharingTransition{state,_,actions} Edge.Runtime{_,queue,jobs,delay}:
      issued(Engine.issue_actions(state,actions),queue,jobs,delay)

def controls(+runtime: Edge.Runtime, mode: Nat) -> Edge.Runtime:
  match runtime mode:
    case Edge.Runtime{state,_,_,_} 1n: changed(Engine.sharing_leave(state,Freshness.Scope{1n,1n,1n,2n}),runtime)
    case Edge.Runtime{state,_,_,_} 2n: changed(Engine.sharing_leave(state,Freshness.Scope{1n,1n,1n,1n}),runtime)
    case Edge.Runtime{state,_,_,_} 3n: changed(Engine.sharing_leave_all(state,1n,1n),runtime)
    case Edge.Runtime{state,_,_,_} 4n: changed(Engine.sharing_leave_all(state,1n,1n),runtime)
    case _ _: runtime

def taken(result: Engine.Taken, +items: List<&2,Edge.Item>, +sequence: Nat,
    jobs: List<&2,Edge.Stored>, delay: Nat,
    ih: Edge.Runtime -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match result:
    case Engine.Taken{state,Some{Scheduler.Entry{+at,+order}}}:
      input(Edge.lookup(items,order),state,Edge.Queue{Edge.remove(items,order),sequence,sequence},jobs,at,delay,ih)
    case Engine.Taken{state,None{}}: [90n <> Edge.state_counts(Engine.canonical(state))]

def proceed(+runtime: Edge.Runtime, ih: Edge.Runtime -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match runtime:
    case Edge.Runtime{state,Edge.Queue{+items,+sequence,_},jobs,delay}:
      taken(Engine.take(state),items,sequence,jobs,delay,ih)

def at_boundary(control_due: Bool, +runtime: Edge.Runtime, mode: Nat,
    ih: Edge.Runtime -> Nat -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match control_due:
    case True{}: ih(controls(runtime,mode),1n)
    case False{}: proceed(runtime,next=>ih(next,0n))

def after_boundary(done: Bool, runtime: Edge.Runtime,
    ih: Edge.Runtime -> Nat -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match done runtime:
    case True{} Edge.Runtime{state,_,_,_}: [90n <> Edge.state_counts(Engine.canonical(state))]
    case False{} _: proceed(runtime,next=>ih(next,1n))

def selected(next: Maybe<&2,Scheduler.Entry>, +runtime: Edge.Runtime, stage: Nat,
    mode: Nat, ih: Edge.Runtime -> Nat -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match next stage:
    case Some{Scheduler.Entry{at,_}} 0n: at_boundary(Nat.is_gt(at,2n),runtime,mode,ih)
    case Some{Scheduler.Entry{at,_}} _: after_boundary(Nat.is_gt(at,33n),runtime,ih)
    case None{} 0n: ih(controls(runtime,mode),1n)
    case None{} _: after_boundary(True{},runtime,ih)

def next(runtime: Edge.Runtime, stage: Nat, mode: Nat,
    ih: Edge.Runtime -> Nat -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match runtime:
    case Edge.Runtime{state,Edge.Queue{+items,+sequence,synced},jobs,delay}:
      +state=Edge.sync(items,state,synced)
      selected(Engine.queued(state),Edge.Runtime{state,Edge.Queue{items,sequence,sequence},jobs,delay},stage,mode,ih)

def loop(fuel: Nat, runtime: Edge.Runtime, stage: Nat, +mode: Nat) -> List<&2,List<&2,Nat>>:
  match fuel:
    case 0n: [[98n]]
    case 1n+rest: next(runtime,stage,mode,runtime=>stage=>loop(rest,runtime,stage,mode))

def run(mode: Nat) -> List<&2,List<&2,Nat>>:
  loop(300n,initialized(Edge.Initialized{Engine.sharing_configuration(Edge.configured(),8n,1n),Edge.Queue{[],0n,0n}},mode),0n,mode)
