import Base
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as Canonical

# Original scenario outcome and delay go through the same shared command driver
# used by the JS consumer. This probes driver action generation, not a replay
# of events obtained from JS. The complete scenario runner also needs queue IO.
def event_code(event: Canonical.CanonicalEvent) -> Nat:
  match event:
    case Canonical.JevRequestStarted{_, _, _, _, _}: 1n
    case Canonical.JevRequestInterrupted{_, _, _, _, _}: 2n
    case Canonical.JevRequestSettled{_, _, _, _, _, Canonical.NeverSent{}, _}: 3n
    case Canonical.JevRequestSettled{_, _, _, _, _, Canonical.RequestFinding{}, _}: 4n
    case Canonical.JevRequestSettled{_, _, _, _, _, Canonical.RequestClear{}, _}: 5n
    case Canonical.JevRequestSettled{_, _, _, _, _, Canonical.RequestInterrupted{}, _}: 6n
    case _: 99n

def actions(items: List<&2, Driver.Action>) -> List<&2, Nat>:
  match items:
    case Nil{}: Nil{}
    case Driver.Action{event, delay, _, _, _} <> tail:
      event_code(event) <> delay <> actions(tail)

def handled(result: Driver.Handled) -> List<&2, Nat>:
  match result:
    case Driver.Handled{_, result}: actions(result)

def main() -> List<&2, List<&2, Nat>>:
  [handled(Driver.issued_outcome(Canonical.NeverSent{}, 1n, 1n, 1n, 2n, 1n, 5n)),
   handled(Driver.issued_outcome(Canonical.RequestFinding{}, 1n, 1n, 1n, 2n, 1n, 5n)),
   handled(Driver.issued_outcome(Canonical.RequestClear{}, 1n, 1n, 1n, 2n, 1n, 5n)),
   handled(Driver.issued_outcome(Canonical.RequestInterrupted{}, 1n, 1n, 1n, 2n, 1n, 5n))]
