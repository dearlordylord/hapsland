import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ../../../../native-observation/src/direct-event/languages/path-language/PathLanguage.bend as Language
import ../../../../runtime-environment/src/runtime/backend/Backend.bend as Backend
import ../../../../runtime-inputs/src/configuration/review-backend/ReviewBackend.bend as Configuration
import ../../../../review-definition/src/rules/finalization/RuleSnapshot.bend as Snapshot
import ./UnitEvidence.bend as Evidence
import ./RuleFinalization.bend as Rules
import ./FrozenInput.bend as Input
import ./CanonicalJsonBatch.bend as Batch
import ./CanonicalJsonPlan.bend as Plan

# Whole ordered prepareReadyUnits replacement. The host executes closed requests;
# it never chooses the next unit/stage or filters native outcomes.
type Invocation is Data:
  Invocation{owner: Nat, command: Nat}

type Context is Data:
  Context{
    contract: String,
    path: String,
    root: String,
    graph_limits: ArtifactValue.ProductValue,
    declarations: List<&2, ArtifactValue.ProductValue>,
    captures: List<&2, ArtifactValue.ProductValue>,
    bundled: List<&2, ArtifactValue.ProductValue>,
    languages: List<&2, Language.Registration>
  }
type State is Data:
  State{
    invocation: Invocation,
    request: Nat,
    context: Context,
    pending: List<&2, ArtifactValue.ProductValue>,
    reversed: List<&2, ArtifactValue.ProductValue>
  }
type UnitState is Data:
  UnitState{
    state: State,
    unit: ArtifactValue.ProductValue,
    location: Maybe<&2, ArtifactValue.ProductValue>,
    partial: Bool,
    fingerprints: ArtifactValue.ProductValue
  }
type Phase is Data:
  NextUnit{state: State}
  EvidencePhase{unit: UnitState, step: Evidence.Step}
  RulesPhase{unit: UnitState, step: Rules.Step}
  InputPhase{unit: UnitState, step: Input.Step}
type Step is Data:
  Continue{phase: Phase}
  ObserveOmission{state: State, path: String, name: String, reason: String}
  PathExtension{unit: UnitState, path: String}
  ReadCurrentRules{unit: UnitState, language: String}
  ReadProviderFacts{unit: UnitState, rules: List<&2, ArtifactValue.ProductValue>}
  RulesRequest{unit: UnitState, step: Rules.Step}
  InputRequest{unit: UnitState, step: Input.Step}
  JsonBatchRequest{unit: UnitState, step: Input.Step, commands: List<&2, Batch.Scheduled>}
  Completed{outcomes: List<&2, ArtifactValue.ProductValue>}
  TypeError{message: String}
  URIError{}
  InvalidInput{}
  InvalidReply{}
type Response is Data:
  Observed{}
  ObserverSynchronouslyThrew{}
  Extension{value: String}
  CurrentRules{
    rules: Maybe<&2, List<&2, ArtifactValue.ProductValue>>,
    fallback: Maybe<&2, List<&2, ArtifactValue.ProductValue>>
  }
  ProviderFacts{
    configuration: Maybe<&2, List<&2, Configuration.Layer>>,
    identity: Maybe<&2, Backend.Identity>,
    backends: List<&2, Backend.Declaration>
  }
  Compiled{valid: Bool}
  Tested{valid: Bool, matched: Bool}
  CanonicalGate{admit: Bool}
  Encoded{value: String}
  EncodingFailed{}
  Planned{operations: List<&2, Plan.Operation>}
  BatchSerialized{observations: List<&2, Batch.Observed>}
  Hashed{value: String}
type Reply is Data:
  Reply{invocation: Invocation, request: Nat, response: Response}

def increment(state: State) -> State:
  match state:
    case State{invocation, request, context, pending, reversed}: State{
      invocation,
      Nat.add(1n, request),
      context,
      pending,
      reversed
    }

def increment_unit(unit: UnitState) -> UnitState:
  match unit:
    case UnitState{state, value, location, partial, fingerprints}: UnitState{
      increment(state),
      value,
      location,
      partial,
      fingerprints
    }

