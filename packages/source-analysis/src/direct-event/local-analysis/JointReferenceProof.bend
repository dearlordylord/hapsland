import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K
import ./JointReference.bend as R
import ./JointReferenceLaws.bend as Laws
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

def exhausted_impossible(
  +state: S.State,
  +plan: M.ReferencePlan,
  +subtotal: S.BytesExpr,
  equal: {
    S.ReferenceDepthExhausted{}
    == S.ReferenceResult{state, plan, subtotal}
    : S.ReferenceResult
  }
) -> Empty:
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
    case Some{+target}: seen_independent(
      S.seen(state, S.declaration_identity(target)),
      state,
      symbol,
      target,
      subtotal,
      visit,
      next_state,
      plan,
      next_subtotal,
      equal
    )

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
    case False{}: target_independent(
      target,
      state,
      symbol,
      subtotal,
      visit,
      next_state,
      plan,
      next_subtotal,
      equal
    )

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
      limit_independent(
        S.over_limit(S.record_named(state, symbol, target_id)),
        S.lookup(catalog, symbol, target_id),
        S.record_named(state, symbol, target_id),
        symbol,
        S.edge_total(subtotal, symbol, S.lookup(catalog, symbol, target_id)),
        visit,
        next_state,
        plan,
        next_subtotal,
        equal
      )

def accumulated(purpose: C.Purpose, +reversed: List<&2, M.ReferencePlan>,
  +prefix: List<&2, M.ReferencePlan>, +plan: M.ReferencePlan,
  valid: K.accumulator_relation(purpose, reversed, prefix)) ->
  K.accumulator_relation(purpose, C.keep_reference(purpose, plan, reversed),
    List.append(&2, M.ReferencePlan, prefix, [plan])):
  match purpose:
    case C.Trees{}:
      Equal.trans(
        List<&2, M.ReferencePlan>,
        List.reverse(&2, M.ReferencePlan, plan <> reversed),
        List.append(&2, M.ReferencePlan, List.reverse(&2, M.ReferencePlan, reversed), [plan]),
        List.append(&2, M.ReferencePlan, prefix, [plan]),
        L.reverse_go_spec(&2, M.ReferencePlan, reversed, [plan]),
        Equal.cong(List<&2, M.ReferencePlan>, List<&2, M.ReferencePlan>,
          items => List.append(&2, M.ReferencePlan, items, [plan]),
          List.reverse(&2, M.ReferencePlan, reversed), prefix, valid)
      )
    case C.Outcomes{}: valid
    case C.Preflight{}: valid

