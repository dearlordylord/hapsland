import type { CapacityLedger } from "../capacity/operations.ts"
import type { ReviewSettingsSnapshot } from "@hapsland/review-definition/runtime/review-settings"
import { type DeliveryState, type Submission } from "./model.ts"

/** Read-only delivery views leave the owned record unchanged. */
export const deliveryView = <Owner extends Pick<CapacityLedger, "canonicalProjection">>(
  state: DeliveryState,
  canonicalOwner: Owner
) => {
  function registeredEditSettings(partition: string, eventId: string): ReviewSettingsSnapshot | undefined {
    return state.permits.get(`${partition}\0${eventId}`)?.settings
  }

  function recentEditCount(): number {
    return canonicalOwner.canonicalProjection().completedEdits.length
  }

  function editIdentityMappingCount(): number {
    return state.toolIds.size
  }

  function addSubmissionTokenKeys(live: Set<string>, adviceId: string, submission: Submission): void {
    for (const [token, batch] of submission.batches) {
      live.add(token)
      for (const digest of batch.fingerprints) live.add(`submission-finding\0${adviceId}\0${digest}`)
    }
  }
  function liveCollectionTokenKeys(): Set<string> {
    const live = new Set<string>()
    for (const waiter of state.backgroundWaiters.values()) live.add(waiter.token)
    for (const stop of state.stops.values()) if (stop.outputToken !== undefined) live.add(stop.outputToken)
    for (const token of state.finishPermits.keys()) live.add(token)
    for (const [adviceId, submission] of state.submissions) {
      live.add(`submission-advice\0${adviceId}`)
      addSubmissionTokenKeys(live, adviceId, submission)
    }
    return live
  }

  function hasFinishPermit(token: string): boolean {
    return state.finishPermits.has(token)
  }

  function isFinishAuthorized(token: string): boolean {
    return state.finishPermits.get(token)?.authorized === true
  }

  function hasToken(token: string): boolean {
    return [...state.submissions.values()].some((submission) => submission.batches.has(token))
  }
  return {
    canonical: canonicalOwner,
    recentEditCount,
    registeredEditSettings,
    editIdentityMappingCount,
    liveCollectionTokenKeys,
    hasFinishPermit,
    isFinishAuthorized,
    hasToken
  }
}
