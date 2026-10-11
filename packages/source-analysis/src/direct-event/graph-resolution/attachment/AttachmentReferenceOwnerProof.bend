import Base
import ./AttachmentReferenceGroupProof.bend as Groups
import ./AttachmentNaturalKeyEqualityProof.bend as Keys
import ./AttachmentNaturalArithmeticFacts.bend as N
import ./RetainedForestProjection.bend as P
import ../Core.bend as Core
import ../traversal/core.bend as Local
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia
import ../traversal/GRAPH_LIST_FACTS.bend as Lists
import ../traversal/GRAPH_REVERSE_FACTS.bend as Reversal

def numeric_query(slots: List<&2, Local.ReferenceSlot>, +owner: Nat) ->
    {Groups.query_slots(slots, Nat.show(owner)) == P.owner_slots(slots, owner) : List<&2, Local.ReferenceSlot>}:
  match slots:
    case []: {==}
    case Local.ReferenceSlot{+id, +index, +symbol, +reference} <> +tail:
      key: {String.eq(Nat.show(owner), Nat.show(id)) == Nat.is_eq(id, owner) : Bool} =
        Equal.trans(Bool, String.eq(Nat.show(owner), Nat.show(id)), Nat.is_eq(owner, id), Nat.is_eq(id, owner),
          Keys.natural_key_equality(owner, id), N.is_eq_comm(owner, id))
      %Equal.sym(Bool, String.eq(Nat.show(owner), Nat.show(id)), Nat.is_eq(id, owner), key):
        {Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{id, index, symbol, reference} <> Groups.query_slots(tail, Nat.show(owner)), Groups.query_slots(tail, Nat.show(owner)))
          == P.owner_slots(Local.ReferenceSlot{id, index, symbol, reference} <> tail, owner) : List<&2, Local.ReferenceSlot>}
      %numeric_query(tail, owner):
        {Bool.pick(List<&2, Local.ReferenceSlot>, Nat.is_eq(id, owner), Local.ReferenceSlot{id, index, symbol, reference} <> Groups.query_slots(tail, Nat.show(owner)), Groups.query_slots(tail, Nat.show(owner)))
          == Bool.pick(List<&2, Local.ReferenceSlot>, Nat.is_eq(id, owner), Local.ReferenceSlot{id, index, symbol, reference} <> _, _) : List<&2, Local.ReferenceSlot>}
      {==}

def append_pick(bit: Bool, +slot: Local.ReferenceSlot, +left: List<&2, Local.ReferenceSlot>, +right: List<&2, Local.ReferenceSlot>) ->
    {List.append(&2, Local.ReferenceSlot, Bool.pick(List<&2, Local.ReferenceSlot>, bit, slot <> left, left), right)
      == Bool.pick(List<&2, Local.ReferenceSlot>, bit, slot <> List.append(&2, Local.ReferenceSlot, left, right), List.append(&2, Local.ReferenceSlot, left, right)) : List<&2, Local.ReferenceSlot>}:
  match bit:
    case False{}: {==}
    case True{}: {==}

def owner_append(left: List<&2, Local.ReferenceSlot>, +right: List<&2, Local.ReferenceSlot>, +owner: Nat) ->
    {P.owner_slots(List.append(&2, Local.ReferenceSlot, left, right), owner)
      == List.append(&2, Local.ReferenceSlot, P.owner_slots(left, owner), P.owner_slots(right, owner)) : List<&2, Local.ReferenceSlot>}:
  match left:
    case []: {==}
    case Local.ReferenceSlot{+id, +index, +symbol, +reference} <> +tail:
      %Equal.sym(List<&2, Local.ReferenceSlot>, P.owner_slots(List.append(&2, Local.ReferenceSlot, tail, right), owner),
          List.append(&2, Local.ReferenceSlot, P.owner_slots(tail, owner), P.owner_slots(right, owner)), owner_append(tail, right, owner)):
        {Bool.pick(List<&2, Local.ReferenceSlot>, Nat.is_eq(id, owner), Local.ReferenceSlot{id, index, symbol, reference} <> _, _)
          == List.append(&2, Local.ReferenceSlot, P.owner_slots(Local.ReferenceSlot{id, index, symbol, reference} <> tail, owner), P.owner_slots(right, owner)) : List<&2, Local.ReferenceSlot>}
      Equal.sym(List<&2, Local.ReferenceSlot>,
        List.append(&2, Local.ReferenceSlot, Bool.pick(List<&2, Local.ReferenceSlot>, Nat.is_eq(id, owner), Local.ReferenceSlot{id, index, symbol, reference} <> P.owner_slots(tail, owner), P.owner_slots(tail, owner)), P.owner_slots(right, owner)),
        Bool.pick(List<&2, Local.ReferenceSlot>, Nat.is_eq(id, owner), Local.ReferenceSlot{id, index, symbol, reference} <> List.append(&2, Local.ReferenceSlot, P.owner_slots(tail, owner), P.owner_slots(right, owner)), List.append(&2, Local.ReferenceSlot, P.owner_slots(tail, owner), P.owner_slots(right, owner))),
        append_pick(Nat.is_eq(id, owner), Local.ReferenceSlot{id, index, symbol, reference}, P.owner_slots(tail, owner), P.owner_slots(right, owner)))

