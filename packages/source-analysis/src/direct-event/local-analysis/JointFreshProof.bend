import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Joint.bend as J
import ./JointFreshLaws.bend as Laws
import ./Continuation.bend as K
import ./WeightedInventory.bend as W
import ./ChildBudgetProof.bend as Budget
import ./EntryLaws.bend as Entry
import ./EntryProof.bend as EntryProof
import ./ChildBudgetLaws.bend as Budgets
import ./ContinuationProof.bend as Bootstrap
import ./Potential.bend as P
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

# The enclosing parent's slot/site and suffix determine stack shape; its
# own pending references, accumulator and ghost fields can change in place.
def shape_own_fields(+slot: Nat, +site: Maybe<&2, String>,
  +before_pending: List<&2, M.Reference>, +after_pending: List<&2, M.Reference>,
  +before_reversed: List<&2, M.ReferencePlan>, +after_reversed: List<&2, M.ReferencePlan>,
  +parents: List<&2, C.Frame>, +rest: List<&2, J.Ghost>,
  +before_depth: Nat, +after_depth: Nat, +before_prefix: List<&2, M.ReferencePlan>, +after_prefix: List<&2, M.ReferencePlan>,
  +before_subtotal: S.BytesExpr, +after_subtotal: S.BytesExpr, +root_slot: Nat) -> {
  J.shape(C.Frame{slot, before_pending, before_reversed, site} <> parents,
    J.Ghost{before_depth, before_prefix, before_subtotal} <> rest, root_slot)
  == J.shape(C.Frame{slot, after_pending, after_reversed, site} <> parents,
    J.Ghost{after_depth, after_prefix, after_subtotal} <> rest, root_slot) : Bool
}:
  match site parents rest:
    case None{} Nil{} Nil{}: {==}
    case None{} Nil{} _ <> _: {==}
    case None{} _ <> _ Nil{}: {==}
    case None{} _ <> _ _ <> _: {==}
    case Some{_} _ _: {==}

# Exact actual transition accompanying the joint fresh-child invariant.
def actual_fresh(+global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +rest: Nat,
  +parent_slot: Nat, +tail: List<&2, M.Reference>, +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>, +symbol: String, +target_id: Maybe<&2, String>,
  +target_slot: Nat, +identity: String, +target_name: String, +references: List<&2, M.Reference>,
  found: {C.lookup(C.global_catalog(global), symbol, target_id) == Some{M.Declaration{target_slot, identity, target_name, references}} : Maybe<&2, M.Declaration>},
  unlimited: {Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n) == False{} : Bool},
  fresh: {C.contains(identity, expanded) == False{} : Bool}) -> {
  C.advance_cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest, C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}) == C.cursor_ops(J.enter_cursor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest, C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}, M.Declaration{target_slot, identity, target_name, references}, symbol, target_id), C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{target_slot, identity, target_name, references}}), target_slot)) : C.Step
}:
  %Equal.sym(Maybe<&2, M.Declaration>, C.lookup(C.global_catalog(global), symbol, target_id), Some{M.Declaration{target_slot, identity, target_name, references}}, found) : {
    C.named_recorded(C.Cursor{global, slot, name, expanded, C.reference_names(name, symbol, target_id, referenced), failure, 1n+rest, C.Frame{parent_slot, tail, reversed, site} <> ancestors}, _, symbol) == C.cursor_ops(J.enter_cursor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest, C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}, M.Declaration{target_slot, identity, target_name, references}, symbol, target_id), C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{target_slot, identity, target_name, references}}), target_slot)) : C.Step}
  %Equal.sym(Bool, Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n), False{}, unlimited) : {
    C.named_limit(_, Some{M.Declaration{target_slot, identity, target_name, references}}, C.Cursor{global, slot, name, expanded, C.reference_names(name, symbol, target_id, referenced), failure, 1n+rest, C.Frame{parent_slot, tail, reversed, site} <> ancestors}, symbol, C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{target_slot, identity, target_name, references}}), expanded, 1n+rest) == C.cursor_ops(J.enter_cursor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest, C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}, M.Declaration{target_slot, identity, target_name, references}, symbol, target_id), C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{target_slot, identity, target_name, references}}), target_slot)) : C.Step}
  %Equal.sym(Bool, C.contains(identity, expanded), False{}, fresh) : {
    C.named_seen(_, C.Cursor{global, slot, name, expanded, C.reference_names(name, symbol, target_id, referenced), failure, 1n+rest, C.Frame{parent_slot, tail, reversed, site} <> ancestors}, M.Declaration{target_slot, identity, target_name, references}, symbol, C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{target_slot, identity, target_name, references}}), 1n+rest) == C.cursor_ops(J.enter_cursor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest, C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}, M.Declaration{target_slot, identity, target_name, references}, symbol, target_id), C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{target_slot, identity, target_name, references}}), target_slot)) : C.Step}
  {==}

