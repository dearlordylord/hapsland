import Base
import ../Core.bend as Core
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# One private exact payload transport for the whole resolver's existing Maps:
# built products, artifact index, and ordered reference groups. No new state
# representation, key-freshness premise, or restriction on payload contents.
import ../representations/list-state/PATRICIA_INSERT_PROOF.bend as Insert
import ../traversal/INTERPRETER_STRING_FACTS.bend as StringFacts
import ../traversal/core.bend as Local
import ../representations/list-state/PATRICIA_BIT_PROOF.bend as BitProof

# Proof-only recursive observation of actual Map.get routing and leaf result.
# This operates directly on the existing Map; it is not a runtime state model.
def routed_value(-Value: Data, +fallback: Value, tree: Map<&2, Value>, +query: String) -> Value:
  match tree:
    case MTip{}: fallback
    case MLeaf{name, value}: Core.map_read(Value, fallback, MLeaf{name, value}, query)
    case MNode{position, lo, hi}:
      Bool.pick(Value, Patricia.route(query, position),
        routed_value(Value, fallback, hi, query), routed_value(Value, fallback, lo, query))

def lo_value(-Value: Data, +position: Nat, +hi: Map<&2, Value>, result: Map<&2, Value> & Value) ->
    {Local.map_result(Value, Map.lo(&2, Value, Value, position, hi, result))
      == Local.map_result(Value, result) : Value}:
  match result:
    case Tuple{_, _}: {==}

def hi_value(-Value: Data, +position: Nat, +lo: Map<&2, Value>, result: Map<&2, Value> & Value) ->
    {Local.map_result(Value, Map.hi(&2, Value, Value, position, lo, result))
      == Local.map_result(Value, result) : Value}:
  match result:
    case Tuple{_, _}: {==}

def routed_node(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>,
    +fallback: Value, +query: String, +side: Bool,
    left: {Core.map_read(Value, fallback, lo, query) == routed_value(Value, fallback, lo, query) : Value},
    right: {Core.map_read(Value, fallback, hi, query) == routed_value(Value, fallback, hi, query) : Value}) ->
    {Local.map_result(Value, Map.get.go(Value, MNode{position, lo, hi}, fallback, Tuple{query, side}))
      == Bool.pick(Value, side, routed_value(Value, fallback, hi, query), routed_value(Value, fallback, lo, query)) : Value}:
  match lo hi side:
    case MTip{} _ False{}: {==}
    case MLeaf{+name, +value} _ False{}:
      lo_value(Value, position, hi, Map.get.leaf(Value, fallback, value, String.cmp(query, name)))
    case MNode{+q, +a, +b} _ False{}:
      Equal.trans(Value,
        Local.map_result(Value, Map.lo(&2, Value, Value, position, hi,
          Map.get.go(Value, MNode{q, a, b}, fallback, Map.bit(query, q)))),
        Core.map_read(Value, fallback, MNode{q, a, b}, query),
        routed_value(Value, fallback, MNode{q, a, b}, query),
        lo_value(Value, position, hi, Map.get.go(Value, MNode{q, a, b}, fallback, Map.bit(query, q))), left)
    case _ MTip{} True{}: {==}
    case _ MLeaf{+name, +value} True{}:
      hi_value(Value, position, lo, Map.get.leaf(Value, fallback, value, String.cmp(query, name)))
    case _ MNode{+q, +a, +b} True{}:
      Equal.trans(Value,
        Local.map_result(Value, Map.hi(&2, Value, Value, position, lo,
          Map.get.go(Value, MNode{q, a, b}, fallback, Map.bit(query, q)))),
        Core.map_read(Value, fallback, MNode{q, a, b}, query),
        routed_value(Value, fallback, MNode{q, a, b}, query),
        hi_value(Value, position, lo, Map.get.go(Value, MNode{q, a, b}, fallback, Map.bit(query, q))), right)

def lookup_routed(-Value: Data, +fallback: Value, tree: Map<&2, Value>, +query: String) ->
    {Core.map_read(Value, fallback, tree, query) == routed_value(Value, fallback, tree, query) : Value}:
  match tree:
    case MTip{}: {==}
    case MLeaf{_, _}: {==}
    case MNode{+position, +lo, +hi}:
      %Equal.sym(String & Bool, Map.bit(query, position), Tuple{query, Patricia.route(query, position)},
        BitProof.bit_preserves_key(query, position)):
        {Local.map_result(Value, Map.get.go(Value, MNode{position, lo, hi}, fallback, _))
          == routed_value(Value, fallback, MNode{position, lo, hi}, query) : Value}
      routed_node(Value, position, lo, hi, fallback, query, Patricia.route(query, position),
        lookup_routed(Value, fallback, lo, query), lookup_routed(Value, fallback, hi, query))

def leaf_projection(-Value: Data, +fallback: Value, +value: Value, result: (String & String) & Cmp) ->
    {Local.map_result(Value, Map.get.leaf(Value, fallback, value, result))
      == Bool.pick(Value, Cmp.is_eq(Insert.comparison_order(result)), value, fallback) : Value}:
  match result:
    case Tuple{Tuple{_, _}, order}:
      match order:
        case LT{}: {==}
        case EQ{}: {==}
        case GT{}: {==}

