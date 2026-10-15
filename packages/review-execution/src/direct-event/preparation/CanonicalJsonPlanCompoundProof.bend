import Base
import ./CanonicalJsonPlanCompoundLaws.bend as Laws
import ./CanonicalJsonPlanLaws.bend as Local
import ./CanonicalJsonPlanProof.bend as LocalProof
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJson.bend as Json
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/GRAPH_REVERSE_FACTS.bend as Reverse
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend as Nats

def reverse_length_go(+items: List<&2, List<&2, Plan.Piece>>, +acc: List<&2, List<&2,
  Plan.Piece>>) -> {
  List.length(&2, List<&2, Plan.Piece>, List.reverse.go(&2, List<&2, Plan.Piece>, items, acc))
  == Nat.add(List.length(&2, List<&2, Plan.Piece>, items), List.length(&2, List<&2, Plan.Piece>,
    acc)) : Nat
}:
  match items:
    case []: {==}
    case head <> tail:
      Equal.trans(Nat,
        List.length(&2, List<&2, Plan.Piece>, List.reverse.go(&2, List<&2, Plan.Piece>, tail,
          head <> acc)),
        Nat.add(List.length(&2, List<&2, Plan.Piece>, tail), Nat.add(1n, List.length(&2,
          List<&2, Plan.Piece>, acc))),
        Nat.add(1n, Nat.add(List.length(&2, List<&2, Plan.Piece>, tail), List.length(&2,
          List<&2, Plan.Piece>, acc))),
        reverse_length_go(tail, head <> acc),
        Nats.add_succ(List.length(&2, List<&2, Plan.Piece>, tail), List.length(&2, List<&2,
          Plan.Piece>, acc)))

def reverse_length(+items: List<&2, List<&2, Plan.Piece>>) -> {
  List.length(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, items))
  == List.length(&2, List<&2, Plan.Piece>, items) : Nat
}:
  Equal.trans(Nat,
    List.length(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, items)),
    Nat.add(List.length(&2, List<&2, Plan.Piece>, items), 0n),
    List.length(&2, List<&2, Plan.Piece>, items),
    reverse_length_go(items, []), Nats.add_zero(List.length(&2, List<&2, Plan.Piece>, items)))

def pop_prefix(+prefix: List<&2, List<&2, Plan.Piece>>, +rest: List<&2, List<&2, Plan.Piece>>,
  +acc: List<&2, List<&2, Plan.Piece>>) -> {
  Plan.pop(List.length(&2, List<&2, Plan.Piece>, prefix), List.append(&2, List<&2, Plan.Piece>,
    prefix, rest), acc)
  == Plan.Popped{List.reverse.go(&2, List<&2, Plan.Piece>, prefix, acc), rest} : Plan.Popped
}:
  match prefix:
    case []: {==}
    case head <> tail: pop_prefix(tail, rest, head <> acc)

def pop_children(+children: List<&2, List<&2, Plan.Piece>>, +rest: List<&2, List<&2,
  Plan.Piece>>) -> {
  Plan.pop(List.length(&2, List<&2, Plan.Piece>, children), List.append(&2, List<&2,
    Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, children), rest), [])
  == Plan.Popped{children, rest} : Plan.Popped
}:
  %reverse_length(children):
    {Plan.pop(_, List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      children), rest), []) == Plan.Popped{children, rest} : Plan.Popped}
  Equal.trans(Plan.Popped,
    Plan.pop(List.length(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      children)), List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      children), rest), []),
    Plan.Popped{List.reverse(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      children)), rest},
    Plan.Popped{children, rest},
    pop_prefix(List.reverse(&2, List<&2, Plan.Piece>, children), rest, []),
    Equal.cong(List<&2, List<&2, Plan.Piece>>,
      Plan.Popped,
      value => Plan.Popped{value, rest},
      List.reverse(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, children)),
      children,
      Reverse.reverse_reverse(&2, List<&2, Plan.Piece>, children)))

