import Base
import ./Model.bend as M
import ./Core.bend as C
import ./JointStep.bend as Step
import ./JointStepProof.bend as StepProof
import ./ExecutionMeasure.bend as Measure
import ./Execution.bend as E
import ./WeightedInventory.bend as W
import ./Potential.bend as P
import ./ChildBudgetProof.bend as ChildBudget
import ./Joint.bend as J
import ./ExecutionMeasureLaws.bend as Laws
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

# Linear accounting for a fresh child: the actual selected declaration pays
# its 6+9*refs credit, while the new frame reserves two and commands cost eleven.
def group_pair(+a: Nat, +b: Nat, +c: Nat, +d: Nat) -> {
  Nat.add(Nat.add(a, b), Nat.add(c, d)) == Nat.add(b, Nat.add(Nat.add(a, c), d)) : Nat
}:
  Equal.trans(Nat, Nat.add(Nat.add(a, b), Nat.add(c, d)), Nat.add(Nat.add(b, a), Nat.add(c, d)), Nat.add(b, Nat.add(Nat.add(a, c), d)),
    Equal.cong(Nat, Nat, value => Nat.add(value, Nat.add(c, d)), Nat.add(a, b), Nat.add(b, a), N.add_comm(a, b)),
    Equal.trans(Nat, Nat.add(Nat.add(b, a), Nat.add(c, d)), Nat.add(b, Nat.add(a, Nat.add(c, d))), Nat.add(b, Nat.add(Nat.add(a, c), d)),
      N.add_assoc(b, a, Nat.add(c, d)),
      Equal.cong(Nat, Nat, value => Nat.add(b, value), Nat.add(a, Nat.add(c, d)), Nat.add(Nat.add(a, c), d),
        Equal.sym(Nat, Nat.add(Nat.add(a, c), d), Nat.add(a, Nat.add(c, d)), N.add_assoc(a, c, d)))))

def move_constant(+k: Nat, +a: Nat, +b: Nat, +c: Nat) -> {
  Nat.add(k, Nat.add(a, Nat.add(b, c))) == Nat.add(a, Nat.add(Nat.add(k, b), c)) : Nat
}:
  Equal.trans(Nat, Nat.add(k, Nat.add(a, Nat.add(b, c))), Nat.add(a, Nat.add(k, Nat.add(b, c))), Nat.add(a, Nat.add(Nat.add(k, b), c)),
    N.add_left_comm(k, a, Nat.add(b, c)),
    Equal.cong(Nat, Nat, value => Nat.add(a, value), Nat.add(k, Nat.add(b, c)), Nat.add(Nat.add(k, b), c),
      Equal.sym(Nat, Nat.add(Nat.add(k, b), c), Nat.add(k, Nat.add(b, c)), N.add_assoc(k, b, c))))

def credit_shift(+credit: Nat, +before: Nat, drop: N.le(6n+credit, before)) -> N.le(13n+credit, 8n+before):
  N.le_trans(13n+credit, 7n+before, 8n+before,
    N.add_le_add_left(6n+credit, before, 7n, drop), N.le_succ(7n+before))

def fresh_credit_numeric(+child: Nat, +pending: Nat, +after: Nat, +frames: Nat, +before: Nat,
  drop: N.le(6n+Nat.add(child, after), before)) -> N.le(
    13n+Nat.add(Nat.add(child, pending), Nat.add(after, frames)),
    8n+Nat.add(pending, Nat.add(before, frames))):
  %Equal.sym(Nat, Nat.add(Nat.add(child, pending), Nat.add(after, frames)), Nat.add(pending, Nat.add(Nat.add(child, after), frames)), group_pair(child, pending, after, frames)) :
    N.le(13n+_, 8n+Nat.add(pending, Nat.add(before, frames)))
  %Equal.sym(Nat, 13n+Nat.add(pending, Nat.add(Nat.add(child, after), frames)), Nat.add(pending, Nat.add(13n+Nat.add(child, after), frames)), move_constant(13n, pending, Nat.add(child, after), frames)) :
    N.le(_, 8n+Nat.add(pending, Nat.add(before, frames)))
  %Equal.sym(Nat, 8n+Nat.add(pending, Nat.add(before, frames)), Nat.add(pending, Nat.add(8n+before, frames)), move_constant(8n, pending, before, frames)) :
    N.le(Nat.add(pending, Nat.add(13n+Nat.add(child, after), frames)), _)
  N.add_le_add_left(Nat.add(13n+Nat.add(child, after), frames), Nat.add(8n+before, frames), pending,
    N.add_le_add_right(13n+Nat.add(child, after), 8n+before, frames, credit_shift(Nat.add(child, after), before, drop)))

