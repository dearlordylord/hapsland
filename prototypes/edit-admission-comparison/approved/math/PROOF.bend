import Base
import ../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatMath
import ../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolMath

# Proof-only adapters to pinned mathlib; no duplicated mathematical inductions.
def false_true_empty(h: {False{} == True{} : Bool}) -> Empty:
  BoolMath.false_ne_true()(h)

def true_false_empty(h: {True{} == False{} : Bool}) -> Empty:
  false_true_empty(Equal.sym(Bool, True{}, False{}, h))

def nat_eq_refl(+a: Nat) -> {Nat.is_eq(a, a) == True{} : Bool}:
  NatMath.is_eq_refl(a)

def nat_eq_true(+a: Nat, +b: Nat, h: {Nat.is_eq(a, b) == True{} : Bool}) -> {a == b : Nat}:
  NatMath.eq_of_is_eq(a,b,h)

def nat_ge_false_lt(+a: Nat, +b: Nat, h: {Nat.is_ge(a,b) == False{} : Bool}) -> {Nat.is_lt(a,b) == True{} : Bool}:
  NatMath.lt_of_not_le(b,a,Equal.trans(Bool,Nat.is_le(b,a),Nat.is_ge(a,b),False{},
    Equal.sym(Bool,Nat.is_ge(a,b),Nat.is_le(b,a),NatMath.is_ge_eq_is_le(a,b)),h))

def and_true_left(+a: Bool, +b: Bool, h: {Bool.and(a,b) == True{} : Bool}) -> {a == True{} : Bool}:
  BoolMath.eq_true_of_and_left(a,b,h)

def and_true_right(+a: Bool, +b: Bool, h: {Bool.and(a,b) == True{} : Bool}) -> {b == True{} : Bool}:
  BoolMath.eq_true_of_and_right(a,b,h)