def array_member(+tail: List<&2, List<&2, Plan.Piece>>, +head: List<&2, Plan.Piece>) -> {
  Plan.array_parts(head <> tail) == List.append(&2, Plan.Piece, head, Laws.array_suffix(
    tail)) : List<&2, Plan.Piece>
}:
  match tail:
    case []: {==}
    case next <> rest:
      Equal.cong(List<&2, Plan.Piece>,
        List<&2, Plan.Piece>,
        value => List.append(&2, Plan.Piece, head, Plan.LiteralPiece{","} <> value),
        Plan.array_parts(next <> rest),
        List.append(&2, Plan.Piece, next, Laws.array_suffix(rest)),
        array_member(rest, next))

def array_layout(+children: List<&2, List<&2, Plan.Piece>>) -> {
  Plan.LiteralPiece{"["} <> Plan.array_parts(children) == Laws.array_trace(children) : List<&2,
    Plan.Piece>
}:
  match children:
    case []: {==}
    case head <> tail:
      Equal.cong(List<&2, Plan.Piece>,
        List<&2, Plan.Piece>,
        parts => Plan.LiteralPiece{"["} <> parts,
        Plan.array_parts(head <> tail),
        List.append(&2, Plan.Piece, head, Laws.array_suffix(tail)),
        array_member(tail, head))

def Laws.array_exact(children, rest):
  Equal.trans(Plan.Stack,
    Plan.operation(Plan.ArrayOperation{List.length(&2, List<&2, Plan.Piece>, children)},
      List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, children),
      rest)),
    Plan.array_popped(Plan.Popped{children, rest}), Plan.ValidStack{Laws.array_trace(
      children) <> rest},
    Equal.cong(Plan.Popped,
      Plan.Stack,
      Plan.array_popped,
      Plan.pop(List.length(&2, List<&2, Plan.Piece>, children), List.append(&2, List<&2,
        Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, children), rest), []),
      Plan.Popped{children, rest},
      pop_children(children, rest)),
    Equal.cong(List<&2, Plan.Piece>,
      Plan.Stack,
      parts => Plan.ValidStack{parts <> rest},
      Plan.LiteralPiece{"["} <> Plan.array_parts(children),
      Laws.array_trace(children),
      array_layout(children)))

def pairing_acc(+fields: List<&2, Plan.Field>, +acc: List<&2, Plan.Field>) -> {
  Plan.pair_fields(Laws.keys(fields), Laws.values(fields), acc)
  == Some{List.reverse.go(&2, Plan.Field, acc, fields)} : Maybe<&2, List<&2, Plan.Field>>
}:
  match fields:
    case []: {==}
    case Plan.Field{key, parts} <> tail: pairing_acc(tail, Plan.Field{key, parts} <> acc)

def Laws.pairing_exact(fields):
  pairing_acc(fields, [])

def Laws.comparison_exact(left, right):
  match left right:
    case Plan.Field{_, _} Plan.Field{_, _}: {==}

def object_member(+tail: List<&2, Plan.Field>, +head: Plan.Field) -> {
  Plan.object_parts(head <> tail) == List.append(&2, Plan.Piece, Laws.member(head),
    Laws.object_suffix(tail)) : List<&2, Plan.Piece>
}:
  match tail head:
    case Nil{} Plan.Field{_, _}: {==}
    case Con{next, rest} Plan.Field{key, parts}:
      Equal.cong(List<&2, Plan.Piece>,
        List<&2, Plan.Piece>,
        value => Plan.PrimitivePiece{Json.StringPrimitive{key}} <> Plan.LiteralPiece{
          ":"} <> List.append(&2, Plan.Piece, parts, Plan.LiteralPiece{","} <> value),
        Plan.object_parts(next <> rest),
        List.append(&2, Plan.Piece, Laws.member(next), Laws.object_suffix(rest)),
        object_member(rest, next))

def object_layout(+fields: List<&2, Plan.Field>) -> {
  Plan.LiteralPiece{"{"} <> Plan.object_parts(fields) == Laws.object_trace(fields) : List<&2,
    Plan.Piece>
}:
  match fields:
    case []: {==}
    case head <> tail:
      Equal.cong(List<&2, Plan.Piece>,
        List<&2, Plan.Piece>,
        parts => Plan.LiteralPiece{"{"} <> parts,
        Plan.object_parts(head <> tail),
        List.append(&2, Plan.Piece, Laws.member(head), Laws.object_suffix(tail)),
        object_member(tail, head))

