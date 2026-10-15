import Base
import ./Model.bend as M
import ./Core.bend as Core
import ./Execution.bend as E
import ./Specification.bend as S

# Verification owner for one complete root, stopping before the suspended outer
# roots continuation. Production does not import this interpreter or the spec.
type RootRun is Data:
  RootDone{global: Core.Global, reversed: List<&2, M.Op>}
  RootFailed{step: Core.Step}

type Expectation is Data:
  RootExpectation{global: Core.Global, operations: List<&2, M.Op>}

def terminal(step: Core.Step, reversed: List<&2, M.Op>) -> RootRun:
  match step:
    case Core.NextRoot{global}: RootDone{global, reversed}
    case other: RootFailed{other}

def dispatch(+step: Core.Step, reversed: List<&2, M.Op>, next: Core.Step -> List<&2, M.Op> -> RootRun) -> RootRun:
  match step:
    case Core.Engine{+operation, +request, remaining, continuation}:
      next(Core.resume(Core.Engine{operation, request, remaining, continuation}, Core.Ack{request}))(operation <> reversed)
    case Core.Continue{cursor}: next(Core.advance(Core.Continue{cursor}))(reversed)
    case Core.NextRoot{global}: RootDone{global, reversed}
    case other: RootFailed{other}

def run(fuel: Nat, step: Core.Step, reversed: List<&2, M.Op>) -> RootRun:
  match fuel:
    case 0n: terminal(step, reversed)
    case 1n+remaining: dispatch(step, reversed, next => operations => run(remaining, next, operations))

def execute(+root: M.Declaration, +catalog: M.Catalog, purpose: Core.Purpose,
  pending: List<&2, M.Declaration>, prefix: List<&2, M.Outcome>, request: Nat) -> RootRun:
  run(Nat.sub(E.root_weight(root, catalog), 1n),
    Core.next_root(Core.Global{catalog, purpose, root <> pending, prefix, request}), [])

def expected_operations(purpose: Core.Purpose, bytes: S.BytesExpr) -> List<&2, M.Op>:
  match purpose:
    case Core.Preflight{}: List.append(&2, M.Op, S.postfix(bytes), [M.Add{}])
    case _: []

def expected_prefix(purpose: Core.Purpose, +node: M.NodePlan, failure: Maybe<&2, M.Failure>, prefix: List<&2, M.Outcome>) -> List<&2, M.Outcome>:
  match purpose:
    case Core.Trees{}: M.Outcome{S.node_slot(node), failure, Some{node}} <> prefix
    case Core.Outcomes{}: M.Outcome{S.node_slot(node), failure, None{}} <> prefix
    case Core.Preflight{}: prefix

def expectation(result: S.NodeResult, catalog: M.Catalog, +purpose: Core.Purpose,
  pending: List<&2, M.Declaration>, prefix: List<&2, M.Outcome>, request: Nat) -> Maybe<&2, Expectation>:
  match result:
    case S.DepthExhausted{}: None{}
    case S.NodeResult{S.State{_, _, _, failure}, node, +bytes}:
      Some{RootExpectation{Core.Global{catalog, purpose, pending, expected_prefix(purpose, node, failure, prefix),
        Nat.add(request, List.length(&2, M.Op, expected_operations(purpose, bytes)))}, expected_operations(purpose, bytes)}}

def expected(+root: M.Declaration, +catalog: M.Catalog, purpose: Core.Purpose,
  pending: List<&2, M.Declaration>, prefix: List<&2, M.Outcome>, request: Nat) -> Maybe<&2, Expectation>:
  expectation(S.analyze(root, catalog), catalog, purpose, pending, prefix, request)

# A pair of equal failures cannot inhabit this contract: both sides must finish.
def correspondence(actual: RootRun, expected: Maybe<&2, Expectation>) -> Type:
  match actual expected:
    case RootDone{actual_global, reversed} Some{RootExpectation{expected_global, operations}}:
      {actual_global == expected_global : Core.Global}
      & {List.reverse(&2, M.Op, reversed) == operations : List<&2, M.Op>}
    case _ _: Empty

def main() -> Unit:
  Unit{}
