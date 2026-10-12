import Base
import ./PATRICIA_RELATION.bend as Patricia
import ./PATRICIA_BIT_PROOF.bend as BitProof
import ./PATRICIA_DIFF_PROOF.bend as DiffProof
import ../INTERPRETER_BOOL_FACTS.bend as BoolFacts
import ../INTERPRETER_NAT_FACTS.bend as NatFacts
import ../INTERPRETER_STRING_FACTS.bend as StringFacts
import ./PATRICIA_INSERT_PROOF.bend as Insert

# Sole owner of the existing membership proof; canonical insertion remains
# in PATRICIA_INSERT_PROOF. Statements and proof terms are moved unchanged
# except qualification of shared canonical facts. No new law is introduced.

def seek_empty(-V: Data, +key: String) -> {
  Map.seek(&2, V, MTip{}, key)
  == Tuple{MTip{}, Tuple{key, None{}}}
  : Map<&2, V> & String & Maybe<&2, String>
}:
  {==}

def seek_leaf(-V: Data, +name: String, +value: V, +key: String) -> {
  Map.seek(&2, V, MLeaf{name, value}, key)
  == Tuple{MLeaf{name, value}, Tuple{key, Some{name}}}
  : Map<&2, V> & String & Maybe<&2, String>
}:
  {==}

def selected_equal(found: Maybe<&2, String>, key: String) -> Bool:
  match found:
    case None{}: False{}
    case Some{old}: String.eq(key, old)

def has_leaf_exact(-V: Data, +name: String, +value: V, +key: String) -> {
  Map.has(&2, V, MLeaf{name, value}, key)
  == Tuple{MLeaf{name, value}, String.eq(key, name)}
  : Map<&2, V> & Bool
}:
  %Equal.sym(
    (String & String) & Cmp,
    String.cmp(key, name),
    Tuple{Tuple{key, name}, Insert.comparison_order(String.cmp(key, name))},
    Insert.comparison_preserves_keys(key, name)
  ):
    {
      Map.has.leaf(&2, V, value, _)
      == Tuple{MLeaf{name, value}, String.eq(key, name)}
      : Map<&2, V> & Bool
    }
  build : Bool -> Map<&2, V> & Bool = result => Tuple{MLeaf{name, value}, result}
  Equal.cong(
    Bool,
    Map<&2, V> & Bool,
    build,
    Cmp.is_eq(Insert.comparison_order(String.cmp(key, name))),
    String.eq(key, name),
    Equal.sym(
      Bool,
      String.eq(key, name),
      Cmp.is_eq(Insert.comparison_order(String.cmp(key, name))),
      Insert.comparison_equality_exact(key, name)
    )
  )

