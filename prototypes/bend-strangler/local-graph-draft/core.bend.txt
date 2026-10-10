import Base

type ExpectedKind is Data:
  AnyKind{}
  TypeKind{}
  FunctionKind{}

type ReferenceKind is Data:
  Named{}
  Unsupported{}

type Reference is Data:
  Reference{kind: ReferenceKind, name: String, expected: ExpectedKind, target: Maybe<&2, String>}

type Declaration is Data:
  Declaration{handle: Nat, identity: String, function: Bool, bundled: Bool, references: List<&2, Reference>}

type ImportBinding is Data:
  ImportBinding{path: String, name: String, type_only: Bool}

type Facts is Data:
  Facts{kind_aware: Bool, declarations: Map<&2, Maybe<&2, Declaration>>, imports: Map<&2, Maybe<&2, ImportBinding>>, supporting: Map<&2, Maybe<&2, Declaration>>}

type LocalLimits is Data:
  LocalLimits{work: Nat, depth: Nat, targets: Nat}

type Budget is Data:
  Budget{limits: LocalLimits, targets_by_path: Map<&2, Map<&2, Bool>>, max_targets: Nat, work: Nat, graph_work: Nat, max_depth: Nat}

type Omission is Data:
  Unresolved{}
  UnsupportedTarget{}
  ReferenceLimit{}
  Unavailable{}

type PlannedReference is Data:
  Included{identity: String}
  Expanded{node: Nat}
  Omitted{reason: Omission, target_name: String}

type ReferenceSlot is Data:
  ReferenceSlot{owner: Nat, index: Nat, symbol: String, reference: PlannedReference}

type PlannedNode is Data:
  PlannedNode{node: Nat, artifact: Nat}

type PendingTarget is Data:
  Imported{path: String, name: String}
  BundledTarget{declaration: Nat}

type Pending is Data:
  Pending{owner: Nat, index: Nat, from: String, symbol: String, name: String, depth: Nat, expected: ExpectedKind, target: PendingTarget}

type Frame is Data:
  Frame{owner: Nat, depth: Nat, index: Nat, remaining: List<&2, Reference>}

type Machine is Data:
  Machine{facts: Facts, path: String, frames: List<&2, Frame>, visited: Map<&2, Bool>, budget: Budget, next_node: Nat, nodes_rev: List<&2, PlannedNode>, references_rev: List<&2, ReferenceSlot>, pending_rev: List<&2, Pending>}

type Plan is Data:
  Plan{root: Nat, nodes: List<&2, PlannedNode>, references: List<&2, ReferenceSlot>, pending: List<&2, Pending>, visited: Map<&2, Bool>, budget: Budget}

def map_result(-V: Data, result: Map<&2, V> & V) -> V:
  match result:
    case Tuple{_, value}: value

type RunResult is Data:
  CompletePlan{plan: Plan}
  MissingRoot{visited: Map<&2, Bool>, budget: Budget}
  InvariantFailure{machine: Machine}

