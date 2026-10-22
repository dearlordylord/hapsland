import {
  dispatchIdentity,
  partitionIdentityBytes,
  minimumFreshStart,
  knownPartitionId,
  partitionIdentityCount,
  adviceHandoffIdentityCount,
  internAdviceHandoffIdentity,
  discardUnusedPartition,
  partitionId,
  pruneAdviceHandoffIdentities
} from "../capacity/identities.ts"

import * as Effect from "effect/Effect"

import { type Arguments, type ReviewCapacityReservationHandle } from "../capacity/model.ts"

import { transition, canonicalProjection, dispatchScope } from "../capacity/canonical.ts"
import { replace, reserve, resize, release, snapshot } from "../capacity/reservations.ts"
import {
  readyReviewServiceRequest,
  startReviewServiceRequest,
  interruptReviewServiceRequest,
  startReview,
  settleReviewServiceRequest,
  completeReview,
  observeReview,
  preparedOffer,
  emptyPrepared,
  reviewFailure
} from "../capacity/review.ts"
import {
  observation,
  beginObservedPreparation,
  completePreparation,
  admitObservation
} from "../capacity/preparation.ts"
import { consumeEditPermit, acknowledgeStopRelease, retireRound, currentRoundId, roundId } from "../capacity/rounds.ts"