def add_requests(state: State, count: Nat) -> State:
  match state:
    case State{invocation, request, context, pending, reversed}:
      State{invocation, Nat.add(request, count), context, pending, reversed}

def add_unit_requests(unit: UnitState, count: Nat) -> UnitState:
  match unit:
    case UnitState{state, value, location, partial, fingerprints}:
      UnitState{add_requests(state, count), value, location, partial, fingerprints}

def unit_state(unit: UnitState) -> State:
  match unit:
    case UnitState{state, _, _, _, _}: state

def unit_path(unit: UnitState) -> String:
  match unit:
    case UnitState{State{_, _, Context{_, path, _, _, _, _, _, _}, _, _}, _, _, _, _}: path

def name(value: Maybe<&2, String>) -> String:
  match value:
    case Some{value}: value
    case None{}: ""

def omission(+unit: UnitState, reason: String) -> Step:
  match unit:
    case UnitState{state, value, _, _, _}:
      ObserveOmission{
        increment(state),
        unit_path(unit),
        name(Evidence.text(Evidence.field("name", Evidence.unit_artifact(value)))),
        reason
      }

def context_root(context: Context) -> String:
  match context:
    case Context{_, _, root, _, _, _, _, _}: root

def ready(+unit: UnitState, input: ArtifactValue.ProductValue, identity: String) -> Step:
  match unit:
    case UnitState{State{invocation, request, +context, pending, reversed}, _, _, _, _}:
      Continue{
        NextUnit{
          State{
            invocation,
            request,
            context,
            pending,
            ArtifactValue.ProductObject{
              [
                ArtifactValue.OrderedField{"status", ArtifactValue.ProductText{"ready"}},
                ArtifactValue.OrderedField{"path", ArtifactValue.ProductText{unit_path(unit)}},
                ArtifactValue.OrderedField{
                  "prepared",
                  ArtifactValue.ProductObject{
                    [
                      ArtifactValue.OrderedField{
                        "root",
                        ArtifactValue.ProductText{context_root(context)}
                      },
                      ArtifactValue.OrderedField{"input", input},
                      ArtifactValue.OrderedField{"identity", ArtifactValue.ProductText{identity}}
                    ]
                  }
                }
              ]
            } <> reversed
          }
        }
      }

def expose_batch(unit: UnitState, +step: Input.Step, commands: List<&2, Batch.Command>) -> Step:
  match unit:
    case UnitState{State{invocation, +request, context, pending, reversed}, value,
      location, partial, fingerprints}:
      JsonBatchRequest{
        UnitState{State{invocation, Nat.add(1n, request), context, pending, reversed},
          value, location, partial, fingerprints},
        step,
        Batch.schedule(commands, Nat.add(1n, request))
      }

def input_expose(unit: UnitState, step: Input.Step) -> Step:
  match step:
    case Input.Completed{input, identity}: ready(unit, input, identity)
    case Input.Continue{state}: Continue{InputPhase{unit, Input.Continue{state}}}
    case Input.TypeError{message}: TypeError{message}
    case Input.URIError{}: URIError{}
    case Input.InvalidReply{}: InvalidReply{}
    case Input.ExportJson{state, value}: InputRequest{unit, Input.ExportJson{state, value}}
    case Input.SerializeBatch{state, +commands}:
      expose_batch(unit, Input.SerializeBatch{state, commands}, commands)
    case _: InputRequest{increment_unit(unit), step}

def invocation_owner(invocation: Invocation) -> Nat:
  match invocation:
    case Invocation{owner, _}: owner

def frozen(
  +unit: UnitState,
  rules: List<&2, ArtifactValue.ProductValue>,
  configuration: Maybe<&2, List<&2, Configuration.Layer>>,
  identity: Maybe<&2, Backend.Identity>,
  backends: List<&2, Backend.Declaration>
) -> Step:
  match unit:
    case UnitState{
      State{
        +invocation,
        _,
        Context{contract, path, _, graph_limits, _, _, _, _},
        _,
        _
      },
      value,
      location,
      partial,
      fingerprints
    }:
      input_expose(
        unit,
        Input.initial(
          invocation_owner(invocation),
          Input.Frame{contract, path, graph_limits, value, location, fingerprints, partial, rules},
          configuration,
          identity,
          backends
        )
      )

