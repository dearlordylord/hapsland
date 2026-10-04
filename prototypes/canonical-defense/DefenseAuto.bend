# Presentation control only. Workload scheduling belongs to NativeRun.
import Base
type State is Data:
  Activity{enabled: Bool}
def initial() -> State: Activity{True{}}
def enabled(state: State) -> Bool:
  match state:
    case Activity{enabled}: enabled
def toggle(state: State) -> State: Activity{Bool.not(enabled(state))}
