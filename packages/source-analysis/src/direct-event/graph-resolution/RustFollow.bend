import Base
import ./Types.bend as T
import ./State.bend as S
import ./Loop.bend as Loop
import ./Resolve.bend as Resolve
import ./RustMachine.bend as Rust
import ./RustStorage.bend as Storage
import ./RustCargo.bend as Cargo
import ./Core.bend as Materialize
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

def route_value(value: Maybe<&2, T.RustRoute>) -> T.RustRoute:
  match value:
    case Some{route}: route
    case None{}: T.RustRoute{"", "", None{}, 0n}

def get(state: T.ResolverState) -> T.RustRoute:
  route_value(S.scratch_working_route(S.state_scratch(state)))

def set(+state: T.ResolverState, route: T.RustRoute) -> T.ResolverState:
  S.with_state_scratch(state, S.with_scratch_working_route(S.state_scratch(state), Some{route}))

def return_tasks(
  mode: T.RustFollowReturn,
  tasks: List<&2, T.RustTask>,
  +state: T.ResolverState
) -> Loop.Continuation:
  match mode:
    case T.CapturedTaskReturn{}: Loop.RustTasks{state, tasks}
    case T.CargoRootsReturn{}: Loop.RustCargoContinue{
      S.with_state_rust_work(
        state,
        S.with_work_tasks_out(
          S.state_rust_work(state),
          List.append(&2, T.RustTask, S.work_tasks_out(S.state_rust_work(state)), tasks)
        )
      )
    }

def done(+state: T.ResolverState, tasks: List<&2, T.RustTask>) -> Loop.Continuation:
  return_tasks(S.work_follow_return(S.state_rust_work(state)), tasks, state)

def invalid(+state: T.ResolverState) -> Loop.Continuation:
  done(Rust.set(state, S.with_rust_invalid(Rust.get(state), True{})), [])

def begin(state: T.ResolverState, route: T.RustRoute, capture: T.CaptureToken) -> Loop.Continuation:
  Storage.inspect_route(route, capture, state)

def role_modules(role: Bool, fields: List<&2, T.OrderedField<String>>) -> T.RustContext:
  match role:
    case True{}: T.RustContext{Some{True{}}, None{}, Some{fields}}
    case False{}: T.RustContext{None{}, Some{True{}}, Some{fields}}

def role_done(+state: T.ResolverState) -> Loop.Continuation:
  +machine = Rust.get(state)
  context = role_modules(
    S.work_role_root(S.state_rust_work(state)),
    List.reverse(&2, T.OrderedField<String>, S.work_rebased_rev(S.state_rust_work(state)))
  )
  done(
    Rust.set(
      state,
      S.with_rust_roles(machine, List.append(&2, T.RustContext, S.rust_roles(machine), [context]))
    ),
    []
  )

def rebase_next(
  fields: List<&2, T.OrderedField<String>>,
  +state: T.ResolverState
) -> Loop.Continuation:
  match fields:
    case []: role_done(state)
    case T.OrderedField{+name, path} <> tail: Loop.ServiceStep{
      S.request(
        S.with_state_rust_work(
          S.with_state_scratch(state, S.with_scratch_resolved_path(S.state_scratch(state), name)),
          S.with_work_remaining_map(S.state_rust_work(state), tail)
        ),
        T.RustRoleRelative{},
        T.PathRelative{S.work_map_base(S.state_rust_work(state)), path}
      )
    }

def route_map(
  value: Maybe<&2, List<&2, T.OrderedField<String>>>
) -> List<&2, T.OrderedField<String>>:
  match value:
    case None{}: []
    case Some{fields}: fields

def role_base(+path: String, +state: T.ResolverState) -> Loop.Continuation:
  rebase_next(route_map(S.route_modules(get(state))), S.with_state_rust_work(state,
    S.with_work_map_base(S.with_work_rebased_rev(S.state_rust_work(state), []), path)))