def leaf_read_exact(-Value: Data, +fallback: Value, +name: String, +value: Value, +query: String) ->
    {Core.map_read(Value, fallback, MLeaf{name, value}, query)
      == Bool.pick(Value, String.eq(query, name), value, fallback) : Value}:
  Equal.trans(Value, Core.map_read(Value, fallback, MLeaf{name, value}, query),
    Bool.pick(Value, Cmp.is_eq(Insert.comparison_order(String.cmp(query, name))), value, fallback),
    Bool.pick(Value, String.eq(query, name), value, fallback),
    leaf_projection(Value, fallback, value, String.cmp(query, name)),
    Equal.cong(Bool, Value, choice => Bool.pick(Value, choice, value, fallback),
      Cmp.is_eq(Insert.comparison_order(String.cmp(query, name))), String.eq(query, name),
      Equal.sym(Bool, String.eq(query, name), Cmp.is_eq(Insert.comparison_order(String.cmp(query, name))),
        Insert.comparison_equality_exact(query, name))))

def or_false_left(+left: Bool, +right: Bool, absent: {Bool.or(left, right) == False{} : Bool}) ->
    {left == False{} : Bool}:
  match left:
    case False{}: {==}
    case True{}:
      Empty.absurd({True{} == False{} : Bool}, Insert.false_true_impossible(Equal.sym(Bool, True{}, False{}, absent)))

def or_false_right(+left: Bool, +right: Bool, absent: {Bool.or(left, right) == False{} : Bool}) ->
    {right == False{} : Bool}:
  match left:
    case False{}: absent
    case True{}:
      Empty.absurd({right == False{} : Bool}, Insert.false_true_impossible(Equal.sym(Bool, True{}, False{}, absent)))

def pick_same(-Value: Data, +choice: Bool, +value: Value) -> {Bool.pick(Value, choice, value, value) == value : Value}:
  match choice:
    case False{}: {==}
    case True{}: {==}

def routed_absent(-Value: Data, +fallback: Value, tree: Map<&2, Value>, +query: String,
    +absent: {Insert.leaf_exists(Value, tree, query) == False{} : Bool}) ->
    {routed_value(Value, fallback, tree, query) == fallback : Value}:
  match tree:
    case MTip{}: {==}
    case MLeaf{+name, +value}:
      Equal.trans(Value, Core.map_read(Value, fallback, MLeaf{name, value}, query),
        Bool.pick(Value, String.eq(query, name), value, fallback), fallback,
        leaf_read_exact(Value, fallback, name, value, query),
        Equal.cong(Bool, Value, choice => Bool.pick(Value, choice, value, fallback),
          String.eq(query, name), False{}, absent))
    case MNode{+position, +lo, +hi}:
      %Equal.sym(Value, routed_value(Value, fallback, hi, query), fallback,
        routed_absent(Value, fallback, hi, query,
          or_false_right(Insert.leaf_exists(Value, lo, query), Insert.leaf_exists(Value, hi, query), absent))):
        {Bool.pick(Value, Patricia.route(query, position), _, routed_value(Value, fallback, lo, query)) == fallback : Value}
      %Equal.sym(Value, routed_value(Value, fallback, lo, query), fallback,
        routed_absent(Value, fallback, lo, query,
          or_false_left(Insert.leaf_exists(Value, lo, query), Insert.leaf_exists(Value, hi, query), absent))):
        {Bool.pick(Value, Patricia.route(query, position), fallback, _) == fallback : Value}
      pick_same(Value, Patricia.route(query, position), fallback)

def lookup_absent(-Value: Data, +fallback: Value, +tree: Map<&2, Value>, +query: String,
    absent: {Insert.leaf_exists(Value, tree, query) == False{} : Bool}) ->
    {Core.map_read(Value, fallback, tree, query) == fallback : Value}:
  Equal.trans(Value, Core.map_read(Value, fallback, tree, query), routed_value(Value, fallback, tree, query), fallback,
    lookup_routed(Value, fallback, tree, query), routed_absent(Value, fallback, tree, query, absent))

def lookup_opposite_side(-Value: Data, +fallback: Value, +tree: Map<&2, Value>,
    +query: String, +position: Nat, +side: Bool,
    query_side: {Patricia.route(query, position) == Bool.not(side) : Bool},
    sided: {Patricia.all_side(Value, tree, position, side) == True{} : Bool}) ->
    {Core.map_read(Value, fallback, tree, query) == fallback : Value}:
  lookup_absent(Value, fallback, tree, query,
    Insert.all_side_excludes(Value, tree, query, position, side, query_side, sided))

def pick_override(-Value: Data, +choice: Bool, +value: Value, +previous: Value, +fallback: Value) ->
    {Bool.pick(Value, choice, value, fallback)
      == Bool.pick(Value, choice, value, Bool.pick(Value, choice, previous, fallback)) : Value}:
  match choice:
    case False{}: {==}
    case True{}: {==}

