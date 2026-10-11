import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ./BoundaryValidationSpecification.bend as Boundary
import ./Types.bend as T
import ./go-module/ArtifactProtocol.bend as GoProtocol
import ./go-module/PreparationModel.bend as Go
import ./Environment.bend as E
import ./WholeObservation.bend as O
import ./PreparationSpecification.bend as P
import ./RustSpecification.bend as Rust
import ./SPEC.bend as Root
import ./ForestSpecification.bend as F
import ./ForestAllowance.bend as Allowance
import ./ExpansionSpecification.bend as X
import ./ExpansionDriverSpecification.bend as D
import ./SourceValidationSpecification.bend as SourceValidation
import ./GraphSpecification.bend as Policy
import ./SignedLocalSpecification.bend as Signed
import ./traversal/core.bend as Local
import ./traversal/SPEC.bend as Recursive
import ./traversal/RELATION.bend as LocalRelation
import ../../../../agent-flow-bend/ImportGraph.bend as G
import ../../../../agent-flow-bend/GraphLimits.bend as Profile

# Independent complete entry. The native frame is never an input. Preparation,
# root construction and expansion share one world, clock and request chronology.
# No new laws: the original whole/local obligations remain acceptance gates.
type Stage is Data:
  Starting{}
  AwaitClock{}
  LanguageAdmission{}
  PythonAdmission{}
  GoAdmission{}
  GoPreparing{}
  GoInspecting{}
  AwaitGoRootDeadline{prepared: Go.Prepared}
  AwaitGoPublicationClock{driver: D.State, product: Maybe<&2, ArtifactValue.ProductValue>}
  GoPublished{}
  AwaitPythonDeadline{}
  RootAdmission{}
  RustAdmission{binding: Bool}
  AwaitRustDeadline{}
  AwaitRootDeadline{}
  AwaitRootFacts{}
  AwaitRootBytes{frame: X.Frame, product: ArtifactValue.ProductValue}
  AwaitGraphProfileRejection{}
type State is Data:
  State{
    input: T.ResolverInput,
    clock: Maybe<&2, T.ClockToken>,
    language: Maybe<&2, T.Language>,
    frontend: Maybe<&2, T.FrontendContext>,
    limits: G.Limits,
    dependencies: List<&2, String>,
    next_request: Nat,
    stage: Stage,
    preparation: Maybe<&2, Rust.Preparation>,
    preparation_cache: Maybe<&2, T.CacheToken>,
    root_local: Maybe<&2, Recursive.State>,
    selected_root_identity: Maybe<&2, String>
  , fingerprint: Maybe<&2, String>}
type Selection is Data:
  Internal{state: State}
  Selected{state: State, operation: T.Operation}
  Prepare{state: State, clock: T.ClockToken}
  Launch{state: State, expansion: D.State}
  GoChild{state: State, command: GoProtocol.GoCommand}
  GoCompleted{state: State, driver: D.State, product: Maybe<&2, ArtifactValue.ProductValue>}
  NoUnit{state: State, retained: Maybe<&2, Root.RejectedRoot>}
  EvaluationExhausted{state: State}
  InvariantFailed{state: State}
  Rejected{state: State, failure: T.TechnicalFailure}
type Progress<-World: Data> is Data:
  EntryReady{state: State, world: E.WorldState<World>}
  EntrySelected{state: State, operation: T.Operation, world: E.WorldState<World>}
  EntryWaiting{state: State, exchange: E.Exchange<World>}
  EntryPreparing{state: State, progress: P.Progress<World>}
  EntryExpanding{state: State, progress: D.Progress<World>}
  EntryGoChildBegin{state: State, command: GoProtocol.GoCommand, world: E.WorldState<World>}
  EntryGoChildAdvance{state: State, world: E.WorldState<World>}
  EntryGoChildResume{state: State, request: T.Request, reply: T.Reply, world: E.WorldState<World>}
  EntryGoChildWaiting{state: State, exchange: E.Exchange<World>}
  EntryFinished{state: State, world: E.WorldState<World>, retained: Maybe<&2, Root.RejectedRoot>}
  EntryExhausted{state: State, world: E.WorldState<World>}
  EntryInvalid{state: State, world: E.WorldState<World>}
  EntryFailed{state: State, failure: T.TechnicalFailure, world: E.WorldState<World>}

def fingerprint(state: State) -> Maybe<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, _, fingerprint}: fingerprint

def with_fingerprint(state: State, fingerprint: Maybe<&2, String>) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next,
      stage,
      preparation,
      cache,
      local,
      identity,
      _
    }:
      State{
        input,
        clock,
        language,
        frontend,
        limits,
        dependencies,
        next,
        stage,
        preparation,
        cache,
        local,
        identity,
        fingerprint
      }

def input(state: State) -> T.ResolverInput:
  match state:
    case State{input, _, _, _, _, _, _, _, _, _, _, _, _}: input

