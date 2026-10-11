import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ./BoundaryValidationSpecification.bend as Boundary
import ./SourceValidationSpecification.bend as SourceValidation
import ./Types.bend as T
import ./python-module/Session.bend as Python
import ./python-module/ArtifactProtocol.bend as P
import ./ComposedBudget.bend as Budget
import ./WholeObservation.bend as O
import ./Environment.bend as E
import ./ExpansionSpecification.bend as X
import ./ForestSpecification.bend as F
import ./SignedLocalSpecification.bend as Signed
import ./SPEC.bend as Root
import ./RustSpecification.bend as Rust
import ./traversal/core.bend as Local
import ./traversal/SPEC.bend as Recursive
import ../../../../agent-flow-bend/ImportGraph.bend as G

# Independent full expansion command/service interpreter. Mechanical path and
# Binary64 algebra are fixed runtime interpretations, not policy or query scripts.
# It begins at the prepared root frame; whole preparation/root entry and observer
# composition are separate remaining obligations. Mathematical fuel exhaustion
# is never an ordinary NoUnit result.
import ./ExpansionDriverState.bend as DriverState

def config(+state: DriverState.State) -> DriverState.Config:
  match state:
    case DriverState.State{+config, _, _, _, _, _, _, _, _}: config

def with_python(
  state: DriverState.State,
  session: Python.Session,
  cache: T.CacheToken,
  census: Budget.Census
) -> DriverState.State:
  match state:
    case DriverState.State{config, frame, targets, ids, target, request, iterations, stage, _}:
      DriverState.State{
        config,
        frame,
        targets,
        ids,
        target,
        request,
        iterations,
        stage,
        Some{DriverState.PythonContext{session, cache, census}}
      }

def python_context(state: DriverState.State) -> Maybe<&2, DriverState.PythonContext>:
  match state:
    case DriverState.State{_, _, _, _, _, _, _, _, python}: python

def next_request(state: DriverState.State) -> Nat:
  match state:
    case DriverState.State{_, _, _, _, _, next, _, _, _}: next

def with_next(state: DriverState.State, next: Nat) -> DriverState.State:
  match state:
    case DriverState.State{config, frame, targets, ids, target, _, iterations, stage, python}:
      DriverState.State{config, frame, targets, ids, target, next, iterations, stage, python}

def after(+state: DriverState.State, +event: G.GraphEvent, +skip: Bool) -> DriverState.Selection:
  DriverState.internal(
    DriverState.with_frame(state, X.event(DriverState.frame(state), event)),
    DriverState.AfterCommand{skip}
  )

def limits(+frame: X.Frame) -> G.Limits:
  match frame:
    case X.Frame{
      G.Bounded{G.Graph{_, _, _, _, _, _, _, _, _, _, +limits}, _},
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
    , _}: limits

def source_cap(+limits: G.Limits) -> Nat:
  match limits:
    case G.Limits{_, +source, _, _, _, _, _, _}: source

def tree_cap(+limits: G.Limits) -> Nat:
  match limits:
    case G.Limits{_, _, +tree, _, _, _, _, _}: tree

def work_cap(+limits: G.Limits) -> Nat:
  match limits:
    case G.Limits{_, _, _, _, _, _, _, +work}: work

def begin(
  +config: DriverState.Config,
  +frame: X.Frame,
  +targets: List<&2, DriverState.TargetEntry>,
  +ids: List<&2, DriverState.TargetId>,
  +next_target: Nat,
  +next_request: Nat
) -> DriverState.State:
  DriverState.State{config, frame, targets, ids, next_target, next_request,
    ((work_cap(limits(frame)) * 8n : Nat) + 16n : Nat), DriverState.Iteration{}, None{}}

def bounded_usage(graph: G.Bounded) -> Python.Usage:
  match graph:
    case G.Bounded{graph, _}: Budget.graph_usage(graph)

def source_usage(+state: DriverState.State, census: Budget.Census) -> Python.Usage:
  Budget.combined_usage(
    census,
    bounded_usage(X.frame_graph(DriverState.frame(state))),
    source_cap(limits(DriverState.frame(state)))
  )

def python_available_at(
  +state: DriverState.State,
  python: Maybe<&2, DriverState.PythonContext>
) -> Bool:
  match python:
    case None{}: True{}
    case Some{DriverState.PythonContext{session, _, census}}:
      Budget.available_usage(
        source_usage(state, census),
        Python.usage(session),
        limits(DriverState.frame(state))
      )

def python_available(+state: DriverState.State) -> Bool:
  python_available_at(state, python_context(state))

def with_dependencies(value: X.Frame, dependencies: List<&2, String>) -> X.Frame:
  match value:
    case X.Frame{
      graph,
      command,
      forest,
      local,
      pending,
      captured,
      identities,
      edge,
      episode,
      artifact,
      _,
      fingerprint
    }:
      X.Frame{
        graph,
        command,
        forest,
        local,
        pending,
        captured,
        identities,
        edge,
        episode,
        artifact,
        dependencies,
        fingerprint
      }

def synchronized_at(
  +state: DriverState.State,
  +session: Python.Session,
  python: Maybe<&2, DriverState.PythonContext>
) -> DriverState.State:
  match python:
    case None{}: state
    case Some{DriverState.PythonContext{_, cache, census}}:
      with_python(
        DriverState.with_frame(
          state,
          with_dependencies(DriverState.frame(state), Python.dependencies(session))
        ),
        session,
        cache,
        census
      )

def synchronized(+state: DriverState.State, session: Python.Session) -> DriverState.State:
  synchronized_at(state, session, python_context(state))

def child_request_at(
  +state: DriverState.State,
  next: DriverState.Stage,
  expected: T.Request,
  valid: Bool
) -> DriverState.Selection:
  match expected valid:
    case T.Request{_, _, operation} True{}: DriverState.request(state, next, operation)
    case _ False{}: DriverState.InvariantFailed{state}

def child_request(
  +state: DriverState.State,
  next: DriverState.Stage,
  +expected: T.Request
) -> DriverState.Selection:
  match expected:
    case T.Request{owner, id, _}:
      child_request_at(
        state,
        next,
        expected,
        Bool.and(
          Nat.is_eq(owner, DriverState.invocation(config(state))),
          Nat.is_eq(id, next_request(state))
        )
      )

def child_reply(request: T.Request, outcome: T.ServiceOutcome) -> T.Reply:
  match request:
    case T.Request{owner, id, _}: T.Reply{owner, id, outcome}

def counted_at(
  +state: DriverState.State,
  path: String,
  bytes: Nat,
  python: Maybe<&2, DriverState.PythonContext>
) -> DriverState.State:
  match python:
    case None{}: state
    case Some{DriverState.PythonContext{session, cache, census}}:
      with_python(state, session, cache, Budget.succeeded(census, path, bytes))

def counted(+state: DriverState.State, path: String, bytes: Nat) -> DriverState.State:
  counted_at(state, path, bytes, python_context(state))

def edge_at(+items: List<&2, X.Edge>, +id: Nat) -> Maybe<&2, X.Edge>:
  match items:
    case []: None{}
    case X.Edge{+actual, +pending, +source, +catalog} <> +tail:
      Bool.pick(
        Maybe<&2, X.Edge>,
        Nat.is_eq(actual, id),
        Some{X.Edge{actual, pending, source, catalog}},
        edge_at(tail, id)
      )

def pending(+frame: X.Frame, +id: Nat) -> Maybe<&2, X.Edge>:
  match frame:
    case X.Frame{_, _, _, _, +items, _, _, _, _, _, _, _}: edge_at(items, id)

def target_at(+items: List<&2, DriverState.TargetEntry>, +id: Nat) -> Maybe<&2, DriverState.Target>:
  match items:
    case []: None{}
    case DriverState.TargetEntry{+actual, +target} <> +tail:
      Bool.pick(
        Maybe<&2, DriverState.Target>,
        Nat.is_eq(actual, id),
        Some{target},
        target_at(tail, id)
      )

def stored_target(
  +items: List<&2, DriverState.TargetEntry>,
  +id: Nat,
  +target: DriverState.Target
) -> List<&2, DriverState.TargetEntry>:
  match items:
    case []: [DriverState.TargetEntry{id, target}]
    case DriverState.TargetEntry{+actual, +previous} <> +tail:
      Bool.pick(
        List<&2, DriverState.TargetEntry>,
        Nat.is_eq(actual, id),
        DriverState.TargetEntry{id, target} <> tail,
        DriverState.TargetEntry{actual, previous} <> stored_target(tail, id, target)
      )