def semantic_equation(+depth: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +state: S.State, +catalog: M.Catalog, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +next_state: S.State, +plan: M.ReferencePlan, +next_subtotal: S.BytesExpr,
  equal: {R.result(reference, state, catalog, subtotal)
    == S.ReferenceResult{next_state, plan, next_subtotal} : S.ReferenceResult}) -> {
  K.completed_prefix(prefix, S.as_references(S.interpret(1n+depth,
    S.ReferencesRequest{reference <> pending, state, subtotal}, catalog)))
  == K.completed_prefix(
    List.append(&2, M.ReferencePlan, prefix, [plan]),
    S.as_references(
      S.interpret(depth, S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)
    )
  )
  : S.ReferencesResult
}:
  Equal.trans(
    S.ReferencesResult,
    K.completed_prefix(prefix, S.as_references(S.interpret(1n+depth,
      S.ReferencesRequest{reference <> pending, state, subtotal}, catalog))),
    K.completed_prefix(prefix, S.prepend_reference(S.as_references(S.interpret(depth,
      S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)), plan)),
    K.completed_prefix(
      List.append(&2, M.ReferencePlan, prefix, [plan]),
      S.as_references(S.interpret(depth, S.ReferencesRequest{pending, next_state, next_subtotal}, catalog))
    ),
    Equal.cong(
      S.ReferenceResult,
      S.ReferencesResult,
      result => K.completed_prefix(
        prefix,
        S.after_reference(
          result,
          next => bytes => S.as_references(S.interpret(depth, S.ReferencesRequest{pending, next, bytes}, catalog))
        )
      ),
      S.visit_reference(
        reference,
        state,
        catalog,
        subtotal,
        declaration => next => S.as_node(S.interpret(depth, S.NodeRequest{declaration, next}, catalog))
      ),
      S.ReferenceResult{next_state, plan, next_subtotal},
      reference_independent(
        reference,
        state,
        catalog,
        subtotal,
        declaration => next => S.as_node(S.interpret(depth, S.NodeRequest{declaration, next}, catalog)),
        next_state,
        plan,
        next_subtotal,
        equal
      )
    ),
    Return.prefix_snoc(prefix, plan, S.as_references(S.interpret(depth,
      S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)))
  )

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
  K.frame_relation(
    C.Frame{slot, pending, C.keep_reference(purpose, plan, reversed), site},
    purpose,
    depth,
    List.append(&2, M.ReferencePlan, prefix, [plan]),
    next_subtotal,
    next_state,
    catalog,
    continuation
  ):
  match witness:
    case (accumulator, semantic):
      (
        accumulated(purpose, reversed, prefix, plan, accumulator),
        Return.transport(
          K.completed_prefix(
            prefix,
            S.as_references(
              S.interpret(
                1n+depth,
                S.ReferencesRequest{reference <> pending, state, subtotal},
                catalog
              )
            )
          ),
          K.completed_prefix(
            List.append(&2, M.ReferencePlan, prefix, [plan]),
            S.as_references(
              S.interpret(depth, S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)
            )
          ),
          semantic_equation(
            depth,
            reference,
            pending,
            state,
            catalog,
            prefix,
            subtotal,
            next_state,
            plan,
            next_subtotal,
            equal
          ),
          continuation,
          semantic
        )
      )

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
      (
        accumulated(purpose, reversed, prefix, plan, accumulator),
        (
          N.le_of_succ_le_succ(W.specification_required(pending, catalog, expanded), depth, bound),
          ancestors
        )
      )

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
  %Fresh.enclosing_own_fields(
    slot,
    site,
    reference <> pending,
    pending,
    reversed,
    C.keep_reference(purpose, plan, reversed),
    parents,
    others,
    1n+depth,
    depth,
    prefix,
    List.append(&2, M.ReferencePlan, prefix, [plan]),
    subtotal,
    next_subtotal,
    root,
    catalog,
    K.completed_prefix(
      List.append(&2, M.ReferencePlan, prefix, [plan]),
      S.as_references(
        S.interpret(depth, S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)
      )
    )
  ) :
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
  {
    P.cursor_valid(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        next_referenced,
        next_failure,
        rest,
        C.Frame{
          parent_slot,
          pending,
          C.keep_reference(C.global_purpose(global), plan, reversed),
          site
        } <> parents
      }
    )
    == True{}
    : Bool
  }:
  N.le_of_succ_le_succ(
    Nat.add(
      Nat.add(List.length(&2, M.Reference, pending), P.pending_references(parents)),
      P.catalog_unvisited(C.global_catalog(global), expanded)
    ),
    rest,
    valid
  )

# One dispatch certificate will be reused by the full joint reconstruction.
# These constructors expose existing Cursor fields; they run no traversal.
def cursor_state(cursor: C.Cursor) -> S.State:
  match cursor:
    case C.Cursor{_, _, name, expanded, referenced, failure, _, _}:
      S.State{name, expanded, referenced, failure}

def with_state(cursor: C.Cursor, state: S.State) -> C.Cursor:
  match cursor state:
    case C.Cursor{global, slot, _, _, _, _, remaining, frames} S.State{
      name,
      expanded,
      referenced,
      failure
    }:
      C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}

def dispatch_claim(result: S.ReferenceResult, +cursor: C.Cursor, step: C.Step,
  +operations: List<&2, M.Op>) -> Type:
  match result cursor:
    case S.ReferenceDepthExhausted{} _: Unit
    case S.ReferenceResult{
      S.State{+next_name, +next_expanded, +next_referenced, +next_failure},
      +plan,
      _
    }
      C.Cursor{+global, +slot, +name, +expanded, +referenced, +failure, +remaining, +frames}:
      {next_name == name : String} & {next_expanded == expanded : List<&2, String>}
      & {step == C.append_reference(C.Cursor{global, slot, next_name, next_expanded,
        next_referenced, next_failure, remaining, frames}, plan, operations) : C.Step}

