import Base

# Verbatim transitive existing proof dependency extraction.
# Source vendor/bendlib/packages/bend-mathlib/bool.bend SHA256 e16eb7995beb28db0d5fa3ba3d70062791ac16b793d831dd8ac3db493f2d793d
# No theorem domains or bodies changed; selected for the original String graph gate.

law or_comm:
  for a: Bool
  for b: Bool
  {Bool.or(a, b) == Bool.or(b, a) : Bool}

def or_comm(a, b):
  match a b:
    case True{} True{}:
      {==}
    case True{} False{}:
      {==}
    case False{} True{}:
      {==}
    case False{} False{}:
      {==}

law or_assoc:
  for a: Bool
  for -b: Bool
  for -c: Bool
  {Bool.or(Bool.or(a, b), c) == Bool.or(a, Bool.or(b, c)) : Bool}

def or_assoc(a, b, c):
  match a:
    case True{}:
      {==}
    case False{}:
      {==}

law or_false:
  for a: Bool
  {Bool.or(a, False{}) == a : Bool}

def or_false(a):
  match a:
    case True{}:
      {==}
    case False{}:
      {==}

def internal_false_ne_true(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

law cmp_refl:
  for b: Bool
  {Bool.cmp(b, b) == EQ{} : Cmp}

def cmp_refl(b):
  match b:
    case True{}:
      {==}
    case False{}:
      {==}

law eq_of_cmp_eq:
  for a: Bool
  for b: Bool
  for h: {Cmp.is_eq(Bool.cmp(a, b)) == True{} : Bool}
  {a == b : Bool}

def eq_of_cmp_eq(a, b, h):
  match a b:
    case True{} True{}:
      {==}
    case False{} False{}:
      {==}
    case True{} False{}:
      Empty.absurd({True{} == False{} : Bool}, internal_false_ne_true(h))
    case False{} True{}:
      Empty.absurd({False{} == True{} : Bool}, internal_false_ne_true(h))

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

law and_eq_true:
  for a: Bool
  for -b: Bool
  for ha: {a == True{} : Bool}
  for hb: {b == True{} : Bool}
  {Bool.and(a, b) == True{} : Bool}

def and_eq_true(a, b, ha, hb):
  match a:
    case True{}:
      hb
    case False{}:
      Empty.absurd({Bool.and(False{}, b) == True{} : Bool}, internal_false_ne_true(ha))

law or_false_sym:
  for a: Bool
  {a == Bool.or(a, False{}) : Bool}

def or_false_sym(a):
  Equal.sym(Bool, Bool.or(a, False{}), a, or_false(a))
