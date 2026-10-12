import type * as Effect from "effect/Effect"
import type * as Owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { ResidentTransaction } from "../resident/transaction.ts"
import type { CapacityDraft } from "../capacity/model.ts"
import type { ResidentRecords } from "../resident/model.ts"
import type { UnitJob, Job } from "../../work-ownership/jobs.ts"

// These are the existing scoped lease fields, not another authority protocol.
export type ProviderLease = Omit<Extract<Owner.ResidentEvent, { readonly $: "StartSourceObservationEvent" }>, "$">
export type PendingRestore = { readonly key: string; readonly owner: UnitJob }

// Inverse of the already-declared owner Nat/tag conversion for Canonical outputs.
type HostTransport<Value> = Value extends bigint
  ? number
  : Value extends object
    ? {
        readonly [Key in keyof Value]: Key extends "$"
          ? Value[Key] extends `../${infer Tag}`
            ? Tag
            : Value[Key]
          : HostTransport<Value[Key]>
      }
    : Value
type ListHead<Value> = Value extends { readonly $: "Con"; readonly head: infer Head } ? Head : never
type Published = Extract<Owner.Publication, { readonly $: "Published" }>
export type OwnerOutput = HostTransport<ListHead<Published["outputs"]>>

export type NativePublication<Value> = {
  readonly value: Value
  readonly raw: Owner.Publication
  readonly actions: readonly Owner.Action[]
  readonly outputs: readonly OwnerOutput[]
  readonly refusal?: Owner.Refusal | undefined
}
export type CommitReceipt = (publication: NativePublication<unknown>) => void
export type ProviderPermit = {
  readonly credential: ProviderLease
  readonly pendingRestore?: PendingRestore | undefined
  readonly committed?: CommitReceipt | undefined
}
export type NativeTransaction = ResidentTransaction<UnitJob, string, Job>
export type NativeOperation<Value> = (
  draft: CapacityDraft,
  records: ResidentRecords<UnitJob, string, Job>
) => readonly [Value, ResidentRecords<UnitJob, string, Job>]

export interface ProviderCommitBridge {
  native<Value>(operation: NativeOperation<Value>, committed?: CommitReceipt): Effect.Effect<NativePublication<Value>>
  nativeScoped<Value>(
    credential: ProviderLease,
    operation: NativeOperation<Value>,
    committed?: CommitReceipt
  ): Effect.Effect<NativePublication<Value>>
  nativeRestorePending<Value>(
    credential: ProviderLease,
    pendingRestore: PendingRestore,
    operation: NativeOperation<Value>,
    committed?: CommitReceipt
  ): Effect.Effect<NativePublication<Value>>
}
