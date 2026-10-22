import { dispatchIdentity } from "../capacity/identities.ts"
import {
  type CapacityDraft,
  type CapacityState,
  type ReviewCapacityReservationHandle,
  type Arguments
} from "./model.ts"
import { snapshot, reserve, resize, replace, release, clear } from "./reservations.ts"
import {
  partitionId,
  knownPartitionId,
  minimumFreshStart,
  partitionIdentityCount,
  partitionIdentityBytes,
  discardUnusedPartition,
  internAdviceHandoffIdentity,
  adviceHandoffIdentityCount,
  pruneAdviceHandoffIdentities
} from "./identities.ts"
import { dispatchScope, transition, canonicalProjection } from "./canonical.ts"
import { acknowledgeStopRelease, consumeEditPermit, roundId, currentRoundId, retireRound } from "./rounds.ts"
import { admitObservation, observation, beginObservedPreparation, completePreparation } from "./preparation.ts"
import {
  startReview,
  readyReviewServiceRequest,
  startReviewServiceRequest,
  interruptReviewServiceRequest,
  settleReviewServiceRequest,
  completeReview,
  observeReview,
  preparedOffer,
  emptyPrepared,
  reviewFailure
} from "./review.ts"

export const capacityOperations = (
  commit: <A>(operation: (draft: CapacityDraft) => A) => A,
  read: <A>(operation: (current: CapacityState) => A) => A,
  residentInstanceId: string
) => {
  return {
    residentInstanceId,
    canonicalLifetimeId: 1,
    reservationSnapshot: (capability: ReviewCapacityReservationHandle) =>
      read((snapshot) => {
        const record = snapshot.reservations.get(capability.id)
        return record?.capability === capability
          ? Object.freeze({ bytes: record.bytes, purpose: record.purpose })
          : undefined
      }),
    partitionId: (...args: Arguments<typeof partitionId>) => commit((draft) => partitionId(draft, ...args)),
    knownPartitionId: (...args: Arguments<typeof knownPartitionId>) =>
      read((draft) => knownPartitionId(draft, ...args)),
    minimumFreshStart: (...args: Arguments<typeof minimumFreshStart>) =>
      read((draft) => minimumFreshStart(draft, ...args)),
    partitionIdentityCount: (...args: Arguments<typeof partitionIdentityCount>) =>
      read((draft) => partitionIdentityCount(draft, ...args)),
    partitionIdentityBytes: (...args: Arguments<typeof partitionIdentityBytes>) =>
      read((draft) => partitionIdentityBytes(draft, ...args)),
    discardUnusedPartition: (...args: Arguments<typeof discardUnusedPartition>) =>
      commit((draft) => discardUnusedPartition(draft, ...args)),
    internAdviceHandoffIdentity: (...args: Arguments<typeof internAdviceHandoffIdentity>) =>
      commit((draft) => internAdviceHandoffIdentity(draft, ...args)),
    adviceHandoffIdentityCount: (...args: Arguments<typeof adviceHandoffIdentityCount>) =>
      read((draft) => adviceHandoffIdentityCount(draft, ...args)),
    pruneAdviceHandoffIdentities: (...args: Arguments<typeof pruneAdviceHandoffIdentities>) =>
      commit((draft) => pruneAdviceHandoffIdentities(draft, ...args)),
    dispatchIdentity: (...args: Arguments<typeof dispatchIdentity>) =>
      commit((draft) => dispatchIdentity(draft, ...args)),
    dispatchScope: (...args: Arguments<typeof dispatchScope>) => commit((draft) => dispatchScope(draft, ...args)),
    transition: (...args: Arguments<typeof transition>) => commit((draft) => transition(draft, ...args)),
    canonicalProjection: (...args: Arguments<typeof canonicalProjection>) =>
      read((draft) => canonicalProjection(draft, ...args)),
    acknowledgeStopRelease: (...args: Arguments<typeof acknowledgeStopRelease>) =>
      commit((draft) => acknowledgeStopRelease(draft, ...args)),
    consumeEditPermit: (...args: Arguments<typeof consumeEditPermit>) =>
      commit((draft) => consumeEditPermit(draft, ...args)),
    roundId: (...args: Arguments<typeof roundId>) => commit((draft) => roundId(draft, ...args)),
    currentRoundId: (...args: Arguments<typeof currentRoundId>) => read((draft) => currentRoundId(draft, ...args)),
    admitObservation: (...args: Arguments<typeof admitObservation>) =>
      commit((draft) => admitObservation(draft, ...args)),
    observation: (...args: Arguments<typeof observation>) => commit((draft) => observation(draft, ...args)),
    beginObservedPreparation: (...args: Arguments<typeof beginObservedPreparation>) =>
      commit((draft) => beginObservedPreparation(draft, ...args)),
    completePreparation: (...args: Arguments<typeof completePreparation>) =>
      commit((draft) => completePreparation(draft, ...args)),
    startReview: (...args: Arguments<typeof startReview>) => commit((draft) => startReview(draft, ...args)),
    readyReviewServiceRequest: (...args: Arguments<typeof readyReviewServiceRequest>) =>
      commit((draft) => readyReviewServiceRequest(draft, ...args)),
    startReviewServiceRequest: (...args: Arguments<typeof startReviewServiceRequest>) =>
      commit((draft) => startReviewServiceRequest(draft, ...args)),
    interruptReviewServiceRequest: (...args: Arguments<typeof interruptReviewServiceRequest>) =>
      commit((draft) => interruptReviewServiceRequest(draft, ...args)),
    settleReviewServiceRequest: (...args: Arguments<typeof settleReviewServiceRequest>) =>
      commit((draft) => settleReviewServiceRequest(draft, ...args)),
    completeReview: (...args: Arguments<typeof completeReview>) => commit((draft) => completeReview(draft, ...args)),
    observeReview: (...args: Arguments<typeof observeReview>) => commit((draft) => observeReview(draft, ...args)),
    preparedOffer: (...args: Arguments<typeof preparedOffer>) => commit((draft) => preparedOffer(draft, ...args)),
    emptyPrepared: (...args: Arguments<typeof emptyPrepared>) => commit((draft) => emptyPrepared(draft, ...args)),
    reviewFailure: (...args: Arguments<typeof reviewFailure>) => commit((draft) => reviewFailure(draft, ...args)),
    retireRound: (...args: Arguments<typeof retireRound>) => commit((draft) => retireRound(draft, ...args)),
    reserve: (...args: Arguments<typeof reserve>) => commit((draft) => reserve(draft, ...args)),
    resize: (...args: Arguments<typeof resize>) => commit((draft) => resize(draft, ...args)),
    replace: (...args: Arguments<typeof replace>) => {
      const result = commit((draft) => replace(draft, ...args))
      if ("invalidMeasurement" in result) throw new TypeError("invalid measured review unit size")
      return result
    },
    release: (...args: Arguments<typeof release>) => commit((draft) => release(draft, ...args)),
    clear: (...args: Arguments<typeof clear>) => commit((draft) => clear(draft, ...args)),
    snapshot: (...args: Arguments<typeof snapshot>) => read((draft) => snapshot(draft, ...args))
  }
}
export type CapacityLedger = ReturnType<typeof capacityOperations>
