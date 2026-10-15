import Base
import ./CanonicalJsonPlanTreeLaws.bend as Laws
import ./CanonicalJsonPlanCompoundLaws.bend as Compound
import ./CanonicalJsonPlanCompoundProof.bend as CompoundProof
import ./CanonicalJsonPlanLaws.bend as Local
import ./CanonicalJsonPlanProof.bend as LocalProof
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/GRAPH_LIST_FACTS.bend as Lists
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlanValidation.bend as Validation
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_STRING_FACTS.bend as Strings

# Concrete pre-proof falsification instances. Universal bindings remain open.
# These construct actual indexed witnesses, not assumed codec correspondence.

def instance_0_encoding() -> Laws.ForestEncoding<[], [], []>:
  Laws.EmptyForest{{==}, {==}, {==}}

def instance_0_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, []), List.reverse(&2, Value.ProductValue, [])) == True{} : Bool}:
  {==}

def instance_0_forest() -> {Plan.fold([], Plan.ValidStack{[]}) == Plan.ValidStack{List.reverse(&2, List<&2, Plan.Piece>, [])} : Plan.Stack}:
  {==}

def instance_1_encoding() -> Laws.ForestEncoding<[Laws.primitive_value(Json.NullPrimitive{})], [Plan.PrimitiveOperation{Json.NullPrimitive{}}], [[Plan.PrimitivePiece{Json.NullPrimitive{}}]]>:
  Laws.PrimitiveForest{Json.NullPrimitive{}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_1_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, [Plan.PrimitiveOperation{Json.NullPrimitive{}}]), List.reverse(&2, Value.ProductValue, [Laws.primitive_value(Json.NullPrimitive{})])) == True{} : Bool}:
  {==}

def instance_1_forest() -> {Plan.fold([Plan.PrimitiveOperation{Json.NullPrimitive{}}], Plan.ValidStack{[]}) == Plan.ValidStack{List.reverse(&2, List<&2, Plan.Piece>, [[Plan.PrimitivePiece{Json.NullPrimitive{}}]])} : Plan.Stack}:
  {==}

def instance_1_tree() -> {Plan.compile([Plan.PrimitiveOperation{Json.NullPrimitive{}}]) == Some{[Plan.PrimitivePiece{Json.NullPrimitive{}}]} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_2_encoding() -> Laws.ForestEncoding<[Laws.primitive_value(Json.BoolPrimitive{True{}})], [Plan.PrimitiveOperation{Json.BoolPrimitive{True{}}}], [[Plan.PrimitivePiece{Json.BoolPrimitive{True{}}}]]>:
  Laws.PrimitiveForest{Json.BoolPrimitive{True{}}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_2_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, [Plan.PrimitiveOperation{Json.BoolPrimitive{True{}}}]), List.reverse(&2, Value.ProductValue, [Laws.primitive_value(Json.BoolPrimitive{True{}})])) == True{} : Bool}:
  {==}

def instance_2_forest() -> {Plan.fold([Plan.PrimitiveOperation{Json.BoolPrimitive{True{}}}], Plan.ValidStack{[]}) == Plan.ValidStack{List.reverse(&2, List<&2, Plan.Piece>, [[Plan.PrimitivePiece{Json.BoolPrimitive{True{}}}]])} : Plan.Stack}:
  {==}

def instance_2_tree() -> {Plan.compile([Plan.PrimitiveOperation{Json.BoolPrimitive{True{}}}]) == Some{[Plan.PrimitivePiece{Json.BoolPrimitive{True{}}}]} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_3_encoding() -> Laws.ForestEncoding<[Laws.primitive_value(Json.NumberPrimitive{Value.Binary64{2147483648, 0}})], [Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}], [[Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}]]>:
  Laws.PrimitiveForest{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_3_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, [Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}]), List.reverse(&2, Value.ProductValue, [Laws.primitive_value(Json.NumberPrimitive{Value.Binary64{2147483648, 0}})])) == True{} : Bool}:
  {==}

def instance_3_forest() -> {Plan.fold([Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}], Plan.ValidStack{[]}) == Plan.ValidStack{List.reverse(&2, List<&2, Plan.Piece>, [[Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}]])} : Plan.Stack}:
  {==}

def instance_3_tree() -> {Plan.compile([Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}]) == Some{[Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2147483648, 0}}}]} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_4_encoding() -> Laws.ForestEncoding<[Laws.primitive_value(Json.StringPrimitive{"λ"})], [Plan.PrimitiveOperation{Json.StringPrimitive{"λ"}}], [[Plan.PrimitivePiece{Json.StringPrimitive{"λ"}}]]>:
  Laws.PrimitiveForest{Json.StringPrimitive{"λ"}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_4_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, [Plan.PrimitiveOperation{Json.StringPrimitive{"λ"}}]), List.reverse(&2, Value.ProductValue, [Laws.primitive_value(Json.StringPrimitive{"λ"})])) == True{} : Bool}:
  {==}

def instance_4_forest() -> {Plan.fold([Plan.PrimitiveOperation{Json.StringPrimitive{"λ"}}], Plan.ValidStack{[]}) == Plan.ValidStack{List.reverse(&2, List<&2, Plan.Piece>, [[Plan.PrimitivePiece{Json.StringPrimitive{"λ"}}]])} : Plan.Stack}:
  {==}

def instance_4_tree() -> {Plan.compile([Plan.PrimitiveOperation{Json.StringPrimitive{"λ"}}]) == Some{[Plan.PrimitivePiece{Json.StringPrimitive{"λ"}}]} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_5_encoding() -> Laws.ForestEncoding<[Value.ProductArray{[]}], [Plan.ArrayOperation{0n}], [Compound.array_trace([])]>:
  Laws.ArrayForest{[], [], [], [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_5_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, [Plan.ArrayOperation{0n}]), List.reverse(&2, Value.ProductValue, [Value.ProductArray{[]}])) == True{} : Bool}:
  {==}

def instance_5_forest() -> {Plan.fold([Plan.ArrayOperation{0n}], Plan.ValidStack{[]}) == Plan.ValidStack{List.reverse(&2, List<&2, Plan.Piece>, [Compound.array_trace([])])} : Plan.Stack}:
  {==}

def instance_5_tree() -> {Plan.compile([Plan.ArrayOperation{0n}]) == Some{Compound.array_trace([])} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_6_encoding() -> Laws.ForestEncoding<[Value.ProductObject{[]}], [Plan.ObjectOperation{[]}], [Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, []))]>:
  Laws.ObjectForest{[], [], [], [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==}, Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}

def instance_6_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, [Plan.ObjectOperation{[]}]), List.reverse(&2, Value.ProductValue, [Value.ProductObject{[]}])) == True{} : Bool}:
  {==}

def instance_6_forest() -> {Plan.fold([Plan.ObjectOperation{[]}], Plan.ValidStack{[]}) == Plan.ValidStack{List.reverse(&2, List<&2, Plan.Piece>, [Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, []))])} : Plan.Stack}:
  {==}

