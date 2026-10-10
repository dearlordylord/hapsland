import Base
import ./MAP_HISTORY_RELATION.bend as History
import ./MAP_HISTORY_SUPPORT_LAWS.bend as Support
import ./Own.bend as Own
import ./INVARIANT.bend as Invariant
import ./BOUNDARY_ENCODING.bend as Encoding
import ./LAWS.bend as DictionaryLaws
import ./PROOF.bend as DictionaryProof

law history_dictionary_valid:
  for -V: Data
  for items: List<&2, History.Record<V>>
  for names: List<&2, String>
  {Invariant.valid(V, History.numeric(V, items, names)) == True{} : Bool}

def Support.numeric_fold_preserves_invariant(V, items, names, catalog, valid):
  match items:
    case []: valid
    case History.Record{+key, +value} <> rest:
      Support.numeric_fold_preserves_invariant(
        V,
        rest,
        names,
        Own.set(V, catalog, Encoding.identity(names, key), value),
        DictionaryLaws.insertion_preserves_invariant(
          V,
          catalog,
          Encoding.identity(names, key),
          value,
          valid
        )
      )

def history_dictionary_valid(V, items, names):
  Support.numeric_fold_preserves_invariant(V, items, names, Own.DNil{}, {==})
