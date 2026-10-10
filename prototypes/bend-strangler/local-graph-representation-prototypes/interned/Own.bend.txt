import Base

# Experiment only: insertion-ordered String dictionary, no host resolution.
type Dictionary<-V: Data> is Data:
  DNil{}
  DCon{key: Nat, value: V, rest: Dictionary<V>}

def choose(-V: Data, found: Bool, value: V, recurse: Unit -> V) -> V:
  match found:
    case True{}: value
    case False{}: recurse(Unit{})

def lookup(-V: Data, fallback: V, dictionary: Dictionary<V>, +key: Nat) -> V:
  match dictionary:
    case DNil{}: fallback
    case DCon{name, value, rest}:
      choose(V, Nat.is_eq(name, key), value, next => lookup(V, fallback, rest, key))

def get(-V: Data, fallback: V, +dictionary: Dictionary<V>, key: Nat) -> Dictionary<V> & V:
  (dictionary, lookup(V, fallback, dictionary, key))

def contains(-V: Data, dictionary: Dictionary<V>, +key: Nat) -> Bool:
  match dictionary:
    case DNil{}: False{}
    case DCon{name, _, rest}:
      choose(Bool, Nat.is_eq(name, key), True{}, next => contains(V, rest, key))

def has(-V: Data, +dictionary: Dictionary<V>, key: Nat) -> Dictionary<V> & Bool:
  (dictionary, contains(V, dictionary, key))

def replace(-V: Data, found: Bool, name: Nat, previous: V, rest: Dictionary<V>,
    value: V, recurse: Unit -> Dictionary<V>) -> Dictionary<V>:
  match found:
    case True{}: DCon{name, value, rest}
    case False{}: DCon{name, previous, recurse(Unit{})}

def set(-V: Data, dictionary: Dictionary<V>, +key: Nat, +value: V) -> Dictionary<V>:
  match dictionary:
    case DNil{}: DCon{key, value, DNil{}}
    case DCon{+name, previous, +rest}:
      replace(V, Nat.is_eq(name, key), name, previous, rest, value,
        next => set(V, rest, key, value))

def size(-V: Data, dictionary: Dictionary<V>) -> Nat:
  match dictionary:
    case DNil{}: 0n
    case DCon{_, _, rest}: (1n + size(V, rest) : Nat)

def values(-V: Data, dictionary: Dictionary<V>) -> List<&2, V>:
  match dictionary:
    case DNil{}: []
    case DCon{_, value, rest}: value <> values(V, rest)