def rules_completed(
  empty: Bool,
  unit: UnitState,
  rules: List<&2, ArtifactValue.ProductValue>
) -> Step:
  match empty:
    case True{}: omission(unit, "no-applicable-rule")
    case False{}: ReadProviderFacts{increment_unit(unit), rules}

def rules_expose(unit: UnitState, step: Rules.Step) -> Step:
  match step:
    case Rules.Completed{+frozen}: rules_completed(
      List.is_empty(&2, ArtifactValue.ProductValue, frozen),
      unit,
      frozen
    )
    case Rules.Continue{state}: Continue{RulesPhase{unit, Rules.Continue{state}}}
    case Rules.GlobContinue{work, excluding, patterns, path}: Continue{
      RulesPhase{unit, Rules.GlobContinue{work, excluding, patterns, path}}
    }
    case Rules.InvalidReply{}: InvalidReply{}
    case _: RulesRequest{increment_unit(unit), step}

def kind(artifact: ArtifactValue.ProductValue) -> String:
  Bool.pick(
    String,
    String.eq(name(Evidence.text(Evidence.field("kind", artifact))), "function"),
    "function",
    "type"
  )

def rules_initial(
  +unit: UnitState,
  language: String,
  rules: List<&2, ArtifactValue.ProductValue>
) -> Step:
  match unit:
    case UnitState{
      State{invocation, _, Context{+contract, path, _, _, _, _, _, _}, _, _},
      +value,
      _,
      partial,
      _
    }:
      rules_expose(
        unit,
        Rules.initial(
          invocation_owner(invocation),
          rules,
          Rules.Context{
            Some{path},
            language,
            kind(Evidence.unit_artifact(value)),
            contract,
            True{},
            Snapshot.contract_capabilities(contract, partial)
          }
        )
      )

def supported_language(+language: String) -> Bool:
  Bool.or(
    String.eq(language, "typescript"),
    Bool.or(
      String.eq(language, "rust"),
      Bool.or(
        String.eq(language, "bend"),
        Bool.or(String.eq(language, "python"), String.eq(language, "go"))
      )
    )
  )

def language_selected(+unit: UnitState, language: Maybe<&2, String>) -> Step:
  match language:
    case None{}: Continue{NextUnit{unit_state(unit)}}
    case Some{+language}: Bool.pick(
      Step,
      supported_language(language),
      ReadCurrentRules{increment_unit(unit), language},
      Continue{NextUnit{unit_state(unit)}}
    )

def extension_received(+unit: UnitState, extension: String) -> Step:
  match unit:
    case UnitState{State{_, _, Context{_, _, _, _, _, _, _, languages}, _, _}, _, _, _, _}:
      language_selected(unit, Language.select(extension, languages))

def metadata_expose(+unit: UnitState, metadata: Evidence.Metadata) -> Step:
  match unit metadata:
    case UnitState{state, value, _, _, _} Evidence.EvidenceReady{partial, location, fingerprints}:
      PathExtension{
        increment_unit(UnitState{state, value, location, partial, fingerprints}),
        unit_path(unit)
      }
    case _ Evidence.EvidenceMissing{}: omission(unit, "missing-evidence")
    case _ _: InvalidInput{}

def evidence_expose(+unit: UnitState, step: Evidence.Step) -> Step:
  match unit step:
    case _ Evidence.Continue{state}: Continue{EvidencePhase{unit, Evidence.Continue{state}}}
    case UnitState{
      State{_, _, Context{contract, _, _, _, declarations, captures, _, _}, _, _},
      value,
      _,
      _,
      _
    } _:
      metadata_expose(unit, Evidence.metadata(step, contract, declarations, captures, value))

def unit_value(unit: UnitState) -> ArtifactValue.ProductValue:
  match unit:
    case UnitState{_, value, _, _, _}: value

def start_location(missing: Bool, +unit: UnitState) -> Step:
  match missing:
    case True{}: omission(unit, "missing-evidence")
    case False{}: evidence_expose(unit, Evidence.initial(unit_value(unit)))

