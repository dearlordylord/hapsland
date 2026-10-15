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

def stack(value: Plan.RopeStack) -> Spec.Stack:
  match value:
    case Plan.RopeInvalid{}: Spec.InvalidStack{}
    case Plan.RopeValid{values}: Spec.ValidStack{traces(values)}

def popped(value: Plan.RopePopped) -> Spec.Popped:
  match value:
    case Plan.RopeUnderflow{}: Spec.Underflow{}
    case Plan.RopePopped{values, rest}: Spec.Popped{traces(values), traces(rest)}

def maybe_fields(value: Maybe<&2, List<&2, Plan.RopeField>>) -> Maybe<&2, List<&2, Spec.Field>>:
  match value:
    case None{}: None{}
    case Some{values}: Some{fields(values)}

# Internal proof obligations only; compile callers never supply these witnesses.
def counted(value: Plan.Rope) -> Type:
  {Plan.rope_nodes(value) == true_nodes(value) : Nat}

def rope_counts(values: List<&2, Plan.Rope>) -> Type:
  match values:
    case []: Unit
    case head <> tail: counted(head) & rope_counts(tail)

def field_parts(value: Plan.RopeField) -> Plan.Rope:
  match value:
    case Plan.RopeField{_, parts}: parts

def field_counts(values: List<&2, Plan.RopeField>) -> Type:
  match values:
    case []: Unit
    case head <> tail: counted(field_parts(head)) & field_counts(tail)

def run_counts(values: List<&2, List<&2, Plan.RopeField>>) -> Type:
  match values:
    case []: Unit
    case head <> tail: field_counts(head) & run_counts(tail)

def stack_counts(value: Plan.RopeStack) -> Type:
  match value:
    case Plan.RopeInvalid{}: Unit
    case Plan.RopeValid{values}: rope_counts(values)

def popped_counts(value: Plan.RopePopped) -> Type:
  match value:
    case Plan.RopeUnderflow{}: Unit
    case Plan.RopePopped{values, rest}: rope_counts(values) & rope_counts(rest)

def maybe_counts(value: Maybe<&2, List<&2, Plan.RopeField>>) -> Type:
  match value:
    case None{}: Unit
    case Some{values}: field_counts(values)

def main() -> Unit:
  Unit{}
