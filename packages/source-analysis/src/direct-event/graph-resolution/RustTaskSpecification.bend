import Base
import ./Types.bend as T
import ./RustSpecification.bend as Preparation
import ./CargoSpecification.bend as Cargo
import ./ModuleSpecification.bend as Module
import ../../../../agent-flow-bend/ImportGraph.bend as G

# Independent successful Cargo/module continuation. It selects status and
# engine requests itself, retaining the native ordered worklists and effects.
type ReturnTo is Data:
  CapturedRoute{}
  CargoCandidates{remaining: List<&2, String>}
type Stage is Data:
  ParsingCargo{}
  ScanningCargo{remaining: List<&2, String>, found_rev: List<&2, String>}
  ProcessingCrates{remaining: List<&2, String>}
  InspectingModules{route: T.RustRoute, return_to: ReturnTo}
  ScanningChild{remaining: List<&2, String>, found_rev: List<&2, String>,
    crate_path: String, modules: List<&2, T.OrderedField<String>>, depth: Nat, return_to: ReturnTo}
type State is Data:
  State{
    input: T.ResolverInput,
    preparation: Preparation.Preparation,
    capture: T.CaptureToken,
    bytes: Nat,
    pending: List<&2, T.RustTask>,
    active_path: String,
    stage: Stage
  }
type Step is Data:
  ContinueTask{state: State}
  TaskRequest{state: State, operation: T.Operation}
  TaskFinished{action: Preparation.Action}
  TaskFailed{failure: T.TechnicalFailure}

def stage(state: State, stage: Stage) -> State:
  match state:
    case State{input, preparation, capture, bytes, pending, active_path, _}:
      State{input, preparation, capture, bytes, pending, active_path, stage}

def input_path(input: T.ResolverInput) -> String:
  match input:
    case T.ResolverInput{_, path, _, _, _, _, _, _, _}: path

def root_capture(input: T.ResolverInput) -> T.CaptureToken:
  match input:
    case T.ResolverInput{_, _, capture, _, _, _, _, _, _}: capture

def limits(input: T.ResolverInput) -> G.Limits:
  match input:
    case T.ResolverInput{_, _, _, _, _, _, _, _, limits}: limits

def file_limit(limits: G.Limits) -> Nat:
  match limits:
    case G.Limits{_, _, _, files, _, _, _, _}: files

def depth_limit(limits: G.Limits) -> Nat:
  match limits:
    case G.Limits{_, _, _, _, _, _, depth, _}: depth

def finish(state: State, tasks: List<&2, T.RustTask>) -> Step:
  match state:
    case State{_, preparation, _, bytes, pending, active_path, _}:
      TaskFinished{
        Preparation.after_task(preparation, List.append(&2, T.RustTask, pending, tasks), bytes)
      }

def invalid(state: State) -> State:
  match state:
    case State{input, preparation, capture, bytes, pending, active_path, stage}:
      State{input, Preparation.invalid(preparation), capture, bytes, pending, active_path, stage}

def followed(state: State, return_to: ReturnTo, tasks: List<&2, T.RustTask>) -> Step:
  match state return_to:
    case _ CapturedRoute{}: finish(state, tasks)
    case State{input, preparation, capture, bytes, pending, active_path, _} CargoCandidates{
      remaining
    }:
      ContinueTask{State{input, preparation, capture, bytes,
        List.append(&2, T.RustTask, pending, tasks), active_path, ProcessingCrates{remaining}}}

def start_follow(allowed: Bool, +state: State, +route: T.RustRoute,
    +return_to: ReturnTo, capture: T.CaptureToken) -> Step:
  match allowed:
    case False{}: followed(invalid(state), return_to, [])
    case True{}: TaskRequest{
      stage(state, InspectingModules{route, return_to}),
      T.InspectRustModules{capture}
    }

def follow(
  +state: State,
  +route: T.RustRoute,
  return_to: ReturnTo,
  capture: T.CaptureToken
) -> Step:
  match state:
    case State{input, _, _, _, _, active_path, _}:
      start_follow(
        Module.within_depth(route, depth_limit(limits(input))),
        state,
        route,
        return_to,
        capture
      )

