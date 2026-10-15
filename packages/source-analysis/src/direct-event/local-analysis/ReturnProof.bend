import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K
import ./ReturnLaws.bend as Laws
import ../graph-resolution/traversal/GRAPH_LIST_FACTS.bend as L
import ../graph-resolution/RuntimeNatProof.bend as NatEquality

# Completing one child reference either propagates exhaustion or appends
# exactly one edge between the completed prefix and remaining siblings.
def prefix_snoc(+prefix: List<&2, M.ReferencePlan>, +reference: M.ReferencePlan,
  +result: S.ReferencesResult) -> {
  K.completed_prefix(prefix, S.prepend_reference(result, reference))
  == K.completed_prefix(List.append(&2, M.ReferencePlan, prefix, [reference]), result) : S.ReferencesResult
}:
  match result:
    case S.ReferencesDepthExhausted{}: {==}
    case S.ReferencesResult{+state, +references, +subtotal}:
      Equal.cong(List<&2, M.ReferencePlan>, S.ReferencesResult,
        items => S.ReferencesResult{state, items, subtotal},
        List.append(&2, M.ReferencePlan, prefix, reference <> references),
        List.append(&2, M.ReferencePlan, List.append(&2, M.ReferencePlan, prefix, [reference]), references),
        Equal.sym(List<&2, M.ReferencePlan>,
          List.append(&2, M.ReferencePlan, List.append(&2, M.ReferencePlan, prefix, [reference]), references),
          List.append(&2, M.ReferencePlan, prefix, reference <> references),
          L.append_assoc(&2, M.ReferencePlan, prefix, [reference], references)))

def completed_child(+prefix: List<&2, M.ReferencePlan>, +state: S.State, +subtotal: S.BytesExpr) -> {
  K.completed_prefix(prefix, S.ReferencesResult{state, [], subtotal})
  == S.ReferencesResult{state, prefix, subtotal} : S.ReferencesResult
}:
  Equal.cong(List<&2, M.ReferencePlan>, S.ReferencesResult,
    items => S.ReferencesResult{state, items, subtotal},
    List.append(&2, M.ReferencePlan, prefix, []), prefix, L.append_nil(&2, M.ReferencePlan, prefix))

def transport(+left: S.ReferencesResult, +right: S.ReferencesResult,
  equal: {left == right : S.ReferencesResult}, continuation: S.ReferencesResult -> Type,
  witness: continuation(left)) -> continuation(right):
  %equal : continuation(_)
  witness

def returned_accumulator(purpose: C.Purpose, +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>, +child_prefix: List<&2, M.ReferencePlan>,
  +parent_reversed: List<&2, M.ReferencePlan>, +parent_prefix: List<&2, M.ReferencePlan>, +symbol: String,
  child: K.accumulator_relation(purpose, child_reversed, child_prefix),
  parent: K.accumulator_relation(purpose, parent_reversed, parent_prefix)) ->
  K.accumulator_relation(purpose,
    C.keep_reference(purpose, K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol), parent_reversed),
    List.append(&2, M.ReferencePlan, parent_prefix, [K.returned_reference(child_slot, child_prefix, symbol)])):
  match purpose:
    case C.Trees{}:
      Equal.trans(List<&2, M.ReferencePlan>,
        List.reverse(&2, M.ReferencePlan,
          K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol) <> parent_reversed),
        List.append(&2, M.ReferencePlan, List.reverse(&2, M.ReferencePlan, parent_reversed),
          [K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol)]),
        List.append(&2, M.ReferencePlan, parent_prefix, [K.returned_reference(child_slot, child_prefix, symbol)]),
        L.reverse_go_spec(&2, M.ReferencePlan, parent_reversed,
          [K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol)]),
        Equal.trans(List<&2, M.ReferencePlan>,
          List.append(&2, M.ReferencePlan, List.reverse(&2, M.ReferencePlan, parent_reversed),
            [K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol)]),
          List.append(&2, M.ReferencePlan, parent_prefix,
            [K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol)]),
          List.append(&2, M.ReferencePlan, parent_prefix, [K.returned_reference(child_slot, child_prefix, symbol)]),
          Equal.cong(List<&2, M.ReferencePlan>, List<&2, M.ReferencePlan>,
            items => List.append(&2, M.ReferencePlan, items,
              [K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol)]),
            List.reverse(&2, M.ReferencePlan, parent_reversed), parent_prefix, parent),
          Equal.cong(List<&2, M.ReferencePlan>, List<&2, M.ReferencePlan>,
            items => List.append(&2, M.ReferencePlan, parent_prefix, [K.returned_reference(child_slot, items, symbol)]),
            List.reverse(&2, M.ReferencePlan, child_reversed), child_prefix, child)))
    case C.Outcomes{}: parent
    case C.Preflight{}: parent

