import Base
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant

# Representation support only; the complete DFS/String correspondence is unchanged.
law uint32_power_route_exact:
  for +key: Nat
  for +divisor: Nat
  for key_valid: {Invariant.key_valid(key) == True{} : Bool}
  for divisor_valid: {Invariant.power_valid(divisor) == True{} : Bool}
  {Own.zero_bit(key, divisor)
    == Nat.is_eq(Nat.mod(Nat.div(key, divisor), 2n), 0n) : Bool}
