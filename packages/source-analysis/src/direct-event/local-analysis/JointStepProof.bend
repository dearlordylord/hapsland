import Base
import ./Model.bend as M
import ./Specification.bend as S
import ./Core.bend as C
import ./Joint.bend as J
import ./Potential.bend as P
import ./JointLaws.bend as JointLaws
import ./JointProof.bend as JointProof
import ./JointStep.bend as Step
import ./JointReference.bend as R
import ./JointReferenceProof.bend as ReferenceProof
import ./JointFreshProof.bend as Fresh
import ./Root.bend as Root
import ../graph-resolution/RuntimeNatProof.bend as NatEquality
import ../graph-resolution/traversal/GRAPH_REVERSE_FACTS.bend as Reverse
import ../graph-resolution/traversal/GRAPH_LIST_FACTS.bend as L
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N

# Root-local trace begins before this root's measurements. The outer
# preflight Push0 belongs to the later whole-catalog theorem.
def initial_queue(+root: M.Declaration, +invocation: C.Global) ->
  Step.valid(root, invocation, [],
    C.cursor_ops(J.initial_cursor(root, invocation),
      C.node_operations(C.global_purpose(invocation), S.declaration_slot(root))),
    [J.initial_ghost(root, C.global_catalog(invocation))]):
  match root invocation:
    case M.Declaration{+slot, +identity, +name, +references}
      C.Global{M.Catalog{+declarations, +supporting}, C.Preflight{}, +pending, +outcomes, +request}:
      (Equal.sym(Nat, Nat.add(request, 0n), request, N.add_zero(request)),
        (JointLaws.initial_cursor(M.Declaration{slot, identity, name, references},
          C.Global{M.Catalog{declarations, supporting}, C.Preflight{}, pending, outcomes, request}), {==}))
    case M.Declaration{+slot, +identity, +name, +references}
      C.Global{M.Catalog{+declarations, +supporting}, C.Trees{}, +pending, +outcomes, +request}:
      %Equal.sym(Nat, Nat.add(request, 0n), request, N.add_zero(request)) :
        J.cursor(M.Declaration{slot, identity, name, references},
          C.Global{M.Catalog{declarations, supporting}, C.Trees{}, pending, outcomes, request}, _,
          J.initial_cursor(M.Declaration{slot, identity, name, references},
            C.Global{M.Catalog{declarations, supporting}, C.Trees{}, pending, outcomes, request}),
          [J.initial_ghost(M.Declaration{slot, identity, name, references}, M.Catalog{declarations, supporting})])
        & {[] == [] : List<&2, M.Op>}
      (JointLaws.initial_cursor(M.Declaration{slot, identity, name, references},
        C.Global{M.Catalog{declarations, supporting}, C.Trees{}, pending, outcomes, request}), {==})
    case M.Declaration{+slot, +identity, +name, +references}
      C.Global{M.Catalog{+declarations, +supporting}, C.Outcomes{}, +pending, +outcomes, +request}:
      %Equal.sym(Nat, Nat.add(request, 0n), request, N.add_zero(request)) :
        J.cursor(M.Declaration{slot, identity, name, references},
          C.Global{M.Catalog{declarations, supporting}, C.Outcomes{}, pending, outcomes, request}, _,
          J.initial_cursor(M.Declaration{slot, identity, name, references},
            C.Global{M.Catalog{declarations, supporting}, C.Outcomes{}, pending, outcomes, request}),
          [J.initial_ghost(M.Declaration{slot, identity, name, references}, M.Catalog{declarations, supporting})])
        & {[] == [] : List<&2, M.Op>}
      (JointLaws.initial_cursor(M.Declaration{slot, identity, name, references},
        C.Global{M.Catalog{declarations, supporting}, C.Outcomes{}, pending, outcomes, request}), {==})