def plain_claim(
  +cursor: C.Cursor,
  +plan: M.ReferencePlan,
  +subtotal: S.BytesExpr,
  +operations: List<&2, M.Op>
) -> dispatch_claim(S.ReferenceResult{cursor_state(cursor), plan, subtotal},
  cursor, C.append_reference(cursor, plan, operations), operations):
  match cursor:
    case C.Cursor{_, _, _, _, _, _, _, _}: ({==}, ({==}, {==}))

def first_failure_exact(+current: Maybe<&2, M.Failure>, +why: M.Failure) -> {
  C.first_failure(current, why) == S.first_failure(current, why) : Maybe<&2, M.Failure>
}:
  match current:
    case None{}: {==}
    case Some{_}: {==}

def failed_claim(+cursor: C.Cursor, +why: M.Failure, +plan: M.ReferencePlan,
  +subtotal: S.BytesExpr, +operations: List<&2, M.Op>) ->
  dispatch_claim(S.ReferenceResult{S.fail(cursor_state(cursor), why), plan, subtotal}, cursor,
    C.append_reference(C.fail(cursor, why), plan, operations), operations):
  match cursor:
    case C.Cursor{+global, +slot, +name, +expanded, +referenced, +failure, +remaining, +frames}:
      %first_failure_exact(failure, why) : dispatch_claim(
        S.ReferenceResult{S.State{name, expanded, referenced, _}, plan, subtotal},
        C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
        C.append_reference(
          C.fail(
            C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
            why
          ),
          plan,
          operations
        ),
        operations
      )
      ({==}, ({==}, {==}))

def seen_claim(+already: Bool, +cursor: C.Cursor, +target: M.Declaration,
  +symbol: String, +subtotal: S.BytesExpr, +operations: List<&2, M.Op>, +remaining: Nat) ->
  dispatch_claim(
    S.named_seen(already, cursor_state(cursor), symbol, target, subtotal, _ => _ => S.DepthExhausted{}),
    cursor,
    C.named_seen(already, cursor, target, symbol, operations, remaining),
    operations
  ):
  match already target:
    case True{} M.Declaration{_, identity, _, _}: plain_claim(
      cursor,
      M.Included{symbol, identity},
      subtotal,
      operations
    )
    case False{} _: Unit{}

def cursor_expanded(cursor: C.Cursor) -> List<&2, String>:
  match cursor:
    case C.Cursor{_, _, _, expanded, _, _, _, _}: expanded

def seen_in_context(+cursor: C.Cursor, +target: M.Declaration,
  +symbol: String, +subtotal: S.BytesExpr, +operations: List<&2, M.Op>, +remaining: Nat) ->
  dispatch_claim(S.named_seen(S.seen(cursor_state(cursor), S.declaration_identity(target)),
    cursor_state(cursor), symbol, target, subtotal, _ => _ => S.DepthExhausted{}),
    cursor, C.named_seen(C.contains(C.declaration_identity(target), cursor_expanded(cursor)),
      cursor, target, symbol, operations, remaining), operations):
  match cursor target:
    case C.Cursor{+global, +slot, +name, +expanded, +referenced, +failure, +rest, +frames}
      M.Declaration{+target_slot, +identity, +target_name, +references}:
      %Fresh.contains_exact(identity, expanded) : dispatch_claim(
        S.named_seen(
          _,
          S.State{name, expanded, referenced, failure},
          symbol,
          M.Declaration{target_slot, identity, target_name, references},
          subtotal,
          _ => _ => S.DepthExhausted{}
        ),
        C.Cursor{global, slot, name, expanded, referenced, failure, rest, frames},
        C.named_seen(
          C.contains(identity, expanded),
          C.Cursor{global, slot, name, expanded, referenced, failure, rest, frames},
          M.Declaration{target_slot, identity, target_name, references},
          symbol,
          operations,
          remaining
        ),
        operations
      )
      seen_claim(
        C.contains(identity, expanded),
        C.Cursor{global, slot, name, expanded, referenced, failure, rest, frames},
        M.Declaration{target_slot, identity, target_name, references},
        symbol,
        subtotal,
        operations,
        remaining
      )

