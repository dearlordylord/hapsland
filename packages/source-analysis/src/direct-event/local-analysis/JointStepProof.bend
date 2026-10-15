import Base
import ./Model.bend as M
import ./Specification.bend as S
import ./Core.bend as C
import ./Joint.bend as J
import ./Potential.bend as P
import ./WeightedInventory.bend as W
import ./ChildBudgetProof.bend as ChildBudget
import ./JointLaws.bend as JointLaws
import ./JointProof.bend as JointProof
import ./JointStep.bend as Step
import ./JointStepLaws.bend as Laws
import ./JointReference.bend as R
import ./Continuation.bend as K
import ./ReturnProof.bend as Return
import ./ReturnLaws.bend as ReturnLaws
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
      (
        Equal.sym(Nat, Nat.add(request, 0n), request, N.add_zero(request)),
        (
          JointLaws.initial_cursor(
            M.Declaration{slot, identity, name, references},
            C.Global{M.Catalog{declarations, supporting}, C.Preflight{}, pending, outcomes, request}
          ),
          {==}
        )
      )
    case M.Declaration{+slot, +identity, +name, +references}
      C.Global{M.Catalog{+declarations, +supporting}, C.Trees{}, +pending, +outcomes, +request}:
      %Equal.sym(Nat, Nat.add(request, 0n), request, N.add_zero(request)) :
        J.cursor(
          M.Declaration{slot, identity, name, references},
          C.Global{M.Catalog{declarations, supporting}, C.Trees{}, pending, outcomes, request},
          _,
          J.initial_cursor(
            M.Declaration{slot, identity, name, references},
            C.Global{M.Catalog{declarations, supporting}, C.Trees{}, pending, outcomes, request}
          ),
          [
            J.initial_ghost(
              M.Declaration{slot, identity, name, references},
              M.Catalog{declarations, supporting}
            )
          ]
        )
        & {[] == [] : List<&2, M.Op>}
      (JointLaws.initial_cursor(M.Declaration{slot, identity, name, references},
        C.Global{M.Catalog{declarations, supporting}, C.Trees{}, pending, outcomes, request}), {==})
    case M.Declaration{+slot, +identity, +name, +references}
      C.Global{M.Catalog{+declarations, +supporting}, C.Outcomes{}, +pending, +outcomes, +request}:
      %Equal.sym(Nat, Nat.add(request, 0n), request, N.add_zero(request)) :
        J.cursor(
          M.Declaration{slot, identity, name, references},
          C.Global{M.Catalog{declarations, supporting}, C.Outcomes{}, pending, outcomes, request},
          _,
          J.initial_cursor(
            M.Declaration{slot, identity, name, references},
            C.Global{M.Catalog{declarations, supporting}, C.Outcomes{}, pending, outcomes, request}
          ),
          [
            J.initial_ghost(
              M.Declaration{slot, identity, name, references},
              M.Catalog{declarations, supporting}
            )
          ]
        )
        & {[] == [] : List<&2, M.Op>}
      (
        JointLaws.initial_cursor(
          M.Declaration{slot, identity, name, references},
          C.Global{M.Catalog{declarations, supporting}, C.Outcomes{}, pending, outcomes, request}
        ),
        {==}
      )

# This helper has exactly the approved initial_root statement. The laws
# module stays unfilled until the combined step proof is complete.
def initial_root(+root: M.Declaration, +invocation: C.Global) ->
  Step.valid(root, invocation, [],
    C.start_root(M.traversal_inventory(root, C.global_catalog(invocation)), invocation, root),
    [J.initial_ghost(root, C.global_catalog(invocation))]):
  %Equal.sym(
    C.Step,
    C.start_root(M.traversal_inventory(root, C.global_catalog(invocation)), invocation, root),
    C.cursor_ops(
      J.initial_cursor(root, invocation),
      C.node_operations(C.global_purpose(invocation), S.declaration_slot(root))
    ),
    JointLaws.initial_step(root, invocation)
  ) :
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

def recount_fields(
  +root: M.Declaration,
  +invocation: C.Global,
  +old_request: Nat,
  +next_request: Nat,
  +catalog: M.Catalog,
  +purpose: C.Purpose,
  +pending: List<&2, M.Declaration>,
  +outcomes: List<&2, M.Outcome>,
  +stored_request: Nat,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frames: List<&2, C.Frame>,
  +ghosts: List<&2, J.Ghost>,
  valid: J.cursor(
    root,
    invocation,
    old_request,
    C.Cursor{
      C.Global{catalog, purpose, pending, outcomes, stored_request},
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      frames
    },
    ghosts
  )
) ->
  J.cursor(
    root,
    invocation,
    next_request,
    C.Cursor{
      C.Global{catalog, purpose, pending, outcomes, next_request},
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      frames
    },
    ghosts
  ):
  match valid:
    case (global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic)))))):
      (global_recount(C.Global{catalog, purpose, pending, outcomes, stored_request}, invocation,
        old_request, next_request, global_equal),
        (slot_equal, (name_equal, (shape, (potential, (bounds, semantic))))))

def recount_cursor(
  +root: M.Declaration,
  +invocation: C.Global,
  +old_request: Nat,
  +next_request: Nat,
  +cursor: C.Cursor,
  +ghosts: List<&2, J.Ghost>,
  valid: J.cursor(root, invocation, old_request, cursor, ghosts)
) ->
  J.cursor(root, invocation, next_request, C.cursor_count(cursor, next_request), ghosts):
  match cursor:
    case C.Cursor{
      C.Global{catalog, purpose, pending, outcomes, stored_request},
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      frames
    }:
      recount_fields(
        root,
        invocation,
        old_request,
        next_request,
        catalog,
        purpose,
        pending,
        outcomes,
        stored_request,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frames,
        ghosts,
        valid
      )

# Appending the current command to the delivered trace removes it from the
# planned queue exactly once; its order relative to all measurements is fixed.
def queued_trace(+reversed: List<&2, M.Op>, +operation: M.Op, +remaining: List<&2, M.Op>) -> {
  List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operation <> remaining)
  == List.append(&2, M.Op, List.reverse(&2, M.Op, operation <> reversed), remaining)
  : List<&2, M.Op>
}:
  Equal.trans(
    List<&2, M.Op>,
    List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operation <> remaining),
    List.append(&2, M.Op, List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation]), remaining),
    List.append(&2, M.Op, List.reverse(&2, M.Op, operation <> reversed), remaining),
    Equal.sym(
      List<&2, M.Op>,
      List.append(&2, M.Op, List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation]), remaining),
      List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operation <> remaining),
      L.append_assoc(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation], remaining)
    ),
    Equal.cong(List<&2, M.Op>, List<&2, M.Op>, prefix => List.append(&2, M.Op, prefix, remaining),
      List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation]),
      List.reverse(&2, M.Op, operation <> reversed),
      Equal.sym(List<&2, M.Op>, List.reverse(&2, M.Op, operation <> reversed),
        List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), [operation]),
        L.reverse_go_spec(&2, M.Op, reversed, [operation])))
  )

def ack_request(+initial: Nat, +count: Nat, +queued: Nat,
  equal: {queued == Nat.add(initial, count) : Nat}) -> {
  Nat.add(queued, 1n) == Nat.add(initial, 1n+count) : Nat
}:
  Equal.trans(
    Nat,
    Nat.add(queued, 1n),
    1n+queued,
    Nat.add(initial, 1n+count),
    N.add_comm(queued, 1n),
    Equal.trans(
      Nat,
      1n+queued,
      1n+Nat.add(initial, count),
      Nat.add(initial, 1n+count),
      Equal.cong(Nat, Nat, value => 1n+value, queued, Nat.add(initial, count), equal),
      Equal.sym(Nat, Nat.add(initial, 1n+count), 1n+Nat.add(initial, count), N.add_succ(initial, count))
    )
  )

def reverse_length_go(+values: List<&2, M.Op>, +accumulator: List<&2, M.Op>) -> {
  List.length(&2, M.Op, List.reverse.go(&2, M.Op, values, accumulator))
    == Nat.add(List.length(&2, M.Op, values), List.length(&2, M.Op, accumulator)) : Nat
}:
  match values:
    case []: {==}
    case +head <> +tail:
      Equal.trans(
        Nat,
        List.length(&2, M.Op, List.reverse.go(&2, M.Op, tail, head <> accumulator)),
        Nat.add(List.length(&2, M.Op, tail), 1n+List.length(&2, M.Op, accumulator)),
        1n+Nat.add(List.length(&2, M.Op, tail), List.length(&2, M.Op, accumulator)),
        reverse_length_go(tail, head <> accumulator),
        N.add_succ(List.length(&2, M.Op, tail), List.length(&2, M.Op, accumulator))
      )

def reverse_length(+values: List<&2, M.Op>) -> {
  List.length(&2, M.Op, List.reverse(&2, M.Op, values)) == List.length(&2, M.Op, values) : Nat
}:
  Equal.trans(Nat, List.length(&2, M.Op, List.reverse(&2, M.Op, values)),
    Nat.add(List.length(&2, M.Op, values), 0n), List.length(&2, M.Op, values),
    reverse_length_go(values, []), N.add_zero(List.length(&2, M.Op, values)))

def ready_cursor(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed: List<&2, M.Op>,
  +cursor: C.Cursor,
  +ghosts: List<&2, J.Ghost>,
  +queued: Nat,
  request_equal: {queued == Step.request(invocation, reversed) : Nat},
  valid: Step.deferred(
    C.CursorNext{cursor},
    root,
    invocation,
    ghosts,
    List.reverse(&2, M.Op, reversed)
  )
) ->
  Step.valid(root, invocation, reversed, C.ready(C.CursorNext{cursor}, queued), ghosts):
  match valid:
    case (semantic, trace):
      (
        %request_equal : J.cursor(root, invocation, _, C.cursor_count(cursor, queued), ghosts)
          recount_cursor(
            root,
            invocation,
            C.global_request(Step.cursor_global(cursor)),
            queued,
            cursor,
            ghosts,
            semantic
          ),
        trace
      )

def ready_root(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed: List<&2, M.Op>,
  +global: C.Global,
  +queued: Nat,
  request_equal: {queued == Step.request(invocation, reversed) : Nat},
  valid: Step.deferred(C.RootNext{global}, root, invocation, [], List.reverse(&2, M.Op, reversed))
) ->
  Step.valid(root, invocation, reversed, C.ready(C.RootNext{global}, queued), []):
  %Equal.sym(Nat, queued, Step.request(invocation, reversed), request_equal) :
    Root.correspondence(
      Root.RootDone{C.global_count(global, _), reversed},
      Step.expectation(root, invocation)
    )
  %reverse_length(reversed) : Root.correspondence(
    Root.RootDone{C.global_count(global, Nat.add(C.global_request(invocation), _)), reversed},
    Step.expectation(root, invocation)
  )
  %Reverse.reverse_reverse(&2, M.Op, reversed) : Root.correspondence(
    Root.RootDone{
      C.global_count(
        global,
        Nat.add(
          C.global_request(invocation),
          List.length(&2, M.Op, List.reverse(&2, M.Op, reversed))
        )
      ),
      _
    },
    Step.expectation(root, invocation)
  )
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
    C.acknowledge(_, remaining, next, queued)
    == C.schedule(remaining, next, Nat.add(queued, 1n))
    : C.Step
  }
  {==}

# All Engine shapes, including the final Ack into Continue or NextRoot.
# This is one branch of the approved aggregate step_preserves theorem.
def engine_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed: List<&2, M.Op>,
  +operation: M.Op,
  +queued: Nat,
  +remaining: List<&2, M.Op>,
  +next: C.Deferred,
  +ghosts: List<&2, J.Ghost>,
  valid: Step.valid(
    root,
    invocation,
    reversed,
    C.Engine{operation, queued, remaining, next},
    ghosts
  )
) ->
  Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation,
    Step.record(C.Engine{operation, queued, remaining, next}, reversed),
    Step.advance(C.Engine{operation, queued, remaining, next}), after)):
  match valid:
    case (request_equal, deferred):
      (
        ghosts,
        (%Equal.sym(
          C.Step,
          Step.advance(C.Engine{operation, queued, remaining, next}),
          C.schedule(remaining, next, Nat.add(queued, 1n)),
          ack_step(operation, queued, remaining, next)
        ) :
          Step.valid(root, invocation, operation <> reversed, _, ghosts)
        schedule_valid(
          root,
          invocation,
          operation <> reversed,
          remaining,
          next,
          ghosts,
          Nat.add(queued, 1n),
          ack_request(C.global_request(invocation), List.length(&2, M.Op, reversed), queued, request_equal),
          (%queued_trace(reversed, operation, remaining) : Step.deferred(next, root, invocation, ghosts, _) deferred)
        ))
      )

# Exact arithmetic recipe for one edge, before any child measurements.
def edge_postfix(+subtotal: S.BytesExpr, +symbol: String, +target: Maybe<&2, M.Declaration>) -> {
  List.append(&2, M.Op, S.postfix(subtotal), C.edge_operations(C.Preflight{}, symbol, target))
    == S.postfix(S.edge_total(subtotal, symbol, target)) : List<&2, M.Op>
}:
  match target:
    case None{}: {==}
    case Some{M.Declaration{_, _, _, _}}: {==}

def reference_bytes(
  reference: M.Reference,
  +catalog: M.Catalog,
  subtotal: S.BytesExpr
) -> S.BytesExpr:
  match reference:
    case M.Unsupported{symbol}: S.edge_total(subtotal, symbol, None{})
    case M.Named{+symbol, target_id}: S.edge_total(
      subtotal,
      symbol,
      S.lookup(catalog, symbol, target_id)
    )

def reference_postfix(+reference: M.Reference, +catalog: M.Catalog, +subtotal: S.BytesExpr) -> {
  List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{}))
    == S.postfix(reference_bytes(reference, catalog, subtotal)) : List<&2, M.Op>
}:
  match reference:
    case M.Unsupported{symbol}: edge_postfix(subtotal, symbol, None{})
    case M.Named{+symbol, +target_id}:
      %Fresh.lookup_exact(catalog, symbol, target_id) : {
        List.append(
          &2,
          M.Op,
          S.postfix(subtotal),
          R.operations(M.Named{symbol, target_id}, catalog, C.Preflight{})
        )
        == S.postfix(S.edge_total(subtotal, symbol, _))
        : List<&2, M.Op>
      }
      edge_postfix(subtotal, symbol, C.lookup(catalog, symbol, target_id))

