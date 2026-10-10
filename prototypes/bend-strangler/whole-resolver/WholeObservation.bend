import Base
import ./Types.bend as T
import ../local-graph-draft/core.bend as Local
import ../../../packages/agent-flow-bend/ImportGraph.bend as Graph

# Independent semantic observation, not a copy of ResolverFrame storage.
# This is an executable contract draft; no whole equality law is approved yet.
# Text stores UTF-16 code units. Conversion from compiler String is a separate
# obligation, including lone surrogates; Base.String does not discharge it.
type Text is Data:
  Text{units: List<&2, U32>}

type Field is Data:
  Field{key: Text, value: Value}

type Value is Data:
  Null{}
  Boolean{value: Bool}
  Number{bits: T.Binary64}
  StringValue{text: Text}
  ArrayValue{items: List<&2, Value>}
  ObjectValue{fields: List<&2, Field>}

# Provider object identity is shared opaque world data, not a transport token.
type Error is Data:
  Error{identity: Maybe<&2, Nat>, name: Text, message: Text,
    cause: Maybe<&2, Error>, detail: Maybe<&2, Value>}

type SignedNat is Data:
  Nonnegative{value: Nat}
  Negative{magnitude: Nat}

# Address at creation: episode is a local-build root, route indexes its original
# reference tree. Attach/rollback never changes an existing owner's address.
type NodeAddress is Data:
  NodeAddress{episode: Nat, route: List<&2, Nat>}

type Reference is Data:
  Included{symbol: Text, identity: Text}
  Expanded{symbol: Text, child: NodeAddress}
  Omitted{symbol: Text, target: Text, reason: Local.Omission}

type Node is Data:
  Node{address: NodeAddress, artifact: Value, references: List<&2, Reference>}

# Keep nodes reachable from unit, pending owners and retained target records.
# This includes detached rejected children and native already-visited empty
# children. Unretained garbage is not part of the observation.
type Forest is Data:
  Forest{root: Maybe<&2, NodeAddress>, nodes: List<&2, Node>}

type PendingKind is Data:
  FileImport{import_path: Text}
  BundledImport{declaration: T.FactDeclaration, source: T.SourceFacts}

type Pending is Data:
  Pending{edge: Nat, owner: NodeAddress, index: Nat, from: Text, symbol: Text,
    name: Text, depth: Nat, expected: Local.ExpectedKind, kind: PendingKind}

type Target is Data:
  FileTarget{id: Nat, path: Text, name: Text, edge: Pending}
  BundledTarget{id: Nat, declaration: T.FactDeclaration, source: T.SourceFacts, edge: Pending}

type TargetId is Data:
  TargetId{key: Text, id: Nat}

type TargetArtifact is Data:
  TargetArtifact{target: Nat, identity: Text}

type CapturedFile is Data:
  CapturedFile{path: Text, source: T.SourceFacts, source_bytes: Nat}

type FileTargets is Data:
  FileTargets{path: Text, identities: List<&2, Text>}

type Budget is Data:
  Budget{limits: Graph.Limits, targets: List<&2, FileTargets>, maximum_targets: Nat,
    local_work: Nat, graph_work: SignedNat, maximum_depth: Nat}

# Edge and target IDs are domain IDs: preserve them and allocation chronology.
# The node-address correspondence cannot rename them.
type Frame is Data:
  Frame{branch: T.Branch, limits: Graph.Limits, graph: Graph.Bounded, command: Graph.Command,
    dependencies: List<&2, Text>, forest: Forest, pending: List<&2, Pending>,
    targets: List<&2, Target>, target_ids: List<&2, TargetId>,
    target_artifacts: List<&2, TargetArtifact>, captured: List<&2, CapturedFile>,
    visited: List<&2, Text>, budget: Budget, next_edge: Nat, next_target: Nat}

type RustTask is Data:
  RustTask{edge: Nat, path: Text, route: Maybe<&2, T.RustRoute>}

