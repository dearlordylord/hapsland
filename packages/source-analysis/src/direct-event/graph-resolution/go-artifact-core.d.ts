import type {
  ResolverInput,
  ResolverFailure,
  Request,
  Reply,
  ServiceOutcome
} from "@hapsland/source-analysis/direct-event/graph-resolution"
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
declare const core: {
  begin(command: Command): Step
  advance(step: Step): Step
  resume(step: Step, reply: Reply): Step
  view(step: Step): View
}
export default core
