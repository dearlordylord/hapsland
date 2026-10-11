import Base
import ./Types.bend as T
import ./GraphSpecification.bend as Policy
import ../../../../agent-flow-bend/ImportGraph.bend as G

# Independent preparation command driver. Semantic ordered associations retain
# allocation and insertion order; no production RustMachine/RustFollow policy.
# Cargo/module path continuations and final world projection are still pending.
type TaskEntry is Data:
  TaskEntry{id: Nat, task: T.RustTask}
type TargetEntry is Data:
  TargetEntry{path: String, id: Nat}
type Preparation is Data:
  Preparation{graph: G.Bounded, command: G.Command,
    tasks: List<&2, TaskEntry>, targets: List<&2, TargetEntry>,
    next_edge: Nat, next_target: Nat, active: Maybe<&2, T.RustTask>,
    invalid: Bool, dependencies: List<&2, String>, roles: List<&2, T.RustContext>,
    iterations_left: Nat}
type Registered is Data:
  Registered{state: Preparation, edges: List<&2, Nat>}
type Action is Data:
  ReadDeadline{state: Preparation}
  CheckAccess{state: Preparation, path: String}
  RecheckAccess{state: Preparation, path: String}
  ResolvePath{state: Preparation, path: String}
  CaptureAuthorized{state: Preparation, selection: T.SelectionToken, path: String}
  InspectTask{state: Preparation, task: T.RustTask, capture: T.CaptureToken, bytes: Nat}
  PreparationFinished{state: Preparation}

def with_graph(state: Preparation, step: G.BoundedStep) -> Preparation:
  match state step:
    case Preparation{
      _,
      _,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      deps,
      roles,
      fuel
    }
      G.BoundedStep{graph, command}:
      Preparation{
        graph,
        command,
        tasks,
        targets,
        next_edge,
        next_target,
        active,
        invalid,
        deps,
        roles,
        fuel
      }

def transition(+state: Preparation, event: G.GraphEvent) -> Preparation:
  match state:
    case Preparation{graph, _, _, _, _, _, _, _, _, _, _}:
      with_graph(state, Policy.bounded_transition(graph, event))

def invalid(state: Preparation) -> Preparation:
  match state:
    case Preparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      _,
      deps,
      roles,
      fuel
    }:
      Preparation{
        graph,
        command,
        tasks,
        targets,
        next_edge,
        next_target,
        active,
        True{},
        deps,
        roles,
        fuel
      }

def registered(state: Preparation, edges_rev: List<&2, Nat>) -> Registered:
  Registered{state, List.reverse(&2, Nat, edges_rev)}

def register(
  items: List<&2, T.RustTask>,
  state: Preparation,
  edges_rev: List<&2, Nat>
) -> Registered:
  match items state:
    case [] _: registered(state, edges_rev)
    case task <> tail Preparation{
      graph,
      command,
      tasks,
      targets,
      +next_edge,
      next_target,
      active,
      invalid,
      deps,
      roles,
      fuel
    }:
      register(
        tail,
        Preparation{
          graph,
          command,
          List.append(&2, TaskEntry, tasks, [TaskEntry{next_edge, task}]),
          targets,
          (next_edge + 1n : Nat),
          next_target,
          active,
          invalid,
          deps,
          roles,
          fuel
        },
        next_edge <> edges_rev
      )

def root_registered(result: Registered, bytes: Nat) -> Preparation:
  match result:
    case Registered{state, edges}: transition(state, G.Root{1n, bytes, 0n, 0n, edges})

def initialize(
  +limits: G.Limits,
  root_path: String,
  bytes: Nat,
  cargo: Maybe<&2, String>
) -> Preparation:
  match limits cargo:
    case G.Limits{_, _, _, _, _, _, _, work} None{}:
      root_registered(
        register(
          [],
          Preparation{
            Policy.bounded_initial(limits),
            G.NoCommand{},
            [],
            [TargetEntry{root_path, 1n}],
            1n,
            2n,
            None{},
            False{},
            [],
            [],
            (work * 8n + 16n : Nat)
          },
          []
        ),
        bytes
      )
    case G.Limits{_, _, _, _, _, _, _, work} Some{cargo}:
      root_registered(
        register(
          [T.RustTask{cargo, None{}}],
          Preparation{
            Policy.bounded_initial(limits),
            G.NoCommand{},
            [],
            [TargetEntry{root_path, 1n}],
            1n,
            2n,
            None{},
            False{},
            [],
            [],
            (work * 8n + 16n : Nat)
          },
          []
        ),
        bytes
      )

