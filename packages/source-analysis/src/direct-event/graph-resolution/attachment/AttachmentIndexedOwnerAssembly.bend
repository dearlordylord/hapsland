import Base
import ./AttachmentReplacementStructureProof.bend as Structure
import ./AttachmentRemapProjectionProof.bend as Remap
import ./RetainedForestProjection.bend as P
import ./ActualAttachmentPhaseProjection.bend as Ready
import ../Composition.bend as Compose
import ../ForestSpecification.bend as F
import ../traversal/core.bend as Local
import ../traversal/INTERPRETER_NAT_FACTS.bend as N
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B

# Internal construction of the Astra-approved indexed_owner_replacement.
# Existing representations and exact original conclusion; no success premise.
def result(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +target: Nat, +position: Nat,
    +references: List<&2, F.Reference>, +new_actual: Local.PlannedReference,
    +new_semantic: F.Reference, +addresses: List<&2, F.AddressEntry>) -> Type:
  Exists(List<&2, Local.ReferenceSlot>, changed => Exists(List<&2, F.Reference>, semantic_changed =>
    {Compose.replace_slot(items, owner, target, new_actual) == Compose.ReplacedSlots{1n, changed} : Compose.ReplacedSlots} &
    {F.replace_slot(references, position, new_semantic) == F.Slots{semantic_changed, 1n} : F.Slots} &
    {P.references(changed, addresses) == Some{semantic_changed} : Maybe<&2, List<&2, F.Reference>>}))

def index_tail(+actual_index: Nat, +start: Nat, +previous: Local.PlannedReference,
    +rest: List<&2, Local.ReferenceSlot>, +later: List<&2, Local.PlannedNode>,
    indexed: {Bool.and(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later))) == True{} : Bool}) ->
    {P.indexed(rest, (start + 1n : Nat), later) == True{} : Bool}:
  B.eq_true_of_and_right(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later),
    B.eq_true_of_and_right(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later)), indexed))

def prefix_selected(+owner_match: Bool, +index_match: Bool,
    +actual_owner: Nat, +actual_index: Nat, +symbol: String, +previous: Local.PlannedReference,
    +reference: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    owner_true: {owner_match == True{} : Bool}, index_true: {index_match == True{} : Bool}) ->
    {Compose.replaced_prefix(Compose.ReplacedSlots{0n, rest}, Bool.and(owner_match, index_match), actual_owner, actual_index, symbol, previous, reference) ==
      Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> rest} : Compose.ReplacedSlots}:
  match owner_match index_match:
    case True{} True{}: {==}
    case False{} _:
      Empty.absurd({Compose.replaced_prefix(Compose.ReplacedSlots{0n, rest}, False{}, actual_owner, actual_index, symbol, previous, reference) ==
        Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> rest} : Compose.ReplacedSlots}, B.internal_false_ne_true(owner_true))
    case True{} False{}:
      Empty.absurd({Compose.replaced_prefix(Compose.ReplacedSlots{0n, rest}, False{}, actual_owner, actual_index, symbol, previous, reference) ==
        Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> rest} : Compose.ReplacedSlots}, B.internal_false_ne_true(index_true))

def replacement_head(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    +new_actual: Local.PlannedReference,
    +indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    +selected: {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, symbol) == 1n : Nat}) ->
    {Compose.replace_slot(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, new_actual) ==
      Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, text, new_actual} <> rest} : Compose.ReplacedSlots}:
  %Equal.sym(Compose.ReplacedSlots, Compose.replace_slot(rest, owner, start, new_actual), Compose.ReplacedSlots{0n, rest},
    Structure.replacement_below(rest, owner, start, new_actual, (start + 1n : Nat), later,
      index_tail(actual_index, start, previous, rest, later, indexed), Structure.self_below_next(start))):
    {Compose.replaced_prefix(_, Bool.and(Nat.is_eq(owner, actual_owner), Nat.is_eq(start, actual_index)), actual_owner, actual_index, text, previous, new_actual) ==
      Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, text, new_actual} <> rest} : Compose.ReplacedSlots}
  prefix_selected(Nat.is_eq(owner, actual_owner), Nat.is_eq(start, actual_index), actual_owner, actual_index, text, previous, new_actual, rest,
    B.eq_true_of_and_left(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(start, actual_index), String.eq(symbol, text)),
      Structure.selected_head_matches(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, indexed, selected)),
    B.eq_true_of_and_left(Nat.is_eq(start, actual_index), String.eq(symbol, text),
      B.eq_true_of_and_right(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(start, actual_index), String.eq(symbol, text)),
        Structure.selected_head_matches(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, indexed, selected))))

