import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ./native-run-scenario.bend as Trace
import ./native-run-event-boundary.bend as Boundary
import ./native-run-credential-restore.bend as Credential

def rotated(result: Trace.Trace) -> Trace.Trace:
  match result:
    case Trace.Trace{states, rows}:
      Trace.until(1000n, Credential.changed(Run.control(Trace.boxed(states), T.EnvironmentControl{True{}, True{}, 2n, True{}})),
        19n, List.reverse(&2, List<&2, Nat>, rows))

def trace() -> List<&2, List<&2, Nat>>:
  Trace.trace_rows(rotated(Boundary.until_event(1000n,
    Run.create(Credential.finding_config(Trace.original_config()), 7n), 11n, [])))