def reverse_pick(bit: Bool, +slot: Local.ReferenceSlot, +tail: List<&2, Local.ReferenceSlot>) ->
    {List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, tail), Bool.pick(List<&2, Local.ReferenceSlot>, bit, [slot], []))
      == List.reverse(&2, Local.ReferenceSlot, Bool.pick(List<&2, Local.ReferenceSlot>, bit, slot <> tail, tail)) : List<&2, Local.ReferenceSlot>}:
  match bit:
    case False{}: Lists.append_nil(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, tail))
    case True{}:
      Equal.sym(List<&2, Local.ReferenceSlot>, List.reverse.go(&2, Local.ReferenceSlot, tail, [slot]),
        List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, tail), [slot]), Lists.reverse_go_spec(&2, Local.ReferenceSlot, tail, [slot]))

def owner_reverse(slots: List<&2, Local.ReferenceSlot>, +owner: Nat) ->
    {P.owner_slots(List.reverse(&2, Local.ReferenceSlot, slots), owner)
      == List.reverse(&2, Local.ReferenceSlot, P.owner_slots(slots, owner)) : List<&2, Local.ReferenceSlot>}:
  match slots:
    case []: {==}
    case Local.ReferenceSlot{+id, +index, +symbol, +reference} <> +tail:
      +slot: Local.ReferenceSlot = Local.ReferenceSlot{id, index, symbol, reference}
      %Equal.sym(List<&2, Local.ReferenceSlot>, List.reverse.go(&2, Local.ReferenceSlot, tail, [slot]),
          List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, tail), [slot]), Lists.reverse_go_spec(&2, Local.ReferenceSlot, tail, [slot])):
        {P.owner_slots(_, owner) == List.reverse(&2, Local.ReferenceSlot, P.owner_slots(slot <> tail, owner)) : List<&2, Local.ReferenceSlot>}
      Equal.trans(List<&2, Local.ReferenceSlot>,
        P.owner_slots(List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, tail), [slot]), owner),
        List.append(&2, Local.ReferenceSlot, P.owner_slots(List.reverse(&2, Local.ReferenceSlot, tail), owner), P.owner_slots([slot], owner)),
        List.reverse(&2, Local.ReferenceSlot, P.owner_slots(slot <> tail, owner)),
        owner_append(List.reverse(&2, Local.ReferenceSlot, tail), [slot], owner),
        Equal.trans(List<&2, Local.ReferenceSlot>,
          List.append(&2, Local.ReferenceSlot, P.owner_slots(List.reverse(&2, Local.ReferenceSlot, tail), owner), P.owner_slots([slot], owner)),
          List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, P.owner_slots(tail, owner)), P.owner_slots([slot], owner)),
          List.reverse(&2, Local.ReferenceSlot, P.owner_slots(slot <> tail, owner)),
          Equal.cong(List<&2, Local.ReferenceSlot>, List<&2, Local.ReferenceSlot>, items => List.append(&2, Local.ReferenceSlot, items, P.owner_slots([slot], owner)),
            P.owner_slots(List.reverse(&2, Local.ReferenceSlot, tail), owner), List.reverse(&2, Local.ReferenceSlot, P.owner_slots(tail, owner)), owner_reverse(tail, owner)),
          reverse_pick(Nat.is_eq(id, owner), slot, P.owner_slots(tail, owner))))

