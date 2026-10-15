import Base
import ./Model.bend as M
import ./Core.bend as Core

# Proof/check interpreter only. Production drives advance/resume in its lease.
# Ack records completion, never numeric data or a policy choice by the host.
type Run is Data:
  Run{terminal: Core.Step, reversed: List<&2, M.Op>}

def dispatch(+step: Core.Step, reversed: List<&2, M.Op>, next: Core.Step -> List<&2, M.Op> -> Run) -> Run:
  match step:
    case Core.Engine{+operation, +request, remaining, continuation}:
      next(Core.resume(Core.Engine{operation, request, remaining, continuation}, Core.Ack{request}))(operation <> reversed)
    case Core.Continue{cursor}: next(Core.advance(Core.Continue{cursor}))(reversed)
    case Core.NextRoot{global}: next(Core.advance(Core.NextRoot{global}))(reversed)
    case terminal: Run{terminal, reversed}

def run(fuel: Nat, step: Core.Step, reversed: List<&2, M.Op>) -> Run:
  match fuel:
    case 0n: Run{step, reversed}
    case 1n+remaining: dispatch(step, reversed, next => operations => run(remaining, next, operations))

# Each declaration needs at most: root-entry transition, three measurement
# Acks, frame completion, and subtotal Add Ack. Each reference needs its visit
# transition and eight arithmetic/measurement Acks. Child entry shares the
# parent's reference transition; counting six remains conservative.
def declaration_weight(declaration: M.Declaration) -> Nat:
  match declaration:
    case M.Declaration{_, _, _, references}: Nat.add(6n, Nat.mul(9n, List.length(&2, M.Reference, references)))

def declarations_weight(declarations: List<&2, M.Declaration>) -> Nat:
  match declarations:
    case []: 0n
    case head <> tail: Nat.add(declaration_weight(head), declarations_weight(tail))

def supporting_weight(supporting: List<&2, M.Supporting>) -> Nat:
  match supporting:
    case []: 0n
    case M.Supporting{_, declaration} <> tail: Nat.add(declaration_weight(declaration), supporting_weight(tail))

def root_weight(root: M.Declaration, catalog: M.Catalog) -> Nat:
  match catalog:
    case M.Catalog{declarations, supporting}:
      Nat.add(declaration_weight(root), Nat.add(declarations_weight(declarations), supporting_weight(supporting)))

def roots_weight(roots: List<&2, M.Declaration>, +catalog: M.Catalog) -> Nat:
  match roots:
    case []: 0n
    case head <> tail: Nat.add(root_weight(head, catalog), roots_weight(tail, catalog))

# Initial Push(0) Ack and final NextRoot transition are counted separately.
# This is an internal candidate bound, not an assumed completion theorem.
def budget(+catalog: M.Catalog) -> Nat:
  Nat.add(2n, roots_weight(Core.catalog_declarations(catalog), catalog))

def execute(+catalog: M.Catalog, purpose: Core.Purpose) -> Run:
  run(budget(catalog), Core.initial(catalog, purpose), [])

def outcomes(result: Run) -> Maybe<&2, List<&2, M.Outcome>>:
  match result:
    case Run{Core.Completed{values}, _}: Some{values}
    case _: None{}

def trace(result: Run) -> Maybe<&2, List<&2, M.Op>>:
  match result:
    case Run{Core.PreflightCompleted{}, reversed}: Some{List.reverse(&2, M.Op, reversed)}
    case _: None{}

def completed(result: Run) -> Bool:
  match result:
    case Run{Core.Completed{_}, _}: True{}
    case Run{Core.PreflightCompleted{}, _}: True{}
    case _: False{}

def main() -> Unit:
  Unit{}
