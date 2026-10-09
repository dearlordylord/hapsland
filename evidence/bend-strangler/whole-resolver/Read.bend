import Base
import ./Types.bend as T
import ./State.bend as S
import ./Loop.bend as Loop
import ./Resolve.bend as Resolve
import ./Core.bend as Materialize
import ../local-graph-draft/core.bend as Local
import ../../../packages/agent-flow-bend/ImportGraph.bend as Graph

# A second access gate precedes cache admission, lookup and capture. Cache
# writes survive subsequent source, traversal and graph admission refusal.
def failed_frame(frame: Maybe<&2, T.ResolverFrame>, state: T.ResolverState) -> Loop.Continuation:
  match frame:
    case None{}: Resolve.malformed()
    case Some{frame}: Resolve.progressed(False{}, state, S.advance(frame, Graph.CaptureFailed{}))

def failed(+state: T.ResolverState) -> Loop.Continuation:
  failed_frame(S.state_frame(state), state)

def diagnostic(diagnostic: T.CaptureDiagnostic, +state: T.ResolverState) -> Loop.Continuation:
  Loop.ServiceStep{S.request(state, T.EmittingCaptureDiagnostic{},
    T.ObserveDiagnostic{S.scratch_capture_path(S.state_scratch(state)), diagnostic})}

def source_cap(frame: Maybe<&2, T.ResolverFrame>) -> Nat:
  match frame:
    case None{}: 0n
    case Some{frame}: Graph.source_cap(S.frame_limits(frame))

def capture(selection: Maybe<&2, T.SelectionToken>, +state: T.ResolverState) -> Loop.Continuation:
  match selection:
    case None{}: Resolve.malformed()
    case Some{selection}: Loop.ServiceStep{S.request(state, T.CapturingTarget{},
      T.CaptureSource{selection, source_cap(S.state_frame(state))})}

def capture_now(+state: T.ResolverState) -> Loop.Continuation:
  capture(S.scratch_selection(S.state_scratch(state)), state)

def inspect(language: Maybe<&2, T.Language>, capture: Maybe<&2, T.CaptureToken>,
    +state: T.ResolverState) -> Loop.Continuation:
  match language capture:
    case Some{T.TypeScriptLanguage{}} Some{capture}: Loop.ServiceStep{
      S.request(
        state,
        T.InspectingTarget{},
        T.InspectSource{
          S.scratch_capture_path(S.state_scratch(state)),
          capture,
          T.TypeScriptContext{S.input_branch(S.state_input(state))}
        }
      )
    }
    case Some{T.BendLanguage{}} Some{capture}: Loop.ServiceStep{
      S.request(
        state,
        T.InspectingTarget{},
        T.InspectSource{
          S.scratch_capture_path(S.state_scratch(state)),
          capture,
          T.BendSourceContext{S.input_branch(S.state_input(state))}
        }
      )
    }
    case Some{T.RustLanguage{}} Some{_}: Loop.PrepareImportedRust{state}
    case _ _: Resolve.malformed()

def captured_size(
  allowed: Bool,
  frame: Maybe<&2, T.ResolverFrame>,
  +state: T.ResolverState
) -> Loop.Continuation:
  match allowed frame:
    case True{} _: inspect(
      S.state_language(state),
      S.scratch_capture(S.state_scratch(state)),
      state
    )
    case False{} Some{frame}: Resolve.progressed(False{}, state, S.advance(frame,
      Graph.Captured{S.scratch_source_bytes(S.state_scratch(state)), 0n, 0n, []}))
    case False{} None{}: Resolve.malformed()

def inspect_capture(+state: T.ResolverState) -> Loop.Continuation:
  captured_size(
    Nat.is_le(S.scratch_source_bytes(S.state_scratch(state)), source_cap(S.state_frame(state))),
    S.state_frame(state),
    state
  )

