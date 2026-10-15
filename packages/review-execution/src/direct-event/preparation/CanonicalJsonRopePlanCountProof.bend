import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as P
import ./CanonicalJsonPlanSpecification.bend as S
import ./CanonicalJsonRopePlanSpecification.bend as M
import ./CanonicalJsonRopePlanProof.bend as Trace
import ./CanonicalJsonRopePlanStackProof.bend as Stack
import ./CanonicalJsonRopePlanLaws.bend as Laws

# Only the count of each root is required: flatten ignores child caches.
def array_more_count(+values: List<&2, P.Rope>, +acc: P.Rope,
  counts: M.rope_counts(values), count: M.counted(acc)) -> M.counted(P.rope_array_more(values, acc)):
  match values:
    case []: Trace.join_count_exact(acc, P.RopePiece{P.LiteralPiece{"]"}}, count, {==})
    case +head <> +tail:
      (hc, tc) = counts
      array_more_count(tail, P.rope_join(acc, P.rope_join(P.RopePiece{P.LiteralPiece{","}}, head)), tc,
        Trace.join_count_exact(acc, P.rope_join(P.RopePiece{P.LiteralPiece{","}}, head), count,
          Trace.join_count_exact(P.RopePiece{P.LiteralPiece{","}}, head, {==}, hc)))

def array_parts_count(+values: List<&2, P.Rope>, counts: M.rope_counts(values)) -> M.counted(P.rope_array_parts(values)):
  match values:
    case []: {==}
    case +head <> +tail:
      (hc, tc) = counts
      array_more_count(tail, head, tc, hc)

def pop_count(+arity: Nat, +values: List<&2, P.Rope>, +acc: List<&2, P.Rope>,
  counts: M.rope_counts(values), accumulated: M.rope_counts(acc)) -> M.popped_counts(P.rope_pop(arity, values, acc)):
  match arity values:
    case 0n _: (accumulated, counts)
    case 1n+_ Nil{}: Unit{}
    case 1n+remaining Con{+head, +tail}:
      (hc, tc) = counts
      pop_count(remaining, tail, head <> acc, tc, (hc, accumulated))

def fields_append_count(+xs: List<&2, P.RopeField>, +ys: List<&2, P.RopeField>,
  xc: M.field_counts(xs), yc: M.field_counts(ys)) -> M.field_counts(List.append(&2, P.RopeField, xs, ys)):
  match xs:
    case []: yc
    case +head <> +tail:
      (hc, tc) = xc
      (hc, fields_append_count(tail, ys, tc, yc))

def fields_reverse_count(+xs: List<&2, P.RopeField>, +acc: List<&2, P.RopeField>,
  xc: M.field_counts(xs), ac: M.field_counts(acc)) -> M.field_counts(List.reverse.go(&2, P.RopeField, xs, acc)):
  match xs:
    case []: ac
    case +head <> +tail:
      (hc, tc) = xc
      fields_reverse_count(tail, head <> acc, tc, (hc, ac))

def fields_concat_count(+xs: List<&2, List<&2, P.RopeField>>, xc: M.run_counts(xs))
  -> M.field_counts(List.concat(&2, P.RopeField, xs)):
  match xs:
    case []: Unit{}
    case +head <> +tail:
      (hc, tc) = xc
      fields_append_count(head, List.concat(&2, P.RopeField, tail), hc, fields_concat_count(tail, tc))

def merge_both_count(+decision: Bool, +fuel: Nat, +acc: List<&2, P.RopeField>, +x: P.RopeField,
  +xt: List<&2, P.RopeField>, +y: P.RopeField, +yt: List<&2, P.RopeField>,
  ac: M.field_counts(acc), xc: M.counted(M.field_parts(x)), xtc: M.field_counts(xt),
  yc: M.counted(M.field_parts(y)), ytc: M.field_counts(yt),
  ih: @+a: List<&2, P.RopeField> -> @+xs: List<&2, P.RopeField> -> @+ys: List<&2, P.RopeField> ->
    M.field_counts(a) -> M.field_counts(xs) -> M.field_counts(ys) ->
    M.field_counts(List.merge.go(~P.RopeField, ~P.rope_fields_le, fuel, (a, xs, ys))))
  -> M.field_counts(List.merge.go(~P.RopeField, ~P.rope_fields_le, fuel,
    List.merge.step(P.RopeField, acc, x, xt, y, yt, decision))):
  match decision:
    case True{}: ih(x <> acc, xt, y <> yt, (xc, ac), xtc, (yc, ytc))
    case False{}: ih(y <> acc, x <> xt, yt, (yc, ac), (xc, xtc), ytc)

