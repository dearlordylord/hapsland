import Base
import ./CanonicalJsonPlanCompoundLaws.bend as Laws
import ./CanonicalJsonPlanLaws.bend as Local
import ./CanonicalJsonPlanProof.bend as LocalProof
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonPlanSpecification.bend as Spec
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
  Spec.pop(List.length(&2, List<&2, Plan.Piece>, prefix), List.append(&2, List<&2, Plan.Piece>,
    prefix, rest), acc)
  == Spec.Popped{List.reverse.go(&2, List<&2, Plan.Piece>, prefix, acc), rest} : Spec.Popped
}:
  match prefix:
    case []: {==}
    case head <> tail: pop_prefix(tail, rest, head <> acc)

def pop_children(+children: List<&2, List<&2, Plan.Piece>>, +rest: List<&2, List<&2,
  Plan.Piece>>) -> {
  Spec.pop(List.length(&2, List<&2, Plan.Piece>, children), List.append(&2, List<&2,
    Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, children), rest), [])
  == Spec.Popped{children, rest} : Spec.Popped
}:
  %reverse_length(children):
    {Spec.pop(_, List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      children), rest), []) == Spec.Popped{children, rest} : Spec.Popped}
  Equal.trans(Spec.Popped,
    Spec.pop(List.length(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      children)), List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      children), rest), []),
    Spec.Popped{List.reverse(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      children)), rest},
    Spec.Popped{children, rest},
    pop_prefix(List.reverse(&2, List<&2, Plan.Piece>, children), rest, []),
    Equal.cong(List<&2, List<&2, Plan.Piece>>,
      Spec.Popped,
      value => Spec.Popped{value, rest},
      List.reverse(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, children)),
      children,
      Reverse.reverse_reverse(&2, List<&2, Plan.Piece>, children)))

def array_member(+tail: List<&2, List<&2, Plan.Piece>>, +head: List<&2, Plan.Piece>) -> {
  Spec.array_parts(head <> tail) == List.append(&2, Plan.Piece, head, Laws.array_suffix(
    tail)) : List<&2, Plan.Piece>
}:
  match tail:
    case []: {==}
    case next <> rest:
      Equal.cong(List<&2, Plan.Piece>,
        List<&2, Plan.Piece>,
        value => List.append(&2, Plan.Piece, head, Plan.LiteralPiece{","} <> value),
        Spec.array_parts(next <> rest),
        List.append(&2, Plan.Piece, next, Laws.array_suffix(rest)),
        array_member(rest, next))

def array_layout(+children: List<&2, List<&2, Plan.Piece>>) -> {
  Plan.LiteralPiece{"["} <> Spec.array_parts(children) == Laws.array_trace(children) : List<&2,
    Plan.Piece>
}:
  match children:
    case []: {==}
    case head <> tail:
      Equal.cong(List<&2, Plan.Piece>,
        List<&2, Plan.Piece>,
        parts => Plan.LiteralPiece{"["} <> parts,
        Spec.array_parts(head <> tail),
        List.append(&2, Plan.Piece, head, Laws.array_suffix(tail)),
        array_member(tail, head))

def Laws.array_exact(children, rest):
  Equal.trans(Spec.Stack,
    Spec.operation(Plan.ArrayOperation{List.length(&2, List<&2, Plan.Piece>, children)},
      List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, children),
      rest)),
    Spec.array_popped(Spec.Popped{children, rest}), Spec.ValidStack{Laws.array_trace(
      children) <> rest},
    Equal.cong(Spec.Popped,
      Spec.Stack,
      Spec.array_popped,
      Spec.pop(List.length(&2, List<&2, Plan.Piece>, children), List.append(&2, List<&2,
        Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, children), rest), []),
      Spec.Popped{children, rest},
      pop_children(children, rest)),
    Equal.cong(List<&2, Plan.Piece>,
      Spec.Stack,
      parts => Spec.ValidStack{parts <> rest},
      Plan.LiteralPiece{"["} <> Spec.array_parts(children),
      Laws.array_trace(children),
      array_layout(children)))

def pairing_acc(+fields: List<&2, Spec.Field>, +acc: List<&2, Spec.Field>) -> {
  Spec.pair_fields(Laws.keys(fields), Laws.values(fields), acc)
  == Some{List.reverse.go(&2, Spec.Field, acc, fields)} : Maybe<&2, List<&2, Spec.Field>>
}:
  match fields:
    case []: {==}
    case Spec.Field{key, parts} <> tail: pairing_acc(tail, Spec.Field{key, parts} <> acc)

def Laws.pairing_exact(fields):
  pairing_acc(fields, [])

def Laws.comparison_exact(left, right):
  match left right:
    case Spec.Field{_, _} Spec.Field{_, _}: {==}

