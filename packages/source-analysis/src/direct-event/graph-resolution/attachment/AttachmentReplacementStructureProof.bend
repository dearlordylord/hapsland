import Base
import ../Composition.bend as Compose
import ../traversal/core.bend as Local
import ./ActualAttachmentPhaseProjection.bend as Ready
import ./RetainedForestProjection.bend as P
import ../ForestSpecification.bend as F
import ../traversal/INTERPRETER_NAT_FACTS.bend as N
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ../traversal/INTERPRETER_STRING_FACTS.bend as Text

# Internal structural cut approved by Astra; no production representation.
def slots(result: Compose.ReplacedSlots) -> List<&2, Local.ReferenceSlot>:
  match result:
    case Compose.ReplacedSlots{_, items}: items

def count(result: Compose.ReplacedSlots) -> Nat:
  match result:
    case Compose.ReplacedSlots{changed, _}: changed

def length_prefix(+result: Compose.ReplacedSlots, +same: Bool, +owner: Nat, +index: Nat,
    +symbol: String, +previous: Local.PlannedReference, +reference: Local.PlannedReference) ->
    {List.length(&2, Local.ReferenceSlot, slots(Compose.replaced_prefix(result, same, owner, index, symbol, previous, reference))) ==
      1n+List.length(&2, Local.ReferenceSlot, slots(result)) : Nat}:
  match result:
    case Compose.ReplacedSlots{_, _}: {==}

def length(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat,
    +reference: Local.PlannedReference) ->
    {List.length(&2, Local.ReferenceSlot, slots(Compose.replace_slot(items, owner, index, reference))) ==
      List.length(&2, Local.ReferenceSlot, items) : Nat}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +symbol, +previous} <> +tail:
      %length(tail, owner, index, reference):
        {List.length(&2, Local.ReferenceSlot, slots(Compose.replace_slot(Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail, owner, index, reference))) == 1n+_ : Nat}
      length_prefix(Compose.replace_slot(tail, owner, index, reference),
        Bool.and(Nat.is_eq(owner, actual_owner), Nat.is_eq(index, actual_index)),
        actual_owner, actual_index, symbol, previous, reference)

def selected_prefix(+result: Compose.ReplacedSlots, +same: Bool, +owner: Nat, +index: Nat,
    +symbol: String, +previous: Local.PlannedReference, +reference: Local.PlannedReference,
    +query_owner: Nat, +query_index: Nat, +query_symbol: String) ->
    {Ready.slot_count(slots(Compose.replaced_prefix(result, same, owner, index, symbol, previous, reference)), query_owner, query_index, query_symbol) ==
      (Bool.pick(Nat, Bool.and(Nat.is_eq(query_owner, owner), Bool.and(Nat.is_eq(query_index, index), String.eq(query_symbol, symbol))), 1n, 0n) +
        Ready.slot_count(slots(result), query_owner, query_index, query_symbol) : Nat) : Nat}:
  match result:
    case Compose.ReplacedSlots{_, _}: {==}

def selected(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat,
    +reference: Local.PlannedReference, +query_owner: Nat, +query_index: Nat, +query_symbol: String) ->
    {Ready.slot_count(slots(Compose.replace_slot(items, owner, index, reference)), query_owner, query_index, query_symbol) ==
      Ready.slot_count(items, query_owner, query_index, query_symbol) : Nat}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +symbol, +previous} <> +tail:
      %selected(tail, owner, index, reference, query_owner, query_index, query_symbol):
        {Ready.slot_count(slots(Compose.replace_slot(Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail, owner, index, reference)), query_owner, query_index, query_symbol) ==
          (Bool.pick(Nat, Bool.and(Nat.is_eq(query_owner, actual_owner), Bool.and(Nat.is_eq(query_index, actual_index), String.eq(query_symbol, symbol))), 1n, 0n) + _ : Nat) : Nat}
      selected_prefix(Compose.replace_slot(tail, owner, index, reference),
        Bool.and(Nat.is_eq(owner, actual_owner), Nat.is_eq(index, actual_index)), actual_owner, actual_index, symbol, previous, reference,
        query_owner, query_index, query_symbol)

# Verbatim mathlib equality symmetry; avoids importing unrelated algorithms.
# vendor/bendlib/packages/bend-mathlib/nat.bend, same source owner as remap proof.
law is_eq_comm:
  for a: Nat
  for b: Nat
  {Nat.is_eq(a, b) == Nat.is_eq(b, a) : Bool}