def with_input(state: State, input: T.ResolverInput) -> State:
  match state:
    case State{
      _,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def clock(state: State) -> Maybe<&2, T.ClockToken>:
  match state:
    case State{_, clock, _, _, _, _, _, _, _, _, _, _, _}: clock

def with_clock(state: State, clock: Maybe<&2, T.ClockToken>) -> State:
  match state:
    case State{
      input,
      _,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def language(state: State) -> Maybe<&2, T.Language>:
  match state:
    case State{_, _, language, _, _, _, _, _, _, _, _, _, _}: language

def with_language(state: State, language: Maybe<&2, T.Language>) -> State:
  match state:
    case State{
      input,
      clock,
      _,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def frontend(state: State) -> Maybe<&2, T.FrontendContext>:
  match state:
    case State{_, _, _, frontend, _, _, _, _, _, _, _, _, _}: frontend

def with_frontend(state: State, frontend: Maybe<&2, T.FrontendContext>) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      _,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def limits(state: State) -> G.Limits:
  match state:
    case State{_, _, _, _, limits, _, _, _, _, _, _, _, _}: limits

def with_limits(state: State, limits: G.Limits) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      _,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def dependencies(state: State) -> List<&2, String>:
  match state:
    case State{_, _, _, _, _, dependencies, _, _, _, _, _, _, _}: dependencies

def with_dependencies(state: State, dependencies: List<&2, String>) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      limits,
      _,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def with_prepared_language(state: State, prepared: T.PreparedLanguage) -> State:
  match prepared:
    case T.PreparedLanguage{limits, dependencies, fingerprint}:
      with_fingerprint(with_dependencies(with_limits(state, limits), dependencies), fingerprint)

def next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, _, next_request, _, _, _, _, _, _}: next_request

def with_next_request(state: State, next_request: Nat) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      _,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, _, stage, _, _, _, _, _}: stage

def with_stage(state: State, stage: Stage) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      _,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def preparation(state: State) -> Maybe<&2, Rust.Preparation>:
  match state:
    case State{_, _, _, _, _, _, _, _, preparation, _, _, _, _}: preparation

def with_preparation(state: State, preparation: Maybe<&2, Rust.Preparation>) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      _,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def preparation_cache(state: State) -> Maybe<&2, T.CacheToken>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, preparation_cache, _, _, _}: preparation_cache

def with_preparation_cache(state: State, preparation_cache: Maybe<&2, T.CacheToken>) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      _,
      root_local,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def root_local(state: State) -> Maybe<&2, Recursive.State>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, root_local, _, _}: root_local

def with_root_local(state: State, root_local: Maybe<&2, Recursive.State>) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      _,
      selected_root_identity
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def selected_root_identity(state: State) -> Maybe<&2, String>:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, _, selected_root_identity, _}: selected_root_identity

def with_selected_root_identity(state: State, selected_root_identity: Maybe<&2, String>) -> State:
  match state:
    case State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      _
    , fingerprint}: State{
      input,
      clock,
      language,
      frontend,
      limits,
      dependencies,
      next_request,
      stage,
      preparation,
      preparation_cache,
      root_local,
      selected_root_identity
    , fingerprint}

def input_invocation(input: T.ResolverInput) -> Nat:
  match input:
    case T.ResolverInput{invocation, _, _, _, _, _, _, _, _}: invocation

def input_path(input: T.ResolverInput) -> String:
  match input:
    case T.ResolverInput{_, path, _, _, _, _, _, _, _}: path

def input_capture(input: T.ResolverInput) -> T.CaptureToken:
  match input:
    case T.ResolverInput{_, _, capture, _, _, _, _, _, _}: capture

def input_bytes(input: T.ResolverInput) -> Nat:
  match input:
    case T.ResolverInput{_, _, _, bytes, _, _, _, _, _}: bytes

def input_name(input: T.ResolverInput) -> String:
  match input:
    case T.ResolverInput{_, _, _, _, name, _, _, _, _}: name

def input_source(input: T.ResolverInput) -> String:
  match input:
    case T.ResolverInput{_, _, _, _, _, source, _, _, _}: source

def input_branch(input: T.ResolverInput) -> T.Branch:
  match input:
    case T.ResolverInput{_, _, _, _, _, _, branch, _, _}: branch

def input_cache(input: T.ResolverInput) -> Maybe<&2, T.CacheToken>:
  match input:
    case T.ResolverInput{_, _, _, _, _, _, _, cache, _}: cache

def input_limits(input: T.ResolverInput) -> G.Limits:
  match input:
    case T.ResolverInput{_, _, _, _, _, _, _, _, limits}: limits

def begin(-World: Data, +input: T.ResolverInput, next: Nat,
    world: E.WorldState<World>) -> Progress<World>:
  EntryReady{
    State{
      input,
      None{},
      None{},
      None{},
      input_limits(input),
      [],
      next,
      Starting{},
      None{},
      None{},
      None{},
      None{}
    , None{}},
    world
  }

def language_for(extension: String) -> Maybe<&2, T.Language>:
  match extension:
    case ".ts": Some{T.TypeScriptLanguage{}}
    case ".tsx": Some{T.TypeScriptLanguage{}}
    case ".mts": Some{T.TypeScriptLanguage{}}
    case ".cts": Some{T.TypeScriptLanguage{}}
    case ".rs": Some{T.RustLanguage{}}
    case ".bend": Some{T.BendLanguage{}}
    case ".py": Some{T.PythonLanguage{}}
    case ".go": Some{T.GoLanguage{}}
    case _: None{}

