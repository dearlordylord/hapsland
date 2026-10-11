import Base
import ./AttachmentNaturalArithmeticFacts.bend as N
import ./AttachmentDecimalDigitProof.bend as Digit
import ./AttachmentDecimalFuelProof.bend as Fuel

def pair_eta(result: Nat & Nat) ->
    {result == Tuple{Pair.fst(Nat, Nat, result), Pair.snd(Nat, Nat, result)} : Nat & Nat}:
  match result:
    case (q, r): {==}

def decimal_pair(+number: Nat) ->
    {Nat.divmod(number, 10n) == Tuple{Nat.div(number, 10n), Nat.mod(number, 10n)} : Nat & Nat}:
  pair_eta(Nat.divmod(number, 10n))

def digit_finish(+quotient: Nat, +remainder: Nat, +number: Nat, +tail: String,
    small: {Nat.is_lt(remainder, 10n) == True{} : Bool},
    +decomposition: {Nat.add(Nat.mul(quotient, 10n), remainder) == number : Nat}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, remainder))}, tail}, quotient)
      == Nat.read.go(tail, number) : Maybe<&2, Nat>}:
  %decomposition: {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, remainder))}, tail}, quotient)
      == Nat.read.go(tail, _) : Maybe<&2, Nat>}
  Digit.digit_read(remainder, tail, quotient, small)

def fin_read(+fuel_tail: Nat, +quotient: Nat, +remainder: Nat, +number: Nat, +tail: String,
    small: {Nat.is_lt(remainder, 10n) == True{} : Bool},
    +decomposition: {Nat.add(Nat.mul(quotient, 10n), remainder) == number : Nat},
    enough: {Nat.is_le(number, 1n+fuel_tail) == True{} : Bool},
    recursive: {Nat.is_le(quotient, fuel_tail) == True{} : Bool} ->
      {Nat.read.go(Nat.show.go(fuel_tail, quotient, SCon{Chr{U32.from_nat(Nat.add(48n, remainder))}, tail}), 0n)
        == Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, remainder))}, tail}, quotient) : Maybe<&2, Nat>}) ->
    {Nat.read.go(Nat.show.fin(fuel_tail, tail, Nat.show.put(Tuple{quotient, remainder})), 0n)
      == Nat.read.go(tail, number) : Maybe<&2, Nat>}:
  match quotient:
    case 0n:
      digit_finish(0n, remainder, number, tail, small, decomposition)
    case 1n+predecessor:
      Equal.trans(Maybe<&2, Nat>,
        Nat.read.go(Nat.show.go(fuel_tail, 1n+predecessor, SCon{Chr{U32.from_nat(Nat.add(48n, remainder))}, tail}), 0n),
        Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, remainder))}, tail}, 1n+predecessor),
        Nat.read.go(tail, number),
        recursive(Fuel.quotient_fuel(predecessor, 1n+predecessor, remainder, number, fuel_tail, {==}, decomposition, enough)),
        digit_finish(1n+predecessor, remainder, number, tail, small, decomposition))

law show_go_read:
  for +fuel: Nat
  for +number: Nat
  for +tail: String
  for enough: {Nat.is_le(number, fuel) == True{} : Bool}
  {Nat.read.go(Nat.show.go(fuel, number, tail), 0n)
    == Nat.read.go(tail, number) : Maybe<&2, Nat>}

def show_go_read(fuel, number, tail, enough):
  match fuel:
    case 0n:
      %Equal.sym(Nat, number, 0n, N.le_zero_eq(number, enough)):
        {Nat.read.go(tail, 0n) == Nat.read.go(tail, _) : Maybe<&2, Nat>}
      {==}
    case 1n+fuel_tail:
      %Equal.sym(Nat & Nat, Nat.divmod(number, 10n), Tuple{Nat.div(number, 10n), Nat.mod(number, 10n)}, decimal_pair(number)):
        {Nat.read.go(Nat.show.fin(fuel_tail, tail, Nat.show.put(_)), 0n)
          == Nat.read.go(tail, number) : Maybe<&2, Nat>}
      fin_read(fuel_tail, Nat.div(number, 10n), Nat.mod(number, 10n), number, tail,
        N.mod_lt(number, 9n), N.div_mod_eq(number, 9n), enough,
        bound => show_go_read(fuel_tail, Nat.div(number, 10n), SCon{Chr{U32.from_nat(Nat.add(48n, Nat.mod(number, 10n)))}, tail}, bound))

law show_read:
  for +number: Nat
  {Nat.read.go(Nat.show(number), 0n) == Some{number} : Maybe<&2, Nat>}

def show_read(number):
  %Equal.sym(Nat & Nat, Nat.divmod(number, 10n), Tuple{Nat.div(number, 10n), Nat.mod(number, 10n)}, decimal_pair(number)):
    {Nat.read.go(Nat.show.fin(number, SNil{}, Nat.show.put(_)), 0n)
      == Some{number} : Maybe<&2, Nat>}
  fin_read(number, Nat.div(number, 10n), Nat.mod(number, 10n), number, SNil{},
    N.mod_lt(number, 9n), N.div_mod_eq(number, 9n), N.le_succ(number),
    bound => show_go_read(number, Nat.div(number, 10n), SCon{Chr{U32.from_nat(Nat.add(48n, Nat.mod(number, 10n)))}, SNil{}}, bound))

def main() -> Unit:
  Unit{}
