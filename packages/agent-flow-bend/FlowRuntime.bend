import Base
import ./Flow.bend as Flow

# Keep public reducer and its change projection reachable in generated JS.
def main() -> Flow.Step & List<&2, Flow.FlowChange>:
  +initial = Flow.initial()
  +result = Flow.step(initial, Flow.EditObserved{}, None{})
  (result, Flow.changes(initial, Flow.EditObserved{}, None{}, result))
