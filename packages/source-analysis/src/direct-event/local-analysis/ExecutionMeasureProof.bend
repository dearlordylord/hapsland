import Base
import ./Model.bend as M
import ./Core.bend as C
import ./JointStep.bend as Step
import ./JointStepProof.bend as StepProof
import ./ExecutionMeasure.bend as Measure
import ./Execution.bend as E
import ./WeightedInventory.bend as W
import ./Potential.bend as P
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N

# Request correlation changes no traversal or command resource.
def recount(+actual: C.Cursor, +request: Nat) -> {
  Measure.cursor(C.cursor_count(actual, request)) == Measure.cursor(actual) : Nat
}:
  match actual:
    case C.Cursor{C.Global{_, _, _, _, _}, _, _, _, _, _, _, _}: {==}

def ready(+next: C.Deferred, +request: Nat) -> {
  Measure.measure(C.ready(next, request)) == Measure.deferred(next) : Nat
}:
  match next:
    case C.RootNext{_}: {==}
    case C.CursorNext{actual}: recount(actual, request)

def schedule(+operations: List<&2, M.Op>, +next: C.Deferred, +request: Nat) -> {
  Measure.measure(C.schedule(operations, next, request))
    == Nat.add(List.length(&2, M.Op, operations), Measure.deferred(next)) : Nat
}:
  match operations:
    case Nil{}: ready(next, request)
    case _ <> _: {==}

# This applies to every actual Engine shape, including its final Ack into a
# cursor or completed root. No positive budget or ghost premise is needed.
def engine_decreases(
  +operation: M.Op,
  +request: Nat,
  +remaining: List<&2, M.Op>,
  +next: C.Deferred
) -> {
  Nat.is_le(1n+Measure.measure(Step.advance(C.Engine{operation, request, remaining, next})),
    Measure.measure(C.Engine{operation, request, remaining, next})) == True{} : Bool
}:
  %Equal.sym(
    C.Step,
    Step.advance(C.Engine{operation, request, remaining, next}),
    C.schedule(remaining, next, Nat.add(request, 1n)),
    StepProof.ack_step(operation, request, remaining, next)
  ) : {
      Nat.is_le(
        1n+Measure.measure(_),
        Measure.measure(C.Engine{operation, request, remaining, next})
      )
      == True{}
      : Bool
    }
  %Equal.sym(
    Nat,
    Measure.measure(C.schedule(remaining, next, Nat.add(request, 1n))),
    Nat.add(List.length(&2, M.Op, remaining), Measure.deferred(next)),
    schedule(remaining, next, Nat.add(request, 1n))
  ) : {
      Nat.is_le(1n+_, Measure.measure(C.Engine{operation, request, remaining, next}))
      == True{}
      : Bool
    }
  N.le_refl(1n+Nat.add(List.length(&2, M.Op, remaining), Measure.deferred(next)))

def cursor_ops(+actual: C.Cursor, +operations: List<&2, M.Op>) -> {
  Measure.measure(C.cursor_ops(actual, operations))
  == Nat.add(
    List.length(&2, M.Op, C.preflight_ops(C.cursor_purpose(actual), operations)),
    Measure.cursor(actual)
  )
  : Nat
}:
  match actual:
    case C.Cursor{
      C.Global{+catalog, +purpose, +pending, +outcomes, +request},
      +slot,
      +name,
      +expanded,
      +referenced,
      +failure,
      +remaining,
      +frames
    }:
      schedule(
        C.preflight_ops(purpose, operations),
        C.CursorNext{
          C.Cursor{
            C.Global{catalog, purpose, pending, outcomes, request},
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            frames
          }
        },
        request
      )

