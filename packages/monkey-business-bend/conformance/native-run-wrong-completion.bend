import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as Canonical
import ./native-run-scenario.bend as Trace

# Original wrong-parent callback at the current clock while legitimate
# preparation still owns its graph. It must not release that graph.
def rejected_completion(result: Trace.Trace) -> Trace.Trace:
  match result:
    case Trace.Trace{states, rows}:
      +state = Trace.boxed(states)
      Trace.until(1000n, Run.enqueue(state, Run.clock(state), T.Event{
        Driver.immediate(Canonical.PreparationCompleted{1n, 1n, 999n, 1n, [5n]}, False{}), None{},None{},None{}}),
        30n, List.reverse(&2, List<&2, Nat>, rows))

def trace() -> List<&2, List<&2, Nat>>:
  Trace.trace_rows(rejected_completion(Trace.until(1000n,
    Run.create(Trace.original_config(), 7n), 10n, [])))
