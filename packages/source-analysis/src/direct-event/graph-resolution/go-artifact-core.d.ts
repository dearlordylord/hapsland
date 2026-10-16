import type {
  ResolverInput,
  ResolverFailure,
  Request,
  Reply,
  ServiceOutcome
} from "@hapsland/source-analysis/direct-event/graph-resolution"
import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { Tagged, Maybe, Token } from "./composition/artifact-abi.d.ts"

// Prepared and Step are retained Bend values, never host-constructed inputs.
declare const prepared: unique symbol
declare const step: unique symbol
export type Prepared = { readonly [prepared]: true }
export type Step = { readonly [step]: true }
type GoTag<Name extends string, Fields = object> = Tagged<`go-module/ArtifactProtocol.${Name}`, Fields>
type Configuration = Extract<ServiceOutcome, { readonly $: "Types.GoConfigurationRead" }>["configuration"]
export type Input = GoTag<
  "Input",
  {
    readonly invocation: number
    readonly next_request: number
    readonly root_path: string
    readonly root_capture: Token<"CaptureToken">
    readonly root_bytes: number
    readonly branch: ResolverInput["branch"]
    readonly clock: Token<"ClockToken">
    readonly caller_cache: Maybe<Token<"CacheToken">>
    readonly limits: ResolverInput["limits"]
    readonly configuration: Configuration
    readonly configuration_identity: Maybe<string>
  }
>
export type Command =
  | GoTag<"GoPrepare", { readonly input: Input }>
  | GoTag<
      "GoInspect",
      { readonly prepared: Prepared; readonly path: string; readonly branch: Input["branch"]; readonly next: number }
    >
type SourceFacts = Extract<
  Extract<ServiceOutcome, { readonly $: "Types.FrontendResult" }>["outcome"],
  { readonly $: "Types.SourceInspected" }
>["facts"]

export type Result =
  | GoTag<"GoUnavailable">
  | GoTag<"GoPrepared", { readonly prepared: Prepared }>
  | GoTag<"GoInspected", { readonly facts: Maybe<SourceFacts> }>
export type View =
  | GoTag<"GoContinue">
  | GoTag<"GoAwait", { readonly request: Request; readonly next: number }>
  | GoTag<"GoReturned", { readonly result: Result; readonly next: number }>
  | GoTag<"GoFailed", { readonly failure: ResolverFailure; readonly next: number }>
type GoFileSyntax = Extract<
  Extract<ServiceOutcome, { readonly $: "Types.GoFileResult" }>["outcome"],
  { readonly $: "Types.GoFileInspected" }
>["file"]

export type PackageSpelling = Tagged<
  "go-module/Input.Spelling",
  {
    readonly text: string
    readonly characters: List<
      Tagged<
        "go-module/Input.Character",
        { readonly text: string; readonly letter: boolean; readonly number: boolean; readonly uppercase: boolean }
      >
    >
  }
>
type ListItem<Value> = Value extends { readonly $: "Con"; readonly head: infer Item } ? Item : never
type PackageDeclaration = {
  readonly value: ListItem<SourceFacts["declarations"]>
  readonly location: ListItem<GoFileSyntax["type_locations"]>
}
export type PackageResult =
  | Tagged<"go-module/Package.Refused">
  | Tagged<
      "go-module/Package.PackageFacts",
      {
        readonly declarations: List<PackageDeclaration>
        readonly discovery_work: number
        readonly constant_types: List<{
          readonly name: string
          readonly values: List<
            | Tagged<"go-module/Package.LocalType", { readonly name: string }>
            | Tagged<"go-module/Package.QualifiedType", { readonly name: string; readonly source_path: string }>
          >
        }>
      }
    >
declare const core: {
  package_facts(files: List<GoFileSyntax>, work: number, spellings: List<PackageSpelling>): PackageResult
  begin(command: Command): Step
  advance(step: Step): Step
  resume(step: Step, reply: Reply): Step
  view(step: Step): View
}
export default core
