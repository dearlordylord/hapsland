import Base

# Exact dependency extraction, unchanged statements/bodies from pinned mathlib.
# nat.bend SHA256 445fb22805af3d01f9c9a08cefcf0e5d02f2ac750a424aeb1e0f0b6836f87991
# bool.bend SHA256 e16eb7995beb28db0d5fa3ba3d70062791ac16b793d831dd8ac3db493f2d793d
# Used only to keep the same full interpreter proof gate within its 5s bound.
def le(a: Nat, b: Nat) -> Data:
  {Nat.is_le(a, b) == True{} : Bool}

def internal_false_ne_true(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

law le_refl:
  for a: Nat
  le(a, a)

def le_refl(a):
  match a:
    case 0n:
      {==}
    case 1n+p:
      le_refl(p)

law le_trans:
  for a: Nat
  for b: Nat
  for c: Nat
  for ab: le(a, b)
  for bc: le(b, c)
  le(a, c)

def le_trans(a, b, c, ab, bc):
  match a b c:
    case 0n _ 0n:
      {==}
    case 0n _ 1n+r:
      {==}
    case 1n+p 0n _:
      Empty.absurd(le(1n+p, c), internal_false_ne_true(ab))
    case 1n+p 1n+q 0n:
      Empty.absurd(le(1n+p, 0n), internal_false_ne_true(bc))
    case 1n+p 1n+q 1n+r:
      le_trans(p, q, r, ab, bc)

law eq_true_of_and_left:
  for a: Bool
  for -b: Bool
  for h: {Bool.and(a, b) == True{} : Bool}
  {a == True{} : Bool}

def eq_true_of_and_left(a, b, h):
  match a:
    case True{}:
      {==}
    case False{}:
      Empty.absurd({False{} == True{} : Bool}, internal_false_ne_true(h))

law eq_true_of_and_right:
  for a: Bool
  for -b: Bool
  for h: {Bool.and(a, b) == True{} : Bool}
  {b == True{} : Bool}

def eq_true_of_and_right(a, b, h):
  match a:
    case True{}:
      h
    case False{}:
      Empty.absurd({b == True{} : Bool}, internal_false_ne_true(h))