def subtotal_claim(result: S.ReferenceResult, expected: S.BytesExpr) -> Type:
  match result:
    case S.ReferenceDepthExhausted{}: Unit
    case S.ReferenceResult{_, _, subtotal}: {subtotal == expected : S.BytesExpr}

def seen_subtotal(+already: Bool, +state: S.State, +symbol: String,
  +target: M.Declaration, +subtotal: S.BytesExpr) ->
  subtotal_claim(
    S.named_seen(already, state, symbol, target, subtotal, _ => _ => S.DepthExhausted{}),
    subtotal
  ):
  match already:
    case True{}: {==}
    case False{}: Unit{}

def target_subtotal(+target: Maybe<&2, M.Declaration>, +state: S.State,
  +symbol: String, +subtotal: S.BytesExpr) ->
  subtotal_claim(
    S.named_target(target, state, symbol, subtotal, _ => _ => S.DepthExhausted{}),
    subtotal
  ):
  match target:
    case None{}: {==}
    case Some{+target}: seen_subtotal(
      S.seen(state, S.declaration_identity(target)),
      state,
      symbol,
      target,
      subtotal
    )

def limit_subtotal(+limited: Bool, +target: Maybe<&2, M.Declaration>, +state: S.State,
  +symbol: String, +subtotal: S.BytesExpr) ->
  subtotal_claim(
    S.named_limit(limited, target, state, symbol, subtotal, _ => _ => S.DepthExhausted{}),
    subtotal
  ):
  match limited:
    case True{}: {==}
    case False{}: target_subtotal(target, state, symbol, subtotal)

def reference_subtotal(
  +reference: M.Reference,
  +state: S.State,
  +catalog: M.Catalog,
  +subtotal: S.BytesExpr
) ->
  subtotal_claim(
    R.result(reference, state, catalog, subtotal),
    reference_bytes(reference, catalog, subtotal)
  ):
  match reference:
    case M.Unsupported{_}: {==}
    case M.Named{+symbol, +target_id}:
      limit_subtotal(
        S.over_limit(S.record_named(state, symbol, target_id)),
        S.lookup(catalog, symbol, target_id),
        S.record_named(state, symbol, target_id),
        symbol,
        S.edge_total(subtotal, symbol, S.lookup(catalog, symbol, target_id))
      )

def successful_subtotal(
  +reference: M.Reference,
  +state: S.State,
  +catalog: M.Catalog,
  +subtotal: S.BytesExpr,
  +next_state: S.State,
  +plan: M.ReferencePlan,
  +next_subtotal: S.BytesExpr,
  equal: {
    R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal}
    : S.ReferenceResult
  }
) -> {
  next_subtotal == reference_bytes(reference, catalog, subtotal) : S.BytesExpr
}:
  %equal : subtotal_claim(_, reference_bytes(reference, catalog, subtotal))
  reference_subtotal(reference, state, catalog, subtotal)

def successful_postfix(
  +reference: M.Reference,
  +state: S.State,
  +catalog: M.Catalog,
  +subtotal: S.BytesExpr,
  +next_state: S.State,
  +plan: M.ReferencePlan,
  +next_subtotal: S.BytesExpr,
  equal: {
    R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal}
    : S.ReferenceResult
  }
) -> {
  List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{}))
    == S.postfix(next_subtotal) : List<&2, M.Op>
}:
  %Equal.sym(
    S.BytesExpr,
    next_subtotal,
    reference_bytes(reference, catalog, subtotal),
    successful_subtotal(reference, state, catalog, subtotal, next_state, plan, next_subtotal, equal)
  ) : {
    List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{}))
      == S.postfix(_) : List<&2, M.Op>}
  reference_postfix(reference, catalog, subtotal)

def reference_trace(+purpose: C.Purpose, +depth: Nat, +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>, +reference: M.Reference, +catalog: M.Catalog,
  +state: S.State, +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
      List.append(
        &2,
        M.Op,
        Step.cursor_postfix(purpose, J.Ghost{1n+depth, prefix, subtotal} <> others),
        C.preflight_ops(purpose, R.operations(reference, catalog, purpose))
      )
      == Step.cursor_postfix(
        purpose,
        R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)
      )
      : List<&2, M.Op>
    }:
  match purpose:
    case C.Trees{}: {==}
    case C.Outcomes{}: {==}
    case C.Preflight{}:
      Equal.trans(
        List<&2, M.Op>,
        List.append(&2, M.Op, List.append(&2, M.Op, Step.spine_postfix(others), S.postfix(subtotal)),
          R.operations(reference, catalog, C.Preflight{})),
        List.append(
          &2,
          M.Op,
          Step.spine_postfix(others),
          List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{}))
        ),
        List.append(&2, M.Op, Step.spine_postfix(others), S.postfix(next_subtotal)),
        L.append_assoc(
          &2,
          M.Op,
          Step.spine_postfix(others),
          S.postfix(subtotal),
          R.operations(reference, catalog, C.Preflight{})
        ),
        Equal.cong(
          List<&2, M.Op>,
          List<&2, M.Op>,
          tail => List.append(&2, M.Op, Step.spine_postfix(others), tail),
          List.append(&2, M.Op, S.postfix(subtotal), R.operations(reference, catalog, C.Preflight{})),
          S.postfix(next_subtotal),
          successful_postfix(reference, state, catalog, subtotal, next_state, plan, next_subtotal, equal)
        )
      )

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
  Step.valid(
    root,
    invocation,
    reversed,
    C.cursor_ops(
      C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
      operations
    ),
    ghosts
  ):
  match valid:
    case (+global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic)))))):
      %Equal.sym(
        C.Purpose,
        C.global_purpose(global),
        C.global_purpose(invocation),
        ReferenceProof.global_purpose_agrees(
          global,
          invocation,
          Step.request(invocation, reversed),
          global_equal
        )
      ) :
        Step.valid(
          root,
          invocation,
          reversed,
          C.schedule(
            C.preflight_ops(_, operations),
            C.CursorNext{
              C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}
            },
            C.global_request(global)
          ),
          ghosts
        )
      schedule_valid(
        root,
        invocation,
        reversed,
        C.preflight_ops(C.global_purpose(invocation), operations),
        C.CursorNext{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}},
        ghosts,
        C.global_request(global),
        global_request_agrees(global, invocation, Step.request(invocation, reversed), global_equal),
        (
          (%Equal.sym(
            Nat,
            C.global_request(global),
            Step.request(invocation, reversed),
            global_request_agrees(global, invocation, Step.request(invocation, reversed), global_equal)
          ) :
            J.cursor(
              root,
              invocation,
              _,
              C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
              ghosts
            )
            (global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic))))))),
          trace
        )
      )

def cursor_ops_valid(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +cursor: C.Cursor, +operations: List<&2, M.Op>, +ghosts: List<&2, J.Ghost>,
  valid: J.cursor(root, invocation, Step.request(invocation, reversed), cursor, ghosts),
  trace: {List.append(&2, M.Op, List.reverse(&2, M.Op, reversed),
    C.preflight_ops(C.global_purpose(invocation), operations))
    == Step.cursor_postfix(C.global_purpose(invocation), ghosts) : List<&2, M.Op>}) ->
  Step.valid(root, invocation, reversed, C.cursor_ops(cursor, operations), ghosts):
  match cursor:
    case C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}:
      cursor_ops_fields(
        root,
        invocation,
        reversed,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frames,
        operations,
        ghosts,
        valid,
        trace
      )

def nochild_output(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +rest: Nat,
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  +next_state: S.State,
  +plan: M.ReferencePlan,
  +next_subtotal: S.BytesExpr,
  equal: {
    R.result(
      reference,
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.ReferenceResult{next_state, plan, next_subtotal}
    : S.ReferenceResult
  },
  trace: {
    List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(
      C.global_purpose(invocation),
      J.Ghost{1n+depth, prefix, subtotal} <> others
    )
    : List<&2, M.Op>
  },
  observed: J.cursor(
    root,
    invocation,
    Step.request(invocation, reversed_ops),
    R.successor(
      rest,
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        1n+rest,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
      },
      next_state,
      plan
    ),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)
  ) & {
    C.advance_cursor(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        1n+rest,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
      }
    )
    == C.cursor_ops(
      R.successor(
        rest,
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          1n+rest,
          C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
        },
        next_state,
        plan
      ),
      R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
    )
    : C.Step
  }
) ->
  Step.valid(root, invocation, reversed_ops,
    Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)):
  match observed:
    case (semantic, step):
      %Equal.sym(
        C.Step,
        C.advance_cursor(
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            1n+rest,
            C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
          }
        ),
        C.cursor_ops(
          R.successor(
            rest,
            C.Cursor{
              global,
              slot,
              name,
              expanded,
              referenced,
              failure,
              1n+rest,
              C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
            },
            next_state,
            plan
          ),
          R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
        ),
        step
      ) :
        Step.valid(root, invocation, reversed_ops, _,
          R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal))
      cursor_ops_valid(
        root,
        invocation,
        reversed_ops,
        R.successor(
          rest,
          C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
            C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents},
          next_state,
          plan
        ),
        R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation)),
        R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal),
        semantic,
        Equal.trans(
          List<&2, M.Op>,
          List.append(
            &2,
            M.Op,
            List.reverse(&2, M.Op, reversed_ops),
            C.preflight_ops(
              C.global_purpose(invocation),
              R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
            )
          ),
          List.append(
            &2,
            M.Op,
            Step.cursor_postfix(C.global_purpose(invocation), J.Ghost{1n+depth, prefix, subtotal} <> others),
            C.preflight_ops(
              C.global_purpose(invocation),
              R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
            )
          ),
          Step.cursor_postfix(C.global_purpose(invocation),
            R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)),
          Equal.cong(
            List<&2, M.Op>,
            List<&2, M.Op>,
            before => List.append(
              &2,
              M.Op,
              before,
              C.preflight_ops(
                C.global_purpose(invocation),
                R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
              )
            ),
            List.reverse(&2, M.Op, reversed_ops),
            Step.cursor_postfix(C.global_purpose(invocation), J.Ghost{1n+depth, prefix, subtotal} <> others),
            trace
          ),
          reference_trace(
            C.global_purpose(invocation),
            depth,
            prefix,
            subtotal,
            others,
            reference,
            C.global_catalog(invocation),
            S.State{name, expanded, referenced, failure},
            next_state,
            plan,
            next_subtotal,
            equal
          )
        )
      )

def nochild_continue(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +rest: Nat,
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  +next_name: String,
  +next_expanded: List<&2, String>,
  +next_referenced: List<&2, String>,
  +next_failure: Maybe<&2, M.Failure>,
  +plan: M.ReferencePlan,
  +next_subtotal: S.BytesExpr,
  +equal: {
    R.result(
      reference,
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.ReferenceResult{
      S.State{next_name, next_expanded, next_referenced, next_failure},
      plan,
      next_subtotal
    }
    : S.ReferenceResult
  },
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        1n+rest,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
      }
    },
    J.Ghost{1n+depth, prefix, subtotal} <> others
  )
) ->
  Step.valid(root, invocation, reversed_ops,
    Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)):
  match valid:
    case (semantic, trace):
      nochild_output(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        rest,
        parent_slot,
        reference,
        pending,
        reversed_refs,
        site,
        parents,
        depth,
        prefix,
        subtotal,
        others,
        S.State{next_name, next_expanded, next_referenced, next_failure},
        plan,
        next_subtotal,
        equal,
        trace,
        ReferenceProof.preserve_success(
          root,
          invocation,
          Step.request(invocation, reversed_ops),
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          rest,
          parent_slot,
          reference,
          pending,
          reversed_refs,
          site,
          parents,
          depth,
          prefix,
          subtotal,
          others,
          next_name,
          next_expanded,
          next_referenced,
          next_failure,
          plan,
          next_subtotal,
          equal,
          semantic
        )
      )

# Required successor forms are consequences of the existing invariant,
# not additional caller premises of step_preserves or root completion.
def zero_reference_budget(
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  potential: {
    P.cursor_valid(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        0n,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
      }
    )
    == True{}
    : Bool
  }
) -> Empty:
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
      zero_reference_budget(
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        parent_slot,
        reference,
        pending,
        reversed_refs,
        site,
        parents,
        potential
      )

def impossible_continue(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +cursor: C.Cursor,
  +ghosts: List<&2, J.Ghost>,
  impossible: J.cursor(
    root,
    invocation,
    Step.request(invocation, reversed_ops),
    cursor,
    ghosts
  ) -> Empty,
  valid: Step.valid(root, invocation, reversed_ops, C.Continue{cursor}, ghosts)
) -> Empty:
  match valid:
    case (semantic, _): impossible(semantic)

def nochild_all_budgets(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  +next_name: String,
  +next_expanded: List<&2, String>,
  +next_referenced: List<&2, String>,
  +next_failure: Maybe<&2, M.Failure>,
  +plan: M.ReferencePlan,
  +next_subtotal: S.BytesExpr,
  +equal: {
    R.result(
      reference,
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.ReferenceResult{
      S.State{next_name, next_expanded, next_referenced, next_failure},
      plan,
      next_subtotal
    }
    : S.ReferenceResult
  },
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
      }
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) ->
  Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation, reversed_ops,
      Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}), after)):
  match remaining depth:
    case 0n depth:
      Empty.absurd(
        Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation, reversed_ops,
        Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 0n,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}), after)),
        impossible_continue(
          root,
          invocation,
          reversed_ops,
          C.Cursor{global, slot, name, expanded, referenced, failure, 0n,
            C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents},
          J.Ghost{depth, prefix, subtotal} <> others,
          semantic => zero_reference_cursor(
            root,
            invocation,
            Step.request(invocation, reversed_ops),
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            depth,
            parent_slot,
            reference,
            pending,
            reversed_refs,
            site,
            parents,
            prefix,
            subtotal,
            others,
            semantic
          ),
          valid
        )
      )
    case 1n++rest 0n:
      Empty.absurd(
        Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation, reversed_ops,
        Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents}}), after)),
        impossible_continue(
          root,
          invocation,
          reversed_ops,
          C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
            C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents},
          J.Ghost{0n, prefix, subtotal} <> others,
          semantic => zero_reference_depth(
            root,
            invocation,
            Step.request(invocation, reversed_ops),
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            1n+rest,
            parent_slot,
            reference,
            pending,
            reversed_refs,
            site,
            parents,
            prefix,
            subtotal,
            others,
            semantic
          ),
          valid
        )
      )
    case 1n++rest 1n++depth:
      (
        R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal),
        nochild_continue(
          root,
          invocation,
          reversed_ops,
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          rest,
          parent_slot,
          reference,
          pending,
          reversed_refs,
          site,
          parents,
          depth,
          prefix,
          subtotal,
          others,
          next_name,
          next_expanded,
          next_referenced,
          next_failure,
          plan,
          next_subtotal,
          equal,
          valid
        )
      )

