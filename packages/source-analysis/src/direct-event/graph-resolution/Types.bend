import Base
import ./traversal/core.bend as Local
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

# Pure contract owner. Foreign code must not enter this import closure.
# Typed tokens are invocation-local; cached captures receive fresh tokens.
type SelectionToken is Data:
  SelectionToken{invocation: Nat, id: Nat}
type CaptureToken is Data:
  CaptureToken{invocation: Nat, id: Nat}
type ClockToken is Data:
  ClockToken{invocation: Nat, id: Nat}
type ExceptionToken is Data:
  ExceptionToken{invocation: Nat, id: Nat}

type CacheToken is Data:
  CacheToken{invocation: Nat, id: Nat}

type Binary64 is Data:
  Binary64{high: U32, low: U32}

# Ordered product data, not a host graph-building command.
# This generic transport tree requires product-shape validation; it is not a ReviewUnit by type alone.
type OrderedField<-Value: Data> is Data:
  OrderedField{key: String, value: Value}

type ProductValue is Data:
  ProductNull{}
  ProductBool{value: Bool}
  ProductNumber{bits: Binary64}
  ProductText{value: String}
  ProductArray{items: List<&2, ProductValue>}
  ProductObject{fields: List<&2, OrderedField<ProductValue>>}

type TomlValue is Data:
  TomlString{value: String}
  TomlBool{value: Bool}
  TomlInteger{decimal: String}
  TomlNumber{bits: Binary64}
  TomlDate{representation: String}
  TomlArray{items: List<&2, TomlValue>}
  TomlRecord{fields: List<&2, OrderedField<TomlValue>>}

type Language is Data:
  TypeScriptLanguage{}
  RustLanguage{}
  BendLanguage{}
  PythonLanguage{}
type Branch is Data:
  TypeBranch{}
  FunctionBranch{}
type RustContext is Data:
  RustContext{
    crate_root: Maybe<&2, Bool>,
    external_module: Maybe<&2, Bool>,
    modules: Maybe<&2, List<&2, OrderedField<String>>>
  }
type FrontendContext is Data:
  TypeScriptContext{branch: Branch}
  RustSourceContext{branch: Branch, context: RustContext}
  BendSourceContext{branch: Branch}
  PythonSourceContext{branch: Branch}

type ArtifactKind is Data:
  InterfaceArtifact{}
  TypeAliasArtifact{}
  StructArtifact{}
  EnumArtifact{}
  DatatypeArtifact{}
  FunctionArtifact{}
  ClassArtifact{}
type OriginKey is Data:
  OriginKindKey{}
  LibraryKey{}
  CompilerVersionKey{}
  CompilerSourceKey{}
  ModuleHashKey{}
  DeclarationHashKey{}
type BundledOrigin is Data:
  BundledOrigin{compiler_version: String, compiler_source: String, module_hash: String,
    declaration_hash: String, order: List<&2, OriginKey>}
type ArtifactKey is Data:
  OriginKey{}
  ArtifactPathKey{}
  ArtifactIdKey{}
  ArtifactKindKey{}
  ArtifactNameKey{}
  ArtifactSourceKey{}
  ArtifactHashKey{}
type Artifact is Data:
  Artifact{
    origin: Maybe<&2, BundledOrigin>,
    path: Maybe<&2, String>,
    id: String,
    kind: ArtifactKind,
    name: String,
    source: String,
    source_hash: String,
    order: List<&2, ArtifactKey>
  }

type FactReference is Data:
  FactReference{
    kind: Local.ReferenceKind,
    name: String,
    expected: Local.ExpectedKind,
    target: Maybe<&2, String>
  }
type FactDeclaration is Data:
  FactDeclaration{
    key: String,
    artifact: Artifact,
    references: List<&2, FactReference>,
    exported: Bool
  }
type FactImport is Data:
  FactImport{key: String, path: String, name: String, type_only: Maybe<&2, Bool>}
type SourceFacts is Data:
  SourceFacts{
    kind_aware: Maybe<&2, Bool>,
    declarations: List<&2, FactDeclaration>,
    imports: List<&2, FactImport>,
    supporting: List<&2, FactDeclaration>
  }

type CaptureBytes is Data:
  CaptureBytes{path: String, bytes: Nat}
type CaptureDiagnostic is Data:
  CaptureDiagnostic{value: ProductValue}
  CaptureBudgetDiagnostic{resource: String, used: Nat, requested: Nat, limit: Nat}
type FileStatus is Data:
  FileAbsent{}
  ExistingFile{}
  ExistingOther{}
# Exact physical observations. MembershipFailed is non-ENOENT lstat failure,
# not absence, policy refusal, cancellation or a transport failure.
type PathMembership is Data:
  MembershipAbsent{}
  MembershipFailed{}
  MembershipPresent{is_file: Bool, is_directory: Bool, is_symlink: Bool, signature: String}
