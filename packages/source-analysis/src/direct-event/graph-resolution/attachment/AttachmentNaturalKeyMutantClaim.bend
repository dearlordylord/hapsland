import Base
import ./AttachmentNaturalKeyMutant.bend as Mutant

# Exact instance of approved injectivity: left=0, right=1; premise remains true.
def valid_premise() -> {Mutant.show(0n) == Mutant.show(1n) : String}:
  {==}

def claim() -> {0n == 1n : Nat}:
  {==}

def main() -> Unit:
  Unit{}
