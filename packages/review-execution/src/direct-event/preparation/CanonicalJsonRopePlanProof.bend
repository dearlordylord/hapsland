import Base
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend as O
import ./CanonicalJsonPlan.bend as P
import ./CanonicalJsonRopePlanSpecification.bend as M
import ./CanonicalJsonPlanSpecification.bend as S
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/GRAPH_LIST_FACTS.bend as L

# This invariant removes every accumulated join without copying its trace.
def array_more_exact(
  +values: List<&2, P.Rope>, +accumulated: P.Rope
) -> {
  M.trace(P.rope_array_more(values, accumulated))
  == List.append(&2, P.Piece, M.trace(accumulated), M.array_suffix(values))
  : List<&2, P.Piece>
}:
  match values:
    case []: {==}
    case value <> tail:
      Equal.trans(
        List<&2, P.Piece>,
        M.trace(
          P.rope_array_more(
            tail,
            P.rope_join(
              accumulated,
              P.rope_join(P.RopePiece{P.LiteralPiece{","}}, value)
            )
          )
        ),
        List.append(
          &2,
          P.Piece,
          List.append(
            &2,
            P.Piece,
            M.trace(accumulated),
            P.LiteralPiece{","} <> M.trace(value)
          ),
          M.array_suffix(tail)
        ),
        List.append(&2, P.Piece, M.trace(accumulated), M.array_suffix(value <> tail)),
        array_more_exact(
          tail,
          P.rope_join(accumulated, P.rope_join(P.RopePiece{P.LiteralPiece{","}}, value))
        ),
        L.append_assoc(&2, P.Piece, M.trace(accumulated),
          P.LiteralPiece{","} <> M.trace(value), M.array_suffix(tail))
      )

# Stable original list equations determine the comma suffix, even for empty
# child traces. This is not a well-formed-JSON premise.
def suffix_nonempty(+tail: List<&2, P.Rope>, +head: P.Rope) -> {
  M.array_suffix(head <> tail)
  == P.LiteralPiece{","} <> S.array_parts(M.traces(head <> tail))
  : List<&2, P.Piece>
}:
  match tail:
    case []: {==}
    case value <> rest:
      Equal.cong(
        List<&2, P.Piece>, List<&2, P.Piece>,
        xs => P.LiteralPiece{","} <> List.append(&2, P.Piece, M.trace(head), xs),
        M.array_suffix(value <> rest),
        P.LiteralPiece{","} <> S.array_parts(M.traces(value <> rest)),
        suffix_nonempty(rest, value)
      )

def array_parts_exact(+values: List<&2, P.Rope>) -> {
  M.trace(P.rope_array_parts(values))
  == S.array_parts(M.traces(values))
  : List<&2, P.Piece>
}:
  match values:
    case []: {==}
    case head <> []: array_more_exact([], head)
    case head <> value <> rest:
      Equal.trans(
        List<&2, P.Piece>,
        M.trace(P.rope_array_more(value <> rest, head)),
        List.append(&2, P.Piece, M.trace(head), M.array_suffix(value <> rest)),
        S.array_parts(M.traces(head <> value <> rest)),
        array_more_exact(value <> rest, head),
        Equal.cong(
          List<&2, P.Piece>, List<&2, P.Piece>,
          xs => List.append(&2, P.Piece, M.trace(head), xs),
          M.array_suffix(value <> rest),
          P.LiteralPiece{","} <> S.array_parts(M.traces(value <> rest)),
          suffix_nonempty(rest, value)
        )
      )