def has_node_exact(
  -V: Data,
  +position: Nat,
  +lo: Map<&2, V>,
  +hi: Map<&2, V>,
  +key: String,
  side: Bool,
  left: {
    Map.has(&2, V, lo, key)
    == Tuple{lo, selected_equal(Insert.selected(V, lo, key), key)}
    : Map<&2, V> & Bool
  },
  right: {
    Map.has(&2, V, hi, key)
    == Tuple{hi, selected_equal(Insert.selected(V, hi, key), key)}
    : Map<&2, V> & Bool
  }
) -> {
    Map.has.go(&2, V, MNode{position, lo, hi}, Tuple{key, side})
    == Tuple{
      MNode{position, lo, hi},
      selected_equal(Insert.selected_choice(side, Insert.selected(V, lo, key), Insert.selected(V, hi, key)), key)
    }
    : Map<&2, V> & Bool
  }:
  match lo hi side:
    case MTip{} hi False{}: {==}
    case MLeaf{name, value} hi False{}:
      %Equal.sym(
        Map<&2, V> & Bool,
        Map.has(&2, V, MLeaf{name, value}, key),
        Tuple{MLeaf{name, value}, selected_equal(Insert.selected(V, MLeaf{name, value}, key), key)},
        left
      ):
        {
          Map.lo(&2, V, Bool, position, hi, _)
          == Tuple{
            MNode{position, MLeaf{name, value}, hi},
            selected_equal(Insert.selected(V, MLeaf{name, value}, key), key)
          }
          : Map<&2, V> & Bool
        }
      {==}
    case MNode{branch, a, b} hi False{}:
      %Equal.sym(
        Map<&2, V> & Bool,
        Map.has(&2, V, MNode{branch, a, b}, key),
        Tuple{MNode{branch, a, b}, selected_equal(Insert.selected(V, MNode{branch, a, b}, key), key)},
        left
      ):
        {
          Map.lo(&2, V, Bool, position, hi, _)
          == Tuple{
            MNode{position, MNode{branch, a, b}, hi},
            selected_equal(Insert.selected(V, MNode{branch, a, b}, key), key)
          }
          : Map<&2, V> & Bool
        }
      {==}
    case lo MTip{} True{}: {==}
    case lo MLeaf{name, value} True{}:
      %Equal.sym(
        Map<&2, V> & Bool,
        Map.has(&2, V, MLeaf{name, value}, key),
        Tuple{MLeaf{name, value}, selected_equal(Insert.selected(V, MLeaf{name, value}, key), key)},
        right
      ):
        {
          Map.hi(&2, V, Bool, position, lo, _)
          == Tuple{
            MNode{position, lo, MLeaf{name, value}},
            selected_equal(Insert.selected(V, MLeaf{name, value}, key), key)
          }
          : Map<&2, V> & Bool
        }
      {==}
    case lo MNode{branch, a, b} True{}:
      %Equal.sym(
        Map<&2, V> & Bool,
        Map.has(&2, V, MNode{branch, a, b}, key),
        Tuple{MNode{branch, a, b}, selected_equal(Insert.selected(V, MNode{branch, a, b}, key), key)},
        right
      ):
        {
          Map.hi(&2, V, Bool, position, lo, _)
          == Tuple{
            MNode{position, lo, MNode{branch, a, b}},
            selected_equal(Insert.selected(V, MNode{branch, a, b}, key), key)
          }
          : Map<&2, V> & Bool
        }
      {==}

def has_exact(-V: Data, tree: Map<&2, V>, +key: String) -> {
  Map.has(&2, V, tree, key)
  == Tuple{tree, selected_equal(Insert.selected(V, tree, key), key)}
  : Map<&2, V> & Bool
}:
  match tree:
    case MTip{}: {==}
    case MLeaf{name, value}: has_leaf_exact(V, name, value, key)
    case MNode{+position, +lo, +hi}:
      %Equal.sym(
        String & Bool,
        Map.bit(key, position),
        Tuple{key, Patricia.route(key, position)},
        BitProof.bit_preserves_key(key, position)
      ):
        {
          Map.has.go(&2, V, MNode{position, lo, hi}, _)
          == Tuple{
            MNode{position, lo, hi},
            selected_equal(Insert.selected(V, MNode{position, lo, hi}, key), key)
          }
          : Map<&2, V> & Bool
        }
      has_node_exact(
        V,
        position,
        lo,
        hi,
        key,
        Patricia.route(key, position),
        has_exact(V, lo, key),
        has_exact(V, hi, key)
      )

