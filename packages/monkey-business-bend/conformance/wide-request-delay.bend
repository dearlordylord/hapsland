import Base
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as Canonical

# Native execution probe: retain a source-free effect delay above U32 exactly.
def delay(actions: List<&2, Driver.Action>) -> Nat:
  match actions:
    case Driver.Action{_, value, _, _, _} <> Nil{}: value
    case _: 0n

def handled(result: Driver.Handled) -> Nat:
  match result:
    case Driver.Handled{_, actions}: delay(actions)

def main() -> IO(Unit):
  IO.print(Nat.show(handled(Driver.issued_outcome(Canonical.NeverSent{},
    1n, 1n, 1n, 2n, 1n, Nat.add(U32.to_nat(4294967295), 18n)))))
