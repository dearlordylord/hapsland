import Base

# Exact existing is_eq_refl theorem and proof extracted from
# vendor/bendlib/packages/bend-mathlib/nat.bend.
# Source SHA256: 445fb22805af3d01f9c9a08cefcf0e5d02f2ac750a424aeb1e0f0b6836f87991
# Exact universal scope reuse approved by Astra, 2026-10-10.
# Direct dependency of matching own-invocation cancellation.

# Every natural tests equal to itself.
law is_eq_refl:
  for n: Nat
  {Nat.is_eq(n, n) == True{} : Bool}

def is_eq_refl(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      is_eq_refl(p)

# Exact existing eq_of_is_eq and its Bool eliminator from the same pinned
# mathlib source; unchanged universal scope approved by Astra, 2026-10-10.
def internal_false_ne_true(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

# If the equality test says true, the naturals are equal.
law eq_of_is_eq:
  for a: Nat
  for b: Nat
  for h: {Nat.is_eq(a, b) == True{} : Bool}
  {a == b : Nat}

def eq_of_is_eq(a, b, h):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      Empty.absurd({0n == 1n+q : Nat}, internal_false_ne_true(h))
    case 1n+p 0n:
      Empty.absurd({1n+p == 0n : Nat}, internal_false_ne_true(h))
    case 1n++p 1n++q:
      %eq_of_is_eq(p, q, h) : {1n+p == 1n+_ : Nat}
      {==}

def main() -> Unit:
  Unit{}