def target_claim(+target: Maybe<&2, M.Declaration>, +cursor: C.Cursor,
  +symbol: String, +subtotal: S.BytesExpr, +operations: List<&2, M.Op>, +remaining: Nat) ->
  dispatch_claim(
    S.named_target(target, cursor_state(cursor), symbol, subtotal, _ => _ => S.DepthExhausted{}),
    cursor,
    C.named_target(target, cursor, symbol, operations, cursor_expanded(cursor), remaining),
    operations
  ):
  match target:
    case None{}: failed_claim(
      cursor,
      M.MissingEvidence{},
      M.Omitted{symbol, None{}, M.Unresolved{}},
      subtotal,
      operations
    )
    case Some{target}: seen_in_context(cursor, target, symbol, subtotal, operations, remaining)

def omitted_exact(+target: Maybe<&2, M.Declaration>) -> {
  C.omitted_target(target) == S.omitted_target(target) : Maybe<&2, String>
}:
  match target:
    case None{}: {==}
    case Some{M.Declaration{_, _, _, _}}: {==}

def limit_claim(+limited: Bool, +target: Maybe<&2, M.Declaration>, +cursor: C.Cursor,
  +symbol: String, +subtotal: S.BytesExpr, +operations: List<&2, M.Op>, +remaining: Nat) ->
  dispatch_claim(
    S.named_limit(limited, target, cursor_state(cursor), symbol, subtotal, _ => _ => S.DepthExhausted{}),
    cursor,
    C.named_limit(limited, target, cursor, symbol, operations, cursor_expanded(cursor), remaining),
    operations
  ):
  match limited:
    case False{}: target_claim(target, cursor, symbol, subtotal, operations, remaining)
    case True{}:
      %omitted_exact(target) : dispatch_claim(
        S.ReferenceResult{
          S.fail(cursor_state(cursor), M.ReferenceLimit{}),
          M.Omitted{symbol, _, M.LimitExceeded{}},
          subtotal
        },
        cursor,
        C.named_limit(
          True{},
          target,
          cursor,
          symbol,
          operations,
          cursor_expanded(cursor),
          remaining
        ),
        operations
      )
      failed_claim(
        cursor,
        M.ReferenceLimit{},
        M.Omitted{symbol, C.omitted_target(target), M.LimitExceeded{}},
        subtotal,
        operations
      )

def recorded_claim(+cursor: C.Cursor, +target: Maybe<&2, M.Declaration>,
  +symbol: String, +subtotal: S.BytesExpr) ->
  dispatch_claim(
    S.named_recorded(cursor_state(cursor), target, symbol, subtotal, _ => _ => S.DepthExhausted{}),
    cursor,
    C.named_recorded(cursor, target, symbol),
    C.edge_operations(C.cursor_purpose(cursor), symbol, target)
  ):
  match cursor:
    case C.Cursor{+global, +slot, +name, +expanded, +referenced, +failure, +remaining, +frames}:
      limit_claim(
        Nat.is_gt(List.length(&2, String, referenced), 16n),
        target,
        C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
        symbol,
        S.edge_total(subtotal, symbol, target),
        C.edge_operations(C.global_purpose(global), symbol, target),
        remaining
      )

def with_referenced(cursor: C.Cursor, referenced: List<&2, String>) -> C.Cursor:
  match cursor:
    case C.Cursor{global, slot, name, expanded, _, failure, remaining, frames}:
      C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}

# The certificate's source identity ignores old referenced keys; its result
# still requires the COMPLETE new state and exact actual append operation.
def claim_recorded(+result: S.ReferenceResult, +cursor: C.Cursor,
  +referenced: List<&2, String>, +step: C.Step, +operations: List<&2, M.Op>) -> {
  dispatch_claim(result, with_referenced(cursor, referenced), step, operations)
    == dispatch_claim(result, cursor, step, operations) : Type
}:
  match result cursor:
    case S.ReferenceDepthExhausted{} _: {==}
    case S.ReferenceResult{S.State{_, _, _, _}, _, _} C.Cursor{_, _, _, _, _, _, _, _}: {==}

def cursor_catalog(cursor: C.Cursor) -> M.Catalog:
  match cursor:
    case C.Cursor{global, _, _, _, _, _, _, _}: C.global_catalog(global)

