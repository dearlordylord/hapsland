import Base
import ./Model.bend as M
import ./Specification.bend as S
import ./Stack.bend as Stack

# Composing command lists preserves refusal and the exact intermediate depth.
law append_exact:
  for +left: List<&2, M.Op>
  for +right: List<&2, M.Op>
  for +depth: Nat
  {Stack.depth(List.append(&2, M.Op, left, right), depth)
    == Stack.continue_depth(Stack.depth(left, depth), next => Stack.depth(right, next))
    : Maybe<&2, Nat>}

# Each expression leaves exactly one additional stack value and cannot underflow,
# for any existing prefix depth. This is independent of numeric engine behavior.
law postfix_effect:
  for +expression: S.BytesExpr
  for +depth: Nat
  {Stack.depth(S.postfix(expression), depth) == Some{1n+depth} : Maybe<&2, Nat>}

# Successful original preflight traces have terminal depth exactly one. This
# equivalence does not assert that the recursive specification always finishes;
# derived_budget_sufficient remains responsible for universal completion.
law preflight_stack_effect:
  for +catalog: M.Catalog
  {Stack.trace_valid(S.preflight_trace(catalog)) == S.complete(catalog) : Bool}

def main() -> Unit:
  Unit{}
