import Base
import ./CanonicalJsonPlanTreeLaws.bend as Laws
import ./CanonicalJsonRopePlanLaws.bend as RopeLaws
import ./CanonicalJsonRopePlanCountProof.bend as RopeProof
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/GRAPH_REVERSE_FACTS.bend as Reverse
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend as Nats
import ./CanonicalJsonPlanCompoundLaws.bend as Compound
import ./CanonicalJsonPlanCompoundProof.bend as CompoundProof
import ./CanonicalJsonPlanLaws.bend as Local
import ./CanonicalJsonPlanProof.bend as LocalProof
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/GRAPH_LIST_FACTS.bend as Lists
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonPlanSpecification.bend as Spec
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlanValidation.bend as Validation
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_STRING_FACTS.bend as Strings

# The implementation uses the standard equality pinned by this unchanged law.
def Laws.string_equal_exact(left, right, same):
  {==}

# Existing proofs consume the original Base equality through the exact new theorem.
def string_equal(
  +left: String,
  +right: String
) -> {Validation.equal_go(left, right, True{}) == String.eq(left, right) : Bool}:
  Laws.string_equal_exact(left, right, True{})

def string_reflexive(
  +value: String
) -> {Validation.equal_go(value, value, True{}) == True{} : Bool}:
  Equal.trans(Bool, Validation.equal_go(value, value, True{}), String.eq(value, value), True{},
    string_equal(value, value), Strings.eq_refl(value))

def string_accepted(
  +left: String,
  +right: String,
  accepted: {Validation.equal_go(left, right, True{}) == True{} : Bool}
) -> {String.eq(left, right) == True{} : Bool}:
  %string_equal(left, right) : {_ == True{} : Bool}
  accepted

# Concrete falsification instances precede the forest/tree universal bindings below.
# These construct actual indexed witnesses, not assumed codec correspondence.

def instance_0_encoding() -> Laws.ForestEncoding<[], [], []>:
  Laws.EmptyForest{{==}, {==}, {==}}

def instance_0_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, []),
  List.reverse(&2, Value.ProductValue, [])) == True{} : Bool}:
  {==}

def instance_0_forest() -> {Spec.fold([], Spec.ValidStack{[]}) == Spec.ValidStack{List.reverse(&2,
  List<&2, Plan.Piece>, [])} : Spec.Stack}:
  {==}

def instance_1_encoding() -> Laws.ForestEncoding<[Laws.primitive_value(Json.NullPrimitive{})],
  [Plan.PrimitiveOperation{Json.NullPrimitive{}}], [[Plan.PrimitivePiece{Json.NullPrimitive{}}]]>:
  Laws.PrimitiveForest{Json.NullPrimitive{}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==},
    {==}, {==}}

def instance_1_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation,
  [Plan.PrimitiveOperation{Json.NullPrimitive{}}]), List.reverse(&2, Value.ProductValue,
  [Laws.primitive_value(Json.NullPrimitive{})])) == True{} : Bool}:
  {==}

def instance_1_forest() -> {Spec.fold([Plan.PrimitiveOperation{Json.NullPrimitive{}}],
  Spec.ValidStack{[]}) == Spec.ValidStack{List.reverse(&2, List<&2, Plan.Piece>,
  [[Plan.PrimitivePiece{Json.NullPrimitive{}}]])} : Spec.Stack}:
  {==}

def instance_1_tree() -> {
  Plan.compile([Plan.PrimitiveOperation{Json.NullPrimitive{}}])
  == Some{[Plan.PrimitivePiece{Json.NullPrimitive{}}]}
  : Maybe<&2, List<&2, Plan.Piece>>
}:
  {==}

def instance_2_encoding() -> Laws.ForestEncoding<[Laws.primitive_value(Json.BoolPrimitive{True{}})],
  [Plan.PrimitiveOperation{Json.BoolPrimitive{True{}}}],
  [[Plan.PrimitivePiece{Json.BoolPrimitive{True{}}}]]>:
  Laws.PrimitiveForest{Json.BoolPrimitive{True{}}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}},
    {==}, {==}, {==}}

def instance_2_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation,
  [Plan.PrimitiveOperation{Json.BoolPrimitive{True{}}}]), List.reverse(&2, Value.ProductValue,
  [Laws.primitive_value(Json.BoolPrimitive{True{}})])) == True{} : Bool}:
  {==}

def instance_2_forest() -> {Spec.fold([Plan.PrimitiveOperation{Json.BoolPrimitive{True{}}}],
  Spec.ValidStack{[]}) == Spec.ValidStack{List.reverse(&2, List<&2, Plan.Piece>,
  [[Plan.PrimitivePiece{Json.BoolPrimitive{True{}}}]])} : Spec.Stack}:
  {==}

def instance_2_tree() -> {
  Plan.compile([Plan.PrimitiveOperation{Json.BoolPrimitive{True{}}}])
  == Some{[Plan.PrimitivePiece{Json.BoolPrimitive{True{}}}]}
  : Maybe<&2, List<&2, Plan.Piece>>
}:
  {==}

def instance_3_encoding() -> Laws.ForestEncoding<[Laws.primitive_value(
  Json.NumberPrimitive{Value.Binary64{2147483648, 0}})],
  [Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}],
  [[Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}]]>:
  Laws.PrimitiveForest{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}, [], [], [],
    Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_3_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation,
  [Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}]), List.reverse(&2,
  Value.ProductValue, [Laws.primitive_value(Json.NumberPrimitive{Value.Binary64{2147483648,
  0}})])) == True{} : Bool}:
  {==}

def instance_3_forest() -> {Spec.fold(
  [Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}],
  Spec.ValidStack{[]}) == Spec.ValidStack{List.reverse(&2, List<&2, Plan.Piece>,
  [[Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}]])} : Spec.Stack}:
  {==}

def instance_3_tree() -> {Plan.compile(
  [Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2147483648,
  0}}}]) == Some{[Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2147483648,
  0}}}]} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_4_encoding() -> Laws.ForestEncoding<[Laws.primitive_value(Json.StringPrimitive{"λ"})],
  [Plan.PrimitiveOperation{Json.StringPrimitive{"λ"}}],
  [[Plan.PrimitivePiece{Json.StringPrimitive{"λ"}}]]>:
  Laws.PrimitiveForest{Json.StringPrimitive{"λ"}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}},
    {==}, {==}, {==}}

def instance_4_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation,
  [Plan.PrimitiveOperation{Json.StringPrimitive{"λ"}}]), List.reverse(&2, Value.ProductValue,
  [Laws.primitive_value(Json.StringPrimitive{"λ"})])) == True{} : Bool}:
  {==}

def instance_4_forest() -> {Spec.fold([Plan.PrimitiveOperation{Json.StringPrimitive{"λ"}}],
  Spec.ValidStack{[]}) == Spec.ValidStack{List.reverse(&2, List<&2, Plan.Piece>,
  [[Plan.PrimitivePiece{Json.StringPrimitive{"λ"}}]])} : Spec.Stack}:
  {==}

def instance_4_tree() -> {
  Plan.compile([Plan.PrimitiveOperation{Json.StringPrimitive{"λ"}}])
  == Some{[Plan.PrimitivePiece{Json.StringPrimitive{"λ"}}]}
  : Maybe<&2, List<&2, Plan.Piece>>
}:
  {==}

def instance_5_encoding() -> Laws.ForestEncoding<[Value.ProductArray{[]}],
  [Plan.ArrayOperation{0n}], [Compound.array_trace([])]>:
  Laws.ArrayForest{[], [], [], [], [], [], Laws.EmptyForest{{==}, {==}, {==}},
    Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_5_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation,
  [Plan.ArrayOperation{0n}]), List.reverse(&2, Value.ProductValue,
  [Value.ProductArray{[]}])) == True{} : Bool}:
  {==}

def instance_5_forest() -> {Spec.fold([Plan.ArrayOperation{0n}],
  Spec.ValidStack{[]}) == Spec.ValidStack{List.reverse(&2, List<&2, Plan.Piece>,
  [Compound.array_trace([])])} : Spec.Stack}:
  {==}

def instance_5_tree() -> {Plan.compile([Plan.ArrayOperation{0n}]) == Some{Compound.array_trace(
  [])} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_6_encoding() -> Laws.ForestEncoding<[Value.ProductObject{[]}],
  [Plan.ObjectOperation{[]}], [Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, []))]>:
  Laws.ObjectForest{[], [], [], [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==},
    Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_6_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation,
  [Plan.ObjectOperation{[]}]), List.reverse(&2, Value.ProductValue,
  [Value.ProductObject{[]}])) == True{} : Bool}:
  {==}

def instance_6_forest() -> {Spec.fold([Plan.ObjectOperation{[]}],
  Spec.ValidStack{[]}) == Spec.ValidStack{List.reverse(&2, List<&2, Plan.Piece>,
  [Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, []))])} : Spec.Stack}:
  {==}

def instance_6_tree() -> {Plan.compile([Plan.ObjectOperation{[]}]) == Some{Compound.object_trace(
  List.sort(~Spec.Field, ~Spec.fields_le, []))} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_7_encoding() -> Laws.ForestEncoding<[Value.ProductObject{[Value.OrderedField{"z",
  Value.ProductArray{[Laws.primitive_value(Json.NullPrimitive{}), Laws.primitive_value(
  Json.BoolPrimitive{False{}})]}}, Value.OrderedField{"z", Laws.primitive_value(
  Json.NumberPrimitive{Value.Binary64{2146435072, 1}})}, Value.OrderedField{"a",
  Laws.primitive_value(Json.StringPrimitive{"x"})}]}, Value.ProductArray{[Laws.primitive_value(
  Json.StringPrimitive{"tail"})]}], [Plan.PrimitiveOperation{Json.NullPrimitive{}},
  Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}, Plan.ArrayOperation{2n},
  Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}},
  Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}, Plan.ObjectOperation{["z", "z", "a"]},
  Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}, Plan.ArrayOperation{1n}],
  [Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, [Spec.Field{"z",
  Compound.array_trace([[Plan.PrimitivePiece{Json.NullPrimitive{}}],
  [Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]])}, Spec.Field{"z",
  [Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}]}, Spec.Field{"a",
  [Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]}])), Compound.array_trace(
  [[Plan.PrimitivePiece{Json.StringPrimitive{"tail"}}]])]>:
  Laws.ObjectForest{[Value.OrderedField{"z", Value.ProductArray{[Laws.primitive_value(
    Json.NullPrimitive{}), Laws.primitive_value(Json.BoolPrimitive{False{}})]}},
    Value.OrderedField{"z", Laws.primitive_value(Json.NumberPrimitive{Value.Binary64{2146435072,
    1}})}, Value.OrderedField{"a", Laws.primitive_value(Json.StringPrimitive{"x"})}],
    [Spec.Field{"z", Compound.array_trace([[Plan.PrimitivePiece{Json.NullPrimitive{}}],
    [Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]])}, Spec.Field{"z",
    [Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}]}, Spec.Field{"a",
    [Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]}],
    [Plan.PrimitiveOperation{Json.NullPrimitive{}},
    Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}, Plan.ArrayOperation{2n},
    Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}},
    Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}], [Value.ProductArray{[Laws.primitive_value(
    Json.StringPrimitive{"tail"})]}], [Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}},
    Plan.ArrayOperation{1n}], [Compound.array_trace(
    [[Plan.PrimitivePiece{Json.StringPrimitive{"tail"}}]])], Laws.ArrayForest{[Laws.primitive_value(
    Json.NullPrimitive{}), Laws.primitive_value(Json.BoolPrimitive{False{}})],
    [Plan.PrimitiveOperation{Json.NullPrimitive{}},
    Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}],
    [[Plan.PrimitivePiece{Json.NullPrimitive{}}],
    [Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]], [Laws.primitive_value(
    Json.NumberPrimitive{Value.Binary64{2146435072, 1}}), Laws.primitive_value(
    Json.StringPrimitive{"x"})],
    [Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}},
    Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}],
    [[Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}],
    [Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]], Laws.PrimitiveForest{Json.NullPrimitive{},
    [Laws.primitive_value(Json.BoolPrimitive{False{}})],
    [Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}],
    [[Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]],
    Laws.PrimitiveForest{Json.BoolPrimitive{False{}}, [], [], [], Laws.EmptyForest{{==}, {==},
    {==}}, {==}, {==}, {==}}, {==}, {==}, {==}},
    Laws.PrimitiveForest{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}, [Laws.primitive_value(
    Json.StringPrimitive{"x"})], [Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}],
    [[Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]],
    Laws.PrimitiveForest{Json.StringPrimitive{"x"}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}},
    {==}, {==}, {==}}, {==}, {==}, {==}}, {==}, {==}, {==}}, {==},
    Laws.ArrayForest{[Laws.primitive_value(Json.StringPrimitive{"tail"})],
    [Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}],
    [[Plan.PrimitivePiece{Json.StringPrimitive{"tail"}}]], [], [], [],
    Laws.PrimitiveForest{Json.StringPrimitive{"tail"}, [], [], [], Laws.EmptyForest{{==}, {==},
    {==}}, {==}, {==}, {==}}, Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}, {==}, {==},
    {==}}

