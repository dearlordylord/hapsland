import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Execution.bend as E
import ./Potential.bend as P
import ./WeightedInventory.bend as W

# Proof-only resource accounting for the actual Core machine. Each reference
# pays its transition and eight commands; each frame reserves finish and Add.
# Unexpanded declarations reserve their existing Execution declaration weight.
def cursor(actual: C.Cursor) -> Nat:
  match actual:
    case C.Cursor{global, _, _, expanded, _, _, _, +frames}:
      Nat.add(Nat.mul(9n, P.pending_references(frames)),
        Nat.add(W.catalog_unvisited(~E.declaration_weight, C.global_catalog(global), expanded),
          Nat.mul(2n, List.length(&2, C.Frame, frames))))

def deferred(next: C.Deferred) -> Nat:
  match next:
    case C.CursorNext{actual}: cursor(actual)
    case C.RootNext{_}: 0n

def measure(step: C.Step) -> Nat:
  match step:
    case C.Continue{actual}: cursor(actual)
    case C.Engine{_, _, remaining, next}:
      1n+Nat.add(List.length(&2, M.Op, remaining), deferred(next))
    case _: 0n

def active(step: C.Step) -> Bool:
  match step:
    case C.Continue{_}: True{}
    case C.Engine{_, _, _, _}: True{}
    case _: False{}

def main() -> Unit:
  Unit{}
