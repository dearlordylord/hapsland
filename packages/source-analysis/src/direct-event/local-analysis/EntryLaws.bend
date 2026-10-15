import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K

# Actual child entry spends the explicit declaration tick and retains every
# parked parent and the current request. Reference charging happens earlier.
law child_entry_step:
  for +rest: Nat
  for +global: C.Global
  for +root: Nat
  for +name: String
  for +expanded: List<&2, String>
  for +referenced: List<&2, String>
  for +failure: Maybe<&2, M.Failure>
  for old_remaining: Nat
  for +parents: List<&2, C.Frame>
  for +slot: Nat
  for +identity: String
  for target_name: String
  for +references: List<&2, M.Reference>
  for +symbol: String
  for +operations: List<&2, M.Op>
  {
    C.enter_child(
      1n+rest,
      C.Cursor{global, root, name, expanded, referenced, failure, old_remaining, parents},
      M.Declaration{slot, identity, target_name, references},
      symbol,
      operations
    )
    == C.cursor_ops(C.Cursor{global, root, name, identity <> expanded, referenced, failure, rest,
      C.Frame{slot, references, [], Some{symbol}} <> parents},
      C.child_operations(C.global_purpose(global), operations, slot))
    : C.Step
  }

# Internal branch witnesses come from the actual fresh, below-limit lookup.
# They are not premises of the public whole-root theorem. Parent sibling
# depth stays at 1+depth while child references use depth.
law child_entry_frame:
  for +purpose: C.Purpose
  for +depth: Nat
  for +catalog: M.Catalog
  for +state: S.State
  for +slot: Nat
  for +identity: String
  for +target_name: String
  for +references: List<&2, M.Reference>
  for +symbol: String
  for +target_id: Maybe<&2, String>
  for +parent_slot: Nat
  for +pending: List<&2, M.Reference>
  for +reversed: List<&2, M.ReferencePlan>
  for +site: Maybe<&2, String>
  for +prefix: List<&2, M.ReferencePlan>
  for +subtotal: S.BytesExpr
  for continuation: S.ReferencesResult -> Type
  for found: {S.lookup(catalog, symbol, target_id) == Some{M.Declaration{slot, identity, target_name, references}} : Maybe<&2, M.Declaration>}
  for unlimited: {S.over_limit(S.record_named(state, symbol, target_id)) == False{} : Bool}
  for fresh: {S.seen(S.record_named(state, symbol, target_id), identity) == False{} : Bool}
  for parent: K.frame_relation(C.Frame{parent_slot, M.Named{symbol, target_id} <> pending, reversed, site},
    purpose, 2n+depth, prefix, subtotal, state, catalog, continuation)
  K.frame_relation(C.Frame{slot, references, [], Some{symbol}}, purpose, depth, [],
    S.Add{S.ArtifactBytes{slot}, S.Literal{512n}}, S.expand(S.record_named(state, symbol, target_id), identity), catalog,
    result => K.child_continuation(result, slot, 1n+depth, pending, prefix,
      S.edge_total(subtotal, symbol, Some{M.Declaration{slot, identity, target_name, references}}), symbol, catalog, continuation))

def main() -> Unit:
  Unit{}