# This helper has exactly the approved initial_root statement. The laws
# module stays unfilled until the combined step proof is complete.
def initial_root(+root: M.Declaration, +invocation: C.Global) ->
  Step.valid(root, invocation, [],
    C.start_root(M.traversal_inventory(root, C.global_catalog(invocation)), invocation, root),
    [J.initial_ghost(root, C.global_catalog(invocation))]):
  %Equal.sym(C.Step,
    C.start_root(M.traversal_inventory(root, C.global_catalog(invocation)), invocation, root),
    C.cursor_ops(J.initial_cursor(root, invocation), C.node_operations(C.global_purpose(invocation), S.declaration_slot(root))),
    JointLaws.initial_step(root, invocation)) :
    Step.valid(root, invocation, [], _, [J.initial_ghost(root, C.global_catalog(invocation))])
  initial_queue(root, invocation)

def global_recount(+global: C.Global, +invocation: C.Global, +old_request: Nat, +next_request: Nat,
  equal: {global == C.global_count(invocation, old_request) : C.Global}) -> {
  C.global_count(global, next_request) == C.global_count(invocation, next_request) : C.Global
}:
  match invocation:
    case C.Global{+catalog, +purpose, +pending, +outcomes, _}:
      Equal.cong(C.Global, C.Global, value => C.global_count(value, next_request), global,
        C.Global{catalog, purpose, pending, outcomes, old_request}, equal)

def recount_fields(+root: M.Declaration, +invocation: C.Global, +old_request: Nat, +next_request: Nat,
  +catalog: M.Catalog, +purpose: C.Purpose, +pending: List<&2, M.Declaration>,
  +outcomes: List<&2, M.Outcome>, +stored_request: Nat, +slot: Nat, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>,
  +remaining: Nat, +frames: List<&2, C.Frame>, +ghosts: List<&2, J.Ghost>,
  valid: J.cursor(root, invocation, old_request,
    C.Cursor{C.Global{catalog, purpose, pending, outcomes, stored_request}, slot, name, expanded, referenced, failure, remaining, frames}, ghosts)) ->
  J.cursor(root, invocation, next_request,
    C.Cursor{C.Global{catalog, purpose, pending, outcomes, next_request}, slot, name, expanded, referenced, failure, remaining, frames}, ghosts):
  match valid:
    case (global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic)))))):
      (global_recount(C.Global{catalog, purpose, pending, outcomes, stored_request}, invocation,
        old_request, next_request, global_equal),
        (slot_equal, (name_equal, (shape, (potential, (bounds, semantic))))))

def recount_cursor(+root: M.Declaration, +invocation: C.Global, +old_request: Nat, +next_request: Nat,
  +cursor: C.Cursor, +ghosts: List<&2, J.Ghost>, valid: J.cursor(root, invocation, old_request, cursor, ghosts)) ->
  J.cursor(root, invocation, next_request, C.cursor_count(cursor, next_request), ghosts):
  match cursor:
    case C.Cursor{C.Global{catalog, purpose, pending, outcomes, stored_request}, slot, name, expanded, referenced, failure, remaining, frames}:
      recount_fields(root, invocation, old_request, next_request, catalog, purpose, pending, outcomes, stored_request,
        slot, name, expanded, referenced, failure, remaining, frames, ghosts, valid)

# Appending the current command to the delivered trace removes it from the
# planned queue exactly once; its order relative to all measurements is fixed.
def queued_trace(+reversed: List<&2, M.Op>, +operation: M.Op, +remaining: List<&2, M.Op>) -> {
  List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operation <> remaining)
    == List.append(&2, M.Op, List.reverse(&2, M.Op, operation <> reversed), remaining) : List<&2, M.Op>
}:
  Equal.trans(List<&2, M.Op>,
    List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operation <> remaining),
    List.append(&2, M.Op, List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation]), remaining),
    List.append(&2, M.Op, List.reverse(&2, M.Op, operation <> reversed), remaining),
    Equal.sym(List<&2, M.Op>,
      List.append(&2, M.Op, List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation]), remaining),
      List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operation <> remaining),
      L.append_assoc(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation], remaining)),
    Equal.cong(List<&2, M.Op>, List<&2, M.Op>, prefix => List.append(&2, M.Op, prefix, remaining),
      List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation]),
      List.reverse(&2, M.Op, operation <> reversed),
      Equal.sym(List<&2, M.Op>, List.reverse(&2, M.Op, operation <> reversed),
        List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation]),
        L.reverse_go_spec(&2, M.Op, reversed, [operation]))))

