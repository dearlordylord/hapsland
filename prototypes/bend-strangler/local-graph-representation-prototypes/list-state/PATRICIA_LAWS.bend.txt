import Base
import ./PATRICIA_RELATION.bend as Patricia

# Map.bit carries the complete key through the real routing operation.
law bit_preserves_key:
  for +key: String
  for +position: Nat
  {Map.bit(key, position) == Tuple{key, Patricia.route(key, position)} : String & Bool}

# Different strings split at exactly the first differing route bit.
law diff_first_split:
  for +left: String
  for +right: String
  for distinct: {String.eq(left, right) == False{} : Bool}
  {
    Bool.and(
      Patricia.same_prefix(Map.diff(left, right), left, right),
      Bool.not(Patricia.bool_equal(
        Patricia.route(left, Map.diff(left, right)),
        Patricia.route(right, Map.diff(left, right))
      ))
    ) == True{} : Bool
  }

# Canonical trees select an actual leaf whenever they are nonempty.
law nonempty_first_leaf:
  for -V: Data
  for +tree: Map<&2, V>
  for valid: {Patricia.canonical(V, tree) == True{} : Bool}
  for present: {Patricia.nonempty(V, tree) == True{} : Bool}
  {Patricia.first_leaf_present(V, tree) == True{} : Bool}

# Every actual BaseMap update preserves the structural routing invariant.
law set_preserves_canonical:
  for -V: Data
  for +tree: Map<&2, V>
  for key: String
  for value: V
  for valid: {Patricia.canonical(V, tree) == True{} : Bool}
  {Patricia.canonical(V, Map.set(&2, V, tree, key, value)) == True{} : Bool}

# Whole-map overwrite equality includes the exact Patricia shape.
law canonical_set_overwrite:
  for -V: Data
  for +tree: Map<&2, V>
  for +key: String
  for left: V
  for +right: V
  for valid: {Patricia.canonical(V, tree) == True{} : Bool}
  {
    Map.set(&2, V, Map.set(&2, V, tree, key, left), key, right)
    == Map.set(&2, V, tree, key, right) : Map<&2, V>
  }

# Different-key updates commute structurally on every canonical tree.
law canonical_set_commute:
  for -V: Data
  for +tree: Map<&2, V>
  for +left_key: String
  for +right_key: String
  for +left: V
  for +right: V
  for valid: {Patricia.canonical(V, tree) == True{} : Bool}
  for distinct: {String.eq(left_key, right_key) == False{} : Bool}
  {
    Map.set(&2, V, Map.set(&2, V, tree, left_key, left), right_key, right)
    == Map.set(&2, V, Map.set(&2, V, tree, right_key, right), left_key, left)
    : Map<&2, V>
  }

# Full payload read-after-write, with an arbitrary fallback value.
law canonical_lookup_updated:
  for -V: Data
  for +tree: Map<&2, V>
  for +key: String
  for +value: V
  for fallback: V
  for valid: {Patricia.canonical(V, tree) == True{} : Bool}
  {Patricia.lookup(V, fallback, Map.set(&2, V, tree, key, value), key) == value : V}

# Every other key keeps its complete payload, including a missing-key fallback.
law canonical_lookup_other:
  for -V: Data
  for +tree: Map<&2, V>
  for +key: String
  for +query: String
  for value: V
  for +fallback: V
  for valid: {Patricia.canonical(V, tree) == True{} : Bool}
  for distinct: {String.eq(key, query) == False{} : Bool}
  {
    Patricia.lookup(V, fallback, Map.set(&2, V, tree, key, value), query)
    == Patricia.lookup(V, fallback, tree, query) : V
  }
