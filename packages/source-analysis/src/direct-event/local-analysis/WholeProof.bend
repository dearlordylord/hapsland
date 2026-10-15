import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Execution.bend as E
import ./Root.bend as Root
import ./RootLaws.bend as RootLaws
import ./Laws.bend as Laws
import ./RootProof.bend as RootProof
import ./RootSegmentProof.bend as Segment
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N
import ../graph-resolution/traversal/GRAPH_LIST_FACTS.bend as L

# One purpose-indexed fold over the original Spec projections, not a second
# traversal. Prefix and reversed trace are the actual suspended outer context.
def projection(purpose: C.Purpose, +result: E.Run, +catalog: M.Catalog,
  +pending: List<&2, M.Declaration>, +prefix: List<&2, M.Outcome>, +reversed: List<&2, M.Op>) -> Type:
  match purpose:
    case C.Trees{}:
      {E.outcomes(result) == Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>,
        nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes),
        S.roots_outcomes(pending, catalog, M.Materialize{})) : Maybe<&2, List<&2, M.Outcome>>}
    case C.Outcomes{}:
      {E.outcomes(result) == Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>,
        nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes),
        S.roots_outcomes(pending, catalog, M.OutcomesOnly{})) : Maybe<&2, List<&2, M.Outcome>>}
    case C.Preflight{}:
      {E.trace(result) == Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>,
        operations => List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operations),
        S.roots_trace(pending, catalog)) : Maybe<&2, List<&2, M.Op>>}

def whole_result(+result: E.Run, +catalog: M.Catalog, +purpose: C.Purpose,
  +pending: List<&2, M.Declaration>, +prefix: List<&2, M.Outcome>, +reversed: List<&2, M.Op>) -> Type:
  {E.completed(result) == True{} : Bool}
  & {S.roots_complete(pending, catalog) == True{} : Bool}
  & projection(purpose, result, catalog, pending, prefix, reversed)

def roots_run(+catalog: M.Catalog, +purpose: C.Purpose, +pending: List<&2, M.Declaration>,
  prefix: List<&2, M.Outcome>, request: Nat, reversed: List<&2, M.Op>, extra: Nat) -> E.Run:
  E.run(Nat.add(1n+E.roots_weight(pending, catalog), extra), C.NextRoot{C.Global{catalog, purpose, pending, prefix, request}}, reversed)

def transport(+before: E.Run, +after: E.Run, +catalog: M.Catalog, +purpose: C.Purpose,
  +pending: List<&2, M.Declaration>, +prefix: List<&2, M.Outcome>, +reversed: List<&2, M.Op>,
  equal: {before == after : E.Run}, valid: whole_result(after, catalog, purpose, pending, prefix, reversed)) ->
  whole_result(before, catalog, purpose, pending, prefix, reversed):
  %Equal.sym(E.Run, before, after, equal) : whole_result(_, catalog, purpose, pending, prefix, reversed)
  valid

def empty_result(+catalog: M.Catalog, +purpose: C.Purpose, +prefix: List<&2, M.Outcome>, +reversed: List<&2, M.Op>) ->
  whole_result(E.Run{C.finish_global(C.Global{catalog, purpose, [], prefix, 0n}), reversed}, catalog, purpose, [], prefix, reversed):
  match purpose:
    case C.Trees{}:
      ({==}, ({==}, Equal.cong(List<&2, M.Outcome>, Maybe<&2, List<&2, M.Outcome>>, items => Some{items},
        List.reverse(&2, M.Outcome, prefix), List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), []),
        Equal.sym(List<&2, M.Outcome>, List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), []), List.reverse(&2, M.Outcome, prefix), L.append_nil(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix))))))
    case C.Outcomes{}:
      ({==}, ({==}, Equal.cong(List<&2, M.Outcome>, Maybe<&2, List<&2, M.Outcome>>, items => Some{items},
        List.reverse(&2, M.Outcome, prefix), List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), []),
        Equal.sym(List<&2, M.Outcome>, List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), []), List.reverse(&2, M.Outcome, prefix), L.append_nil(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix))))))
    case C.Preflight{}:
      ({==}, ({==}, Equal.cong(List<&2, M.Op>, Maybe<&2, List<&2, M.Op>>, items => Some{items},
        List.reverse(&2, M.Op, reversed), List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), []),
        Equal.sym(List<&2, M.Op>, List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), []), List.reverse(&2, M.Op, reversed), L.append_nil(&2, M.Op, List.reverse(&2, M.Op, reversed))))))

def empty(+catalog: M.Catalog, +purpose: C.Purpose, +prefix: List<&2, M.Outcome>, +request: Nat, +reversed: List<&2, M.Op>, +extra: Nat) ->
  whole_result(roots_run(catalog, purpose, [], prefix, request, reversed, extra), catalog, purpose, [], prefix, reversed):
  match purpose:
    case C.Trees{}:
      transport(roots_run(catalog, C.Trees{}, [], prefix, request, reversed, extra), E.Run{C.Completed{List.reverse(&2, M.Outcome, prefix)}, reversed}, catalog, C.Trees{}, [], prefix, reversed,
        Segment.completed(extra, List.reverse(&2, M.Outcome, prefix), reversed), empty_result(catalog, C.Trees{}, prefix, reversed))
    case C.Outcomes{}:
      transport(roots_run(catalog, C.Outcomes{}, [], prefix, request, reversed, extra), E.Run{C.Completed{List.reverse(&2, M.Outcome, prefix)}, reversed}, catalog, C.Outcomes{}, [], prefix, reversed,
        Segment.completed(extra, List.reverse(&2, M.Outcome, prefix), reversed), empty_result(catalog, C.Outcomes{}, prefix, reversed))
    case C.Preflight{}:
      transport(roots_run(catalog, C.Preflight{}, [], prefix, request, reversed, extra), E.Run{C.PreflightCompleted{}, reversed}, catalog, C.Preflight{}, [], prefix, reversed,
        Segment.preflight_completed(extra, reversed), empty_result(catalog, C.Preflight{}, prefix, reversed))