def target_id(+items: List<&2, DriverState.TargetId>, +key: String) -> Maybe<&2, Nat>:
  match items:
    case []: None{}
    case DriverState.TargetId{+actual, +id} <> +tail:
      Bool.pick(Maybe<&2, Nat>, String.eq(actual, key), Some{id}, target_id(tail, key))

def stored_id(
  +items: List<&2, DriverState.TargetId>,
  +key: String,
  +id: Nat
) -> List<&2, DriverState.TargetId>:
  match items:
    case []: [DriverState.TargetId{key, id}]
    case DriverState.TargetId{+actual, +previous} <> +tail:
      Bool.pick(
        List<&2, DriverState.TargetId>,
        String.eq(actual, key),
        DriverState.TargetId{key, id} <> tail,
        DriverState.TargetId{actual, previous} <> stored_id(tail, key, id)
      )

def expected_name(+expected: Local.ExpectedKind) -> String:
  match expected:
    case Local.FunctionKind{}: "function"
    case _: "type"

def file_key(+path: String, +edge: X.Edge) -> String:
  match edge:
    case X.Edge{_, F.Pending{_, Local.Pending{_, _, _, _, +name, _, +expected, _}}, _, _}:
      String.concat([path, "\0", expected_name(expected), "\0", name])

def allocated(
  +state: DriverState.State,
  +result: G.Resolution,
  +skip: Bool
) -> DriverState.Selection:
  match state:
    case DriverState.State{
      +config,
      +frame,
      +targets,
      +ids,
      +target,
      +request,
      +iterations,
      +stage,
      +python
    }:
      after(
        DriverState.State{
          config,
          frame,
          targets,
          ids,
          (target + 1n : Nat),
          request,
          iterations,
          stage,
          python
        },
        G.Resolved{target, result},
        skip
      )

def outside(~absolute: String -> Bool, +path: String, +separator: String) -> Bool:
  Bool.or(
    absolute(path),
    Bool.or(String.eq(path, ".."), String.starts_with(path, ".." ++ separator))
  )

def typescript_candidates(+base: String, +extension: String) -> List<&2, String>:
  match extension:
    case "": [base ++ ".ts", base ++ ".tsx", base ++ ".mts", base ++ ".cts"]
    case ".js": [String.take(base, (String.length(base) - 3n : Nat)) ++ ".ts",
      String.take(base, (String.length(base) - 3n : Nat)) ++ ".tsx"]
    case ".mjs": [String.take(base, (String.length(base) - 4n : Nat)) ++ ".mts"]
    case ".cjs": [String.take(base, (String.length(base) - 4n : Nat)) ++ ".cts"]
    case ".ts": [base]
    case ".tsx": [base]
    case ".mts": [base]
    case ".cts": [base]
    case _: []

def candidates(
  ~extension: String -> String,
  ~join: List<&2, String> -> String,
  +language: T.Language,
  +base: String,
  +imported: String
) -> List<&2, String>:
  match language:
    case T.TypeScriptLanguage{}: typescript_candidates(base, String.to_lower(extension(base)))
    case T.PythonLanguage{}: []
    case T.GoLanguage{}: []
    case T.RustLanguage{}: Bool.pick(List<&2, String>, String.is_empty(extension(base)),
      [base ++ ".rs", join([base, "mod.rs"])], [])
    case T.BendLanguage{}: Bool.pick(List<&2, String>,
      Bool.and(Bool.or(String.starts_with(imported, "./"), String.starts_with(imported, "../")),
        String.eq(String.to_lower(extension(imported)), ".bend")), [base], [])

# Exact catalog handle -> original fact, through the construction-time catalog.
# No fallback by name/identity, including duplicate identity text.
def raw_declarations(+source: T.SourceFacts) -> List<&2, T.FactDeclaration>:
  match source:
    case T.SourceFacts{_, +declarations, _, +supporting}:
      List.append(&2, T.FactDeclaration, declarations, supporting)

def count_handle(+items: List<&2, T.ArtifactEntry>, +handle: Nat) -> Nat:
  match items:
    case []: 0n
    case T.ArtifactEntry{+id, _} <> +tail:
      (Bool.pick(Nat, Nat.is_eq(id, handle), 1n, 0n) + count_handle(tail, handle) : Nat)

def paired_declaration(
  +entries: List<&2, T.ArtifactEntry>,
  +declarations: List<&2, T.FactDeclaration>,
  +handle: Nat
) -> Maybe<&2, T.FactDeclaration>:
  match entries declarations:
    case T.ArtifactEntry{+id, _} <> +tail +declaration <> +rest:
      Bool.pick(Maybe<&2, T.FactDeclaration>, Nat.is_eq(id, handle), Some{declaration},
        paired_declaration(tail, rest, handle))
    case _ _: None{}

def original(
  +source: T.SourceFacts,
  +catalog: Root.Source,
  +handle: Nat
) -> Maybe<&2, T.FactDeclaration>:
  match catalog:
    case Root.Source{_, _, +entries}:
      Bool.pick(Maybe<&2, T.FactDeclaration>, Nat.is_eq(count_handle(entries, handle), 1n),
        paired_declaration(entries, raw_declarations(source), handle), None{})

def artifact_identity(+artifact: T.Artifact) -> String:
  match artifact:
    case T.Artifact{_, _, +id, _, _, _, _, _}: id

def artifact_name(+artifact: T.Artifact) -> String:
  match artifact:
    case T.Artifact{_, _, _, _, +name, _, _, _}: name

def artifact_source(+artifact: T.Artifact) -> String:
  match artifact:
    case T.Artifact{_, _, _, _, _, +source, _, _}: source

def declaration_at(
  +items: List<&2, T.FactDeclaration>,
  +key: String
) -> Maybe<&2, T.FactDeclaration>:
  match items:
    case []: None{}
    case T.FactDeclaration{+actual, +artifact, +refs, +supporting} <> +tail:
      Bool.pick(Maybe<&2, T.FactDeclaration>, String.eq(actual, key),
        Some{T.FactDeclaration{actual, artifact, refs, supporting}}, declaration_at(tail, key))

def declaration(
  +source: T.SourceFacts,
  +name: String,
  +expected: Local.ExpectedKind
) -> Maybe<&2, T.FactDeclaration>:
  match source:
    case T.SourceFacts{+aware, +declarations, _, _}:
      declaration_at(declarations, Recursive.key(Root.optional_bool(aware), expected, name))

def supported(+declaration: Maybe<&2, T.FactDeclaration>, +expected: Local.ExpectedKind) -> Bool:
  match declaration:
    case None{}: False{}
    case Some{T.FactDeclaration{_, T.Artifact{_, _, _, +kind, _, _, _, _}, _, +exported}}:
      Bool.and(exported, Recursive.matches(expected, Root.function_kind(kind)))

def captured(+items: List<&2, X.Captured>, +path: String) -> Maybe<&2, T.SourceFacts>:
  match items:
    case []: None{}
    case X.Captured{+actual, +source, _} <> +tail:
      Bool.pick(
        Maybe<&2, T.SourceFacts>,
        String.eq(actual, path),
        Some{source},
        captured(tail, path)
      )

def supported_capture(
  +found: Maybe<&2, T.SourceFacts>,
  +name: String,
  +expected: Local.ExpectedKind
) -> Bool:
  match found:
    case None{}: True{}
    case Some{+source}: supported(declaration(source, name, expected), expected)

def target_artifact(+items: List<&2, X.TargetArtifact>, +target: Nat) -> Maybe<&2, String>:
  match items:
    case []: None{}
    case X.TargetArtifact{+actual, +identity} <> +tail:
      Bool.pick(
        Maybe<&2, String>,
        Nat.is_eq(actual, target),
        Some{identity},
        target_artifact(tail, target)
      )

def included(+frame: X.Frame, +replacement: F.Replacement) -> Maybe<&2, X.Frame>:
  match frame replacement:
    case X.Frame{
      +graph,
      +command,
      _,
      +local,
      +pending,
      +captured,
      +identities,
      +edge,
      +episode,
      +artifact,
      +dependencies
    , fingerprint}
      F.Replaced{+forest}:
      Some{
        X.Frame{
          graph,
          command,
          forest,
          local,
          pending,
          captured,
          identities,
          edge,
          episode,
          artifact,
          dependencies
        , fingerprint}
      }
    case _ _: None{}

