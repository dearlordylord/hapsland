import { draftRevision, revisionOperations, type RevisionOperations, type WorkRevision } from "../revision.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"
import { type AdviceCaptureRecord, type AdviceCapture } from "./model.ts"
import { type CapacityLedger, capacityOperations } from "../capacity/operations.ts"
import { type CapacityReservation, type CapacityResize } from "../capacity/model.ts"

export const residentAdviceCaptures = <Pending, DispatchKey, DispatchValue>({
  read,
  commitAllEffect,
  residentLifetime
}: ResidentTransaction<Pending, DispatchKey, DispatchValue>) => {
  const captureChange =
    <A>(
      operation: (captures: Map<number, AdviceCaptureRecord>, owner: CapacityLedger, revision: RevisionOperations) => A
    ): Parameters<typeof commitAllEffect<A>>[0] =>
    (draft, records) => {
      const captures = new Map(records.adviceCaptures)
      const revision = draftRevision(records.revision)
      const owner = capacityOperations(
        (run) => run(draft),
        (run) => run(draft),
        residentLifetime
      )
      const revisions = revisionOperations(revision, owner)
      const value = operation(captures, owner, revisions)
      revisions.assert()
      return [value, { ...records, adviceCaptures: captures, revision }]
    }
  return {
    start: Effect.fn("AdviceCaptures.start")(
      (
        reservation: CapacityReservation,
        revision: WorkRevision,
        workspaceBytes: number
      ): Effect.Effect<AdviceCapture | undefined> =>
        commitAllEffect(
          captureChange((captures, owner) => {
            if (captures.has(reservation.id)) return undefined
            const retained = owner.reservationSnapshot(reservation)
            if (retained === undefined) return undefined
            const retainedBytes = retained.bytes
            if (owner.resize(reservation, retainedBytes + workspaceBytes, "adviceRecheck").status !== "resized")
              return undefined
            const capability = Object.freeze({ reservation, revision, retainedBytes })
            captures.set(reservation.id, Object.freeze({ capability, retired: false }))
            return capability
          })
        )
    ),
    resize: Effect.fn("AdviceCaptures.resize")(
      (capture: AdviceCapture, workspaceBytes: number): Effect.Effect<CapacityResize> =>
        commitAllEffect(
          captureChange((captures, owner) => {
            if (captures.get(capture.reservation.id)?.capability !== capture) return { status: "invalid-reservation" }
            return owner.resize(capture.reservation, capture.retainedBytes + workspaceBytes, "adviceRecheck")
          })
        )
    ),
    retire: Effect.fn("AdviceCaptures.retire")(
      (reservation: CapacityReservation): Effect.Effect<boolean> =>
        commitAllEffect(
          captureChange((captures) => {
            const record = captures.get(reservation.id)
            if (record?.capability.reservation !== reservation) return false
            captures.set(reservation.id, Object.freeze({ ...record, retired: true }))
            return true
          })
        )
    ),
    finish: Effect.fn("AdviceCaptures.finish")(
      (capture: AdviceCapture): Effect.Effect<"retained" | "retired" | "stale"> =>
        commitAllEffect(
          captureChange((captures, owner, revisions) => {
            const record = captures.get(capture.reservation.id)
            if (record?.capability !== capture) return "stale"
            if (record.retired) {
              owner.release(capture.reservation)
              revisions.release(capture.revision)
            } else if (owner.resize(capture.reservation, capture.retainedBytes, "storedResult").status !== "resized") {
              throw new Error("advice capture could not restore its retained reservation")
            }
            captures.delete(capture.reservation.id)
            return record.retired ? "retired" : "retained"
          })
        )
    ),
    count: Effect.fn("AdviceCaptures.count")(() =>
      read.pipe(Effect.map((snapshot) => snapshot.records.adviceCaptures.size))
    )
  }
}