def instance_6_tree() -> {Plan.compile([Plan.ObjectOperation{[]}]) == Some{Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, []))} : Maybe<&2, List<&2, Plan.Piece>>}:
  {==}

def instance_7_encoding() -> Laws.ForestEncoding<[Value.ProductObject{[Value.OrderedField{"z", Value.ProductArray{[Laws.primitive_value(Json.NullPrimitive{}), Laws.primitive_value(Json.BoolPrimitive{False{}})]}}, Value.OrderedField{"z", Laws.primitive_value(Json.NumberPrimitive{Value.Binary64{2146435072, 1}})}, Value.OrderedField{"a", Laws.primitive_value(Json.StringPrimitive{"x"})}]}, Value.ProductArray{[Laws.primitive_value(Json.StringPrimitive{"tail"})]}], [Plan.PrimitiveOperation{Json.NullPrimitive{}}, Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}, Plan.ArrayOperation{2n}, Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}, Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}, Plan.ObjectOperation{["z", "z", "a"]}, Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}, Plan.ArrayOperation{1n}], [Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, [Plan.Field{"z", Compound.array_trace([[Plan.PrimitivePiece{Json.NullPrimitive{}}], [Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]])}, Plan.Field{"z", [Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}]}, Plan.Field{"a", [Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]}])), Compound.array_trace([[Plan.PrimitivePiece{Json.StringPrimitive{"tail"}}]])]>:
  Laws.ObjectForest{[Value.OrderedField{"z", Value.ProductArray{[Laws.primitive_value(Json.NullPrimitive{}), Laws.primitive_value(Json.BoolPrimitive{False{}})]}}, Value.OrderedField{"z", Laws.primitive_value(Json.NumberPrimitive{Value.Binary64{2146435072, 1}})}, Value.OrderedField{"a", Laws.primitive_value(Json.StringPrimitive{"x"})}], [Plan.Field{"z", Compound.array_trace([[Plan.PrimitivePiece{Json.NullPrimitive{}}], [Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]])}, Plan.Field{"z", [Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}]}, Plan.Field{"a", [Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]}], [Plan.PrimitiveOperation{Json.NullPrimitive{}}, Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}, Plan.ArrayOperation{2n}, Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}, Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}], [Value.ProductArray{[Laws.primitive_value(Json.StringPrimitive{"tail"})]}], [Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}, Plan.ArrayOperation{1n}], [Compound.array_trace([[Plan.PrimitivePiece{Json.StringPrimitive{"tail"}}]])], Laws.ArrayForest{[Laws.primitive_value(Json.NullPrimitive{}), Laws.primitive_value(Json.BoolPrimitive{False{}})], [Plan.PrimitiveOperation{Json.NullPrimitive{}}, Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}], [[Plan.PrimitivePiece{Json.NullPrimitive{}}], [Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]], [Laws.primitive_value(Json.NumberPrimitive{Value.Binary64{2146435072, 1}}), Laws.primitive_value(Json.StringPrimitive{"x"})], [Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}, Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}], [[Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}], [Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]], Laws.PrimitiveForest{Json.NullPrimitive{}, [Laws.primitive_value(Json.BoolPrimitive{False{}})], [Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}], [[Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]], Laws.PrimitiveForest{Json.BoolPrimitive{False{}}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}, {==}, {==}, {==}}, Laws.PrimitiveForest{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}, [Laws.primitive_value(Json.StringPrimitive{"x"})], [Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}], [[Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]], Laws.PrimitiveForest{Json.StringPrimitive{"x"}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}, {==}, {==}, {==}}, {==}, {==}, {==}}, {==}, Laws.ArrayForest{[Laws.primitive_value(Json.StringPrimitive{"tail"})], [Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}], [[Plan.PrimitivePiece{Json.StringPrimitive{"tail"}}]], [], [], [], Laws.PrimitiveForest{Json.StringPrimitive{"tail"}, [], [], [], Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}, Laws.EmptyForest{{==}, {==}, {==}}, {==}, {==}, {==}}, {==}, {==}, {==}}

def instance_7_validation() -> {Validation.validate_reversed(List.reverse(&2, Plan.Operation, [Plan.PrimitiveOperation{Json.NullPrimitive{}}, Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}, Plan.ArrayOperation{2n}, Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}, Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}, Plan.ObjectOperation{["z", "z", "a"]}, Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}, Plan.ArrayOperation{1n}]), List.reverse(&2, Value.ProductValue, [Value.ProductObject{[Value.OrderedField{"z", Value.ProductArray{[Laws.primitive_value(Json.NullPrimitive{}), Laws.primitive_value(Json.BoolPrimitive{False{}})]}}, Value.OrderedField{"z", Laws.primitive_value(Json.NumberPrimitive{Value.Binary64{2146435072, 1}})}, Value.OrderedField{"a", Laws.primitive_value(Json.StringPrimitive{"x"})}]}, Value.ProductArray{[Laws.primitive_value(Json.StringPrimitive{"tail"})]}])) == True{} : Bool}:
  {==}

def instance_7_forest() -> {Plan.fold([Plan.PrimitiveOperation{Json.NullPrimitive{}}, Plan.PrimitiveOperation{Json.BoolPrimitive{False{}}}, Plan.ArrayOperation{2n}, Plan.PrimitiveOperation{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}, Plan.PrimitiveOperation{Json.StringPrimitive{"x"}}, Plan.ObjectOperation{["z", "z", "a"]}, Plan.PrimitiveOperation{Json.StringPrimitive{"tail"}}, Plan.ArrayOperation{1n}], Plan.ValidStack{[]}) == Plan.ValidStack{List.reverse(&2, List<&2, Plan.Piece>, [Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, [Plan.Field{"z", Compound.array_trace([[Plan.PrimitivePiece{Json.NullPrimitive{}}], [Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]])}, Plan.Field{"z", [Plan.PrimitivePiece{Json.NumberPrimitive{Value.Binary64{2146435072, 1}}}]}, Plan.Field{"a", [Plan.PrimitivePiece{Json.StringPrimitive{"x"}}]}])), Compound.array_trace([[Plan.PrimitivePiece{Json.StringPrimitive{"tail"}}]])])} : Plan.Stack}:
  {==}

def fold_result(-operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>) -> Type:
  @rest: List<&2, List<&2, Plan.Piece>> -> {
    Plan.fold(operations, Plan.ValidStack{rest}) == Plan.ValidStack{
      List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest)} : Plan.Stack}

def forest_result(-values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>) -> Type:
  {List.length(&2, Value.ProductValue, values) == List.length(&2, List<&2, Plan.Piece>, plans) : Nat} & fold_result(operations, plans)

def result_transport(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  -actual_values: List<&2, Value.ProductValue>, -actual_operations: List<&2, Plan.Operation>, -actual_plans: List<&2, List<&2, Plan.Piece>>,
  v: {values == actual_values : List<&2, Value.ProductValue>},
  o: {operations == actual_operations : List<&2, Plan.Operation>},
  p: {plans == actual_plans : List<&2, List<&2, Plan.Piece>>},
  result: forest_result(actual_values, actual_operations, actual_plans)
) -> forest_result(values, operations, plans):
  %Equal.sym(List<&2, Value.ProductValue>, values, actual_values, v) : forest_result(_, operations, plans)
  %Equal.sym(List<&2, Plan.Operation>, operations, actual_operations, o) : forest_result(actual_values, _, plans)
  %Equal.sym(List<&2, List<&2, Plan.Piece>>, plans, actual_plans, p) : forest_result(actual_values, actual_operations, _)
  result