def append_reference(
  +actual: C.Cursor,
  +reference: M.ReferencePlan,
  +operations: List<&2, M.Op>
) -> N.le(
  Measure.measure(C.append_reference(actual, reference, operations)),
  Nat.add(
    List.length(&2, M.Op, C.preflight_ops(C.cursor_purpose(actual), operations)),
    Measure.cursor(actual)
  )
):
  match actual:
    case C.Cursor{
      +global,
      +slot,
      +name,
      +expanded,
      +referenced,
      +failure,
      +remaining,
      C.Frame{+frame_slot, +pending, +reversed, +site} <> +parents
    }:
      %Equal.sym(
        Nat,
        Measure.measure(
          C.cursor_ops(
            C.Cursor{
              global,
              slot,
              name,
              expanded,
              referenced,
              failure,
              remaining,
              C.Frame{
                frame_slot,
                pending,
                C.keep_reference(C.global_purpose(global), reference, reversed),
                site
              } <> parents
            },
            operations
          )
        ),
        Nat.add(
          List.length(&2, M.Op, C.preflight_ops(C.global_purpose(global), operations)),
          Measure.cursor(
            C.Cursor{
              global,
              slot,
              name,
              expanded,
              referenced,
              failure,
              remaining,
              C.Frame{frame_slot, pending, reversed, site} <> parents
            }
          )
        ),
        cursor_ops(
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            C.Frame{
              frame_slot,
              pending,
              C.keep_reference(C.global_purpose(global), reference, reversed),
              site
            } <> parents
          },
          operations
        )
      ) :
        N.le(
          _,
          Nat.add(
            List.length(&2, M.Op, C.preflight_ops(C.global_purpose(global), operations)),
            Measure.cursor(actual)
          )
        )
      N.le_refl(
        Nat.add(
          List.length(&2, M.Op, C.preflight_ops(C.global_purpose(global), operations)),
          Measure.cursor(actual)
        )
      )
    case C.Cursor{global, slot, name, expanded, referenced, failure, remaining, Nil{}}:
      N.zero_le(
        Nat.add(
          List.length(&2, M.Op, C.preflight_ops(C.global_purpose(global), operations)),
          Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, []})
        )
      )

def edge_length(+purpose: C.Purpose, +symbol: String, +target: Maybe<&2, M.Declaration>) -> N.le(
  List.length(&2, M.Op, C.preflight_ops(purpose, C.edge_operations(purpose, symbol, target))), 8n):
  match purpose:
    case C.Preflight{}: {==}
    case C.Trees{}: {==}
    case C.Outcomes{}: {==}

def append_edge(
  +actual: C.Cursor,
  +reference: M.ReferencePlan,
  +symbol: String,
  +target: Maybe<&2, M.Declaration>
) -> N.le(
  Measure.measure(
    C.append_reference(
      actual,
      reference,
      C.edge_operations(C.cursor_purpose(actual), symbol, target)
    )
  ),
  8n+Measure.cursor(actual)
):
  N.le_trans(
    Measure.measure(
      C.append_reference(
        actual,
        reference,
        C.edge_operations(C.cursor_purpose(actual), symbol, target)
      )
    ),
    Nat.add(
      List.length(
        &2,
        M.Op,
        C.preflight_ops(
          C.cursor_purpose(actual),
          C.edge_operations(C.cursor_purpose(actual), symbol, target)
        )
      ),
      Measure.cursor(actual)
    ),
    8n+Measure.cursor(actual),
    append_reference(
      actual,
      reference,
      C.edge_operations(C.cursor_purpose(actual), symbol, target)
    ),
    N.add_le_add_right(
      List.length(
        &2,
        M.Op,
        C.preflight_ops(
          C.cursor_purpose(actual),
          C.edge_operations(C.cursor_purpose(actual), symbol, target)
        )
      ),
      8n,
      Measure.cursor(actual),
      edge_length(C.cursor_purpose(actual), symbol, target)
    )
  )

def failed_resource(+actual: C.Cursor, +failure: M.Failure) -> {
  Measure.cursor(C.fail(actual, failure)) == Measure.cursor(actual) : Nat
}:
  match actual:
    case C.Cursor{_, _, _, _, _, _, _, _}: {==}

def failed_purpose(+actual: C.Cursor, +failure: M.Failure) -> {
  C.cursor_purpose(C.fail(actual, failure)) == C.cursor_purpose(actual) : C.Purpose
}:
  match actual:
    case C.Cursor{_, _, _, _, _, _, _, _}: {==}

def failed_edge(
  +actual: C.Cursor,
  +failure: M.Failure,
  +reference: M.ReferencePlan,
  +symbol: String,
  +target: Maybe<&2, M.Declaration>
) -> N.le(
  Measure.measure(
    C.append_reference(
      C.fail(actual, failure),
      reference,
      C.edge_operations(C.cursor_purpose(actual), symbol, target)
    )
  ),
  8n+Measure.cursor(actual)
):
  %failed_resource(actual, failure) :
    N.le(
      Measure.measure(
        C.append_reference(
          C.fail(actual, failure),
          reference,
          C.edge_operations(C.cursor_purpose(actual), symbol, target)
        )
      ),
      8n+_
    )
  %failed_purpose(actual, failure) :
    N.le(
      Measure.measure(
        C.append_reference(C.fail(actual, failure), reference, C.edge_operations(_, symbol, target))
      ),
      8n+Measure.cursor(C.fail(actual, failure))
    )
  append_edge(C.fail(actual, failure), reference, symbol, target)

