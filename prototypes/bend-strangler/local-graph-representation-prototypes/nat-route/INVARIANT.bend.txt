import Base
import ./Own.bend as Own

def key_valid(key: Nat) -> Bool:
  Nat.is_le(key, 4294967295n)

def power_go(fuel: Nat, +divisor: Nat) -> Bool:
  match fuel:
    case 0n: False{}
    case 1n++rest:
      Own.choose(Bool, Nat.is_eq(divisor, 1n), next => True{},
        next => Bool.and(Nat.is_eq(Nat.mod(divisor, 2n), 0n), power_go(rest, Nat.div(divisor, 2n))))

def power_valid(divisor: Nat) -> Bool:
  power_go(32n, divisor)

def leaves(-V: Data, dictionary: Own.Dictionary<V>) -> Nat:
  match dictionary:
    case Own.DNil{}: 0n
    case Own.DLeaf{_, _}: 1n
    case Own.DBranch{_, zero, one, _}: (leaves(V, zero) + leaves(V, one) : Nat)

def first_key(-V: Data, dictionary: Own.Dictionary<V>) -> Nat:
  match dictionary:
    case Own.DNil{}: 0n
    case Own.DLeaf{key, _}: key
    case Own.DBranch{_, zero, _, _}: first_key(V, zero)

def prefix_matches(-V: Data, dictionary: Own.Dictionary<V>, +divisor: Nat, +prefix: Nat) -> Bool:
  match dictionary:
    case Own.DNil{}: True{}
    case Own.DLeaf{key, _}: Nat.is_eq(Nat.mod(key, divisor), prefix)
    case Own.DBranch{_, zero, one, _}:
      Bool.and(prefix_matches(V, zero, divisor, prefix), prefix_matches(V, one, divisor, prefix))

def bit_matches(-V: Data, dictionary: Own.Dictionary<V>, +divisor: Nat, +bit: Nat) -> Bool:
  match dictionary:
    case Own.DNil{}: True{}
    case Own.DLeaf{key, _}: Nat.is_eq(Nat.mod(Nat.div(key, divisor), 2n), bit)
    case Own.DBranch{_, zero, one, _}:
      Bool.and(bit_matches(V, zero, divisor, bit), bit_matches(V, one, divisor, bit))

def valid_tree(-V: Data, dictionary: Own.Dictionary<V>, +lower: Nat) -> Bool:
  match dictionary:
    case Own.DNil{}: True{}
    case Own.DLeaf{key, _}: key_valid(key)
    case Own.DBranch{+divisor, +zero, +one, count}:
      Bool.and(Nat.is_lt(lower, divisor),
      Bool.and(power_valid(divisor),
      Bool.and(Nat.is_eq(count, (leaves(V, zero) + leaves(V, one) : Nat)),
      Bool.and(Nat.is_lt(0n, leaves(V, zero)),
      Bool.and(Nat.is_lt(0n, leaves(V, one)),
      Bool.and(prefix_matches(V, zero, divisor, Nat.mod(first_key(V, zero), divisor)),
      Bool.and(prefix_matches(V, one, divisor, Nat.mod(first_key(V, zero), divisor)),
      Bool.and(bit_matches(V, zero, divisor, 0n),
      Bool.and(bit_matches(V, one, divisor, 1n),
      Bool.and(valid_tree(V, zero, divisor), valid_tree(V, one, divisor)))))))))))

def valid(-V: Data, dictionary: Own.Dictionary<V>) -> Bool:
  valid_tree(V, dictionary, 0n)

def split_valid(+a: Nat, +b: Nat, +divisor: Nat) -> Bool:
  Bool.and(power_valid(divisor),
    Bool.and(Nat.is_eq(Nat.mod(a, divisor), Nat.mod(b, divisor)),
      Bool.not(Nat.is_eq(Nat.mod(Nat.div(a, divisor), 2n), Nat.mod(Nat.div(b, divisor), 2n)))))
