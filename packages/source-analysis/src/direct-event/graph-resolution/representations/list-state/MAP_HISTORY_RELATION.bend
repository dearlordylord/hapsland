import Base
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant
import ./BOUNDARY_ENCODING.bend as Encoding

# Full history relation for arbitrary opaque payloads. Raw records may repeat keys.
# The source domain is exactly folds from MTip, never arbitrary malformed BaseMap.
type Record<-V: Data> is Data:
  Record{key: String, value: V}

def keys(-V: Data, items: List<&2, Record<V>>) -> List<&2, String>:
  match items:
    case []: []
    case Record{key, _} <> rest: key <> keys(V, rest)

def source_fold(-V: Data, items: List<&2, Record<V>>, catalog: Map<&2, V>) -> Map<&2, V>:
  match items:
    case []: catalog
    case Record{key, value} <> rest:
      source_fold(V, rest, Map.set(&2, V, catalog, key, value))

def source(-V: Data, items: List<&2, Record<V>>) -> Map<&2, V>:
  source_fold(V, items, MTip{})

def numeric_fold(-V: Data, items: List<&2, Record<V>>, +names: List<&2, String>,
    catalog: Own.Dictionary<V>) -> Own.Dictionary<V>:
  match items:
    case []: catalog
    case Record{key, value} <> rest:
      numeric_fold(V, rest, names, Own.set(V, catalog, Encoding.identity(names, key), value))

def numeric(-V: Data, items: List<&2, Record<V>>, names: List<&2, String>) -> Own.Dictionary<V>:
  numeric_fold(V, items, names, Own.DNil{})

def decode_fold(-V: Data, items: Own.Dictionary<V>, +names: List<&2, String>,
    catalog: Map<&2, V>) -> Map<&2, V>:
  match items:
    case Own.DNil{}: catalog
    case Own.DCon{key, value, rest, _}:
      decode_fold(V, rest, names, Map.set(&2, V, catalog, Encoding.text(names, key), value))

def decode(-V: Data, items: Own.Dictionary<V>, names: List<&2, String>) -> Map<&2, V>:
  decode_fold(V, items, names, MTip{})

def lookup_result(-V: Data, result: Map<&2, V> & V) -> V:
  match result:
    case Tuple{_, value}: value

def source_lookup(-V: Data, fallback: V, catalog: Map<&2, V>, key: String) -> V:
  lookup_result(V, Map.get(V, fallback, catalog, key))