def put_leaf_exact(-Value: Data, +name: String, +previous: Value, +key: String, +value: Value,
    +query: String, +fallback: Value,
    witness: {Insert.selected(Value, MLeaf{name, previous}, key) == Some{key} : Maybe<&2, String>}) ->
    {Core.map_read(Value, fallback, Map.put(&2, Value, MLeaf{name, previous}, key, value), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MLeaf{name, previous}, query)) : Value}:
  same: {name == key : String} = Equal.cong(Maybe<&2, String>, String,
    found => Maybe.default(&2, String, found, ""), Some{name}, Some{key}, witness)
  %Equal.sym(Value, Core.map_read(Value, fallback, MLeaf{name, value}, query),
    Bool.pick(Value, String.eq(query, name), value, fallback), leaf_read_exact(Value, fallback, name, value, query)):
    {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MLeaf{name, previous}, query)) : Value}
  %Equal.sym(Value, Core.map_read(Value, fallback, MLeaf{name, previous}, query),
    Bool.pick(Value, String.eq(query, name), previous, fallback), leaf_read_exact(Value, fallback, name, previous, query)):
    {Bool.pick(Value, String.eq(query, name), value, fallback) == Bool.pick(Value, String.eq(query, key), value, _) : Value}
  %same:
    {Bool.pick(Value, String.eq(query, name), value, fallback)
      == Bool.pick(Value, String.eq(query, _), value, Bool.pick(Value, String.eq(query, name), previous, fallback)) : Value}
  pick_override(Value, String.eq(query, name), value, previous, fallback)

def read_node_split(-Value: Data, +fallback: Value, +position: Nat,
    +lo: Map<&2, Value>, +hi: Map<&2, Value>, +query: String) ->
    {Core.map_read(Value, fallback, MNode{position, lo, hi}, query)
      == Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query),
        Core.map_read(Value, fallback, lo, query)) : Value}:
  %Equal.sym(Value, Core.map_read(Value, fallback, hi, query), routed_value(Value, fallback, hi, query),
    lookup_routed(Value, fallback, hi, query)):
    {Core.map_read(Value, fallback, MNode{position, lo, hi}, query)
      == Bool.pick(Value, Patricia.route(query, position), _, Core.map_read(Value, fallback, lo, query)) : Value}
  %Equal.sym(Value, Core.map_read(Value, fallback, lo, query), routed_value(Value, fallback, lo, query),
    lookup_routed(Value, fallback, lo, query)):
    {Core.map_read(Value, fallback, MNode{position, lo, hi}, query)
      == Bool.pick(Value, Patricia.route(query, position), routed_value(Value, fallback, hi, query), _) : Value}
  lookup_routed(Value, fallback, MNode{position, lo, hi}, query)

def put_node_split(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>,
    +key: String, +value: Value, +side: Bool) ->
    {Map.put.go(&2, Value, MNode{position, lo, hi}, value, Tuple{key, side})
      == Bool.pick(Map<&2, Value>, side,
        MNode{position, lo, Map.put(&2, Value, hi, key, value)},
        MNode{position, Map.put(&2, Value, lo, key, value), hi}) : Map<&2, Value>}:
  match lo hi side:
    case MTip{} _ False{}: {==}
    case MLeaf{_, _} _ False{}: {==}
    case MNode{_, _, _} _ False{}: {==}
    case _ MTip{} True{}: {==}
    case _ MLeaf{_, _} True{}: {==}
    case _ MNode{_, _, _} True{}: {==}

def left_update_selection(-Value: Data, +left: Value, +right: Value, +updated: Value, +value: Value,
    +same: Bool, +query_side: Bool,
    changed: {updated == Bool.pick(Value, same, value, left) : Value},
    opposite: {query_side == True{} : Bool} -> {same == False{} : Bool}) ->
    {Bool.pick(Value, query_side, right, updated)
      == Bool.pick(Value, same, value, Bool.pick(Value, query_side, right, left)) : Value}:
  match query_side:
    case False{}: changed
    case True{}:
      %Equal.sym(Bool, same, False{}, opposite({==})): {right == Bool.pick(Value, _, value, right) : Value}
      {==}

def right_update_selection(-Value: Data, +left: Value, +right: Value, +updated: Value, +value: Value,
    +same: Bool, +query_side: Bool,
    changed: {updated == Bool.pick(Value, same, value, right) : Value},
    opposite: {query_side == False{} : Bool} -> {same == False{} : Bool}) ->
    {Bool.pick(Value, query_side, updated, left)
      == Bool.pick(Value, same, value, Bool.pick(Value, query_side, right, left)) : Value}:
  match query_side:
    case False{}:
      %Equal.sym(Bool, same, False{}, opposite({==})): {left == Bool.pick(Value, _, value, left) : Value}
      {==}
    case True{}: changed

def left_child_update(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>, +updated: Map<&2, Value>,
    +key: String, +value: Value, +query: String, +fallback: Value,
    changed: {Core.map_read(Value, fallback, updated, query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, lo, query)) : Value},
    opposite: {Patricia.route(query, position) == True{} : Bool} -> {String.eq(query, key) == False{} : Bool}) ->
    {Core.map_read(Value, fallback, MNode{position, updated, hi}, query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}:
  %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, updated, hi}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, updated, query)),
    read_node_split(Value, fallback, position, updated, hi, query)):
    {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
  %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, lo, query)),
    read_node_split(Value, fallback, position, lo, hi, query)):
    {Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, updated, query))
      == Bool.pick(Value, String.eq(query, key), value, _) : Value}
  left_update_selection(Value, Core.map_read(Value, fallback, lo, query), Core.map_read(Value, fallback, hi, query),
    Core.map_read(Value, fallback, updated, query), value,
    String.eq(query, key), Patricia.route(query, position), changed, opposite)