# Compose a complete head-tree transition with the rest of the forest.
def sequence_run(
  +head_operations: List<&2, Plan.Operation>, +head_parts: List<&2, Plan.Piece>,
  +tail_operations: List<&2, Plan.Operation>, +tail_plans: List<&2, List<&2, Plan.Piece>>,
  +rest: List<&2, List<&2, Plan.Piece>>,
  first: {Plan.fold(head_operations, Plan.ValidStack{rest}) == Plan.ValidStack{head_parts <> rest} : Plan.Stack},
  later: {Plan.fold(tail_operations, Plan.ValidStack{head_parts <> rest}) == Plan.ValidStack{
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, tail_plans), head_parts <> rest)} : Plan.Stack}
) -> {Plan.fold(List.append(&2, Plan.Operation, head_operations, tail_operations), Plan.ValidStack{rest}) == Plan.ValidStack{
  List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, head_parts <> tail_plans), rest)} : Plan.Stack}:
  %Equal.sym(Plan.Stack,
    Plan.fold(List.append(&2, Plan.Operation, head_operations, tail_operations), Plan.ValidStack{rest}),
    Plan.fold(tail_operations, Plan.fold(head_operations, Plan.ValidStack{rest})),
    Local.fold_composition(head_operations, tail_operations, Plan.ValidStack{rest})) :
    {_ == Plan.ValidStack{List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, head_parts <> tail_plans), rest)} : Plan.Stack}
  %Equal.sym(Plan.Stack, Plan.fold(head_operations, Plan.ValidStack{rest}), Plan.ValidStack{head_parts <> rest}, first) :
    {Plan.fold(tail_operations, _) == Plan.ValidStack{List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, head_parts <> tail_plans), rest)} : Plan.Stack}
  %Equal.sym(List<&2, List<&2, Plan.Piece>>,
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, head_parts <> tail_plans), rest),
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, tail_plans), head_parts <> rest),
    LocalProof.popped_accumulator(head_parts, tail_plans, rest)) :
    {Plan.fold(tail_operations, Plan.ValidStack{head_parts <> rest}) == Plan.ValidStack{_} : Plan.Stack}
  later

def sequence_result(
  +value: Value.ProductValue, +head_operations: List<&2, Plan.Operation>, +head_parts: List<&2, Plan.Piece>,
  +tail_values: List<&2, Value.ProductValue>, +tail_operations: List<&2, Plan.Operation>, +tail_plans: List<&2, List<&2, Plan.Piece>>,
  first: @rest: List<&2, List<&2, Plan.Piece>> -> {Plan.fold(head_operations, Plan.ValidStack{rest}) == Plan.ValidStack{head_parts <> rest} : Plan.Stack},
  later: forest_result(tail_values, tail_operations, tail_plans)
) -> forest_result(value <> tail_values, List.append(&2, Plan.Operation, head_operations, tail_operations), head_parts <> tail_plans):
  match later:
    case (count, run):
      (Equal.cong(Nat, Nat, n => 1n+n,
        List.length(&2, Value.ProductValue, tail_values), List.length(&2, List<&2, Plan.Piece>, tail_plans), count),
      +rest => sequence_run(head_operations, head_parts, tail_operations, tail_plans, rest, first(rest), run(head_parts <> rest)))

def close_run(
  +operations: List<&2, Plan.Operation>, +plans: List<&2, List<&2, Plan.Piece>>,
  +operation: Plan.Operation, +parts: List<&2, Plan.Piece>, +rest: List<&2, List<&2, Plan.Piece>>,
  children: {Plan.fold(operations, Plan.ValidStack{rest}) == Plan.ValidStack{
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest)} : Plan.Stack},
  closed: {Plan.operation(operation,
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest)) == Plan.ValidStack{parts <> rest} : Plan.Stack}
) -> {Plan.fold(List.append(&2, Plan.Operation, operations, [operation]), Plan.ValidStack{rest}) == Plan.ValidStack{parts <> rest} : Plan.Stack}:
  %Equal.sym(Plan.Stack,
    Plan.fold(List.append(&2, Plan.Operation, operations, [operation]), Plan.ValidStack{rest}),
    Plan.fold([operation], Plan.fold(operations, Plan.ValidStack{rest})),
    Local.fold_composition(operations, [operation], Plan.ValidStack{rest})) :
    {_ == Plan.ValidStack{parts <> rest} : Plan.Stack}
  %Equal.sym(Plan.Stack, Plan.fold(operations, Plan.ValidStack{rest}), Plan.ValidStack{
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest)}, children) :
    {Plan.fold([operation], _) == Plan.ValidStack{parts <> rest} : Plan.Stack}
  %Equal.sym(Plan.Stack, Plan.operation(operation,
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest)),
    Plan.ValidStack{parts <> rest}, closed) :
    {Plan.fold([], _) == Plan.ValidStack{parts <> rest} : Plan.Stack}
  {==}

def array_close(
  +items: List<&2, Value.ProductValue>, +plans: List<&2, List<&2, Plan.Piece>>,
  +rest: List<&2, List<&2, Plan.Piece>>,
  count: {List.length(&2, Value.ProductValue, items) == List.length(&2, List<&2, Plan.Piece>, plans) : Nat}
) -> {Plan.operation(Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)},
  List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest))
  == Plan.ValidStack{Compound.array_trace(plans) <> rest} : Plan.Stack}:
  %Equal.sym(Nat, List.length(&2, Value.ProductValue, items), List.length(&2, List<&2, Plan.Piece>, plans), count) :
    {Plan.operation(Plan.ArrayOperation{_}, List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest))
    == Plan.ValidStack{Compound.array_trace(plans) <> rest} : Plan.Stack}
  Compound.array_exact(plans, rest)

def array_run(
  +items: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>, +plans: List<&2, List<&2, Plan.Piece>>,
  result: forest_result(items, operations, plans)
) -> @rest: List<&2, List<&2, Plan.Piece>> -> {
  Plan.fold(List.append(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), Plan.ValidStack{rest})
  == Plan.ValidStack{Compound.array_trace(plans) <> rest} : Plan.Stack}:
  match result:
    case (count, run):
      +rest => close_run(operations, plans, Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)},
        Compound.array_trace(plans), rest, run(rest), array_close(items, plans, rest, count))

