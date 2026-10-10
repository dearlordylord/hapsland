import Base
import ./Own.bend as Own

# Structural record count is independent of the cached size.
def records(-V: Data, dictionary: Own.Dictionary<V>) -> Nat:
  match dictionary:
    case Own.DNil{}: 0n
    case Own.DCon{_, _, rest, _}: (1n + records(V, rest) : Nat)

# Each key appears once and each cached count equals the structural suffix length.
def valid(-V: Data, dictionary: Own.Dictionary<V>) -> Bool:
  match dictionary:
    case Own.DNil{}: True{}
    case Own.DCon{+key, _, +rest, count}:
      Bool.and(Nat.is_eq(count, (1n + records(V, rest) : Nat)),
        Bool.and(Bool.not(Own.contains(V, rest, key)), valid(V, rest)))