def rotate(+a: Nat, +b: Nat, +c: Nat) -> {Nat.add(a, Nat.add(b, c)) == Nat.add(Nat.add(c, a), b) : Nat}:
  Equal.trans(Nat, Nat.add(a, Nat.add(b, c)), Nat.add(Nat.add(b, c), a), Nat.add(Nat.add(c, a), b),
    N.add_comm(a, Nat.add(b, c)),
    Equal.trans(Nat, Nat.add(Nat.add(b, c), a), Nat.add(b, Nat.add(c, a)), Nat.add(Nat.add(c, a), b),
      N.add_assoc(b, c, a), N.add_comm(b, Nat.add(c, a))))

def fuel_arrange(+used: Nat, +slack: Nat, +tail: Nat, +extra: Nat) -> {
  Nat.add(used, Nat.add(1n+tail, Nat.add(extra, slack)))
    == 1n+Nat.add(Nat.add(slack, used), Nat.add(tail, extra)) : Nat
}:
  Equal.trans(Nat, Nat.add(used, Nat.add(1n+tail, Nat.add(extra, slack))),
    1n+Nat.add(used, Nat.add(tail, Nat.add(extra, slack))),
    1n+Nat.add(Nat.add(slack, used), Nat.add(tail, extra)),
    N.add_succ(used, Nat.add(tail, Nat.add(extra, slack))),
    Equal.cong(Nat, Nat, value => 1n+value,
      Nat.add(used, Nat.add(tail, Nat.add(extra, slack))), Nat.add(Nat.add(slack, used), Nat.add(tail, extra)),
      Equal.trans(Nat, Nat.add(used, Nat.add(tail, Nat.add(extra, slack))),
        Nat.add(used, Nat.add(Nat.add(tail, extra), slack)), Nat.add(Nat.add(slack, used), Nat.add(tail, extra)),
        Equal.cong(Nat, Nat, value => Nat.add(used, value), Nat.add(tail, Nat.add(extra, slack)), Nat.add(Nat.add(tail, extra), slack),
          Equal.sym(Nat, Nat.add(Nat.add(tail, extra), slack), Nat.add(tail, Nat.add(extra, slack)), N.add_assoc(tail, extra, slack))),
        rotate(used, Nat.add(tail, extra), slack))))

def fuel_split(+budget: Nat, +tail: Nat, +extra: Nat, +used: Nat, within: N.le(used, budget)) -> {
  Nat.add(used, Nat.add(1n+tail, Nat.add(extra, Nat.sub(budget, used))))
    == Nat.add(Nat.add(1n+budget, tail), extra) : Nat
}:
  Equal.trans(Nat,
    Nat.add(used, Nat.add(1n+tail, Nat.add(extra, Nat.sub(budget, used)))),
    1n+Nat.add(Nat.add(Nat.sub(budget, used), used), Nat.add(tail, extra)),
    Nat.add(Nat.add(1n+budget, tail), extra), fuel_arrange(used, Nat.sub(budget, used), tail, extra),
    Equal.trans(Nat, 1n+Nat.add(Nat.add(Nat.sub(budget, used), used), Nat.add(tail, extra)),
      1n+Nat.add(budget, Nat.add(tail, extra)), Nat.add(Nat.add(1n+budget, tail), extra),
      Equal.cong(Nat, Nat, value => 1n+Nat.add(value, Nat.add(tail, extra)), Nat.add(Nat.sub(budget, used), used), budget,
        N.sub_add_cancel(budget, used, within)),
      Equal.cong(Nat, Nat, value => 1n+value, Nat.add(budget, Nat.add(tail, extra)), Nat.add(Nat.add(budget, tail), extra),
        Equal.sym(Nat, Nat.add(Nat.add(budget, tail), extra), Nat.add(budget, Nat.add(tail, extra)), N.add_assoc(budget, tail, extra)))))

def weight_decompose(+root: M.Declaration, +catalog: M.Catalog) -> {
  E.root_weight(root, catalog) == 1n+Nat.sub(E.root_weight(root, catalog), 1n) : Nat
}:
  match root catalog:
    case M.Declaration{_, _, _, _} M.Catalog{_, _}: {==}

def root_fuel_split(+root: M.Declaration, +catalog: M.Catalog, +tail: Nat, +extra: Nat, +used: Nat,
  within: N.le(used, Nat.sub(E.root_weight(root, catalog), 1n))) -> {
  Nat.add(used, Nat.add(1n+tail, Nat.add(extra, Nat.sub(Nat.sub(E.root_weight(root, catalog), 1n), used))))
    == Nat.add(Nat.add(E.root_weight(root, catalog), tail), extra) : Nat
}:
  %Equal.sym(Nat, E.root_weight(root, catalog), 1n+Nat.sub(E.root_weight(root, catalog), 1n), weight_decompose(root, catalog)) :
    {Nat.add(used, Nat.add(1n+tail, Nat.add(extra, Nat.sub(Nat.sub(E.root_weight(root, catalog), 1n), used))))
      == Nat.add(Nat.add(_, tail), extra) : Nat}
  fuel_split(Nat.sub(E.root_weight(root, catalog), 1n), tail, extra, used, within)

