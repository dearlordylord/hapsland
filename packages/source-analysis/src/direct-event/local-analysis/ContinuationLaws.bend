import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Continuation.bend as K

# Bootstrap correspondence to the original Spec root, without assuming its
# termination. The root inventory supplies a positive initial Spec depth.
law root_frame_initial:
  for +root: M.Declaration
  for +catalog: M.Catalog
  for purpose: C.Purpose
  K.root_frame_relation(root, catalog, purpose)

def main() -> Unit:
  Unit{}