def right_child_update(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>, +updated: Map<&2, Value>,
    +key: String, +value: Value, +query: String, +fallback: Value,
    changed: {Core.map_read(Value, fallback, updated, query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, hi, query)) : Value},
    opposite: {Patricia.route(query, position) == False{} : Bool} -> {String.eq(query, key) == False{} : Bool}) ->
    {Core.map_read(Value, fallback, MNode{position, lo, updated}, query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}:
  %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, lo, updated}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, updated, query), Core.map_read(Value, fallback, lo, query)),
    read_node_split(Value, fallback, position, lo, updated, query)):
    {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
  %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, lo, query)),
    read_node_split(Value, fallback, position, lo, hi, query)):
    {Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, updated, query), Core.map_read(Value, fallback, lo, query))
      == Bool.pick(Value, String.eq(query, key), value, _) : Value}
  right_update_selection(Value, Core.map_read(Value, fallback, lo, query), Core.map_read(Value, fallback, hi, query),
    Core.map_read(Value, fallback, updated, query), value,
    String.eq(query, key), Patricia.route(query, position), changed, opposite)

def left_node_update(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>,
    +key: String, +value: Value, +query: String, +fallback: Value,
    changed: {Core.map_read(Value, fallback, Map.put(&2, Value, lo, key, value), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, lo, query)) : Value},
    opposite: {Patricia.route(query, position) == True{} : Bool} -> {String.eq(query, key) == False{} : Bool}) ->
    {Core.map_read(Value, fallback, MNode{position, Map.put(&2, Value, lo, key, value), hi}, query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}:
  %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, Map.put(&2, Value, lo, key, value), hi}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, Map.put(&2, Value, lo, key, value), query)),
    read_node_split(Value, fallback, position, Map.put(&2, Value, lo, key, value), hi, query)):
    {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
  %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, lo, query)),
    read_node_split(Value, fallback, position, lo, hi, query)):
    {Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, Map.put(&2, Value, lo, key, value), query))
      == Bool.pick(Value, String.eq(query, key), value, _) : Value}
  left_update_selection(Value, Core.map_read(Value, fallback, lo, query), Core.map_read(Value, fallback, hi, query),
    Core.map_read(Value, fallback, Map.put(&2, Value, lo, key, value), query), value,
    String.eq(query, key), Patricia.route(query, position), changed, opposite)

def right_node_update(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>,
    +key: String, +value: Value, +query: String, +fallback: Value,
    changed: {Core.map_read(Value, fallback, Map.put(&2, Value, hi, key, value), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, hi, query)) : Value},
    opposite: {Patricia.route(query, position) == False{} : Bool} -> {String.eq(query, key) == False{} : Bool}) ->
    {Core.map_read(Value, fallback, MNode{position, lo, Map.put(&2, Value, hi, key, value)}, query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}:
  %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, lo, Map.put(&2, Value, hi, key, value)}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, Map.put(&2, Value, hi, key, value), query), Core.map_read(Value, fallback, lo, query)),
    read_node_split(Value, fallback, position, lo, Map.put(&2, Value, hi, key, value), query)):
    {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
  %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, lo, query)),
    read_node_split(Value, fallback, position, lo, hi, query)):
    {Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, Map.put(&2, Value, hi, key, value), query), Core.map_read(Value, fallback, lo, query))
      == Bool.pick(Value, String.eq(query, key), value, _) : Value}
  right_update_selection(Value, Core.map_read(Value, fallback, lo, query), Core.map_read(Value, fallback, hi, query),
    Core.map_read(Value, fallback, Map.put(&2, Value, hi, key, value), query), value,
    String.eq(query, key), Patricia.route(query, position), changed, opposite)