def word_char(+char: Char) -> Bool:
  Bool.or(Char.is_alpha(char), Bool.or(Char.is_digit(char), Char.is_eq(char, '_')))

def leading_word(text: String) -> Bool:
  match text:
    case SNil{}: False{}
    case SCon{head, _}: word_char(head)

def binding_scan(text: String, previous: Bool) -> Bool:
  match text:
    case SNil{}: False{}
    case SCon{+head, +tail}:
      Bool.or(Bool.and(Bool.not(previous),
        Bool.and(Bool.or(String.starts_with(SCon{head, tail}, "use"),
          String.starts_with(SCon{head, tail}, "mod")),
          Bool.not(leading_word(String.drop(SCon{head, tail}, 3n))))),
        binding_scan(tail, word_char(head)))

def needs_binding(+text: String) -> Bool:
  Bool.or(String.contains(text, "::"), binding_scan(text, False{}))

def context(language: T.Language, branch: T.Branch, role: T.RustContext) -> T.FrontendContext:
  match language:
    case T.TypeScriptLanguage{}: T.TypeScriptContext{branch}
    case T.BendLanguage{}: T.BendSourceContext{branch}
    case T.PythonLanguage{}: T.PythonSourceContext{branch}
    case T.GoLanguage{}: T.GoSourceContext{branch}
    case T.RustLanguage{}: T.RustSourceContext{branch, role}

def selected(+state: State, stage: Stage, operation: T.Operation) -> Selection:
  Selected{with_stage(state, stage), operation}

def root_available(limits: G.Limits, bytes: Nat) -> Bool:
  match limits:
    case G.Limits{_, _, _, files, read, _, _, work}:
      Bool.and(Nat.is_ge(files, 1n), Bool.and(Nat.is_ge(work, 1n), Nat.is_ge(read, bytes)))

def deadline_selected(
  +state: State,
  next: Stage,
  available: Bool,
  clock: Maybe<&2, T.ClockToken>
) -> Selection:
  match available clock:
    case True{} Some{clock}: selected(state, next, T.ReadClock{clock})
    case False{} _: NoUnit{state, None{}}
    case _ _: InvariantFailed{state}

def request_deadline(+state: State, next: Stage, available: Bool) -> Selection:
  deadline_selected(state, next, available, clock(state))

def selected_language(+state: State, selected: Maybe<&2, T.Language>) -> Selection:
  match selected:
    case None{}: NoUnit{state, None{}}
    case Some{T.RustLanguage{}}:
      Internal{
        with_stage(
          with_language(
            with_frontend(
              state,
              Some{
                T.RustSourceContext{
                  input_branch(input(state)),
                  T.RustContext{None{}, None{}, None{}}
                }
              }
            ),
            Some{T.RustLanguage{}}
          ),
          RustAdmission{needs_binding(input_source(input(state)))}
        )
      }
    case Some{T.PythonLanguage{}}:
      Internal{with_stage(with_language(with_frontend(state,
        Some{T.PythonSourceContext{input_branch(input(state))}}),
        Some{T.PythonLanguage{}}), PythonAdmission{})}
    case Some{T.GoLanguage{}}:
      Internal{with_stage(with_language(with_frontend(state,
        Some{T.GoSourceContext{input_branch(input(state))}}), Some{T.GoLanguage{}}), GoAdmission{})}
    case Some{+language}:
      Internal{with_stage(with_language(with_frontend(state,
        Some{context(language, input_branch(input(state)), T.RustContext{None{}, None{}, None{}})}),
        Some{language}), RootAdmission{})}

def rust_clock(+state: State, binding: Bool, clock: Maybe<&2, T.ClockToken>) -> Selection:
  match binding clock:
    case True{} Some{clock}: Prepare{state, clock}
    case False{} _: request_deadline(
      state,
      AwaitRustDeadline{},
      Rust.adapter_budget(False{}, limits(state))
    )
    case _ _: InvariantFailed{state}

def rust_admission(+state: State, binding: Bool) -> Selection:
  rust_clock(state, binding, clock(state))

# Entry owns admission and chronology; the existing Go child owns package policy.
def go_admission(+state: State, clock: Maybe<&2, T.ClockToken>) -> Selection:
  match clock:
    case Some{clock}: GoChild{with_stage(state, GoPreparing{}), GoProtocol.GoPrepare{Go.Input{
      input_invocation(input(state)), next_request(state), input_path(input(state)),
      input_capture(input(state)), input_bytes(input(state)), input_branch(input(state)),
      clock, input_cache(input(state)), limits(state), None{}, None{}}}}
    case None{}: InvariantFailed{state}

def go_root_deadline(+state: State, +prepared: Go.Prepared, expired: Bool) -> Selection:
  match expired:
    case True{}: NoUnit{state, None{}}
    case False{}: GoChild{with_stage(state, GoInspecting{}), GoProtocol.GoInspect{
      prepared, input_path(input(state)), input_branch(input(state)), next_request(state)}}

