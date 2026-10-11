import Base
import ./AttachmentNaturalKeyMutant.bend as Mutant

# Exact own-law instance left0/right1 of the constant-printer mutation.
def claim() -> {String.eq(Mutant.show(0n), Mutant.show(1n)) == Nat.is_eq(0n, 1n) : Bool}:
  {==}

def main() -> Unit:
  Unit{}