def put_node_payload(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>,
    +key: String, +value: Value, +query: String, +fallback: Value, +side: Bool,
    test: {Patricia.route(key, position) == side : Bool},
    witness: {Insert.selected_choice(side, Insert.selected(Value, lo, key), Insert.selected(Value, hi, key))
      == Some{key} : Maybe<&2, String>},
    left: {Insert.selected(Value, lo, key) == Some{key} : Maybe<&2, String>} ->
      {Core.map_read(Value, fallback, Map.put(&2, Value, lo, key, value), query)
        == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, lo, query)) : Value},
    right: {Insert.selected(Value, hi, key) == Some{key} : Maybe<&2, String>} ->
      {Core.map_read(Value, fallback, Map.put(&2, Value, hi, key, value), query)
        == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, hi, query)) : Value}) ->
    {Core.map_read(Value, fallback, Map.put.go(&2, Value, MNode{position, lo, hi}, value, Tuple{key, side}), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}:
  match side:
    case False{}:
      %Equal.sym(Map<&2, Value>, Map.put.go(&2, Value, MNode{position, lo, hi}, value, Tuple{key, False{}}),
        MNode{position, Map.put(&2, Value, lo, key, value), hi}, put_node_split(Value, position, lo, hi, key, value, False{})):
        {Core.map_read(Value, fallback, _, query)
          == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
      left_node_update(Value, position, lo, hi, key, value, query, fallback, left(witness),
        query_side => Insert.opposite_key_excluded(query, key, position, False{}, query_side,
          Insert.false_side_exact(Patricia.route(key, position), test)))
    case True{}:
      %Equal.sym(Map<&2, Value>, Map.put.go(&2, Value, MNode{position, lo, hi}, value, Tuple{key, True{}}),
        MNode{position, lo, Map.put(&2, Value, hi, key, value)}, put_node_split(Value, position, lo, hi, key, value, True{})):
        {Core.map_read(Value, fallback, _, query)
          == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
      right_node_update(Value, position, lo, hi, key, value, query, fallback, right(witness),
        query_side => Insert.opposite_key_excluded(query, key, position, True{}, query_side,
          Insert.true_side_exact(Patricia.route(key, position), test)))

def put_exact(-Value: Data, tree: Map<&2, Value>, +key: String, +value: Value,
    +query: String, +fallback: Value,
    witness: {Insert.selected(Value, tree, key) == Some{key} : Maybe<&2, String>}) ->
    {Core.map_read(Value, fallback, Map.put(&2, Value, tree, key, value), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, tree, query)) : Value}:
  match tree:
    case MTip{}:
      Empty.absurd({Core.map_read(Value, fallback, Map.put(&2, Value, MTip{}, key, value), query)
        == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MTip{}, query)) : Value},
        Insert.selected_none_impossible(key, witness))
    case MLeaf{+name, +previous}: put_leaf_exact(Value, name, previous, key, value, query, fallback, witness)
    case MNode{+position, +lo, +hi}:
      %Equal.sym(String & Bool, Map.bit(key, position), Tuple{key, Patricia.route(key, position)},
        BitProof.bit_preserves_key(key, position)):
        {Core.map_read(Value, fallback, Map.put.go(&2, Value, MNode{position, lo, hi}, value, _), query)
          == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
      put_node_payload(Value, position, lo, hi, key, value, query, fallback, Patricia.route(key, position), {==}, witness,
        selected => put_exact(Value, lo, key, value, query, fallback, selected),
        selected => put_exact(Value, hi, key, value, query, fallback, selected))

def read_node_side(-Value: Data, +fallback: Value, +position: Nat,
    +lo: Map<&2, Value>, +hi: Map<&2, Value>, +query: String, +side: Bool,
    test: {Patricia.route(query, position) == side : Bool}) ->
    {Core.map_read(Value, fallback, MNode{position, lo, hi}, query)
      == Bool.pick(Value, side, Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, lo, query)) : Value}:
  Equal.trans(Value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query),
    Bool.pick(Value, Patricia.route(query, position), Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, lo, query)),
    Bool.pick(Value, side, Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, lo, query)),
    read_node_split(Value, fallback, position, lo, hi, query),
    Equal.cong(Bool, Value, choice => Bool.pick(Value, choice, Core.map_read(Value, fallback, hi, query), Core.map_read(Value, fallback, lo, query)),
      Patricia.route(query, position), side, test))

def splice_payload_side(-Value: Data, +rest: Map<&2, Value>, +position: Nat, +key: String,
    +value: Value, +query: String, +fallback: Value, +side: Bool, +query_side: Bool,
    key_test: {Patricia.route(key, position) == side : Bool},
    +query_test: {Patricia.route(query, position) == query_side : Bool},
    rest_sided: {Patricia.all_side(Value, rest, position, Bool.not(side)) == True{} : Bool}) ->
    {Core.map_read(Value, fallback, Map.ins.splice.bit(&2, Value, value, rest, position, Tuple{key, side}), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, rest, query)) : Value}:
  match side query_side:
    case False{} False{}:
      %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, MLeaf{key, value}, rest}, query),
        Core.map_read(Value, fallback, MLeaf{key, value}, query), read_node_side(Value, fallback, position, MLeaf{key, value}, rest, query, False{}, query_test)):
        {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, rest, query)) : Value}
      %Equal.sym(Value, Core.map_read(Value, fallback, rest, query), fallback,
        lookup_opposite_side(Value, fallback, rest, query, position, True{}, query_test, rest_sided)):
        {Core.map_read(Value, fallback, MLeaf{key, value}, query) == Bool.pick(Value, String.eq(query, key), value, _) : Value}
      leaf_read_exact(Value, fallback, key, value, query)
    case False{} True{}:
      %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, MLeaf{key, value}, rest}, query),
        Core.map_read(Value, fallback, rest, query), read_node_side(Value, fallback, position, MLeaf{key, value}, rest, query, True{}, query_test)):
        {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, rest, query)) : Value}
      %Equal.sym(Bool, String.eq(query, key), False{},
        Insert.opposite_key_excluded(query, key, position, False{}, query_test,
          Insert.false_side_exact(Patricia.route(key, position), key_test))):
        {Core.map_read(Value, fallback, rest, query) == Bool.pick(Value, _, value, Core.map_read(Value, fallback, rest, query)) : Value}
      {==}
    case True{} False{}:
      %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, rest, MLeaf{key, value}}, query),
        Core.map_read(Value, fallback, rest, query), read_node_side(Value, fallback, position, rest, MLeaf{key, value}, query, False{}, query_test)):
        {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, rest, query)) : Value}
      %Equal.sym(Bool, String.eq(query, key), False{},
        Insert.opposite_key_excluded(query, key, position, True{}, query_test,
          Insert.true_side_exact(Patricia.route(key, position), key_test))):
        {Core.map_read(Value, fallback, rest, query) == Bool.pick(Value, _, value, Core.map_read(Value, fallback, rest, query)) : Value}
      {==}
    case True{} True{}:
      %Equal.sym(Value, Core.map_read(Value, fallback, MNode{position, rest, MLeaf{key, value}}, query),
        Core.map_read(Value, fallback, MLeaf{key, value}, query), read_node_side(Value, fallback, position, rest, MLeaf{key, value}, query, True{}, query_test)):
        {_ == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, rest, query)) : Value}
      %Equal.sym(Value, Core.map_read(Value, fallback, rest, query), fallback,
        lookup_opposite_side(Value, fallback, rest, query, position, False{}, query_test, rest_sided)):
        {Core.map_read(Value, fallback, MLeaf{key, value}, query) == Bool.pick(Value, String.eq(query, key), value, _) : Value}
      leaf_read_exact(Value, fallback, key, value, query)

