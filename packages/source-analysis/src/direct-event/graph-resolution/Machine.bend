import Base
import ./Types.bend as T
import ./State.bend as S
import ./Root.bend as Root
import ./RootPlanning.bend as RootOwner
import ./Loop.bend as Loop
import ./LoopPolicy.bend as LoopPolicy
import ./Protocol.bend as Protocol
import ./Clock.bend as Clock
import ./Resolve.bend as Resolve
import ./Check.bend as Check
import ./Read.bend as Read
import ./AttachPlanning.bend as AttachOwner
import ./RustStorage.bend as RustStorage
import ./RustMachine.bend as Rust
import ./RustCargo.bend as RustCargo
import ./RustFollow.bend as RustFollow
import ./ImportedRust.bend as ImportedRust
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

# Entry and root IO sequencing. Graph continuations remain inside Bend and
# are composed with resolve/capture/Rust preparation before production adoption.
def unavailable() -> Loop.Continuation:
  Loop.ServiceStep{T.FinishedResolver{T.NoReviewUnit{}, None{}}}

def malformed() -> Loop.Continuation:
  Loop.ServiceStep{T.FailedResolver{T.MalformedReply{}}}

def language(extension: String) -> Maybe<&2, T.Language>:
  match extension:
    case ".ts": Some{T.TypeScriptLanguage{}}
    case ".tsx": Some{T.TypeScriptLanguage{}}
    case ".mts": Some{T.TypeScriptLanguage{}}
    case ".cts": Some{T.TypeScriptLanguage{}}
    case ".rs": Some{T.RustLanguage{}}
    case ".bend": Some{T.BendLanguage{}}
    case ".py": Some{T.PythonLanguage{}}
    case _: None{}

def context(language: T.Language, branch: T.Branch, rust: T.RustContext) -> T.FrontendContext:
  match language:
    case T.TypeScriptLanguage{}: T.TypeScriptContext{branch}
    case T.RustLanguage{}: T.RustSourceContext{branch, rust}
    case T.BendLanguage{}: T.BendSourceContext{branch}
    case T.PythonLanguage{}: T.PythonSourceContext{branch}

def root_inspect(language: Maybe<&2, T.Language>, +state: T.ResolverState) -> Loop.Continuation:
  match language:
    case None{}: malformed()
    case Some{T.PythonLanguage{}}: Loop.InspectPythonRoot{state}
    case Some{language}:
      +input = S.state_input(state)
      Loop.ServiceStep{
        S.request(
          state,
          T.InspectingRoot{},
          T.InspectSource{
            S.input_root_path(input),
            S.input_root_capture(input),
            context(language, S.input_branch(input), S.state_frontend(state))
          }
        )
      }

def root_elapsed(expired: Bool, +state: T.ResolverState) -> Loop.Continuation:
  match expired:
    case True{}: unavailable()
    case False{}: root_inspect(S.state_language(state), state)

def root_clock(clock: Maybe<&2, T.ClockToken>, state: T.ResolverState) -> Loop.Continuation:
  match clock:
    case None{}: malformed()
    case Some{clock}: Loop.ServiceStep{
      S.request(state, T.CheckingRootDeadline{}, T.ReadClock{clock})
    }

def root_admission(available: Bool, +state: T.ResolverState) -> Loop.Continuation:
  match available:
    case False{}: unavailable()
    case True{}: root_clock(S.state_clock(state), state)

def prepared_limits(prepared: T.PreparedLanguage) -> Graph.Limits:
  match prepared:
    case T.PreparedLanguage{limits, _}: limits

def prepared_dependencies(prepared: T.PreparedLanguage) -> List<&2, String>:
  match prepared:
    case T.PreparedLanguage{_, dependencies}: dependencies

def root_budget(+state: T.ResolverState) -> Loop.Continuation:
  +input = S.state_input(state)
  +limits = prepared_limits(S.state_prepared(state))
  root_admission(
    Bool.and(
      Nat.is_ge(Graph.file_cap(limits), 1n),
      Bool.and(
        Nat.is_ge(Graph.work_cap(limits), 1n),
        Nat.is_ge(Graph.read_cap(limits), S.input_root_bytes(input))
      )
    ),
    state
  )