def go_publication(+state: State, driver: D.State,
    product: Maybe<&2, ArtifactValue.ProductValue>, expired: Bool) -> Selection:
  match expired:
    case True{}: GoCompleted{with_stage(state, GoPublished{}), driver, None{}}
    case False{}: GoCompleted{with_stage(state, GoPublished{}), driver, product}

def choose_stage(~extension: String -> String, +state: State, stage: Stage) -> Selection:
  match stage:
    case Starting{}: selected(state, AwaitClock{}, T.StartClock{})
    case LanguageAdmission{}: selected_language(state,
      language_for(String.to_lower(extension(input_path(input(state))))))
    case PythonAdmission{}: request_deadline(state, AwaitPythonDeadline{}, True{})
    case GoAdmission{}: go_admission(state, clock(state))
    case RootAdmission{}: request_deadline(state, AwaitRootDeadline{},
      root_available(limits(state), input_bytes(input(state))))
    case RustAdmission{binding}: rust_admission(state, binding)
    case _: InvariantFailed{state}

def choose(~extension: String -> String, +state: State) -> Selection:
  choose_stage(~extension, state, stage(state))

def root_identity(artifact: T.Artifact) -> String:
  match artifact:
    case T.Artifact{_, _, identity, _, _, _, _, _}: identity

def register(items: List<&2, F.Pending>, +source: T.SourceFacts, +catalog: Root.Source,
    +next: Nat) -> List<&2, X.Edge>:
  match items:
    case []: []
    case head <> tail: X.Edge{next, head, source, catalog} <>
      register(tail, source, catalog, (next + 1n : Nat))

def root_artifact(created: F.Created) -> Maybe<&2, T.Artifact>:
  match created:
    case F.Created{_, F.Node{_, artifact, _} <> _, _}: Some{artifact}
    case _: None{}

def root_profiled(state: State, frame: X.Frame, +product: ArtifactValue.ProductValue,
    violation: Maybe<&2, String>) -> Selection:
  match violation:
    case Some{message}: selected(state, AwaitGraphProfileRejection{}, T.CreateRangeError{message})
    case None{}: selected(state, AwaitRootBytes{frame, product}, T.EncodeProduct{product})

def root_materialized(+state: State, +frame: X.Frame, value: F.Materialization) -> Selection:
  match value:
    case F.Materialized{product}: root_profiled(
      state,
      frame,
      product,
      Profile.violation(limits(state))
    )
    case F.MaterializationExhausted{}: EvaluationExhausted{state}
    case F.MaterializationInvalid{}: InvariantFailed{state}

def catalog_next(catalog: Root.Source) -> Nat:
  match catalog:
    case Root.Source{_, next, _}: next

def catalog_artifacts(catalog: Root.Source) -> List<&2, T.ArtifactEntry>:
  match catalog:
    case Root.Source{_, _, entries}: entries

def addresses(created: F.Created) -> List<&2, F.AddressEntry>:
  match created:
    case F.Created{_, _, addresses}: addresses

def root_pending(+state: State, +source: T.SourceFacts, +catalog: Root.Source,
    +local: Recursive.State, +created: F.Created, pending: F.PendingResult,
    artifact: Maybe<&2, T.Artifact>, identity: Maybe<&2, String>) -> Selection:
  match created pending artifact identity:
    case F.Created{root, nodes, _} F.PendingBuilt{+items} Some{_} Some{identity}:
      +forest : F.Forest = F.Forest{Some{root}, nodes}
      +frame : X.Frame = X.Frame{
        Policy.bounded_initial(limits(state)),
        G.NoCommand{},
        forest,
        Signed.State{local, O.Nonnegative{0n}},
        register(items, source, catalog, 1n),
        [X.Captured{input_path(input(state)), source, input_bytes(input(state))}],
        [X.TargetArtifact{1n, identity}],
        (List.length(&2, F.Pending, items) + 1n : Nat),
        2n,
        catalog_next(catalog),
        dependencies(state)
      , fingerprint(state)}
      root_materialized(
        state,
        frame,
        F.prepared_unit(
          Allowance.materialization(forest),
          forest,
          dependencies(state),
          fingerprint(state)
        )
      )
    case _ _ _ _: InvariantFailed{state}

def root_created(+state: State, +source: T.SourceFacts, +catalog: Root.Source,
    +local: Recursive.State, created: F.Construction) -> Selection:
  match local created:
    case Recursive.State{visited, budget, next, +pending} F.Constructed{+created}:
      root_pending(
        state,
        source,
        catalog,
        Recursive.State{visited, budget, next, pending},
        created,
        F.pending(List.reverse(&2, Local.Pending, pending), addresses(created)),
        root_artifact(created),
        selected_root_identity(state)
      )
    case _ F.ConstructionExhausted{}: EvaluationExhausted{state}
    case _ _: InvariantFailed{state}

def catalog_facts(catalog: Root.Source) -> Local.Facts:
  match catalog:
    case Root.Source{facts, _, _}: facts

def root_built(+state: State, source: T.SourceFacts, result: Root.RootResult) -> Selection:
  match result:
    case Root.RootMissing{local, retained}: NoUnit{with_root_local(state, local), retained}
    case Root.EvaluationExhausted{local}: EvaluationExhausted{with_root_local(state, Some{local})}
    case Root.RootBuilt{+local, tree, +catalog}:
      root_created(
        with_root_local(state, Some{local}),
        source,
        catalog,
        local,
        F.construct(LocalRelation.spec_bound(catalog_facts(catalog)), tree,
          1n, [], catalog_artifacts(catalog))
      )