def reference_metadata(+actual_owner: Nat, +actual_index: Nat, +owner: Nat, +index: Nat,
    +symbol: String, value: Local.PlannedReference, +addresses: List<&2, F.AddressEntry>) ->
    {P.reference(Local.ReferenceSlot{actual_owner, actual_index, symbol, value}, addresses) ==
      P.reference(Local.ReferenceSlot{owner, index, symbol, value}, addresses) : Maybe<&2, F.Reference>}:
  match value:
    case Local.Included{_}: {==}
    case Local.Omitted{_, _}: {==}
    case Local.Expanded{_}: {==}

def new_head_reference(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    +new_actual: Local.PlannedReference, +new_semantic: F.Reference, +addresses: List<&2, F.AddressEntry>,
    indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    selected: {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, symbol) == 1n : Nat},
    projected: {P.reference(Local.ReferenceSlot{owner, start, symbol, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>}) ->
    {P.reference(Local.ReferenceSlot{actual_owner, actual_index, text, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>}:
  %Structure.head_symbol_exact(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, indexed, selected):
    {P.reference(Local.ReferenceSlot{actual_owner, actual_index, _, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>}
  %Equal.sym(Maybe<&2, F.Reference>, P.reference(Local.ReferenceSlot{actual_owner, actual_index, symbol, new_actual}, addresses),
    P.reference(Local.ReferenceSlot{owner, start, symbol, new_actual}, addresses), reference_metadata(actual_owner, actual_index, owner, start, symbol, new_actual, addresses)):
    {_ == Some{new_semantic} : Maybe<&2, F.Reference>}
  projected

def projected_cons(+slot: Local.ReferenceSlot, +rest: List<&2, Local.ReferenceSlot>,
    +addresses: List<&2, F.AddressEntry>, +first: F.Reference, +suffix: List<&2, F.Reference>,
    head: {P.reference(slot, addresses) == Some{first} : Maybe<&2, F.Reference>},
    tail: {P.references(rest, addresses) == Some{suffix} : Maybe<&2, List<&2, F.Reference>>}) ->
    {P.references(slot <> rest, addresses) == Some{first <> suffix} : Maybe<&2, List<&2, F.Reference>>}:
  %Equal.sym(Maybe<&2, F.Reference>, P.reference(slot, addresses), Some{first}, head):
    {P.reference_prefix(_, P.references(rest, addresses)) == Some{first <> suffix} : Maybe<&2, List<&2, F.Reference>>}
  %Equal.sym(Maybe<&2, List<&2, F.Reference>>, P.references(rest, addresses), Some{suffix}, tail):
    {P.reference_prefix(Some{first}, _) == Some{first <> suffix} : Maybe<&2, List<&2, F.Reference>>}
  {==}

def head_parts(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    +addresses: List<&2, F.AddressEntry>, +references: List<&2, F.Reference>,
    +new_actual: Local.PlannedReference, +new_semantic: F.Reference,
    +indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    +selected: {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, symbol) == 1n : Nat},
    replacement_reference: {P.reference(Local.ReferenceSlot{owner, start, symbol, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>},
    parts: Exists(F.Reference, first => Exists(List<&2, F.Reference>, suffix =>
      {P.reference(Local.ReferenceSlot{actual_owner, actual_index, text, previous}, addresses) == Some{first} : Maybe<&2, F.Reference>} &
      {P.references(rest, addresses) == Some{suffix} : Maybe<&2, List<&2, F.Reference>>} &
      {references == first <> suffix : List<&2, F.Reference>}))) ->
    result(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, 0n, references, new_actual, new_semantic, addresses):
  match parts:
    case (+first, (+suffix, (_, (tail_projected, full_projected)))):
      Tuple{Local.ReferenceSlot{actual_owner, actual_index, text, new_actual} <> rest, Tuple{new_semantic <> suffix, Tuple{
        replacement_head(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, new_actual, indexed, selected), Tuple{
        %Equal.sym(List<&2, F.Reference>, references, first <> suffix, full_projected):
          {F.replace_slot(_, 0n, new_semantic) == F.Slots{new_semantic <> suffix, 1n} : F.Slots}
        {==},
        projected_cons(Local.ReferenceSlot{actual_owner, actual_index, text, new_actual}, rest, addresses, new_semantic, suffix,
          new_head_reference(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, new_actual, new_semantic, addresses, indexed, selected, replacement_reference), tail_projected)}}}}

def head(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    +addresses: List<&2, F.AddressEntry>, +references: List<&2, F.Reference>,
    +new_actual: Local.PlannedReference, +new_semantic: F.Reference,
    +indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    +selected: {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, symbol) == 1n : Nat},
    projected: {P.references(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, addresses) == Some{references} : Maybe<&2, List<&2, F.Reference>>},
    replacement_reference: {P.reference(Local.ReferenceSlot{owner, start, symbol, new_actual}, addresses) == Some{new_semantic} : Maybe<&2, F.Reference>}) ->
    result(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, 0n, references, new_actual, new_semantic, addresses):
  head_parts(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, addresses, references, new_actual, new_semantic, indexed, selected, replacement_reference,
    Structure.references_cons_split(Local.ReferenceSlot{actual_owner, actual_index, text, previous}, rest, addresses, references, projected))

def next_position(+start: Nat, +position: Nat) ->
    {(start + 1n+position : Nat) == ((start + 1n : Nat) + position : Nat) : Nat}:
  %Equal.sym(Nat, (start + 1n : Nat), 1n+start, Structure.next_start(start)):
    {(start + 1n+position : Nat) == (_ + position : Nat) : Nat}
  N.add_succ(start, position)

def target_after_start(+start: Nat, +position: Nat) ->
    {Nat.is_eq((start + 1n+position : Nat), start) == False{} : Bool}:
  %N.add_zero(start): {Nat.is_eq((start + 1n+position : Nat), _) == False{} : Bool}
  %Remap.add_left_cancel_iff(start, 1n+position, 0n): {_ == False{} : Bool}
  {==}

def target_after_head(+actual_index: Nat, +start: Nat, +position: Nat,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>, +later: List<&2, Local.PlannedNode>,
    indexed: {Bool.and(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later))) == True{} : Bool}) ->
    {Nat.is_eq((start + 1n+position : Nat), actual_index) == False{} : Bool}:
  %Equal.sym(Nat, actual_index, start, N.eq_of_is_eq(actual_index, start,
    B.eq_true_of_and_left(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later)), indexed))):
    {Nat.is_eq((start + 1n+position : Nat), _) == False{} : Bool}
  target_after_start(start, position)

def selected_skip(+owner_match: Bool, +index_match: Bool, +symbol_match: Bool, +remaining: Nat,
    h: {index_match == False{} : Bool}) ->
    {(Bool.pick(Nat, Bool.and(owner_match, Bool.and(index_match, symbol_match)), 1n, 0n) + remaining : Nat) == remaining : Nat}:
  match owner_match index_match:
    case True{} False{}: {==}
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} True{}:
      Empty.absurd({(Bool.pick(Nat, symbol_match, 1n, 0n) + remaining : Nat) == remaining : Nat},
        B.internal_false_ne_true(Equal.sym(Bool, True{}, False{}, h)))

