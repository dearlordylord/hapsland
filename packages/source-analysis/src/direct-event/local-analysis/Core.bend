import Base
import ./Model.bend as M

# Production candidate: local traversal, without importing its specification.
# Preflight operations are synchronous foreign primitives inside the existing
# analyzer lease. They create no Canonical lifecycle/checkpoint boundary.
type Purpose is Data:
  Trees{}
  Outcomes{}
  Preflight{}

type Global is Data:
  Global{
    catalog: M.Catalog,
    purpose: Purpose,
    pending: List<&2, M.Declaration>,
    reversed: List<&2, M.Outcome>,
    request: Nat
  }

type Frame is Data:
  Frame{
    slot: Nat,
    pending: List<&2, M.Reference>,
    reversed: List<&2, M.ReferencePlan>,
    site: Maybe<&2, String>
  }

type Cursor is Data:
  Cursor{
    global: Global,
    root: Nat,
    root_name: String,
    expanded: List<&2, String>,
    referenced: List<&2, String>,
    failure: Maybe<&2, M.Failure>,
    remaining: Nat,
    frames: List<&2, Frame>
  }

type Deferred is Data:
  RootNext{global: Global}
  CursorNext{cursor: Cursor}

type Step is Data:
  NextRoot{global: Global}
  Continue{cursor: Cursor}
  Engine{operation: M.Op, request: Nat, remaining: List<&2, M.Op>, next: Deferred}
  Completed{outcomes: List<&2, M.Outcome>}
  PreflightCompleted{}
  Exhausted{}
  InvalidReply{}

type Reply is Data:
  Ack{request: Nat}

def global_catalog(global: Global) -> M.Catalog:
  match global:
    case Global{catalog, _, _, _, _}: catalog

def catalog_declarations(catalog: M.Catalog) -> List<&2, M.Declaration>:
  match catalog:
    case M.Catalog{declarations, _}: declarations

def global_request(global: Global) -> Nat:
  match global:
    case Global{_, _, _, _, request}: request

def global_purpose(global: Global) -> Purpose:
  match global:
    case Global{_, purpose, _, _, _}: purpose

def global_count(global: Global, request: Nat) -> Global:
  match global:
    case Global{catalog, purpose, pending, reversed, _}: Global{
      catalog,
      purpose,
      pending,
      reversed,
      request
    }

def cursor_count(cursor: Cursor, request: Nat) -> Cursor:
  match cursor:
    case Cursor{global, root, name, expanded, referenced, failure, remaining, frames}:
      Cursor{
        global_count(global, request),
        root,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        frames
      }

def ready(next: Deferred, request: Nat) -> Step:
  match next:
    case RootNext{global}: NextRoot{global_count(global, request)}
    case CursorNext{cursor}: Continue{cursor_count(cursor, request)}

def schedule(operations: List<&2, M.Op>, next: Deferred, request: Nat) -> Step:
  match operations:
    case []: ready(next, request)
    case head <> tail: Engine{head, request, tail, next}

def preflight_ops(purpose: Purpose, operations: List<&2, M.Op>) -> List<&2, M.Op>:
  match purpose:
    case Preflight{}: operations
    case _: []

def cursor_ops(cursor: Cursor, operations: List<&2, M.Op>) -> Step:
  match cursor:
    case Cursor{+global, root, name, expanded, referenced, failure, remaining, frames}:
      schedule(
        preflight_ops(global_purpose(global), operations),
        CursorNext{Cursor{global, root, name, expanded, referenced, failure, remaining, frames}},
        global_request(global)
      )

def contains_selected(same: Bool, next: Unit -> Bool) -> Bool:
  match same:
    case True{}: True{}
    case False{}: next(Unit{})

def contains(+key: String, values: List<&2, String>) -> Bool:
  match values:
    case []: False{}
    case head <> tail: contains_selected(String.eq(key, head), _ => contains(key, tail))

def insert_selected(already: Bool, key: String, values: List<&2, String>) -> List<&2, String>:
  match already:
    case True{}: values
    case False{}: key <> values

def insert(+key: String, +values: List<&2, String>) -> List<&2, String>:
  insert_selected(contains(key, values), key, values)

def declaration_identity(declaration: M.Declaration) -> String:
  match declaration:
    case M.Declaration{_, identity, _, _}: identity

