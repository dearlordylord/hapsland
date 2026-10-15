import Base
import ./Model.bend as M

# Verification-only stack depth. It models no IEEE values and performs no
# native measurements; underflow is an explicit refusal.
def binary_tail(depth: Nat) -> Maybe<&2, Nat>:
  match depth:
    case 0n: None{}
    case 1n+rest: Some{1n+rest}

def binary(depth: Nat) -> Maybe<&2, Nat>:
  match depth:
    case 0n: None{}
    case 1n+rest: binary_tail(rest)

def operation(operation: M.Op, depth: Nat) -> Maybe<&2, Nat>:
  match operation:
    case M.Push{_}: Some{1n+depth}
    case M.MeasureArtifact{_}: Some{1n+depth}
    case M.MeasureText{_}: Some{1n+depth}
    case M.Add{}: binary(depth)
    case M.Multiply{}: binary(depth)

def continue_depth(value: Maybe<&2, Nat>, next: Nat -> Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match value:
    case None{}: None{}
    case Some{depth}: next(depth)

def depth(operations: List<&2, M.Op>, current: Nat) -> Maybe<&2, Nat>:
  match operations:
    case []: Some{current}
    case head <> tail: continue_depth(operation(head, current), next => depth(tail, next))

def terminal(value: Maybe<&2, Nat>) -> Bool:
  match value:
    case Some{1n}: True{}
    case _: False{}

def maybe_depth(operations: Maybe<&2, List<&2, M.Op>>, current: Nat) -> Maybe<&2, Nat>:
  match operations:
    case None{}: None{}
    case Some{operations}: depth(operations, current)

def trace_valid(operations: Maybe<&2, List<&2, M.Op>>) -> Bool:
  match operations:
    case None{}: False{}
    case Some{operations}: terminal(depth(operations, 0n))

def main() -> Unit:
  Unit{}