def start_route(+state: State, route: Maybe<&2, T.RustRoute>, capture: T.CaptureToken) -> Step:
  match route:
    case None{}: TaskRequest{stage(state, ParsingCargo{}), T.ParseCargo{capture}}
    case Some{route}: follow(state, route, CapturedRoute{}, capture)

def begin(input: T.ResolverInput, preparation: Preparation.Preparation,
    task: T.RustTask, +capture: T.CaptureToken, bytes: Nat) -> Step:
  match task:
    case T.RustTask{active_path, route}: start_route(
      State{input, preparation, capture, bytes, [], active_path, ParsingCargo{}},
      route,
      capture
    )

def unique_normalized(~normalize: String -> String, items: List<&2, String>,
    +seen: List<&2, String>) -> List<&2, String>:
  match items:
    case []: seen
    case path <> tail:
      +path = normalize(path)
      unique_normalized(
        ~normalize,
        tail,
        Bool.pick(
          List<&2, String>,
          Preparation.contains(seen, path),
          seen,
          List.append(&2, String, seen, [path])
        )
      )

def cargo_roots(
  ~normalize: String -> String,
  state: State,
  roots: Maybe<&2, List<&2, String>>
) -> Step:
  match roots:
    case None{}: finish(invalid(state), [])
    case Some{roots}: ContinueTask{
      stage(state, ScanningCargo{unique_normalized(~normalize, roots, []), []})
    }

def is_file(status: T.FileStatus) -> Bool:
  match status:
    case T.ExistingFile{}: True{}
    case _: False{}

def found(file: Bool, path: String, found_rev: List<&2, String>) -> List<&2, String>:
  match file:
    case True{}: path <> found_rev
    case False{}: found_rev

def append_pending(state: State, task: T.RustTask, remaining: List<&2, String>) -> Step:
  match state:
    case State{input, preparation, capture, bytes, pending, active_path, _}:
      ContinueTask{State{input, preparation, capture, bytes,
        List.append(&2, T.RustTask, pending, [task]), active_path, ProcessingCrates{remaining}}}

def state_input(state: State) -> T.ResolverInput:
  match state:
    case State{input, _, _, _, _, active_path, _}: input

def crate_candidate(root: Bool, included: Bool, +state: State, +path: String,
    remaining: List<&2, String>) -> Step:
  match root included:
    case True{} _:
      follow(
        state,
        T.RustRoute{path, path, None{}, 0n},
        CargoCandidates{remaining},
        root_capture(state_input(state))
      )
    case False{} True{}:
      append_pending(state, T.RustTask{path, Some{T.RustRoute{path, path, None{}, 0n}}}, remaining)
    case False{} False{}: ContinueTask{stage(state, ProcessingCrates{remaining})}

def process_crates(
  ~absolute: String -> Bool,
  ~dirname: String -> String,
  ~relative: String -> String -> String,
  +state: State,
  paths: List<&2, String>,
  separator: String
) -> Step:
  match paths:
    case []: finish(state, [])
    case +path <> tail:
      +selected = input_path(state_input(state))
      crate_candidate(
        String.eq(path, selected),
        Cargo.within(~absolute, relative(dirname(path), selected), separator),
        state,
        path,
        tail
      )

def chosen(+state: State, choice: Module.Chosen, return_to: ReturnTo) -> Step:
  match choice:
    case Module.AmbiguousChild{}: followed(invalid(state), return_to, [])
    case Module.PendingChild{task}: followed(state, return_to, [task])
    case Module.ReinspectRoot{route}: follow(
      state,
      route,
      return_to,
      root_capture(state_input(state))
    )

def module_plan(state: State, plan: Module.FollowPlan, return_to: ReturnTo) -> Step:
  match state plan:
    case _ Module.UnsupportedRoute{}: followed(invalid(state), return_to, [])
    case _ Module.MissingChild{}: followed(state, return_to, [])
    case State{input, prep, capture, bytes, pending, active_path, stage} Module.RootRole{role}:
      followed(
        State{input, Preparation.add_role(prep, role), capture, bytes, pending, active_path, stage},
        return_to,
        []
      )
    case _ Module.FindChild{choices, crate_path, modules, depth}:
      ContinueTask{stage(state, ScanningChild{choices, [], crate_path, modules, depth, return_to})}

