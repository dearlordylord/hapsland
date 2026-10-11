import Base
import ../ReferenceGroupMutantCore.bend as Core
import ../traversal/core.bend as Local
import ./RetainedForestProjection.bend as P
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

def slots_0() -> List<&2, Local.ReferenceSlot>:
  []

def canonical_0() -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_0()), MTip{})) == True{} : Bool}:
  {==}

def claim_0_0() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_0()), MTip{}), Nat.show(0n)) == P.owner_slots(slots_0(), 0n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_0_1() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_0()), MTip{}), Nat.show(1n)) == P.owner_slots(slots_0(), 1n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_0_9() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_0()), MTip{}), Nat.show(9n)) == P.owner_slots(slots_0(), 9n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_0_10() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_0()), MTip{}), Nat.show(10n)) == P.owner_slots(slots_0(), 10n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_0_11() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_0()), MTip{}), Nat.show(11n)) == P.owner_slots(slots_0(), 11n) : List<&2, Local.ReferenceSlot>}:
  {==}

def slots_1() -> List<&2, Local.ReferenceSlot>:
  [Local.ReferenceSlot{0n, 0n, "a", Local.Included{"first"}}]

def canonical_1() -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_1()), MTip{})) == True{} : Bool}:
  {==}

def claim_1_0() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_1()), MTip{}), Nat.show(0n)) == P.owner_slots(slots_1(), 0n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_1_1() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_1()), MTip{}), Nat.show(1n)) == P.owner_slots(slots_1(), 1n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_1_9() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_1()), MTip{}), Nat.show(9n)) == P.owner_slots(slots_1(), 9n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_1_10() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_1()), MTip{}), Nat.show(10n)) == P.owner_slots(slots_1(), 10n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_1_11() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_1()), MTip{}), Nat.show(11n)) == P.owner_slots(slots_1(), 11n) : List<&2, Local.ReferenceSlot>}:
  {==}

def slots_2() -> List<&2, Local.ReferenceSlot>:
  [Local.ReferenceSlot{0n, 0n, "a", Local.Included{"first"}}, Local.ReferenceSlot{10n, 0n, "other", Local.Included{"second"}}, Local.ReferenceSlot{0n, 1n, "b", Local.Expanded{11n}}]

def canonical_2() -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_2()), MTip{})) == True{} : Bool}:
  {==}

def claim_2_0() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_2()), MTip{}), Nat.show(0n)) == P.owner_slots(slots_2(), 0n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_2_1() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_2()), MTip{}), Nat.show(1n)) == P.owner_slots(slots_2(), 1n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_2_9() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_2()), MTip{}), Nat.show(9n)) == P.owner_slots(slots_2(), 9n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_2_10() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_2()), MTip{}), Nat.show(10n)) == P.owner_slots(slots_2(), 10n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_2_11() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_2()), MTip{}), Nat.show(11n)) == P.owner_slots(slots_2(), 11n) : List<&2, Local.ReferenceSlot>}:
  {==}

def slots_3() -> List<&2, Local.ReferenceSlot>:
  [Local.ReferenceSlot{10n, 0n, "a", Local.Expanded{11n}}, Local.ReferenceSlot{0n, 0n, "b", Local.Included{"second"}}, Local.ReferenceSlot{10n, 1n, "c", Local.Included{"third"}}]

def canonical_3() -> {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_3()), MTip{})) == True{} : Bool}:
  {==}

def claim_3_0() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_3()), MTip{}), Nat.show(0n)) == P.owner_slots(slots_3(), 0n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_3_1() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_3()), MTip{}), Nat.show(1n)) == P.owner_slots(slots_3(), 1n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_3_9() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_3()), MTip{}), Nat.show(9n)) == P.owner_slots(slots_3(), 9n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_3_10() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_3()), MTip{}), Nat.show(10n)) == P.owner_slots(slots_3(), 10n) : List<&2, Local.ReferenceSlot>}:
  {==}

def claim_3_11() -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots_3()), MTip{}), Nat.show(11n)) == P.owner_slots(slots_3(), 11n) : List<&2, Local.ReferenceSlot>}:
  {==}

def main() -> Unit:
  Unit{}
