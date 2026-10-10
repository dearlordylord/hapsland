import Base
import ./MAP_HISTORY_RELATION.bend as History
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant
import ./REGISTRY_RELATION.bend as Registry
import ./BOUNDARY_ENCODING.bend as Encoding

# Monomorphic runtime falsification surface for the generic structural history laws.
def nat_source(items: List<&2, History.Record<Nat>>) -> Map<&2, Nat>:
  History.source(Nat, items)

def nat_numeric(
  items: List<&2, History.Record<Nat>>,
  names: List<&2, String>
) -> Own.Dictionary<Nat>:
  History.numeric(Nat, items, names)

def nat_decode(items: Own.Dictionary<Nat>, names: List<&2, String>) -> Map<&2, Nat>:
  History.decode(Nat, items, names)

def nat_set(items: Map<&2, Nat>, key: String, value: Nat) -> Map<&2, Nat>:
  Map.set(&2, Nat, items, key, value)

def nat_lookup(items: Map<&2, Nat>, key: String) -> Nat:
  History.source_lookup(Nat, 9999n, items, key)

def nat_own_set(items: Own.Dictionary<Nat>, key: Nat, value: Nat) -> Own.Dictionary<Nat>:
  Own.set(Nat, items, key, value)

def nat_own_lookup(items: Own.Dictionary<Nat>, key: Nat) -> Nat:
  Own.lookup(Nat, 9999n, items, key)

def nat_valid(items: Own.Dictionary<Nat>) -> Bool:
  Invariant.valid(Nat, items)

def nat_size(items: Own.Dictionary<Nat>) -> Nat:
  Own.size(Nat, items)

def nat_count(items: Map<&2, Nat>) -> Nat:
  List.length(&2, String, Map.keys(&2, Nat, items))

def nat_keys(items: List<&2, History.Record<Nat>>) -> List<&2, String>:
  History.keys(Nat, items)

def nat_fold(
  items: List<&2, History.Record<Nat>>,
  names: List<&2, String>,
  catalog: Own.Dictionary<Nat>
) -> Own.Dictionary<Nat>:
  History.numeric_fold(Nat, items, names, catalog)