def suffix_equation(+fuel: Nat, +remaining: Nat, +step: C.Step, +suffix: List<&2, M.Op>,
  +global: C.Global, +finished: List<&2, M.Op>,
  equal: {E.run(fuel, step, []) == E.run(remaining, C.NextRoot{global}, finished) : E.Run}) -> {
  E.run(fuel, step, suffix) == E.run(remaining, C.NextRoot{global}, List.append(&2, M.Op, finished, suffix)) : E.Run
}:
  Equal.trans(E.Run, E.run(fuel, step, suffix), Segment.append_run(suffix, E.run(fuel, step, [])),
    E.run(remaining, C.NextRoot{global}, List.append(&2, M.Op, finished, suffix)), Segment.trace_suffix(fuel, step, [], suffix),
    Equal.trans(E.Run, Segment.append_run(suffix, E.run(fuel, step, [])),
      Segment.append_run(suffix, E.run(remaining, C.NextRoot{global}, finished)),
      E.run(remaining, C.NextRoot{global}, List.append(&2, M.Op, finished, suffix)),
      Equal.cong(E.Run, E.Run, Segment.append_run(suffix), E.run(fuel, step, []), E.run(remaining, C.NextRoot{global}, finished), equal),
      Equal.sym(E.Run, E.run(remaining, C.NextRoot{global}, List.append(&2, M.Op, finished, suffix)),
        Segment.append_run(suffix, E.run(remaining, C.NextRoot{global}, finished)), Segment.trace_suffix(remaining, C.NextRoot{global}, finished, suffix))))

def segment_suffix(+bound: Nat, +step: C.Step, +suffix: List<&2, M.Op>, +global: C.Global, +finished: List<&2, M.Op>,
  segment: Segment.segment_type(bound, step, [], global, finished)) ->
  Segment.segment_type(bound, step, suffix, global, List.append(&2, M.Op, finished, suffix)):
  match segment:
    case (+used, (within, continue)):
      (used, (within, +extra => suffix_equation(Nat.add(used, extra), extra, step, suffix, global, finished, continue(extra))))

def reverse_go_append(-A: Kind(&2), left: List<&2, A>, +right: List<&2, A>, +acc: List<&2, A>) -> {
  List.reverse.go(&2, A, List.append(&2, A, left, right), acc)
    == List.reverse.go(&2, A, right, List.reverse.go(&2, A, left, acc)) : List<&2, A>
}:
  match left:
    case Nil{}: {==}
    case head <> tail: reverse_go_append(A, tail, right, head <> acc)

def reverse_append(-A: Kind(&2), +left: List<&2, A>, +right: List<&2, A>) -> {
  List.reverse(&2, A, List.append(&2, A, left, right))
    == List.append(&2, A, List.reverse(&2, A, right), List.reverse(&2, A, left)) : List<&2, A>
}:
  Equal.trans(List<&2, A>, List.reverse(&2, A, List.append(&2, A, left, right)),
    List.reverse.go(&2, A, right, List.reverse(&2, A, left)),
    List.append(&2, A, List.reverse(&2, A, right), List.reverse(&2, A, left)),
    reverse_go_append(A, left, right, []), L.reverse_go_spec(&2, A, right, List.reverse(&2, A, left)))

def outcome_prefix(+prefix: List<&2, M.Outcome>, +head: M.Outcome, +tail: Maybe<&2, List<&2, M.Outcome>>) -> {
  Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes), S.prepend_outcome(Some{head}, tail))
    == Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, head <> prefix), nodes), tail) : Maybe<&2, List<&2, M.Outcome>>
}:
  match tail:
    case None{}: {==}
    case Some{+nodes}:
      %Equal.sym(List<&2, M.Outcome>, List.reverse(&2, M.Outcome, head <> prefix), List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), [head]), L.reverse_go_spec(&2, M.Outcome, prefix, [head])) :
        {Some{List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), head <> nodes)} == Some{List.append(&2, M.Outcome, _, nodes)} : Maybe<&2, List<&2, M.Outcome>>}
      Equal.cong(List<&2, M.Outcome>, Maybe<&2, List<&2, M.Outcome>>, items => Some{items},
        List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), head <> nodes),
        List.append(&2, M.Outcome, List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), [head]), nodes),
        Equal.sym(List<&2, M.Outcome>, List.append(&2, M.Outcome, List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), [head]), nodes),
          List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), head <> nodes), L.append_assoc(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), [head], nodes)))

def trace_prefix(+reversed: List<&2, M.Op>, +root_reversed: List<&2, M.Op>, +tail: Maybe<&2, List<&2, M.Op>>) -> {
  Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), ops), S.append_trace(Some{List.reverse(&2, M.Op, root_reversed)}, tail))
    == Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, List.reverse(&2, M.Op, List.append(&2, M.Op, root_reversed, reversed)), ops), tail) : Maybe<&2, List<&2, M.Op>>
}:
  match tail:
    case None{}: {==}
    case Some{+ops}:
      %Equal.sym(List<&2, M.Op>, List.reverse(&2, M.Op, List.append(&2, M.Op, root_reversed, reversed)),
        List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), List.reverse(&2, M.Op, root_reversed)), reverse_append(M.Op, root_reversed, reversed)) :
        {Some{List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), List.append(&2, M.Op, List.reverse(&2, M.Op, root_reversed), ops))}
          == Some{List.append(&2, M.Op, _, ops)} : Maybe<&2, List<&2, M.Op>>}
      Equal.cong(List<&2, M.Op>, Maybe<&2, List<&2, M.Op>>, items => Some{items},
        List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), List.append(&2, M.Op, List.reverse(&2, M.Op, root_reversed), ops)),
        List.append(&2, M.Op, List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), List.reverse(&2, M.Op, root_reversed)), ops),
        Equal.sym(List<&2, M.Op>, List.append(&2, M.Op, List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), List.reverse(&2, M.Op, root_reversed)), ops),
          List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), List.append(&2, M.Op, List.reverse(&2, M.Op, root_reversed), ops)),
          L.append_assoc(&2, M.Op, List.reverse(&2, M.Op, reversed), List.reverse(&2, M.Op, root_reversed), ops)))

