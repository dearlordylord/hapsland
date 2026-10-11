import Base
import ../Protocol.bend as Protocol
import ../Clock.bend as Clock
import ../CaptureAdmission.bend as Admission
import ./PreparationData.bend as D
import ./BuildContext.bend as Build
import ./ModulePolicy.bend as Module
import ./Package.bend as Package
import ../../../../../source-artifacts/src/direct-event/value/Value.bend as V
import ../Types.bend as T
import ./PreparationModel.bend as M
import ./RawText.bend as Raw
import ./Input.bend as Unicode

# Whole preparation continuation owner. Provider operations retain the existing
# correlated Request/Reply protocol; native policy is never a host callback.
# WIP: transitions and whole native consumer are not yet implemented/qualified.
type Phase is Data:
  LoadBegin{+load: M.Load}
  InventoryBegin{+load: M.Load, +current: String, +remaining: List<&2, String>}
  InventoryNext{+load: M.Load, +remaining: List<&2, String>, +selected: List<&2, String>}
  FilterNext{+load: M.Load, +remaining: List<&2, String>, +possible: List<&2, String>}
  LoadNext{+load: M.Load}
  SpellingNext{+load: M.Load, +remaining: List<&2, String>}
  InferPackage{+load: M.Load}
  MetadataContinue{metadata: M.Metadata}
  MetadataNext{+metadata: M.Metadata}
  DiscoveryNext{+pending: List<&2, M.Task>}
  DiscoveryFiles{+discovery: M.Discovery}
  DiscoveryImports{+discovery: M.Discovery}
  SourceBegin{+source: M.Source}
  SourceReady{+source: M.Source}
  RemapBegin{}
  ConfigurationError{}
  SnapshotHash{}
  RootDirectory{}
  LoadDeadline{+load: M.Load}
  InventoryAncestorJoin{+load: M.Load, +current: String, +remaining: List<&2, String>}
  InventoryAncestorStat{+load: M.Load, +current: String, +remaining: List<&2, String>}
  InventoryOpen{+load: M.Load}
  InventoryName{+load: M.Load, +remaining: List<&2, String>, +selected: List<&2, String>}
  Filename{+load: M.Load, +path: String, +remaining: List<&2, String>, +possible: List<&2, String>}
  SourceDeadline{+source: M.Source}
  SourceAccess{+source: M.Source}
  SourceCacheSnapshot{+source: M.Source}
  SourceCacheLookup{+source: M.Source}
  SourceCapture{+source: M.Source}
  SourceStore{+source: M.Source}
  SourceText{+source: M.Source}
  SourceRawText{+source: M.Source, +text: String}
  FileMembership{source: M.Source, raw: Raw.Text}
  FileInspect{+load: M.Load, +path: String}
  PackageSpelling{+load: M.Load, +current: String, +remaining: List<&2, String>}
  MetadataJoinWork{+metadata: M.Metadata}
  MetadataJoinModule{+metadata: M.Metadata}
  MetadataParent{+metadata: M.Metadata}
  ExistsDeadline{+path: String, +returning: M.ExistsReturn}
  ExistsStat{+path: String, +returning: M.ExistsReturn}
  DiscoveryDeadline{+pending: List<&2, M.Task>}
  ImportSelect{discovery: M.Discovery, imported: T.GoImport}
  ImportInternal{discovery: M.Discovery, target: String, bases: List<&2, String>}
  NestedBegin{discovery: M.Discovery, target: String, ancestor: String, depth: Nat}
  ImportDeadline{+discovery: M.Discovery}
  ImportJoin{+discovery: M.Discovery}
  ImportInternalRelative{+discovery: M.Discovery, +target: String, +remaining: List<&2, String>}
  NestedRelative{+discovery: M.Discovery, +target: String, +ancestor: String, +depth: Nat}
  NestedJoin{+discovery: M.Discovery, +target: String, +ancestor: String, +depth: Nat}
  NestedParent{+discovery: M.Discovery, +target: String, +depth: Nat}
  Remapping{
    +packages: List<&2, M.PackageEntry>,
    +declarations: List<&2, M.BoundDeclaration>,
    +spellings: List<&2, Unicode.Spelling>
  }
  ReverseDeadline{
    +declarations: List<&2, M.BoundDeclaration>,
    +group: String,
    +pending: List<&2, String>,
    +visited: List<&2, String>
  }
  FinalDeadline{+declarations: List<&2, M.BoundDeclaration>}
  FinalHash{+declarations: List<&2, M.BoundDeclaration>}
