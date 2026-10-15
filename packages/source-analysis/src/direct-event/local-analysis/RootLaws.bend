import Base
import ./Model.bend as M
import ./Core.bend as Core
import ./Root.bend as Root

# One joint obligation for correspondence and sufficient internal bounds.
# The arbitrary outer continuation is retained, not executed by this lemma.
# No unique/valid/acyclic catalog or external fuel premise is allowed.
law complete_root_with_continuation:
  for +root: M.Declaration
  for +catalog: M.Catalog
  for +purpose: Core.Purpose
  for +pending: List<&2, M.Declaration>
  for +prefix: List<&2, M.Outcome>
  for +request: Nat
  Root.correspondence(Root.execute(root, catalog, purpose, pending, prefix, request),
    Root.expected(root, catalog, purpose, pending, prefix, request))

def main() -> Unit:
  Unit{}
