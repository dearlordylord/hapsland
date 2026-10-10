import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { type CapacityState, type CapacityDraft, draftCapacity } from "../capacity/model.ts"
import { type ResidentRecords } from "./model.ts"

export type ResidentTransaction<Pending, DispatchKey, DispatchValue> = {
  readonly residentLifetime: string
  readonly read: Effect.Effect<
    CapacityState & { readonly records: ResidentRecords<Pending, DispatchKey, DispatchValue> }
  >
  readonly commitAllEffect: <A>(
    operation: (
      draft: CapacityDraft,
      records: ResidentRecords<Pending, DispatchKey, DispatchValue>
    ) => readonly [A, ResidentRecords<Pending, DispatchKey, DispatchValue>]
  ) => Effect.Effect<A>
}
export const residentTransaction = <Pending, DispatchKey, DispatchValue>(
  state: Ref.Ref<CapacityState & { readonly records: ResidentRecords<Pending, DispatchKey, DispatchValue> }>,
  residentLifetime: string
): ResidentTransaction<Pending, DispatchKey, DispatchValue> => {
  let committing = false
  const commitAllEffect = <A>(
    operation: (
      draft: CapacityDraft,
      records: ResidentRecords<Pending, DispatchKey, DispatchValue>
    ) => readonly [A, ResidentRecords<Pending, DispatchKey, DispatchValue>]
  ): Effect.Effect<A> =>
    Ref.modify(state, (current) => {
      if (committing) throw new Error("resident capacity commit cannot be reentered")
      committing = true
      try {
        const draft = draftCapacity(current)
        const [value, records] = operation(draft, current.records)
        const next = draft
        // Record every published charge peak, including capture workspaces
        // that can be resized or released before any server checkpoint.
        const peakLedgerBytes = Math.max(records.runtime.peakLedgerBytes, projectCanonical(next.canonical).global.bytes)
        const observedRecords =
          peakLedgerBytes === records.runtime.peakLedgerBytes
            ? records
            : { ...records, runtime: { ...records.runtime, peakLedgerBytes } }
        return [value, { ...next, records: observedRecords }] as const
      } finally {
        committing = false
      }
    }).pipe(Effect.withSpan("ResidentState.commit"))
  return { read: Ref.get(state), residentLifetime, commitAllEffect }
}