def object_member(+tail: List<&2, Spec.Field>, +head: Spec.Field) -> {
  Spec.object_parts(head <> tail) == List.append(&2, Plan.Piece, Laws.member(head),
    Laws.object_suffix(tail)) : List<&2, Plan.Piece>
}:
  match tail head:
    case Nil{} Spec.Field{_, _}: {==}
    case Con{next, rest} Spec.Field{key, parts}:
      Equal.cong(List<&2, Plan.Piece>,
        List<&2, Plan.Piece>,
        value => Plan.PrimitivePiece{Json.StringPrimitive{key}} <> Plan.LiteralPiece{
          ":"} <> List.append(&2, Plan.Piece, parts, Plan.LiteralPiece{","} <> value),
        Spec.object_parts(next <> rest),
        List.append(&2, Plan.Piece, Laws.member(next), Laws.object_suffix(rest)),
        object_member(rest, next))

def object_layout(+fields: List<&2, Spec.Field>) -> {
  Plan.LiteralPiece{"{"} <> Spec.object_parts(fields) == Laws.object_trace(fields) : List<&2,
    Plan.Piece>
}:
  match fields:
    case []: {==}
    case head <> tail:
      Equal.cong(List<&2, Plan.Piece>,
        List<&2, Plan.Piece>,
        parts => Plan.LiteralPiece{"{"} <> parts,
        Spec.object_parts(head <> tail),
        List.append(&2, Plan.Piece, Laws.member(head), Laws.object_suffix(tail)),
        object_member(tail, head))

def fields_length(+fields: List<&2, Spec.Field>) -> {
  List.length(&2, String, Laws.keys(fields)) == List.length(&2, List<&2, Plan.Piece>,
    Laws.values(fields)) : Nat
}:
  match fields:
    case []: {==}
    case Spec.Field{_, _} <> tail:
      Equal.cong(Nat,
        Nat,
        n => Nat.add(1n, n),
        List.length(&2, String, Laws.keys(tail)),
        List.length(&2, List<&2, Plan.Piece>, Laws.values(tail)),
        fields_length(tail))

def Laws.object_exact(fields, rest):
  %Equal.sym(Nat, List.length(&2, String, Laws.keys(fields)), List.length(&2, List<&2,
    Plan.Piece>, Laws.values(fields)), fields_length(fields)):
    {Spec.object_popped(Laws.keys(fields), Spec.pop(_, List.append(&2, List<&2, Plan.Piece>,
      List.reverse(&2, List<&2, Plan.Piece>, Laws.values(fields)), rest),
      [])) == Spec.ValidStack{Laws.object_trace(List.sort(~Spec.Field, ~Spec.fields_le,
      fields)) <> rest} : Spec.Stack}
  %Equal.sym(Spec.Popped,
    Spec.pop(List.length(&2, List<&2, Plan.Piece>, Laws.values(fields)), List.append(&2,
      List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, Laws.values(fields)), rest),
      []),
    Spec.Popped{Laws.values(fields), rest}, pop_children(Laws.values(fields), rest)):
    {Spec.object_popped(Laws.keys(fields), _) == Spec.ValidStack{Laws.object_trace(List.sort(
      ~Spec.Field, ~Spec.fields_le, fields)) <> rest} : Spec.Stack}
  %Equal.sym(Maybe<&2, List<&2, Spec.Field>>, Spec.pair_fields(Laws.keys(fields), Laws.values(
    fields), []), Some{fields}, Laws.pairing_exact(fields)):
    {Spec.object_fields(_, rest) == Spec.ValidStack{Laws.object_trace(List.sort(~Spec.Field,
      ~Spec.fields_le, fields)) <> rest} : Spec.Stack}
  Equal.cong(List<&2, Plan.Piece>,
    Spec.Stack,
    parts => Spec.ValidStack{parts <> rest},
    Plan.LiteralPiece{"{"} <> Spec.object_parts(List.sort(~Spec.Field, ~Spec.fields_le, fields)),
    Laws.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, fields)),
    object_layout(List.sort(~Spec.Field, ~Spec.fields_le, fields)))

def pop_underflow(+arity: Nat, +stack: List<&2, List<&2, Plan.Piece>>, overflow: {Nat.is_gt(
  arity, List.length(&2, List<&2, Plan.Piece>, stack)) == True{} : Bool}) -> {Spec.pop(arity,
  stack, []) == Spec.Underflow{} : Spec.Popped}:
  %overflow:
    {Spec.pop(arity, stack, []) == Bool.pick(Spec.Popped, _, Spec.Underflow{}, Spec.Popped{
      List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, List.take(&2,
      List<&2, Plan.Piece>, stack, arity)), []), List.drop(&2, List<&2, Plan.Piece>, stack,
      arity)}) : Spec.Popped}
  Local.pop_exact(arity, stack, [])

def Laws.array_underflow(arity, stack, overflow):
  Equal.cong(Spec.Popped,
    Spec.Stack,
    Spec.array_popped,
    Spec.pop(arity, stack, []),
    Spec.Underflow{},
    pop_underflow(arity, stack, overflow))

def Laws.object_underflow(names, stack, overflow):
  Equal.cong(Spec.Popped,
    Spec.Stack,
    popped => Spec.object_popped(names, popped),
    Spec.pop(List.length(&2, String, names), stack, []),
    Spec.Underflow{},
    pop_underflow(List.length(&2, String, names), stack, overflow))

def Laws.invalid_finish():
  {==}

def Laws.empty_finish():
  {==}

def main() -> Unit:
  Unit{}
