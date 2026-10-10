import Base
import ./AttachmentNaturalArithmeticFacts.bend as N

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

def positive_step(+predecessor: Nat, +remainder: Nat, +number: Nat, +fuel_tail: Nat,
    decomposition: {Nat.add(Nat.mul(1n+predecessor, 10n), remainder) == number : Nat},
    enough: {Nat.is_le(number, 1n+fuel_tail) == True{} : Bool}) ->
    {Nat.is_le(1n+predecessor, fuel_tail) == True{} : Bool}:
  strict: {Nat.is_lt(1n+predecessor, Nat.mul(1n+predecessor, 10n)) == True{} : Bool} =
    %N.mul_one(1n+predecessor): {Nat.is_lt(_, Nat.mul(1n+predecessor, 10n)) == True{} : Bool}
    N.mul_lt_mul_of_pos_left(1n, 10n, predecessor, {==})
  below = N.le_of_add_eq(Nat.mul(1n+predecessor, 10n), remainder, number, decomposition)
  all: {Nat.is_lt(1n+predecessor, 1n+fuel_tail) == True{} : Bool} =
    N.lt_of_lt_of_le(1n+predecessor, number, 1n+fuel_tail,
      N.lt_of_lt_of_le(1n+predecessor, Nat.mul(1n+predecessor, 10n), number, strict, below), enough)
  %N.lt_succ_iff(1n+predecessor, fuel_tail): {_ == True{} : Bool}
  all

def quotient_finish(+predecessor: Nat, +quotient: Nat, +remainder: Nat, +number: Nat, +fuel_tail: Nat,
    +same_quotient: {quotient == 1n+predecessor : Nat},
    decomposition: {Nat.add(Nat.mul(quotient, 10n), remainder) == number : Nat},
    enough: {Nat.is_le(number, 1n+fuel_tail) == True{} : Bool}) ->
    {Nat.is_le(quotient, fuel_tail) == True{} : Bool}:
  %Equal.sym(Nat, quotient, 1n+predecessor, same_quotient):
    {Nat.is_le(_, fuel_tail) == True{} : Bool}
  positive_step(predecessor, remainder, number, fuel_tail,
    %same_quotient:
      {Nat.add(Nat.mul(_, 10n), remainder) == number : Nat}
    decomposition,
    enough)

def quotient_fuel(predecessor, quotient, remainder, number, fuel_tail, same_quotient, decomposition, enough):
  quotient_finish(predecessor, quotient, remainder, number, fuel_tail, same_quotient, decomposition, enough)

def main() -> Unit:
  Unit{}