def declaration_name(declaration: M.Declaration) -> String:
  match declaration:
    case M.Declaration{_, _, name, _}: name

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

def lookup_supporting(
  +key: String,
  supporting: List<&2, M.Supporting>,
  found: Maybe<&2, M.Declaration>
) -> Maybe<&2, M.Declaration>:
  match supporting:
    case []: found
    case M.Supporting{candidate, declaration} <> tail:
      lookup_supporting(
        key,
        tail,
        Bool.pick(Maybe<&2, M.Declaration>, String.eq(key, candidate), Some{declaration}, found)
      )

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

def reference_names(
  root: String,
  +symbol: String,
  target_id: Maybe<&2, String>,
  +referenced: List<&2, String>
) -> List<&2, String>:
  Bool.pick(
    List<&2, String>,
    String.eq(root, symbol),
    referenced,
    insert(reference_key(symbol, target_id), referenced)
  )

def first_failure(current: Maybe<&2, M.Failure>, failure: M.Failure) -> Maybe<&2, M.Failure>:
  match current:
    case None{}: Some{failure}
    case Some{value}: Some{value}

def fail(cursor: Cursor, failure: M.Failure) -> Cursor:
  match cursor:
    case Cursor{global, root, name, expanded, referenced, current, remaining, frames}:
      Cursor{
        global,
        root,
        name,
        expanded,
        referenced,
        first_failure(current, failure),
        remaining,
        frames
      }

def keep_reference(
  purpose: Purpose,
  reference: M.ReferencePlan,
  reversed: List<&2, M.ReferencePlan>
) -> List<&2, M.ReferencePlan>:
  match purpose:
    case Trees{}: reference <> reversed
    case _: reversed

def append_reference(
  cursor: Cursor,
  reference: M.ReferencePlan,
  operations: List<&2, M.Op>
) -> Step:
  match cursor:
    case Cursor{
      +global,
      root,
      name,
      expanded,
      referenced,
      failure,
      remaining,
      Frame{slot, pending, reversed, site} <> parents
    }:
      cursor_ops(
        Cursor{
          global,
          root,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          Frame{
            slot,
            pending,
            keep_reference(global_purpose(global), reference, reversed),
            site
          } <> parents
        },
        operations
      )
    case _: InvalidReply{}

def omitted_target(target: Maybe<&2, M.Declaration>) -> Maybe<&2, String>:
  match target:
    case None{}: None{}
    case Some{M.Declaration{_, identity, _, _}}: Some{identity}

def target_operation(target: Maybe<&2, M.Declaration>) -> M.Op:
  match target:
    case None{}: M.Push{0n}
    case Some{M.Declaration{_, identity, _, _}}: M.MeasureText{identity}

def node_operations(purpose: Purpose, slot: Nat) -> List<&2, M.Op>:
  match purpose:
    case Preflight{}: [M.MeasureArtifact{slot}, M.Push{512n}, M.Add{}]
    case _: []

def finish_operations(purpose: Purpose) -> List<&2, M.Op>:
  match purpose:
    case Preflight{}: [M.Add{}]
    case _: []

def initial_operations(purpose: Purpose) -> List<&2, M.Op>:
  match purpose:
    case Preflight{}: [M.Push{0n}]
    case _: []

def edge_operations(
  purpose: Purpose,
  symbol: String,
  target: Maybe<&2, M.Declaration>
) -> List<&2, M.Op>:
  match purpose:
    case Preflight{}:
      [
        M.Push{512n},
        M.Push{2n},
        M.MeasureText{symbol},
        M.Multiply{},
        M.Add{},
        target_operation(target),
        M.Add{},
        M.Add{}
      ]
    case _: []

def child_operations(purpose: Purpose, operations: List<&2, M.Op>, slot: Nat) -> List<&2, M.Op>:
  match purpose:
    case Preflight{}: List.append(&2, M.Op, operations, node_operations(Preflight{}, slot))
    case _: []

def cursor_purpose(cursor: Cursor) -> Purpose:
  match cursor:
    case Cursor{global, _, _, _, _, _, _, _}: global_purpose(global)

