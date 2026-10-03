import Base
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Session.bend as Session
import ../../packages/monkey-business-bend/Workload.bend as Workload
import ../../packages/monkey-business-bend/Numeric.bend as Numeric
import ../../packages/monkey-business-bend/TreeFacts.bend as Tree
import ../../packages/monkey-business-bend/conformance/native-run-scenario.bend as Trace
import ../../packages/monkey-business-bend/conformance/native-run-projection.bend as Projection
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/agent-flow-bend/ImportGraph.bend as Graph

# Independent literal agreement target. Actual execution below uses the maintained
# game consumer's configuration; game-owned ConfigAgreement checks this literal.
def consumer_seed() -> Nat:
  152n

def consumer_config() -> T.Config:
  T.Config{Ledger.Limits{32n, 480n, 16n, 480n},
    [T.Advicee{1n, Workload.Profile{Session.Settings{1200, 200, 4, 3000, 0, 300}, 152,
      [97, 103, 101, 110, 116, 45, 49], 100n, [10n, 20n], None{}}}],
    T.Environment{3200n, None{}, Trace.weights(), 800n,
      Tree.Profile{1n, 3n, 2n, 2n, 0n, 0n, 0n, 10n, 0n, 0n, 0n, 0n, 4n, 8n, 3n, 6n},
      Graph.Limits{1n, 262144n, 20480n, 8n, 1572864n, 16n, 4n, 128n},
      800n, 5000n, True{}, True{}, 1n, True{}, 20000n}}

def changed(result: T.Controlled) -> T.State:
  match result:
    case T.Controlled{state, _}: state

def control(state: T.State, action: Workload.Control) -> T.State:
  changed(Run.control(state, T.WorkloadControl{Some{1n}, action}))

def reversed(rows: List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  List.reverse(&2, List<&2, Nat>, rows)

def final(result: Trace.Trace) -> Trace.Trace:
  match result:
    case Trace.Trace{states, rows}:
      Trace.until(2000n, changed(Run.control(Trace.boxed(states), T.JevProfile{3200n,
        [Numeric.Words{0n, 0n}, Numeric.Words{1071644672n, 0n}, Numeric.Words{1072693248n, 0n},
         Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}]})), 12000n, reversed(rows))

def resumed(result: Trace.Trace) -> Trace.Trace:
  match result:
    case Trace.Trace{states, rows}:
      final(Trace.until(2000n, control(control(Trace.boxed(states), Workload.Suspend{False{}}),
        Workload.Pace{20}), 2400n, reversed(rows)))

def suspended(result: Trace.Trace) -> Trace.Trace:
  match result:
    case Trace.Trace{states, rows}:
      resumed(Trace.until(2000n, control(Trace.boxed(states), Workload.Suspend{True{}}), 2200n, reversed(rows)))

def trace() -> List<&2, List<&2, Nat>>:
  Trace.trace_rows(suspended(Trace.until(2000n,
    control(Run.create(Consumer.config(), consumer_seed()), Workload.Burst{1n}), 2000n, [])))

def main() -> IO(Unit):
  IO.print(Projection.bracket(Projection.show_rows(trace())))