def is_eq_comm(a, b):
  match a b:
    case 0n 0n: {==}
    case 0n 1n+q: {==}
    case 1n+p 0n: {==}
    case 1n++p 1n++q:
      %is_eq_comm(p, q): {Nat.is_eq(p, q) == _ : Bool}
      {==}

def filtered(result: Compose.ReplacedSlots, +owner: Nat) -> Compose.ReplacedSlots:
  match result:
    case Compose.ReplacedSlots{changed, items}:
      Compose.ReplacedSlots{changed, P.owner_slots(items, owner)}

def filter_step(+flag: Bool, +result: Compose.ReplacedSlots, +owner: Nat, +index: Nat,
    +reference: Local.PlannedReference, +actual_owner: Nat, +actual_index: Nat,
    +symbol: String, +previous: Local.PlannedReference,
    +matching: {Nat.is_eq(owner, actual_owner) == flag : Bool},
    +tail: List<&2, Local.ReferenceSlot>,
    rest: {filtered(result, owner) == Compose.replace_slot(tail, owner, index, reference) : Compose.ReplacedSlots}) ->
    {filtered(Compose.replaced_prefix(result, Bool.and(flag, Nat.is_eq(index, actual_index)), actual_owner, actual_index, symbol, previous, reference), owner) ==
      Compose.replace_slot(Bool.pick(List<&2, Local.ReferenceSlot>, flag,
        Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail, tail), owner, index, reference) : Compose.ReplacedSlots}:
  match flag result:
    case True{} Compose.ReplacedSlots{+changed, +items}:
      %Equal.sym(Bool, Nat.is_eq(owner, actual_owner), True{}, matching):
        {filtered(Compose.replaced_prefix(Compose.ReplacedSlots{changed, items}, Nat.is_eq(index, actual_index), actual_owner, actual_index, symbol, previous, reference), owner) ==
          Compose.replaced_prefix(Compose.replace_slot(tail, owner, index, reference), Bool.and(_, Nat.is_eq(index, actual_index)), actual_owner, actual_index, symbol, previous, reference) : Compose.ReplacedSlots}
      %rest:
        {filtered(Compose.replaced_prefix(Compose.ReplacedSlots{changed, items}, Nat.is_eq(index, actual_index), actual_owner, actual_index, symbol, previous, reference), owner) ==
          Compose.replaced_prefix(_, Nat.is_eq(index, actual_index), actual_owner, actual_index, symbol, previous, reference) : Compose.ReplacedSlots}
      %is_eq_comm(owner, actual_owner):
        {Compose.ReplacedSlots{(changed + Bool.pick(Nat, Nat.is_eq(index, actual_index), 1n, 0n) : Nat),
          Bool.pick(List<&2, Local.ReferenceSlot>, _,
            Local.ReferenceSlot{actual_owner, actual_index, symbol, Bool.pick(Local.PlannedReference, Nat.is_eq(index, actual_index), reference, previous)} <> P.owner_slots(items, owner), P.owner_slots(items, owner))} ==
          Compose.replaced_prefix(filtered(Compose.ReplacedSlots{changed, items}, owner), Nat.is_eq(index, actual_index), actual_owner, actual_index, symbol, previous, reference) : Compose.ReplacedSlots}
      %Equal.sym(Bool, Nat.is_eq(owner, actual_owner), True{}, matching):
        {Compose.ReplacedSlots{(changed + Bool.pick(Nat, Nat.is_eq(index, actual_index), 1n, 0n) : Nat),
          Bool.pick(List<&2, Local.ReferenceSlot>, _,
            Local.ReferenceSlot{actual_owner, actual_index, symbol, Bool.pick(Local.PlannedReference, Nat.is_eq(index, actual_index), reference, previous)} <> P.owner_slots(items, owner), P.owner_slots(items, owner))} ==
          Compose.replaced_prefix(filtered(Compose.ReplacedSlots{changed, items}, owner), Nat.is_eq(index, actual_index), actual_owner, actual_index, symbol, previous, reference) : Compose.ReplacedSlots}
      {==}
    case False{} Compose.ReplacedSlots{+changed, +items}:
      %rest:
        {filtered(Compose.replaced_prefix(Compose.ReplacedSlots{changed, items}, False{}, actual_owner, actual_index, symbol, previous, reference), owner) == _ : Compose.ReplacedSlots}
      %is_eq_comm(owner, actual_owner):
        {Compose.ReplacedSlots{(changed + 0n : Nat),
          Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> P.owner_slots(items, owner), P.owner_slots(items, owner))} ==
          filtered(Compose.ReplacedSlots{changed, items}, owner) : Compose.ReplacedSlots}
      %Equal.sym(Bool, Nat.is_eq(owner, actual_owner), False{}, matching):
        {Compose.ReplacedSlots{(changed + 0n : Nat),
          Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> P.owner_slots(items, owner), P.owner_slots(items, owner))} ==
          filtered(Compose.ReplacedSlots{changed, items}, owner) : Compose.ReplacedSlots}
      %N.add_zero(changed):
        {Compose.ReplacedSlots{(changed + 0n : Nat), P.owner_slots(items, owner)} == Compose.ReplacedSlots{_, P.owner_slots(items, owner)} : Compose.ReplacedSlots}
      {==}