def role_relative(+path: String, +state: T.ResolverState) -> Loop.Continuation:
  rebase_next(
    S.work_remaining_map(S.state_rust_work(state)),
    S.with_state_rust_work(
      state,
      S.with_work_rebased_rev(
        S.state_rust_work(state),
        T.OrderedField{
          S.scratch_resolved_path(S.state_scratch(state)),
          Bool.pick(String, String.is_empty(path), ".", path)
        } <> S.work_rebased_rev(S.state_rust_work(state))
      )
    )
  )

def role_start(+state: T.ResolverState) -> Loop.Continuation:
  Loop.ServiceStep{
    S.request(
      S.with_state_rust_work(
        state,
        S.with_work_role_root(
          S.state_rust_work(state),
          String.eq(S.route_path(get(state)), S.route_crate_path(get(state)))
        )
      ),
      T.RustRoleDir{},
      T.PathDirname{S.input_root_path(S.state_input(state))}
    )
  }

def module_base(+path: String, +state: T.ResolverState) -> Loop.Continuation:
  Loop.ServiceStep{
    S.request(
      S.with_state_scratch(state, S.with_scratch_directory(S.state_scratch(state), path)),
      T.RustModuleRelative{},
      T.PathRelative{path, S.input_root_path(S.state_input(state))}
    )
  }

def module_directory(+path: String, +state: T.ResolverState) -> Loop.Continuation:
  yes : Unit -> Loop.Continuation = _ => module_base(path, state)
  no : Unit -> Loop.Continuation = _ => Loop.ServiceStep{
    S.request(
      S.with_state_scratch(state, S.with_scratch_directory(S.state_scratch(state), path)),
      T.RustModuleBasename{},
      T.PathBasename{S.route_path(get(state)), None{}}
    )
  }
  Materialize.decide(
    Loop.Continuation,
    String.eq(S.route_path(get(state)), S.route_crate_path(get(state))),
    yes,
    no
  )

def basename(name: String, +state: T.ResolverState) -> Loop.Continuation:
  yes : Unit -> Loop.Continuation = _ => module_base(
    S.scratch_directory(S.state_scratch(state)),
    state
  )
  no : Unit -> Loop.Continuation = _ => Loop.ServiceStep{
    S.request(state, T.RustModuleStem{}, T.PathBasename{S.route_path(get(state)), Some{".rs"}})
  }
  Materialize.decide(Loop.Continuation, String.eq(name, "mod.rs"), yes, no)

def map_done(+state: T.ResolverState) -> Loop.Continuation:
  yes : Unit -> Loop.Continuation = _ => role_start(state)
  no : Unit -> Loop.Continuation = _ => Loop.ServiceStep{
    S.request(state, T.RustModuleDirectoryBase{}, T.PathDirname{S.route_path(get(state))})
  }
  Materialize.decide(
    Loop.Continuation,
    String.eq(S.route_path(get(state)), S.input_root_path(S.state_input(state))),
    yes,
    no
  )

def map_names(names: List<&2, String>, +state: T.ResolverState) -> Loop.Continuation:
  match names:
    case []: map_done(
      set(
        state,
        S.with_route_modules(
          get(state),
          Some{
            List.reverse(&2, T.OrderedField<String>, S.work_rebased_rev(S.state_rust_work(state)))
          }
        )
      )
    )
    case +name <> tail: Loop.ServiceStep{
      S.request(
        S.with_state_scratch(
          state,
          S.with_scratch_resolved_path(S.with_scratch_paths(S.state_scratch(state), tail), name)
        ),
        T.RustMapModuleJoin{},
        T.PathJoin{[S.work_map_base(S.state_rust_work(state)), name]}
      )
    }

def crate_directory(+path: String, +state: T.ResolverState) -> Loop.Continuation:
  map_names(
    Cargo.unique(S.scratch_module_names(S.state_scratch(state)), []),
    S.with_state_rust_work(
      state,
      S.with_work_map_base(S.with_work_rebased_rev(S.state_rust_work(state), []), path)
    )
  )

