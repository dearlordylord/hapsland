import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_BOUND_PROOF.bend as Bound
import ./CONTINUATION_ADEQUATE_PROOF.bend as Adequate
import ./CONTINUATION_STATE_PROOF.bend as State
import ./INTERPRETER_ORDER_PROOF.bend as Order

def bound(+machine: Core.Machine) -> Nat:
  Continuation.bound(CoreTraversal.machine_facts(machine), State.frames(machine))

def fuel(+machine: Core.Machine) -> Nat:
  Adequate.common(
    bound(machine),
    bound(CoreTraversal.step(machine)),
    Relation.spec_bound(CoreTraversal.machine_facts(machine))
  )

def before(+machine: Core.Machine) -> {
  Bound.adequate(CoreTraversal.machine_facts(machine), fuel(machine), State.frames(machine)) == True{} : Bool
}:
  Adequate.monotone(
    State.frames(machine),
    CoreTraversal.machine_facts(machine),
    bound(machine),
    fuel(machine),
    Bound.actual_bound_adequate(CoreTraversal.machine_facts(machine), State.frames(machine)),
    Adequate.first(
      bound(machine),
      bound(CoreTraversal.step(machine)),
      Relation.spec_bound(CoreTraversal.machine_facts(machine))
    )
  )

def after(+machine: Core.Machine) -> {
  Bound.adequate(
    CoreTraversal.machine_facts(CoreTraversal.step(machine)),
    fuel(machine),
    State.frames(CoreTraversal.step(machine))
  )
  == True{}
  : Bool
}:
  Adequate.monotone(
    State.frames(CoreTraversal.step(machine)),
    CoreTraversal.machine_facts(CoreTraversal.step(machine)),
    bound(CoreTraversal.step(machine)),
    fuel(machine),
    Bound.actual_bound_adequate(
      CoreTraversal.machine_facts(CoreTraversal.step(machine)),
      State.frames(CoreTraversal.step(machine))
    ),
    Adequate.second(
      bound(machine),
      bound(CoreTraversal.step(machine)),
      Relation.spec_bound(CoreTraversal.machine_facts(machine))
    )
  )

def before_successor(+machine: Core.Machine) -> {
  Bound.adequate(CoreTraversal.machine_facts(machine), (1n + fuel(machine) : Nat), State.frames(machine))
  == True{}
  : Bool
}:
  Adequate.monotone(
    State.frames(machine),
    CoreTraversal.machine_facts(machine),
    fuel(machine),
    (1n + fuel(machine) : Nat),
    before(machine),
    Adequate.successor(fuel(machine), fuel(machine), Order.le_refl(fuel(machine)))
  )

def specification(+machine: Core.Machine) -> {
  Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel(machine)) == True{} : Bool
}:
  Adequate.third(
    bound(machine),
    bound(CoreTraversal.step(machine)),
    Relation.spec_bound(CoreTraversal.machine_facts(machine))
  )

def positive(+machine: Core.Machine) -> {Nat.is_le(1n, fuel(machine)) == True{} : Bool}:
  Adequate.positive(
    bound(machine),
    bound(CoreTraversal.step(machine)),
    Relation.spec_bound(CoreTraversal.machine_facts(machine))
  )
