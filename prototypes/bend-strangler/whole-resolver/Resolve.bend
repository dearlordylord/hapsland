import Base
import ./Types.bend as T
import ./State.bend as S
import ./Loop.bend as Loop
import ./Facts.bend as Facts
import ./Composition.bend as Compose
import ./Core.bend as Materialize
import ../local-graph-draft/core.bend as Local
import ../../../packages/agent-flow-bend/ImportGraph.bend as Graph

# Path mechanics are foreign effects. Candidate spelling, selection, target
# registration and graph decisions are owned here, including known cycles.
def malformed() -> Loop.Continuation:
  Loop.ServiceStep{T.FailedResolver{T.MalformedReply{}}}

def invalid(+state: T.ResolverState) -> Loop.Continuation:
  Loop.ServiceStep{T.FinishedResolver{T.NoReviewUnit{}, S.state_frame(state)}}

def import_path(edge: Local.Pending) -> String:
  match edge:
    case Local.Pending{_, _, _, _, _, _, _, target}:
      match target:
        case Local.Imported{path, _}: path
        case Local.BundledTarget{_}: ""

def from_path(edge: Local.Pending) -> String:
  match edge:
    case Local.Pending{_, _, from, _, _, _, _, _}: from

def outside(+path: String, separator: String) -> Bool:
  Bool.or(String.eq(path, ".."), String.starts_with(path, String.append("..", separator)))

def progressed(skip: Bool, state: T.ResolverState, frame: T.ResolverFrame) -> Loop.Continuation:
  Loop.after_command(skip, S.with_state_frame(state, Some{frame}))

def allocated(+frame: T.ResolverFrame, result: Graph.Resolution) -> T.ResolverFrame:
  S.advance(S.with_frame_next_target(frame, (S.frame_next_target(frame) + 1n : Nat)),
    Graph.Resolved{S.frame_next_target(frame), result})

def unsupported(frame: Maybe<&2, T.ResolverFrame>, state: T.ResolverState) -> Loop.Continuation:
  match frame:
    case None{}: malformed()
    case Some{frame}: progressed(True{}, state, allocated(frame, Graph.Unhandled{}))

def target_kind(expected: Local.ExpectedKind) -> String:
  match expected:
    case Local.FunctionKind{}: "function"
    case _: "type"

def target_key(path: String, edge: Local.Pending) -> String:
  match edge:
    case Local.Pending{_, _, _, _, name, _, expected, _}:
      String.concat([path, "\0", target_kind(expected), "\0", name])

def target_id(existing: Maybe<&2, Nat>, frame: T.ResolverFrame) -> Nat:
  match existing:
    case None{}: S.frame_next_target(frame)
    case Some{id}: id

def registered(existing: Maybe<&2, Nat>, +frame: T.ResolverFrame) -> T.ResolverFrame:
  match existing:
    case None{}: S.with_frame_next_target(frame, (S.frame_next_target(frame) + 1n : Nat))
    case Some{_}: frame

def replaced(
  slots: Maybe<&2, List<&2, Local.ReferenceSlot>>,
  frame: T.ResolverFrame
) -> Maybe<&2, T.ResolverFrame>:
  match slots:
    case None{}: None{}
    case Some{slots}: Some{S.with_frame_references(frame, slots)}

def include_identity(
  identity: Maybe<&2, String>,
  edge: Local.Pending,
  +frame: T.ResolverFrame
) -> Maybe<&2, T.ResolverFrame>:
  match identity:
    case None{}: Some{frame}
    case Some{identity}:
      match edge:
        case Local.Pending{owner, index, _, _, _, _, _, _}:
          replaced(Compose.replacement(Compose.replace_slot(S.frame_references(frame), owner, index,
            Local.Included{identity})), frame)

def include_known(
  command: Graph.Command,
  target: Nat,
  edge: Local.Pending,
  +frame: T.ResolverFrame
) -> Maybe<&2, T.ResolverFrame>:
  match command:
    case Graph.NoCommand{}: include_identity(
      Local.map_result(
        Maybe<&2, String>,
        Map.get(Maybe<&2, String>, None{}, S.frame_target_artifacts(frame), Nat.show(target))
      ),
      edge,
      frame
    )
    case _: Some{frame}

def selected_frame(frame: Maybe<&2, T.ResolverFrame>, state: T.ResolverState) -> Loop.Continuation:
  match frame:
    case None{}: malformed()
    case Some{frame}: progressed(False{}, state, frame)

def found_target(
  +frame: T.ResolverFrame,
  +id: Nat,
  target: T.Target,
  edge: Local.Pending,
  state: T.ResolverState
) -> Loop.Continuation:
  +updated = S.advance(frame, Graph.Resolved{id, Graph.Found{}})
  selected_frame(
    include_known(
      S.frame_command(updated),
      id,
      edge,
      S.with_frame_target_paths(
        updated,
        Map.set(&2, Maybe<&2, T.Target>, S.frame_target_paths(updated), Nat.show(id), Some{target})
      )
    ),
    state
  )