def enclosing_parent_transport(+root: M.Declaration, +catalog: M.Catalog, +purpose: C.Purpose, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +depth: Nat,
  +parent_slot: Nat, +tail: List<&2, M.Reference>, +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>, +others: List<&2, J.Ghost>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +symbol: String, +target_id: Maybe<&2, String>, +target_slot: Nat, +identity: String, +target_name: String, +references: List<&2, M.Reference>, witness: J.enclosing(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors, J.Ghost{2n+depth, prefix, subtotal} <> others, root, catalog)(K.completed_prefix(prefix, S.as_references(S.interpret(2n+depth, S.ReferencesRequest{M.Named{symbol, target_id} <> tail, S.State{name, expanded, referenced, failure}, subtotal}, catalog))))) -> J.enclosing(C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}})} <> others, root, catalog)(K.completed_prefix(prefix, S.as_references(S.interpret(2n+depth, S.ReferencesRequest{M.Named{symbol, target_id} <> tail, S.State{name, expanded, referenced, failure}, subtotal}, catalog)))):
  %enclosing_own_fields(parent_slot, site, M.Named{symbol, target_id} <> tail, tail, reversed, reversed, ancestors, others, 2n+depth, 1n+depth, prefix, prefix, subtotal, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}}), root, catalog, K.completed_prefix(prefix, S.as_references(S.interpret(2n+depth, S.ReferencesRequest{M.Named{symbol, target_id} <> tail, S.State{name, expanded, referenced, failure}, subtotal}, catalog)))) : _
  witness

def prepared_parent(+root: M.Declaration, +catalog: M.Catalog, +purpose: C.Purpose, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +depth: Nat,
  +parent_slot: Nat, +tail: List<&2, M.Reference>, +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>, +others: List<&2, J.Ghost>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +symbol: String, +target_id: Maybe<&2, String>, +target_slot: Nat, +identity: String, +target_name: String, +references: List<&2, M.Reference>, witness: K.frame_relation(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site}, purpose, 2n+depth, prefix, subtotal, S.State{name, expanded, referenced, failure}, catalog, J.enclosing(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors, J.Ghost{2n+depth, prefix, subtotal} <> others, root, catalog))) -> K.frame_relation(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site}, purpose, 2n+depth, prefix, subtotal, S.State{name, expanded, referenced, failure}, catalog, J.enclosing(C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}})} <> others, root, catalog)):
  match witness:
    case (accumulator, semantic):
      (accumulator, enclosing_parent_transport(root, catalog, purpose, name, expanded, referenced, failure, depth, parent_slot, tail, reversed, site, ancestors, others, prefix, subtotal, symbol, target_id, target_slot, identity, target_name, references, semantic))

def spec_found(+catalog: M.Catalog, +symbol: String, +target_id: Maybe<&2, String>, +target: M.Declaration,
  found: {C.lookup(catalog, symbol, target_id) == Some{target} : Maybe<&2, M.Declaration>}) ->
  {S.lookup(catalog, symbol, target_id) == Some{target} : Maybe<&2, M.Declaration>}:
  %lookup_exact(catalog, symbol, target_id) : {_ == Some{target} : Maybe<&2, M.Declaration>}
  found

