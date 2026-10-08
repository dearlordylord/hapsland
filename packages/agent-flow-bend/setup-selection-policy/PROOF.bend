import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.step_exact(phase, action, outcome, nonempty, has_next):
  match phase action outcome:
    case Core.SelectingAgents{} Core.HostsSelected{} Core.HostCompleted{}: {==}
    case Core.SelectingAgents{} Core.HostsSelected{} Core.HostBack{}: {==}
    case Core.SelectingAgents{} Core.HostsSelected{} Core.HostCancelled{}: {==}
    case Core.SelectingAgents{} Core.SelectionEnded{} Core.HostCompleted{}: {==}
    case Core.SelectingAgents{} Core.SelectionEnded{} Core.HostBack{}: {==}
    case Core.SelectingAgents{} Core.SelectionEnded{} Core.HostCancelled{}: {==}
    case Core.SelectingAgents{} Core.HostObserved{} Core.HostCompleted{}: {==}
    case Core.SelectingAgents{} Core.HostObserved{} Core.HostBack{}: {==}
    case Core.SelectingAgents{} Core.HostObserved{} Core.HostCancelled{}: {==}
    case Core.RunningAgents{} Core.HostsSelected{} Core.HostCompleted{}: {==}
    case Core.RunningAgents{} Core.HostsSelected{} Core.HostBack{}: {==}
    case Core.RunningAgents{} Core.HostsSelected{} Core.HostCancelled{}: {==}
    case Core.RunningAgents{} Core.SelectionEnded{} Core.HostCompleted{}: {==}
    case Core.RunningAgents{} Core.SelectionEnded{} Core.HostBack{}: {==}
    case Core.RunningAgents{} Core.SelectionEnded{} Core.HostCancelled{}: {==}
    case Core.RunningAgents{} Core.HostObserved{} Core.HostCompleted{}: {==}
    case Core.RunningAgents{} Core.HostObserved{} Core.HostBack{}: {==}
    case Core.RunningAgents{} Core.HostObserved{} Core.HostCancelled{}: {==}
    case Core.SelectionDone{} Core.HostsSelected{} Core.HostCompleted{}: {==}
    case Core.SelectionDone{} Core.HostsSelected{} Core.HostBack{}: {==}
    case Core.SelectionDone{} Core.HostsSelected{} Core.HostCancelled{}: {==}
    case Core.SelectionDone{} Core.SelectionEnded{} Core.HostCompleted{}: {==}
    case Core.SelectionDone{} Core.SelectionEnded{} Core.HostBack{}: {==}
    case Core.SelectionDone{} Core.SelectionEnded{} Core.HostCancelled{}: {==}
    case Core.SelectionDone{} Core.HostObserved{} Core.HostCompleted{}: {==}
    case Core.SelectionDone{} Core.HostObserved{} Core.HostBack{}: {==}
    case Core.SelectionDone{} Core.HostObserved{} Core.HostCancelled{}: {==}
    case Core.SelectionCancelled{} Core.HostsSelected{} Core.HostCompleted{}: {==}
    case Core.SelectionCancelled{} Core.HostsSelected{} Core.HostBack{}: {==}
    case Core.SelectionCancelled{} Core.HostsSelected{} Core.HostCancelled{}: {==}
    case Core.SelectionCancelled{} Core.SelectionEnded{} Core.HostCompleted{}: {==}
    case Core.SelectionCancelled{} Core.SelectionEnded{} Core.HostBack{}: {==}
    case Core.SelectionCancelled{} Core.SelectionEnded{} Core.HostCancelled{}: {==}
    case Core.SelectionCancelled{} Core.HostObserved{} Core.HostCompleted{}: {==}
    case Core.SelectionCancelled{} Core.HostObserved{} Core.HostBack{}: {==}
    case Core.SelectionCancelled{} Core.HostObserved{} Core.HostCancelled{}: {==}