type SyntaxField is Data:
  SyntaxField{name: String, child: Nat}
type PythonSyntaxNode is Data:
  PythonSyntaxNode{
    id: Nat, kind: String, text: String, start: Nat, end: Nat,
    children: List<&2, Nat>, fields: List<&2, SyntaxField>
  }
type PythonSyntax is Data:
  PythonSyntax{has_error: Bool, root: Nat, nodes: List<&2, PythonSyntaxNode>}
type IdentifierCharacter is Data:
  IdentifierCharacter{text: String, id_start: Bool, id_continue: Bool}
type AccessOutcome is Data:
  AccessDenied{}
  AccessAllowed{selection: SelectionToken, relative_path: String}
type CacheOutcome is Data:
  CacheAbsent{}
  CachePresent{capture: CaptureToken, bytes: Nat}
type CaptureOutcome is Data:
  CaptureUnavailable{diagnostic: CaptureDiagnostic}
  SourceCaptured{capture: CaptureToken, relative_path: String, bytes: Nat}
type SourceOutcome is Data:
  SourceUnsupported{}
  SourceInspected{facts: SourceFacts}
type CargoOutcome is Data:
  CargoUnsupported{}
  CargoInspected{syntax: TomlValue}
type RustModulesOutcome is Data:
  RustModulesUnsupported{}
  RustModulesInspected{names: List<&2, String>}

# Each path operation has a distinct matching reply constructor.
type Operation is Data:
  StartClock{}
  ReadClock{clock: ClockToken}
  PathDirname{path: String}
  PathBasename{path: String, suffix: Maybe<&2, String>}
  ReadPathSeparator{}
  PathJoin{parts: List<&2, String>}
  PathNormalize{path: String}
  PathRelative{from: String, to: String}
  PathExtension{path: String}
  PathIsAbsolute{path: String}
  JoinedPathFacts{from: String, leaf: String}
  ReadFileStatus{path: String}
  ReadPathMembership{path: String}
  SelectContextPath{path: String}
  ParsePythonSyntax{capture: CaptureToken}
  ReadIdentifierCharacters{text: String}
  AccessPath{path: String}
  CreateInvocationCache{}
  LookupCaptureCache{cache: CacheToken, path: String}
  SnapshotCaptureCache{cache: CacheToken}
  StoreCaptureCache{cache: CacheToken, path: String, capture: CaptureToken}
  InsertRootCaptureCache{cache: CacheToken, path: String, capture: CaptureToken}
  CaptureSource{selection: SelectionToken, source_cap: Nat}
  InspectSource{path: String, capture: CaptureToken, context: FrontendContext}
  ParseCargo{capture: CaptureToken}
  InspectRustModules{capture: CaptureToken}
  ObserveDiagnostic{path: String, diagnostic: CaptureDiagnostic}
  EncodeProduct{value: ProductValue}
  EncodeSourceText{text: String}

type ServiceOutcome is Data:
  ClockStarted{clock: ClockToken}
  ClockRead{bits: Binary64}
  DirnameResult{path: String}
  BasenameResult{name: String}
  PathSeparatorResult{separator: String}
  JoinedResult{path: String}
  NormalizedResult{path: String}
  RelativeResult{path: String}
  ExtensionResult{extension: String}
  AbsoluteResult{absolute: Bool}
  JoinedPathFactsResult{
    separator: String,
    normalized: String,
    absolute: Bool,
    extension: String,
    leaf_extension: String
  }
  StatusResult{status: FileStatus}
  MembershipResult{membership: PathMembership}
  ContextSelectionResult{selected: Bool}
  PythonSyntaxResult{syntax: PythonSyntax}
  IdentifierCharactersResult{characters: List<&2, IdentifierCharacter>}
  AccessResult{outcome: AccessOutcome}
  InvocationCacheCreated{cache: CacheToken}
  CacheResult{outcome: CacheOutcome}
  CacheSnapshot{entries: List<&2, CaptureBytes>}
  CacheStored{}
  RootCacheInserted{}
  CaptureResult{outcome: CaptureOutcome}
  FrontendResult{outcome: SourceOutcome}
  CargoResult{outcome: CargoOutcome}
  RustModulesResult{outcome: RustModulesOutcome}
  DiagnosticObserved{}
  ProductEncoded{bytes: Nat}
  SourceTextEncoded{bytes: Nat}
  ProviderRejected{exception: ExceptionToken}

type Request is Data:
  Request{invocation: Nat, id: Nat, operation: Operation}
type Reply is Data:
  Reply{invocation: Nat, id: Nat, outcome: ServiceOutcome}