type State is Data:
  State{+runtime: M.Runtime, +phase: Phase}
type Step is Data:
  Internal{+state: State}
  Await{+state: State, +request: T.Request}
  Returned{+prepared: Maybe<&2, M.Prepared>, +next_request: Nat}
  Failed{+failure: T.TechnicalFailure, +next_request: Nat}

def await_operation(+runtime: M.Runtime, +phase: Phase, +operation: T.Operation) -> Step:
  Await{State{M.with_next_request(runtime, Nat.add(M.next_request(runtime), 1n)), phase},
    T.Request{M.invocation(M.input(runtime)), M.next_request(runtime), operation}}

def absent(+runtime: M.Runtime) -> Step:
  Returned{None{}, M.next_request(runtime)}

def failed(+runtime: M.Runtime, +failure: T.TechnicalFailure) -> Step:
  Failed{failure, M.next_request(runtime)}

def internal(+runtime: M.Runtime, +phase: Phase) -> Step:
  Internal{State{runtime, phase}}

def load_directory(+load: M.Load) -> String:
  match load:
    case M.Load{+value, _, _, _, _}: value

def loaded_return(+runtime: M.Runtime, +returning: M.LoadReturn, +loaded: Maybe<&2, M.LoadedPackage>) -> Step:
  match returning loaded:
    case M.RootPackage{} None{}: absent(runtime)
    case M.RootPackage{} Some{_}: internal(runtime, MetadataNext{M.Metadata{M.root_directory(runtime), 0n, False{}}})
    case M.ImportedPackage{+pending, +task, +files, +imports, _} None{}:
      internal(runtime, DiscoveryImports{M.Discovery{pending, task, files, imports}})
    case M.ImportedPackage{+pending, M.Task{+directory, +depth}, +files, +imports, +target} Some{_}:
      internal(runtime, DiscoveryImports{M.Discovery{List.append(&2, M.Task, pending, [M.Task{target, Nat.add(depth, 1n)}]), M.Task{directory, depth}, files, imports}})

def finish_load(+runtime: M.Runtime, +load: M.Load, +loaded: Maybe<&2, M.LoadedPackage>) -> Step:
  match load:
    case M.Load{+directory, +returning, _, _, _}:
      loaded_return(M.with_packages(runtime, D.set_package(M.packages(runtime), directory, loaded)), returning, loaded)

def source_failed(+runtime: M.Runtime, +source: M.Source) -> Step:
  match source:
    case M.Source{_, M.PackageSource{+load, _}, _, _, _}: finish_load(runtime, load, None{})
    case M.Source{_, M.ModuleSource{+metadata, _}, _, _, _}:
      match metadata:
        case M.Metadata{+directory, +depth, +workspace}:
          internal(runtime, MetadataContinue{M.Metadata{directory, depth, workspace}})

def capture_source(+runtime: M.Runtime, +source: M.Source) -> Step:
  match source:
    case M.Source{+path, +returning, Some{+selection}, +capture, +bytes}:
      await_operation(runtime, SourceCapture{M.Source{path, returning, Some{selection}, capture, bytes}}, T.CaptureSource{selection, M.source_limit(M.input(runtime))})
    case +_: failed(runtime, T.MalformedReply{})

def cache_source(+runtime: M.Runtime, +source: M.Source, +cache: Maybe<&2, T.CacheToken>) -> Step:
  match cache:
    case Some{+cache}: await_operation(runtime, SourceCacheSnapshot{source}, T.SnapshotCaptureCache{cache})
    case None{}: capture_source(runtime, source)