def instance_7_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation,
  [Plan.PrimitiveOperation{Json.NullPrimitive{}},
  Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}, Plan.ArrayOperation{2n},
  Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}},
  Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}, Plan.ObjectOperation{["z", "z", "a"]},
  Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}, Plan.ArrayOperation{1n}]), List.reverse(&2,
  Value.ProductValue, [Value.ProductObject{[Value.OrderedField{"z",
  Value.ProductArray{[Laws.primitive_value(Json.NullPrimitive{}), Laws.primitive_value(
  Json.BoolPrimitive{False{}})]}}, Value.OrderedField{"z", Laws.primitive_value(
  Json.NumberPrimitive{Value.Binary64{2146435072, 1}})}, Value.OrderedField{"a",
  Laws.primitive_value(Json.StringPrimitive{"x"})}]}, Value.ProductArray{[Laws.primitive_value(
  Json.StringPrimitive{"tail"})]}])) == True{} : Bool}:
  {==}

def instance_7_forest() -> {Spec.fold([Plan.PrimitiveOperation{Json.NullPrimitive{}},
  Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}, Plan.ArrayOperation{2n},
  Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}},
  Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}, Plan.ObjectOperation{["z", "z", "a"]},
  Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}, Plan.ArrayOperation{1n}],
  Spec.ValidStack{[]}) == Spec.ValidStack{List.reverse(&2, List<&2, Plan.Piece>,
  [Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, [Spec.Field{"z",
  Compound.array_trace([[Plan.PrimitivePiece{Json.NullPrimitive{}}],
  [Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]])}, Spec.Field{"z",
  [Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}]}, Spec.Field{"a",
  [Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]}])), Compound.array_trace(
  [[Plan.PrimitivePiece{Json.StringPrimitive{"tail"}}]])])} : Spec.Stack}:
  {==}

def fold_result(-operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2,
  Plan.Piece>>) -> Type:
  @rest: List<&2, List<&2, Plan.Piece>> -> {
    Spec.fold(operations, Spec.ValidStack{rest}) == Spec.ValidStack{
      List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans),
        rest)} : Spec.Stack}

def forest_result(-values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>,
  -plans: List<&2, List<&2, Plan.Piece>>) -> Type:
  {List.length(&2, Value.ProductValue, values) == List.length(&2, List<&2, Plan.Piece>,
    plans) : Nat} & fold_result(operations, plans)

def result_transport(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  -actual_values: List<&2, Value.ProductValue>, -actual_operations: List<&2, Plan.Operation>,
    -actual_plans: List<&2, List<&2, Plan.Piece>>,
  v: {values == actual_values : List<&2, Value.ProductValue>},
  o: {operations == actual_operations : List<&2, Plan.Operation>},
  p: {plans == actual_plans : List<&2, List<&2, Plan.Piece>>},
  result: forest_result(actual_values, actual_operations, actual_plans)
) -> forest_result(values, operations, plans):
  %Equal.sym(List<&2, Value.ProductValue>, values, actual_values, v) : forest_result(_, operations,
    plans)
  %Equal.sym(List<&2, Plan.Operation>, operations, actual_operations, o) : forest_result(
    actual_values, _, plans)
  %Equal.sym(List<&2, List<&2, Plan.Piece>>, plans, actual_plans, p) : forest_result(actual_values,
    actual_operations, _)
  result

# Compose a complete head-tree transition with the rest of the forest.
def sequence_run(
  +head_operations: List<&2, Plan.Operation>, +head_parts: List<&2, Plan.Piece>,
  +tail_operations: List<&2, Plan.Operation>, +tail_plans: List<&2, List<&2, Plan.Piece>>,
  +rest: List<&2, List<&2, Plan.Piece>>,
  first: {Spec.fold(head_operations,
    Spec.ValidStack{rest}) == Spec.ValidStack{head_parts <> rest} : Spec.Stack},
  later: {Spec.fold(tail_operations, Spec.ValidStack{head_parts <> rest}) == Spec.ValidStack{
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, tail_plans),
      head_parts <> rest)} : Spec.Stack}
) -> {Spec.fold(List.append(&2, Plan.Operation, head_operations, tail_operations),
  Spec.ValidStack{rest}) == Spec.ValidStack{
  List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
    head_parts <> tail_plans), rest)} : Spec.Stack}:
  %Equal.sym(Spec.Stack,
    Spec.fold(List.append(&2, Plan.Operation, head_operations, tail_operations),
      Spec.ValidStack{rest}),
    Spec.fold(tail_operations, Spec.fold(head_operations, Spec.ValidStack{rest})),
    Local.fold_composition(head_operations, tail_operations, Spec.ValidStack{rest})) :
    {_ == Spec.ValidStack{List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2,
      Plan.Piece>, head_parts <> tail_plans), rest)} : Spec.Stack}
  %Equal.sym(Spec.Stack, Spec.fold(head_operations, Spec.ValidStack{rest}),
    Spec.ValidStack{head_parts <> rest}, first) :
    {Spec.fold(tail_operations, _) == Spec.ValidStack{List.append(&2, List<&2, Plan.Piece>,
      List.reverse(&2, List<&2, Plan.Piece>, head_parts <> tail_plans), rest)} : Spec.Stack}
  %Equal.sym(List<&2, List<&2, Plan.Piece>>,
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>,
      head_parts <> tail_plans), rest),
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, tail_plans),
      head_parts <> rest),
    LocalProof.popped_accumulator(head_parts, tail_plans, rest)) :
    {Spec.fold(tail_operations,
      Spec.ValidStack{head_parts <> rest}) == Spec.ValidStack{_} : Spec.Stack}
  later

def sequence_result(
  +value: Value.ProductValue, +head_operations: List<&2, Plan.Operation>, +head_parts: List<&2,
    Plan.Piece>,
  +tail_values: List<&2, Value.ProductValue>, +tail_operations: List<&2, Plan.Operation>,
    +tail_plans: List<&2, List<&2, Plan.Piece>>,
  first: @rest: List<&2, List<&2, Plan.Piece>> -> {Spec.fold(head_operations,
    Spec.ValidStack{rest}) == Spec.ValidStack{head_parts <> rest} : Spec.Stack},
  later: forest_result(tail_values, tail_operations, tail_plans)
) -> forest_result(value <> tail_values, List.append(&2, Plan.Operation, head_operations,
  tail_operations), head_parts <> tail_plans):
  match later:
    case (count, run):
      (Equal.cong(Nat, Nat, n => 1n+n,
        List.length(&2, Value.ProductValue, tail_values), List.length(&2, List<&2, Plan.Piece>,
          tail_plans), count),
      +rest => sequence_run(head_operations, head_parts, tail_operations, tail_plans, rest, first(
        rest), run(head_parts <> rest)))

def close_run(
  +operations: List<&2, Plan.Operation>, +plans: List<&2, List<&2, Plan.Piece>>,
  +operation: Plan.Operation, +parts: List<&2, Plan.Piece>, +rest: List<&2, List<&2, Plan.Piece>>,
  children: {Spec.fold(operations, Spec.ValidStack{rest}) == Spec.ValidStack{
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans),
      rest)} : Spec.Stack},
  closed: {Spec.operation(operation,
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans),
      rest)) == Spec.ValidStack{parts <> rest} : Spec.Stack}
) -> {Spec.fold(List.append(&2, Plan.Operation, operations, [operation]),
  Spec.ValidStack{rest}) == Spec.ValidStack{parts <> rest} : Spec.Stack}:
  %Equal.sym(Spec.Stack,
    Spec.fold(List.append(&2, Plan.Operation, operations, [operation]), Spec.ValidStack{rest}),
    Spec.fold([operation], Spec.fold(operations, Spec.ValidStack{rest})),
    Local.fold_composition(operations, [operation], Spec.ValidStack{rest})) :
    {_ == Spec.ValidStack{parts <> rest} : Spec.Stack}
  %Equal.sym(Spec.Stack, Spec.fold(operations, Spec.ValidStack{rest}), Spec.ValidStack{
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest)},
      children) :
    {Spec.fold([operation], _) == Spec.ValidStack{parts <> rest} : Spec.Stack}
  %Equal.sym(Spec.Stack, Spec.operation(operation,
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest)),
    Spec.ValidStack{parts <> rest}, closed) :
    {Spec.fold([], _) == Spec.ValidStack{parts <> rest} : Spec.Stack}
  {==}

def array_close(
  +items: List<&2, Value.ProductValue>, +plans: List<&2, List<&2, Plan.Piece>>,
  +rest: List<&2, List<&2, Plan.Piece>>,
  count: {List.length(&2, Value.ProductValue, items) == List.length(&2, List<&2, Plan.Piece>,
    plans) : Nat}
) -> {Spec.operation(Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)},
  List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest))
  == Spec.ValidStack{Compound.array_trace(plans) <> rest} : Spec.Stack}:
  %Equal.sym(Nat, List.length(&2, Value.ProductValue, items), List.length(&2, List<&2, Plan.Piece>,
    plans), count) :
    {Spec.operation(Plan.ArrayOperation{_}, List.append(&2, List<&2, Plan.Piece>, List.reverse(&2,
      List<&2, Plan.Piece>, plans), rest))
    == Spec.ValidStack{Compound.array_trace(plans) <> rest} : Spec.Stack}
  Compound.array_exact(plans, rest)

def array_run(
  +items: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>, +plans: List<&2,
    List<&2, Plan.Piece>>,
  result: forest_result(items, operations, plans)
) -> @rest: List<&2, List<&2, Plan.Piece>> -> {
  Spec.fold(List.append(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2,
    Value.ProductValue, items)}]), Spec.ValidStack{rest})
  == Spec.ValidStack{Compound.array_trace(plans) <> rest} : Spec.Stack}:
  match result:
    case (count, run):
      +rest => close_run(operations, plans, Plan.ArrayOperation{List.length(&2, Value.ProductValue,
        items)},
        Compound.array_trace(plans), rest, run(rest), array_close(items, plans, rest, count))

def object_close(
  +fields: List<&2, Value.OrderedField<Value.ProductValue>>, +planned_fields: List<&2, Spec.Field>,
  +rest: List<&2, List<&2, Plan.Piece>>,
  keys: {Compound.keys(planned_fields) == Laws.field_keys(fields) : List<&2, String>}
) -> {Spec.operation(Plan.ObjectOperation{Laws.field_keys(fields)},
  List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, Compound.values(
    planned_fields)), rest))
  == Spec.ValidStack{Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le,
    planned_fields)) <> rest} : Spec.Stack}:
  %keys : {Spec.operation(Plan.ObjectOperation{_},
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, Compound.values(
      planned_fields)), rest))
    == Spec.ValidStack{Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le,
      planned_fields)) <> rest} : Spec.Stack}
  Compound.object_exact(planned_fields, rest)

def object_run(
  +fields: List<&2, Value.OrderedField<Value.ProductValue>>, +planned_fields: List<&2, Spec.Field>,
  +operations: List<&2, Plan.Operation>,
  keys: {Compound.keys(planned_fields) == Laws.field_keys(fields) : List<&2, String>},
  result: forest_result(Laws.field_values(fields), operations, Compound.values(planned_fields))
) -> @rest: List<&2, List<&2, Plan.Piece>> -> {
  Spec.fold(List.append(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(
    fields)}]), Spec.ValidStack{rest})
  == Spec.ValidStack{Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le,
    planned_fields)) <> rest} : Spec.Stack}:
  match result:
    case (_, run):
      +rest => close_run(operations, Compound.values(planned_fields),
        Plan.ObjectOperation{Laws.field_keys(fields)},
        Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, planned_fields)), rest, run(
          rest), object_close(fields, planned_fields, rest, keys))

def joined_operations(
  -operations: List<&2, Plan.Operation>, +children: List<&2, Plan.Operation>,
    +operation: Plan.Operation, +tail: List<&2, Plan.Operation>,
  shape: {operations == List.append(&2, Plan.Operation, children, operation <> tail) : List<&2,
    Plan.Operation>}
) -> {operations == List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, children,
  [operation]), tail) : List<&2, Plan.Operation>}:
  Equal.trans(List<&2, Plan.Operation>, operations, List.append(&2, Plan.Operation, children,
    operation <> tail),
    List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, children, [operation]), tail),
      shape,
    Equal.sym(List<&2, Plan.Operation>,
      List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, children, [operation]), tail),
      List.append(&2, Plan.Operation, children, operation <> tail),
      Lists.append_assoc(&2, Plan.Operation, children, [operation], tail)))