# Proof-only structural leaf membership; production lookup remains actual Map.has.
def canonical_selected_node_membership(
  -V: Data,
  +position: Nat,
  +lo: Map<&2, V>,
  +hi: Map<&2, V>,
  +query: String,
  side: Bool,
  test: {Patricia.route(query, position) == side : Bool},
  valid: {Patricia.canonical(V, MNode{position, lo, hi}) == True{} : Bool},
  left: {selected_equal(Insert.selected(V, lo, query), query) == Insert.leaf_exists(V, lo, query) : Bool},
  right: {selected_equal(Insert.selected(V, hi, query), query) == Insert.leaf_exists(V, hi, query) : Bool}
) -> {
  selected_equal(Insert.selected_choice(side, Insert.selected(V, lo, query), Insert.selected(V, hi, query)), query)
    == Bool.or(Insert.leaf_exists(V, lo, query), Insert.leaf_exists(V, hi, query)) : Bool
}:
  match side:
    case False{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, hi, query),
        False{},
        Insert.all_side_excludes(
          V,
          hi,
          query,
          position,
          True{},
          test,
          Insert.node_right_side(V, position, lo, hi, valid)
        )
      ):
        {
          selected_equal(Insert.selected(V, lo, query), query)
          == Bool.or(Insert.leaf_exists(V, lo, query), _)
          : Bool
        }
      Equal.trans(
        Bool,
        selected_equal(Insert.selected(V, lo, query), query),
        Insert.leaf_exists(V, lo, query),
        Bool.or(Insert.leaf_exists(V, lo, query), False{}),
        left,
        Equal.sym(
          Bool,
          Bool.or(Insert.leaf_exists(V, lo, query), False{}),
          Insert.leaf_exists(V, lo, query),
          BoolFacts.or_false(Insert.leaf_exists(V, lo, query))
        )
      )
    case True{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, lo, query),
        False{},
        Insert.all_side_excludes(
          V,
          lo,
          query,
          position,
          False{},
          test,
          Insert.node_left_side(V, position, lo, hi, valid)
        )
      ):
        {
          selected_equal(Insert.selected(V, hi, query), query)
          == Bool.or(_, Insert.leaf_exists(V, hi, query))
          : Bool
        }
      right

def canonical_selected_membership(-V: Data, tree: Map<&2, V>, +query: String,
  +valid: {Patricia.canonical(V, tree) == True{} : Bool}) -> {
  selected_equal(Insert.selected(V, tree, query), query) == Insert.leaf_exists(V, tree, query) : Bool
}:
  match tree:
    case MTip{}: {==}
    case MLeaf{name, value}: {==}
    case MNode{+position, +lo, +hi}:
      canonical_selected_node_membership(
        V,
        position,
        lo,
        hi,
        query,
        Patricia.route(query, position),
        {==},
        valid,
        canonical_selected_membership(
          V,
          lo,
          query,
          Insert.node_left_canonical(V, position, lo, hi, valid)
        ),
        canonical_selected_membership(
          V,
          hi,
          query,
          Insert.node_right_canonical(V, position, lo, hi, valid)
        )
      )

def or_middle_front(+a: Bool, +b: Bool, +c: Bool) -> {
  Bool.or(a, Bool.or(b, c)) == Bool.or(b, Bool.or(a, c)) : Bool
}:
  match a b:
    case False{} b: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}

def splice_leaf_union_side(
  -V: Data,
  +tree: Map<&2, V>,
  +key: String,
  +value: V,
  +position: Nat,
  +query: String,
  side: Bool
) -> {
  Insert.leaf_exists(V, Map.ins.splice.bit(&2, V, value, tree, position, Tuple{key, side}), query)
    == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query)) : Bool
}:
  match side:
    case False{}: {==}
    case True{}: BoolFacts.or_comm(Insert.leaf_exists(V, tree, query), String.eq(query, key))

def splice_leaf_union(
  -V: Data,
  +tree: Map<&2, V>,
  +key: String,
  +value: V,
  +position: Nat,
  +query: String
) -> {
  Insert.leaf_exists(V, Map.ins.splice(&2, V, position, key, value, tree), query)
    == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query)) : Bool
}:
  %Equal.sym(
    String & Bool,
    Map.bit(key, position),
    Tuple{key, Patricia.route(key, position)},
    BitProof.bit_preserves_key(key, position)
  ):
    {Insert.leaf_exists(V, Map.ins.splice.bit(&2, V, value, tree, position, _), query)
      == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query)) : Bool}
  splice_leaf_union_side(V, tree, key, value, position, query, Patricia.route(key, position))