def enter_child(
  remaining: Nat,
  cursor: Cursor,
  declaration: M.Declaration,
  symbol: String,
  operations: List<&2, M.Op>
) -> Step:
  match remaining cursor declaration:
    case 0n _ _: Exhausted{}
    case 1n+rest Cursor{+global, root, name, expanded, referenced, failure, _, parents} M.Declaration{
      +slot,
      +identity,
      _,
      references
    }:
      cursor_ops(Cursor{global, root, name, identity <> expanded, referenced, failure, rest,
        Frame{slot, references, [], Some{symbol}} <> parents},
        child_operations(global_purpose(global), operations, slot))

def named_seen(
  already: Bool,
  cursor: Cursor,
  +target: M.Declaration,
  symbol: String,
  operations: List<&2, M.Op>,
  remaining: Nat
) -> Step:
  match already:
    case True{}: append_reference(
      cursor,
      M.Included{symbol, declaration_identity(target)},
      operations
    )
    case False{}: enter_child(remaining, cursor, target, symbol, operations)
def named_target(
  target: Maybe<&2, M.Declaration>,
  +cursor: Cursor,
  symbol: String,
  operations: List<&2, M.Op>,
  +expanded: List<&2, String>,
  remaining: Nat
) -> Step:
  match target:
    case None{}: append_reference(
      fail(cursor, M.MissingEvidence{}),
      M.Omitted{symbol, None{}, M.Unresolved{}},
      operations
    )
    case Some{+target}: named_seen(
      contains(declaration_identity(target), expanded),
      cursor,
      target,
      symbol,
      operations,
      remaining
    )

def named_limit(
  limited: Bool,
  +target: Maybe<&2, M.Declaration>,
  cursor: Cursor,
  symbol: String,
  operations: List<&2, M.Op>,
  expanded: List<&2, String>,
  remaining: Nat
) -> Step:
  match limited:
    case True{}: append_reference(
      fail(cursor, M.ReferenceLimit{}),
      M.Omitted{symbol, omitted_target(target), M.LimitExceeded{}},
      operations
    )
    case False{}: named_target(target, cursor, symbol, operations, expanded, remaining)

def named_recorded(cursor: Cursor, +target: Maybe<&2, M.Declaration>, +symbol: String) -> Step:
  match cursor:
    case Cursor{+global, root, name, +expanded, +referenced, failure, +remaining, frames}:
      named_limit(Nat.is_gt(List.length(&2, String, referenced), 16n), target,
        Cursor{global, root, name, expanded, referenced, failure, remaining, frames}, symbol,
        edge_operations(global_purpose(global), symbol, target), expanded, remaining)

def visit_reference(reference: M.Reference, cursor: Cursor) -> Step:
  match reference cursor:
    case M.Unsupported{+symbol} +cursor:
      append_reference(
        fail(cursor, M.UnsupportedReference{}),
        M.Omitted{symbol, None{}, M.UnsupportedSyntax{}},
        edge_operations(cursor_purpose(cursor), symbol, None{})
      )
    case M.Named{+symbol, +target_id} Cursor{
      +global,
      root,
      +name,
      expanded,
      referenced,
      failure,
      remaining,
      frames
    }:
      named_recorded(
        Cursor{
          global,
          root,
          name,
          expanded,
          reference_names(name, symbol, target_id, referenced),
          failure,
          remaining,
          frames
        },
        lookup(global_catalog(global), symbol, target_id),
        symbol
      )

def finish_global(global: Global) -> Step:
  match global:
    case Global{_, Preflight{}, _, _, _}: PreflightCompleted{}
    case Global{_, _, _, reversed, _}: Completed{List.reverse(&2, M.Outcome, reversed)}

def outcome_tree(
  purpose: Purpose,
  slot: Nat,
  reversed: List<&2, M.ReferencePlan>
) -> Maybe<&2, M.NodePlan>:
  match purpose:
    case Trees{}: Some{M.NodePlan{slot, List.reverse(&2, M.ReferencePlan, reversed)}}
    case _: None{}

def save_outcome(
  purpose: Purpose,
  outcome: M.Outcome,
  reversed: List<&2, M.Outcome>
) -> List<&2, M.Outcome>:
  match purpose:
    case Preflight{}: reversed
    case _: outcome <> reversed

def finish_root(cursor: Cursor, reversed: List<&2, M.ReferencePlan>) -> Step:
  match cursor:
    case Cursor{
      Global{catalog, +purpose, pending, outcomes, +request},
      +root,
      _,
      _,
      _,
      failure,
      _,
      _
    }:
      schedule(
        finish_operations(purpose),
        RootNext{
          Global{
            catalog,
            purpose,
            pending,
            save_outcome(
              purpose,
              M.Outcome{root, failure, outcome_tree(purpose, root, reversed)},
              outcomes
            ),
            request
          }
        },
        request
      )

