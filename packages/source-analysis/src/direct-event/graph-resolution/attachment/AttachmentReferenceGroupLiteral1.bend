import Base
import ../Core.bend as Core
import ../traversal/core.bend as Local
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

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

def canonical_10(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([], MLeaf{"1", old})) == True{} : Bool}:
  {==}

def claim_10(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([], MLeaf{"1", old}), "2")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([], "2")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"1", old}, "2")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_11(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([], MLeaf{"1", old})) == True{} : Bool}:
  {==}

def claim_11(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([], MLeaf{"1", old}), "")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([], "")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"1", old}, "")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_12(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0()], MTip{})) == True{} : Bool}:
  {==}

def claim_12(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0()], MTip{}), "0")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0()], "0")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MTip{}, "0")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_13(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0()], MTip{})) == True{} : Bool}:
  {==}

def claim_13(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0()], MTip{}), "1")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0()], "1")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MTip{}, "1")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_14(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0()], MTip{})) == True{} : Bool}:
  {==}

def claim_14(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0()], MTip{}), "2")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0()], "2")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MTip{}, "2")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_15(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0()], MTip{})) == True{} : Bool}:
  {==}

def claim_15(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0()], MTip{}), "")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0()], "")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MTip{}, "")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_16(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0()], MLeaf{"0", old})) == True{} : Bool}:
  {==}

def claim_16(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0()], MLeaf{"0", old}), "0")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0()], "0")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"0", old}, "0")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_17(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0()], MLeaf{"0", old})) == True{} : Bool}:
  {==}

def claim_17(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0()], MLeaf{"0", old}), "1")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0()], "1")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"0", old}, "1")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_18(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0()], MLeaf{"0", old})) == True{} : Bool}:
  {==}

def claim_18(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0()], MLeaf{"0", old}), "2")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0()], "2")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"0", old}, "2")) : List<&2, Local.ReferenceSlot>}:
  {==}

def canonical_19(+old: List<&2, Local.ReferenceSlot>) -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references([slot_0()], MLeaf{"0", old})) == True{} : Bool}:
  {==}

def claim_19(+old: List<&2, Local.ReferenceSlot>) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references([slot_0()], MLeaf{"0", old}), "")
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots([slot_0()], "")), Core.map_read(List<&2, Local.ReferenceSlot>, [], MLeaf{"0", old}, "")) : List<&2, Local.ReferenceSlot>}:
  {==}

def main() -> Unit:
  Unit{}
