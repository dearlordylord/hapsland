import Base

# Boolean observation of the proved existing decimal-key injection.
# Used by the complete index lookup and grouping's numeric owner projection.
law natural_key_equality:
  for +left: Nat
  for +right: Nat
  {String.eq(Nat.show(left), Nat.show(right)) == Nat.is_eq(left, right) : Bool}

def main() -> Unit:
  Unit{}
