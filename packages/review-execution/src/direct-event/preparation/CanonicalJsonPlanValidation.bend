import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan

# Validate the mechanical foreign encoding against the exact exported tree.
# Reversed postorder presents each parent before its children in reverse order.
# Recursion consumes operations, never caller-supplied fuel or a recursive template.
def bits_equal(left: Value.Binary64, right: Value.Binary64) -> Bool:
  match left right:
    case Value.Binary64{a, b} Value.Binary64{c, d}:
      Bool.and(U32.is_eq(a, c), U32.is_eq(b, d))

def primitive_matches(primitive: Json.Primitive, expected: Value.ProductValue) -> Bool:
  match primitive expected:
    case Json.NullPrimitive{} Value.ProductNull{}: True{}
    case Json.BoolPrimitive{a} Value.ProductBool{b}: Bool.not(Bool.xor(a, b))
    case Json.NumberPrimitive{a} Value.ProductNumber{b}: bits_equal(a, b)
    case Json.StringPrimitive{a} Value.ProductText{b}: String.eq(a, b)
    case _ _: False{}

def object_keys(
  keys: List<&2, String>,
  fields: List<&2, Value.OrderedField<Value.ProductValue>>
) -> Bool:
  match keys fields:
    case Nil{} Nil{}: True{}
    case Con{key, keys} Con{Value.OrderedField{expected, _}, fields}:
      Bool.and(String.eq(key, expected), object_keys(keys, fields))
    case _ _: False{}

def field_values(
  fields: List<&2, Value.OrderedField<Value.ProductValue>>
) -> List<&2, Value.ProductValue>:
  match fields:
    case []: []
    case Value.OrderedField{_, value} <> rest: value <> field_values(rest)

def validate_reversed(
  operations: List<&2, Plan.Operation>,
  expected: List<&2, Value.ProductValue>
) -> Bool:
  match operations expected:
    case Nil{} Nil{}: True{}
    case Con{Plan.PrimitiveOperation{primitive}, tail} Con{value, rest}:
      Bool.and(primitive_matches(primitive, value), validate_reversed(tail, rest))
    case Con{Plan.ArrayOperation{arity}, tail} Con{Value.ProductArray{+items}, rest}:
      Bool.and(
        Nat.is_eq(arity, List.length(&2, Value.ProductValue, items)),
        validate_reversed(tail,
          List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, items), rest))
      )
    case Con{Plan.ObjectOperation{keys}, tail} Con{Value.ProductObject{+fields}, rest}:
      Bool.and(
        object_keys(keys, fields),
        validate_reversed(tail,
          List.append(&2, Value.ProductValue,
            List.reverse(&2, Value.ProductValue, field_values(fields)), rest))
      )
    case _ _: False{}

def validate(operations: List<&2, Plan.Operation>, value: Value.ProductValue) -> Bool:
  validate_reversed(List.reverse(&2, Plan.Operation, operations), [value])

def main() -> Unit:
  Unit{}