def insertion_leaf_union_node(
  -V: Data,
  +branch: Nat,
  +lo: Map<&2, V>,
  +hi: Map<&2, V>,
  +key: String,
  +value: V,
  +position: Nat,
  +query: String,
  side: Bool,
  deeper: Bool,
  left: {
    Insert.leaf_exists(V, Map.ins(&2, V, lo, key, value, position), query)
    == Bool.or(String.eq(query, key), Insert.leaf_exists(V, lo, query))
    : Bool
  },
  right: {
    Insert.leaf_exists(V, Map.ins(&2, V, hi, key, value, position), query)
    == Bool.or(String.eq(query, key), Insert.leaf_exists(V, hi, query))
    : Bool
  }
) -> {
    Insert.leaf_exists(
      V,
      Map.ins.go(&2, V, MNode{branch, lo, hi}, value, position, Tuple{key, side}, deeper),
      query
    )
    == Bool.or(String.eq(query, key), Insert.leaf_exists(V, MNode{branch, lo, hi}, query))
    : Bool
  }:
  match lo hi side deeper:
    case lo hi side False{}: splice_leaf_union(
      V,
      MNode{branch, lo, hi},
      key,
      value,
      position,
      query
    )
    case MTip{} hi False{} True{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, Map.ins(&2, V, MTip{}, key, value, position), query),
        Bool.or(String.eq(query, key), Insert.leaf_exists(V, MTip{}, query)),
        left
      ):
        {
          Bool.or(_, Insert.leaf_exists(V, hi, query))
          == Bool.or(
            String.eq(query, key),
            Bool.or(Insert.leaf_exists(V, MTip{}, query), Insert.leaf_exists(V, hi, query))
          )
          : Bool
        }
      BoolFacts.or_assoc(
        String.eq(query, key),
        Insert.leaf_exists(V, MTip{}, query),
        Insert.leaf_exists(V, hi, query)
      )
    case MLeaf{name, previous} hi False{} True{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, Map.ins(&2, V, MLeaf{name, previous}, key, value, position), query),
        Bool.or(String.eq(query, key), Insert.leaf_exists(V, MLeaf{name, previous}, query)),
        left
      ):
        {
          Bool.or(_, Insert.leaf_exists(V, hi, query))
          == Bool.or(
            String.eq(query, key),
            Bool.or(Insert.leaf_exists(V, MLeaf{name, previous}, query), Insert.leaf_exists(V, hi, query))
          )
          : Bool
        }
      BoolFacts.or_assoc(
        String.eq(query, key),
        Insert.leaf_exists(V, MLeaf{name, previous}, query),
        Insert.leaf_exists(V, hi, query)
      )
    case MNode{q, a, b} hi False{} True{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, Map.ins(&2, V, MNode{q, a, b}, key, value, position), query),
        Bool.or(String.eq(query, key), Insert.leaf_exists(V, MNode{q, a, b}, query)),
        left
      ):
        {
          Bool.or(_, Insert.leaf_exists(V, hi, query))
          == Bool.or(
            String.eq(query, key),
            Bool.or(Insert.leaf_exists(V, MNode{q, a, b}, query), Insert.leaf_exists(V, hi, query))
          )
          : Bool
        }
      BoolFacts.or_assoc(
        String.eq(query, key),
        Insert.leaf_exists(V, MNode{q, a, b}, query),
        Insert.leaf_exists(V, hi, query)
      )
    case lo MTip{} True{} True{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, Map.ins(&2, V, MTip{}, key, value, position), query),
        Bool.or(String.eq(query, key), Insert.leaf_exists(V, MTip{}, query)),
        right
      ):
        {
          Bool.or(Insert.leaf_exists(V, lo, query), _)
          == Bool.or(
            String.eq(query, key),
            Bool.or(Insert.leaf_exists(V, lo, query), Insert.leaf_exists(V, MTip{}, query))
          )
          : Bool
        }
      or_middle_front(
        Insert.leaf_exists(V, lo, query),
        String.eq(query, key),
        Insert.leaf_exists(V, MTip{}, query)
      )
    case lo MLeaf{name, previous} True{} True{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, Map.ins(&2, V, MLeaf{name, previous}, key, value, position), query),
        Bool.or(String.eq(query, key), Insert.leaf_exists(V, MLeaf{name, previous}, query)),
        right
      ):
        {
          Bool.or(Insert.leaf_exists(V, lo, query), _)
          == Bool.or(
            String.eq(query, key),
            Bool.or(Insert.leaf_exists(V, lo, query), Insert.leaf_exists(V, MLeaf{name, previous}, query))
          )
          : Bool
        }
      or_middle_front(
        Insert.leaf_exists(V, lo, query),
        String.eq(query, key),
        Insert.leaf_exists(V, MLeaf{name, previous}, query)
      )
    case lo MNode{q, a, b} True{} True{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, Map.ins(&2, V, MNode{q, a, b}, key, value, position), query),
        Bool.or(String.eq(query, key), Insert.leaf_exists(V, MNode{q, a, b}, query)),
        right
      ):
        {
          Bool.or(Insert.leaf_exists(V, lo, query), _)
          == Bool.or(
            String.eq(query, key),
            Bool.or(Insert.leaf_exists(V, lo, query), Insert.leaf_exists(V, MNode{q, a, b}, query))
          )
          : Bool
        }
      or_middle_front(
        Insert.leaf_exists(V, lo, query),
        String.eq(query, key),
        Insert.leaf_exists(V, MNode{q, a, b}, query)
      )

