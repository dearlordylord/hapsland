import Base
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../monkey-business-bend/AdmissionAttempts.bend as Attempts
import ../../monkey-business-bend/Driver.bend as Driver

# Scoped bookkeeping probe: independent expected [1,1,0,1,0].
# No alternate reducer and no unbounded Run retry loop.
def action_count(plan: Driver.EditPlan) -> Nat:
  match plan:
    case Driver.EditPlan{_, actions}: List.length(&2, Driver.Action, actions)

def attempted_actions(attempt: Attempts.Attempt) -> Nat:
  match attempt:
    case Attempts.Attempt{_, plan}: action_count(plan)

def duplicate(attempt: Attempts.Attempt, state: Canonical.State) -> Nat:
  match attempt:
    case Attempts.Attempt{pending, _}:
      attempted_actions(Attempts.edit(state, pending, 1n, 1n))

def observed(+state: Canonical.State, +issued: Attempts.Attempt) -> List<&2, Nat>:
  match issued:
    case Attempts.Attempt{+pending, +plan}:
      List.length(&2, Nat, pending) <> action_count(plan) <>
        duplicate(issued, state) <>
        List.length(&2, Nat, Attempts.consumed(pending, Canonical.AdmitObservation{1n, 1n, 1n})) <>
        List.length(&2, Nat, Attempts.consumed(pending, Canonical.OpenRound{1n, 1n})) <> Nil{}

def start(+state: Canonical.State) -> List<&2, Nat>:
  observed(state, Attempts.edit(state, [], 1n, 1n))

def main() -> List<&2, Nat>:
  start(Canonical.initial(Ledger.Limits{128n, 100000n, 16n, 50000n}))
