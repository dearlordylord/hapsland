import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K
import ./ContinuationLaws.bend as Laws
import ../graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend as N

def prefix_nil(+result: S.ReferencesResult) -> {K.completed_prefix([], result) == result : S.ReferencesResult}:
  match result:
    case S.ReferencesDepthExhausted{}: {==}
    case S.ReferencesResult{_, _, _}: {==}

def empty_accumulator(purpose: C.Purpose) -> K.accumulator_relation(purpose, [], []):
  match purpose:
    case C.Trees{}: {==}
    case C.Outcomes{}: {==}
    case C.Preflight{}: {==}

def initial_node(+depth: Nat, +request: S.Request, +catalog: M.Catalog, +slot: Nat) -> {
  S.node_result(K.completed_prefix([], S.as_references(S.interpret(Nat.sub(depth, 0n), request, catalog))), slot)
  == S.node_result(S.as_references(S.interpret(depth, request, catalog)), slot) : S.NodeResult
}:
  Equal.trans(S.NodeResult,
    S.node_result(K.completed_prefix([], S.as_references(S.interpret(Nat.sub(depth, 0n), request, catalog))), slot),
    S.node_result(S.as_references(S.interpret(Nat.sub(depth, 0n), request, catalog)), slot),
    S.node_result(S.as_references(S.interpret(depth, request, catalog)), slot),
    Equal.cong(S.ReferencesResult, S.NodeResult, result => S.node_result(result, slot),
      K.completed_prefix([], S.as_references(S.interpret(Nat.sub(depth, 0n), request, catalog))),
      S.as_references(S.interpret(Nat.sub(depth, 0n), request, catalog)),
      prefix_nil(S.as_references(S.interpret(Nat.sub(depth, 0n), request, catalog)))),
    Equal.cong(Nat, S.NodeResult, value => S.node_result(S.as_references(S.interpret(value, request, catalog)), slot),
      Nat.sub(depth, 0n), depth, N.sub_zero(depth)))

# Explicit root inventory exposes the leading successor, so the initial
# NodeRequest unfolds without a totality assumption.
def Laws.root_frame_initial(root, catalog, purpose):
  match root catalog:
    case M.Declaration{+slot, identity, +name, +references} M.Catalog{+declarations, +supporting}:
      (empty_accumulator(purpose), initial_node(
        Nat.add(Nat.add(List.length(&2, M.Reference, references),
          Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting))),
          S.declaration_entries(M.Catalog{declarations, supporting})),
        S.ReferencesRequest{references, S.State{name, [identity], [], None{}}, S.Add{S.ArtifactBytes{slot}, S.Literal{512n}}},
        M.Catalog{declarations, supporting}, slot))

def main() -> Unit:
  Unit{}
