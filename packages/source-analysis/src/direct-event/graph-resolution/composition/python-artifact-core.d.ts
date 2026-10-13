import type { Request, Reply, ServiceOutcome, ResolverFailure } from "../service-contract.ts"
import type { ArtifactAbi, Tagged, Maybe, Token } from "./artifact-abi.d.ts"

declare const session: unique symbol
declare const step: unique symbol
// Session and Step are retained Bend values, never host-constructed commands.
export type Session = { readonly [session]: true }
export type Step = { readonly [step]: true }
type Bound =
  | Tagged<"python-module/Session.Nonnegative", { readonly value: bigint }>
  | Tagged<"python-module/Session.Negative", { readonly magnitude: bigint }>
type Remaining = ArtifactAbi<
  Tagged<"python-module/Session.Remaining", { readonly files: Bound; readonly read_bytes: Bound; readonly work: Bound }>
>
type CommandTag<Name extends string, Fields> = ArtifactAbi<Tagged<`python-module/ArtifactProtocol.${Name}`, Fields>>
export type Command =
  | CommandTag<
      "Prepare",
      {
        readonly root: string
        readonly capture: Token<"CaptureToken">
        readonly root_bytes: bigint
        readonly files: bigint
        readonly read_bytes: bigint
        readonly work: bigint
        readonly source_cap: bigint
        readonly depth: bigint
        readonly clock: Token<"ClockToken">
        readonly invocation: bigint
        readonly caller_cache: Maybe<Token<"CacheToken">>
        readonly next: bigint
      }
    >
  | CommandTag<
      "Inspect",
      {
        readonly branch: ArtifactAbi<Tagged<"Types.TypeBranch" | "Types.FunctionBranch">>
        readonly path: string
        readonly root: string
        readonly capture: Token<"CaptureToken">
        readonly invocation: bigint
        readonly next: bigint
      }
    >
  | CommandTag<
      "ResolveImport",
      {
        readonly session: Session
        readonly remaining: Remaining
        readonly from: string
        readonly module: string
        readonly member: string
        readonly root: string
        readonly clock: Token<"ClockToken">
        readonly cache: Token<"CacheToken">
        readonly separator: string
        readonly invocation: bigint
        readonly next: bigint
      }
    >
  | CommandTag<
      "Revalidate",
      {
        readonly session: Session
        readonly remaining: Remaining
        readonly clock: Token<"ClockToken">
        readonly separator: string
        readonly invocation: bigint
        readonly next: bigint
      }
    >
type SourceFacts = ArtifactAbi<
  Extract<
    Extract<ServiceOutcome, { readonly $: "Types.FrontendResult" }>["outcome"],
    { readonly $: "Types.SourceInspected" }
  >["facts"]
>
type Resolution = ArtifactAbi<
  Tagged<"python-module/ArtifactProtocol.Resolution", { readonly path: string; readonly name: string }>
>
export type Result =
  | CommandTag<"PreparationUnavailable", object>
  | CommandTag<"Prepared", { readonly session: Session; readonly cache: Token<"CacheToken"> }>
  | CommandTag<"Inspected", { readonly facts: Maybe<SourceFacts> }>
  | CommandTag<"Resolved", { readonly session: Session; readonly result: Maybe<Resolution> }>
  | CommandTag<"Revalidated", { readonly session: Session; readonly valid: boolean }>
export type View =
  | CommandTag<
      "Await",
      { readonly request: ArtifactAbi<Request>; readonly session: Maybe<Session>; readonly next: bigint }
    >
  | CommandTag<"Returned", { readonly result: Result; readonly next: bigint }>
  | CommandTag<
      "Failed",
      { readonly failure: ArtifactAbi<ResolverFailure>; readonly session: Maybe<Session>; readonly next: Maybe<bigint> }
    >
declare const core: {
  begin(command: Command): Step
  resume(step: Step, reply: ArtifactAbi<Reply>): Step
  view(step: Step): View
}
export default core
