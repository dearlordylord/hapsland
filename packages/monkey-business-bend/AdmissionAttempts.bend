import Base
import ../agent-flow-bend/Canonical.bend as Canonical
import ./Driver.bend as Driver

# Bookkeeping for issued simulated OpenRound facts, not admission policy.
def contains(pending: List<&2, Nat>, +partition: Nat) -> Bool:
  match pending:
    case Nil{}: False{}
    case head <> tail: Nat.is_eq(head, partition) || contains(tail, partition)

def remove_hit(hit: Bool, head: Nat, tail: List<&2, Nat>) -> List<&2, Nat>:
  match hit:
    case True{}: tail
    case False{}: head <> tail

def remove(pending: List<&2, Nat>, +partition: Nat) -> List<&2, Nat>:
  match pending:
    case Nil{}: Nil{}
    case +head <> tail: remove_hit(Nat.is_eq(head, partition), head, remove(tail, partition))

def consumed(pending: List<&2, Nat>, event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.OpenRound{partition, _}: remove(pending, partition)
    case _: pending

type Attempt is Data:
  Attempt{pending: List<&2, Nat>, plan: Driver.EditPlan}

def pending_plan(already_pending: Bool, pending: List<&2, Nat>, partition: Nat, actions: List<&2, Driver.Action>) -> Attempt:
  match already_pending:
    case True{}: Attempt{pending, Driver.EditPlan{True{}, Nil{}}}
    case False{}: Attempt{partition <> pending, Driver.EditPlan{True{}, actions}}

def planned(+pending: List<&2, Nat>, +partition: Nat, plan: Driver.EditPlan) -> Attempt:
  match plan:
    case Driver.EditPlan{True{}, actions}: pending_plan(contains(pending, partition), pending, partition, actions)
    case _: Attempt{pending, plan}

def edit(state: Canonical.State, pending: List<&2, Nat>, +partition: Nat, lifetime: Nat) -> Attempt:
  planned(pending, partition, Driver.edit(state, partition, lifetime))
