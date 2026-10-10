import Base
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant

def successor(number: Nat) -> Nat:
  (1n + number : Nat)

def insert_head(
  -V: Data,
  found: Bool,
  name: Nat,
  previous: V,
  +rest: Own.Dictionary<V>,
  +key: Nat,
  +value: V
) -> Own.Dictionary<V>:
  Own.replace(V, found, name, previous, rest, value, next => Own.set(V, rest, key, value))

def inserted_records(-V: Data, +catalog: Own.Dictionary<V>, key: Nat) -> Nat:
  +count = Invariant.records(V, catalog)
  present = Own.contains(V, catalog, key)
  Own.choose(Nat, present, count, next => successor(count))

# Reflexivity as a named proof term, avoiding inline proof literals in argument lists.
law bool_reflexive:
  for +flag: Bool
  {flag == flag : Bool}

# An equal head key is distinct from every key distinct from the inserted key.
law head_distinct:
  for +name: Nat
  for +key: Nat
  for +other: Nat
  for same: {Nat.is_eq(name, key) == True{} : Bool}
  for distinct: {Nat.is_eq(key, other) == False{} : Bool}
  {Nat.is_eq(name, other) == False{} : Bool}

# Reassemble one head after the strictly smaller suffix lookup theorem.
law other_lookup_insert_step:
  for -V: Data
  for +found: Bool
  for +name: Nat
  for +key: Nat
  for +other: Nat
  for +previous: V
  for +rest: Own.Dictionary<V>
  for +value: V
  for +fallback: V
  for +same: {Nat.is_eq(name, key) == found : Bool}
  for +distinct: {Nat.is_eq(key, other) == False{} : Bool}
  for suffix: {
    Own.lookup(V, fallback, Own.set(V, rest, key, value), other)
    == Own.lookup(V, fallback, rest, other)
    : V
  }
  {Own.lookup(V, fallback, insert_head(V, found, name, previous, rest, key, value), other)
    == Own.lookup(V, fallback, Own.cons(V, name, previous, rest), other) : V}

# Constructor membership has ordinary Boolean disjunction semantics.
law choice_membership:
  for +found: Bool
  for +suffix: Bool
  {Own.choose(Bool, found, True{}, next => suffix) == Bool.or(found, suffix) : Bool}

# Reasserting the existing head membership does not change its truth value.
law membership_head_repeat:
  for +found: Bool
  for +suffix: Bool
  {Own.choose(Bool, found, True{}, next => suffix)
    == Bool.or(found, Own.choose(Bool, found, True{}, next => suffix)) : Bool}

# Reassemble exact membership using only the strictly smaller suffix claim.
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
    Own.contains(V, insert_head(V, found, name, previous, rest, key, value), other)
    == Bool.or(Nat.is_eq(other, key), Own.contains(V, Own.cons(V, name, previous, rest), other))
    : Bool
  }

# The constructor extends a valid suffix with a fresh key and the exact count.
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
  {Invariant.valid(V, insert_head(V, found, name, previous, rest, key, value)) == True{} : Bool}

# Successor distributes over the implementation's branch selector.
law successor_choose:
  for +found: Bool
  for +yes: Nat
  for +no: Nat
  {(1n + Own.choose(Nat, found, yes, next => no) : Nat)
    == Own.choose(Nat, found, successor(yes), next => successor(no)) : Nat}

# Reassemble structural length using only the smaller suffix length theorem.
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
    == inserted_records(V, rest, key)
    : Nat
  }
  {Invariant.records(V, insert_head(V, found, name, previous, rest, key, value))
    == inserted_records(V, Own.cons(V, name, previous, rest), key) : Nat}

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
