import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./BOUNDARY.bend as Boundary

# Actual insertion into a Boundary-created visited map adds exactly that
# identity and preserves prior membership. Duplicate identities are allowed.
# This supplies the visited-domain step for the original completion laws.
law visited_insert_membership:
  for +prior: List<&2, String>
  for +inserted: String
  for +query: String
  {
    CoreTraversal.has_identity(
      Map.set(&2, Bool, Boundary.identities(prior), inserted, True{}), query
    )
    == Bool.or(String.eq(query, inserted), CoreTraversal.has_identity(Boundary.identities(prior), query))
    : Bool
  }
