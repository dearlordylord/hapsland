import Base
import ../CollectionScenario.bend as Scenario
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Ledger.bend as Ledger

# Original response/control facts, never JS-generated Canonical trace replay.
def code(command: C.Output) -> Nat:
  match command:
    case C.PolicyDecided{C.CollectorProceed{}}: 1n
    case C.PolicyDecided{C.CollectorUnavailable{_}}: 2n
    case C.PolicyDecided{C.CollectorFinalRelease{}}: 3n
    case C.PolicyDecided{C.CollectorFinalProceed{}}: 4n
    case C.PolicyDecided{C.CollectionBefore{}}: 5n
    case C.PolicyDecided{C.CollectionEqual{}}: 6n
    case C.PolicyDecided{C.CollectionAfter{}}: 7n
    case C.PolicyDecided{C.CollectionCandidate{}}: 8n
    case C.PolicyDecided{C.CollectionSkip{}}: 9n
    case _: 99n

def codes(outputs: List<&2, C.Output>) -> List<&2, Nat>:
  match outputs:
    case Nil{}: []
    case command <> tail: code(command) <> codes(tail)

def result(step: C.Step) -> List<&2, Nat>:
  match step:
    case C.Advanced{_, outputs}: codes(outputs)
    case C.Rejected{_, _}: [98n]

def decision(event: C.CanonicalEvent) -> List<&2, Nat>:
  result(C.step(C.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}), event))

def script() -> List<&2, List<&2, Nat>>:
  +response: Scenario.Response = Scenario.Response{1n, 2n, 3n, 7n, 17n, True{}}
  [
    decision(Scenario.gate(response, 16n, True{})),
    decision(Scenario.gate(response, 17n, True{})),
    decision(Scenario.gate(response, 16n, False{})),
    decision(Scenario.final_authority(response, False{})),
    decision(Scenario.final_authority(Scenario.Response{1n, 2n, 3n, 7n, 17n, False{}}, True{})),
    decision(Scenario.order(1n, 2n)),
    decision(Scenario.order(2n, 2n)),
    decision(Scenario.order(3n, 2n)),
    decision(Scenario.candidate(True{}, True{}, True{}, True{})),
    decision(Scenario.candidate(True{}, True{}, True{}, False{}))
  ]

def comma(text: String) -> String:
  match text:
    case SNil{}: ""
    case SCon{head, tail}: "," ++ SCon{head, tail}
def numbers(values: List<&2, Nat>) -> String:
  match values:
    case Nil{}: ""
    case head <> tail: Nat.show(head) ++ comma(numbers(tail))
def rows(values: List<&2, List<&2, Nat>>) -> String:
  match values:
    case Nil{}: ""
    case head <> tail: "[" ++ numbers(head) ++ "]" ++ comma(rows(tail))
def main() -> IO(Unit):
  IO.print("[" ++ rows(script()) ++ "]")
