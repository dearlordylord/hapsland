import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Joint.bend as J
import ./Continuation.bend as K
import ./WeightedInventory.bend as W
import ./ChildBudgetProof.bend as Budget
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N
import ../graph-resolution/traversal/CONTINUATION_STATE_PROOF.bend as ExistingState

# Core/Spec agreement used locally by the fresh branch of Joint.cursor.
# These helpers do not establish a second traversal or totality theorem.
def contains_step(+same: Bool, +left: Bool, +right: Bool, equal: {left == right : Bool}) -> {
  C.contains_selected(same, _ => left) == Bool.or(same, right) : Bool
}:
  match same:
    case True{}: {==}
    case False{}: equal

def contains_exact(+key: String, +values: List<&2, String>) -> {C.contains(key, values) == S.contains(key, values) : Bool}:
  match values:
    case []: {==}
    case +head <> +tail:
      contains_step(String.eq(key, head), C.contains(key, tail), S.contains(key, tail), contains_exact(key, tail))

def insert_step(+seen: Bool, +key: String, +values: List<&2, String>) -> {
  C.insert_selected(seen, key, values) == S.insert_selected(seen, key, values) : List<&2, String>
}:
  match seen:
    case True{}: {==}
    case False{}: {==}

def insert_exact(+key: String, +values: List<&2, String>) -> {C.insert(key, values) == S.insert(key, values) : List<&2, String>}:
  %contains_exact(key, values) : {C.insert(key, values) == S.insert_selected(_, key, values) : List<&2, String>}
  insert_step(C.contains(key, values), key, values)

def declarations_exact(+items: List<&2, M.Declaration>, +name: String, +found: Maybe<&2, M.Declaration>) -> {
  C.lookup_declarations(name, items, found) == S.lookup_declarations(name, items, found) : Maybe<&2, M.Declaration>
}:
  match items:
    case []: {==}
    case M.Declaration{+slot, +identity, +candidate, +references} <> +tail:
      declarations_exact(tail, name, Bool.pick(Maybe<&2, M.Declaration>, String.eq(name, candidate),
        Some{M.Declaration{slot, identity, candidate, references}}, found))

def supporting_exact(+items: List<&2, M.Supporting>, +key: String, +found: Maybe<&2, M.Declaration>) -> {
  C.lookup_supporting(key, items, found) == S.lookup_supporting(key, items, found) : Maybe<&2, M.Declaration>
}:
  match items:
    case []: {==}
    case M.Supporting{candidate, target} <> +tail:
      supporting_exact(tail, key, Bool.pick(Maybe<&2, M.Declaration>, String.eq(key, candidate), Some{target}, found))

def lookup_exact(+catalog: M.Catalog, +name: String, +target_id: Maybe<&2, String>) -> {
  C.lookup(catalog, name, target_id) == S.lookup(catalog, name, target_id) : Maybe<&2, M.Declaration>
}:
  match catalog target_id:
    case M.Catalog{declarations, _} None{}: declarations_exact(declarations, name, None{})
    case M.Catalog{_, supporting} Some{key}: supporting_exact(supporting, key, None{})

def reference_key_exact(+name: String, +target_id: Maybe<&2, String>) -> {
  C.reference_key(name, target_id) == S.reference_key(name, target_id) : String
}:
  match target_id:
    case None{}: {==}
    case Some{_}: {==}

def reference_names_exact(+root: String, +symbol: String, +target_id: Maybe<&2, String>, +referenced: List<&2, String>) -> {
  C.reference_names(root, symbol, target_id, referenced)
  == Bool.pick(List<&2, String>, String.eq(symbol, root), referenced, S.insert(S.reference_key(symbol, target_id), referenced)) : List<&2, String>
}:
  %reference_key_exact(symbol, target_id) : {
    C.reference_names(root, symbol, target_id, referenced)
    == Bool.pick(List<&2, String>, String.eq(symbol, root), referenced, S.insert(_, referenced)) : List<&2, String>}
  %insert_exact(C.reference_key(symbol, target_id), referenced) : {
    C.reference_names(root, symbol, target_id, referenced)
    == Bool.pick(List<&2, String>, String.eq(symbol, root), referenced, _) : List<&2, String>}
  %ExistingState.equal_symmetric(root, symbol) : {
    C.reference_names(root, symbol, target_id, referenced)
    == Bool.pick(List<&2, String>, _, referenced, C.insert(C.reference_key(symbol, target_id), referenced)) : List<&2, String>}
  {==}

def record_exact(+root: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>,
  +symbol: String, +target_id: Maybe<&2, String>) -> {
  S.State{root, expanded, C.reference_names(root, symbol, target_id, referenced), failure}
  == S.record_named(S.State{root, expanded, referenced, failure}, symbol, target_id) : S.State
}:
  Equal.cong(List<&2, String>, S.State, names => S.State{root, expanded, names, failure},
    C.reference_names(root, symbol, target_id, referenced),
    Bool.pick(List<&2, String>, String.eq(symbol, root), referenced, S.insert(S.reference_key(symbol, target_id), referenced)),
    reference_names_exact(root, symbol, target_id, referenced))