def start_unit(+state: State, +value: ArtifactValue.ProductValue) -> Step:
  match state:
    case State{_, _, Context{+contract, _, _, _, declarations, _, _, _}, _, _}:
      +location = Evidence.root_location(contract, Evidence.unit_artifact(value), declarations)
      start_location(
        Bool.and(
          Bool.or(
            String.eq(contract, "direct-event/type-shape/v1"),
            String.eq(contract, "direct-event/function/v1")
          ),
          Evidence.absent(location)
        ),
        UnitState{state, value, location, False{}, ArtifactValue.ProductNull{}}
      )

def next_unit(state: State) -> Step:
  match state:
    case State{_, _, _, Nil{}, reversed}: Completed{
      List.reverse(&2, ArtifactValue.ProductValue, reversed)
    }
    case State{invocation, request, context, Con{value, pending}, reversed}: start_unit(
      State{invocation, request, context, pending, reversed},
      value
    )

def initial(
  invocation: Invocation,
  context: Context,
  units: List<&2, ArtifactValue.ProductValue>
) -> Step:
  Continue{NextUnit{State{invocation, 0n, context, units, []}}}

def evidence_advance(+unit: UnitState, state: Evidence.State) -> Step:
  match unit:
    case UnitState{State{_, _, Context{_, _, _, _, _, _, bundled, _}, _, _}, _, _, _, _}:
      evidence_expose(unit, Evidence.advance(state, bundled))

def advance(phase: Phase) -> Step:
  match phase:
    case NextUnit{state}: next_unit(state)
    case EvidencePhase{+unit, Evidence.Continue{state}}: evidence_advance(unit, state)
    case RulesPhase{unit, Rules.Continue{state}}: rules_expose(unit, Rules.advance(state))
    case RulesPhase{unit, Rules.GlobContinue{work, excluding, patterns, path}}: rules_expose(
      unit,
      Rules.glob_advance(work, excluding, patterns, path)
    )
    case InputPhase{unit, Input.Continue{state}}: input_expose(unit, Input.advance(state))
    case _: InvalidReply{}

def same_invocation(left: Invocation, right: Invocation) -> Bool:
  match left right:
    case Invocation{left_owner, left_command} Invocation{right_owner, right_command}:
      Bool.and(Nat.is_eq(left_owner, right_owner), Nat.is_eq(left_command, right_command))

def correlation(state: State, invocation: Invocation, request: Nat) -> Bool:
  match state:
    case State{expected_invocation, expected_request, _, _, _}: Bool.and(
      same_invocation(expected_invocation, invocation),
      Nat.is_eq(expected_request, request)
    )

def rules_with_work(work: Rules.Work, step: Rules.Step, response: Response) -> Rules.Step:
  match work response:
    case Rules.Work{Rules.State{invocation, request, _, _, _}, _, _} Compiled{valid}: Rules.resume(
      step,
      Rules.EngineResult{invocation, request, Rules.Compiled{valid}}
    )
    case Rules.Work{Rules.State{invocation, request, _, _, _}, _, _} Tested{valid, matched}: Rules.resume(
      step,
      Rules.EngineResult{invocation, request, Rules.Tested{valid, matched}}
    )
    case Rules.Work{Rules.State{invocation, request, _, _, _}, _, _} CanonicalGate{admit}: Rules.resume(
      step,
      Rules.GateReply{invocation, request, admit}
    )
    case _ _: Rules.InvalidReply{}

def rules_response(+step: Rules.Step, response: Response) -> Rules.Step:
  match step:
    case Rules.Engine{work, _, _}: rules_with_work(work, step, response)
    case Rules.CanonicalGate{work, _, _, _, _, _, _, _, _, _, _, _, _, _}: rules_with_work(
      work,
      step,
      response
    )
    case _: Rules.InvalidReply{}

def input_with_state(state: Input.State, step: Input.Step, response: Response) -> Input.Step:
  match state response:
    case Input.State{invocation, request, _} Encoded{value}: Input.resume(
      step,
      Input.Encoded{invocation, request, value}
    )
    case Input.State{invocation, request, _} EncodingFailed{}: Input.resume(
      step,
      Input.EncodingFailed{invocation, request}
    )
    case Input.State{invocation, request, _} Planned{operations}: Input.resume(
      step,
      Input.Planned{invocation, request, operations}
    )
    case Input.State{invocation, request, _} Hashed{value}: Input.resume(
      step,
      Input.Hashed{invocation, request, value}
    )
    case _ _: Input.InvalidReply{}