def reference_claim(+reference: M.Reference, +cursor: C.Cursor, +subtotal: S.BytesExpr) ->
  dispatch_claim(R.result(reference, cursor_state(cursor), cursor_catalog(cursor), subtotal),
    cursor, C.visit_reference(reference, cursor),
    R.operations(reference, cursor_catalog(cursor), C.cursor_purpose(cursor))):
  match reference cursor:
    case M.Unsupported{symbol} +cursor:
      failed_claim(
        cursor,
        M.UnsupportedReference{},
        M.Omitted{symbol, None{}, M.UnsupportedSyntax{}},
        S.edge_total(subtotal, symbol, None{}),
        C.edge_operations(C.cursor_purpose(cursor), symbol, None{})
      )
    case M.Named{+symbol, +target_id} C.Cursor{
      +global,
      +slot,
      +name,
      +expanded,
      +referenced,
      +failure,
      +remaining,
      +frames
    }:
      %Fresh.lookup_exact(C.global_catalog(global), symbol, target_id) : dispatch_claim(
        S.named_recorded(S.record_named(S.State{name, expanded, referenced, failure}, symbol, target_id), _, symbol,
          subtotal, _ => _ => S.DepthExhausted{}),
        C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
        C.visit_reference(
          M.Named{symbol, target_id},
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}
        ),
        C.edge_operations(C.global_purpose(global), symbol, C.lookup(C.global_catalog(global), symbol, target_id))
      )
      %Fresh.record_exact(name, expanded, referenced, failure, symbol, target_id) : dispatch_claim(
        S.named_recorded(
          _,
          C.lookup(C.global_catalog(global), symbol, target_id),
          symbol,
          subtotal,
          _ => _ => S.DepthExhausted{}
        ),
        C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
        C.visit_reference(
          M.Named{symbol, target_id},
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}
        ),
        C.edge_operations(C.global_purpose(global), symbol, C.lookup(C.global_catalog(global), symbol, target_id))
      )
      %claim_recorded(
        S.named_recorded(
          S.State{name, expanded, C.reference_names(name, symbol, target_id, referenced), failure},
          C.lookup(C.global_catalog(global), symbol, target_id),
          symbol,
          subtotal,
          _ => _ => S.DepthExhausted{}
        ),
        C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
        C.reference_names(name, symbol, target_id, referenced),
        C.visit_reference(
          M.Named{symbol, target_id},
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}
        ),
        C.edge_operations(C.global_purpose(global), symbol, C.lookup(C.global_catalog(global), symbol, target_id))
      ) : _
      recorded_claim(
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          C.reference_names(name, symbol, target_id, referenced),
          failure,
          remaining,
          frames
        },
        C.lookup(C.global_catalog(global), symbol, target_id),
        symbol,
        subtotal
      )

def advance_result(result: S.ReferenceResult, +actual: C.Cursor, +rest: Nat,
  +reference: M.Reference) -> Type:
  match result actual:
    case S.ReferenceDepthExhausted{} _: Unit
    case S.ReferenceResult{
      S.State{+next_name, +next_expanded, +next_referenced, +next_failure},
      +plan,
      _
    }
      C.Cursor{+global, +slot, +name, +expanded, +referenced, +failure, +remaining, +frames}:
      {next_name == name : String} & {next_expanded == expanded : List<&2, String>}
      & {
        C.advance_cursor(
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}
        )
        == C.cursor_ops(
          R.successor(
            rest,
            C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames},
            S.State{next_name, next_expanded, next_referenced, next_failure},
            plan
          ),
          R.operations(reference, C.global_catalog(global), C.global_purpose(global))
        )
        : C.Step
      }

def advance_transport(
  +result: S.ReferenceResult,
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
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +subtotal: S.BytesExpr,
  witness: dispatch_claim(
    result,
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      rest,
      C.Frame{parent_slot, pending, reversed, site} <> parents
    },
    C.visit_reference(
      reference,
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        rest,
        C.Frame{parent_slot, pending, reversed, site} <> parents
      }
    ),
    R.operations(reference, C.global_catalog(global), C.global_purpose(global))
  )
) ->
  advance_result(result, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents}, rest, reference):
  match result:
    case S.ReferenceDepthExhausted{}: Unit{}
    case S.ReferenceResult{S.State{_, _, _, _}, _, _}: witness