def spec_unlimited(+name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>,
  +symbol: String, +target_id: Maybe<&2, String>, unlimited: {Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n) == False{} : Bool}) ->
  {S.over_limit(S.record_named(S.State{name, expanded, referenced, failure}, symbol, target_id)) == False{} : Bool}:
  %record_exact(name, expanded, referenced, failure, symbol, target_id) : {S.over_limit(_) == False{} : Bool}
  unlimited

def spec_fresh(+name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>,
  +symbol: String, +target_id: Maybe<&2, String>, +identity: String, fresh: {C.contains(identity, expanded) == False{} : Bool}) ->
  {S.seen(S.record_named(S.State{name, expanded, referenced, failure}, symbol, target_id), identity) == False{} : Bool}:
  %contains_exact(identity, expanded) : {_ == False{} : Bool}
  fresh

def fresh_semantic(+root: M.Declaration, +catalog: M.Catalog, +purpose: C.Purpose, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +depth: Nat,
  +parent_slot: Nat, +tail: List<&2, M.Reference>, +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>, +others: List<&2, J.Ghost>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +symbol: String, +target_id: Maybe<&2, String>, +target_slot: Nat, +identity: String, +target_name: String, +references: List<&2, M.Reference>, found: {C.lookup(catalog, symbol, target_id) == Some{M.Declaration{target_slot, identity, target_name, references}} : Maybe<&2, M.Declaration>}, unlimited: {Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n) == False{} : Bool}, fresh: {C.contains(identity, expanded) == False{} : Bool},
  witness: J.semantic(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors, J.Ghost{2n+depth, prefix, subtotal} <> others, root, catalog, purpose, S.State{name, expanded, referenced, failure})) ->
  J.semantic(C.Frame{target_slot, references, [], Some{symbol}} <> C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{depth, [], K.initial_subtotal(M.Declaration{target_slot, identity, target_name, references})} <> J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}})} <> others, root, catalog, purpose, S.State{name, identity <> expanded, C.reference_names(name, symbol, target_id, referenced), failure}):
  %Equal.sym(S.State,
    S.State{name, expanded, C.reference_names(name, symbol, target_id, referenced), failure},
    S.record_named(S.State{name, expanded, referenced, failure}, symbol, target_id), record_exact(name, expanded, referenced, failure, symbol, target_id)) :
    J.semantic(C.Frame{target_slot, references, [], Some{symbol}} <> C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{depth, [], K.initial_subtotal(M.Declaration{target_slot, identity, target_name, references})} <> J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}})} <> others, root, catalog, purpose, S.expand(_, identity))
  Entry.child_entry_frame(purpose, depth, catalog, S.State{name, expanded, referenced, failure}, target_slot, identity, target_name, references,
    symbol, target_id, parent_slot, tail, reversed, site, prefix, subtotal, J.enclosing(C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}})} <> others, root, catalog),
    spec_found(catalog, symbol, target_id, M.Declaration{target_slot, identity, target_name, references}, found),
    spec_unlimited(name, expanded, referenced, failure, symbol, target_id, unlimited),
    spec_fresh(name, expanded, referenced, failure, symbol, target_id, identity, fresh),
    prepared_parent(root, catalog, purpose, name, expanded, referenced, failure, depth, parent_slot, tail, reversed, site, ancestors, others, prefix, subtotal, symbol, target_id, target_slot, identity, target_name, references, witness))

