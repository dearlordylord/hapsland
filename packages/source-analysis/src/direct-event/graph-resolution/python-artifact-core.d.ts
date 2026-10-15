import type {
  Request,
  Reply,
  ServiceOutcome,
  ResolverFailure
} from "@hapsland/source-analysis/direct-event/graph-resolution"
import type { Tagged, Maybe, Token } from "./composition/artifact-abi.d.ts"

declare const session: unique symbol
declare const step: unique symbol
// Session and Step are retained Bend values, never host-constructed commands.
export type Session = { readonly [session]: true }
export type Step = { readonly [step]: true }
type Bound =
  | Tagged<"python-module/Session.Nonnegative", { readonly value: number }>
  | Tagged<"python-module/Session.Negative", { readonly magnitude: number }>
type Remaining = Tagged<
  "python-module/Session.Remaining",
  { readonly files: Bound; readonly read_bytes: Bound; readonly work: Bound }
>

type CommandTag<Name extends string, Fields> = Tagged<`python-module/ArtifactProtocol.${Name}`, Fields>
export type Command =
  | CommandTag<
      "Prepare",
      {
        readonly root: string
        readonly capture: Token<"CaptureToken">
        readonly root_bytes: number
        readonly files: number
        readonly read_bytes: number
        readonly work: number
        readonly source_cap: number
        readonly depth: number
        readonly clock: Token<"ClockToken">
        readonly invocation: number
        readonly caller_cache: Maybe<Token<"CacheToken">>
        readonly next: number
      }
    >
  | CommandTag<
      "Inspect",
      {
        readonly branch: Tagged<"Types.TypeBranch" | "Types.FunctionBranch">
        readonly path: string
        readonly root: string
        readonly capture: Token<"CaptureToken">
        readonly invocation: number
        readonly next: number
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
        readonly invocation: number
        readonly next: number
      }
    >
  | CommandTag<
      "Revalidate",
      {
        readonly session: Session
        readonly remaining: Remaining
        readonly clock: Token<"ClockToken">
        readonly separator: string
        readonly invocation: number
        readonly next: number
      }
    >
type SourceFacts = Extract<
  Extract<ServiceOutcome, { readonly $: "Types.FrontendResult" }>["outcome"],
  { readonly $: "Types.SourceInspected" }
>["facts"]

type Resolution = Tagged<"python-module/ArtifactProtocol.Resolution", { readonly path: string; readonly name: string }>

export type Result =
  | CommandTag<"PreparationUnavailable", object>
  | CommandTag<"Prepared", { readonly session: Session; readonly cache: Token<"CacheToken"> }>
  | CommandTag<"Inspected", { readonly facts: Maybe<SourceFacts> }>
  | CommandTag<"Resolved", { readonly session: Session; readonly result: Maybe<Resolution> }>
  | CommandTag<"Revalidated", { readonly session: Session; readonly valid: boolean }>
export type View =
  | CommandTag<"Await", { readonly request: Request; readonly session: Maybe<Session>; readonly next: number }>
  | CommandTag<"Returned", { readonly result: Result; readonly next: number }>
  | CommandTag<
      "Failed",
      { readonly failure: ResolverFailure; readonly session: Maybe<Session>; readonly next: Maybe<number> }
    >
declare const core: { begin(command: Command): Step; resume(step: Step, reply: Reply): Step; view(step: Step): View }
export default core
