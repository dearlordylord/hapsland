import Base
import ./advicee-lifecycle-driver.bend as Edge
import ./sharing-original-inputs.bend as Inputs
import ./sharing-original-captures.bend as Captures
import ../Engine.bend as Engine
import ../FreshnessScenario.bend as Freshness
import ../SharingScenario.bend as Sharing
import ../../agent-flow-bend/Canonical.bend as C

# The caller supplies the original job attached to the actually selected queue
# item and the actual command/event scope. Engine validates every publication.
type Captured is Data:
  Captured{runtime: List<&2,Edge.Runtime>, labels: Captures.Labels,
    originals: List<&2,Captures.Original>, valid: Bool}

def admitted_result(result: Engine.FreshnessAdmission, labels: Captures.Labels,
    originals: List<&2,Captures.Original>, +scope: Freshness.Scope, edit: Inputs.Edit,
    queue: Edge.Queue, jobs: List<&2,Edge.Stored>, now: Nat, job: Edge.Job, delay: Nat) -> Captured:
  match result:
    case Engine.FreshnessAdmission{state,Some{_},actions}:
      Captured{[Edge.issued(Engine.issue_actions(state,actions),queue,jobs,now,job,delay)],labels,
        List.append(&2,Captures.Original,originals,[Captures.Original{scope,edit}]),True{}}
    case Engine.FreshnessAdmission{state,None{},_}:
      Captured{[Edge.Runtime{state,queue,jobs,delay}],labels,originals,False{}}

def admitted_source(source: Captures.SourceCapture, runtime: List<&2,Edge.Runtime>,
    originals: List<&2,Captures.Original>, +scope: Freshness.Scope, edit: Inputs.Edit,
    command: C.Command, now: Nat, job: Edge.Job) -> Captured:
  match source runtime:
    case Captures.SourceCapture{labels,source} Edge.Runtime{state,queue,jobs,delay} <> Nil{}:
      admitted_result(Engine.sharing_admitted(state,scope,source,command),labels,originals,scope,edit,queue,jobs,now,job,delay)
    case Captures.SourceCapture{labels,_} runtime: Captured{runtime,labels,originals,False{}}

def admitted(labels: Captures.Labels, runtime: List<&2,Edge.Runtime>,
    originals: List<&2,Captures.Original>, scope: Freshness.Scope, +edit: Inputs.Edit,
    command: C.Command, now: Nat, job: Edge.Job) -> Captured:
  admitted_source(Captures.source(labels,edit),runtime,originals,scope,edit,command,now,job)

def prepared_result(result: Engine.SharingCapture, labels: Captures.Labels,
    originals: List<&2,Captures.Original>, queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, delay: Nat) -> Captured:
  match result:
    case Engine.SharingCapture{state,_,valid}:
      Captured{[Edge.Runtime{state,queue,jobs,delay}],labels,originals,valid}

def prepared_identity(identity: Captures.Interned, runtime: List<&2,Edge.Runtime>,
    originals: List<&2,Captures.Original>, +scope: Freshness.Scope, sizes: List<&2,Nat>) -> Captured:
  match identity runtime scope:
    case Captures.Interned{labels,id} Edge.Runtime{state,queue,jobs,delay} <> Nil{} Freshness.Scope{+p,l,r,o}:
      prepared_result(Engine.sharing_prepare(state,Freshness.Scope{p,l,r,o},[Sharing.SharingKey{p,id}],sizes),labels,originals,queue,jobs,delay)
    case Captures.Interned{labels,_} runtime _: Captured{runtime,labels,originals,False{}}

def prepared(labels: Captures.Labels, runtime: List<&2,Edge.Runtime>,
    originals: List<&2,Captures.Original>, scope: Freshness.Scope, +edit: Inputs.Edit) -> Captured:
  match edit:
    case Inputs.Edit{_,_,_,sizes,_,_,_}:
      prepared_identity(Captures.prepared(labels,edit),runtime,originals,scope,sizes)
