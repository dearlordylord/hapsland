import Base
import ../core.bend as C
import ../spec.bend as S
import ../../../packages/agent-flow-bend/Admission.bend as P

type Outcome is Data:
  Outcome{accepted: Nat, round: Nat, active: Bool}

def outcome(+state: C.State) -> Outcome:
  Outcome{C.count(state),C.round(state),C.active(state)}

def permit_active(state: P.AdmissionState) -> Bool:
  match state:
    case P.AdmissionState{_,_,_,active,_,_,_}: active

def pending(tool: Nat,state: C.State) -> Bool:
  P.has_tool(tool,C.get_pending(C.get_permit(state)))

def start(found: Maybe<&2,P.Permit>) -> Nat:
  match found:
    case None{}: 0n
    case Some{P.Permit{_,_,_,start,_}}: start

def pre_start(tool: Nat,state: C.State) -> Nat:
  start(S.find_tool(tool,S.permits(C.get_permit(state))))
