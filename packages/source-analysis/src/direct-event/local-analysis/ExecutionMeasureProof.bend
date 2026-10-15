import Base
import ./Model.bend as M
import ./Core.bend as C
import ./JointStep.bend as Step
import ./JointStepProof.bend as StepProof
import ./ExecutionMeasure.bend as Measure
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

def main() -> Unit:
  Unit{}
