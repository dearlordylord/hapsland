import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S

# Proof-only continuation of one existing Spec ReferencesRequest. Each parked
# parent retains its own depth, not the depth used inside its child's request.
# This owner neither traverses a catalog nor introduces another evaluator.
def completed_prefix(
  prefix: List<&2, M.ReferencePlan>,
  result: S.ReferencesResult
) -> S.ReferencesResult:
  match result:
    case S.ReferencesDepthExhausted{}: S.ReferencesDepthExhausted{}
    case S.ReferencesResult{state, references, subtotal}:
      S.ReferencesResult{state, List.append(&2, M.ReferencePlan, prefix, references), subtotal}

def accumulator_relation(
  purpose: C.Purpose,
  reversed: List<&2, M.ReferencePlan>,
  prefix: List<&2, M.ReferencePlan>
) -> Type:
  match purpose:
    case C.Trees{}: {
      List.reverse(&2, M.ReferencePlan, reversed)
      == prefix
      : List<&2, M.ReferencePlan>
    }
    case _: {reversed == [] : List<&2, M.ReferencePlan>}

# The continuation is instantiated by the root theorem, not an assumption
# granting arbitrary success. Initial root correspondence may equate
# exhausted Spec results; terminal Core completion must later rule them out. Child and sibling cases unfold the original interpret
# equation and retain its exact predecessor depths.
def frame_relation(frame: C.Frame, purpose: C.Purpose, reference_depth: Nat,
  +prefix: List<&2, M.ReferencePlan>, subtotal: S.BytesExpr, state: S.State,
  catalog: M.Catalog, continuation: S.ReferencesResult -> Type) -> Type:
  match frame:
    case C.Frame{_, pending, reversed, _}:
      accumulator_relation(purpose, reversed, prefix)
      & continuation(completed_prefix(prefix, S.as_references(S.interpret(reference_depth,
        S.ReferencesRequest{pending, state, subtotal}, catalog))))

# Exact parked parent continuation in the independent Spec child equation.
# The parent depth is the reference equation's predecessor; it is not the
# smaller depth used for the child's own reference equation.
def child_continuation(
  result: S.ReferencesResult,
  child_slot: Nat,
  parent_depth: Nat,
  parent_pending: List<&2, M.Reference>,
  parent_prefix: List<&2, M.ReferencePlan>,
  charged_subtotal: S.BytesExpr,
  symbol: String,
  +catalog: M.Catalog,
  continuation: S.ReferencesResult -> Type
) -> Type:
  continuation(completed_prefix(parent_prefix,
    S.after_reference(S.expanded_child(S.node_result(result, child_slot), symbol, charged_subtotal),
      state => subtotal => S.as_references(S.interpret(parent_depth,
        S.ReferencesRequest{parent_pending, state, subtotal}, catalog)))))

def returned_reference(
  child_slot: Nat,
  child_prefix: List<&2, M.ReferencePlan>,
  symbol: String
) -> M.ReferencePlan:
  M.Expanded{symbol, M.NodePlan{child_slot, child_prefix}}

# Bootstrap compares the original Spec equation without assuming it completes.
# The terminal Core case, rather than this initial relation, must establish
# that the matching result is a NodeResult instead of DepthExhausted.
def root_continuation(result: S.ReferencesResult, +root: M.Declaration, catalog: M.Catalog) -> Type:
  {S.node_result(result, S.declaration_slot(root)) == S.analyze(root, catalog) : S.NodeResult}

# The root's declaration equation has already consumed exactly one depth.
def root_reference_depth(root: M.Declaration, catalog: M.Catalog) -> Nat:
  Nat.sub(S.recursive_depth(root, catalog), 1n)

def initial_frame(root: M.Declaration) -> C.Frame:
  match root:
    case M.Declaration{slot, _, _, references}: C.Frame{slot, references, [], None{}}

def initial_subtotal(root: M.Declaration) -> S.BytesExpr:
  match root:
    case M.Declaration{slot, _, _, _}: S.Add{S.ArtifactBytes{slot}, S.Literal{512n}}

def root_frame_relation(+root: M.Declaration, +catalog: M.Catalog, purpose: C.Purpose) -> Type:
  frame_relation(initial_frame(root), purpose, root_reference_depth(root, catalog), [], initial_subtotal(root),
    S.initial_state(root), catalog, result => root_continuation(result, root, catalog))

# Child node entry consumes one additional depth beyond the reference
# equation. Its sibling continuation retains the reference predecessor.
def sibling_depth(reference_depth: Nat) -> Nat:
  Nat.sub(reference_depth, 1n)

def child_reference_depth(reference_depth: Nat) -> Nat:
  Nat.sub(Nat.sub(reference_depth, 1n), 1n)

def main() -> Unit:
  Unit{}
