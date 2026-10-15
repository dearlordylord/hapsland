import type { Binary64, List, ProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { Maybe } from "./preparation-core.js"

declare const handle: unique symbol
type Opaque<Name extends string> = { readonly [handle]: Name }
type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
type Backend<Name extends string, Fields = object> = Tagged<
  `../../../../runtime-environment/src/runtime/backend/Backend.${Name}`,
  Fields
>
export type Invocation = Tagged<"Invocation", { readonly owner: bigint; readonly command: bigint }>
export type Context = Tagged<
  "Context",
  {
    readonly contract: string
    readonly path: string
    readonly root: string
    readonly graph_limits: ProductValue
    readonly declarations: List<ProductValue>
    readonly captures: List<ProductValue>
    readonly bundled: List<ProductValue>
    readonly languages: List<
      Tagged<
        "../../../../native-observation/src/direct-event/languages/path-language/PathLanguage.Registration",
        { readonly id: string; readonly extensions: List<string> }
      >
    >
  }
>
export type State = Opaque<"Finalization.State"> & { readonly invocation: Invocation; readonly request: bigint }
export type UnitState = Opaque<"Finalization.UnitState"> & { readonly state: State }
export type Phase = Opaque<"Finalization.Phase">
type RulesState = Opaque<"Rules.State">
type RulesWork = Opaque<"Rules.Work">
type GlobState = Opaque<"Glob.EngineState">
type GlobQuery =
  | Tagged<
      "../../../../runtime-inputs/src/matcher/glob/Glob.AnyContinue",
      { readonly pending: List<string>; readonly path: string }
    >
  | Tagged<
      "../../../../runtime-inputs/src/matcher/glob/Glob.AnyCompile",
      {
        readonly pending: List<string>
        readonly path: string
        readonly state: GlobState
        readonly expression: List<number>
      }
    >
  | Tagged<
      "../../../../runtime-inputs/src/matcher/glob/Glob.AnyTest",
      {
        readonly pending: List<string>
        readonly path: string
        readonly state: GlobState
        readonly expression: List<number>
        readonly candidate: List<number>
      }
    >
  | Tagged<"../../../../runtime-inputs/src/matcher/glob/Glob.AnyCompleted", { readonly matched: boolean }>
type RuleTarget =
  | Tagged<"../../../../agent-flow-bend/RulePolicy.TypeShape">
  | Tagged<"../../../../agent-flow-bend/RulePolicy.FunctionTarget">
  | Tagged<"../../../../agent-flow-bend/RulePolicy.UnsupportedTarget">
export type RulesStep =
  | Tagged<"RuleFinalization.Continue", { readonly state: RulesState }>
  | Tagged<
      "RuleFinalization.GlobContinue",
      { readonly work: RulesWork; readonly excluding: boolean; readonly patterns: List<string>; readonly path: string }
    >
  | Tagged<
      "RuleFinalization.Engine",
      { readonly work: RulesWork; readonly excluding: boolean; readonly query: GlobQuery }
    >
  | Tagged<
      "RuleFinalization.CanonicalGate",
      {
        readonly work: RulesWork
        readonly consent: boolean
        readonly complete: boolean
        readonly target: RuleTarget
        readonly global_included: boolean
        readonly global_excluded: boolean
        readonly pack_enabled: boolean
        readonly rule_enabled: boolean
        readonly rule_included: boolean
        readonly rule_excluded: boolean
        readonly target_declared: boolean
        readonly capabilities_available: boolean
        readonly source_rung: bigint
        readonly minimum_rung: bigint
      }
    >
  | Tagged<"RuleFinalization.Completed", { readonly frozen: List<ProductValue> }>
  | Tagged<"RuleFinalization.InvalidReply">
type InputState = Opaque<"FrozenInput.State">
export type Primitive =
  | Tagged<"CanonicalJson.NullPrimitive">
  | Tagged<"CanonicalJson.BoolPrimitive", { readonly value: boolean }>
  | Tagged<"CanonicalJson.StringPrimitive", { readonly value: string }>
  | Tagged<"CanonicalJson.NumberPrimitive", { readonly bits: Binary64 }>
export type JsonPlanOperation =
  | Tagged<"CanonicalJsonPlan.PrimitiveOperation", { readonly value: Primitive }>
  | Tagged<"CanonicalJsonPlan.ArrayOperation", { readonly arity: bigint }>
  | Tagged<"CanonicalJsonPlan.ObjectOperation", { readonly keys: List<string> }>
export type JsonBatchCommand = Tagged<
  "CanonicalJsonBatch.Command",
  { readonly invocation: bigint; readonly request: bigint; readonly primitive: Primitive }
>
export type JsonBatchScheduled = Tagged<
  "CanonicalJsonBatch.Scheduled",
  { readonly request: bigint; readonly command: JsonBatchCommand }
>
export type JsonBatchObserved = Tagged<
  "CanonicalJsonBatch.Observed",
  {
    readonly request: bigint
    readonly token: Tagged<
      "CanonicalJsonBatch.Token",
      { readonly invocation: bigint; readonly request: bigint; readonly value: string }
    >
  }
>
export type InputStep =
  | Tagged<"FrozenInput.Continue", { readonly state: InputState }>
  | Tagged<"FrozenInput.EncodeComponent", { readonly state: InputState; readonly value: string }>
  | Tagged<"FrozenInput.ExportJson", { readonly state: InputState; readonly value: ProductValue }>
  | Tagged<"FrozenInput.SerializeBatch", { readonly state: InputState; readonly commands: List<JsonBatchCommand> }>
  | Tagged<"FrozenInput.Digest", { readonly state: InputState; readonly bytes: string }>
  | Tagged<"FrozenInput.Completed", { readonly input: ProductValue; readonly identity: string }>
  | Tagged<"FrozenInput.TypeError", { readonly message: string }>
  | Tagged<"FrozenInput.URIError">
  | Tagged<"FrozenInput.InvalidReply">
export type Step =
  | Tagged<"Continue", { readonly phase: Phase }>
  | Tagged<
      "ObserveOmission",
      { readonly state: State; readonly path: string; readonly name: string; readonly reason: string }
    >
  | Tagged<"PathExtension", { readonly unit: UnitState; readonly path: string }>
  | Tagged<"ReadCurrentRules", { readonly unit: UnitState; readonly language: string }>
  | Tagged<"ReadProviderFacts", { readonly unit: UnitState; readonly rules: List<ProductValue> }>
  | Tagged<"RulesRequest", { readonly unit: UnitState; readonly step: RulesStep }>
  | Tagged<"InputRequest", { readonly unit: UnitState; readonly step: InputStep }>
  | Tagged<
      "JsonBatchRequest",
      {
        readonly unit: UnitState
        readonly step: Extract<InputStep, { $: "FrozenInput.SerializeBatch" }>
        readonly commands: List<JsonBatchScheduled>
      }
    >
  | Tagged<"Completed", { readonly outcomes: List<ProductValue> }>
  | Tagged<"TypeError", { readonly message: string }>
  | Tagged<"URIError">
  | Tagged<"InvalidInput">
  | Tagged<"InvalidReply">
type Selection = Backend<
  "Selection",
  {
    readonly provider: string
    readonly model: Backend<"Missing"> | Backend<"Supplied", { readonly value: Maybe<string> }>
    readonly fields: List<Backend<"Field", { readonly name: string; readonly value: string }>>
  }
>
export type Response =
  | Tagged<"Observed">
  | Tagged<"ObserverSynchronouslyThrew">
  | Tagged<"Extension", { readonly value: string }>
  | Tagged<"CurrentRules", { readonly rules: Maybe<List<ProductValue>>; readonly fallback: Maybe<List<ProductValue>> }>
  | Tagged<
      "ProviderFacts",
      {
        readonly configuration: Maybe<
          List<
            Tagged<
              "../../../../runtime-inputs/src/configuration/review-backend/ReviewBackend.Layer",
              { readonly name: string; readonly backend: Maybe<Selection> }
            >
          >
        >
        readonly identity: Maybe<
          Backend<"Identity", { readonly provider: string; readonly model: string; readonly destination: string }>
        >
        readonly backends: List<
          Backend<
            "Declaration",
            { readonly id: string; readonly default_model: Maybe<string>; readonly destination: string }
          >
        >
      }
    >
  | Tagged<"Compiled", { readonly valid: boolean }>
  | Tagged<"Tested", { readonly valid: boolean; readonly matched: boolean }>
  | Tagged<"CanonicalGate", { readonly admit: boolean }>
  | Tagged<"Encoded", { readonly value: string }>
  | Tagged<"EncodingFailed">
  | Tagged<"Planned", { readonly operations: List<JsonPlanOperation> }>
  | Tagged<"BatchSerialized", { readonly observations: List<JsonBatchObserved> }>
  | Tagged<"Hashed", { readonly value: string }>
export type Reply = Tagged<
  "Reply",
  { readonly invocation: Invocation; readonly request: bigint; readonly response: Response }
>
declare const core: {
  initial(invocation: Invocation, context: Context, units: List<ProductValue>): Step
  advance(phase: Phase): Step
  resume(step: Step, reply: Reply): Step
}
export default core