def filter_selected_owner(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat,
    +reference: Local.PlannedReference) ->
    {filtered(Compose.replace_slot(items, owner, index, reference), owner) ==
      Compose.replace_slot(P.owner_slots(items, owner), owner, index, reference) : Compose.ReplacedSlots}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +symbol, +previous} <> +tail:
      %is_eq_comm(owner, actual_owner):
        {filtered(Compose.replace_slot(Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail, owner, index, reference), owner) ==
          Compose.replace_slot(Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> P.owner_slots(tail, owner), P.owner_slots(tail, owner)), owner, index, reference) : Compose.ReplacedSlots}
      filter_step(Nat.is_eq(owner, actual_owner), Compose.replace_slot(tail, owner, index, reference), owner, index, reference,
        actual_owner, actual_index, symbol, previous, {==}, P.owner_slots(tail, owner), filter_selected_owner(tail, owner, index, reference))

# Internal head-case support for the approved indexed owner transport.
def not_true_false(flag: Bool, h: {Bool.not(flag) == True{} : Bool}) -> {flag == False{} : Bool}:
  match flag:
    case False{}: {==}
    case True{}: Empty.absurd({True{} == False{} : Bool}, B.internal_false_ne_true(h))

def unequal_below(+target: Nat, +start: Nat, h: {Nat.is_lt(target, start) == True{} : Bool}) ->
    {Nat.is_eq(target, start) == False{} : Bool}:
  not_true_false(Nat.is_eq(target, start), B.eq_true_of_and_right(Nat.is_le(target, start), Bool.not(Nat.is_eq(target, start)),
    %N.lt_iff_le_and_ne(target, start): {_ == True{} : Bool}
    h))

def next_start(+start: Nat) -> {(start + 1n : Nat) == 1n+start : Nat}:
  %N.add_zero(start): {(start + 1n : Nat) == 1n+_ : Nat}
  N.add_succ(start, 0n)

def below_next(+target: Nat, +start: Nat, h: {Nat.is_lt(target, start) == True{} : Bool}) ->
    {Nat.is_lt(target, (start + 1n : Nat)) == True{} : Bool}:
  N.lt_trans(target, start, (start + 1n : Nat), h,
    %Equal.sym(Nat, (start + 1n : Nat), 1n+start, next_start(start)):
      {Nat.is_lt(start, _) == True{} : Bool}
    N.lt_succ_self(start))

def zero_prefix(+owner_match: Bool, +index_match: Bool,
    +actual_owner: Nat, +actual_index: Nat, +symbol: String, +previous: Local.PlannedReference,
    +reference: Local.PlannedReference, +tail: List<&2, Local.ReferenceSlot>,
    h: {index_match == False{} : Bool}) ->
    {Compose.replaced_prefix(Compose.ReplacedSlots{0n, tail}, Bool.and(owner_match, index_match), actual_owner, actual_index, symbol, previous, reference) ==
      Compose.ReplacedSlots{0n, Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail} : Compose.ReplacedSlots}:
  match owner_match index_match:
    case True{} False{}: {==}
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} True{}:
      Empty.absurd({Compose.replaced_prefix(Compose.ReplacedSlots{0n, tail}, True{}, actual_owner, actual_index, symbol, previous, reference) ==
        Compose.ReplacedSlots{0n, Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail} : Compose.ReplacedSlots},
        B.internal_false_ne_true(Equal.sym(Bool, True{}, False{}, h)))