def object_close(
  +fields: List<&2, Value.OrderedField<Value.ProductValue>>, +planned_fields: List<&2, Plan.Field>,
  +rest: List<&2, List<&2, Plan.Piece>>,
  keys: {Compound.keys(planned_fields) == Laws.field_keys(fields) : List<&2, String>}
) -> {Plan.operation(Plan.ObjectOperation{Laws.field_keys(fields)},
  List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, Compound.values(planned_fields)), rest))
  == Plan.ValidStack{Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, planned_fields)) <> rest} : Plan.Stack}:
  %keys : {Plan.operation(Plan.ObjectOperation{_},
    List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, Compound.values(planned_fields)), rest))
    == Plan.ValidStack{Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, planned_fields)) <> rest} : Plan.Stack}
  Compound.object_exact(planned_fields, rest)

def object_run(
  +fields: List<&2, Value.OrderedField<Value.ProductValue>>, +planned_fields: List<&2, Plan.Field>,
  +operations: List<&2, Plan.Operation>,
  keys: {Compound.keys(planned_fields) == Laws.field_keys(fields) : List<&2, String>},
  result: forest_result(Laws.field_values(fields), operations, Compound.values(planned_fields))
) -> @rest: List<&2, List<&2, Plan.Piece>> -> {
  Plan.fold(List.append(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(fields)}]), Plan.ValidStack{rest})
  == Plan.ValidStack{Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, planned_fields)) <> rest} : Plan.Stack}:
  match result:
    case (_, run):
      +rest => close_run(operations, Compound.values(planned_fields), Plan.ObjectOperation{Laws.field_keys(fields)},
        Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, planned_fields)), rest, run(rest), object_close(fields, planned_fields, rest, keys))

def joined_operations(
  -operations: List<&2, Plan.Operation>, +children: List<&2, Plan.Operation>, +operation: Plan.Operation, +tail: List<&2, Plan.Operation>,
  shape: {operations == List.append(&2, Plan.Operation, children, operation <> tail) : List<&2, Plan.Operation>}
) -> {operations == List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, children, [operation]), tail) : List<&2, Plan.Operation>}:
  Equal.trans(List<&2, Plan.Operation>, operations, List.append(&2, Plan.Operation, children, operation <> tail),
    List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, children, [operation]), tail), shape,
    Equal.sym(List<&2, Plan.Operation>,
      List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, children, [operation]), tail),
      List.append(&2, Plan.Operation, children, operation <> tail),
      Lists.append_assoc(&2, Plan.Operation, children, [operation], tail)))

# One induction returns count and the arbitrary-understack transition together,
# so child evidence is consumed once even when array closure needs both facts.
def derive_forest(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  encoding: Laws.ForestEncoding<values, operations, plans>
) -> forest_result(values, operations, plans):
  match encoding:
    case Laws.EmptyForest{v, o, p}:
      result_transport(values, operations, plans, [], [], [], v, o, p, ({==}, rest => {==}))
    case Laws.PrimitiveForest{+primitive, +tv, +to, +tp, tail, v, o, p}:
      result_transport(values, operations, plans,
        Laws.primitive_value(primitive) <> tv, Plan.PrimitiveOperation{primitive} <> to, [Plan.PrimitivePiece{primitive}] <> tp,
        v, o, p,
        sequence_result(Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}], [Plan.PrimitivePiece{primitive}],
          tv, to, tp, rest => {==}, derive_forest(tv, to, tp, tail)))
    case Laws.ArrayForest{+items, +co, +cp, +tv, +to, +tp, children, tail, v, o, p}:
      result_transport(values, operations, plans,
        Value.ProductArray{items} <> tv,
        List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, co, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), to),
        Compound.array_trace(cp) <> tp, v,
        joined_operations(operations, co, Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}, to, o), p,
        sequence_result(Value.ProductArray{items}, List.append(&2, Plan.Operation, co, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]),
          Compound.array_trace(cp), tv, to, tp, array_run(items, co, cp, derive_forest(items, co, cp, children)), derive_forest(tv, to, tp, tail)))
    case Laws.ObjectForest{+fields, +pf, +co, +tv, +to, +tp, children, keys, tail, v, o, p}:
      result_transport(values, operations, plans,
        Value.ProductObject{fields} <> tv,
        List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, co, [Plan.ObjectOperation{Laws.field_keys(fields)}]), to),
        Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, pf)) <> tp, v,
        joined_operations(operations, co, Plan.ObjectOperation{Laws.field_keys(fields)}, to, o), p,
        sequence_result(Value.ProductObject{fields}, List.append(&2, Plan.Operation, co, [Plan.ObjectOperation{Laws.field_keys(fields)}]),
          Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, pf)), tv, to, tp,
          object_run(fields, pf, co, keys, derive_forest(Laws.field_values(fields), co, Compound.values(pf), children)), derive_forest(tv, to, tp, tail)))

def use_forest_result(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  rest: List<&2, List<&2, Plan.Piece>>, result: forest_result(values, operations, plans)
) -> {Plan.fold(operations, Plan.ValidStack{rest}) == Plan.ValidStack{
  List.append(&2, List<&2, Plan.Piece>, List.reverse(&2, List<&2, Plan.Piece>, plans), rest)} : Plan.Stack}:
  match result:
    case (_, run): run(rest)

def Laws.forest_exact(values, operations, plans, rest, encoding):
  use_forest_result(values, operations, plans, rest, derive_forest(values, operations, plans, encoding))

def Laws.tree_exact(value, operations, parts, encoding):
  Equal.cong(Plan.Stack, Maybe<&2, List<&2, Plan.Piece>>, state => Plan.finish(state),
    Plan.fold(operations, Plan.ValidStack{[]}), Plan.ValidStack{[parts]},
    Laws.forest_exact([value], operations, [parts], [], encoding))

def nat_reflexive(+value: Nat) -> {Nat.is_eq(value, value) == True{} : Bool}:
  match value:
    case 0n: {==}
    case 1n++tail: nat_reflexive(tail)

def bits_reflexive(+bits: Value.Binary64) -> {Validation.bits_equal(bits, bits) == True{} : Bool}:
  match bits:
    case Value.Binary64{+high, +low}:
      %Strings.internal_u32_cmp_refl(high) : {Bool.and(Cmp.is_eq(_), U32.is_eq(low, low)) == True{} : Bool}
      %Strings.internal_u32_cmp_refl(low) : {Bool.and(True{}, Cmp.is_eq(_)) == True{} : Bool}
      {==}

def primitive_reflexive(+primitive: Json.Primitive) -> {Validation.primitive_matches(primitive, Laws.primitive_value(primitive)) == True{} : Bool}:
  match primitive:
    case Json.NullPrimitive{}: {==}
    case Json.BoolPrimitive{value}:
      match value:
        case False{}: {==}
        case True{}: {==}
    case Json.NumberPrimitive{bits}: bits_reflexive(bits)
    case Json.StringPrimitive{value}: Strings.eq_refl(value)

def keys_reflexive(+fields: List<&2, Value.OrderedField<Value.ProductValue>>) -> {Validation.object_keys(Laws.field_keys(fields), fields) == True{} : Bool}:
  match fields:
    case []: {==}
    case Value.OrderedField{+key, _} <> +tail:
      %Equal.sym(Bool, String.eq(key, key), True{}, Strings.eq_refl(key)) :
        {Bool.and(_, Validation.object_keys(Laws.field_keys(tail), tail)) == True{} : Bool}
      keys_reflexive(tail)