# One induction returns count and the arbitrary-understack transition together,
# so child evidence is consumed once even when array closure needs both facts.
def derive_forest(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  encoding: Laws.ForestEncoding<values, operations, plans>
) -> forest_result(values, operations, plans):
  match encoding:
    case Laws.EmptyForest{v, o, p}:
      result_transport(values, operations, plans, [], [], [], v, o, p, ({==}, rest => {==}))
    case Laws.PrimitiveForest{+primitive, +tv, +to, +tp, tail, v, o, p}:
      result_transport(values, operations, plans,
        Laws.primitive_value(primitive) <> tv, Plan.PrimitiveOperation{primitive} <> to,
          [Plan.PrimitivePiece{primitive}] <> tp,
        v, o, p,
        sequence_result(Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}],
          [Plan.PrimitivePiece{primitive}],
          tv, to, tp, rest => {==}, derive_forest(tv, to, tp, tail)))
    case Laws.ArrayForest{+items, +co, +cp, +tv, +to, +tp, children, tail, v, o, p}:
      result_transport(values, operations, plans,
        Value.ProductArray{items} <> tv,
        List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, co,
          [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), to),
        Compound.array_trace(cp) <> tp, v,
        joined_operations(operations, co, Plan.ArrayOperation{List.length(&2, Value.ProductValue,
          items)}, to, o), p,
        sequence_result(Value.ProductArray{items}, List.append(&2, Plan.Operation, co,
          [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]),
          Compound.array_trace(cp), tv, to, tp, array_run(items, co, cp, derive_forest(items, co,
            cp, children)), derive_forest(tv, to, tp, tail)))
    case Laws.ObjectForest{+fields, +pf, +co, +tv, +to, +tp, children, keys, tail, v, o, p}:
      result_transport(values, operations, plans,
        Value.ProductObject{fields} <> tv,
        List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, co,
          [Plan.ObjectOperation{Laws.field_keys(fields)}]), to),
        Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, pf)) <> tp, v,
        joined_operations(operations, co, Plan.ObjectOperation{Laws.field_keys(fields)}, to, o), p,
        sequence_result(Value.ProductObject{fields}, List.append(&2, Plan.Operation, co,
          [Plan.ObjectOperation{Laws.field_keys(fields)}]),
          Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, pf)), tv, to, tp,
          object_run(fields, pf, co, keys, derive_forest(Laws.field_values(fields), co,
            Compound.values(pf), children)), derive_forest(tv, to, tp, tail)))

def use_forest_result(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  rest: List<&2, List<&2, Plan.Piece>>, result: forest_result(values, operations, plans)
) -> {Spec.fold(operations, Spec.ValidStack{rest}) == Spec.ValidStack{
  List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans),
    rest)} : Spec.Stack}:
  match result:
    case (_, run): run(rest)

def Laws.forest_exact(values, operations, plans, rest, encoding):
  use_forest_result(values, operations, plans, rest, derive_forest(values, operations, plans,
    encoding))

def Laws.tree_exact(value, operations, parts, encoding):
  Equal.trans(Maybe<&2, List<&2, Plan.Piece>>,
    Plan.compile(operations), Spec.compile(operations), Some{parts},
    RopeLaws.compile_exact(operations),
    Equal.cong(Spec.Stack, Maybe<&2, List<&2, Plan.Piece>>, state => Spec.finish(state),
      Spec.fold(operations, Spec.ValidStack{[]}), Spec.ValidStack{[parts]},
      Laws.forest_exact([value], operations, [parts], [], encoding)))

def nat_reflexive(+value: Nat) -> {Nat.is_eq(value, value) == True{} : Bool}:
  match value:
    case 0n: {==}
    case 1n++tail: nat_reflexive(tail)

def bits_reflexive(+bits: Value.Binary64) -> {Validation.bits_equal(bits, bits) == True{} : Bool}:
  match bits:
    case Value.Binary64{+high, +low}:
      %Strings.internal_u32_cmp_refl(high) : {Bool.and(Cmp.is_eq(_), U32.is_eq(low,
        low)) == True{} : Bool}
      %Strings.internal_u32_cmp_refl(low) : {Bool.and(True{}, Cmp.is_eq(_)) == True{} : Bool}
      {==}

def primitive_reflexive(+primitive: Json.Primitive) -> {Validation.primitive_matches(primitive,
  Laws.primitive_value(primitive)) == True{} : Bool}:
  match primitive:
    case Json.NullPrimitive{}: {==}
    case Json.BoolPrimitive{value}:
      match value:
        case False{}: {==}
        case True{}: {==}
    case Json.NumberPrimitive{bits}: bits_reflexive(bits)
    case Json.StringPrimitive{value}: string_reflexive(value)

def keys_reflexive(+fields: List<&2,
  Value.OrderedField<Value.ProductValue>>) -> {Validation.object_keys(Laws.field_keys(fields),
  fields) == True{} : Bool}:
  match fields:
    case []: {==}
    case Value.OrderedField{+key, _} <> +tail:
      %Equal.sym(Bool, Validation.equal_go(key, key, True{}), True{}, string_reflexive(key)) :
        {Bool.and(_, Validation.object_keys(Laws.field_keys(tail), tail)) == True{} : Bool}
      keys_reflexive(tail)

def field_values_same(+fields: List<&2,
  Value.OrderedField<Value.ProductValue>>) -> {Validation.field_values(fields) == Laws.field_values(
  fields) : List<&2, Value.ProductValue>}:
  match fields:
    case []: {==}
    case Value.OrderedField{_, +value} <> +tail:
      Equal.cong(List<&2, Value.ProductValue>, List<&2, Value.ProductValue>, xs => value <> xs,
        Validation.field_values(tail), Laws.field_values(tail), field_values_same(tail))

# Accumulator reversal exposes exactly the validator's existing continuation.
def reverse_operations(+left: List<&2, Plan.Operation>, +right: List<&2, Plan.Operation>,
  +suffix: List<&2, Plan.Operation>) -> {
  List.reverse.go(&2, Plan.Operation, List.append(&2, Plan.Operation, left, right), suffix)
  == List.reverse.go(&2, Plan.Operation, right, List.reverse.go(&2, Plan.Operation, left,
    suffix)) : List<&2, Plan.Operation>}:
  match left:
    case []: {==}
    case head <> tail: reverse_operations(tail, right, head <> suffix)

def continuation(-values: List<&2, Value.ProductValue>, -operations: List<&2,
  Plan.Operation>) -> Type:
  @suffix: List<&2, Plan.Operation> -> @expected: List<&2, Value.ProductValue> -> {
    Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
      List.reverse.go(&2, Value.ProductValue, values, expected))
    == Validation.validate_reversed(suffix, expected) : Bool}

def continuation_transport(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>,
  -actual_values: List<&2, Value.ProductValue>, -actual_operations: List<&2, Plan.Operation>,
  v: {values == actual_values : List<&2, Value.ProductValue>},
    o: {operations == actual_operations : List<&2, Plan.Operation>},
  proof: continuation(actual_values, actual_operations)
) -> continuation(values, operations):
  %Equal.sym(List<&2, Value.ProductValue>, values, actual_values, v) : continuation(_, operations)
  %Equal.sym(List<&2, Plan.Operation>, operations, actual_operations, o) : continuation(
    actual_values, _)
  proof

def continuation_sequence_run(
  +value: Value.ProductValue, +head: List<&2, Plan.Operation>, +tail_values: List<&2,
    Value.ProductValue>, +tail: List<&2, Plan.Operation>,
  +suffix: List<&2, Plan.Operation>, +expected: List<&2, Value.ProductValue>,
  first: {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, head, suffix),
    value <> expected) == Validation.validate_reversed(suffix, expected) : Bool},
  later: {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, tail, List.reverse.go(&2,
    Plan.Operation, head, suffix)),
    List.reverse.go(&2, Value.ProductValue, tail_values,
      value <> expected)) == Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, head,
      suffix), value <> expected) : Bool}
) -> {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, List.append(&2,
  Plan.Operation, head, tail), suffix),
  List.reverse.go(&2, Value.ProductValue, value <> tail_values,
    expected)) == Validation.validate_reversed(suffix, expected) : Bool}:
  %Equal.sym(List<&2, Plan.Operation>, List.reverse.go(&2, Plan.Operation, List.append(&2,
    Plan.Operation, head, tail), suffix),
    List.reverse.go(&2, Plan.Operation, tail, List.reverse.go(&2, Plan.Operation, head, suffix)),
      reverse_operations(head, tail, suffix)) :
    {Validation.validate_reversed(_, List.reverse.go(&2, Value.ProductValue, tail_values,
      value <> expected)) == Validation.validate_reversed(suffix, expected) : Bool}
  Equal.trans(Bool,
    Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, tail, List.reverse.go(&2,
      Plan.Operation, head, suffix)), List.reverse.go(&2, Value.ProductValue, tail_values,
      value <> expected)),
    Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, head, suffix),
      value <> expected),
    Validation.validate_reversed(suffix, expected), later, first)

def continuation_sequence(
  +value: Value.ProductValue, +head: List<&2, Plan.Operation>, +tail_values: List<&2,
    Value.ProductValue>, +tail: List<&2, Plan.Operation>,
  first: continuation([value], head), later: continuation(tail_values, tail)
) -> continuation(value <> tail_values, List.append(&2, Plan.Operation, head, tail)):
  +suffix => +expected => continuation_sequence_run(value, head, tail_values, tail, suffix,
    expected,
    first(suffix, expected), later(List.reverse.go(&2, Plan.Operation, head, suffix),
      value <> expected))

def primitive_continuation(+primitive: Json.Primitive) -> continuation([Laws.primitive_value(
  primitive)], [Plan.PrimitiveOperation{primitive}]):
  suffix => expected =>
    %Equal.sym(Bool, Validation.primitive_matches(primitive, Laws.primitive_value(primitive)),
      True{}, primitive_reflexive(primitive)) :
      {Bool.and(_, Validation.validate_reversed(suffix, expected)) == Validation.validate_reversed(
        suffix, expected) : Bool}
    {==}

def array_continuation_run(
  +items: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>,
  +suffix: List<&2, Plan.Operation>, +expected: List<&2, Value.ProductValue>,
  children: {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
    List.reverse.go(&2, Value.ProductValue, items, expected))
    == Validation.validate_reversed(suffix, expected) : Bool}
) -> {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation,
  List.append(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2,
    Value.ProductValue, items)}]), suffix),
  Value.ProductArray{items} <> expected) == Validation.validate_reversed(suffix, expected) : Bool}:
  %Equal.sym(List<&2, Plan.Operation>,
    List.reverse.go(&2, Plan.Operation, List.append(&2, Plan.Operation, operations,
      [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), suffix),
    Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)} <> List.reverse.go(&2,
      Plan.Operation, operations, suffix),
    reverse_operations(operations, [Plan.ArrayOperation{List.length(&2, Value.ProductValue,
      items)}], suffix)) :
    {Validation.validate_reversed(_,
      Value.ProductArray{items} <> expected) == Validation.validate_reversed(suffix,
      expected) : Bool}
  %Equal.sym(Bool, Nat.is_eq(List.length(&2, Value.ProductValue, items), List.length(&2,
    Value.ProductValue, items)), True{}, nat_reflexive(List.length(&2, Value.ProductValue,
    items))) :
    {Bool.and(_, Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations,
      suffix),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, items),
        expected))) == Validation.validate_reversed(suffix, expected) : Bool}
  %Lists.reverse_go_spec(&2, Value.ProductValue, items, expected) :
    {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
      _) == Validation.validate_reversed(suffix, expected) : Bool}
  children

def array_continuation(+items: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>,
  children: continuation(items, operations)) -> continuation(
    [Value.ProductArray{items}], List.append(&2, Plan.Operation, operations,
    [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}])):
  +suffix => +expected => array_continuation_run(items, operations, suffix, expected, children(
    suffix, expected))

def object_continuation_run(
  +fields: List<&2, Value.OrderedField<Value.ProductValue>>, +operations: List<&2, Plan.Operation>,
  +suffix: List<&2, Plan.Operation>, +expected: List<&2, Value.ProductValue>,
  children: {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
    List.reverse.go(&2, Value.ProductValue, Laws.field_values(fields), expected))
    == Validation.validate_reversed(suffix, expected) : Bool}
) -> {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation,
  List.append(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(fields)}]),
    suffix),
  Value.ProductObject{fields} <> expected) == Validation.validate_reversed(suffix,
    expected) : Bool}:
  %Equal.sym(List<&2, Plan.Operation>,
    List.reverse.go(&2, Plan.Operation, List.append(&2, Plan.Operation, operations,
      [Plan.ObjectOperation{Laws.field_keys(fields)}]), suffix),
    Plan.ObjectOperation{Laws.field_keys(fields)} <> List.reverse.go(&2, Plan.Operation, operations,
      suffix),
    reverse_operations(operations, [Plan.ObjectOperation{Laws.field_keys(fields)}], suffix)) :
    {Validation.validate_reversed(_,
      Value.ProductObject{fields} <> expected) == Validation.validate_reversed(suffix,
      expected) : Bool}
  %Equal.sym(Bool, Validation.object_keys(Laws.field_keys(fields), fields), True{}, keys_reflexive(
    fields)) :
    {Bool.and(_, Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations,
      suffix),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue,
        Validation.field_values(fields)), expected))) == Validation.validate_reversed(suffix,
        expected) : Bool}
  %Equal.sym(List<&2, Value.ProductValue>, Validation.field_values(fields), Laws.field_values(
    fields), field_values_same(fields)) :
    {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, _),
        expected)) == Validation.validate_reversed(suffix, expected) : Bool}
  %Lists.reverse_go_spec(&2, Value.ProductValue, Laws.field_values(fields), expected) :
    {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
      _) == Validation.validate_reversed(suffix, expected) : Bool}
  children

