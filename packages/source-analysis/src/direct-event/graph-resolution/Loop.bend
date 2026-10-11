import Base
import ./Types.bend as T
import ./traversal/core.bend as Local
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

type Continuation is Data:
  PythonIteration{state: T.ResolverState}
  PythonTerminal{state: T.ResolverState, result: T.ResolverStep}
  AdmitPythonCapture{state: T.ResolverState, cached: T.CacheOutcome}
  PythonCaptured{state: T.ResolverState, outcome: T.CaptureOutcome}
  InspectPythonTarget{state: T.ResolverState, capture: T.CaptureToken}
  ResolvePython{state: T.ResolverState, edge: Local.Pending}
  PreparePython{state: T.ResolverState}
  InspectPythonRoot{state: T.ResolverState}
  PrepareRust{state: T.ResolverState}
  PreparedRust{state: T.ResolverState, prepared: T.PreparedLanguage, frontend: T.RustContext}
  RustAdvance{state: T.ResolverState, event: Graph.GraphEvent}
  RustInvalid{state: T.ResolverState}
  RustFollowInvalid{state: T.ResolverState}
  RustFindCargo{state: T.ResolverState}
  RustCargoContinue{state: T.ResolverState}
  RustFollow{state: T.ResolverState, route: T.RustRoute, capture: T.CaptureToken}
  RustCargo{state: T.ResolverState, syntax: T.TomlValue}
  RustModules{state: T.ResolverState, names: List<&2, String>}
  RustTasks{state: T.ResolverState, tasks: List<&2, T.RustTask>}
  ServiceStep{step: T.ResolverStep}
  ResolvePending{state: T.ResolverState, edge: Nat}
  CheckTarget{state: T.ResolverState, target: Nat}
  ReadTarget{state: T.ResolverState, target: Nat}
  InspectCaptured{state: T.ResolverState, facts: T.SourceFacts}
  ReadBundled{state: T.ResolverState, declaration: Nat, facts: Local.Facts, edge: Local.Pending}
  PrepareImportedRust{state: T.ResolverState}

# Follow only reachable Expanded links. A finite valid address tree needs at
# most one node-count of fuel; unreachable rejected records cannot create a
# partial ReviewUnit. Shape/completion preservation remains a whole-machine law.
def main() -> Unit:
  Unit{}
