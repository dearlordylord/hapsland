import Base
import ./Types.bend as Types
import ./Preparation.bend as Preparation
import ./Driver.bend as Driver
import ./Scheduler.bend as Scheduler
import ./Postprocess.bend as Postprocess
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ../agent-flow-bend/Ledger.bend as Ledger

type Transition is Data:
  Transition{state: Types.State, result: Canonical.Step}

def initial(limits: Ledger.Limits) -> Types.State:
  Types.State{Canonical.initial(limits), Nil{}, Scheduler.initial()}

def settle(graphs: List<&2, Types.GraphEntry>, scheduler: Scheduler.State, result: Canonical.Step) -> Transition:
  match result:
    case Canonical.Advanced{+state, +commands}: Transition{Types.State{state, graphs, scheduler}, Canonical.Advanced{state, commands}}
    case Canonical.Rejected{+state, +reason}: Transition{Types.State{state, graphs, scheduler}, Canonical.Rejected{state, reason}}

def step(state: Types.State, event: Canonical.CanonicalEvent) -> Transition:
  match state:
    case Types.State{canonical, graphs, scheduler}: settle(graphs, scheduler, Canonical.step(canonical, event))

def canonical(state: Types.State) -> Canonical.State:
  match state:
    case Types.State{canonical, _, _}: canonical

def graph_step(state: Types.State, key: Types.GraphKey, position: Nat, limits: ImportGraph.Limits, event: ImportGraph.GraphEvent) -> Types.GraphTransition:
  Preparation.step(state, key, position, limits, event)

def retire(state: Types.State, operation: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler}: Types.State{canonical, Preparation.retire_entries(graphs, operation), scheduler}

def handle(state: Types.State, event: Canonical.CanonicalEvent, command: Canonical.Command, context: Driver.Context) -> Driver.Handled:
  Driver.handle(canonical(state), event, command, context)

def edit(state: Types.State, partition: Nat, lifetime: Nat) -> Driver.EditPlan:
  Driver.edit(canonical(state), partition, lifetime)

def preparation_completed(partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit_bytes: List<&2, Nat>, delay: Nat) -> Driver.Action:
  Driver.preparation_completed(partition, lifetime, round, operation, unit_bytes, delay)

def after(before: Types.State, state: Types.State, event: Canonical.CanonicalEvent) -> List<&2, Driver.Action>:
  Postprocess.actions(canonical(before), canonical(state), event)

type Taken is Data:
  Taken{state: Types.State, entry: Maybe<&2, Scheduler.Entry>}

def enqueue(state: Types.State, at: Nat, order: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler}: Types.State{canonical, graphs, Scheduler.enqueue(scheduler, at, order)}

def take_result(canonical: Canonical.State, graphs: List<&2, Types.GraphEntry>, taken: Scheduler.Taken) -> Taken:
  match taken:
    case Scheduler.Taken{scheduler, entry}: Taken{Types.State{canonical, graphs, scheduler}, entry}

def take(state: Types.State) -> Taken:
  match state:
    case Types.State{canonical, graphs, scheduler}: take_result(canonical, graphs, Scheduler.take(scheduler))

def queued(state: Types.State) -> List<&2, Scheduler.Entry>:
  match state:
    case Types.State{_, _, scheduler}: Scheduler.entries(scheduler)

def cancel(state: Types.State, order: Nat) -> Types.State:
  match state:
    case Types.State{canonical, graphs, scheduler}: Types.State{canonical, graphs, Scheduler.cancel(scheduler, order)}

def fence(state: Types.State, event: Canonical.CanonicalEvent, generated: Bool, context: Driver.Context) -> Canonical.CanonicalEvent:
  Driver.fence(canonical(state), event, generated, context)

def preparation_fact_time(delay: Nat, index: Nat, count: Nat) -> Nat:
  Driver.fact_time(delay, index, count)

def revalidate(state: Types.State, context: Driver.Context) -> List<&2, Driver.Action>:
  Driver.revalidate(canonical(state), context)