def selected_task(
  found: Bool,
  task: T.RustTask,
  rest: Maybe<&2, T.RustTask>
) -> Maybe<&2, T.RustTask>:
  match found:
    case True{}: Some{task}
    case False{}: rest

def task_at(items: List<&2, TaskEntry>, +id: Nat) -> Maybe<&2, T.RustTask>:
  match items:
    case []: None{}
    case TaskEntry{key, task} <> tail: selected_task(Nat.is_eq(key, id), task, task_at(tail, id))

def with_active(state: Preparation, active: Maybe<&2, T.RustTask>) -> Preparation:
  match state:
    case Preparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      _,
      invalid,
      deps,
      roles,
      fuel
    }:
      Preparation{
        graph,
        command,
        tasks,
        targets,
        next_edge,
        next_target,
        active,
        invalid,
        deps,
        roles,
        fuel
      }

def resolving(state: Preparation, task: Maybe<&2, T.RustTask>) -> Action:
  match task:
    case None{}: PreparationFinished{invalid(with_active(state, None{}))}
    case Some{T.RustTask{+path, route}}: ResolvePath{
      with_active(state, Some{T.RustTask{path, route}}),
      path
    }

def active_path(+state: Preparation, active: Maybe<&2, T.RustTask>, recheck: Bool) -> Action:
  match active:
    case None{}: PreparationFinished{invalid(state)}
    case Some{T.RustTask{+path, _}}:
      Bool.pick(Action, recheck, RecheckAccess{state, path}, CheckAccess{state, path})

def next_iteration(state: Preparation) -> Action:
  match state:
    case Preparation{_, _, _, _, _, _, _, _, _, _, 0n}: PreparationFinished{state}
    case Preparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      deps,
      roles,
      1n+fuel
    }:
      ReadDeadline{
        Preparation{
          graph,
          command,
          tasks,
          targets,
          next_edge,
          next_target,
          active,
          invalid,
          deps,
          roles,
          fuel
        }
      }

def execute(+state: Preparation) -> Action:
  match state:
    case Preparation{_, G.NoCommand{}, _, _, _, _, _, _, _, _, _}:
      next_iteration(transition(state, G.Next{}))
    case Preparation{_, G.ResolveEdge{edge}, tasks, _, _, _, _, _, _, _, _}:
      resolving(state, task_at(tasks, edge))
    case Preparation{_, G.CheckPath{_}, _, _, _, _, active, _, _, _, _}:
      active_path(state, active, False{})
    case Preparation{_, G.ReadSource{_}, _, _, _, _, active, _, _, _, _}:
      active_path(state, active, True{})
    case _: PreparationFinished{invalid(state)}

def deadline_clear(complete: Bool, state: Preparation) -> Action:
  match complete:
    case True{}: PreparationFinished{state}
    case False{}: execute(state)

def complete_command(command: G.Command) -> Bool:
  match command:
    case G.UnitComplete{}: True{}
    case _: False{}

# Native checks clock before command completion. The native iteration cap is
# semantic policy, separate from a mathematical interpreter evaluation bound.
def deadline(expired: Bool, state: Preparation) -> Action:
  match expired state:
    case True{} _: PreparationFinished{invalid(state)}
    case False{} Preparation{
      graph,
      +command,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      deps,
      roles,
      fuel
    }:
      deadline_clear(complete_command(command), Preparation{graph, command, tasks, targets,
        next_edge, next_target, active, invalid, deps, roles, fuel})


def target_match(found: Bool, id: Nat, rest: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case True{}: Some{id}
    case False{}: rest

def target_at(items: List<&2, TargetEntry>, +path: String) -> Maybe<&2, Nat>:
  match items:
    case []: None{}
    case TargetEntry{key, id} <> tail: target_match(String.eq(key, path), id, target_at(tail, path))

def contains(items: List<&2, String>, +path: String) -> Bool:
  match items:
    case []: False{}
    case key <> tail: Bool.or(String.eq(key, path), contains(tail, path))

def resolve_registered(repeated: Bool, state: Preparation, target: Nat) -> Action:
  match repeated:
    case True{}: PreparationFinished{invalid(state)}
    case False{}: next_iteration(transition(state, G.Resolved{target, G.Found{}}))

def allocate(found: Maybe<&2, Nat>, +state: Preparation, +path: String) -> Action:
  match found state:
    case Some{target} Preparation{_, _, _, _, _, _, _, _, deps, _, _}:
      resolve_registered(contains(deps, path), state, target)
    case None{} Preparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      +next_target,
      active,
      invalid,
      deps,
      roles,
      fuel
    }:
      resolve_registered(contains(deps, path), Preparation{graph, command, tasks,
        List.append(&2, TargetEntry, targets, [TargetEntry{path, next_target}]), next_edge,
        (next_target + 1n : Nat), active, invalid, deps, roles, fuel}, next_target)