def normalized_slots(+slots: List<&2, Local.ReferenceSlot>, +owner: Nat) ->
    {List.reverse(&2, Local.ReferenceSlot, Groups.query_slots(List.reverse(&2, Local.ReferenceSlot, slots), Nat.show(owner)))
      == P.owner_slots(slots, owner) : List<&2, Local.ReferenceSlot>}:
  Equal.trans(List<&2, Local.ReferenceSlot>,
    List.reverse(&2, Local.ReferenceSlot, Groups.query_slots(List.reverse(&2, Local.ReferenceSlot, slots), Nat.show(owner))),
    List.reverse(&2, Local.ReferenceSlot, P.owner_slots(List.reverse(&2, Local.ReferenceSlot, slots), owner)),
    P.owner_slots(slots, owner),
    Equal.cong(List<&2, Local.ReferenceSlot>, List<&2, Local.ReferenceSlot>, items => List.reverse(&2, Local.ReferenceSlot, items),
      Groups.query_slots(List.reverse(&2, Local.ReferenceSlot, slots), Nat.show(owner)), P.owner_slots(List.reverse(&2, Local.ReferenceSlot, slots), owner),
      numeric_query(List.reverse(&2, Local.ReferenceSlot, slots), owner)),
    Equal.trans(List<&2, Local.ReferenceSlot>,
      List.reverse(&2, Local.ReferenceSlot, P.owner_slots(List.reverse(&2, Local.ReferenceSlot, slots), owner)),
      List.reverse(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, P.owner_slots(slots, owner))), P.owner_slots(slots, owner),
      Equal.cong(List<&2, Local.ReferenceSlot>, List<&2, Local.ReferenceSlot>, items => List.reverse(&2, Local.ReferenceSlot, items),
        P.owner_slots(List.reverse(&2, Local.ReferenceSlot, slots), owner), List.reverse(&2, Local.ReferenceSlot, P.owner_slots(slots, owner)), owner_reverse(slots, owner)),
      Reversal.reverse_reverse(&2, Local.ReferenceSlot, P.owner_slots(slots, owner))))

def owner_lookup(+slots: List<&2, Local.ReferenceSlot>, +owner: Nat) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots), MTip{}), Nat.show(owner))
      == P.owner_slots(slots, owner) : List<&2, Local.ReferenceSlot>}:
  Equal.trans(List<&2, Local.ReferenceSlot>,
    Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots), MTip{}), Nat.show(owner)),
    List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, Groups.query_slots(List.reverse(&2, Local.ReferenceSlot, slots), Nat.show(owner))), []),
    P.owner_slots(slots, owner), Groups.groups_read(List.reverse(&2, Local.ReferenceSlot, slots), MTip{}, Nat.show(owner), {==}),
    Equal.trans(List<&2, Local.ReferenceSlot>,
      List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, Groups.query_slots(List.reverse(&2, Local.ReferenceSlot, slots), Nat.show(owner))), []),
      List.reverse(&2, Local.ReferenceSlot, Groups.query_slots(List.reverse(&2, Local.ReferenceSlot, slots), Nat.show(owner))), P.owner_slots(slots, owner),
      Lists.append_nil(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, Groups.query_slots(List.reverse(&2, Local.ReferenceSlot, slots), Nat.show(owner)))), normalized_slots(slots, owner)))

def owner_group(+slots: List<&2, Local.ReferenceSlot>) ->
    {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots), MTip{})) == True{} : Bool} &
    @+owner: Nat -> {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(List.reverse(&2, Local.ReferenceSlot, slots), MTip{}), Nat.show(owner))
      == P.owner_slots(slots, owner) : List<&2, Local.ReferenceSlot>}:
  Tuple{Groups.groups_canonical(List.reverse(&2, Local.ReferenceSlot, slots), MTip{}, {==}), owner => owner_lookup(slots, owner)}

def main() -> Unit:
  Unit{}
