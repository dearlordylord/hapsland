import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Joint.bend as J
import ./JointStep.bend as Step
import ./JointStepLaws.bend as StepLaws
import ./JointStepProof.bend as StepProof
import ./ExecutionMeasure.bend as Measure
import ./ExecutionMeasureLaws.bend as MeasureLaws
import ./ExecutionMeasureProof.bend as MeasureProof
import ./Root.bend as Root
import ./RootLaws.bend as Laws
import ./Execution.bend as E
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N

def continuation_type(+fuel: Nat, +root: M.Declaration, +invocation: C.Global) -> Type:
  @+step: C.Step -> @+reversed: List<&2, M.Op> -> @+ghosts: List<&2, J.Ghost> ->
  Step.valid(root, invocation, reversed, step, ghosts) ->
  N.le(Measure.measure(step), fuel) ->
  Root.correspondence(Root.run(fuel, step, reversed), Step.expectation(root, invocation))

def impossible_run(+fuel: Nat, +root: M.Declaration, +invocation: C.Global,
  +reversed: List<&2, M.Op>, +step: C.Step, impossible: Empty) ->
  Root.correspondence(Root.run(fuel, step, reversed), Step.expectation(root, invocation)):
  Empty.absurd(Root.correspondence(Root.run(fuel, step, reversed), Step.expectation(root, invocation)), impossible)

def zero_active(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +step: C.Step, +ghosts: List<&2, J.Ghost>, valid: Step.valid(root, invocation, reversed, step, ghosts),
  enough: N.le(Measure.measure(step), 0n), active: {Measure.active(step) == True{} : Bool}) ->
  Root.correspondence(Root.run(0n, step, reversed), Step.expectation(root, invocation)):
  impossible_run(0n, root, invocation, reversed, step,
    N.internal_false_ne_true(N.le_trans(1n, Measure.measure(step), 0n,
      MeasureLaws.positive(root, invocation, reversed, step, ghosts, valid, active), enough)))

def zero(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +step: C.Step, +ghosts: List<&2, J.Ghost>, valid: Step.valid(root, invocation, reversed, step, ghosts),
  enough: N.le(Measure.measure(step), 0n)) ->
  Root.correspondence(Root.run(0n, step, reversed), Step.expectation(root, invocation)):
  match step ghosts:
    case C.NextRoot{global} Nil{}: valid
    case C.Continue{cursor} ghosts: zero_active(root, invocation, reversed, C.Continue{cursor}, ghosts, valid, enough, {==})
    case C.Engine{op, request, remaining, next} ghosts: zero_active(root, invocation, reversed, C.Engine{op, request, remaining, next}, ghosts, valid, enough, {==})
    case C.NextRoot{global} head <> tail: impossible_run(0n, root, invocation, reversed, C.NextRoot{global}, valid)
    case C.Completed{outcomes} ghosts: impossible_run(0n, root, invocation, reversed, C.Completed{outcomes}, valid)
    case C.PreflightCompleted{} ghosts: impossible_run(0n, root, invocation, reversed, C.PreflightCompleted{}, valid)
    case C.Exhausted{} ghosts: impossible_run(0n, root, invocation, reversed, C.Exhausted{}, valid)
    case C.InvalidReply{} ghosts: impossible_run(0n, root, invocation, reversed, C.InvalidReply{}, valid)

def next_progress(+fuel: Nat, +root: M.Declaration, +invocation: C.Global,
  +reversed: List<&2, M.Op>, +step: C.Step,
  preserved: Exists(List<&2, J.Ghost>, after => Step.valid(root, invocation, Step.record(step, reversed), Step.advance(step), after)),
  decrease: N.le(1n+Measure.measure(Step.advance(step)), Measure.measure(step)),
  enough: N.le(Measure.measure(step), 1n+fuel), suffix: continuation_type(fuel, root, invocation)) ->
  Root.correspondence(Root.run(fuel, Step.advance(step), Step.record(step, reversed)), Step.expectation(root, invocation)):
  match preserved:
    case (after, valid):
      suffix(Step.advance(step), Step.record(step, reversed), after, valid,
        N.le_of_succ_le_succ(Measure.measure(Step.advance(step)), fuel,
          N.le_trans(1n+Measure.measure(Step.advance(step)), Measure.measure(step), 1n+fuel, decrease, enough)))