def fresh_numeric(+pending: Nat, +child: Nat, +frames: Nat, +after: Nat, +before: Nat,
  drop: N.le(6n+Nat.add(Nat.mul(9n, child), after), before)) -> N.le(
    11n+Nat.add(Nat.mul(9n, Nat.add(child, pending)), Nat.add(after, Nat.mul(2n, 1n+frames))),
    8n+Nat.add(Nat.mul(9n, pending), Nat.add(before, Nat.mul(2n, frames)))):
  %Equal.sym(Nat, Nat.add(Nat.mul(9n, Nat.add(child, pending)), Nat.add(after, Nat.mul(2n, 1n+frames))),
    2n+Nat.add(Nat.mul(9n, Nat.add(child, pending)), Nat.add(after, Nat.mul(2n, frames))), popped_numeric(Nat.mul(9n, Nat.add(child, pending)), after, frames)) :
    N.le(11n+_, 8n+Nat.add(Nat.mul(9n, pending), Nat.add(before, Nat.mul(2n, frames))))
  %Equal.sym(Nat, Nat.mul(9n, Nat.add(child, pending)), Nat.add(Nat.mul(9n, child), Nat.mul(9n, pending)), N.mul_add(9n, child, pending)) :
    N.le(13n+Nat.add(_, Nat.add(after, Nat.mul(2n, frames))), 8n+Nat.add(Nat.mul(9n, pending), Nat.add(before, Nat.mul(2n, frames))))
  fresh_credit_numeric(Nat.mul(9n, child), Nat.mul(9n, pending), after, Nat.mul(2n, frames), before, drop)

def child_length(+purpose: C.Purpose, +symbol: String, +target: M.Declaration, +slot: Nat) -> N.le(
  List.length(&2, M.Op, C.preflight_ops(purpose, C.child_operations(purpose, C.edge_operations(purpose, symbol, Some{target}), slot))), 11n):
  match purpose:
    case C.Preflight{}: {==}
    case C.Trees{}: {==}
    case C.Outcomes{}: {==}

def entered_child(+global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat,
  +frames: List<&2, C.Frame>, +child_slot: Nat, +identity: String, +child_name: String,
  +references: List<&2, M.Reference>, +symbol: String,
  drop: N.le(Nat.add(E.declaration_weight(M.Declaration{child_slot, identity, child_name, references}), W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), identity <> expanded)),
    W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), expanded))) -> N.le(
  Measure.measure(C.cursor_ops(C.Cursor{global, slot, name, identity <> expanded, referenced, failure, remaining, C.Frame{child_slot, references, [], Some{symbol}} <> frames}, C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{child_slot, identity, child_name, references}}), child_slot))), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames})):
  %Equal.sym(Nat, Measure.measure(C.cursor_ops(C.Cursor{global, slot, name, identity <> expanded, referenced, failure, remaining, C.Frame{child_slot, references, [], Some{symbol}} <> frames}, C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{child_slot, identity, child_name, references}}), child_slot))),
    Nat.add(List.length(&2, M.Op, C.preflight_ops(C.global_purpose(global), C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{child_slot, identity, child_name, references}}), child_slot))), Measure.cursor(C.Cursor{global, slot, name, identity <> expanded, referenced, failure, remaining, C.Frame{child_slot, references, [], Some{symbol}} <> frames})), cursor_ops(C.Cursor{global, slot, name, identity <> expanded, referenced, failure, remaining, C.Frame{child_slot, references, [], Some{symbol}} <> frames}, C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{child_slot, identity, child_name, references}}), child_slot))) :
    N.le(_, 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}))
  N.le_trans(Nat.add(List.length(&2, M.Op, C.preflight_ops(C.global_purpose(global), C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{child_slot, identity, child_name, references}}), child_slot))), Measure.cursor(C.Cursor{global, slot, name, identity <> expanded, referenced, failure, remaining, C.Frame{child_slot, references, [], Some{symbol}} <> frames})),
    11n+Measure.cursor(C.Cursor{global, slot, name, identity <> expanded, referenced, failure, remaining, C.Frame{child_slot, references, [], Some{symbol}} <> frames}), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}),
    N.add_le_add_right(List.length(&2, M.Op, C.preflight_ops(C.global_purpose(global), C.child_operations(C.global_purpose(global), C.edge_operations(C.global_purpose(global), symbol, Some{M.Declaration{child_slot, identity, child_name, references}}), child_slot))), 11n, Measure.cursor(C.Cursor{global, slot, name, identity <> expanded, referenced, failure, remaining, C.Frame{child_slot, references, [], Some{symbol}} <> frames}), child_length(C.global_purpose(global), symbol, M.Declaration{child_slot, identity, child_name, references}, child_slot)),
    fresh_numeric(P.pending_references(frames), List.length(&2, M.Reference, references), List.length(&2, C.Frame, frames),
      W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), identity <> expanded),
      W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), expanded), drop))

