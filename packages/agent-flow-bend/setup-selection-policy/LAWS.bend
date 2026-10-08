import Base
import ./core.bend as Core

# Draft-time declaration: proposed law awaiting Astra review; no proof written yet.
# Exact navigation preserves native payload ownership and does not authorize per-agent writes.
def observed_spec(outcome: Core.Outcome, has_next: Bool) -> Core.Phase:
  match outcome:
    case Core.HostBack{}: Core.SelectingAgents{}
    case Core.HostCancelled{}: Core.SelectionCancelled{}
    case Core.HostCompleted{}: Bool.pick(
      Core.Phase,
      has_next,
      Core.RunningAgents{},
      Core.SelectionDone{}
    )

def step_spec(
  phase: Core.Phase,
  action: Core.Action,
  outcome: Core.Outcome,
  nonempty: Bool,
  has_next: Bool
) -> Core.Plan:
  match phase action:
    case Core.SelectingAgents{} Core.HostsSelected{}: Bool.pick(
      Core.Plan,
      nonempty,
      Core.SelectionStart{},
      Core.SelectionHold{}
    )
    case Core.SelectingAgents{} Core.SelectionEnded{}: Core.SelectionEnd{}
    case Core.RunningAgents{} Core.HostObserved{}: Core.SelectionObserved{
      observed_spec(outcome, has_next)
    }
    case _ _: Core.SelectionHold{}

law step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +outcome: Core.Outcome
  for +nonempty: Bool
  for +has_next: Bool
  {
    Core.step(phase, action, outcome, nonempty, has_next)
    == step_spec(phase, action, outcome, nonempty, has_next)
    : Core.Plan
  }
