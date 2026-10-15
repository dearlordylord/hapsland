import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K
import ./ContinuationProof.bend as Bootstrap
import ./EntryLaws.bend as Laws

def reference_branch(+catalog: M.Catalog, +state: S.State, +symbol: String,
  +target_id: Maybe<&2, String>, +target: M.Declaration, +subtotal: S.BytesExpr,
  visit: M.Declaration -> S.State -> S.NodeResult,
  found: {S.lookup(catalog, symbol, target_id) == Some{target} : Maybe<&2, M.Declaration>},
  unlimited: {S.over_limit(S.record_named(state, symbol, target_id)) == False{} : Bool},
  fresh: {S.seen(S.record_named(state, symbol, target_id), S.declaration_identity(target)) == False{} : Bool}) -> {
  S.visit_reference(M.Named{symbol, target_id}, state, catalog, subtotal, visit)
  == S.expanded_child(visit(target)(S.expand(S.record_named(state, symbol, target_id), S.declaration_identity(target))),
    symbol, S.edge_total(subtotal, symbol, Some{target})) : S.ReferenceResult
}:
  %Equal.sym(Maybe<&2, M.Declaration>, S.lookup(catalog, symbol, target_id), Some{target}, found) : {
    S.named_recorded(S.record_named(state, symbol, target_id), _, symbol, subtotal, visit)
    == S.expanded_child(visit(target)(S.expand(S.record_named(state, symbol, target_id), S.declaration_identity(target))),
      symbol, S.edge_total(subtotal, symbol, Some{target})) : S.ReferenceResult}
  %Equal.sym(Bool, S.over_limit(S.record_named(state, symbol, target_id)), False{}, unlimited) : {
    S.named_limit(_, Some{target}, S.record_named(state, symbol, target_id), symbol,
      S.edge_total(subtotal, symbol, Some{target}), visit)
    == S.expanded_child(visit(target)(S.expand(S.record_named(state, symbol, target_id), S.declaration_identity(target))),
      symbol, S.edge_total(subtotal, symbol, Some{target})) : S.ReferenceResult}
  %Equal.sym(Bool, S.seen(S.record_named(state, symbol, target_id), S.declaration_identity(target)), False{}, fresh) : {
    S.named_seen(_, S.record_named(state, symbol, target_id), symbol, target,
      S.edge_total(subtotal, symbol, Some{target}), visit)
    == S.expanded_child(visit(target)(S.expand(S.record_named(state, symbol, target_id), S.declaration_identity(target))),
      symbol, S.edge_total(subtotal, symbol, Some{target})) : S.ReferenceResult}
  {==}

def Laws.child_entry_step(rest, global, root, name, expanded, referenced, failure, old_remaining, parents,
  slot, identity, target_name, references, symbol, operations):
  {==}

def branch_continuation(+depth: Nat, +catalog: M.Catalog, +state: S.State, +slot: Nat, +identity: String,
  +target_name: String, +references: List<&2, M.Reference>, +symbol: String, +target_id: Maybe<&2, String>,
  +pending: List<&2, M.Reference>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  continuation: S.ReferencesResult -> Type,
  found: {S.lookup(catalog, symbol, target_id) == Some{M.Declaration{slot, identity, target_name, references}} : Maybe<&2, M.Declaration>},
  unlimited: {S.over_limit(S.record_named(state, symbol, target_id)) == False{} : Bool},
  fresh: {S.seen(S.record_named(state, symbol, target_id), identity) == False{} : Bool},
  witness: continuation(K.completed_prefix(prefix, S.as_references(S.interpret(2n+depth,
    S.ReferencesRequest{M.Named{symbol, target_id} <> pending, state, subtotal}, catalog))))) ->
  K.child_continuation(K.completed_prefix([], S.as_references(S.interpret(depth,
    S.ReferencesRequest{references, S.expand(S.record_named(state, symbol, target_id), identity),
      S.Add{S.ArtifactBytes{slot}, S.Literal{512n}}}, catalog))),
    slot, 1n+depth, pending, prefix, S.edge_total(subtotal, symbol,
      Some{M.Declaration{slot, identity, target_name, references}}), symbol, catalog, continuation):
  %Equal.sym(S.ReferencesResult,
    K.completed_prefix([], S.as_references(S.interpret(depth,
      S.ReferencesRequest{references, S.expand(S.record_named(state, symbol, target_id), identity),
        S.Add{S.ArtifactBytes{slot}, S.Literal{512n}}}, catalog))),
    S.as_references(S.interpret(depth,
      S.ReferencesRequest{references, S.expand(S.record_named(state, symbol, target_id), identity),
        S.Add{S.ArtifactBytes{slot}, S.Literal{512n}}}, catalog)),
    Bootstrap.prefix_nil(S.as_references(S.interpret(depth,
      S.ReferencesRequest{references, S.expand(S.record_named(state, symbol, target_id), identity),
        S.Add{S.ArtifactBytes{slot}, S.Literal{512n}}}, catalog)))) :
    K.child_continuation(_, slot, 1n+depth, pending, prefix,
      S.edge_total(subtotal, symbol, Some{M.Declaration{slot, identity, target_name, references}}), symbol, catalog, continuation)
  %reference_branch(catalog, state, symbol, target_id, M.Declaration{slot, identity, target_name, references}, subtotal,
    target => next_state => S.as_node(S.interpret(1n+depth, S.NodeRequest{target, next_state}, catalog)),
    found, unlimited, fresh) : continuation(K.completed_prefix(prefix, S.after_reference(_,
      next_state => next_subtotal => S.as_references(S.interpret(1n+depth,
        S.ReferencesRequest{pending, next_state, next_subtotal}, catalog)))))
  witness

def Laws.child_entry_frame(purpose, depth, catalog, state, slot, identity, target_name, references, symbol, target_id,
  parent_slot, pending, reversed, site, prefix, subtotal, continuation, found, unlimited, fresh, parent):
  match parent:
    case (_, semantic):
      (Bootstrap.empty_accumulator(purpose),
        branch_continuation(depth, catalog, state, slot, identity, target_name, references, symbol, target_id,
          pending, prefix, subtotal, continuation, found, unlimited, fresh, semantic))

def main() -> Unit:
  Unit{}
