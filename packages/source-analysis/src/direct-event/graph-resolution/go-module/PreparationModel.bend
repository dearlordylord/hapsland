import Base
import ./ArtifactProtocol.bend as Boundary
import ../Types.bend as T
import ../../../../../agent-flow-bend/ImportGraph.bend as Graph
import ../../../../../source-artifacts/src/direct-event/value/Value.bend as Value
import ./Configuration.bend as Configuration
import ./BuildContext.bend as Build
import ./Package.bend as Package
import ./Input.bend as Unicode

# Source-bearing state for the complete Go preparation, shared by its stages.
# Capture/cache/provider tokens retain their existing single declaration owner.
type Captured is Data:
  Captured{path: String, capture: T.CaptureToken, bytes: Nat}
type LoadedPackage is Data:
  LoadedPackage{files: List<&2, T.GoFileSyntax>, facts: Package.PackageResult, name: String}
type PackageEntry is Data:
  PackageEntry{directory: String, loaded: Maybe<&2, LoadedPackage>}
type Task is Data:
  Task{directory: String, depth: Nat}
type Runtime is Data:
  Runtime{input: Boundary.Input, next_request: Nat, work: Nat, read_bytes: Nat, files_spent: Nat,
    captures: List<&2, Captured>, dependencies: List<&2, String>,
    identities: List<&2, Value.ProductValue>, packages: List<&2, PackageEntry>,
    root_directory: String, snapshot: Maybe<&2, Build.Snapshot>, snapshot_hash: String,
    module_base: Maybe<&2, String>, module_name: Maybe<&2, String>}

# Explicit return locations reproduce the native generator nesting. No host
# closure selects package, metadata, import or finalization progression.
type LoadReturn is Data:
  RootPackage{}
  ImportedPackage{pending: List<&2, Task>, task: Task,
    files: List<&2, T.GoFileSyntax>, imports: List<&2, T.GoImport>, target: String}
type Load is Data:
  Load{directory: String, returning: LoadReturn, candidates: List<&2, String>,
    files: List<&2, T.GoFileSyntax>, spellings: List<&2, Unicode.Spelling>}
type Metadata is Data:
  Metadata{directory: String, depth: Nat, workspace: Bool}
type Discovery is Data:
  Discovery{pending: List<&2, Task>, task: Task,
    files: List<&2, T.GoFileSyntax>, imports: List<&2, T.GoImport>}
type SourceReturn is Data:
  PackageSource{load: Load, candidate: String}
  ModuleSource{metadata: Metadata, candidate: String}
type Source is Data:
  Source{path: String, returning: SourceReturn, selection: Maybe<&2, T.SelectionToken>,
    capture: Maybe<&2, T.CaptureToken>, bytes: Nat}
type ExistsReturn is Data:
  WorkspaceAlternative{metadata: Metadata}
  ModuleAlternative{metadata: Metadata}
  NestedAlternative{discovery: Discovery, target: String, ancestor: String, depth: Nat}

def invocation(input: Boundary.Input) -> Nat:
  match input:
    case Boundary.Input{value, _, _, _, _, _, _, _, _, _, _}: value

def input_limits(input: Boundary.Input) -> Graph.Limits:
  match input:
    case Boundary.Input{_, _, _, _, _, _, _, _, value, _, _}: value

def input_root_path(input: Boundary.Input) -> String:
  match input:
    case Boundary.Input{_, _, value, _, _, _, _, _, _, _, _}: value

def clock(input: Boundary.Input) -> T.ClockToken:
  match input:
    case Boundary.Input{_, _, _, _, _, _, value, _, _, _, _}: value

def cache(input: Boundary.Input) -> Maybe<&2, T.CacheToken>:
  match input:
    case Boundary.Input{_, _, _, _, _, _, _, value, _, _, _}: value

def source_limit_value(value: Graph.Limits) -> Nat:
  match value:
    case Graph.Limits{_, value, _, _, _, _, _, _}: value

def files_limit_value(value: Graph.Limits) -> Nat:
  match value:
    case Graph.Limits{_, _, _, value, _, _, _, _}: value

def read_limit_value(value: Graph.Limits) -> Nat:
  match value:
    case Graph.Limits{_, _, _, _, value, _, _, _}: value

def depth_limit_value(value: Graph.Limits) -> Nat:
  match value:
    case Graph.Limits{_, _, _, _, _, _, value, _}: value

def work_limit_value(value: Graph.Limits) -> Nat:
  match value:
    case Graph.Limits{_, _, _, _, _, _, _, value}: value

def main() -> Unit:
  Unit{}

def source_limit(input: Boundary.Input) -> Nat:
  source_limit_value(input_limits(input))