def finish_length(+purpose: C.Purpose) -> N.le(
  List.length(&2, M.Op, C.preflight_ops(purpose, C.finish_operations(purpose))), 1n):
  match purpose:
    case C.Preflight{}: {==}
    case C.Trees{}: {==}
    case C.Outcomes{}: {==}

def finish_ops(+actual: C.Cursor) -> N.le(
  Measure.measure(C.cursor_ops(actual, C.finish_operations(C.cursor_purpose(actual)))),
  1n+Measure.cursor(actual)
):
  %Equal.sym(
    Nat,
    Measure.measure(C.cursor_ops(actual, C.finish_operations(C.cursor_purpose(actual)))),
    Nat.add(
      List.length(
        &2,
        M.Op,
        C.preflight_ops(C.cursor_purpose(actual), C.finish_operations(C.cursor_purpose(actual)))
      ),
      Measure.cursor(actual)
    ),
    cursor_ops(actual, C.finish_operations(C.cursor_purpose(actual)))
  ) : N.le(_, 1n+Measure.cursor(actual))
  N.add_le_add_right(
    List.length(
      &2,
      M.Op,
      C.preflight_ops(C.cursor_purpose(actual), C.finish_operations(C.cursor_purpose(actual)))
    ),
    1n,
    Measure.cursor(actual),
    finish_length(C.cursor_purpose(actual))
  )

def finish_child(+actual: C.Cursor, +tree: Maybe<&2, M.NodePlan>, +symbol: String) -> N.le(
  Measure.measure(C.finish_child(actual, tree, symbol)), 1n+Measure.cursor(actual)):
  match tree:
    case None{}: finish_ops(actual)
    case Some{+node}:
      N.le_trans(
        Measure.measure(
          C.append_reference(
            actual,
            M.Expanded{symbol, node},
            C.finish_operations(C.cursor_purpose(actual))
          )
        ),
        Nat.add(
          List.length(
            &2,
            M.Op,
            C.preflight_ops(C.cursor_purpose(actual), C.finish_operations(C.cursor_purpose(actual)))
          ),
          Measure.cursor(actual)
        ),
        1n+Measure.cursor(actual),
        append_reference(
          actual,
          M.Expanded{symbol, node},
          C.finish_operations(C.cursor_purpose(actual))
        ),
        N.add_le_add_right(
          List.length(
            &2,
            M.Op,
            C.preflight_ops(C.cursor_purpose(actual), C.finish_operations(C.cursor_purpose(actual)))
          ),
          1n,
          Measure.cursor(actual),
          finish_length(C.cursor_purpose(actual))
        )
      )

def finish_root(+actual: C.Cursor, +reversed: List<&2, M.ReferencePlan>) -> N.le(
  Measure.measure(C.finish_root(actual, reversed)), 1n):
  match actual:
    case C.Cursor{C.Global{_, C.Preflight{}, _, _, _}, _, _, _, _, _, _, _}: {==}
    case C.Cursor{C.Global{_, C.Trees{}, _, _, _}, _, _, _, _, _, _, _}: {==}
    case C.Cursor{C.Global{_, C.Outcomes{}, _, _, _}, _, _, _, _, _, _, _}: {==}

# The root-start bound uses the existing weighted catalog, including duplicate
# entries. No uniqueness, successful Spec run or caller budget is assumed.
def fresh_bounded(+seen: Bool, +declaration: M.Declaration) -> N.le(
  W.fresh_weight(~E.declaration_weight, seen, declaration), E.declaration_weight(declaration)):
  match seen:
    case True{}: N.zero_le(E.declaration_weight(declaration))
    case False{}: N.le_refl(E.declaration_weight(declaration))

def declarations_bounded(+items: List<&2, M.Declaration>, +expanded: List<&2, String>) -> N.le(
  W.declarations_unvisited(~E.declaration_weight, items, expanded), E.declarations_weight(items)):
  match items:
    case Nil{}: {==}
    case +head <> +tail:
      N.add_le_add(
        W.fresh_weight(
          ~E.declaration_weight,
          C.contains(C.declaration_identity(head), expanded),
          head
        ),
        W.declarations_unvisited(~E.declaration_weight, tail, expanded),
        E.declaration_weight(head),
        E.declarations_weight(tail),
        fresh_bounded(C.contains(C.declaration_identity(head), expanded), head),
        declarations_bounded(tail, expanded)
      )