def ack_request(+initial: Nat, +count: Nat, +queued: Nat,
  equal: {queued == Nat.add(initial, count) : Nat}) -> {
  Nat.add(queued, 1n) == Nat.add(initial, 1n+count) : Nat
}:
  Equal.trans(Nat, Nat.add(queued, 1n), 1n+queued, Nat.add(initial, 1n+count), N.add_comm(queued, 1n),
    Equal.trans(Nat, 1n+queued, 1n+Nat.add(initial, count), Nat.add(initial, 1n+count),
      Equal.cong(Nat, Nat, value => 1n+value, queued, Nat.add(initial, count), equal),
      Equal.sym(Nat, Nat.add(initial, 1n+count), 1n+Nat.add(initial, count), N.add_succ(initial, count))))

def reverse_length_go(+values: List<&2, M.Op>, +accumulator: List<&2, M.Op>) -> {
  List.length(&2, M.Op, List.reverse.go(&2, M.Op, values, accumulator))
    == Nat.add(List.length(&2, M.Op, values), List.length(&2, M.Op, accumulator)) : Nat
}:
  match values:
    case []: {==}
    case +head <> +tail:
      Equal.trans(Nat, List.length(&2, M.Op, List.reverse.go(&2, M.Op, tail, head <> accumulator)),
        Nat.add(List.length(&2, M.Op, tail), 1n+List.length(&2, M.Op, accumulator)),
        1n+Nat.add(List.length(&2, M.Op, tail), List.length(&2, M.Op, accumulator)),
        reverse_length_go(tail, head <> accumulator), N.add_succ(List.length(&2, M.Op, tail), List.length(&2, M.Op, accumulator)))

def reverse_length(+values: List<&2, M.Op>) -> {
  List.length(&2, M.Op, List.reverse(&2, M.Op, values)) == List.length(&2, M.Op, values) : Nat
}:
  Equal.trans(Nat, List.length(&2, M.Op, List.reverse(&2, M.Op, values)),
    Nat.add(List.length(&2, M.Op, values), 0n), List.length(&2, M.Op, values),
    reverse_length_go(values, []), N.add_zero(List.length(&2, M.Op, values)))

def ready_cursor(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +cursor: C.Cursor, +ghosts: List<&2, J.Ghost>, +queued: Nat,
  request_equal: {queued == Step.request(invocation, reversed) : Nat},
  valid: Step.deferred(C.CursorNext{cursor}, root, invocation, ghosts, List.reverse(&2, M.Op, reversed))) ->
  Step.valid(root, invocation, reversed, C.ready(C.CursorNext{cursor}, queued), ghosts):
  match valid:
    case (semantic, trace):
      (%request_equal : J.cursor(root, invocation, _, C.cursor_count(cursor, queued), ghosts)
        recount_cursor(root, invocation, C.global_request(Step.cursor_global(cursor)), queued, cursor, ghosts, semantic), trace)

def ready_root(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +global: C.Global, +queued: Nat,
  request_equal: {queued == Step.request(invocation, reversed) : Nat},
  valid: Step.deferred(C.RootNext{global}, root, invocation, [], List.reverse(&2, M.Op, reversed))) ->
  Step.valid(root, invocation, reversed, C.ready(C.RootNext{global}, queued), []):
  %Equal.sym(Nat, queued, Step.request(invocation, reversed), request_equal) :
    Root.correspondence(Root.RootDone{C.global_count(global, _), reversed}, Step.expectation(root, invocation))
  %reverse_length(reversed) : Root.correspondence(
    Root.RootDone{C.global_count(global, Nat.add(C.global_request(invocation), _)), reversed}, Step.expectation(root, invocation))
  %Reverse.reverse_reverse(&2, M.Op, reversed) : Root.correspondence(
    Root.RootDone{C.global_count(global, Nat.add(C.global_request(invocation),
      List.length(&2, M.Op, List.reverse(&2, M.Op, reversed)))), _}, Step.expectation(root, invocation))
  valid