def splice_payload(-Value: Data, +rest: Map<&2, Value>, +position: Nat, +key: String,
    +value: Value, +query: String, +fallback: Value,
    rest_sided: {Patricia.all_side(Value, rest, position, Bool.not(Patricia.route(key, position))) == True{} : Bool}) ->
    {Core.map_read(Value, fallback, Map.ins.splice(&2, Value, position, key, value, rest), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, rest, query)) : Value}:
  %Equal.sym(String & Bool, Map.bit(key, position), Tuple{key, Patricia.route(key, position)}, BitProof.bit_preserves_key(key, position)):
    {Core.map_read(Value, fallback, Map.ins.splice.bit(&2, Value, value, rest, position, _), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, rest, query)) : Value}
  splice_payload_side(Value, rest, position, key, value, query, fallback,
    Patricia.route(key, position), Patricia.route(query, position), {==}, {==}, rest_sided)

# Recover the already-proved old subtree side from actual splice canonicality.
# Callers derive canonicality with existing Patricia proofs; it is not an
# additional premise of the approved whole lookup-after-set statement.
def splice_opposite_bit(-Value: Data, +rest: Map<&2, Value>, +position: Nat, +key: String,
    +value: Value, +side: Bool,
    valid: {Patricia.canonical(Value, Map.ins.splice.bit(&2, Value, value, rest, position, Tuple{key, side})) == True{} : Bool}) ->
    {Patricia.all_side(Value, rest, position, Bool.not(side)) == True{} : Bool}:
  match side:
    case False{}: Insert.node_right_side(Value, position, MLeaf{key, value}, rest, valid)
    case True{}: Insert.node_left_side(Value, position, rest, MLeaf{key, value}, valid)

def splice_opposite(-Value: Data, +rest: Map<&2, Value>, +position: Nat, +key: String,
    +value: Value,
    valid: {Patricia.canonical(Value, Map.ins.splice(&2, Value, position, key, value, rest)) == True{} : Bool}) ->
    {Patricia.all_side(Value, rest, position, Bool.not(Patricia.route(key, position))) == True{} : Bool}:
  splice_opposite_bit(Value, rest, position, key, value, Patricia.route(key, position),
    %BitProof.bit_preserves_key(key, position):
      {Patricia.canonical(Value, Map.ins.splice.bit(&2, Value, value, rest, position, _)) == True{} : Bool}
    valid)

def splice_payload_canonical(-Value: Data, +rest: Map<&2, Value>, +position: Nat, +key: String,
    +value: Value, +query: String, +fallback: Value,
    valid: {Patricia.canonical(Value, Map.ins.splice(&2, Value, position, key, value, rest)) == True{} : Bool}) ->
    {Core.map_read(Value, fallback, Map.ins.splice(&2, Value, position, key, value, rest), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, rest, query)) : Value}:
  splice_payload(Value, rest, position, key, value, query, fallback,
    splice_opposite(Value, rest, position, key, value, valid))

def ins_node_split(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>,
    +key: String, +value: Value, +split: Nat, +side: Bool) ->
    {Map.ins.go(&2, Value, MNode{position, lo, hi}, value, split, Tuple{key, side}, True{})
      == Bool.pick(Map<&2, Value>, side,
        MNode{position, lo, Map.ins(&2, Value, hi, key, value, split)},
        MNode{position, Map.ins(&2, Value, lo, key, value, split), hi}) : Map<&2, Value>}:
  match lo hi side:
    case MTip{} _ False{}: {==}
    case MLeaf{_, _} _ False{}: {==}
    case MNode{_, _, _} _ False{}: {==}
    case _ MTip{} True{}: {==}
    case _ MLeaf{_, _} True{}: {==}
    case _ MNode{_, _, _} True{}: {==}

def ins_above_split(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>,
    +key: String, +value: Value, +split: Nat, +side: Bool) ->
    {Map.ins.go(&2, Value, MNode{position, lo, hi}, value, split, Tuple{key, side}, False{})
      == Map.ins.splice(&2, Value, split, key, value, MNode{position, lo, hi}) : Map<&2, Value>}:
  match lo hi side:
    case MTip{} _ False{}: {==}
    case MLeaf{_, _} _ False{}: {==}
    case MNode{_, _, _} _ False{}: {==}
    case _ MTip{} True{}: {==}
    case _ MLeaf{_, _} True{}: {==}
    case _ MNode{_, _, _} True{}: {==}

