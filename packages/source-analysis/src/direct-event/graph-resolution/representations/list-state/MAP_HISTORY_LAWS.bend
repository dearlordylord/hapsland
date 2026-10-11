import Base
import ./MAP_HISTORY_RELATION.bend as History
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant
import ./BOUNDARY_ENCODING.bend as Encoding
import ./REGISTRY_RELATION.bend as Registry

# Rewriting the same key retains only its final value, with exact BaseMap shape.
law map_set_overwrite:
  for -V: Data
  for +items: List<&2, History.Record<V>>
  for +key: String
  for left: V
  for +right: V
  {
    Map.set(&2, V, Map.set(&2, V, History.source(V, items), key, left), key, right)
    == Map.set(&2, V, History.source(V, items), key, right)
    : Map<&2, V>
  }

# Different keys commute on every constructively reachable source map, structurally.
law map_set_commute_distinct:
  for -V: Data
  for +items: List<&2, History.Record<V>>
  for +left_key: String
  for +right_key: String
  for +left: V
  for +right: V
  for distinct: {String.eq(left_key, right_key) == False{} : Bool}
  {
    Map.set(&2, V, Map.set(&2, V, History.source(V, items), left_key, left), right_key, right)
    == Map.set(&2, V, Map.set(&2, V, History.source(V, items), right_key, right), left_key, left)
    : Map<&2, V>
  }

# Every complete history has exactly the original BaseMap after first-position normalization.
law whole_history_roundtrip:
  for -V: Data
  for +items: List<&2, History.Record<V>>
  for +names: List<&2, String>
  for valid: {Registry.unique(names) == True{} : Bool}
  for covered: {Encoding.all_present(History.keys(V, items), names) == True{} : Bool}
  {
    History.decode(V, History.numeric(V, items, names), names)
    == History.source(V, items)
    : Map<&2, V>
  }

# One actual numeric update corresponds to one source update, including overwrite in place.
law dictionary_update_exact:
  for -V: Data
  for +items: List<&2, History.Record<V>>
  for +names: List<&2, String>
  for +key: String
  for +value: V
  for valid: {Registry.unique(names) == True{} : Bool}
  for covered: {Encoding.all_present(History.keys(V, items), names) == True{} : Bool}
  for key_present: {Registry.present(names, key) == True{} : Bool}
  {
    History.decode(
      V,
      Own.set(V, History.numeric(V, items, names), Encoding.identity(names, key), value),
      names
    )
    == Map.set(&2, V, History.decode(V, History.numeric(V, items, names), names), key, value)
    : Map<&2, V>
  }

# Cached sizes and structural uniqueness are valid even before registry coverage is assumed.
law history_dictionary_valid:
  for -V: Data
  for items: List<&2, History.Record<V>>
  for names: List<&2, String>
  {Invariant.valid(V, History.numeric(V, items, names)) == True{} : Bool}

# Covered bijection preserves exact source cardinality, including repeated record keys.
law history_size_exact:
  for -V: Data
  for +items: List<&2, History.Record<V>>
  for +names: List<&2, String>
  for valid: {Registry.unique(names) == True{} : Bool}
  for covered: {Encoding.all_present(History.keys(V, items), names) == True{} : Bool}
  {
    Own.size(V, History.numeric(V, items, names))
    == List.length(&2, String, Map.keys(&2, V, History.source(V, items)))
    : Nat
  }

# Full payload lookup agrees for every covered query; no truthiness or membership surrogate.
law history_lookup_exact:
  for -V: Data
  for +items: List<&2, History.Record<V>>
  for +names: List<&2, String>
  for +query: String
  for +fallback: V
  for valid: {Registry.unique(names) == True{} : Bool}
  for covered: {Encoding.all_present(History.keys(V, items), names) == True{} : Bool}
  for query_present: {Registry.present(names, query) == True{} : Bool}
  {
    Own.lookup(V, fallback, History.numeric(V, items, names), Encoding.identity(names, query))
    == History.source_lookup(V, fallback, History.source(V, items), query)
    : V
  }
