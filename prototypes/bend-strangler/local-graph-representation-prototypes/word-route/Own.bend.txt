import Base

# Experiment: compressed unsigned numeric key trie, cached distinct counts.
# Valid branch divisors are increasing powers of two; keys fit 32 bits.
type Dictionary<-V: Data> is Data:
  DNil{}
  DLeaf{key: Nat, value: V}
  DBranch{divisor: Nat, zero: Dictionary<V>, one: Dictionary<V>, count: Nat}

def choose(-V: Data, zero: Bool, if_zero: Unit -> V, if_one: Unit -> V) -> V:
  match zero:
    case True{}: if_zero(Unit{})
    case False{}: if_one(Unit{})

def zero_bit(key: Nat, divisor: Nat) -> Bool:
  U32.is_eq(U32.and(U32.from_nat(key), U32.from_nat(divisor)), U32.from_nat(0n))

def lookup(-V: Data, +fallback: V, dictionary: Dictionary<V>, +key: Nat) -> V:
  match dictionary:
    case DNil{}: fallback
    case DLeaf{stored, value}:
      choose(V, Nat.is_eq(stored, key), next => value, next => fallback)
    case DBranch{divisor, zero, one, _}:
      choose(V, zero_bit(key, divisor), next => lookup(V, fallback, zero, key), next => lookup(V, fallback, one, key))

def get(-V: Data, fallback: V, +dictionary: Dictionary<V>, key: Nat) -> Dictionary<V> & V:
  (dictionary, lookup(V, fallback, dictionary, key))

def contains(-V: Data, dictionary: Dictionary<V>, +key: Nat) -> Bool:
  match dictionary:
    case DNil{}: False{}
    case DLeaf{stored, _}: Nat.is_eq(stored, key)
    case DBranch{divisor, zero, one, _}:
      choose(Bool, zero_bit(key, divisor), next => contains(V, zero, key), next => contains(V, one, key))

def has(-V: Data, +dictionary: Dictionary<V>, key: Nat) -> Dictionary<V> & Bool:
  (dictionary, contains(V, dictionary, key))

def size(-V: Data, dictionary: Dictionary<V>) -> Nat:
  match dictionary:
    case DNil{}: 0n
    case DLeaf{_, _}: 1n
    case DBranch{_, _, _, count}: count

def branch(-V: Data, divisor: Nat, +zero: Dictionary<V>, +one: Dictionary<V>) -> Dictionary<V>:
  DBranch{divisor, zero, one, (size(V, zero) + size(V, one) : Nat)}

def seek(-V: Data, dictionary: Dictionary<V>, +key: Nat) -> Maybe<&2, Nat>:
  match dictionary:
    case DNil{}: None{}
    case DLeaf{stored, _}: Some{stored}
    case DBranch{divisor, zero, one, _}:
      choose(Maybe<&2, Nat>, zero_bit(key, divisor), next => seek(V, zero, key), next => seek(V, one, key))

def split_step(equal_bit: Bool, divisor: Nat, recurse: Unit -> Nat) -> Nat:
  match equal_bit:
    case True{}: recurse(Unit{})
    case False{}: divisor

def split_go(fuel: Nat, +a: Nat, +b: Nat, +divisor: Nat) -> Nat:
  match fuel:
    case 0n: 0n
    case 1n++rest:
      split_step(Nat.is_eq(Nat.mod(a, 2n), Nat.mod(b, 2n)), divisor,
        next => split_go(rest, Nat.div(a, 2n), Nat.div(b, 2n), (divisor * 2n : Nat)))

def splice(-V: Data, zero: Bool, divisor: Nat, dictionary: Dictionary<V>, key: Nat, value: V) -> Dictionary<V>:
  match zero:
    case True{}: branch(V, divisor, DLeaf{key, value}, dictionary)
    case False{}: branch(V, divisor, dictionary, DLeaf{key, value})

def rewrite(-V: Data, dictionary: Dictionary<V>, +key: Nat, +value: V) -> Dictionary<V>:
  match dictionary:
    case DNil{}: DLeaf{key, value}
    case DLeaf{_, _}: DLeaf{key, value}
    case DBranch{+divisor, +zero, +one, _}:
      choose(Dictionary<V>, zero_bit(key, divisor),
        next => branch(V, divisor, rewrite(V, zero, key, value), one),
        next => branch(V, divisor, zero, rewrite(V, one, key, value)))

def insert_select(-V: Data, above: Bool, dictionary: Dictionary<V>, +key: Nat, value: V, +split: Nat,
    divisor: Nat, left: Unit -> Dictionary<V>, right: Unit -> Dictionary<V>) -> Dictionary<V>:
  match above:
    case True{}: splice(V, zero_bit(key, split), split, dictionary, key, value)
    case False{}: choose(Dictionary<V>, zero_bit(key, divisor), left, right)

def insert_at(-V: Data, dictionary: Dictionary<V>, +key: Nat, +value: V, +split: Nat) -> Dictionary<V>:
  match dictionary:
    case DNil{}: DLeaf{key, value}
    case DLeaf{old_key, old_value}: splice(V, zero_bit(key, split), split, DLeaf{old_key, old_value}, key, value)
    case DBranch{+divisor, +zero, +one, count}:
      insert_select(V, Nat.is_le(split, divisor), DBranch{divisor, zero, one, count}, key, value, split,
        divisor, next => branch(V, divisor, insert_at(V, zero, key, value, split), one),
        next => branch(V, divisor, zero, insert_at(V, one, key, value, split)))

def set_mode(-V: Data, same: Bool, dictionary: Dictionary<V>, +key: Nat, value: V, old_key: Nat) -> Dictionary<V>:
  match same:
    case True{}: rewrite(V, dictionary, key, value)
    case False{}: insert_at(V, dictionary, key, value, split_go(32n, key, old_key, 1n))

def set_found(-V: Data, found: Maybe<&2, Nat>, dictionary: Dictionary<V>, +key: Nat, value: V) -> Dictionary<V>:
  match found:
    case None{}: DLeaf{key, value}
    case Some{+old_key}: set_mode(V, Nat.is_eq(key, old_key), dictionary, key, value, old_key)

def set(-V: Data, +dictionary: Dictionary<V>, +key: Nat, value: V) -> Dictionary<V>:
  set_found(V, seek(V, dictionary, key), dictionary, key, value)

def values(-V: Data, dictionary: Dictionary<V>) -> List<&2, V>:
  match dictionary:
    case DNil{}: []
    case DLeaf{_, value}: value <> []
    case DBranch{_, zero, one, _}: List.append(&2, V, values(V, zero), values(V, one))