def input_response(+step: Input.Step, response: Response) -> Input.Step:
  match step:
    case Input.EncodeComponent{state, _}: input_with_state(state, step, response)
    case Input.ExportJson{state, _}: input_with_state(state, step, response)
    case Input.Digest{state, _}: input_with_state(state, step, response)
    case _: Input.InvalidReply{}

def rules_or_empty(
  value: Maybe<&2, List<&2, ArtifactValue.ProductValue>>
) -> List<&2, ArtifactValue.ProductValue>:
  match value:
    case Some{rules}: rules
    case None{}: []

def rules_snapshot(
  value: Maybe<&2, List<&2, ArtifactValue.ProductValue>>,
  fallback: Maybe<&2, List<&2, ArtifactValue.ProductValue>>
) -> List<&2, ArtifactValue.ProductValue>:
  match value:
    case Some{rules}: rules
    case None{}: rules_or_empty(fallback)

def batch_tokens(
  step: Input.Step,
  tokens: Maybe<&2, List<&2, Batch.Token>>
) -> Input.Step:
  match step tokens:
    case Input.SerializeBatch{Input.State{+invocation, +request, work}, commands} Some{tokens}:
      Input.resume(
        Input.SerializeBatch{Input.State{invocation, request, work}, commands},
        Input.SerializedBatch{invocation, request, tokens}
      )
    case _ _: Input.InvalidReply{}

def batch_accepted(unit: UnitState, count: Nat, step: Input.Step) -> Step:
  match step:
    case Input.Continue{state}:
      input_expose(add_unit_requests(unit, Nat.sub(count, 1n)), Input.Continue{state})
    case _: InvalidReply{}

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case ObserveOmission{+state, _, _, _} Reply{invocation, request, Observed{}}:
      Bool.pick(
        Step,
        correlation(state, invocation, request),
        Continue{NextUnit{state}},
        InvalidReply{}
      )
    case ObserveOmission{+state, _, _, _} Reply{invocation, request, ObserverSynchronouslyThrew{}}:
      Bool.pick(
        Step,
        correlation(state, invocation, request),
        Continue{NextUnit{state}},
        InvalidReply{}
      )
    case PathExtension{+unit, _} Reply{invocation, request, Extension{value}}:
      Bool.pick(
        Step,
        correlation(unit_state(unit), invocation, request),
        extension_received(unit, value),
        InvalidReply{}
      )
    case ReadCurrentRules{+unit, language} Reply{
      invocation,
      request,
      CurrentRules{rules, fallback}
    }:
      Bool.pick(
        Step,
        correlation(unit_state(unit), invocation, request),
        rules_initial(unit, language, rules_snapshot(rules, fallback)),
        InvalidReply{}
      )
    case ReadProviderFacts{+unit, rules} Reply{
      invocation,
      request,
      ProviderFacts{configuration, identity, backends}
    }:
      Bool.pick(
        Step,
        correlation(unit_state(unit), invocation, request),
        frozen(unit, rules, configuration, identity, backends),
        InvalidReply{}
      )
    case RulesRequest{+unit, step} Reply{invocation, request, response}:
      Bool.pick(
        Step,
        correlation(unit_state(unit), invocation, request),
        rules_expose(unit, rules_response(step, response)),
        InvalidReply{}
      )
    case JsonBatchRequest{+unit, step, +commands} Reply{
      invocation, request, BatchSerialized{observations}
    }:
      Bool.pick(
        Step,
        correlation(unit_state(unit), invocation, request),
        batch_accepted(
          unit, List.length(&2, Batch.Scheduled, commands),
          batch_tokens(step, Batch.strip_outer(commands, observations))
        ),
        InvalidReply{}
      )
    case InputRequest{+unit, step} Reply{invocation, request, response}:
      Bool.pick(
        Step,
        correlation(unit_state(unit), invocation, request),
        input_expose(unit, input_response(step, response)),
        InvalidReply{}
      )
    case _ _: InvalidReply{}