type TechnicalFailure is Data:
  WrongInvocation{expected: Nat, actual: Nat}
  WrongCorrelation{expected: Nat, actual: Nat}
  WrongReplyKind{}
  MalformedReply{}
  LocalTraversalFailure{}
  NegativeGraphWork{magnitude: Nat}
  ForeignProviderFailure{exception: ExceptionToken}
  RuntimeFailure{exception: ExceptionToken}
  InvocationCancelled{}
  ReplyAfterTerminal{}
type ProductResult is Data:
  NoReviewUnit{}
  ReviewUnitResult{value: ProductValue}

# Graph owner, not host GraphFrame. Local observations remain exact obligations.
type Target is Data:
  FileTarget{path: String, name: String, edge: Local.Pending}
  BundledTarget{declaration: Nat, facts: Local.Facts, edge: Local.Pending}
type CapturedFacts is Data:
  CapturedFacts{facts: Local.Facts, exported: Map<&2, Bool>, source_bytes: Nat}
type ArtifactEntry is Data:
  ArtifactEntry{handle: Nat, value: Artifact}
type ResolverFrame is Data:
  ResolverFrame{
    branch: Branch,
    limits: Graph.Limits,
    graph: Graph.Graph,
    command: Graph.Command,
    dependencies: List<&2, String>,
    root: Nat,
    nodes: List<&2, Local.PlannedNode>,
    references: List<&2, Local.ReferenceSlot>,
    visited: Map<&2, Bool>,
    budget: Local.Budget,
    next_node: Nat,
    next_edge: Nat,
    next_target: Nat,
    next_artifact: Nat,
    pending: Map<&2, Maybe<&2, Local.Pending>>,
    target_paths: Map<&2, Maybe<&2, Target>>,
    target_ids: Map<&2, Maybe<&2, Nat>>,
    target_artifacts: Map<&2, Maybe<&2, String>>,
    captured: Map<&2, Maybe<&2, CapturedFacts>>,
    artifacts: List<&2, ArtifactEntry>
  }

type RustRoute is Data:
  RustRoute{
    path: String,
    crate_path: String,
    modules: Maybe<&2, List<&2, OrderedField<String>>>,
    depth: Nat
  }
type RustTask is Data:
  RustTask{path: String, route: Maybe<&2, RustRoute>}
type RustPreparation is Data:
  RustPreparation{graph: Graph.Graph, command: Graph.Command, tasks: Map<&2, Maybe<&2, RustTask>>,
    targets: Map<&2, Maybe<&2, Nat>>, next_edge: Nat, next_target: Nat, active: Maybe<&2, RustTask>,
    invalid: Bool, dependencies: List<&2, String>, roles: List<&2, RustContext>}

type CargoPlan is Data:
  CargoPlan{raw_targets: List<&2, String>, automatic_binary: Bool, automatic_index: Nat}

type RustFollowReturn is Data:
  CargoRootsReturn{}
  CapturedTaskReturn{}

type RustWork is Data:
  RustWork{needs_binding: Bool, fuel: Nat, cargo_plan: Maybe<&2, CargoPlan>,
    tasks_out: List<&2, RustTask>, remaining_paths: List<&2, String>,
    candidates_rev: List<&2, String>, relative_selected: String,
    remaining_map: List<&2, OrderedField<String>>, rebased_rev: List<&2, OrderedField<String>>,
    map_base: String, role_root: Bool, follow_return: RustFollowReturn}

# The full continuation variants will be fixed with transitions, not opaque JS closures.
type ResolverInput is Data:
  ResolverInput{
    invocation: Nat,
    root_path: String,
    root_capture: CaptureToken,
    root_bytes: Nat,
    root_name: String,
    root_source: String,
    branch: Branch,
    caller_cache: Maybe<&2, CacheToken>,
    limits: Graph.Limits
  }

type TentativeChild is Data:
  TentativeChild{target: Nat, path: String, capture: CaptureToken, source_bytes: Nat,
    file: CapturedFacts, artifact: Nat, identity: String, local_work_before: Nat,
    plan: Local.Plan, previous_tree_bytes: Nat, candidate: ProductValue, pending_ids: List<&2, Nat>}

