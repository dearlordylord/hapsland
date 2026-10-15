import Base
import ./Model.bend as M

# Independent recursive equations of analyzer.ts. This specification builds the
# original tree, in DFS order; it does not import the future production cursor.
# The depth argument below makes the recursive equations executable in Bend.
# The public entry derives it from the catalog, never from a caller premise.
# Sufficiency of that depth remains a separate totality obligation.
type State is Data:
  State{
    root_name: String,
    expanded: List<&2, String>,
    referenced: List<&2, String>,
    failure: Maybe<&2, M.Failure>
  }

# Specification-only evaluation tree. Native evaluation is left-to-right,
# without memoization, so each measurement and each IEEE operation keeps its
# original position and grouping, including a thrown measurement's identity.
type BytesExpr is Data:
  ArtifactBytes{slot: Nat}
  TextBytes{value: String}
  Literal{value: Nat}
  Add{left: BytesExpr, right: BytesExpr}
  Multiply{left: BytesExpr, right: BytesExpr}

type NodeResult is Data:
  NodeResult{state: State, node: M.NodePlan, bytes: BytesExpr}
  DepthExhausted{}

type ReferenceResult is Data:
  ReferenceResult{state: State, reference: M.ReferencePlan, subtotal: BytesExpr}
  ReferenceDepthExhausted{}

type ReferencesResult is Data:
  ReferencesResult{state: State, references: List<&2, M.ReferencePlan>, subtotal: BytesExpr}
  ReferencesDepthExhausted{}

def contains(+key: String, values: List<&2, String>) -> Bool:
  match values:
    case []: False{}
    case head <> tail: Bool.or(String.eq(key, head), contains(key, tail))

def insert_selected(seen: Bool, key: String, values: List<&2, String>) -> List<&2, String>:
  match seen:
    case True{}: values
    case False{}: key <> values

def insert(+key: String, +values: List<&2, String>) -> List<&2, String>:
  insert_selected(contains(key, values), key, values)

def declaration_slot(declaration: M.Declaration) -> Nat:
  match declaration:
    case M.Declaration{slot, _, _, _}: slot

def declaration_identity(declaration: M.Declaration) -> String:
  match declaration:
    case M.Declaration{_, identity, _, _}: identity

def declaration_name(declaration: M.Declaration) -> String:
  match declaration:
    case M.Declaration{_, _, name, _}: name

# new Map(parsed.map(...)) retains the last declaration for a repeated name.
def lookup_declarations(
  +name: String,
  declarations: List<&2, M.Declaration>,
  found: Maybe<&2, M.Declaration>
) -> Maybe<&2, M.Declaration>:
  match declarations:
    case []: found
    case +head <> tail:
      lookup_declarations(
        name,
        tail,
        Bool.pick(
          Maybe<&2, M.Declaration>,
          String.eq(name, declaration_name(head)),
          Some{head},
          found
        )
      )

# Supporting facts arrive as ordered Map entries. Define last-wins even for
# raw duplicate keys, without requiring uniqueness of the typed catalog.
def lookup_supporting(
  +key: String,
  supporting: List<&2, M.Supporting>,
  found: Maybe<&2, M.Declaration>
) -> Maybe<&2, M.Declaration>:
  match supporting:
    case []: found
    case M.Supporting{candidate, declaration} <> tail:
      lookup_supporting(key, tail,
        Bool.pick(Maybe<&2, M.Declaration>, String.eq(key, candidate), Some{declaration}, found))

def lookup(
  catalog: M.Catalog,
  name: String,
  target_id: Maybe<&2, String>
) -> Maybe<&2, M.Declaration>:
  match catalog target_id:
    case M.Catalog{declarations, _} None{}: lookup_declarations(name, declarations, None{})
    case M.Catalog{_, supporting} Some{key}: lookup_supporting(key, supporting, None{})

def reference_key(name: String, target_id: Maybe<&2, String>) -> String:
  match target_id:
    case None{}: name
    case Some{key}: key

def first_failure(current: Maybe<&2, M.Failure>, failure: M.Failure) -> Maybe<&2, M.Failure>:
  match current:
    case None{}: Some{failure}
    case Some{current}: Some{current}

