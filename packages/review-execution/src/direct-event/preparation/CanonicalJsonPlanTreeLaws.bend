import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonPlanSpecification.bend as Spec
import ./CanonicalJsonPlanValidation.bend as Validation
import ./CanonicalJsonPlanCompoundLaws.bend as Compound
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value

# DRAFT: forest correspondence, pending owner review and falsification.
# This indexed proof relation describes both the mechanical postorder encoding
# and its ordered JSON trace. It is not a runtime value or a caller obligation.
# Array/object children and the remaining forest are direct recursive witnesses;
# proofs can recurse on this one datatype without a recursive function template.
# Runtime acceptance must additionally establish this relation for the exported
# ProductValue through the independent stream validator. These laws alone do not
# assert that the TypeScript codec satisfies that obligation.
# The mandatory Compound.comparison_exact law pins Spec.fields_le to the original
# Json.fields_le; object traces therefore retain its UTF16 and duplicate ordering.

def primitive_value(value: Json.Primitive) -> Value.ProductValue:
  match value:
    case Json.NullPrimitive{}: Value.ProductNull{}
    case Json.BoolPrimitive{value}: Value.ProductBool{value}
    case Json.NumberPrimitive{bits}: Value.ProductNumber{bits}
    case Json.StringPrimitive{value}: Value.ProductText{value}

def field_keys(fields: List<&2, Value.OrderedField<Value.ProductValue>>) -> List<&2, String>:
  match fields:
    case []: []
    case Value.OrderedField{key, _} <> tail: key <> field_keys(tail)

def field_values(
  fields: List<&2, Value.OrderedField<Value.ProductValue>>
) -> List<&2, Value.ProductValue>:
  match fields:
    case []: []
    case Value.OrderedField{_, value} <> tail: value <> field_values(tail)

type ForestEncoding<-values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>> is Type:
  EmptyForest{
    values_empty: {values == [] : List<&2, Value.ProductValue>},
    operations_empty: {operations == [] : List<&2, Plan.Operation>},
    plans_empty: {plans == [] : List<&2, List<&2, Plan.Piece>>}
  }
  PrimitiveForest{
    primitive: Json.Primitive,
    tail_values: List<&2, Value.ProductValue>,
    tail_operations: List<&2, Plan.Operation>,
    tail_plans: List<&2, List<&2, Plan.Piece>>,
    tail: ForestEncoding<tail_values, tail_operations, tail_plans>,
    values_shape: {
      values
      == primitive_value(primitive) <> tail_values
      : List<&2, Value.ProductValue>
    },
    operations_shape: {
      operations
      == Plan.PrimitiveOperation{primitive} <> tail_operations
      : List<&2, Plan.Operation>
    },
    plans_shape: {
      plans
      == [Plan.PrimitivePiece{primitive}] <> tail_plans
      : List<&2, List<&2, Plan.Piece>>
    }
  }
  ArrayForest{
    items: List<&2, Value.ProductValue>,
    child_operations: List<&2, Plan.Operation>,
    child_plans: List<&2, List<&2, Plan.Piece>>,
    tail_values: List<&2, Value.ProductValue>,
    tail_operations: List<&2, Plan.Operation>,
    tail_plans: List<&2, List<&2, Plan.Piece>>,
    children: ForestEncoding<items, child_operations, child_plans>,
    tail: ForestEncoding<tail_values, tail_operations, tail_plans>,
    values_shape: {
      values
      == Value.ProductArray{items} <> tail_values
      : List<&2, Value.ProductValue>
    },
    operations_shape: {
      operations == List.append(&2, Plan.Operation, child_operations,
        Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)} <> tail_operations)
      : List<&2, Plan.Operation>
    },
    plans_shape: {
      plans
      == Compound.array_trace(child_plans) <> tail_plans
      : List<&2, List<&2, Plan.Piece>>
    }
  }
  ObjectForest{
    fields: List<&2, Value.OrderedField<Value.ProductValue>>,
    planned_fields: List<&2, Spec.Field>,
    child_operations: List<&2, Plan.Operation>,
    tail_values: List<&2, Value.ProductValue>,
    tail_operations: List<&2, Plan.Operation>,
    tail_plans: List<&2, List<&2, Plan.Piece>>,
    children: ForestEncoding<field_values(fields), child_operations, Compound.values(planned_fields)>,
    keys_shape: {Compound.keys(planned_fields) == field_keys(fields) : List<&2, String>},
    tail: ForestEncoding<tail_values, tail_operations, tail_plans>,
    values_shape: {
      values
      == Value.ProductObject{fields} <> tail_values
      : List<&2, Value.ProductValue>
    },
    operations_shape: {
      operations == List.append(&2, Plan.Operation, child_operations,
        Plan.ObjectOperation{field_keys(fields)} <> tail_operations)
      : List<&2, Plan.Operation>
    },
    plans_shape: {
      plans
      == Compound.object_trace(
        List.sort(~Spec.Field, ~Spec.fields_le, planned_fields)
      ) <> tail_plans
      : List<&2, List<&2, Plan.Piece>>
    }
  }

# Exact acceptance in both directions for the reversed whole-forest validator.
# The witness is derived from the check; it is never supplied by the native codec.
# Together these laws refuse every stream that encodes a different forest and
# accept every structural encoding, including empty forests and duplicate keys.
law validation_sound:
  for +values: List<&2, Value.ProductValue>
  for +operations: List<&2, Plan.Operation>
  for accepted: {
    Validation.validate_reversed(List.reverse(&2, Plan.Operation, operations),
      List.reverse(&2, Value.ProductValue, values)) == True{} : Bool
  }
  Sigma<&2, &1, List<&2, List<&2, Plan.Piece>>,
    plans => ForestEncoding<values, operations, plans>>

law validation_complete:
  for +values: List<&2, Value.ProductValue>
  for +operations: List<&2, Plan.Operation>
  for +plans: List<&2, List<&2, Plan.Piece>>
  for encoding: ForestEncoding<values, operations, plans>
  {
    Validation.validate_reversed(List.reverse(&2, Plan.Operation, operations),
      List.reverse(&2, Value.ProductValue, values)) == True{} : Bool
  }

# Every encoded forest produces its exact ordered plans over an arbitrary stack.
# No bound, uniqueness restriction, or native codec correctness is assumed here.
law forest_exact:
  for +values: List<&2, Value.ProductValue>
  for +operations: List<&2, Plan.Operation>
  for +plans: List<&2, List<&2, Plan.Piece>>
  for +rest: List<&2, List<&2, Plan.Piece>>
  for encoding: ForestEncoding<values, operations, plans>
  {
    Spec.fold(operations, Spec.ValidStack{rest})
    == Spec.ValidStack{List.append(&2, List<&2, Plan.Piece>,
      List.reverse(&2, List<&2, Plan.Piece>, plans), rest)}
    : Spec.Stack
  }

# The complete plan is exactly the trace of the exported tree, not input metadata.
law tree_exact:
  for +value: Value.ProductValue
  for +operations: List<&2, Plan.Operation>
  for +parts: List<&2, Plan.Piece>
  for encoding: ForestEncoding<[value], operations, [parts]>
  {Plan.compile(operations) == Some{parts} : Maybe<&2, List<&2, Plan.Piece>>}

# Text/key comparison retains the exact Base equality and accumulator guard.
law string_equal_exact:
  for +left: String
  for +right: String
  for +same: Bool
  {Validation.equal_go(left, right, same) == Bool.and(same, String.eq(left, right)) : Bool}

def main() -> Unit:
  Unit{}
