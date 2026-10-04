import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ../Numeric.bend as Numeric
import ../Workload.bend as Workload
import ./native-run-scenario.bend as Trace
import ./native-run-projection.bend as Projection

def view(observation: T.Observation) -> List<&2, Nat>:
  match observation:
    case T.Observation{time, count, _, _, queued, valid, _}: [time, count, queued, Projection.boolean(valid)]

def config(jev: Nat, preparation: Nat, lifetime: Nat, generation: Nat,
    weights: List<&2, Numeric.Words>, original: T.Config) -> T.Config:
  match original:
    case T.Config{limits, advicees, T.Environment{_, _, _, _, tree, graph, output, lease, current, ready, _, readable, _}, collectors}:
      T.Config{limits, advicees, T.Environment{jev, None{}, weights, preparation, tree, graph,
        output, lease, current, ready, generation, readable, lifetime}, collectors}

def initial(seed: Nat, jev: Nat, preparation: Nat, lifetime: Nat, generation: Nat,
    weights: List<&2, Numeric.Words>) -> List<&2, Nat>:
  view(Run.observe(Run.create(config(jev, preparation, lifetime, generation, weights, Trace.original_config()), seed)))

def controlled(result: T.Controlled) -> List<&2, Nat>:
  match result:
    case T.Controlled{state, applied}: Projection.boolean(applied) <> view(Run.observe(state))

# Native Nat cannot represent 2^48. Construct the supported maximum without
# an overflowing intermediate; host-only tests assert refusal above this domain.
def largest() -> Nat:
  Nat.add(Nat.mul(65535n, Nat.add(4294967295n, 1n)), 4294967295n)

def trace() -> List<&2, List<&2, Nat>>:
  [initial(largest(), 5n, 2n, 600000n, 1n, Trace.weights()),
   initial(7n, 5n, largest(), 600000n, 1n, Trace.weights()),
   initial(7n, largest(), 2n, 600000n, 1n, Trace.weights()),
   initial(7n, 5n, 2n, largest(), 1n, Trace.weights()),
   initial(7n, 5n, 2n, 600000n, 1000000000n, Trace.weights()),
   initial(7n, 5n, 2n, 600000n, 0n, Trace.weights()),
   initial(7n, 5n, 2n, 600000n, 1000000001n, Trace.weights()),
   initial(7n, 5n, 2n, 600000n, 1n, [Numeric.Words{0n, 0n}, Numeric.Words{0n, 1n},
     Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}]),
   initial(7n, 5n, 2n, 600000n, 1n, [Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n},
     Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}]),
   controlled(Run.control(Run.create(Trace.original_config(), 7n), T.WorkloadControl{Some{1n}, Workload.Sizes{1n, []}}))]

def main() -> IO(Unit):
  IO.print(Projection.bracket(Projection.show_rows(trace())))