# Path rejection retains active. Allocation precedes repeated dependency check.
def resolved_path(allowed: Bool, +state: Preparation, +path: String) -> Action:
  match allowed state:
    case False{} _: PreparationFinished{invalid(state)}
    case True{} Preparation{_, _, _, targets, _, _, _, _, _, _, _}:
      allocate(target_at(targets, path), state, path)

def checked_path(state: Preparation, allowed: Bool) -> Action:
  next_iteration(transition(state, G.PathChecked{allowed}))

def authorized(state: Preparation, access: T.AccessOutcome) -> Action:
  match access:
    case T.AccessDenied{}: PreparationFinished{invalid(state)}
    case T.AccessAllowed{selection, path}: CaptureAuthorized{state, selection, path}

def main() -> Unit:
  Unit{}

def captured_task(
  state: Preparation,
  task: Maybe<&2, T.RustTask>,
  capture: T.CaptureToken,
  bytes: Nat
) -> Action:
  match task:
    case None{}: PreparationFinished{invalid(state)}
    case Some{task}: InspectTask{state, task, capture, bytes}

# Called only after aggregate cache admission and successful cache lookup or
# capture/store. The cache remains committed even if source size is refused.
def capture_admitted(allowed: Bool, state: Preparation, +path: String,
    capture: T.CaptureToken, bytes: Nat) -> Action:
  match allowed state:
    case False{} _: PreparationFinished{invalid(state)}
    case True{} Preparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      +active,
      invalid,
      +deps,
      roles,
      fuel
    }:
      captured_task(
        Preparation{
          graph,
          command,
          tasks,
          targets,
          next_edge,
          next_target,
          active,
          invalid,
          Bool.pick(
            List<&2, String>,
            contains(deps, path),
            deps,
            List.append(&2, String, deps, [path])
          ),
          roles,
          fuel
        },
        active,
        capture,
        bytes
      )

def captured_registered(result: Registered, bytes: Nat) -> Action:
  match result:
    case Registered{state, edges}: next_iteration(
      transition(state, G.Captured{bytes, 0n, 0n, edges})
    )

# Cargo/module continuations return ordered pending tasks after independently
# evaluating their syntax and path policy. Unsupported syntax sets invalid
# but native still registers pending and applies Captured before next clock.
def after_task(state: Preparation, tasks: List<&2, T.RustTask>, bytes: Nat) -> Action:
  captured_registered(register(tasks, state, []), bytes)

def add_role(state: Preparation, role: T.RustContext) -> Preparation:
  match state:
    case Preparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      deps,
      roles,
      fuel
    }:
      Preparation{graph, command, tasks, targets, next_edge, next_target, active, invalid, deps,
        List.append(&2, T.RustContext, roles, [role]), fuel}

def one_role(roles: List<&2, T.RustContext>) -> Maybe<&2, T.RustContext>:
  match roles:
    case role <> []: Some{role}
    case _: None{}

def accepted_role(accepted: Bool, roles: List<&2, T.RustContext>) -> Maybe<&2, T.RustContext>:
  match accepted:
    case True{}: one_role(roles)
    case False{}: None{}

# Absence of a unique role is a preparation result, not itself a NoUnit.
def role(state: Preparation) -> Maybe<&2, T.RustContext>:
  match state:
    case Preparation{_, command, _, _, _, _, _, invalid, _, roles, _}:
      accepted_role(Bool.and(Bool.not(invalid), complete_command(command)), roles)

def remaining(limits: G.Limits, state: Preparation, root_bytes: Nat) -> G.Limits:
  match limits state:
    case G.Limits{version, source, tree, files, read, edges, depth, work}
      Preparation{
        G.Bounded{G.Graph{_, _, _, spent_files, spent_read, _, spent_work, _, _, _, _}, _},
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        _
      }:
      G.Limits{version, source, tree, (files - (spent_files - 1n) : Nat),
        (read - (spent_read - root_bytes) : Nat), edges, depth, (work - spent_work : Nat)}

