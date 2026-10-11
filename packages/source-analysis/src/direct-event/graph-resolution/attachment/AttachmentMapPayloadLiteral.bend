import Base
import ../Core.bend as Core
import ../traversal/patricia-proof/PATRICIA_RELATION.bend as Patricia

# One private exact payload transport for the whole resolver's existing Maps:
# built products, artifact index, and ordered reference groups. No new state
# representation, key-freshness premise, or restriction on payload contents.
def tree_0(-Value: Data, one: Value, two: Value, three: Value) -> Map<&2, Value>:
  MTip{}
def canonical_0(-Value: Data, +one: Value, +two: Value, +three: Value) -> {Patricia.canonical(Value, tree_0(Value, one, two, three)) == True{} : Bool}:
  {==}
def claim_0(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "a", value), "")
      == Bool.pick(Value, String.eq("", "a"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "")) : Value}:
  {==}
def claim_1(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "a", value), "a")
      == Bool.pick(Value, String.eq("a", "a"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "a")) : Value}:
  {==}
def claim_2(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "a", value), "ab")
      == Bool.pick(Value, String.eq("ab", "a"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_3(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "a", value), "abc")
      == Bool.pick(Value, String.eq("abc", "a"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_4(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "a", value), "b")
      == Bool.pick(Value, String.eq("b", "a"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "b")) : Value}:
  {==}
def claim_5(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "a", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", "a"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "a\0")) : Value}:
  {==}
def claim_6(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "ab", value), "")
      == Bool.pick(Value, String.eq("", "ab"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "")) : Value}:
  {==}
def claim_7(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "ab", value), "a")
      == Bool.pick(Value, String.eq("a", "ab"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "a")) : Value}:
  {==}
def claim_8(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "ab", value), "ab")
      == Bool.pick(Value, String.eq("ab", "ab"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_9(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "ab", value), "abc")
      == Bool.pick(Value, String.eq("abc", "ab"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_10(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "ab", value), "b")
      == Bool.pick(Value, String.eq("b", "ab"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "b")) : Value}:
  {==}
def claim_11(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "ab", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", "ab"), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "a\0")) : Value}:
  {==}
def claim_12(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "", value), "")
      == Bool.pick(Value, String.eq("", ""), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "")) : Value}:
  {==}
def claim_13(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "", value), "a")
      == Bool.pick(Value, String.eq("a", ""), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "a")) : Value}:
  {==}
def claim_14(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "", value), "ab")
      == Bool.pick(Value, String.eq("ab", ""), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_15(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "", value), "abc")
      == Bool.pick(Value, String.eq("abc", ""), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_16(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "", value), "b")
      == Bool.pick(Value, String.eq("b", ""), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "b")) : Value}:
  {==}
def claim_17(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_0(Value, one, two, three), "", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", ""), value, Core.map_read(Value, fallback, tree_0(Value, one, two, three), "a\0")) : Value}:
  {==}
def tree_1(-Value: Data, one: Value, two: Value, three: Value) -> Map<&2, Value>:
  MLeaf{"a", one}
def canonical_1(-Value: Data, +one: Value, +two: Value, +three: Value) -> {Patricia.canonical(Value, tree_1(Value, one, two, three)) == True{} : Bool}:
  {==}
def claim_18(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "a", value), "")
      == Bool.pick(Value, String.eq("", "a"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "")) : Value}:
  {==}
def claim_19(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "a", value), "a")
      == Bool.pick(Value, String.eq("a", "a"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "a")) : Value}:
  {==}
def claim_20(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "a", value), "ab")
      == Bool.pick(Value, String.eq("ab", "a"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_21(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "a", value), "abc")
      == Bool.pick(Value, String.eq("abc", "a"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_22(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "a", value), "b")
      == Bool.pick(Value, String.eq("b", "a"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "b")) : Value}:
  {==}
def claim_23(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "a", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", "a"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "a\0")) : Value}:
  {==}
def claim_24(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "ab", value), "")
      == Bool.pick(Value, String.eq("", "ab"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "")) : Value}:
  {==}
def claim_25(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "ab", value), "a")
      == Bool.pick(Value, String.eq("a", "ab"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "a")) : Value}:
  {==}
def claim_26(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "ab", value), "ab")
      == Bool.pick(Value, String.eq("ab", "ab"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_27(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "ab", value), "abc")
      == Bool.pick(Value, String.eq("abc", "ab"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_28(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "ab", value), "b")
      == Bool.pick(Value, String.eq("b", "ab"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "b")) : Value}:
  {==}
def claim_29(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "ab", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", "ab"), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "a\0")) : Value}:
  {==}
def claim_30(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "", value), "")
      == Bool.pick(Value, String.eq("", ""), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "")) : Value}:
  {==}
def claim_31(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "", value), "a")
      == Bool.pick(Value, String.eq("a", ""), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "a")) : Value}:
  {==}
def claim_32(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "", value), "ab")
      == Bool.pick(Value, String.eq("ab", ""), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_33(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "", value), "abc")
      == Bool.pick(Value, String.eq("abc", ""), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_34(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "", value), "b")
      == Bool.pick(Value, String.eq("b", ""), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "b")) : Value}:
  {==}
