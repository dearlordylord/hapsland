import Base
import ./CanonicalJson.bend as Json

# A mechanical postorder tree ABI; ordering and JSON punctuation stay here.
type Operation is Data:
  PrimitiveOperation{value: Json.Primitive}
  ArrayOperation{arity: Nat}
  ObjectOperation{keys: List<&2, String>}
type Piece is Data:
  LiteralPiece{value: String}
  PrimitivePiece{value: Json.Primitive}
# Private immutable trace tree. Counts are computed only by join; callers of
# compile supply the original operation stream, never a traversal budget.
type Rope is Data:
  RopePiece{piece: Piece}
  RopeJoin{nodes: Nat, left: Rope, right: Rope}
type RopeField is Data:
  RopeField{key: String, parts: Rope}
type RopeStack is Data:
  RopeInvalid{}
  RopeValid{values: List<&2, Rope>}
type RopePopped is Data:
  RopeUnderflow{}
  RopePopped{values: List<&2, Rope>, rest: List<&2, Rope>}

def rope_nodes(value: Rope) -> Nat:
  match value:
    case RopePiece{_}: 1n
    case RopeJoin{nodes, _, _}: nodes

def rope_join(+left: Rope, +right: Rope) -> Rope:
  RopeJoin{Nat.add(1n, Nat.add(rope_nodes(left), rope_nodes(right))), left, right}

def rope_flatten_go(
  fuel: Nat, pending: List<&2, Rope>, reversed: List<&2, Piece>
) -> Maybe<&2, List<&2, Piece>>:
  match fuel pending:
    case 0n Nil{}: Some{List.reverse(&2, Piece, reversed)}
    case 0n _: None{}
    case 1n+_ Nil{}: None{}
    case 1n+remaining Con{RopePiece{piece}, rest}:
      rope_flatten_go(remaining, rest, piece <> reversed)
    case 1n+remaining Con{RopeJoin{_, left, right}, rest}:
      rope_flatten_go(remaining, left <> right <> rest, reversed)

def rope_flatten(+value: Rope) -> Maybe<&2, List<&2, Piece>>:
  rope_flatten_go(rope_nodes(value), [value], [])

def rope_pop(arity: Nat, stack: List<&2, Rope>, values: List<&2, Rope>) -> RopePopped:
  match arity stack:
    case 0n _: RopePopped{values, stack}
    case 1n+_ Nil{}: RopeUnderflow{}
    case 1n+remaining Con{value, tail}: rope_pop(remaining, tail, value <> values)

def rope_array_more(values: List<&2, Rope>, accumulated: Rope) -> Rope:
  match values:
    case []: rope_join(accumulated, RopePiece{LiteralPiece{"]"}})
    case value <> tail:
      rope_array_more(tail, rope_join(accumulated, rope_join(RopePiece{LiteralPiece{","}}, value)))

def rope_array_parts(values: List<&2, Rope>) -> Rope:
  match values:
    case []: RopePiece{LiteralPiece{"]"}}
    case value <> tail: rope_array_more(tail, value)

def rope_array_popped(result: RopePopped) -> RopeStack:
  match result:
    case RopeUnderflow{}: RopeInvalid{}
    case RopePopped{values, rest}:
      RopeValid{rope_join(RopePiece{LiteralPiece{"["}}, rope_array_parts(values)) <> rest}

def rope_pair_fields(
  keys: List<&2, String>, values: List<&2, Rope>, reversed: List<&2, RopeField>
) -> Maybe<&2, List<&2, RopeField>>:
  match keys values:
    case Nil{} Nil{}: Some{List.reverse(&2, RopeField, reversed)}
    case Con{key, keys} Con{parts, values}:
      rope_pair_fields(keys, values, RopeField{key, parts} <> reversed)
    case _ _: None{}

def rope_fields_le(left: RopeField, right: RopeField) -> Bool:
  match left right:
    case RopeField{left, _} RopeField{right, _}:
      Json.units_le(Json.utf16(left), Json.utf16(right))

def rope_object_field(value: RopeField) -> Rope:
  match value:
    case RopeField{key, parts}:
      rope_join(RopePiece{PrimitivePiece{Json.StringPrimitive{key}}},
        rope_join(RopePiece{LiteralPiece{":"}}, parts))

def rope_object_more(values: List<&2, RopeField>, accumulated: Rope) -> Rope:
  match values:
    case []: rope_join(accumulated, RopePiece{LiteralPiece{"}"}})
    case value <> tail:
      rope_object_more(tail, rope_join(accumulated,
        rope_join(RopePiece{LiteralPiece{","}}, rope_object_field(value))))

def rope_object_parts(values: List<&2, RopeField>) -> Rope:
  match values:
    case []: RopePiece{LiteralPiece{"}"}}
    case value <> tail: rope_object_more(tail, rope_object_field(value))

def rope_object_fields(fields: Maybe<&2, List<&2, RopeField>>, rest: List<&2, Rope>) -> RopeStack:
  match fields:
    case None{}: RopeInvalid{}
    case Some{fields}:
      RopeValid{rope_join(RopePiece{LiteralPiece{"{"}},
        rope_object_parts(List.sort(~RopeField, ~rope_fields_le, fields))) <> rest}

def rope_object_popped(keys: List<&2, String>, result: RopePopped) -> RopeStack:
  match result:
    case RopeUnderflow{}: RopeInvalid{}
    case RopePopped{values, rest}: rope_object_fields(rope_pair_fields(keys, values, []), rest)

def rope_operation(value: Operation, stack: List<&2, Rope>) -> RopeStack:
  match value:
    case PrimitiveOperation{value}: RopeValid{RopePiece{PrimitivePiece{value}} <> stack}
    case ArrayOperation{arity}: rope_array_popped(rope_pop(arity, stack, []))
    case ObjectOperation{+keys}:
      rope_object_popped(keys, rope_pop(List.length(&2, String, keys), stack, []))

def rope_fold(pending: List<&2, Operation>, state: RopeStack) -> RopeStack:
  match pending state:
    case _ RopeInvalid{}: RopeInvalid{}
    case [] RopeValid{stack}: RopeValid{stack}
    case value <> tail RopeValid{stack}: rope_fold(tail, rope_operation(value, stack))

def rope_finish(state: RopeStack) -> Maybe<&2, List<&2, Piece>>:
  match state:
    case RopeValid{value <> []}: rope_flatten(value)
    case _: None{}

def compile(pending: List<&2, Operation>) -> Maybe<&2, List<&2, Piece>>:
  rope_finish(rope_fold(pending, RopeValid{[]}))

def main() -> Unit:
  Unit{}