def enter_child(+entry_fuel: Nat, +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat, +frames: List<&2, C.Frame>, +target: M.Declaration, +symbol: String,
  drop: N.le(Nat.add(E.declaration_weight(target), W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), C.declaration_identity(target) <> expanded)), W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), expanded))) -> N.le(
  Measure.measure(C.enter_child(entry_fuel, C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, target, symbol, C.edge_operations(C.global_purpose(global), symbol, Some{target}))), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames})):
  match entry_fuel target:
    case 0n target: N.zero_le(8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}))
    case 1n+rest M.Declaration{child_slot, identity, child_name, references}:
      entered_child(global, slot, name, expanded, referenced, failure, rest, frames, child_slot, identity, child_name, references, symbol, drop)

def named_seen(+already: Bool, +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat, +frames: List<&2, C.Frame>, +target: M.Declaration, +symbol: String, +target_id: Maybe<&2, String>,
  found: {C.lookup(C.global_catalog(global), symbol, target_id) == Some{target} : Maybe<&2, M.Declaration>},
  seen: {C.contains(C.declaration_identity(target), expanded) == already : Bool}) -> N.le(
  Measure.measure(C.named_seen(already, C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, target, symbol, C.edge_operations(C.global_purpose(global), symbol, Some{target}), remaining)), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames})):
  match already:
    case True{}: append_edge(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, M.Included{symbol, C.declaration_identity(target)}, symbol, Some{target})
    case False{}: enter_child(remaining, global, slot, name, expanded, referenced, failure, remaining, frames, target, symbol,
      ChildBudget.chosen_drop(~E.declaration_weight, C.global_catalog(global), symbol, target_id, target, expanded, found, seen))

def named_target(+global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat, +frames: List<&2, C.Frame>, +target: Maybe<&2, M.Declaration>, +symbol: String, +target_id: Maybe<&2, String>,
  found: {C.lookup(C.global_catalog(global), symbol, target_id) == target : Maybe<&2, M.Declaration>}) -> N.le(
  Measure.measure(C.named_target(target, C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, symbol, C.edge_operations(C.global_purpose(global), symbol, target), expanded, remaining)), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames})):
  match target:
    case None{}: failed_edge(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, M.MissingEvidence{}, M.Omitted{symbol, None{}, M.Unresolved{}}, symbol, None{})
    case Some{+target}: named_seen(C.contains(C.declaration_identity(target), expanded), global, slot, name, expanded, referenced, failure, remaining, frames, target, symbol, target_id, found, {==})

