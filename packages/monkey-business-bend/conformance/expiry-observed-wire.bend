import Base
import ./advicee-lifecycle-driver.bend as Edge
import ../Types.bend as Types
import ../RuntimeScenarios.bend as Scenarios
import ../NoticeScenario.bend as Notice
import ../StopScenario.bend as Stop
import ../CollectionScenario.bend as Collection
import ../AdviceeLifecycle.bend as Lifecycle
import ../Scheduler.bend as Scheduler
import ../Workload.bend as Workload
import ../Driver.bend as Driver
import ../Callbacks.bend as Callbacks
import ../../agent-flow-bend/Canonical.bend as C

# Actual owner facts at each public operation. The interpreter and private
# command contexts stay internal. Lists box large values across continuations.
type BusinessState is Data:
  BusinessState{canonical: C.State, notices: Notice.State, clocks: List<&2,Notice.Clock>, collection: Collection.State, finishes: List<&2,Stop.Finish>, lifecycles: List<&2,Lifecycle.Entry>}
type Pending is Data:
  Event{at: Nat, order: Nat, action: Driver.Action, partition: Nat, lifetime: Nat}
  Arrival{at: Nat, order: Nat, event: Workload.Emission, lifetime: Nat}
  Unexpected{}
type Snapshot is Data:
  Snapshot{time: Nat, business: List<&2,BusinessState>, next_order: Nat, pending: List<&2,Pending>, jobs: Nat}
type Outcome is Data:
  Advanced{commands: List<&2,C.Command>}
  Rejected{reason: C.Reason}
type Physical is Data:
  Physical{before: List<&2,Snapshot>, after: List<&2,Snapshot>, action: Maybe<&2,Driver.Action>}
type Observation is Data:
  Canonical{before: List<&2,Snapshot>, after: List<&2,Snapshot>, time: Nat, order: Nat, event: C.CanonicalEvent, result: List<&2,Outcome>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,Physical>}
  UnexpectedObservation{}

def scenario_business(scenarios: Scenarios.State, canonical: C.State, lifecycles: List<&2,Lifecycle.Entry>) -> BusinessState:
  match scenarios:
    case Scenarios.State{_,notices,clocks,_,_,_,_,collection,_,_,Stop.State{finishes,_}}:
      BusinessState{canonical,notices,clocks,collection,finishes,lifecycles}

def business(states: List<&2,Types.State>) -> List<&2,BusinessState>:
  match states:
    case Types.State{canonical,_,_,_,_,_,_,_,_,lifecycles,_,_,scenarios} <> tail:
      scenario_business(scenarios,canonical,lifecycles) <> business(tail)
    case Nil{}: []

def scheduler_time(scheduler: Scheduler.State) -> Nat:
  match scheduler:
    case Scheduler.State{_,now}: now

def state_time(state: Types.State) -> Nat:
  match state:
    case Types.State{_,_,scheduler,_,_,_,_,_,_,_,_,_,_}: scheduler_time(scheduler)

def pending(items: List<&2,Edge.Item>) -> List<&2,Pending>:
  match items:
    case Nil{}: []
    case Edge.Item{at,order,Edge.Event{action,Edge.NoJob{partition,lifetime},_,_}} <> tail:
      Event{at,order,action,partition,lifetime} <> pending(tail)
    case Edge.Item{at,order,Edge.Arrival{event,lifetime}} <> tail:
      Arrival{at,order,event,lifetime} <> pending(tail)
    case _ <> tail: Unexpected{} <> pending(tail)

def snapshots(runtime: List<&2,Edge.Runtime>) -> List<&2,Snapshot>:
  match runtime:
    case Edge.Runtime{+state,Edge.Queue{items,sequence,_},jobs,_} <> tail:
      Snapshot{state_time(state),business([state]),sequence,pending(items),List.length(&2,Edge.Stored,jobs)} <> snapshots(tail)
    case Nil{}: []

def outcome(results: List<&2,C.Step>) -> List<&2,Outcome>:
  match results:
    case Nil{}: []
    case C.Advanced{_,commands} <> tail: Advanced{commands} <> outcome(tail)
    case C.Rejected{_,reason} <> tail: Rejected{reason} <> outcome(tail)

def physical(values: List<&2,Edge.PhysicalDelivery>) -> List<&2,Physical>:
  match values:
    case Nil{}: []
    case Edge.PhysicalDelivery{before,after,action} <> tail:
      Physical{snapshots(before),snapshots(after),action} <> physical(tail)

def observation(frame: Edge.ObservedFrame) -> Observation:
  match frame:
    case Edge.CanonicalFrame{_,_,time,order,event,result,before,after,provided,scopes,receipt,effects}:
      Canonical{snapshots(before),snapshots(after),time,order,event,outcome(result),provided,scopes,receipt,physical(effects)}
    case _: UnexpectedObservation{}
