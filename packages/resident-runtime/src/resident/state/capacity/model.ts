import {
  type CanonicalEvent,
  type CapacityPurpose,
  type CapacityRefusal
} from "@hapsland/canonical-policy/canonical/adapter"

export const GLOBAL_ITEM_LIMIT = 512
// Capture reserves eight times the bounded source plus metadata; analysis uses
// measured facts when available. Unknown expansion may exceed a recipient's
// budget and must remain refused. Logical reservations are not an RSS claim.
export const GLOBAL_BYTE_LIMIT = 512 * 1024 * 1024
export const PARTITION_ITEM_LIMIT = 16
export const PARTITION_BYTE_LIMIT = 256 * 1024 * 1024
export const MAX_PARTITION_IDENTITIES = 8192
export const MAX_PARTITION_KEY_BYTES = 1024 * 1024
export const MAX_PARTITION_IDENTITY_BYTES = 64 * 1024 * 1024
export const MAX_COLLECTION_TOKEN_IDENTITIES = 16384
export const MAX_COLLECTION_TOKEN_KEY_BYTES = 4096
export type CapacityLimits = {
  readonly globalItems: number
  readonly globalBytes: number
  readonly partitionItems: number
  readonly partitionBytes: number
}
export type CapacityReservation = { readonly id: number; readonly partition: string }
export type PreparationAdmission =
  | { readonly status: "admitted"; readonly operation: number; readonly reservation: CapacityReservation }
  | { readonly status: "capacity-refused" }
  | { readonly status: "unavailable"; readonly reason: "stale-round" | "wrong-stage" }
  | { readonly status: "invalid-measurement" }
export type CapacityResize =
  | { readonly status: "resized" }
  | { readonly status: "capacity-refused"; readonly constraint: CapacityRefusal }
  | { readonly status: "invalid-reservation" }
  | { readonly status: "invalid-measurement" }
export type CapacitySnapshot = {
  readonly items: number
  readonly bytes: number
  readonly partitions: Readonly<Record<string, { readonly items: number; readonly bytes: number }>>
}
export type ResidentTransition = Extract<
  CanonicalEvent,
  {
    readonly kind:
      | "issuePermit"
      | "checkCompletedEdit"
      | "rememberCompletedEdit"
      | "quietRoundTick"
      | "quietRoundReset"
      | "consumePermit"
      | "releasePermit"
      | "expirePermit"
      | "closePermitRound"
      | "forgetAdmission"
      | "openRound"
      | "admitObservation"
      | "startObservation"
      | "completeObservation"
      | "interruptObservation"
      | "beginObservedPreparation"
      | "interruptPreparation"
      | "preparationCompleted"
      | "startReview"
      | "jevRequestReady"
      | "jevRequestStarted"
      | "jevRequestInterrupted"
      | "jevRequestSettled"
      | "reviewCompleted"
      | "retireReview"
      | "retirePartition"
      | "reviewObserved"
      | "findingCountUpdated"
      | "preparedOfferCheck"
      | "emptyPreparedCheck"
      | "reviewFailureCheck"
      | "queueDispatch"
      | "dispatchSettled"
      | "discardDispatch"
      | "dispatchScopeCheck"
      | "closeDispatch"
      | "stopGroupPolled"
      | "stopGroupEnded"
      | "collectionReady"
      | "collectionCredentialCheck"
      | "collectionCandidateCheck"
      | "collectionOrderCheck"
      | "collectionExpiryCheck"
      | "collectionFindingCheck"
      | "collectionNoticeCheck"
      | "collectionFitCheck"
      | "collectionReserveLease"
      | "collectionReleaseLease"
      | "collectionLeaseCheck"
      | "collectionRetireAdvice"
      | "collectionClaimBackground"
      | "collectionReleaseBackground"
      | "collectionExpireBackground"
      | "finishReserve"
      | "finishRelease"
      | "finishAuthorize"
      | "finishTerminal"
      | "finishEnd"
      | "continuationConsume"
      | "submissionBegin"
      | "submissionAuthorize"
      | "submissionTerminal"
      | "submissionRelease"
      | "submissionForget"
      | "submissionSuppressCheck"
      | "submissionReofferCheck"
      | "submissionExpiryCheck"
      | "revisionRegister"
      | "revisionRelease"
      | "revisionCurrentCheck"
      | "revisionSupersededCheck"
      | "revisionGenerationCheck"
      | "revisionCountCheck"
      | "collectorGateCheck"
      | "collectorFinalAuthorityCheck"
      | "reuseMemberCheck"
      | "cleanupCheck"
      | "cleanupCommit"
      | "deliveryReleaseCheck"
      | "deliveryAcknowledgeCheck"
      | "deliveryFinalizeCheck"
      | "deliveryFindingDispositionCheck"
      | "deliverySubmissionCandidateCheck"
      | "deliverySubmissionBatchCheck"
      | "deliveryCredentialObserveCheck"
      | "deliveryFinalCredentialCheck"
      | "validationRouteCheck"
      | "postValidationCheck"
      | "finalCandidateCheck"
      | "roundBeginStopCheck"
      | "roundOwnsStopCheck"
      | "roundStopTerminalCheck"
      | "roundActivityCheck"
      | "roundBarrierCheck"
      | "roundExpireCloseCheck"
      | "roundContinuationBudgetCheck"
      | "deliverySubmissionAllowedCheck"
      | "deliveryExistingTokenCheck"
      | "deliveryUnreservedStopCheck"
      | "reuseRoute"
      | "reuseClaim"
      | "reuseAttach"
      | "reuseRelease"
      | "reuseTouch"
      | "cachePrepare"
      | "cacheCommit"
      | "cacheDiscardPartition"
      | "cacheClear"
      | "noticeAdvance"
      | "noticeCommit"
      | "noticePrune"
      | "noticeDrop"
      | "noticeLease"
      | "noticeClearPending"
      | "noticeSelect"
  }