def ready_deferred(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +next: C.Deferred, +ghosts: List<&2, J.Ghost>, +queued: Nat,
  request_equal: {queued == Step.request(invocation, reversed) : Nat},
  valid: Step.deferred(next, root, invocation, ghosts,
    List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), []))) ->
  Step.valid(root, invocation, reversed, C.ready(next, queued), ghosts):
  match next ghosts:
    case C.CursorNext{+cursor} +ghosts:
      ready_cursor(root, invocation, reversed, cursor, ghosts, queued, request_equal,
        (%L.append_nil(&2, M.Op, List.reverse(&2, M.Op, reversed)) : Step.deferred(
          C.CursorNext{cursor}, root, invocation, ghosts, _) valid))
    case C.RootNext{+global} Nil{}:
      ready_root(root, invocation, reversed, global, queued, request_equal,
        (%L.append_nil(&2, M.Op, List.reverse(&2, M.Op, reversed)) : Step.deferred(
          C.RootNext{global}, root, invocation, [], _) valid))
    case C.RootNext{_} _ <> _: Empty.absurd(Empty, valid)

def schedule_valid(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +operations: List<&2, M.Op>, +next: C.Deferred, +ghosts: List<&2, J.Ghost>, +queued: Nat,
  request_equal: {queued == Step.request(invocation, reversed) : Nat},
  valid: Step.deferred(next, root, invocation, ghosts,
    List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operations))) ->
  Step.valid(root, invocation, reversed, C.schedule(operations, next, queued), ghosts):
  match operations:
    case []: ready_deferred(root, invocation, reversed, next, ghosts, queued, request_equal, valid)
    case _ <> _: (request_equal, valid)

def ack_step(+operation: M.Op, +queued: Nat, +remaining: List<&2, M.Op>, +next: C.Deferred) -> {
  Step.advance(C.Engine{operation, queued, remaining, next})
    == C.schedule(remaining, next, Nat.add(queued, 1n)) : C.Step
}:
  %Equal.sym(Bool, Nat.is_eq(queued, queued), True{}, NatEquality.is_eq_refl(queued)) : {
    C.acknowledge(_, remaining, next, queued) == C.schedule(remaining, next, Nat.add(queued, 1n)) : C.Step}
  {==}

# All Engine shapes, including the final Ack into Continue or NextRoot.
# This is one branch of the approved aggregate step_preserves theorem.
def engine_step(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +operation: M.Op, +queued: Nat, +remaining: List<&2, M.Op>, +next: C.Deferred, +ghosts: List<&2, J.Ghost>,
  valid: Step.valid(root, invocation, reversed, C.Engine{operation, queued, remaining, next}, ghosts)) ->
  Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation,
    Step.record(C.Engine{operation, queued, remaining, next}, reversed),
    Step.advance(C.Engine{operation, queued, remaining, next}), after)):
  match valid:
    case (request_equal, deferred):
      (ghosts,
        (%Equal.sym(C.Step, Step.advance(C.Engine{operation, queued, remaining, next}),
          C.schedule(remaining, next, Nat.add(queued, 1n)), ack_step(operation, queued, remaining, next)) :
          Step.valid(root, invocation, operation <> reversed, _, ghosts)
        schedule_valid(root, invocation, operation <> reversed, remaining, next, ghosts, Nat.add(queued, 1n),
          ack_request(C.global_request(invocation), List.length(&2, M.Op, reversed), queued, request_equal),
          (%queued_trace(reversed, operation, remaining) : Step.deferred(next, root, invocation, ghosts, _) deferred))))

# Exact arithmetic recipe for one edge, before any child measurements.
def edge_postfix(+subtotal: S.BytesExpr, +symbol: String, +target: Maybe<&2, M.Declaration>) -> {
  List.append(&2, M.Op, S.postfix(subtotal), C.edge_operations(C.Preflight{}, symbol, target))
    == S.postfix(S.edge_total(subtotal, symbol, target)) : List<&2, M.Op>
}:
  match target:
    case None{}: {==}
    case Some{M.Declaration{_, _, _, _}}: {==}

