import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K
import ./JointReference.bend as R
import ./Joint.bend as J
import ./JointFreshProof.bend as Fresh
import ./Potential.bend as P
import ./WeightedInventory.bend as W
import ./ReturnProof.bend as Return
import ../graph-resolution/traversal/GRAPH_LIST_FACTS.bend as L
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N

# Helpers for the single aggregate reference law. No completion claim is
# made until JointReferenceLaws.reference_cursor is filled below.
def reference_success(result: S.ReferenceResult) -> Bool:
  match result:
    case S.ReferenceDepthExhausted{}: False{}
    case S.ReferenceResult{_, _, _}: True{}

def exhausted_impossible(+state: S.State, +plan: M.ReferencePlan, +subtotal: S.BytesExpr,
  equal: {S.ReferenceDepthExhausted{} == S.ReferenceResult{state, plan, subtotal} : S.ReferenceResult}) -> Empty:
  N.internal_false_ne_true(Equal.cong(S.ReferenceResult, Bool, result => reference_success(result),
    S.ReferenceDepthExhausted{}, S.ReferenceResult{state, plan, subtotal}, equal))

# A successful result with an exhausted child callback cannot be fresh.
# Therefore the original Spec equation has the same result for ANY child
# continuation, including the exact predecessor-depth interpret callback.
def seen_independent(+seen: Bool, +state: S.State, +symbol: String,
  +target: M.Declaration, +subtotal: S.BytesExpr,
  visit: M.Declaration -> S.State -> S.NodeResult,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {S.named_seen(seen, state, symbol, target, subtotal, _ => _ => S.DepthExhausted{})
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  S.named_seen(seen, state, symbol, target, subtotal, visit)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult
}:
  match seen:
    case True{}: equal
    case False{}: Empty.absurd({S.named_seen(False{}, state, symbol, target, subtotal, visit)
      == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult},
      exhausted_impossible(next_state, plan, next_subtotal, equal))

def target_independent(+target: Maybe<&2, M.Declaration>, +state: S.State,
  +symbol: String, +subtotal: S.BytesExpr, visit: M.Declaration -> S.State -> S.NodeResult,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {S.named_target(target, state, symbol, subtotal, _ => _ => S.DepthExhausted{})
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  S.named_target(target, state, symbol, subtotal, visit)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult
}:
  match target:
    case None{}: equal
    case Some{+target}: seen_independent(S.seen(state, S.declaration_identity(target)), state, symbol,
      target, subtotal, visit, next_state, plan, next_subtotal, equal)

def limit_independent(+limited: Bool, +target: Maybe<&2, M.Declaration>, +state: S.State,
  +symbol: String, +subtotal: S.BytesExpr, visit: M.Declaration -> S.State -> S.NodeResult,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {S.named_limit(limited, target, state, symbol, subtotal, _ => _ => S.DepthExhausted{})
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  S.named_limit(limited, target, state, symbol, subtotal, visit)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult
}:
  match limited:
    case True{}: equal
    case False{}: target_independent(target, state, symbol, subtotal, visit, next_state, plan, next_subtotal, equal)

def reference_independent(+reference: M.Reference, +state: S.State,
  +catalog: M.Catalog, +subtotal: S.BytesExpr, visit: M.Declaration -> S.State -> S.NodeResult,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  S.visit_reference(reference, state, catalog, subtotal, visit)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult
}:
  match reference:
    case M.Unsupported{_}: equal
    case M.Named{+symbol, +target_id}:
      limit_independent(S.over_limit(S.record_named(state, symbol, target_id)), S.lookup(catalog, symbol, target_id),
        S.record_named(state, symbol, target_id), symbol,
        S.edge_total(subtotal, symbol, S.lookup(catalog, symbol, target_id)), visit,
        next_state, plan, next_subtotal, equal)

def accumulated(purpose: C.Purpose, +reversed: List<&2, M.ReferencePlan>,
  +prefix: List<&2, M.ReferencePlan>, +plan: M.ReferencePlan,
  valid: K.accumulator_relation(purpose, reversed, prefix)) ->
  K.accumulator_relation(purpose, C.keep_reference(purpose, plan, reversed),
    List.append(&2, M.ReferencePlan, prefix, [plan])):
  match purpose:
    case C.Trees{}:
      Equal.trans(List<&2, M.ReferencePlan>, List.reverse(&2, M.ReferencePlan, plan <> reversed),
        List.append(&2, M.ReferencePlan, List.reverse(&2, M.ReferencePlan, reversed), [plan]),
        List.append(&2, M.ReferencePlan, prefix, [plan]), L.reverse_go_spec(&2, M.ReferencePlan, reversed, [plan]),
        Equal.cong(List<&2, M.ReferencePlan>, List<&2, M.ReferencePlan>,
          items => List.append(&2, M.ReferencePlan, items, [plan]),
          List.reverse(&2, M.ReferencePlan, reversed), prefix, valid))
    case C.Outcomes{}: valid
    case C.Preflight{}: valid

def semantic_equation(+depth: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +state: S.State, +catalog: M.Catalog, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  K.completed_prefix(prefix, S.as_references(S.interpret(1n+depth,
    S.ReferencesRequest{reference <> pending, state, subtotal}, catalog)))
  == K.completed_prefix(List.append(&2, M.ReferencePlan, prefix, [plan]),
    S.as_references(S.interpret(depth, S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)))
  : S.ReferencesResult
}:
  Equal.trans(S.ReferencesResult,
    K.completed_prefix(prefix, S.as_references(S.interpret(1n+depth,
      S.ReferencesRequest{reference <> pending, state, subtotal}, catalog))),
    K.completed_prefix(prefix, S.prepend_reference(S.as_references(S.interpret(depth,
      S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)), plan)),
    K.completed_prefix(List.append(&2, M.ReferencePlan, prefix, [plan]),
      S.as_references(S.interpret(depth, S.ReferencesRequest{pending, next_state, next_subtotal}, catalog))),
    Equal.cong(S.ReferenceResult, S.ReferencesResult,
      result => K.completed_prefix(prefix, S.after_reference(result,
        next => bytes => S.as_references(S.interpret(depth, S.ReferencesRequest{pending, next, bytes}, catalog)))),
      S.visit_reference(reference, state, catalog, subtotal,
        declaration => next => S.as_node(S.interpret(depth, S.NodeRequest{declaration, next}, catalog))),
      S.ReferenceResult{next_state, plan, next_subtotal},
      reference_independent(reference, state, catalog, subtotal,
        declaration => next => S.as_node(S.interpret(depth, S.NodeRequest{declaration, next}, catalog)),
        next_state, plan, next_subtotal, equal)),
    Return.prefix_snoc(prefix, plan, S.as_references(S.interpret(depth,
      S.ReferencesRequest{pending, next_state, next_subtotal}, catalog))))

def reference_frame(+purpose: C.Purpose, +depth: Nat, +slot: Nat,
  +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +state: S.State, +catalog: M.Catalog, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  continuation: S.ReferencesResult -> Type,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult},
  witness: K.frame_relation(C.Frame{slot, reference <> pending, reversed, site}, purpose,
    1n+depth, prefix, subtotal, state, catalog, continuation)) ->
  K.frame_relation(C.Frame{slot, pending, C.keep_reference(purpose, plan, reversed), site}, purpose,
    depth, List.append(&2, M.ReferencePlan, prefix, [plan]), next_subtotal, next_state, catalog, continuation):
  match witness:
    case (accumulator, semantic):
      (accumulated(purpose, reversed, prefix, plan, accumulator),
        Return.transport(K.completed_prefix(prefix, S.as_references(S.interpret(1n+depth,
          S.ReferencesRequest{reference <> pending, state, subtotal}, catalog))),
          K.completed_prefix(List.append(&2, M.ReferencePlan, prefix, [plan]),
            S.as_references(S.interpret(depth, S.ReferencesRequest{pending, next_state, next_subtotal}, catalog))),
          semantic_equation(depth, reference, pending, state, catalog, prefix, subtotal,
            next_state, plan, next_subtotal, equal), continuation, semantic))

def reference_bounds(+purpose: C.Purpose, +depth: Nat, +slot: Nat,
  +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>, +others: List<&2, J.Ghost>, +catalog: M.Catalog,
  +expanded: List<&2, String>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  valid: J.bounds(C.Frame{slot, reference <> pending, reversed, site} <> parents,
    J.Ghost{1n+depth, prefix, subtotal} <> others, catalog, purpose, expanded)) ->
  J.bounds(C.Frame{slot, pending, C.keep_reference(purpose, plan, reversed), site} <> parents,
    J.Ghost{depth, List.append(&2, M.ReferencePlan, prefix, [plan]), next_subtotal} <> others,
    catalog, purpose, expanded):
  match valid:
    case (accumulator, (bound, ancestors)):
      (accumulated(purpose, reversed, prefix, plan, accumulator),
        (N.le_of_succ_le_succ(W.specification_required(pending, catalog, expanded), depth, bound), ancestors))

def reference_semantic(+root: M.Declaration, +purpose: C.Purpose, +depth: Nat, +slot: Nat,
  +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>, +others: List<&2, J.Ghost>,
  +state: S.State, +catalog: M.Catalog, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult},
  witness: J.semantic(C.Frame{slot, reference <> pending, reversed, site} <> parents,
    J.Ghost{1n+depth, prefix, subtotal} <> others, root, catalog, purpose, state)) ->
  J.semantic(C.Frame{slot, pending, C.keep_reference(purpose, plan, reversed), site} <> parents,
    J.Ghost{depth, List.append(&2, M.ReferencePlan, prefix, [plan]), next_subtotal} <> others,
    root, catalog, purpose, next_state):
  %Fresh.enclosing_own_fields(slot, site, reference <> pending, pending,
    reversed, C.keep_reference(purpose, plan, reversed), parents, others,
    1n+depth, depth, prefix, List.append(&2, M.ReferencePlan, prefix, [plan]), subtotal, next_subtotal,
    root, catalog, K.completed_prefix(List.append(&2, M.ReferencePlan, prefix, [plan]),
      S.as_references(S.interpret(depth, S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)))) :
    K.accumulator_relation(purpose, C.keep_reference(purpose, plan, reversed),
      List.append(&2, M.ReferencePlan, prefix, [plan])) & _
  reference_frame(purpose, depth, slot, reference, pending, reversed, site, state, catalog, prefix,
    subtotal, next_state, plan, next_subtotal,
    J.enclosing(C.Frame{slot, reference <> pending, reversed, site} <> parents,
      J.Ghost{1n+depth, prefix, subtotal} <> others, root, catalog), equal, witness)

# Dropping one pending reference spends exactly one semantic tick. Neither
# the catalog inventory nor any parked ancestor depth changes.
def reference_core_bound(+global: C.Global, +slot: Nat, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>,
  +rest: Nat, +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  +next_referenced: List<&2, String>, +next_failure: Maybe<&2, M.Failure>, +plan: M.ReferencePlan,
  valid: {P.cursor_valid(C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
    C.Frame{parent_slot, reference <> pending, reversed, site} <> parents}) == True{} : Bool}) ->
  {P.cursor_valid(C.Cursor{global, slot, name, expanded, next_referenced, next_failure, rest,
    C.Frame{parent_slot, pending, C.keep_reference(C.global_purpose(global), plan, reversed), site} <> parents})
    == True{} : Bool}:
  N.le_of_succ_le_succ(Nat.add(Nat.add(List.length(&2, M.Reference, pending), P.pending_references(parents)),
    P.catalog_unvisited(C.global_catalog(global), expanded)), rest, valid)

def main() -> Unit:
  Unit{}