def reserve_source(+allowed: Bool, +runtime: M.Runtime, +source: M.Source) -> Step:
  match allowed:
    case False{}: source_failed(runtime, source)
    case True{}: cache_source(runtime, source, M.cache(M.input(runtime)))

def local_source_checked(+runtime: M.Runtime, +source: M.Source, +found: Maybe<&2, M.Captured>) -> Step:
  match source found:
    case M.Source{+path, +returning, +selection, _, _} Some{M.Captured{_, +capture, +bytes}}:
      internal(runtime, SourceReady{M.Source{path, returning, selection, Some{capture}, bytes}})
    case +source None{}: reserve_source(D.reserve_allowed(runtime), runtime, source)

def source_access(+runtime: M.Runtime, +source: M.Source, +access: T.AccessOutcome) -> Step:
  match source access:
    case M.Source{+path, +returning, _, +capture, +bytes} T.AccessDenied{}:
      source_failed(D.identity_text(runtime, path, "ineligible"), M.Source{path, returning, None{}, capture, bytes})
    case M.Source{+path, +returning, _, +capture, +bytes} T.AccessAllowed{+selection, _}:
      local_source_checked(runtime, M.Source{path, returning, Some{selection}, capture, bytes}, D.captured(M.captures(runtime), path))

def source_deadline(+expired: Bool, +runtime: M.Runtime, +source: M.Source) -> Step:
  match expired source:
    case True{} +source: source_failed(runtime, source)
    case False{} M.Source{+path, +returning, +selection, +capture, +bytes}:
      await_operation(runtime, SourceAccess{M.Source{path, returning, selection, capture, bytes}}, T.AccessPath{path})

def source_snapshot_result(+runtime: M.Runtime, +source: M.Source, +cache: Maybe<&2, T.CacheToken>, +refusal: Maybe<&2, T.CaptureDiagnostic>) -> Step:
  match source cache refusal:
    case M.Source{+path, +returning, +selection, +capture, +bytes} Some{+cache} None{}:
      await_operation(runtime, SourceCacheLookup{M.Source{path, returning, selection, capture, bytes}}, T.LookupCaptureCache{cache, path})
    case +source _ +_: source_failed(runtime, source)

def source_snapshot(+runtime: M.Runtime, +source: M.Source, +entries: List<&2, T.CaptureBytes>) -> Step:
  match source:
    case M.Source{+path, _, _, _, _}: source_snapshot_result(runtime, source, M.cache(M.input(runtime)), Admission.cache_refusal(entries, path))

def source_adopt(+runtime: M.Runtime, +source: M.Source, +capture: T.CaptureToken, +bytes: Nat) -> Step:
  match source:
    case M.Source{+path, +returning, +selection, _, _}:
      internal(D.adopt(runtime, path, capture, bytes), SourceReady{M.Source{path, returning, selection, Some{capture}, bytes}})

def source_lookup(+runtime: M.Runtime, +source: M.Source, +cached: T.CacheOutcome) -> Step:
  match cached:
    case T.CacheAbsent{}: capture_source(runtime, source)
    case T.CachePresent{+capture, +bytes}: source_adopt(runtime, source, capture, bytes)

def source_store(+runtime: M.Runtime, +source: M.Source, +cache: Maybe<&2, T.CacheToken>, +capture: T.CaptureToken, +bytes: Nat) -> Step:
  match source cache:
    case M.Source{+path, +returning, +selection, _, _} Some{+cache}:
      await_operation(runtime, SourceStore{M.Source{path, returning, selection, Some{capture}, bytes}}, T.StoreCaptureCache{cache, path, capture})
    case +source None{}: source_adopt(runtime, source, capture, bytes)

def source_captured(+runtime: M.Runtime, +source: M.Source, +outcome: T.CaptureOutcome) -> Step:
  match outcome:
    case T.CaptureUnavailable{_}: source_failed(runtime, source)
    case T.SourceCaptured{+capture, _, +bytes}: source_store(runtime, source, M.cache(M.input(runtime)), capture, bytes)