def ins_node_payload(-Value: Data, +position: Nat, +lo: Map<&2, Value>, +hi: Map<&2, Value>,
    +key: String, +value: Value, +old: String, +query: String, +fallback: Value, +side: Bool, +deeper: Bool,
    test: {Patricia.route(key, position) == side : Bool},
    depth_test: {Nat.is_lt(position, Map.diff(key, old)) == deeper : Bool},
    witness: {Insert.selected_choice(side, Insert.selected(Value, lo, key), Insert.selected(Value, hi, key))
      == Some{old} : Maybe<&2, String>},
    +distinct: {String.eq(key, old) == False{} : Bool},
    +valid: {Patricia.canonical(Value, MNode{position, lo, hi}) == True{} : Bool},
    left: {Insert.selected(Value, lo, key) == Some{old} : Maybe<&2, String>} ->
      {Core.map_read(Value, fallback, Map.ins(&2, Value, lo, key, value, Map.diff(key, old)), query)
        == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, lo, query)) : Value},
    right: {Insert.selected(Value, hi, key) == Some{old} : Maybe<&2, String>} ->
      {Core.map_read(Value, fallback, Map.ins(&2, Value, hi, key, value, Map.diff(key, old)), query)
        == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, hi, query)) : Value}) ->
    {Core.map_read(Value, fallback, Map.ins.go(&2, Value, MNode{position, lo, hi}, value, Map.diff(key, old), Tuple{key, side}, deeper), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}:
  match side deeper:
    case side False{}:
      +actual: {Insert.selected(Value, MNode{position, lo, hi}, key) == Some{old} : Maybe<&2, String>} =
        Insert.selected_node_from_test(Value, position, lo, hi, key, old, side, test, witness)
      %Equal.sym(Map<&2, Value>, Map.ins.go(&2, Value, MNode{position, lo, hi}, value, Map.diff(key, old), Tuple{key, side}, False{}),
        Map.ins.splice(&2, Value, Map.diff(key, old), key, value, MNode{position, lo, hi}),
        ins_above_split(Value, position, lo, hi, key, value, Map.diff(key, old), side)):
        {Core.map_read(Value, fallback, _, query)
          == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
      splice_payload_canonical(Value, MNode{position, lo, hi}, Map.diff(key, old), key, value, query, fallback,
        Insert.above_node_splice_canonical(Value, position, lo, hi, key, value, old, actual, distinct,
          Insert.split_before_node(Value, position, lo, hi, key, old, actual, distinct, valid, depth_test), valid))
    case False{} True{}:
      %Equal.sym(Map<&2, Value>, Map.ins.go(&2, Value, MNode{position, lo, hi}, value, Map.diff(key, old), Tuple{key, False{}}, True{}),
        MNode{position, Map.ins(&2, Value, lo, key, value, Map.diff(key, old)), hi},
        ins_node_split(Value, position, lo, hi, key, value, Map.diff(key, old), False{})):
        {Core.map_read(Value, fallback, _, query)
          == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
      left_child_update(Value, position, lo, hi, Map.ins(&2, Value, lo, key, value, Map.diff(key, old)),
        key, value, query, fallback, left(witness),
        query_side => Insert.opposite_key_excluded(query, key, position, False{}, query_side,
          Insert.false_side_exact(Patricia.route(key, position), test)))
    case True{} True{}:
      %Equal.sym(Map<&2, Value>, Map.ins.go(&2, Value, MNode{position, lo, hi}, value, Map.diff(key, old), Tuple{key, True{}}, True{}),
        MNode{position, lo, Map.ins(&2, Value, hi, key, value, Map.diff(key, old))},
        ins_node_split(Value, position, lo, hi, key, value, Map.diff(key, old), True{})):
        {Core.map_read(Value, fallback, _, query)
          == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
      right_child_update(Value, position, lo, hi, Map.ins(&2, Value, hi, key, value, Map.diff(key, old)),
        key, value, query, fallback, right(witness),
        query_side => Insert.opposite_key_excluded(query, key, position, True{}, query_side,
          Insert.true_side_exact(Patricia.route(key, position), test)))

def ins_payload(-Value: Data, tree: Map<&2, Value>, +key: String, +value: Value, +old: String,
    +query: String, +fallback: Value,
    witness: {Insert.selected(Value, tree, key) == Some{old} : Maybe<&2, String>},
    +distinct: {String.eq(key, old) == False{} : Bool},
    +valid: {Patricia.canonical(Value, tree) == True{} : Bool}) ->
    {Core.map_read(Value, fallback, Map.ins(&2, Value, tree, key, value, Map.diff(key, old)), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, tree, query)) : Value}:
  match tree:
    case MTip{}:
      Empty.absurd({Core.map_read(Value, fallback, Map.ins(&2, Value, MTip{}, key, value, Map.diff(key, old)), query)
        == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MTip{}, query)) : Value},
        Insert.selected_none_impossible(old, witness))
    case MLeaf{+name, +previous}:
      +same: {name == old : String} = Equal.cong(Maybe<&2, String>, String,
        found => Maybe.default(&2, String, found, ""), Some{name}, Some{old}, witness)
      %same:
        {Core.map_read(Value, fallback, Map.ins(&2, Value, MLeaf{name, previous}, key, value, Map.diff(key, _)), query)
          == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MLeaf{name, previous}, query)) : Value}
      splice_payload_canonical(Value, MLeaf{name, previous}, Map.diff(key, name), key, value, query, fallback,
        Insert.leaf_splice_canonical(Value, name, previous, key, value,
          %Equal.sym(String, name, old, same): {String.eq(key, _) == False{} : Bool}
          distinct))
    case MNode{+position, +lo, +hi}:
      %Equal.sym(String & Bool, Map.bit(key, position), Tuple{key, Patricia.route(key, position)},
        BitProof.bit_preserves_key(key, position)):
        {Core.map_read(Value, fallback, Map.ins.go(&2, Value, MNode{position, lo, hi}, value, Map.diff(key, old), _, Nat.is_lt(position, Map.diff(key, old))), query)
          == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, MNode{position, lo, hi}, query)) : Value}
      ins_node_payload(Value, position, lo, hi, key, value, old, query, fallback,
        Patricia.route(key, position), Nat.is_lt(position, Map.diff(key, old)), {==}, {==}, witness, distinct, valid,
        selected => ins_payload(Value, lo, key, value, old, query, fallback, selected, distinct,
          Insert.node_left_canonical(Value, position, lo, hi, valid)),
        selected => ins_payload(Value, hi, key, value, old, query, fallback, selected, distinct,
          Insert.node_right_canonical(Value, position, lo, hi, valid)))

