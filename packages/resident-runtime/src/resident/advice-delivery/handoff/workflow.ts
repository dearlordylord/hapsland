import * as Effect from "effect/Effect"
import {
  DELIVERY_LEASE_MS,
  type ResidentRequest,
  type ResidentResponse
} from "@hapsland/resident-transport/resident/protocol"
import { combinedClaudeOutput, combinedReviewOutput } from "../collection.ts"
import { type ResponseAuthority, type EditCollectionRequest, type HandoffRequest } from "../authority.ts"
import { findingAtDeliveryRoot, handoffCallerRoot } from "../findings.ts"
import { type Dependencies, type HandoffContext } from "./context.ts"
import { residentCollectorGate, residentEditCollectionStatus } from "./collection-status.ts"
import { validateHandoffCredentials, checkHandoffFinalAuthority } from "./authorization.ts"
import {
  selectHandoffCandidates,
  capturedHandoffMode,
  fitHandoffFindings,
  checkHandoffOutputFit
} from "./response-fit.ts"
import { finishEditHandoff, residentReconcileFinishHandoff } from "./finish.ts"
import { inspectionObserveHandoffMessage } from "./observation.ts"
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

const residentSharedWorkStateRequest = (
  request: HandoffRequest
): request is Extract<ResidentRequest, { operation: "collect" }> =>
  request.requestRoute === "shared" &&
  request.operation === "collect" &&
  request.finish === undefined &&
  request.reportWorkState === true

const residentPendingResponse = (response: ResidentResponse): boolean =>
  response.status === "pending" || response.status === "empty"

export const residentClaudeStopRequest = (
  request: HandoffRequest
): request is Extract<ResidentRequest, { operation: "collect" }> =>
  request.operation === "collect" &&
  request.requestRoute === "shared" &&
  request.composed === true &&
  request.advicee.host === "claude-code" &&
  request.mode === "turn-end"

export const residentHandoffSurface = (
  request: Extract<HandoffRequest, { operation: "collect" }>,
  authority: ResponseAuthority | undefined
) => {
  if (authority !== undefined) return authority.claudeFeedbackMode
  return residentClaudeStopRequest(request) ? ("claude-stop" as const) : ("codex" as const)
}

const residentSharedPendingWork = (
  request: HandoffRequest,
  response: ResidentResponse
): request is Extract<ResidentRequest, { operation: "collect" }> =>
  residentSharedWorkStateRequest(request) && residentPendingResponse(response)

const residentMissingEditAuthority = (request: HandoffRequest, authority: ResponseAuthority | undefined): boolean =>
  residentEditCollectRequest(request) && authority === undefined

