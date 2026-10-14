import type * as Effect from "effect/Effect"
import type { PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import type { Finding } from "@hapsland/delivery-output/direct-event/output"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { EvaluatedUnit } from "../evaluation/contract.ts"
import type {
  SourceLineRequest,
  PreparedSource,
  SourcePreparationContext,
  DirectReviewContext
} from "../preparation/contract.ts"

export type RevalidationResult =
  | {
      readonly status: "current"
      readonly evaluations: ReadonlyArray<EvaluatedUnit>
      readonly findings: ReadonlyArray<Finding>
    }
  | { readonly status: "stale"; readonly findings: readonly [] }
  | { readonly status: "unavailable"; readonly findings: readonly [] }
  | { readonly status: "unattributed"; readonly findings: readonly [] }

/**
 * Publication authority is explicit because semantic equality cannot prove
 * that a later resident observation has not superseded completed work.
 */
export type ResidentPublicationAuthority = {
  readonly isCurrentWork: (prepared: PreparedUnit) => Effect.Effect<boolean>
}

export type FreshnessInput =
  | {
      readonly kind: "snapshot-line"
      readonly observation: SourceLineRequest
      readonly prepared: PreparedSource
      readonly context: SourcePreparationContext
    }
  | {
      readonly kind: "snapshot-unit"
      readonly observation: DirectObservation
      readonly prepared: PreparedUnit
      readonly context: DirectReviewContext
    }
  | {
      readonly kind: "publication"
      readonly observation: DirectObservation
      readonly evaluations: readonly EvaluatedUnit[]
      readonly context: DirectReviewContext
      readonly authority: ResidentPublicationAuthority | undefined
    }
export type FreshnessResult =
  | { readonly kind: "snapshot"; readonly current: boolean }
  | { readonly kind: "publication"; readonly result: RevalidationResult }
export type FreshnessExecution = {
  readonly signal?: AbortSignal | undefined
  readonly ownerLease?: {
    readonly invocation: bigint
    readonly generation: bigint
    readonly lease: bigint
    readonly request: bigint
  }
}
// Native ports perform external IO; canonical traversal and identity are Bend-owned.
export type FreshnessPorts = {
  verifyRoot(observation: FreshnessInput["observation"], execution: FreshnessExecution): Promise<boolean>
  prepare(
    input: FreshnessInput,
    names: ReadonlyMap<string, ReadonlySet<string>> | undefined,
    execution: FreshnessExecution
  ): Promise<unknown>
  currentWork(
    method: unknown,
    receiver: ResidentPublicationAuthority,
    prepared: unknown,
    execution: FreshnessExecution
  ): Promise<boolean>
}