def field_values_same(+fields: List<&2, Value.OrderedField<Value.ProductValue>>) -> {Validation.field_values(fields) == Laws.field_values(fields) : List<&2, Value.ProductValue>}:
  match fields:
    case []: {==}
    case Value.OrderedField{_, +value} <> +tail:
      Equal.cong(List<&2, Value.ProductValue>, List<&2, Value.ProductValue>, xs => value <> xs,
        Validation.field_values(tail), Laws.field_values(tail), field_values_same(tail))

# Accumulator reversal exposes exactly the validator's existing continuation.
def reverse_operations(+left: List<&2, Plan.Operation>, +right: List<&2, Plan.Operation>, +suffix: List<&2, Plan.Operation>) -> {
  List.reverse.go(&2, Plan.Operation, List.append(&2, Plan.Operation, left, right), suffix)
  == List.reverse.go(&2, Plan.Operation, right, List.reverse.go(&2, Plan.Operation, left, suffix)) : List<&2, Plan.Operation>}:
  match left:
    case []: {==}
    case head <> tail: reverse_operations(tail, right, head <> suffix)

def continuation(-values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>) -> Type:
  @suffix: List<&2, Plan.Operation> -> @expected: List<&2, Value.ProductValue> -> {
    Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix), List.reverse.go(&2, Value.ProductValue, values, expected))
    == Validation.validate_reversed(suffix, expected) : Bool}

def continuation_transport(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>,
  -actual_values: List<&2, Value.ProductValue>, -actual_operations: List<&2, Plan.Operation>,
  v: {values == actual_values : List<&2, Value.ProductValue>}, o: {operations == actual_operations : List<&2, Plan.Operation>},
  proof: continuation(actual_values, actual_operations)
) -> continuation(values, operations):
  %Equal.sym(List<&2, Value.ProductValue>, values, actual_values, v) : continuation(_, operations)
  %Equal.sym(List<&2, Plan.Operation>, operations, actual_operations, o) : continuation(actual_values, _)
  proof

def continuation_sequence_run(
  +value: Value.ProductValue, +head: List<&2, Plan.Operation>, +tail_values: List<&2, Value.ProductValue>, +tail: List<&2, Plan.Operation>,
  +suffix: List<&2, Plan.Operation>, +expected: List<&2, Value.ProductValue>,
  first: {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, head, suffix), value <> expected) == Validation.validate_reversed(suffix, expected) : Bool},
  later: {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, tail, List.reverse.go(&2, Plan.Operation, head, suffix)),
    List.reverse.go(&2, Value.ProductValue, tail_values, value <> expected)) == Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, head, suffix), value <> expected) : Bool}
) -> {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, List.append(&2, Plan.Operation, head, tail), suffix),
  List.reverse.go(&2, Value.ProductValue, value <> tail_values, expected)) == Validation.validate_reversed(suffix, expected) : Bool}:
  %Equal.sym(List<&2, Plan.Operation>, List.reverse.go(&2, Plan.Operation, List.append(&2, Plan.Operation, head, tail), suffix),
    List.reverse.go(&2, Plan.Operation, tail, List.reverse.go(&2, Plan.Operation, head, suffix)), reverse_operations(head, tail, suffix)) :
    {Validation.validate_reversed(_, List.reverse.go(&2, Value.ProductValue, tail_values, value <> expected)) == Validation.validate_reversed(suffix, expected) : Bool}
  Equal.trans(Bool,
    Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, tail, List.reverse.go(&2, Plan.Operation, head, suffix)), List.reverse.go(&2, Value.ProductValue, tail_values, value <> expected)),
    Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, head, suffix), value <> expected),
    Validation.validate_reversed(suffix, expected), later, first)

def continuation_sequence(
  +value: Value.ProductValue, +head: List<&2, Plan.Operation>, +tail_values: List<&2, Value.ProductValue>, +tail: List<&2, Plan.Operation>,
  first: continuation([value], head), later: continuation(tail_values, tail)
) -> continuation(value <> tail_values, List.append(&2, Plan.Operation, head, tail)):
  +suffix => +expected => continuation_sequence_run(value, head, tail_values, tail, suffix, expected,
    first(suffix, expected), later(List.reverse.go(&2, Plan.Operation, head, suffix), value <> expected))

def primitive_continuation(+primitive: Json.Primitive) -> continuation([Laws.primitive_value(primitive)], [Plan.PrimitiveOperation{primitive}]):
  suffix => expected =>
    %Equal.sym(Bool, Validation.primitive_matches(primitive, Laws.primitive_value(primitive)), True{}, primitive_reflexive(primitive)) :
      {Bool.and(_, Validation.validate_reversed(suffix, expected)) == Validation.validate_reversed(suffix, expected) : Bool}
    {==}

def array_continuation_run(
  +items: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>,
  +suffix: List<&2, Plan.Operation>, +expected: List<&2, Value.ProductValue>,
  children: {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix), List.reverse.go(&2, Value.ProductValue, items, expected))
    == Validation.validate_reversed(suffix, expected) : Bool}
) -> {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation,
  List.append(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), suffix),
  Value.ProductArray{items} <> expected) == Validation.validate_reversed(suffix, expected) : Bool}:
  %Equal.sym(List<&2, Plan.Operation>,
    List.reverse.go(&2, Plan.Operation, List.append(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), suffix),
    Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)} <> List.reverse.go(&2, Plan.Operation, operations, suffix),
    reverse_operations(operations, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}], suffix)) :
    {Validation.validate_reversed(_, Value.ProductArray{items} <> expected) == Validation.validate_reversed(suffix, expected) : Bool}
  %Equal.sym(Bool, Nat.is_eq(List.length(&2, Value.ProductValue, items), List.length(&2, Value.ProductValue, items)), True{}, nat_reflexive(List.length(&2, Value.ProductValue, items))) :
    {Bool.and(_, Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, items), expected))) == Validation.validate_reversed(suffix, expected) : Bool}
  %Lists.reverse_go_spec(&2, Value.ProductValue, items, expected) :
    {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix), _) == Validation.validate_reversed(suffix, expected) : Bool}
  children

def array_continuation(+items: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>, children: continuation(items, operations)) ->
  continuation([Value.ProductArray{items}], List.append(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}])):
  +suffix => +expected => array_continuation_run(items, operations, suffix, expected, children(suffix, expected))

