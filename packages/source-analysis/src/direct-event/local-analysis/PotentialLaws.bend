import Base
import ./Model.bend as M
import ./Core.bend as Core
import ./Potential.bend as P

# Supporting entry case of the joint root theorem: every arbitrary catalog/root
# starts with enough semantic tasks for its actual pending/unvisited potential.
# This is not the preservation or completion theorem.
law root_entry_valid:
  for +root: M.Declaration
  for +catalog: M.Catalog
  for purpose: Core.Purpose
  for pending: List<&2, M.Declaration>
  for prefix: List<&2, M.Outcome>
  for request: Nat
  {
    P.step_valid(Core.next_root(Core.Global{catalog, purpose, root <> pending, prefix, request}))
    == True{}
    : Bool
  }

def main() -> Unit:
  Unit{}
