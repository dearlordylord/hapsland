import {
  draftAdviceRecords,
  adviceRecordOperations,
  emptyAdviceContent,
  type AdviceRecordOperations,
  type Advice,
  type AdviceInitial
} from "../advice-records.ts"
import { draftJoinedReviews, joinedReviewOperations, type JoinedReviewOutcome } from "../joined-reviews.ts"
import { draftRevision, revisionOperations } from "../revision.ts"
import { draftDelivery, deliveryOperations, assertDeliveryState } from "../delivery/operations.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"
import { capacityOperations } from "../capacity/operations.ts"

export const residentAdvice = <Pending, DispatchKey, DispatchValue>({
  read,
  commitAllEffect,
  residentLifetime
}: ResidentTransaction<Pending, DispatchKey, DispatchValue>) => {
  const adviceChange =
    <A>(operation: (operations: AdviceRecordOperations) => A): Parameters<typeof commitAllEffect<A>>[0] =>
    (draft, records) => {
      const advice = draftAdviceRecords(records.advice)
      const owner = capacityOperations(
        (run) => run(draft),
        (run) => run(draft),
        residentLifetime
      )
      const operations = adviceRecordOperations(advice, owner)
      const value = operation(operations)
      operations.assert()
      return [value, { ...records, advice }]
    }
  return {
    snapshots: Effect.fn("AdviceRecords.snapshots")(() =>
      read.pipe(
        Effect.map((snapshot) =>
          Object.freeze(
            [...snapshot.records.advice.entries.values()]
              .map(({ capability, content }) => Object.freeze({ capability, content }))
              .sort((left, right) => left.capability.sequence - right.capability.sequence)
          )
        )
      )
    ),
    current: Effect.fn("AdviceRecords.current")((capability: Advice) =>
      read.pipe(
        Effect.map((snapshot) => {
          const retained = snapshot.records.advice.entries.get(capability.id)
          return retained?.capability === capability ? retained.content : emptyAdviceContent
        })
      )
    ),
    values: Effect.fn("AdviceRecords.values")(() =>
      read.pipe(
        Effect.map((snapshot) =>
          Object.freeze(
            [...snapshot.records.advice.entries.values()]
              .map(({ capability }) => capability)
              .sort((left, right) => left.sequence - right.sequence)
          )
        )
      )
    ),
    insert: Effect.fn("AdviceRecords.insert")(
      (initial: AdviceInitial): Effect.Effect<Advice> =>
        commitAllEffect(
          adviceChange((operations) =>
            operations.insert(initial, (metadata) => {
              return Object.freeze({ ...metadata })
            })
          )
        )
    ),
    publish: Effect.fn("AdviceRecords.publish")(
      (capability: Advice): Effect.Effect<ReadonlyArray<JoinedReviewOutcome>> =>
        commitAllEffect((draft, records) => {
          if (records.advice.entries.get(capability.id)?.capability !== capability) return [[], records]
          const owner = capacityOperations(
            (run) => run(draft),
            (run) => run(draft),
            residentLifetime
          )
          const joined = draftJoinedReviews(records.joined)
          const revisions = revisionOperations(draftRevision(records.revision), owner)
          const outcomes = joinedReviewOperations(joined, owner, revisions, (id) =>
            records.advice.entries.has(id)
          ).settle(capability.evaluationKey, "finding", capability.id)
          return [outcomes, { ...records, joined }]
        })
    ),
    eligible: Effect.fn("AdviceRecords.eligible")((...args: Parameters<AdviceRecordOperations["eligible"]>) =>
      commitAllEffect(adviceChange((operations) => operations.eligible(...args)))
    ),
    revise: Effect.fn("AdviceRecords.revise")((...args: Parameters<AdviceRecordOperations["revise"]>) =>
      commitAllEffect(adviceChange((operations) => operations.revise(...args)))
    ),
    reserveLease: Effect.fn("AdviceRecords.reserveLease")(
      (...args: Parameters<AdviceRecordOperations["reserveLease"]>) =>
        commitAllEffect(adviceChange((operations) => operations.reserveLease(...args)))
    ),
    releaseLease: Effect.fn("AdviceRecords.releaseLease")(
      (...args: Parameters<AdviceRecordOperations["releaseLease"]>) =>
        commitAllEffect(adviceChange((operations) => operations.releaseLease(...args)))
    ),
    checkLease: Effect.fn("AdviceRecords.checkLease")((...args: Parameters<AdviceRecordOperations["checkLease"]>) =>
      commitAllEffect(adviceChange((operations) => operations.checkLease(...args)))
    ),
    updateDelivery: Effect.fn("AdviceRecords.updateDelivery")(
      (...args: Parameters<AdviceRecordOperations["updateDelivery"]>) =>
        commitAllEffect(adviceChange((operations) => operations.updateDelivery(...args)))
    ),
    remove: Effect.fn("AdviceRecords.remove")(
      (capability: Advice, reason: "expired" | "stale", token?: string): Effect.Effect<boolean> =>
        commitAllEffect((draft, records) => {
          const advice = draftAdviceRecords(records.advice)
          const owner = capacityOperations(
            (run) => run(draft),
            (run) => run(draft),
            residentLifetime
          )
          const operations = adviceRecordOperations(advice, owner)
          if (!operations.remove(capability, token)) return [false, records]
          const delivery = draftDelivery(records.delivery)
          const deliveryOps = deliveryOperations(delivery, owner, () => {})
          deliveryOps.forget(capability.id)
          const adviceCaptures = new Map(records.adviceCaptures)
          const capture = adviceCaptures.get(capability.reservation.id)
          const revision = draftRevision(records.revision)
          const revisions = revisionOperations(revision, owner)
          if (capture?.capability.reservation === capability.reservation) {
            adviceCaptures.set(capability.reservation.id, Object.freeze({ ...capture, retired: true }))
          } else {
            owner.release(capability.reservation)
            revisions.release(capability.revision)
          }
          operations.assert()
          revisions.assert()
          assertDeliveryState(delivery, owner)
          return [true, { ...records, advice, delivery, adviceCaptures, revision }]
        })
    )
  }
}
