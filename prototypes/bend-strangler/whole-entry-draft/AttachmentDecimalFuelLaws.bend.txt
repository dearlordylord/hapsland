import Base

# A positive decimal quotient fits the predecessor of sufficient printer fuel.
law quotient_fuel:
  for +predecessor: Nat
  for +quotient: Nat
  for +remainder: Nat
  for +number: Nat
  for +fuel_tail: Nat
  for same_quotient: {quotient == 1n+predecessor : Nat}
  for decomposition: {Nat.add(Nat.mul(quotient, 10n), remainder) == number : Nat}
  for enough: {Nat.is_le(number, 1n+fuel_tail) == True{} : Bool}
  {Nat.is_le(quotient, fuel_tail) == True{} : Bool}

def main() -> Unit:
  Unit{}