def reverse_piece(+reversed: List<&2, P.Piece>, +piece: P.Piece,
  +rest: List<&2, P.Piece>) -> {
  List.append(&2, P.Piece, List.reverse(&2, P.Piece, piece <> reversed), rest)
  == List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), piece <> rest)
  : List<&2, P.Piece>
}:
  Equal.trans(
    List<&2, P.Piece>,
    List.append(&2, P.Piece, List.reverse(&2, P.Piece, piece <> reversed), rest),
    List.append(&2, P.Piece,
      List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), [piece]), rest),
    List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), piece <> rest),
    Equal.cong(List<&2, P.Piece>, List<&2, P.Piece>,
      xs => List.append(&2, P.Piece, xs, rest),
      List.reverse(&2, P.Piece, piece <> reversed),
      List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), [piece]),
      L.reverse_go_spec(&2, P.Piece, reversed, [piece])),
    L.append_assoc(&2, P.Piece, List.reverse(&2, P.Piece, reversed), [piece], rest)
  )

def predecessor(value: Nat) -> Nat:
  match value:
    case 0n: 0n
    case 1n+rest: rest

# Cached counts are deliberately irrelevant here: traversal visits the actual
# shape. Fold will separately establish that its root cache equals this budget.
def flatten_go_exact(
  +fuel: Nat, +pending: List<&2, P.Rope>, +reversed: List<&2, P.Piece>,
  budget: {fuel == M.forest_nodes(pending) : Nat}
) -> {
  P.rope_flatten_go(fuel, pending, reversed)
  == Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), M.forest_trace(pending))}
  : Maybe<&2, List<&2, P.Piece>>
}:
  match fuel pending:
    case 0n Nil{}:
      Equal.cong(List<&2, P.Piece>, Maybe<&2, List<&2, P.Piece>>, xs => Some{xs},
        List.reverse(&2, P.Piece, reversed),
        List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), []),
        Equal.sym(List<&2, P.Piece>,
          List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), []),
          List.reverse(&2, P.Piece, reversed),
          L.append_nil(&2, P.Piece, List.reverse(&2, P.Piece, reversed))))
    case 0n Con{P.RopePiece{piece}, rest}:
      Empty.absurd({P.rope_flatten_go(0n, P.RopePiece{piece} <> rest, reversed)
        == Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed),
          M.forest_trace(P.RopePiece{piece} <> rest))} : Maybe<&2, List<&2, P.Piece>>},
        O.internal_false_ne_true(Equal.cong(Nat, Bool, n => Nat.is_eq(0n, n),
          M.forest_nodes(P.RopePiece{piece} <> rest), 0n,
          Equal.sym(Nat, 0n, M.forest_nodes(P.RopePiece{piece} <> rest), budget))))
    case 0n Con{P.RopeJoin{nodes, left, right}, rest}:
      Empty.absurd({P.rope_flatten_go(0n, P.RopeJoin{nodes, left, right} <> rest, reversed)
        == Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed),
          M.forest_trace(P.RopeJoin{nodes, left, right} <> rest))} : Maybe<&2, List<&2, P.Piece>>},
        O.internal_false_ne_true(Equal.cong(Nat, Bool, n => Nat.is_eq(0n, n),
          M.forest_nodes(P.RopeJoin{nodes, left, right} <> rest), 0n,
          Equal.sym(Nat, 0n, M.forest_nodes(P.RopeJoin{nodes, left, right} <> rest), budget))))
    case 1n+remaining Nil{}:
      Empty.absurd({P.rope_flatten_go(1n+remaining, [], reversed)
        == Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), [])}
        : Maybe<&2, List<&2, P.Piece>>},
        O.internal_false_ne_true(Equal.cong(Nat, Bool, n => Nat.is_eq(n, 0n),
          1n+remaining, 0n, budget)))
    case 1n+remaining Con{P.RopePiece{piece}, rest}:
      Equal.trans(Maybe<&2, List<&2, P.Piece>>,
        P.rope_flatten_go(remaining, rest, piece <> reversed),
        Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, piece <> reversed), M.forest_trace(rest))},
        Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), piece <> M.forest_trace(rest))},
        flatten_go_exact(remaining, rest, piece <> reversed,
          Equal.cong(Nat, Nat, predecessor, 1n+remaining, 1n+M.forest_nodes(rest), budget)),
        Equal.cong(List<&2, P.Piece>, Maybe<&2, List<&2, P.Piece>>, xs => Some{xs},
          List.append(&2, P.Piece, List.reverse(&2, P.Piece, piece <> reversed), M.forest_trace(rest)),
          List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), piece <> M.forest_trace(rest)),
          reverse_piece(reversed, piece, M.forest_trace(rest))))
    case 1n+remaining Con{P.RopeJoin{nodes, left, right}, rest}:
      Equal.trans(Maybe<&2, List<&2, P.Piece>>,
        P.rope_flatten_go(remaining, left <> right <> rest, reversed),
        Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), M.forest_trace(left <> right <> rest))},
        Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed),
          M.forest_trace(P.RopeJoin{nodes, left, right} <> rest))},
        flatten_go_exact(remaining, left <> right <> rest, reversed,
          Equal.trans(Nat, remaining,
            Nat.add(Nat.add(M.true_nodes(left), M.true_nodes(right)), M.forest_nodes(rest)),
            M.forest_nodes(left <> right <> rest),
            Equal.cong(Nat, Nat, predecessor, 1n+remaining,
              1n+Nat.add(Nat.add(M.true_nodes(left), M.true_nodes(right)), M.forest_nodes(rest)), budget),
            N.add_assoc(M.true_nodes(left), M.true_nodes(right), M.forest_nodes(rest)))),
        Equal.cong(List<&2, P.Piece>, Maybe<&2, List<&2, P.Piece>>,
          xs => Some{List.append(&2, P.Piece, List.reverse(&2, P.Piece, reversed), xs)},
          M.forest_trace(left <> right <> rest),
          M.forest_trace(P.RopeJoin{nodes, left, right} <> rest),
          Equal.sym(List<&2, P.Piece>,
            M.forest_trace(P.RopeJoin{nodes, left, right} <> rest),
            M.forest_trace(left <> right <> rest),
            L.append_assoc(&2, P.Piece, M.trace(left), M.trace(right), M.forest_trace(rest)))))

