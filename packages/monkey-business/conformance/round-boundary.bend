import Base
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger

# Native conformance probe, not a product law or alternate policy implementation.
def round_id(outputs: List<&2, Canonical.Output>) -> Nat:
  match outputs:
    case Canonical.EventEstablished{Canonical.RoundStarted{id}} <> Nil{}: id
    case _: 0n

def result(step: Canonical.Step) -> Nat:
  match step:
    case Canonical.Advanced{_, outputs}: round_id(outputs)
    case Canonical.Rejected{_, _}: 0n

def probe(partition: Nat) -> Nat:
  result(Canonical.step(Canonical.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}),
    Canonical.OpenRound{partition, 1n}))

def duplicate(step: Canonical.Step) -> Nat:
  match step:
    case Canonical.Advanced{state, _}: result(Canonical.step(state, Canonical.OpenRound{1n, 1n}))
    case Canonical.Rejected{_, _}: 9n

def main() -> List<&2, Nat>:
  duplicate(
    Canonical.step(
      Canonical.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}),
      Canonical.OpenRound{1n, 1n}
    )
  ) <>
    probe(1n) <> probe((4294967295n + 18n : Nat)) <> probe((65536n * 4294967295n + 65535n : Nat)) <> Nil{}