def source_stored(+runtime: M.Runtime, +source: M.Source) -> Step:
  match source:
    case M.Source{+path, +returning, +selection, Some{+capture}, +bytes}:
      source_adopt(runtime, M.Source{path, returning, selection, Some{capture}, bytes}, capture, bytes)
    case +_: failed(runtime, T.MalformedReply{})

def source_ready(+allowed: Bool, +runtime: M.Runtime, +source: M.Source) -> Step:
  match allowed source:
    case True{} M.Source{+path, +returning, +selection, Some{+capture}, +bytes}:
      await_operation(runtime, SourceText{M.Source{path, returning, selection, Some{capture}, bytes}}, T.ReadCapturedText{capture})
    case _ +source: source_failed(runtime, source)

def ready_source(+runtime: M.Runtime, +source: M.Source) -> Step:
  match source:
    case M.Source{_, _, _, _, +bytes}: source_ready(D.accepted_bytes(runtime, bytes), runtime, source)

def source_text(+runtime: M.Runtime, +source: M.Source, +text: String, +hash: String) -> Step:
  match source:
    case M.Source{+path, _, _, _, _}:
      await_operation(D.identity_text(runtime, path, hash), SourceRawText{source, text}, T.ReadGoBuildText{text})

def begin_load_existing(+runtime: M.Runtime, +load: M.Load, +entry: Maybe<&2, M.PackageEntry>) -> Step:
  match load entry:
    case M.Load{_, +returning, _, _, _} Some{M.PackageEntry{_, +value}}: loaded_return(runtime, returning, value)
    case +load None{}: await_operation(M.with_packages(runtime, D.set_package(M.packages(runtime), load_directory(load), None{})), LoadDeadline{load}, T.ReadClock{M.clock(M.input(runtime))})

def load_deadline(+allowed: Bool, +runtime: M.Runtime, +load: M.Load) -> Step:
  match allowed:
    case False{}: finish_load(runtime, load, None{})
    case True{}: internal(D.charge(runtime), InventoryBegin{load, ".", String.split(load_directory(load), '/')})

def inventory_begin(+runtime: M.Runtime, +load: M.Load, +current: String, +remaining: List<&2, String>) -> Step:
  match remaining:
    case []: await_operation(runtime, InventoryOpen{load}, T.ReadDirectoryEntries{load_directory(load), 128n})
    case +head <> +tail:
      Bool.pick(Step, String.eq(head, "."), internal(runtime, InventoryBegin{load, current, tail}), await_operation(runtime, InventoryAncestorJoin{load, current, tail}, T.PathJoin{[current, head]}))

def inventory_safe(+status: T.PathMembership) -> Bool:
  match status:
    case T.MembershipPresent{_, +directory, +symlink, _}: Bool.and(directory, Bool.not(symlink))
    case _: False{}

def inventory_stat(+safe: Bool, +runtime: M.Runtime, +load: M.Load, +current: String, +remaining: List<&2, String>) -> Step:
  match safe:
    case False{}: finish_load(D.identity_text(runtime, load_directory(load), "unavailable-inventory"), load, None{})
    case True{}: internal(runtime, InventoryBegin{load, current, remaining})

def inventory_observed(+complete: Bool, +runtime: M.Runtime, +load: M.Load, +entries: List<&2, String>) -> Step:
  match complete:
    case False{}: finish_load(D.identity_text(runtime, load_directory(load), "unavailable-inventory"), load, None{})
    case True{}: internal(runtime, InventoryNext{load, entries, []})

def inventory_next(+runtime: M.Runtime, +load: M.Load, +remaining: List<&2, String>, +selected: List<&2, String>) -> Step:
  match remaining:
    case []:
      +ordered = D.sorted(selected)
      internal(D.identity_inventory(runtime, load_directory(load), ordered), FilterNext{load, ordered, []})
    case +head <> +tail:
      Bool.pick(Step, Bool.and(String.ends_with(head, ".go"), Bool.not(Bool.or(String.starts_with(head, "."), Bool.or(String.starts_with(head, "_"), String.ends_with(head, "_test.go"))))),
        await_operation(runtime, InventoryName{load, tail, selected}, T.PathJoin{[load_directory(load), head]}),
        internal(runtime, InventoryNext{load, tail, selected}))