def cache_lookup(outcome: T.CacheOutcome, +state: T.ResolverState) -> Loop.Continuation:
  match outcome:
    case T.CacheAbsent{}: capture_now(state)
    case T.CachePresent{capture, bytes}: inspect_capture(
      S.with_state_scratch(
        state,
        S.with_scratch_source_bytes(
          S.with_scratch_capture(S.state_scratch(state), Some{capture}),
          bytes
        )
      )
    )

def lookup(cache: Maybe<&2, T.CacheToken>, +state: T.ResolverState) -> Loop.Continuation:
  match cache:
    case None{}: capture_now(state)
    case Some{cache}: Loop.ServiceStep{S.request(state, T.LookingUpCapture{},
      T.LookupCaptureCache{cache, S.scratch_capture_path(S.state_scratch(state))})}

def cache_has(entries: List<&2, T.CaptureBytes>, +path: String) -> Bool:
  match entries:
    case []: False{}
    case T.CaptureBytes{key, _} <> tail: Bool.or(String.eq(key, path), cache_has(tail, path))

def cache_bytes(entries: List<&2, T.CaptureBytes>) -> Nat:
  match entries:
    case []: 0n
    case T.CaptureBytes{_, bytes} <> tail: (bytes + cache_bytes(tail) : Nat)

# The observation cache owns independent aggregate limits, not Graph.Limits.
# requestedBytes defaults to the original source ceiling, even for a tighter unit.
def bytes_refusal_for(+used: Nat, +requested: Nat) -> Maybe<&2, T.CaptureDiagnostic>:
  Bool.pick(Maybe<&2, T.CaptureDiagnostic>, Nat.is_gt((used + requested : Nat), 16777216n),
    Some{T.CaptureBudgetDiagnostic{"bytes", used, requested, 16777216n}}, None{})

def files_refusal_for(
  +entries: List<&2, T.CaptureBytes>,
  requested: Nat
) -> Maybe<&2, T.CaptureDiagnostic>:
  yes : Unit -> Maybe<&2, T.CaptureDiagnostic> = _ => Some{T.CaptureBudgetDiagnostic{
    "files", List.length(&2, T.CaptureBytes, entries), 1n, 64n}}
  no : Unit -> Maybe<&2, T.CaptureDiagnostic> = _ => bytes_refusal_for(
    cache_bytes(entries),
    requested
  )
  Materialize.decide(
    Maybe<&2, T.CaptureDiagnostic>,
    Nat.is_ge(List.length(&2, T.CaptureBytes, entries), 64n),
    yes,
    no
  )

def cache_refusal_for(
  +entries: List<&2, T.CaptureBytes>,
  path: String, requested: Nat
) -> Maybe<&2, T.CaptureDiagnostic>:
  yes : Unit -> Maybe<&2, T.CaptureDiagnostic> = _ => None{}
  no : Unit -> Maybe<&2, T.CaptureDiagnostic> = _ => files_refusal_for(entries, requested)
  Materialize.decide(Maybe<&2, T.CaptureDiagnostic>, cache_has(entries, path), yes, no)

def cache_refusal(
  entries: List<&2, T.CaptureBytes>,
  path: String
) -> Maybe<&2, T.CaptureDiagnostic>:
  cache_refusal_for(entries, path, 2097152n)

def admitted(refusal: Maybe<&2, T.CaptureDiagnostic>, +state: T.ResolverState) -> Loop.Continuation:
  match refusal:
    case Some{value}: diagnostic(value, state)
    case None{}: lookup(S.input_caller_cache(S.state_input(state)), state)

def snapshot(+entries: List<&2, T.CaptureBytes>, +state: T.ResolverState) -> Loop.Continuation:
  admitted(cache_refusal(entries, S.scratch_capture_path(S.state_scratch(state))), state)

