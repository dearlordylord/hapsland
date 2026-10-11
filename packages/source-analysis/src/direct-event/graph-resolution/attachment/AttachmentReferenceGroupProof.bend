import Base
import ../traversal/GRAPH_LIST_FACTS.bend as Lists
import ../traversal/INTERPRETER_STRING_FACTS.bend as Strings
import ../traversal/patricia-proof/PATRICIA_INSERT_PROOF.bend as Insert
import ./AttachmentMapPayloadTransport.bend as MapPayload
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

def groups_canonical(slots: List<&2, Local.ReferenceSlot>, +groups: Map<&2, List<&2, Local.ReferenceSlot>>,
    valid: {Patricia.canonical(List<&2, Local.ReferenceSlot>, groups) == True{} : Bool}) ->
    {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(slots, groups)) == True{} : Bool}:
  match slots:
    case []: valid
    case Local.ReferenceSlot{+owner, +index, +symbol, +reference} <> +tail:
      groups_canonical(tail,
        Map.set(&2, List<&2, Local.ReferenceSlot>, groups, Nat.show(owner),
          Local.ReferenceSlot{owner, index, symbol, reference} <>
            Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(owner))),
        Insert.set_preserves_canonical(List<&2, Local.ReferenceSlot>, groups, Nat.show(owner),
          Local.ReferenceSlot{owner, index, symbol, reference} <>
            Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(owner)), valid))

def lookup_step(+slot: Local.ReferenceSlot, +groups: Map<&2, List<&2, Local.ReferenceSlot>>,
    +key: String, +query: String, hit: Bool,
    +test: {String.eq(query, key) == hit : Bool},
    valid: {Patricia.canonical(List<&2, Local.ReferenceSlot>, groups) == True{} : Bool}) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [],
        Map.set(&2, List<&2, Local.ReferenceSlot>, groups, key,
          slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key)), query)
      == Bool.pick(List<&2, Local.ReferenceSlot>, hit,
        slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, query),
        Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, query)) : List<&2, Local.ReferenceSlot>}:
  match hit:
    case False{}:
      %test:
        {Core.map_read(List<&2, Local.ReferenceSlot>, [], Map.set(&2, List<&2, Local.ReferenceSlot>, groups, key,
            slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key)), query)
          == Bool.pick(List<&2, Local.ReferenceSlot>, _, slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key),
            Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, query)) : List<&2, Local.ReferenceSlot>}
      MapPayload.lookup_after_set(List<&2, Local.ReferenceSlot>, groups, key, query,
        slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key), [], valid)
    case True{}:
      %Equal.sym(String, query, key, Strings.eq_of_eq_true(query, key, test)):
        {Core.map_read(List<&2, Local.ReferenceSlot>, [], Map.set(&2, List<&2, Local.ReferenceSlot>, groups, key,
            slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key)), query)
          == slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, _) : List<&2, Local.ReferenceSlot>}
      %test:
        {Core.map_read(List<&2, Local.ReferenceSlot>, [], Map.set(&2, List<&2, Local.ReferenceSlot>, groups, key,
            slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key)), query)
          == Bool.pick(List<&2, Local.ReferenceSlot>, _, slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key),
            Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, query)) : List<&2, Local.ReferenceSlot>}
      MapPayload.lookup_after_set(List<&2, Local.ReferenceSlot>, groups, key, query,
        slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key), [], valid)