def original_identity(declaration: Maybe<&2, Local.Declaration>) -> Maybe<&2, String>:
  match declaration:
    case None{}: None{}
    case Some{Local.Declaration{_, identity, _, _, _, _}}: Some{identity}

def root_validated(valid: Bool, +state: State, +source: T.SourceFacts) -> Selection:
  match valid:
    case False{}: Rejected{state, T.MalformedReply{}}
    case True{}:
      +catalog : Root.Source = Root.source(source, 0n)
      root_built(
        with_selected_root_identity(
          state,
          original_identity(
            Recursive.find_declaration(
              catalog_facts(catalog),
              input_name(input(state)),
              Root.root_expected(input_branch(input(state)))
            )
          )
        ),
        source,
        Root.root(
          LocalRelation.spec_bound(catalog_facts(catalog)),
          catalog,
          input_path(input(state)),
          input_name(input(state)),
          input_branch(input(state)),
          limits(state)
        )
      )

def root_facts(+state: State, source: T.SourceOutcome) -> Selection:
  match source:
    case T.SourceUnsupported{}: NoUnit{state, None{}}
    case T.SourceInspected{+source}: root_validated(SourceValidation.source(source), state, source)

def edge_ids(items: List<&2, X.Edge>) -> List<&2, Nat>:
  match items:
    case []: []
    case X.Edge{id, _, _, _} <> tail: id <> edge_ids(tail)

def local_work(budget: Local.Budget) -> Nat:
  match budget:
    case Local.Budget{_, _, _, work, _, _}: work

def graph_state(step: G.BoundedStep) -> G.Bounded:
  match step:
    case G.BoundedStep{state, _}: state

def graph_command(step: G.BoundedStep) -> G.Command:
  match step:
    case G.BoundedStep{_, command}: command

def initialize(+frame: X.Frame, bytes: Nat, tree: Nat) -> X.Frame:
  match frame:
    case X.Frame{
      graph,
      _,
      forest,
      +local,
      +pending,
      captured,
      identities,
      next_edge,
      episode,
      artifact,
      deps
    , fingerprint}:
      +step : G.BoundedStep = Policy.bounded_transition(
        graph,
        G.Root{
          1n,
          bytes,
          tree,
          local_work(Recursive.state_budget(Signed.local(local))),
          edge_ids(pending)
        }
      )
      X.Frame{
        graph_state(step),
        graph_command(step),
        forest,
        local,
        pending,
        captured,
        identities,
        next_edge,
        episode,
        artifact,
        deps
      , fingerprint}

def function_branch(branch: T.Branch) -> Bool:
  match branch:
    case T.FunctionBranch{}: True{}
    case _: False{}

def launch(+state: State, frame: X.Frame, bytes: Nat) -> Selection:
  match state:
    case State{
      +input,
      Some{+clock},
      Some{+language},
      Some{frontend},
      _,
      _,
      +next,
      _,
      _,
      _,
      _,
      _,
      fingerprint
    }:
      Launch{
        state,
        D.begin(
          D.Config{
            input_invocation(input),
            input_path(input),
            language,
            frontend,
            clock,
            input_cache(input)
          },
          initialize(frame, input_bytes(input), bytes),
          [],
          [
            D.TargetId{
              input_path(
                input
              ) ++ "\0" ++ Bool.pick(
                String,
                function_branch(input_branch(input)),
                "function",
                "type"
              ) ++ "\0" ++ input_name(input),
              1n
            }
          ],
          2n,
          next
        )
      }
    case _: InvariantFailed{state}

def root_context(+state: State, expired: Bool, frontend: Maybe<&2, T.FrontendContext>) -> Selection:
  match expired frontend:
    case True{} _: NoUnit{state, None{}}
    case False{} Some{context}: selected(state, AwaitRootFacts{},
      T.InspectSource{input_path(input(state)), input_capture(input(state)), context})
    case _ _: InvariantFailed{state}

def root_deadline(+state: State, expired: Bool) -> Selection:
  root_context(state, expired, frontend(state))

def consume_stage(
  ~expired: ArtifactValue.Binary64 -> Bool,
  +state: State,
  stage: Stage,
  outcome: T.ServiceOutcome
) -> Selection:
  match stage outcome:
    case AwaitClock{} T.ClockStarted{clock}: Internal{
      with_stage(with_clock(state, Some{clock}), LanguageAdmission{})
    }
    case AwaitPythonDeadline{} T.ClockRead{bits}:
      Bool.pick(Selection, expired(bits), NoUnit{state, None{}},
        Internal{with_stage(state, RootAdmission{})})
    case AwaitRustDeadline{} T.ClockRead{bits}:
      Bool.pick(
        Selection,
        expired(bits),
        NoUnit{state, None{}},
        Internal{with_stage(state, RootAdmission{})}
      )
    case AwaitRootDeadline{} T.ClockRead{bits}: root_deadline(state, expired(bits))
    case AwaitGoRootDeadline{prepared} T.ClockRead{bits}: go_root_deadline(
      state,
      prepared,
      expired(bits)
    )
    case AwaitGoPublicationClock{driver, product} T.ClockRead{bits}: go_publication(
      state,
      driver,
      product,
      expired(bits)
    )
    case AwaitRootFacts{} T.FrontendResult{source}: root_facts(state, source)
    case AwaitRootBytes{frame, _} T.ProductEncoded{bytes}: launch(state, frame, bytes)
    case _ T.ProviderRejected{exception}: Rejected{state, T.ForeignProviderFailure{exception}}
    case _ _: Rejected{state, T.WrongReplyKind{}}