def object_continuation_run(
  +fields: List<&2, Value.OrderedField<Value.ProductValue>>, +operations: List<&2, Plan.Operation>,
  +suffix: List<&2, Plan.Operation>, +expected: List<&2, Value.ProductValue>,
  children: {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix), List.reverse.go(&2, Value.ProductValue, Laws.field_values(fields), expected))
    == Validation.validate_reversed(suffix, expected) : Bool}
) -> {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation,
  List.append(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(fields)}]), suffix),
  Value.ProductObject{fields} <> expected) == Validation.validate_reversed(suffix, expected) : Bool}:
  %Equal.sym(List<&2, Plan.Operation>,
    List.reverse.go(&2, Plan.Operation, List.append(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(fields)}]), suffix),
    Plan.ObjectOperation{Laws.field_keys(fields)} <> List.reverse.go(&2, Plan.Operation, operations, suffix),
    reverse_operations(operations, [Plan.ObjectOperation{Laws.field_keys(fields)}], suffix)) :
    {Validation.validate_reversed(_, Value.ProductObject{fields} <> expected) == Validation.validate_reversed(suffix, expected) : Bool}
  %Equal.sym(Bool, Validation.object_keys(Laws.field_keys(fields), fields), True{}, keys_reflexive(fields)) :
    {Bool.and(_, Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, Validation.field_values(fields)), expected))) == Validation.validate_reversed(suffix, expected) : Bool}
  %Equal.sym(List<&2, Value.ProductValue>, Validation.field_values(fields), Laws.field_values(fields), field_values_same(fields)) :
    {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix),
      List.append(&2, Value.ProductValue, List.reverse(&2, Value.ProductValue, _), expected)) == Validation.validate_reversed(suffix, expected) : Bool}
  %Lists.reverse_go_spec(&2, Value.ProductValue, Laws.field_values(fields), expected) :
    {Validation.validate_reversed(List.reverse.go(&2, Plan.Operation, operations, suffix), _) == Validation.validate_reversed(suffix, expected) : Bool}
  children

def object_continuation(+fields: List<&2, Value.OrderedField<Value.ProductValue>>, +operations: List<&2, Plan.Operation>, children: continuation(Laws.field_values(fields), operations)) ->
  continuation([Value.ProductObject{fields}], List.append(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(fields)}])):
  +suffix => +expected => object_continuation_run(fields, operations, suffix, expected, children(suffix, expected))

# The reverse interpreter consumes each whole encoded forest before its suffix.
def derive_continuation(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  encoding: Laws.ForestEncoding<values, operations, plans>
) -> continuation(values, operations):
  match encoding:
    case Laws.EmptyForest{v, o, _}:
      continuation_transport(values, operations, [], [], v, o, suffix => expected => {==})
    case Laws.PrimitiveForest{+primitive, +tv, +to, tp, tail, v, o, _}:
      continuation_transport(values, operations, Laws.primitive_value(primitive) <> tv, Plan.PrimitiveOperation{primitive} <> to, v, o,
        continuation_sequence(Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}], tv, to,
          primitive_continuation(primitive), derive_continuation(tv, to, tp, tail)))
    case Laws.ArrayForest{+items, +co, cp, +tv, +to, tp, children, tail, v, o, _}:
      continuation_transport(values, operations, Value.ProductArray{items} <> tv,
        List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, co, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), to),
        v, joined_operations(operations, co, Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}, to, o),
        continuation_sequence(Value.ProductArray{items}, List.append(&2, Plan.Operation, co, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), tv, to,
          array_continuation(items, co, derive_continuation(items, co, cp, children)), derive_continuation(tv, to, tp, tail)))
    case Laws.ObjectForest{+fields, pf, +co, +tv, +to, tp, children, _, tail, v, o, _}:
      continuation_transport(values, operations, Value.ProductObject{fields} <> tv,
        List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, co, [Plan.ObjectOperation{Laws.field_keys(fields)}]), to),
        v, joined_operations(operations, co, Plan.ObjectOperation{Laws.field_keys(fields)}, to, o),
        continuation_sequence(Value.ProductObject{fields}, List.append(&2, Plan.Operation, co, [Plan.ObjectOperation{Laws.field_keys(fields)}]), tv, to,
          object_continuation(fields, co, derive_continuation(Laws.field_values(fields), co, Compound.values(pf), children)), derive_continuation(tv, to, tp, tail)))

def Laws.validation_complete(values, operations, plans, encoding):
  derive_continuation(values, operations, plans, encoding)([], [])

# Equality duplication is derived by equality elimination; affine proof values
# are never marked Data. This retains the checked derivation while exposing count.
def equality_twice_type(-A: Type, -left: A, -right: A) -> Type:
  {left == right : A} & {left == right : A}

def equality_twice(-A: Type, -left: A, -right: A, proof: {left == right : A}) -> equality_twice_type(A, left, right):
  %proof : equality_twice_type(A, left, _)
  ({==}, {==})

def count_transport(
  -values: List<&2, Value.ProductValue>, -plans: List<&2, List<&2, Plan.Piece>>,
  -actual_values: List<&2, Value.ProductValue>, -actual_plans: List<&2, List<&2, Plan.Piece>>,
  values_shape: {values == actual_values : List<&2, Value.ProductValue>},
  plans_shape: {plans == actual_plans : List<&2, List<&2, Plan.Piece>>},
  count: {List.length(&2, Value.ProductValue, actual_values) == List.length(&2, List<&2, Plan.Piece>, actual_plans) : Nat}
) -> {List.length(&2, Value.ProductValue, values) == List.length(&2, List<&2, Plan.Piece>, plans) : Nat}:
  %Equal.sym(List<&2, Value.ProductValue>, values, actual_values, values_shape) :
    {List.length(&2, Value.ProductValue, _) == List.length(&2, List<&2, Plan.Piece>, plans) : Nat}
  %Equal.sym(List<&2, List<&2, Plan.Piece>>, plans, actual_plans, plans_shape) :
    {List.length(&2, Value.ProductValue, actual_values) == List.length(&2, List<&2, Plan.Piece>, _) : Nat}
  count

def retained_count(-values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>) -> Type:
  Laws.ForestEncoding<values, operations, plans> &
    {List.length(&2, Value.ProductValue, values) == List.length(&2, List<&2, Plan.Piece>, plans) : Nat}

def preserve_empty(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  vs: equality_twice_type(List<&2, Value.ProductValue>, values, []),
  o: {operations == [] : List<&2, Plan.Operation>},
  ps: equality_twice_type(List<&2, List<&2, Plan.Piece>>, plans, [])
) -> retained_count(values, operations, plans):
  match vs ps:
    case Tuple{v1, v2} Tuple{p1, p2}:
      (Laws.EmptyForest{v1, o, p1}, count_transport(values, plans, [], [], v2, p2, {==}))

def preserve_step(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  -head: Value.ProductValue, -parts: List<&2, Plan.Piece>,
  -tv: List<&2, Value.ProductValue>, -to: List<&2, Plan.Operation>, -tp: List<&2, List<&2, Plan.Piece>>,
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
        Equal.cong(Nat, Nat, n => 1n+n, List.length(&2, Value.ProductValue, tv), List.length(&2, List<&2, Plan.Piece>, tp), count)))