def append_chunks(
  +a: List<&2, M.Op>,
  +b: List<&2, M.Op>,
  +c: List<&2, M.Op>,
  +d: List<&2, M.Op>
) -> {
  List.append(&2, M.Op, List.append(&2, M.Op, a, b), List.append(&2, M.Op, c, d))
  == List.append(&2, M.Op, List.append(&2, M.Op, a, List.append(&2, M.Op, b, c)), d)
  : List<&2, M.Op>
}:
  Equal.trans(List<&2, M.Op>,
    List.append(&2, M.Op, List.append(&2, M.Op, a, b), List.append(&2, M.Op, c, d)),
    List.append(&2, M.Op, List.append(&2, M.Op, List.append(&2, M.Op, a, b), c), d),
    List.append(&2, M.Op, List.append(&2, M.Op, a, List.append(&2, M.Op, b, c)), d),
    Equal.sym(List<&2, M.Op>,
      List.append(&2, M.Op, List.append(&2, M.Op, List.append(&2, M.Op, a, b), c), d),
      List.append(&2, M.Op, List.append(&2, M.Op, a, b), List.append(&2, M.Op, c, d)),
      L.append_assoc(&2, M.Op, List.append(&2, M.Op, a, b), c, d)),
    Equal.cong(List<&2, M.Op>, List<&2, M.Op>, prefix => List.append(&2, M.Op, prefix, d),
      List.append(&2, M.Op, List.append(&2, M.Op, a, b), c),
      List.append(&2, M.Op, a, List.append(&2, M.Op, b, c)), L.append_assoc(&2, M.Op, a, b, c)))

def fresh_trace(+purpose: C.Purpose, +depth: Nat, +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>, +symbol: String, +target: M.Declaration) -> {
    List.append(
      &2,
      M.Op,
      Step.cursor_postfix(purpose, J.Ghost{2n+depth, prefix, subtotal} <> others),
      C.preflight_ops(
        purpose,
        C.child_operations(
          purpose,
          C.edge_operations(purpose, symbol, Some{target}),
          S.declaration_slot(target)
        )
      )
    )
    == Step.cursor_postfix(
      purpose,
      J.enter_ghosts(depth, J.Ghost{2n+depth, prefix, subtotal} <> others, target, symbol)
    )
    : List<&2, M.Op>
  }:
  match purpose target:
    case C.Trees{} _: {==}
    case C.Outcomes{} _: {==}
    case C.Preflight{} M.Declaration{+slot, +identity, +name, +references}:
      Equal.trans(
        List<&2, M.Op>,
        List.append(
          &2,
          M.Op,
          List.append(&2, M.Op, Step.spine_postfix(others), S.postfix(subtotal)),
          List.append(
            &2,
            M.Op,
            C.edge_operations(C.Preflight{}, symbol, Some{M.Declaration{slot, identity, name, references}}),
            C.node_operations(C.Preflight{}, slot)
          )
        ),
        List.append(
          &2,
          M.Op,
          List.append(
            &2,
            M.Op,
            Step.spine_postfix(others),
            List.append(
              &2,
              M.Op,
              S.postfix(subtotal),
              C.edge_operations(C.Preflight{}, symbol, Some{M.Declaration{slot, identity, name, references}})
            )
          ),
          C.node_operations(C.Preflight{}, slot)
        ),
        List.append(
          &2,
          M.Op,
          List.append(
            &2,
            M.Op,
            Step.spine_postfix(others),
            S.postfix(S.edge_total(subtotal, symbol, Some{M.Declaration{slot, identity, name, references}}))
          ),
          C.node_operations(C.Preflight{}, slot)
        ),
        append_chunks(
          Step.spine_postfix(others),
          S.postfix(subtotal),
          C.edge_operations(C.Preflight{}, symbol, Some{M.Declaration{slot, identity, name, references}}),
          C.node_operations(C.Preflight{}, slot)
        ),
        Equal.cong(
          List<&2, M.Op>,
          List<&2, M.Op>,
          middle =>
            List.append(
              &2,
              M.Op,
              List.append(&2, M.Op, Step.spine_postfix(others), middle),
              C.node_operations(C.Preflight{}, slot)
            ),
          List.append(
            &2,
            M.Op,
            S.postfix(subtotal),
            C.edge_operations(C.Preflight{}, symbol, Some{M.Declaration{slot, identity, name, references}})
          ),
          S.postfix(S.edge_total(subtotal, symbol, Some{M.Declaration{slot, identity, name, references}})),
          edge_postfix(subtotal, symbol, Some{M.Declaration{slot, identity, name, references}})
        )
      )

def fresh_evidence(
  +root: M.Declaration,
  +invocation: C.Global,
  +request: Nat,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +rest: Nat,
  +depth: Nat,
  +parent_slot: Nat,
  +tail: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +target_slot: Nat,
  +identity: String,
  +target_name: String,
  +references: List<&2, M.Reference>,
  +found: {
    C.lookup(C.global_catalog(global), symbol, target_id)
    == Some{M.Declaration{target_slot, identity, target_name, references}}
    : Maybe<&2, M.Declaration>
  },
  +fresh: {C.contains(identity, expanded) == False{} : Bool},
  +unlimited: {
    Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n)
    == False{}
    : Bool
  },
  valid: J.cursor(
    root,
    invocation,
    request,
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      2n+rest,
      C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
    },
    J.Ghost{2n+depth, prefix, subtotal} <> others
  )
) ->
  {C.global_purpose(global) == C.global_purpose(invocation) : C.Purpose}
  & (J.cursor(
    root,
    invocation,
    request,
    J.enter_cursor(
      rest,
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
      },
      M.Declaration{target_slot, identity, target_name, references},
      symbol,
      target_id
    ),
    J.enter_ghosts(
      depth,
      J.Ghost{2n+depth, prefix, subtotal} <> others,
      M.Declaration{target_slot, identity, target_name, references},
      symbol
    )
  ) & {
    C.advance_cursor(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
      }
    )
    == C.cursor_ops(
      J.enter_cursor(
        rest,
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          2n+rest,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
        },
        M.Declaration{target_slot, identity, target_name, references},
        symbol,
        target_id
      ),
      C.child_operations(
        C.global_purpose(global),
        C.edge_operations(
          C.global_purpose(global),
          symbol,
          Some{M.Declaration{target_slot, identity, target_name, references}}
        ),
        target_slot
      )
    )
    : C.Step
  }):
  match valid:
    case (+global_equal, (slot_equal, (name_equal, (shape, (core, (bounds, semantic)))))):
      (
        ReferenceProof.global_purpose_agrees(global, invocation, request, global_equal),
        (
          Fresh.preserve_fresh(
            root,
            invocation,
            request,
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            rest,
            depth,
            parent_slot,
            tail,
            reversed,
            site,
            ancestors,
            others,
            prefix,
            subtotal,
            symbol,
            target_id,
            target_slot,
            identity,
            target_name,
            references,
            found,
            fresh,
            unlimited,
            (global_equal, (slot_equal, (name_equal, (shape, (core, (bounds, semantic))))))
          ),
          Fresh.actual_fresh(
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            rest,
            parent_slot,
            tail,
            reversed,
            site,
            ancestors,
            symbol,
            target_id,
            target_slot,
            identity,
            target_name,
            references,
            found,
            unlimited,
            fresh
          )
        )
      )

def child_ops_context(
  +before: C.Purpose,
  +after: C.Purpose,
  +symbol: String,
  +target: M.Declaration,
  equal: {before == after : C.Purpose}
) -> {
    C.child_operations(
      before,
      C.edge_operations(before, symbol, Some{target}),
      S.declaration_slot(target)
    )
    == C.child_operations(
      after,
      C.edge_operations(after, symbol, Some{target}),
      S.declaration_slot(target)
    )
    : List<&2, M.Op>
  }:
  Equal.cong(
    C.Purpose,
    List<&2, M.Op>,
    purpose =>
      C.child_operations(purpose, C.edge_operations(purpose, symbol, Some{target}), S.declaration_slot(target)),
    before,
    after,
    equal
  )

def advance_with_cursor(+root: M.Declaration, +invocation: C.Global, +reversed_ops: List<&2, M.Op>,
  +before: C.Cursor, +after: C.Cursor, +operations: List<&2, M.Op>, +ghosts: List<&2, J.Ghost>,
  semantic: J.cursor(root, invocation, Step.request(invocation, reversed_ops), after, ghosts),
  step: {C.advance_cursor(before) == C.cursor_ops(after, operations) : C.Step},
  trace: {List.append(&2, M.Op, List.reverse(&2, M.Op, reversed_ops),
    C.preflight_ops(C.global_purpose(invocation), operations))
    == Step.cursor_postfix(C.global_purpose(invocation), ghosts) : List<&2, M.Op>}) ->
  Step.valid(root, invocation, reversed_ops, Step.advance(C.Continue{before}), ghosts):
  %Equal.sym(C.Step, C.advance_cursor(before), C.cursor_ops(after, operations), step) :
    Step.valid(root, invocation, reversed_ops, _, ghosts)
  cursor_ops_valid(root, invocation, reversed_ops, after, operations, ghosts, semantic, trace)

def fresh_output(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +rest: Nat,
  +depth: Nat,
  +parent_slot: Nat,
  +tail: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +target_slot: Nat,
  +identity: String,
  +target_name: String,
  +references: List<&2, M.Reference>,
  trace: {
    List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(
      C.global_purpose(invocation),
      J.Ghost{2n+depth, prefix, subtotal} <> others
    )
    : List<&2, M.Op>
  },
  observed:   {
    C.global_purpose(global)
    == C.global_purpose(invocation)
    : C.Purpose
  } & (J.cursor(
    root,
    invocation,
    Step.request(invocation, reversed_ops),
    J.enter_cursor(
      rest,
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
      },
      M.Declaration{target_slot, identity, target_name, references},
      symbol,
      target_id
    ),
    J.enter_ghosts(
      depth,
      J.Ghost{2n+depth, prefix, subtotal} <> others,
      M.Declaration{target_slot, identity, target_name, references},
      symbol
    )
  ) & {
    C.advance_cursor(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
      }
    )
    == C.cursor_ops(
      J.enter_cursor(
        rest,
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          2n+rest,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
        },
        M.Declaration{target_slot, identity, target_name, references},
        symbol,
        target_id
      ),
      C.child_operations(
        C.global_purpose(global),
        C.edge_operations(
          C.global_purpose(global),
          symbol,
          Some{M.Declaration{target_slot, identity, target_name, references}}
        ),
        target_slot
      )
    )
    : C.Step
  })
) ->
  Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          2n+rest,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
        }
      }
    ),
    J.enter_ghosts(
      depth,
      J.Ghost{2n+depth, prefix, subtotal} <> others,
      M.Declaration{target_slot, identity, target_name, references},
      symbol
    )
  ):
  match observed:
    case (purpose_equal, (semantic, step)):
      advance_with_cursor(
        root,
        invocation,
        reversed_ops,
        C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
        J.enter_cursor(
          rest,
          C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
          M.Declaration{target_slot, identity, target_name, references},
          symbol,
          target_id
        ),
        C.child_operations(
          C.global_purpose(invocation),
          C.edge_operations(
            C.global_purpose(invocation),
            symbol,
            Some{M.Declaration{target_slot, identity, target_name, references}}
          ),
          target_slot
        ),
        J.enter_ghosts(
          depth,
          J.Ghost{2n+depth, prefix, subtotal} <> others,
          M.Declaration{target_slot, identity, target_name, references},
          symbol
        ),
        semantic,
        Equal.trans(
          C.Step,
          C.advance_cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}),
          C.cursor_ops(
            J.enter_cursor(
              rest,
              C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
              M.Declaration{target_slot, identity, target_name, references},
              symbol,
              target_id
            ),
            C.child_operations(
              C.global_purpose(global),
              C.edge_operations(
                C.global_purpose(global),
                symbol,
                Some{M.Declaration{target_slot, identity, target_name, references}}
              ),
              target_slot
            )
          ),
          C.cursor_ops(
            J.enter_cursor(
              rest,
              C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
              M.Declaration{target_slot, identity, target_name, references},
              symbol,
              target_id
            ),
            C.child_operations(
              C.global_purpose(invocation),
              C.edge_operations(
                C.global_purpose(invocation),
                symbol,
                Some{M.Declaration{target_slot, identity, target_name, references}}
              ),
              target_slot
            )
          ),
          step,
          Equal.cong(
            List<&2, M.Op>,
            C.Step,
            operations => C.cursor_ops(
              J.enter_cursor(
                rest,
                C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
            C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
                M.Declaration{target_slot, identity, target_name, references},
                symbol,
                target_id
              ),
              operations
            ),
            C.child_operations(
              C.global_purpose(global),
              C.edge_operations(
                C.global_purpose(global),
                symbol,
                Some{M.Declaration{target_slot, identity, target_name, references}}
              ),
              target_slot
            ),
            C.child_operations(
              C.global_purpose(invocation),
              C.edge_operations(
                C.global_purpose(invocation),
                symbol,
                Some{M.Declaration{target_slot, identity, target_name, references}}
              ),
              target_slot
            ),
            child_ops_context(
              C.global_purpose(global),
              C.global_purpose(invocation),
              symbol,
              M.Declaration{target_slot, identity, target_name, references},
              purpose_equal
            )
          )
        ),
        Equal.trans(
          List<&2, M.Op>,
          List.append(
            &2,
            M.Op,
            List.reverse(&2, M.Op, reversed_ops),
            C.preflight_ops(
              C.global_purpose(invocation),
              C.child_operations(
                C.global_purpose(invocation),
                C.edge_operations(
                  C.global_purpose(invocation),
                  symbol,
                  Some{M.Declaration{target_slot, identity, target_name, references}}
                ),
                target_slot
              )
            )
          ),
          List.append(
            &2,
            M.Op,
            Step.cursor_postfix(C.global_purpose(invocation), J.Ghost{2n+depth, prefix, subtotal} <> others),
            C.preflight_ops(
              C.global_purpose(invocation),
              C.child_operations(
                C.global_purpose(invocation),
                C.edge_operations(
                  C.global_purpose(invocation),
                  symbol,
                  Some{M.Declaration{target_slot, identity, target_name, references}}
                ),
                target_slot
              )
            )
          ),
          Step.cursor_postfix(
            C.global_purpose(invocation),
            J.enter_ghosts(
              depth,
              J.Ghost{2n+depth, prefix, subtotal} <> others,
              M.Declaration{target_slot, identity, target_name, references},
              symbol
            )
          ),
          Equal.cong(
            List<&2, M.Op>,
            List<&2, M.Op>,
            prefix_ops => List.append(
              &2,
              M.Op,
              prefix_ops,
              C.preflight_ops(
                C.global_purpose(invocation),
                C.child_operations(
                  C.global_purpose(invocation),
                  C.edge_operations(
                    C.global_purpose(invocation),
                    symbol,
                    Some{M.Declaration{target_slot, identity, target_name, references}}
                  ),
                  target_slot
                )
              )
            ),
            List.reverse(&2, M.Op, reversed_ops),
            Step.cursor_postfix(C.global_purpose(invocation), J.Ghost{2n+depth, prefix, subtotal} <> others),
            trace
          ),
          fresh_trace(
            C.global_purpose(invocation),
            depth,
            prefix,
            subtotal,
            others,
            symbol,
            M.Declaration{target_slot, identity, target_name, references}
          )
        )
      )

