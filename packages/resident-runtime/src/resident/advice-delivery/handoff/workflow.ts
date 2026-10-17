import { type Dependencies } from "./context.ts"
import { residentCollectorGate } from "./collection-status.ts"
import { residentFinalizeHandoff, makeResidentDeliveryFinalizationSession } from "./delivery-finalize.ts"
import { residentHandoffSourceCurrent, makeResidentSourceCurrentSession } from "./source-current.ts"
import { residentResponseGate } from "./response-gate.ts"

export const makeResidentHandoff = (
  deps: Pick<
    Dependencies,
    | "inspection"
    | "lifetime"
    | "releaseComposedSubmission"
    | "releaseDelivery"
    | "residentAdvice"
    | "residentAdviceExpired"
    | "residentAllowFinish"
    | "residentCandidateRoute"
    | "residentCaptureSource"
    | "residentCollectionFindingOffer"
    | "residentCollectionWorkCount"
    | "residentCollectionWorkState"
    | "residentComposedDelivery"
    | "residentExpirePending"
    | "residentFindingSelectionFacts"
    | "residentInspection"
    | "residentIsCurrentWork"
    | "residentLedger"
    | "residentLifetimeController"
    | "residentNotices"
    | "residentNoticesForToken"
    | "residentNow"
    | "residentPendingCanonicalFindings"
    | "residentPruneNoticeCooldowns"
    | "residentReleaseAdviceLease"
    | "residentRemoveAdvice"
    | "residentReviewControls"
    | "residentRoundActive"
  >
) => {
  return {
    sourceCurrentSession: makeResidentSourceCurrentSession.bind(null, deps),
    finalizationSession: makeResidentDeliveryFinalizationSession.bind(null, deps),
    residentHandoffSourceCurrent: residentHandoffSourceCurrent.bind(null, deps),
    residentFinalizeHandoff: residentFinalizeHandoff.bind(null, deps),
    residentCollectorGate: residentCollectorGate.bind(null, deps),
    residentResponseGate
  }
}
