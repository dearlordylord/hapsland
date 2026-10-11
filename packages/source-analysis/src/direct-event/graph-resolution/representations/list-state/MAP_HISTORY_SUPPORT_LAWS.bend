import Base
import ./MAP_HISTORY_RELATION.bend as History
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant

# The entire ordered record fold preserves structural uniqueness and every cached count.
# No registry coverage or source-map premise is needed for this numeric invariant.
law numeric_fold_preserves_invariant:
  for -V: Data
  for +items: List<&2, History.Record<V>>
  for +names: List<&2, String>
  for +catalog: Own.Dictionary<V>
  for valid: {Invariant.valid(V, catalog) == True{} : Bool}
  {Invariant.valid(V, History.numeric_fold(V, items, names, catalog)) == True{} : Bool}
