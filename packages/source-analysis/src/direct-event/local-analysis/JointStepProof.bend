import Base
import ./Model.bend as M
import ./Specification.bend as S
import ./Core.bend as C
import ./Joint.bend as J
import ./JointLaws.bend as JointLaws
import ./JointProof.bend as JointProof
import ./JointStep.bend as Step
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

def main() -> Unit:
  Unit{}
