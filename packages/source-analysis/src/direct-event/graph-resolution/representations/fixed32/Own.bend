import Base

# Experiment: unsigned 32-bit key trie. Only depth-correct, counted tries qualify.
type Dictionary<-V: Data> is Data:
  DNil{}
  DLeaf{key: Nat, value: V}
  DBranch{zero: Dictionary<V>, one: Dictionary<V>, count: Nat}

def choose(-V: Data, zero: Bool, if_zero: Unit -> V, if_one: Unit -> V) -> V:
  match zero:
    case True{}: if_zero(Unit{})
    case False{}: if_one(Unit{})

def lookup(-V: Data, +fallback: V, dictionary: Dictionary<V>, +key: Nat, +bits: Nat) -> V:
  match dictionary:
    case DNil{}: fallback
    case DLeaf{stored, value}:
      choose(V, Nat.is_eq(stored, key), next => value, next => fallback)
    case DBranch{zero, one, _}:
      choose(V, Nat.is_eq(Nat.mod(bits, 2n), 0n),
        next => lookup(V, fallback, zero, key, Nat.div(bits, 2n)),
        next => lookup(V, fallback, one, key, Nat.div(bits, 2n)))

def get(-V: Data, fallback: V, +dictionary: Dictionary<V>, +key: Nat) -> Dictionary<V> & V:
  (dictionary, lookup(V, fallback, dictionary, key, key))

def contains(-V: Data, dictionary: Dictionary<V>, +key: Nat, +bits: Nat) -> Bool:
  match dictionary:
    case DNil{}: False{}
    case DLeaf{stored, _}: Nat.is_eq(stored, key)
    case DBranch{zero, one, _}:
      choose(Bool, Nat.is_eq(Nat.mod(bits, 2n), 0n),
        next => contains(V, zero, key, Nat.div(bits, 2n)),
        next => contains(V, one, key, Nat.div(bits, 2n)))

def has(-V: Data, +dictionary: Dictionary<V>, +key: Nat) -> Dictionary<V> & Bool:
  (dictionary, contains(V, dictionary, key, key))

def size(-V: Data, dictionary: Dictionary<V>) -> Nat:
  match dictionary:
    case DNil{}: 0n
    case DLeaf{_, _}: 1n
    case DBranch{_, _, count}: count

def branch(-V: Data, +zero: Dictionary<V>, +one: Dictionary<V>) -> Dictionary<V>:
  DBranch{zero, one, (size(V, zero) + size(V, one) : Nat)}

def zero_child(-V: Data, dictionary: Dictionary<V>) -> Dictionary<V>:
  match dictionary:
    case DBranch{zero, _, _}: zero
    case _: DNil{}

def one_child(-V: Data, dictionary: Dictionary<V>) -> Dictionary<V>:
  match dictionary:
    case DBranch{_, one, _}: one
    case _: DNil{}

def insert(-V: Data, zero_bit: Bool, zero: Dictionary<V>, one: Dictionary<V>,
    recurse: Dictionary<V> -> Dictionary<V>) -> Dictionary<V>:
  match zero_bit:
    case True{}: branch(V, recurse(zero), one)
    case False{}: branch(V, zero, recurse(one))

def set_go(-V: Data, fuel: Nat, +dictionary: Dictionary<V>, key: Nat, +bits: Nat, value: V) -> Dictionary<V>:
  match fuel:
    case 0n: DLeaf{key, value}
    case 1n++remaining:
      insert(V, Nat.is_eq(Nat.mod(bits, 2n), 0n), zero_child(V, dictionary), one_child(V, dictionary),
        next => set_go(V, remaining, next, key, Nat.div(bits, 2n), value))

def set(-V: Data, dictionary: Dictionary<V>, +key: Nat, value: V) -> Dictionary<V>:
  set_go(V, 32n, dictionary, key, key, value)

def values(-V: Data, dictionary: Dictionary<V>) -> List<&2, V>:
  match dictionary:
    case DNil{}: []
    case DLeaf{_, value}: value <> []
    case DBranch{zero, one, _}:
      List.append(&2, V, values(V, zero), values(V, one))