def fresh_continue(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +rest: Nat,
  +depth: Nat,
  +parent_slot: Nat,
  +tail: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +target_slot: Nat,
  +identity: String,
  +target_name: String,
  +references: List<&2, M.Reference>,
  +found: {
    C.lookup(C.global_catalog(global), symbol, target_id)
    == Some{M.Declaration{target_slot, identity, target_name, references}}
    : Maybe<&2, M.Declaration>
  },
  +fresh: {C.contains(identity, expanded) == False{} : Bool},
  +unlimited: {
    Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n)
    == False{}
    : Bool
  },
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
      }
    },
    J.Ghost{2n+depth, prefix, subtotal} <> others
  )
) ->
  Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          2n+rest,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
        }
      }
    ),
    J.enter_ghosts(
      depth,
      J.Ghost{2n+depth, prefix, subtotal} <> others,
      M.Declaration{target_slot, identity, target_name, references},
      symbol
    )
  ):
  match valid:
    case (semantic, trace):
      fresh_output(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        rest,
        depth,
        parent_slot,
        tail,
        reversed,
        site,
        ancestors,
        others,
        prefix,
        subtotal,
        symbol,
        target_id,
        target_slot,
        identity,
        target_name,
        references,
        trace,
        fresh_evidence(
          root,
          invocation,
          Step.request(invocation, reversed_ops),
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          rest,
          depth,
          parent_slot,
          tail,
          reversed,
          site,
          ancestors,
          others,
          prefix,
          subtotal,
          symbol,
          target_id,
          target_slot,
          identity,
          target_name,
          references,
          found,
          fresh,
          unlimited,
          semantic
        )
      )

def fresh_credit_lower(
  +catalog: M.Catalog,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +target_slot: Nat,
  +identity: String,
  +target_name: String,
  +references: List<&2, M.Reference>,
  +expanded: List<&2, String>,
  found: {
    C.lookup(catalog, symbol, target_id)
    == Some{M.Declaration{target_slot, identity, target_name, references}}
    : Maybe<&2, M.Declaration>
  },
  fresh: {C.contains(identity, expanded) == False{} : Bool}
) -> N.le(1n, P.catalog_unvisited(catalog, expanded)):
  N.le_trans(
    1n,
    1n+Nat.add(
      List.length(&2, M.Reference, references),
      P.catalog_unvisited(catalog, identity <> expanded)
    ),
    P.catalog_unvisited(catalog, expanded),
    N.le_add_right(
      1n,
      Nat.add(
        List.length(&2, M.Reference, references),
        P.catalog_unvisited(catalog, identity <> expanded)
      )
    ),
    ChildBudget.core_chosen_drop(
      catalog,
      symbol,
      target_id,
      M.Declaration{target_slot, identity, target_name, references},
      expanded,
      found,
      fresh
    )
  )

def fresh_one_numeric(+prefix: Nat, +unvisited: Nat, credit: N.le(1n, unvisited),
  bound: N.le(1n+Nat.add(prefix, unvisited), 1n)) -> Empty:
  N.internal_false_ne_true(N.le_trans(2n, 1n+Nat.add(prefix, unvisited), 1n,
    N.succ_le_succ(1n, Nat.add(prefix, unvisited),
      N.le_trans(1n, Nat.add(prefix, 1n), Nat.add(prefix, unvisited),
        N.le_add_left(1n, prefix), N.add_le_add_left(1n, unvisited, prefix, credit))), bound))

def fresh_budget_one(
  +root: M.Declaration,
  +invocation: C.Global,
  +request: Nat,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +parent_slot: Nat,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  +target_slot: Nat,
  +identity: String,
  +target_name: String,
  +references: List<&2, M.Reference>,
  found: {
    C.lookup(C.global_catalog(global), symbol, target_id)
    == Some{M.Declaration{target_slot, identity, target_name, references}}
    : Maybe<&2, M.Declaration>
  },
  fresh: {C.contains(identity, expanded) == False{} : Bool},
  valid: J.cursor(
    root,
    invocation,
    request,
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      1n,
      C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) -> Empty:
  match valid:
    case (_, (_, (_, (_, (potential, _))))):
      fresh_one_numeric(
        Nat.add(List.length(&2, M.Reference, pending), P.pending_references(parents)),
        P.catalog_unvisited(C.global_catalog(global), expanded),
        fresh_credit_lower(
          C.global_catalog(global),
          symbol,
          target_id,
          target_slot,
          identity,
          target_name,
          references,
          expanded,
          found,
          fresh
        ),
        potential
      )

def one_reference_depth(+root: M.Declaration, +invocation: C.Global, +request: Nat,
  +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat,
  +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr, +others: List<&2, J.Ghost>,
  valid: J.cursor(root, invocation, request,
    C.Cursor{global, slot, name, expanded, referenced, failure, remaining,
      C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents},
    J.Ghost{1n, prefix, subtotal} <> others)) -> Empty:
  match valid:
    case (_, (_, (_, (_, (_, ((_, (bound, _)), _)))))):
      N.internal_false_ne_true(bound)

def fresh_all_budgets(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +depth: Nat,
  +parent_slot: Nat,
  +tail: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +target_slot: Nat,
  +identity: String,
  +target_name: String,
  +references: List<&2, M.Reference>,
  +found: {
    C.lookup(C.global_catalog(global), symbol, target_id)
    == Some{M.Declaration{target_slot, identity, target_name, references}}
    : Maybe<&2, M.Declaration>
  },
  +fresh: {C.contains(identity, expanded) == False{} : Bool},
  +unlimited: {
    Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n)
    == False{}
    : Bool
  },
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
      }
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) ->
  Exists(
    List<&2, J.Ghost>,
    after => Step.valid(
      root,
      invocation,
      reversed_ops,
      Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining,
      C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}}),
      after
    )
  ):
  match remaining depth:
    case 0n depth:
      Empty.absurd(
        Exists(
          List<&2, J.Ghost>,
          after => Step.valid(
            root,
            invocation,
            reversed_ops,
            Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 0n,
            C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}}),
            after
          )
        ),
        impossible_continue(
          root,
          invocation,
          reversed_ops,
          C.Cursor{global, slot, name, expanded, referenced, failure, 0n,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
          J.Ghost{depth, prefix, subtotal} <> others,
          semantic => zero_reference_cursor(
            root,
            invocation,
            Step.request(invocation, reversed_ops),
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            depth,
            parent_slot,
            M.Named{symbol, target_id},
            tail,
            reversed,
            site,
            ancestors,
            prefix,
            subtotal,
            others,
            semantic
          ),
          valid
        )
      )
    case 1n depth:
      Empty.absurd(
        Exists(
          List<&2, J.Ghost>,
          after => Step.valid(
            root,
            invocation,
            reversed_ops,
            Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n,
            C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}}),
            after
          )
        ),
        impossible_continue(
          root,
          invocation,
          reversed_ops,
          C.Cursor{global, slot, name, expanded, referenced, failure, 1n,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
          J.Ghost{depth, prefix, subtotal} <> others,
          semantic => fresh_budget_one(
            root,
            invocation,
            Step.request(invocation, reversed_ops),
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            parent_slot,
            symbol,
            target_id,
            tail,
            reversed,
            site,
            ancestors,
            depth,
            prefix,
            subtotal,
            others,
            target_slot,
            identity,
            target_name,
            references,
            found,
            fresh,
            semantic
          ),
          valid
        )
      )
    case 2n++rest 0n:
      Empty.absurd(
        Exists(
          List<&2, J.Ghost>,
          after => Step.valid(
            root,
            invocation,
            reversed_ops,
            Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
            C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}}),
            after
          )
        ),
        impossible_continue(
          root,
          invocation,
          reversed_ops,
          C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
          J.Ghost{0n, prefix, subtotal} <> others,
          semantic => zero_reference_depth(
            root,
            invocation,
            Step.request(invocation, reversed_ops),
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            2n+rest,
            parent_slot,
            M.Named{symbol, target_id},
            tail,
            reversed,
            site,
            ancestors,
            prefix,
            subtotal,
            others,
            semantic
          ),
          valid
        )
      )
    case 2n++rest 1n:
      Empty.absurd(
        Exists(
          List<&2, J.Ghost>,
          after => Step.valid(
            root,
            invocation,
            reversed_ops,
            Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
            C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}}),
            after
          )
        ),
        impossible_continue(
          root,
          invocation,
          reversed_ops,
          C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
          J.Ghost{1n, prefix, subtotal} <> others,
          semantic => one_reference_depth(
            root,
            invocation,
            Step.request(invocation, reversed_ops),
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            2n+rest,
            parent_slot,
            M.Named{symbol, target_id},
            tail,
            reversed,
            site,
            ancestors,
            prefix,
            subtotal,
            others,
            semantic
          ),
          valid
        )
      )
    case 2n++rest 2n++depth:
      (
        J.enter_ghosts(
          depth,
          J.Ghost{2n+depth, prefix, subtotal} <> others,
          M.Declaration{target_slot, identity, target_name, references},
          symbol
        ),
        fresh_continue(
          root,
          invocation,
          reversed_ops,
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          rest,
          depth,
          parent_slot,
          tail,
          reversed,
          site,
          ancestors,
          others,
          prefix,
          subtotal,
          symbol,
          target_id,
          target_slot,
          identity,
          target_name,
          references,
          found,
          fresh,
          unlimited,
          valid
        )
      )

def lookup_in_context(+global: C.Global, +invocation: C.Global, +request: Nat,
  +symbol: String, +target_id: Maybe<&2, String>,
  equal: {global == C.global_count(invocation, request) : C.Global}) -> {
    C.lookup(C.global_catalog(global), symbol, target_id)
    == S.lookup(C.global_catalog(invocation), symbol, target_id)
    : Maybe<&2, M.Declaration>
  }:
  Equal.trans(
    Maybe<&2, M.Declaration>,
    C.lookup(C.global_catalog(global), symbol, target_id),
    C.lookup(C.global_catalog(invocation), symbol, target_id),
    S.lookup(C.global_catalog(invocation), symbol, target_id),
    Equal.cong(
      M.Catalog,
      Maybe<&2, M.Declaration>,
      catalog => C.lookup(catalog, symbol, target_id),
      C.global_catalog(global),
      C.global_catalog(invocation),
      Fresh.global_catalog_agrees(global, invocation, request, equal)
    ),
    Fresh.lookup_exact(C.global_catalog(invocation), symbol, target_id)
  )

def recorded_result_exact(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +parent_slot: Nat,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  global_equal: {
    global
    == C.global_count(invocation, Step.request(invocation, reversed_ops))
    : C.Global
  }
) -> {
    R.result(
      M.Named{symbol, target_id},
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.named_recorded(
      S.State{name, expanded, C.reference_names(name, symbol, target_id, referenced), failure},
      C.lookup(C.global_catalog(global), symbol, target_id),
      symbol,
      subtotal,
      _ => _ => S.DepthExhausted{}
    )
    : S.ReferenceResult
  }:
  %Equal.sym(
    S.State,
    S.State{name, expanded, C.reference_names(name, symbol, target_id, referenced), failure},
    S.record_named(S.State{name, expanded, referenced, failure}, symbol, target_id),
    Fresh.record_exact(name, expanded, referenced, failure, symbol, target_id)
  ) : {
    R.result(
      M.Named{symbol, target_id},
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.named_recorded(
      _,
      C.lookup(C.global_catalog(global), symbol, target_id),
      symbol,
      subtotal,
      _ => _ => S.DepthExhausted{}
    )
    : S.ReferenceResult
  }
  %Equal.sym(
    Maybe<&2, M.Declaration>,
    C.lookup(C.global_catalog(global), symbol, target_id),
    S.lookup(C.global_catalog(invocation), symbol, target_id),
    lookup_in_context(
      global,
      invocation,
      Step.request(invocation, reversed_ops),
      symbol,
      target_id,
      global_equal
    )
  ) : {
      R.result(
        M.Named{symbol, target_id},
        S.State{name, expanded, referenced, failure},
        C.global_catalog(invocation),
        subtotal
      )
      == S.named_recorded(
        S.record_named(S.State{name, expanded, referenced, failure}, symbol, target_id),
        _,
        symbol,
        subtotal,
        _ => _ => S.DepthExhausted{}
      )
      : S.ReferenceResult
    }
  {==}

def named_seen_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +parent_slot: Nat,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  +already: Bool,
  +target_slot: Nat,
  +identity: String,
  +target_name: String,
  +references: List<&2, M.Reference>,
  unlimited: {
    Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n)
    == False{}
    : Bool
  },
  found: {
    C.lookup(C.global_catalog(global), symbol, target_id)
    == Some{M.Declaration{target_slot, identity, target_name, references}}
    : Maybe<&2, M.Declaration>
  },
  seen: {C.contains(identity, expanded) == already : Bool},
  equal: {
    R.result(
      M.Named{symbol, target_id},
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.named_seen(
      already,
      S.State{name, expanded, C.reference_names(name, symbol, target_id, referenced), failure},
      symbol,
      M.Declaration{target_slot, identity, target_name, references},
      S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}}),
      _ => _ => S.DepthExhausted{}
    )
    : S.ReferenceResult
  },
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
      }
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) -> Exists(
  List<&2, J.Ghost>,
  after => Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
        }
      }
    ),
    after
  )
):
  match already:
    case True{}: nochild_all_budgets(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      parent_slot,
      M.Named{symbol, target_id},
      pending,
      reversed_refs,
      site,
      parents,
      depth,
      prefix,
      subtotal,
      others,
      name,
      expanded,
      C.reference_names(name, symbol, target_id, referenced),
      failure,
      M.Included{symbol, identity},
      S.edge_total(
        subtotal,
        symbol,
        Some{M.Declaration{target_slot, identity, target_name, references}}
      ),
      equal,
      valid
    )
    case False{}: fresh_all_budgets(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      depth,
      parent_slot,
      pending,
      reversed_refs,
      site,
      parents,
      others,
      prefix,
      subtotal,
      symbol,
      target_id,
      target_slot,
      identity,
      target_name,
      references,
      found,
      seen,
      unlimited,
      valid
    )

