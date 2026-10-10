import Base
import ./Types.bend as T
import ./State.bend as S
import ./Loop.bend as Loop
import ./Failure.bend as ResolveOwner
import ./RustFollow.bend as Follow
import ./Core.bend as Materialize

# Rebase the prepared crate map for each supporting source, exactly as the
# language adapter did. The single-source frontend receives no path policy.
def inspect(capture: Maybe<&2, T.CaptureToken>, context: T.RustContext,
    +state: T.ResolverState) -> Loop.Continuation:
  match capture:
    case None{}: ResolveOwner.malformed()
    case Some{capture}: Loop.ServiceStep{
      S.request(
        state,
        T.InspectingTarget{},
        T.InspectSource{
          S.scratch_capture_path(S.state_scratch(state)),
          capture,
          T.RustSourceContext{S.input_branch(S.state_input(state)), context}
        }
      )
    }

def external(
  value: Maybe<&2, List<&2, T.OrderedField<String>>>,
  +state: T.ResolverState
) -> Loop.Continuation:
  inspect(
    S.scratch_capture(S.state_scratch(state)),
    T.RustContext{None{}, Some{True{}}, value},
    state
  )

def next(fields: List<&2, T.OrderedField<String>>, +state: T.ResolverState) -> Loop.Continuation:
  match fields:
    case []: external(
      Some{List.reverse(&2, T.OrderedField<String>, S.work_rebased_rev(S.state_rust_work(state)))},
      state
    )
    case T.OrderedField{name, path} <> tail: Loop.ServiceStep{
      S.request(
        S.with_state_rust_work(
          S.with_state_scratch(state, S.with_scratch_resolved_path(S.state_scratch(state), name)),
          S.with_work_remaining_map(S.state_rust_work(state), tail)
        ),
        T.ImportedRustMapJoin{},
        T.PathJoin{[S.work_map_base(S.state_rust_work(state)), path]}
      )
    }

def mapped(context: T.RustContext, state: T.ResolverState) -> Loop.Continuation:
  match context:
    case T.RustContext{_, _, None{}}: external(None{}, state)
    case T.RustContext{_, _, Some{fields}}: next(fields, state)

def source_directory(path: String, +state: T.ResolverState) -> Loop.Continuation:
  mapped(
    S.state_frontend(state),
    S.with_state_scratch(state, S.with_scratch_directory(S.state_scratch(state), path))
  )

def begin(+state: T.ResolverState) -> Loop.Continuation:
  yes : Unit -> Loop.Continuation = _ => inspect(
    S.scratch_capture(S.state_scratch(state)),
    S.state_frontend(state),
    state
  )
  no : Unit -> Loop.Continuation = _ => Loop.ServiceStep{
    S.request(
      state,
      T.ImportedRustRootDir{},
      T.PathDirname{S.input_root_path(S.state_input(state))}
    )
  }
  Materialize.decide(
    Loop.Continuation,
    String.eq(
      S.scratch_capture_path(S.state_scratch(state)),
      S.input_root_path(S.state_input(state))
    ),
    yes,
    no
  )

def relative(+path: String, +state: T.ResolverState) -> Loop.Continuation:
  next(
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

def reply(
  stage: T.ResolverStage,
  outcome: T.ServiceOutcome,
  +state: T.ResolverState
) -> Loop.Continuation:
  match stage outcome:
    case T.ImportedRustRootDir{} T.DirnameResult{path}: Loop.ServiceStep{
      S.request(
        S.with_state_rust_work(
          state,
          S.with_work_map_base(S.with_work_rebased_rev(S.state_rust_work(state), []), path)
        ),
        T.ImportedRustTargetDir{},
        T.PathDirname{S.scratch_capture_path(S.state_scratch(state))}
      )
    }
    case T.ImportedRustTargetDir{} T.DirnameResult{path}: source_directory(path, state)
    case T.ImportedRustMapJoin{} T.JoinedResult{path}: Loop.ServiceStep{
      S.request(
        state,
        T.ImportedRustMapRelative{},
        T.PathRelative{S.scratch_directory(S.state_scratch(state)), path}
      )
    }
    case T.ImportedRustMapRelative{} T.RelativeResult{path}: relative(path, state)
    case _ _: Follow.reply(stage, outcome, state)

def main() -> Unit:
  Unit{}