def list_step(+slot: Local.ReferenceSlot, +filtered: List<&2, Local.ReferenceSlot>, +old: List<&2, Local.ReferenceSlot>, hit: Bool) ->
    {List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered),
        Bool.pick(List<&2, Local.ReferenceSlot>, hit, slot <> old, old))
      == List.append(&2, Local.ReferenceSlot,
        List.reverse(&2, Local.ReferenceSlot, Bool.pick(List<&2, Local.ReferenceSlot>, hit, slot <> filtered, filtered)), old)
      : List<&2, Local.ReferenceSlot>}:
  match hit:
    case False{}: {==}
    case True{}:
      %Equal.sym(List<&2, Local.ReferenceSlot>, List.reverse.go(&2, Local.ReferenceSlot, filtered, [slot]),
        List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered), [slot]),
        Lists.reverse_go_spec(&2, Local.ReferenceSlot, filtered, [slot])):
        {List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered), slot <> old)
          == List.append(&2, Local.ReferenceSlot, _, old) : List<&2, Local.ReferenceSlot>}
      Equal.sym(List<&2, Local.ReferenceSlot>,
        List.append(&2, Local.ReferenceSlot, List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered), [slot]), old),
        List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered), slot <> old),
        Lists.append_assoc(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered), [slot], old))

def groups_read(slots: List<&2, Local.ReferenceSlot>, +groups: Map<&2, List<&2, Local.ReferenceSlot>>, +query: String,
    +valid: {Patricia.canonical(List<&2, Local.ReferenceSlot>, groups) == True{} : Bool}) ->
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(slots, groups), query)
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots(slots, query)),
        Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, query)) : List<&2, Local.ReferenceSlot>}:
  match slots:
    case []: {==}
    case Local.ReferenceSlot{+owner, +index, +symbol, +reference} <> +tail:
      +slot: Local.ReferenceSlot = Local.ReferenceSlot{owner, index, symbol, reference}
      +key = Nat.show(owner)
      +updated = Map.set(&2, List<&2, Local.ReferenceSlot>, groups, key,
        slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key))
      +filtered = query_slots(tail, query)
      +old = Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, query)
      Equal.trans(List<&2, Local.ReferenceSlot>,
        Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(tail, updated), query),
        List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered),
          Core.map_read(List<&2, Local.ReferenceSlot>, [], updated, query)),
        List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot,
          Bool.pick(List<&2, Local.ReferenceSlot>, String.eq(query, key), slot <> filtered, filtered)), old),
        groups_read(tail, updated, query,
          Insert.set_preserves_canonical(List<&2, Local.ReferenceSlot>, groups, key,
            slot <> Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, key), valid)),
        Equal.trans(List<&2, Local.ReferenceSlot>,
          List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered), Core.map_read(List<&2, Local.ReferenceSlot>, [], updated, query)),
          List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered), Bool.pick(List<&2, Local.ReferenceSlot>, String.eq(query, key), slot <> old, old)),
          List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, Bool.pick(List<&2, Local.ReferenceSlot>, String.eq(query, key), slot <> filtered, filtered)), old),
          Equal.cong(List<&2, Local.ReferenceSlot>, List<&2, Local.ReferenceSlot>,
            items => List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, filtered), items),
            Core.map_read(List<&2, Local.ReferenceSlot>, [], updated, query),
            Bool.pick(List<&2, Local.ReferenceSlot>, String.eq(query, key), slot <> old, old),
            lookup_step(slot, groups, key, query, String.eq(query, key), {==}, valid)),
          list_step(slot, filtered, old, String.eq(query, key))))

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

def finish_groups(+slots: List<&2, Local.ReferenceSlot>, +groups: Map<&2, List<&2, Local.ReferenceSlot>>, +query: String,
    +valid: {Patricia.canonical(List<&2, Local.ReferenceSlot>, groups) == True{} : Bool}) ->
    {Patricia.canonical(List<&2, Local.ReferenceSlot>, Core.group_references(slots, groups)) == True{} : Bool} &
    {Core.map_read(List<&2, Local.ReferenceSlot>, [], Core.group_references(slots, groups), query)
      == List.append(&2, Local.ReferenceSlot, List.reverse(&2, Local.ReferenceSlot, query_slots(slots, query)),
        Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, query)) : List<&2, Local.ReferenceSlot>}:
  Tuple{groups_canonical(slots, groups, valid), groups_read(slots, groups, query, valid)}

def grouped_payload(slots, groups, query, valid):
  finish_groups(slots, groups, query, valid)

def main() -> Unit:
  Unit{}