def head_projection(+result: E.Run, +catalog: M.Catalog, +purpose: C.Purpose, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +reversed: List<&2, M.Op>, +root_reversed: List<&2, M.Op>,
  +name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +node: M.NodePlan, +bytes: S.BytesExpr,
  equal: {S.analyze(head, catalog) == S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes} : S.NodeResult},
  trace: {List.reverse(&2, M.Op, root_reversed) == Root.expected_operations(purpose, bytes) : List<&2, M.Op>},
  valid: projection(purpose, result, catalog, tail, Root.expected_prefix(purpose, node, failure, prefix), List.append(&2, M.Op, root_reversed, reversed))) ->
  projection(purpose, result, catalog, head <> tail, prefix, reversed):
  match purpose:
    case C.Trees{}:
      %Equal.sym(S.NodeResult, S.analyze(head, catalog), S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes}, equal) :
        {E.outcomes(result) == Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes), S.prepend_outcome(S.outcome(M.Materialize{}, _), S.roots_outcomes(tail, catalog, M.Materialize{}))) : Maybe<&2, List<&2, M.Outcome>>}
      Equal.trans(Maybe<&2, List<&2, M.Outcome>>, E.outcomes(result), Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, M.Outcome{S.node_slot(node), failure, Some{node}} <> prefix), nodes), S.roots_outcomes(tail, catalog, M.Materialize{})), Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes), S.prepend_outcome(Some{M.Outcome{S.node_slot(node), failure, Some{node}}}, S.roots_outcomes(tail, catalog, M.Materialize{}))), valid,
        Equal.sym(Maybe<&2, List<&2, M.Outcome>>, Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes), S.prepend_outcome(Some{M.Outcome{S.node_slot(node), failure, Some{node}}}, S.roots_outcomes(tail, catalog, M.Materialize{}))), Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, M.Outcome{S.node_slot(node), failure, Some{node}} <> prefix), nodes), S.roots_outcomes(tail, catalog, M.Materialize{})), outcome_prefix(prefix, M.Outcome{S.node_slot(node), failure, Some{node}}, S.roots_outcomes(tail, catalog, M.Materialize{}))))
    case C.Outcomes{}:
      %Equal.sym(S.NodeResult, S.analyze(head, catalog), S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes}, equal) :
        {E.outcomes(result) == Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes), S.prepend_outcome(S.outcome(M.OutcomesOnly{}, _), S.roots_outcomes(tail, catalog, M.OutcomesOnly{}))) : Maybe<&2, List<&2, M.Outcome>>}
      Equal.trans(Maybe<&2, List<&2, M.Outcome>>, E.outcomes(result), Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, M.Outcome{S.node_slot(node), failure, None{}} <> prefix), nodes), S.roots_outcomes(tail, catalog, M.OutcomesOnly{})), Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes), S.prepend_outcome(Some{M.Outcome{S.node_slot(node), failure, None{}}}, S.roots_outcomes(tail, catalog, M.OutcomesOnly{}))), valid,
        Equal.sym(Maybe<&2, List<&2, M.Outcome>>, Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, prefix), nodes), S.prepend_outcome(Some{M.Outcome{S.node_slot(node), failure, None{}}}, S.roots_outcomes(tail, catalog, M.OutcomesOnly{}))), Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, List.reverse(&2, M.Outcome, M.Outcome{S.node_slot(node), failure, None{}} <> prefix), nodes), S.roots_outcomes(tail, catalog, M.OutcomesOnly{})), outcome_prefix(prefix, M.Outcome{S.node_slot(node), failure, None{}}, S.roots_outcomes(tail, catalog, M.OutcomesOnly{}))))
    case C.Preflight{}:
      %Equal.sym(S.NodeResult, S.analyze(head, catalog), S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes}, equal) :
        {E.trace(result) == Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), ops), S.append_trace(S.root_trace(_), S.roots_trace(tail, catalog))) : Maybe<&2, List<&2, M.Op>>}
      %trace :
        {E.trace(result) == Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), ops), S.append_trace(Some{_}, S.roots_trace(tail, catalog))) : Maybe<&2, List<&2, M.Op>>}
      Equal.trans(Maybe<&2, List<&2, M.Op>>, E.trace(result), Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, List.reverse(&2, M.Op, List.append(&2, M.Op, root_reversed, reversed)), ops), S.roots_trace(tail, catalog)), Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), ops), S.append_trace(Some{List.reverse(&2, M.Op, root_reversed)}, S.roots_trace(tail, catalog))), valid,
        Equal.sym(Maybe<&2, List<&2, M.Op>>, Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), ops), S.append_trace(Some{List.reverse(&2, M.Op, root_reversed)}, S.roots_trace(tail, catalog))), Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, List.reverse(&2, M.Op, List.append(&2, M.Op, root_reversed, reversed)), ops), S.roots_trace(tail, catalog)), trace_prefix(reversed, root_reversed, S.roots_trace(tail, catalog))))

def head_complete(+head: M.Declaration, +tail: List<&2, M.Declaration>, +catalog: M.Catalog,
  +name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +node: M.NodePlan, +bytes: S.BytesExpr,
  equal: {S.analyze(head, catalog) == S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes} : S.NodeResult},
  valid: {S.roots_complete(tail, catalog) == True{} : Bool}) -> {S.roots_complete(head <> tail, catalog) == True{} : Bool}:
  %Equal.sym(S.NodeResult, S.analyze(head, catalog), S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes}, equal) :
    {Bool.and(S.node_complete(_), S.roots_complete(tail, catalog)) == True{} : Bool}
  valid