def object_continuation(+fields: List<&2, Value.OrderedField<Value.ProductValue>>,
  +operations: List<&2, Plan.Operation>, children: continuation(Laws.field_values(fields),
  operations)) -> continuation(
    [Value.ProductObject{fields}], List.append(&2, Plan.Operation, operations,
    [Plan.ObjectOperation{Laws.field_keys(fields)}])):
  +suffix => +expected => object_continuation_run(fields, operations, suffix, expected, children(
    suffix, expected))

# The reverse interpreter consumes each whole encoded forest before its suffix.
def derive_continuation(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  encoding: Laws.ForestEncoding<values, operations, plans>
) -> continuation(values, operations):
  match encoding:
    case Laws.EmptyForest{v, o, _}:
      continuation_transport(values, operations, [], [], v, o, suffix => expected => {==})
    case Laws.PrimitiveForest{+primitive, +tv, +to, tp, tail, v, o, _}:
      continuation_transport(values, operations, Laws.primitive_value(primitive) <> tv,
        Plan.PrimitiveOperation{primitive} <> to, v, o,
        continuation_sequence(Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}],
          tv, to,
          primitive_continuation(primitive), derive_continuation(tv, to, tp, tail)))
    case Laws.ArrayForest{+items, +co, cp, +tv, +to, tp, children, tail, v, o, _}:
      continuation_transport(values, operations, Value.ProductArray{items} <> tv,
        List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, co,
          [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), to),
        v, joined_operations(operations, co, Plan.ArrayOperation{List.length(&2, Value.ProductValue,
          items)}, to, o),
        continuation_sequence(Value.ProductArray{items}, List.append(&2, Plan.Operation, co,
          [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), tv, to,
          array_continuation(items, co, derive_continuation(items, co, cp, children)),
            derive_continuation(tv, to, tp, tail)))
    case Laws.ObjectForest{+fields, pf, +co, +tv, +to, tp, children, _, tail, v, o, _}:
      continuation_transport(values, operations, Value.ProductObject{fields} <> tv,
        List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, co,
          [Plan.ObjectOperation{Laws.field_keys(fields)}]), to),
        v, joined_operations(operations, co, Plan.ObjectOperation{Laws.field_keys(fields)}, to, o),
        continuation_sequence(Value.ProductObject{fields}, List.append(&2, Plan.Operation, co,
          [Plan.ObjectOperation{Laws.field_keys(fields)}]), tv, to,
          object_continuation(fields, co, derive_continuation(Laws.field_values(fields), co,
            Compound.values(pf), children)), derive_continuation(tv, to, tp, tail)))

def Laws.validation_complete(values, operations, plans, encoding):
  derive_continuation(values, operations, plans, encoding)([], [])

# Equality duplication is derived by equality elimination; affine proof values
# are never marked Data. This retains the checked derivation while exposing count.
def equality_twice_type(-A: Type, -left: A, -right: A) -> Type:
  {left == right : A} & {left == right : A}

def equality_twice(-A: Type, -left: A, -right: A,
  proof: {left == right : A}) -> equality_twice_type(A, left, right):
  %proof : equality_twice_type(A, left, _)
  ({==}, {==})

def count_transport(
  -values: List<&2, Value.ProductValue>, -plans: List<&2, List<&2, Plan.Piece>>,
  -actual_values: List<&2, Value.ProductValue>, -actual_plans: List<&2, List<&2, Plan.Piece>>,
  values_shape: {values == actual_values : List<&2, Value.ProductValue>},
  plans_shape: {plans == actual_plans : List<&2, List<&2, Plan.Piece>>},
  count: {List.length(&2, Value.ProductValue, actual_values) == List.length(&2, List<&2,
    Plan.Piece>, actual_plans) : Nat}
) -> {List.length(&2, Value.ProductValue, values) == List.length(&2, List<&2, Plan.Piece>,
  plans) : Nat}:
  %Equal.sym(List<&2, Value.ProductValue>, values, actual_values, values_shape) :
    {List.length(&2, Value.ProductValue, _) == List.length(&2, List<&2, Plan.Piece>, plans) : Nat}
  %Equal.sym(List<&2, List<&2, Plan.Piece>>, plans, actual_plans, plans_shape) :
    {List.length(&2, Value.ProductValue, actual_values) == List.length(&2, List<&2, Plan.Piece>,
      _) : Nat}
  count

def retained_count(-values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>,
  -plans: List<&2, List<&2, Plan.Piece>>) -> Type:
  Laws.ForestEncoding<values, operations, plans> &
    {List.length(&2, Value.ProductValue, values) == List.length(&2, List<&2, Plan.Piece>,
      plans) : Nat}

def preserve_empty(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  vs: equality_twice_type(List<&2, Value.ProductValue>, values, []),
  o: {operations == [] : List<&2, Plan.Operation>},
  ps: equality_twice_type(List<&2, List<&2, Plan.Piece>>, plans, [])
) -> retained_count(values, operations, plans):
  match vs ps:
    case Tuple{v1, v2} Tuple{p1, p2}:
      (Laws.EmptyForest{v1, o, p1}, count_transport(values, plans, [], [], v2, p2, {==}))

def preserve_step(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  -head: Value.ProductValue, -parts: List<&2, Plan.Piece>,
  -tv: List<&2, Value.ProductValue>, -to: List<&2, Plan.Operation>, -tp: List<&2, List<&2,
    Plan.Piece>>,
  vs: equality_twice_type(List<&2, Value.ProductValue>, values, head <> tv),
  ps: equality_twice_type(List<&2, List<&2, Plan.Piece>>, plans, parts <> tp),
  tail: retained_count(tv, to, tp),
  rebuild: {values == head <> tv : List<&2, Value.ProductValue>} ->
    {plans == parts <> tp : List<&2, List<&2, Plan.Piece>>} ->
    Laws.ForestEncoding<tv, to, tp> -> Laws.ForestEncoding<values, operations, plans>
) -> retained_count(values, operations, plans):
  match vs ps tail:
    case Tuple{v1, v2} Tuple{p1, p2} Tuple{encoding, count}:
      (rebuild(v1, p1, encoding), count_transport(values, plans, head <> tv, parts <> tp, v2, p2,
        Equal.cong(Nat, Nat, n => 1n+n, List.length(&2, Value.ProductValue, tv), List.length(&2,
          List<&2, Plan.Piece>, tp), count)))

def preserve_count(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  encoding: Laws.ForestEncoding<values, operations, plans>
) -> retained_count(values, operations, plans):
  match encoding:
    case Laws.EmptyForest{v, o, p}:
      preserve_empty(values, operations, plans,
        equality_twice(List<&2, Value.ProductValue>, values, [], v), o,
        equality_twice(List<&2, List<&2, Plan.Piece>>, plans, [], p))
    case Laws.PrimitiveForest{+primitive, +tv, +to, +tp, tail, v, o, p}:
      preserve_step(values, operations, plans, Laws.primitive_value(primitive),
        [Plan.PrimitivePiece{primitive}], tv, to, tp,
        equality_twice(List<&2, Value.ProductValue>, values, Laws.primitive_value(primitive) <> tv,
          v),
        equality_twice(List<&2, List<&2, Plan.Piece>>, plans,
          [Plan.PrimitivePiece{primitive}] <> tp, p),
        preserve_count(tv, to, tp, tail),
        v1 => p1 => rest => Laws.PrimitiveForest{primitive, tv, to, tp, rest, v1, o, p1})
    case Laws.ArrayForest{+items, co, +cp, +tv, +to, +tp, children, tail, v, o, p}:
      preserve_step(values, operations, plans, Value.ProductArray{items}, Compound.array_trace(cp),
        tv, to, tp,
        equality_twice(List<&2, Value.ProductValue>, values, Value.ProductArray{items} <> tv, v),
        equality_twice(List<&2, List<&2, Plan.Piece>>, plans, Compound.array_trace(cp) <> tp, p),
        preserve_count(tv, to, tp, tail),
        v1 => p1 => rest => Laws.ArrayForest{items, co, cp, tv, to, tp, children, rest, v1, o, p1})
    case Laws.ObjectForest{+fields, +pf, co, +tv, +to, +tp, children, keys, tail, v, o, p}:
      preserve_step(values, operations, plans, Value.ProductObject{fields}, Compound.object_trace(
        List.sort(~Spec.Field, ~Spec.fields_le, pf)), tv, to, tp,
        equality_twice(List<&2, Value.ProductValue>, values, Value.ProductObject{fields} <> tv, v),
        equality_twice(List<&2, List<&2, Plan.Piece>>, plans, Compound.object_trace(List.sort(
          ~Spec.Field, ~Spec.fields_le, pf)) <> tp, p),
        preserve_count(tv, to, tp, tail),
        v1 => p1 => rest => Laws.ObjectForest{fields, pf, co, tv, to, tp, children, keys, rest, v1,
          o, p1})

def encoding_values(
  -target: List<&2, Value.ProductValue>, -actual: List<&2, Value.ProductValue>,
  -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  equal: {target == actual : List<&2, Value.ProductValue>}, proof: Laws.ForestEncoding<actual,
    operations, plans>
) -> Laws.ForestEncoding<target, operations, plans>:
  %Equal.sym(List<&2, Value.ProductValue>, target, actual, equal) : Laws.ForestEncoding<_,
    operations, plans>
  proof

def cons_parts_type(-head: Value.ProductValue, -tail: List<&2, Value.ProductValue>, -right: List<&2,
  Value.ProductValue>) -> Type:
  {head == Maybe.default(&2, Value.ProductValue, List.head(&2, Value.ProductValue, right),
    Value.ProductNull{}) : Value.ProductValue} &
    {tail == List.tail(&2, Value.ProductValue, right) : List<&2, Value.ProductValue>}

def cons_parts(
  -head: Value.ProductValue, -tail: List<&2, Value.ProductValue>, -other: Value.ProductValue,
    -rest: List<&2, Value.ProductValue>,
  equal: {head <> tail == other <> rest : List<&2, Value.ProductValue>}
) -> {head == other : Value.ProductValue} & {tail == rest : List<&2, Value.ProductValue>}:
  %equal : cons_parts_type(head, tail, _)
  ({==}, {==})

# A prefix cut returns exact operation slices and their constructive encodings.
# Old trace choices need not be retained: soundness requires a trace witness.
def cut_result(-prefix: List<&2, Value.ProductValue>, -suffix: List<&2, Value.ProductValue>,
  -operations: List<&2, Plan.Operation>) -> Type:
  Sigma<&2, &1, List<&2, Plan.Operation>, left_operations =>
    Sigma<&2, &1, List<&2, Plan.Operation>, right_operations =>
      Sigma<&2, &1, List<&2, List<&2, Plan.Piece>>, left_plans =>
        Sigma<&2, &1, List<&2, List<&2, Plan.Piece>>, right_plans =>
          Laws.ForestEncoding<prefix, left_operations, left_plans> &
          (Laws.ForestEncoding<suffix, right_operations, right_plans> &
            {operations == List.append(&2, Plan.Operation, left_operations,
              right_operations) : List<&2, Plan.Operation>})>>>>

def head_builder(-value: Value.ProductValue, -operations: List<&2, Plan.Operation>, -parts: List<&2,
  Plan.Piece>) -> Type:
  @tail_values: List<&2, Value.ProductValue> -> @tail_operations: List<&2,
    Plan.Operation> -> @tail_plans: List<&2, List<&2, Plan.Piece>> ->
    Laws.ForestEncoding<tail_values, tail_operations, tail_plans> ->
    Laws.ForestEncoding<value <> tail_values, List.append(&2, Plan.Operation, operations,
      tail_operations), parts <> tail_plans>

def primitive_builder(+primitive: Json.Primitive) -> head_builder(Laws.primitive_value(primitive),
  [Plan.PrimitiveOperation{primitive}], [Plan.PrimitivePiece{primitive}]):
  tv => to => tp => tail => Laws.PrimitiveForest{primitive, tv, to, tp, tail, {==}, {==}, {==}}

def array_builder(
  +items: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>, +plans: List<&2,
    List<&2, Plan.Piece>>,
  children: Laws.ForestEncoding<items, operations, plans>
) -> head_builder(Value.ProductArray{items}, List.append(&2, Plan.Operation, operations,
  [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), Compound.array_trace(plans)):
  tv => +to => tp => tail => Laws.ArrayForest{items, operations, plans, tv, to, tp, children, tail,
    {==},
    Lists.append_assoc(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2,
      Value.ProductValue, items)}], to), {==}}

def object_builder(
  +fields: List<&2, Value.OrderedField<Value.ProductValue>>, +planned: List<&2, Spec.Field>,
    +operations: List<&2, Plan.Operation>,
  children: Laws.ForestEncoding<Laws.field_values(fields), operations, Compound.values(planned)>,
  keys: {Compound.keys(planned) == Laws.field_keys(fields) : List<&2, String>}
) -> head_builder(Value.ProductObject{fields}, List.append(&2, Plan.Operation, operations,
  [Plan.ObjectOperation{Laws.field_keys(fields)}]),
  Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, planned))):
  tv => +to => tp => tail => Laws.ObjectForest{fields, planned, operations, tv, to, tp, children,
    keys, tail, {==},
    Lists.append_assoc(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(
      fields)}], to), {==}}

