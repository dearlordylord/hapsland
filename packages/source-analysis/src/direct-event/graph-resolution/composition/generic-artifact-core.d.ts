import type { GraphServiceReply } from "@hapsland/source-analysis/direct-event/graph-resolution"
import type { ReferenceSlot } from "../traversal/reference.ts"
import type { List, ProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import type {
  ResolverInput,
  ResolverFailure,
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
export type ResolverFrame = { readonly [resolverFrame]: true; readonly references: ArtifactAbi<List<ReferenceSlot>> }
export type Continuation = { readonly [continuation]: true }
type SourceOutcome = ArtifactAbi<Extract<ServiceOutcome, { readonly $: "Types.FrontendResult" }>["outcome"]>
type CacheOutcome = ArtifactAbi<Extract<ServiceOutcome, { readonly $: "Types.CacheResult" }>["outcome"]>
type CaptureOutcome = ArtifactAbi<Extract<ServiceOutcome, { readonly $: "Types.CaptureResult" }>["outcome"]>
type ProductResult =
  | Tagged<"../Types.NoReviewUnit">
  | Tagged<"../Types.ReviewUnitResult", { readonly value: ArtifactAbi<ProductValue> }>
export type ResolverStep =
  | Tagged<"../Types.FinishedResolver", { readonly result: ProductResult; readonly final_frame: Maybe<ResolverFrame> }>
  | Tagged<"../Types.FailedResolver", { readonly failure: ArtifactAbi<ResolverFailure> }>
  | Tagged<"../Types.AwaitService", { readonly state: ResolverState; readonly request: ArtifactAbi<Request> }>
type ExpectedKind = Tagged<`../traversal/core.${"AnyKind" | "TypeKind" | "FunctionKind"}`>
type PendingTarget =
  | Tagged<"../traversal/core.Imported", { readonly path: string; readonly name: string }>
  | Tagged<"../traversal/core.BundledTarget", { readonly declaration: bigint }>
type Pending = Tagged<
  "../traversal/core.Pending",
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
          Tagged<"../python-module/ArtifactProtocol.Resolution", { readonly path: string; readonly name: string }>
        >
      }
    >
  | Tagged<"ArtifactProtocol.CaptureAdmitted", { readonly state: ResolverState; readonly cached: CacheOutcome }>
  | Tagged<"ArtifactProtocol.CaptureFinished", { readonly state: ResolverState; readonly outcome: CaptureOutcome }>
  | Tagged<"ArtifactProtocol.Unavailable">
  | Tagged<"ArtifactProtocol.Failure", { readonly failure: ArtifactAbi<ResolverFailure> }>
  | Tagged<"ArtifactProtocol.Publish", { readonly result: ResolverStep }>
export type ResolverEvent =
  | Tagged<"../Types.ServiceReply", { readonly reply: ArtifactAbi<GraphServiceReply> }>
  | Tagged<"../Types.CancelInvocation", { readonly invocation: bigint }>
declare const core: {
  initial(input: ArtifactAbi<ResolverInput>): Continuation
  resume(step: Continuation, event: ResolverEvent): Continuation
  execute(command: ParentAction): Continuation
}
export default core