def head_result(+result: E.Run, +catalog: M.Catalog, +purpose: C.Purpose, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +reversed: List<&2, M.Op>, +root_reversed: List<&2, M.Op>,
  +name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +node: M.NodePlan, +bytes: S.BytesExpr,
  +equal: {S.analyze(head, catalog) == S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes} : S.NodeResult},
  trace: {List.reverse(&2, M.Op, root_reversed) == Root.expected_operations(purpose, bytes) : List<&2, M.Op>},
  valid: whole_result(result, catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), List.append(&2, M.Op, root_reversed, reversed))) ->
  whole_result(result, catalog, purpose, head <> tail, prefix, reversed):
  match valid:
    case (completed, (complete, projection)):
      (completed, (head_complete(head, tail, catalog, name, expanded, referenced, failure, node, bytes, equal, complete),
        head_projection(result, catalog, purpose, head, tail, prefix, reversed, root_reversed, name, expanded, referenced, failure, node, bytes, equal, trace, projection)))

def tail_continuation(+tail: List<&2, M.Declaration>, +catalog: M.Catalog, +purpose: C.Purpose) -> Type:
  @+prefix: List<&2, M.Outcome> -> @+request: Nat -> @+reversed: List<&2, M.Op> -> @+extra: Nat ->
  whole_result(roots_run(catalog, purpose, tail, prefix, request, reversed, extra), catalog, purpose, tail, prefix, reversed)

def cons_equation(+catalog: M.Catalog, +purpose: C.Purpose, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +request: Nat, +reversed: List<&2, M.Op>, +extra: Nat,
  +name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +node: M.NodePlan, +bytes: S.BytesExpr, +root_reversed: List<&2, M.Op>, +used: Nat, within: N.le(used, Nat.sub(E.root_weight(head, catalog), 1n)),
  continue: @+remaining: Nat -> {E.run(Nat.add(used, remaining), C.enter_root(C.Global{catalog, purpose, tail, prefix, request}, head), reversed) == E.run(remaining, C.NextRoot{C.Global{catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes)))}}, List.append(&2, M.Op, root_reversed, reversed)) : E.Run}) -> {
  roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra) == roots_run(catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes))), List.append(&2, M.Op, root_reversed, reversed), Nat.add(extra, Nat.sub(Nat.sub(E.root_weight(head, catalog), 1n), used))) : E.Run
}:
  %root_fuel_split(head, catalog, E.roots_weight(tail, catalog), extra, used, within) :
    {E.run(_, C.enter_root(C.Global{catalog, purpose, tail, prefix, request}, head), reversed) == roots_run(catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes))), List.append(&2, M.Op, root_reversed, reversed), Nat.add(extra, Nat.sub(Nat.sub(E.root_weight(head, catalog), 1n), used))) : E.Run}
  continue(Nat.add(1n+E.roots_weight(tail, catalog), Nat.add(extra, Nat.sub(Nat.sub(E.root_weight(head, catalog), 1n), used))))

def cons_segment(+catalog: M.Catalog, +purpose: C.Purpose, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +request: Nat, +reversed: List<&2, M.Op>, +extra: Nat,
  +name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +node: M.NodePlan, +bytes: S.BytesExpr, +root_reversed: List<&2, M.Op>,
  equal: {S.analyze(head, catalog) == S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes} : S.NodeResult},
  trace: {List.reverse(&2, M.Op, root_reversed) == Root.expected_operations(purpose, bytes) : List<&2, M.Op>},
  segment: Segment.segment_type(Nat.sub(E.root_weight(head, catalog), 1n), C.enter_root(C.Global{catalog, purpose, tail, prefix, request}, head), reversed, C.Global{catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes)))}, List.append(&2, M.Op, root_reversed, reversed)),
  suffix: tail_continuation(tail, catalog, purpose)) ->
  whole_result(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), catalog, purpose, head <> tail, prefix, reversed):
  match segment:
    case (+used, (within, continue)):
      transport(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), roots_run(catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes))), List.append(&2, M.Op, root_reversed, reversed), Nat.add(extra, Nat.sub(Nat.sub(E.root_weight(head, catalog), 1n), used))), catalog, purpose, head <> tail, prefix, reversed,
        cons_equation(catalog, purpose, head, tail, prefix, request, reversed, extra, name, expanded, referenced, failure, node, bytes, root_reversed, used, within, continue),
        head_result(roots_run(catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes))), List.append(&2, M.Op, root_reversed, reversed), Nat.add(extra, Nat.sub(Nat.sub(E.root_weight(head, catalog), 1n), used))), catalog, purpose, head, tail, prefix, reversed, root_reversed, name, expanded, referenced, failure, node, bytes, equal, trace,
          suffix(Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes))), List.append(&2, M.Op, root_reversed, reversed), Nat.add(extra, Nat.sub(Nat.sub(E.root_weight(head, catalog), 1n), used)))))