def include_identity(
  +frame: X.Frame,
  +edge: X.Edge,
  +identity: Maybe<&2, String>
) -> Maybe<&2, X.Frame>:
  match frame edge identity:
    case X.Frame{_, _, +forest, _, _, _, _, _, _, _, _, _}
      X.Edge{_, F.Pending{+owner, Local.Pending{_, +index, _, +symbol, _, _, _, _}}, _, _} Some{
        +identity
      }:
      included(frame, F.replace(forest, owner, index,
        F.Included{F.ReferenceSymbol{symbol}, F.ArtifactIdentity{identity}}))
    case _ _ None{}: Some{frame}

def include_known(+frame: X.Frame, +target: Nat, +edge: X.Edge) -> Maybe<&2, X.Frame>:
  match frame:
    case X.Frame{_, G.NoCommand{}, _, _, _, _, +identities, _, _, _, _, _}:
      include_identity(frame, edge, target_artifact(identities, target))
    case _: Some{frame}

def publish_target(
  +state: DriverState.State,
  +frame: Maybe<&2, X.Frame>,
  +id: Nat,
  +target: DriverState.Target
) -> DriverState.Selection:
  match state frame:
    case _ None{}: DriverState.InvariantFailed{state}
    case DriverState.State{+config, _, +targets, +ids, +next, +request, +iterations, _, +python} Some{
      +frame
    }:
      DriverState.Internal{
        DriverState.State{
          config,
          frame,
          stored_target(targets, id, target),
          ids,
          next,
          request,
          iterations,
          DriverState.AfterCommand{False{}},
          python
        }
      }

def resolved_known(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +edge: X.Edge,
  +allowed: Bool
) -> DriverState.Selection:
  match allowed:
    case False{}: after(state, G.Resolved{id, G.NotFound{}}, False{})
    case True{}:
      publish_target(
        state,
        include_known(X.event(DriverState.frame(state), G.Resolved{id, G.Found{}}), id, edge),
        id,
        target
      )

def resolve_selected_observed(
  +observed: X.Frame,
  +state: DriverState.State,
  +id: Nat,
  +path: String,
  +edge: X.Edge
) -> DriverState.Selection:
  match observed edge:
    case X.Frame{_, _, _, _, _, +captures, _, _, _, _, _, _}
      X.Edge{_, F.Pending{_, Local.Pending{_, _, _, _, +name, _, +expected, _}}, _, _}:
      resolved_known(state, id, DriverState.FileTarget{path, name, edge}, edge,
        supported_capture(captured(captures, path), name, expected))

def resolve_selected(
  +state: DriverState.State,
  +id: Nat,
  +path: String,
  +edge: X.Edge
) -> DriverState.Selection:
  resolve_selected_observed(DriverState.frame(state), state, id, path, edge)

def chosen_target(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +edge: X.Edge
) -> DriverState.Selection:
  match target:
    case DriverState.FileTarget{+path, _, _}: resolve_selected(state, id, path, edge)
    case DriverState.BundledTarget{_, _, _, _}: resolved_known(state, id, target, edge, True{})

def known_key(
  +state: DriverState.State,
  +key: String,
  +existing: Maybe<&2, Nat>,
  +target: DriverState.Target,
  +edge: X.Edge
) -> DriverState.Selection:
  match state existing:
    case DriverState.State{
      +config,
      +frame,
      +targets,
      +ids,
      +next,
      +request,
      +iterations,
      +stage,
      +python
    } None{}:
      chosen_target(
        DriverState.State{
          config,
          frame,
          targets,
          stored_id(ids, key, next),
          (next + 1n : Nat),
          request,
          iterations,
          stage
        , python},
        next,
        target,
        edge
      )
    case DriverState.State{
      +config,
      +frame,
      +targets,
      +ids,
      +next,
      +request,
      +iterations,
      +stage,
      +python
    } Some{
      +id
    }:
      chosen_target(
        DriverState.State{
          config,
          frame,
          targets,
          stored_id(ids, key, id),
          next,
          request,
          iterations,
          stage,
          python
        },
        id,
        target,
        edge
      )

def choose_key(
  +state: DriverState.State,
  +key: String,
  +target: DriverState.Target,
  +edge: X.Edge
) -> DriverState.Selection:
  match state:
    case DriverState.State{_, _, _, +ids, _, _, _, _, _}: known_key(
      state,
      key,
      target_id(ids, key),
      target,
      edge
    )

def chosen_path(+state: DriverState.State, +edge: X.Edge, +path: String) -> DriverState.Selection:
  match edge:
    case X.Edge{_, F.Pending{_, Local.Pending{_, _, _, _, +name, _, _, _}}, _, _}:
      choose_key(state, file_key(path, edge), DriverState.FileTarget{path, name, edge}, edge)

def renamed_edge(edge: X.Edge, name: String) -> X.Edge:
  match edge:
    case X.Edge{
      id,
      F.Pending{owner, Local.Pending{token, index, path, symbol, _, depth, expected, target}},
      source,
      catalog
    }:
      X.Edge{
        id,
        F.Pending{owner, Local.Pending{token, index, path, symbol, name, depth, expected, target}},
        source,
        catalog
      }

def python_resolution(
  +state: DriverState.State,
  edge: X.Edge,
  resolution: Maybe<&2, P.Resolution>,
  available: Bool
) -> DriverState.Selection:
  match resolution available:
    case Some{P.Resolution{path, name}} True{}: chosen_path(
      state,
      renamed_edge(edge, name),
      path
    )
    case _ _: allocated(state, G.Unhandled{}, False{})



def python_import(
  +state: DriverState.State,
  +edge: X.Edge,
  separator: String,
  python: DriverState.PythonContext,
  observed: DriverState.Config
) -> DriverState.Selection:
  match edge python observed:
    case X.Edge{
      _,
      F.Pending{_, Local.Pending{_, _, from, _, name, _, _, Local.Imported{imported, _}}},
      _,
      _
    }
      DriverState.PythonContext{session, cache, census} DriverState.Config{
        owner,
        root,
        _,
        _,
        clock,
        _
      }:
      DriverState.ChildBegin{
        DriverState.stage(state, DriverState.PythonImporting{edge, None{}}),
        P.ResolveImport{
          session,
          Budget.remaining_usage(source_usage(state, census), limits(DriverState.frame(state))),
          from,
          imported,
          name,
          root,
          clock,
          cache,
          separator,
          owner,
          next_request(state)
        }
      }
    case _ _ _: DriverState.InvariantFailed{state}

def chosen_paths(
  +state: DriverState.State,
  +edge: X.Edge,
  +paths: List<&2, String>
) -> DriverState.Selection:
  match paths:
    case []: allocated(state, G.NotFound{}, False{})
    case +path <> []: chosen_path(state, edge, path)
    case _: allocated(state, G.Many{}, False{})

def resolved_bundle(
  +state: DriverState.State,
  +edge: X.Edge,
  +found: Maybe<&2, T.FactDeclaration>
) -> DriverState.Selection:
  match edge found:
    case _ None{}: DriverState.InvariantFailed{state}
    case X.Edge{_, _, +source, +catalog} Some{
      T.FactDeclaration{+key, +artifact, +refs, +supporting}
    }:
      choose_key(
        state,
        artifact_identity(artifact),
        DriverState.BundledTarget{
          T.FactDeclaration{key, artifact, refs, supporting},
          source,
          catalog,
          edge
        },
        edge
      )

def resolve_file(
  +state: DriverState.State,
  +edge: X.Edge,
  +outside: Bool,
  +choices: List<&2, String>
) -> DriverState.Selection:
  match outside choices:
    case True{} _: allocated(state, G.Unhandled{}, True{})
    case False{} Nil{}: allocated(state, G.Unhandled{}, True{})
    case False{} _: DriverState.internal(state, DriverState.Scan{edge, choices, []})