def replacement_below(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +target: Nat,
    +reference: Local.PlannedReference, +start: Nat, +later: List<&2, Local.PlannedNode>,
    +indexed: {P.indexed(items, start, later) == True{} : Bool},
    +below: {Nat.is_lt(target, start) == True{} : Bool}) ->
    {Compose.replace_slot(items, owner, target, reference) == Compose.ReplacedSlots{0n, items} : Compose.ReplacedSlots}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +symbol, +previous} <> +tail:
      %Equal.sym(Compose.ReplacedSlots, Compose.replace_slot(tail, owner, target, reference), Compose.ReplacedSlots{0n, tail},
        replacement_below(tail, owner, target, reference, (start + 1n : Nat), later,
          B.eq_true_of_and_right(P.forward_reference(previous, later), P.indexed(tail, (start + 1n : Nat), later),
            B.eq_true_of_and_right(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(tail, (start + 1n : Nat), later)), indexed)),
          below_next(target, start, below))):
        {Compose.replaced_prefix(_, Bool.and(Nat.is_eq(owner, actual_owner), Nat.is_eq(target, actual_index)), actual_owner, actual_index, symbol, previous, reference) ==
          Compose.ReplacedSlots{0n, Local.ReferenceSlot{actual_owner, actual_index, symbol, previous} <> tail} : Compose.ReplacedSlots}
      zero_prefix(Nat.is_eq(owner, actual_owner), Nat.is_eq(target, actual_index), actual_owner, actual_index, symbol, previous, reference, tail,
        unequal_below(target, actual_index,
          %Equal.sym(Nat, actual_index, start, N.eq_of_is_eq(actual_index, start,
            B.eq_true_of_and_left(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(tail, (start + 1n : Nat), later)), indexed))):
            {Nat.is_lt(target, _) == True{} : Bool}
          below))

# Projection of the first owner is proof-only; no runtime predicate/format.
def first_owned(items: List<&2, Local.ReferenceSlot>, owner: Nat) -> Bool:
  match items:
    case []: True{}
    case Local.ReferenceSlot{actual, _, _, _} <> _: Nat.is_eq(actual, owner)

def first_owned_pick(+flag: Bool, +actual_owner: Nat, +actual_index: Nat,
    +symbol: String, +reference: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>, +owner: Nat,
    matching: {Nat.is_eq(actual_owner, owner) == flag : Bool},
    suffix: {first_owned(rest, owner) == True{} : Bool}) ->
    {first_owned(Bool.pick(List<&2, Local.ReferenceSlot>, flag,
      Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> rest, rest), owner) == True{} : Bool}:
  match flag:
    case True{}: matching
    case False{}: suffix

def first_owned_filter(+items: List<&2, Local.ReferenceSlot>, +owner: Nat) ->
    {first_owned(P.owner_slots(items, owner), owner) == True{} : Bool}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +symbol, +reference} <> +tail:
      first_owned_pick(Nat.is_eq(actual_owner, owner), actual_owner, actual_index, symbol, reference,
        P.owner_slots(tail, owner), owner, {==}, first_owned_filter(tail, owner))

def owned_head(+actual_owner: Nat, +actual_index: Nat, +symbol: String,
    +reference: Local.PlannedReference, +tail: List<&2, Local.ReferenceSlot>, +owner: Nat,
    owned: {P.owner_slots(Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> tail, owner) ==
      Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> tail : List<&2, Local.ReferenceSlot>}) ->
    {Nat.is_eq(actual_owner, owner) == True{} : Bool}:
  %owned: {first_owned(_, owner) == True{} : Bool}
  first_owned_filter(Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> tail, owner)

def tail(items: List<&2, Local.ReferenceSlot>) -> List<&2, Local.ReferenceSlot>:
  match items:
    case []: []
    case _ <> rest: rest

def owned_tail(+actual_owner: Nat, +actual_index: Nat, +symbol: String,
    +reference: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>, +owner: Nat,
    +owned: {P.owner_slots(Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> rest, owner) ==
      Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> rest : List<&2, Local.ReferenceSlot>}) ->
    {P.owner_slots(rest, owner) == rest : List<&2, Local.ReferenceSlot>}:
  %owned_head(actual_owner, actual_index, symbol, reference, rest, owner, owned):
    {tail(Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> P.owner_slots(rest, owner), P.owner_slots(rest, owner))) == rest : List<&2, Local.ReferenceSlot>}
  %Equal.sym(List<&2, Local.ReferenceSlot>,
    P.owner_slots(Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> rest, owner),
    Local.ReferenceSlot{actual_owner, actual_index, symbol, reference} <> rest, owned):
    {tail(_) == rest : List<&2, Local.ReferenceSlot>}
  {==}