def cut_operations(
  -operations: List<&2, Plan.Operation>, +head: List<&2, Plan.Operation>, -tail: List<&2,
    Plan.Operation>,
  +left: List<&2, Plan.Operation>, +right: List<&2, Plan.Operation>,
  outer: {operations == List.append(&2, Plan.Operation, head, tail) : List<&2, Plan.Operation>},
  inner: {tail == List.append(&2, Plan.Operation, left, right) : List<&2, Plan.Operation>}
) -> {operations == List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, head, left),
  right) : List<&2, Plan.Operation>}:
  Equal.trans(List<&2, Plan.Operation>, operations, List.append(&2, Plan.Operation, head, tail),
    List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, head, left), right), outer,
    Equal.trans(List<&2, Plan.Operation>, List.append(&2, Plan.Operation, head, tail), List.append(
      &2, Plan.Operation, head, List.append(&2, Plan.Operation, left, right)),
      List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, head, left), right),
      Equal.cong(List<&2, Plan.Operation>, List<&2, Plan.Operation>, xs => List.append(&2,
        Plan.Operation, head, xs), tail, List.append(&2, Plan.Operation, left, right), inner),
      Equal.sym(List<&2, Plan.Operation>, List.append(&2, Plan.Operation, List.append(&2,
        Plan.Operation, head, left), right),
        List.append(&2, Plan.Operation, head, List.append(&2, Plan.Operation, left, right)),
          Lists.append_assoc(&2, Plan.Operation, head, left, right))))

def cut_prepend(
  -source: Value.ProductValue, +prefix: List<&2, Value.ProductValue>, +suffix: List<&2,
    Value.ProductValue>,
  -operations: List<&2, Plan.Operation>, +value: Value.ProductValue, +head: List<&2,
    Plan.Operation>, +parts: List<&2, Plan.Piece>, -tail: List<&2, Plan.Operation>,
  head_equal: {source == value : Value.ProductValue},
  operations_equal: {operations == List.append(&2, Plan.Operation, head, tail) : List<&2,
    Plan.Operation>},
  build: head_builder(value, head, parts), cut: cut_result(prefix, suffix, tail)
) -> cut_result(source <> prefix, suffix, operations):
  match cut:
    case Tuple{+lo, Tuple{+ro, Tuple{+lp, Tuple{+rp, Tuple{left, Tuple{right, equal}}}}}}:
      (List.append(&2, Plan.Operation, head, lo), (ro, (parts <> lp, (rp,
        (encoding_values(source <> prefix, value <> prefix, List.append(&2, Plan.Operation, head,
          lo), parts <> lp,
          Equal.cong(Value.ProductValue, List<&2, Value.ProductValue>, x => x <> prefix, source,
            value, head_equal),
          build(prefix, lo, lp, left)),
        (right, cut_operations(operations, head, tail, lo, ro, operations_equal, equal)))))))

def use_cons_parts(
  -R: Type, -head: Value.ProductValue, -tail: List<&2, Value.ProductValue>,
    -other: Value.ProductValue, -rest: List<&2, Value.ProductValue>,
  proof: {head == other : Value.ProductValue} & {tail == rest : List<&2, Value.ProductValue>},
  use: {head == other : Value.ProductValue} -> {tail == rest : List<&2, Value.ProductValue>} -> R
) -> R:
  match proof:
    case (first, later): use(first, later)

# Splitting follows the original forest prefix; it does not search or add fuel.
def split_forest(
  +prefix: List<&2, Value.ProductValue>, +suffix: List<&2, Value.ProductValue>,
  +operations: List<&2, Plan.Operation>, +plans: List<&2, List<&2, Plan.Piece>>,
  encoding: Laws.ForestEncoding<List.append(&2, Value.ProductValue, prefix, suffix), operations,
    plans>
) -> cut_result(prefix, suffix, operations):
  match prefix encoding:
    case Nil{} encoding:
      ([], (operations, ([], (plans, (Laws.EmptyForest{{==}, {==}, {==}}, (encoding, {==}))))))
    case Con{head, tail} Laws.EmptyForest{v, _, _}:
      Empty.absurd(cut_result(head <> tail, suffix, operations), Strings.internal_false_ne_true(
        Equal.cong(List<&2, Value.ProductValue>, Bool, xs => List.is_empty(&2, Value.ProductValue,
          xs),
          head <> List.append(&2, Value.ProductValue, tail, suffix), [], v)))
    case Con{+source, +prefix} Laws.PrimitiveForest{+primitive, +tv, +to, tp, tail, v, o, _}:
      use_cons_parts(cut_result(source <> prefix, suffix, operations), source, List.append(&2,
        Value.ProductValue, prefix, suffix), Laws.primitive_value(primitive), tv,
        cons_parts(source, List.append(&2, Value.ProductValue, prefix, suffix),
          Laws.primitive_value(primitive), tv, v),
        head_equal => tail_equal => cut_prepend(source, prefix, suffix, operations,
          Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}],
            [Plan.PrimitivePiece{primitive}], to,
          head_equal, o, primitive_builder(primitive),
          split_forest(prefix, suffix, to, tp,
            encoding_values(List.append(&2, Value.ProductValue, prefix, suffix), tv, to, tp,
              tail_equal, tail))))
    case Con{+source, +prefix} Laws.ArrayForest{+items, +co, +cp, +tv, +to, tp, children, tail, v,
      o, _}:
      use_cons_parts(cut_result(source <> prefix, suffix, operations), source, List.append(&2,
        Value.ProductValue, prefix, suffix), Value.ProductArray{items}, tv,
        cons_parts(source, List.append(&2, Value.ProductValue, prefix, suffix),
          Value.ProductArray{items}, tv, v),
        head_equal => tail_equal => cut_prepend(source, prefix, suffix, operations,
          Value.ProductArray{items}, List.append(&2, Plan.Operation, co,
            [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]),
            Compound.array_trace(cp), to,
          head_equal, joined_operations(operations, co, Plan.ArrayOperation{List.length(&2,
            Value.ProductValue, items)}, to, o), array_builder(items, co, cp, children),
          split_forest(prefix, suffix, to, tp,
            encoding_values(List.append(&2, Value.ProductValue, prefix, suffix), tv, to, tp,
              tail_equal, tail))))
    case Con{+source, +prefix} Laws.ObjectForest{+fields, +pf, +co, +tv, +to, tp, children, keys,
      tail, v, o, _}:
      use_cons_parts(cut_result(source <> prefix, suffix, operations), source, List.append(&2,
        Value.ProductValue, prefix, suffix), Value.ProductObject{fields}, tv,
        cons_parts(source, List.append(&2, Value.ProductValue, prefix, suffix),
          Value.ProductObject{fields}, tv, v),
        head_equal => tail_equal => cut_prepend(source, prefix, suffix, operations,
          Value.ProductObject{fields}, List.append(&2, Plan.Operation, co,
            [Plan.ObjectOperation{Laws.field_keys(fields)}]),
          Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, pf)), to,
          head_equal, joined_operations(operations, co, Plan.ObjectOperation{Laws.field_keys(
            fields)}, to, o), object_builder(fields, pf, co, children, keys),
          split_forest(prefix, suffix, to, tp,
            encoding_values(List.append(&2, Value.ProductValue, prefix, suffix), tv, to, tp,
              tail_equal, tail))))

def encoding_transport(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  -actual_values: List<&2, Value.ProductValue>, -actual_operations: List<&2, Plan.Operation>,
    -actual_plans: List<&2, List<&2, Plan.Piece>>,
  v: {values == actual_values : List<&2, Value.ProductValue>},
  o: {operations == actual_operations : List<&2, Plan.Operation>},
  p: {plans == actual_plans : List<&2, List<&2, Plan.Piece>>},
  proof: Laws.ForestEncoding<actual_values, actual_operations, actual_plans>
) -> Laws.ForestEncoding<values, operations, plans>:
  %Equal.sym(List<&2, Value.ProductValue>, values, actual_values, v) : Laws.ForestEncoding<_,
    operations, plans>
  %Equal.sym(List<&2, Plan.Operation>, operations, actual_operations,
    o) : Laws.ForestEncoding<actual_values, _, plans>
  %Equal.sym(List<&2, List<&2, Plan.Piece>>, plans, actual_plans,
    p) : Laws.ForestEncoding<actual_values, actual_operations, _>
  proof

def append_step(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2,
    List<&2, Plan.Piece>>,
  +head: Value.ProductValue, +head_operations: List<&2, Plan.Operation>, +parts: List<&2,
    Plan.Piece>,
  +tv: List<&2, Value.ProductValue>, +to: List<&2, Plan.Operation>, +tp: List<&2, List<&2,
    Plan.Piece>>,
  +rv: List<&2, Value.ProductValue>, +ro: List<&2, Plan.Operation>, +rp: List<&2, List<&2,
    Plan.Piece>>,
  v: {values == head <> tv : List<&2, Value.ProductValue>},
  o: {operations == List.append(&2, Plan.Operation, head_operations, to) : List<&2,
    Plan.Operation>},
  p: {plans == parts <> tp : List<&2, List<&2, Plan.Piece>>},
  build: head_builder(head, head_operations, parts),
  tail: Laws.ForestEncoding<List.append(&2, Value.ProductValue, tv, rv), List.append(&2,
    Plan.Operation, to, ro), List.append(&2, List<&2, Plan.Piece>, tp, rp)>
) -> Laws.ForestEncoding<List.append(&2, Value.ProductValue, values, rv), List.append(&2,
  Plan.Operation, operations, ro), List.append(&2, List<&2, Plan.Piece>, plans, rp)>:
  encoding_transport(
    List.append(&2, Value.ProductValue, values, rv), List.append(&2, Plan.Operation, operations,
      ro), List.append(&2, List<&2, Plan.Piece>, plans, rp),
    head <> List.append(&2, Value.ProductValue, tv, rv), List.append(&2, Plan.Operation,
      head_operations, List.append(&2, Plan.Operation, to, ro)), parts <> List.append(&2, List<&2,
      Plan.Piece>, tp, rp),
    Equal.cong(List<&2, Value.ProductValue>, List<&2, Value.ProductValue>, xs => List.append(&2,
      Value.ProductValue, xs, rv), values, head <> tv, v),
    Equal.trans(List<&2, Plan.Operation>, List.append(&2, Plan.Operation, operations, ro),
      List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, head_operations, to), ro),
      List.append(&2, Plan.Operation, head_operations, List.append(&2, Plan.Operation, to, ro)),
      Equal.cong(List<&2, Plan.Operation>, List<&2, Plan.Operation>, xs => List.append(&2,
        Plan.Operation, xs, ro), operations, List.append(&2, Plan.Operation, head_operations, to),
        o),
      Lists.append_assoc(&2, Plan.Operation, head_operations, to, ro)),
    Equal.cong(List<&2, List<&2, Plan.Piece>>, List<&2, List<&2, Plan.Piece>>, xs => List.append(&2,
      List<&2, Plan.Piece>, xs, rp), plans, parts <> tp, p),
    build(List.append(&2, Value.ProductValue, tv, rv), List.append(&2, Plan.Operation, to, ro),
      List.append(&2, List<&2, Plan.Piece>, tp, rp), tail))