def selected_language(
  selected: Maybe<&2, T.Language>,
  +state: T.ResolverState
) -> Loop.Continuation:
  match selected:
    case None{}: unavailable()
    case Some{+selected}:
      match selected:
        case T.RustLanguage{}:
          # Rust preparation is the next whole-machine continuation; never
          # falsely report a Rust binding failure as NoReviewUnit here.
          Loop.PrepareRust{S.with_state_language(state, Some{selected})}
        case T.PythonLanguage{}: Loop.PreparePython{S.with_state_language(state, Some{selected})}
        case _: root_budget(S.with_state_language(state, Some{selected}))

def root_product(product: Maybe<&2, T.ProductValue>, state: T.ResolverState) -> Loop.Continuation:
  match product:
    case None{}: malformed()
    case Some{value}: Loop.ServiceStep{S.request(state, T.MeasuringRoot{}, T.EncodeProduct{value})}

def prepared_root(outcome: Root.RootOutcome, state: T.ResolverState) -> Loop.Continuation:
  match outcome:
    case Root.RootUnavailable{}: unavailable()
    case Root.RootMalformedSyntax{}: malformed()
    case Root.RootTraversalFailure{_}: Loop.ServiceStep{T.FailedResolver{T.LocalTraversalFailure{}}}
    case Root.RootPrepared{+frame}: root_product(
      Root.unit(frame),
      S.with_state_frame(state, Some{frame})
    )

def inspected_root(outcome: T.SourceOutcome, +state: T.ResolverState) -> Loop.Continuation:
  match outcome:
    case T.SourceUnsupported{}: unavailable()
    case T.SourceInspected{facts}:
      +input = S.state_input(state)
      prepared_root(
        RootOwner.prepare(
          facts,
          S.input_root_path(input),
          S.input_root_name(input),
          S.input_branch(input),
          prepared_limits(S.state_prepared(state)),
          S.input_root_bytes(input),
          prepared_dependencies(S.state_prepared(state))
        ),
        state
      )

def prepared_language(+state: T.ResolverState, +prepared: T.PreparedLanguage,
    frontend: T.RustContext) -> Loop.Continuation:
  root_budget(S.with_state_iteration_fuel(
    S.with_state_frontend(S.with_state_prepared(state, prepared), frontend),
    (Graph.work_cap(prepared_limits(prepared)) * 8n + 16n : Nat)))

def measured_root(
  frame: Maybe<&2, T.ResolverFrame>,
  bytes: Nat,
  +state: T.ResolverState
) -> Loop.Continuation:
  match frame:
    case None{}: malformed()
    case Some{frame}: LoopPolicy.start(
      S.with_state_frame(
        state,
        Some{RootOwner.initialize(frame, S.input_root_bytes(S.state_input(state)), bytes)}
      )
    )

