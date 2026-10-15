import Base
import ./CanonicalJsonPlan.bend as P
import ./CanonicalJsonPlanSpecification.bend as S
import ./CanonicalJsonRopePlanSpecification.bend as M

# Exact payload erasure, rather than sortedness or permutation, retains stable
# duplicate keys through the very same bottom-up merge decisions.
def fields_append(+xs: List<&2, P.RopeField>, +ys: List<&2, P.RopeField>) -> {
  M.fields(List.append(&2, P.RopeField, xs, ys))
  == List.append(&2, S.Field, M.fields(xs), M.fields(ys)) : List<&2, S.Field>
}:
  match xs:
    case []: {==}
    case head <> tail:
      Equal.cong(List<&2, S.Field>, List<&2, S.Field>, xs => M.field(head) <> xs,
        M.fields(List.append(&2, P.RopeField, tail, ys)),
        List.append(&2, S.Field, M.fields(tail), M.fields(ys)), fields_append(tail, ys))

def fields_reverse_go(+xs: List<&2, P.RopeField>, +acc: List<&2, P.RopeField>) -> {
  M.fields(List.reverse.go(&2, P.RopeField, xs, acc))
  == List.reverse.go(&2, S.Field, M.fields(xs), M.fields(acc)) : List<&2, S.Field>
}:
  match xs:
    case []: {==}
    case head <> tail: fields_reverse_go(tail, head <> acc)

def fields_concat(+xs: List<&2, List<&2, P.RopeField>>) -> {
  M.fields(List.concat(&2, P.RopeField, xs))
  == List.concat(&2, S.Field, M.runs(xs)) : List<&2, S.Field>
}:
  match xs:
    case []: {==}
    case head <> tail:
      Equal.trans(List<&2, S.Field>,
        M.fields(List.concat(&2, P.RopeField, head <> tail)),
        List.append(&2, S.Field, M.fields(head), M.fields(List.concat(&2, P.RopeField, tail))),
        List.concat(&2, S.Field, M.runs(head <> tail)),
        fields_append(head, List.concat(&2, P.RopeField, tail)),
        Equal.cong(List<&2, S.Field>, List<&2, S.Field>, xs => List.append(&2, S.Field, M.fields(head), xs),
          M.fields(List.concat(&2, P.RopeField, tail)), List.concat(&2, S.Field, M.runs(tail)), fields_concat(tail)))

def comparison_exact(+left: P.RopeField, +right: P.RopeField) -> {
  P.rope_fields_le(left, right) == S.fields_le(M.field(left), M.field(right)) : Bool
}:
  match left right:
    case P.RopeField{_, _} P.RopeField{_, _}: {==}

def merge_step_exact(+decision: Bool, +acc: List<&2, P.RopeField>, +x: P.RopeField,
  +xt: List<&2, P.RopeField>, +y: P.RopeField, +yt: List<&2, P.RopeField>) -> {
  M.merge_state(List.merge.step(P.RopeField, acc, x, xt, y, yt, decision))
  == List.merge.step(S.Field, M.fields(acc), M.field(x), M.fields(xt), M.field(y), M.fields(yt), decision)
  : List<&2, S.Field> & List<&2, S.Field> & List<&2, S.Field>
}:
  match decision:
    case True{}: {==}
    case False{}: {==}

def merge_empty(+acc: List<&2, P.RopeField>, +xs: List<&2, P.RopeField>, +ys: List<&2, P.RopeField>) -> {
  M.fields(List.reverse.go(&2, P.RopeField, acc, List.append(&2, P.RopeField, xs, ys)))
  == List.reverse.go(&2, S.Field, M.fields(acc), List.append(&2, S.Field, M.fields(xs), M.fields(ys)))
  : List<&2, S.Field>
}:
  Equal.trans(List<&2, S.Field>,
    M.fields(List.reverse.go(&2, P.RopeField, acc, List.append(&2, P.RopeField, xs, ys))),
    List.reverse.go(&2, S.Field, M.fields(acc), M.fields(List.append(&2, P.RopeField, xs, ys))),
    List.reverse.go(&2, S.Field, M.fields(acc), List.append(&2, S.Field, M.fields(xs), M.fields(ys))),
    fields_reverse_go(acc, List.append(&2, P.RopeField, xs, ys)),
    Equal.cong(List<&2, S.Field>, List<&2, S.Field>, zs => List.reverse.go(&2, S.Field, M.fields(acc), zs),
      M.fields(List.append(&2, P.RopeField, xs, ys)),
      List.append(&2, S.Field, M.fields(xs), M.fields(ys)), fields_append(xs, ys)))

