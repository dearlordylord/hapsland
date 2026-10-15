import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Execution.bend as E
import ./Root.bend as Root
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N

# Proof-only composition of the existing Root and Execution interpreters.
# used is the actual count before NextRoot; unused conservative fuel survives.
def segment_type(+bound: Nat, +step: C.Step, +reversed: List<&2, M.Op>, +global: C.Global,
  +finished: List<&2, M.Op>) -> Type:
  Exists(Nat, used => N.le(used, bound) & (@+extra: Nat -> {
    E.run(Nat.add(used, extra), step, reversed) == E.run(extra, C.NextRoot{global}, finished) : E.Run
  }))

def after_root(+extra: Nat, result: Root.RootRun) -> E.Run:
  match result:
    case Root.RootDone{global, reversed}: E.run(extra, C.NextRoot{global}, reversed)
    case Root.RootFailed{step}: E.Run{step, []}

def successful(result: Root.RootRun) -> Bool:
  match result:
    case Root.RootDone{_, _}: True{}
    case Root.RootFailed{_}: False{}

def failed_done(+step: C.Step, +global: C.Global, +finished: List<&2, M.Op>,
  equal: {Root.RootFailed{step} == Root.RootDone{global, finished} : Root.RootRun}) -> Empty:
  N.internal_false_ne_true(Equal.cong(Root.RootRun, Bool, successful, Root.RootFailed{step}, Root.RootDone{global, finished}, equal))

def already_done(+bound: Nat, +actual: C.Global, +reversed: List<&2, M.Op>, +global: C.Global, +finished: List<&2, M.Op>,
  +equal: {Root.RootDone{actual, reversed} == Root.RootDone{global, finished} : Root.RootRun}) ->
  segment_type(bound, C.NextRoot{actual}, reversed, global, finished):
  (0n, (N.zero_le(bound), +extra => Equal.cong(Root.RootRun, E.Run, after_root(extra),
    Root.RootDone{actual, reversed}, Root.RootDone{global, finished}, equal)))

def impossible_segment(+bound: Nat, +step: C.Step, +reversed: List<&2, M.Op>, +global: C.Global, +finished: List<&2, M.Op>,
  equal: {Root.RootFailed{step} == Root.RootDone{global, finished} : Root.RootRun}) ->
  segment_type(bound, step, reversed, global, finished):
  Empty.absurd(segment_type(bound, step, reversed, global, finished), failed_done(step, global, finished, equal))

def zero(+step: C.Step, +reversed: List<&2, M.Op>, +global: C.Global, +finished: List<&2, M.Op>,
  equal: {Root.run(0n, step, reversed) == Root.RootDone{global, finished} : Root.RootRun}) ->
  segment_type(0n, step, reversed, global, finished):
  match step:
    case C.NextRoot{actual}: already_done(0n, actual, reversed, global, finished, equal)
    case C.Continue{cursor}: impossible_segment(0n, C.Continue{cursor}, reversed, global, finished, equal)
    case C.Engine{op, request, remaining, next}: impossible_segment(0n, C.Engine{op, request, remaining, next}, reversed, global, finished, equal)
    case C.Completed{outcomes}: impossible_segment(0n, C.Completed{outcomes}, reversed, global, finished, equal)
    case C.PreflightCompleted{}: impossible_segment(0n, C.PreflightCompleted{}, reversed, global, finished, equal)
    case C.Exhausted{}: impossible_segment(0n, C.Exhausted{}, reversed, global, finished, equal)
    case C.InvalidReply{}: impossible_segment(0n, C.InvalidReply{}, reversed, global, finished, equal)

def lift_engine(+bound: Nat, +op: M.Op, +request: Nat, +remaining: List<&2, M.Op>, +next: C.Deferred,
  +reversed: List<&2, M.Op>, +global: C.Global, +finished: List<&2, M.Op>,
  suffix: segment_type(bound, C.resume(C.Engine{op, request, remaining, next}, C.Ack{request}), op <> reversed, global, finished)) ->
  segment_type(1n+bound, C.Engine{op, request, remaining, next}, reversed, global, finished):
  match suffix:
    case (used, (within, continue)):
      (1n+used, (N.succ_le_succ(used, bound, within), +extra => continue(extra)))

def lift_continue(+bound: Nat, +cursor: C.Cursor,
  +reversed: List<&2, M.Op>, +global: C.Global, +finished: List<&2, M.Op>,
  suffix: segment_type(bound, C.advance(C.Continue{cursor}), reversed, global, finished)) ->
  segment_type(1n+bound, C.Continue{cursor}, reversed, global, finished):
  match suffix:
    case (used, (within, continue)):
      (1n+used, (N.succ_le_succ(used, bound, within), +extra => continue(extra)))

def continuation_type(+bound: Nat) -> Type:
  @+step: C.Step -> @+reversed: List<&2, M.Op> -> @+global: C.Global -> @+finished: List<&2, M.Op> ->
  {Root.run(bound, step, reversed) == Root.RootDone{global, finished} : Root.RootRun} ->
  segment_type(bound, step, reversed, global, finished)

