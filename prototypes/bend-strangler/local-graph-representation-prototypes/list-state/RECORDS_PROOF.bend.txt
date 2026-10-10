import Base
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant
import ./UPDATE_HELPERS_PROOF.bend as Helpers

def member_head(found: Bool, suffix: Bool) -> Bool:
  Own.choose(Bool, found, True{}, next => suffix)

def expected_count(+present: Bool, +count: Nat) -> Nat:
  Own.choose(Nat, present, count, next => Helpers.successor(count))

law records_insert_step:
  for -V: Data
  for +found: Bool
  for +name: Nat
  for +key: Nat
  for +previous: V
  for +rest: Own.Dictionary<V>
  for +value: V
  for same: {Nat.is_eq(name, key) == found : Bool}
  for suffix: {
    Invariant.records(V, Own.set(V, rest, key, value))
    == Helpers.inserted_records(V, rest, key)
    : Nat
  }
  {Invariant.records(V, Helpers.insert_head(V, found, name, previous, rest, key, value))
    == Helpers.inserted_records(V, Own.cons(V, name, previous, rest), key) : Nat}

# Structural length changes by exactly one iff the key was previously absent.
# This theorem is unconditional on caches and duplicate keys.

law records_insert_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for +value: V
  {Invariant.records(V, Own.set(V, catalog, key, value))
    == Own.choose(Nat, Own.contains(V, catalog, key), Invariant.records(V, catalog),
      next => (1n + Invariant.records(V, catalog) : Nat)) : Nat}

def records_insert_step(V, found, name, key, previous, rest, value, same, suffix):
  match found:
    case True{}:
      %Equal.sym(Bool, Nat.is_eq(name, key), True{}, same):
        {
          Invariant.records(V, Own.cons(V, name, value, rest))
          == expected_count(
            member_head(_, Own.contains(V, rest, key)),
            Invariant.records(V, Own.cons(V, name, previous, rest))
          )
          : Nat
        }
      {==}
    case False{}:
      %Equal.sym(Bool, Nat.is_eq(name, key), False{}, same):
        {
          Invariant.records(V, Own.cons(V, name, previous, Own.set(V, rest, key, value)))
          == expected_count(
            member_head(_, Own.contains(V, rest, key)),
            Invariant.records(V, Own.cons(V, name, previous, rest))
          )
          : Nat
        }
      %Equal.sym(
        Nat,
        Invariant.records(V, Own.set(V, rest, key, value)),
        Helpers.inserted_records(V, rest, key),
        suffix
      ):
        {
          (1n + _ : Nat)
          == expected_count(
            Own.contains(V, rest, key),
            Helpers.successor(Invariant.records(V, rest))
          )
          : Nat
        }
      Helpers.successor_choose(
        Own.contains(V, rest, key),
        Invariant.records(V, rest),
        Helpers.successor(Invariant.records(V, rest))
      )

def records_insert_exact(V, catalog, key, value):
  match catalog:
    case Own.DNil{}: {==}
    case Own.DCon{+name, previous, +rest, count}:
      same = Helpers.bool_reflexive(Nat.is_eq(name, key))
      suffix = records_insert_exact(V, rest, key, value)
      records_insert_step(V, Nat.is_eq(name, key), name, key, previous, rest, value, same, suffix)
