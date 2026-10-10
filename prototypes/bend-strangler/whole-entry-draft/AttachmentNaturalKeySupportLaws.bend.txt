import Base

# Fuel sufficiency for the actual existing decimal printer, with arbitrary tail.
# Unchecked read.go avoids the public Nat.read 48-bit gate.
law show_go_read:
  for +fuel: Nat
  for +number: Nat
  for +tail: String
  for enough: {Nat.is_le(number, fuel) == True{} : Bool}
  {Nat.read.go(Nat.show.go(fuel, number, tail), 0n)
    == Nat.read.go(tail, number) : Maybe<&2, Nat>}

law show_read:
  for +number: Nat
  {Nat.read.go(Nat.show(number), 0n) == Some{number} : Maybe<&2, Nat>}

def main() -> Unit:
  Unit{}