def observe_cache(cache: Maybe<&2, T.CacheToken>, state: T.ResolverState) -> Loop.Continuation:
  match cache:
    case None{}: capture_now(state)
    case Some{cache}: Loop.ServiceStep{
      S.request(state, T.CheckingObservationCache{}, T.SnapshotCaptureCache{cache})
    }

def accessed(outcome: T.AccessOutcome, +state: T.ResolverState) -> Loop.Continuation:
  match outcome:
    case T.AccessDenied{}: failed(state)
    case T.AccessAllowed{selection, path}: observe_cache(S.input_caller_cache(S.state_input(state)),
      S.with_state_scratch(state, S.with_scratch_capture_path(
        S.with_scratch_selection(S.state_scratch(state), Some{selection}), path)))

def store(
  cache: Maybe<&2, T.CacheToken>,
  +capture: T.CaptureToken,
  +state: T.ResolverState
) -> Loop.Continuation:
  match cache:
    case None{}: inspect_capture(state)
    case Some{cache}: Loop.ServiceStep{S.request(state, T.StoringTargetCapture{},
      T.StoreCaptureCache{cache, S.scratch_capture_path(S.state_scratch(state)), capture})}

def captured(outcome: T.CaptureOutcome, +state: T.ResolverState) -> Loop.Continuation:
  match outcome:
    case T.CaptureUnavailable{value}: diagnostic(value, state)
    case T.SourceCaptured{+capture, _, bytes}: store(
      S.input_caller_cache(S.state_input(state)), capture,
      S.with_state_scratch(state, S.with_scratch_source_bytes(
        S.with_scratch_capture(S.state_scratch(state), Some{capture}), bytes)))

def inspected(outcome: T.SourceOutcome, state: T.ResolverState) -> Loop.Continuation:
  match outcome:
    case T.SourceUnsupported{}: failed(state)
    case T.SourceInspected{facts}: Loop.InspectCaptured{state, facts}

def target(target: Maybe<&2, T.Target>, +state: T.ResolverState) -> Loop.Continuation:
  match target:
    case None{}: Resolve.invalid(state)
    case Some{T.BundledTarget{declaration, facts, edge}}: Loop.ReadBundled{
      state,
      declaration,
      facts,
      edge
    }
    case Some{T.FileTarget{path, _, _}}: Loop.ServiceStep{
      S.request(state, T.RecheckingTargetPath{}, T.AccessPath{path})
    }

def begin_frame(
  frame: Maybe<&2, T.ResolverFrame>,
  +id: Nat,
  +state: T.ResolverState
) -> Loop.Continuation:
  match frame:
    case None{}: Resolve.malformed()
    case Some{frame}: target(Local.map_result(Maybe<&2, T.Target>,
      Map.get(Maybe<&2, T.Target>, None{}, S.frame_target_paths(frame), Nat.show(id))),
      S.with_state_scratch(state, S.with_scratch_active_target(S.state_scratch(state), Some{id})))

def begin(+state: T.ResolverState, id: Nat) -> Loop.Continuation:
  begin_frame(S.state_frame(state), id, state)

def reply(
  stage: T.ResolverStage,
  outcome: T.ServiceOutcome,
  +state: T.ResolverState
) -> Loop.Continuation:
  match stage outcome:
    case T.RecheckingTargetPath{} T.AccessResult{outcome}: accessed(outcome, state)
    case T.CheckingObservationCache{} T.CacheSnapshot{entries}: snapshot(entries, state)
    case T.LookingUpCapture{} T.CacheResult{outcome}: cache_lookup(outcome, state)
    case T.CapturingTarget{} T.CaptureResult{outcome}: captured(outcome, state)
    case T.StoringTargetCapture{} T.CacheStored{}: inspect_capture(state)
    case T.InspectingTarget{} T.FrontendResult{outcome}: inspected(outcome, state)
    case T.EmittingCaptureDiagnostic{} T.DiagnosticObserved{}: failed(state)
    case _ _: Resolve.reply(stage, outcome, state)

def main() -> Unit:
  Unit{}