def cons_root(+catalog: M.Catalog, +purpose: C.Purpose, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +request: Nat, +reversed: List<&2, M.Op>, +extra: Nat,
  +name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +node: M.NodePlan, +bytes: S.BytesExpr, +root_reversed: List<&2, M.Op>,
  equal: {S.analyze(head, catalog) == S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes} : S.NodeResult},
  trace: {List.reverse(&2, M.Op, root_reversed) == Root.expected_operations(purpose, bytes) : List<&2, M.Op>},
  root_equal: {Root.execute(head, catalog, purpose, tail, prefix, request) == Root.RootDone{C.Global{catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes)))}, root_reversed} : Root.RootRun},
  suffix: tail_continuation(tail, catalog, purpose)) ->
  whole_result(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), catalog, purpose, head <> tail, prefix, reversed):
  cons_segment(catalog, purpose, head, tail, prefix, request, reversed, extra, name, expanded, referenced, failure, node, bytes, root_reversed, equal, trace,
    segment_suffix(Nat.sub(E.root_weight(head, catalog), 1n), C.enter_root(C.Global{catalog, purpose, tail, prefix, request}, head), reversed, C.Global{catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes)))}, root_reversed,
      Segment.segment(Nat.sub(E.root_weight(head, catalog), 1n), C.enter_root(C.Global{catalog, purpose, tail, prefix, request}, head), [], C.Global{catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes)))}, root_reversed, root_equal)), suffix)

def normalize_root(+head: M.Declaration, +catalog: M.Catalog, +purpose: C.Purpose, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +request: Nat, +actual: Root.RootRun, +specification: S.NodeResult,
  actual_equal: {Root.execute(head, catalog, purpose, tail, prefix, request) == actual : Root.RootRun},
  spec_equal: {S.analyze(head, catalog) == specification : S.NodeResult},
  valid: Root.correspondence(Root.execute(head, catalog, purpose, tail, prefix, request), Root.expected(head, catalog, purpose, tail, prefix, request))) ->
  Root.correspondence(actual, Root.expectation(specification, catalog, purpose, tail, prefix, request)):
  %actual_equal : Root.correspondence(_, Root.expectation(specification, catalog, purpose, tail, prefix, request))
  %spec_equal : Root.correspondence(Root.execute(head, catalog, purpose, tail, prefix, request), Root.expectation(_, catalog, purpose, tail, prefix, request))
  valid

def cons_correspondence(+catalog: M.Catalog, +purpose: C.Purpose, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +request: Nat, +reversed: List<&2, M.Op>, +extra: Nat,
  +name: String, +expanded: List<&2, String>, +referenced: List<&2, String>, +failure: Maybe<&2, M.Failure>, +node: M.NodePlan, +bytes: S.BytesExpr,
  +actual_global: C.Global, +root_reversed: List<&2, M.Op>,
  spec_equal: {S.analyze(head, catalog) == S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes} : S.NodeResult},
  actual_equal: {Root.execute(head, catalog, purpose, tail, prefix, request) == Root.RootDone{actual_global, root_reversed} : Root.RootRun},
  valid: Root.correspondence(Root.RootDone{actual_global, root_reversed}, Root.expectation(S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes}, catalog, purpose, tail, prefix, request)),
  suffix: tail_continuation(tail, catalog, purpose)) ->
  whole_result(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), catalog, purpose, head <> tail, prefix, reversed):
  match valid:
    case (global_equal, trace):
      cons_root(catalog, purpose, head, tail, prefix, request, reversed, extra, name, expanded, referenced, failure, node, bytes, root_reversed, spec_equal, trace,
        Equal.trans(Root.RootRun, Root.execute(head, catalog, purpose, tail, prefix, request), Root.RootDone{actual_global, root_reversed}, Root.RootDone{C.Global{catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes)))}, root_reversed},
          actual_equal, Equal.cong(C.Global, Root.RootRun, value => Root.RootDone{value, root_reversed}, actual_global, C.Global{catalog, purpose, tail, Root.expected_prefix(purpose, node, failure, prefix), Nat.add(request, List.length(&2, M.Op, Root.expected_operations(purpose, bytes)))}, global_equal)), suffix)

def root_cases(+catalog: M.Catalog, +purpose: C.Purpose, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +request: Nat, +reversed: List<&2, M.Op>, +extra: Nat, +specification: S.NodeResult, +actual: Root.RootRun,
  spec_equal: {S.analyze(head, catalog) == specification : S.NodeResult},
  actual_equal: {Root.execute(head, catalog, purpose, tail, prefix, request) == actual : Root.RootRun},
  valid: Root.correspondence(actual, Root.expectation(specification, catalog, purpose, tail, prefix, request)),
  suffix: tail_continuation(tail, catalog, purpose)) ->
  whole_result(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), catalog, purpose, head <> tail, prefix, reversed):
  match specification actual:
    case S.DepthExhausted{} Root.RootDone{_, _}:
      Empty.absurd(whole_result(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), catalog, purpose, head <> tail, prefix, reversed), valid)
    case S.DepthExhausted{} Root.RootFailed{_}:
      Empty.absurd(whole_result(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), catalog, purpose, head <> tail, prefix, reversed), valid)
    case S.NodeResult{_, _, _} Root.RootFailed{_}:
      Empty.absurd(whole_result(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), catalog, purpose, head <> tail, prefix, reversed), valid)
    case S.NodeResult{S.State{name, expanded, referenced, failure}, node, bytes} Root.RootDone{actual_global, root_reversed}:
      cons_correspondence(catalog, purpose, head, tail, prefix, request, reversed, extra, name, expanded, referenced, failure, node, bytes, actual_global, root_reversed, spec_equal, actual_equal, valid, suffix)

def cons(+catalog: M.Catalog, +purpose: C.Purpose, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +prefix: List<&2, M.Outcome>, +request: Nat, +reversed: List<&2, M.Op>, +extra: Nat, suffix: tail_continuation(tail, catalog, purpose)) ->
  whole_result(roots_run(catalog, purpose, head <> tail, prefix, request, reversed, extra), catalog, purpose, head <> tail, prefix, reversed):
  root_cases(catalog, purpose, head, tail, prefix, request, reversed, extra, S.analyze(head, catalog), Root.execute(head, catalog, purpose, tail, prefix, request), {==}, {==},
    normalize_root(head, catalog, purpose, tail, prefix, request, Root.execute(head, catalog, purpose, tail, prefix, request), S.analyze(head, catalog), {==}, {==},
      RootLaws.complete_root_with_continuation(head, catalog, purpose, tail, prefix, request)), suffix)

