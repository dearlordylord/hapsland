import Base
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant

# An update returns the new value, including on malformed duplicate-key lists.
law lookup_after_insert_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for +value: V
  for fallback: V
  {Own.lookup(V, fallback, Own.set(V, catalog, key, value), key) == value : V}

# Updating one key preserves every other lookup.
law other_lookup_preserved:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for +other: Nat
  for value: V
  for +fallback: V
  for distinct: {Nat.is_eq(key, other) == False{} : Bool}
  {Own.lookup(V, fallback, Own.set(V, catalog, key, value), other)
    == Own.lookup(V, fallback, catalog, other) : V}

# Exactly the prior memberships plus the inserted key; no extra identities.
law insertion_membership_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for +other: Nat
  for value: V
  {Own.contains(V, Own.set(V, catalog, key, value), other)
    == Bool.or(Nat.is_eq(other, key), Own.contains(V, catalog, other)) : Bool}

# Unique keys and independently counted cached lengths survive updates.
law insertion_preserves_invariant:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for value: V
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  {Invariant.valid(V, Own.set(V, catalog, key, value)) == True{} : Bool}

# The cache is the complete number of unique records on the lawful boundary.
law cached_size_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  {Own.size(V, catalog) == Invariant.records(V, catalog) : Nat}

# Replacement preserves cardinality; a new key adds exactly one record.
law insertion_size_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for value: V
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  {Own.size(V, Own.set(V, catalog, key, value))
    == Own.choose(Nat, Own.contains(V, catalog, key), Own.size(V, catalog),
      next => (Own.size(V, catalog) + 1n : Nat)) : Nat}
