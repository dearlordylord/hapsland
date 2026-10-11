import type { List, ProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { PreparationResult } from "./preparation-result-codec.ts"

declare const stateHandle: unique symbol
export type State = { readonly [stateHandle]: "Preparation.State" }
export type Maybe<A> = { readonly $: "None" } | { readonly $: "Some"; readonly value: A }
type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
type Selection<Name extends string, Fields = object> = Tagged<`PreparationSelection.${Name}`, Fields>
type Attribution<Name extends string, Fields = object> = Tagged<
  `../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.${Name}`,
  Fields
>
type Local<Name extends string, Fields = object> = Tagged<
  `../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.${Name}`,
  Fields
>
export type Position = Attribution<"Position", { readonly line: bigint; readonly column: bigint }>
export type Location = Attribution<"Location", { readonly start: Position; readonly end: Position }>
export type Hunk = Attribution<
  "Hunk",
  { readonly path: string; readonly verified: boolean; readonly location: Location }
>
export type Declaration = Attribution<
  "Declaration",
  {
    readonly path: string
    readonly kind: string
    readonly name: string
    readonly location: Location
    readonly selection_locations: Maybe<List<Location>>
  }
>
export type Root = Selection<"Root", { readonly id: string; readonly declaration: Declaration }>
export type Analysis = Selection<"Analysis", { readonly id: string; readonly kind: string; readonly name: string }>
export type Contract =
  | Selection<"TypeContract">
  | Selection<"FunctionContract">
  | Selection<"OtherContract", { readonly name: string }>
export type Operation =
  | Tagged<"CandidateAdd">
  | Tagged<"CandidateUpdate">
  | Tagged<"CandidateDelete">
  | Tagged<"CandidateMove">
export type Candidate = Tagged<
  "Candidate",
  { readonly path: string; readonly operation: Operation; readonly added_lines: List<string> }
>
export type Capture = Tagged<
  "Capture",
  {
    readonly path: string
    readonly handle: bigint
    readonly text: string
    readonly content_hash: string
    readonly bytes: bigint
  }
>
export type Limits = Tagged<
  "../../../../agent-flow-bend/ImportGraph.Limits",
  {
    readonly version: bigint
    readonly source_bytes: bigint
    readonly tree_bytes: bigint
    readonly files: bigint
    readonly read_bytes: bigint
    readonly outgoing_edges: bigint
    readonly depth: bigint
    readonly work: bigint
  }
>
export type Input = Tagged<
  "Input",
  {
    readonly candidates: List<Candidate>
    readonly contracts: List<Contract>
    readonly limits: Limits
    readonly frozen: Maybe<List<Tagged<"FrozenPath", { readonly path: string; readonly names: List<string> }>>>
    readonly line: Maybe<bigint>
    readonly verified: Maybe<
      Selection<"VerifiedSpans", { readonly path: string; readonly content_hash: string; readonly hunks: List<Hunk> }>
    >
    readonly native_patch: Maybe<string>
    readonly advicee_host: string
    readonly before_analyze: boolean
  }
>
export type Context = Tagged<
  "Context",
  { readonly candidate: Candidate; readonly capture: Capture; readonly frozen: Maybe<List<string>> }
>
type NativeAnalysis =
  | Tagged<"NativeReady", { readonly name: string }>
  | Tagged<"NativeUnsupported", { readonly name: string; readonly reason: string }>
export type Extraction = Tagged<
  "Extraction",
  {
    readonly graph: Maybe<List<Root>>
    readonly functions: Maybe<
      Tagged<
        "FunctionFile",
        {
          readonly failure: Maybe<string>
          readonly functions: List<Root>
          readonly exclusions: List<
            Tagged<"Exclusion", { readonly name: string; readonly reason: string; readonly location: Location }>
          >
        }
      >
    >
    readonly type_file:
      | Tagged<"TypeUnavailable", { readonly reason: string }>
      | Tagged<"TypeAnalyzed", { readonly analyses: List<NativeAnalysis> }>
  }
>
type Omission = Local<"Unresolved"> | Local<"UnsupportedTarget"> | Local<"ReferenceLimit"> | Local<"Unavailable">
type PlannedReference =
  | Local<"Included", { readonly identity: string }>
  | Local<"Expanded", { readonly node: bigint }>
  | Local<"Omitted", { readonly reason: Omission; readonly target_name: string }>
export type ReferenceSlot = Local<
  "ReferenceSlot",
  { readonly owner: bigint; readonly index: bigint; readonly symbol: string; readonly reference: PlannedReference }
>
export type Command =
  | Tagged<"InspectPath", { readonly candidate: Candidate }>
  | Tagged<"CaptureSource", { readonly path: string; readonly selection: bigint; readonly source_cap: Maybe<bigint> }>
  | Tagged<"Preflight", { readonly capture: Capture }>
  | Tagged<"RejectMaterializationCapacity">
  | Tagged<"RecordMaterializationCapacity">
  | Tagged<"AdmitMaterialization", { readonly capture: Capture; readonly preflight: ProductValue }>
  | Tagged<"ExtractSource", { readonly capture: Capture; readonly contract: Contract }>
  | Tagged<"VerifyNativePatch", { readonly command: string; readonly capture: Capture }>
  | Tagged<"ClassifyAmbiguity", { readonly capture: Capture; readonly spans: List<Location> }>
  | Tagged<"ResolveRoot", { readonly capture: Capture; readonly root: Analysis; readonly contract: Contract }>
  | Tagged<
      "RenderUnits",
      {
        readonly context: Context
        readonly contract: Contract
        readonly declarations: List<Root>
        readonly units: List<ProductValue>
      }
    >
export type Request = Tagged<"Request", { readonly invocation: bigint; readonly id: bigint; readonly command: Command }>
export type Response =
  | Tagged<"Ack">
  | Tagged<"Cancelled">
  | Tagged<"AmbiguityClassificationFailed">
  | Tagged<"PathAllowed", { readonly path: string; readonly selection: bigint }>
  | Tagged<"PathDenied", { readonly reason: string }>
  | Tagged<"SourceCaptured", { readonly capture: Capture }>
  | Tagged<"SourceUnavailable", { readonly diagnostic: ProductValue }>
  | Tagged<"PreflightDone", { readonly value: ProductValue }>
  | Tagged<
      "MaterializationDone",
      {
        readonly result:
          | Tagged<"Resized">
          | Tagged<"CapacityRefused", { readonly constraint: string }>
          | Tagged<"InvalidReservation">
          | Tagged<"InvalidMeasurement">
        readonly requested: bigint
      }
    >
  | Tagged<"SourceExtracted", { readonly extraction: Extraction }>
  | Tagged<"NativePatchVerified", { readonly hunks: Maybe<List<Hunk>> }>
  | Tagged<"AmbiguityClassified", { readonly reason: Maybe<string> }>
  | Tagged<
      "RootResolved",
      { readonly unit: Maybe<ProductValue>; readonly references: List<ReferenceSlot>; readonly captures: List<Capture> }
    >
  | Tagged<
      "UnitsRendered",
      {
        readonly outcomes: List<
          | Tagged<"OutcomeReady", { readonly path: string; readonly prepared: ProductValue }>
          | Tagged<"OutcomeSkipped", { readonly path: string }>
        >
      }
    >
  | Tagged<"TechnicalFailure", { readonly message: string }>
export type Reply = Tagged<"Reply", { readonly invocation: bigint; readonly id: bigint; readonly response: Response }>
export type Step =
  | Tagged<"Internal", { readonly state: State }>
  | Tagged<"Await", { readonly state: State; readonly request: Request }>
  | Tagged<"Finished", { readonly result: PreparationResult }>
  | Tagged<"Failed", { readonly reason: string }>
declare const core: {
  initial(invocation: bigint, input: Input): Step
  advance(state: State): Step
  resume(step: Step, reply: Reply): Step
}
export default core
