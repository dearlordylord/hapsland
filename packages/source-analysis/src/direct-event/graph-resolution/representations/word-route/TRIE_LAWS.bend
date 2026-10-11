import Base
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant

# Representation preconditions are executable routing/count invariants, not
# premises claiming the conclusion. Host encoding correspondence remains separate.
law distinct_keys_split_exact:
  for +a: Nat
  for +b: Nat
  for a_valid: {Invariant.key_valid(a) == True{} : Bool}
  for b_valid: {Invariant.key_valid(b) == True{} : Bool}
  for distinct: {Nat.is_eq(a, b) == False{} : Bool}
  {Invariant.split_valid(a, b, Own.split_go(32n, a, b, 1n)) == True{} : Bool}

law insertion_preserves_invariant:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for value: V
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  for key_valid: {Invariant.key_valid(key) == True{} : Bool}
  {Invariant.valid(V, Own.set(V, catalog, key, value)) == True{} : Bool}

law lookup_after_insert_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for +value: V
  for fallback: V
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  for key_valid: {Invariant.key_valid(key) == True{} : Bool}
  {Own.lookup(V, fallback, Own.set(V, catalog, key, value), key) == value : V}

law other_lookup_preserved:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for +other: Nat
  for value: V
  for +fallback: V
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  for key_valid: {Invariant.key_valid(key) == True{} : Bool}
  for other_valid: {Invariant.key_valid(other) == True{} : Bool}
  for distinct: {Nat.is_eq(key, other) == False{} : Bool}
  {Own.lookup(V, fallback, Own.set(V, catalog, key, value), other)
    == Own.lookup(V, fallback, catalog, other) : V}

law inserted_membership_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for value: V
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  for key_valid: {Invariant.key_valid(key) == True{} : Bool}
  {Own.contains(V, Own.set(V, catalog, key, value), key) == True{} : Bool}

law cached_size_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  {Own.size(V, catalog) == Invariant.leaves(V, catalog) : Nat}

law insertion_size_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for value: V
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  for key_valid: {Invariant.key_valid(key) == True{} : Bool}
  {Own.size(V, Own.set(V, catalog, key, value))
    == Own.choose(Nat, Own.contains(V, catalog, key), next => Own.size(V, catalog),
      next => (Own.size(V, catalog) + 1n : Nat)) : Nat}

law empty_seek_exact:
  for -V: Data
  for +catalog: Own.Dictionary<V>
  for +key: Nat
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  {Maybe.is_some(&2, Nat, Own.seek(V, catalog, key))
    == Nat.is_lt(0n, Own.size(V, catalog)) : Bool}