def pending_name(edge: Local.Pending) -> String:
  match edge:
    case Local.Pending{_, _, _, _, name, _, _, _}: name

def resolve_result(allowed: Bool, +frame: T.ResolverFrame, id: Nat,
    path: String, +edge: Local.Pending, state: T.ResolverState) -> Loop.Continuation:
  match allowed:
    case False{}: progressed(False{}, state, S.advance(frame, Graph.Resolved{id, Graph.NotFound{}}))
    case True{}: found_target(frame, id, T.FileTarget{path, pending_name(edge), edge}, edge, state)

def declaration_export(declaration: Maybe<&2, Local.Declaration>, exported: Bool,
    expected: Local.ExpectedKind) -> Bool:
  match declaration:
    case None{}: False{}
    case Some{Local.Declaration{_, _, function, _, _}}: Bool.and(
      exported,
      Local.kind_matches(expected, function)
    )

def exported_key(facts: Local.Facts, name: String, expected: Local.ExpectedKind) -> String:
  match facts:
    case Local.Facts{aware, _, _, _}: Local.lookup_key(aware, expected, name)

def supported_edge(edge: Local.Pending, +facts: Local.Facts, exported: Map<&2, Bool>) -> Bool:
  match edge:
    case Local.Pending{_, _, _, _, +name, _, +expected, _}:
      declaration_export(
        Local.declaration_lookup(facts, name, expected),
        Local.map_result(
          Bool,
          Map.get(Bool, False{}, exported, exported_key(facts, name, expected))
        ),
        expected
      )

def supported(file: Maybe<&2, T.CapturedFacts>, edge: Local.Pending) -> Bool:
  match file:
    case None{}: True{}
    case Some{T.CapturedFacts{facts, exported, _}}: supported_edge(edge, facts, exported)

def known_target(+existing: Maybe<&2, Nat>, +frame: T.ResolverFrame, +path: String,
    +edge: Local.Pending, state: T.ResolverState) -> Loop.Continuation:
  +id = target_id(existing, frame)
  resolve_result(supported(Local.map_result(Maybe<&2, T.CapturedFacts>,
    Map.get(Maybe<&2, T.CapturedFacts>, None{}, S.frame_captured(frame), path)), edge),
    S.with_frame_target_ids(registered(existing, frame), Map.set(&2, Maybe<&2, Nat>,
      S.frame_target_ids(frame), target_key(path, edge), Some{id})), id, path, edge, state)

def select_path(frame: Maybe<&2, T.ResolverFrame>, edge: Maybe<&2, Local.Pending>,
    +path: String, state: T.ResolverState) -> Loop.Continuation:
  match frame edge:
    case Some{+frame} Some{+edge}: known_target(
      Local.map_result(
        Maybe<&2, Nat>,
        Map.get(Maybe<&2, Nat>, None{}, S.frame_target_ids(frame), target_key(path, edge))
      ),
      frame,
      path,
      edge,
      state
    )
    case _ _: malformed()

def missing(
  frame: Maybe<&2, T.ResolverFrame>,
  result: Graph.Resolution,
  state: T.ResolverState
) -> Loop.Continuation:
  match frame:
    case None{}: malformed()
    case Some{frame}: progressed(False{}, state, allocated(frame, result))

def chosen(paths: List<&2, String>, +state: T.ResolverState) -> Loop.Continuation:
  match paths:
    case []: missing(S.state_frame(state), Graph.NotFound{}, state)
    case path <> []: select_path(
      S.state_frame(state),
      S.scratch_pending_edge(S.state_scratch(state)),
      path,
      state
    )
    case _: missing(S.state_frame(state), Graph.Many{}, state)

def next_candidate(paths: List<&2, String>, +state: T.ResolverState) -> Loop.Continuation:
  match paths:
    case []: chosen(List.reverse(&2, String, S.scratch_found_paths(S.state_scratch(state))), state)
    case +path <> tail: Loop.ServiceStep{S.request(S.with_state_scratch(state,
      S.with_scratch_paths(S.with_scratch_capture_path(S.state_scratch(state), path), tail)),
      T.CheckingCandidateAbsolute{}, T.PathIsAbsolute{path})}

def candidate_absolute(absolute: Bool, +state: T.ResolverState) -> Loop.Continuation:
  match absolute:
    case True{}: next_candidate(S.scratch_paths(S.state_scratch(state)), state)
    case False{}: Loop.ServiceStep{S.request(state, T.CheckingImportCandidates{},
      T.ReadFileStatus{S.scratch_capture_path(S.state_scratch(state))})}