def modules_map(
  value: Maybe<&2, List<&2, T.OrderedField<String>>>,
  +state: T.ResolverState
) -> Loop.Continuation:
  match value:
    case Some{_}: map_done(state)
    case None{}: Loop.ServiceStep{
      S.request(state, T.RustMapCrateDirectory{}, T.PathDirname{S.route_crate_path(get(state))})
    }

def modules(+state: T.ResolverState, names: List<&2, String>) -> Loop.Continuation:
  modules_map(
    S.route_modules(get(state)),
    S.with_state_scratch(state, S.with_scratch_module_names(S.state_scratch(state), names))
  )

def module_name(+tail: String, state: T.ResolverState) -> String:
  +first = Cargo.first_segment(tail, S.state_separator(state))
  Bool.pick(
    String,
    String.ends_with(first, ".rs"),
    String.take(first, Nat.sub(String.length(first), 3n)),
    first
  )

def selected_module(allowed: Bool, +name: String, +state: T.ResolverState) -> Loop.Continuation:
  match allowed:
    case False{}: done(state, [])
    case True{}: Loop.ServiceStep{
      S.request(
        S.with_state_scratch(state, S.with_scratch_module_names(S.state_scratch(state), [name])),
        T.RustModuleChoiceJoinFile{},
        T.PathJoin{[S.scratch_directory(S.state_scratch(state)), String.append(name, ".rs")]}
      )
    }

def relative_absolute(absolute: Bool, +state: T.ResolverState) -> Loop.Continuation:
  +tail = S.work_relative_selected(S.state_rust_work(state))
  +name = module_name(tail, state)
  selected_module(
    Bool.and(
      Bool.not(absolute),
      Bool.and(
        Bool.not(Resolve.outside(tail, S.state_separator(state))),
        Rust.member(S.scratch_module_names(S.state_scratch(state)), name)
      )
    ),
    name,
    state
  )

def first_name(names: List<&2, String>) -> String:
  match names:
    case []: ""
    case head <> _: head

def selected_path(+path: String, +state: T.ResolverState) -> Loop.Continuation:
  +route = get(state)
  +child : T.RustRoute = T.RustRoute{
    path,
    S.route_crate_path(route),
    S.route_modules(route),
    (S.route_depth(route) + 1n : Nat)
  }
  yes : Unit -> Loop.Continuation = _ => Loop.RustFollow{
    state,
    child,
    S.input_root_capture(S.state_input(state))
  }
  no : Unit -> Loop.Continuation = _ => done(state, [T.RustTask{path, Some{child}}])
  Materialize.decide(
    Loop.Continuation,
    String.eq(path, S.input_root_path(S.state_input(state))),
    yes,
    no
  )

def selected(paths: List<&2, String>, state: T.ResolverState) -> Loop.Continuation:
  match paths:
    case path <> []: selected_path(path, state)
    case _: invalid(state)

def next_choice(paths: List<&2, String>, +state: T.ResolverState) -> Loop.Continuation:
  match paths:
    case []: selected(
      List.reverse(&2, String, S.scratch_found_paths(S.state_scratch(state))),
      state
    )
    case +path <> tail: Loop.ServiceStep{
      S.request(
        S.with_state_scratch(
          state,
          S.with_scratch_resolved_path(S.with_scratch_paths(S.state_scratch(state), tail), path)
        ),
        T.RustModuleChoiceAbsolute{},
        T.PathIsAbsolute{path}
      )
    }

def choice_absolute(absolute: Bool, +state: T.ResolverState) -> Loop.Continuation:
  yes : Unit -> Loop.Continuation = _ => next_choice(S.scratch_paths(S.state_scratch(state)), state)
  no : Unit -> Loop.Continuation = _ => Loop.ServiceStep{
    S.request(
      state,
      T.RustModuleChoiceStat{},
      T.ReadFileStatus{S.scratch_resolved_path(S.state_scratch(state))}
    )
  }
  Materialize.decide(
    Loop.Continuation,
    Bool.or(
      absolute,
      Resolve.outside(S.scratch_resolved_path(S.state_scratch(state)), S.state_separator(state))
    ),
    yes,
    no
  )