def resolve_observed(
  ~absolute: String -> Bool,
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~normalize: String -> String,
  ~extension: String -> String,
  +observed: DriverState.Config,
  +separator: String,
  +state: DriverState.State,
  +edge: X.Edge
) -> DriverState.Selection:
  match observed edge:
    case DriverState.Config{_, _, +language, _, _, _}
      X.Edge{
        _,
        F.Pending{_, Local.Pending{_, _, +from, _, _, _, _, Local.Imported{+imported, _}}},
        _,
        _
      }:
      +base : String = normalize(join([dirname(from), imported]))
      resolve_file(
        state,
        edge,
        outside(absolute, base, separator),
        candidates(extension, join, language, base, imported)
      )
    case _ X.Edge{
      _,
      F.Pending{_, Local.Pending{_, _, _, _, _, _, _, Local.BundledTarget{+handle}}},
      +source,
      +catalog
    }:
      resolved_bundle(state, edge, original(source, catalog, handle))

def resolve_generic(
  ~absolute: String -> Bool,
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~normalize: String -> String,
  ~extension: String -> String,
  +separator: String,
  +state: DriverState.State,
  +edge: X.Edge
) -> DriverState.Selection:
  resolve_observed(
    absolute,
    dirname,
    join,
    normalize,
    extension,
    config(state),
    separator,
    state,
    edge
  )

def resolve_context(
  ~absolute: String -> Bool,
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~normalize: String -> String,
  ~extension: String -> String,
  +separator: String,
  +state: DriverState.State,
  +edge: X.Edge,
  python: Maybe<&2, DriverState.PythonContext>
) -> DriverState.Selection:
  match edge python:
    case X.Edge{_, F.Pending{_, Local.Pending{_, _, _, _, _, _, _, Local.Imported{_, _}}}, _, _} Some{
      context
    }:
      python_import(state, edge, separator, context, config(state))
    case _ _: resolve_generic(absolute, dirname, join, normalize, extension, separator, state, edge)

def resolve(
  ~absolute: String -> Bool, ~dirname: String -> String, ~join: List<&2, String> -> String,
  ~normalize: String -> String, ~extension: String -> String, +separator: String,
  +state: DriverState.State, +edge: X.Edge) -> DriverState.Selection:
  resolve_context(
    absolute,
    dirname,
    join,
    normalize,
    extension,
    separator,
    state,
    edge,
    python_context(state)
  )

def scanned_path(
  +state: DriverState.State,
  +edge: X.Edge,
  +path: String,
  +remaining: List<&2, String>,
  +existing: List<&2, String>,
  +outside: Bool
) -> DriverState.Selection:
  match outside:
    case True{}: DriverState.internal(state, DriverState.Scan{edge, remaining, existing})
    case False{}: DriverState.request(
      state,
      DriverState.AwaitStatus{edge, path, remaining, existing},
      T.ReadFileStatus{path}
    )

def scan(
  ~absolute: String -> Bool,
  +separator: String,
  +state: DriverState.State,
  +edge: X.Edge,
  +choices: List<&2, String>,
  +existing: List<&2, String>
) -> DriverState.Selection:
  match choices:
    case []: chosen_paths(state, edge, existing)
    case +path <> +tail: scanned_path(
      state,
      edge,
      path,
      tail,
      existing,
      outside(absolute, path, separator)
    )

def status_reply(
  +state: DriverState.State,
  +edge: X.Edge,
  +path: String,
  +remaining: List<&2, String>,
  +existing: List<&2, String>,
  +status: T.FileStatus
) -> DriverState.Selection:
  match status:
    case T.ExistingFile{}: DriverState.internal(
      state,
      DriverState.Scan{edge, remaining, List.append(&2, String, existing, [path])}
    )
    case _: DriverState.internal(state, DriverState.Scan{edge, remaining, existing})

def selected_edge(+state: DriverState.State, +edge: Maybe<&2, X.Edge>) -> DriverState.Selection:
  match edge:
    case None{}: DriverState.no_unit(state)
    case Some{+edge}: DriverState.internal(state, DriverState.Resolve{edge})

def selected_target(
  +state: DriverState.State,
  +id: Nat,
  +target: Maybe<&2, DriverState.Target>,
  +read: Bool
) -> DriverState.Selection:
  match target read:
    case None{} _: DriverState.no_unit(state)
    case Some{+target} True{}: DriverState.internal(state, DriverState.Read{id, target})
    case Some{+target} False{}: DriverState.internal(state, DriverState.Check{id, target})

def dispatch_command(+state: DriverState.State, +command: G.Command) -> DriverState.Selection:
  match state command:
    case _ G.NoCommand{}: after(state, G.Next{}, False{})
    case _ G.SkipImport{_, _}: after(state, G.Next{}, False{})
    case _ G.ResolveEdge{+id}: selected_edge(state, pending(DriverState.frame(state), id))
    case DriverState.State{_, _, +targets, _, _, _, _, _, +python} G.CheckPath{+id}:
      selected_target(state, id, target_at(targets, id), False{})
    case DriverState.State{_, _, +targets, _, _, _, _, _, +python} G.ReadSource{+id}:
      selected_target(state, id, target_at(targets, id), True{})
    case _ G.UnitComplete{}: DriverState.internal(state, DriverState.Completion{None{}})
    case _ G.UnitIncomplete{+reason}: DriverState.internal(
      state,
      DriverState.Completion{Some{reason}}
    )

def deadline(+state: DriverState.State, +expired: Bool) -> DriverState.Selection:
  match expired:
    case True{}: DriverState.no_unit(
      DriverState.with_frame(state, X.event(DriverState.frame(state), G.DeadlineReached{}))
    )
    case False{}: DriverState.internal(state, DriverState.Command{})

def check(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target
) -> DriverState.Selection:
  match target:
    case DriverState.BundledTarget{_, _, _, _}: after(state, G.PathChecked{True{}}, False{})
    case DriverState.FileTarget{+path, _, _}: DriverState.request(
      state,
      DriverState.AwaitChecked{id, target},
      T.AccessPath{path}
    )

def access_allowed(+access: T.AccessOutcome) -> Bool:
  match access:
    case T.AccessDenied{}: False{}
    case T.AccessAllowed{_, _}: True{}

def read(+state: DriverState.State, +id: Nat, +target: DriverState.Target) -> DriverState.Selection:
  match target:
    case DriverState.FileTarget{+path, _, _}: DriverState.request(
      state,
      DriverState.AwaitAuthorized{id, target},
      T.AccessPath{path}
    )
    case DriverState.BundledTarget{T.FactDeclaration{_, +artifact, _, _}, _, _, _}:
      DriverState.request(
        state,
        DriverState.AwaitBundleBytes{id, target},
        T.EncodeSourceText{artifact_source(artifact)}
      )

def canonical_read(
  +state: DriverState.State,
  id: Nat,
  target: DriverState.Target,
  +path: String,
  +selection: T.SelectionToken,
  observed: DriverState.Config
) -> DriverState.Selection:
  match observed:
    case DriverState.Config{_, _, _, _, _, None{}}:
      DriverState.request(
        state,
        DriverState.AwaitCapture{id, target, path, selection},
        T.CaptureSource{selection, source_cap(limits(DriverState.frame(state)))}
      )
    case DriverState.Config{_, _, _, _, _, Some{cache}}:
      DriverState.request(
        state,
        DriverState.AwaitLookup{id, target, path, selection},
        T.LookupCaptureCache{cache, path}
      )

def canonical_reserved(
  +state: DriverState.State,
  id: Nat,
  target: DriverState.Target,
  +path: String,
  selection: T.SelectionToken,
  session: Python.Session,
  cache: T.CacheToken,
  +census: Budget.Census,
  allowed: Bool
) -> DriverState.Selection:
  match allowed:
    case False{}: after(state, G.CaptureFailed{}, False{})
    case True{}: canonical_read(
      with_python(
        state,
        session,
        cache,
        Budget.reserved(census, path, Budget.captured_path(census, path))
      ),
      id,
      target,
      path,
      selection,
      config(state)
    )

def canonical_reserve_at(
  +state: DriverState.State,
  id: Nat,
  target: DriverState.Target,
  +path: String,
  selection: T.SelectionToken,
  cached: Maybe<&2, Nat>,
  python: Maybe<&2, DriverState.PythonContext>
) -> DriverState.Selection:
  match python:
    case None{}: canonical_read(state, id, target, path, selection, config(state))
    case Some{DriverState.PythonContext{+session, cache, +census}}:
      canonical_reserved(
        state,
        id,
        target,
        path,
        selection,
        session,
        cache,
        census,
        Bool.and(
          Bool.not(Budget.failed_path(census, path)),
          Budget.reservation_allowed(
            source_usage(state, census),
            Python.usage(session),
            limits(DriverState.frame(state)),
            Budget.reservation_file(Budget.captured_path(census, path)),
            Budget.reservation_size(
              Budget.captured_path(census, path),
              cached,
              source_cap(limits(DriverState.frame(state)))
            )
          )
        )
      )