def core_after_order(+prefix: Nat, +child: Nat, +unvisited: Nat, +rest: Nat,
  bound: N.le(Nat.add(prefix, Nat.add(child, unvisited)), rest)) ->
  N.le(Nat.add(Nat.add(child, prefix), unvisited), rest):
  %Equal.sym(Nat, Nat.add(Nat.add(child, prefix), unvisited), Nat.add(child, Nat.add(prefix, unvisited)),
    N.add_assoc(child, prefix, unvisited)) : N.le(_, rest)
  %Equal.sym(Nat, Nat.add(child, Nat.add(prefix, unvisited)), Nat.add(prefix, Nat.add(child, unvisited)),
    N.add_left_comm(child, prefix, unvisited)) : N.le(_, rest)
  bound

def budget_bundle(+catalog: M.Catalog, +purpose: C.Purpose, +expanded: List<&2, String>, +rest: Nat, +depth: Nat,
  +parent_slot: Nat, +tail: List<&2, M.Reference>, +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>, +others: List<&2, J.Ghost>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +symbol: String, +target_id: Maybe<&2, String>, +target_slot: Nat, +identity: String, +target_name: String, +references: List<&2, M.Reference>, accumulator: K.accumulator_relation(purpose, reversed, prefix),
  ancestors_bound: J.bounds(ancestors, others, catalog, purpose, expanded), budgets: N.le(Nat.add(Nat.add(List.length(&2, M.Reference, tail), P.pending_references(ancestors)), Nat.add(List.length(&2, M.Reference, references), P.catalog_unvisited(catalog, identity <> expanded))), rest) & N.le(W.specification_required(references, catalog, identity <> expanded), depth) & N.le(W.specification_required(tail, catalog, identity <> expanded), 1n+depth)) ->
  N.le(Nat.add(Nat.add(List.length(&2, M.Reference, references), Nat.add(List.length(&2, M.Reference, tail), P.pending_references(ancestors))), P.catalog_unvisited(catalog, identity <> expanded)), rest) & J.bounds(C.Frame{target_slot, references, [], Some{symbol}} <> C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{depth, [], K.initial_subtotal(M.Declaration{target_slot, identity, target_name, references})} <> J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}})} <> others, catalog, purpose, identity <> expanded):
  match budgets:
    case (core, (child, parent)):
      (core_after_order(Nat.add(List.length(&2, M.Reference, tail), P.pending_references(ancestors)), List.length(&2, M.Reference, references), P.catalog_unvisited(catalog, identity <> expanded), rest, core),
        (Bootstrap.empty_accumulator(purpose), (child,
          (accumulator, (parent, bounds_mono(ancestors, others, catalog, purpose, identity, expanded, ancestors_bound))))))

def fresh_bounds(+catalog: M.Catalog, +purpose: C.Purpose, +expanded: List<&2, String>, +rest: Nat, +depth: Nat,
  +parent_slot: Nat, +tail: List<&2, M.Reference>, +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>, +others: List<&2, J.Ghost>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +symbol: String, +target_id: Maybe<&2, String>, +target_slot: Nat, +identity: String, +target_name: String, +references: List<&2, M.Reference>,
  +found: {C.lookup(catalog, symbol, target_id) == Some{M.Declaration{target_slot, identity, target_name, references}} : Maybe<&2, M.Declaration>},
  +fresh: {C.contains(identity, expanded) == False{} : Bool}, core: N.le(1n+Nat.add(Nat.add(List.length(&2, M.Reference, tail), P.pending_references(ancestors)), P.catalog_unvisited(catalog, expanded)), 2n+rest), valid: J.bounds(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors, J.Ghost{2n+depth, prefix, subtotal} <> others, catalog, purpose, expanded)) ->
  N.le(Nat.add(Nat.add(List.length(&2, M.Reference, references), Nat.add(List.length(&2, M.Reference, tail), P.pending_references(ancestors))), P.catalog_unvisited(catalog, identity <> expanded)), rest) & J.bounds(C.Frame{target_slot, references, [], Some{symbol}} <> C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{depth, [], K.initial_subtotal(M.Declaration{target_slot, identity, target_name, references})} <> J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}})} <> others, catalog, purpose, identity <> expanded):
  match valid:
    case (accumulator, (spec, ancestors_bound)):
      budget_bundle(catalog, purpose, expanded, rest, depth, parent_slot, tail, reversed, site, ancestors, others, prefix, subtotal, symbol, target_id, target_slot, identity, target_name, references, accumulator, ancestors_bound,
        Budgets.fresh_child_budgets(catalog, symbol, target_id, target_slot, identity, target_name, references,
          expanded, tail, ancestors, rest, depth, found, fresh, core, spec))

