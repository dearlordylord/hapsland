import Base
import ./AttachmentIndexedOwnerAssembly.bend as Assembly
import ./AttachmentReplacementStructureProof.bend as Structure
import ../traversal/INTERPRETER_NAT_FACTS.bend as N
import ./RetainedForestProjection.bend as P
import ./ActualAttachmentPhaseProjection.bend as Ready
import ../Composition.bend as Compose
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../traversal/core.bend as Local

# Internal owner-list cut approved by Astra. Original use starts at zero.
# Replacement success and exact count are conclusions, never prerequisites.
law indexed_owner_replacement:
  for +items: List<&2, Local.ReferenceSlot>
  for +owner: Nat
  for +start: Nat
  for +position: Nat
  for +symbol: String
  for +later: List<&2, Local.PlannedNode>
  for +addresses: List<&2, F.AddressEntry>
  for +references: List<&2, F.Reference>
  for +new_actual: Local.PlannedReference
  for +new_semantic: F.Reference
  for +indexed: {P.indexed(items, start, later) == True{} : Bool}
  for owned: {P.owner_slots(items, owner) == items : List<&2, Local.ReferenceSlot>}
  for selected: {Ready.slot_count(items, owner, (start + position : Nat), symbol) == 1n : Nat}
  for projected: {P.references(items, addresses) == Some{references} : Maybe<&2, List<&2, F.Reference>>}
  for replacement_reference: {P.reference(Local.ReferenceSlot{owner, (start + position : Nat), symbol, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>}
  Exists(List<&2, Local.ReferenceSlot>, changed => Exists(List<&2, F.Reference>, semantic_changed =>
    {Compose.replace_slot(items, owner, (start + position : Nat), new_actual) == Compose.ReplacedSlots{1n, changed} : Compose.ReplacedSlots} &
    {F.replace_slot(references, position, new_semantic) == F.Slots{semantic_changed, 1n} : F.Slots} &
    {P.references(changed, addresses) == Some{semantic_changed} : Maybe<&2, List<&2, F.Reference>>}
  ))

def indexed_owner_replacement(items, owner, start, position, symbol, later, addresses, references,
    new_actual, new_semantic, indexed, owned, selected, projected, replacement_reference):
  match items position:
    case [] _:
      Empty.absurd(Assembly.result([], owner, (start + position : Nat), position, references, new_actual, new_semantic, addresses), Structure.zero_ne_one(selected))
    case Local.ReferenceSlot{+actual_owner, +actual_index, +text, +previous} <> +rest 0n:
      %Equal.sym(Nat, (start + 0n : Nat), start, N.add_zero(start)):
        Assembly.result(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, _, 0n, references, new_actual, new_semantic, addresses)
      Assembly.head(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, addresses, references, new_actual, new_semantic, indexed,
        %N.add_zero(start): {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, _, symbol) == 1n : Nat}
        selected,
        projected,
        %N.add_zero(start): {P.reference(Local.ReferenceSlot{owner, _, symbol, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>}
        replacement_reference)
    case Local.ReferenceSlot{+actual_owner, +actual_index, +text, +previous} <> +rest 1n++remaining:
      Assembly.successor_parts(actual_owner, actual_index, text, previous, rest, owner, start, remaining, symbol, later, addresses, references, new_actual, new_semantic,
        indexed, Structure.references_cons_split(Local.ReferenceSlot{actual_owner, actual_index, text, previous}, rest, addresses, references, projected),
        +suffix => suffix_projected => indexed_owner_replacement(rest, owner, (start + 1n : Nat), remaining, symbol, later, addresses, suffix, new_actual, new_semantic,
          Assembly.index_tail(actual_index, start, previous, rest, later, indexed),
          Structure.owned_tail(actual_owner, actual_index, text, previous, rest, owner, owned),
          Assembly.selected_tail(actual_owner, actual_index, text, previous, rest, owner, start, remaining, symbol, later, indexed, selected),
          suffix_projected,
          %Assembly.next_position(start, remaining):
            {P.reference(Local.ReferenceSlot{owner, _, symbol, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>}
          replacement_reference))

def main() -> Unit:
  Unit{}