def filter_finish(+allowed: Bool, +runtime: M.Runtime, +load: M.Load, +possible: List<&2, String>) -> Step:
  match allowed load:
    case False{} +load: finish_load(runtime, load, None{})
    case True{} M.Load{+directory, +returning, _, +files, +spellings}:
      internal(runtime, LoadNext{M.Load{directory, returning, possible, files, spellings}})

def filter_next(+runtime: M.Runtime, +load: M.Load, +remaining: List<&2, String>, +possible: List<&2, String>) -> Step:
  match remaining:
    case []: filter_finish(Bool.and(Nat.is_gt(List.length(&2, String, possible), 0n), Nat.is_le(Nat.add(M.files_spent(runtime), D.uncaptured(possible, M.captures(runtime))), M.files_limit(M.input(runtime)))), runtime, load, possible)
    case +path <> +tail: await_operation(runtime, Filename{load, path, tail, possible}, T.PathBasename{path, None{}})

def filter_filename(+membership: Build.Membership, +runtime: M.Runtime, +load: M.Load, +path: String, +remaining: List<&2, String>, +possible: List<&2, String>) -> Step:
  match membership:
    case Build.Inactive{}: internal(runtime, FilterNext{load, remaining, possible})
    case _: internal(runtime, FilterNext{load, remaining, D.append_string(possible, path)})

def load_next(+runtime: M.Runtime, +load: M.Load) -> Step:
  match load:
    case M.Load{+directory, +returning, Nil{}, +files, +spellings}:
      internal(runtime, SpellingNext{M.Load{directory, returning, [], files, spellings}, D.file_texts(files)})
    case M.Load{+directory, +returning, Con{+path, +tail}, +files, +spellings}:
      internal(runtime, SourceBegin{M.Source{path, M.PackageSource{M.Load{directory, returning, tail, files, spellings}, path}, None{}, None{}, 0n}})

def spelling_next(+runtime: M.Runtime, +load: M.Load, +remaining: List<&2, String>) -> Step:
  match remaining:
    case []: internal(runtime, InferPackage{load})
    case +head <> +tail: await_operation(runtime, PackageSpelling{load, head, tail}, T.ReadGoCharacters{head})

def spelling_received(+runtime: M.Runtime, +load: M.Load, +current: String, +remaining: List<&2, String>, +chars: List<&2, Unicode.Character>) -> Step:
  match load:
    case M.Load{+directory, +returning, +candidates, +files, +spellings}:
      internal(runtime, SpellingNext{M.Load{directory, returning, candidates, files, List.append(&2, Unicode.Spelling, spellings, [Unicode.Spelling{current, chars}])}, remaining})

def inferred(+runtime: M.Runtime, +load: M.Load, +name: Maybe<&2, String>, +facts: Package.PackageResult) -> Step:
  match load name facts:
    case M.Load{+directory, +returning, +candidates, +files, +spellings} Some{+name} Package.PackageFacts{_, +work, _}:
      finish_load(M.with_work(runtime, Nat.add(M.work(runtime), work)), M.Load{directory, returning, candidates, files, spellings}, Some{M.LoadedPackage{files, facts, name}})
    case +load _ _: finish_load(runtime, load, None{})

def infer_package(+runtime: M.Runtime, +load: M.Load) -> Step:
  match load:
    case M.Load{_, _, _, +files, +spellings}:
      inferred(runtime, load, D.names(files), Package.run(files, Nat.sub(M.work_limit(M.input(runtime)), Nat.add(M.work(runtime), 1n)), spellings))

