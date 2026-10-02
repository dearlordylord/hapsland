import Base
import ../PermitScenario.bend as Permit
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Admission.bend as A
import ../../agent-flow-bend/Ledger.bend as L

def permits(xs: List<&2, A.AdmissionState>) -> Nat:
  match xs:
    case Nil{}: 0n
    case A.AdmissionState{_,_,_,_,_,_,items} <> tail:
      (List.length(&2,A.Permit,items) + permits(tail) : Nat)

def charged(ledger: L.Ledger) -> Nat:
  match ledger:
    case L.Ledger{_,_,charges}: List.length(&2,L.Charge,charges)

def state_row(state: C.State, rejected: Nat) -> List<&2, Nat>:
  match state:
    case C.State{ledger,rounds,work,_,_,admissions,_,_,_}:
      [rejected,permits(admissions),List.length(&2,C.Round,rounds),List.length(&2,C.Work,work),charged(ledger)]

def row(step: C.Step) -> List<&2, Nat>:
  match step:
    case C.Advanced{state,_}: state_row(state,0n)
    case C.Rejected{state,_}: state_row(state,1n)

def next_state(step: C.Step) -> C.State:
  match step:
    case C.Advanced{state,_}: state
    case C.Rejected{state,_}: state

def facts(xs: List<&2, Permit.Fact>, state: C.State) -> List<&2, List<&2, Nat>>:
  match xs:
    case Nil{}: []
    case Permit.Fact{event,_,_} <> tail:
      +result = C.step(state,event)
      row(result) <> facts(tail,next_state(result))

def scenario(outcome: Permit.PostOutcome, delay: Nat) -> List<&2, List<&2, Nat>>:
  +capture: Permit.Capture = Permit.Capture{1n,1n,7n,1n,11n,delay,outcome,32n,4096n}
  +issued = C.step(C.initial(L.Limits{512n,1000000n,16n,100000n}),Permit.issue(capture,1n))
  row(issued) <> facts(Permit.issued(capture,1n),next_state(issued))

def comma(text: String) -> String:
  match text:
    case SNil{}: ""
    case SCon{head,tail}: "," ++ SCon{head,tail}
def numbers(xs: List<&2,Nat>) -> String:
  match xs:
    case Nil{}: ""
    case h <> t: Nat.show(h) ++ comma(numbers(t))
def rows(xs: List<&2,List<&2,Nat>>) -> String:
  match xs:
    case Nil{}: ""
    case h <> t: "[" ++ numbers(h) ++ "]" ++ comma(rows(t))
def traces(xs: List<&2,List<&2,List<&2,Nat>>>) -> String:
  match xs:
    case Nil{}: ""
    case h <> t: "[" ++ rows(h) ++ "]" ++ comma(traces(t))
def main() -> IO(Unit):
  IO.print("[" ++ traces([scenario(Permit.Successful{},9n),scenario(Permit.Successful{},10n),scenario(Permit.Successful{},11n),scenario(Permit.Failed{},5n),scenario(Permit.Duplicate{},5n),scenario(Permit.Absent{},0n)]) ++ "]")