# Dispatch once to the owner of the service phase. The owner still validates
# its outcome; this avoids walking unrelated Rust and expansion handlers.
def component_reply(+stage: T.ResolverStage, outcome: T.ServiceOutcome,
    state: T.ResolverState) -> Loop.Continuation:
  match stage:
    case T.ImportedRustRootDir{}: ImportedRust.reply(stage, outcome, state)
    case T.ImportedRustTargetDir{}: ImportedRust.reply(stage, outcome, state)
    case T.ImportedRustMapJoin{}: ImportedRust.reply(stage, outcome, state)
    case T.ImportedRustMapRelative{}: ImportedRust.reply(stage, outcome, state)
    case T.RustMapCrateDirectory{}: RustFollow.reply(stage, outcome, state)
    case T.RustMapModuleJoin{}: RustFollow.reply(stage, outcome, state)
    case T.RustRoleDir{}: RustFollow.reply(stage, outcome, state)
    case T.RustRoleRelative{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleDirectoryBase{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleBasename{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleStem{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleDirJoin{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleRelative{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleRelativeAbsolute{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleChoiceJoinFile{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleChoiceJoinDir{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleChoiceAbsolute{}: RustFollow.reply(stage, outcome, state)
    case T.RustModuleChoiceStat{}: RustFollow.reply(stage, outcome, state)
    case T.RustCargoBase{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoSelectedRelative{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoAutoBinDirectory{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoAutoBinRelative{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoAutoBinAbsolute{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoTargetAbsolute{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoTargetJoin{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoTargetNormalize{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoJoinedAbsolute{}: RustCargo.reply(stage, outcome, state)
    case T.RustCargoTargetExtension{}: RustCargo.reply(stage, outcome, state)
    case T.RustFindAbsolute{}: RustCargo.reply(stage, outcome, state)
    case T.RustFindStatus{}: RustCargo.reply(stage, outcome, state)
    case T.RustCrateWithinDir{}: RustCargo.reply(stage, outcome, state)
    case T.RustCrateWithinRelative{}: RustCargo.reply(stage, outcome, state)
    case T.RustCrateWithinAbsolute{}: RustCargo.reply(stage, outcome, state)
    case T.RustReaccess{}: RustStorage.reply(stage, outcome, state)
    case T.RustCacheSnapshot{}: RustStorage.reply(stage, outcome, state)
    case T.RustCacheLookup{}: RustStorage.reply(stage, outcome, state)
    case T.RustCapture{}: RustStorage.reply(stage, outcome, state)
    case T.RustStore{}: RustStorage.reply(stage, outcome, state)
    case T.RustDiagnostic{}: RustStorage.reply(stage, outcome, state)
    case T.RustCargoParse{}: RustStorage.reply(stage, outcome, state)
    case T.RustModuleInspect{}: RustStorage.reply(stage, outcome, state)
    case T.RustNoBindingDeadline{}: Rust.reply(stage, outcome, state)
    case T.RustCreatingCache{}: Rust.reply(stage, outcome, state)
    case T.RustRootCacheInserted{}: Rust.reply(stage, outcome, state)
    case T.RustSeparator{}: Rust.reply(stage, outcome, state)
    case T.RustCargoDir{}: Rust.reply(stage, outcome, state)
    case T.RustCargoParent{}: Rust.reply(stage, outcome, state)
    case T.RustCargoJoin{}: Rust.reply(stage, outcome, state)
    case T.RustCargoStat{}: Rust.reply(stage, outcome, state)
    case T.RustIterationDeadline{}: Rust.reply(stage, outcome, state)
    case T.RustTaskAbsolute{}: Rust.reply(stage, outcome, state)
    case T.RustAccess{}: Rust.reply(stage, outcome, state)
    case T.RustFinishedDeadline{}: Rust.reply(stage, outcome, state)
    case T.MeasuringBundledPrevious{}: AttachOwner.reply(stage, outcome, state)
    case T.MeasuringBundledSource{}: AttachOwner.reply(stage, outcome, state)
    case T.MeasuringPreviousTree{}: AttachOwner.reply(stage, outcome, state)
    case T.MeasuringCandidateTree{}: AttachOwner.reply(stage, outcome, state)
    case T.RecheckingTargetPath{}: Read.reply(stage, outcome, state)
    case T.CheckingObservationCache{}: Read.reply(stage, outcome, state)
    case T.LookingUpCapture{}: Read.reply(stage, outcome, state)
    case T.CapturingTarget{}: Read.reply(stage, outcome, state)
    case T.StoringTargetCapture{}: Read.reply(stage, outcome, state)
    case T.InspectingTarget{}: Read.reply(stage, outcome, state)
    case T.EmittingCaptureDiagnostic{}: Read.reply(stage, outcome, state)
    case T.ReadingJoinedPathFacts{}: Resolve.reply(stage, outcome, state)
    case T.JoiningRustModuleCandidate{}: Resolve.reply(stage, outcome, state)
    case T.CheckingCandidateAbsolute{}: Resolve.reply(stage, outcome, state)
    case T.CheckingImportCandidates{}: Resolve.reply(stage, outcome, state)
    case _: malformed()

def successful_terminal(language: Maybe<&2, T.Language>, result: T.ResolverStep, state: T.ResolverState) -> Loop.Continuation:
  match language result:
    case Some{T.PythonLanguage{}} T.FinishedResolver{T.ReviewUnitResult{value}, frame}:
      Loop.PythonTerminal{state, T.FinishedResolver{T.ReviewUnitResult{value}, frame}}
    case _ _: Loop.ServiceStep{result}

def stage_reply(
  stage: T.ResolverStage,
  outcome: T.ServiceOutcome,
  +state: T.ResolverState
) -> Loop.Continuation:
  match stage outcome:
    case T.Starting{} T.ClockStarted{clock}:
      Loop.ServiceStep{
        S.request(
          S.with_state_clock(state, Some{clock}),
          T.FindingRootLanguage{},
          T.PathExtension{S.input_root_path(S.state_input(state))}
        )
      }
    case T.FindingRootLanguage{} T.ExtensionResult{extension}: selected_language(
      language(String.to_lower(extension)),
      state
    )
    case T.CheckingRootDeadline{} T.ClockRead{bits}: root_elapsed(Clock.expired(bits), state)
    case T.InspectingRoot{} T.FrontendResult{outcome}: inspected_root(outcome, state)
    case T.MeasuringRoot{} T.ProductEncoded{bytes}: measured_root(
      S.state_frame(state),
      bytes,
      state
    )
    case T.CheckingIterationDeadline{} T.ClockRead{bits}: LoopPolicy.elapsed(bits, state)
    case T.MeasuringCompletion{} T.ProductEncoded{bytes}: successful_terminal(S.state_language(state), LoopPolicy.measured(bytes, state), state)
    case _ T.ProviderRejected{exception}: Loop.ServiceStep{
      T.FailedResolver{T.ForeignProviderFailure{exception}}
    }
    case T.CheckingTargetPath{} T.AccessResult{outcome}: Check.access(outcome, state)
    case _ _: component_reply(stage, outcome, state)

def dispatch_action(step: Loop.Continuation) -> Loop.Continuation:
  match step:
    case Loop.PrepareRust{state}: Rust.begin(state)
    case Loop.PreparedRust{state, prepared, frontend}: prepared_language(state, prepared, frontend)
    case Loop.RustAdvance{state, event}: Rust.advance(state, event)
    case Loop.RustInvalid{state}: Rust.invalid(state)
    case Loop.RustTasks{state, tasks}: Rust.tasks(state, tasks)
    case Loop.RustCargo{state, syntax}: RustCargo.begin(state, syntax)
    case Loop.RustModules{state, names}: RustFollow.modules(state, names)
    case Loop.RustFollow{state, route, capture}: RustFollow.begin(state, route, capture)
    case Loop.RustFollowInvalid{state}: RustFollow.invalid(state)
    case Loop.RustFindCargo{state}: RustCargo.find_begin(state)
    case Loop.RustCargoContinue{state}: RustCargo.next(state)
    case Loop.PrepareImportedRust{state}: ImportedRust.begin(state)
    case Loop.ResolvePending{state, edge}: Resolve.begin(state, edge)
    case Loop.CheckTarget{state, target}: Check.begin(state, target)
    case Loop.ReadTarget{state, target}: Read.begin(state, target)
    case Loop.InspectCaptured{state, facts}: AttachOwner.inspected(state, facts)
    case Loop.ReadBundled{state, declaration, _, _}: AttachOwner.bundled(state, declaration)
    case _: step

def settle_step(fuel: Nat, step: Loop.Continuation,
    recurse: Loop.Continuation -> Loop.Continuation) -> Loop.Continuation:
  match step:
    case Loop.ServiceStep{_}: step
    case Loop.PythonIteration{_}: step
    case Loop.PythonTerminal{_, _}: step
    case Loop.AdmitPythonCapture{_, _}: step
    case Loop.PythonCaptured{_, _}: step
    case Loop.InspectPythonTarget{_, _}: step
    case Loop.ResolvePython{_, _}: step
    case Loop.PreparePython{_}: step
    case Loop.InspectPythonRoot{_}: step
    case _: recurse(dispatch_action(step))

def settled_boundary(step: Loop.Continuation) -> Loop.Continuation:
  match step:
    case Loop.ServiceStep{_}: step
    case Loop.PythonIteration{_}: step
    case Loop.PythonTerminal{_, _}: step
    case Loop.AdmitPythonCapture{_, _}: step
    case Loop.PythonCaptured{_, _}: step
    case Loop.InspectPythonTarget{_, _}: step
    case Loop.ResolvePython{_, _}: step
    case Loop.PreparePython{_}: step
    case Loop.InspectPythonRoot{_}: step
    case _: malformed()

# Pure continuation dispatch is bounded independently of graph iteration fuel.
# A boundary reached by the final dispatch is accepted even at zero fuel.
def settle(fuel: Nat, step: Loop.Continuation) -> Loop.Continuation:
  match fuel:
    case 0n: settled_boundary(step)
    case 1n++remaining:
      recurse : Loop.Continuation -> Loop.Continuation = step => settle(remaining, step)
      settle_step(remaining, step, recurse)

def continue_action(step: Loop.Continuation) -> Loop.Continuation:
  settle(16n, step)

def checked(checked: Protocol.CheckedReply, +state: T.ResolverState) -> Loop.Continuation:
  match checked:
    case Protocol.RejectedReply{failure}: Loop.ServiceStep{T.FailedResolver{failure}}
    case Protocol.CheckedOutcome{outcome}: continue_action(
      stage_reply(S.state_stage(state), outcome, state)
    )

def cancelled(same: Bool, owner: Nat, actual: Nat) -> Loop.Continuation:
  match same:
    case True{}: Loop.ServiceStep{T.FailedResolver{T.InvocationCancelled{}}}
    case False{}: Loop.ServiceStep{T.FailedResolver{T.WrongInvocation{owner, actual}}}

def resume_await(
  +state: T.ResolverState,
  request: T.Request,
  event: T.ResolverEvent
) -> Loop.Continuation:
  match event:
    case T.ServiceReply{reply}: checked(Protocol.check(request, reply), state)
    case T.CancelInvocation{+invocation}:
      +owner = S.input_invocation(S.state_input(state))
      cancelled(Nat.is_eq(owner, invocation), owner, invocation)

def resume(step: Loop.Continuation, event: T.ResolverEvent) -> Loop.Continuation:
  match step:
    case Loop.ServiceStep{step}:
      match step:
        case T.AwaitService{state, request}: resume_await(state, request, event)
        case _: Loop.ServiceStep{T.FailedResolver{T.ReplyAfterTerminal{}}}
    case _: Loop.ServiceStep{T.FailedResolver{T.WrongReplyKind{}}}

def initial(+input: T.ResolverInput) -> Loop.Continuation:
  scratch : T.ResolverScratch = T.ResolverScratch{
    [],
    [],
    None{},
    None{},
    None{},
    0n,
    None{},
    None{},
    "",
    "",
    "",
    0n,
    None{},
    None{},
    None{},
    [],
    None{},
    None{},
    None{},
    0n
  }
  state : T.ResolverState = T.ResolverState{
    input,
    T.Starting{},
    None{},
    0n,
    (Graph.work_cap(S.input_limits(input)) * 8n + 16n : Nat),
    None{},
    "",
    T.RustContext{None{}, None{}, None{}},
    None{},
    None{},
    scratch,
    T.PreparedLanguage{S.input_limits(input), []},
    T.RustWork{False{}, 0n, None{}, [], [], [], "", [], [], "", False{}, T.CapturedTaskReturn{}}
  }
  Loop.ServiceStep{S.request(state, T.Starting{}, T.StartClock{})}

def main() -> Unit:
  Unit{}