def reference_bytes(reference: M.Reference, +catalog: M.Catalog, subtotal: S.BytesExpr) -> S.BytesExpr:
  match reference:
    case M.Unsupported{symbol}: S.edge_total(subtotal, symbol, None{})
    case M.Named{+symbol, target_id}: S.edge_total(subtotal, symbol, S.lookup(catalog, symbol, target_id))

def reference_postfix(+reference: M.Reference, +catalog: M.Catalog, +subtotal: S.BytesExpr) -> {
  List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{}))
    == S.postfix(reference_bytes(reference, catalog, subtotal)) : List<&2, M.Op>
}:
  match reference:
    case M.Unsupported{symbol}: edge_postfix(subtotal, symbol, None{})
    case M.Named{+symbol, +target_id}:
      %Fresh.lookup_exact(catalog, symbol, target_id) : {
        List.append(&2, M.Op, S.postfix(subtotal), R.operations(M.Named{symbol, target_id}, catalog, C.Preflight{}))
          == S.postfix(S.edge_total(subtotal, symbol, _)) : List<&2, M.Op>}
      edge_postfix(subtotal, symbol, C.lookup(catalog, symbol, target_id))

def subtotal_claim(result: S.ReferenceResult, expected: S.BytesExpr) -> Type:
  match result:
    case S.ReferenceDepthExhausted{}: Unit
    case S.ReferenceResult{_, _, subtotal}: {subtotal == expected : S.BytesExpr}

def seen_subtotal(+already: Bool, +state: S.State, +symbol: String,
  +target: M.Declaration, +subtotal: S.BytesExpr) ->
  subtotal_claim(S.named_seen(already, state, symbol, target, subtotal, _ => _ => S.DepthExhausted{}), subtotal):
  match already:
    case True{}: {==}
    case False{}: Unit{}

def target_subtotal(+target: Maybe<&2, M.Declaration>, +state: S.State,
  +symbol: String, +subtotal: S.BytesExpr) ->
  subtotal_claim(S.named_target(target, state, symbol, subtotal, _ => _ => S.DepthExhausted{}), subtotal):
  match target:
    case None{}: {==}
    case Some{+target}: seen_subtotal(S.seen(state, S.declaration_identity(target)), state, symbol, target, subtotal)

def limit_subtotal(+limited: Bool, +target: Maybe<&2, M.Declaration>, +state: S.State,
  +symbol: String, +subtotal: S.BytesExpr) ->
  subtotal_claim(S.named_limit(limited, target, state, symbol, subtotal, _ => _ => S.DepthExhausted{}), subtotal):
  match limited:
    case True{}: {==}
    case False{}: target_subtotal(target, state, symbol, subtotal)

def reference_subtotal(+reference: M.Reference, +state: S.State, +catalog: M.Catalog, +subtotal: S.BytesExpr) ->
  subtotal_claim(R.result(reference, state, catalog, subtotal), reference_bytes(reference, catalog, subtotal)):
  match reference:
    case M.Unsupported{_}: {==}
    case M.Named{+symbol, +target_id}:
      limit_subtotal(S.over_limit(S.record_named(state, symbol, target_id)), S.lookup(catalog, symbol, target_id),
        S.record_named(state, symbol, target_id), symbol, S.edge_total(subtotal, symbol, S.lookup(catalog, symbol, target_id)))

def successful_subtotal(+reference: M.Reference, +state: S.State, +catalog: M.Catalog, +subtotal: S.BytesExpr,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  next_subtotal == reference_bytes(reference, catalog, subtotal) : S.BytesExpr
}:
  %equal : subtotal_claim(_, reference_bytes(reference, catalog, subtotal))
  reference_subtotal(reference, state, catalog, subtotal)

def successful_postfix(+reference: M.Reference, +state: S.State, +catalog: M.Catalog, +subtotal: S.BytesExpr,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{}))
    == S.postfix(next_subtotal) : List<&2, M.Op>
}:
  %Equal.sym(S.BytesExpr, next_subtotal, reference_bytes(reference, catalog, subtotal),
    successful_subtotal(reference, state, catalog, subtotal, next_state, plan, next_subtotal, equal)) : {
    List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{}))
      == S.postfix(_) : List<&2, M.Op>}
  reference_postfix(reference, catalog, subtotal)