const residentResponseForHandoff = Effect.fn("ResidentRuntime.responseForHandoff")(function* (
  deps: Pick<
    Dependencies,
    | "inspection"
    | "lifetime"
    | "releaseComposedSubmission"
    | "releaseDelivery"
    | "residentAdvice"
    | "residentAdviceExpired"
    | "residentCandidateRoute"
    | "residentCollectionFindingOffer"
    | "residentCollectionWorkCount"
    | "residentCollectionWorkState"
    | "residentExpirePending"
    | "residentFindingSelectionFacts"
    | "residentInspection"
    | "residentIsCurrentWork"
    | "residentLedger"
    | "residentNotices"
    | "residentNoticesForToken"
    | "residentNow"
    | "residentPendingCanonicalFindings"
    | "residentPruneNoticeCooldowns"
    | "residentReleaseAdviceLease"
    | "residentRemoveAdvice"
    | "residentRoundActive"
  >,
  request: HandoffRequest,
  response: ResidentResponse,
  sourceCurrent: ReadonlyMap<string, boolean>,
  authority?: ResponseAuthority
): Effect.fn.Return<ResidentResponse> {
  const nonAdviceHandoff = Effect.fn("ResidentRuntime.nonAdviceHandoff")(function* (
    response: Exclude<ResidentResponse, { status: "advice" }>
  ): Effect.fn.Return<ResidentResponse> {
    if (residentSharedPendingWork(request, response)) {
      return yield* deps.residentCollectionWorkState(request.root, request.advicee, request.composed === true)
    }
    if (!residentEditCollectRequest(request) || !residentPendingResponse(response)) return response
    const now = deps.residentNow()
    yield* deps.residentExpirePending(now)
    yield* deps.residentPruneNoticeCooldowns(now)
    if (authority === undefined) return { requestRoute: "edit", status: "unavailable", reason: "lost" }
    return (
      (yield* residentCollectorGate(deps, authority, request.dispatch, now)) ??
      (yield* residentEditCollectionStatus(
        deps,
        authority,
        request.root,
        request.advicee,
        request.composed === true,
        now
      ))
    )
  })
  if (response.status !== "advice") return yield* nonAdviceHandoff(response)
  const now = deps.residentNow()
  const context: HandoffContext<
    | "inspection"
    | "lifetime"
    | "releaseComposedSubmission"
    | "releaseDelivery"
    | "residentAdvice"
    | "residentAdviceExpired"
    | "residentCandidateRoute"
    | "residentCollectionFindingOffer"
    | "residentCollectionWorkCount"
    | "residentCollectionWorkState"
    | "residentExpirePending"
    | "residentFindingSelectionFacts"
    | "residentInspection"
    | "residentIsCurrentWork"
    | "residentLedger"
    | "residentNotices"
    | "residentNoticesForToken"
    | "residentNow"
    | "residentPendingCanonicalFindings"
    | "residentPruneNoticeCooldowns"
    | "residentReleaseAdviceLease"
    | "residentRemoveAdvice"
    | "residentRoundActive"
  > = { deps, request, response, sourceCurrent, authority, now }
  yield* deps.residentExpirePending(now)
  yield* deps.residentPruneNoticeCooldowns(now)
  const credentialResponse = yield* validateHandoffCredentials(context)
  if (credentialResponse !== undefined) return credentialResponse
  const handoff = yield* selectHandoffCandidates(context)
  if (residentMissingEditAuthority(request, authority)) {
    yield* deps.releaseDelivery(response.token)
    return { requestRoute: "edit", status: "unavailable", reason: "lost" }
  }
  let handoffMode = yield* capturedHandoffMode(context, handoff)
  yield* fitHandoffFindings(context, handoff, handoffMode)
  const fittedMode = yield* capturedHandoffMode(context, handoff)
  if (fittedMode !== handoffMode) {
    handoffMode = fittedMode
    yield* fitHandoffFindings(context, handoff, handoffMode)
  }
  const finalContents = yield* Effect.forEach(handoff, (advice) => deps.residentLedger.advice.current(advice))
  const findings = finalContents.flatMap((content, index) =>
    (content.delivery?.findings ?? []).map((finding) =>
      findingAtDeliveryRoot(
        finding,
        handoff[index]!.observation.root,
        handoffCallerRoot(request, handoff[index]!.observation.root)
      )
    )
  )
  const notices = yield* deps.residentNoticesForToken(response.token)
  const fitResponse = yield* checkHandoffOutputFit(context, findings, notices)
  if (fitResponse !== undefined) return fitResponse
  const renewHandoffNotices = Effect.fn("ResidentRuntime.renewHandoffNotices")(function* () {
    for (const notice of notices) yield* deps.residentNotices.renew(notice.id, now + DELIVERY_LEASE_MS)
  })
  yield* renewHandoffNotices()
  const authorityResponse = yield* checkHandoffFinalAuthority(context, handoffMode)
  if (authorityResponse !== undefined) return authorityResponse
  const makeHandoffResponse = (): ResidentResponse => {
    return findings.length === 0 && notices.length === 0
      ? { status: "empty" }
      : authority === undefined
        ? {
            status: "advice",
            token: response.token,
            findingCount: findings.length,
            output: combinedReviewOutput(
              findings,
              notices.map((notice) => notice.value)
            )
          }
        : {
            requestRoute: "edit",
            status: "advice",
            token: response.token,
            findingCount: findings.length,
            output: combinedClaudeOutput(
              findings,
              notices.map((notice) => notice.value),
              handoffMode
            )
          }
  }
  const selected = makeHandoffResponse()
  const finalResponse = yield* finishEditHandoff(context, selected)
  // Capture the final resident message before the socket write, independently of hook output.
  inspectionObserveHandoffMessage(deps, request, finalResponse, findings, finalContents, handoff)
  return finalResponse
}, Effect.uninterruptible)

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
    residentResponseForHandoff: residentResponseForHandoff.bind(null, deps),
    residentCollectorGate: residentCollectorGate.bind(null, deps),
    residentEditCollectionStatus: residentEditCollectionStatus.bind(null, deps),
    residentResponseGate,
    residentReconcileFinishHandoff: residentReconcileFinishHandoff.bind(null, deps)
  }
}