def supporting_bounded(+items: List<&2, M.Supporting>, +expanded: List<&2, String>) -> N.le(
  W.supporting_unvisited(~E.declaration_weight, items, expanded), E.supporting_weight(items)):
  match items:
    case Nil{}: {==}
    case M.Supporting{_, +head} <> +tail:
      N.add_le_add(
        W.fresh_weight(
          ~E.declaration_weight,
          C.contains(C.declaration_identity(head), expanded),
          head
        ),
        W.supporting_unvisited(~E.declaration_weight, tail, expanded),
        E.declaration_weight(head),
        E.supporting_weight(tail),
        fresh_bounded(C.contains(C.declaration_identity(head), expanded), head),
        supporting_bounded(tail, expanded)
      )

def catalog_bounded(
  +declarations: List<&2, M.Declaration>,
  +supporting: List<&2, M.Supporting>,
  +expanded: List<&2, String>
) -> N.le(
  W.catalog_unvisited(~E.declaration_weight, M.Catalog{declarations, supporting}, expanded),
  Nat.add(E.declarations_weight(declarations), E.supporting_weight(supporting))):
  N.add_le_add(
    W.declarations_unvisited(~E.declaration_weight, declarations, expanded),
    W.supporting_unvisited(~E.declaration_weight, supporting, expanded),
    E.declarations_weight(declarations),
    E.supporting_weight(supporting),
    declarations_bounded(declarations, expanded),
    supporting_bounded(supporting, expanded)
  )

def reserve_two(+a: Nat, +b: Nat) -> {Nat.add(a, Nat.add(b, 2n)) == 2n+Nat.add(a, b) : Nat}:
  Equal.trans(Nat, Nat.add(a, Nat.add(b, 2n)), Nat.add(Nat.add(a, b), 2n), 2n+Nat.add(a, b),
    Equal.sym(Nat, Nat.add(Nat.add(a, b), 2n), Nat.add(a, Nat.add(b, 2n)), N.add_assoc(a, b, 2n)),
    N.add_comm(Nat.add(a, b), 2n))

def entry_bound(+purpose: C.Purpose, +references: Nat, +unvisited: Nat, +total: Nat,
  bound: N.le(unvisited, total)) -> N.le(
    Nat.add(
      List.length(&2, M.Op, C.node_operations(purpose, 0n)),
      Nat.add(Nat.mul(9n, references), Nat.add(unvisited, 2n))
    ),
    5n+Nat.add(Nat.mul(9n, references), total)
  ):
  match purpose:
    case C.Preflight{}:
      %Equal.sym(
        Nat,
        Nat.add(Nat.mul(9n, references), Nat.add(unvisited, 2n)),
        2n+Nat.add(Nat.mul(9n, references), unvisited),
        reserve_two(Nat.mul(9n, references), unvisited)
      ) :
        N.le(3n+_, 5n+Nat.add(Nat.mul(9n, references), total))
      N.add_le_add_left(
        Nat.add(Nat.mul(9n, references), unvisited),
        Nat.add(Nat.mul(9n, references), total),
        5n,
        N.add_le_add_left(unvisited, total, Nat.mul(9n, references), bound)
      )
    case C.Trees{}:
      %Equal.sym(
        Nat,
        Nat.add(Nat.mul(9n, references), Nat.add(unvisited, 2n)),
        2n+Nat.add(Nat.mul(9n, references), unvisited),
        reserve_two(Nat.mul(9n, references), unvisited)
      ) :
        N.le(_, 5n+Nat.add(Nat.mul(9n, references), total))
      N.le_trans(
        2n+Nat.add(Nat.mul(9n, references), unvisited),
        2n+Nat.add(Nat.mul(9n, references), total),
        5n+Nat.add(Nat.mul(9n, references), total),
        N.add_le_add_left(
          Nat.add(Nat.mul(9n, references), unvisited),
          Nat.add(Nat.mul(9n, references), total),
          2n,
          N.add_le_add_left(unvisited, total, Nat.mul(9n, references), bound)
        ),
        N.add_le_add(
          2n,
          Nat.add(Nat.mul(9n, references), total),
          5n,
          Nat.add(Nat.mul(9n, references), total),
          {==},
          N.le_refl(Nat.add(Nat.mul(9n, references), total))
        )
      )
    case C.Outcomes{}:
      %Equal.sym(
        Nat,
        Nat.add(Nat.mul(9n, references), Nat.add(unvisited, 2n)),
        2n+Nat.add(Nat.mul(9n, references), unvisited),
        reserve_two(Nat.mul(9n, references), unvisited)
      ) :
        N.le(_, 5n+Nat.add(Nat.mul(9n, references), total))
      N.le_trans(
        2n+Nat.add(Nat.mul(9n, references), unvisited),
        2n+Nat.add(Nat.mul(9n, references), total),
        5n+Nat.add(Nat.mul(9n, references), total),
        N.add_le_add_left(
          Nat.add(Nat.mul(9n, references), unvisited),
          Nat.add(Nat.mul(9n, references), total),
          2n,
          N.add_le_add_left(unvisited, total, Nat.mul(9n, references), bound)
        ),
        N.add_le_add(
          2n,
          Nat.add(Nat.mul(9n, references), total),
          5n,
          Nat.add(Nat.mul(9n, references), total),
          {==},
          N.le_refl(Nat.add(Nat.mul(9n, references), total))
        )
      )

