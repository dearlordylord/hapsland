import Base
import ./RuntimeNatProof.bend as N
import ./Environment.bend as E
import ./WholeObservation.bend as O

# Boolean and equality facts only support the original exact retirement law.
# The statement imposes no additional lease ownership/freshness premise.
def and_left(+a: Bool, b: Bool, h: {Bool.and(a, b) == True{} : Bool}) -> {a == True{} : Bool}:
  match a b:
    case True{} True{}: {==}
    case True{} False{}: {==}
    case False{} True{}: Empty.absurd({False{} == True{} : Bool}, N.internal_false_ne_true(h))
    case False{} False{}: Empty.absurd({False{} == True{} : Bool}, N.internal_false_ne_true(h))

def and_right(a: Bool, +b: Bool, h: {Bool.and(a, b) == True{} : Bool}) -> {b == True{} : Bool}:
  match a b:
    case True{} True{}: {==}
    case True{} False{}: Empty.absurd({False{} == True{} : Bool}, N.internal_false_ne_true(h))
    case False{} True{}: {==}
    case False{} False{}: Empty.absurd({False{} == True{} : Bool}, N.internal_false_ne_true(h))

def lease_components(+eo: Nat, +ei: Nat, +ao: Nat, +ai: Nat,
 +h: {Bool.and(Nat.is_eq(eo, ao), Nat.is_eq(ei, ai)) == True{} : Bool}) -> {
 O.ProviderLease{eo, ei} == O.ProviderLease{ao, ai} : O.ProviderLease
}:
  %N.eq_of_is_eq(eo, ao, and_left(Nat.is_eq(eo, ao), Nat.is_eq(ei, ai), h)) : {
    O.ProviderLease{eo, ei} == O.ProviderLease{_, ai} : O.ProviderLease
  }
  %N.eq_of_is_eq(ei, ai, and_right(Nat.is_eq(eo, ao), Nat.is_eq(ei, ai), h)) : {
    O.ProviderLease{eo, ei} == O.ProviderLease{eo, _} : O.ProviderLease
  }
  {==}

def same_lease_sound(+expected: O.ProviderLease, +actual: O.ProviderLease,
 h: {E.same_lease(expected, actual) == True{} : Bool}) -> {expected == actual : O.ProviderLease}:
  match expected actual:
    case O.ProviderLease{eo, ei} O.ProviderLease{ao, ai}: lease_components(eo, ei, ao, ai, h)

def main() -> Unit:
  Unit{}