def canonical_reserve(+state: DriverState.State, id: Nat, target: DriverState.Target, path: String,
    selection: T.SelectionToken, cached: Maybe<&2, Nat>) -> DriverState.Selection:
  canonical_reserve_at(state, id, target, path, selection, cached, python_context(state))

def cached_bytes(entries: List<&2, T.CaptureBytes>, +path: String) -> Maybe<&2, Nat>:
  match entries:
    case Nil{}: None{}
    case T.CaptureBytes{entry, bytes} <> tail:
      Bool.pick(Maybe<&2, Nat>, String.eq(entry, path), Some{bytes}, cached_bytes(tail, path))

def authorized_observed(
  +observed: DriverState.Config,
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +access: T.AccessOutcome
) -> DriverState.Selection:
  match observed access:
    case _ T.AccessDenied{}: after(state, G.CaptureFailed{}, False{})
    case DriverState.Config{_, _, _, _, _, None{}} T.AccessAllowed{+selection, +path}:
      canonical_reserve(state, id, target, path, selection, None{})
    case DriverState.Config{_, _, _, _, _, Some{+cache}} T.AccessAllowed{+selection, +path}:
      DriverState.request(
        state,
        DriverState.AwaitSnapshot{id, target, path, selection},
        T.SnapshotCaptureCache{cache}
      )

def authorized(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +access: T.AccessOutcome
) -> DriverState.Selection:
  authorized_observed(config(state), state, id, target, access)

def snapshot_admission_observed(
  +observed: DriverState.Config,
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +selection: T.SelectionToken,
  +refusal: Maybe<&2, T.CaptureDiagnostic>,
  +cached: Maybe<&2, Nat>
) -> DriverState.Selection:
  match observed refusal:
    case _ Some{+diagnostic}: DriverState.request(
      state,
      DriverState.AwaitDiagnostic{},
      T.ObserveDiagnostic{path, diagnostic}
    )
    case DriverState.Config{_, _, _, _, _, Some{+cache}} None{}:
      canonical_reserve(state, id, target, path, selection, cached)
    case _ _: DriverState.InvariantFailed{state}

def snapshot_admission(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +selection: T.SelectionToken,
  +refusal: Maybe<&2, T.CaptureDiagnostic>,
  +cached: Maybe<&2, Nat>
) -> DriverState.Selection:
  snapshot_admission_observed(config(state), state, id, target, path, selection, refusal, cached)

def snapshot(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +selection: T.SelectionToken,
  +entries: List<&2, T.CaptureBytes>
) -> DriverState.Selection:
  snapshot_admission(
    state,
    id,
    target,
    path,
    selection,
    Rust.cache_refusal(Rust.captured_path(entries, path), entries, 2097152n),
    cached_bytes(entries, path)
  )

def rebased_modules(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  +items: List<&2, ArtifactValue.OrderedField<String>>,
  +root: String,
  +path: String
) -> List<&2, ArtifactValue.OrderedField<String>>:
  match items:
    case []: []
    case ArtifactValue.OrderedField{+key, +target} <> +tail:
      +relative_path : String = relative(dirname(path), join([dirname(root), target]))
      ArtifactValue.OrderedField{
        key,
        Bool.pick(String, String.is_empty(relative_path), ".", relative_path)
      } <>
        rebased_modules(dirname, join, relative, tail, root, path)

def imported_modules(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  +modules: Maybe<&2, List<&2, ArtifactValue.OrderedField<String>>>,
  +root: String,
  +path: String
) -> Maybe<&2, List<&2, ArtifactValue.OrderedField<String>>>:
  match modules:
    case None{}: None{}
    case Some{+items}: Some{rebased_modules(dirname, join, relative, items, root, path)}

def config_context(+config: DriverState.Config) -> T.FrontendContext:
  match config:
    case DriverState.Config{_, _, _, +context, _, _}: context

def context(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  +config: DriverState.Config,
  +path: String
) -> T.FrontendContext:
  match config:
    case DriverState.Config{
      _,
      +root,
      _,
      T.RustSourceContext{+branch, T.RustContext{_, _, +modules}},
      _,
      _
    }:
      Bool.pick(T.FrontendContext, String.eq(root, path), config_context(config),
        T.RustSourceContext{branch, T.RustContext{None{}, Some{True{}},
          imported_modules(dirname, join, relative, modules, root, path)}})
    case _: config_context(config)

def observed_graph_work(+frame: X.Frame) -> X.Frame:
  match frame:
    case X.Frame{_, _, _, Signed.State{+local, _}, _, _, _, _, _, _, _, _}:
      X.with_local(frame, X.known_state(local,
        X.difference(X.graph_work(X.frame_graph(frame)), X.local_work(X.frame_local(frame)))))

def inspect_request(
  +state: DriverState.State,
  id: Nat,
  target: DriverState.Target,
  +path: String,
  +capture: T.CaptureToken,
  bytes: Nat,
  before: Nat,
  context: T.FrontendContext,
  python: Maybe<&2, DriverState.PythonContext>
) -> DriverState.Selection:
  match python:
    case None{}: DriverState.request(
      state,
      DriverState.AwaitFrontend{id, target, path, capture, bytes, before},
      T.InspectSource{path, capture, context}
    )
    case Some{_}: DriverState.internal(
      state,
      DriverState.PythonInspectStart{id, target, path, capture, bytes, before}
    )

def ready_capture(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +capture: T.CaptureToken,
  +bytes: Nat,
  +oversized: Bool
) -> DriverState.Selection:
  match oversized:
    case True{}: after(state, G.Captured{bytes, 0n, 0n, []}, False{})
    case False{}:
      inspect_request(DriverState.with_frame(state, observed_graph_work(DriverState.frame(state))),
        id, target, path, capture, bytes, X.local_work(X.frame_local(DriverState.frame(state))),
        context(dirname, join, relative, config(state), path), python_context(state))

def capture_ready(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +capture: T.CaptureToken,
  +bytes: Nat
) -> DriverState.Selection:
  ready_capture(
    dirname,
    join,
    relative,
    counted(state, path, bytes),
    id,
    target,
    path,
    capture,
    bytes,
    Nat.is_gt(bytes, source_cap(limits(DriverState.frame(state))))
  )

def lookup(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +selection: T.SelectionToken,
  +outcome: T.CacheOutcome
) -> DriverState.Selection:
  match outcome:
    case T.CachePresent{+capture, +bytes}: capture_ready(
      dirname,
      join,
      relative,
      state,
      id,
      target,
      path,
      capture,
      bytes
    )
    case T.CacheAbsent{}: DriverState.request(
      state,
      DriverState.AwaitCapture{id, target, path, selection},
      T.CaptureSource{selection, source_cap(limits(DriverState.frame(state)))}
    )

def capture_observed(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  +observed: DriverState.Config,
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +outcome: T.CaptureOutcome
) -> DriverState.Selection:
  match observed outcome:
    case _ T.CaptureUnavailable{+diagnostic}:
      DriverState.request(
        state,
        DriverState.AwaitDiagnostic{},
        T.ObserveDiagnostic{path, diagnostic}
      )
    case DriverState.Config{_, _, _, _, _, None{}} T.SourceCaptured{+capture, _, +bytes}:
      capture_ready(dirname, join, relative, state, id, target, path, capture, bytes)
    case DriverState.Config{_, _, _, _, _, Some{+cache}} T.SourceCaptured{+capture, _, +bytes}:
      DriverState.request(
        state,
        DriverState.AwaitStored{id, target, path, capture, bytes},
        T.StoreCaptureCache{cache, path, capture}
      )

# A file attempt is built only from the very catalog lookup that passed the
# exported/kind guard. Bundle deliberately clones its declaration under name.
def capture(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +outcome: T.CaptureOutcome
) -> DriverState.Selection:
  capture_observed(dirname, join, relative, config(state), state, id, target, path, outcome)