def named_target_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +parent_slot: Nat,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  +target: Maybe<&2, M.Declaration>,
  +unlimited: {
    Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n)
    == False{}
    : Bool
  },
  found: {C.lookup(C.global_catalog(global), symbol, target_id) == target : Maybe<&2, M.Declaration>},
  equal: {
    R.result(
      M.Named{symbol, target_id},
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.named_target(
      target,
      S.State{name, expanded, C.reference_names(name, symbol, target_id, referenced), failure},
      symbol,
      S.edge_total(subtotal, symbol, target),
      _ => _ => S.DepthExhausted{}
    )
    : S.ReferenceResult
  },
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
      }
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) -> Exists(
  List<&2, J.Ghost>,
  after => Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
        }
      }
    ),
    after
  )
):
  match target:
    case None{}: nochild_all_budgets(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      parent_slot,
      M.Named{symbol, target_id},
      pending,
      reversed_refs,
      site,
      parents,
      depth,
      prefix,
      subtotal,
      others,
      name,
      expanded,
      C.reference_names(name, symbol, target_id, referenced),
      S.first_failure(failure, M.MissingEvidence{}),
      M.Omitted{symbol, None{}, M.Unresolved{}},
      S.edge_total(subtotal, symbol, None{}),
      equal,
      valid
    )
    case Some{M.Declaration{+target_slot, +identity, +target_name, +references}}:
      named_seen_step(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        parent_slot,
        symbol,
        target_id,
        pending,
        reversed_refs,
        site,
        parents,
        depth,
        prefix,
        subtotal,
        others,
        C.contains(identity, expanded),
        target_slot,
        identity,
        target_name,
        references,
        unlimited,
        found,
        {==},
        (%Equal.sym(
          Bool,
          C.contains(identity, expanded),
          S.contains(identity, expanded),
          Fresh.contains_exact(identity, expanded)
        ) :
          {
            R.result(
              M.Named{symbol, target_id},
              S.State{name, expanded, referenced, failure},
              C.global_catalog(invocation),
              subtotal
            )
            == S.named_seen(
              _,
              S.State{name, expanded, C.reference_names(name, symbol, target_id, referenced), failure},
              symbol,
              M.Declaration{target_slot, identity, target_name, references},
              S.edge_total(
                subtotal,
                symbol,
                Some{M.Declaration{target_slot, identity, target_name, references}}
              ),
              _ => _ => S.DepthExhausted{}
            )
            : S.ReferenceResult
          }
          equal),
        valid
      )

def named_limit_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +parent_slot: Nat,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  +limited: Bool,
  +target: Maybe<&2, M.Declaration>,
  limited_equal: {
    Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n)
    == limited
    : Bool
  },
  found: {C.lookup(C.global_catalog(global), symbol, target_id) == target : Maybe<&2, M.Declaration>},
  equal: {
    R.result(
      M.Named{symbol, target_id},
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.named_limit(
      limited,
      target,
      S.State{name, expanded, C.reference_names(name, symbol, target_id, referenced), failure},
      symbol,
      S.edge_total(subtotal, symbol, target),
      _ => _ => S.DepthExhausted{}
    )
    : S.ReferenceResult
  },
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
      }
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) -> Exists(
  List<&2, J.Ghost>,
  after => Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
        }
      }
    ),
    after
  )
):
  match limited:
    case True{}: nochild_all_budgets(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      parent_slot,
      M.Named{symbol, target_id},
      pending,
      reversed_refs,
      site,
      parents,
      depth,
      prefix,
      subtotal,
      others,
      name,
      expanded,
      C.reference_names(name, symbol, target_id, referenced),
      S.first_failure(failure, M.ReferenceLimit{}),
      M.Omitted{symbol, S.omitted_target(target), M.LimitExceeded{}},
      S.edge_total(subtotal, symbol, target),
      equal,
      valid
    )
    case False{}: named_target_step(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      parent_slot,
      symbol,
      target_id,
      pending,
      reversed_refs,
      site,
      parents,
      depth,
      prefix,
      subtotal,
      others,
      target,
      limited_equal,
      found,
      equal,
      valid
    )

def named_semantic_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +parent_slot: Nat,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  trace: {
    List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(C.global_purpose(invocation), J.Ghost{depth, prefix, subtotal} <> others)
    : List<&2, M.Op>
  },
  valid: J.cursor(
    root,
    invocation,
    Step.request(invocation, reversed_ops),
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) -> Exists(
  List<&2, J.Ghost>,
  after => Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
        }
      }
    ),
    after
  )
):
  match valid:
    case (+global_equal, rest):
      named_limit_step(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        parent_slot,
        symbol,
        target_id,
        pending,
        reversed_refs,
        site,
        parents,
        depth,
        prefix,
        subtotal,
        others,
        Nat.is_gt(
          List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)),
          16n
        ),
        C.lookup(C.global_catalog(global), symbol, target_id),
        {==},
        {==},
        recorded_result_exact(
          root,
          invocation,
          reversed_ops,
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          parent_slot,
          symbol,
          target_id,
          pending,
          reversed_refs,
          site,
          parents,
          depth,
          prefix,
          subtotal,
          others,
          global_equal
        ),
        ((global_equal, rest), trace)
      )

def named_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +parent_slot: Nat,
  +symbol: String,
  +target_id: Maybe<&2, String>,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
      }
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) -> Exists(
  List<&2, J.Ghost>,
  after => Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed_refs, site} <> parents
        }
      }
    ),
    after
  )
):
  match valid:
    case (semantic, trace): named_semantic_step(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      parent_slot,
      symbol,
      target_id,
      pending,
      reversed_refs,
      site,
      parents,
      depth,
      prefix,
      subtotal,
      others,
      trace,
      semantic
    )

def pending_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
      }
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) -> Exists(
    List<&2, J.Ghost>,
    after => Step.valid(
      root,
      invocation,
      reversed_ops,
      Step.advance(
        C.Continue{
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            C.Frame{parent_slot, reference <> pending, reversed_refs, site} <> parents
          }
        }
      ),
      after
    )
  ):
  match reference:
    case M.Named{symbol, target_id}: named_step(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      parent_slot,
      symbol,
      target_id,
      pending,
      reversed_refs,
      site,
      parents,
      depth,
      prefix,
      subtotal,
      others,
      valid
    )
    case M.Unsupported{+symbol}:
      nochild_all_budgets(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        parent_slot,
        M.Unsupported{symbol},
        pending,
        reversed_refs,
        site,
        parents,
        depth,
        prefix,
        subtotal,
        others,
        name,
        expanded,
        referenced,
        S.first_failure(failure, M.UnsupportedReference{}),
        M.Omitted{symbol, None{}, M.UnsupportedSyntax{}},
        S.edge_total(subtotal, symbol, None{}),
        {==},
        valid
      )

def return_trace(+purpose: C.Purpose, +child_depth: Nat, +parent_depth: Nat,
  +child_prefix: List<&2, M.ReferencePlan>, +parent_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr, +parent_subtotal: S.BytesExpr, +others: List<&2, J.Ghost>,
  +child_slot: Nat, +symbol: String) -> {
  List.append(
    &2,
    M.Op,
    Step.cursor_postfix(
      purpose,
      J.Ghost{
        child_depth,
        child_prefix,
        child_subtotal
      } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
    ),
    C.preflight_ops(purpose, C.finish_operations(purpose))
  )
    == Step.cursor_postfix(
      purpose,
      J.Ghost{
        parent_depth,
        List.append(
          &2,
          M.ReferencePlan,
          parent_prefix,
          [K.returned_reference(child_slot, child_prefix, symbol)]
        ),
        S.Add{parent_subtotal, child_subtotal}
      } <> others
    )
    : List<&2, M.Op>
}:
  match purpose:
    case C.Trees{}: {==}
    case C.Outcomes{}: {==}
    case C.Preflight{}:
      Equal.trans(
        List<&2, M.Op>,
        List.append(
          &2,
          M.Op,
          List.append(
            &2,
            M.Op,
            List.append(&2, M.Op, Step.spine_postfix(others), S.postfix(parent_subtotal)),
            S.postfix(child_subtotal)
          ),
          [M.Add{}]
        ),
        List.append(
          &2,
          M.Op,
          List.append(&2, M.Op, Step.spine_postfix(others), S.postfix(parent_subtotal)),
          List.append(&2, M.Op, S.postfix(child_subtotal), [M.Add{}])
        ),
        List.append(
          &2,
          M.Op,
          Step.spine_postfix(others),
          List.append(
            &2,
            M.Op,
            S.postfix(parent_subtotal),
            List.append(&2, M.Op, S.postfix(child_subtotal), [M.Add{}])
          )
        ),
        L.append_assoc(
          &2,
          M.Op,
          List.append(&2, M.Op, Step.spine_postfix(others), S.postfix(parent_subtotal)),
          S.postfix(child_subtotal),
          [M.Add{}]
        ),
        L.append_assoc(
          &2,
          M.Op,
          Step.spine_postfix(others),
          S.postfix(parent_subtotal),
          List.append(&2, M.Op, S.postfix(child_subtotal), [M.Add{}])
        )
      )

def copy_reference_equation(+left: List<&2, M.ReferencePlan>, +right: List<&2, M.ReferencePlan>,
  +equal: {left == right : List<&2, M.ReferencePlan>}) ->
  {left == right : List<&2, M.ReferencePlan>} & {left == right : List<&2, M.ReferencePlan>}:
  (equal, equal)

def copy_accumulator(
  +purpose: C.Purpose,
  +reversed: List<&2, M.ReferencePlan>,
  +prefix: List<&2, M.ReferencePlan>,
  valid: K.accumulator_relation(purpose, reversed, prefix)
) ->
  K.accumulator_relation(purpose, reversed, prefix) & K.accumulator_relation(
    purpose,
    reversed,
    prefix
  ):
  match purpose:
    case C.Trees{}: copy_reference_equation(
      List.reverse(&2, M.ReferencePlan, reversed),
      prefix,
      valid
    )
    case C.Outcomes{}: copy_reference_equation(reversed, [], valid)
    case C.Preflight{}: copy_reference_equation(reversed, [], valid)

def return_semantic(
  +root: M.Declaration,
  +purpose: C.Purpose,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +state: S.State,
  +catalog: M.Catalog,
  +symbol: String,
  parent_accumulator: K.accumulator_relation(purpose, parent_reversed, parent_prefix),
  valid: J.semantic(
    C.Frame{
      child_slot,
      [],
      child_reversed,
      Some{symbol}
    } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors,
    J.Ghost{
      1n+child_depth,
      child_prefix,
      child_subtotal
    } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others,
    root,
    catalog,
    purpose,
    state
  )
) ->
  J.semantic(
    K.returned_frame(
      purpose,
      C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
      child_slot,
      child_reversed,
      symbol
    ) <> ancestors,
    J.Ghost{
      parent_depth,
      List.append(
        &2,
        M.ReferencePlan,
        parent_prefix,
        [K.returned_reference(child_slot, child_prefix, symbol)]
      ),
      S.Add{parent_subtotal, child_subtotal}
    } <> others,
    root,
    catalog,
    purpose,
    state
  ):
  match valid:
    case (child_accumulator, semantic):
      %Fresh.enclosing_own_fields(
        parent_slot,
        parent_site,
        parent_pending,
        parent_pending,
        parent_reversed,
        C.keep_reference(
          purpose,
          K.returned_reference(
            child_slot,
            List.reverse(&2, M.ReferencePlan, child_reversed),
            symbol
          ),
          parent_reversed
        ),
        ancestors,
        others,
        parent_depth,
        parent_depth,
        parent_prefix,
        List.append(
          &2,
          M.ReferencePlan,
          parent_prefix,
          [K.returned_reference(child_slot, child_prefix, symbol)]
        ),
        parent_subtotal,
        S.Add{parent_subtotal, child_subtotal},
        root,
        catalog,
        K.completed_prefix(
          List.append(
            &2,
            M.ReferencePlan,
            parent_prefix,
            [K.returned_reference(child_slot, child_prefix, symbol)]
          ),
          S.as_references(
            S.interpret(
              parent_depth,
              S.ReferencesRequest{parent_pending, state, S.Add{parent_subtotal, child_subtotal}},
              catalog
            )
          )
        )
      ) :
        K.accumulator_relation(
          purpose,
          C.keep_reference(
            purpose,
            K.returned_reference(
              child_slot,
              List.reverse(&2, M.ReferencePlan, child_reversed),
              symbol
            ),
            parent_reversed
          ),
          List.append(
            &2,
            M.ReferencePlan,
            parent_prefix,
            [K.returned_reference(child_slot, child_prefix, symbol)]
          )
        ) & _
      (
        Return.returned_accumulator(
          purpose,
          child_slot,
          child_reversed,
          child_prefix,
          parent_reversed,
          parent_prefix,
          symbol,
          child_accumulator,
          parent_accumulator
        ),
        Return.returned_semantics(
          child_slot,
          child_prefix,
          child_subtotal,
          state,
          catalog,
          parent_pending,
          parent_prefix,
          parent_subtotal,
          parent_depth,
          symbol,
          J.enclosing(
            C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors,
            J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others,
            root,
            catalog
          ),
          semantic
        )
      )

