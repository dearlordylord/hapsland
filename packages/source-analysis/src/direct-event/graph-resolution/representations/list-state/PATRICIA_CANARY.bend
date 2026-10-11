import Base
import ./PATRICIA_RELATION.bend as Patricia
import ./MAP_HISTORY_RELATION.bend as History

# Monomorphic finite test surface; no proof-owner import.
def nat_source(items: List<&2, History.Record<Nat>>) -> Map<&2, Nat>:
  History.source(Nat, items)

def nat_canonical(tree: Map<&2, Nat>) -> Bool:
  Patricia.canonical(Nat, tree)

def nat_set(tree: Map<&2, Nat>, key: String, value: Nat) -> Map<&2, Nat>:
  Map.set(&2, Nat, tree, key, value)

def nat_lookup(tree: Map<&2, Nat>, key: String) -> Nat:
  Patricia.lookup(Nat, 9999n, tree, key)

def nat_first_leaf(tree: Map<&2, Nat>) -> Maybe<&2, String>:
  Patricia.first_leaf(Nat, tree)

def nat_nonempty(tree: Map<&2, Nat>) -> Bool:
  Patricia.nonempty(Nat, tree)

def bit(key: String, position: Nat) -> String & Bool:
  Map.bit(key, position)

def split(left: String, right: String) -> Nat:
  Map.diff(left, right)

def prefix(count: Nat, left: String, right: String) -> Bool:
  Patricia.same_prefix(count, left, right)

def route(key: String, position: Nat) -> Bool:
  Patricia.route(key, position)