type ResolverStage is Data:
  Starting{}
  FindingRootLanguage{}
  PreparingLanguage{}
  RustSeparator{}
  RustNoBindingDeadline{}
  RustCreatingCache{}
  RustRootCacheInserted{}
  RustCargoDir{}
  RustCargoJoin{}
  RustCargoStat{}
  RustCargoParent{}
  RustIterationDeadline{}
  RustTaskAbsolute{}
  RustAccess{}
  RustReaccess{}
  RustCacheSnapshot{}
  RustCacheLookup{}
  RustCapture{}
  RustStore{}
  RustDiagnostic{}
  RustCargoParse{}
  RustCargoBase{}
  RustCargoSelectedRelative{}
  RustCargoTargetAbsolute{}
  RustCargoJoinedAbsolute{}
  RustCargoAutoBinAbsolute{}
  RustCargoTargetJoin{}
  RustCargoTargetNormalize{}
  RustCargoTargetExtension{}
  RustCargoAutoBinDirectory{}
  RustCargoAutoBinRelative{}
  RustCargoAutoBinJoin{}
  RustFindAbsolute{}
  RustFindStatus{}
  RustCrateWithinDir{}
  RustCrateWithinRelative{}
  RustCrateWithinAbsolute{}
  RustModuleInspect{}
  RustMapCrateDirectory{}
  RustModuleRelativeAbsolute{}
  RustModuleDirectoryBase{}
  RustModuleBasename{}
  RustModuleStem{}
  RustModuleDirJoin{}
  RustModuleRelative{}
  RustModuleChoiceJoinFile{}
  RustModuleChoiceJoinDir{}
  RustModuleChoiceAbsolute{}
  RustModuleChoiceStat{}
  RustMapModuleJoin{}
  RustRoleDir{}
  RustRoleRelative{}
  RustFinishedDeadline{}
  ImportedRustRootDir{}
  ImportedRustTargetDir{}
  ImportedRustMapJoin{}
  ImportedRustMapRelative{}
  SearchingCargoAncestor{}
  ResolvingRustTask{}
  CheckingRustPath{}
  ReadingRustPath{}
  CheckingRustCache{}
  ReadingRustCapture{}
  StoringRustCapture{}
  InspectingCargo{}
  InspectingRustModules{}
  SelectingCargoCandidates{}
  SelectingModuleCandidates{}
  FinishingRustPreparation{}
  CheckingPythonDeadline{}
  CheckingRootDeadline{}
  InspectingRoot{}
  MeasuringRoot{}
  CheckingIterationDeadline{}
  ResolvingPending{}
  ReadingJoinedPathFacts{}
  JoiningRustModuleCandidate{}
  CheckingCandidateAbsolute{}
  CheckingImportCandidates{}
  CheckingTargetPath{}
  RecheckingTargetPath{}
  CheckingObservationCache{}
  LookingUpCapture{}
  CapturingTarget{}
  StoringTargetCapture{}
  InspectingTarget{}
  MeasuringPreviousTree{}
  MeasuringCandidateTree{}
  MeasuringBundledSource{}
  MeasuringBundledPrevious{}
  EmittingCaptureDiagnostic{}
  MeasuringCompletion{}

type ResolverScratch is Data:
  ResolverScratch{
    paths: List<&2, String>,
    found_paths: List<&2, String>,
    active_target: Maybe<&2, Nat>,
    selection: Maybe<&2, SelectionToken>,
    capture: Maybe<&2, CaptureToken>,
    source_bytes: Nat,
    source_facts: Maybe<&2, SourceFacts>,
    tentative: Maybe<&2, TentativeChild>,
    directory: String,
    resolved_path: String,
    capture_path: String,
    ancestor_depth: Nat,
    working_route: Maybe<&2, RustRoute>,
    preparation_cache: Maybe<&2, CacheToken>,
    cargo_syntax: Maybe<&2, TomlValue>,
    module_names: List<&2, String>,
    diagnostic: Maybe<&2, CaptureDiagnostic>,
    measured_product: Maybe<&2, ProductValue>,
    pending_edge: Maybe<&2, Local.Pending>,
    bundled_previous: Nat
  }

type PreparedLanguage is Data:
  PreparedLanguage{limits: Graph.Limits, dependencies: List<&2, String>}

type ResolverState is Data:
  ResolverState{
    input: ResolverInput,
    stage: ResolverStage,
    clock: Maybe<&2, ClockToken>,
    next_request: Nat,
    iteration_fuel: Nat,
    language: Maybe<&2, Language>,
    separator: String,
    frontend: RustContext,
    frame: Maybe<&2, ResolverFrame>,
    rust: Maybe<&2, RustPreparation>,
    scratch: ResolverScratch,
    prepared: PreparedLanguage,
    rust_work: RustWork
  }

type ResolverStep is Data:
  AwaitService{state: ResolverState, request: Request}
  FinishedResolver{result: ProductResult, final_frame: Maybe<&2, ResolverFrame>}
  FailedResolver{failure: TechnicalFailure}

# Outer runtime transport returns the product or error. Internal terminal frame
# remains in ResolverStep for exact state laws and the validation entry.
type RuntimeOutcome is Data:
  RuntimeFinished{result: ProductResult}
  RuntimeFailed{failure: TechnicalFailure}

# Cancellation is not a forged service reply; prior IO effects remain committed.
type ResolverEvent is Data:
  ServiceReply{reply: Reply}
  CancelInvocation{invocation: Nat}

def main() -> Unit:
  Unit{}