# A root's exact count is sufficient; flatten never consults child caches.
def flatten_exact(+value: P.Rope,
  counted: {P.rope_nodes(value) == M.true_nodes(value) : Nat}) -> {
  P.rope_flatten(value) == Some{M.trace(value)}
  : Maybe<&2, List<&2, P.Piece>>
}:
  Equal.trans(Maybe<&2, List<&2, P.Piece>>,
    P.rope_flatten(value),
    Some{M.forest_trace([value])},
    Some{M.trace(value)},
    flatten_go_exact(P.rope_nodes(value), [value], [],
      Equal.trans(Nat, P.rope_nodes(value), M.true_nodes(value),
        M.forest_nodes([value]), counted,
        Equal.sym(Nat, M.forest_nodes([value]), M.true_nodes(value),
          N.add_zero(M.true_nodes(value))))),
    Equal.cong(List<&2, P.Piece>, Maybe<&2, List<&2, P.Piece>>, xs => Some{xs},
      M.forest_trace([value]), M.trace(value),
      L.append_nil(&2, P.Piece, M.trace(value))))

def join_count_exact(+left: P.Rope, +right: P.Rope,
  left_counted: {P.rope_nodes(left) == M.true_nodes(left) : Nat},
  right_counted: {P.rope_nodes(right) == M.true_nodes(right) : Nat}) -> {
  P.rope_nodes(P.rope_join(left, right)) == M.true_nodes(P.rope_join(left, right)) : Nat
}:
  Equal.trans(Nat,
    P.rope_nodes(P.rope_join(left, right)),
    Nat.add(1n, Nat.add(M.true_nodes(left), P.rope_nodes(right))),
    M.true_nodes(P.rope_join(left, right)),
    Equal.cong(Nat, Nat, n => Nat.add(1n, Nat.add(n, P.rope_nodes(right))),
      P.rope_nodes(left), M.true_nodes(left), left_counted),
    Equal.cong(Nat, Nat, n => Nat.add(1n, Nat.add(M.true_nodes(left), n)),
      P.rope_nodes(right), M.true_nodes(right), right_counted))

def main() -> Unit:
  Unit{}
