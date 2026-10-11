import Base
import ./AttachmentIndexedOwnerTransport.bend as Owner
import ./AttachmentIndexedOwnerAssembly.bend as Assembly
import ./AttachmentReplacementStructureProof.bend as Structure
import ./RetainedForestProjection.bend as P
import ./ActualAttachmentPhaseProjection.bend as Ready
import ../Composition.bend as Compose
import ../ForestSpecification.bend as F
import ../traversal/core.bend as Local

# Astra-approved internal parent cut; no production state or success premise.
# The global changed witness is the payload of the actual replacement result.
def global_result(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +target: Nat, +position: Nat,
    +references: List<&2, F.Reference>, +new_actual: Local.PlannedReference,
    +new_semantic: F.Reference, +addresses: List<&2, F.AddressEntry>) -> Type:
  Exists(List<&2, Local.ReferenceSlot>, changed => Exists(List<&2, F.Reference>, semantic_changed =>
    {Compose.replacement(Compose.replace_slot(items, owner, target, new_actual)) == Some{changed} : Maybe<&2, List<&2, Local.ReferenceSlot>>} &
    {F.replace_slot(references, position, new_semantic) == F.Slots{semantic_changed, 1n} : F.Slots} &
    {P.references(P.owner_slots(changed, owner), addresses) == Some{semantic_changed} : Maybe<&2, List<&2, F.Reference>>}))

def count_lift(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +target: Nat,
    +new_actual: Local.PlannedReference, +changed: List<&2, Local.ReferenceSlot>,
    done: {Compose.replace_slot(P.owner_slots(items, owner), owner, target, new_actual) == Compose.ReplacedSlots{1n, changed} : Compose.ReplacedSlots}) ->
    {Structure.count(Compose.replace_slot(items, owner, target, new_actual)) == 1n : Nat}:
  %Equal.sym(Nat, Structure.count(Compose.replace_slot(items, owner, target, new_actual)),
    Structure.count(Structure.filtered(Compose.replace_slot(items, owner, target, new_actual), owner)),
    Structure.count_filtered(Compose.replace_slot(items, owner, target, new_actual), owner)):
    {_ == 1n : Nat}
  %Equal.sym(Compose.ReplacedSlots, Structure.filtered(Compose.replace_slot(items, owner, target, new_actual), owner),
    Compose.replace_slot(P.owner_slots(items, owner), owner, target, new_actual), Structure.filter_selected_owner(items, owner, target, new_actual)):
    {Structure.count(_) == 1n : Nat}
  %Equal.sym(Compose.ReplacedSlots, Compose.replace_slot(P.owner_slots(items, owner), owner, target, new_actual), Compose.ReplacedSlots{1n, changed}, done):
    {Structure.count(_) == 1n : Nat}
  {==}

def projection_lift(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +target: Nat,
    +new_actual: Local.PlannedReference, +changed: List<&2, Local.ReferenceSlot>,
    +addresses: List<&2, F.AddressEntry>, +semantic_changed: List<&2, F.Reference>,
    done: {Compose.replace_slot(P.owner_slots(items, owner), owner, target, new_actual) == Compose.ReplacedSlots{1n, changed} : Compose.ReplacedSlots},
    projected: {P.references(changed, addresses) == Some{semantic_changed} : Maybe<&2, List<&2, F.Reference>>}) ->
    {P.references(P.owner_slots(Structure.slots(Compose.replace_slot(items, owner, target, new_actual)), owner), addresses) == Some{semantic_changed} : Maybe<&2, List<&2, F.Reference>>}:
  %Equal.sym(List<&2, Local.ReferenceSlot>, P.owner_slots(Structure.slots(Compose.replace_slot(items, owner, target, new_actual)), owner),
    Structure.slots(Structure.filtered(Compose.replace_slot(items, owner, target, new_actual), owner)), Structure.slots_filtered(Compose.replace_slot(items, owner, target, new_actual), owner)):
    {P.references(_, addresses) == Some{semantic_changed} : Maybe<&2, List<&2, F.Reference>>}
  %Equal.sym(Compose.ReplacedSlots, Structure.filtered(Compose.replace_slot(items, owner, target, new_actual), owner),
    Compose.replace_slot(P.owner_slots(items, owner), owner, target, new_actual), Structure.filter_selected_owner(items, owner, target, new_actual)):
    {P.references(Structure.slots(_), addresses) == Some{semantic_changed} : Maybe<&2, List<&2, F.Reference>>}
  %Equal.sym(Compose.ReplacedSlots, Compose.replace_slot(P.owner_slots(items, owner), owner, target, new_actual), Compose.ReplacedSlots{1n, changed}, done):
    {P.references(Structure.slots(_), addresses) == Some{semantic_changed} : Maybe<&2, List<&2, F.Reference>>}
  projected

def global_parts(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +target: Nat, +position: Nat,
    +references: List<&2, F.Reference>, +new_actual: Local.PlannedReference,
    +new_semantic: F.Reference, +addresses: List<&2, F.AddressEntry>,
    owned_result: Assembly.result(P.owner_slots(items, owner), owner, target, position, references, new_actual, new_semantic, addresses)) ->
    global_result(items, owner, target, position, references, new_actual, new_semantic, addresses):
  match owned_result:
    case (+changed, (+semantic_changed, (+done, (semantic, projected)))):
      Tuple{Structure.slots(Compose.replace_slot(items, owner, target, new_actual)), Tuple{semantic_changed, Tuple{
        Structure.replacement_one(Compose.replace_slot(items, owner, target, new_actual), count_lift(items, owner, target, new_actual, changed, done)),
        Tuple{semantic, projection_lift(items, owner, target, new_actual, changed, addresses, semantic_changed, done, projected)}}}}

def interleaved_replacement(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +start: Nat, +position: Nat,
    +symbol: String, +later: List<&2, Local.PlannedNode>, +addresses: List<&2, F.AddressEntry>,
    +references: List<&2, F.Reference>, +new_actual: Local.PlannedReference, +new_semantic: F.Reference,
    indexed: {P.indexed(P.owner_slots(items, owner), start, later) == True{} : Bool},
    selected: {Ready.slot_count(items, owner, (start + position : Nat), symbol) == 1n : Nat},
    projected: {P.references(P.owner_slots(items, owner), addresses) == Some{references} : Maybe<&2, List<&2, F.Reference>>},
    replacement_reference: {P.reference(Local.ReferenceSlot{owner, (start + position : Nat), symbol, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>}) ->
    global_result(items, owner, (start + position : Nat), position, references, new_actual, new_semantic, addresses):
  global_parts(items, owner, (start + position : Nat), position, references, new_actual, new_semantic, addresses,
    Owner.indexed_owner_replacement(P.owner_slots(items, owner), owner, start, position, symbol, later, addresses, references, new_actual, new_semantic,
      indexed, Structure.filter_idempotent(items, owner),
      %Equal.sym(Nat, Ready.slot_count(P.owner_slots(items, owner), owner, (start + position : Nat), symbol),
        Ready.slot_count(items, owner, (start + position : Nat), symbol), Structure.selected_filter(items, owner, (start + position : Nat), symbol)):
        {_ == 1n : Nat}
      selected,
      projected, replacement_reference))

def main() -> Unit:
  Unit{}