def named_limit(+limited: Bool, +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat, +frames: List<&2, C.Frame>, +target: Maybe<&2, M.Declaration>, +symbol: String, +target_id: Maybe<&2, String>,
  found: {C.lookup(C.global_catalog(global), symbol, target_id) == target : Maybe<&2, M.Declaration>}) -> N.le(
  Measure.measure(C.named_limit(limited, target, C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, symbol, C.edge_operations(C.global_purpose(global), symbol, target), expanded, remaining)), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames})):
  match limited:
    case True{}: failed_edge(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, M.ReferenceLimit{}, M.Omitted{symbol, C.omitted_target(target), M.LimitExceeded{}}, symbol, target)
    case False{}: named_target(global, slot, name, expanded, referenced, failure, remaining, frames, target, symbol, target_id, found)

def named_recorded(+global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat, +frames: List<&2, C.Frame>, +target: Maybe<&2, M.Declaration>, +symbol: String, +target_id: Maybe<&2, String>,
  found: {C.lookup(C.global_catalog(global), symbol, target_id) == target : Maybe<&2, M.Declaration>}) -> N.le(
  Measure.measure(C.named_recorded(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, target, symbol)), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames})):
  named_limit(Nat.is_gt(List.length(&2, String, referenced), 16n), global, slot, name, expanded, referenced, failure, remaining, frames, target, symbol, target_id, found)

def visit_reference(+global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat, +frames: List<&2, C.Frame>, +reference: M.Reference) -> N.le(
  Measure.measure(C.visit_reference(reference, C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames})), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames})):
  match reference:
    case M.Unsupported{+symbol}:
      failed_edge(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}, M.UnsupportedReference{}, M.Omitted{symbol, None{}, M.UnsupportedSyntax{}}, symbol, None{})
    case M.Named{+symbol, +target_id}:
      named_recorded(global, slot, name, expanded, C.reference_names(name, symbol, target_id, referenced), failure, remaining, frames,
        C.lookup(C.global_catalog(global), symbol, target_id), symbol, target_id, {==})

def reference_numeric(+count: Nat, +rest: Nat) -> {
  Nat.add(Nat.mul(9n, 1n+count), rest) == 9n+Nat.add(Nat.mul(9n, count), rest) : Nat
}:
  %Equal.sym(Nat, Nat.mul(9n, 1n+count), Nat.add(Nat.mul(9n, count), 9n), N.mul_succ(9n, count)) :
    {Nat.add(_, rest) == 9n+Nat.add(Nat.mul(9n, count), rest) : Nat}
  %Equal.sym(Nat, Nat.add(Nat.mul(9n, count), 9n), 9n+Nat.mul(9n, count), N.add_comm(Nat.mul(9n, count), 9n)) :
    {Nat.add(_, rest) == 9n+Nat.add(Nat.mul(9n, count), rest) : Nat}
  {==}

def pending_resource(+global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat,
  +frame_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>) -> {Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, C.Frame{frame_slot, reference <> pending, reversed, site} <> parents}) == 9n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, C.Frame{frame_slot, pending, reversed, site} <> parents}) : Nat}:
  reference_numeric(Nat.add(List.length(&2, M.Reference, pending), P.pending_references(parents)),
    Nat.add(W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), expanded), Nat.mul(2n, 1n+List.length(&2, C.Frame, parents))))

def pending_reference(+global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat,
  +frame_slot: Nat, +reference: M.Reference, +pending: List<&2, M.Reference>,
  +reversed: List<&2, M.ReferencePlan>, +site: Maybe<&2, String>, +parents: List<&2, C.Frame>) -> N.le(
  1n+Measure.measure(Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, C.Frame{frame_slot, reference <> pending, reversed, site} <> parents}})), Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, C.Frame{frame_slot, reference <> pending, reversed, site} <> parents})):
  match remaining:
    case 0n:
      %Equal.sym(Nat, Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 0n, C.Frame{frame_slot, reference <> pending, reversed, site} <> parents}), 9n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 0n, C.Frame{frame_slot, pending, reversed, site} <> parents}), pending_resource(global, slot, name, expanded, referenced, failure, 0n, frame_slot, reference, pending, reversed, site, parents)) :
        N.le(1n, _)
      N.le_trans(1n, 9n, 9n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 0n, C.Frame{frame_slot, pending, reversed, site} <> parents}), {==}, N.le_add_right(9n, Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 0n, C.Frame{frame_slot, pending, reversed, site} <> parents})))
    case 1n++rest:
      %Equal.sym(Nat, Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest, C.Frame{frame_slot, reference <> pending, reversed, site} <> parents}), 9n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, rest, C.Frame{frame_slot, pending, reversed, site} <> parents}), pending_resource(global, slot, name, expanded, referenced, failure, 1n+rest, frame_slot, reference, pending, reversed, site, parents)) :
        N.le(1n+Measure.measure(Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, 1n+rest, C.Frame{frame_slot, reference <> pending, reversed, site} <> parents}})), _)
      N.succ_le_succ(Measure.measure(C.visit_reference(reference, C.Cursor{global, slot, name, expanded, referenced, failure, rest, C.Frame{frame_slot, pending, reversed, site} <> parents})), 8n+Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, rest, C.Frame{frame_slot, pending, reversed, site} <> parents}),
        visit_reference(global, slot, name, expanded, referenced, failure, rest, C.Frame{frame_slot, pending, reversed, site} <> parents, reference))