def comparison_at(+key: String, +old: String, +order: Cmp,
    test: {Insert.comparison_order(String.cmp(key, old)) == order : Cmp}) ->
    {String.eq(key, old) == Cmp.is_eq(order) : Bool}:
  Equal.trans(Bool, String.eq(key, old), Cmp.is_eq(Insert.comparison_order(String.cmp(key, old))), Cmp.is_eq(order),
    Insert.comparison_equality_exact(key, old),
    Equal.cong(Cmp, Bool, Cmp.is_eq, Insert.comparison_order(String.cmp(key, old)), order, test))

def set_order_payload(-Value: Data, +tree: Map<&2, Value>, +key: String, +value: Value, +old: String,
    +query: String, +fallback: Value, +order: Cmp,
    test: {Insert.comparison_order(String.cmp(key, old)) == order : Cmp},
    witness: {Insert.selected(Value, tree, key) == Some{old} : Maybe<&2, String>},
    valid: {Patricia.canonical(Value, tree) == True{} : Bool}) ->
    {Core.map_read(Value, fallback, Map.set.fin.go(&2, Value, tree, key, value, Tuple{Tuple{key, old}, order}), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, tree, query)) : Value}:
  match order:
    case EQ{}:
      same: {key == old : String} = StringFacts.eq_of_eq_true(key, old, comparison_at(key, old, EQ{}, test))
      put_exact(Value, tree, key, value, query, fallback,
        %Equal.sym(String, key, old, same): {Insert.selected(Value, tree, key) == Some{_} : Maybe<&2, String>}
        witness)
    case LT{}:
      ins_payload(Value, tree, key, value, old, query, fallback, witness, comparison_at(key, old, LT{}, test), valid)
    case GT{}:
      ins_payload(Value, tree, key, value, old, query, fallback, witness, comparison_at(key, old, GT{}, test), valid)

def set_fin_payload(-Value: Data, +tree: Map<&2, Value>, +key: String, +value: Value, +old: String,
    +query: String, +fallback: Value,
    witness: {Insert.selected(Value, tree, key) == Some{old} : Maybe<&2, String>},
    valid: {Patricia.canonical(Value, tree) == True{} : Bool}) ->
    {Core.map_read(Value, fallback, Map.set.fin(&2, Value, tree, key, value, key, old), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, tree, query)) : Value}:
  %Equal.sym((String & String) & Cmp, String.cmp(key, old),
    Tuple{Tuple{key, old}, Insert.comparison_order(String.cmp(key, old))}, Insert.comparison_preserves_keys(key, old)):
    {Core.map_read(Value, fallback, Map.set.fin.go(&2, Value, tree, key, value, _), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, tree, query)) : Value}
  set_order_payload(Value, tree, key, value, old, query, fallback, Insert.comparison_order(String.cmp(key, old)), {==}, witness, valid)

def set_found_payload(-Value: Data, +found: Maybe<&2, String>, +tree: Map<&2, Value>,
    +key: String, +value: Value, +query: String, +fallback: Value,
    witness: {Insert.selected(Value, tree, key) == found : Maybe<&2, String>},
    valid: {Patricia.canonical(Value, tree) == True{} : Bool}) ->
    {Core.map_read(Value, fallback, Map.set.go(&2, Value, value, Tuple{tree, Tuple{key, found}}), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, tree, query)) : Value}:
  match found:
    case None{}:
      %Equal.sym(Value, Core.map_read(Value, fallback, tree, query), fallback,
        lookup_absent(Value, fallback, tree, query,
          Insert.selected_none_no_leaves(Value, tree, key, query, witness, valid))):
        {Core.map_read(Value, fallback, MLeaf{key, value}, query) == Bool.pick(Value, String.eq(query, key), value, _) : Value}
      leaf_read_exact(Value, fallback, key, value, query)
    case Some{old}: set_fin_payload(Value, tree, key, value, old, query, fallback, witness, valid)

law lookup_after_set:
  for -Value: Data
  for +tree: Map<&2, Value>
  for +key: String
  for +query: String
  for +value: Value
  for +fallback: Value
  for valid: {Patricia.canonical(Value, tree) == True{} : Bool}
  {Core.map_read(Value, fallback, Map.set(&2, Value, tree, key, value), query)
    == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, tree, query))
    : Value}

def lookup_after_set(Value, tree, key, query, value, fallback, valid):
  %Equal.sym(Map<&2, Value> & String & Maybe<&2, String>, Map.seek(&2, Value, tree, key),
    Tuple{tree, Tuple{key, Insert.selected(Value, tree, key)}}, Insert.seek_exact(Value, tree, key)):
    {Core.map_read(Value, fallback, Map.set.go(&2, Value, value, _), query)
      == Bool.pick(Value, String.eq(query, key), value, Core.map_read(Value, fallback, tree, query)) : Value}
  set_found_payload(Value, Insert.selected(Value, tree, key), tree, key, value, query, fallback, {==}, valid)

def main() -> Unit:
  Unit{}