def preserve_count(
  -values: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  encoding: Laws.ForestEncoding<values, operations, plans>
) -> retained_count(values, operations, plans):
  match encoding:
    case Laws.EmptyForest{v, o, p}:
      preserve_empty(values, operations, plans,
        equality_twice(List<&2, Value.ProductValue>, values, [], v), o,
        equality_twice(List<&2, List<&2, Plan.Piece>>, plans, [], p))
    case Laws.PrimitiveForest{+primitive, +tv, +to, +tp, tail, v, o, p}:
      preserve_step(values, operations, plans, Laws.primitive_value(primitive), [Plan.PrimitivePiece{primitive}], tv, to, tp,
        equality_twice(List<&2, Value.ProductValue>, values, Laws.primitive_value(primitive) <> tv, v),
        equality_twice(List<&2, List<&2, Plan.Piece>>, plans, [Plan.PrimitivePiece{primitive}] <> tp, p),
        preserve_count(tv, to, tp, tail),
        v1 => p1 => rest => Laws.PrimitiveForest{primitive, tv, to, tp, rest, v1, o, p1})
    case Laws.ArrayForest{+items, co, +cp, +tv, +to, +tp, children, tail, v, o, p}:
      preserve_step(values, operations, plans, Value.ProductArray{items}, Compound.array_trace(cp), tv, to, tp,
        equality_twice(List<&2, Value.ProductValue>, values, Value.ProductArray{items} <> tv, v),
        equality_twice(List<&2, List<&2, Plan.Piece>>, plans, Compound.array_trace(cp) <> tp, p),
        preserve_count(tv, to, tp, tail),
        v1 => p1 => rest => Laws.ArrayForest{items, co, cp, tv, to, tp, children, rest, v1, o, p1})
    case Laws.ObjectForest{+fields, +pf, co, +tv, +to, +tp, children, keys, tail, v, o, p}:
      preserve_step(values, operations, plans, Value.ProductObject{fields}, Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, pf)), tv, to, tp,
        equality_twice(List<&2, Value.ProductValue>, values, Value.ProductObject{fields} <> tv, v),
        equality_twice(List<&2, List<&2, Plan.Piece>>, plans, Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, pf)) <> tp, p),
        preserve_count(tv, to, tp, tail),
        v1 => p1 => rest => Laws.ObjectForest{fields, pf, co, tv, to, tp, children, keys, rest, v1, o, p1})

def encoding_values(
  -target: List<&2, Value.ProductValue>, -actual: List<&2, Value.ProductValue>,
  -operations: List<&2, Plan.Operation>, -plans: List<&2, List<&2, Plan.Piece>>,
  equal: {target == actual : List<&2, Value.ProductValue>}, proof: Laws.ForestEncoding<actual, operations, plans>
) -> Laws.ForestEncoding<target, operations, plans>:
  %Equal.sym(List<&2, Value.ProductValue>, target, actual, equal) : Laws.ForestEncoding<_, operations, plans>
  proof

def cons_parts_type(-head: Value.ProductValue, -tail: List<&2, Value.ProductValue>, -right: List<&2, Value.ProductValue>) -> Type:
  {head == Maybe.default(&2, Value.ProductValue, List.head(&2, Value.ProductValue, right), Value.ProductNull{}) : Value.ProductValue} &
    {tail == List.tail(&2, Value.ProductValue, right) : List<&2, Value.ProductValue>}

def cons_parts(
  -head: Value.ProductValue, -tail: List<&2, Value.ProductValue>, -other: Value.ProductValue, -rest: List<&2, Value.ProductValue>,
  equal: {head <> tail == other <> rest : List<&2, Value.ProductValue>}
) -> {head == other : Value.ProductValue} & {tail == rest : List<&2, Value.ProductValue>}:
  %equal : cons_parts_type(head, tail, _)
  ({==}, {==})

# A prefix cut returns exact operation slices and their constructive encodings.
# Old trace choices need not be retained: soundness requires a trace witness.
def cut_result(-prefix: List<&2, Value.ProductValue>, -suffix: List<&2, Value.ProductValue>, -operations: List<&2, Plan.Operation>) -> Type:
  Sigma<&2, &1, List<&2, Plan.Operation>, left_operations =>
    Sigma<&2, &1, List<&2, Plan.Operation>, right_operations =>
      Sigma<&2, &1, List<&2, List<&2, Plan.Piece>>, left_plans =>
        Sigma<&2, &1, List<&2, List<&2, Plan.Piece>>, right_plans =>
          Laws.ForestEncoding<prefix, left_operations, left_plans> &
          (Laws.ForestEncoding<suffix, right_operations, right_plans> &
            {operations == List.append(&2, Plan.Operation, left_operations, right_operations) : List<&2, Plan.Operation>})>>>>

def head_builder(-value: Value.ProductValue, -operations: List<&2, Plan.Operation>, -parts: List<&2, Plan.Piece>) -> Type:
  @tail_values: List<&2, Value.ProductValue> -> @tail_operations: List<&2, Plan.Operation> -> @tail_plans: List<&2, List<&2, Plan.Piece>> ->
    Laws.ForestEncoding<tail_values, tail_operations, tail_plans> ->
    Laws.ForestEncoding<value <> tail_values, List.append(&2, Plan.Operation, operations, tail_operations), parts <> tail_plans>

def primitive_builder(+primitive: Json.Primitive) -> head_builder(Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}], [Plan.PrimitivePiece{primitive}]):
  tv => to => tp => tail => Laws.PrimitiveForest{primitive, tv, to, tp, tail, {==}, {==}, {==}}

def array_builder(
  +items: List<&2, Value.ProductValue>, +operations: List<&2, Plan.Operation>, +plans: List<&2, List<&2, Plan.Piece>>,
  children: Laws.ForestEncoding<items, operations, plans>
) -> head_builder(Value.ProductArray{items}, List.append(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), Compound.array_trace(plans)):
  tv => +to => tp => tail => Laws.ArrayForest{items, operations, plans, tv, to, tp, children, tail, {==},
    Lists.append_assoc(&2, Plan.Operation, operations, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}], to), {==}}

def object_builder(
  +fields: List<&2, Value.OrderedField<Value.ProductValue>>, +planned: List<&2, Plan.Field>, +operations: List<&2, Plan.Operation>,
  children: Laws.ForestEncoding<Laws.field_values(fields), operations, Compound.values(planned)>,
  keys: {Compound.keys(planned) == Laws.field_keys(fields) : List<&2, String>}
) -> head_builder(Value.ProductObject{fields}, List.append(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(fields)}]),
  Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, planned))):
  tv => +to => tp => tail => Laws.ObjectForest{fields, planned, operations, tv, to, tp, children, keys, tail, {==},
    Lists.append_assoc(&2, Plan.Operation, operations, [Plan.ObjectOperation{Laws.field_keys(fields)}], to), {==}}

