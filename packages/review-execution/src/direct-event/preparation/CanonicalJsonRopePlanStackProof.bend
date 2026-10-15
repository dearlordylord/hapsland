import Base
import ./CanonicalJsonPlan.bend as P
import ./CanonicalJsonPlanSpecification.bend as S
import ./CanonicalJsonRopePlanSpecification.bend as M
import ./CanonicalJsonRopePlanProof.bend as Trace
import ./CanonicalJsonRopePlanSortProof.bend as Sort

# Erasure is exact even for malformed stacks; no tree/shape/count premise.
def pop_exact(+arity: Nat, +values: List<&2, P.Rope>, +acc: List<&2, P.Rope>) -> {
  M.popped(P.rope_pop(arity, values, acc)) == S.pop(arity, M.traces(values), M.traces(acc)) : S.Popped
}:
  match arity values:
    case 0n _: {==}
    case 1n+_ Nil{}: {==}
    case 1n+remaining Con{head, tail}: pop_exact(remaining, tail, head <> acc)

def pair_exact(+keys: List<&2, String>, +values: List<&2, P.Rope>, +acc: List<&2, P.RopeField>) -> {
  M.maybe_fields(P.rope_pair_fields(keys, values, acc))
  == S.pair_fields(keys, M.traces(values), M.fields(acc)) : Maybe<&2, List<&2, S.Field>>
}:
  match keys values:
    case Nil{} Nil{}:
      Equal.cong(List<&2, S.Field>, Maybe<&2, List<&2, S.Field>>, xs => Some{xs},
        M.fields(List.reverse(&2, P.RopeField, acc)), List.reverse(&2, S.Field, M.fields(acc)),
        Sort.fields_reverse_go(acc, []))
    case Con{key, keys} Con{parts, values}:
      pair_exact(keys, values, P.RopeField{key, parts} <> acc)
    case Nil{} Con{_, _}: {==}
    case Con{_, _} Nil{}: {==}

def array_popped_exact(+value: P.RopePopped) -> {
  M.stack(P.rope_array_popped(value)) == S.array_popped(M.popped(value)) : S.Stack
}:
  match value:
    case P.RopeUnderflow{}: {==}
    case P.RopePopped{values, rest}:
      Equal.cong(List<&2, P.Piece>, S.Stack,
        parts => S.ValidStack{(P.LiteralPiece{"["} <> parts) <> M.traces(rest)},
        M.trace(P.rope_array_parts(values)), S.array_parts(M.traces(values)), Trace.array_parts_exact(values))

def sorted_parts_exact(+fields: List<&2, P.RopeField>) -> {
  M.trace(P.rope_object_parts(List.sort(~P.RopeField, ~P.rope_fields_le, fields)))
  == S.object_parts(List.sort(~S.Field, ~S.fields_le, M.fields(fields))) : List<&2, P.Piece>
}:
  Equal.trans(List<&2, P.Piece>,
    M.trace(P.rope_object_parts(List.sort(~P.RopeField, ~P.rope_fields_le, fields))),
    S.object_parts(M.fields(List.sort(~P.RopeField, ~P.rope_fields_le, fields))),
    S.object_parts(List.sort(~S.Field, ~S.fields_le, M.fields(fields))),
    Trace.object_parts_exact(List.sort(~P.RopeField, ~P.rope_fields_le, fields)),
    Equal.cong(List<&2, S.Field>, List<&2, P.Piece>, S.object_parts,
      M.fields(List.sort(~P.RopeField, ~P.rope_fields_le, fields)),
      List.sort(~S.Field, ~S.fields_le, M.fields(fields)), Sort.sort_exact(fields)))

def object_fields_exact(+fields: Maybe<&2, List<&2, P.RopeField>>, +rest: List<&2, P.Rope>) -> {
  M.stack(P.rope_object_fields(fields, rest)) == S.object_fields(M.maybe_fields(fields), M.traces(rest)) : S.Stack
}:
  match fields:
    case None{}: {==}
    case Some{fields}:
      Equal.cong(List<&2, P.Piece>, S.Stack,
        parts => S.ValidStack{(P.LiteralPiece{"{"} <> parts) <> M.traces(rest)},
        M.trace(P.rope_object_parts(List.sort(~P.RopeField, ~P.rope_fields_le, fields))),
        S.object_parts(List.sort(~S.Field, ~S.fields_le, M.fields(fields))), sorted_parts_exact(fields))

