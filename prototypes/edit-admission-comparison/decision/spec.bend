import Base
import ../core.bend as C
import ../spec.bend as S
import ../../../packages/agent-flow-bend/Admission.bend as P

type Boundary is Data:
  Boundary{round: Nat, active: Bool}

# Hidden native chronology is removed only for comparing observable histories.
def observable(events: List<&2,C.TraceEvent>) -> List<&2,C.TraceEvent>:
  match events:
    case Nil{}: Nil{}
    case C.NativeStart{_,_} <> rest: observable(rest)
    case C.NativeComplete{_,_} <> rest: observable(rest)
    case event <> rest: event <> observable(rest)

def start_of(found: Maybe<&2,P.Permit>) -> Nat:
  match found:
    case None{}: 0n
    case Some{P.Permit{_,_,_,start,_}}: start

def correlated_start(+state: C.State, tool: Nat) -> Nat:
  start_of(S.find_tool(tool,S.permits(C.get_permit(state))))