def fail(state: State, failure: M.Failure) -> State:
  match state:
    case State{root_name, expanded, referenced, current}:
      State{root_name, expanded, referenced, first_failure(current, failure)}

def record_named(state: State, +name: String, target_id: Maybe<&2, String>) -> State:
  match state:
    case State{+root_name, expanded, +referenced, failure}:
      State{root_name, expanded,
        Bool.pick(List<&2, String>, String.eq(name, root_name), referenced,
          insert(reference_key(name, target_id), referenced)), failure}

def over_limit(state: State) -> Bool:
  match state:
    case State{_, _, referenced, _}: Nat.is_gt(List.length(&2, String, referenced), 16n)

def seen(state: State, identity: String) -> Bool:
  match state:
    case State{_, expanded, _, _}: contains(identity, expanded)

def expand(state: State, identity: String) -> State:
  match state:
    case State{root_name, expanded, referenced, failure}:
      State{root_name, identity <> expanded, referenced, failure}

def omitted_target(target: Maybe<&2, M.Declaration>) -> Maybe<&2, String>:
  match target:
    case None{}: None{}
    case Some{declaration}: Some{declaration_identity(declaration)}

def target_bytes(target: Maybe<&2, M.Declaration>) -> BytesExpr:
  match target:
    case None{}: Literal{0n}
    case Some{declaration}: TextBytes{declaration_identity(declaration)}

def edge_total(subtotal: BytesExpr, name: String, target: Maybe<&2, M.Declaration>) -> BytesExpr:
  Add{subtotal, Add{Add{Literal{512n}, Multiply{Literal{2n}, TextBytes{name}}}, target_bytes(target)}}

def expanded_child(result: NodeResult, symbol: String, subtotal: BytesExpr) -> ReferenceResult:
  match result:
    case DepthExhausted{}: ReferenceDepthExhausted{}
    case NodeResult{state, node, bytes}: ReferenceResult{state, M.Expanded{symbol, node}, Add{subtotal, bytes}}

def named_seen(already: Bool, state: State, symbol: String, +target: M.Declaration, subtotal: BytesExpr, visit: M.Declaration -> State -> NodeResult) -> ReferenceResult:
  match already:
    case True{}: ReferenceResult{state, M.Included{symbol, declaration_identity(target)}, subtotal}
    case False{}: expanded_child(visit(target)(expand(state, declaration_identity(target))), symbol, subtotal)

def named_target(target: Maybe<&2, M.Declaration>, +state: State, symbol: String, subtotal: BytesExpr, visit: M.Declaration -> State -> NodeResult) -> ReferenceResult:
  match target:
    case None{}: ReferenceResult{fail(state, M.MissingEvidence{}), M.Omitted{symbol, None{}, M.Unresolved{}}, subtotal}
    case Some{+target}: named_seen(seen(state, declaration_identity(target)), state, symbol, target, subtotal, visit)

def named_limit(limited: Bool, target: Maybe<&2, M.Declaration>, state: State, symbol: String, subtotal: BytesExpr, visit: M.Declaration -> State -> NodeResult) -> ReferenceResult:
  match limited:
    case True{}: ReferenceResult{fail(state, M.ReferenceLimit{}), M.Omitted{symbol, omitted_target(target), M.LimitExceeded{}}, subtotal}
    case False{}: named_target(target, state, symbol, subtotal, visit)

def named_recorded(+state: State, +target: Maybe<&2, M.Declaration>, +symbol: String, subtotal: BytesExpr, visit: M.Declaration -> State -> NodeResult) -> ReferenceResult:
  named_limit(over_limit(state), target, state, symbol, edge_total(subtotal, symbol, target), visit)

def visit_reference(reference: M.Reference, state: State, catalog: M.Catalog, subtotal: BytesExpr, visit: M.Declaration -> State -> NodeResult) -> ReferenceResult:
  match reference:
    case M.Unsupported{+name}:
      ReferenceResult{fail(state, M.UnsupportedReference{}), M.Omitted{name, None{}, M.UnsupportedSyntax{}}, edge_total(subtotal, name, None{})}
    case M.Named{+name, +target_id}:
      named_recorded(record_named(state, name, target_id), lookup(catalog, name, target_id), name, subtotal, visit)