def consume(
  ~expired: ArtifactValue.Binary64 -> Bool,
  +state: State,
  outcome: T.ServiceOutcome
) -> Selection:
  consume_stage(~expired, state, stage(state), outcome)

def optional_role(role: Maybe<&2, T.RustContext>) -> T.RustContext:
  match role:
    case Some{role}: role
    case None{}: T.RustContext{None{}, None{}, None{}}

def prepared_state(+state: State, +prep: Rust.Preparation, next: Nat) -> State:
  with_stage(with_next_request(with_dependencies(with_frontend(with_limits(state,
    Rust.remaining(input_limits(input(state)), prep, input_bytes(input(state)))),
    Some{T.RustSourceContext{input_branch(input(state)), optional_role(Rust.role(prep))}}),
    Rust.sorted_dependencies(prep)), next), RustAdmission{False{}})

# Binding preparation has its own adapter budget check. After preparation this
# still requires read >= source, unlike the no-binding Rust adapter path.
def prepared_budget(+state: State, available: Bool) -> Selection:
  match available:
    case True{}: request_deadline(state, AwaitRustDeadline{}, True{})
    case False{}: NoUnit{state, None{}}

def consumed(-World: Data, selection: Selection, world: E.WorldState<World>) -> Progress<World>:
  match selection:
    case Internal{state}: EntryReady{state, world}
    case Selected{state, operation}: EntrySelected{state, operation, world}
    case Prepare{+state, clock}: EntryPreparing{state,
      P.begin(World, input(state), clock, next_request(state), world)}
    case Launch{state, expansion}: EntryExpanding{state, D.DriverReady{expansion, world}}
    case GoChild{state, command}: EntryGoChildBegin{state, command, world}
    case GoCompleted{state, driver, product}: EntryExpanding{
      state,
      D.DriverFinished{driver, product, world}
    }
    case NoUnit{state, retained}: EntryFinished{state, world, retained}
    case EvaluationExhausted{state}: EntryExhausted{state, world}
    case InvariantFailed{state}: EntryInvalid{state, world}
    case Rejected{state, failure}: EntryFailed{state, failure, world}

def go_prepared(+state: State, +prepared: Go.Prepared) -> Selection:
  match prepared:
    case Go.Prepared{_, _, dependencies, fingerprint, +limits}:
      +ready: State = with_prepared_language(
        state,
        T.PreparedLanguage{limits, dependencies, Some{fingerprint}}
      )
      request_deadline(
        ready,
        AwaitGoRootDeadline{prepared},
        root_available(limits, input_bytes(input(ready)))
      )

def go_returned(+state: State, stage: Stage, result: GoProtocol.GoResult) -> Selection:
  match stage result:
    case GoPreparing{} GoProtocol.GoUnavailable{}: NoUnit{state, None{}}
    case GoPreparing{} GoProtocol.GoPrepared{prepared}: go_prepared(state, prepared)
    case GoInspecting{} GoProtocol.GoInspected{Some{facts}}: root_facts(
      state,
      T.SourceInspected{facts}
    )
    case GoInspecting{} GoProtocol.GoInspected{None{}}: NoUnit{state, None{}}
    case _ _: Rejected{state, T.MalformedReply{}}

def go_exchanged(-World: Data, state: State, request: T.Request,
    exchange: E.Exchange<World>) -> Progress<World>:
  match exchange:
    case E.Delivered{world, reply}: EntryGoChildResume{state, request, reply, world}
    case exchange: EntryGoChildWaiting{state, exchange}

def go_await_checked(
  -World: Data,
  state: State,
  +request: T.Request,
  next: Nat,
  respond: T.Operation -> World -> E.Response<World>,
  world: E.WorldState<World>,
  valid: Bool
) -> Progress<World>:
  match valid:
    case True{}: go_exchanged(
      World,
      with_next_request(state, next),
      request,
      E.step(World, respond, request, world)
    )
    case False{}: EntryFailed{state, T.MalformedReply{}, world}

def go_await(
  -World: Data,
  +state: State,
  +request: T.Request,
  +next: Nat,
  respond: T.Operation -> World -> E.Response<World>,
  world: E.WorldState<World>
) -> Progress<World>:
  match request:
    case T.Request{invocation, +id, _}:
      go_await_checked(World, state, request, next, respond, world,
        Bool.and(Nat.is_eq(invocation, input_invocation(input(state))),
          Bool.and(Nat.is_eq(id, next_request(state)), Nat.is_eq(next, Nat.add(id, 1n)))))

