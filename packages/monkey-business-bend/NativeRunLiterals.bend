# Concrete witnesses for proposal falsification; universal laws stay universal.
import Base
import ./NativeGenerated.bend as NativeGenerated
import ./NativeRun.bend as NativeRun
import ./NativeRunTypes.bend as T
import ./Engine.bend as Engine
import ./StopScenario.bend as StopScenario
import ./Numeric.bend as Numeric
import ./conformance/native-run-scenario.bend as Trace
import ../agent-flow-bend/Ledger.bend as Ledger

def environment(config: T.Config) -> T.Environment:
  match config:
    case T.Config{_, _, value, _}: value

def state() -> T.State:
  T.State{
    [
      Engine.stop_with(
        Engine.initial(Ledger.Limits{2n, 100n, 2n, 100n}),
        StopScenario.State{[], 1n}
      )
    ],
    [],
    9n,
    7n,
    0n,
    environment(Trace.original_config()),
    [],
    True{},
    [],
    [],
    T.HostFacts{[], [], [], NativeRun.default_runtime(), NativeGenerated.initial(), [None{}]}
  }

def proposed() -> T.State:
  T.State{
    [
      Engine.stop_with(
        Engine.initial(Ledger.Limits{2n, 100n, 2n, 100n}),
        StopScenario.State{[], 1n}
      )
    ],
    [],
    10n,
    8n,
    0n,
    environment(Trace.original_config()),
    [],
    True{},
    [],
    [],
    T.HostFacts{[], [], [], NativeRun.default_runtime(), NativeGenerated.initial(), [None{}]}
  }

def weights() -> List<&2, Numeric.Words>:
  Trace.weights()
