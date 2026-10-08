import Base

# Pure outer setup navigation; host owns selected payloads, cursor arithmetic and effects.
type Phase is Data:
  SelectingAgents{}
  RunningAgents{}
  SelectionDone{}
  SelectionCancelled{}

type Action is Data:
  HostsSelected{}
  SelectionEnded{}
  HostObserved{}

type Outcome is Data:
  HostCompleted{}
  HostBack{}
  HostCancelled{}

type Plan is Data:
  SelectionHold{}
  SelectionStart{}
  SelectionEnd{}
  SelectionObserved{phase: Phase}

def observed_phase(outcome: Outcome, has_next: Bool) -> Phase:
  match outcome:
    case HostBack{}: SelectingAgents{}
    case HostCancelled{}: SelectionCancelled{}
    case HostCompleted{}: Bool.pick(Phase, has_next, RunningAgents{}, SelectionDone{})

def step(phase: Phase, action: Action, outcome: Outcome, nonempty: Bool, has_next: Bool) -> Plan:
  match phase action:
    case SelectingAgents{} HostsSelected{}: Bool.pick(
      Plan,
      nonempty,
      SelectionStart{},
      SelectionHold{}
    )
    case SelectingAgents{} SelectionEnded{}: SelectionEnd{}
    case RunningAgents{} HostObserved{}: SelectionObserved{observed_phase(outcome, has_next)}
    case _ _: SelectionHold{}