def zero_selected_prefix(+owner_match: Bool, +index_match: Bool, +symbol_match: Bool,
    +remaining: Nat, h: {index_match == False{} : Bool}, zero: {remaining == 0n : Nat}) ->
    {(Bool.pick(Nat, Bool.and(owner_match, Bool.and(index_match, symbol_match)), 1n, 0n) + remaining : Nat) == 0n : Nat}:
  match owner_match index_match:
    case True{} False{}: zero
    case False{} False{}: zero
    case False{} True{}: zero
    case True{} True{}:
      Empty.absurd({(Bool.pick(Nat, symbol_match, 1n, 0n) + remaining : Nat) == 0n : Nat},
        B.internal_false_ne_true(Equal.sym(Bool, True{}, False{}, h)))

def slot_count_below(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +target: Nat,
    +symbol: String, +start: Nat, +later: List<&2, Local.PlannedNode>,
    +indexed: {P.indexed(items, start, later) == True{} : Bool},
    +below: {Nat.is_lt(target, start) == True{} : Bool}) ->
    {Ready.slot_count(items, owner, target, symbol) == 0n : Nat}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +text, +previous} <> +rest:
      zero_selected_prefix(Nat.is_eq(owner, actual_owner), Nat.is_eq(target, actual_index), String.eq(symbol, text), Ready.slot_count(rest, owner, target, symbol),
        unequal_below(target, actual_index,
          %Equal.sym(Nat, actual_index, start, N.eq_of_is_eq(actual_index, start,
            B.eq_true_of_and_left(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later)), indexed))):
            {Nat.is_lt(target, _) == True{} : Bool}
          below),
        slot_count_below(rest, owner, target, symbol, (start + 1n : Nat), later,
          B.eq_true_of_and_right(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later),
            B.eq_true_of_and_right(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later)), indexed)),
          below_next(target, start, below)))

def zero_ne_one(e: {0n == 1n : Nat}) -> Empty:
  %e: Bool.pick(Type, Nat.is_eq(0n, _), Unit, Empty)
  Unit{}

def pick_one_true(flag: Bool, h: {Bool.pick(Nat, flag, 1n, 0n) == 1n : Nat}) -> {flag == True{} : Bool}:
  match flag:
    case True{}: {==}
    case False{}: Empty.absurd({False{} == True{} : Bool}, zero_ne_one(h))

def self_below_next(+start: Nat) -> {Nat.is_lt(start, (start + 1n : Nat)) == True{} : Bool}:
  %Equal.sym(Nat, (start + 1n : Nat), 1n+start, next_start(start)):
    {Nat.is_lt(start, _) == True{} : Bool}
  N.lt_succ_self(start)

def selected_head_matches(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    selected: {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, symbol) == 1n : Nat}) ->
    {Bool.and(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(start, actual_index), String.eq(symbol, text))) == True{} : Bool}:
  pick_one_true(Bool.and(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(start, actual_index), String.eq(symbol, text))),
    %N.add_zero(Bool.pick(Nat, Bool.and(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(start, actual_index), String.eq(symbol, text))), 1n, 0n)):
      {_ == 1n : Nat}
    %slot_count_below(rest, owner, start, symbol, (start + 1n : Nat), later,
      B.eq_true_of_and_right(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later),
        B.eq_true_of_and_right(Nat.is_eq(actual_index, start), Bool.and(P.forward_reference(previous, later), P.indexed(rest, (start + 1n : Nat), later)), indexed)), self_below_next(start)):
      {(Bool.pick(Nat, Bool.and(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(start, actual_index), String.eq(symbol, text))), 1n, 0n) + _ : Nat) == 1n : Nat}
    selected)

def head_symbol_matches(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    selected: {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, symbol) == 1n : Nat}) ->
    {String.eq(symbol, text) == True{} : Bool}:
  B.eq_true_of_and_right(Nat.is_eq(start, actual_index), String.eq(symbol, text),
    B.eq_true_of_and_right(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(start, actual_index), String.eq(symbol, text)),
      selected_head_matches(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, indexed, selected)))

def head_symbol_exact(+actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +start: Nat, +symbol: String, +later: List<&2, Local.PlannedNode>,
    indexed: {P.indexed(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, start, later) == True{} : Bool},
    selected: {Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, start, symbol) == 1n : Nat}) ->
    {symbol == text : String}:
  Text.eq_of_eq_true(symbol, text, head_symbol_matches(actual_owner, actual_index, text, previous, rest, owner, start, symbol, later, indexed, selected))