def fields_length(+fields: List<&2, Plan.Field>) -> {
  List.length(&2, String, Laws.keys(fields)) == List.length(&2, List<&2, Plan.Piece>,
    Laws.values(fields)) : Nat
}:
  match fields:
    case []: {==}
    case Plan.Field{_, _} <> tail:
      Equal.cong(Nat,
        Nat,
        n => Nat.add(1n, n),
        List.length(&2, String, Laws.keys(tail)),
        List.length(&2, List<&2, Plan.Piece>, Laws.values(tail)),
        fields_length(tail))

def Laws.object_exact(fields, rest):
  %Equal.sym(Nat, List.length(&2, String, Laws.keys(fields)), List.length(&2, List<&2,
    Plan.Piece>, Laws.values(fields)), fields_length(fields)):
    {Plan.object_popped(Laws.keys(fields), Plan.pop(_, List.append(&2, List<&2, Plan.Piece>,
      List.reverse(&2, List<&2, Plan.Piece>, Laws.values(fields)), rest),
      [])) == Plan.ValidStack{Laws.object_trace(List.sort(~Plan.Field, ~Plan.fields_le,
      fields)) <> rest} : Plan.Stack}
  %Equal.sym(Plan.Popped,
    Plan.pop(List.length(&2, List<&2, Plan.Piece>, Laws.values(fields)), List.append(&2,
      List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, Laws.values(fields)), rest),
      []),
    Plan.Popped{Laws.values(fields), rest}, pop_children(Laws.values(fields), rest)):
    {Plan.object_popped(Laws.keys(fields), _) == Plan.ValidStack{Laws.object_trace(List.sort(
      ~Plan.Field, ~Plan.fields_le, fields)) <> rest} : Plan.Stack}
  %Equal.sym(Maybe<&2, List<&2, Plan.Field>>, Plan.pair_fields(Laws.keys(fields), Laws.values(
    fields), []), Some{fields}, Laws.pairing_exact(fields)):
    {Plan.object_fields(_, rest) == Plan.ValidStack{Laws.object_trace(List.sort(~Plan.Field,
      ~Plan.fields_le, fields)) <> rest} : Plan.Stack}
  Equal.cong(List<&2, Plan.Piece>,
    Plan.Stack,
    parts => Plan.ValidStack{parts <> rest},
    Plan.LiteralPiece{"{"} <> Plan.object_parts(List.sort(~Plan.Field, ~Plan.fields_le, fields)),
    Laws.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, fields)),
    object_layout(List.sort(~Plan.Field, ~Plan.fields_le, fields)))

def pop_underflow(+arity: Nat, +stack: List<&2, List<&2, Plan.Piece>>, overflow: {Nat.is_gt(
  arity, List.length(&2, List<&2, Plan.Piece>, stack)) == True{} : Bool}) -> {Plan.pop(arity,
  stack, []) == Plan.Underflow{} : Plan.Popped}:
  %overflow:
    {Plan.pop(arity, stack, []) == Bool.pick(Plan.Popped, _, Plan.Underflow{}, Plan.Popped{
      List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, List.take(&2,
      List<&2, Plan.Piece>, stack, arity)), []), List.drop(&2, List<&2, Plan.Piece>, stack,
      arity)}) : Plan.Popped}
  Local.pop_exact(arity, stack, [])

def Laws.array_underflow(arity, stack, overflow):
  Equal.cong(Plan.Popped,
    Plan.Stack,
    Plan.array_popped,
    Plan.pop(arity, stack, []),
    Plan.Underflow{},
    pop_underflow(arity, stack, overflow))

def Laws.object_underflow(names, stack, overflow):
  Equal.cong(Plan.Popped,
    Plan.Stack,
    popped => Plan.object_popped(names, popped),
    Plan.pop(List.length(&2, String, names), stack, []),
    Plan.Underflow{},
    pop_underflow(List.length(&2, String, names), stack, overflow))

def Laws.invalid_finish():
  {==}

def Laws.empty_finish():
  {==}

def main() -> Unit:
  Unit{}
