import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonPlanSpecification.bend as Spec

# Seven reviewed local stack laws; bindings are in CanonicalJsonPlanProof.bend.
# These local guarantees do not establish production acceptance.
# Integration also requires valid-tree primitive/literal trace correspondence,
# raw-token assembly, flatten acceptance and both invocation/request counters.

# Splitting a postorder stream cannot change the resulting stack or refusal.
law fold_composition:
  for +prefix: List<&2, Plan.Operation>
  for +suffix: List<&2, Plan.Operation>
  for +state: Spec.Stack
  {
    Spec.fold(List.append(&2, Plan.Operation, prefix, suffix), state)
    == Spec.fold(suffix, Spec.fold(prefix, state))
    : Spec.Stack
  }

# Underflow is total; a successful pop reverses exactly the requested stack prefix.
law pop_exact:
  for +arity: Nat
  for +stack: List<&2, List<&2, Plan.Piece>>
  for +values: List<&2, List<&2, Plan.Piece>>
  {
    Spec.pop(arity, stack, values)
    == Bool.pick(Spec.Popped, Nat.is_gt(arity, List.length(&2, List<&2, Plan.Piece>, stack)),
      Spec.Underflow{},
      Spec.Popped{
        List.append(&2, List<&2, Plan.Piece>,
          List.reverse(&2, List<&2, Plan.Piece>,
            List.take(&2, List<&2, Plan.Piece>, stack, arity)), values),
        List.drop(&2, List<&2, Plan.Piece>, stack, arity)})
    : Spec.Popped
  }

# Primitive identity is preserved; planning performs no native serialization.
law primitive_exact:
  for +value: Json.Primitive
  for +stack: List<&2, List<&2, Plan.Piece>>
  {
    Spec.operation(Plan.PrimitiveOperation{value}, stack)
    == Spec.ValidStack{[Plan.PrimitivePiece{value}] <> stack}
    : Spec.Stack
  }

# A malformed prefix cannot be repaired by subsequent input.
law invalid_absorbing:
  for pending: List<&2, Plan.Operation>
  {Spec.fold(pending, Spec.InvalidStack{}) == Spec.InvalidStack{} : Spec.Stack}

# A complete stream has exactly one root, never an empty or multi-root forest.
law empty_refused:
  {Plan.compile([]) == None{} : Maybe<&2, List<&2, Plan.Piece>>}

law single_root:
  for +parts: List<&2, Plan.Piece>
  {Spec.finish(Spec.ValidStack{[parts]}) == Some{parts} : Maybe<&2, List<&2, Plan.Piece>>}

law multiple_roots_refused:
  for first: List<&2, Plan.Piece>
  for second: List<&2, Plan.Piece>
  for rest: List<&2, List<&2, Plan.Piece>>
  {
    Spec.finish(Spec.ValidStack{first <> second <> rest}) == None{}
    : Maybe<&2, List<&2, Plan.Piece>>
  }

def main() -> Unit:
  Unit{}
