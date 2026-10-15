import Base
import ./Model.bend as M
import ./Specification.bend as S
import ./Stack.bend as Stack
import ./StackLaws.bend as Laws

def append_after(+value: Maybe<&2, Nat>, +tail: List<&2, M.Op>, +right: List<&2, M.Op>, ih: @+next: Nat -> {
  Stack.depth(List.append(&2, M.Op, tail, right), next)
  == Stack.continue_depth(Stack.depth(tail, next), depth => Stack.depth(right, depth))
  : Maybe<&2, Nat>
}) -> {
  Stack.continue_depth(value, next => Stack.depth(List.append(&2, M.Op, tail, right), next))
  == Stack.continue_depth(Stack.continue_depth(value, next => Stack.depth(tail, next)), depth => Stack.depth(right, depth))
  : Maybe<&2, Nat>
}:
  match value:
    case None{}: {==}
    case Some{next}: ih(next)

def Laws.append_exact(left, right, depth):
  match left:
    case []: {==}
    case head <> +tail:
      append_after(Stack.operation(head, depth), tail, right,
        next => Laws.append_exact(tail, right, next))

def known_prefix(+left: List<&2, M.Op>, +tail: List<&2, M.Op>, +depth: Nat,
  exact: {Stack.depth(left, depth) == Some{1n+depth} : Maybe<&2, Nat>}) -> {
  Stack.depth(List.append(&2, M.Op, left, tail), depth) == Stack.depth(tail, 1n+depth) : Maybe<&2, Nat>
}:
  Equal.trans(Maybe<&2, Nat>,
    Stack.depth(List.append(&2, M.Op, left, tail), depth),
    Stack.continue_depth(Stack.depth(left, depth), next => Stack.depth(tail, next)),
    Stack.depth(tail, 1n+depth),
    Laws.append_exact(left, tail, depth),
    Equal.cong(Maybe<&2, Nat>, Maybe<&2, Nat>,
      value => Stack.continue_depth(value, next => Stack.depth(tail, next)),
      Stack.depth(left, depth), Some{1n+depth}, exact))

def combine(+left: List<&2, M.Op>, +right: List<&2, M.Op>, +final: List<&2, M.Op>, +depth: Nat,
  left_exact: {Stack.depth(left, depth) == Some{1n+depth} : Maybe<&2, Nat>},
  right_exact: {Stack.depth(right, 1n+depth) == Some{1n+1n+depth} : Maybe<&2, Nat>},
  final_exact: {Stack.depth(final, 1n+1n+depth) == Some{1n+depth} : Maybe<&2, Nat>}) -> {
  Stack.depth(List.append(&2, M.Op, left, List.append(&2, M.Op, right, final)), depth)
  == Some{1n+depth} : Maybe<&2, Nat>
}:
  Equal.trans(Maybe<&2, Nat>,
    Stack.depth(List.append(&2, M.Op, left, List.append(&2, M.Op, right, final)), depth),
    Stack.depth(List.append(&2, M.Op, right, final), 1n+depth),
    Some{1n+depth},
    known_prefix(left, List.append(&2, M.Op, right, final), depth, left_exact),
    Equal.trans(Maybe<&2, Nat>,
      Stack.depth(List.append(&2, M.Op, right, final), 1n+depth),
      Stack.depth(final, 1n+1n+depth), Some{1n+depth},
      known_prefix(right, final, 1n+depth, right_exact), final_exact))

def Laws.postfix_effect(expression, depth):
  match expression:
    case S.ArtifactBytes{_}: {==}
    case S.TextBytes{_}: {==}
    case S.Literal{_}: {==}
    case S.Add{+left, +right}:
      combine(S.postfix(left), S.postfix(right), [M.Add{}], depth,
        Laws.postfix_effect(left, depth), Laws.postfix_effect(right, 1n+depth), {==})
    case S.Multiply{+left, +right}:
      combine(S.postfix(left), S.postfix(right), [M.Multiply{}], depth,
        Laws.postfix_effect(left, depth), Laws.postfix_effect(right, 1n+depth), {==})

def prefix_depth(+left: List<&2, M.Op>, +tail: List<&2, M.Op>, +start: Nat, +finish: Nat,
  exact: {Stack.depth(left, start) == Some{finish} : Maybe<&2, Nat>}) -> {
  Stack.depth(List.append(&2, M.Op, left, tail), start) == Stack.depth(tail, finish) : Maybe<&2, Nat>
}:
  Equal.trans(Maybe<&2, Nat>, Stack.depth(List.append(&2, M.Op, left, tail), start),
    Stack.continue_depth(Stack.depth(left, start), next => Stack.depth(tail, next)), Stack.depth(tail, finish),
    Laws.append_exact(left, tail, start),
    Equal.cong(Maybe<&2, Nat>, Maybe<&2, Nat>, value => Stack.continue_depth(value, next => Stack.depth(tail, next)),
      Stack.depth(left, start), Some{finish}, exact))