def global_catalog_agrees(+global: C.Global, +invocation: C.Global, +request: Nat,
  equal: {global == C.global_count(invocation, request) : C.Global}) -> {
  C.global_catalog(global) == C.global_catalog(invocation) : M.Catalog
}:
  match invocation:
    case C.Global{+catalog, +purpose, +pending, +outcomes, _}:
      Equal.cong(C.Global, M.Catalog, value => C.global_catalog(value), global,
        C.Global{catalog, purpose, pending, outcomes, request}, equal)

def found_in_context(+global: C.Global, +invocation: C.Global, +request: Nat, +symbol: String,
  +target_id: Maybe<&2, String>, +target: M.Declaration,
  equal: {global == C.global_count(invocation, request) : C.Global},
  found: {C.lookup(C.global_catalog(global), symbol, target_id) == Some{target} : Maybe<&2, M.Declaration>}) -> {
  C.lookup(C.global_catalog(invocation), symbol, target_id) == Some{target} : Maybe<&2, M.Declaration>
}:
  %global_catalog_agrees(global, invocation, request, equal) : {C.lookup(_, symbol, target_id) == Some{target} : Maybe<&2, M.Declaration>}
  found

def core_before_context(+global: C.Global, +invocation: C.Global, +request: Nat, +prefix: Nat,
  +expanded: List<&2, String>, +rest: Nat, equal: {global == C.global_count(invocation, request) : C.Global},
  bound: N.le(1n+Nat.add(prefix, P.catalog_unvisited(C.global_catalog(global), expanded)), 2n+rest)) ->
  N.le(1n+Nat.add(prefix, P.catalog_unvisited(C.global_catalog(invocation), expanded)), 2n+rest):
  %global_catalog_agrees(global, invocation, request, equal) :
    N.le(1n+Nat.add(prefix, P.catalog_unvisited(_, expanded)), 2n+rest)
  bound

def core_after_actual(+global: C.Global, +invocation: C.Global, +request: Nat, +pending: Nat,
  +expanded: List<&2, String>, +rest: Nat, equal: {global == C.global_count(invocation, request) : C.Global},
  bound: N.le(Nat.add(pending, P.catalog_unvisited(C.global_catalog(invocation), expanded)), rest)) ->
  N.le(Nat.add(pending, P.catalog_unvisited(C.global_catalog(global), expanded)), rest):
  %Equal.sym(M.Catalog, C.global_catalog(global), C.global_catalog(invocation),
    global_catalog_agrees(global, invocation, request, equal)) : N.le(Nat.add(pending, P.catalog_unvisited(_, expanded)), rest)
  bound

def fresh_shape(+root: M.Declaration, +depth: Nat, +parent_slot: Nat, +tail: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +ancestors: List<&2, C.Frame>,
  +others: List<&2, J.Ghost>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +symbol: String, +target_id: Maybe<&2, String>, +target: M.Declaration, valid: {J.shape(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors, J.Ghost{2n+depth, prefix, subtotal} <> others, S.declaration_slot(root)) == True{} : Bool}) ->
  {J.shape(C.Frame{S.declaration_slot(target), [], [], Some{symbol}} <> C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{depth, [], K.initial_subtotal(target)} <> J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{target})} <> others, S.declaration_slot(root)) == True{} : Bool}:
  %shape_own_fields(parent_slot, site, M.Named{symbol, target_id} <> tail, tail, reversed, reversed, ancestors, others,
    2n+depth, 1n+depth, prefix, prefix, subtotal, S.edge_total(subtotal, symbol, Some{target}), S.declaration_slot(root)) : {_ == True{} : Bool}
  valid

