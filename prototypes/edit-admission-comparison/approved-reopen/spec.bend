import Base
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P
import ../approved-closure/spec.bend as O

# Independent inspection of a closed authority state, not a POST decision.
def closed(state: C.State) -> Bool:
  match state:
    case C.State{P.AdmissionState{_,_,_,False{},_,_,Nil{}},_,_,_,False{},_}: True{}
    case _: False{}

# Exact newly-created registry facts: one permit, original deadline, closed metadata.
# This is an expected registration record, not a call to either reducer.
def created(state: C.State, tool: Nat, start: Nat, deadline: Nat) -> C.State:
  match state:
    case C.State{P.AdmissionState{p,l,+pr,_,f,+next,_},done,n,r,_,spent}:
      C.State{P.AdmissionState{p,l,pr,False{},f,(next + 1n : Nat),
        P.Permit{next,tool,(pr + 1n : Nat),start,deadline} <> Nil{}},done,n,r,False{},spent}
