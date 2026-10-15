import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Joint.bend as J

# A single existing Spec reference equation distinguishes all no-child
# branches. Returning DepthExhausted from the child callback excludes fresh
# descent; it is not a second traversal or a completion assumption.
def result(+reference: M.Reference, state: S.State, catalog: M.Catalog,
  subtotal: S.BytesExpr) -> S.ReferenceResult:
  S.visit_reference(reference, state, catalog, subtotal, _ => _ => S.DepthExhausted{})

def operations(reference: M.Reference, +catalog: M.Catalog, purpose: C.Purpose) -> List<&2, M.Op>:
  match reference:
    case M.Unsupported{symbol}: C.edge_operations(purpose, symbol, None{})
    case M.Named{+symbol, target_id}: C.edge_operations(
      purpose,
      symbol,
      C.lookup(catalog, symbol, target_id)
    )

# The successor retains every actual frame field and all shared state from
# the Spec reference result, including the original first-failure choice.
def successor(rest: Nat, actual: C.Cursor, state: S.State, plan: M.ReferencePlan) -> C.Cursor:
  match actual state:
    case C.Cursor{
      +global,
      slot,
      _,
      _,
      _,
      _,
      _,
      C.Frame{parent_slot, _ <> pending, reversed, site} <> parents
    }
      S.State{name, expanded, referenced, failure}:
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        rest,
        C.Frame{
          parent_slot,
          pending,
          C.keep_reference(C.global_purpose(global), plan, reversed),
          site
        } <> parents
      }
    case cursor _: cursor

def ghosts(depth: Nat, values: List<&2, J.Ghost>, plan: M.ReferencePlan,
  subtotal: S.BytesExpr) -> List<&2, J.Ghost>:
  match values:
    case J.Ghost{_, prefix, _} <> rest:
      J.Ghost{depth, List.append(&2, M.ReferencePlan, prefix, [plan]), subtotal} <> rest
    case []: []

# A fresh result is excluded only by this internal branch scope. The proof
# must connect that exclusion to actual Core lookup/limit/seen dispatch.
def preserved(result: S.ReferenceResult, +root: M.Declaration, +invocation: C.Global,
  +request: Nat, +actual: C.Cursor, +values: List<&2, J.Ghost>, +rest: Nat,
  +depth: Nat, +reference: M.Reference) -> Type:
  match result:
    case S.ReferenceDepthExhausted{}: Unit
    case S.ReferenceResult{+state, +plan, subtotal}:
      J.cursor(root, invocation, request, actual, values)
      -> J.cursor(root, invocation, request, successor(rest, actual, state, plan),
        ghosts(depth, values, plan, subtotal))
      & {
        C.advance_cursor(actual)
        == C.cursor_ops(
          successor(rest, actual, state, plan),
          operations(reference, C.global_catalog(invocation), C.global_purpose(invocation))
        )
        : C.Step
      }

def reference_case(+root: M.Declaration, +invocation: C.Global, +request: Nat,
  +actual: C.Cursor, +values: List<&2, J.Ghost>) -> Type:
  match actual values:
    case C.Cursor{_, _, +name, +expanded, +referenced, +failure, 1n++rest,
      C.Frame{_, +reference <> _, _, _} <> _} J.Ghost{1n++depth, _, subtotal} <> _:
      preserved(
        result(
          reference,
          S.State{name, expanded, referenced, failure},
          C.global_catalog(invocation),
          subtotal
        ),
        root,
        invocation,
        request,
        actual,
        values,
        rest,
        depth,
        reference
      )
    case _ _: Unit

def main() -> Unit:
  Unit{}