def returned_semantics(+child_slot: Nat, +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr, +state: S.State, +catalog: M.Catalog,
  +parent_pending: List<&2, M.Reference>, +parent_prefix: List<&2, M.ReferencePlan>,
  +charged_subtotal: S.BytesExpr, +parent_depth: Nat, +symbol: String,
  continuation: S.ReferencesResult -> Type,
  witness: K.child_continuation(K.completed_prefix(child_prefix, S.ReferencesResult{state, [], child_subtotal}),
    child_slot, parent_depth, parent_pending, parent_prefix, charged_subtotal, symbol, catalog, continuation)) ->
  continuation(K.completed_prefix(
    List.append(&2, M.ReferencePlan, parent_prefix, [K.returned_reference(child_slot, child_prefix, symbol)]),
    S.as_references(S.interpret(parent_depth,
      S.ReferencesRequest{parent_pending, state, S.Add{charged_subtotal, child_subtotal}}, catalog)))):
  %prefix_snoc(parent_prefix, K.returned_reference(child_slot, child_prefix, symbol),
    S.as_references(S.interpret(parent_depth,
      S.ReferencesRequest{parent_pending, state, S.Add{charged_subtotal, child_subtotal}}, catalog))) : continuation(_)
  transport(K.completed_prefix(child_prefix, S.ReferencesResult{state, [], child_subtotal}),
    S.ReferencesResult{state, child_prefix, child_subtotal}, completed_child(child_prefix, state, child_subtotal),
    result => K.child_continuation(result, child_slot, parent_depth, parent_pending, parent_prefix,
      charged_subtotal, symbol, catalog, continuation), witness)

def Laws.child_return_frame(purpose, child_slot, child_reversed, child_prefix, child_subtotal, child_depth,
  state, catalog, parent_slot, parent_pending, parent_reversed, parent_site, parent_prefix, charged_subtotal,
  parent_depth, symbol, continuation, parent_accumulator, child):
  match child:
    case (child_accumulator, child_semantics):
      ({==}, (returned_accumulator(purpose, child_slot, child_reversed, child_prefix,
        parent_reversed, parent_prefix, symbol, child_accumulator, parent_accumulator),
      returned_semantics(child_slot, child_prefix, child_subtotal, state, catalog, parent_pending, parent_prefix,
        charged_subtotal, parent_depth, symbol, continuation, child_semantics)))

def Laws.child_return_step(catalog, purpose, pending, outcomes, request, root, name, expanded, referenced,
  failure, remaining, child_slot, child_reversed, symbol, parent_slot, parent_pending, parent_reversed, parent_site, ancestors):
  match purpose:
    case C.Trees{}: {==}
    case C.Outcomes{}: {==}
    case C.Preflight{}: {==}

def Laws.child_return_postfix(parent, child, tail):
  Equal.trans(List<&2, M.Op>,
    List.append(&2, M.Op, S.postfix(parent), List.append(&2, M.Op, S.postfix(child), M.Add{} <> tail)),
    List.append(&2, M.Op, S.postfix(parent), List.append(&2, M.Op, List.append(&2, M.Op, S.postfix(child), [M.Add{}]), tail)),
    List.append(&2, M.Op, List.append(&2, M.Op, S.postfix(parent),
      List.append(&2, M.Op, S.postfix(child), [M.Add{}])), tail),
    Equal.cong(List<&2, M.Op>, List<&2, M.Op>, operations => List.append(&2, M.Op, S.postfix(parent), operations),
      List.append(&2, M.Op, S.postfix(child), M.Add{} <> tail),
      List.append(&2, M.Op, List.append(&2, M.Op, S.postfix(child), [M.Add{}]), tail),
      Equal.sym(List<&2, M.Op>, List.append(&2, M.Op, List.append(&2, M.Op, S.postfix(child), [M.Add{}]), tail),
        List.append(&2, M.Op, S.postfix(child), M.Add{} <> tail), L.append_assoc(&2, M.Op, S.postfix(child), [M.Add{}], tail))),
    Equal.sym(List<&2, M.Op>, List.append(&2, M.Op, List.append(&2, M.Op, S.postfix(parent),
        List.append(&2, M.Op, S.postfix(child), [M.Add{}])), tail),
      List.append(&2, M.Op, S.postfix(parent), List.append(&2, M.Op, List.append(&2, M.Op, S.postfix(child), [M.Add{}]), tail)),
      L.append_assoc(&2, M.Op, S.postfix(parent), List.append(&2, M.Op, S.postfix(child), [M.Add{}]), tail)))

def Laws.child_return_ack(cursor, request):
  %Equal.sym(Bool, Nat.is_eq(request, request), True{}, NatEquality.is_eq_refl(request)) : {
    C.acknowledge(_, [], C.CursorNext{cursor}, request)
    == C.Continue{C.cursor_count(cursor, Nat.add(request, 1n))} : C.Step}
  {==}

def main() -> Unit:
  Unit{}