def references_present(value: Maybe<&2, List<&2, F.Reference>>) -> Bool:
  match value:
    case None{}: False{}
    case Some{_}: True{}

def references_contents(value: Maybe<&2, List<&2, F.Reference>>) -> List<&2, F.Reference>:
  match value:
    case None{}: []
    case Some{items}: items

def references_none_impossible(+items: List<&2, F.Reference>, e: {None{} == Some{items} : Maybe<&2, List<&2, F.Reference>>}) -> Empty:
  %e: Bool.pick(Type, references_present(_), Empty, Unit)
  Unit{}

def references_cons_parts(+head: Maybe<&2, F.Reference>, +suffix: Maybe<&2, List<&2, F.Reference>>,
    +items: List<&2, F.Reference>, projected: {P.reference_prefix(head, suffix) == Some{items} : Maybe<&2, List<&2, F.Reference>>}) ->
    Exists(F.Reference, first => Exists(List<&2, F.Reference>, rest =>
      {head == Some{first} : Maybe<&2, F.Reference>} &
      {suffix == Some{rest} : Maybe<&2, List<&2, F.Reference>>} &
      {items == first <> rest : List<&2, F.Reference>})):
  match head suffix:
    case Some{+first} Some{+rest}:
      Tuple{first, Tuple{rest, Tuple{{==}, Tuple{{==},
        %projected: {references_contents(_) == first <> rest : List<&2, F.Reference>}
        {==}}}}}
    case None{} _:
      Empty.absurd(Exists(F.Reference, first => Exists(List<&2, F.Reference>, rest =>
        {None{} == Some{first} : Maybe<&2, F.Reference>} &
        {suffix == Some{rest} : Maybe<&2, List<&2, F.Reference>>} &
        {items == first <> rest : List<&2, F.Reference>})), references_none_impossible(items, projected))
    case Some{first} None{}:
      Empty.absurd(Exists(F.Reference, value => Exists(List<&2, F.Reference>, rest =>
        {Some{first} == Some{value} : Maybe<&2, F.Reference>} &
        {None{} == Some{rest} : Maybe<&2, List<&2, F.Reference>>} &
        {items == value <> rest : List<&2, F.Reference>})), references_none_impossible(items, projected))

def references_cons_split(+slot: Local.ReferenceSlot, +rest: List<&2, Local.ReferenceSlot>,
    +addresses: List<&2, F.AddressEntry>, +items: List<&2, F.Reference>,
    projected: {P.references(slot <> rest, addresses) == Some{items} : Maybe<&2, List<&2, F.Reference>>}) ->
    Exists(F.Reference, first => Exists(List<&2, F.Reference>, suffix =>
      {P.reference(slot, addresses) == Some{first} : Maybe<&2, F.Reference>} &
      {P.references(rest, addresses) == Some{suffix} : Maybe<&2, List<&2, F.Reference>>} &
      {items == first <> suffix : List<&2, F.Reference>})):
  references_cons_parts(P.reference(slot, addresses), P.references(rest, addresses), items, projected)

# Verbatim existing mathlib Nat reflexivity, not a new domain law.
law is_eq_refl:
  for n: Nat
  {Nat.is_eq(n, n) == True{} : Bool}

def is_eq_refl(n):
  match n:
    case 0n: {==}
    case 1n+p: is_eq_refl(p)

def owners_equal(+actual: Nat, +target: Nat, +query: Nat,
    target_match: {Nat.is_eq(target, actual) == True{} : Bool},
    query_match: {Nat.is_eq(actual, query) == True{} : Bool}) ->
    {Nat.is_eq(query, target) == True{} : Bool}:
  %N.eq_of_is_eq(actual, query, query_match): {Nat.is_eq(_, target) == True{} : Bool}
  %Equal.sym(Nat, target, actual, N.eq_of_is_eq(target, actual, target_match)):
    {Nat.is_eq(actual, _) == True{} : Bool}
  is_eq_refl(actual)