def popped_numeric(+a: Nat, +b: Nat, +count: Nat) -> {
  Nat.add(a, Nat.add(b, Nat.mul(2n, 1n+count)))
    == 2n+Nat.add(a, Nat.add(b, Nat.mul(2n, count))) : Nat
}:
  %Equal.sym(Nat, Nat.mul(2n, 1n+count), Nat.add(Nat.mul(2n, count), 2n), N.mul_succ(2n, count)) :
    {Nat.add(a, Nat.add(b, _)) == 2n+Nat.add(a, Nat.add(b, Nat.mul(2n, count))) : Nat}
  %N.add_assoc(b, Nat.mul(2n, count), 2n) :
    {Nat.add(a, _) == 2n+Nat.add(a, Nat.add(b, Nat.mul(2n, count))) : Nat}
  reserve_two(a, Nat.add(b, Nat.mul(2n, count)))

def popped_cursor(
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>
) -> {
    Measure.cursor(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{frame_slot, [], reversed, site} <> parents
      }
    )
    == 2n+Measure.cursor(
      C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents}
    )
    : Nat
  }:
  popped_numeric(
    Nat.mul(9n, P.pending_references(parents)),
    W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), expanded),
    List.length(&2, C.Frame, parents)
  )

def initial_numeric(+purpose: C.Purpose, +references: Nat, +unvisited: Nat, +total: Nat,
  bound: N.le(unvisited, total)) -> N.le(
    Nat.add(
      List.length(&2, M.Op, C.node_operations(purpose, 0n)),
      Nat.add(Nat.mul(9n, Nat.add(references, 0n)), Nat.add(unvisited, 2n))
    ),
    5n+Nat.add(Nat.mul(9n, references), total)
  ):
  %Equal.sym(Nat, Nat.add(references, 0n), references, N.add_zero(references)) :
    N.le(
      Nat.add(
        List.length(&2, M.Op, C.node_operations(purpose, 0n)),
        Nat.add(Nat.mul(9n, _), Nat.add(unvisited, 2n))
      ),
      5n+Nat.add(Nat.mul(9n, references), total)
    )
  entry_bound(purpose, references, unvisited, total, bound)

