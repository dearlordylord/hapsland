import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ../Workload.bend as Workload
import ./native-run-scenario.bend as Trace
import ./native-run-projection.bend as Projection

def continued(result: T.Controlled) -> List<&2, List<&2, Nat>>:
  match result:
    case T.Controlled{state, _}: Trace.trace_rows(Trace.until(1000n, state, 30n, []))

def trace() -> List<&2, List<&2, Nat>>:
  continued(Run.control(Run.create(Trace.original_config(), 7n),
    T.WorkloadControl{Some{1n}, Workload.Sizes{1n, []}}))

def main() -> IO(Unit):
  IO.print(Projection.bracket(Projection.show_rows(trace())))
