import Base

# Unchecked decimal decoding used by decimal digit and natural-key proofs.
# Preserve arbitrary Nat accumulators; the public Nat.read applies a 48-bit gate.
def read(text: String, initial: Nat) -> Maybe<&2, Nat>:
  Nat.read.go(text, initial)