def reconstruct_fresh(+root: M.Declaration, +invocation: C.Global, +request: Nat, +global: C.Global, +slot: Nat, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +rest: Nat, +depth: Nat,
  +parent_slot: Nat, +tail: List<&2, M.Reference>, +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>, +others: List<&2, J.Ghost>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +symbol: String, +target_id: Maybe<&2, String>, +target_slot: Nat, +identity: String, +target_name: String, +references: List<&2, M.Reference>, +global_equal: {global == C.global_count(invocation, request) : C.Global}, slot_equal: {slot == S.declaration_slot(root) : Nat}, name_equal: {name == S.declaration_name(root) : String},
  shape: {J.shape(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors, J.Ghost{2n+depth, prefix, subtotal} <> others, S.declaration_slot(root)) == True{} : Bool}, found: {C.lookup(C.global_catalog(invocation), symbol, target_id) == Some{M.Declaration{target_slot, identity, target_name, references}} : Maybe<&2, M.Declaration>}, unlimited: {Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n) == False{} : Bool}, fresh: {C.contains(identity, expanded) == False{} : Bool},
  semantic: J.semantic(C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors, J.Ghost{2n+depth, prefix, subtotal} <> others, root, C.global_catalog(invocation), C.global_purpose(invocation), S.State{name, expanded, referenced, failure}), bundle: N.le(Nat.add(Nat.add(List.length(&2, M.Reference, references), Nat.add(List.length(&2, M.Reference, tail), P.pending_references(ancestors))), P.catalog_unvisited(C.global_catalog(invocation), identity <> expanded)), rest) & J.bounds(C.Frame{target_slot, references, [], Some{symbol}} <> C.Frame{parent_slot, tail, reversed, site} <> ancestors, J.Ghost{depth, [], K.initial_subtotal(M.Declaration{target_slot, identity, target_name, references})} <> J.Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{M.Declaration{target_slot, identity, target_name, references}})} <> others, C.global_catalog(invocation), C.global_purpose(invocation), identity <> expanded)) -> J.cursor(root, invocation, request, J.enter_cursor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest, C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}, M.Declaration{target_slot, identity, target_name, references}, symbol, target_id), J.enter_ghosts(depth, J.Ghost{2n+depth, prefix, subtotal} <> others, M.Declaration{target_slot, identity, target_name, references}, symbol)):
  match bundle:
    case (core, bounds):
      (global_equal, (slot_equal, (name_equal,
        (fresh_shape(root, depth, parent_slot, tail, reversed, site, ancestors, others, prefix, subtotal, symbol, target_id, M.Declaration{target_slot, identity, target_name, references}, shape),
        (core_after_actual(global, invocation, request, Nat.add(List.length(&2, M.Reference, references), Nat.add(List.length(&2, M.Reference, tail), P.pending_references(ancestors))), identity <> expanded, rest, global_equal, core),
        (bounds, fresh_semantic(root, C.global_catalog(invocation), C.global_purpose(invocation), name, expanded, referenced, failure, depth, parent_slot, tail, reversed, site, ancestors, others, prefix, subtotal, symbol, target_id, target_slot, identity, target_name, references, found, unlimited, fresh, semantic)))))))

