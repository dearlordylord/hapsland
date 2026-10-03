import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ../../agent-flow-bend/Canonical.bend as Canonical
import ./native-run-scenario.bend as Trace
import ./native-run-event-boundary.bend as Boundary
import ./native-run-projection.bend as Projection

def finding_config(config: T.Config) -> T.Config:
  match config:
    case T.Config{limits, advicees, T.Environment{delay, _, weights, prep, tree, graph, output, lease, current, ready, generation, readable, lifetime}, collectors}:
      T.Config{limits, advicees, T.Environment{delay, Some{Canonical.RequestFinding{}}, weights,
        prep, tree, graph, output, lease, current, ready, generation, readable, lifetime}, collectors}

def changed(result: T.Controlled) -> T.State:
  match result:
    case T.Controlled{state, _}: state

def restored(result: Trace.Trace) -> Trace.Trace:
  match result:
    case Trace.Trace{states, rows}:
      Trace.until(1000n, changed(Run.control(Trace.boxed(states), T.EnvironmentControl{True{}, True{}, 1n, True{}})),
        19n, List.reverse(&2, List<&2, Nat>, rows))

def unavailable(result: Trace.Trace) -> Trace.Trace:
  match result:
    case Trace.Trace{states, rows}:
      restored(Trace.until(1000n, changed(Run.control(Trace.boxed(states), T.EnvironmentControl{True{}, False{}, 1n, True{}})),
        18n, List.reverse(&2, List<&2, Nat>, rows)))

def trace() -> List<&2, List<&2, Nat>>:
  Trace.trace_rows(unavailable(Boundary.until_event(1000n,
    Run.create(finding_config(Trace.original_config()), 7n), 12n, [])))

def main() -> IO(Unit):
  IO.print(Projection.bracket(Projection.show_rows(trace())))