def nonempty_cursor(+global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat,
  +head: C.Frame, +parents: List<&2, C.Frame>) -> N.le(
  1n+Measure.measure(Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, head <> parents}})),
  Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, head <> parents})):
  match head:
    case C.Frame{frame_slot, Nil{}, reversed, site}:
      finished_frame(global, slot, name, expanded, referenced, failure, remaining, frame_slot, reversed, site, parents)
    case C.Frame{frame_slot, reference <> pending, reversed, site}:
      pending_reference(global, slot, name, expanded, referenced, failure, remaining, frame_slot, reference, pending, reversed, site, parents)

def empty_cursor(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +global: C.Global, +slot: Nat, +name: String, +expanded: List<&2, String>,
  +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +remaining: Nat, +ghosts: List<&2, J.Ghost>,
  valid: Step.valid(root, invocation, reversed, C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, []}}, ghosts)) -> Empty:
  match valid:
    case ((_, (_, (_, (shape, _)))), _): N.internal_false_ne_true(shape)

def continue_decreases(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +actual: C.Cursor, +ghosts: List<&2, J.Ghost>,
  valid: Step.valid(root, invocation, reversed, C.Continue{actual}, ghosts)) -> N.le(
    1n+Measure.measure(Step.advance(C.Continue{actual})), Measure.cursor(actual)):
  match actual:
    case C.Cursor{global, slot, name, expanded, referenced, failure, remaining, Nil{}}:
      Empty.absurd(N.le(1n+Measure.measure(Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, []}})),
        Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, []})),
        empty_cursor(root, invocation, reversed, global, slot, name, expanded, referenced, failure, remaining, ghosts, valid))
    case C.Cursor{global, slot, name, expanded, referenced, failure, remaining, head <> parents}:
      nonempty_cursor(global, slot, name, expanded, referenced, failure, remaining, head, parents)

# Retain the affine semantic witness while producing a duplicable numeric
# certificate for the fuel induction. No semantic witness is copied.
def keep_continue(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +actual: C.Cursor, +ghosts: List<&2, J.Ghost>,
  valid: Step.valid(root, invocation, reversed, C.Continue{actual}, ghosts)) ->
  Step.valid(root, invocation, reversed, C.Continue{actual}, ghosts)
  & N.le(1n+Measure.measure(Step.advance(C.Continue{actual})), Measure.cursor(actual)):
  match actual:
    case C.Cursor{global, slot, name, expanded, referenced, failure, remaining, Nil{}}:
      Empty.absurd(Step.valid(root, invocation, reversed, C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, []}}, ghosts)
        & N.le(1n+Measure.measure(Step.advance(C.Continue{C.Cursor{global, slot, name, expanded, referenced, failure, remaining, []}})),
          Measure.cursor(C.Cursor{global, slot, name, expanded, referenced, failure, remaining, []})),
        empty_cursor(root, invocation, reversed, global, slot, name, expanded, referenced, failure, remaining, ghosts, valid))
    case C.Cursor{global, slot, name, expanded, referenced, failure, remaining, head <> parents}:
      (valid, nonempty_cursor(global, slot, name, expanded, referenced, failure, remaining, head, parents))

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