def go_terminal_checked(-World: Data, state: State, selection: Selection,
    world: E.WorldState<World>, valid: Bool) -> Progress<World>:
  match valid:
    case True{}: consumed(World, selection, world)
    case False{}: EntryFailed{state, T.MalformedReply{}, world}

def go_view(
  -World: Data,
  +state: State,
  view: GoProtocol.GoView,
  respond: T.Operation -> World -> E.Response<World>,
  +world: E.WorldState<World>
) -> Progress<World>:
  match view:
    case GoProtocol.GoContinue{}: EntryGoChildAdvance{state, world}
    case GoProtocol.GoAwait{request, next}: go_await(World, state, request, next, respond, world)
    case GoProtocol.GoReturned{result, next}:
      go_terminal_checked(World, state, go_returned(state, stage(state), result), world,
        Nat.is_eq(next, next_request(state)))
    case GoProtocol.GoFailed{failure, next}:
      go_terminal_checked(World, state, Rejected{state, failure}, world,
        Nat.is_eq(next, next_request(state)))

def go_child_completed(-World: Data, respond: T.Operation -> World -> E.Response<World>,
    progress: Progress<World>, view: GoProtocol.GoView) -> Progress<World>:
  match progress:
    case EntryGoChildBegin{state, _, world}: go_view(World, state, view, respond, world)
    case EntryGoChildAdvance{state, world}: go_view(World, state, view, respond, world)
    case EntryGoChildResume{state, _, _, world}: go_view(World, state, view, respond, world)
    case other: other

def preparation_progress(
  -World: Data,
  +state: State,
  progress: P.Progress<World>
) -> Progress<World>:
  match progress:
    case P.PreparationFinished{P.State{_, _, cache, next, _}, +prep, world}:
      +ready : State = prepared_state(
        with_preparation_cache(with_preparation(state, Some{prep}), cache),
        prep,
        next
      )
      consumed(World, prepared_budget(ready, Rust.adapter_budget(True{}, limits(ready))), world)
    case P.PreparationFailed{P.State{_, _, cache, next, _}, failure, world}: EntryFailed{
      with_next_request(with_preparation_cache(state, cache), next),
      failure,
      world
    }
    case other: EntryPreparing{state, other}

def validated(~reply: State -> T.ServiceOutcome -> Selection, -World: Data,
    failure: Maybe<&2, T.TechnicalFailure>, state: State,
    outcome: T.ServiceOutcome, world: E.WorldState<World>) -> Progress<World>:
  match failure:
    case Some{failure}: EntryFailed{state, failure, world}
    case None{}: consumed(World, reply(state, outcome), world)

def delivered(~reply: State -> T.ServiceOutcome -> Selection, -World: Data,
    +request: T.Request, state: State, +envelope: T.Reply,
    world: E.WorldState<World>) -> Progress<World>:
  match envelope:
    case T.Reply{_, _, outcome}:
      validated(reply, World, Boundary.check(request, envelope), state, outcome, world)

def exchanged(~reply: State -> T.ServiceOutcome -> Selection, -World: Data,
    request: T.Request, state: State, +exchange: E.Exchange<World>) -> Progress<World>:
  match exchange:
    case E.Delivered{world, envelope}:
      delivered(reply, World, request, state, envelope, world)
    case E.Waiting{_, _, _}: EntryWaiting{state, exchange}


def issue(~reply: State -> T.ServiceOutcome -> Selection, -World: Data,
    respond: T.Operation -> World -> E.Response<World>, +state: State,
    +operation: T.Operation, world: E.WorldState<World>) -> Progress<World>:
  exchanged(
    reply,
    World,
    T.Request{input_invocation(input(state)), next_request(state), operation},
    with_next_request(state, (next_request(state) + 1n : Nat)),
    E.step(
      World,
      respond,
      T.Request{input_invocation(input(state)), next_request(state), operation},
      world
    )
  )

def go_publication_needed(stage: Stage) -> Bool:
  match stage:
    case GoPublished{}: False{}
    case _: True{}

def expansion_finished(-World: Data, +state: State, +driver: D.State,
    +product: Maybe<&2, ArtifactValue.ProductValue>, world: E.WorldState<World>,
    needed: Bool, language: Maybe<&2, T.Language>) -> Progress<World>:
  match product needed language:
    case Some{_} True{} Some{T.GoLanguage{}}:
      consumed(
        World,
        request_deadline(
          with_next_request(state, D.next_request(driver)),
          AwaitGoPublicationClock{
            D.with_next(driver, Nat.add(D.next_request(driver), 1n)),
            product
          },
          True{}
        ),
        world
      )
    case _ _ _: EntryExpanding{state, D.DriverFinished{driver, product, world}}

def expansion_progress(-World: Data, +state: State, progress: D.Progress<World>) -> Progress<World>:
  match progress:
    case D.DriverFinished{driver, product, world}:
      expansion_finished(
        World,
        state,
        driver,
        product,
        world,
        go_publication_needed(stage(state)),
        language(state)
      )
    case other: EntryExpanding{state, other}

