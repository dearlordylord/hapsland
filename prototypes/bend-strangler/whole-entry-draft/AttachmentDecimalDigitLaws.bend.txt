import Base

# The actual printer's remainder digit advances the unchecked decoder exactly once.
law digit_read:
  for +digit: Nat
  for +tail: String
  for +accumulator: Nat
  for small: {Nat.is_lt(digit, 10n) == True{} : Bool}
  {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, digit))}, tail}, accumulator)
    == Nat.read.go(tail, Nat.add(Nat.mul(accumulator, 10n), digit)) : Maybe<&2, Nat>}

def main() -> Unit:
  Unit{}