type RustTarget is Data:
  RustTarget{path: Text, target: Nat}

type RustPreparation is Data:
  RustPreparation{graph: Graph.Bounded, command: Graph.Command,
    tasks: List<&2, RustTask>, targets: List<&2, RustTarget>,
    active: Maybe<&2, RustTask>, invalid: Bool, next_edge: Nat, next_target: Nat,
    roles: List<&2, T.RustContext>, dependencies_accumulated: List<&2, Text>,
    dependencies_sorted: List<&2, Text>, remaining: Graph.Limits}

# A root can finish before a GraphFrame exists. Do not invent an empty frame,
# or drop preparation/local observations merely because the result is NoUnit.
type Inspection is Data:
  BeforeFrame{preparation: Maybe<&2, RustPreparation>, local: Maybe<&2, Forest>,
    budget: Maybe<&2, Budget>}
  WithFrame{preparation: Maybe<&2, RustPreparation>, frame: Frame}
  ExceptionalUnpublishedState{}

type CaptureEntry is Data:
  CaptureEntry{path: Text, opaque_identity: Nat, complete_capture: Value}

type Caches is Data:
  Caches{caller: Maybe<&2, List<&2, CaptureEntry>>,
    rust_effective: Maybe<&2, List<&2, CaptureEntry>>}

type ResourceKind is Data:
  ClockResource{}
  SelectionResource{}
  CaptureResource{}
  CacheResource{}
  ExceptionResource{}

type ResourceCorrespondence is Data:
  ResourceCorrespondence{
    kind: ResourceKind,
    native_identity: Nat,
    bend_invocation: Nat,
    bend_id: Nat
  }

type Effect is Data:
  Invoked{request: T.Request}
  Responded{reply: T.Reply}
  ProviderEffect{value: Value}
  CancelledInvocation{invocation: Nat}
  ReleasedResource{kind: ResourceKind, identity: Nat}

type ProviderLease is Data:
  ProviderLease{invocation: Nat, id: Nat}

type FailureOrigin is Data:
  OriginalProvider{}
  OriginalBoundary{}
  ExternalProtocol{}
  InternalEvaluationBound{}
  InternalSettleBound{}
  InternalInvariant{}
  InternalRuntimeShape{}

type Terminal is Data:
  ReviewUnit{value: Value}
  NoUnit{}
  TechnicalError{origin: FailureOrigin, error: Error}
  InvocationCancelled{}

# Waiting is an observable prefix, not a fictional terminal value.
# Mathematical evaluation exhaustion is also separate from product NoUnit.
type Progress is Data:
  Finished{terminal: Terminal, inspection: Inspection}
  Waiting{request: T.Request, lease: ProviderLease, inspection: Inspection}
  EvaluationExhausted{inspection: Inspection}

type WholeObservation is Data:
  WholeObservation{progress: Progress, effects: List<&2, Effect>, caches: Caches,
    resources: List<&2, ResourceCorrespondence>}

def internal_failure(origin: FailureOrigin) -> Bool:
  match origin:
    case InternalEvaluationBound{}: True{}
    case InternalSettleBound{}: True{}
    case InternalInvariant{}: True{}
    case InternalRuntimeShape{}: True{}
    case _: False{}

def completion_terminal(terminal: Terminal) -> Bool:
  match terminal:
    case TechnicalError{origin, _}: Bool.not(internal_failure(origin))
    case _: True{}

def completes(progress: Progress) -> Bool:
  match progress:
    case Finished{terminal, _}: completion_terminal(terminal)
    case _: False{}

def valid_units(units: List<&2, U32>) -> Bool:
  match units:
    case []: True{}
    case head <> tail: Bool.and(Bool.not(U32.is_gt(head, 65535)), valid_units(tail))

def valid_text(text: Text) -> Bool:
  match text:
    case Text{units}: valid_units(units)

def main() -> Unit:
  Unit{}