def merge_exact(+fuel: Nat,
  state: List<&2, P.RopeField> & List<&2, P.RopeField> & List<&2, P.RopeField>) -> {
  M.fields(List.merge.go(~P.RopeField, ~P.rope_fields_le, fuel, state))
  == List.merge.go(~S.Field, ~S.fields_le, fuel, M.merge_state(state)) : List<&2, S.Field>
}:
  match fuel:
    case 0n:
      (acc, xs, ys) = state
      merge_empty(acc, xs, ys)
    case 1n+remaining:
      (+acc, xs, ys) = state
      match xs ys:
        case Nil{} Nil{}: fields_reverse_go(acc, [])
        case Nil{} y <> yt: fields_reverse_go(acc, y <> yt)
        case x <> xt Nil{}: fields_reverse_go(acc, x <> xt)
        case +x <> +xt +y <> +yt:
          Equal.trans(List<&2, S.Field>,
            M.fields(List.merge.go(~P.RopeField, ~P.rope_fields_le, remaining,
              List.merge.step(P.RopeField, acc, x, xt, y, yt, P.rope_fields_le(x, y)))),
            List.merge.go(~S.Field, ~S.fields_le, remaining,
              M.merge_state(List.merge.step(P.RopeField, acc, x, xt, y, yt, P.rope_fields_le(x, y)))),
            List.merge.go(~S.Field, ~S.fields_le, 1n+remaining, M.merge_state((acc, x <> xt, y <> yt))),
            merge_exact(remaining, List.merge.step(P.RopeField, acc, x, xt, y, yt, P.rope_fields_le(x, y))),
            Equal.cong(List<&2, S.Field> & List<&2, S.Field> & List<&2, S.Field>, List<&2, S.Field>,
              st => List.merge.go(~S.Field, ~S.fields_le, remaining, st),
              M.merge_state(List.merge.step(P.RopeField, acc, x, xt, y, yt, P.rope_fields_le(x, y))),
              List.merge.step(S.Field, M.fields(acc), M.field(x), M.fields(xt), M.field(y), M.fields(yt), S.fields_le(M.field(x), M.field(y))),
              Equal.trans(List<&2, S.Field> & List<&2, S.Field> & List<&2, S.Field>,
                M.merge_state(List.merge.step(P.RopeField, acc, x, xt, y, yt, P.rope_fields_le(x, y))),
                List.merge.step(S.Field, M.fields(acc), M.field(x), M.fields(xt), M.field(y), M.fields(yt), P.rope_fields_le(x, y)),
                List.merge.step(S.Field, M.fields(acc), M.field(x), M.fields(xt), M.field(y), M.fields(yt), S.fields_le(M.field(x), M.field(y))),
                merge_step_exact(P.rope_fields_le(x, y), acc, x, xt, y, yt),
                Equal.cong(Bool, List<&2, S.Field> & List<&2, S.Field> & List<&2, S.Field>,
                  decision => List.merge.step(S.Field, M.fields(acc), M.field(x), M.fields(xt), M.field(y), M.fields(yt), decision),
                  P.rope_fields_le(x, y), S.fields_le(M.field(x), M.field(y)), comparison_exact(x, y)))))

def runs_exact(+xs: List<&2, P.RopeField>) -> {
  M.runs(List.sort.runs(P.RopeField, xs))
  == List.sort.runs(S.Field, M.fields(xs)) : List<&2, List<&2, S.Field>>
}:
  match xs:
    case []: {==}
    case head <> tail:
      Equal.cong(List<&2, List<&2, S.Field>>, List<&2, List<&2, S.Field>>,
        rest => [M.field(head)] <> rest,
        M.runs(List.sort.runs(P.RopeField, tail)),
        List.sort.runs(S.Field, M.fields(tail)), runs_exact(tail))

def pass_exact(+n: Nat, +runs: List<&2, List<&2, P.RopeField>>) -> {
  M.runs(List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, runs))
  == List.sort.pass(~S.Field, ~S.fields_le, n, M.runs(runs)) : List<&2, List<&2, S.Field>>
}:
  match runs:
    case []: {==}
    case first <> []: {==}
    case first <> second <> rest:
      Equal.trans(List<&2, List<&2, S.Field>>,
        M.runs(List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, first <> second <> rest)),
        List.merge.go(~S.Field, ~S.fields_le, n, ([], M.fields(first), M.fields(second)))
          <> M.runs(List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, rest)),
        List.sort.pass(~S.Field, ~S.fields_le, n, M.runs(first <> second <> rest)),
        Equal.cong(List<&2, S.Field>, List<&2, List<&2, S.Field>>,
          head => head <> M.runs(List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, rest)),
          M.fields(List.merge.go(~P.RopeField, ~P.rope_fields_le, n, ([], first, second))),
          List.merge.go(~S.Field, ~S.fields_le, n, ([], M.fields(first), M.fields(second))),
          merge_exact(n, ([], first, second))),
        Equal.cong(List<&2, List<&2, S.Field>>, List<&2, List<&2, S.Field>>,
          tail => List.merge.go(~S.Field, ~S.fields_le, n, ([], M.fields(first), M.fields(second))) <> tail,
          M.runs(List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, rest)),
          List.sort.pass(~S.Field, ~S.fields_le, n, M.runs(rest)), pass_exact(n, rest)))

