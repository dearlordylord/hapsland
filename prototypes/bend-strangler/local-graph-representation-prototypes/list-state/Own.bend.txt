import Base

# Proof-oriented whole-planner representation: exact Nat keys, structural updates.
type Dictionary<-V: Data> is Data:
  DNil{}
  DCon{key: Nat, value: V, rest: Dictionary<V>, count: Nat}

def choose(-V: Data, found: Bool, value: V, recurse: Unit -> V) -> V:
  match found:
    case True{}: value
    case False{}: recurse(Unit{})

def lookup(-V: Data, fallback: V, dictionary: Dictionary<V>, +key: Nat) -> V:
  match dictionary:
    case DNil{}: fallback
    case DCon{name, value, rest, _}:
      choose(V, Nat.is_eq(name, key), value, next => lookup(V, fallback, rest, key))

def get(-V: Data, fallback: V, +dictionary: Dictionary<V>, key: Nat) -> Dictionary<V> & V:
  (dictionary, lookup(V, fallback, dictionary, key))

def contains(-V: Data, dictionary: Dictionary<V>, +key: Nat) -> Bool:
  match dictionary:
    case DNil{}: False{}
    case DCon{name, _, rest, _}:
      choose(Bool, Nat.is_eq(name, key), True{}, next => contains(V, rest, key))

def has(-V: Data, +dictionary: Dictionary<V>, key: Nat) -> Dictionary<V> & Bool:
  (dictionary, contains(V, dictionary, key))

def size(-V: Data, dictionary: Dictionary<V>) -> Nat:
  match dictionary:
    case DNil{}: 0n
    case DCon{_, _, _, count}: count

def cons(-V: Data, key: Nat, value: V, +rest: Dictionary<V>) -> Dictionary<V>:
  DCon{key, value, rest, (1n + size(V, rest) : Nat)}

def replace(-V: Data, found: Bool, name: Nat, previous: V, rest: Dictionary<V>,
    value: V, recurse: Unit -> Dictionary<V>) -> Dictionary<V>:
  match found:
    case True{}: cons(V, name, value, rest)
    case False{}: cons(V, name, previous, recurse(Unit{}))

def set(-V: Data, dictionary: Dictionary<V>, +key: Nat, +value: V) -> Dictionary<V>:
  match dictionary:
    case DNil{}: cons(V, key, value, DNil{})
    case DCon{+name, previous, +rest, _}:
      replace(V, Nat.is_eq(name, key), name, previous, rest, value,
        next => set(V, rest, key, value))

def values(-V: Data, dictionary: Dictionary<V>) -> List<&2, V>:
  match dictionary:
    case DNil{}: []
    case DCon{_, value, rest, _}: value <> values(V, rest)