def selected_tail(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +position: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    selected: {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, (start + 1n+position : Nat), symbol) == 1n : Nat}) ->
    {Ready.slot_count(rest, owner, ((start + 1n : Nat) + position : Nat), symbol) == 1n : Nat}:
  %next_position(start, position): {Ready.slot_count(rest, owner, _, symbol) == 1n : Nat}
  %selected_skip(Nat.is_eq(owner, actual_owner), Nat.is_eq((start + 1n+position : Nat), actual_index), String.eq(symbol, text),
    Ready.slot_count(rest, owner, (start + 1n+position : Nat), symbol), target_after_head(actual_index, start, position, previous, rest, later, indexed)):
    {_ == 1n : Nat}
  selected

def prefix_unchanged(+owner_match: Bool, +index_match: Bool,
    +actual_owner: Nat, +actual_index: Nat, +text: String, +previous: Local.PlannedReference,
    +new_actual: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    h: {index_match == False{} : Bool}) ->
    {Compose.replaced_prefix(Compose.ReplacedSlots{1n, rest}, Bool.and(owner_match, index_match), actual_owner, actual_index, text, previous, new_actual) ==
      Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest} : Compose.ReplacedSlots}:
  match owner_match index_match:
    case True{} False{}: {==}
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} True{}:
      Empty.absurd({Compose.replaced_prefix(Compose.ReplacedSlots{1n, rest}, True{}, actual_owner, actual_index, text, previous, new_actual) ==
        Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest} : Compose.ReplacedSlots},
        B.internal_false_ne_true(Equal.sym(Bool, True{}, False{}, h)))