def membership_result(+membership: Build.Membership, +generated: Bool, +runtime: M.Runtime, +source: M.Source) -> Step:
  match membership generated source:
    case Build.Active{} False{} M.Source{+path, M.PackageSource{+load, _}, _, Some{+capture}, _}:
      await_operation(runtime, FileInspect{load, path}, T.InspectGoFile{path, capture})
    case Build.Inactive{} _ M.Source{+path, M.PackageSource{+load, _}, _, _, _}:
      Bool.pick(Step, String.eq(path, M.input_root_path(M.input(runtime))), finish_load(runtime, load, None{}), internal(runtime, LoadNext{load}))
    case _ _ +source: source_failed(runtime, source)

def source_raw(+runtime: M.Runtime, +source: M.Source, +raw: Raw.Text) -> Step:
  match source:
    case M.Source{+path, M.PackageSource{+load, +candidate}, +selection, +capture, +bytes}:
      await_operation(runtime, FileMembership{M.Source{path, M.PackageSource{load, candidate}, selection, capture, bytes}, raw}, T.PathBasename{path, None{}})
    case M.Source{_, M.ModuleSource{+metadata, _}, _, _, _}:
      match metadata:
        case M.Metadata{+directory, _, _}:
          internal(M.with_module_name(runtime, Module.module_name(raw)), MetadataContinue{metadata})

def inspected_file(+allowed: Bool, +runtime: M.Runtime, +load: M.Load, +file: T.GoFileSyntax) -> Step:
  match allowed load:
    case False{} +load: finish_load(runtime, load, None{})
    case True{} M.Load{+directory, +returning, +candidates, +files, +spellings}:
      internal(runtime, LoadNext{M.Load{directory, returning, candidates, List.append(&2, T.GoFileSyntax, files, [file]), spellings}})

def inspected(+runtime: M.Runtime, +load: M.Load, +result: T.GoFileOutcome) -> Step:
  match result:
    case T.GoFileUnsupported{}: finish_load(runtime, load, None{})
    case T.GoFileInspected{+file}: inspected_file(Bool.not(D.file_cgo(file)), runtime, load, file)

def metadata_finished(+runtime: M.Runtime, workspace: Bool, reached_root: Bool) -> Step:
  internal(M.with_module_name(runtime, Bool.pick(Maybe<&2, String>, Bool.or(workspace, Bool.not(reached_root)), None{}, M.module_name(runtime))),
    DiscoveryNext{[M.Task{M.root_directory(runtime), 0n}]})

def metadata_continue(+runtime: M.Runtime, metadata: M.Metadata) -> Step:
  match metadata:
    case M.Metadata{+directory, depth, +workspace}:
      Bool.pick(Step, String.eq(directory, "."), metadata_finished(runtime, workspace, True{}),
        await_operation(runtime, MetadataParent{M.Metadata{directory, depth, workspace}}, T.PathDirname{directory}))

def metadata_next(+runtime: M.Runtime, metadata: M.Metadata) -> Step:
  match metadata:
    case M.Metadata{+directory, +depth, +workspace}:
      Bool.pick(Step, Nat.is_gt(depth, M.depth_limit(M.input(runtime))), metadata_finished(runtime, workspace, False{}),
        await_operation(runtime, MetadataJoinWork{M.Metadata{directory, depth, workspace}}, T.PathJoin{[directory, "go.work"]}))

def metadata_work(runtime: M.Runtime, metadata: M.Metadata, found: Bool, module_base: Maybe<&2, String>) -> Step:
  match metadata module_base:
    case M.Metadata{+directory, depth, workspace} None{}:
      await_operation(runtime, MetadataJoinModule{M.Metadata{directory, depth, Bool.or(found, workspace)}}, T.PathJoin{[directory, "go.mod"]})
    case M.Metadata{directory, depth, workspace} Some{_}:
      metadata_continue(runtime, M.Metadata{directory, depth, Bool.or(found, workspace)})

def nested_finished(nested: Bool, +runtime: M.Runtime, discovery: M.Discovery, +target: String) -> Step:
  match nested discovery:
    case True{} discovery: internal(M.with_packages(runtime, D.set_package(M.packages(runtime), target, None{})), DiscoveryImports{discovery})
    case False{} M.Discovery{pending, task, files, imports}:
      internal(runtime, LoadBegin{M.Load{target, M.ImportedPackage{pending, task, files, imports, target}, [], [], []}})