def insertion_leaf_union(
  -V: Data,
  tree: Map<&2, V>,
  +key: String,
  +value: V,
  +position: Nat,
  +query: String
) -> {
  Insert.leaf_exists(V, Map.ins(&2, V, tree, key, value, position), query)
  == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query))
  : Bool
}:
  match tree:
    case MTip{}: BoolFacts.or_false_sym(String.eq(query, key))
    case MLeaf{name, previous}: splice_leaf_union(
      V,
      MLeaf{name, previous},
      key,
      value,
      position,
      query
    )
    case MNode{+branch, +lo, +hi}:
      %Equal.sym(
        String & Bool,
        Map.bit(key, branch),
        Tuple{key, Patricia.route(key, branch)},
        BitProof.bit_preserves_key(key, branch)
      ):
        {
          Insert.leaf_exists(
            V,
            Map.ins.go(
              &2,
              V,
              MNode{branch, lo, hi},
              value,
              position,
              _,
              Nat.is_lt(branch, position)
            ),
            query
          )
          == Bool.or(String.eq(query, key), Insert.leaf_exists(V, MNode{branch, lo, hi}, query))
          : Bool
        }
      insertion_leaf_union_node(
        V,
        branch,
        lo,
        hi,
        key,
        value,
        position,
        query,
        Patricia.route(key, branch),
        Nat.is_lt(branch, position),
        insertion_leaf_union(V, lo, key, value, position, query),
        insertion_leaf_union(V, hi, key, value, position, query)
      )

def put_leaf_membership_node(
  -V: Data,
  +position: Nat,
  +lo: Map<&2, V>,
  +hi: Map<&2, V>,
  +key: String,
  +value: V,
  +query: String,
  side: Bool,
  left_present: {Patricia.nonempty(V, lo) == True{} : Bool},
  right_present: {Patricia.nonempty(V, hi) == True{} : Bool},
  left: {Insert.leaf_exists(V, Map.put(&2, V, lo, key, value), query) == Insert.leaf_exists(V, lo, query) : Bool},
  right: {Insert.leaf_exists(V, Map.put(&2, V, hi, key, value), query) == Insert.leaf_exists(V, hi, query) : Bool}
) -> {
  Insert.leaf_exists(V, Map.put.go(&2, V, MNode{position, lo, hi}, value, Tuple{key, side}), query)
    == Insert.leaf_exists(V, MNode{position, lo, hi}, query) : Bool
}:
  match lo hi side:
    case MTip{} hi False{}:
      Empty.absurd(
        {
          Insert.leaf_exists(
            V,
            Map.put.go(&2, V, MNode{position, MTip{}, hi}, value, Tuple{key, False{}}),
            query
          )
          == Insert.leaf_exists(V, MNode{position, MTip{}, hi}, query)
          : Bool
        },
        Insert.false_true_impossible(left_present)
      )
    case MLeaf{name, previous} hi False{}: {==}
    case MNode{branch, a, b} hi False{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, Map.put(&2, V, MNode{branch, a, b}, key, value), query),
        Insert.leaf_exists(V, MNode{branch, a, b}, query),
        left
      ):
        {
          Bool.or(_, Insert.leaf_exists(V, hi, query))
          == Bool.or(Insert.leaf_exists(V, MNode{branch, a, b}, query), Insert.leaf_exists(V, hi, query))
          : Bool
        }
      {==}
    case lo MTip{} True{}:
      Empty.absurd(
        {
          Insert.leaf_exists(
            V,
            Map.put.go(&2, V, MNode{position, lo, MTip{}}, value, Tuple{key, True{}}),
            query
          )
          == Insert.leaf_exists(V, MNode{position, lo, MTip{}}, query)
          : Bool
        },
        Insert.false_true_impossible(right_present)
      )
    case lo MLeaf{name, previous} True{}: {==}
    case lo MNode{branch, a, b} True{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, Map.put(&2, V, MNode{branch, a, b}, key, value), query),
        Insert.leaf_exists(V, MNode{branch, a, b}, query),
        right
      ):
        {
          Bool.or(Insert.leaf_exists(V, lo, query), _)
          == Bool.or(Insert.leaf_exists(V, lo, query), Insert.leaf_exists(V, MNode{branch, a, b}, query))
          : Bool
        }
      {==}