def successor_done(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +position: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    +addresses: List<&2, F.AddressEntry>, +references: List<&2, F.Reference>,
    +new_actual: Local.PlannedReference, +new_semantic: F.Reference,
    +first: F.Reference, +suffix: List<&2, F.Reference>,
    indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    head_projected: {P.reference(Local.ReferenceSlot{actual_owner, actual_index, text, previous}, addresses) == Some{first} : Maybe<&2, F.Reference>},
    full_projected: {references == first <> suffix : List<&2, F.Reference>},
    tail_result: result(rest, owner, ((start + 1n : Nat) + position : Nat), position, suffix, new_actual, new_semantic, addresses)) ->
    result(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, (start + 1n+position : Nat), 1n+position, references, new_actual, new_semantic, addresses):
  match tail_result:
    case (+changed, (+semantic_changed, (actual, (semantic, projected)))):
      Tuple{Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> changed, Tuple{first <> semantic_changed, Tuple{
        %Equal.sym(Nat, (start + 1n+position : Nat), ((start + 1n : Nat) + position : Nat), next_position(start, position)):
          {Compose.replaced_prefix(Compose.replace_slot(rest, owner, _, new_actual), Bool.and(Nat.is_eq(owner, actual_owner), Nat.is_eq((start + 1n+position : Nat), actual_index)), actual_owner, actual_index, text, previous, new_actual) ==
            Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> changed} : Compose.ReplacedSlots}
        %Equal.sym(Compose.ReplacedSlots, Compose.replace_slot(rest, owner, ((start + 1n : Nat) + position : Nat), new_actual), Compose.ReplacedSlots{1n, changed}, actual):
          {Compose.replaced_prefix(_, Bool.and(Nat.is_eq(owner, actual_owner), Nat.is_eq((start + 1n+position : Nat), actual_index)), actual_owner, actual_index, text, previous, new_actual) ==
            Compose.ReplacedSlots{1n, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> changed} : Compose.ReplacedSlots}
        prefix_unchanged(Nat.is_eq(owner, actual_owner), Nat.is_eq((start + 1n+position : Nat), actual_index), actual_owner, actual_index, text, previous, new_actual, changed,
          target_after_head(actual_index, start, position, previous, rest, later, indexed)), Tuple{
        %Equal.sym(List<&2, F.Reference>, references, first <> suffix, full_projected):
          {F.replace_slot(_, 1n+position, new_semantic) == F.Slots{first <> semantic_changed, 1n} : F.Slots}
        %Equal.sym(F.Slots, F.replace_slot(suffix, position, new_semantic), F.Slots{semantic_changed, 1n}, semantic):
          {F.slots_prefix(_, first) == F.Slots{first <> semantic_changed, 1n} : F.Slots}
        {==},
        projected_cons(Local.ReferenceSlot{actual_owner, actual_index, text, previous}, changed, addresses, first, semantic_changed, head_projected, projected)}}}}

def successor_parts(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +position: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    +addresses: List<&2, F.AddressEntry>, +references: List<&2, F.Reference>,
    +new_actual: Local.PlannedReference, +new_semantic: F.Reference,
    indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    parts: Exists(F.Reference, first => Exists(List<&2, F.Reference>, suffix =>
      {P.reference(Local.ReferenceSlot{actual_owner, actual_index, text, previous}, addresses) == Some{first} : Maybe<&2, F.Reference>} &
      {P.references(rest, addresses) == Some{suffix} : Maybe<&2, List<&2, F.Reference>>} &
      {references == first <> suffix : List<&2, F.Reference>})),
    ih: @+suffix: List<&2, F.Reference> ->
      {P.references(rest, addresses) == Some{suffix} : Maybe<&2, List<&2, F.Reference>>} ->
      result(rest, owner, ((start + 1n : Nat) + position : Nat), position, suffix, new_actual, new_semantic, addresses)) ->
    result(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, (start + 1n+position : Nat), 1n+position, references, new_actual, new_semantic, addresses):
  match parts:
    case (+first, (+suffix, (head_projected, (tail_projected, full_projected)))):
      successor_done(actual_owner, actual_index, text, previous, rest, owner, start, position, symbol, later, addresses, references, new_actual, new_semantic,
        first, suffix, indexed, head_projected, full_projected, ih(suffix, tail_projected))

def main() -> Unit:
  Unit{}
