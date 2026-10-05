import Base
import ./RuntimeScenarios.bend as RuntimeScenarios
import ./AdviceeLifecycle.bend as AdviceeLifecycle
import ./AdviceeLifecycleCleanup.bend as AdviceeLifecycleCleanup
import ./AdviceeActivity.bend as AdviceeActivity
import ./Advicees.bend as Advicees
import ./CredentialFacts.bend as CredentialFacts
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ./Scheduler.bend as Scheduler
import ./Workload.bend as Workload
import ./Random.bend as Random

type GraphEntry is Data:
  GraphEntry{partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit: Nat,
    position: Nat, graph: ImportGraph.Bounded}

type State is Data:
  State{canonical: Canonical.State, graphs: List<&2, GraphEntry>, scheduler: Scheduler.State, workloads: List<&2, Workload.Advicee>, random: Random.State, advicees: Advicees.Registry, credentials: CredentialFacts.State, opening: List<&2, Nat>, retiring: List<&2, Nat>, lifecycles: List<&2, AdviceeLifecycle.Entry>, preparations: List<&2, AdviceeLifecycleCleanup.CapturedPreparation>, activity_scopes: List<&2, AdviceeActivity.Scope>, scenarios: RuntimeScenarios.State}

type GraphKey is Data:
  GraphKey{partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit: Nat}

type GraphTransition is Data:
  GraphTransition{state: State, before: ImportGraph.Bounded, result: ImportGraph.BoundedStep}
  GraphRejected{state: State}
