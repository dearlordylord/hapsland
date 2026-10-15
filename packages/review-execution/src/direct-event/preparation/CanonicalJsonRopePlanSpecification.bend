import Base
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonPlanSpecification.bend as Spec

# Proof-only interpretation of internal ropes. Production never imports this.
def trace(value: Plan.Rope) -> List<&2, Plan.Piece>:
  match value:
    case Plan.RopePiece{piece}: [piece]
    case Plan.RopeJoin{_, left, right}:
      List.append(&2, Plan.Piece, trace(left), trace(right))

def true_nodes(value: Plan.Rope) -> Nat:
  match value:
    case Plan.RopePiece{_}: 1n
    case Plan.RopeJoin{_, left, right}:
      Nat.add(1n, Nat.add(true_nodes(left), true_nodes(right)))

def traces(values: List<&2, Plan.Rope>) -> List<&2, List<&2, Plan.Piece>>:
  match values:
    case []: []
    case value <> tail: trace(value) <> traces(tail)

# Exact suffix consumed by the tail-recursive array accumulator, including close.
def array_suffix(values: List<&2, Plan.Rope>) -> List<&2, Plan.Piece>:
  match values:
    case []: [Plan.LiteralPiece{"]"}]
    case value <> tail:
      Plan.LiteralPiece{","} <> List.append(&2, Plan.Piece, trace(value), array_suffix(tail))

def forest_nodes(values: List<&2, Plan.Rope>) -> Nat:
  match values:
    case []: 0n
    case value <> tail: Nat.add(true_nodes(value), forest_nodes(tail))

def forest_trace(values: List<&2, Plan.Rope>) -> List<&2, Plan.Piece>:
  match values:
    case []: []
    case value <> tail: List.append(&2, Plan.Piece, trace(value), forest_trace(tail))

def field(value: Plan.RopeField) -> Spec.Field:
  match value:
    case Plan.RopeField{key, parts}: Spec.Field{key, trace(parts)}

def fields(values: List<&2, Plan.RopeField>) -> List<&2, Spec.Field>:
  match values:
    case []: []
    case value <> tail: field(value) <> fields(tail)

def runs(values: List<&2, List<&2, Plan.RopeField>>) -> List<&2, List<&2, Spec.Field>>:
  match values:
    case []: []
    case value <> tail: fields(value) <> runs(tail)

def merge_state(
  value: List<&2, Plan.RopeField> & List<&2, Plan.RopeField> & List<&2, Plan.RopeField>
)
  -> List<&2, Spec.Field> & List<&2, Spec.Field> & List<&2, Spec.Field>:
  match value:
    case (acc, xs, ys): (fields(acc), fields(xs), fields(ys))

def object_suffix(values: List<&2, Plan.RopeField>) -> List<&2, Plan.Piece>:
  match values:
    case []: [Plan.LiteralPiece{"}"}]
    case value <> tail:
      Plan.LiteralPiece{","} <> List.append(
        &2,
        Plan.Piece,
        trace(Plan.rope_object_field(value)),
        object_suffix(tail)
      )

def main() -> Unit:
  Unit{}