def exists_result(found: Bool, +runtime: M.Runtime, returning: M.ExistsReturn) -> Step:
  match returning:
    case M.WorkspaceAlternative{metadata}: metadata_work(runtime, metadata, found, M.module_base(runtime))
    case M.ModuleAlternative{+metadata}:
      match metadata:
        case M.Metadata{+directory, _, _}:
          Bool.pick(Step, found,
            await_operation(M.with_module_base(runtime, Some{directory}), MetadataJoinModule{metadata}, T.PathJoin{[directory, "go.mod"]}),
            metadata_continue(runtime, metadata))
    case M.NestedAlternative{discovery, target, +ancestor, depth}:
      Bool.pick(Step, found, nested_finished(True{}, runtime, discovery, target),
        await_operation(runtime, NestedParent{discovery, target, depth}, T.PathDirname{ancestor}))

def exists_begin(+runtime: M.Runtime, +path: String, returning: M.ExistsReturn) -> Step:
  await_operation(runtime, ExistsDeadline{path, returning}, T.ReadClock{M.clock(M.input(runtime))})

def exists_deadline(allowed: Bool, runtime: M.Runtime, +path: String, returning: M.ExistsReturn) -> Step:
  match allowed:
    case False{}: exists_result(True{}, runtime, returning)
    case True{}: await_operation(D.charge(runtime), ExistsStat{path, returning}, T.ReadPathMembership{path})

def membership_identity(status: T.PathMembership) -> String:
  match status:
    case T.MembershipAbsent{}: "absent"
    case T.MembershipFailed{}: "unavailable"
    case T.MembershipPresent{file, _, _, _}: Bool.pick(String, file, "file", "unsafe")

def exists_stat(runtime: M.Runtime, path: String, returning: M.ExistsReturn, +status: T.PathMembership) -> Step:
  +value = membership_identity(status)
  exists_result(Bool.not(String.eq(value, "absent")), D.identity_text(runtime, path, value), returning)

def module_joined(+runtime: M.Runtime, +metadata: M.Metadata, path: String, base: Maybe<&2, String>) -> Step:
  match base:
    case None{}: exists_begin(runtime, path, M.ModuleAlternative{metadata})
    case Some{_}: internal(runtime, SourceBegin{M.Source{path, M.ModuleSource{metadata, path}, None{}, None{}, 0n}})

def discovery_next(+runtime: M.Runtime, pending: List<&2, M.Task>) -> Step:
  match pending:
    case []: internal(runtime, RemapBegin{})
    case head <> tail: await_operation(runtime, DiscoveryDeadline{head <> tail}, T.ReadClock{M.clock(M.input(runtime))})

def task_package(runtime: M.Runtime, pending: List<&2, M.Task>, +task: M.Task, package: Maybe<&2, M.LoadedPackage>, base: Maybe<&2, String>, module: Maybe<&2, String>) -> Step:
  match package base module:
    case Some{M.LoadedPackage{files, _, _}} Some{_} Some{_}: internal(runtime, DiscoveryFiles{M.Discovery{pending, task, files, []}})
    case _ _ _: internal(runtime, DiscoveryNext{pending})

def discovery_admitted(allowed: Bool, +runtime: M.Runtime, pending: List<&2, M.Task>) -> Step:
  match allowed pending:
    case True{} Con{M.Task{+directory, +depth}, tail}:
      Bool.pick(Step, Nat.is_ge(depth, M.depth_limit(M.input(runtime))), internal(D.charge(runtime), DiscoveryNext{tail}),
        task_package(D.charge(runtime), tail, M.Task{directory, depth}, D.loaded(D.package_entry(M.packages(runtime), directory)), M.module_base(runtime), M.module_name(runtime)))
    case _ _: internal(runtime, RemapBegin{})

def discovery_files(runtime: M.Runtime, discovery: M.Discovery) -> Step:
  match discovery:
    case M.Discovery{pending, _, Nil{}, _}: internal(runtime, DiscoveryNext{pending})
    case M.Discovery{pending, task, Con{+file, tail}, _}: internal(runtime, DiscoveryImports{M.Discovery{pending, task, tail, D.file_imports(file)}})

