import Base
import ./VISITED_LAWS.bend as Laws
import ./BOUNDARY.bend as Boundary
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./VISITED_HISTORY_PROOF.bend as HistoryProof
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia
import ../representations/list-state/PATRICIA_INSERT_PROOF.bend as InsertProof

# The existing HistoryProof supplies append closure without a second copy.
# This fold establishes the canonical-map premise required by actual set/has.
def identities_go_canonical(items: List<&2, String>, +catalog: Map<&2, Bool>,
  valid: {Patricia.canonical(Bool, catalog) == True{} : Bool}) -> {
  Patricia.canonical(Bool, Boundary.identities_go(items, catalog)) == True{} : Bool
}:
  match items:
    case []: valid
    case +key <> rest:
      identities_go_canonical(rest, Map.set(&2, Bool, catalog, key, True{}),
        InsertProof.set_preserves_canonical(Bool, catalog, key, True{}, valid))

def identity_projection_exact(pair: Map<&2, Bool> & Bool) -> {
  Core.map_result(Bool, pair) == InsertProof.has_value(Bool, pair) : Bool
}:
  match pair:
    case Tuple{_, value}: {==}

def Laws.visited_insert_membership(prior, inserted, query):
  +catalog = Boundary.identities(prior)
  append_new : Bool -> Bool = old => Bool.or(String.eq(query, inserted), old)
  Equal.trans(
    Bool,
    CoreTraversal.has_identity(Map.set(&2, Bool, catalog, inserted, True{}), query),
    InsertProof.has_value(
      Bool,
      Map.has(&2, Bool, Map.set(&2, Bool, catalog, inserted, True{}), query)
    ),
    Bool.or(String.eq(query, inserted), CoreTraversal.has_identity(catalog, query)),
    identity_projection_exact(
      Map.has(&2, Bool, Map.set(&2, Bool, catalog, inserted, True{}), query)
    ),
    Equal.trans(
      Bool,
      InsertProof.has_value(
        Bool,
        Map.has(&2, Bool, Map.set(&2, Bool, catalog, inserted, True{}), query)
      ),
      Bool.or(
        String.eq(query, inserted),
        InsertProof.has_value(Bool, Map.has(&2, Bool, catalog, query))
      ),
      Bool.or(String.eq(query, inserted), CoreTraversal.has_identity(catalog, query)),
      InsertProof.set_has_membership(
        Bool,
        catalog,
        inserted,
        True{},
        query,
        identities_go_canonical(prior, MTip{}, {==})
      ),
      Equal.cong(
        Bool,
        Bool,
        append_new,
        InsertProof.has_value(Bool, Map.has(&2, Bool, catalog, query)),
        CoreTraversal.has_identity(catalog, query),
        Equal.sym(
          Bool,
          CoreTraversal.has_identity(catalog, query),
          InsertProof.has_value(Bool, Map.has(&2, Bool, catalog, query)),
          identity_projection_exact(Map.has(&2, Bool, catalog, query))
        )
      )
    )
  )

def main() -> Unit:
  Unit{}
