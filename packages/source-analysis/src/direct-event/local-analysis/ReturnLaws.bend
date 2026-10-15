import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K

# A completed child plugs into its existing parent's exact parked Spec
# continuation. This law covers the returned frame; the Preflight Add queue
# and the surrounding actual cursor transition require their own connection.
law child_return_frame:
  for +purpose: C.Purpose
  for +child_slot: Nat
  for +child_reversed: List<&2, M.ReferencePlan>
  for +child_prefix: List<&2, M.ReferencePlan>
  for +child_subtotal: S.BytesExpr
  for child_depth: Nat
  for +state: S.State
  for +catalog: M.Catalog
  for +parent_slot: Nat
  for +parent_pending: List<&2, M.Reference>
  for +parent_reversed: List<&2, M.ReferencePlan>
  for +parent_site: Maybe<&2, String>
  for +parent_prefix: List<&2, M.ReferencePlan>
  for +charged_subtotal: S.BytesExpr
  for +parent_depth: Nat
  for +symbol: String
  for continuation: S.ReferencesResult -> Type
  for parent_accumulator: K.accumulator_relation(purpose, parent_reversed, parent_prefix)
  for child: K.frame_relation(C.Frame{child_slot, [], child_reversed, Some{symbol}}, purpose,
    1n+child_depth, child_prefix, child_subtotal, state, catalog,
    result => K.child_continuation(result, child_slot, parent_depth, parent_pending, parent_prefix,
      charged_subtotal, symbol, catalog, continuation))
  {
    K.returned_frame(
      purpose,
      C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
      child_slot,
      child_reversed,
      symbol
    )
    == C.Frame{
      parent_slot,
      parent_pending,
      C.keep_reference(
        purpose,
        K.returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol),
        parent_reversed
      ),
      parent_site
    }
    : C.Frame
  }
  & K.frame_relation(
    K.returned_frame(
      purpose,
      C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
      child_slot,
      child_reversed,
      symbol
    ),
    purpose,
    parent_depth,
    List.append(
      &2,
      M.ReferencePlan,
      parent_prefix,
      [K.returned_reference(child_slot, child_prefix, symbol)]
    ),
    S.Add{charged_subtotal, child_subtotal},
    state,
    catalog,
    continuation
  )

# Exact actual child-return transition, before any Engine Ack. The existing
# request, updated shared state, semantic budget and ancestors are retained.
law child_return_step:
  for +catalog: M.Catalog
  for +purpose: C.Purpose
  for +pending: List<&2, M.Declaration>
  for +outcomes: List<&2, M.Outcome>
  for +request: Nat
  for +root: Nat
  for +name: String
  for +expanded: List<&2, String>
  for +referenced: List<&2, String>
  for +failure: Maybe<&2, M.Failure>
  for +remaining: Nat
  for +child_slot: Nat
  for +child_reversed: List<&2, M.ReferencePlan>
  for +symbol: String
  for +parent_slot: Nat
  for +parent_pending: List<&2, M.Reference>
  for +parent_reversed: List<&2, M.ReferencePlan>
  for +parent_site: Maybe<&2, String>
  for +ancestors: List<&2, C.Frame>
  {
    C.finish_frame(
      C.Cursor{
        C.Global{catalog, purpose, pending, outcomes, request},
        root,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        []
      },
      C.Frame{child_slot, [], child_reversed, Some{symbol}},
      C.Frame{parent_slot, parent_pending, parent_reversed, parent_site} <> ancestors
    )
    == C.cursor_ops(C.Cursor{C.Global{catalog, purpose, pending, outcomes, request}, root, name,
      expanded, referenced, failure, remaining,
      K.returned_frame(purpose, C.Frame{parent_slot, parent_pending, parent_reversed, parent_site},
        child_slot, child_reversed, symbol) <> ancestors}, C.finish_operations(purpose))
    : C.Step
  }

# The queued child-return Add preserves the exact parent/child expression
# grouping before any suspended continuation, without numeric assumptions.
law child_return_postfix:
  for +parent: S.BytesExpr
  for +child: S.BytesExpr
  for +tail: List<&2, M.Op>
  {
    List.append(
      &2,
      M.Op,
      S.postfix(parent),
      List.append(&2, M.Op, S.postfix(child), M.Add{} <> tail)
    )
    == List.append(&2, M.Op, S.postfix(S.Add{parent, child}), tail)
    : List<&2, M.Op>
  }

# The exact Add Ack drains its singleton queue and advances only the envelope
# request counter; cursor_count updates that field in the same retained cursor.
law child_return_ack:
  for +cursor: C.Cursor
  for +request: Nat
  {C.resume(C.Engine{M.Add{}, request, [], C.CursorNext{cursor}}, C.Ack{request})
    == C.Continue{C.cursor_count(cursor, Nat.add(request, 1n))} : C.Step}

def main() -> Unit:
  Unit{}
