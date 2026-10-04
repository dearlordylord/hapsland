import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ../Numeric.bend as Numeric
import ./native-run-scenario.bend as Trace

# First request already has its Clear outcome and deadline at clock12. The
# original later control supplies raw MIN_VALUE, not a precomputed sampler CDF.
def changed(result: T.Controlled, rows: List<&2, List<&2, Nat>>) -> Trace.Trace:
  match result:
    case T.Controlled{state, _}: Trace.until(1000n, state, 30n, rows)

def profile(result: Trace.Trace) -> Trace.Trace:
  match result:
    case Trace.Trace{states, rows}:
      changed(Run.control(Trace.boxed(states), T.JevProfile{5n,
        [Numeric.Words{0n, 0n}, Numeric.Words{0n, 1n}, Numeric.Words{0n, 0n},
         Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}]}),
        List.reverse(&2, List<&2, Nat>, rows))

def trace() -> List<&2, List<&2, Nat>>:
  Trace.trace_rows(profile(Trace.until(1000n,
    Run.create(Trace.original_config(), 7n), 12n, [])))