def reference_trace(+purpose: C.Purpose, +depth: Nat, +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>, +reference: M.Reference, +catalog: M.Catalog,
  +state: S.State, +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  List.append(&2, M.Op, Step.cursor_postfix(purpose, J.Ghost{1n+depth, prefix, subtotal} <> others),
    C.preflight_ops(purpose, R.operations(reference, catalog, purpose)))
    == Step.cursor_postfix(purpose,
      R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)) : List<&2, M.Op>
}:
  match purpose:
    case C.Trees{}: {==}
    case C.Outcomes{}: {==}
    case C.Preflight{}:
      Equal.trans(List<&2, M.Op>,
        List.append(&2, M.Op, List.append(&2, M.Op, Step.spine_postfix(others), S.postfix(subtotal)),
          R.operations(reference, catalog, C.Preflight{})),
        List.append(&2, M.Op, Step.spine_postfix(others),
          List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{}))),
        List.append(&2, M.Op, Step.spine_postfix(others), S.postfix(next_subtotal)),
        L.append_assoc(&2, M.Op, Step.spine_postfix(others), S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{})),
        Equal.cong(List<&2, M.Op>, List<&2, M.Op>, tail => List.append(&2, M.Op, Step.spine_postfix(others), tail),
          List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{})), S.postfix(next_subtotal),
          successful_postfix(reference, state, catalog, subtotal, next_state, plan, next_subtotal, equal)))

def global_request_agrees(+global: C.Global, +invocation: C.Global, +request: Nat,
  equal: {global == C.global_count(invocation, request) : C.Global}) -> {
  C.global_request(global) == request : Nat
}:
  match invocation:
    case C.Global{+catalog, +purpose, +pending, +outcomes, _}:
      Equal.cong(C.Global, Nat, value => C.global_request(value), global,
        C.Global{catalog, purpose, pending, outcomes, request}, equal)

def cursor_ops_fields(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat,
  +frames: List<&2, C.Frame>, +operations: List<&2, M.Op>, +ghosts: List<&2, J.Ghost>,
  valid: J.cursor(root, invocation, Step.request(invocation, reversed),
    C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, ghosts),
  trace: {List.append(&2, M.Op, List.reverse(&2, M.Op, reversed),
    C.preflight_ops(C.global_purpose(invocation), operations))
    == Step.cursor_postfix(C.global_purpose(invocation), ghosts) : List<&2, M.Op>}) ->
  Step.valid(root, invocation, reversed,
    C.cursor_ops(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, operations), ghosts):
  match valid:
    case (+global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic)))))):
      %Equal.sym(C.Purpose, C.global_purpose(global), C.global_purpose(invocation),
        ReferenceProof.global_purpose_agrees(global, invocation, Step.request(invocation, reversed), global_equal)) :
        Step.valid(root, invocation, reversed,
          C.schedule(C.preflight_ops(_, operations),
            C.CursorNext{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}}, C.global_request(global)), ghosts)
      schedule_valid(root, invocation, reversed, C.preflight_ops(C.global_purpose(invocation), operations),
        C.CursorNext{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}}, ghosts,
        C.global_request(global), global_request_agrees(global, invocation, Step.request(invocation, reversed), global_equal),
        ((%Equal.sym(Nat, C.global_request(global), Step.request(invocation, reversed),
          global_request_agrees(global, invocation, Step.request(invocation, reversed), global_equal)) :
          J.cursor(root, invocation, _, C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, ghosts)
          (global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic))))))), trace))

def cursor_ops_valid(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +cursor: C.Cursor, +operations: List<&2, M.Op>, +ghosts: List<&2, J.Ghost>,
  valid: J.cursor(root, invocation, Step.request(invocation, reversed), cursor, ghosts),
  trace: {List.append(&2, M.Op, List.reverse(&2, M.Op, reversed),
    C.preflight_ops(C.global_purpose(invocation), operations))
    == Step.cursor_postfix(C.global_purpose(invocation), ghosts) : List<&2, M.Op>}) ->
  Step.valid(root, invocation, reversed, C.cursor_ops(cursor, operations), ghosts):
  match cursor:
    case C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}:
      cursor_ops_fields(root, invocation, reversed, global, slot, name, expanded, referenced, failure, remaining,
        frames, operations, ghosts, valid, trace)