def merge_count(+fuel: Nat, +acc: List<&2, P.RopeField>, +xs: List<&2, P.RopeField>, +ys: List<&2, P.RopeField>,
  ac: M.field_counts(acc), xc: M.field_counts(xs), yc: M.field_counts(ys))
  -> M.field_counts(List.merge.go(~P.RopeField, ~P.rope_fields_le, fuel, (acc, xs, ys))):
  match fuel xs ys:
    case 0n _ _:
      fields_reverse_count(acc, List.append(&2, P.RopeField, xs, ys), ac, fields_append_count(xs, ys, xc, yc))
    case 1n+_ Nil{} Nil{}: fields_reverse_count(acc, [], ac, Unit{})
    case 1n+_ Nil{} Con{y, yt}: fields_reverse_count(acc, y <> yt, ac, yc)
    case 1n+_ Con{x, xt} Nil{}: fields_reverse_count(acc, x <> xt, ac, xc)
    case 1n+remaining Con{x, xt} Con{y, yt}:
      (xh, xrest) = xc
      (yh, yrest) = yc
      merge_both_count(P.rope_fields_le(x, y), remaining, acc, x, xt, y, yt, ac, xh, xrest, yh, yrest,
        a => xs => ys => ca => cx => cy => merge_count(remaining, a, xs, ys, ca, cx, cy))

def runs_count(+xs: List<&2, P.RopeField>, counts: M.field_counts(xs)) -> M.run_counts(List.sort.runs(P.RopeField, xs)):
  match xs:
    case []: Unit{}
    case +head <> +tail:
      (hc, tc) = counts
      ((hc, Unit{}), runs_count(tail, tc))

def pass_count(+n: Nat, +runs: List<&2, List<&2, P.RopeField>>, counts: M.run_counts(runs))
  -> M.run_counts(List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, runs)):
  match runs:
    case []: Unit{}
    case first <> []: counts
    case +first <> +second <> +rest:
      (fc, sc, rc) = counts
      (merge_count(n, [], first, second, Unit{}, fc, sc), pass_count(n, rest, rc))

def go_count(+fuel: Nat, +n: Nat, +runs: List<&2, List<&2, P.RopeField>>, counts: M.run_counts(runs))
  -> M.field_counts(List.sort.go(~P.RopeField, ~P.rope_fields_le, fuel, n, runs)):
  match fuel runs:
    case 0n _: fields_concat_count(runs, counts)
    case 1n+_ Nil{}: Unit{}
    case 1n+_ Con{_, Nil{}}:
      (first, _) = counts
      first
    case 1n+remaining Con{+first, Con{+second, +rest}}:
      go_count(remaining, n, List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, first <> second <> rest),
        pass_count(n, first <> second <> rest, counts))

def sort_count(+xs: List<&2, P.RopeField>, counts: M.field_counts(xs))
  -> M.field_counts(List.sort(~P.RopeField, ~P.rope_fields_le, xs)):
  match xs:
    case []: Unit{}
    case +head <> +tail:
      go_count(List.length(&2, P.RopeField, head <> tail), List.length(&2, P.RopeField, head <> tail),
        List.sort.runs(P.RopeField, head <> tail), runs_count(head <> tail, counts))

def pair_count(+keys: List<&2, String>, +values: List<&2, P.Rope>, +acc: List<&2, P.RopeField>,
  vc: M.rope_counts(values), ac: M.field_counts(acc)) -> M.maybe_counts(P.rope_pair_fields(keys, values, acc)):
  match keys values:
    case Nil{} Nil{}: fields_reverse_count(acc, [], ac, Unit{})
    case Con{key, keys} Con{+head, +tail}:
      (hc, tc) = vc
      pair_count(keys, tail, P.RopeField{key, head} <> acc, tc, (hc, ac))
    case Nil{} Con{_, _}: Unit{}
    case Con{_, _} Nil{}: Unit{}

def object_field_count(+field: P.RopeField, count: M.counted(M.field_parts(field)))
  -> M.counted(P.rope_object_field(field)):
  match field:
    case P.RopeField{key, parts}:
      Trace.join_count_exact(P.RopePiece{P.PrimitivePiece{Json.StringPrimitive{key}}},
        P.rope_join(P.RopePiece{P.LiteralPiece{":"}}, parts), {==},
        Trace.join_count_exact(P.RopePiece{P.LiteralPiece{":"}}, parts, {==}, count))

def object_more_count(+fields: List<&2, P.RopeField>, +acc: P.Rope,
  fc: M.field_counts(fields), ac: M.counted(acc)) -> M.counted(P.rope_object_more(fields, acc)):
  match fields:
    case []: Trace.join_count_exact(acc, P.RopePiece{P.LiteralPiece{"}"}}, ac, {==})
    case +head <> +tail:
      (hc, tc) = fc
      object_more_count(tail, P.rope_join(acc, P.rope_join(P.RopePiece{P.LiteralPiece{","}}, P.rope_object_field(head))), tc,
        Trace.join_count_exact(acc, P.rope_join(P.RopePiece{P.LiteralPiece{","}}, P.rope_object_field(head)), ac,
          Trace.join_count_exact(P.RopePiece{P.LiteralPiece{","}}, P.rope_object_field(head), {==}, object_field_count(head, hc))))

