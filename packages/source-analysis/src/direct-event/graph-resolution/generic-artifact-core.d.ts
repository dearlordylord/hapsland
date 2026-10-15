import type {
  GraphServiceReply,
  ResolverInput,
  ResolverFailure,
  Request,
  ServiceOutcome
} from "@hapsland/source-analysis/direct-event/graph-resolution"
import type { ReferenceSlot } from "./traversal/reference.ts"
import type { List, ProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"

import type { Tagged, Maybe } from "./composition/artifact-abi.d.ts"

// These values are produced, retained and consumed by Bend. The host never
// constructs or interprets resolver state or an internal continuation.
declare const resolverState: unique symbol
declare const resolverFrame: unique symbol
declare const continuation: unique symbol
export type ResolverState = { readonly [resolverState]: true }
// The accepted final frame exposes only the references passed to Preparation.
export type ResolverFrame = { readonly [resolverFrame]: true; readonly references: List<ReferenceSlot> }
export type Continuation = { readonly [continuation]: true }
type SourceOutcome = Extract<ServiceOutcome, { readonly $: "Types.FrontendResult" }>["outcome"]
type CacheOutcome = Extract<ServiceOutcome, { readonly $: "Types.CacheResult" }>["outcome"]
type CaptureOutcome = Extract<ServiceOutcome, { readonly $: "Types.CaptureResult" }>["outcome"]
type ProductResult = Tagged<"Types.NoReviewUnit"> | Tagged<"Types.ReviewUnitResult", { readonly value: ProductValue }>
export type ResolverStep =
  | Tagged<"Types.FinishedResolver", { readonly result: ProductResult; readonly final_frame: Maybe<ResolverFrame> }>
  | Tagged<"Types.FailedResolver", { readonly failure: ResolverFailure }>
  | Tagged<"Types.AwaitService", { readonly state: ResolverState; readonly request: Request }>
type ExpectedKind = Tagged<`traversal/core.${"AnyKind" | "TypeKind" | "FunctionKind"}`>
type PendingTarget =
  | Tagged<"traversal/core.Imported", { readonly path: string; readonly name: string }>
  | Tagged<"traversal/core.BundledTarget", { readonly declaration: number }>
type Pending = Tagged<
  "traversal/core.Pending",
  {
    readonly owner: number
    readonly index: number
    readonly from: string
    readonly symbol: string
    readonly name: string
    readonly depth: number
    readonly expected: ExpectedKind
    readonly target: PendingTarget
  }
>
export type ParentAction =
  | Tagged<
      `composition/ArtifactProtocol.${"RootBudget" | "PythonUnresolved" | "Iteration" | "CaptureRefused" | "Deadline"}`,
      { readonly state: ResolverState }
    >
  | Tagged<
      `composition/ArtifactProtocol.${"RootInspected" | "TargetInspected"}`,
      { readonly state: ResolverState; readonly outcome: SourceOutcome }
    >
  | Tagged<
      "composition/ArtifactProtocol.ImportResolved",
      {
        readonly state: ResolverState
        readonly edge: Pending
        readonly result: Maybe<
          Tagged<"python-module/ArtifactProtocol.Resolution", { readonly path: string; readonly name: string }>
        >
      }
    >
  | Tagged<
      "composition/ArtifactProtocol.CaptureAdmitted",
      { readonly state: ResolverState; readonly cached: CacheOutcome }
    >
  | Tagged<
      "composition/ArtifactProtocol.CaptureFinished",
      { readonly state: ResolverState; readonly outcome: CaptureOutcome }
    >
  | Tagged<"composition/ArtifactProtocol.Unavailable">
  | Tagged<"composition/ArtifactProtocol.Failure", { readonly failure: ResolverFailure }>
  | Tagged<"composition/ArtifactProtocol.Publish", { readonly result: ResolverStep }>
export type ResolverEvent =
  | Tagged<"Types.ServiceReply", { readonly reply: GraphServiceReply }>
  | Tagged<"Types.CancelInvocation", { readonly invocation: number }>
declare const core: {
  initial(input: ResolverInput): Continuation
  resume(step: Continuation, event: ResolverEvent): Continuation
  execute(command: ParentAction): Continuation
}
export default core