def prepend_reference(result: ReferencesResult, reference: M.ReferencePlan) -> ReferencesResult:
  match result:
    case ReferencesDepthExhausted{}: ReferencesDepthExhausted{}
    case ReferencesResult{state, references, subtotal}: ReferencesResult{state, reference <> references, subtotal}

def after_reference(result: ReferenceResult, next: State -> BytesExpr -> ReferencesResult) -> ReferencesResult:
  match result:
    case ReferenceDepthExhausted{}: ReferencesDepthExhausted{}
    case ReferenceResult{state, reference, subtotal}: prepend_reference(next(state)(subtotal), reference)

# Child traversal returns its updated sets and first failure before the next
# sibling is visited. Failure never short-circuits the remaining references.
type Request is Data:
  NodeRequest{declaration: M.Declaration, state: State}
  ReferencesRequest{references: List<&2, M.Reference>, state: State, subtotal: BytesExpr}

type DispatchResult is Data:
  NodeValue{result: NodeResult}
  ReferencesValue{result: ReferencesResult}

def as_node(result: DispatchResult) -> NodeResult:
  match result:
    case NodeValue{value}: value
    case _: DepthExhausted{}

def as_references(result: DispatchResult) -> ReferencesResult:
  match result:
    case ReferencesValue{value}: value
    case _: ReferencesDepthExhausted{}

def references_body(references: List<&2, M.Reference>, state: State, catalog: M.Catalog, subtotal: BytesExpr, child: Request -> DispatchResult, sibling: Request -> DispatchResult) -> ReferencesResult:
  match references:
    case []: ReferencesResult{state, [], subtotal}
    case head <> tail:
      after_reference(visit_reference(head, state, catalog, subtotal,
          declaration => next_state => as_node(child(NodeRequest{declaration, next_state}))),
        next_state => next_subtotal => as_references(sibling(ReferencesRequest{tail, next_state, next_subtotal})))

def node_result(result: ReferencesResult, slot: Nat) -> NodeResult:
  match result:
    case ReferencesDepthExhausted{}: DepthExhausted{}
    case ReferencesResult{state, references, bytes}: NodeResult{state, M.NodePlan{slot, references}, bytes}

def declaration_body(declaration: M.Declaration, state: State, recurse: Request -> DispatchResult) -> NodeResult:
  match declaration:
    case M.Declaration{+slot, _, _, references}:
      node_result(as_references(recurse(ReferencesRequest{references, state, Add{ArtifactBytes{slot}, Literal{512n}}})), slot)

def dispatch(request: Request, catalog: M.Catalog, child: Request -> DispatchResult, sibling: Request -> DispatchResult) -> DispatchResult:
  match request:
    case NodeRequest{declaration, state}: NodeValue{declaration_body(declaration, state, child)}
    case ReferencesRequest{references, state, subtotal}:
      ReferencesValue{references_body(references, state, catalog, subtotal, child, sibling)}

def insufficient(request: Request) -> DispatchResult:
  match request:
    case NodeRequest{_, _}: NodeValue{DepthExhausted{}}
    case ReferencesRequest{_, _, _}: ReferencesValue{ReferencesDepthExhausted{}}

def interpret(depth: Nat, request: Request, +catalog: M.Catalog) -> DispatchResult:
  match depth:
    case 0n: insufficient(request)
    case 1n++remaining:
      dispatch(request, catalog,
        next => interpret(remaining, next, catalog),
        next => interpret(remaining, next, catalog))

# This independent recursive evaluator also enters an empty reference-list
# equation once per declaration. Count that equation explicitly; the future
# semantic-task cursor inventory does not acquire an arbitrary multiplier.
def declaration_entries(catalog: M.Catalog) -> Nat:
  match catalog:
    case M.Catalog{declarations, supporting}:
      Nat.add(
        1n,
        Nat.add(
          List.length(&2, M.Declaration, declarations),
          List.length(&2, M.Supporting, supporting)
        )
      )

def recursive_depth(+root: M.Declaration, +catalog: M.Catalog) -> Nat:
  Nat.add(M.traversal_inventory(root, catalog), declaration_entries(catalog))