def maybe_prefix(+left: List<&2, M.Op>, +tail: Maybe<&2, List<&2, M.Op>>, +start: Nat, +finish: Nat,
  exact: {Stack.depth(left, start) == Some{finish} : Maybe<&2, Nat>}) -> {
  Stack.maybe_depth(S.append_trace(Some{left}, tail), start) == Stack.maybe_depth(tail, finish) : Maybe<&2, Nat>
}:
  match tail:
    case None{}: {==}
    case Some{tail}: prefix_depth(left, tail, start, finish, exact)

def root_effect(+expression: S.BytesExpr) -> {
  Stack.depth(List.append(&2, M.Op, S.postfix(expression), [M.Add{}]), 1n) == Some{1n} : Maybe<&2, Nat>
}:
  known_prefix(S.postfix(expression), [M.Add{}], 1n, Laws.postfix_effect(expression, 1n))

def root_cons_effect(+result: S.NodeResult, +tail: Maybe<&2, List<&2, M.Op>>, +complete: Bool,
  ih: {Stack.maybe_depth(tail, 1n) == Bool.pick(Maybe<&2, Nat>, complete, Some{1n}, None{}) : Maybe<&2, Nat>}) -> {
  Stack.maybe_depth(S.append_trace(S.root_trace(result), tail), 1n)
  == Bool.pick(Maybe<&2, Nat>, Bool.and(S.node_complete(result), complete), Some{1n}, None{}) : Maybe<&2, Nat>
}:
  match result:
    case S.DepthExhausted{}: {==}
    case S.NodeResult{+state, +node, +expression}:
      Equal.trans(Maybe<&2, Nat>,
        Stack.maybe_depth(S.append_trace(S.root_trace(S.NodeResult{state, node, expression}), tail), 1n),
        Stack.maybe_depth(tail, 1n), Bool.pick(Maybe<&2, Nat>, complete, Some{1n}, None{}),
        maybe_prefix(List.append(&2, M.Op, S.postfix(expression), [M.Add{}]), tail, 1n, 1n, root_effect(expression)), ih)

def roots_effect(+roots: List<&2, M.Declaration>, +catalog: M.Catalog) -> {
  Stack.maybe_depth(S.roots_trace(roots, catalog), 1n)
  == Bool.pick(Maybe<&2, Nat>, S.roots_complete(roots, catalog), Some{1n}, None{}) : Maybe<&2, Nat>
}:
  match roots:
    case []: {==}
    case head <> +tail:
      root_cons_effect(S.analyze(head, catalog), S.roots_trace(tail, catalog), S.roots_complete(tail, catalog), roots_effect(tail, catalog))

def preflight_depth(+catalog: M.Catalog) -> {
  Stack.maybe_depth(S.preflight_trace(catalog), 0n)
  == Bool.pick(Maybe<&2, Nat>, S.complete(catalog), Some{1n}, None{}) : Maybe<&2, Nat>
}:
  Equal.trans(Maybe<&2, Nat>, Stack.maybe_depth(S.preflight_trace(catalog), 0n),
    Stack.maybe_depth(S.roots_trace(S.catalog_roots(catalog), catalog), 1n),
    Bool.pick(Maybe<&2, Nat>, S.complete(catalog), Some{1n}, None{}),
    maybe_prefix([M.Push{0n}], S.roots_trace(S.catalog_roots(catalog), catalog), 0n, 1n, {==}),
    roots_effect(S.catalog_roots(catalog), catalog))

def trace_valid_exact(+operations: Maybe<&2, List<&2, M.Op>>) -> {
  Stack.trace_valid(operations) == Stack.terminal(Stack.maybe_depth(operations, 0n)) : Bool
}:
  match operations:
    case None{}: {==}
    case Some{_}: {==}

def terminal_choice(+complete: Bool) -> {
  Stack.terminal(Bool.pick(Maybe<&2, Nat>, complete, Some{1n}, None{})) == complete : Bool
}:
  match complete:
    case False{}: {==}
    case True{}: {==}

def Laws.preflight_stack_effect(catalog):
  Equal.trans(Bool, Stack.trace_valid(S.preflight_trace(catalog)),
    Stack.terminal(Stack.maybe_depth(S.preflight_trace(catalog), 0n)), S.complete(catalog),
    trace_valid_exact(S.preflight_trace(catalog)),
    Equal.trans(Bool, Stack.terminal(Stack.maybe_depth(S.preflight_trace(catalog), 0n)),
      Stack.terminal(Bool.pick(Maybe<&2, Nat>, S.complete(catalog), Some{1n}, None{})), S.complete(catalog),
      Equal.cong(Maybe<&2, Nat>, Bool, Stack.terminal,
        Stack.maybe_depth(S.preflight_trace(catalog), 0n), Bool.pick(Maybe<&2, Nat>, S.complete(catalog), Some{1n}, None{}), preflight_depth(catalog)),
      terminal_choice(S.complete(catalog))))

def main() -> Unit:
  Unit{}
