import Base

def digit_0(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(48n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 0n)) : Maybe<&2, Nat>}:
  {==}

def digit_1(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(49n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 1n)) : Maybe<&2, Nat>}:
  {==}

def digit_2(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(50n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 2n)) : Maybe<&2, Nat>}:
  {==}

def digit_3(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(51n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 3n)) : Maybe<&2, Nat>}:
  {==}

def digit_4(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(52n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 4n)) : Maybe<&2, Nat>}:
  {==}

def digit_5(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(53n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 5n)) : Maybe<&2, Nat>}:
  {==}

def digit_6(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(54n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 6n)) : Maybe<&2, Nat>}:
  {==}

def digit_7(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(55n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 7n)) : Maybe<&2, Nat>}:
  {==}

def digit_8(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(56n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 8n)) : Maybe<&2, Nat>}:
  {==}

def digit_9(+tail: String, +acc: Nat) -> {Nat.read.go(SCon{Chr{U32.from_nat(57n)}, tail}, acc) == Nat.read.go(tail, Nat.add(Nat.mul(acc, 10n), 9n)) : Maybe<&2, Nat>}:
  {==}

def main() -> Unit:
  Unit{}