def initial_state(root: M.Declaration) -> State:
  match root:
    case M.Declaration{_, identity, name, _}: State{name, [identity], [], None{}}

def analyze(+root: M.Declaration, +catalog: M.Catalog) -> NodeResult:
  as_node(
    interpret(recursive_depth(root, catalog), NodeRequest{root, initial_state(root)}, catalog)
  )

def node_slot(node: M.NodePlan) -> Nat:
  match node:
    case M.NodePlan{slot, _}: slot

def outcome(mode: M.Mode, result: NodeResult) -> Maybe<&2, M.Outcome>:
  match mode result:
    case _ DepthExhausted{}: None{}
    case M.Materialize{} NodeResult{State{_, _, _, failure}, +node, _}:
      Some{M.Outcome{node_slot(node), failure, Some{node}}}
    case M.OutcomesOnly{} NodeResult{State{_, _, _, failure}, node, _}:
      Some{M.Outcome{node_slot(node), failure, None{}}}

def main() -> Unit:
  Unit{}

def catalog_roots(catalog: M.Catalog) -> List<&2, M.Declaration>:
  match catalog:
    case M.Catalog{roots, _}: roots

# Whole-catalog projections used by the public correspondence laws.
def prepend_outcome(head: Maybe<&2, M.Outcome>, tail: Maybe<&2, List<&2, M.Outcome>>) -> Maybe<&2, List<&2, M.Outcome>>:
  match head tail:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def roots_outcomes(roots: List<&2, M.Declaration>, +catalog: M.Catalog, +mode: M.Mode) -> Maybe<&2, List<&2, M.Outcome>>:
  match roots:
    case []: Some{[]}
    case head <> tail:
      prepend_outcome(outcome(mode, analyze(head, catalog)), roots_outcomes(tail, catalog, mode))

def outcomes(+catalog: M.Catalog, mode: M.Mode) -> Maybe<&2, List<&2, M.Outcome>>:
  roots_outcomes(catalog_roots(catalog), catalog, mode)

def postfix(expression: BytesExpr) -> List<&2, M.Op>:
  match expression:
    case ArtifactBytes{slot}: [M.MeasureArtifact{slot}]
    case TextBytes{value}: [M.MeasureText{value}]
    case Literal{value}: [M.Push{value}]
    case Add{left, right}:
      List.append(&2, M.Op, postfix(left), List.append(&2, M.Op, postfix(right), [M.Add{}]))
    case Multiply{left, right}:
      List.append(&2, M.Op, postfix(left), List.append(&2, M.Op, postfix(right), [M.Multiply{}]))

def root_trace(result: NodeResult) -> Maybe<&2, List<&2, M.Op>>:
  match result:
    case DepthExhausted{}: None{}
    case NodeResult{_, _, bytes}: Some{List.append(&2, M.Op, postfix(bytes), [M.Add{}])}

def append_trace(head: Maybe<&2, List<&2, M.Op>>, tail: Maybe<&2, List<&2, M.Op>>) -> Maybe<&2, List<&2, M.Op>>:
  match head tail:
    case Some{head} Some{tail}: Some{List.append(&2, M.Op, head, tail)}
    case _ _: None{}

def roots_trace(roots: List<&2, M.Declaration>, +catalog: M.Catalog) -> Maybe<&2, List<&2, M.Op>>:
  match roots:
    case []: Some{[]}
    case head <> tail: append_trace(root_trace(analyze(head, catalog)), roots_trace(tail, catalog))

def preflight_trace(+catalog: M.Catalog) -> Maybe<&2, List<&2, M.Op>>:
  append_trace(Some{[M.Push{0n}]}, roots_trace(catalog_roots(catalog), catalog))

def node_complete(result: NodeResult) -> Bool:
  match result:
    case DepthExhausted{}: False{}
    case NodeResult{_, _, _}: True{}

def roots_complete(roots: List<&2, M.Declaration>, +catalog: M.Catalog) -> Bool:
  match roots:
    case []: True{}
    case head <> tail: Bool.and(node_complete(analyze(head, catalog)), roots_complete(tail, catalog))

def complete(+catalog: M.Catalog) -> Bool:
  roots_complete(catalog_roots(catalog), catalog)
