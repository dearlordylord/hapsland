import type { ResolverInput, ResolverFailure, Request, Reply, ServiceOutcome } from "../service-contract.ts"
import type { ArtifactAbi, Tagged, Maybe, Token } from "./artifact-abi.d.ts"

// Prepared and Step are retained Bend values, never host-constructed inputs.
declare const prepared: unique symbol
declare const step: unique symbol
export type Prepared = { readonly [prepared]: true }
export type Step = { readonly [step]: true }
type GoTag<Name extends string, Fields = object> = ArtifactAbi<Tagged<`go-module/ArtifactProtocol.${Name}`, Fields>>
type Configuration = ArtifactAbi<Extract<ServiceOutcome, { readonly $: "Types.GoConfigurationRead" }>["configuration"]>
export type Input = GoTag<
  "Input",
  {
    readonly invocation: bigint
    readonly next_request: bigint
    readonly root_path: string
    readonly root_capture: Token<"CaptureToken">
    readonly root_bytes: bigint
    readonly branch: ArtifactAbi<ResolverInput["branch"]>
    readonly clock: Token<"ClockToken">
    readonly caller_cache: Maybe<Token<"CacheToken">>
    readonly limits: ArtifactAbi<ResolverInput["limits"]>
    readonly configuration: Configuration
    readonly configuration_identity: Maybe<string>
  }
>
export type Command =
  | GoTag<"GoPrepare", { readonly input: Input }>
  | GoTag<
      "GoInspect",
      { readonly prepared: Prepared; readonly path: string; readonly branch: Input["branch"]; readonly next: bigint }
    >
type SourceFacts = ArtifactAbi<
  Extract<
    Extract<ServiceOutcome, { readonly $: "Types.FrontendResult" }>["outcome"],
    { readonly $: "Types.SourceInspected" }
  >["facts"]
>
export type Result =
  | GoTag<"GoUnavailable">
  | GoTag<"GoPrepared", { readonly prepared: Prepared }>
  | GoTag<"GoInspected", { readonly facts: Maybe<SourceFacts> }>
export type View =
  | GoTag<"GoContinue">
  | GoTag<"GoAwait", { readonly request: ArtifactAbi<Request>; readonly next: bigint }>
  | GoTag<"GoReturned", { readonly result: Result; readonly next: bigint }>
  | GoTag<"GoFailed", { readonly failure: ArtifactAbi<ResolverFailure>; readonly next: bigint }>
declare const core: {
  begin(command: Command): Step
  advance(step: Step): Step
  resume(step: Step, reply: ArtifactAbi<Reply>): Step
  view(step: Step): View
}
export default core
