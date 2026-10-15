import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonPlanSpecification.bend as Spec
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value

# Reviewed compound laws; bindings are in CanonicalJsonPlanCompoundProof.bend.
# Tree correspondence, replies and counters remain separate.
# This reference starts with the opening delimiter and appends later members;
# it does not call the planner's array_parts/object_parts/pair_fields helpers.
def array_suffix(values: List<&2, List<&2, Plan.Piece>>) -> List<&2, Plan.Piece>:
  match values:
    case []: [Plan.LiteralPiece{"]"}]
    case head <> tail:
      Plan.LiteralPiece{","} <> List.append(&2, Plan.Piece, head, array_suffix(tail))

def array_trace(values: List<&2, List<&2, Plan.Piece>>) -> List<&2, Plan.Piece>:
  match values:
    case []: [Plan.LiteralPiece{"["}, Plan.LiteralPiece{"]"}]
    case head <> tail:
      Plan.LiteralPiece{"["} <> List.append(&2, Plan.Piece, head, array_suffix(tail))

def keys(fields: List<&2, Spec.Field>) -> List<&2, String>:
  match fields:
    case []: []
    case Spec.Field{key, _} <> tail: key <> keys(tail)

def values(fields: List<&2, Spec.Field>) -> List<&2, List<&2, Plan.Piece>>:
  match fields:
    case []: []
    case Spec.Field{_, parts} <> tail: parts <> values(tail)

def reference_le(left: Spec.Field, right: Spec.Field) -> Bool:
  match left right:
    case Spec.Field{left, _} Spec.Field{right, _}: Json.fields_le(
      Value.OrderedField{left, Value.ProductNull{}},
      Value.OrderedField{right, Value.ProductNull{}}
    )

def member(field: Spec.Field) -> List<&2, Plan.Piece>:
  match field:
    case Spec.Field{key, parts}:
      Plan.PrimitivePiece{Json.StringPrimitive{key}} <> Plan.LiteralPiece{":"} <> parts

def object_suffix(fields: List<&2, Spec.Field>) -> List<&2, Plan.Piece>:
  match fields:
    case []: [Plan.LiteralPiece{"}"}]
    case head <> tail:
      Plan.LiteralPiece{","} <> List.append(&2, Plan.Piece, member(head), object_suffix(tail))

def object_trace(fields: List<&2, Spec.Field>) -> List<&2, Plan.Piece>:
  match fields:
    case []: [Plan.LiteralPiece{"{"}, Plan.LiteralPiece{"}"}]
    case head <> tail:
      Plan.LiteralPiece{"{"} <> List.append(&2, Plan.Piece, member(head), object_suffix(tail))

# An array consumes exactly its original child plans, preserving the older stack.
law array_exact:
  for +children: List<&2, List<&2, Plan.Piece>>
  for +rest: List<&2, List<&2, Plan.Piece>>
  {
    Spec.operation(Plan.ArrayOperation{List.length(&2, List<&2, Plan.Piece>, children)},
      List.append(&2, List<&2, Plan.Piece>,
        List.reverse(&2, List<&2, Plan.Piece>, children), rest))
    == Spec.ValidStack{array_trace(children) <> rest}
    : Spec.Stack
  }

# Keys stay paired with their original child plans before UTF16 sorting.
law pairing_exact:
  for +fields: List<&2, Spec.Field>
  {
    Spec.pair_fields(keys(fields), values(fields), [])
    == Some{fields}
    : Maybe<&2, List<&2, Spec.Field>>
  }

# Ordering is precisely the existing CanonicalJson field comparator.
law comparison_exact:
  for +left: Spec.Field
  for +right: Spec.Field
  {Spec.fields_le(left, right) == reference_le(left, right) : Bool}

# Includes empty objects, duplicate keys and arbitrary primitive/literal plans.
# The mandatory comparison_exact law independently pins the sorting comparator.
law object_exact:
  for +fields: List<&2, Spec.Field>
  for +rest: List<&2, List<&2, Plan.Piece>>
  {
    Spec.operation(Plan.ObjectOperation{keys(fields)},
      List.append(&2, List<&2, Plan.Piece>,
        List.reverse(&2, List<&2, Plan.Piece>, values(fields)), rest))
    == Spec.ValidStack{object_trace(List.sort(~Spec.Field, ~Spec.fields_le, fields)) <> rest}
    : Spec.Stack
  }

# Invalid arities refuse rather than silently drop or manufacture a child plan.
law array_underflow:
  for +arity: Nat
  for +stack: List<&2, List<&2, Plan.Piece>>
  for overflow: {Nat.is_gt(arity, List.length(&2, List<&2, Plan.Piece>, stack)) == True{} : Bool}
  {Spec.operation(Plan.ArrayOperation{arity}, stack) == Spec.InvalidStack{} : Spec.Stack}

law object_underflow:
  for +names: List<&2, String>
  for +stack: List<&2, List<&2, Plan.Piece>>
  for overflow: {
    Nat.is_gt(List.length(&2, String, names), List.length(&2, List<&2, Plan.Piece>, stack))
    == True{}
    : Bool
  }
  {Spec.operation(Plan.ObjectOperation{names}, stack) == Spec.InvalidStack{} : Spec.Stack}

law invalid_finish:
  {Spec.finish(Spec.InvalidStack{}) == None{} : Maybe<&2, List<&2, Plan.Piece>>}

law empty_finish:
  {Spec.finish(Spec.ValidStack{[]}) == None{} : Maybe<&2, List<&2, Plan.Piece>>}

def main() -> Unit:
  Unit{}