def advance(
  ~select: State -> Selection,
  ~reply: State -> T.ServiceOutcome -> Selection,
  ~prepare_select: P.State -> P.Selection,
  ~prepare_reply: P.State -> T.ServiceOutcome -> P.Selection,
  ~expand_select: D.State -> D.Selection,
  ~expand_reply: D.State -> T.ServiceOutcome -> D.Selection,
  -World: Data,
  respond: T.Operation -> World -> E.Response<World>,
  progress: Progress<World>
) -> Progress<World>:
  match progress:
    case EntryReady{state, world}: consumed(World, select(state), world)
    case EntrySelected{state, operation, world}: issue(
      reply,
      World,
      respond,
      state,
      operation,
      world
    )
    case EntryPreparing{state, progress}: preparation_progress(World, state,
      P.advance(prepare_select, prepare_reply, World, respond, progress))
    case EntryExpanding{state, progress}: expansion_progress(World, state,
      D.advance(expand_select, expand_reply, World, respond, progress))
    case other: other

def completed_exchange(~reply: State -> T.ServiceOutcome -> Selection, -World: Data,
    state: State, +exchange: E.Exchange<World>, completion: E.Completion<World>) -> Progress<World>:
  match exchange:
    case E.Waiting{_, request, _}:
      exchanged(reply, World, request, state, E.complete(World, exchange, completion))
    case E.Delivered{_, _}: EntryWaiting{state, exchange}

def go_completed_exchange(-World: Data, state: State, +exchange: E.Exchange<World>,
    completion: E.Completion<World>) -> Progress<World>:
  match exchange:
    case E.Waiting{_, request, _}: go_exchanged(
      World,
      state,
      request,
      E.complete(World, exchange, completion)
    )
    case other: EntryGoChildWaiting{state, other}

def complete(
  ~reply: State -> T.ServiceOutcome -> Selection,
  ~prepare_reply: P.State -> T.ServiceOutcome -> P.Selection,
  ~expand_reply: D.State -> T.ServiceOutcome -> D.Selection,
  -World: Data,
  progress: Progress<World>, completion: E.Completion<World>
) -> Progress<World>:
  match progress:
    case EntryWaiting{state, exchange}: completed_exchange(
      reply,
      World,
      state,
      exchange, completion
    )
    case EntryPreparing{state, progress}: preparation_progress(World, state,
      P.complete(prepare_reply, World, progress, completion))
    case EntryExpanding{state, progress}: expansion_progress(World, state,
      D.complete(expand_reply, World, progress, completion))
    case EntryGoChildWaiting{state, +exchange}:
      go_completed_exchange(World, state, exchange, completion)
    case other: other

def cancelled_world(
  -World: Data,
  world: E.WorldState<World>,
  invocation: Nat
) -> E.WorldState<World>:
  match world:
    case E.WorldState{world, effects}: E.WorldState{world,
      List.append(&2, O.Effect, effects, [O.CancelledInvocation{invocation}])}

def cancelled(-World: Data, +state: State, world: E.WorldState<World>) -> Progress<World>:
  EntryFailed{
    state,
    T.InvocationCancelled{},
    cancelled_world(World, world, input_invocation(input(state)))
  }

def cancel(-World: Data, progress: Progress<World>) -> Progress<World>:
  match progress:
    case EntryReady{state, world}: cancelled(World, state, world)
    case EntryGoChildBegin{state, _, world}: cancelled(World, state, world)
    case EntryGoChildAdvance{state, world}: cancelled(World, state, world)
    case EntryGoChildResume{state, _, _, world}: cancelled(World, state, world)
    case EntryGoChildWaiting{state, E.Waiting{world, _, _}}: cancelled(World, state, world)
    case EntrySelected{state, _, world}: cancelled(World, state, world)
    case EntryWaiting{state, E.Waiting{world, _, _}}: cancelled(World, state, world)
    case EntryPreparing{state, progress}: preparation_progress(
      World,
      state,
      P.cancel(World, progress)
    )
    case EntryExpanding{state, progress}: EntryExpanding{state, D.cancel(World, progress)}
    case other: other

# Only this entry projection accepts completion; a driver's Some result still
# requires the Go publication clock before it is observable as an entry result.
def accepted_unit(state: State, value: ArtifactValue.ProductValue,
    language: Maybe<&2, T.Language>) -> Maybe<&2, T.ProductResult>:
  match language:
    case Some{T.GoLanguage{}}:
      Bool.pick(Maybe<&2, T.ProductResult>, go_publication_needed(stage(state)),
        None{}, Some{T.ReviewUnitResult{value}})
    case _: Some{T.ReviewUnitResult{value}}

def accepted_product(
  +state: State,
  product: Maybe<&2, ArtifactValue.ProductValue>
) -> Maybe<&2, T.ProductResult>:
  match product:
    case None{}: Some{T.NoReviewUnit{}}
    case Some{value}: accepted_unit(state, value, language(state))

def accepted_result(progress: Progress<Nat>) -> Maybe<&2, T.ProductResult>:
  match progress:
    case EntryFinished{_, _, _}: Some{T.NoReviewUnit{}}
    case EntryExpanding{state, D.DriverFinished{_, product, _}}: accepted_product(state, product)
    case _: None{}

def main() -> Unit:
  Unit{}