def put_leaf_membership(-V: Data, tree: Map<&2, V>, +key: String, +value: V, +query: String,
  +valid: {Patricia.canonical(V, tree) == True{} : Bool},
  present: {Patricia.nonempty(V, tree) == True{} : Bool}) -> {
  Insert.leaf_exists(V, Map.put(&2, V, tree, key, value), query) == Insert.leaf_exists(V, tree, query) : Bool
}:
  match tree:
    case MTip{}:
      Empty.absurd({String.eq(query, key) == False{} : Bool}, Insert.false_true_impossible(present))
    case MLeaf{name, previous}: {==}
    case MNode{+position, +lo, +hi}:
      +lp = Insert.node_left_nonempty(V, position, lo, hi, valid)
      +rp = Insert.node_right_nonempty(V, position, lo, hi, valid)
      %Equal.sym(
        String & Bool,
        Map.bit(key, position),
        Tuple{key, Patricia.route(key, position)},
        BitProof.bit_preserves_key(key, position)
      ):
        {
          Insert.leaf_exists(V, Map.put.go(&2, V, MNode{position, lo, hi}, value, _), query)
          == Insert.leaf_exists(V, MNode{position, lo, hi}, query)
          : Bool
        }
      put_leaf_membership_node(
        V,
        position,
        lo,
        hi,
        key,
        value,
        query,
        Patricia.route(key, position),
        lp,
        rp,
        put_leaf_membership(
          V,
          lo,
          key,
          value,
          query,
          Insert.node_left_canonical(V, position, lo, hi, valid),
          lp
        ),
        put_leaf_membership(
          V,
          hi,
          key,
          value,
          query,
          Insert.node_right_canonical(V, position, lo, hi, valid),
          rp
        )
      )

def selected_nonempty(-V: Data, tree: Map<&2, V>, +key: String, +old: String,
  witness: {Insert.selected(V, tree, key) == Some{old} : Maybe<&2, String>}) -> {
  Patricia.nonempty(V, tree) == True{} : Bool
}:
  match tree:
    case MTip{}: Empty.absurd({False{} == True{} : Bool}, Insert.selected_none_impossible(old, witness))
    case MLeaf{name, previous}: {==}
    case MNode{position, lo, hi}: {==}

def selected_key_present(-V: Data, +tree: Map<&2, V>, +key: String, +old: String,
  witness: {Insert.selected(V, tree, key) == Some{old} : Maybe<&2, String>},
  equal: {String.eq(key, old) == True{} : Bool},
  valid: {Patricia.canonical(V, tree) == True{} : Bool}) -> {
  Insert.leaf_exists(V, tree, key) == True{} : Bool
}:
  +routing = canonical_selected_membership(V, tree, key, valid)
  projection : Maybe<&2, String> -> Bool = found => selected_equal(found, key)
  Equal.trans(
    Bool,
    Insert.leaf_exists(V, tree, key),
    selected_equal(Insert.selected(V, tree, key), key),
    True{},
    Equal.sym(
      Bool,
      selected_equal(Insert.selected(V, tree, key), key),
      Insert.leaf_exists(V, tree, key),
      routing
    ),
    Equal.trans(
      Bool,
      selected_equal(Insert.selected(V, tree, key), key),
      String.eq(key, old),
      True{},
      Equal.cong(Maybe<&2, String>, Bool, projection, Insert.selected(V, tree, key), Some{old}, witness),
      equal
    )
  )