>
export const defaultLimits: CapacityLimits = {
  globalItems: GLOBAL_ITEM_LIMIT,
  globalBytes: GLOBAL_BYTE_LIMIT,
  partitionItems: PARTITION_ITEM_LIMIT,
  partitionBytes: PARTITION_BYTE_LIMIT
}
/** Measure an untrusted logical payload without allowing unknown output size. */
export const encodedBytesWithin = (value: unknown, maximum: number): number | undefined => {
  try {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) return undefined
    const bytes = Buffer.byteLength(encoded, "utf8")
    return bytes <= maximum ? bytes : undefined
  } catch {
    return undefined
  }
}
type ReservationRecord = {
  readonly capability: CapacityReservation
  readonly bytes: number
  readonly purpose: CapacityPurpose
}
export type CapacityState = {
  readonly residentLifetime: string
  readonly limits: CapacityLimits
  readonly canonical: unknown
  readonly reservations: ReadonlyMap<number, ReservationRecord>
  readonly partitionIds: ReadonlyMap<string, number>
  readonly partitionIdentityBytes: number
  readonly roundIds: ReadonlyMap<string, number>
  readonly requestRounds: ReadonlyMap<number, { readonly partition: string; readonly round: number }>
  readonly collectionTokens: ReadonlyMap<string, number>
  readonly nextCollectionToken: number
  readonly nextPartitionId: number
  readonly minimumFreshStart: number
}
export type CapacityDraft = {
  -readonly [K in keyof CapacityState]: CapacityState[K] extends ReadonlyMap<infer Key, infer Value>
    ? Map<Key, Value>
    : CapacityState[K]
}
export type Arguments<F extends (...args: never[]) => unknown> =
  Parameters<F> extends [unknown, ...infer Rest] ? Rest : never
export const draftCapacity = (current: CapacityState): CapacityDraft => ({
  ...current,
  reservations: new Map(current.reservations),
  partitionIds: new Map(current.partitionIds),
  roundIds: new Map(current.roundIds),
  requestRounds: new Map(current.requestRounds),
  collectionTokens: new Map(current.collectionTokens)
})
