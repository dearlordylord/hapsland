import {
  dispatchIdentity,
  partitionIdentityBytes,
  minimumFreshStart,
  knownPartitionId,
  partitionIdentityCount,
  collectionTokenIdentityCount,
  collectionTokenId,
  discardUnusedPartition,
  partitionId,
  pruneCollectionTokenIds
} from "../capacity/identities.ts"

import * as Effect from "effect/Effect"

import { type Arguments, type CapacityReservation } from "../capacity/model.ts"

import { transition, canonicalProjection, dispatchScope } from "../capacity/canonical.ts"
import { replace, reserve, resize, release, snapshot } from "../capacity/reservations.ts"
import {
  readyJevRequest,
  startJevRequest,
  interruptJevRequest,
  startReview,
  settleJevRequest,
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
  readyJevRequest: Effect.fn("Capacity.readyJevRequest")((...args: Arguments<typeof readyJevRequest>) =>
    commitAllEffect((draft, records) => [readyJevRequest(draft, ...args), records])
  ),
  startJevRequest: Effect.fn("Capacity.startJevRequest")((...args: Arguments<typeof startJevRequest>) =>
    commitAllEffect((draft, records) => [startJevRequest(draft, ...args), records])
  ),
  interruptJevRequest: Effect.fn("Capacity.interruptJevRequest")((...args: Arguments<typeof interruptJevRequest>) =>
    commitAllEffect((draft, records) => [interruptJevRequest(draft, ...args), records])
  ),
  startReview: Effect.fn("Capacity.startReview")((...args: Arguments<typeof startReview>) =>
    commitAllEffect((draft, records) => [startReview(draft, ...args), records])
  ),
  settleJevRequest: Effect.fn("Capacity.settleJevRequest")((...args: Arguments<typeof settleJevRequest>) =>
    commitAllEffect((draft, records) => [settleJevRequest(draft, ...args), records])
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
  collectionTokenIdentityCount: Effect.fn("Capacity.collectionTokenIdentityCount")(
    (...args: Arguments<typeof collectionTokenIdentityCount>) =>
      read.pipe(Effect.map((snapshot) => collectionTokenIdentityCount(snapshot, ...args)))
  ),
  currentRoundId: Effect.fn("Capacity.currentRoundId")((...args: Arguments<typeof currentRoundId>) =>
    read.pipe(Effect.map((snapshot) => currentRoundId(snapshot, ...args)))
  ),
  roundId: Effect.fn("Capacity.roundId")((partition: string) =>
    commitAllEffect((draft, records) => [roundId(draft, partition), records])
  ),
  collectionTokenId: Effect.fn("Capacity.collectionTokenId")((...args: Arguments<typeof collectionTokenId>) =>
    commitAllEffect((draft, records) => [collectionTokenId(draft, ...args), records])
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
  pruneCollectionTokenIds: Effect.fn("Capacity.pruneCollectionTokenIds")((nativeLive: ReadonlySet<string>) =>
    commitAllEffect((draft, records) => [pruneCollectionTokenIds(draft, nativeLive), records])
  ),
  reservationSnapshot: Effect.fn("Capacity.reservationSnapshot")((capability: CapacityReservation) =>
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
