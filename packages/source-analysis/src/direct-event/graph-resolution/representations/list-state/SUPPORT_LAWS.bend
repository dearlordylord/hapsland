import Base
import ./Own.bend as Own

# One structural insertion step, conditional only on the recursive suffix claim.
# A matching head returns the new value; otherwise the strictly smaller suffix does.
law lookup_insert_step:
  for -V: Data
  for +found: Bool
  for +name: Nat
  for +key: Nat
  for +previous: V
  for +rest: Own.Dictionary<V>
  for +value: V
  for +fallback: V
  for same: {Nat.is_eq(name, key) == found : Bool}
  for suffix: {Own.lookup(V, fallback, Own.set(V, rest, key, value), key) == value : V}
  {Own.lookup(V, fallback,
      Own.replace(V, found, name, previous, rest, value, next => Own.set(V, rest, key, value)), key)
    == value : V}
