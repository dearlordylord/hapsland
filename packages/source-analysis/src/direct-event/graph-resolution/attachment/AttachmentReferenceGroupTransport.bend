import Base
import ../Core.bend as Core
import ../traversal/core.bend as Local
import ../traversal/patricia-proof/PATRICIA_RELATION.bend as Patricia

# Filter in source order by actual existing Map key; arbitrary query also covers
# absent keys. Numeric owner projection follows the proved natural-key bridge.
def query_slot(+slot: Local.ReferenceSlot, +query: String, +rest: List<&2, Local.ReferenceSlot>) ->
    List<&2, Local.ReferenceSlot>:
  match slot:
    case Local.ReferenceSlot{owner, index, symbol, reference}:
      Bool.pick(List<&2, Local.ReferenceSlot>, String.eq(query, Nat.show(owner)),
        Local.ReferenceSlot{owner, index, symbol, reference} <> rest, rest)

def query_slots(slots: List<&2, Local.ReferenceSlot>, +query: String) -> List<&2, Local.ReferenceSlot>:
  match slots:
    case []: []
    case +slot <> tail:
      query_slot(slot, query, query_slots(tail, query))

# Whole existing grouping fold: canonical output and exact prepended order,
# including arbitrary prior accumulator contents. No freshness premise.
law grouped_payload:
  for +slots: List<&2, Local.ReferenceSlot>
  for +groups: Map<&2, List<&2, Local.ReferenceSlot>>
  for +query: String
  for valid: {Patricia.canonical(List<&2, Local.ReferenceSlot>, groups) == True{} : Bool}
  {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(slots, groups)) == True{} : Bool} &
  {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(slots, groups), query)
    == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots(slots, query)),
      Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, query)) : List<&2, Local.ReferenceSlot>}

def main() -> Unit:
  Unit{}