def advance_certificate(+global: C.Global, +slot: Nat, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>,
  +rest: Nat, +parent_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>,
  +subtotal: S.BytesExpr) -> advance_result(
    R.result(
      reference,
      S.State{name, expanded, referenced, failure},
      C.global_catalog(global),
      subtotal
    ),
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
    },
    rest,
    reference
  ):
  advance_transport(
    R.result(
      reference,
      S.State{name, expanded, referenced, failure},
      C.global_catalog(global),
      subtotal
    ),
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
    reversed,
    site,
    parents,
    subtotal,
    reference_claim(
      reference,
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        rest,
        C.Frame{parent_slot, pending, reversed, site} <> parents
      },
      subtotal
    )
  )

def global_purpose_agrees(+global: C.Global, +invocation: C.Global, +request: Nat,
  equal: {global == C.global_count(invocation, request) : C.Global}) -> {
  C.global_purpose(global) == C.global_purpose(invocation) : C.Purpose
}:
  match invocation:
    case C.Global{+catalog, +purpose, +pending, +outcomes, _}:
      Equal.cong(C.Global, C.Purpose, value => C.global_purpose(value), global,
        C.Global{catalog, purpose, pending, outcomes, request}, equal)

def reconstruct_reference(
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
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  +next_referenced: List<&2, String>,
  +next_failure: Maybe<&2, M.Failure>,
  +plan: M.ReferencePlan,
  +next_subtotal: S.BytesExpr,
  equal: {
    R.result(
      reference,
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == S.ReferenceResult{
      S.State{name, expanded, next_referenced, next_failure},
      plan,
      next_subtotal
    }
    : S.ReferenceResult
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
      1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
    },
    J.Ghost{1n+depth, prefix, subtotal} <> others
  )
) ->
  J.cursor(root, invocation, request,
    R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents},
      S.State{name, expanded, next_referenced, next_failure}, plan),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)):
  match valid:
    case (+global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic)))))):
      %Equal.sym(C.Purpose, C.global_purpose(global), C.global_purpose(invocation),
        global_purpose_agrees(global, invocation, request, global_equal)) :
        J.cursor(root, invocation, request,
          C.Cursor{global, slot, name, expanded, next_referenced, next_failure, rest,
            C.Frame{parent_slot, pending, C.keep_reference(_, plan, reversed), site} <> parents},
          J.Ghost{depth, List.append(&2, M.ReferencePlan, prefix, [plan]), next_subtotal} <> others)
      (
        global_equal,
        (
          slot_equal,
          (
            name_equal,
            (
              %Fresh.shape_own_fields(
                parent_slot,
                site,
                reference <> pending,
                pending,
                reversed,
                C.keep_reference(C.global_purpose(invocation), plan, reversed),
                parents,
                others,
                1n+depth,
                depth,
                prefix,
                List.append(&2, M.ReferencePlan, prefix, [plan]),
                subtotal,
                next_subtotal,
                S.declaration_slot(root)
              ) : {_ == True{} : Bool} shape,
              (
                reference_core_bound(global, slot, name, expanded, referenced, failure, rest, parent_slot, reference,
                  pending, reversed, site, parents, next_referenced, next_failure, plan, potential),
                (
                  reference_bounds(
                    C.global_purpose(invocation),
                    depth,
                    parent_slot,
                    reference,
                    pending,
                    reversed,
                    site,
                    parents,
                    others,
                    C.global_catalog(invocation),
                    expanded,
                    prefix,
                    subtotal,
                    plan,
                    next_subtotal,
                    bounds
                  ),
                  reference_semantic(
                    root,
                    C.global_purpose(invocation),
                    depth,
                    parent_slot,
                    reference,
                    pending,
                    reversed,
                    site,
                    parents,
                    others,
                    S.State{name, expanded, referenced, failure},
                    C.global_catalog(invocation),
                    prefix,
                    subtotal,
                    S.State{name, expanded, next_referenced, next_failure},
                    plan,
                    next_subtotal,
                    equal,
                    semantic
                  )
                )
              )
            )
          )
        )
      )

def normalized_state(
  +next_name: String,
  +name: String,
  +next_expanded: List<&2, String>,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  name_equal: {next_name == name : String},
  expanded_equal: {next_expanded == expanded : List<&2, String>}
) -> {
    S.State{next_name, next_expanded, referenced, failure}
    == S.State{name, expanded, referenced, failure}
    : S.State
  }:
  %name_equal : {S.State{next_name, next_expanded, referenced, failure}
    == S.State{_, expanded, referenced, failure} : S.State}
  %expanded_equal : {S.State{next_name, next_expanded, referenced, failure}
    == S.State{next_name, _, referenced, failure} : S.State}
  {==}