def cut_operations(
  -operations: List<&2, Plan.Operation>, +head: List<&2, Plan.Operation>, -tail: List<&2, Plan.Operation>,
  +left: List<&2, Plan.Operation>, +right: List<&2, Plan.Operation>,
  outer: {operations == List.append(&2, Plan.Operation, head, tail) : List<&2, Plan.Operation>},
  inner: {tail == List.append(&2, Plan.Operation, left, right) : List<&2, Plan.Operation>}
) -> {operations == List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, head, left), right) : List<&2, Plan.Operation>}:
  Equal.trans(List<&2, Plan.Operation>, operations, List.append(&2, Plan.Operation, head, tail),
    List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, head, left), right), outer,
    Equal.trans(List<&2, Plan.Operation>, List.append(&2, Plan.Operation, head, tail), List.append(&2, Plan.Operation, head, List.append(&2, Plan.Operation, left, right)),
      List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, head, left), right),
      Equal.cong(List<&2, Plan.Operation>, List<&2, Plan.Operation>, xs => List.append(&2, Plan.Operation, head, xs), tail, List.append(&2, Plan.Operation, left, right), inner),
      Equal.sym(List<&2, Plan.Operation>, List.append(&2, Plan.Operation, List.append(&2, Plan.Operation, head, left), right),
        List.append(&2, Plan.Operation, head, List.append(&2, Plan.Operation, left, right)), Lists.append_assoc(&2, Plan.Operation, head, left, right))))

def cut_prepend(
  -source: Value.ProductValue, +prefix: List<&2, Value.ProductValue>, +suffix: List<&2, Value.ProductValue>,
  -operations: List<&2, Plan.Operation>, +value: Value.ProductValue, +head: List<&2, Plan.Operation>, +parts: List<&2, Plan.Piece>, -tail: List<&2, Plan.Operation>,
  head_equal: {source == value : Value.ProductValue},
  operations_equal: {operations == List.append(&2, Plan.Operation, head, tail) : List<&2, Plan.Operation>},
  build: head_builder(value, head, parts), cut: cut_result(prefix, suffix, tail)
) -> cut_result(source <> prefix, suffix, operations):
  match cut:
    case Tuple{+lo, Tuple{+ro, Tuple{+lp, Tuple{+rp, Tuple{left, Tuple{right, equal}}}}}}:
      (List.append(&2, Plan.Operation, head, lo), (ro, (parts <> lp, (rp,
        (encoding_values(source <> prefix, value <> prefix, List.append(&2, Plan.Operation, head, lo), parts <> lp,
          Equal.cong(Value.ProductValue, List<&2, Value.ProductValue>, x => x <> prefix, source, value, head_equal),
          build(prefix, lo, lp, left)),
        (right, cut_operations(operations, head, tail, lo, ro, operations_equal, equal)))))))

def use_cons_parts(
  -R: Type, -head: Value.ProductValue, -tail: List<&2, Value.ProductValue>, -other: Value.ProductValue, -rest: List<&2, Value.ProductValue>,
  proof: {head == other : Value.ProductValue} & {tail == rest : List<&2, Value.ProductValue>},
  use: {head == other : Value.ProductValue} -> {tail == rest : List<&2, Value.ProductValue>} -> R
) -> R:
  match proof:
    case (first, later): use(first, later)

# Splitting follows the original forest prefix; it does not search or add fuel.
def split_forest(
  +prefix: List<&2, Value.ProductValue>, +suffix: List<&2, Value.ProductValue>,
  +operations: List<&2, Plan.Operation>, +plans: List<&2, List<&2, Plan.Piece>>,
  encoding: Laws.ForestEncoding<List.append(&2, Value.ProductValue, prefix, suffix), operations, plans>
) -> cut_result(prefix, suffix, operations):
  match prefix encoding:
    case Nil{} encoding:
      ([], (operations, ([], (plans, (Laws.EmptyForest{{==}, {==}, {==}}, (encoding, {==}))))))
    case Con{head, tail} Laws.EmptyForest{v, _, _}:
      Empty.absurd(cut_result(head <> tail, suffix, operations), Strings.internal_false_ne_true(
        Equal.cong(List<&2, Value.ProductValue>, Bool, xs => List.is_empty(&2, Value.ProductValue, xs),
          head <> List.append(&2, Value.ProductValue, tail, suffix), [], v)))
    case Con{+source, +prefix} Laws.PrimitiveForest{+primitive, +tv, +to, tp, tail, v, o, _}:
      use_cons_parts(cut_result(source <> prefix, suffix, operations), source, List.append(&2, Value.ProductValue, prefix, suffix), Laws.primitive_value(primitive), tv,
        cons_parts(source, List.append(&2, Value.ProductValue, prefix, suffix), Laws.primitive_value(primitive), tv, v),
        head_equal => tail_equal => cut_prepend(source, prefix, suffix, operations,
          Laws.primitive_value(primitive), [Plan.PrimitiveOperation{primitive}], [Plan.PrimitivePiece{primitive}], to,
          head_equal, o, primitive_builder(primitive),
          split_forest(prefix, suffix, to, tp,
            encoding_values(List.append(&2, Value.ProductValue, prefix, suffix), tv, to, tp, tail_equal, tail))))
    case Con{+source, +prefix} Laws.ArrayForest{+items, +co, +cp, +tv, +to, tp, children, tail, v, o, _}:
      use_cons_parts(cut_result(source <> prefix, suffix, operations), source, List.append(&2, Value.ProductValue, prefix, suffix), Value.ProductArray{items}, tv,
        cons_parts(source, List.append(&2, Value.ProductValue, prefix, suffix), Value.ProductArray{items}, tv, v),
        head_equal => tail_equal => cut_prepend(source, prefix, suffix, operations,
          Value.ProductArray{items}, List.append(&2, Plan.Operation, co, [Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}]), Compound.array_trace(cp), to,
          head_equal, joined_operations(operations, co, Plan.ArrayOperation{List.length(&2, Value.ProductValue, items)}, to, o), array_builder(items, co, cp, children),
          split_forest(prefix, suffix, to, tp,
            encoding_values(List.append(&2, Value.ProductValue, prefix, suffix), tv, to, tp, tail_equal, tail))))
    case Con{+source, +prefix} Laws.ObjectForest{+fields, +pf, +co, +tv, +to, tp, children, keys, tail, v, o, _}:
      use_cons_parts(cut_result(source <> prefix, suffix, operations), source, List.append(&2, Value.ProductValue, prefix, suffix), Value.ProductObject{fields}, tv,
        cons_parts(source, List.append(&2, Value.ProductValue, prefix, suffix), Value.ProductObject{fields}, tv, v),
        head_equal => tail_equal => cut_prepend(source, prefix, suffix, operations,
          Value.ProductObject{fields}, List.append(&2, Plan.Operation, co, [Plan.ObjectOperation{Laws.field_keys(fields)}]),
          Compound.object_trace(List.sort(~Plan.Field, ~Plan.fields_le, pf)), to,
          head_equal, joined_operations(operations, co, Plan.ObjectOperation{Laws.field_keys(fields)}, to, o), object_builder(fields, pf, co, children, keys),
          split_forest(prefix, suffix, to, tp,
            encoding_values(List.append(&2, Value.ProductValue, prefix, suffix), tv, to, tp, tail_equal, tail))))

def main() -> Unit:
  Unit{}