def member_absorbs_test(-V: Data, +tree: Map<&2, V>, +key: String, +query: String, same: Bool,
  test: {String.eq(query, key) == same : Bool},
  present: {Insert.leaf_exists(V, tree, key) == True{} : Bool}) -> {
  Insert.leaf_exists(V, tree, query) == Bool.or(same, Insert.leaf_exists(V, tree, query)) : Bool
}:
  match same:
    case False{}: {==}
    case True{}:
      projection : String -> Bool = name => Insert.leaf_exists(V, tree, name)
      Equal.trans(
        Bool,
        Insert.leaf_exists(V, tree, query),
        Insert.leaf_exists(V, tree, key),
        True{},
        Equal.cong(
          String,
          Bool,
          projection,
          query,
          key,
          StringFacts.eq_of_eq_true(query, key, test)
        ),
        present
      )

def set_fin_leaf_union(
  -V: Data,
  +tree: Map<&2, V>,
  +key: String,
  +value: V,
  +old: String,
  +query: String,
  order: Cmp,
  order_test: {Insert.comparison_order(String.cmp(key, old)) == order : Cmp},
  +witness: {Insert.selected(V, tree, key) == Some{old} : Maybe<&2, String>},
  +valid: {Patricia.canonical(V, tree) == True{} : Bool}
) -> {
  Insert.leaf_exists(V, Map.set.fin.go(&2, V, tree, key, value, Tuple{Tuple{key, old}, order}), query)
    == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query)) : Bool
}:
  match order:
    case LT{}: insertion_leaf_union(V, tree, key, value, Map.diff(key, old), query)
    case GT{}: insertion_leaf_union(V, tree, key, value, Map.diff(key, old), query)
    case EQ{}:
      Equal.trans(
        Bool,
        Insert.leaf_exists(V, Map.put(&2, V, tree, key, value), query),
        Insert.leaf_exists(V, tree, query),
        Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query)),
        put_leaf_membership(
          V,
          tree,
          key,
          value,
          query,
          valid,
          selected_nonempty(V, tree, key, old, witness)
        ),
        member_absorbs_test(
          V,
          tree,
          key,
          query,
          String.eq(query, key),
          {==},
          selected_key_present(
            V,
            tree,
            key,
            old,
            witness,
            Equal.trans(
              Bool,
              String.eq(key, old),
              Cmp.is_eq(Insert.comparison_order(String.cmp(key, old))),
              True{},
              Insert.comparison_equality_exact(key, old),
              Equal.cong(
                Cmp,
                Bool,
                Cmp.is_eq,
                Insert.comparison_order(String.cmp(key, old)),
                EQ{},
                order_test
              )
            ),
            valid
          )
        )
      )

def set_found_leaf_union(
  -V: Data,
  found: Maybe<&2, String>,
  +tree: Map<&2, V>,
  +key: String,
  +value: V,
  +query: String,
  witness: {Insert.selected(V, tree, key) == found : Maybe<&2, String>},
  valid: {Patricia.canonical(V, tree) == True{} : Bool}
) -> {
  Insert.leaf_exists(V, Map.set.go(&2, V, value, Tuple{tree, Tuple{key, found}}), query)
    == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query)) : Bool
}:
  match found:
    case None{}:
      %Equal.sym(
        Bool,
        Insert.leaf_exists(V, tree, query),
        False{},
        Insert.selected_none_no_leaves(V, tree, key, query, witness, valid)
      ):
        {String.eq(query, key) == Bool.or(String.eq(query, key), _) : Bool}
      BoolFacts.or_false_sym(String.eq(query, key))
    case Some{+old}:
      %Equal.sym(
        (String & String) & Cmp,
        String.cmp(key, old),
        Tuple{Tuple{key, old}, Insert.comparison_order(String.cmp(key, old))},
        Insert.comparison_preserves_keys(key, old)
      ):
        {
          Insert.leaf_exists(V, Map.set.fin.go(&2, V, tree, key, value, _), query)
          == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query))
          : Bool
        }
      set_fin_leaf_union(
        V,
        tree,
        key,
        value,
        old,
        query,
        Insert.comparison_order(String.cmp(key, old)),
        {==},
        witness,
        valid
      )