def nochild_output(+root: M.Declaration, +invocation: C.Global, +reversed_ops: List<&2, M.Op>,
  +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +rest: Nat,
  +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  +depth: Nat, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, S.State{name, expanded, referenced, failure}, C.global_catalog(invocation), subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult},
  trace: {List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(C.global_purpose(invocation), J.Ghost{1n+depth, prefix, subtotal} <> others) : List<&2, M.Op>},
  observed: J.cursor(root, invocation, Step.request(invocation, reversed_ops),
    R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}, next_state, plan),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal))
    & {C.advance_cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents})
      == C.cursor_ops(R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}, next_state, plan),
        R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))) : C.Step}) ->
  Step.valid(root, invocation, reversed_ops,
    Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)):
  match observed:
    case (semantic, step):
      %Equal.sym(C.Step,
        C.advance_cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
          C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}),
        C.cursor_ops(R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
          C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}, next_state, plan),
          R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))), step) :
        Step.valid(root, invocation, reversed_ops, _,
          R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal))
      cursor_ops_valid(root, invocation, reversed_ops,
        R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
          C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}, next_state, plan),
        R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation)),
        R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal), semantic,
        Equal.trans(List<&2, M.Op>,
          List.append(&2, M.Op, List.reverse(&2, M.Op, reversed_ops),
            C.preflight_ops(C.global_purpose(invocation), R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation)))),
          List.append(&2, M.Op, Step.cursor_postfix(C.global_purpose(invocation), J.Ghost{1n+depth, prefix, subtotal} <> others),
            C.preflight_ops(C.global_purpose(invocation), R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation)))),
          Step.cursor_postfix(C.global_purpose(invocation),
            R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)),
          Equal.cong(List<&2, M.Op>, List<&2, M.Op>, before => List.append(&2, M.Op, before,
            C.preflight_ops(C.global_purpose(invocation), R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation)))),
            List.reverse(&2, M.Op, reversed_ops), Step.cursor_postfix(C.global_purpose(invocation), J.Ghost{1n+depth, prefix, subtotal} <> others), trace),
          reference_trace(C.global_purpose(invocation), depth, prefix, subtotal, others, reference, C.global_catalog(invocation),
            S.State{name, expanded, referenced, failure}, next_state, plan, next_subtotal, equal)))

def nochild_continue(+root: M.Declaration, +invocation: C.Global, +reversed_ops: List<&2, M.Op>,
  +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +rest: Nat,
  +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  +depth: Nat, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>,
  +next_name: String, +next_expanded: List<&2, String>, +next_referenced: List<&2, String>, +next_failure: Maybe<&2, M.Failure>, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  +equal: {R.result(reference, S.State{name, expanded, referenced, failure}, C.global_catalog(invocation), subtotal)
    == S.ReferenceResult{S.State{next_name, next_expanded, next_referenced, next_failure}, plan, next_subtotal} : S.ReferenceResult},
  valid: Step.valid(root, invocation, reversed_ops,
    C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}},
    J.Ghost{1n+depth, prefix, subtotal} <> others)) ->
  Step.valid(root, invocation, reversed_ops,
    Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)):
  match valid:
    case (semantic, trace):
      nochild_output(root, invocation, reversed_ops, global, slot, name, expanded, referenced, failure, rest,
        parent_slot, reference, pending, reversed_refs, site, parents, depth, prefix, subtotal, others,
        S.State{next_name, next_expanded, next_referenced, next_failure}, plan, next_subtotal, equal, trace,
        ReferenceProof.preserve_success(root, invocation, Step.request(invocation, reversed_ops),
          global, slot, name, expanded, referenced, failure, rest, parent_slot, reference, pending,
          reversed_refs, site, parents, depth, prefix, subtotal, others,
          next_name, next_expanded, next_referenced, next_failure, plan, next_subtotal, equal, semantic))

