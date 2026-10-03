import Base
import ./advicee-lifecycle-driver.bend as Edge
import ./sharing-original-inputs.bend as Inputs
import ./sharing-original-captures.bend as Originals
import ./sharing-observed-capture.bend as Capture
import ../FreshnessScenario.bend as Freshness
import ../../agent-flow-bend/Canonical.bend as C
import ../Driver.bend as Driver
import ../CacheRuntime.bend as CacheRuntime

# Updated original facts travel linearly beside the actual Edge interpreter.
# No hook invents a Canonical command, freshness result or sharing disposition.
type Facts is Data:
  Facts{labels: Originals.Labels, originals: List<&2,Originals.Original>,
    current: Maybe<&2,Inputs.Edit>, event: Maybe<&2,C.CanonicalEvent>, now: Nat, job: Maybe<&2,Edge.Job>}

# The selected scheduler payload supplies event/job facts. Graph facts and
# workload arrivals have neither; they must not borrow a fabricated event.
def selected(input: Edge.Input, labels: Originals.Labels,
    originals: List<&2,Originals.Original>, current: Maybe<&2,Inputs.Edit>, now: Nat) -> Facts:
  match input:
    case Edge.Edit{job}: Facts{labels,originals,current,None{},now,Some{job}}
    case Edge.Event{Driver.Action{event,_,_,_,_},job}:
      Facts{labels,originals,current,Some{event},now,Some{job}}
    case Edge.FitEvent{Driver.Action{event,_,_,_,_},job,_}:
      Facts{labels,originals,current,Some{event},now,Some{job}}
    case Edge.Cache{fact,job}: Facts{labels,originals,current,Some{CacheRuntime.fact_event(fact)},now,Some{job}}
    case _: Facts{labels,originals,current,None{},now,None{}}

def unchanged(+runtime: List<&2,Edge.Runtime>, facts: Facts) -> Capture.Captured:
  match facts:
    case Facts{labels,originals,_,_,_,_}: Capture.Captured{runtime,labels,originals,Edge.runtime_valid(runtime)}

def missing(runtime: List<&2,Edge.Runtime>, facts: Facts) -> Capture.Captured:
  match facts:
    case Facts{labels,originals,_,_,_,_}: Capture.Captured{runtime,labels,originals,False{}}

def admission(current: Maybe<&2,Inputs.Edit>, runtime: List<&2,Edge.Runtime>, facts: Facts,
    scope: Freshness.Scope, command: C.Command) -> Capture.Captured:
  match current facts:
    case Some{edit} Facts{labels,originals,_,_,now,Some{job}}:
      Capture.admitted(labels,runtime,originals,scope,edit,command,now,job)
    case _ facts: missing(runtime,facts)

def prepared_original(original: Maybe<&2,Originals.Original>, runtime: List<&2,Edge.Runtime>,
    facts: Facts, +scope: Freshness.Scope) -> Capture.Captured:
  match original facts:
    case Some{Originals.Original{_,+edit}} Facts{labels,originals,_,_,_,_}:
      Capture.prepared(labels,runtime,List.append(&2,Originals.Original,originals,[Originals.Original{scope,edit}]),scope,edit)
    case _ facts: missing(runtime,facts)

def preparing(runtime: List<&2,Edge.Runtime>, facts: Facts, +parent: Freshness.Scope,
    scope: Freshness.Scope) -> Capture.Captured:
  match facts:
    case Facts{labels,+originals,current,event,now,job}:
      prepared_original(Originals.original(originals,parent),runtime,Facts{labels,originals,current,event,now,job},scope)

def inherited_original(original: Maybe<&2,Originals.Original>, +runtime: List<&2,Edge.Runtime>,
    facts: Facts, +scope: Freshness.Scope) -> Capture.Captured:
  match original facts:
    case Some{Originals.Original{_,edit}} Facts{labels,originals,_,_,_,_}:
      Capture.Captured{runtime,labels,List.append(&2,Originals.Original,originals,[Originals.Original{scope,edit}]),Edge.runtime_valid(runtime)}
    case _ facts: missing(runtime,facts)

def inheriting(runtime: List<&2,Edge.Runtime>, facts: Facts, parent: Freshness.Scope,
    scope: Freshness.Scope) -> Capture.Captured:
  match facts:
    case Facts{labels,+originals,current,event,now,job}:
      inherited_original(Originals.original(originals,parent),runtime,Facts{labels,originals,current,event,now,job},scope)

def command(+facts: Facts, +actual: C.Command, runtime: List<&2,Edge.Runtime>) -> Capture.Captured:
  match facts actual:
    case Facts{_,_,+current,Some{C.AdmitObservation{p,l,r}},_,_} C.ObservationAdmitted{id}:
      admission(current,runtime,facts,Freshness.Scope{p,l,r,id},actual)
    case Facts{_,_,_,Some{C.BeginObservedPreparation{+p,+l,+r,observation,_}},_,_} C.Prepare{operation,_}:
      preparing(runtime,facts,Freshness.Scope{p,l,r,observation},Freshness.Scope{p,l,r,operation})
    case Facts{_,_,_,Some{C.PreparationCompleted{+p,+l,+r,operation,_}},_,_} C.UnitAdmitted{child,_,_,_,_}:
      inheriting(runtime,facts,Freshness.Scope{p,l,r,operation},Freshness.Scope{p,l,r,child})
    case facts _: unchanged(runtime,facts)

def updated(result: Capture.Captured, facts: Facts) -> Maybe<&2,Facts>:
  match result facts:
    case Capture.Captured{_,labels,originals,True{}} Facts{_,_,current,event,now,job}:
      Some{Facts{labels,originals,current,event,now,job}}
    case _ _: None{}

# This helper returns the actual runtime and the updated factual snapshot. The
# recursion lives only in factory below, and decreases the original command list.
def applied(result: Capture.Captured, facts: Facts) -> List<&2,Edge.Runtime> & Maybe<&2,Facts>:
  match result:
    case Capture.Captured{+runtime,labels,originals,valid}:
      (runtime,updated(Capture.Captured{runtime,labels,originals,valid},facts))

def following(facts: Maybe<&2,Facts>, runtime: List<&2,Edge.Runtime>,
    previous: Facts, ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match facts:
    case Some{facts}: (runtime,ih(facts))
    case None{}: (runtime,Edge.HookFault{previous})

def completed_runtime(+runtime: List<&2,Edge.Runtime>, facts: Maybe<&2,Facts>,
    previous: Facts, ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match runtime:
    case _ <> Nil{}: following(facts,runtime,previous,ih)
    case runtime: (runtime,Edge.HookFault{previous})

def completed(result: List<&2,Edge.Runtime> & Maybe<&2,Facts>, previous: Facts,
    ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  (runtime,facts)=result
  completed_runtime(runtime,facts,previous,ih)

# Factory recursion is structurally bounded by the actual command tail. Each
# apply produces fresh captures from the current command and current runtime.
def factory(list: List<&2,C.Command>, facts: Facts) -> Edge.CommandHook<Facts>:
  match list:
    case Nil{}: Edge.HookEnd{facts}
    case _ <> rest:
      Edge.HookNext{facts,state => event => command => context => Edge.default_handler(state,event,command,context),+current => actual => runtime =>
        completed(applied(command(current,actual,runtime),current),current,
          updated => factory(rest,updated))}