def disjoint_owner_flags(+actual: Nat, +target: Nat, +query: Nat, +target_flag: Bool, +query_flag: Bool,
    target_match: {Nat.is_eq(target, actual) == target_flag : Bool},
    query_match: {Nat.is_eq(actual, query) == query_flag : Bool},
    disjoint: {Nat.is_eq(query, target) == False{} : Bool}) ->
    {Bool.and(target_flag, query_flag) == False{} : Bool}:
  match target_flag query_flag:
    case False{} _: {==}
    case True{} False{}: {==}
    case True{} True{}:
      Empty.absurd({True{} == False{} : Bool}, B.internal_false_ne_true(
        %disjoint: {_ == True{} : Bool}
        owners_equal(actual, target, query, target_match, query_match)))

def other_prefix(+target_flag: Bool, +query_flag: Bool, +index_flag: Bool,
    +result: Compose.ReplacedSlots, +actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +reference: Local.PlannedReference, +query: Nat,
    query_match: {Nat.is_eq(actual_owner, query) == query_flag : Bool},
    no_overlap: {Bool.and(target_flag, query_flag) == False{} : Bool}) ->
    {P.owner_slots(slots(Compose.replaced_prefix(result, Bool.and(target_flag, index_flag), actual_owner, actual_index, text, previous, reference)), query) ==
      Bool.pick(List<&2, Local.ReferenceSlot>, query_flag,
        Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> P.owner_slots(slots(result), query), P.owner_slots(slots(result), query)) : List<&2, Local.ReferenceSlot>}:
  match target_flag query_flag result:
    case False{} +flag Compose.ReplacedSlots{_, +items}:
      %Equal.sym(Bool, Nat.is_eq(actual_owner, query), flag, query_match):
        {Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> P.owner_slots(items, query), P.owner_slots(items, query)) ==
          Bool.pick(List<&2, Local.ReferenceSlot>, flag, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> P.owner_slots(items, query), P.owner_slots(items, query)) : List<&2, Local.ReferenceSlot>}
      {==}
    case True{} False{} Compose.ReplacedSlots{_, +items}:
      %Equal.sym(Bool, Nat.is_eq(actual_owner, query), False{}, query_match):
        {Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{actual_owner, actual_index, text, Bool.pick(Local.PlannedReference, index_flag, reference, previous)} <> P.owner_slots(items, query), P.owner_slots(items, query)) == P.owner_slots(items, query) : List<&2, Local.ReferenceSlot>}
      {==}
    case True{} True{} Compose.ReplacedSlots{+changed, +items}:
      Empty.absurd({P.owner_slots(slots(Compose.replaced_prefix(Compose.ReplacedSlots{changed, items}, index_flag, actual_owner, actual_index, text, previous, reference)), query) ==
        Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> P.owner_slots(items, query) : List<&2, Local.ReferenceSlot>},
        B.internal_false_ne_true(Equal.sym(Bool, True{}, False{}, no_overlap)))

def filter_other_owner(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat,
    +reference: Local.PlannedReference, +query: Nat,
    +disjoint: {Nat.is_eq(query, owner) == False{} : Bool}) ->
    {P.owner_slots(slots(Compose.replace_slot(items, owner, index, reference)), query) == P.owner_slots(items, query) : List<&2, Local.ReferenceSlot>}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +text, +previous} <> +rest:
      %filter_other_owner(rest, owner, index, reference, query, disjoint):
        {P.owner_slots(slots(Compose.replace_slot(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, index, reference)), query) ==
          P.owner_slot(Local.ReferenceSlot{actual_owner, actual_index, text, previous}, query, _) : List<&2, Local.ReferenceSlot>}
      other_prefix(Nat.is_eq(owner, actual_owner), Nat.is_eq(actual_owner, query), Nat.is_eq(index, actual_index),
        Compose.replace_slot(rest, owner, index, reference), actual_owner, actual_index, text, previous, reference, query, {==},
        disjoint_owner_flags(actual_owner, owner, query, Nat.is_eq(owner, actual_owner), Nat.is_eq(actual_owner, query), {==}, {==}, disjoint))

def count_filtered(+result: Compose.ReplacedSlots, +owner: Nat) ->
    {count(result) == count(filtered(result, owner)) : Nat}:
  match result:
    case Compose.ReplacedSlots{_, _}: {==}

def replacement_one(+result: Compose.ReplacedSlots, h: {count(result) == 1n : Nat}) ->
    {Compose.replacement(result) == Some{slots(result)} : Maybe<&2, List<&2, Local.ReferenceSlot>>}:
  match result:
    case Compose.ReplacedSlots{+changed, +items}:
      %Equal.sym(Nat, changed, 1n, h):
        {Bool.pick(Maybe<&2, List<&2, Local.ReferenceSlot>>, Nat.is_eq(_, 1n), Some{items}, None{}) == Some{items} : Maybe<&2, List<&2, Local.ReferenceSlot>>}
      {==}