def candidate_status(status: T.FileStatus, +state: T.ResolverState) -> Loop.Continuation:
  match status:
    case T.ExistingFile{}: next_candidate(
      S.scratch_paths(S.state_scratch(state)),
      S.with_state_scratch(
        state,
        S.with_scratch_found_paths(
          S.state_scratch(state),
          S.scratch_capture_path(
            S.state_scratch(state)
          ) <> S.scratch_found_paths(S.state_scratch(state))
        )
      )
    )
    case _: next_candidate(S.scratch_paths(S.state_scratch(state)), state)

def ts_choices(extension: String, +base: String) -> List<&2, String>:
  match extension:
    case "": [
      String.append(base, ".ts"),
      String.append(base, ".tsx"),
      String.append(base, ".mts"),
      String.append(base, ".cts")
    ]
    case ".js": [
      String.append(String.take(base, Nat.sub(String.length(base), 3n)), ".ts"),
      String.append(String.take(base, Nat.sub(String.length(base), 3n)), ".tsx")
    ]
    case ".mjs": [String.append(String.take(base, Nat.sub(String.length(base), 4n)), ".mts")]
    case ".cjs": [String.append(String.take(base, Nat.sub(String.length(base), 4n)), ".cts")]
    case ".ts": [base]
    case ".tsx": [base]
    case ".mts": [base]
    case ".cts": [base]
    case _: []

def start_choices(paths: List<&2, String>, +state: T.ResolverState) -> Loop.Continuation:
  match paths:
    case []: unsupported(S.state_frame(state), state)
    case _: next_candidate(
      paths,
      S.with_state_scratch(state, S.with_scratch_found_paths(S.state_scratch(state), []))
    )

def rust_extension(extension: String, +state: T.ResolverState) -> Loop.Continuation:
  match extension:
    case "": Loop.ServiceStep{S.request(state, T.JoiningRustModuleCandidate{},
      T.PathJoin{[S.scratch_resolved_path(S.state_scratch(state)), "mod.rs"]})}
    case _: unsupported(S.state_frame(state), state)

def extension_choice(
  language: Maybe<&2, T.Language>,
  extension: String,
  +state: T.ResolverState
) -> Loop.Continuation:
  match language:
    case Some{T.TypeScriptLanguage{}}: start_choices(
      ts_choices(String.to_lower(extension), S.scratch_resolved_path(S.state_scratch(state))),
      state
    )
    case Some{T.BendLanguage{}}: start_choices(
      Bool.pick(
        List<&2, String>,
        String.eq(String.to_lower(extension), ".bend"),
        [S.scratch_resolved_path(S.state_scratch(state))],
        []
      ),
      state
    )
    case Some{T.RustLanguage{}}: rust_extension(extension, state)
    case _: malformed()

# The binding supplies only mechanical node:path facts. All policy and
# language-specific extension selection remains here, in its original order.
def inspect_extension_facts(
  edge: Maybe<&2, Local.Pending>,
  language: Maybe<&2, T.Language>,
  extension: String,
  leaf_extension: String,
  +state: T.ResolverState
) -> Loop.Continuation:
  match edge language:
    case Some{edge} Some{T.BendLanguage{}}:
      +path = import_path(edge)
      yes : Unit -> Loop.Continuation = _ => extension_choice(language, leaf_extension, state)
      no : Unit -> Loop.Continuation = _ => unsupported(S.state_frame(state), state)
      Materialize.decide(Loop.Continuation,
        Bool.or(String.starts_with(path, "./"), String.starts_with(path, "../")), yes, no)
    case Some{_} Some{T.TypeScriptLanguage{}}: extension_choice(language, extension, state)
    case Some{_} Some{T.RustLanguage{}}: extension_choice(language, extension, state)
    case _ _: malformed()

def joined_absolute(absolute: Bool, extension: String, leaf_extension: String,
    +state: T.ResolverState) -> Loop.Continuation:
  match absolute:
    case True{}: unsupported(S.state_frame(state), state)
    case False{}: inspect_extension_facts(S.scratch_pending_edge(S.state_scratch(state)),
      S.state_language(state), extension, leaf_extension, state)

def joined_facts(+path: String, absolute: Bool, extension: String, leaf_extension: String,
    +state: T.ResolverState) -> Loop.Continuation:
  yes : Unit -> Loop.Continuation = _ => unsupported(S.state_frame(state), state)
  no : Unit -> Loop.Continuation = _ => joined_absolute(absolute, extension, leaf_extension,
    S.with_state_scratch(state, S.with_scratch_resolved_path(S.state_scratch(state), path)))
  Materialize.decide(Loop.Continuation, outside(path, S.state_separator(state)), yes, no)

