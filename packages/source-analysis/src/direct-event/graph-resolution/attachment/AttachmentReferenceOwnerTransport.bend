import Base
import ./AttachmentReferenceOwnerProof.bend as Proof
import ./RetainedForestProjection.bend as P
import ../Core.bend as Core
import ../traversal/core.bend as Local
import ../traversal/patricia-proof/PATRICIA_RELATION.bend as Patricia

# Exact ordered owner lookup of the actual review_unit grouping expression.
# No freshness, density, nonempty-list or successful-rendering premise.
law grouped_owner:
  for +slots: List<&2, Local.ReferenceSlot>
  {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots), MTip{})) == True{} : Bool} &
  @+owner: Nat ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots), MTip{}), Nat.show(owner))
      == P.owner_slots(slots, owner) : List<&2, Local.ReferenceSlot>}

def grouped_owner(slots):
  Proof.owner_group(slots)

def main() -> Unit:
  Unit{}