def return_bounds(
  +root: M.Declaration,
  +purpose: C.Purpose,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +state: S.State,
  +catalog: M.Catalog,
  +symbol: String,
  +expanded: List<&2, String>,
  child_accumulator: K.accumulator_relation(purpose, child_reversed, child_prefix),
  valid: J.bounds(
    C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors,
    J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others,
    catalog,
    purpose,
    expanded
  )
) ->
  J.bounds(
    K.returned_frame(
      purpose,
      C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
      child_slot,
      child_reversed,
      symbol
    ) <> ancestors,
    J.Ghost{
      parent_depth,
      List.append(
        &2,
        M.ReferencePlan,
        parent_prefix,
        [K.returned_reference(child_slot, child_prefix, symbol)]
      ),
      S.Add{parent_subtotal, child_subtotal}
    } <> others,
    catalog,
    purpose,
    expanded
  ):
  match valid:
    case (parent_accumulator, (bound, tail)):
      (
        Return.returned_accumulator(
          purpose,
          child_slot,
          child_reversed,
          child_prefix,
          parent_reversed,
          parent_prefix,
          symbol,
          child_accumulator,
          parent_accumulator
        ),
        (bound, tail)
      )

def return_with_accumulators(
  +root: M.Declaration,
  +invocation: C.Global,
  +request: Nat,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +symbol: String,
  global_equal: {global == C.global_count(invocation, request) : C.Global},
  slot_equal: {slot == S.declaration_slot(root) : Nat},
  name_equal: {name == S.declaration_name(root) : String},
  shape: {
    J.shape(
      C.Frame{
        child_slot,
        [],
        child_reversed,
        Some{symbol}
      } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors,
      J.Ghost{
        1n+child_depth,
        child_prefix,
        child_subtotal
      } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others,
      S.declaration_slot(root)
    )
    == True{}
    : Bool
  },
  potential: {
    P.cursor_valid(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{
          child_slot,
          [],
          child_reversed,
          Some{symbol}
        } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
      }
    )
    == True{}
    : Bool
  },
  child_accumulator: K.accumulator_relation(
    C.global_purpose(invocation),
    child_reversed,
    child_prefix
  ),
  parent_bound: N.le(
    W.specification_required(parent_pending, C.global_catalog(invocation), expanded),
    parent_depth
  ),
  ancestor_bounds: J.bounds(
    ancestors,
    others,
    C.global_catalog(invocation),
    C.global_purpose(invocation),
    expanded
  ),
  semantic: J.semantic(
    C.Frame{
      child_slot,
      [],
      child_reversed,
      Some{symbol}
    } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors,
    J.Ghost{
      1n+child_depth,
      child_prefix,
      child_subtotal
    } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others,
    root,
    C.global_catalog(invocation),
    C.global_purpose(invocation),
    S.State{name, expanded, referenced, failure}
  ),
  accumulators: K.accumulator_relation(
    C.global_purpose(invocation),
    parent_reversed,
    parent_prefix
  ) & K.accumulator_relation(C.global_purpose(invocation), parent_reversed, parent_prefix)
) -> J.cursor(
      root,
      invocation,
      request,
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        K.returned_frame(
          C.global_purpose(invocation),
          C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
          child_slot,
          child_reversed,
          symbol
        ) <> ancestors
      },
      J.Ghost{
        parent_depth,
        List.append(
          &2,
          M.ReferencePlan,
          parent_prefix,
          [K.returned_reference(child_slot, child_prefix, symbol)]
        ),
        S.Add{parent_subtotal, child_subtotal}
      } <> others
    ):
  match accumulators:
    case (bounds_accumulator, semantic_accumulator):
      (
        global_equal,
        (
          slot_equal,
          (
            name_equal,
            (
              (%Fresh.shape_own_fields(
                parent_slot,
                parent_site,
                parent_pending,
                parent_pending,
                parent_reversed,
                C.keep_reference(
                  C.global_purpose(invocation),
                  K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol),
                  parent_reversed
                ),
                ancestors,
                others,
                parent_depth,
                parent_depth,
                parent_prefix,
                List.append(
                  &2,
                  M.ReferencePlan,
                  parent_prefix,
                  [K.returned_reference(child_slot, child_prefix, symbol)]
                ),
                parent_subtotal,
                S.Add{parent_subtotal, child_subtotal},
                S.declaration_slot(root)
              ) : {_ == True{} : Bool} shape),
              (
                potential,
                (
                  return_bounds(
                    root,
                    C.global_purpose(invocation),
                    child_slot,
                    child_reversed,
                    child_prefix,
                    child_subtotal,
                    child_depth,
                    parent_slot,
                    parent_pending,
                    parent_reversed,
                    parent_site,
                    parent_prefix,
                    parent_subtotal,
                    parent_depth,
                    ancestors,
                    others,
                    S.State{name, expanded, referenced, failure},
                    C.global_catalog(invocation),
                    symbol,
                    expanded,
                    child_accumulator,
                    (bounds_accumulator, (parent_bound, ancestor_bounds))
                  ),
                  return_semantic(
                    root,
                    C.global_purpose(invocation),
                    child_slot,
                    child_reversed,
                    child_prefix,
                    child_subtotal,
                    child_depth,
                    parent_slot,
                    parent_pending,
                    parent_reversed,
                    parent_site,
                    parent_prefix,
                    parent_subtotal,
                    parent_depth,
                    ancestors,
                    others,
                    S.State{name, expanded, referenced, failure},
                    C.global_catalog(invocation),
                    symbol,
                    semantic_accumulator,
                    semantic
                  )
                )
              )
            )
          )
        )
      )

def reconstruct_return(
  +root: M.Declaration,
  +invocation: C.Global,
  +request: Nat,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +symbol: String,
  valid: J.cursor(
    root,
    invocation,
    request,
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      C.Frame{
        child_slot,
        [],
        child_reversed,
        Some{symbol}
      } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
    },
    J.Ghost{
      1n+child_depth,
      child_prefix,
      child_subtotal
    } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
  )
) -> J.cursor(
    root,
    invocation,
    request,
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      K.returned_frame(
        C.global_purpose(invocation),
        C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
        child_slot,
        child_reversed,
        symbol
      ) <> ancestors
    },
    J.Ghost{
      parent_depth,
      List.append(
        &2,
        M.ReferencePlan,
        parent_prefix,
        [K.returned_reference(child_slot, child_prefix, symbol)]
      ),
      S.Add{parent_subtotal, child_subtotal}
    } <> others
  ):
  match valid:
    case (
      global_equal,
      (
        slot_equal,
        (
          name_equal,
          (
            shape,
            (
              potential,
              (
                (child_accumulator, (_, (parent_accumulator, (parent_bound, ancestor_bounds)))),
                semantic
              )
            )
          )
        )
      )
    ):
      return_with_accumulators(
        root,
        invocation,
        request,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        child_slot,
        child_reversed,
        child_prefix,
        child_subtotal,
        child_depth,
        parent_slot,
        parent_pending,
        parent_reversed,
        parent_site,
        parent_prefix,
        parent_subtotal,
        parent_depth,
        ancestors,
        others,
        symbol,
        global_equal,
        slot_equal,
        name_equal,
        shape,
        potential,
        child_accumulator,
        parent_bound,
        ancestor_bounds,
        semantic,
        copy_accumulator(
          C.global_purpose(invocation),
          parent_reversed,
          parent_prefix,
          parent_accumulator
        )
      )

def return_actual_step(
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +symbol: String,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>
) -> {
    C.advance_cursor(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{
          child_slot,
          [],
          child_reversed,
          Some{symbol}
        } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
      }
    )
    == C.cursor_ops(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        K.returned_frame(
          C.global_purpose(global),
          C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
          child_slot,
          child_reversed,
          symbol
        ) <> ancestors
      },
      C.finish_operations(C.global_purpose(global))
    )
    : C.Step
  }:
  match global:
    case C.Global{catalog, purpose, pending, outcomes, request}:
      ReturnLaws.child_return_step(
        catalog,
        purpose,
        pending,
        outcomes,
        request,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        child_slot,
        child_reversed,
        symbol,
        parent_slot,
        parent_pending,
        parent_reversed,
        parent_site,
        ancestors
      )

def return_evidence(
  +root: M.Declaration,
  +invocation: C.Global,
  +request: Nat,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +symbol: String,
  valid: J.cursor(
    root,
    invocation,
    request,
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      C.Frame{
        child_slot,
        [],
        child_reversed,
        Some{symbol}
      } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
    },
    J.Ghost{
      1n+child_depth,
      child_prefix,
      child_subtotal
    } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
  )
) ->
  J.cursor(
    root,
    invocation,
    request,
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      K.returned_frame(
        C.global_purpose(invocation),
        C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
        child_slot,
        child_reversed,
        symbol
      ) <> ancestors
    },
    J.Ghost{
      parent_depth,
      List.append(
        &2,
        M.ReferencePlan,
        parent_prefix,
        [K.returned_reference(child_slot, child_prefix, symbol)]
      ),
      S.Add{parent_subtotal, child_subtotal}
    } <> others
  )
  & {
    C.advance_cursor(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{
          child_slot,
          [],
          child_reversed,
          Some{symbol}
        } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
      }
    )
    == C.cursor_ops(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        K.returned_frame(
          C.global_purpose(invocation),
          C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
          child_slot,
          child_reversed,
          symbol
        ) <> ancestors
      },
      C.finish_operations(C.global_purpose(invocation))
    )
    : C.Step
  }:
  match valid:
    case (+global_equal, rest):
      (
        reconstruct_return(
          root,
          invocation,
          request,
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          child_slot,
          child_reversed,
          child_prefix,
          child_subtotal,
          child_depth,
          parent_slot,
          parent_pending,
          parent_reversed,
          parent_site,
          parent_prefix,
          parent_subtotal,
          parent_depth,
          ancestors,
          others,
          symbol,
          (global_equal, rest)
        ),
        Equal.trans(
          C.Step,
          C.advance_cursor(
            C.Cursor{
              global,
              slot,
              name,
              expanded,
              referenced,
              failure,
              remaining,
              C.Frame{child_slot, [], child_reversed, Some{symbol}} <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
            }
          ),
          C.cursor_ops(
            C.Cursor{
              global,
              slot,
              name,
              expanded,
              referenced,
              failure,
              remaining,
              K.returned_frame(
                C.global_purpose(global),
                C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
                child_slot,
                child_reversed,
                symbol
              ) <> ancestors
            },
            C.finish_operations(C.global_purpose(global))
          ),
          C.cursor_ops(
            C.Cursor{
              global,
              slot,
              name,
              expanded,
              referenced,
              failure,
              remaining,
              K.returned_frame(
                C.global_purpose(invocation),
                C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
                child_slot,
                child_reversed,
                symbol
              ) <> ancestors
            },
            C.finish_operations(C.global_purpose(invocation))
          ),
          return_actual_step(global, slot, name, expanded, referenced, failure, remaining, child_slot, child_reversed,
            symbol, parent_slot, parent_pending, parent_reversed, parent_site, ancestors),
          Equal.cong(
            C.Purpose,
            C.Step,
            purpose => C.cursor_ops(
              C.Cursor{
                global,
                slot,
                name,
                expanded,
                referenced,
                failure,
                remaining,
                K.returned_frame(
                  purpose,
                  C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
                  child_slot,
                  child_reversed,
                  symbol
                ) <> ancestors
              },
              C.finish_operations(purpose)
            ),
            C.global_purpose(global),
            C.global_purpose(invocation),
            ReferenceProof.global_purpose_agrees(global, invocation, request, global_equal)
          )
        )
      )

def return_output(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +symbol: String,
  trace: {
    List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(
      C.global_purpose(invocation),
      J.Ghost{
        1n+child_depth,
        child_prefix,
        child_subtotal
      } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
    )
    : List<&2, M.Op>
  },
  observed: J.cursor(
    root,
    invocation,
    Step.request(invocation, reversed_ops),
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      K.returned_frame(
        C.global_purpose(invocation),
        C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
        child_slot,
        child_reversed,
        symbol
      ) <> ancestors
    },
    J.Ghost{
      parent_depth,
      List.append(
        &2,
        M.ReferencePlan,
        parent_prefix,
        [K.returned_reference(child_slot, child_prefix, symbol)]
      ),
      S.Add{parent_subtotal, child_subtotal}
    } <> others
  ) & {
    C.advance_cursor(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{
          child_slot,
          [],
          child_reversed,
          Some{symbol}
        } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
      }
    )
    == C.cursor_ops(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        K.returned_frame(
          C.global_purpose(invocation),
          C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
          child_slot,
          child_reversed,
          symbol
        ) <> ancestors
      },
      C.finish_operations(C.global_purpose(invocation))
    )
    : C.Step
  }
) -> Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{
            child_slot,
            [],
            child_reversed,
            Some{symbol}
          } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
        }
      }
    ),
    J.Ghost{
      parent_depth,
      List.append(
        &2,
        M.ReferencePlan,
        parent_prefix,
        [K.returned_reference(child_slot, child_prefix, symbol)]
      ),
      S.Add{parent_subtotal, child_subtotal}
    } <> others
  ):
  match observed:
    case (semantic, step):
      advance_with_cursor(
        root,
        invocation,
        reversed_ops,
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{child_slot, [], child_reversed, Some{symbol}} <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
        },
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          K.returned_frame(
            C.global_purpose(invocation),
            C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
            child_slot,
            child_reversed,
            symbol
          ) <> ancestors
        },
        C.finish_operations(C.global_purpose(invocation)),
        J.Ghost{
          parent_depth,
          List.append(
            &2,
            M.ReferencePlan,
            parent_prefix,
            [K.returned_reference(child_slot, child_prefix, symbol)]
          ),
          S.Add{parent_subtotal, child_subtotal}
        } <> others,
        semantic,
        step,
        Equal.trans(
          List<&2, M.Op>,
          List.append(
            &2,
            M.Op,
            List.reverse(&2, M.Op, reversed_ops),
            C.preflight_ops(C.global_purpose(invocation), C.finish_operations(C.global_purpose(invocation)))
          ),
          List.append(
            &2,
            M.Op,
            Step.cursor_postfix(
              C.global_purpose(invocation),
              J.Ghost{1n+child_depth, child_prefix, child_subtotal} <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
            ),
            C.preflight_ops(C.global_purpose(invocation), C.finish_operations(C.global_purpose(invocation)))
          ),
          Step.cursor_postfix(
            C.global_purpose(invocation),
            J.Ghost{
              parent_depth,
              List.append(
                &2,
                M.ReferencePlan,
                parent_prefix,
                [K.returned_reference(child_slot, child_prefix, symbol)]
              ),
              S.Add{parent_subtotal, child_subtotal}
            } <> others
          ),
          Equal.cong(
            List<&2, M.Op>,
            List<&2, M.Op>,
            before => List.append(
              &2,
              M.Op,
              before,
              C.preflight_ops(C.global_purpose(invocation), C.finish_operations(C.global_purpose(invocation)))
            ),
            List.reverse(&2, M.Op, reversed_ops),
            Step.cursor_postfix(
              C.global_purpose(invocation),
              J.Ghost{1n+child_depth, child_prefix, child_subtotal} <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
            ),
            trace
          ),
          return_trace(
            C.global_purpose(invocation),
            1n+child_depth,
            parent_depth,
            child_prefix,
            parent_prefix,
            child_subtotal,
            parent_subtotal,
            others,
            child_slot,
            symbol
          )
        )
      )

