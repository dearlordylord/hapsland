import Base
import ../Types.bend as T
import ./PreparationModel.bend as M
import ./RawText.bend as Raw
import ./Input.bend as Unicode

# Whole preparation continuation owner. Provider operations retain the existing
# correlated Request/Reply protocol; native policy is never a host callback.
# WIP: transitions and whole native consumer are not yet implemented/qualified.
type Phase is Data:
  ConfigurationError{}
  SnapshotHash{}
  RootDirectory{}
  LoadDeadline{load: M.Load}
  InventoryAncestorJoin{load: M.Load, current: String, remaining: List<&2, String>}
  InventoryAncestorStat{load: M.Load, current: String, remaining: List<&2, String>}
  InventoryOpen{load: M.Load}
  InventoryName{load: M.Load, remaining: List<&2, String>, selected: List<&2, String>}
  Filename{load: M.Load, path: String, remaining: List<&2, String>, possible: List<&2, String>}
  SourceDeadline{source: M.Source}
  SourceAccess{source: M.Source}
  SourceCacheSnapshot{source: M.Source}
  SourceCacheLookup{source: M.Source}
  SourceCapture{source: M.Source}
  SourceStore{source: M.Source}
  SourceText{source: M.Source}
  SourceRawText{source: M.Source, text: String}
  FileInspect{load: M.Load, path: String}
  PackageSpelling{load: M.Load, current: String, remaining: List<&2, String>}
  MetadataJoinWork{metadata: M.Metadata}
  MetadataJoinModule{metadata: M.Metadata}
  MetadataParent{metadata: M.Metadata}
  ExistsDeadline{path: String, returning: M.ExistsReturn}
  ExistsStat{path: String, returning: M.ExistsReturn}
  DiscoveryDeadline{pending: List<&2, M.Task>}
  ImportDeadline{discovery: M.Discovery}
  ImportJoin{discovery: M.Discovery}
  ImportInternalRelative{discovery: M.Discovery, target: String, remaining: List<&2, String>}
  NestedRelative{discovery: M.Discovery, target: String, ancestor: String, depth: Nat}
  NestedJoin{discovery: M.Discovery, target: String, ancestor: String, depth: Nat}
  NestedParent{discovery: M.Discovery, target: String, depth: Nat}
  Remapping{
    packages: List<&2, M.PackageEntry>,
    declarations: List<&2, M.BoundDeclaration>,
    spellings: List<&2, Unicode.Spelling>
  }
  ReverseDeadline{
    declarations: List<&2, M.BoundDeclaration>,
    group: String,
    pending: List<&2, String>,
    visited: List<&2, String>
  }
  FinalDeadline{declarations: List<&2, M.BoundDeclaration>}
  FinalHash{declarations: List<&2, M.BoundDeclaration>}
type State is Data:
  State{runtime: M.Runtime, phase: Phase}
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{prepared: Maybe<&2, M.Prepared>, next_request: Nat}
  Failed{failure: T.TechnicalFailure, next_request: Nat}

def await_operation(+runtime: M.Runtime, phase: Phase, operation: T.Operation) -> Step:
  Await{State{M.with_next_request(runtime, Nat.add(M.next_request(runtime), 1n)), phase},
    T.Request{M.invocation(M.input(runtime)), M.next_request(runtime), operation}}

def absent(runtime: M.Runtime) -> Step:
  Returned{None{}, M.next_request(runtime)}

def failed(runtime: M.Runtime, failure: T.TechnicalFailure) -> Step:
  Failed{failure, M.next_request(runtime)}

def main() -> Unit:
  Unit{}