def adapter_budget(needs_binding: Bool, limits: G.Limits) -> Bool:
  match limits:
    case G.Limits{_, source, _, files, read, _, _, work}:
      Bool.and(Nat.is_ge(files, 1n), Bool.and(Nat.is_ge(work, 1n),
        Bool.or(Bool.not(needs_binding), Nat.is_ge(read, source))))

type SearchStage is Data:
  CreatingCache{}
  InsertingRoot{}
  InitialDirectory{}
  JoiningCargo{}
  ReadingCargoStatus{}
  ParentDirectory{}
type Search is Data:
  Search{input: T.ResolverInput, stage: SearchStage, cache: Maybe<&2, T.CacheToken>,
    directory: String, candidate: String, attempted: Nat}
type SearchStep is Data:
  SearchRequest{state: Search, operation: T.Operation}
  SearchFinished{cache: T.CacheToken, preparation: Preparation}
  SearchFailed{failure: T.TechnicalFailure}

def request_search(state: Search, stage: SearchStage, operation: T.Operation) -> SearchStep:
  match state:
    case Search{input, _, cache, directory, candidate, attempted}:
      SearchRequest{Search{input, stage, cache, directory, candidate, attempted}, operation}

def start_cache(+input: T.ResolverInput, cache: Maybe<&2, T.CacheToken>) -> SearchStep:
  match input cache:
    case T.ResolverInput{_, path, capture, _, _, _, _, _, _} Some{+cache}:
      SearchRequest{Search{input, InsertingRoot{}, Some{cache}, "", "", 0n},
        T.InsertRootCaptureCache{cache, path, capture}}
    case _ None{}:
      SearchRequest{Search{input, CreatingCache{}, None{}, "", "", 0n}, T.CreateInvocationCache{}}

def begin(+input: T.ResolverInput) -> SearchStep:
  match input:
    case T.ResolverInput{_, _, _, _, _, _, _, cache, _}: start_cache(input, cache)

def finish_search(state: Search, cargo: Maybe<&2, String>) -> SearchStep:
  match state:
    case Search{T.ResolverInput{_, path, _, bytes, _, _, _, _, limits}, _, Some{cache}, _, _, _}:
      SearchFinished{cache, initialize(limits, path, bytes, cargo)}
    case _: SearchFailed{T.MalformedReply{}}

def search_status(absent: Bool, +state: Search) -> SearchStep:
  match absent state:
    case False{} Search{_, _, _, _, candidate, _}: finish_search(state, Some{candidate})
    case True{} Search{_, _, _, +directory, _, attempted}:
      Bool.pick(
        SearchStep,
        String.eq(directory, "."),
        finish_search(state, None{}),
        request_search(state, ParentDirectory{}, T.PathDirname{directory})
      )

def status_absent(status: T.FileStatus) -> Bool:
  match status:
    case T.FileAbsent{}: True{}
    case _: False{}

# Native nearestCargo stops on any defined status, including ExistingOther.
# Root capture insertion precedes this entire search; no extra deadline request
# is inserted during up to sixteen ancestor status reads.
def root_inserted(+state: Search) -> SearchStep:
  match state:
    case Search{T.ResolverInput{_, path, _, _, _, _, _, _, _}, _, _, _, _, _}:
      request_search(state, InitialDirectory{}, T.PathDirname{path})

def parent_directory(exhausted: Bool, state: Search, +directory: String) -> SearchStep:
  match exhausted state:
    case True{} _: finish_search(state, None{})
    case False{} Search{input, _, cache, _, candidate, attempted}:
      SearchRequest{Search{input, JoiningCargo{}, cache, directory, candidate, attempted},
        T.PathJoin{[directory, "Cargo.toml"]}}