def finished_frame(
  +global: C.Global,
  +slot: Nat,
  +name: String,
  +expanded: List<&2, String>,
  +referenced: List<&2, String>,
  +failure: Maybe<&2, M.Failure>,
  +remaining: Nat,
  +frame_slot: Nat,
  +reversed: List<&2, M.ReferencePlan>,
  +site: Maybe<&2, String>,
  +parents: List<&2, C.Frame>
) -> N.le(
    1n+Measure.measure(
      Step.advance(
        C.Continue{
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            C.Frame{frame_slot, [], reversed, site} <> parents
          }
        }
      )
    ),
    Measure.cursor(
      C.Cursor{
        global,
        slot,
        name,
        expanded,
        referenced,
        failure,
        remaining,
        C.Frame{frame_slot, [], reversed, site} <> parents
      }
    )
  ):
  match site:
    case None{}:
      %Equal.sym(
        Nat,
        Measure.cursor(
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            C.Frame{frame_slot, [], reversed, None{}} <> parents
          }
        ),
        2n+Measure.cursor(
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents}
        ),
        popped_cursor(
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          frame_slot,
          reversed,
          None{},
          parents
        )
      ) :
        N.le(
          1n+Measure.measure(
            Step.advance(
              C.Continue{
                C.Cursor{
                  global,
                  slot,
                  name,
                  expanded,
                  referenced,
                  failure,
                  remaining,
                  C.Frame{frame_slot, [], reversed, None{}} <> parents
                }
              }
            )
          ),
          _
        )
      N.le_trans(
        1n+Measure.measure(
          C.finish_root(
            C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents},
            reversed
          )
        ),
        2n,
        2n+Measure.cursor(
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents}
        ),
        N.succ_le_succ(
          Measure.measure(
            C.finish_root(
              C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents},
              reversed
            )
          ),
          1n,
          finish_root(
            C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents},
            reversed
          )
        ),
        N.add_le_add_left(
          0n,
          Measure.cursor(
            C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents}
          ),
          2n,
          N.zero_le(
            Measure.cursor(
              C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents}
            )
          )
        )
      )
    case Some{+symbol}:
      %Equal.sym(
        Nat,
        Measure.cursor(
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            remaining,
            C.Frame{frame_slot, [], reversed, Some{symbol}} <> parents
          }
        ),
        2n+Measure.cursor(
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents}
        ),
        popped_cursor(
          global,
          slot,
          name,
          expanded,
          referenced,
          failure,
          remaining,
          frame_slot,
          reversed,
          Some{symbol},
          parents
        )
      ) :
        N.le(
          1n+Measure.measure(
            Step.advance(
              C.Continue{
                C.Cursor{
                  global,
                  slot,
                  name,
                  expanded,
                  referenced,
                  failure,
                  remaining,
                  C.Frame{frame_slot, [], reversed, Some{symbol}} <> parents
                }
              }
            )
          ),
          _
        )
      N.succ_le_succ(
        Measure.measure(
          C.finish_child(
            C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents},
            C.outcome_tree(C.global_purpose(global), frame_slot, reversed),
            symbol
          )
        ),
        1n+Measure.cursor(
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents}
        ),
        finish_child(
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, parents},
          C.outcome_tree(C.global_purpose(global), frame_slot, reversed),
          symbol
        )
      )

def initial_bound(+root: M.Declaration, +invocation: C.Global) -> {
  Nat.is_le(
    Measure.measure(
      C.start_root(M.traversal_inventory(root, C.global_catalog(invocation)), invocation, root)
    ),
    Nat.sub(E.root_weight(root, C.global_catalog(invocation)), 1n)
  )
  == True{}
  : Bool
}:
  match root invocation:
    case M.Declaration{_, identity, _, references} C.Global{
      M.Catalog{declarations, supporting},
      C.Preflight{},
      _,
      _,
      _
    }:
      initial_numeric(
        C.Preflight{},
        List.length(&2, M.Reference, references),
        W.catalog_unvisited(~E.declaration_weight, M.Catalog{declarations, supporting}, [identity]),
        Nat.add(E.declarations_weight(declarations), E.supporting_weight(supporting)),
        catalog_bounded(declarations, supporting, [identity])
      )
    case M.Declaration{_, identity, _, references} C.Global{
      M.Catalog{declarations, supporting},
      C.Trees{},
      _,
      _,
      _
    }:
      initial_numeric(
        C.Trees{},
        List.length(&2, M.Reference, references),
        W.catalog_unvisited(~E.declaration_weight, M.Catalog{declarations, supporting}, [identity]),
        Nat.add(E.declarations_weight(declarations), E.supporting_weight(supporting)),
        catalog_bounded(declarations, supporting, [identity])
      )
    case M.Declaration{_, identity, _, references} C.Global{
      M.Catalog{declarations, supporting},
      C.Outcomes{},
      _,
      _,
      _
    }:
      initial_numeric(
        C.Outcomes{},
        List.length(&2, M.Reference, references),
        W.catalog_unvisited(~E.declaration_weight, M.Catalog{declarations, supporting}, [identity]),
        Nat.add(E.declarations_weight(declarations), E.supporting_weight(supporting)),
        catalog_bounded(declarations, supporting, [identity])
      )

def main() -> Unit:
  Unit{}