import type { ResidentTransaction } from "./transaction.ts"
export const residentCapacity = <Pending, DispatchKey, DispatchValue>({
  read,
  commitAllEffect
}: ResidentTransaction<Pending, DispatchKey, DispatchValue>) => ({
  transition: Effect.fn("Capacity.transition")((...args: Arguments<typeof transition>) =>
    commitAllEffect((draft, records) => [transition(draft, ...args), records])
  ),
  canonicalProjection: Effect.fn("Capacity.canonicalProjection")((...args: Arguments<typeof canonicalProjection>) =>
    read.pipe(Effect.map((current) => canonicalProjection(current, ...args)))
  ),
  replace: Effect.fn("Capacity.replace")((...args: Arguments<typeof replace>) =>
    commitAllEffect((draft, records) => [replace(draft, ...args), records]).pipe(
      Effect.map((result) => {
        if ("invalidMeasurement" in result) throw new TypeError("invalid measured review unit size")
        return result
      })
    )
  ),
  reserve: Effect.fn("Capacity.reserve")((...args: Arguments<typeof reserve>) =>
    commitAllEffect((draft, records) => [reserve(draft, ...args), records])
  ),
  resize: Effect.fn("Capacity.resize")((...args: Arguments<typeof resize>) =>
    commitAllEffect((draft, records) => [resize(draft, ...args), records])
  ),
  release: Effect.fn("Capacity.release")((...args: Arguments<typeof release>) =>
    commitAllEffect((draft, records) => [release(draft, ...args), records])
  ),
  snapshot: Effect.fn("Capacity.snapshot")((...args: Arguments<typeof snapshot>) =>
    read.pipe(Effect.map((current) => snapshot(current, ...args)))
  ),
  knownPartitionId: Effect.fn("Capacity.knownPartitionId")((...args: Arguments<typeof knownPartitionId>) =>
    read.pipe(Effect.map((snapshot) => knownPartitionId(snapshot, ...args)))
  ),
  readyReviewServiceRequest: Effect.fn("Capacity.readyReviewServiceRequest")(
    (...args: Arguments<typeof readyReviewServiceRequest>) =>
      commitAllEffect((draft, records) => [readyReviewServiceRequest(draft, ...args), records])
  ),
  startReviewServiceRequest: Effect.fn("Capacity.startReviewServiceRequest")(
    (...args: Arguments<typeof startReviewServiceRequest>) =>
      commitAllEffect((draft, records) => [startReviewServiceRequest(draft, ...args), records])
  ),
  interruptReviewServiceRequest: Effect.fn("Capacity.interruptReviewServiceRequest")(
    (...args: Arguments<typeof interruptReviewServiceRequest>) =>
      commitAllEffect((draft, records) => [interruptReviewServiceRequest(draft, ...args), records])
  ),
  startReview: Effect.fn("Capacity.startReview")((...args: Arguments<typeof startReview>) =>
    commitAllEffect((draft, records) => [startReview(draft, ...args), records])
  ),
  settleReviewServiceRequest: Effect.fn("Capacity.settleReviewServiceRequest")(
    (...args: Arguments<typeof settleReviewServiceRequest>) =>
      commitAllEffect((draft, records) => [settleReviewServiceRequest(draft, ...args), records])
  ),
  completeReview: Effect.fn("Capacity.completeReview")((...args: Arguments<typeof completeReview>) =>
    commitAllEffect((draft, records) => [completeReview(draft, ...args), records])
  ),
  observeReview: Effect.fn("Capacity.observeReview")((...args: Arguments<typeof observeReview>) =>
    commitAllEffect((draft, records) => [observeReview(draft, ...args), records])
  ),
  preparedOffer: Effect.fn("Capacity.preparedOffer")((...args: Arguments<typeof preparedOffer>) =>
    commitAllEffect((draft, records) => [preparedOffer(draft, ...args), records])
  ),
  emptyPrepared: Effect.fn("Capacity.emptyPrepared")((...args: Arguments<typeof emptyPrepared>) =>
    commitAllEffect((draft, records) => [emptyPrepared(draft, ...args), records])
  ),
  reviewFailure: Effect.fn("Capacity.reviewFailure")((...args: Arguments<typeof reviewFailure>) =>
    commitAllEffect((draft, records) => [reviewFailure(draft, ...args), records])
  ),
  observation: Effect.fn("Capacity.observation")((...args: Arguments<typeof observation>) =>
    commitAllEffect((draft, records) => [observation(draft, ...args), records])
  ),
  beginObservedPreparation: Effect.fn("Capacity.beginObservedPreparation")(
    (...args: Arguments<typeof beginObservedPreparation>) =>
      commitAllEffect((draft, records) => [beginObservedPreparation(draft, ...args), records])
  ),
  completePreparation: Effect.fn("Capacity.completePreparation")((...args: Arguments<typeof completePreparation>) =>
    commitAllEffect((draft, records) => [completePreparation(draft, ...args), records])
  ),
  admitObservation: Effect.fn("Capacity.admitObservation")((...args: Arguments<typeof admitObservation>) =>
    commitAllEffect((draft, records) => [admitObservation(draft, ...args), records])
  ),
  consumeEditPermit: Effect.fn("Capacity.consumeEditPermit")((...args: Arguments<typeof consumeEditPermit>) =>
    commitAllEffect((draft, records) => [consumeEditPermit(draft, ...args), records])
  ),
  acknowledgeStopRelease: Effect.fn("Capacity.acknowledgeStopRelease")(
    (...args: Arguments<typeof acknowledgeStopRelease>) =>
      commitAllEffect((draft, records) => [acknowledgeStopRelease(draft, ...args), records])
  ),
  retireRound: Effect.fn("Capacity.retireRound")((...args: Arguments<typeof retireRound>) =>
    commitAllEffect((draft, records) => [retireRound(draft, ...args), records])
  ),
  minimumFreshStart: Effect.fn("Capacity.minimumFreshStart")((...args: Arguments<typeof minimumFreshStart>) =>
    read.pipe(Effect.map((snapshot) => minimumFreshStart(snapshot, ...args)))
  ),
  partitionIdentityCount: Effect.fn("Capacity.partitionIdentityCount")(
    (...args: Arguments<typeof partitionIdentityCount>) =>
      read.pipe(Effect.map((snapshot) => partitionIdentityCount(snapshot, ...args)))
  ),
  partitionIdentityBytes: Effect.fn("Capacity.partitionIdentityBytes")(
    (...args: Arguments<typeof partitionIdentityBytes>) =>
      read.pipe(Effect.map((snapshot) => partitionIdentityBytes(snapshot, ...args)))
  ),
  adviceHandoffIdentityCount: Effect.fn("Capacity.adviceHandoffIdentityCount")(
    (...args: Arguments<typeof adviceHandoffIdentityCount>) =>
      read.pipe(Effect.map((snapshot) => adviceHandoffIdentityCount(snapshot, ...args)))
  ),
  currentRoundId: Effect.fn("Capacity.currentRoundId")((...args: Arguments<typeof currentRoundId>) =>
    read.pipe(Effect.map((snapshot) => currentRoundId(snapshot, ...args)))
  ),
  roundId: Effect.fn("Capacity.roundId")((partition: string) =>
    commitAllEffect((draft, records) => [roundId(draft, partition), records])
  ),
  internAdviceHandoffIdentity: Effect.fn("Capacity.internAdviceHandoffIdentity")(
    (...args: Arguments<typeof internAdviceHandoffIdentity>) =>
      commitAllEffect((draft, records) => [internAdviceHandoffIdentity(draft, ...args), records])
  ),
  discardUnusedPartition: Effect.fn("Capacity.discardUnusedPartition")(
    (...args: Arguments<typeof discardUnusedPartition>) =>
      commitAllEffect((draft, records) => [discardUnusedPartition(draft, ...args), records])
  ),
  dispatchScope: Effect.fn("Capacity.dispatchScope")((...args: Arguments<typeof dispatchScope>) =>
    commitAllEffect((draft, records) => [dispatchScope(draft, ...args), records])
  ),
  partitionId: Effect.fn("Capacity.partitionId")((partition: string) =>
    commitAllEffect((draft, records) => [partitionId(draft, partition), records])
  ),
  dispatchIdentity: Effect.fn("Capacity.dispatchIdentity")((...args: Arguments<typeof dispatchIdentity>) =>
    commitAllEffect((draft, records) => [dispatchIdentity(draft, ...args), records])
  ),
  pruneAdviceHandoffIdentities: Effect.fn("Capacity.pruneAdviceHandoffIdentities")((nativeLive: ReadonlySet<string>) =>
    commitAllEffect((draft, records) => [pruneAdviceHandoffIdentities(draft, nativeLive), records])
  ),
  reservationSnapshot: Effect.fn("Capacity.reservationSnapshot")((capability: ReviewCapacityReservationHandle) =>
    read.pipe(
      Effect.map((snapshot) => {
        const record = snapshot.reservations.get(capability.id)
        return record?.capability === capability
          ? Object.freeze({ bytes: record.bytes, purpose: record.purpose })
          : undefined
      })
    )
  )
})
