import Base
import ./Own.bend as Own
import ./UPDATE_HELPERS_PROOF.bend as Helpers
import ./RECORDS_PROOF.bend as Records
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

law membership_insert_step:
  for -V: Data
  for +found: Bool
  for +name: Nat
  for +key: Nat
  for +other: Nat
  for +previous: V
  for +rest: Own.Dictionary<V>
  for +value: V
  for same: {Nat.is_eq(name, key) == found : Bool}
  for suffix: {
    Own.contains(V, Own.set(V, rest, key, value), other)
    == Bool.or(Nat.is_eq(other, key), Own.contains(V, rest, other))
    : Bool
  }
  {
    Own.contains(V, Helpers.insert_head(V, found, name, previous, rest, key, value), other)
    == Bool.or(Nat.is_eq(other, key), Own.contains(V, Own.cons(V, name, previous, rest), other))
    : Bool
  }

# The constructor extends a valid suffix with a fresh key and the exact count.

law insertion_membership_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for +other: Nat
  for value: V
  {Own.contains(V, Own.set(V, catalog, key, value), other)
    == Bool.or(Nat.is_eq(other, key), Own.contains(V, catalog, other)) : Bool}

# Unique keys and independently counted cached lengths survive updates.

def membership_insert_step(V, found, name, key, other, previous, rest, value, same, suffix):
  match found:
    case True{}:
      %NatFacts.eq_of_is_eq(name, key, same):
        {
          Own.contains(V, Own.cons(V, name, value, rest), other)
          == Bool.or(Nat.is_eq(other, _), Own.contains(V, Own.cons(V, name, previous, rest), other))
          : Bool
        }
      %NatFacts.is_eq_comm(name, other):
        {
          Own.contains(V, Own.cons(V, name, value, rest), other)
          == Bool.or(_, Own.contains(V, Own.cons(V, name, previous, rest), other))
          : Bool
        }
      Helpers.membership_head_repeat(Nat.is_eq(name, other), Own.contains(V, rest, other))
    case False{}:
      +head = Nat.is_eq(name, other)
      +inserted = Nat.is_eq(other, key)
      +old = Own.contains(V, rest, other)
      +updated = Own.contains(V, Own.set(V, rest, key, value), other)
      %Equal.sym(
        Bool,
        Records.member_head(head, updated),
        Bool.or(head, updated),
        Helpers.choice_membership(head, updated)
      ):
        {_ == Bool.or(inserted, Records.member_head(head, old)) : Bool}
      %Equal.sym(
        Bool,
        Records.member_head(head, old),
        Bool.or(head, old),
        Helpers.choice_membership(head, old)
      ):
        {Bool.or(head, updated) == Bool.or(inserted, _) : Bool}
      %Equal.sym(Bool, updated, Bool.or(inserted, old), suffix):
        {Bool.or(head, _) == Bool.or(inserted, Bool.or(head, old)) : Bool}
      %BoolFacts.or_assoc(head, inserted, old):
        {_ == Bool.or(inserted, Bool.or(head, old)) : Bool}
      %BoolFacts.or_comm(inserted, head):
        {Bool.or(_, old) == Bool.or(inserted, Bool.or(head, old)) : Bool}
      BoolFacts.or_assoc(inserted, head, old)

def insertion_membership_exact(V, catalog, key, other, value):
  match catalog:
    case Own.DNil{}:
      %NatFacts.is_eq_comm(key, other):
        {Records.member_head(Nat.is_eq(key, other), False{}) == Bool.or(_, False{}) : Bool}
      Helpers.choice_membership(Nat.is_eq(key, other), False{})
    case Own.DCon{+name, previous, +rest, count}:
      +saved_value = value
      same = Helpers.bool_reflexive(Nat.is_eq(name, key))
      suffix = insertion_membership_exact(V, rest, key, other, saved_value)
      membership_insert_step(
        V,
        Nat.is_eq(name, key),
        name,
        key,
        other,
        previous,
        rest,
        saved_value,
        same,
        suffix
      )