# Required successor forms are consequences of the existing invariant,
# not additional caller premises of step_preserves or root completion.
def zero_reference_budget(+global: C.Global, +slot: Nat, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>,
  +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  potential: {P.cursor_valid(C.Cursor{global, slot, name, expanded, referenced, failure, 0n,
    C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}) == True{} : Bool}) -> Empty:
  N.internal_false_ne_true(potential)

def zero_reference_depth(+root: M.Declaration, +invocation: C.Global, +request: Nat,
  +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat,
  +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>,
  valid: J.cursor(root, invocation, request,
    C.Cursor{global, slot, name, expanded, referenced, failure, remaining,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents},
    J.Ghost{0n, prefix, subtotal} <> others)) -> Empty:
  match valid:
    case (_, (_, (_, (_, (_, ((_, (bound, _)), _)))))):
      N.internal_false_ne_true(bound)

def zero_reference_cursor(+root: M.Declaration, +invocation: C.Global, +request: Nat,
  +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +depth: Nat,
  +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>,
  valid: J.cursor(root, invocation, request,
    C.Cursor{global, slot, name, expanded, referenced, failure, 0n,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents},
    J.Ghost{depth, prefix, subtotal} <> others)) -> Empty:
  match valid:
    case (_, (_, (_, (_, (potential, _))))):
      zero_reference_budget(global, slot, name, expanded, referenced, failure, parent_slot, reference, pending,
        reversed_refs, site, parents, potential)

def impossible_continue(+root: M.Declaration, +invocation: C.Global, +reversed_ops: List<&2, M.Op>,
  +cursor: C.Cursor, +ghosts: List<&2, J.Ghost>,
  impossible: J.cursor(root, invocation, Step.request(invocation, reversed_ops), cursor, ghosts) -> Empty,
  valid: Step.valid(root, invocation, reversed_ops, C.Continue{cursor}, ghosts)) -> Empty:
  match valid:
    case (semantic, _): impossible(semantic)

def nochild_all_budgets(+root: M.Declaration, +invocation: C.Global, +reversed_ops: List<&2, M.Op>,
  +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat,
  +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  +depth: Nat, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>,
  +next_name: String, +next_expanded: List<&2, String>, +next_referenced: List<&2, String>, +next_failure: Maybe<&2, M.Failure>, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  +equal: {R.result(reference, S.State{name, expanded, referenced, failure}, C.global_catalog(invocation), subtotal)
    == S.ReferenceResult{S.State{next_name, next_expanded, next_referenced, next_failure}, plan, next_subtotal} : S.ReferenceResult},
  valid: Step.valid(root, invocation, reversed_ops,
    C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}},
    J.Ghost{depth, prefix, subtotal} <> others)) ->
  Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation, reversed_ops,
      Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}), after)):
  match remaining depth:
    case 0n depth:
      Empty.absurd(Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation, reversed_ops,
      Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 0n,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}), after)),
        impossible_continue(root, invocation, reversed_ops,
          C.Cursor{global, slot, name, expanded, referenced, failure, 0n,
            C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents},
          J.Ghost{depth, prefix, subtotal} <> others,
          semantic => zero_reference_cursor(root, invocation, Step.request(invocation, reversed_ops), global, slot, name,
            expanded, referenced, failure, depth, parent_slot, reference, pending, reversed_refs, site, parents,
            prefix, subtotal, others, semantic), valid))
    case 1n++rest 0n:
      Empty.absurd(Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation, reversed_ops,
      Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}), after)),
        impossible_continue(root, invocation, reversed_ops,
          C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
            C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents},
          J.Ghost{0n, prefix, subtotal} <> others,
          semantic => zero_reference_depth(root, invocation, Step.request(invocation, reversed_ops), global, slot, name,
            expanded, referenced, failure, 1n+rest, parent_slot, reference, pending, reversed_refs, site, parents,
            prefix, subtotal, others, semantic), valid))
    case 1n++rest 1n++depth:
      (R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal),
        nochild_continue(root, invocation, reversed_ops, global, slot, name, expanded, referenced, failure, rest,
          parent_slot, reference, pending, reversed_refs, site, parents, depth, prefix, subtotal, others,
          next_name, next_expanded, next_referenced, next_failure, plan, next_subtotal, equal, valid))

def main() -> Unit:
  Unit{}
