import Base
import ./writer-original-inputs.bend as Inputs
import ./sharing-observed-initial.bend as Initial
import ./sharing-original-inputs.bend as Shared
import ./advicee-lifecycle-driver.bend as Edge
import ../../agent-flow-bend/Canonical.bend as C

# Plain original edits carry no revision/sharing labels. The existing owner
# declares sessions and Workload arrivals; this adapter only appends their
# original public edit payloads, using the declared advicee scope once.
def selected(found: Maybe<&2,Initial.Agent>, edit: Inputs.Edit, runtime: List<&2,Edge.Runtime>,
    +agents: List<&2,Initial.Agent>, originals: List<&2,Initial.QueuedOriginal>, ih: Initial.Initialized -> Initial.Initialized) -> Initial.Initialized:
  match found edit runtime:
    case Some{Initial.Agent{_,p,l}} Inputs.Edit{_,at,bytes,units} Edge.Runtime{state,queue,jobs,delay} <> Nil{}:
      ih(Initial.Initialized{[Edge.Runtime{state,Edge.append(queue,at,Edge.Edit{Edge.Job{p,l,bytes,units,C.RequestFinding{}}}),jobs,delay}],agents,originals,True{}})
    case _ _ runtime: Initial.Initialized{runtime,agents,originals,False{}}

def shared_initialized(+agent: String, at: Nat, bytes: Nat, units: List<&2,Nat>, subject: String, input: String, namespace: Shared.Namespace,
    initial: Initial.Initialized, ih: Initial.Initialized -> Initial.Initialized) -> Initial.Initialized:
  match initial:
    case Initial.Initialized{runtime <> Nil{},+agents,originals,True{}}:
      ih(Initial.edit_selected(Initial.agent(agents,agent),Shared.Edit{agent,at,bytes,units,subject,input,namespace},runtime,agents,originals,
        next => captured => Initial.Initialized{[next],agents,captured,True{}}))
    case initial: initial

def shared(original_input: Shared.Edit, initial: Initial.Initialized, ih: Initial.Initialized -> Initial.Initialized) -> Initial.Initialized:
  match original_input:
    case Shared.Edit{agent,at,bytes,units,subject,input,namespace}:
      shared_initialized(agent,at,bytes,units,subject,input,namespace,initial,ih)

def edits(list: List<&2,Inputs.Edit>, initial: Initial.Initialized) -> Initial.Initialized:
  match list initial:
    case Nil{} initial: initial
    case Inputs.SharedEdit{+original} <> tail Initial.Initialized{runtime,agents,originals,True{}}:
      shared(original,Initial.Initialized{runtime,agents,originals,True{}},next => edits(tail,next))
    case Inputs.Edit{+agent,at,bytes,units} <> tail Initial.Initialized{runtime,+agents,originals,True{}}:
      selected(Initial.agent(agents,agent),Inputs.Edit{agent,at,bytes,units},runtime,agents,originals,next => edits(tail,next))
    case _ initial: initial

def delayed(initial: Initial.Initialized, delay: Nat) -> Initial.Initialized:
  match initial:
    case Initial.Initialized{Edge.Runtime{state,queue,jobs,_} <> Nil{},agents,originals,valid}:
      Initial.Initialized{[Edge.Runtime{state,queue,jobs,delay}],agents,originals,valid}
    case initial: initial

def initialize(configuration: Shared.Configuration, originals: List<&2,Inputs.Edit>, delay: Nat) -> Initial.Initialized:
  edits(originals,delayed(Initial.configured(configuration),delay))

# Reuse the sharing owner's original queue-order capture, without deriving a
# revision key or member scope from current state.
