import Base
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant
import ./UPDATE_HELPERS_PROOF.bend as Helpers
import ./CACHE_PROOF.bend as Cache
import ./MEMBERSHIP_PROOF.bend as Membership
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

law valid_cons:
  for -V: Data
  for +name: Nat
  for value: V
  for +rest: Own.Dictionary<V>
  for +valid: {Invariant.valid(V, rest) == True{} : Bool}
  for missing: {Own.contains(V, rest, name) == False{} : Bool}
  {Invariant.valid(V, Own.cons(V, name, value, rest)) == True{} : Bool}

# A distinct absent key stays absent after an insertion.

law missing_after_insert_distinct:
  for -V: Data
  for +name: Nat
  for +key: Nat
  for +value: V
  for +rest: Own.Dictionary<V>
  for distinct: {Nat.is_eq(name, key) == False{} : Bool}
  for missing: {Own.contains(V, rest, name) == False{} : Bool}
  {Own.contains(V, Own.set(V, rest, key, value), name) == False{} : Bool}

# Reassemble validity after the strictly smaller suffix validity theorem.

law invariant_insert_step:
  for -V: Data
  for +found: Bool
  for +name: Nat
  for +key: Nat
  for +previous: V
  for +rest: Own.Dictionary<V>
  for +value: V
  for same: {Nat.is_eq(name, key) == found : Bool}
  for valid: {Invariant.valid(V, rest) == True{} : Bool}
  for missing: {Own.contains(V, rest, name) == False{} : Bool}
  for suffix: {Invariant.valid(V, Own.set(V, rest, key, value)) == True{} : Bool}
  {
    Invariant.valid(V, Helpers.insert_head(V, found, name, previous, rest, key, value))
    == True{}
    : Bool
  }

# Successor distributes over the implementation's branch selector.

law insertion_preserves_invariant:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for value: V
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  {Invariant.valid(V, Own.set(V, catalog, key, value)) == True{} : Bool}

# The cache is the complete number of unique records on the lawful boundary.

def valid_cons(V, name, value, rest, valid, missing):
  %Cache.cached_size_exact(V, rest, valid):
    {
      Bool.and(
        Nat.is_eq((1n + Own.size(V, rest) : Nat), (1n + _ : Nat)),
        Bool.and(Bool.not(Own.contains(V, rest, name)), Invariant.valid(V, rest))
      )
      == True{}
      : Bool
    }
  %NatFacts.is_eq_refl_sym((1n + Own.size(V, rest) : Nat)):
    {
      Bool.and(_, Bool.and(Bool.not(Own.contains(V, rest, name)), Invariant.valid(V, rest)))
      == True{}
      : Bool
    }
  %Equal.sym(Bool, Own.contains(V, rest, name), False{}, missing):
    {Bool.and(True{}, Bool.and(Bool.not(_), Invariant.valid(V, rest))) == True{} : Bool}
  %Equal.sym(Bool, Invariant.valid(V, rest), True{}, valid):
    {Bool.and(True{}, Bool.and(True{}, _)) == True{} : Bool}
  {==}

def missing_after_insert_distinct(V, name, key, value, rest, distinct, missing):
  exact = Membership.insertion_membership_exact(V, rest, key, name, value)
  %Equal.sym(
    Bool,
    Own.contains(V, Own.set(V, rest, key, value), name),
    Bool.or(Nat.is_eq(name, key), Own.contains(V, rest, name)),
    exact
  ):
    {_ == False{} : Bool}
  %Equal.sym(Bool, Nat.is_eq(name, key), False{}, distinct):
    {Bool.or(_, Own.contains(V, rest, name)) == False{} : Bool}
  %Equal.sym(Bool, Own.contains(V, rest, name), False{}, missing):
    {Bool.or(False{}, _) == False{} : Bool}
  {==}

def invariant_insert_step(V, found, name, key, previous, rest, value, same, valid, missing, suffix):
  match found:
    case True{}:
      valid_cons(V, name, value, rest, valid, missing)
    case False{}:
      fresh = missing_after_insert_distinct(V, name, key, value, rest, same, missing)
      valid_cons(V, name, previous, Own.set(V, rest, key, value), suffix, fresh)

def insertion_preserves_invariant(V, catalog, key, value, valid):
  match catalog:
    case Own.DNil{}: {==}
    case Own.DCon{+name, previous, +rest, +count}:
      +saved_value = value
      +inner = BoolFacts.eq_true_of_and_right(
        Nat.is_eq(count, (1n + Invariant.records(V, rest) : Nat)),
        Bool.and(Bool.not(Own.contains(V, rest, name)), Invariant.valid(V, rest)),
        valid
      )
      +rest_valid = BoolFacts.eq_true_of_and_right(
        Bool.not(Own.contains(V, rest, name)),
        Invariant.valid(V, rest),
        inner
      )
      missing = BoolFacts.eq_false_of_not_eq_true(
        Own.contains(V, rest, name),
        BoolFacts.eq_true_of_and_left(
          Bool.not(Own.contains(V, rest, name)),
          Invariant.valid(V, rest),
          inner
        )
      )
      same = Helpers.bool_reflexive(Nat.is_eq(name, key))
      suffix = insertion_preserves_invariant(V, rest, key, saved_value, rest_valid)
      invariant_insert_step(
        V,
        Nat.is_eq(name, key),
        name,
        key,
        previous,
        rest,
        saved_value,
        same,
        rest_valid,
        missing,
        suffix
      )