def whole(+pending: List<&2, M.Declaration>, +catalog: M.Catalog, +purpose: C.Purpose,
  +prefix: List<&2, M.Outcome>, +request: Nat, +reversed: List<&2, M.Op>, +extra: Nat) ->
  whole_result(roots_run(catalog, purpose, pending, prefix, request, reversed, extra), catalog, purpose, pending, prefix, reversed):
  match pending:
    case Nil{}: empty(catalog, purpose, prefix, request, reversed, extra)
    case +head <> +tail: cons(catalog, purpose, head, tail, prefix, request, reversed, extra,
      +next_prefix => +next_request => +operations => +slack => whole(tail, catalog, purpose, next_prefix, next_request, operations, slack))

def entry(+catalog: M.Catalog, +purpose: C.Purpose) ->
  whole_result(E.execute(catalog, purpose), catalog, purpose, C.catalog_declarations(catalog), [], C.initial_operations(purpose)):
  match purpose:
    case C.Trees{}:
      %N.add_comm(1n+E.roots_weight(C.catalog_declarations(catalog), catalog), 1n) :
        whole_result(E.run(_, C.initial(catalog, C.Trees{}), []), catalog, C.Trees{}, C.catalog_declarations(catalog), [], [])
      whole(C.catalog_declarations(catalog), catalog, C.Trees{}, [], 0n, [], 1n)
    case C.Outcomes{}:
      %N.add_comm(1n+E.roots_weight(C.catalog_declarations(catalog), catalog), 1n) :
        whole_result(E.run(_, C.initial(catalog, C.Outcomes{}), []), catalog, C.Outcomes{}, C.catalog_declarations(catalog), [], [])
      whole(C.catalog_declarations(catalog), catalog, C.Outcomes{}, [], 0n, [], 1n)
    case C.Preflight{}:
      %N.add_zero(1n+E.roots_weight(C.catalog_declarations(catalog), catalog)) :
        whole_result(E.run(_, C.NextRoot{C.Global{catalog, C.Preflight{}, C.catalog_declarations(catalog), [], 1n}}, [M.Push{0n}]), catalog, C.Preflight{}, C.catalog_declarations(catalog), [], [M.Push{0n}])
      whole(C.catalog_declarations(catalog), catalog, C.Preflight{}, [], 1n, [M.Push{0n}], 0n)

def roots_agree(+catalog: M.Catalog) -> {C.catalog_declarations(catalog) == S.catalog_roots(catalog) : List<&2, M.Declaration>}:
  match catalog:
    case M.Catalog{_, _}: {==}

def outcomes_identity(+result: Maybe<&2, List<&2, M.Outcome>>) -> {
  Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, [], nodes), result) == result : Maybe<&2, List<&2, M.Outcome>>
}:
  match result:
    case None{}: {==}
    case Some{_}: {==}

def initial_trace(+result: Maybe<&2, List<&2, M.Op>>) -> {
  Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, [M.Push{0n}], ops), result)
    == S.append_trace(Some{[M.Push{0n}]}, result) : Maybe<&2, List<&2, M.Op>>
}:
  match result:
    case None{}: {==}
    case Some{_}: {==}

def plain_outcomes(+catalog: M.Catalog, +mode: M.Mode, +result: E.Run,
  valid: {E.outcomes(result) == Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, [], nodes), S.roots_outcomes(C.catalog_declarations(catalog), catalog, mode)) : Maybe<&2, List<&2, M.Outcome>>}) ->
  {E.outcomes(result) == S.outcomes(catalog, mode) : Maybe<&2, List<&2, M.Outcome>>}:
  Equal.trans(Maybe<&2, List<&2, M.Outcome>>, E.outcomes(result), S.roots_outcomes(C.catalog_declarations(catalog), catalog, mode), S.outcomes(catalog, mode),
    Equal.trans(Maybe<&2, List<&2, M.Outcome>>, E.outcomes(result),
      Maybe.map(&2, List<&2, M.Outcome>, List<&2, M.Outcome>, nodes => List.append(&2, M.Outcome, [], nodes), S.roots_outcomes(C.catalog_declarations(catalog), catalog, mode)),
      S.roots_outcomes(C.catalog_declarations(catalog), catalog, mode), valid, outcomes_identity(S.roots_outcomes(C.catalog_declarations(catalog), catalog, mode))),
    Equal.cong(List<&2, M.Declaration>, Maybe<&2, List<&2, M.Outcome>>, roots => S.roots_outcomes(roots, catalog, mode), C.catalog_declarations(catalog), S.catalog_roots(catalog), roots_agree(catalog)))

def plain_trace(+catalog: M.Catalog, +result: E.Run,
  valid: {E.trace(result) == Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, [M.Push{0n}], ops), S.roots_trace(C.catalog_declarations(catalog), catalog)) : Maybe<&2, List<&2, M.Op>>}) ->
  {E.trace(result) == S.preflight_trace(catalog) : Maybe<&2, List<&2, M.Op>>}:
  Equal.trans(Maybe<&2, List<&2, M.Op>>, E.trace(result), S.append_trace(Some{[M.Push{0n}]}, S.roots_trace(C.catalog_declarations(catalog), catalog)), S.preflight_trace(catalog),
    Equal.trans(Maybe<&2, List<&2, M.Op>>, E.trace(result),
      Maybe.map(&2, List<&2, M.Op>, List<&2, M.Op>, ops => List.append(&2, M.Op, [M.Push{0n}], ops), S.roots_trace(C.catalog_declarations(catalog), catalog)),
      S.append_trace(Some{[M.Push{0n}]}, S.roots_trace(C.catalog_declarations(catalog), catalog)), valid, initial_trace(S.roots_trace(C.catalog_declarations(catalog), catalog))),
    Equal.cong(List<&2, M.Declaration>, Maybe<&2, List<&2, M.Op>>, roots => S.append_trace(Some{[M.Push{0n}]}, S.roots_trace(roots, catalog)), C.catalog_declarations(catalog), S.catalog_roots(catalog), roots_agree(catalog)))