def artifact_at(items: List<&2, T.ArtifactEntry>, +handle: Nat) -> Maybe<&2, T.Artifact>:
  match items:
    case []: None{}
    case T.ArtifactEntry{actual, +artifact} <> tail:
      yes : Unit -> Maybe<&2, T.Artifact> = _ => Some{artifact}
      no : Unit -> Maybe<&2, T.Artifact> = _ => artifact_at(tail, handle)
      Materialize.decide(Maybe<&2, T.Artifact>, Nat.is_eq(actual, handle), yes, no)

def bundled_registered(
  +existing: Maybe<&2, Nat>,
  +frame: T.ResolverFrame,
  +key: String,
  handle: Nat,
  facts: Local.Facts,
  +edge: Local.Pending,
  state: T.ResolverState
) -> Loop.Continuation:
  +id = target_id(existing, frame)
  found_target(S.with_frame_target_ids(registered(existing, frame),
    Map.set(&2, Maybe<&2, Nat>, S.frame_target_ids(frame), key, Some{id})),
    id, T.BundledTarget{handle, facts, edge}, edge, state)

def bundled_resources(
  artifact: Maybe<&2, T.Artifact>,
  file: Maybe<&2, T.CapturedFacts>,
  +frame: T.ResolverFrame,
  handle: Nat,
  edge: Local.Pending,
  state: T.ResolverState
) -> Loop.Continuation:
  match artifact file:
    case Some{artifact} Some{T.CapturedFacts{facts, _, _}}:
      +key = Facts.artifact_identity(artifact)
      bundled_registered(
        Local.map_result(
          Maybe<&2, Nat>,
          Map.get(Maybe<&2, Nat>, None{}, S.frame_target_ids(frame), key)
        ),
        frame,
        key,
        handle,
        facts,
        edge,
        state
      )
    case _ _: malformed()

def bundled_frame(frame: Maybe<&2, T.ResolverFrame>, +handle: Nat,
    +edge: Local.Pending, state: T.ResolverState) -> Loop.Continuation:
  match frame:
    case None{}: malformed()
    case Some{+frame}: bundled_resources(artifact_at(S.frame_artifacts(frame), handle),
      Local.map_result(Maybe<&2, T.CapturedFacts>, Map.get(Maybe<&2, T.CapturedFacts>, None{},
        S.frame_captured(frame), from_path(edge))), frame, handle, edge, state)

def pending(edge: Maybe<&2, Local.Pending>, +state: T.ResolverState) -> Loop.Continuation:
  match edge:
    case None{}: invalid(state)
    case Some{+edge}:
      match edge:
        case Local.Pending{_, _, _, _, _, _, _, Local.Imported{_, _}}:
          Loop.ServiceStep{
            S.request(
              S.with_state_scratch(
                state,
                S.with_scratch_pending_edge(S.state_scratch(state), Some{edge})
              ),
              T.ReadingJoinedPathFacts{},
              T.JoinedPathFacts{from_path(edge), import_path(edge)}
            )
          }
        case Local.Pending{_, _, _, _, _, _, _, Local.BundledTarget{handle}}: bundled_frame(
          S.state_frame(state),
          handle,
          edge,
          state
        )

def begin_frame(
  frame: Maybe<&2, T.ResolverFrame>,
  edge: Nat,
  state: T.ResolverState
) -> Loop.Continuation:
  match frame:
    case None{}: malformed()
    case Some{frame}: pending(
      Local.map_result(
        Maybe<&2, Local.Pending>,
        Map.get(Maybe<&2, Local.Pending>, None{}, S.frame_pending(frame), Nat.show(edge))
      ),
      state
    )

def begin(+state: T.ResolverState, edge: Nat) -> Loop.Continuation:
  begin_frame(S.state_frame(state), edge, state)

def reply(
  stage: T.ResolverStage,
  outcome: T.ServiceOutcome,
  +state: T.ResolverState
) -> Loop.Continuation:
  match stage outcome:
    case T.ReadingJoinedPathFacts{} T.JoinedPathFactsResult{
      separator,
      path,
      absolute,
      extension,
      leaf_extension
    }:
      joined_facts(
        path,
        absolute,
        extension,
        leaf_extension,
        S.with_state_separator(state, separator)
      )
    case T.JoiningRustModuleCandidate{} T.JoinedResult{path}: start_choices(
      [String.append(S.scratch_resolved_path(S.state_scratch(state)), ".rs"), path],
      state
    )
    case T.CheckingCandidateAbsolute{} T.AbsoluteResult{absolute}: candidate_absolute(
      absolute,
      state
    )
    case T.CheckingImportCandidates{} T.StatusResult{status}: candidate_status(status, state)
    case _ _: malformed()

def main() -> Unit:
  Unit{}
