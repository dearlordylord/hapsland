import Base

# Private bridge for the whole resolver's three existing numeric-key Map folds.
# No fresh-string premise: uniqueness of numeric node/handle owners must imply
# uniqueness of their actual existing decimal Map keys.
law natural_key_injective:
  for +left: Nat
  for +right: Nat
  for same: {Nat.show(left) == Nat.show(right) : String}
  {left == right : Nat}

def main() -> Unit:
  Unit{}