def preserve_fresh(+root: M.Declaration, +invocation: C.Global, +request: Nat, +global: C.Global, +slot: Nat, +name: String,
  +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +rest: Nat, +depth: Nat,
  +parent_slot: Nat, +tail: List<&2, M.Reference>, +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>,
  +ancestors: List<&2, C.Frame>, +others: List<&2, J.Ghost>, +prefix: List<&2, M.ReferencePlan>, +subtotal: S.BytesExpr,
  +symbol: String, +target_id: Maybe<&2, String>, +target_slot: Nat, +identity: String, +target_name: String, +references: List<&2, M.Reference>, +found: {C.lookup(C.global_catalog(global), symbol, target_id) == Some{M.Declaration{target_slot, identity, target_name, references}} : Maybe<&2, M.Declaration>}, +fresh: {C.contains(identity, expanded) == False{} : Bool}, unlimited: {Nat.is_gt(List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)), 16n) == False{} : Bool}, valid: J.cursor(root, invocation, request, C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest, C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}, J.Ghost{2n+depth, prefix, subtotal} <> others)) -> J.cursor(root, invocation, request, J.enter_cursor(rest, C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest, C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors}, M.Declaration{target_slot, identity, target_name, references}, symbol, target_id), J.enter_ghosts(depth, J.Ghost{2n+depth, prefix, subtotal} <> others, M.Declaration{target_slot, identity, target_name, references}, symbol)):
  match valid:
    case (+global_equal, (slot_equal, (name_equal, (shape, (core, (bounds, semantic)))))):
      reconstruct_fresh(root, invocation, request, global, slot, name, expanded, referenced, failure, rest, depth, parent_slot, tail, reversed, site, ancestors, others, prefix, subtotal, symbol, target_id, target_slot, identity, target_name, references, global_equal, slot_equal, name_equal, shape,
        found_in_context(global, invocation, request, symbol, target_id, M.Declaration{target_slot, identity, target_name, references}, global_equal, found), unlimited, fresh, semantic,
        fresh_bounds(C.global_catalog(invocation), C.global_purpose(invocation), expanded, rest, depth, parent_slot, tail, reversed, site, ancestors, others, prefix, subtotal, symbol, target_id, target_slot, identity, target_name, references, found_in_context(global, invocation, request, symbol, target_id, M.Declaration{target_slot, identity, target_name, references}, global_equal, found), fresh,
          core_before_context(global, invocation, request, Nat.add(List.length(&2, M.Reference, tail), P.pending_references(ancestors)), expanded, rest, global_equal, core), bounds))

def Laws.fresh_cursor(root, invocation, request, actual, ghosts, target):
  match actual ghosts target:
    case C.Cursor{_, _, _, _, _, _, 2n+_, C.Frame{_, M.Unsupported{_} <> _, _, _} <> _} _ _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 2n+_, C.Frame{_, Nil{}, _, _} <> _} _ _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 2n+_, Nil{}} _ _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 2n+_, C.Frame{_, M.Named{_, _} <> _, _, _} <> _} Nil{} _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 0n, _} _ _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 1n, _} _ _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 2n+_, C.Frame{_, M.Named{_, _} <> _, _, _} <> _}
      J.Ghost{0n, _, _} <> _ _: Unit{}
    case C.Cursor{_, _, _, _, _, _, 2n+_, C.Frame{_, M.Named{_, _} <> _, _, _} <> _}
      J.Ghost{1n, _, _} <> _ _: Unit{}
    case C.Cursor{+global, +slot, +name, +expanded, +referenced, +failure, 2n++rest,
      C.Frame{+parent_slot, M.Named{+symbol, +target_id} <> +tail, +reversed, +site} <> +ancestors}
      J.Ghost{2n++depth, +prefix, +subtotal} <> +others
      M.Declaration{+target_slot, +identity, +target_name, +references}:
      +found => +fresh => +unlimited => valid =>
        (preserve_fresh(root, invocation, request, global, slot, name, expanded, referenced, failure, rest, depth,
          parent_slot, tail, reversed, site, ancestors, others, prefix, subtotal, symbol, target_id,
          target_slot, identity, target_name, references, found, fresh, unlimited, valid),
        actual_fresh(global, slot, name, expanded, referenced, failure, rest, parent_slot, tail, reversed, site,
          ancestors, symbol, target_id, target_slot, identity, target_name, references, found, unlimited, fresh))
    case _ _ _: Unit{}

def main() -> Unit:
  Unit{}