def search_reply(+state: Search, outcome: T.ServiceOutcome) -> SearchStep:
  match state outcome:
    case Search{input, CreatingCache{}, _, _, _, _} T.InvocationCacheCreated{cache}:
      start_cache(input, Some{cache})
    case Search{_, InsertingRoot{}, _, _, _, _} T.RootCacheInserted{}: root_inserted(state)
    case Search{input, InitialDirectory{}, cache, _, candidate, attempted} T.DirnameResult{
      +directory
    }:
      SearchRequest{
        Search{input, JoiningCargo{}, cache, directory, candidate, attempted},
        T.PathJoin{[directory, "Cargo.toml"]}
      }
    case Search{_, ParentDirectory{}, _, _, _, attempted} T.DirnameResult{directory}:
      parent_directory(Nat.is_ge(attempted, 16n), state, directory)
    case Search{input, JoiningCargo{}, cache, directory, _, attempted} T.JoinedResult{+candidate}:
      SearchRequest{
        Search{input, ReadingCargoStatus{}, cache, directory, candidate, (attempted + 1n : Nat)},
        T.ReadFileStatus{candidate}
      }
    case Search{_, ReadingCargoStatus{}, _, _, _, _} T.StatusResult{status}:
      search_status(status_absent(status), state)
    case _ T.ProviderRejected{exception}: SearchFailed{T.ForeignProviderFailure{exception}}
    case _ _: SearchFailed{T.WrongReplyKind{}}

type CaptureStage is Data:
  ReadingCacheSnapshot{}
  LookingUpCache{}
  ReadingCapture{}
  StoringCapture{capture: T.CaptureToken, bytes: Nat}
  ReportingRefusal{}
type CaptureState is Data:
  CaptureState{preparation: Preparation, cache: T.CacheToken, selection: T.SelectionToken,
    path: String, source_cap: Nat, stage: CaptureStage}
type CaptureStep is Data:
  CaptureRequest{state: CaptureState, operation: T.Operation}
  CaptureFinished{action: Action}
  CaptureFailed{failure: T.TechnicalFailure}

