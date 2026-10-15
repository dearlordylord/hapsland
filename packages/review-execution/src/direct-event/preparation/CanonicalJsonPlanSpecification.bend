import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan

# Independent original list-stack equations; never imported by production.
type Field is Data:
  Field{key: String, parts: List<&2, Plan.Piece>}
type Stack is Data:
  InvalidStack{}
  ValidStack{values: List<&2, List<&2, Plan.Piece>>}
type Popped is Data:
  Underflow{}
  Popped{values: List<&2, List<&2, Plan.Piece>>, rest: List<&2, List<&2, Plan.Piece>>}

# Reverse the popped suffix back into original array/field order.
def pop(
  arity: Nat,
  stack: List<&2, List<&2, Plan.Piece>>,
  values: List<&2, List<&2, Plan.Piece>>
) -> Popped:
  match arity stack:
    case 0n _: Popped{values, stack}
    case 1n++_ Nil{}: Underflow{}
    case 1n++remaining Con{value, tail}: pop(remaining, tail, value <> values)

def array_parts(values: List<&2, List<&2, Plan.Piece>>) -> List<&2, Plan.Piece>:
  match values:
    case []: [Plan.LiteralPiece{"]"}]
    case parts <> []: List.append(&2, Plan.Piece, parts, [Plan.LiteralPiece{"]"}])
    case parts <> tail: List.append(
      &2,
      Plan.Piece,
      parts,
      Plan.LiteralPiece{","} <> array_parts(tail)
    )

def array_popped(result: Popped) -> Stack:
  match result:
    case Underflow{}: InvalidStack{}
    case Popped{values, rest}: ValidStack{(Plan.LiteralPiece{"["} <> array_parts(values)) <> rest}

def pair_fields(
  keys: List<&2, String>,
  values: List<&2, List<&2, Plan.Piece>>,
  reversed: List<&2, Field>
) -> Maybe<&2, List<&2, Field>>:
  match keys values:
    case Nil{} Nil{}: Some{List.reverse(&2, Field, reversed)}
    case Con{key, keys} Con{parts, values}: pair_fields(keys, values, Field{key, parts} <> reversed)
    case _ _: None{}

def fields_le(left: Field, right: Field) -> Bool:
  match left right:
    case Field{left, _} Field{right, _}: Json.units_le(Json.utf16(left), Json.utf16(right))

def object_parts(fields: List<&2, Field>) -> List<&2, Plan.Piece>:
  match fields:
    case []: [Plan.LiteralPiece{"}"}]
    case Field{key, parts} <> []:
      Plan.PrimitivePiece{Json.StringPrimitive{key}} <> Plan.LiteralPiece{":"} <>
        List.append(&2, Plan.Piece, parts, [Plan.LiteralPiece{"}"}])
    case Field{key, parts} <> tail:
      Plan.PrimitivePiece{Json.StringPrimitive{key}} <> Plan.LiteralPiece{":"} <>
        List.append(&2, Plan.Piece, parts, Plan.LiteralPiece{","} <> object_parts(tail))

def object_fields(fields: Maybe<&2, List<&2, Field>>, rest: List<&2, List<&2, Plan.Piece>>) -> Stack:
  match fields:
    case None{}: InvalidStack{}
    case Some{fields}: ValidStack{
      (Plan.LiteralPiece{"{"} <> object_parts(List.sort(~Field, ~fields_le, fields))) <> rest
    }

def object_popped(keys: List<&2, String>, result: Popped) -> Stack:
  match result:
    case Underflow{}: InvalidStack{}
    case Popped{values, rest}: object_fields(pair_fields(keys, values, []), rest)

def operation(value: Plan.Operation, stack: List<&2, List<&2, Plan.Piece>>) -> Stack:
  match value:
    case Plan.PrimitiveOperation{value}: ValidStack{[Plan.PrimitivePiece{value}] <> stack}
    case Plan.ArrayOperation{arity}: array_popped(pop(arity, stack, []))
    case Plan.ObjectOperation{+keys}: object_popped(keys, pop(List.length(&2, String, keys), stack, []))

def fold(pending: List<&2, Plan.Operation>, state: Stack) -> Stack:
  match pending state:
    case _ InvalidStack{}: InvalidStack{}
    case [] ValidStack{stack}: ValidStack{stack}
    case value <> tail ValidStack{stack}: fold(tail, operation(value, stack))

def finish(state: Stack) -> Maybe<&2, List<&2, Plan.Piece>>:
  match state:
    case ValidStack{value <> []}: Some{value}
    case _: None{}

def compile(pending: List<&2, Plan.Operation>) -> Maybe<&2, List<&2, Plan.Piece>>:
  finish(fold(pending, ValidStack{[]}))

def main() -> Unit:
  Unit{}