def materialized(+catalog: M.Catalog,
  valid: whole_result(E.execute(catalog, C.Trees{}), catalog, C.Trees{}, C.catalog_declarations(catalog), [], [])) ->
  {E.outcomes(E.execute(catalog, C.Trees{})) == S.outcomes(catalog, M.Materialize{}) : Maybe<&2, List<&2, M.Outcome>>}:
  match valid:
    case (_, (_, projection)): plain_outcomes(catalog, M.Materialize{}, E.execute(catalog, C.Trees{}), projection)

def outcomes(+catalog: M.Catalog,
  valid: whole_result(E.execute(catalog, C.Outcomes{}), catalog, C.Outcomes{}, C.catalog_declarations(catalog), [], [])) ->
  {E.outcomes(E.execute(catalog, C.Outcomes{})) == S.outcomes(catalog, M.OutcomesOnly{}) : Maybe<&2, List<&2, M.Outcome>>}:
  match valid:
    case (_, (_, projection)): plain_outcomes(catalog, M.OutcomesOnly{}, E.execute(catalog, C.Outcomes{}), projection)

def preflight(+catalog: M.Catalog,
  valid: whole_result(E.execute(catalog, C.Preflight{}), catalog, C.Preflight{}, C.catalog_declarations(catalog), [], [M.Push{0n}])) ->
  {E.trace(E.execute(catalog, C.Preflight{})) == S.preflight_trace(catalog) : Maybe<&2, List<&2, M.Op>>}:
  match valid:
    case (_, (_, projection)): plain_trace(catalog, E.execute(catalog, C.Preflight{}), projection)

def completed_only(+catalog: M.Catalog, +purpose: C.Purpose,
  valid: whole_result(E.execute(catalog, purpose), catalog, purpose, C.catalog_declarations(catalog), [], C.initial_operations(purpose))) ->
  {E.completed(E.execute(catalog, purpose)) == True{} : Bool}:
  match valid:
    case (completed, _): completed

def completion(+catalog: M.Catalog,
  valid: whole_result(E.execute(catalog, C.Trees{}), catalog, C.Trees{}, C.catalog_declarations(catalog), [], [])) ->
  {E.completed(E.execute(catalog, C.Trees{})) == True{} : Bool} & {S.complete(catalog) == True{} : Bool}:
  match valid:
    case (completed, (complete, _)):
      (completed, Equal.trans(Bool, S.complete(catalog), S.roots_complete(C.catalog_declarations(catalog), catalog), True{},
        Equal.cong(List<&2, M.Declaration>, Bool, roots => S.roots_complete(roots, catalog), S.catalog_roots(catalog), C.catalog_declarations(catalog),
          Equal.sym(List<&2, M.Declaration>, C.catalog_declarations(catalog), S.catalog_roots(catalog), roots_agree(catalog))), complete))

def and_true(+a: Bool, +b: Bool, first: {a == True{} : Bool}, second: {b == True{} : Bool}) -> {Bool.and(a, b) == True{} : Bool}:
  %Equal.sym(Bool, a, True{}, first) : {Bool.and(_, b) == True{} : Bool}
  second

def budget_completed(+catalog: M.Catalog,
  trees: {E.completed(E.execute(catalog, C.Trees{})) == True{} : Bool} & {S.complete(catalog) == True{} : Bool},
  outcomes: {E.completed(E.execute(catalog, C.Outcomes{})) == True{} : Bool},
  preflight: {E.completed(E.execute(catalog, C.Preflight{})) == True{} : Bool}) -> {
  Bool.and(S.complete(catalog), Bool.and(E.completed(E.execute(catalog, C.Trees{})),
    Bool.and(E.completed(E.execute(catalog, C.Outcomes{})), E.completed(E.execute(catalog, C.Preflight{}))))) == True{} : Bool
}:
  match trees:
    case (trees_done, spec_done):
      and_true(S.complete(catalog), Bool.and(E.completed(E.execute(catalog, C.Trees{})),
        Bool.and(E.completed(E.execute(catalog, C.Outcomes{})), E.completed(E.execute(catalog, C.Preflight{})))), spec_done,
        and_true(E.completed(E.execute(catalog, C.Trees{})), Bool.and(E.completed(E.execute(catalog, C.Outcomes{})), E.completed(E.execute(catalog, C.Preflight{}))), trees_done,
          and_true(E.completed(E.execute(catalog, C.Outcomes{})), E.completed(E.execute(catalog, C.Preflight{})), outcomes, preflight)))

def Laws.materialized_exact(catalog):
  materialized(catalog, entry(catalog, C.Trees{}))

def Laws.outcomes_exact(catalog):
  outcomes(catalog, entry(catalog, C.Outcomes{}))

def Laws.preflight_trace_exact(catalog):
  preflight(catalog, entry(catalog, C.Preflight{}))

def Laws.derived_budget_sufficient(catalog):
  budget_completed(catalog, completion(catalog, entry(catalog, C.Trees{})),
    completed_only(catalog, C.Outcomes{}, entry(catalog, C.Outcomes{})),
    completed_only(catalog, C.Preflight{}, entry(catalog, C.Preflight{})))

def main() -> Unit:
  Unit{}