def start_transaction(+state: DriverState.State, +attempt: X.Attempt) -> DriverState.Selection:
  DriverState.internal(state, DriverState.Transaction{X.begin(DriverState.frame(state), attempt)})

def edge_expected(+edge: X.Edge) -> Local.ExpectedKind:
  match edge:
    case X.Edge{_, F.Pending{_, Local.Pending{_, _, _, _, _, _, +expected, _}}, _, _}: expected

def file_catalog(
  +state: DriverState.State,
  +id: Nat,
  +edge: X.Edge,
  +path: String,
  +source: T.SourceFacts,
  +bytes: Nat,
  +name: String,
  +before: Nat,
  +catalog: Root.Source,
  +found: Maybe<&2, Local.Declaration>
) -> DriverState.Selection:
  match found:
    case None{}: DriverState.InvariantFailed{state}
    case Some{+declaration}:
      start_transaction(state, X.Attempt{id, edge, X.FileChild{path}, source,
        bytes, name, edge_expected(edge), declaration, catalog, before})

def declaration_handle(
  +source: Root.Source,
  +name: String,
  +expected: Local.ExpectedKind
) -> Maybe<&2, Local.Declaration>:
  match source:
    case Root.Source{+facts, _, _}: Recursive.find_declaration(facts, name, expected)

# Publish allocation chronology before any declaration or traversal refusal.
def catalog_allocated_frame(value: X.Frame, next: Nat) -> X.Frame:
  match value:
    case X.Frame{graph, command, forest, local, pending, captured, identities,
        edge, episode, _, dependencies, fingerprint}:
      X.Frame{graph, command, forest, local, pending, captured, identities,
        edge, episode, next, dependencies, fingerprint}

def catalog_allocated(+state: DriverState.State, catalog: Root.Source) -> DriverState.State:
  match catalog:
    case Root.Source{_, next, _}: DriverState.with_frame(
      state,
      catalog_allocated_frame(DriverState.frame(state), next)
    )

def file_attempt(
  +state: DriverState.State, +id: Nat, +target: DriverState.Target, +path: String,
  +source: T.SourceFacts, +bytes: Nat, +before: Nat,
  +catalog: Root.Source, +found: Maybe<&2, T.FactDeclaration>, +allowed: Bool
) -> DriverState.Selection:
  match target found allowed:
    case _ _ False{}: after(state, G.CaptureFailed{}, False{})
    case DriverState.FileTarget{_, +name, +edge} Some{_} True{}:
      file_catalog(state, id, edge, path, source, bytes, name, before, catalog,
        declaration_handle(catalog, name, edge_expected(edge)))
    case _ _ _: DriverState.InvariantFailed{state}

def prepared_file(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +source: T.SourceFacts,
  +bytes: Nat,
  +before: Nat,
  +catalog: Root.Source
) -> DriverState.Selection:
  match target:
    case DriverState.FileTarget{_, +name, +edge}:
      file_attempt(
        catalog_allocated(state, catalog),
        id,
        target,
        path,
        source,
        bytes,
        before,
        catalog,
        declaration(source, name, edge_expected(edge)),
        supported(declaration(source, name, edge_expected(edge)), edge_expected(edge))
      )
    case _: DriverState.InvariantFailed{state}

