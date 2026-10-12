import type { ProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import type {
  ResolverInput,
  ResolverFailure,
  Reply,
  Request,
  ServiceOutcome
} from "@hapsland/source-analysis/direct-event/graph-resolver"

import type { ArtifactAbi, Tagged, Maybe } from "./artifact-abi.d.ts"

// These values are produced, retained and consumed by Bend. The host never
// constructs or interprets resolver state or an internal continuation.
declare const resolverState: unique symbol
declare const resolverFrame: unique symbol
declare const continuation: unique symbol
export type ResolverState = { readonly [resolverState]: true }
// The accepted final frame exposes only the references passed to Preparation.
type PreparationReply = Awaited<
  ReturnType<import("@hapsland/review-execution/direct-event/preparation").PreparationPorts["performEffect"]>
>
type ResolverFrame = {
  readonly [resolverFrame]: true
  readonly references: Extract<PreparationReply["response"], { $: "RootResolved" }>["references"]
}
export type Continuation = { readonly [continuation]: true }
type SourceOutcome = ArtifactAbi<Extract<ServiceOutcome, { readonly $: "Types.FrontendResult" }>["outcome"]>
type CacheOutcome = ArtifactAbi<Extract<ServiceOutcome, { readonly $: "Types.CacheResult" }>["outcome"]>
type CaptureOutcome = ArtifactAbi<Extract<ServiceOutcome, { readonly $: "Types.CaptureResult" }>["outcome"]>
type ProductResult =
  | Tagged<"../../../../../source-analysis/src/direct-event/graph-resolution/Types.NoReviewUnit">
  | Tagged<
      "../../../../../source-analysis/src/direct-event/graph-resolution/Types.ReviewUnitResult",
      { readonly value: ArtifactAbi<ProductValue> }
    >
export type ResolverStep =
  | Tagged<
      "../../../../../source-analysis/src/direct-event/graph-resolution/Types.FinishedResolver",
      { readonly result: ProductResult; readonly final_frame: Maybe<ResolverFrame> }
    >
  | Tagged<
      "../../../../../source-analysis/src/direct-event/graph-resolution/Types.FailedResolver",
      { readonly failure: ArtifactAbi<ResolverFailure> }
    >
  | Tagged<
      "../../../../../source-analysis/src/direct-event/graph-resolution/Types.AwaitService",
      { readonly state: ResolverState; readonly request: ArtifactAbi<Request> }
    >
type ExpectedKind =
  Tagged<`../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.${"AnyKind" | "TypeKind" | "FunctionKind"}`>
type PendingTarget =
  | Tagged<
      "../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.Imported",
      { readonly path: string; readonly name: string }
    >
  | Tagged<
      "../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.BundledTarget",
      { readonly declaration: bigint }
    >
type Pending = Tagged<
  "../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.Pending",
  {
    readonly owner: bigint
    readonly index: bigint
    readonly from: string
    readonly symbol: string
    readonly name: string
    readonly depth: bigint
    readonly expected: ExpectedKind
    readonly target: PendingTarget
  }
>
export type ParentAction =
  | Tagged<
      `ArtifactProtocol.${"RootBudget" | "PythonUnresolved" | "Iteration" | "CaptureRefused" | "Deadline"}`,
      { readonly state: ResolverState }
    >
  | Tagged<
      `ArtifactProtocol.${"RootInspected" | "TargetInspected"}`,
      { readonly state: ResolverState; readonly outcome: SourceOutcome }
    >
  | Tagged<
      "ArtifactProtocol.ImportResolved",
      {
        readonly state: ResolverState
        readonly edge: Pending
        readonly result: Maybe<
          Tagged<
            "../../../../../source-analysis/src/direct-event/graph-resolution/python-module/ArtifactProtocol.Resolution",
            { readonly path: string; readonly name: string }
          >
        >
      }
    >
  | Tagged<"ArtifactProtocol.CaptureAdmitted", { readonly state: ResolverState; readonly cached: CacheOutcome }>
  | Tagged<"ArtifactProtocol.CaptureFinished", { readonly state: ResolverState; readonly outcome: CaptureOutcome }>
  | Tagged<"ArtifactProtocol.Unavailable">
  | Tagged<"ArtifactProtocol.Failure", { readonly failure: ArtifactAbi<ResolverFailure> }>
  | Tagged<"ArtifactProtocol.Publish", { readonly result: ResolverStep }>
export type ResolverEvent =
  | Tagged<
      "../../../../../source-analysis/src/direct-event/graph-resolution/Types.ServiceReply",
      { readonly reply: ArtifactAbi<Reply> }
    >
  | Tagged<
      "../../../../../source-analysis/src/direct-event/graph-resolution/Types.CancelInvocation",
      { readonly invocation: bigint }
    >
declare const core: {
  initial(input: ArtifactAbi<ResolverInput>): Continuation
  resume(step: Continuation, event: ResolverEvent): Continuation
  execute(command: ParentAction): Continuation
}
export default core
