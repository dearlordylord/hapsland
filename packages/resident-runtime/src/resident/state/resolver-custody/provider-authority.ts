import type { HostTransport } from "@hapsland/canonical-policy/canonical/child-execution"
import type * as Effect from "effect/Effect"
import type * as Owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { ResidentTransaction } from "../resident/transaction.ts"
import type { CapacityDraft } from "../capacity/model.ts"
import type { ResidentRecords } from "../resident/model.ts"
import type { UnitJob, Job } from "../../work-ownership/jobs.ts"

// These are the existing scoped lease fields, not another authority protocol.
export type ProviderLease = Omit<Extract<Owner.ResidentEvent, { readonly $: "StartSourceObservationEvent" }>, "$">
export type PendingRestore = { readonly key: string; readonly owner: UnitJob }

type ListHead<Value> = Value extends { readonly $: "Con"; readonly head: infer Head } ? Head : never
type Published = Extract<Owner.Publication, { readonly $: "Published" }>
export type OwnerOutput = HostTransport<ListHead<Published["outputs"]>>

export type OwnerPublication = {
  readonly raw: Owner.Publication
  readonly actions: readonly Owner.Action[]
  readonly outputs: readonly OwnerOutput[]
  readonly refusal?: Owner.Refusal | undefined
}
export type EvaluationBinding = {
  readonly partition: string
  readonly operation: number
  readonly round: number
  readonly reservation: import("../capacity/model.ts").CapacityReservation
}
export type AdviceReceipt = {
  readonly invocation: number
  readonly origin: number
  readonly inputHandle: number
  readonly capability: import("../advice-records.ts").Advice
  readonly scope: Extract<Owner.Scope, { readonly $: "AdviceTailScope" }>
}
export type AdviceOwnership = {
  readonly capability: import("../advice-records.ts").Advice
  readonly presentBefore: boolean
  readonly presentAfter: boolean
  readonly removed: boolean
  readonly findings: import("../advice-records.ts").AdviceContent["findings"] | undefined
  readonly retirement: import("../../review-work/preparation/post-preparation-core.js").AdviceRetirement | undefined
}
export type AdviceBinding = {
  readonly capability: import("../advice-records.ts").Advice
  readonly retirement?: import("../../review-work/preparation/post-preparation-core.js").AdviceRetirement | undefined
}
export type NativePublication<Value> = OwnerPublication & {
  readonly value: Value
  readonly adviceReceipt?: AdviceReceipt | undefined
  readonly adviceOwnership?: AdviceOwnership | undefined
  readonly restoredPending?:
    | { readonly pendingOwnerIdentity: UnitJob; readonly revision: import("../revision.ts").WorkRevision }
    | undefined
  readonly claimedKeys: readonly string[]
  readonly transferredUnits: readonly Job[]
}
export type ControlledStep =
  | Omit<Extract<Owner.Step, { readonly $: "Advanced" }>, "state">
  | Omit<Extract<Owner.Step, { readonly $: "Rejected" }>, "state">
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
