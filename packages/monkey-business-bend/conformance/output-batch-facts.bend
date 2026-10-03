import Base
import ../OutputScenario.bend as Output
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as Canonical
import ./minimal-scenario.bend as Minimal

# Independent source-free committed batch. No per-member settlement may replace
# this exact terminal; all member rows are transient lease cleanup only.
def row(action: Driver.Action) -> List<&2,Nat>:
  match action:
    case Driver.Action{Canonical.FinishTerminal{group,round,attempt,token,selected,_},delay,_,_,_}:
      List.append(&2,Nat,[1n,delay,group,round,attempt,token],selected)
    case Driver.Action{Canonical.CollectionLeaseCheck{advice,token,_,_,_,_},delay,_,_,_}: [2n,delay,advice,token]
    case Driver.Action{Canonical.CollectionReleaseLease{advice,token},delay,_,_,_}: [3n,delay,advice,token]
    case _: [99n]

def rows(actions: List<&2,Driver.Action>) -> List<&2,List<&2,Nat>>:
  match actions:
    case Nil{}: []
    case head <> tail: row(head) <> rows(tail)

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_rows(rows(Output.issued(
    Output.Capture{Output.Finish{3n,4n,5n,6n,[7n,9n]},20n,Output.Uncertain{},5n,10n})))))
