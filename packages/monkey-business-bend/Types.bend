import Base
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ./Scheduler.bend as Scheduler

type GraphEntry is Data:
  GraphEntry{partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit: Nat,
    position: Nat, graph: ImportGraph.Bounded}

type State is Data:
  State{canonical: Canonical.State, graphs: List<&2, GraphEntry>, scheduler: Scheduler.State}

type GraphKey is Data:
  GraphKey{partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit: Nat}

type GraphTransition is Data:
  GraphTransition{state: State, before: ImportGraph.Bounded, result: ImportGraph.BoundedStep}
  GraphRejected{state: State}