def selected_filter_pick(+flag: Bool, +actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +filtered_rest: List<&2, Local.ReferenceSlot>, +rest: List<&2, Local.ReferenceSlot>,
    +owner: Nat, +index: Nat, +symbol: String,
    reverse_match: {Nat.is_eq(owner, actual_owner) == flag : Bool},
    ih: {Ready.slot_count(filtered_rest, owner, index, symbol) == Ready.slot_count(rest, owner, index, symbol) : Nat}) ->
    {Ready.slot_count(Bool.pick(List<&2, Local.ReferenceSlot>, flag, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> filtered_rest, filtered_rest), owner, index, symbol) ==
      Ready.slot_count(Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, owner, index, symbol) : Nat}:
  match flag:
    case True{}:
      %ih:
        {(Bool.pick(Nat, Bool.and(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(index, actual_index), String.eq(symbol, text))), 1n, 0n) + Ready.slot_count(filtered_rest, owner, index, symbol) : Nat) ==
          (Bool.pick(Nat, Bool.and(Nat.is_eq(owner, actual_owner), Bool.and(Nat.is_eq(index, actual_index), String.eq(symbol, text))), 1n, 0n) + _ : Nat) : Nat}
      {==}
    case False{}:
      %Equal.sym(Bool, Nat.is_eq(owner, actual_owner), False{}, reverse_match):
        {Ready.slot_count(filtered_rest, owner, index, symbol) ==
          (Bool.pick(Nat, Bool.and(_, Bool.and(Nat.is_eq(index, actual_index), String.eq(symbol, text))), 1n, 0n) + Ready.slot_count(rest, owner, index, symbol) : Nat) : Nat}
      ih

def selected_filter(+items: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat, +symbol: String) ->
    {Ready.slot_count(P.owner_slots(items, owner), owner, index, symbol) == Ready.slot_count(items, owner, index, symbol) : Nat}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +text, +previous} <> +rest:
      selected_filter_pick(Nat.is_eq(actual_owner, owner), actual_owner, actual_index, text, previous, P.owner_slots(rest, owner), rest, owner, index, symbol,
        is_eq_comm(owner, actual_owner), selected_filter(rest, owner, index, symbol))

def filter_idempotent_pick(+flag: Bool, +actual_owner: Nat, +actual_index: Nat, +text: String,
    +previous: Local.PlannedReference, +rest: List<&2, Local.ReferenceSlot>, +owner: Nat,
    matching: {Nat.is_eq(actual_owner, owner) == flag : Bool},
    ih: {P.owner_slots(rest, owner) == rest : List<&2, Local.ReferenceSlot>}) ->
    {P.owner_slots(Bool.pick(List<&2, Local.ReferenceSlot>, flag, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, rest), owner) ==
      Bool.pick(List<&2, Local.ReferenceSlot>, flag, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest, rest) : List<&2, Local.ReferenceSlot>}:
  match flag:
    case False{}: ih
    case True{}:
      %Equal.sym(Bool, Nat.is_eq(actual_owner, owner), True{}, matching):
        {Bool.pick(List<&2, Local.ReferenceSlot>, _, Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> P.owner_slots(rest, owner), P.owner_slots(rest, owner)) ==
          Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> rest : List<&2, Local.ReferenceSlot>}
      %ih:
        {Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> P.owner_slots(rest, owner) == Local.ReferenceSlot{actual_owner, actual_index, text, previous} <> _ : List<&2, Local.ReferenceSlot>}
      {==}

def filter_idempotent(+items: List<&2, Local.ReferenceSlot>, +owner: Nat) ->
    {P.owner_slots(P.owner_slots(items, owner), owner) == P.owner_slots(items, owner) : List<&2, Local.ReferenceSlot>}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+actual_owner, +actual_index, +text, +previous} <> +rest:
      filter_idempotent_pick(Nat.is_eq(actual_owner, owner), actual_owner, actual_index, text, previous, P.owner_slots(rest, owner), owner, {==}, filter_idempotent(rest, owner))

def slots_filtered(+result: Compose.ReplacedSlots, +owner: Nat) ->
    {P.owner_slots(slots(result), owner) == slots(filtered(result, owner)) : List<&2, Local.ReferenceSlot>}:
  match result:
    case Compose.ReplacedSlots{_, _}: {==}

def main() -> Unit:
  Unit{}