def claim_35(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_1(Value, one, two, three), "", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", ""), value, Core.map_read(Value, fallback, tree_1(Value, one, two, three), "a\0")) : Value}:
  {==}
def tree_2(-Value: Data, one: Value, two: Value, three: Value) -> Map<&2, Value>:
  Map.set(&2, Value, MLeaf{"a", one}, "ab", two)
def canonical_2(-Value: Data, +one: Value, +two: Value, +three: Value) -> {Patricia.canonical(Value, tree_2(Value, one, two, three)) == True{} : Bool}:
  {==}
def claim_36(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "a", value), "")
      == Bool.pick(Value, String.eq("", "a"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "")) : Value}:
  {==}
def claim_37(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "a", value), "a")
      == Bool.pick(Value, String.eq("a", "a"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "a")) : Value}:
  {==}
def claim_38(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "a", value), "ab")
      == Bool.pick(Value, String.eq("ab", "a"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_39(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "a", value), "abc")
      == Bool.pick(Value, String.eq("abc", "a"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_40(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "a", value), "b")
      == Bool.pick(Value, String.eq("b", "a"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "b")) : Value}:
  {==}
def claim_41(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "a", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", "a"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "a\0")) : Value}:
  {==}
def claim_42(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "ab", value), "")
      == Bool.pick(Value, String.eq("", "ab"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "")) : Value}:
  {==}
def claim_43(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "ab", value), "a")
      == Bool.pick(Value, String.eq("a", "ab"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "a")) : Value}:
  {==}
def claim_44(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "ab", value), "ab")
      == Bool.pick(Value, String.eq("ab", "ab"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_45(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "ab", value), "abc")
      == Bool.pick(Value, String.eq("abc", "ab"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_46(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "ab", value), "b")
      == Bool.pick(Value, String.eq("b", "ab"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "b")) : Value}:
  {==}
def claim_47(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "ab", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", "ab"), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "a\0")) : Value}:
  {==}
def claim_48(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "", value), "")
      == Bool.pick(Value, String.eq("", ""), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "")) : Value}:
  {==}
def claim_49(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "", value), "a")
      == Bool.pick(Value, String.eq("a", ""), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "a")) : Value}:
  {==}
def claim_50(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "", value), "ab")
      == Bool.pick(Value, String.eq("ab", ""), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_51(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "", value), "abc")
      == Bool.pick(Value, String.eq("abc", ""), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_52(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "", value), "b")
      == Bool.pick(Value, String.eq("b", ""), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "b")) : Value}:
  {==}
def claim_53(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_2(Value, one, two, three), "", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", ""), value, Core.map_read(Value, fallback, tree_2(Value, one, two, three), "a\0")) : Value}:
  {==}
def tree_3(-Value: Data, one: Value, two: Value, three: Value) -> Map<&2, Value>:
  Map.set(&2, Value, Map.set(&2, Value, MLeaf{"a", one}, "ab", two), "b", three)
def canonical_3(-Value: Data, +one: Value, +two: Value, +three: Value) -> {Patricia.canonical(Value, tree_3(Value, one, two, three)) == True{} : Bool}:
  {==}
def claim_54(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "a", value), "")
      == Bool.pick(Value, String.eq("", "a"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "")) : Value}:
  {==}
def claim_55(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "a", value), "a")
      == Bool.pick(Value, String.eq("a", "a"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "a")) : Value}:
  {==}
def claim_56(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "a", value), "ab")
      == Bool.pick(Value, String.eq("ab", "a"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_57(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "a", value), "abc")
      == Bool.pick(Value, String.eq("abc", "a"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_58(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "a", value), "b")
      == Bool.pick(Value, String.eq("b", "a"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "b")) : Value}:
  {==}
def claim_59(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "a", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", "a"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "a\0")) : Value}:
  {==}
def claim_60(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "ab", value), "")
      == Bool.pick(Value, String.eq("", "ab"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "")) : Value}:
  {==}
def claim_61(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "ab", value), "a")
      == Bool.pick(Value, String.eq("a", "ab"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "a")) : Value}:
  {==}
def claim_62(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "ab", value), "ab")
      == Bool.pick(Value, String.eq("ab", "ab"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_63(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "ab", value), "abc")
      == Bool.pick(Value, String.eq("abc", "ab"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_64(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "ab", value), "b")
      == Bool.pick(Value, String.eq("b", "ab"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "b")) : Value}:
  {==}
def claim_65(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "ab", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", "ab"), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "a\0")) : Value}:
  {==}
def claim_66(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "", value), "")
      == Bool.pick(Value, String.eq("", ""), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "")) : Value}:
  {==}
def claim_67(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "", value), "a")
      == Bool.pick(Value, String.eq("a", ""), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "a")) : Value}:
  {==}
def claim_68(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "", value), "ab")
      == Bool.pick(Value, String.eq("ab", ""), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "ab")) : Value}:
  {==}
def claim_69(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "", value), "abc")
      == Bool.pick(Value, String.eq("abc", ""), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "abc")) : Value}:
  {==}
def claim_70(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "", value), "b")
      == Bool.pick(Value, String.eq("b", ""), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "b")) : Value}:
  {==}
def claim_71(-Value: Data, +one: Value, +two: Value, +three: Value, +value: Value, +fallback: Value) ->
    {Core.map_read(Value, fallback, Map.set(&2, Value, tree_3(Value, one, two, three), "", value), "a\0")
      == Bool.pick(Value, String.eq("a\0", ""), value, Core.map_read(Value, fallback, tree_3(Value, one, two, three), "a\0")) : Value}:
  {==}
def main() -> Unit:
  Unit{}