def return_continue(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +symbol: String,
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{
          child_slot,
          [],
          child_reversed,
          Some{symbol}
        } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
      }
    },
    J.Ghost{
      1n+child_depth,
      child_prefix,
      child_subtotal
    } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
  )
) -> Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{
            child_slot,
            [],
            child_reversed,
            Some{symbol}
          } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
        }
      }
    ),
    J.Ghost{
      parent_depth,
      List.append(
        &2,
        M.ReferencePlan,
        parent_prefix,
        [K.returned_reference(child_slot, child_prefix, symbol)]
      ),
      S.Add{parent_subtotal, child_subtotal}
    } <> others
  ):
  match valid:
    case (semantic, trace):
      return_output(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        child_slot,
        child_reversed,
        child_prefix,
        child_subtotal,
        child_depth,
        parent_slot,
        parent_pending,
        parent_reversed,
        parent_site,
        parent_prefix,
        parent_subtotal,
        parent_depth,
        ancestors,
        others,
        symbol,
        trace,
        return_evidence(
          root,
          invocation,
          Step.request(invocation, reversed_ops),
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          child_slot,
          child_reversed,
          child_prefix,
          child_subtotal,
          child_depth,
          parent_slot,
          parent_pending,
          parent_reversed,
          parent_site,
          parent_prefix,
          parent_subtotal,
          parent_depth,
          ancestors,
          others,
          symbol,
          semantic
        )
      )

def zero_return_depth(
  +root: M.Declaration,
  +invocation: C.Global,
  +request: Nat,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +symbol: String,
  valid: J.cursor(
    root,
    invocation,
    request,
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      C.Frame{
        child_slot,
        [],
        child_reversed,
        Some{symbol}
      } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
    },
    J.Ghost{
      0n,
      child_prefix,
      child_subtotal
    } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
  )
) -> Empty:
  match valid:
    case (_, (_, (_, (_, (_, ((_, (bound, _)), _)))))):
      N.internal_false_ne_true(bound)

def return_all_depths(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +child_slot: Nat,
  +child_reversed: List<&2, M.ReferencePlan>,
  +child_prefix: List<&2, M.ReferencePlan>,
  +child_subtotal: S.BytesExpr,
  +child_depth: Nat,
  +parent_slot: Nat,
  +parent_pending: List<&2, M.Reference>,
  +parent_reversed: List<&2, M.ReferencePlan>,
  +parent_site: Maybe<&2, String>,
  +parent_prefix: List<&2, M.ReferencePlan>,
  +parent_subtotal: S.BytesExpr,
  +parent_depth: Nat,
  +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>,
  +symbol: String,
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{
          child_slot,
          [],
          child_reversed,
          Some{symbol}
        } <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
      }
    },
    J.Ghost{
      child_depth,
      child_prefix,
      child_subtotal
    } <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others
  )
) -> Exists(
  List<&2, J.Ghost>,
  after => Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          C.Frame{child_slot, [], child_reversed, Some{symbol}} <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
        }
      }
    ),
    after
  )
):
  match child_depth:
    case 0n:
      Empty.absurd(
        Exists(
          List<&2, J.Ghost>,
          after => Step.valid(
            root,
            invocation,
            reversed_ops,
            Step.advance(
              C.Continue{
                C.Cursor{
                  global,
                  slot,
                  name,
                  expanded,
                  referenced,
                  failure,
                  remaining,
                  C.Frame{child_slot, [], child_reversed, Some{symbol}} <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
                }
              }
            ),
            after
          )
        ),
        impossible_continue(
          root,
          invocation,
          reversed_ops,
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            C.Frame{child_slot, [], child_reversed, Some{symbol}} <> C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
          },
          J.Ghost{0n, child_prefix, child_subtotal} <> J.Ghost{parent_depth, parent_prefix, parent_subtotal} <> others,
          semantic => zero_return_depth(
            root,
            invocation,
            Step.request(invocation, reversed_ops),
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            child_slot,
            child_reversed,
            child_prefix,
            child_subtotal,
            0n,
            parent_slot,
            parent_pending,
            parent_reversed,
            parent_site,
            parent_prefix,
            parent_subtotal,
            parent_depth,
            ancestors,
            others,
            symbol,
            semantic
          ),
          valid
        )
      )
    case 1n++child_depth:
      (
        J.Ghost{
          parent_depth,
          List.append(
            &2,
            M.ReferencePlan,
            parent_prefix,
            [K.returned_reference(child_slot, child_prefix, symbol)]
          ),
          S.Add{parent_subtotal, child_subtotal}
        } <> others,
        return_continue(
          root,
          invocation,
          reversed_ops,
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          child_slot,
          child_reversed,
          child_prefix,
          child_subtotal,
          child_depth,
          parent_slot,
          parent_pending,
          parent_reversed,
          parent_site,
          parent_prefix,
          parent_subtotal,
          parent_depth,
          ancestors,
          others,
          symbol,
          valid
        )
      )

def root_result(
  +root: M.Declaration,
  +catalog: M.Catalog,
  +purpose: C.Purpose,
  +state: S.State,
  +frame_slot: Nat,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +depth: Nat,
  valid: J.semantic(
    [C.Frame{frame_slot, [], reversed_refs, None{}}],
    [J.Ghost{1n+depth, prefix, subtotal}],
    root,
    catalog,
    purpose,
    state
  )
) -> {
      S.NodeResult{state, M.NodePlan{S.declaration_slot(root), prefix}, subtotal}
      == S.analyze(root, catalog)
      : S.NodeResult
    }:
  match valid:
    case (_, result):
      %Return.completed_child(prefix, state, subtotal) :
        {S.node_result(_, S.declaration_slot(root)) == S.analyze(root, catalog) : S.NodeResult}
      result

def root_trace(+purpose: C.Purpose, +reversed_ops: List<&2, M.Op>, +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  trace: {List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(purpose, [J.Ghost{depth, prefix, subtotal}]) : List<&2, M.Op>}) -> {
  List.append(&2, M.Op, List.reverse(&2, M.Op, reversed_ops), C.finish_operations(purpose))
    == Root.expected_operations(purpose, subtotal) : List<&2, M.Op>
}:
  match purpose:
    case C.Preflight{}: Equal.cong(
      List<&2, M.Op>,
      List<&2, M.Op>,
      before => List.append(&2, M.Op, before, [M.Add{}]),
      List.reverse(&2, M.Op, reversed_ops),
      S.postfix(subtotal),
      trace
    )
    case C.Trees{}: Equal.cong(
      List<&2, M.Op>,
      List<&2, M.Op>,
      before => List.append(&2, M.Op, before, []),
      List.reverse(&2, M.Op, reversed_ops),
      [],
      trace
    )
    case C.Outcomes{}: Equal.cong(
      List<&2, M.Op>,
      List<&2, M.Op>,
      before => List.append(&2, M.Op, before, []),
      List.reverse(&2, M.Op, reversed_ops),
      [],
      trace
    )

def root_saved(
  +purpose: C.Purpose,
  +slot: Nat,
  +failure: Maybe<&2, M.Failure>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +prefix: List<&2, M.ReferencePlan>,
  +outcomes: List<&2, M.Outcome>,
  accumulator: K.accumulator_relation(purpose, reversed_refs, prefix)
) -> {
    C.save_outcome(
      purpose,
      M.Outcome{slot, failure, C.outcome_tree(purpose, slot, reversed_refs)},
      outcomes
    )
    == Root.expected_prefix(purpose, M.NodePlan{slot, prefix}, failure, outcomes)
    : List<&2, M.Outcome>
  }:
  match purpose:
    case C.Preflight{}: {==}
    case C.Outcomes{}: {==}
    case C.Trees{}:
      %accumulator : {
        C.save_outcome(
          C.Trees{},
          M.Outcome{slot, failure, C.outcome_tree(C.Trees{}, slot, reversed_refs)},
          outcomes
        )
        == Root.expected_prefix(C.Trees{}, M.NodePlan{slot, _}, failure, outcomes)
        : List<&2, M.Outcome>
      }
      {==}

def root_deferred(
  +root: M.Declaration,
  +catalog: M.Catalog,
  +purpose: C.Purpose,
  +pending: List<&2, M.Declaration>,
  +outcomes: List<&2, M.Outcome>,
  +initial_request: Nat,
  +stored_request: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +planned: List<&2, M.Op>,
  result: {
    S.NodeResult{
      S.State{name, expanded, referenced, failure},
      M.NodePlan{S.declaration_slot(root), prefix},
      subtotal
    }
    == S.analyze(root, catalog)
    : S.NodeResult
  },
  accumulator: K.accumulator_relation(purpose, reversed_refs, prefix),
  trace: {planned == Root.expected_operations(purpose, subtotal) : List<&2, M.Op>}
) ->
  Step.deferred(
    C.RootNext{
      C.Global{
        catalog,
        purpose,
        pending,
        C.save_outcome(
          purpose,
          M.Outcome{
            S.declaration_slot(root),
            failure,
            C.outcome_tree(purpose, S.declaration_slot(root), reversed_refs)
          },
          outcomes
        ),
        stored_request
      }
    },
    root,
    C.Global{catalog, purpose, pending, outcomes, initial_request},
    [],
    planned
  ):
  %Equal.sym(List<&2, M.Op>, planned, Root.expected_operations(purpose, subtotal), trace) :
    Step.deferred(
      C.RootNext{
        C.Global{
          catalog,
          purpose,
          pending,
          C.save_outcome(
            purpose,
            M.Outcome{
              S.declaration_slot(root),
              failure,
              C.outcome_tree(purpose, S.declaration_slot(root), reversed_refs)
            },
            outcomes
          ),
          stored_request
        }
      },
      root,
      C.Global{catalog, purpose, pending, outcomes, initial_request},
      [],
      _
    )
  %result : Root.correspondence(
    Root.RootDone{
      C.global_count(
        C.Global{
          catalog,
          purpose,
          pending,
          C.save_outcome(
            purpose,
            M.Outcome{
              S.declaration_slot(root),
              failure,
              C.outcome_tree(purpose, S.declaration_slot(root), reversed_refs)
            },
            outcomes
          ),
          stored_request
        },
        Nat.add(initial_request, List.length(&2, M.Op, Root.expected_operations(purpose, subtotal)))
      ),
      List.reverse(&2, M.Op, Root.expected_operations(purpose, subtotal))
    },
    Root.expectation(_, catalog, purpose, pending, outcomes, initial_request)
  )
  (
    Equal.cong(
      List<&2, M.Outcome>,
      C.Global,
      items => C.Global{
        catalog,
        purpose,
        pending,
        items,
        Nat.add(initial_request, List.length(&2, M.Op, Root.expected_operations(purpose, subtotal)))
      },
      C.save_outcome(
        purpose,
        M.Outcome{
          S.declaration_slot(root),
          failure,
          C.outcome_tree(purpose, S.declaration_slot(root), reversed_refs)
        },
        outcomes
      ),
      Root.expected_prefix(purpose, M.NodePlan{S.declaration_slot(root), prefix}, failure, outcomes),
      root_saved(purpose, S.declaration_slot(root), failure, reversed_refs, prefix, outcomes, accumulator)
    ),
    Reverse.reverse_reverse(&2, M.Op, Root.expected_operations(purpose, subtotal))
  )

def root_schedule(
  +root: M.Declaration,
  +catalog: M.Catalog,
  +purpose: C.Purpose,
  +pending: List<&2, M.Declaration>,
  +outcomes: List<&2, M.Outcome>,
  +initial_request: Nat,
  +reversed_ops: List<&2, M.Op>,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  result: {
    S.NodeResult{
      S.State{name, expanded, referenced, failure},
      M.NodePlan{S.declaration_slot(root), prefix},
      subtotal
    }
    == S.analyze(root, catalog)
    : S.NodeResult
  },
  accumulator: K.accumulator_relation(purpose, reversed_refs, prefix),
  trace: {
    List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(purpose, [J.Ghost{depth, prefix, subtotal}])
    : List<&2, M.Op>
  }
) ->
  Step.valid(
    root,
    C.Global{catalog, purpose, pending, outcomes, initial_request},
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          C.global_count(
            C.Global{catalog, purpose, pending, outcomes, initial_request},
            Step.request(
              C.Global{catalog, purpose, pending, outcomes, initial_request},
              reversed_ops
            )
          ),
          S.declaration_slot(root),
          name,
          expanded,
          referenced,
          failure,
          remaining,
          [C.Frame{frame_slot, [], reversed_refs, None{}}]
        }
      }
    ),
    []
  ):
  schedule_valid(
    root,
    C.Global{catalog, purpose, pending, outcomes, initial_request},
    reversed_ops,
    C.finish_operations(purpose),
    C.RootNext{
      C.Global{
        catalog,
        purpose,
        pending,
        C.save_outcome(
          purpose,
          M.Outcome{
            S.declaration_slot(root),
            failure,
            C.outcome_tree(purpose, S.declaration_slot(root), reversed_refs)
          },
          outcomes
        ),
        Step.request(C.Global{catalog, purpose, pending, outcomes, initial_request}, reversed_ops)
      }
    },
    [],
    Step.request(C.Global{catalog, purpose, pending, outcomes, initial_request}, reversed_ops),
    {==},
    root_deferred(
      root,
      catalog,
      purpose,
      pending,
      outcomes,
      initial_request,
      Step.request(C.Global{catalog, purpose, pending, outcomes, initial_request}, reversed_ops),
      name,
      expanded,
      referenced,
      failure,
      reversed_refs,
      prefix,
      subtotal,
      List.append(&2, M.Op, List.reverse(&2, M.Op, reversed_ops), C.finish_operations(purpose)),
      result,
      accumulator,
      root_trace(purpose, reversed_ops, depth, prefix, subtotal, trace)
    )
  )

