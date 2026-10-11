import Base
import ../traversal/INTERPRETER_STRING_FACTS.bend as Facts

def zero_bound(number: Nat, small: {Nat.is_lt(number, 0n) == True{} : Bool}) -> Empty:
  match number:
    case 0n: Facts.internal_false_ne_true(small)
    case 1n+rest: Facts.internal_false_ne_true(small)

def step_9(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(9n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 9n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 9n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      Empty.absurd({Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 10n+rest))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 10n+rest)) : Maybe<&2, Nat>}, zero_bound(rest, small))

def step_8(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(8n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 8n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 8n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_9(rest, tail, acc, small)

def step_7(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(7n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 7n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 7n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_8(rest, tail, acc, small)

def step_6(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(6n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 6n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 6n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_7(rest, tail, acc, small)

def step_5(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(5n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 5n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 5n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_6(rest, tail, acc, small)

def step_4(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(4n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 4n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 4n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_5(rest, tail, acc, small)

def step_3(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(3n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 3n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 3n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_4(rest, tail, acc, small)

def step_2(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(2n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 2n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 2n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_3(rest, tail, acc, small)

def step_1(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(1n+remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, 1n+remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 1n+remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_2(rest, tail, acc, small)

def step_0(+remainder: Nat, +tail: String, +acc: Nat, small: {Nat.is_lt(remainder, 10n) == True{} : Bool}) ->
    {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, remainder))}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), remainder)) : Maybe<&2, Nat>}:
  match remainder:
    case 0n: {==}
    case 1n+rest:
      step_1(rest, tail, acc, small)

law digit_read:
  for +digit: Nat
  for +tail: String
  for +accumulator: Nat
  for small: {Nat.is_lt(digit, 10n) == True{} : Bool}
  {Nat.read.go(SCon{Chr{U32.from_nat(Nat.add(48n, digit))}, tail}, accumulator)
    == Nat.read.go(tail, Nat.add(Nat.mul(accumulator, 10n), digit)) : Maybe<&2, Nat>}


def digit_read(digit, tail, accumulator, small):
  step_0(digit, tail, accumulator, small)

def main() -> Unit:
  Unit{}