def source_cap(state: Preparation) -> Nat:
  match state:
    case Preparation{
      G.Bounded{G.Graph{_, _, _, _, _, _, _, _, _, _, G.Limits{_, source, _, _, _, _, _, _}}, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      source

def capture_start(
  +state: Preparation,
  +cache: T.CacheToken,
  selection: T.SelectionToken,
  path: String
) -> CaptureStep:
  CaptureRequest{
    CaptureState{state, cache, selection, path, source_cap(state), ReadingCacheSnapshot{}},
    T.SnapshotCaptureCache{cache}
  }

def captured_path(items: List<&2, T.CaptureBytes>, +path: String) -> Bool:
  match items:
    case []: False{}
    case T.CaptureBytes{key, _} <> tail: Bool.or(String.eq(key, path), captured_path(tail, path))

def captured_bytes(items: List<&2, T.CaptureBytes>) -> Nat:
  match items:
    case []: 0n
    case T.CaptureBytes{_, bytes} <> tail: (bytes + captured_bytes(tail) : Nat)

def byte_refusal(exceeded: Bool, used: Nat, requested: Nat) -> Maybe<&2, T.CaptureDiagnostic>:
  match exceeded:
    case False{}: None{}
    case True{}: Some{T.CaptureBudgetDiagnostic{"bytes", used, requested, 16777216n}}

def count_refusal(
  exceeded: Bool,
  count: Nat,
  +bytes: Nat,
  +requested: Nat
) -> Maybe<&2, T.CaptureDiagnostic>:
  match exceeded:
    case True{}: Some{T.CaptureBudgetDiagnostic{"files", count, 1n, 64n}}
    case False{}: byte_refusal(Nat.is_gt((bytes + requested : Nat), 16777216n), bytes, requested)

def cache_refusal(
  present: Bool,
  +items: List<&2, T.CaptureBytes>,
  requested: Nat
) -> Maybe<&2, T.CaptureDiagnostic>:
  match present:
    case True{}: None{}
    case False{}:
      +count = List.length(&2, T.CaptureBytes, items)
      count_refusal(Nat.is_ge(count, 64n), count, captured_bytes(items), requested)

def refusal(refusal: Maybe<&2, T.CaptureDiagnostic>, state: CaptureState) -> CaptureStep:
  match refusal state:
    case None{} CaptureState{prep, +cache, selection, +path, cap, _}:
      CaptureRequest{
        CaptureState{prep, cache, selection, path, cap, LookingUpCache{}},
        T.LookupCaptureCache{cache, path}
      }
    case Some{diagnostic} CaptureState{prep, cache, selection, +path, cap, _}:
      CaptureRequest{
        CaptureState{prep, cache, selection, path, cap, ReportingRefusal{}},
        T.ObserveDiagnostic{path, diagnostic}
      }

def cache_snapshot(+state: CaptureState, +entries: List<&2, T.CaptureBytes>) -> CaptureStep:
  match state:
    case CaptureState{_, _, _, path, cap, _}:
      refusal(cache_refusal(captured_path(entries, path), entries, cap), state)

def capture_ready(state: CaptureState, capture: T.CaptureToken, +bytes: Nat) -> CaptureStep:
  match state:
    case CaptureState{prep, _, _, path, cap, _}:
      CaptureFinished{capture_admitted(Nat.is_le(bytes, cap), prep, path, capture, bytes)}

def cached(state: CaptureState, outcome: T.CacheOutcome) -> CaptureStep:
  match state outcome:
    case _ T.CachePresent{capture, bytes}: capture_ready(state, capture, bytes)
    case CaptureState{prep, cache, +selection, path, +cap, _} T.CacheAbsent{}:
      CaptureRequest{
        CaptureState{prep, cache, selection, path, cap, ReadingCapture{}},
        T.CaptureSource{selection, cap}
      }

def captured(state: CaptureState, outcome: T.CaptureOutcome) -> CaptureStep:
  match state outcome:
    case CaptureState{prep, +cache, selection, +path, cap, _} T.SourceCaptured{+capture, _, bytes}:
      CaptureRequest{
        CaptureState{prep, cache, selection, path, cap, StoringCapture{capture, bytes}},
        T.StoreCaptureCache{cache, path, capture}
      }
    case CaptureState{prep, cache, selection, +path, cap, _} T.CaptureUnavailable{diagnostic}:
      CaptureRequest{
        CaptureState{prep, cache, selection, path, cap, ReportingRefusal{}},
        T.ObserveDiagnostic{path, diagnostic}
      }

# Store precedes size refusal; diagnostics precede invalid exit. World/cache
# changes are threaded by the independent Environment, never rolled back here.
def capture_reply(+state: CaptureState, outcome: T.ServiceOutcome) -> CaptureStep:
  match state outcome:
    case CaptureState{_, _, _, _, _, ReadingCacheSnapshot{}} T.CacheSnapshot{entries}: cache_snapshot(
      state,
      entries
    )
    case CaptureState{_, _, _, _, _, LookingUpCache{}} T.CacheResult{outcome}: cached(
      state,
      outcome
    )
    case CaptureState{_, _, _, _, _, ReadingCapture{}} T.CaptureResult{outcome}: captured(
      state,
      outcome
    )
    case CaptureState{_, _, _, _, _, StoringCapture{capture, bytes}} T.CacheStored{}: capture_ready(
      state,
      capture,
      bytes
    )
    case CaptureState{prep, _, _, _, _, ReportingRefusal{}} T.DiagnosticObserved{}:
      CaptureFinished{PreparationFinished{invalid(prep)}}
    case _ T.ProviderRejected{exception}: CaptureFailed{T.ForeignProviderFailure{exception}}
    case _ _: CaptureFailed{T.WrongReplyKind{}}

# Native Array.sort orders UTF-16 units, not Unicode scalar values. Keep
# supplementary characters and lone surrogates in the declared text domain.
def scalar_units(supplementary: Bool, +value: U32) -> List<&2, U32>:
  match supplementary:
    case False{}: [value]
    case True{}:
      +offset = U32.sub(value, 65536)
      [U32.add(55296, U32.shrn(offset, 10n)), U32.add(56320, U32.and(offset, 1023))]

def text_units(text: String) -> List<&2, U32>:
  match text:
    case SNil{}: []
    case SCon{head, tail}:
      +value = Char.to_u32(head)
      List.append(&2, U32, scalar_units(U32.is_gt(value, 65535), value), text_units(tail))

def units_before(left: List<&2, U32>, right: List<&2, U32>) -> Bool:
  match left right:
    case [] _: True{}
    case Con{_, _} Nil{}: False{}
    case Con{+head, tail} Con{+other, rest}:
      Bool.pick(Bool, U32.is_eq(head, other), units_before(tail, rest), U32.is_lt(head, other))

def insert_dependency(+path: String, items: List<&2, String>) -> List<&2, String>:
  match items:
    case []: [path]
    case +head <> +tail:
      Bool.pick(List<&2, String>, units_before(text_units(path), text_units(head)),
        path <> head <> tail, head <> insert_dependency(path, tail))

def sorted_paths(items: List<&2, String>) -> List<&2, String>:
  match items:
    case []: []
    case path <> tail: insert_dependency(path, sorted_paths(tail))

def sorted_dependencies(state: Preparation) -> List<&2, String>:
  match state:
    case Preparation{_, _, _, _, _, _, _, _, dependencies, _, _}: sorted_paths(dependencies)