def set_leaf_union(-V: Data, +tree: Map<&2, V>, +key: String, +value: V, +query: String,
  valid: {Patricia.canonical(V, tree) == True{} : Bool}) -> {
    Insert.leaf_exists(V, Map.set(&2, V, tree, key, value), query)
    == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query))
    : Bool
  }:
  %Equal.sym(
    Map<&2, V> & String & Maybe<&2, String>,
    Map.seek(&2, V, tree, key),
    Tuple{tree, Tuple{key, Insert.selected(V, tree, key)}},
    Insert.seek_exact(V, tree, key)
  ):
    {
      Insert.leaf_exists(V, Map.set.go(&2, V, value, _), query)
      == Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query))
      : Bool
    }
  set_found_leaf_union(V, Insert.selected(V, tree, key), tree, key, value, query, {==}, valid)

def has_value(-V: Data, result: Map<&2, V> & Bool) -> Bool:
  match result:
    case Tuple{_, present}: present

def has_leaf_membership(-V: Data, +tree: Map<&2, V>, +query: String,
  valid: {Patricia.canonical(V, tree) == True{} : Bool}) -> {
  has_value(V, Map.has(&2, V, tree, query)) == Insert.leaf_exists(V, tree, query) : Bool
}:
  %Equal.sym(
    Map<&2, V> & Bool,
    Map.has(&2, V, tree, query),
    Tuple{tree, selected_equal(Insert.selected(V, tree, query), query)},
    has_exact(V, tree, query)
  ):
    {has_value(V, _) == Insert.leaf_exists(V, tree, query) : Bool}
  canonical_selected_membership(V, tree, query, valid)

def set_has_membership(-V: Data, +tree: Map<&2, V>, +key: String, +value: V, +query: String,
  +valid: {Patricia.canonical(V, tree) == True{} : Bool}) -> {
  has_value(V, Map.has(&2, V, Map.set(&2, V, tree, key, value), query))
    == Bool.or(String.eq(query, key), has_value(V, Map.has(&2, V, tree, query))) : Bool
}:
  append_new : Bool -> Bool = previous => Bool.or(String.eq(query, key), previous)
  Equal.trans(
    Bool,
    has_value(V, Map.has(&2, V, Map.set(&2, V, tree, key, value), query)),
    Insert.leaf_exists(V, Map.set(&2, V, tree, key, value), query),
    Bool.or(String.eq(query, key), has_value(V, Map.has(&2, V, tree, query))),
    has_leaf_membership(
      V,
      Map.set(&2, V, tree, key, value),
      query,
      Insert.set_preserves_canonical(V, tree, key, value, valid)
    ),
    Equal.trans(
      Bool,
      Insert.leaf_exists(V, Map.set(&2, V, tree, key, value), query),
      Bool.or(String.eq(query, key), Insert.leaf_exists(V, tree, query)),
      Bool.or(String.eq(query, key), has_value(V, Map.has(&2, V, tree, query))),
      set_leaf_union(V, tree, key, value, query, valid),
      Equal.cong(
        Bool,
        Bool,
        append_new,
        Insert.leaf_exists(V, tree, query),
        has_value(V, Map.has(&2, V, tree, query)),
        Equal.sym(
          Bool,
          has_value(V, Map.has(&2, V, tree, query)),
          Insert.leaf_exists(V, tree, query),
          has_leaf_membership(V, tree, query, valid)
        )
      )
    )
  )


def main() -> Unit:
  Unit{}
