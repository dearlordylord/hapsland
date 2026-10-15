import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Joint.bend as J

# Preservation of the complete joint cursor and exact actual
# transition for the fresh named branch. Internal successor forms cannot be
# promoted to premises of the public Root completion law.
law fresh_cursor:
  for +root: M.Declaration
  for +invocation: C.Global
  for +request: Nat
  for +actual: C.Cursor
  for +ghosts: List<&2, J.Ghost>
  for +target: M.Declaration
  J.fresh_case(root, invocation, request, actual, ghosts, target)

def main() -> Unit:
  Unit{}