def kept_progress(+fuel: Nat, +root: M.Declaration, +invocation: C.Global,
  +reversed: List<&2, M.Op>, +step: C.Step, +ghosts: List<&2, J.Ghost>,
  kept: Step.valid(root, invocation, reversed, step, ghosts)
    & N.le(1n+Measure.measure(Step.advance(step)), Measure.measure(step)),
  enough: N.le(Measure.measure(step), 1n+fuel), suffix: continuation_type(fuel, root, invocation)) ->
  Root.correspondence(Root.run(fuel, Step.advance(step), Step.record(step, reversed)), Step.expectation(root, invocation)):
  match kept:
    case (valid, decrease): next_progress(fuel, root, invocation, reversed, step,
      StepLaws.step_preserves(root, invocation, reversed, step, ghosts, valid), decrease, enough, suffix)

def progress(+fuel: Nat, +root: M.Declaration, +invocation: C.Global,
  +reversed: List<&2, M.Op>, +step: C.Step, +ghosts: List<&2, J.Ghost>,
  valid: Step.valid(root, invocation, reversed, step, ghosts), active: {Measure.active(step) == True{} : Bool},
  enough: N.le(Measure.measure(step), 1n+fuel), suffix: continuation_type(fuel, root, invocation)) ->
  Root.correspondence(Root.run(fuel, Step.advance(step), Step.record(step, reversed)), Step.expectation(root, invocation)):
  kept_progress(fuel, root, invocation, reversed, step, ghosts,
    MeasureProof.keep_decrease(root, invocation, reversed, step, ghosts, valid, active), enough, suffix)

def positive(+fuel: Nat, +root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +step: C.Step, +ghosts: List<&2, J.Ghost>, valid: Step.valid(root, invocation, reversed, step, ghosts),
  enough: N.le(Measure.measure(step), 1n+fuel), suffix: continuation_type(fuel, root, invocation)) ->
  Root.correspondence(Root.run(1n+fuel, step, reversed), Step.expectation(root, invocation)):
  match step ghosts:
    case C.NextRoot{global} Nil{}: valid
    case C.Continue{cursor} ghosts: progress(fuel, root, invocation, reversed, C.Continue{cursor}, ghosts, valid, {==}, enough, suffix)
    case C.Engine{op, request, remaining, next} ghosts: progress(fuel, root, invocation, reversed, C.Engine{op, request, remaining, next}, ghosts, valid, {==}, enough, suffix)
    case C.NextRoot{global} head <> tail: impossible_run(1n+fuel, root, invocation, reversed, C.NextRoot{global}, valid)
    case C.Completed{outcomes} ghosts: impossible_run(1n+fuel, root, invocation, reversed, C.Completed{outcomes}, valid)
    case C.PreflightCompleted{} ghosts: impossible_run(1n+fuel, root, invocation, reversed, C.PreflightCompleted{}, valid)
    case C.Exhausted{} ghosts: impossible_run(1n+fuel, root, invocation, reversed, C.Exhausted{}, valid)
    case C.InvalidReply{} ghosts: impossible_run(1n+fuel, root, invocation, reversed, C.InvalidReply{}, valid)

def run_complete(+fuel: Nat, +root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  +step: C.Step, +ghosts: List<&2, J.Ghost>, valid: Step.valid(root, invocation, reversed, step, ghosts),
  enough: N.le(Measure.measure(step), fuel)) ->
  Root.correspondence(Root.run(fuel, step, reversed), Step.expectation(root, invocation)):
  match fuel:
    case 0n: zero(root, invocation, reversed, step, ghosts, valid, enough)
    case 1n++rest: positive(rest, root, invocation, reversed, step, ghosts, valid, enough,
      +next => +operations => +after => lawful => bound => run_complete(rest, root, invocation, operations, next, after, lawful, bound))

def Laws.complete_root_with_continuation(root, catalog, purpose, pending, prefix, request):
  run_complete(Nat.sub(E.root_weight(root, catalog), 1n), root,
    C.Global{catalog, purpose, pending, prefix, request}, [],
    C.start_root(M.traversal_inventory(root, catalog), C.Global{catalog, purpose, pending, prefix, request}, root),
    [J.initial_ghost(root, catalog)],
    StepLaws.initial_root(root, C.Global{catalog, purpose, pending, prefix, request}),
    MeasureLaws.initial_bound(root, C.Global{catalog, purpose, pending, prefix, request}))

def main() -> Unit:
  Unit{}