def object_popped_exact(+keys: List<&2, String>, +value: P.RopePopped) -> {
  M.stack(P.rope_object_popped(keys, value)) == S.object_popped(keys, M.popped(value)) : S.Stack
}:
  match value:
    case P.RopeUnderflow{}: {==}
    case P.RopePopped{values, rest}:
      Equal.trans(S.Stack,
        M.stack(P.rope_object_fields(P.rope_pair_fields(keys, values, []), rest)),
        S.object_fields(M.maybe_fields(P.rope_pair_fields(keys, values, [])), M.traces(rest)),
        S.object_popped(keys, M.popped(P.RopePopped{values, rest})),
        object_fields_exact(P.rope_pair_fields(keys, values, []), rest),
        Equal.cong(Maybe<&2, List<&2, S.Field>>, S.Stack, fields => S.object_fields(fields, M.traces(rest)),
          M.maybe_fields(P.rope_pair_fields(keys, values, [])), S.pair_fields(keys, M.traces(values), []),
          pair_exact(keys, values, [])))

def operation_exact(+value: P.Operation, +stack: List<&2, P.Rope>) -> {
  M.stack(P.rope_operation(value, stack)) == S.operation(value, M.traces(stack)) : S.Stack
}:
  match value:
    case P.PrimitiveOperation{_}: {==}
    case P.ArrayOperation{arity}:
      Equal.trans(S.Stack,
        M.stack(P.rope_array_popped(P.rope_pop(arity, stack, []))),
        S.array_popped(M.popped(P.rope_pop(arity, stack, []))),
        S.operation(P.ArrayOperation{arity}, M.traces(stack)),
        array_popped_exact(P.rope_pop(arity, stack, [])),
        Equal.cong(S.Popped, S.Stack, S.array_popped,
          M.popped(P.rope_pop(arity, stack, [])), S.pop(arity, M.traces(stack), []), pop_exact(arity, stack, [])))
    case P.ObjectOperation{keys}:
      Equal.trans(S.Stack,
        M.stack(P.rope_object_popped(keys, P.rope_pop(List.length(&2, String, keys), stack, []))),
        S.object_popped(keys, M.popped(P.rope_pop(List.length(&2, String, keys), stack, []))),
        S.operation(P.ObjectOperation{keys}, M.traces(stack)),
        object_popped_exact(keys, P.rope_pop(List.length(&2, String, keys), stack, [])),
        Equal.cong(S.Popped, S.Stack, popped => S.object_popped(keys, popped),
          M.popped(P.rope_pop(List.length(&2, String, keys), stack, [])),
          S.pop(List.length(&2, String, keys), M.traces(stack), []),
          pop_exact(List.length(&2, String, keys), stack, [])))

def fold_exact(+operations: List<&2, P.Operation>, +state: P.RopeStack) -> {
  M.stack(P.rope_fold(operations, state)) == S.fold(operations, M.stack(state)) : S.Stack
}:
  match operations state:
    case Nil{} P.RopeInvalid{}: {==}
    case Con{_, _} P.RopeInvalid{}: {==}
    case Nil{} P.RopeValid{_}: {==}
    case Con{head, tail} P.RopeValid{stack}:
      Equal.trans(S.Stack,
        M.stack(P.rope_fold(tail, P.rope_operation(head, stack))),
        S.fold(tail, M.stack(P.rope_operation(head, stack))),
        S.fold(head <> tail, M.stack(P.RopeValid{stack})),
        fold_exact(tail, P.rope_operation(head, stack)),
        Equal.cong(S.Stack, S.Stack, state => S.fold(tail, state),
          M.stack(P.rope_operation(head, stack)), S.operation(head, M.traces(stack)), operation_exact(head, stack)))

def main() -> Unit:
  Unit{}