def go_exact(+fuel: Nat, +n: Nat, +runs: List<&2, List<&2, P.RopeField>>) -> {
  M.fields(List.sort.go(~P.RopeField, ~P.rope_fields_le, fuel, n, runs))
  == List.sort.go(~S.Field, ~S.fields_le, fuel, n, M.runs(runs)) : List<&2, S.Field>
}:
  match fuel runs:
    case 0n _: fields_concat(runs)
    case 1n+_ Nil{}: {==}
    case 1n+_ Con{_, Nil{}}: {==}
    case 1n+remaining Con{first, Con{second, rest}}:
      Equal.trans(List<&2, S.Field>,
        M.fields(List.sort.go(~P.RopeField, ~P.rope_fields_le, remaining, n,
          List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, first <> second <> rest))),
        List.sort.go(~S.Field, ~S.fields_le, remaining, n,
          M.runs(List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, first <> second <> rest))),
        List.sort.go(~S.Field, ~S.fields_le, 1n+remaining, n, M.runs(first <> second <> rest)),
        go_exact(remaining, n, List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, first <> second <> rest)),
        Equal.cong(List<&2, List<&2, S.Field>>, List<&2, S.Field>,
          rs => List.sort.go(~S.Field, ~S.fields_le, remaining, n, rs),
          M.runs(List.sort.pass(~P.RopeField, ~P.rope_fields_le, n, first <> second <> rest)),
          List.sort.pass(~S.Field, ~S.fields_le, n, M.runs(first <> second <> rest)),
          pass_exact(n, first <> second <> rest)))

def length_exact(+xs: List<&2, P.RopeField>) -> {
  List.length(&2, P.RopeField, xs) == List.length(&2, S.Field, M.fields(xs)) : Nat
}:
  match xs:
    case []: {==}
    case _ <> tail:
      Equal.cong(Nat, Nat, n => 1n+n,
        List.length(&2, P.RopeField, tail), List.length(&2, S.Field, M.fields(tail)), length_exact(tail))

def sort_with_size(+n: Nat, +xs: List<&2, P.RopeField>) -> {
  M.fields(List.sort.go(~P.RopeField, ~P.rope_fields_le, n, n, List.sort.runs(P.RopeField, xs)))
  == List.sort.go(~S.Field, ~S.fields_le, n, n, List.sort.runs(S.Field, M.fields(xs))) : List<&2, S.Field>
}:
  Equal.trans(List<&2, S.Field>,
    M.fields(List.sort.go(~P.RopeField, ~P.rope_fields_le, n, n, List.sort.runs(P.RopeField, xs))),
    List.sort.go(~S.Field, ~S.fields_le, n, n, M.runs(List.sort.runs(P.RopeField, xs))),
    List.sort.go(~S.Field, ~S.fields_le, n, n, List.sort.runs(S.Field, M.fields(xs))),
    go_exact(n, n, List.sort.runs(P.RopeField, xs)),
    Equal.cong(List<&2, List<&2, S.Field>>, List<&2, S.Field>,
      rs => List.sort.go(~S.Field, ~S.fields_le, n, n, rs),
      M.runs(List.sort.runs(P.RopeField, xs)), List.sort.runs(S.Field, M.fields(xs)), runs_exact(xs)))

def sort_exact(+xs: List<&2, P.RopeField>) -> {
  M.fields(List.sort(~P.RopeField, ~P.rope_fields_le, xs))
  == List.sort(~S.Field, ~S.fields_le, M.fields(xs)) : List<&2, S.Field>
}:
  match xs:
    case []: {==}
    case head <> tail:
      Equal.trans(List<&2, S.Field>,
        M.fields(List.sort(~P.RopeField, ~P.rope_fields_le, head <> tail)),
        List.sort.go(~S.Field, ~S.fields_le,
          List.length(&2, P.RopeField, head <> tail), List.length(&2, P.RopeField, head <> tail),
          List.sort.runs(S.Field, M.fields(head <> tail))),
        List.sort(~S.Field, ~S.fields_le, M.fields(head <> tail)),
        sort_with_size(List.length(&2, P.RopeField, head <> tail), head <> tail),
        Equal.cong(Nat, List<&2, S.Field>,
          n => List.sort.go(~S.Field, ~S.fields_le, n, n, List.sort.runs(S.Field, M.fields(head <> tail))),
          List.length(&2, P.RopeField, head <> tail), List.length(&2, S.Field, M.fields(head <> tail)),
          length_exact(head <> tail)))

def main() -> Unit:
  Unit{}
