import type { PendingAdviceMetadata, AccountingMetrics } from "./advice-delivery/metadata.ts"
import { type DirectObservation, type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type * as Effect from "effect/Effect"
import { type ResidentPaths } from "@hapsland/resident-transport/resident/paths"
import {
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
  type CollectionMode
} from "@hapsland/resident-transport/resident/protocol"
import type { ResidentAdapterError } from "./adapter-error.ts"
import { type ResponseAuthority } from "./advice-delivery/authority.ts"

export interface ResidentRuntimeOperations {
  readonly lifetime: string
  readonly paths: ResidentPaths
  readonly listen: () => Effect.Effect<void, ResidentAdapterError>
  readonly close: Effect.Effect<void, ResidentAdapterError>
  readonly handle: (request: ResidentRequest) => Effect.Effect<ResidentResponse, ResidentAdapterError>
  readonly stats: () => Effect.Effect<Extract<ResidentResponse, { status: "stats" }>>
  readonly whenIdle: () => Effect.Effect<void>
  readonly whenClosed: Effect.Effect<void>
}

export interface ResidentRuntime {
  readonly operations: ResidentRuntimeOperations
  readonly lifetime: string
  readonly paths: ResidentPaths
  stats(): Effect.Effect<Extract<ResidentResponse, { status: "stats" }>>
  cleanup(): Effect.Effect<"busy" | "cleaned">
  admit(
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    composed?: boolean,
    requirePermit?: boolean
  ): Effect.Effect<ResidentResponse>
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode?: CollectionMode
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: undefined,
    composed: true
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: ResponseAuthority,
    composed?: boolean
  ): Effect.Effect<ResidentResponse, ResidentAdapterError>
  acknowledge(token: string): Effect.Effect<ResidentResponse>
  finalize(token: string): Effect.Effect<ResidentResponse>
  releaseDelivery(token: string): Effect.Effect<void>
  beginComposedSubmission(token: string, surface: "edit" | "background" | "stop"): Effect.Effect<ResidentResponse>
  releaseComposedSubmission(token: string): Effect.Effect<ResidentResponse>
  whenIdle(): Effect.Effect<void>
  pendingAdviceMetadata(): Effect.Effect<PendingAdviceMetadata>
  accountingMetrics(): Effect.Effect<AccountingMetrics>
  sweepQuietRounds(now?: number): Effect.Effect<number>
  handle(request: ResidentRequest): Effect.Effect<ResidentResponse, ResidentAdapterError>
  listen(): Effect.Effect<void, ResidentAdapterError>
  readonly close: Effect.Effect<void, ResidentAdapterError>
}