def positive(+bound: Nat, +step: C.Step, +reversed: List<&2, M.Op>, +global: C.Global, +finished: List<&2, M.Op>,
  equal: {Root.run(1n+bound, step, reversed) == Root.RootDone{global, finished} : Root.RootRun},
  suffix: continuation_type(bound)) -> segment_type(1n+bound, step, reversed, global, finished):
  match step:
    case C.NextRoot{actual}: already_done(1n+bound, actual, reversed, global, finished, equal)
    case C.Continue{cursor}: lift_continue(bound, cursor, reversed, global, finished,
      suffix(C.advance(C.Continue{cursor}), reversed, global, finished, equal))
    case C.Engine{+op, +request, +remaining, +next}: lift_engine(bound, op, request, remaining, next, reversed, global, finished,
      suffix(C.resume(C.Engine{op, request, remaining, next}, C.Ack{request}), op <> reversed, global, finished, equal))
    case C.Completed{outcomes}: impossible_segment(1n+bound, C.Completed{outcomes}, reversed, global, finished, equal)
    case C.PreflightCompleted{}: impossible_segment(1n+bound, C.PreflightCompleted{}, reversed, global, finished, equal)
    case C.Exhausted{}: impossible_segment(1n+bound, C.Exhausted{}, reversed, global, finished, equal)
    case C.InvalidReply{}: impossible_segment(1n+bound, C.InvalidReply{}, reversed, global, finished, equal)

def segment(+bound: Nat, +step: C.Step, +reversed: List<&2, M.Op>, +global: C.Global, +finished: List<&2, M.Op>,
  equal: {Root.run(bound, step, reversed) == Root.RootDone{global, finished} : Root.RootRun}) ->
  segment_type(bound, step, reversed, global, finished):
  match bound:
    case 0n: zero(step, reversed, global, finished, equal)
    case 1n++rest: positive(rest, step, reversed, global, finished, equal,
      +next => +operations => +end => +trace => agreement => segment(rest, next, operations, end, trace, agreement))

def completed(+fuel: Nat, +outcomes: List<&2, M.Outcome>, +reversed: List<&2, M.Op>) -> {
  E.run(fuel, C.Completed{outcomes}, reversed) == E.Run{C.Completed{outcomes}, reversed} : E.Run
}:
  match fuel:
    case 0n: {==}
    case 1n+_: {==}

def preflight_completed(+fuel: Nat, +reversed: List<&2, M.Op>) -> {
  E.run(fuel, C.PreflightCompleted{}, reversed) == E.Run{C.PreflightCompleted{}, reversed} : E.Run
}:
  match fuel:
    case 0n: {==}
    case 1n+_: {==}

# Accumulator transport for whole-root composition. This changes only the
# existing interpreter's reversed trace suffix, never its machine decisions.
def append_run(+suffix: List<&2, M.Op>, result: E.Run) -> E.Run:
  match result:
    case E.Run{terminal, reversed}: E.Run{terminal, List.append(&2, M.Op, reversed, suffix)}

def suffix_continuation(+fuel: Nat) -> Type:
  @+step: C.Step -> @+reversed: List<&2, M.Op> -> @+suffix: List<&2, M.Op> -> {
    E.run(fuel, step, List.append(&2, M.Op, reversed, suffix))
      == append_run(suffix, E.run(fuel, step, reversed)) : E.Run
  }

def suffix_positive(+fuel: Nat, +step: C.Step, +reversed: List<&2, M.Op>, +suffix: List<&2, M.Op>,
  continue: suffix_continuation(fuel)) -> {
  E.run(1n+fuel, step, List.append(&2, M.Op, reversed, suffix))
    == append_run(suffix, E.run(1n+fuel, step, reversed)) : E.Run
}:
  match step:
    case C.Engine{+operation, +request, remaining, next}:
      continue(C.resume(C.Engine{operation, request, remaining, next}, C.Ack{request}), operation <> reversed, suffix)
    case C.Continue{cursor}: continue(C.advance(C.Continue{cursor}), reversed, suffix)
    case C.NextRoot{global}: continue(C.advance(C.NextRoot{global}), reversed, suffix)
    case C.Completed{_}: {==}
    case C.PreflightCompleted{}: {==}
    case C.Exhausted{}: {==}
    case C.InvalidReply{}: {==}

def trace_suffix(+fuel: Nat, +step: C.Step, +reversed: List<&2, M.Op>, +suffix: List<&2, M.Op>) -> {
  E.run(fuel, step, List.append(&2, M.Op, reversed, suffix))
    == append_run(suffix, E.run(fuel, step, reversed)) : E.Run
}:
  match fuel:
    case 0n: {==}
    case 1n++rest: suffix_positive(rest, step, reversed, suffix,
      +next => +operations => +tail => trace_suffix(rest, next, operations, tail))

def main() -> Unit:
  Unit{}
