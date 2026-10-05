import Base
import ../StopScenario.bend as Stop
import ../../agent-flow-bend/Canonical.bend as Canonical
import ./minimal-scenario.bend as Show

def boolean(value: Bool) -> Nat:
  match value:
    case True{}: 1n
    case False{}: 0n

def row(fact: Stop.Fact) -> List<&2, Nat>:
  match fact:
    case Stop.Fact{at, Canonical.StopPolled{p,l,r,deadline}}: [at,p,l,r,boolean(deadline)]
    case _: [99n]

def rows(facts: List<&2, Stop.Fact>) -> List<&2, List<&2, Nat>>:
  match facts:
    case Nil{}: []
    case head <> tail: row(head) <> rows(tail)

# Original inputs, not public-generated events. This narrow capture ABI fixture
# is separate from the required complete Stop lifecycle native scenario.
def trace() -> List<&2, List<&2, Nat>>:
  +capture = {Stop.Capture{2n,3n,4n,5n,6n,7n,11n} : Stop.Capture}
  List.append(&2, List<&2,Nat>, rows(Stop.initial(capture)),
    [row(Stop.wake(capture,10n)),row(Stop.wake(capture,11n)),row(Stop.wake(capture,12n))])

def main() -> IO(Unit):
  IO.print(Show.bracket(Show.show_rows(trace())))
