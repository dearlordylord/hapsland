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


def slot_0() -> Local.ReferenceSlot:
  Local.ReferenceSlot{0n, 0n, "s0", Local.Included{"raw\0"}}

def slot_1() -> Local.ReferenceSlot:
  Local.ReferenceSlot{1n, 1n, "s1", Local.Expanded{2n}}

def slot_2() -> Local.ReferenceSlot:
  Local.ReferenceSlot{0n, 2n, "s2", Local.Omitted{Local.Unresolved{}, "x"}}

def canonical_30(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_1(), slot_0()], MLeaf{"0", old})) == True{} : Bool}:
  {==}

def claim_30(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_1(), slot_0()], MLeaf{"0", old}), "2")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_1(), slot_0()], "2")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"0", old}, "2")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_31(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_1(), slot_0()], MLeaf{"0", old})) == True{} : Bool}:
  {==}

def claim_31(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_1(), slot_0()], MLeaf{"0", old}), "")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_1(), slot_0()], "")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"0", old}, "")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_32(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_1(), slot_0()], MLeaf{"1", old})) == True{} : Bool}:
  {==}

def claim_32(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_1(), slot_0()], MLeaf{"1", old}), "0")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_1(), slot_0()], "0")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"1", old}, "0")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_33(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_1(), slot_0()], MLeaf{"1", old})) == True{} : Bool}:
  {==}

def claim_33(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_1(), slot_0()], MLeaf{"1", old}), "1")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_1(), slot_0()], "1")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"1", old}, "1")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_34(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_1(), slot_0()], MLeaf{"1", old})) == True{} : Bool}:
  {==}

def claim_34(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_1(), slot_0()], MLeaf{"1", old}), "2")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_1(), slot_0()], "2")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"1", old}, "2")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_35(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_1(), slot_0()], MLeaf{"1", old})) == True{} : Bool}:
  {==}

def claim_35(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_1(), slot_0()], MLeaf{"1", old}), "")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_1(), slot_0()], "")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"1", old}, "")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_36(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0(), slot_1(), slot_2()], MTip{})) == True{} : Bool}:
  {==}

def claim_36(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0(), slot_1(), slot_2()], MTip{}), "0")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0(), slot_1(), slot_2()], "0")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MTip{}, "0")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_37(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0(), slot_1(), slot_2()], MTip{})) == True{} : Bool}:
  {==}

def claim_37(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0(), slot_1(), slot_2()], MTip{}), "1")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0(), slot_1(), slot_2()], "1")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MTip{}, "1")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_38(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0(), slot_1(), slot_2()], MTip{})) == True{} : Bool}:
  {==}

def claim_38(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0(), slot_1(), slot_2()], MTip{}), "2")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0(), slot_1(), slot_2()], "2")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MTip{}, "2")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_39(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0(), slot_1(), slot_2()], MTip{})) == True{} : Bool}:
  {==}

def claim_39(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0(), slot_1(), slot_2()], MTip{}), "")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0(), slot_1(), slot_2()], "")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MTip{}, "")) : List<&2, Local.ReferenceSlot>}:
  {==}

def main() -> Unit:
  Unit{}