def reconstruct_success(
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
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
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
  equal: {
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
  +state_equal: {
    S.State{next_name, next_expanded, next_referenced, next_failure}
    == S.State{name, expanded, next_referenced, next_failure}
    : S.State
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
      1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
    },
    J.Ghost{1n+depth, prefix, subtotal} <> others
  )
) ->
  J.cursor(root, invocation, request,
    R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents},
      S.State{next_name, next_expanded, next_referenced, next_failure}, plan),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)):
  %Equal.sym(S.State, S.State{next_name, next_expanded, next_referenced, next_failure},
    S.State{name, expanded, next_referenced, next_failure}, state_equal) :
    J.cursor(root, invocation, request,
      R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
        C.Frame{parent_slot, reference <> pending, reversed, site} <> parents}, _, plan),
      R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal))
  reconstruct_reference(
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
    parent_slot,
    reference,
    pending,
    reversed,
    site,
    parents,
    depth,
    prefix,
    subtotal,
    others,
    next_referenced,
    next_failure,
    plan,
    next_subtotal,
    Equal.trans(
      S.ReferenceResult,
      R.result(
        reference,
        S.State{name, expanded, referenced, failure},
        C.global_catalog(invocation),
        subtotal
      ),
      S.ReferenceResult{S.State{next_name, next_expanded, next_referenced, next_failure}, plan, next_subtotal},
      S.ReferenceResult{S.State{name, expanded, next_referenced, next_failure}, plan, next_subtotal},
      equal,
      Equal.cong(S.State, S.ReferenceResult, state => S.ReferenceResult{state, plan, next_subtotal},
        S.State{next_name, next_expanded, next_referenced, next_failure},
        S.State{name, expanded, next_referenced, next_failure}, state_equal)
    ),
    valid
  )

def context_certificate(
  +invocation: C.Global,
  +request: Nat,
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
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +subtotal: S.BytesExpr,
  +global_equal: {global == C.global_count(invocation, request) : C.Global}
) -> advance_result(
    R.result(
      reference,
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    ),
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
    },
    rest,
    reference
  ):
  %Fresh.global_catalog_agrees(global, invocation, request, global_equal) :
    advance_result(R.result(reference, S.State{name, expanded, referenced, failure}, _, subtotal),
      C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
        C.Frame{parent_slot, reference <> pending, reversed, site} <> parents}, rest, reference)
  advance_certificate(
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
    reversed,
    site,
    parents,
    subtotal
  )

def operations_context(
  +reference: M.Reference,
  +global: C.Global,
  +invocation: C.Global,
  +request: Nat,
  equal: {global == C.global_count(invocation, request) : C.Global}
) -> {
    R.operations(reference, C.global_catalog(global), C.global_purpose(global))
    == R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
    : List<&2, M.Op>
  }:
  match invocation:
    case C.Global{+catalog, +purpose, +pending, +outcomes, _}:
      Equal.cong(
        C.Global,
        List<&2, M.Op>,
        value => R.operations(reference, C.global_catalog(value), C.global_purpose(value)),
        global,
        C.Global{catalog, purpose, pending, outcomes, request},
        equal
      )

def assemble_success(
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
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
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
  equal: {
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
  +global_equal: {global == C.global_count(invocation, request) : C.Global},
  certificate: advance_result(
    S.ReferenceResult{
      S.State{next_name, next_expanded, next_referenced, next_failure},
      plan,
      next_subtotal
    },
    C.Cursor{
      global,
      slot,
      name,
      expanded,
      referenced,
      failure,
      1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
    },
    rest,
    reference
  ),
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
      1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
    },
    J.Ghost{1n+depth, prefix, subtotal} <> others
  )
) ->
  J.cursor(root, invocation, request,
    R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents},
      S.State{next_name, next_expanded, next_referenced, next_failure}, plan),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)) & {
      C.advance_cursor(
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          1n+rest,
          C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
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
            C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
          },
          S.State{next_name, next_expanded, next_referenced, next_failure},
          plan
        ),
        R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
      )
      : C.Step
    }:
  match certificate:
    case (name_equal, (expanded_equal, step)):
      (
        reconstruct_success(
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
          parent_slot,
          reference,
          pending,
          reversed,
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
          normalized_state(
            next_name,
            name,
            next_expanded,
            expanded,
            next_referenced,
            next_failure,
            name_equal,
            expanded_equal
          ),
          valid
        ),
        (%operations_context(reference, global, invocation, request, global_equal) : {
          C.advance_cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
            C.Frame{parent_slot, reference <> pending, reversed, site} <> parents})
          == C.cursor_ops(R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
            C.Frame{parent_slot, reference <> pending, reversed, site} <> parents},
            S.State{next_name, next_expanded, next_referenced, next_failure}, plan), _)
          : C.Step
        }
          step)
      )

