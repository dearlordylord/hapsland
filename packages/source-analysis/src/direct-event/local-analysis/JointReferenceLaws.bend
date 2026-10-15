import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Joint.bend as J
import ./JointReference.bend as Reference

# Unsupported, missing, seen and over-limit references preserve the complete
# joint cursor, exact predecessor depth and actual edge queue. Internal
# positive budgets must be derived before the whole Root law uses this fact.
law reference_cursor:
  for +root: M.Declaration
  for +invocation: C.Global
  for +request: Nat
  for +actual: C.Cursor
  for +ghosts: List<&2, J.Ghost>
  Reference.reference_case(root, invocation, request, actual, ghosts)

def main() -> Unit:
  Unit{}
