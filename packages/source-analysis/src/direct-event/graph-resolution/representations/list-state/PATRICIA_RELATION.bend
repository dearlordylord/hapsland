import Base

# Structural canonicality for BaseMap; payloads remain opaque.
# No lookup equivalence, set algebra or desired reconstruction equality is assumed.
def bool_equal(left: Bool, right: Bool) -> Bool:
  match left right:
    case False{} False{}: True{}
    case True{} True{}: True{}
    case _ _: False{}

def bit_value(result: String & Bool) -> Bool:
  match result:
    case Tuple{_, bit}: bit

def route(key: String, position: Nat) -> Bool:
  bit_value(Map.bit(key, position))

def same_prefix(count: Nat, +left: String, +right: String) -> Bool:
  match count:
    case 0n: True{}
    case 1n++rest:
      Bool.and(same_prefix(rest, left, right), bool_equal(route(left, rest), route(right, rest)))

def nonempty(-V: Data, tree: Map<&2, V>) -> Bool:
  match tree:
    case MTip{}: False{}
    case _: True{}

def root_after(-V: Data, position: Nat, tree: Map<&2, V>) -> Bool:
  match tree:
    case MNode{next, _, _}: Nat.is_lt(position, next)
    case _: True{}

def first_choice(found: Maybe<&2, String>, suffix: Unit -> Maybe<&2, String>) -> Maybe<&2, String>:
  match found:
    case None{}: suffix(Unit{})
    case Some{key}: Some{key}

def first_leaf(-V: Data, tree: Map<&2, V>) -> Maybe<&2, String>:
  match tree:
    case MTip{}: None{}
    case MLeaf{key, _}: Some{key}
    case MNode{_, lo, hi}: first_choice(first_leaf(V, lo), next => first_leaf(V, hi))

def all_prefix(-V: Data, tree: Map<&2, V>, +pivot: String, +position: Nat) -> Bool:
  match tree:
    case MTip{}: True{}
    case MLeaf{key, _}: same_prefix(position, pivot, key)
    case MNode{_, lo, hi}: Bool.and(
      all_prefix(V, lo, pivot, position),
      all_prefix(V, hi, pivot, position)
    )

def all_side(-V: Data, tree: Map<&2, V>, +position: Nat, +side: Bool) -> Bool:
  match tree:
    case MTip{}: True{}
    case MLeaf{key, _}: bool_equal(route(key, position), side)
    case MNode{_, lo, hi}: Bool.and(
      all_side(V, lo, position, side),
      all_side(V, hi, position, side)
    )

def prefix_compatible(
  -V: Data,
  pivot: Maybe<&2, String>,
  lo: Map<&2, V>,
  hi: Map<&2, V>,
  +position: Nat
) -> Bool:
  match pivot:
    case None{}: False{}
    case Some{+key}: Bool.and(all_prefix(V, lo, key, position), all_prefix(V, hi, key, position))

def canonical(-V: Data, tree: Map<&2, V>) -> Bool:
  match tree:
    case MTip{}: True{}
    case MLeaf{_, _}: True{}
    case MNode{+position, +lo, +hi}:
      Bool.and(nonempty(V, lo), Bool.and(nonempty(V, hi),
        Bool.and(root_after(V, position, lo), Bool.and(root_after(V, position, hi),
          Bool.and(prefix_compatible(V, first_leaf(V, lo), lo, hi, position),
            Bool.and(all_side(V, lo, position, False{}), Bool.and(all_side(V, hi, position, True{}),
              Bool.and(canonical(V, lo), canonical(V, hi)))))))))

def first_leaf_some(found: Maybe<&2, String>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def first_leaf_present(-V: Data, tree: Map<&2, V>) -> Bool:
  first_leaf_some(first_leaf(V, tree))

def lookup_value(-V: Data, result: Map<&2, V> & V) -> V:
  match result:
    case Tuple{_, value}: value

def lookup(-V: Data, fallback: V, tree: Map<&2, V>, key: String) -> V:
  lookup_value(V, Map.get(V, fallback, tree, key))