def preserve_success(
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
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
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
      1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
    },
    J.Ghost{1n+depth, prefix, subtotal} <> others
  )
) ->
  J.cursor(root, invocation, request,
    R.successor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents},
      S.State{next_name, next_expanded, next_referenced, next_failure}, plan),
    R.ghosts(depth, J.Ghost{1n+depth, prefix, subtotal} <> others, plan, next_subtotal)) & {
      C.advance_cursor(
        C.Cursor{
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          1n+rest,
          C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
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
            C.Frame{parent_slot, reference <> pending, reversed, site} <> parents
          },
          S.State{next_name, next_expanded, next_referenced, next_failure},
          plan
        ),
        R.operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
      )
      : C.Step
    }:
  match valid:
    case (+global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic)))))):
      assemble_success(
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
        parent_slot,
        reference,
        pending,
        reversed,
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
        global_equal,
        (%equal : advance_result(_, C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
          C.Frame{parent_slot, reference <> pending, reversed, site} <> parents}, rest, reference)
          context_certificate(invocation, request, global, slot, name, expanded, referenced, failure, rest,
            parent_slot, reference, pending, reversed, site, parents, subtotal, global_equal)),
        (global_equal, (slot_equal, (name_equal, (shape, (potential, (bounds, semantic))))))
      )

def preserve_result(
  +result: S.ReferenceResult,
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
  +parent_slot: Nat,
  +reference: M.Reference,
  +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>,
  +depth: Nat,
  +prefix: List<&2, M.ReferencePlan>,
  +subtotal: S.BytesExpr,
  +others: List<&2, J.Ghost>,
  equal: {
    R.result(
      reference,
      S.State{name, expanded, referenced, failure},
      C.global_catalog(invocation),
      subtotal
    )
    == result
    : S.ReferenceResult
  }
) ->
  R.preserved(result, root, invocation, request,
    C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest,
      C.Frame{parent_slot, reference <> pending, reversed, site} <> parents},
    J.Ghost{1n+depth, prefix, subtotal} <> others, rest, depth, reference):
  match result:
    case S.ReferenceDepthExhausted{}: Unit{}
    case S.ReferenceResult{
      S.State{next_name, next_expanded, next_referenced, next_failure},
      plan,
      next_subtotal
    }:
      valid => preserve_success(
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
        parent_slot,
        reference,
        pending,
        reversed,
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

def Laws.reference_cursor(root, invocation, request, actual, ghosts):
  match actual ghosts:
    case C.Cursor{_, _, _, _, _, _, 0n, _} _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 1n+_, Nil{}} _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 1n+_, C.Frame{_, Nil{}, _, _} <> _} _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 1n+_, C.Frame{_, _ <> _, _, _} <> _} Nil{}: Unit{}
    case C.Cursor{_, _, _, _, _, _, 1n+_, C.Frame{_, _ <> _, _, _} <> _} J.Ghost{0n, _, _} <> _: Unit{}
    case C.Cursor{+global, +slot, +name, +expanded, +referenced, +failure, 1n++rest,
      C.Frame{+parent_slot, +reference <> +pending, +reversed, +site} <> +parents}
      J.Ghost{1n++depth, +prefix, +subtotal} <> +others:
      preserve_result(
        R.result(
          reference,
          S.State{name, expanded, referenced, failure},
          C.global_catalog(invocation),
          subtotal
        ),
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
        parent_slot,
        reference,
        pending,
        reversed,
        site,
        parents,
        depth,
        prefix,
        subtotal,
        others,
        {==}
      )
    case _ _: Unit{}

def main() -> Unit:
  Unit{}