def keep_decrease(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +step: C.Step, +ghosts: List<&2, J.Ghost>, valid: Step.valid(root, invocation, reversed, step, ghosts),
  active: {Measure.active(step) == True{} : Bool}) ->
  Step.valid(root, invocation, reversed, step, ghosts)
  & N.le(1n+Measure.measure(Step.advance(step)), Measure.measure(step)):
  match step:
    case C.Continue{cursor}: keep_continue(root, invocation, reversed, cursor, ghosts, valid)
    case C.Engine{operation, request, remaining, next}: (valid, engine_decreases(operation, request, remaining, next))
    case C.NextRoot{global}:
      Empty.absurd(Step.valid(root, invocation, reversed, C.NextRoot{global}, ghosts) & N.le(1n+Measure.measure(Step.advance(C.NextRoot{global})), Measure.measure(C.NextRoot{global})), N.internal_false_ne_true(active))
    case C.Completed{outcomes}:
      Empty.absurd(Step.valid(root, invocation, reversed, C.Completed{outcomes}, ghosts) & N.le(1n+Measure.measure(Step.advance(C.Completed{outcomes})), Measure.measure(C.Completed{outcomes})), N.internal_false_ne_true(active))
    case C.PreflightCompleted{}:
      Empty.absurd(Step.valid(root, invocation, reversed, C.PreflightCompleted{}, ghosts) & N.le(1n+Measure.measure(Step.advance(C.PreflightCompleted{})), Measure.measure(C.PreflightCompleted{})), N.internal_false_ne_true(active))
    case C.Exhausted{}:
      Empty.absurd(Step.valid(root, invocation, reversed, C.Exhausted{}, ghosts) & N.le(1n+Measure.measure(Step.advance(C.Exhausted{})), Measure.measure(C.Exhausted{})), N.internal_false_ne_true(active))
    case C.InvalidReply{}:
      Empty.absurd(Step.valid(root, invocation, reversed, C.InvalidReply{}, ghosts) & N.le(1n+Measure.measure(Step.advance(C.InvalidReply{})), Measure.measure(C.InvalidReply{})), N.internal_false_ne_true(active))

def Laws.decreases(root, invocation, reversed, step, ghosts, valid, active):
  match step:
    case C.Continue{cursor}: continue_decreases(root, invocation, reversed, cursor, ghosts, valid)
    case C.Engine{operation, request, remaining, next}: engine_decreases(operation, request, remaining, next)
    case C.NextRoot{global}:
      Empty.absurd(N.le(1n+Measure.measure(Step.advance(C.NextRoot{global})), Measure.measure(C.NextRoot{global})), N.internal_false_ne_true(active))
    case C.Completed{outcomes}:
      Empty.absurd(N.le(1n+Measure.measure(Step.advance(C.Completed{outcomes})), Measure.measure(C.Completed{outcomes})), N.internal_false_ne_true(active))
    case C.PreflightCompleted{}:
      Empty.absurd(N.le(1n+Measure.measure(Step.advance(C.PreflightCompleted{})), Measure.measure(C.PreflightCompleted{})), N.internal_false_ne_true(active))
    case C.Exhausted{}:
      Empty.absurd(N.le(1n+Measure.measure(Step.advance(C.Exhausted{})), Measure.measure(C.Exhausted{})), N.internal_false_ne_true(active))
    case C.InvalidReply{}:
      Empty.absurd(N.le(1n+Measure.measure(Step.advance(C.InvalidReply{})), Measure.measure(C.InvalidReply{})), N.internal_false_ne_true(active))

def Laws.positive(root, invocation, reversed, step, ghosts, valid, active):
  N.le_trans(1n, 1n+Measure.measure(Step.advance(step)), Measure.measure(step),
    N.succ_le_succ(0n, Measure.measure(Step.advance(step)), N.zero_le(Measure.measure(Step.advance(step)))),
    Laws.decreases(root, invocation, reversed, step, ghosts, valid, active))

def Laws.initial_bound(root, invocation):
  initial_bound(root, invocation)

def main() -> Unit:
  Unit{}