def choice_status(status: T.FileStatus, +state: T.ResolverState) -> Loop.Continuation:
  match status:
    case T.ExistingFile{}: next_choice(
      S.scratch_paths(S.state_scratch(state)),
      S.with_state_scratch(
        state,
        S.with_scratch_found_paths(
          S.state_scratch(state),
          S.scratch_resolved_path(
            S.state_scratch(state)
          ) <> S.scratch_found_paths(S.state_scratch(state))
        )
      )
    )
    case _: next_choice(S.scratch_paths(S.state_scratch(state)), state)

def reply(
  stage: T.ResolverStage,
  outcome: T.ServiceOutcome,
  +state: T.ResolverState
) -> Loop.Continuation:
  match stage outcome:
    case T.RustMapCrateDirectory{} T.DirnameResult{path}: crate_directory(path, state)
    case T.RustMapModuleJoin{} T.JoinedResult{path}: map_names(
      S.scratch_paths(S.state_scratch(state)),
      S.with_state_rust_work(
        state,
        S.with_work_rebased_rev(
          S.state_rust_work(state),
          T.OrderedField{
            S.scratch_resolved_path(S.state_scratch(state)),
            path
          } <> S.work_rebased_rev(S.state_rust_work(state))
        )
      )
    )
    case T.RustRoleDir{} T.DirnameResult{path}: role_base(path, state)
    case T.RustRoleRelative{} T.RelativeResult{path}: role_relative(path, state)
    case T.RustModuleDirectoryBase{} T.DirnameResult{path}: module_directory(path, state)
    case T.RustModuleBasename{} T.BasenameResult{name}: basename(name, state)
    case T.RustModuleStem{} T.BasenameResult{name}: Loop.ServiceStep{
      S.request(
        state,
        T.RustModuleDirJoin{},
        T.PathJoin{[S.scratch_directory(S.state_scratch(state)), name]}
      )
    }
    case T.RustModuleDirJoin{} T.JoinedResult{path}: module_base(path, state)
    case T.RustModuleRelative{} T.RelativeResult{+path}: Loop.ServiceStep{
      S.request(
        S.with_state_rust_work(
          state,
          S.with_work_relative_selected(S.state_rust_work(state), path)
        ),
        T.RustModuleRelativeAbsolute{},
        T.PathIsAbsolute{path}
      )
    }
    case T.RustModuleRelativeAbsolute{} T.AbsoluteResult{absolute}: relative_absolute(
      absolute,
      state
    )
    case T.RustModuleChoiceJoinFile{} T.JoinedResult{+path}: Loop.ServiceStep{
      S.request(
        S.with_state_scratch(state, S.with_scratch_found_paths(S.state_scratch(state), [path])),
        T.RustModuleChoiceJoinDir{},
        T.PathJoin{
          [
            S.scratch_directory(S.state_scratch(state)),
            first_name(S.scratch_module_names(S.state_scratch(state))),
            "mod.rs"
          ]
        }
      )
    }
    case T.RustModuleChoiceJoinDir{} T.JoinedResult{path}: next_choice(
      List.append(&2, String, S.scratch_found_paths(S.state_scratch(state)), [path]),
      S.with_state_scratch(state, S.with_scratch_found_paths(S.state_scratch(state), []))
    )
    case T.RustModuleChoiceAbsolute{} T.AbsoluteResult{absolute}: choice_absolute(absolute, state)
    case T.RustModuleChoiceStat{} T.StatusResult{status}: choice_status(status, state)
    case _ _: Cargo.reply(stage, outcome, state)

def main() -> Unit:
  Unit{}