def object_parts_count(+fields: List<&2, P.RopeField>, fc: M.field_counts(fields))
  -> M.counted(P.rope_object_parts(fields)):
  match fields:
    case []: {==}
    case +head <> +tail:
      (hc, tc) = fc
      object_more_count(tail, P.rope_object_field(head), tc, object_field_count(head, hc))

def array_popped_count(+value: P.RopePopped, counts: M.popped_counts(value))
  -> M.stack_counts(P.rope_array_popped(value)):
  match value:
    case P.RopeUnderflow{}: Unit{}
    case P.RopePopped{+values, +rest}:
      (vc, rc) = counts
      (Trace.join_count_exact(P.RopePiece{P.LiteralPiece{"["}}, P.rope_array_parts(values), {==}, array_parts_count(values, vc)), rc)

def object_fields_count(+fields: Maybe<&2, List<&2, P.RopeField>>, +rest: List<&2, P.Rope>,
  fc: M.maybe_counts(fields), rc: M.rope_counts(rest)) -> M.stack_counts(P.rope_object_fields(fields, rest)):
  match fields:
    case None{}: Unit{}
    case Some{+fields}:
      (Trace.join_count_exact(P.RopePiece{P.LiteralPiece{"{"}},
        P.rope_object_parts(List.sort(~P.RopeField, ~P.rope_fields_le, fields)), {==},
        object_parts_count(List.sort(~P.RopeField, ~P.rope_fields_le, fields), sort_count(fields, fc))), rc)

def object_popped_count(+keys: List<&2, String>, +value: P.RopePopped, counts: M.popped_counts(value))
  -> M.stack_counts(P.rope_object_popped(keys, value)):
  match value:
    case P.RopeUnderflow{}: Unit{}
    case P.RopePopped{+values, +rest}:
      (vc, rc) = counts
      object_fields_count(P.rope_pair_fields(keys, values, []), rest, pair_count(keys, values, [], vc, Unit{}), rc)

def operation_count(+operation: P.Operation, +values: List<&2, P.Rope>, counts: M.rope_counts(values))
  -> M.stack_counts(P.rope_operation(operation, values)):
  match operation:
    case P.PrimitiveOperation{_}: ({==}, counts)
    case P.ArrayOperation{+arity}:
      array_popped_count(P.rope_pop(arity, values, []), pop_count(arity, values, [], counts, Unit{}))
    case P.ObjectOperation{+keys}:
      object_popped_count(keys, P.rope_pop(List.length(&2, String, keys), values, []),
        pop_count(List.length(&2, String, keys), values, [], counts, Unit{}))

def fold_count(+operations: List<&2, P.Operation>, +state: P.RopeStack, counts: M.stack_counts(state))
  -> M.stack_counts(P.rope_fold(operations, state)):
  match operations state:
    case Nil{} P.RopeInvalid{}: Unit{}
    case Con{_, _} P.RopeInvalid{}: Unit{}
    case Nil{} P.RopeValid{_}: counts
    case Con{+head, +tail} P.RopeValid{+values}:
      fold_count(tail, P.rope_operation(head, values), operation_count(head, values, counts))

def finish_exact(+state: P.RopeStack, counts: M.stack_counts(state)) -> {
  P.rope_finish(state) == S.finish(M.stack(state)) : Maybe<&2, List<&2, P.Piece>>
}:
  match state:
    case P.RopeInvalid{}: {==}
    case P.RopeValid{Nil{}}: {==}
    case P.RopeValid{Con{+head, Nil{}}}:
      (hc, _) = counts
      Trace.flatten_exact(head, hc)
    case P.RopeValid{Con{_, Con{_, _}}}: {==}

def Laws.compile_exact(operations):
  Equal.trans(Maybe<&2, List<&2, P.Piece>>,
    P.compile(operations),
    S.finish(M.stack(P.rope_fold(operations, P.RopeValid{[]}))),
    S.compile(operations),
    finish_exact(P.rope_fold(operations, P.RopeValid{[]}), fold_count(operations, P.RopeValid{[]}, Unit{})),
    Equal.cong(S.Stack, Maybe<&2, List<&2, P.Piece>>, S.finish,
      M.stack(P.rope_fold(operations, P.RopeValid{[]})), S.fold(operations, S.ValidStack{[]}),
      Stack.fold_exact(operations, P.RopeValid{[]})))

def main() -> Unit:
  Unit{}
