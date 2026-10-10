import Base
import ./AttachmentNaturalKeySupportProof.bend as Support

# Private bridge for the whole resolver's three existing numeric-key Map folds.
# No fresh-string premise: uniqueness of numeric node/handle owners must imply
# uniqueness of their actual existing decimal Map keys.
law natural_key_injective:
  for +left: Nat
  for +right: Nat
  for same: {Nat.show(left) == Nat.show(right) : String}
  {left == right : Nat}

def natural_key_injective(left, right, same):
  Equal.cong(Maybe<&2, Nat>, Nat, result => Maybe.default(&2, Nat, result, 0n), Some{left}, Some{right},
    Equal.trans(Maybe<&2, Nat>, Some{left}, Nat.read.go(Nat.show(left), 0n), Some{right},
      Equal.sym(Maybe<&2, Nat>, Nat.read.go(Nat.show(left), 0n), Some{left}, Support.show_read(left)),
      Equal.trans(Maybe<&2, Nat>, Nat.read.go(Nat.show(left), 0n), Nat.read.go(Nat.show(right), 0n), Some{right},
        Equal.cong(String, Maybe<&2, Nat>, text => Nat.read.go(text, 0n), Nat.show(left), Nat.show(right), same),
        Support.show_read(right))))

def main() -> Unit:
  Unit{}
