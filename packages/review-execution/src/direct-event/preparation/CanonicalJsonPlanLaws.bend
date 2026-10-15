import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan

# Draft laws for review; no proof or production acceptance is claimed.
# Integration also requires valid-tree primitive/literal trace correspondence,
# raw-token assembly, flatten acceptance and both invocation/request counters.

# Splitting a postorder stream cannot change the resulting stack or refusal.
law fold_composition:
  for +prefix: List<&2, Plan.Operation>
  for +suffix: List<&2, Plan.Operation>
  for +state: Plan.Stack
  {
    Plan.fold(List.append(&2, Plan.Operation, prefix, suffix), state)
    == Plan.fold(suffix, Plan.fold(prefix, state))
    : Plan.Stack
  }

# Underflow is total; a successful pop reverses exactly the requested stack prefix.
law pop_exact:
  for +arity: Nat
  for +stack: List<&2, List<&2, Plan.Piece>>
  for +values: List<&2, List<&2, Plan.Piece>>
  {
    Plan.pop(arity, stack, values)
    == Bool.pick(Plan.Popped, Nat.is_gt(arity, List.length(&2, List<&2, Plan.Piece>, stack)),
      Plan.Underflow{},
      Plan.Popped{
        List.append(&2, List<&2, Plan.Piece>,
          List.reverse(&2, List<&2, Plan.Piece>,
            List.take(&2, List<&2, Plan.Piece>, stack, arity)), values),
        List.drop(&2, List<&2, Plan.Piece>, stack, arity)})
    : Plan.Popped
  }

# Primitive identity is preserved; planning performs no native serialization.
law primitive_exact:
  for +value: Json.Primitive
  for +stack: List<&2, List<&2, Plan.Piece>>
  {
    Plan.operation(Plan.PrimitiveOperation{value}, stack)
    == Plan.ValidStack{[Plan.PrimitivePiece{value}] <> stack}
    : Plan.Stack
  }

# A malformed prefix cannot be repaired by subsequent input.
law invalid_absorbing:
  for pending: List<&2, Plan.Operation>
  {Plan.fold(pending, Plan.InvalidStack{}) == Plan.InvalidStack{} : Plan.Stack}

# A complete stream has exactly one root, never an empty or multi-root forest.
law empty_refused:
  {Plan.compile([]) == None{} : Maybe<&2, List<&2, Plan.Piece>>}

law single_root:
  for +parts: List<&2, Plan.Piece>
  {Plan.finish(Plan.ValidStack{[parts]}) == Some{parts} : Maybe<&2, List<&2, Plan.Piece>>}

law multiple_roots_refused:
  for first: List<&2, Plan.Piece>
  for second: List<&2, Plan.Piece>
  for rest: List<&2, List<&2, Plan.Piece>>
  {
    Plan.finish(Plan.ValidStack{first <> second <> rest}) == None{}
    : Maybe<&2, List<&2, Plan.Piece>>
  }

def main() -> Unit:
  Unit{}