def prepare_file(+valid: Bool, +state: DriverState.State, +id: Nat, +target: DriverState.Target,
    +path: String, +source: T.SourceFacts, +bytes: Nat, +before: Nat) -> DriverState.Selection:
  match valid state:
    case False{} _: DriverState.Rejected{state, T.MalformedReply{}}
    case True{} DriverState.State{
      _,
      X.Frame{_, _, _, _, _, _, _, _, _, next, _, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      prepared_file(state, id, target, path, source, bytes, before, Root.source(source, next))

def edge_id(+edge: X.Edge) -> Nat:
  match edge:
    case X.Edge{+id, _, _, _}: id

def frontend(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +path: String,
  +bytes: Nat,
  +before: Nat,
  +outcome: T.SourceOutcome
) -> DriverState.Selection:
  match target outcome:
    case _ T.SourceUnsupported{}: after(state, G.CaptureFailed{}, False{})
    case DriverState.FileTarget{_, +name, +edge} T.SourceInspected{+source}:
      prepare_file(SourceValidation.source(source), state, id, target, path, source, bytes, before)
    case _ _: DriverState.InvariantFailed{state}

def python_inspected(
  +state: DriverState.State,
  id: Nat,
  target: DriverState.Target,
  path: String,
  bytes: Nat,
  before: Nat,
  facts: Maybe<&2, T.SourceFacts>,
  next: Nat
) -> DriverState.Selection:
  match facts:
    case None{}: frontend(
      with_next(state, next),
      id,
      target,
      path,
      bytes,
      before,
      T.SourceUnsupported{}
    )
    case Some{facts}: frontend(
      with_next(state, next),
      id,
      target,
      path,
      bytes,
      before,
      T.SourceInspected{facts}
    )



def python_inspect_begin(
  +state: DriverState.State,
  id: Nat,
  target: DriverState.Target,
  +path: String,
  capture: T.CaptureToken,
  bytes: Nat,
  before: Nat,
  observed: DriverState.Config
) -> DriverState.Selection:
  match observed:
    case DriverState.Config{owner, root, _, T.PythonSourceContext{branch}, _, _}:
      DriverState.ChildBegin{
        DriverState.stage(
          state,
          DriverState.PythonInspecting{id, target, path, bytes, before, None{}}
        ),
        P.Inspect{branch, path, root, capture, owner, next_request(state)}
      }
    case _: DriverState.InvariantFailed{state}

def bundle_catalog(
  +state: DriverState.State,
  +target: Nat,
  +edge: X.Edge,
  +declaration: T.FactDeclaration,
  +source: T.SourceFacts,
  +catalog: Root.Source,
  +bytes: Nat,
  found: Maybe<&2, Local.Declaration>
) -> DriverState.Selection:
  match declaration catalog found:
    case T.FactDeclaration{_, +artifact, _, _}
        Root.Source{Local.Facts{aware, _, imports, supporting}, next, entries}
        Some{+selected}:
      +clone : Root.Source = Root.Source{
        Local.Facts{
          aware,
          Map.set(
            &2,
            Maybe<&2, Local.Declaration>,
            MTip{},
            artifact_name(artifact),
            Some{selected}
          ),
          imports,
          supporting
        },
        next,
        entries
      }
      start_transaction(state, X.Attempt{target, edge, X.BundledChild{}, source, bytes,
        artifact_name(artifact), Local.AnyKind{}, selected, clone,
        X.local_work(X.frame_local(DriverState.frame(state)))})
    case _ _ _: DriverState.InvariantFailed{state}

def bundle_selected(+state: DriverState.State, +id: Nat, +edge: X.Edge,
    +declaration: T.FactDeclaration, +source: T.SourceFacts,
    +catalog: Root.Source, +bytes: Nat) -> DriverState.Selection:
  match declaration catalog:
    case T.FactDeclaration{key, _, _, _} Root.Source{Local.Facts{_, _, _, supporting}, _, _}:
      bundle_catalog(state, id, edge, declaration, source, catalog, bytes,
        Recursive.value(Maybe<&2, Local.Declaration>,
          Map.get(Maybe<&2, Local.Declaration>, None{}, supporting, key)))

def bundle_attempt(
  +state: DriverState.State,
  +id: Nat,
  +target: DriverState.Target,
  +bytes: Nat
) -> DriverState.Selection:
  match target:
    case DriverState.BundledTarget{declaration, source, catalog, edge}:
      bundle_selected(state, id, edge, declaration, source, catalog, bytes)
    case _: DriverState.InvariantFailed{state}

def final_clock(
  +state: DriverState.State,
  product: ArtifactValue.ProductValue,
  observed: DriverState.Config
) -> DriverState.Selection:
  match observed:
    case DriverState.Config{_, _, _, _, clock, _}: DriverState.request(
      state,
      DriverState.AwaitFinalDeadline{product},
      T.ReadClock{clock}
    )

def python_validated(
  +state: DriverState.State,
  product: ArtifactValue.ProductValue,
  valid: Bool
) -> DriverState.Selection:
  match valid:
    case False{}: DriverState.no_unit(state)
    case True{}: final_clock(state, product, config(state))



def python_validation_begin(
  +state: DriverState.State,
  product: ArtifactValue.ProductValue,
  separator: String,
  python: Maybe<&2, DriverState.PythonContext>,
  observed: DriverState.Config
) -> DriverState.Selection:
  match python observed:
    case Some{DriverState.PythonContext{session, _, census}} DriverState.Config{
      owner,
      _,
      _,
      _,
      clock,
      _
    }:
      DriverState.ChildBegin{
        DriverState.stage(state, DriverState.PythonValidating{product, None{}}),
        P.Revalidate{
          session,
          Budget.remaining_usage(source_usage(state, census), limits(DriverState.frame(state))),
          clock,
          separator,
          owner,
          next_request(state)
        }
      }
    case None{} _: DriverState.InvariantFailed{state}

def terminal_without_python(+state: DriverState.State,
  product: ArtifactValue.ProductValue, observed: DriverState.Config
) -> DriverState.Selection:
  match observed:
    # Entry's Go authority-validation owner performs the final deadline read.
    case DriverState.Config{_, _, T.GoLanguage{}, _, _, _}: DriverState.Success{
      state,
      Some{product}
    }
    case _: final_clock(state, product, config(state))

def terminal_product(
  +state: DriverState.State,
  product: ArtifactValue.ProductValue,
  python: Maybe<&2, DriverState.PythonContext>
) -> DriverState.Selection:
  match python:
    case None{}: terminal_without_python(state, product, config(state))
    case Some{_}: DriverState.internal(state, DriverState.PythonValidationStart{product})

def final_deadline(
  +state: DriverState.State,
  product: ArtifactValue.ProductValue,
  expired: Bool
) -> DriverState.Selection:
  match expired:
    case True{}: DriverState.no_unit(state)
    case False{}: DriverState.Success{state, Some{product}}

def completed(
  +state: DriverState.State,
  +product: ArtifactValue.ProductValue,
  +allowed: Bool
) -> DriverState.Selection:
  match allowed:
    case False{}: DriverState.no_unit(state)
    case True{}: terminal_product(state, product, python_context(state))

# Child steps are emitted separately. The saved request names an immutable
# continuation in the mechanical interpreter, not a production provider lease.
# Begin/resume/view all execute the existing PythonArtifact implementation.
def python_resume(
  +state: DriverState.State,
  pending: Maybe<&2, T.Request>,
  outcome: T.ServiceOutcome
) -> DriverState.Selection:
  match pending:
    case Some{+pending}: DriverState.ChildResume{state, pending, child_reply(pending, outcome)}
    case None{}: DriverState.InvariantFailed{state}

def optional_session(
  +state: DriverState.State,
  session: Maybe<&2, Python.Session>
) -> DriverState.State:
  match session:
    case None{}: state
    case Some{session}: synchronized(state, session)

def python_await_stage(
  +state: DriverState.State,
  +pending: T.Request,
  next: Nat,
  saved: DriverState.Stage
) -> DriverState.Selection:
  match saved:
    case DriverState.PythonImporting{edge, _}:
      child_request_at(state, DriverState.PythonImporting{edge, Some{pending}}, pending,
        Nat.is_eq(next, Nat.add(next_request(state), 1n)))
    case DriverState.PythonInspecting{id, target, path, bytes, before, _}:
      child_request_at(
        state,
        DriverState.PythonInspecting{id, target, path, bytes, before, Some{pending}},
        pending,
        Nat.is_eq(next, Nat.add(next_request(state), 1n))
      )
    case DriverState.PythonValidating{product, _}:
      child_request_at(state, DriverState.PythonValidating{product, Some{pending}}, pending,
        Nat.is_eq(next, Nat.add(next_request(state), 1n)))
    case _: DriverState.InvariantFailed{state}

def state_stage(state: DriverState.State) -> DriverState.Stage:
  match state:
    case DriverState.State{_, _, _, _, _, _, _, stage, _}: stage

def python_await(
  +state: DriverState.State,
  +pending: T.Request,
  next: Nat,
  valid: Bool
) -> DriverState.Selection:
  match valid:
    case False{}: DriverState.InvariantFailed{state}
    case True{}: python_await_stage(state, pending, next, state_stage(state))

def python_await_request(
  +state: DriverState.State,
  +pending: T.Request,
  next: Nat
) -> DriverState.Selection:
  match pending:
    case T.Request{owner, id, _}:
      python_await(
        state,
        pending,
        next,
        Bool.and(
          Nat.is_eq(owner, DriverState.invocation(config(state))),
          Nat.is_eq(id, next_request(state))
        )
      )

def python_returned(
  +state: DriverState.State,
  result: P.PythonResult,
  saved: DriverState.Stage
) -> DriverState.Selection:
  match result saved:
    case P.Resolved{+session, resolution} DriverState.PythonImporting{edge, _}:
      python_resolution(
        synchronized(state, session),
        edge,
        resolution,
        python_available(synchronized(state, session))
      )
    case P.Inspected{facts} DriverState.PythonInspecting{id, target, path, bytes, before, _}:
      python_inspected(state, id, target, path, bytes, before, facts, next_request(state))
    case P.Revalidated{session, valid} DriverState.PythonValidating{product, _}:
      python_validated(synchronized(state, session), product, valid)
    case _ _: DriverState.Rejected{state, T.WrongReplyKind{}}

def python_return_checked(
  +state: DriverState.State,
  result: P.PythonResult,
  valid: Bool
) -> DriverState.Selection:
  match valid:
    case False{}: DriverState.InvariantFailed{state}
    case True{}: python_returned(state, result, state_stage(state))

def python_failed(
  +state: DriverState.State,
  failure: T.TechnicalFailure,
  next: Maybe<&2, Nat>
) -> DriverState.Selection:
  match next:
    case None{}: DriverState.Rejected{state, failure}
    case Some{next}: DriverState.Rejected{with_next(state, next), failure}

def receive_python(+state: DriverState.State, view: P.PythonView) -> DriverState.Selection:
  match view:
    case P.Await{pending, session, next}: python_await_request(
      optional_session(state, session),
      pending,
      next
    )
    case P.Returned{result, next}: python_return_checked(
      state,
      result,
      Nat.is_eq(next, next_request(state))
    )
    case P.Failed{failure, session, next}: python_failed(
      optional_session(state, session),
      failure,
      next
    )

def choose(
  ~absolute: String -> Bool,
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~normalize: String -> String,
  ~extension: String -> String,
  +separator: String,
  +fuel: Nat,
  +state: DriverState.State
) -> DriverState.Selection:
  match state:
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.PythonInspectStart{id, target, path, capture, bytes, before},
      _
    }:
      python_inspect_begin(state, id, target, path, capture, bytes, before, config(state))
    case DriverState.State{_, _, _, _, _, _, _, DriverState.PythonValidationStart{product}, _}:
      python_validation_begin(state, product, separator, python_context(state), config(state))
    case DriverState.State{_, _, _, _, _, _, _, DriverState.Iteration{}, +python}: DriverState.iteration(
      state
    )
    case DriverState.State{
      _,
      X.Frame{_, +command, _, _, _, _, _, _, _, _, _, _},
      _,
      _,
      _,
      _,
      _,
      DriverState.Command{},
      +python
    }: dispatch_command(
      state,
      command
    )
    case DriverState.State{_, +frame, _, _, _, _, _, DriverState.AfterCommand{+skip}, +python}: DriverState.after_command(
      state,
      frame,
      skip
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.Resolve{+edge}, +python}: resolve(
      absolute,
      dirname,
      join,
      normalize,
      extension,
      separator,
      state,
      edge
    )
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.Scan{+edge, +choices, +existing},
      +python
    }: scan(
      absolute,
      separator,
      state,
      edge,
      choices,
      existing
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.Check{+id, +target}, +python}: check(
      state,
      id,
      target
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.Read{+id, +target}, +python}: read(
      state,
      id,
      target
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.Transaction{+transaction}, +python}: DriverState.transaction_selection(
      state,
      X.choose(fuel, transaction)
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.Completion{+partial}, +python}: DriverState.completion(
      fuel,
      state,
      partial
    )
    case _: DriverState.InvariantFailed{state}







