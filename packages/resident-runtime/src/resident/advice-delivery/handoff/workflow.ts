import * as Effect from "effect/Effect"
import { type ResponseAuthority, type EditCollectionRequest, type HandoffRequest } from "../authority.ts"
import { type Dependencies } from "./context.ts"
import { residentCollectorGate, residentEditCollectionStatus } from "./collection-status.ts"
import { residentFinalizeHandoff } from "./delivery-finalize.ts"
import { residentHandoffSourceCurrent } from "./source-current.ts"
import { residentResponseGate } from "./response-gate.ts"

export const residentCollectorLifetimeCurrent = Effect.fn("ResidentRuntime.collectorLifetimeCurrent")(function* (
  deps: Pick<Dependencies, "lifetime" | "residentLedger" | "residentRoundActive">,
  authority: ResponseAuthority
) {
  return (
    authority.lifetime === deps.lifetime &&
    (yield* deps.residentLedger.runtime.snapshot()).lifecycle === "active" &&
    (yield* deps.residentRoundActive(authority.round))
  )
})

export const residentEditCollectRequest = (request: HandoffRequest): request is EditCollectionRequest =>
  request.requestRoute === "edit" && request.operation === "collect"

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
    residentHandoffSourceCurrent: residentHandoffSourceCurrent.bind(null, deps),
    residentFinalizeHandoff: residentFinalizeHandoff.bind(null, deps),
    residentCollectorGate: residentCollectorGate.bind(null, deps),
    residentEditCollectionStatus: residentEditCollectionStatus.bind(null, deps),
    residentResponseGate
  }
}