def imported_ignored(name: Maybe<&2, String>) -> Bool:
  match name:
    case None{}: False{}
    case Some{+name}: Bool.or(String.eq(name, "_"), String.eq(name, "."))

def import_next(ignored: Bool, can_charge: Bool, +runtime: M.Runtime, discovery: M.Discovery) -> Step:
  match ignored can_charge discovery:
    case True{} _ M.Discovery{pending, task, files, Con{_, tail}}: internal(runtime, DiscoveryImports{M.Discovery{pending, task, files, tail}})
    case False{} True{} discovery: await_operation(D.charge(runtime), ImportDeadline{discovery}, T.ReadClock{M.clock(M.input(runtime))})
    case _ _ discovery: internal(runtime, DiscoveryFiles{discovery})

def discovery_imports(+runtime: M.Runtime, discovery: M.Discovery) -> Step:
  match discovery:
    case M.Discovery{pending, task, files, Nil{}}: internal(runtime, DiscoveryFiles{M.Discovery{pending, task, files, []}})
    case M.Discovery{pending, task, files, Con{T.GoImport{path, +name}, tail}}:
      import_next(imported_ignored(name), D.can_charge(runtime), runtime, M.Discovery{pending, task, files, T.GoImport{path, name} <> tail})

def import_deadline(expired: Bool, runtime: M.Runtime, discovery: M.Discovery) -> Step:
  match expired discovery:
    case True{} discovery: internal(runtime, DiscoveryFiles{discovery})
    case False{} M.Discovery{pending, task, files, Con{imported, tail}}:
      internal(runtime, ImportSelect{M.Discovery{pending, task, files, tail}, imported})
    case _ _: failed(runtime, T.MalformedReply{})

def import_path(runtime: M.Runtime, discovery: M.Discovery, +base: String, tail: Maybe<&2, String>) -> Step:
  match tail:
    case None{}: internal(runtime, DiscoveryImports{discovery})
    case Some{+tail}: Bool.pick(Step, String.eq(tail, ""), internal(runtime, ImportInternal{discovery, base, D.internal_bases(String.split(base, '/'), "")}), await_operation(runtime, ImportJoin{discovery}, T.PathJoin{[base, tail]}))

def import_select(runtime: M.Runtime, discovery: M.Discovery, imported: T.GoImport, base: Maybe<&2, String>, module: Maybe<&2, String>) -> Step:
  match imported base module:
    case T.GoImport{path, _} Some{base} Some{module}: import_path(runtime, discovery, base, D.import_tail(module, path))
    case _ _ _: internal(runtime, DiscoveryImports{discovery})

def internal_check(+runtime: M.Runtime, discovery: M.Discovery, +target: String, bases: List<&2, String>) -> Step:
  match discovery bases:
    case discovery Nil{}:
      Bool.pick(Step, D.package_known(D.package_entry(M.packages(runtime), target)), internal(runtime, DiscoveryImports{discovery}), internal(runtime, NestedBegin{discovery, target, target, 0n}))
    case M.Discovery{pending, M.Task{+directory, depth}, files, imports} Con{base, tail}:
      await_operation(runtime, ImportInternalRelative{M.Discovery{pending, M.Task{directory, depth}, files, imports}, target, tail}, T.PathRelative{base, directory})

def nested_begin(+runtime: M.Runtime, discovery: M.Discovery, target: String, +ancestor: String, +depth: Nat) -> Step:
  +base = D.optional_text(M.module_base(runtime), ".")
  Bool.pick(Step, String.eq(ancestor, base), nested_finished(False{}, runtime, discovery, target),
    Bool.pick(Step, Nat.is_gt(depth, M.depth_limit(M.input(runtime))), nested_finished(True{}, runtime, discovery, target),
      await_operation(runtime, NestedRelative{discovery, target, ancestor, depth}, T.PathRelative{base, ancestor})))