def finish_child(+cursor: Cursor, tree: Maybe<&2, M.NodePlan>, symbol: String) -> Step:
  match tree:
    case None{}: cursor_ops(cursor, finish_operations(cursor_purpose(cursor)))
    case Some{node}: append_reference(
      cursor,
      M.Expanded{symbol, node},
      finish_operations(cursor_purpose(cursor))
    )

def finish_frame(cursor: Cursor, frame: Frame, parents: List<&2, Frame>) -> Step:
  match cursor frame:
    case Cursor{+global, root, name, expanded, referenced, failure, remaining, _} Frame{
      slot,
      _,
      reversed,
      None{}
    }:
      finish_root(
        Cursor{global, root, name, expanded, referenced, failure, remaining, parents},
        reversed
      )
    case Cursor{+global, root, name, expanded, referenced, failure, remaining, _} Frame{
      +slot,
      _,
      reversed,
      Some{symbol}
    }:
      finish_child(Cursor{global, root, name, expanded, referenced, failure, remaining, parents},
        outcome_tree(global_purpose(global), slot, reversed), symbol)

def visit_pending(
  remaining: Nat,
  cursor: Cursor,
  reference: M.Reference,
  frame: Frame,
  parents: List<&2, Frame>
) -> Step:
  match remaining cursor:
    case 0n _: Exhausted{}
    case 1n+rest Cursor{global, root, name, expanded, referenced, failure, _, _}:
      visit_reference(
        reference,
        Cursor{global, root, name, expanded, referenced, failure, rest, frame <> parents}
      )

def advance_cursor(cursor: Cursor) -> Step:
  match cursor:
    case Cursor{
      global,
      root,
      name,
      expanded,
      referenced,
      failure,
      +remaining,
      Frame{slot, [], reversed, site} <> parents
    }:
      finish_frame(
        Cursor{global, root, name, expanded, referenced, failure, remaining, []},
        Frame{slot, [], reversed, site},
        parents
      )
    case Cursor{
      global,
      root,
      name,
      expanded,
      referenced,
      failure,
      +remaining,
      Frame{slot, head <> tail, reversed, site} <> parents
    }:
      visit_pending(
        remaining,
        Cursor{global, root, name, expanded, referenced, failure, remaining, []},
        head,
        Frame{slot, tail, reversed, site},
        parents
      )
    case _: InvalidReply{}

def start_root(remaining: Nat, +global: Global, declaration: M.Declaration) -> Step:
  match remaining declaration:
    case 0n _: Exhausted{}
    case 1n+rest M.Declaration{+slot, identity, name, references}:
      cursor_ops(
        Cursor{
          global,
          slot,
          name,
          [identity],
          [],
          None{},
          rest,
          [Frame{slot, references, [], None{}}]
        },
        node_operations(global_purpose(global), slot)
      )

def next_root(global: Global) -> Step:
  match global:
    case Global{catalog, purpose, [], reversed, request}: finish_global(
      Global{catalog, purpose, [], reversed, request}
    )
    case Global{+catalog, purpose, +head <> tail, reversed, request}:
      start_root(
        M.traversal_inventory(head, catalog),
        Global{catalog, purpose, tail, reversed, request},
        head
      )

def initial(+catalog: M.Catalog, +purpose: Purpose) -> Step:
  schedule(
    initial_operations(purpose),
    RootNext{Global{catalog, purpose, catalog_declarations(catalog), [], 0n}},
    0n
  )

def advance(step: Step) -> Step:
  match step:
    case Continue{cursor}: advance_cursor(cursor)
    case NextRoot{global}: next_root(global)
    case other: other

def acknowledge(same: Bool, remaining: List<&2, M.Op>, next: Deferred, request: Nat) -> Step:
  match same:
    case False{}: InvalidReply{}
    case True{}: schedule(remaining, next, Nat.add(request, 1n))

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Engine{_, +request, remaining, next} Ack{actual}:
      acknowledge(Nat.is_eq(request, actual), remaining, next, request)
    case _ _: InvalidReply{}

def main() -> Unit:
  Unit{}