def files_limit(input: Boundary.Input) -> Nat:
  files_limit_value(input_limits(input))

def read_limit(input: Boundary.Input) -> Nat:
  read_limit_value(input_limits(input))

def depth_limit(input: Boundary.Input) -> Nat:
  depth_limit_value(input_limits(input))

def work_limit(input: Boundary.Input) -> Nat:
  work_limit_value(input_limits(input))

def input(runtime: Runtime) -> Boundary.Input:
  match runtime:
    case Runtime{value, _, _, _, _, _, _, _, _, _, _, _, _, _}: value

def with_input(runtime: Runtime, value: Boundary.Input) -> Runtime:
  match runtime:
    case Runtime{
      _,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      value,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def next_request(runtime: Runtime) -> Nat:
  match runtime:
    case Runtime{_, value, _, _, _, _, _, _, _, _, _, _, _, _}: value

def with_next_request(runtime: Runtime, value: Nat) -> Runtime:
  match runtime:
    case Runtime{
      input,
      _,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      value,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def work(runtime: Runtime) -> Nat:
  match runtime:
    case Runtime{_, _, value, _, _, _, _, _, _, _, _, _, _, _}: value

def with_work(runtime: Runtime, value: Nat) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      _,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      value,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def read_bytes(runtime: Runtime) -> Nat:
  match runtime:
    case Runtime{_, _, _, value, _, _, _, _, _, _, _, _, _, _}: value

def with_read_bytes(runtime: Runtime, value: Nat) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      _,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      value,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def files_spent(runtime: Runtime) -> Nat:
  match runtime:
    case Runtime{_, _, _, _, value, _, _, _, _, _, _, _, _, _}: value

def with_files_spent(runtime: Runtime, value: Nat) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      _,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      value,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def captures(runtime: Runtime) -> List<&2, Captured>:
  match runtime:
    case Runtime{_, _, _, _, _, value, _, _, _, _, _, _, _, _}: value

def with_captures(runtime: Runtime, value: List<&2, Captured>) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      _,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      value,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def dependencies(runtime: Runtime) -> List<&2, String>:
  match runtime:
    case Runtime{_, _, _, _, _, _, value, _, _, _, _, _, _, _}: value

def with_dependencies(runtime: Runtime, value: List<&2, String>) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      _,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      value,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def identities(runtime: Runtime) -> List<&2, Value.ProductValue>:
  match runtime:
    case Runtime{_, _, _, _, _, _, _, value, _, _, _, _, _, _}: value

def with_identities(runtime: Runtime, value: List<&2, Value.ProductValue>) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      _,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      value,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def packages(runtime: Runtime) -> List<&2, PackageEntry>:
  match runtime:
    case Runtime{_, _, _, _, _, _, _, _, value, _, _, _, _, _}: value

def with_packages(runtime: Runtime, value: List<&2, PackageEntry>) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      _,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      value,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def root_directory(runtime: Runtime) -> String:
  match runtime:
    case Runtime{_, _, _, _, _, _, _, _, _, value, _, _, _, _}: value

def with_root_directory(runtime: Runtime, value: String) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      _,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      value,
      snapshot,
      snapshot_hash,
      module_base,
      module_name
    }

def snapshot(runtime: Runtime) -> Maybe<&2, Build.Snapshot>:
  match runtime:
    case Runtime{_, _, _, _, _, _, _, _, _, _, value, _, _, _}: value

def with_snapshot(runtime: Runtime, value: Maybe<&2, Build.Snapshot>) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      _,
      snapshot_hash,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      value,
      snapshot_hash,
      module_base,
      module_name
    }

def snapshot_hash(runtime: Runtime) -> String:
  match runtime:
    case Runtime{_, _, _, _, _, _, _, _, _, _, _, value, _, _}: value

def with_snapshot_hash(runtime: Runtime, value: String) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      _,
      module_base,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      value,
      module_base,
      module_name
    }

def module_base(runtime: Runtime) -> Maybe<&2, String>:
  match runtime:
    case Runtime{_, _, _, _, _, _, _, _, _, _, _, _, value, _}: value

def with_module_base(runtime: Runtime, value: Maybe<&2, String>) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      _,
      module_name
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      value,
      module_name
    }

def module_name(runtime: Runtime) -> Maybe<&2, String>:
  match runtime:
    case Runtime{_, _, _, _, _, _, _, _, _, _, _, _, _, value}: value

def with_module_name(runtime: Runtime, value: Maybe<&2, String>) -> Runtime:
  match runtime:
    case Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      _
    }: Runtime{
      input,
      next_request,
      work,
      read_bytes,
      files_spent,
      captures,
      dependencies,
      identities,
      packages,
      root_directory,
      snapshot,
      snapshot_hash,
      module_base,
      value
    }