# Concatenate checked forests without rechecking or duplicating their witnesses.
def append_forest(
  -lv: List<&2, Value.ProductValue>, -lo: List<&2, Plan.Operation>, -lp: List<&2, List<&2,
    Plan.Piece>>,
  +rv: List<&2, Value.ProductValue>, +ro: List<&2, Plan.Operation>, +rp: List<&2, List<&2,
    Plan.Piece>>,
  left: Laws.ForestEncoding<lv, lo, lp>, right: Laws.ForestEncoding<rv, ro, rp>
) -> Laws.ForestEncoding<List.append(&2, Value.ProductValue, lv, rv), List.append(&2,
  Plan.Operation, lo, ro), List.append(&2, List<&2, Plan.Piece>, lp, rp)>:
  match left:
    case Laws.EmptyForest{v, o, p}:
      encoding_transport(List.append(&2, Value.ProductValue, lv, rv), List.append(&2,
        Plan.Operation, lo, ro), List.append(&2, List<&2, Plan.Piece>, lp, rp), rv, ro, rp,
        Equal.cong(List<&2, Value.ProductValue>, List<&2, Value.ProductValue>, xs => List.append(&2,
          Value.ProductValue, xs, rv), lv, [], v),
        Equal.cong(List<&2, Plan.Operation>, List<&2, Plan.Operation>, xs => List.append(&2,
          Plan.Operation, xs, ro), lo, [], o),
        Equal.cong(List<&2, List<&2, Plan.Piece>>, List<&2, List<&2, Plan.Piece>>,
          xs => List.append(&2, List<&2, Plan.Piece>, xs, rp), lp, [], p), right)
    case Laws.PrimitiveForest{+primitive, +tv, +to, +tp, tail, v, o, p}:
      append_step(lv, lo, lp, Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}],
        [Plan.PrimitivePiece{primitive}], tv, to, tp, rv, ro, rp,
        v, o, p, primitive_builder(primitive), append_forest(tv, to, tp, rv, ro, rp, tail, right))
    case Laws.ArrayForest{+items, +co, +cp, +tv, +to, +tp, children, tail, v, o, p}:
      append_step(lv, lo, lp, Value.ProductArray{items}, List.append(&2, Plan.Operation, co,
        [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), Compound.array_trace(
        cp), tv, to, tp, rv, ro, rp,
        v, joined_operations(lo, co, Plan.ArrayOperation{List.length(&2, Value.ProductValue,
          items)}, to, o), p, array_builder(items, co, cp, children), append_forest(tv, to, tp, rv,
          ro, rp, tail, right))
    case Laws.ObjectForest{+fields, +pf, +co, +tv, +to, +tp, children, keys, tail, v, o, p}:
      append_step(lv, lo, lp, Value.ProductObject{fields}, List.append(&2, Plan.Operation, co,
        [Plan.ObjectOperation{Laws.field_keys(fields)}]), Compound.object_trace(List.sort(
        ~Spec.Field, ~Spec.fields_le, pf)), tv, to, tp, rv, ro, rp,
        v, joined_operations(lo, co, Plan.ObjectOperation{Laws.field_keys(fields)}, to, o), p,
          object_builder(fields, pf, co, children, keys), append_forest(tv, to, tp, rv, ro, rp,
          tail, right))

def accepted_and(-R: Type, left: Bool, right: Bool, accepted: {Bool.and(left,
  right) == True{} : Bool}, use: {left == True{} : Bool} -> {right == True{} : Bool} -> R) -> R:
  match left right:
    case True{} True{}: use({==}, {==})
    case True{} False{}: Empty.absurd(R, Strings.internal_false_ne_true(accepted))
    case False{} True{}: Empty.absurd(R, Strings.internal_false_ne_true(accepted))
    case False{} False{}: Empty.absurd(R, Strings.internal_false_ne_true(accepted))

def bool_matches_equal(+left: Bool, +right: Bool, accepted: {Bool.not(Bool.xor(left,
  right)) == True{} : Bool}) -> {right == left : Bool}:
  match left right:
    case True{} True{}: {==}
    case False{} False{}: {==}
    case True{} False{}: Empty.absurd({False{} == True{} : Bool}, Strings.internal_false_ne_true(
      accepted))
    case False{} True{}: Empty.absurd({True{} == False{} : Bool}, Strings.internal_false_ne_true(
      accepted))

def bits_matches_equal(+left: Value.Binary64, +right: Value.Binary64,
  accepted: {Validation.bits_equal(left,
  right) == True{} : Bool}) -> {right == left : Value.Binary64}:
  match left right:
    case Value.Binary64{+a, +b} Value.Binary64{+c, +d}:
      accepted_and({Value.Binary64{c, d} == Value.Binary64{a, b} : Value.Binary64}, U32.is_eq(a, c),
        U32.is_eq(b, d), accepted,
        high => low => Equal.trans(Value.Binary64, Value.Binary64{c, d}, Value.Binary64{a, d},
          Value.Binary64{a, b},
          Equal.cong(U32, Value.Binary64, x => Value.Binary64{x, d}, c, a, Equal.sym(U32, a, c,
            Strings.u32_eq_of_is_eq(a, c, high))),
          Equal.cong(U32, Value.Binary64, x => Value.Binary64{a, x}, d, b, Equal.sym(U32, b, d,
            Strings.u32_eq_of_is_eq(b, d, low)))))

def primitive_matches_equal(+primitive: Json.Primitive, +value: Value.ProductValue,
  accepted: {Validation.primitive_matches(primitive,
  value) == True{} : Bool}) -> {value == Laws.primitive_value(primitive) : Value.ProductValue}:
  match primitive value:
    case Json.NullPrimitive{} Value.ProductNull{}: {==}
    case Json.BoolPrimitive{+a} Value.ProductBool{+b}:
      Equal.cong(Bool, Value.ProductValue, x => Value.ProductBool{x}, b, a, bool_matches_equal(a, b,
        accepted))
    case Json.NumberPrimitive{+a} Value.ProductNumber{+b}:
      Equal.cong(Value.Binary64, Value.ProductValue, x => Value.ProductNumber{x}, b, a,
        bits_matches_equal(a, b, accepted))
    case Json.StringPrimitive{+a} Value.ProductText{+b}:
      Equal.cong(String, Value.ProductValue, x => Value.ProductText{x}, b, a, Equal.sym(String, a,
        b, Strings.eq_of_eq_true(a, b, string_accepted(a, b, accepted))))
    case Json.NullPrimitive{} Value.ProductBool{+b}: Empty.absurd(
      {Value.ProductBool{b} == Laws.primitive_value(Json.NullPrimitive{}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NullPrimitive{} Value.ProductNumber{+b}: Empty.absurd(
      {Value.ProductNumber{b} == Laws.primitive_value(Json.NullPrimitive{}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NullPrimitive{} Value.ProductText{+b}: Empty.absurd(
      {Value.ProductText{b} == Laws.primitive_value(Json.NullPrimitive{}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NullPrimitive{} Value.ProductArray{+b}: Empty.absurd(
      {Value.ProductArray{b} == Laws.primitive_value(Json.NullPrimitive{}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NullPrimitive{} Value.ProductObject{+b}: Empty.absurd(
      {Value.ProductObject{b} == Laws.primitive_value(Json.NullPrimitive{}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.BoolPrimitive{+a} Value.ProductNull{}: Empty.absurd(
      {Value.ProductNull{} == Laws.primitive_value(Json.BoolPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.BoolPrimitive{+a} Value.ProductNumber{+b}: Empty.absurd(
      {Value.ProductNumber{b} == Laws.primitive_value(Json.BoolPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.BoolPrimitive{+a} Value.ProductText{+b}: Empty.absurd(
      {Value.ProductText{b} == Laws.primitive_value(Json.BoolPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.BoolPrimitive{+a} Value.ProductArray{+b}: Empty.absurd(
      {Value.ProductArray{b} == Laws.primitive_value(Json.BoolPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.BoolPrimitive{+a} Value.ProductObject{+b}: Empty.absurd(
      {Value.ProductObject{b} == Laws.primitive_value(Json.BoolPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NumberPrimitive{+a} Value.ProductNull{}: Empty.absurd(
      {Value.ProductNull{} == Laws.primitive_value(Json.NumberPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NumberPrimitive{+a} Value.ProductBool{+b}: Empty.absurd(
      {Value.ProductBool{b} == Laws.primitive_value(Json.NumberPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NumberPrimitive{+a} Value.ProductText{+b}: Empty.absurd(
      {Value.ProductText{b} == Laws.primitive_value(Json.NumberPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NumberPrimitive{+a} Value.ProductArray{+b}: Empty.absurd(
      {Value.ProductArray{b} == Laws.primitive_value(Json.NumberPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.NumberPrimitive{+a} Value.ProductObject{+b}: Empty.absurd(
      {Value.ProductObject{b} == Laws.primitive_value(
      Json.NumberPrimitive{a}) : Value.ProductValue}, Strings.internal_false_ne_true(accepted))
    case Json.StringPrimitive{+a} Value.ProductNull{}: Empty.absurd(
      {Value.ProductNull{} == Laws.primitive_value(Json.StringPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.StringPrimitive{+a} Value.ProductBool{+b}: Empty.absurd(
      {Value.ProductBool{b} == Laws.primitive_value(Json.StringPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.StringPrimitive{+a} Value.ProductNumber{+b}: Empty.absurd(
      {Value.ProductNumber{b} == Laws.primitive_value(
      Json.StringPrimitive{a}) : Value.ProductValue}, Strings.internal_false_ne_true(accepted))
    case Json.StringPrimitive{+a} Value.ProductArray{+b}: Empty.absurd(
      {Value.ProductArray{b} == Laws.primitive_value(Json.StringPrimitive{a}) : Value.ProductValue},
      Strings.internal_false_ne_true(accepted))
    case Json.StringPrimitive{+a} Value.ProductObject{+b}: Empty.absurd(
      {Value.ProductObject{b} == Laws.primitive_value(
      Json.StringPrimitive{a}) : Value.ProductValue}, Strings.internal_false_ne_true(accepted))

def matched_keys(+keys: List<&2, String>, +fields: List<&2, Value.OrderedField<Value.ProductValue>>,
  accepted: {Validation.object_keys(keys, fields) == True{} : Bool}) -> {keys == Laws.field_keys(
  fields) : List<&2, String>}:
  match keys fields:
    case Nil{} Nil{}: {==}
    case Con{+key, +keys} Con{Value.OrderedField{+name, _}, +fields}:
      accepted_and({key <> keys == name <> Laws.field_keys(fields) : List<&2, String>},
        Validation.equal_go(key, name, True{}), Validation.object_keys(keys, fields), accepted,
        first => rest => Equal.trans(List<&2, String>, key <> keys, name <> keys,
          name <> Laws.field_keys(fields),
          Equal.cong(String, List<&2, String>, x => x <> keys, key, name, Strings.eq_of_eq_true(key,
            name, string_accepted(key, name, first))),
          Equal.cong(List<&2, String>, List<&2, String>, xs => name <> xs, keys, Laws.field_keys(
            fields), matched_keys(keys, fields, rest))))
    case Nil{} Con{Value.OrderedField{key, value}, fields}: Empty.absurd({[] == Laws.field_keys(
      Value.OrderedField{key, value} <> fields) : List<&2, String>}, Strings.internal_false_ne_true(
      accepted))
    case Con{key, keys} Nil{}: Empty.absurd({key <> keys == [] : List<&2, String>},
      Strings.internal_false_ne_true(accepted))

def reverse_values(+left: List<&2, Value.ProductValue>, +right: List<&2, Value.ProductValue>,
  +suffix: List<&2, Value.ProductValue>) -> {List.reverse.go(&2, Value.ProductValue, List.append(&2,
  Value.ProductValue, left, right), suffix) == List.reverse.go(&2, Value.ProductValue, right,
  List.reverse.go(&2, Value.ProductValue, left, suffix)) : List<&2, Value.ProductValue>}:
  match left:
    case []: {==}
    case head <> tail: reverse_values(tail, right, head <> suffix)

def paired_fields(-fields: List<&2, Value.OrderedField<Value.ProductValue>>, -plans: List<&2,
  List<&2, Plan.Piece>>) -> Type:
  Sigma<&2, &1, List<&2, Spec.Field>, paired =>
    {Compound.keys(paired) == Laws.field_keys(fields) : List<&2, String>} &
    {Compound.values(paired) == plans : List<&2, List<&2, Plan.Piece>>}>

def pair_field_step(+key: String, +value: Value.ProductValue, +fields: List<&2,
  Value.OrderedField<Value.ProductValue>>, +parts: List<&2, Plan.Piece>, +plans: List<&2, List<&2,
  Plan.Piece>>, tail: paired_fields(fields, plans)) -> paired_fields(Value.OrderedField{key,
  value} <> fields, parts <> plans):
  match tail:
    case Tuple{+paired, Tuple{keys, values}}:
      (Spec.Field{key, parts} <> paired,
        (Equal.cong(List<&2, String>, List<&2, String>, xs => key <> xs, Compound.keys(paired),
          Laws.field_keys(fields), keys),
        Equal.cong(List<&2, List<&2, Plan.Piece>>, List<&2, List<&2, Plan.Piece>>,
          xs => parts <> xs, Compound.values(paired), plans, values)))

def count_predecessor(+left: Nat, +right: Nat,
  equal: {1n+left == 1n+right : Nat}) -> {left == right : Nat}:
  %Nats.sub_zero(left) : {_ == right : Nat}
  %Nats.sub_zero(right) : {Nat.sub(left, 0n) == _ : Nat}
  Equal.cong(Nat, Nat, n => Nat.sub(n, 1n), 1n+left, 1n+right, equal)

def pair_fields(+fields: List<&2, Value.OrderedField<Value.ProductValue>>, +plans: List<&2, List<&2,
  Plan.Piece>>, count: {List.length(&2, Value.ProductValue, Laws.field_values(
  fields)) == List.length(&2, List<&2, Plan.Piece>, plans) : Nat}) -> paired_fields(fields, plans):
  match fields plans:
    case Nil{} Nil{}: ([], ({==}, {==}))
    case Nil{} Con{parts, plans}:
      Empty.absurd(paired_fields([], parts <> plans), Strings.internal_false_ne_true(Equal.sym(Bool,
        True{}, False{},
        Equal.cong(Nat, Bool, n => Nat.is_eq(0n, n), 0n, 1n+List.length(&2, List<&2, Plan.Piece>,
          plans), count))))
    case Con{Value.OrderedField{key, value}, fields} Nil{}:
      Empty.absurd(paired_fields(Value.OrderedField{key, value} <> fields, []),
        Strings.internal_false_ne_true(
        Equal.cong(Nat, Bool, n => Nat.is_eq(0n, n), 1n+List.length(&2, Value.ProductValue,
          Laws.field_values(fields)), 0n, count)))
    case Con{Value.OrderedField{+key, +value}, +fields} Con{+parts, +plans}:
      pair_field_step(key, value, fields, parts, plans, pair_fields(fields, plans,
        count_predecessor(List.length(&2, Value.ProductValue, Laws.field_values(fields)),
          List.length(&2, List<&2, Plan.Piece>, plans), count)))

def sound_result(-values: List<&2, Value.ProductValue>, -operations: List<&2,
  Plan.Operation>) -> Type:
  Sigma<&2, &1, List<&2, List<&2, Plan.Piece>>, plans => Laws.ForestEncoding<values, operations,
    plans>>

def sound_transport(-values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>,
  -actual_values: List<&2, Value.ProductValue>, -actual_operations: List<&2, Plan.Operation>,
  v: {values == actual_values : List<&2, Value.ProductValue>},
  o: {operations == actual_operations : List<&2, Plan.Operation>}, proof: sound_result(
  actual_values, actual_operations)) -> sound_result(values, operations):
  match proof:
    case Tuple{+plans, encoding}:
      (plans, encoding_transport(values, operations, plans, actual_values, actual_operations, plans,
        v, o, {==}, encoding))

def append_sound(+values: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>,
  +value: Value.ProductValue, +head_operations: List<&2, Plan.Operation>, +parts: List<&2,
  Plan.Piece>, proof: sound_result(values, operations), build: head_builder(value, head_operations,
  parts)) -> sound_result(List.append(&2, Value.ProductValue, values, [value]), List.append(&2,
  Plan.Operation, operations, head_operations)):
  match proof:
    case Tuple{+plans, encoding}:
      (List.append(&2, List<&2, Plan.Piece>, plans, [parts]),
        encoding_transport(List.append(&2, Value.ProductValue, values, [value]), List.append(&2,
          Plan.Operation, operations, head_operations), List.append(&2, List<&2, Plan.Piece>, plans,
          [parts]),
          List.append(&2, Value.ProductValue, values, [value]), List.append(&2, Plan.Operation,
            operations, List.append(&2, Plan.Operation, head_operations, [])), List.append(&2,
            List<&2, Plan.Piece>, plans, [parts]), {==},
          Equal.cong(List<&2, Plan.Operation>, List<&2, Plan.Operation>, xs => List.append(&2,
            Plan.Operation, operations, xs), head_operations, List.append(&2, Plan.Operation,
            head_operations, []),
            Equal.sym(List<&2, Plan.Operation>, List.append(&2, Plan.Operation, head_operations,
              []), head_operations, Lists.append_nil(&2, Plan.Operation, head_operations))), {==},
          append_forest(values, operations, plans, [value], List.append(&2, Plan.Operation,
            head_operations, []), [parts], encoding, build([], [], [], Laws.EmptyForest{{==}, {==},
            {==}}))))

def reverse_children(+children: List<&2, Value.ProductValue>, +rest: List<&2,
  Value.ProductValue>) -> {List.reverse(&2, Value.ProductValue, List.append(&2, Value.ProductValue,
  List.reverse(&2, Value.ProductValue, children), rest)) == List.append(&2, Value.ProductValue,
  List.reverse(&2, Value.ProductValue, rest), children) : List<&2, Value.ProductValue>}:
  Equal.trans(List<&2, Value.ProductValue>, List.reverse(&2, Value.ProductValue, List.append(&2,
    Value.ProductValue, List.reverse(&2, Value.ProductValue, children), rest)),
    List.reverse.go(&2, Value.ProductValue, rest, List.reverse(&2, Value.ProductValue, List.reverse(
      &2, Value.ProductValue, children))), List.append(&2, Value.ProductValue, List.reverse(&2,
      Value.ProductValue, rest), children),
    reverse_values(List.reverse(&2, Value.ProductValue, children), rest, []),
    Equal.trans(List<&2, Value.ProductValue>, List.reverse.go(&2, Value.ProductValue, rest,
      List.reverse(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, children))),
      List.reverse.go(&2, Value.ProductValue, rest, children), List.append(&2, Value.ProductValue,
      List.reverse(&2, Value.ProductValue, rest), children),
      Equal.cong(List<&2, Value.ProductValue>, List<&2, Value.ProductValue>, xs => List.reverse.go(
        &2, Value.ProductValue, rest, xs), List.reverse(&2, Value.ProductValue, List.reverse(&2,
        Value.ProductValue, children)), children, Reverse.reverse_reverse(&2, Value.ProductValue,
        children)),
      Lists.reverse_go_spec(&2, Value.ProductValue, rest, children)))

def split_sound(+prefix: List<&2, Value.ProductValue>, +suffix: List<&2, Value.ProductValue>,
  +operations: List<&2, Plan.Operation>, proof: sound_result(List.append(&2, Value.ProductValue,
  prefix, suffix), operations)) -> cut_result(prefix, suffix, operations):
  match proof:
    case Tuple{plans, encoding}: split_forest(prefix, suffix, operations, plans, encoding)

def split_reversed_children(+children: List<&2, Value.ProductValue>, +rest: List<&2,
  Value.ProductValue>, +operations: List<&2, Plan.Operation>, proof: sound_result(List.reverse(&2,
  Value.ProductValue, List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue,
  children), rest)), operations)) -> cut_result(List.reverse(&2, Value.ProductValue, rest),
  children, operations):
  split_sound(List.reverse(&2, Value.ProductValue, rest), children, operations,
    sound_transport(List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest),
      children), operations,
      List.reverse(&2, Value.ProductValue, List.append(&2, Value.ProductValue, List.reverse(&2,
        Value.ProductValue, children), rest)), operations,
      Equal.sym(List<&2, Value.ProductValue>, List.reverse(&2, Value.ProductValue, List.append(&2,
        Value.ProductValue, List.reverse(&2, Value.ProductValue, children), rest)),
        List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest), children),
          reverse_children(children, rest)), {==}, proof))

def closed_operations(-operations: List<&2, Plan.Operation>, +left: List<&2, Plan.Operation>,
  +right: List<&2, Plan.Operation>, +last: Plan.Operation, equal: {operations == List.append(&2,
  Plan.Operation, left, right) : List<&2, Plan.Operation>}) -> {List.append(&2, Plan.Operation,
  operations, [last]) == List.append(&2, Plan.Operation, left, List.append(&2, Plan.Operation,
  right, [last])) : List<&2, Plan.Operation>}:
  Equal.trans(List<&2, Plan.Operation>, List.append(&2, Plan.Operation, operations, [last]),
    List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, left, right), [last]),
    List.append(&2, Plan.Operation, left, List.append(&2, Plan.Operation, right, [last])),
    Equal.cong(List<&2, Plan.Operation>, List<&2, Plan.Operation>, xs => List.append(&2,
      Plan.Operation, xs, [last]), operations, List.append(&2, Plan.Operation, left, right), equal),
      Lists.append_assoc(&2, Plan.Operation, left, right, [last]))

def array_sound_cut(+prefix: List<&2, Value.ProductValue>, +items: List<&2, Value.ProductValue>,
  +operations: List<&2, Plan.Operation>, cut: cut_result(prefix, items,
  operations)) -> sound_result(List.append(&2, Value.ProductValue, prefix,
  [Value.ProductArray{items}]), List.append(&2, Plan.Operation, operations,
  [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}])):
  match cut:
    case Tuple{+lo, Tuple{+ro, Tuple{+lp, Tuple{+rp, Tuple{left, Tuple{children, equal}}}}}}:
      sound_transport(List.append(&2, Value.ProductValue, prefix, [Value.ProductArray{items}]),
        List.append(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2,
        Value.ProductValue, items)}]),
        List.append(&2, Value.ProductValue, prefix, [Value.ProductArray{items}]), List.append(&2,
          Plan.Operation, lo, List.append(&2, Plan.Operation, ro, [Plan.ArrayOperation{List.length(
          &2, Value.ProductValue, items)}])),
        {==}, closed_operations(operations, lo, ro, Plan.ArrayOperation{List.length(&2,
          Value.ProductValue, items)}, equal),
        append_sound(prefix, lo, Value.ProductArray{items}, List.append(&2, Plan.Operation, ro,
          [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), Compound.array_trace(
          rp), (lp, left), array_builder(items, ro, rp, children)))

def object_from_pair(+fields: List<&2, Value.OrderedField<Value.ProductValue>>,
  +operations: List<&2, Plan.Operation>, +plans: List<&2, List<&2, Plan.Piece>>,
  children: Laws.ForestEncoding<Laws.field_values(fields), operations, plans>,
  paired: paired_fields(fields, plans)) -> Sigma<&2, &1, List<&2, Plan.Piece>,
  parts => head_builder(Value.ProductObject{fields}, List.append(&2, Plan.Operation, operations,
  [Plan.ObjectOperation{Laws.field_keys(fields)}]), parts)>:
  match paired:
    case Tuple{+fields_plan, Tuple{keys, values}}:
      (Compound.object_trace(List.sort(~Spec.Field, ~Spec.fields_le, fields_plan)), object_builder(
        fields, fields_plan, operations,
        encoding_transport(Laws.field_values(fields), operations, Compound.values(fields_plan),
          Laws.field_values(fields), operations, plans, {==}, {==}, values, children), keys))

def object_from_count(+fields: List<&2, Value.OrderedField<Value.ProductValue>>,
  +operations: List<&2, Plan.Operation>, +plans: List<&2, List<&2, Plan.Piece>>,
  children: retained_count(Laws.field_values(fields), operations, plans)) -> Sigma<&2, &1, List<&2,
  Plan.Piece>, parts => head_builder(Value.ProductObject{fields}, List.append(&2, Plan.Operation,
  operations, [Plan.ObjectOperation{Laws.field_keys(fields)}]), parts)>:
  match children:
    case Tuple{encoding, count}: object_from_pair(fields, operations, plans, encoding, pair_fields(
      fields, plans, count))

def object_append(+prefix: List<&2, Value.ProductValue>, +lo: List<&2, Plan.Operation>,
  +lp: List<&2, List<&2, Plan.Piece>>, +fields: List<&2, Value.OrderedField<Value.ProductValue>>,
  +ro: List<&2, Plan.Operation>, left: Laws.ForestEncoding<prefix, lo, lp>, object: Sigma<&2, &1,
  List<&2, Plan.Piece>, parts => head_builder(Value.ProductObject{fields}, List.append(&2,
  Plan.Operation, ro, [Plan.ObjectOperation{Laws.field_keys(fields)}]), parts)>) -> sound_result(
  List.append(&2, Value.ProductValue, prefix, [Value.ProductObject{fields}]), List.append(&2,
  Plan.Operation, lo, List.append(&2, Plan.Operation, ro, [Plan.ObjectOperation{Laws.field_keys(
  fields)}]))):
  match object:
    case Tuple{+parts, build}: append_sound(prefix, lo, Value.ProductObject{fields}, List.append(&2,
      Plan.Operation, ro, [Plan.ObjectOperation{Laws.field_keys(fields)}]), parts, (lp, left),
      build)

def object_sound_cut(+prefix: List<&2, Value.ProductValue>, +fields: List<&2,
  Value.OrderedField<Value.ProductValue>>, +operations: List<&2, Plan.Operation>, cut: cut_result(
  prefix, Laws.field_values(fields), operations)) -> sound_result(List.append(&2,
  Value.ProductValue, prefix, [Value.ProductObject{fields}]), List.append(&2, Plan.Operation,
  operations, [Plan.ObjectOperation{Laws.field_keys(fields)}])):
  match cut:
    case Tuple{+lo, Tuple{+ro, Tuple{+lp, Tuple{+rp, Tuple{left, Tuple{children, equal}}}}}}:
      sound_transport(List.append(&2, Value.ProductValue, prefix, [Value.ProductObject{fields}]),
        List.append(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(
        fields)}]),
        List.append(&2, Value.ProductValue, prefix, [Value.ProductObject{fields}]), List.append(&2,
          Plan.Operation, lo, List.append(&2, Plan.Operation, ro,
          [Plan.ObjectOperation{Laws.field_keys(fields)}])), {==},
        closed_operations(operations, lo, ro, Plan.ObjectOperation{Laws.field_keys(fields)}, equal),
        object_append(prefix, lo, lp, fields, ro, left, object_from_count(fields, ro, rp,
          preserve_count(Laws.field_values(fields), ro, rp, children))))

def reverse_sound_step(+value: Value.ProductValue, +rest: List<&2, Value.ProductValue>,
  +operation: Plan.Operation, +tail: List<&2, Plan.Operation>, proof: sound_result(List.append(&2,
  Value.ProductValue, List.reverse(&2, Value.ProductValue, rest), [value]), List.append(&2,
  Plan.Operation, List.reverse(&2, Plan.Operation, tail), [operation]))) -> sound_result(
  List.reverse(&2, Value.ProductValue, value <> rest), List.reverse(&2, Plan.Operation,
  operation <> tail)):
  sound_transport(List.reverse(&2, Value.ProductValue, value <> rest), List.reverse(&2,
    Plan.Operation, operation <> tail),
    List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest), [value]),
      List.append(&2, Plan.Operation, List.reverse(&2, Plan.Operation, tail), [operation]),
    Lists.reverse_go_spec(&2, Value.ProductValue, rest, [value]), Lists.reverse_go_spec(&2,
      Plan.Operation, tail, [operation]), proof)

def primitive_sound_step(+primitive: Json.Primitive, +value: Value.ProductValue, +rest: List<&2,
  Value.ProductValue>, +tail: List<&2, Plan.Operation>, matches: {Validation.primitive_matches(
  primitive, value) == True{} : Bool}, proof: sound_result(List.reverse(&2, Value.ProductValue,
  rest), List.reverse(&2, Plan.Operation, tail))) -> sound_result(List.reverse(&2,
  Value.ProductValue, value <> rest), List.reverse(&2, Plan.Operation,
  Plan.PrimitiveOperation{primitive} <> tail)):
  reverse_sound_step(value, rest, Plan.PrimitiveOperation{primitive}, tail,
    sound_transport(List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest),
      [value]), List.append(&2, Plan.Operation, List.reverse(&2, Plan.Operation, tail),
      [Plan.PrimitiveOperation{primitive}]),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest),
        [Laws.primitive_value(primitive)]), List.append(&2, Plan.Operation, List.reverse(&2,
        Plan.Operation, tail), [Plan.PrimitiveOperation{primitive}]),
      Equal.cong(Value.ProductValue, List<&2, Value.ProductValue>, x => List.append(&2,
        Value.ProductValue, List.reverse(&2, Value.ProductValue, rest), [x]), value,
        Laws.primitive_value(primitive), primitive_matches_equal(primitive, value, matches)), {==},
      append_sound(List.reverse(&2, Value.ProductValue, rest), List.reverse(&2, Plan.Operation,
        tail), Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}],
        [Plan.PrimitivePiece{primitive}], proof, primitive_builder(primitive))))

def array_sound_step(+arity: Nat, +items: List<&2, Value.ProductValue>, +rest: List<&2,
  Value.ProductValue>, +tail: List<&2, Plan.Operation>, count: {Nat.is_eq(arity, List.length(&2,
  Value.ProductValue, items)) == True{} : Bool}, proof: sound_result(List.reverse(&2,
  Value.ProductValue, List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue,
  items), rest)), List.reverse(&2, Plan.Operation, tail))) -> sound_result(List.reverse(&2,
  Value.ProductValue, Value.ProductArray{items} <> rest), List.reverse(&2, Plan.Operation,
  Plan.ArrayOperation{arity} <> tail)):
  reverse_sound_step(Value.ProductArray{items}, rest, Plan.ArrayOperation{arity}, tail,
    sound_transport(List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest),
      [Value.ProductArray{items}]), List.append(&2, Plan.Operation, List.reverse(&2, Plan.Operation,
      tail), [Plan.ArrayOperation{arity}]),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest),
        [Value.ProductArray{items}]), List.append(&2, Plan.Operation, List.reverse(&2,
        Plan.Operation, tail), [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]),
        {==},
      Equal.cong(Nat, List<&2, Plan.Operation>, n => List.append(&2, Plan.Operation, List.reverse(
        &2, Plan.Operation, tail), [Plan.ArrayOperation{n}]), arity, List.length(&2,
        Value.ProductValue, items), Nats.eq_of_is_eq(arity, List.length(&2, Value.ProductValue,
        items), count)),
      array_sound_cut(List.reverse(&2, Value.ProductValue, rest), items, List.reverse(&2,
        Plan.Operation, tail), split_reversed_children(items, rest, List.reverse(&2, Plan.Operation,
        tail), proof))))

def object_sound_step(+keys: List<&2, String>, +fields: List<&2,
  Value.OrderedField<Value.ProductValue>>, +rest: List<&2, Value.ProductValue>, +tail: List<&2,
  Plan.Operation>, matches: {Validation.object_keys(keys, fields) == True{} : Bool},
  proof: sound_result(List.reverse(&2, Value.ProductValue, List.append(&2, Value.ProductValue,
  List.reverse(&2, Value.ProductValue, Validation.field_values(fields)), rest)), List.reverse(&2,
  Plan.Operation, tail))) -> sound_result(List.reverse(&2, Value.ProductValue,
  Value.ProductObject{fields} <> rest), List.reverse(&2, Plan.Operation,
  Plan.ObjectOperation{keys} <> tail)):
  reverse_sound_step(Value.ProductObject{fields}, rest, Plan.ObjectOperation{keys}, tail,
    sound_transport(List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest),
      [Value.ProductObject{fields}]), List.append(&2, Plan.Operation, List.reverse(&2,
      Plan.Operation, tail), [Plan.ObjectOperation{keys}]),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, rest),
        [Value.ProductObject{fields}]), List.append(&2, Plan.Operation, List.reverse(&2,
        Plan.Operation, tail), [Plan.ObjectOperation{Laws.field_keys(fields)}]), {==},
      Equal.cong(List<&2, String>, List<&2, Plan.Operation>, ks => List.append(&2, Plan.Operation,
        List.reverse(&2, Plan.Operation, tail), [Plan.ObjectOperation{ks}]), keys, Laws.field_keys(
        fields), matched_keys(keys, fields, matches)),
      object_sound_cut(List.reverse(&2, Value.ProductValue, rest), fields, List.reverse(&2,
        Plan.Operation, tail), split_reversed_children(Laws.field_values(fields), rest,
        List.reverse(&2, Plan.Operation, tail),
        sound_transport(List.reverse(&2, Value.ProductValue, List.append(&2, Value.ProductValue,
          List.reverse(&2, Value.ProductValue, Laws.field_values(fields)), rest)), List.reverse(&2,
          Plan.Operation, tail),
          List.reverse(&2, Value.ProductValue, List.append(&2, Value.ProductValue, List.reverse(&2,
            Value.ProductValue, Validation.field_values(fields)), rest)), List.reverse(&2,
            Plan.Operation, tail),
          Equal.cong(List<&2, Value.ProductValue>, List<&2, Value.ProductValue>, xs => List.reverse(
            &2, Value.ProductValue, List.append(&2, Value.ProductValue, List.reverse(&2,
            Value.ProductValue, xs), rest)), Laws.field_values(fields), Validation.field_values(
            fields), Equal.sym(List<&2, Value.ProductValue>, Validation.field_values(fields),
            Laws.field_values(fields), field_values_same(fields))), {==}, proof)))))

# Soundness consumes the actual operation list. Each compound case reconstructs
# its children and preceding roots from that smaller accepted stream.
def sound_reversed(+operations: List<&2, Plan.Operation>, +expected: List<&2, Value.ProductValue>,
  accepted: {Validation.validate_reversed(operations, expected) == True{} : Bool}) -> sound_result(
  List.reverse(&2, Value.ProductValue, expected), List.reverse(&2, Plan.Operation, operations)):
  match operations expected:
    case Nil{} Nil{}: ([], Laws.EmptyForest{{==}, {==}, {==}})
    case Con{Plan.PrimitiveOperation{+primitive}, +tail} Con{+value, +rest}:
      accepted_and(sound_result(List.reverse(&2, Value.ProductValue, value <> rest), List.reverse(
        &2, Plan.Operation, Plan.PrimitiveOperation{primitive} <> tail)),
        Validation.primitive_matches(primitive, value), Validation.validate_reversed(tail, rest),
        accepted,
        matches => later => primitive_sound_step(primitive, value, rest, tail, matches,
          sound_reversed(tail, rest, later)))
    case Con{Plan.ArrayOperation{+arity}, +tail} Con{Value.ProductArray{+items}, +rest}:
      accepted_and(sound_result(List.reverse(&2, Value.ProductValue,
        Value.ProductArray{items} <> rest), List.reverse(&2, Plan.Operation,
        Plan.ArrayOperation{arity} <> tail)), Nat.is_eq(arity, List.length(&2, Value.ProductValue,
        items)), Validation.validate_reversed(tail, List.append(&2, Value.ProductValue,
        List.reverse(&2, Value.ProductValue, items), rest)), accepted,
        count => later => array_sound_step(arity, items, rest, tail, count, sound_reversed(tail,
          List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, items), rest),
          later)))
    case Con{Plan.ObjectOperation{+keys}, +tail} Con{Value.ProductObject{+fields}, +rest}:
      accepted_and(sound_result(List.reverse(&2, Value.ProductValue,
        Value.ProductObject{fields} <> rest), List.reverse(&2, Plan.Operation,
        Plan.ObjectOperation{keys} <> tail)), Validation.object_keys(keys, fields),
        Validation.validate_reversed(tail, List.append(&2, Value.ProductValue, List.reverse(&2,
        Value.ProductValue, Validation.field_values(fields)), rest)), accepted,
        matches => later => object_sound_step(keys, fields, rest, tail, matches, sound_reversed(
          tail, List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue,
          Validation.field_values(fields)), rest), later)))
    case Nil{} Con{value, rest}: Empty.absurd(sound_result(List.reverse(&2, Value.ProductValue,
      value <> rest), []), Strings.internal_false_ne_true(accepted))
    case Con{operation, tail} Nil{}: Empty.absurd(sound_result([], List.reverse(&2, Plan.Operation,
      operation <> tail)), Strings.internal_false_ne_true(accepted))
    case Con{Plan.ArrayOperation{+arity}, +tail} Con{Value.ProductNull{}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductNull{} <> rest), List.reverse(
      &2, Plan.Operation, Plan.ArrayOperation{arity} <> tail)), Strings.internal_false_ne_true(
      accepted))
    case Con{Plan.ArrayOperation{+arity}, +tail} Con{Value.ProductBool{+b}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductBool{b} <> rest), List.reverse(
      &2, Plan.Operation, Plan.ArrayOperation{arity} <> tail)), Strings.internal_false_ne_true(
      accepted))
    case Con{Plan.ArrayOperation{+arity}, +tail} Con{Value.ProductNumber{+b}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductNumber{b} <> rest),
      List.reverse(&2, Plan.Operation, Plan.ArrayOperation{arity} <> tail)),
      Strings.internal_false_ne_true(accepted))
    case Con{Plan.ArrayOperation{+arity}, +tail} Con{Value.ProductText{+b}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductText{b} <> rest), List.reverse(
      &2, Plan.Operation, Plan.ArrayOperation{arity} <> tail)), Strings.internal_false_ne_true(
      accepted))
    case Con{Plan.ArrayOperation{+arity}, +tail} Con{Value.ProductObject{+b}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductObject{b} <> rest),
      List.reverse(&2, Plan.Operation, Plan.ArrayOperation{arity} <> tail)),
      Strings.internal_false_ne_true(accepted))
    case Con{Plan.ObjectOperation{+keys}, +tail} Con{Value.ProductNull{}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductNull{} <> rest), List.reverse(
      &2, Plan.Operation, Plan.ObjectOperation{keys} <> tail)), Strings.internal_false_ne_true(
      accepted))
    case Con{Plan.ObjectOperation{+keys}, +tail} Con{Value.ProductBool{+b}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductBool{b} <> rest), List.reverse(
      &2, Plan.Operation, Plan.ObjectOperation{keys} <> tail)), Strings.internal_false_ne_true(
      accepted))
    case Con{Plan.ObjectOperation{+keys}, +tail} Con{Value.ProductNumber{+b}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductNumber{b} <> rest),
      List.reverse(&2, Plan.Operation, Plan.ObjectOperation{keys} <> tail)),
      Strings.internal_false_ne_true(accepted))
    case Con{Plan.ObjectOperation{+keys}, +tail} Con{Value.ProductText{+b}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductText{b} <> rest), List.reverse(
      &2, Plan.Operation, Plan.ObjectOperation{keys} <> tail)), Strings.internal_false_ne_true(
      accepted))
    case Con{Plan.ObjectOperation{+keys}, +tail} Con{Value.ProductArray{+b}, +rest}: Empty.absurd(
      sound_result(List.reverse(&2, Value.ProductValue, Value.ProductArray{b} <> rest),
      List.reverse(&2, Plan.Operation, Plan.ObjectOperation{keys} <> tail)),
      Strings.internal_false_ne_true(accepted))

def Laws.validation_sound(values, operations, accepted):
  sound_transport(values, operations, List.reverse(&2, Value.ProductValue, List.reverse(&2,
    Value.ProductValue, values)), List.reverse(&2, Plan.Operation, List.reverse(&2, Plan.Operation,
    operations)),
    Equal.sym(List<&2, Value.ProductValue>, List.reverse(&2, Value.ProductValue, List.reverse(&2,
      Value.ProductValue, values)), values, Reverse.reverse_reverse(&2, Value.ProductValue,
      values)),
    Equal.sym(List<&2, Plan.Operation>, List.reverse(&2, Plan.Operation, List.reverse(&2,
      Plan.Operation, operations)), operations, Reverse.reverse_reverse(&2, Plan.Operation,
      operations)),
    sound_reversed(List.reverse(&2, Plan.Operation, operations), List.reverse(&2,
      Value.ProductValue, values), accepted))

def main() -> Unit:
  Unit{}