def advance(~absolute: String -> Bool, ~dirname: String -> String,
    ~relative: String -> String -> String, +state: State, +separator: String) -> Step:
  match state:
    case State{_, _, _, _, _, active_path, ScanningCargo{[], found_rev}}:
      ContinueTask{stage(state, ProcessingCrates{List.reverse(&2, String, found_rev)})}
    case State{_, _, _, _, _, active_path, ScanningCargo{+path <> tail, found_rev}}:
      Bool.pick(
        Step,
        Cargo.within(~absolute, path, separator),
        TaskRequest{state, T.ReadFileStatus{path}},
        ContinueTask{stage(state, ScanningCargo{tail, found_rev})}
      )
    case State{_, _, _, _, _, active_path, ProcessingCrates{paths}}:
      process_crates(~absolute, ~dirname, ~relative, state, paths, separator)
    case State{
      input,
      _,
      _,
      _,
      _,
      active_path,
      ScanningChild{[], found_rev, crate_path, modules, depth, return_to}
    }:
      chosen(
        state,
        Module.choose(
          List.reverse(&2, String, found_rev),
          input_path(input),
          crate_path,
          modules,
          depth
        ),
        return_to
      )
    case State{
      _,
      _,
      _,
      _,
      _,
      active_path,
      ScanningChild{+path <> tail, found_rev, crate_path, modules, depth, return_to}
    }:
      Bool.pick(
        Step,
        Cargo.within(~absolute, path, separator),
        TaskRequest{state, T.ReadFileStatus{path}},
        ContinueTask{
          stage(state, ScanningChild{tail, found_rev, crate_path, modules, depth, return_to})
        }
      )
    case _: TaskFailed{T.WrongReplyKind{}}

def task_path(state: State) -> String:
  match state:
    case State{_, _, _, _, _, path, _}: path

def reply(
  ~absolute: String -> Bool,
  ~dirname: String -> String,
  ~basename: String -> Maybe<&2, String> -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  ~extension: String -> String,
  ~normalize: String -> String,
  +state: State,
  outcome: T.ServiceOutcome,
  +separator: String
) -> Step:
  match state outcome:
    case _ T.ProviderRejected{exception}: TaskFailed{T.ForeignProviderFailure{exception}}
    case State{_, _, _, _, _, active_path, ParsingCargo{}} T.CargoResult{T.CargoUnsupported{}}:
      finish(invalid(state), [])
    case State{input, _, _, _, _, active_path, ParsingCargo{}} T.CargoResult{
      T.CargoInspected{syntax}
    }:
      cargo_roots(~normalize, state, Cargo.roots(~absolute, ~dirname, ~join, ~relative, ~extension,
        syntax, task_path(state), input_path(input), separator, file_limit(limits(input))))
    case State{_, _, _, _, _, active_path, ScanningCargo{path <> tail, found_rev}} T.StatusResult{
      status
    }:
      ContinueTask{stage(state, ScanningCargo{tail, found(is_file(status), path, found_rev)})}
    case State{input, _, _, _, _, active_path, InspectingModules{route, return_to}} T.RustModulesResult{
      outcome
    }:
      module_plan(state, Module.inspected(~absolute, ~dirname, ~basename, ~join, ~relative,
        route, input_path(input), outcome, separator), return_to)
    case State{
      _,
      _,
      _,
      _,
      _,
      active_path,
      ScanningChild{path <> tail, found_rev, crate_path, modules, depth, return_to}
    } T.StatusResult{status}:
      ContinueTask{
        stage(
          state,
          ScanningChild{
            tail,
            found(is_file(status), path, found_rev),
            crate_path,
            modules,
            depth,
            return_to
          }
        )
      }
    case _ _: TaskFailed{T.WrongReplyKind{}}

def main() -> Unit:
  Unit{}