# Adding the fresh child identity lowers every parked ancestor's current
# Spec inventory. Its accumulator relation and exact parked depth are retained.
def required_mono(+pending: List<&2, M.Reference>, +catalog: M.Catalog, +identity: String, +expanded: List<&2, String>) -> N.le(
  W.specification_required(pending, catalog, identity <> expanded), W.specification_required(pending, catalog, expanded)):
  N.succ_le_succ(Nat.add(List.length(&2, M.Reference, pending), W.catalog_unvisited(~W.specification_weight, catalog, identity <> expanded)),
    Nat.add(List.length(&2, M.Reference, pending), W.catalog_unvisited(~W.specification_weight, catalog, expanded)),
    N.add_le_add_left(W.catalog_unvisited(~W.specification_weight, catalog, identity <> expanded),
      W.catalog_unvisited(~W.specification_weight, catalog, expanded), List.length(&2, M.Reference, pending),
      Budget.catalog_mono(~W.specification_weight, catalog, identity, expanded)))

def bounds_head(+pending: List<&2, M.Reference>, +parents: List<&2, C.Frame>, +rest: List<&2, J.Ghost>,
  +catalog: M.Catalog, +purpose: C.Purpose, +identity: String, +expanded: List<&2, String>, +depth: Nat,
  +reversed: List<&2, M.ReferencePlan>, +prefix: List<&2, M.ReferencePlan>,
  valid: K.accumulator_relation(purpose, reversed, prefix)
    & N.le(W.specification_required(pending, catalog, expanded), depth)
    & J.bounds(parents, rest, catalog, purpose, expanded),
  recurse: J.bounds(parents, rest, catalog, purpose, expanded) -> J.bounds(parents, rest, catalog, purpose, identity <> expanded)) ->
  K.accumulator_relation(purpose, reversed, prefix)
    & N.le(W.specification_required(pending, catalog, identity <> expanded), depth)
    & J.bounds(parents, rest, catalog, purpose, identity <> expanded):
  match valid:
    case (accumulator, (bound, tail)):
      (accumulator, (N.le_trans(W.specification_required(pending, catalog, identity <> expanded),
        W.specification_required(pending, catalog, expanded), depth, required_mono(pending, catalog, identity, expanded), bound), recurse(tail)))

def bounds_mono(+frames: List<&2, C.Frame>, +ghosts: List<&2, J.Ghost>, +catalog: M.Catalog,
  +purpose: C.Purpose, +identity: String, +expanded: List<&2, String>,
  valid: J.bounds(frames, ghosts, catalog, purpose, expanded)) ->
  J.bounds(frames, ghosts, catalog, purpose, identity <> expanded):
  match frames ghosts:
    case Nil{} Nil{}: Unit{}
    case C.Frame{+slot, +pending, +reversed, +site} <> +parents J.Ghost{+depth, +prefix, +subtotal} <> +rest:
      bounds_head(pending, parents, rest, catalog, purpose, identity, expanded, depth, reversed, prefix, valid,
        witness => bounds_mono(parents, rest, catalog, purpose, identity, expanded, witness))
    case Nil{} _ <> _: Empty.absurd(Empty, valid)
    case _ <> _ Nil{}: Empty.absurd(Empty, valid)

# Updating a parent's own pending/prefix/subtotal/depth leaves its enclosing
# continuation unchanged. The NEW child spine separately reads that updated
# parent through plug_parent; this lemma does not erase that edge charge.
def enclosing_own_fields(+slot: Nat, +site: Maybe<&2, String>,
  +before_pending: List<&2, M.Reference>, +after_pending: List<&2, M.Reference>,
  +before_reversed: List<&2, M.ReferencePlan>, +after_reversed: List<&2, M.ReferencePlan>,
  +parents: List<&2, C.Frame>, +rest: List<&2, J.Ghost>,
  +before_depth: Nat, +after_depth: Nat, +before_prefix: List<&2, M.ReferencePlan>, +after_prefix: List<&2, M.ReferencePlan>,
  +before_subtotal: S.BytesExpr, +after_subtotal: S.BytesExpr, +root: M.Declaration, +catalog: M.Catalog, +result: S.ReferencesResult) -> {
  J.enclosing(C.Frame{slot, before_pending, before_reversed, site} <> parents,
    J.Ghost{before_depth, before_prefix, before_subtotal} <> rest, root, catalog)(result)
  == J.enclosing(C.Frame{slot, after_pending, after_reversed, site} <> parents,
    J.Ghost{after_depth, after_prefix, after_subtotal} <> rest, root, catalog)(result) : Type
}:
  match site parents rest:
    case None{} Nil{} Nil{}: {==}
    case None{} Nil{} _ <> _: {==}
    case None{} _ <> _ Nil{}: {==}
    case None{} _ <> _ _ <> _: {==}
    case Some{_} _ _: {==}

def main() -> Unit:
  Unit{}