def consume(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  ~expired: ArtifactValue.Binary64 -> Bool,
  +state: DriverState.State,
  +outcome: T.ServiceOutcome
) -> DriverState.Selection:
  match state outcome:
    case DriverState.State{_, _, _, _, _, _, _, DriverState.PythonImporting{_, pending}, _} _:
      python_resume(state, pending, outcome)
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.PythonInspecting{_, _, _, _, _, pending},
      _
    } _:
      python_resume(state, pending, outcome)
    case DriverState.State{_, _, _, _, _, _, _, DriverState.PythonValidating{_, pending}, _} _:
      python_resume(state, pending, outcome)
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitFinalDeadline{product}, _} T.ClockRead{
      bits
    }:
      final_deadline(state, product, Bool.or(expired(bits), Bool.not(python_available(state))))
    case _ T.ProviderRejected{+exception}: DriverState.Rejected{
      state,
      T.ForeignProviderFailure{exception}
    }
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitDeadline{}, +python} T.ClockRead{
      +bits
    }: deadline(
      state,
      Bool.or(expired(bits), Bool.not(python_available(state)))
    )
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.AwaitStatus{+edge, +path, +remaining, +existing},
      +python
    } T.StatusResult{
      +status
    }:
      status_reply(state, edge, path, remaining, existing, status)
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitChecked{_, _}, +python} T.AccessResult{
      +access
    }: after(
      state,
      G.PathChecked{access_allowed(access)},
      False{}
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitAuthorized{+id, +target}, +python} T.AccessResult{
      +access
    }: authorized(
      state,
      id,
      target,
      access
    )
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.AwaitSnapshot{+id, +target, +path, +selection},
      +python
    } T.CacheSnapshot{
      +entries
    }: snapshot(state, id, target, path, selection, entries)
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.AwaitLookup{+id, +target, +path, +selection},
      +python
    } T.CacheResult{
      +outcome
    }: lookup(dirname, join, relative, state, id, target, path, selection, outcome)
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.AwaitCapture{+id, +target, +path, _},
      +python
    } T.CaptureResult{
      +outcome
    }: capture(
      dirname,
      join,
      relative,
      state,
      id,
      target,
      path,
      outcome
    )
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.AwaitStored{+id, +target, +path, +capture, +bytes},
      +python
    } T.CacheStored{}: capture_ready(
      dirname,
      join,
      relative,
      state,
      id,
      target,
      path,
      capture,
      bytes
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitDiagnostic{}, +python} T.DiagnosticObserved{}: after(
      state,
      G.CaptureFailed{},
      False{}
    )
    case DriverState.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      DriverState.AwaitFrontend{+id, +target, +path, _, +bytes, +before},
      +python
    } T.FrontendResult{
      +outcome
    }: frontend(
      state,
      id,
      target,
      path,
      bytes,
      before,
      outcome
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitBundleBytes{+id, +target}, +python} T.SourceTextEncoded{
      +bytes
    }: bundle_attempt(
      state,
      id,
      target,
      bytes
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.Transaction{+transaction}, +python} _: DriverState.transaction_selection(
      state,
      X.Continue{X.consume(transaction, outcome)}
    )
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitCompletion{+product}, +python} T.ProductEncoded{
      +bytes
    }: completed(
      state,
      product,
      Nat.is_le(bytes, tree_cap(limits(DriverState.frame(state))))
    )
    case _ _: DriverState.Rejected{state, T.WrongReplyKind{}}

# Same stateful operation-selected environment as preparation. A suspended
# request retains its continuation and matching completion consumes it once in
# the returned progress; global lease/replay/late cleanup is a fixed-runtime duty.
def child_completed(
  -World: Data,
  progress: DriverState.Progress<World>,
  view: P.PythonView
) -> DriverState.Progress<World>:
  match progress:
    case DriverState.DriverChildBegin{state, _, world}: DriverState.consumed(
      World,
      receive_python(state, view),
      world
    )
    case DriverState.DriverChildResume{state, _, _, world}: DriverState.consumed(
      World,
      receive_python(state, view),
      world
    )
    case _: progress

def exchanged(
  ~consume: DriverState.State -> T.ServiceOutcome -> DriverState.Selection,
  -World: Data,
  request: T.Request,
  state: DriverState.State,
  +exchange: E.Exchange<World>
) -> DriverState.Progress<World>:
  match exchange:
    case E.Delivered{world, +reply}:
      DriverState.delivered(consume, World, request, state, reply, world)
    case E.Waiting{_, _, _}: DriverState.DriverWaiting{state, exchange}


def issue(
  ~consume: DriverState.State -> T.ServiceOutcome -> DriverState.Selection,
  -World: Data,
  respond: T.Operation -> World -> E.Response<World>,
  +state: DriverState.State,
  +operation: T.Operation,
  +world: E.WorldState<World>
) -> DriverState.Progress<World>:
  match state:
    case DriverState.State{
      +config,
      +frame,
      +targets,
      +ids,
      +target,
      +next,
      +iterations,
      +stage,
      +python
    }:
      exchanged(
        consume,
        World,
        T.Request{DriverState.invocation(config), next, operation},
        DriverState.State{
          config,
          frame,
          targets,
          ids,
          target,
          (next + 1n : Nat),
          iterations,
          stage,
          python
        },
        E.step(World, respond, T.Request{DriverState.invocation(config), next, operation}, world)
      )

def selected_step(
  ~consume: DriverState.State -> T.ServiceOutcome -> DriverState.Selection,
  -World: Data,
  respond: T.Operation -> World -> E.Response<World>,
  +selection: DriverState.Selection,
  +world: E.WorldState<World>
) -> DriverState.Progress<World>:
  match selection:
    case DriverState.Selected{+state, +operation}: issue(
      consume,
      World,
      respond,
      state,
      operation,
      world
    )
    case +other: DriverState.consumed(World, other, world)

def advance(
  ~choose: DriverState.State -> DriverState.Selection,
  ~consume: DriverState.State -> T.ServiceOutcome -> DriverState.Selection,
  -World: Data,
  respond: T.Operation -> World -> E.Response<World>,
  +progress: DriverState.Progress<World>
) -> DriverState.Progress<World>:
  match progress:
    case DriverState.DriverReady{+state, +world}: selected_step(
      consume,
      World,
      respond,
      choose(state),
      world
    )
    case DriverState.DriverSelected{+state, +operation, +world}: issue(
      consume,
      World,
      respond,
      state,
      operation,
      world
    )
    case +other: other

def completed_exchange(
  ~consume: DriverState.State -> T.ServiceOutcome -> DriverState.Selection,
  -World: Data,
  state: DriverState.State,
  +exchange: E.Exchange<World>,
  completion: E.Completion<World>
) -> DriverState.Progress<World>:
  match exchange:
    case E.Waiting{_, request, _}:
      exchanged(consume, World, request, state, E.complete(World, exchange, completion))
    case E.Delivered{_, _}: DriverState.DriverWaiting{state, exchange}

def complete(
  ~consume: DriverState.State -> T.ServiceOutcome -> DriverState.Selection,
  -World: Data,
  +progress: DriverState.Progress<World>,
  +completion: E.Completion<World>
) -> DriverState.Progress<World>:
  match progress:
    case DriverState.DriverWaiting{state, exchange}: completed_exchange(
      consume,
      World,
      state,
      exchange, completion
    )
    case +other: other

def cancel_world(
  -World: Data,
  +config: DriverState.Config,
  +world: E.WorldState<World>
) -> E.WorldState<World>:
  match world:
    case E.WorldState{+world, +effects}:
      E.WorldState{
        world,
        List.append(&2, O.Effect, effects, [O.CancelledInvocation{DriverState.invocation(config)}])
      }

def cancelled(
  -World: Data,
  +state: DriverState.State,
  +world: E.WorldState<World>
) -> DriverState.Progress<World>:
  DriverState.DriverFailed{
    state,
    T.InvocationCancelled{},
    cancel_world(World, config(state), world)
  }

def cancel(-World: Data, +progress: DriverState.Progress<World>) -> DriverState.Progress<World>:
  match progress:
    case DriverState.DriverReady{+state, +world}: cancelled(World, state, world)
    case DriverState.DriverChildBegin{state, _, world}: cancelled(World, state, world)
    case DriverState.DriverChildResume{state, _, _, world}: cancelled(World, state, world)
    case DriverState.DriverSelected{+state, _, +world}: cancelled(World, state, world)
    case DriverState.DriverWaiting{+state, E.Waiting{+world, _, _}}: cancelled(World, state, world)
    case +other: other

def main() -> Unit:
  Unit{}