def root_normalized(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  result: {
    S.NodeResult{
      S.State{name, expanded, referenced, failure},
      M.NodePlan{S.declaration_slot(root), prefix},
      subtotal
    }
    == S.analyze(root, C.global_catalog(invocation))
    : S.NodeResult
  },
  accumulator: K.accumulator_relation(C.global_purpose(invocation), reversed_refs, prefix),
  trace: {
    List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(C.global_purpose(invocation), [J.Ghost{depth, prefix, subtotal}])
    : List<&2, M.Op>
  }
) ->
  Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          C.global_count(invocation, Step.request(invocation, reversed_ops)),
          S.declaration_slot(root),
          name,
          expanded,
          referenced,
          failure,
          remaining,
          [C.Frame{frame_slot, [], reversed_refs, None{}}]
        }
      }
    ),
    []
  ):
  match invocation:
    case C.Global{catalog, purpose, pending, outcomes, initial_request}:
      root_schedule(
        root,
        catalog,
        purpose,
        pending,
        outcomes,
        initial_request,
        reversed_ops,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frame_slot,
        reversed_refs,
        depth,
        prefix,
        subtotal,
        result,
        accumulator,
        trace
      )

def root_semantic_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  trace: {
    List.reverse(&2, M.Op, reversed_ops)
    == Step.cursor_postfix(C.global_purpose(invocation), [J.Ghost{1n+depth, prefix, subtotal}])
    : List<&2, M.Op>
  },
  valid: J.cursor(
    root,
    invocation,
    Step.request(invocation, reversed_ops),
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      [C.Frame{frame_slot, [], reversed_refs, None{}}]
    },
    [J.Ghost{1n+depth, prefix, subtotal}]
  )
) ->
  Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          [C.Frame{frame_slot, [], reversed_refs, None{}}]
        }
      }
    ),
    []
  ):
  match valid:
    case (global_equal, (slot_equal, (_, (_, (_, ((accumulator, _), semantic)))))):
      %Equal.sym(
        C.Global,
        global,
        C.global_count(invocation, Step.request(invocation, reversed_ops)),
        global_equal
      ) :
        Step.valid(
          root,
          invocation,
          reversed_ops,
          Step.advance(
            C.Continue{
              C.Cursor{
                _,
                slot,
                name,
                expanded,
                referenced,
                failure,
                remaining,
                [C.Frame{frame_slot, [], reversed_refs, None{}}]
              }
            }
          ),
          []
        )
      %Equal.sym(Nat, slot, S.declaration_slot(root), slot_equal) :
        Step.valid(
          root,
          invocation,
          reversed_ops,
          Step.advance(
            C.Continue{
              C.Cursor{
                C.global_count(invocation, Step.request(invocation, reversed_ops)),
                _,
                name,
                expanded,
                referenced,
                failure,
                remaining,
                [C.Frame{frame_slot, [], reversed_refs, None{}}]
              }
            }
          ),
          []
        )
      root_normalized(
        root,
        invocation,
        reversed_ops,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frame_slot,
        reversed_refs,
        1n+depth,
        prefix,
        subtotal,
        root_result(
          root,
          C.global_catalog(invocation),
          C.global_purpose(invocation),
          S.State{name, expanded, referenced, failure},
          frame_slot,
          reversed_refs,
          prefix,
          subtotal,
          depth,
          semantic
        ),
        accumulator,
        trace
      )

def root_continue(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        [C.Frame{frame_slot, [], reversed_refs, None{}}]
      }
    },
    [J.Ghost{1n+depth, prefix, subtotal}]
  )
) ->
  Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(
      C.Continue{
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          [C.Frame{frame_slot, [], reversed_refs, None{}}]
        }
      }
    ),
    []
  ):
  match valid:
    case (semantic, trace): root_semantic_step(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      frame_slot,
      reversed_refs,
      depth,
      prefix,
      subtotal,
      trace,
      semantic
    )

def zero_root_depth(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  valid: J.cursor(
    root,
    invocation,
    Step.request(invocation, reversed_ops),
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      [C.Frame{frame_slot, [], reversed_refs, None{}}]
    },
    [J.Ghost{0n, prefix, subtotal}]
  )
) -> Empty:
  match valid:
    case (_, (_, (_, (_, (_, ((_, (bound, _)), _)))))):
      N.internal_false_ne_true(bound)

def root_all_depths(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        [C.Frame{frame_slot, [], reversed_refs, None{}}]
      }
    },
    [J.Ghost{depth, prefix, subtotal}]
  )
) ->
  Exists(
    List<&2, J.Ghost>,
    after => Step.valid(
      root,
      invocation,
      reversed_ops,
      Step.advance(
        C.Continue{
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            [C.Frame{frame_slot, [], reversed_refs, None{}}]
          }
        }
      ),
      after
    )
  ):
  match depth:
    case 0n:
      Empty.absurd(
        Exists(
          List<&2, J.Ghost>,
          after => Step.valid(
            root,
            invocation,
            reversed_ops,
            Step.advance(
              C.Continue{
                C.Cursor{
                  global,
                  slot,
                  name,
                  expanded,
                  referenced,
                  failure,
                  remaining,
                  [C.Frame{frame_slot, [], reversed_refs, None{}}]
                }
              }
            ),
            after
          )
        ),
        impossible_continue(
          root,
          invocation,
          reversed_ops,
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            [C.Frame{frame_slot, [], reversed_refs, None{}}]
          },
          [J.Ghost{0n, prefix, subtotal}],
          semantic => zero_root_depth(
            root,
            invocation,
            reversed_ops,
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            frame_slot,
            reversed_refs,
            0n,
            prefix,
            subtotal,
            semantic
          ),
          valid
        )
      )
    case 1n++depth:
      (
        [],
        root_continue(
          root,
          invocation,
          reversed_ops,
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          frame_slot,
          reversed_refs,
          depth,
          prefix,
          subtotal,
          valid
        )
      )

def shape_without_ghosts(
  frames: List<&2, C.Frame>,
  +root_slot: Nat
) -> {J.shape(frames, [], root_slot) == False{} : Bool}:
  match frames:
    case Nil{}: {==}
    case C.Frame{_, _, _, None{}} <> Nil{}: {==}
    case C.Frame{_, _, _, None{}} <> _ <> _: {==}
    case C.Frame{_, _, _, Some{_}} <> _: {==}

def reject_shape(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frames: List<&2, C.Frame>,
  +ghosts: List<&2, J.Ghost>,
  rejected: {J.shape(frames, ghosts, S.declaration_slot(root)) == False{} : Bool},
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}},
    ghosts
  )
) -> Exists(
  List<&2, J.Ghost>,
  after => Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}}),
    after
  )
):
  match valid:
    case ((_, (_, (_, (shape, _)))), _):
      Empty.absurd(
        Exists(
          List<&2, J.Ghost>,
          after => Step.valid(
            root,
            invocation,
            reversed_ops,
            Step.advance(
              C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}}
            ),
            after
          )
        ),
        N.internal_false_ne_true(
          Equal.trans(
            Bool,
            False{},
            J.shape(frames, ghosts, S.declaration_slot(root)),
            True{},
            Equal.sym(Bool, J.shape(frames, ghosts, S.declaration_slot(root)), False{}, rejected),
            shape
          )
        )
      )

def frame_step(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +pending: List<&2, M.Reference>,
  +reversed_refs: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{frame_slot, pending, reversed_refs, site} <> parents
      }
    },
    J.Ghost{depth, prefix, subtotal} <> others
  )
) -> Exists(
    List<&2, J.Ghost>,
    after => Step.valid(
      root,
      invocation,
      reversed_ops,
      Step.advance(
        C.Continue{
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            C.Frame{frame_slot, pending, reversed_refs, site} <> parents
          }
        }
      ),
      after
    )
  ):
  match pending site parents others:
    case reference <> tail site parents others:
      pending_step(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frame_slot,
        reference,
        tail,
        reversed_refs,
        site,
        parents,
        depth,
        prefix,
        subtotal,
        others,
        valid
      )
    case Nil{} None{} Nil{} Nil{}:
      root_all_depths(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frame_slot,
        reversed_refs,
        depth,
        prefix,
        subtotal,
        valid
      )
    case Nil{} Some{symbol} C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors J.Ghost{
      parent_depth,
      parent_prefix,
      parent_subtotal
    } <> rest:
      return_all_depths(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frame_slot,
        reversed_refs,
        prefix,
        subtotal,
        depth,
        parent_slot,
        parent_pending,
        parent_reversed,
        parent_site,
        parent_prefix,
        parent_subtotal,
        parent_depth,
        ancestors,
        rest,
        symbol,
        valid
      )
    case Nil{} None{} Nil{} head <> rest:
      reject_shape(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{frame_slot, [], reversed_refs, None{}} <> [],
        J.Ghost{depth, prefix, subtotal} <> head <> rest,
        {==},
        valid
      )
    case Nil{} None{} parent <> ancestors others:
      reject_shape(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{frame_slot, [], reversed_refs, None{}} <> parent <> ancestors,
        J.Ghost{depth, prefix, subtotal} <> others,
        {==},
        valid
      )
    case Nil{} Some{symbol} Nil{} others:
      reject_shape(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{frame_slot, [], reversed_refs, Some{symbol}} <> [],
        J.Ghost{depth, prefix, subtotal} <> others,
        {==},
        valid
      )
    case Nil{} Some{symbol} parent <> ancestors Nil{}:
      reject_shape(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{frame_slot, [], reversed_refs, Some{symbol}} <> parent <> ancestors,
        J.Ghost{depth, prefix, subtotal} <> [],
        shape_without_ghosts(parent <> ancestors, S.declaration_slot(root)),
        valid
      )

def continue_frames(
  +root: M.Declaration,
  +invocation: C.Global,
  +reversed_ops: List<&2, M.Op>,
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frames: List<&2, C.Frame>,
  +ghosts: List<&2, J.Ghost>,
  valid: Step.valid(
    root,
    invocation,
    reversed_ops,
    C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}},
    ghosts
  )
) -> Exists(
  List<&2, J.Ghost>,
  after => Step.valid(
    root,
    invocation,
    reversed_ops,
    Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}}),
    after
  )
):
  match frames ghosts:
    case Nil{} ghosts: reject_shape(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      [],
      ghosts,
      {==},
      valid
    )
    case frame <> parents Nil{}: reject_shape(
      root,
      invocation,
      reversed_ops,
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      frame <> parents,
      [],
      shape_without_ghosts(frame <> parents, S.declaration_slot(root)),
      valid
    )
    case C.Frame{frame_slot, pending, reversed_refs, site} <> parents J.Ghost{
      depth,
      prefix,
      subtotal
    } <> others:
      frame_step(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frame_slot,
        pending,
        reversed_refs,
        site,
        parents,
        depth,
        prefix,
        subtotal,
        others,
        valid
      )

def continue_step(+root: M.Declaration, +invocation: C.Global, +reversed_ops: List<&2, M.Op>,
  +cursor: C.Cursor, +ghosts: List<&2, J.Ghost>,
  valid: Step.valid(root, invocation, reversed_ops, C.Continue{cursor}, ghosts)) ->
  Exists(
    List<&2, J.Ghost>,
    after => Step.valid(root, invocation, reversed_ops, Step.advance(C.Continue{cursor}), after)
  ):
  match cursor:
    case C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}:
      continue_frames(
        root,
        invocation,
        reversed_ops,
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frames,
        ghosts,
        valid
      )

def Laws.initial_root(root, invocation):
  initial_root(root, invocation)

def Laws.step_preserves(root, invocation, reversed, step, ghosts, valid):
  match step ghosts:
    case C.Continue{cursor} ghosts:
      continue_step(root, invocation, reversed, cursor, ghosts, valid)
    case C.Engine{operation, queued, remaining, next} ghosts:
      engine_step(root, invocation, reversed, operation, queued, remaining, next, ghosts, valid)
    case C.NextRoot{global} Nil{}: ([], valid)
    case C.NextRoot{global} head <> tail:
      Empty.absurd(Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation,
        Step.record(C.NextRoot{global}, reversed), Step.advance(C.NextRoot{global}), after)), valid)
    case C.Completed{outcomes} ghosts:
      Empty.absurd(
        Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation,
          Step.record(C.Completed{outcomes}, reversed), Step.advance(C.Completed{outcomes}), after)),
        valid
      )
    case C.PreflightCompleted{} ghosts:
      Empty.absurd(
        Exists(
          List<&2, J.Ghost>,
          after => Step.valid(
            root,
            invocation,
            Step.record(C.PreflightCompleted{}, reversed),
            Step.advance(C.PreflightCompleted{}),
            after
          )
        ),
        valid
      )
    case C.Exhausted{} ghosts:
      Empty.absurd(Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation,
        Step.record(C.Exhausted{}, reversed), Step.advance(C.Exhausted{}), after)), valid)
    case C.InvalidReply{} ghosts:
      Empty.absurd(Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation,
        Step.record(C.InvalidReply{}, reversed), Step.advance(C.InvalidReply{}), after)), valid)

def main() -> Unit:
  Unit{}
