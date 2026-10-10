import { finalCollectionFits } from "../collection-decisions.ts"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { Advice } from "../../state/advice-records.ts"
import * as Effect from "effect/Effect"
import { DELIVERY_LEASE_MS, type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import {
  encodedClaudeStopOutputBytes,
  selectFittingCurrentFindingIndices,
  type ClaudeOutputMode
} from "../collection.ts"
import { recipientPartition } from "../../recipient/identity.ts"
import { findingAtDeliveryRoot, handoffCallerRoot } from "../findings.ts"
import { type HandoffContext, type HandoffNotices } from "./context.ts"
import { residentHandoffSurface, residentClaudeStopRequest } from "./workflow.ts"

export const selectHandoffCandidates = Effect.fn("ResidentRuntime.selectHandoffCandidates")(function* (
  context: HandoffContext<
    | "residentAdvice"
    | "residentAdviceExpired"
    | "residentCandidateRoute"
    | "residentIsCurrentWork"
    | "residentLedger"
    | "residentReleaseAdviceLease"
    | "residentRemoveAdvice"
    | "residentRoundActive"
  >
) {
  const finalCandidateRoute = Effect.fn("ResidentRuntime.finalCandidateRoute")(function* (advice: Advice) {
    return yield* context.deps.residentCandidateRoute({
      kind: "finalCandidateCheck",
      ownerCurrent: true,
      credentialGeneration: true,
      credentialAuthorized: true,
      expired:
        !(yield* context.deps.residentRoundActive(advice.round)) ||
        (yield* context.deps.residentAdviceExpired(advice, context.now)),
      workCurrent:
        (yield* context.deps.residentIsCurrentWork(advice.revision, advice.prepared)) &&
        context.sourceCurrent.get(advice.id) === true,
      hasFindings: ((yield* context.deps.residentLedger.advice.current(advice)).delivery?.findings.length ?? 0) > 0
    })
  })
  const handoff: Array<Advice> = []
  for (const advice of [...(yield* context.deps.residentAdvice())]) {
    if ((yield* context.deps.residentLedger.advice.current(advice)).delivery?.token !== context.response.token) continue
    if (!context.sourceCurrent.has(advice.id)) {
      yield* context.deps.residentReleaseAdviceLease(advice)
      continue
    }
    const route = yield* finalCandidateRoute(advice)
    if (route === "retireCandidate") {
      yield* context.deps.residentRemoveAdvice(advice.id, context.response.token)
      continue
    }
    if (route === "releaseCandidate") {
      yield* context.deps.residentReleaseAdviceLease(advice)
      continue
    }
    if (route !== "retainCandidate") continue
    yield* context.deps.residentLedger.advice.updateDelivery(advice, context.response.token, {
      leaseUntil: context.now + DELIVERY_LEASE_MS
    })
    handoff.push(advice)
  }
  return handoff
})

export const capturedHandoffMode = Effect.fn("ResidentRuntime.capturedHandoffMode")(function* (
  context: HandoffContext<"residentLedger">,
  handoff: readonly Advice[]
): Effect.fn.Return<ClaudeOutputMode> {
  if (context.authority?.claudeFeedbackMode !== "block-current-findings") return "advisory"
  for (const advice of handoff) {
    if (advice.settings.configuration.policy.claudeFeedbackMode.value !== "block-current-findings") continue
    const { delivery } = yield* context.deps.residentLedger.advice.current(advice)
    if (delivery?.token === context.response.token && delivery.findings.length > 0) return "block-current-findings"
  }
  return "advisory"
})

export const fitHandoffFindings = Effect.fn("ResidentRuntime.fitHandoffFindings")(function* (
  context: HandoffContext<
    | "residentCollectionFindingOffer"
    | "residentFindingSelectionFacts"
    | "residentLedger"
    | "residentPendingCanonicalFindings"
    | "residentReleaseAdviceLease"
  >,
  handoff: readonly Advice[],
  handoffMode: ClaudeOutputMode
) {
  if (context.request.operation === "collect") {
    const composed = context.request.composed === true
    const partition = recipientPartition(context.request.advicee)
    const generation = context.request.dispatch.credential?.generation ?? null
    const pruneHandoffBounds = Effect.fn("ResidentRuntime.pruneHandoffBounds")(function* () {
      if (composed)
        for (const advice of handoff) {
          const { delivery } = yield* context.deps.residentLedger.advice.current(advice)
          if (
            delivery !== undefined &&
            (advice.round === undefined ||
              advice.workUnitId === undefined ||
              delivery.findings.length >
                (yield* context.deps.residentPendingCanonicalFindings(advice.canonicalOperationId)))
          ) {
            yield* context.deps.residentReleaseAdviceLease(advice)
          }
        }
    })
    yield* pruneHandoffBounds()
    const offers = (yield* Effect.forEach(
      handoff,
      Effect.fn("ResidentRuntime.finalOffers")(function* (advice) {
        const facts = yield* context.deps.residentFindingSelectionFacts(
          advice,
          partition,
          generation,
          context.now,
          composed
        )
        const { delivery } = yield* context.deps.residentLedger.advice.current(advice)
        return (delivery?.findings ?? []).map((finding) => ({
          finding: findingAtDeliveryRoot(
            finding,
            advice.observation.root,
            handoffCallerRoot(context.request, advice.observation.root)
          ),
          facts
        }))
      })
    )).flat()
    const accepted = new Set(
      yield* selectFittingCurrentFindingIndices(
        offers,
        context.authority === undefined ? residentHandoffSurface(context.request, context.authority) : handoffMode,
        undefined,
        context.deps.residentCollectionFindingOffer
      )
    )
    let index = 0
    for (const advice of handoff) {
      const { delivery } = yield* context.deps.residentLedger.advice.current(advice)
      if (delivery === undefined) continue
      const fitting = delivery.findings.filter(() => accepted.has(index++))
      yield* context.deps.residentLedger.advice.updateDelivery(advice, context.response.token, { findings: fitting })
      if (fitting.length === 0) yield* context.deps.residentReleaseAdviceLease(advice)
    }
  }
})

export const checkHandoffOutputFit = Effect.fn("ResidentRuntime.checkHandoffOutputFit")(function* (
  context: HandoffContext<"releaseDelivery" | "residentLedger">,
  findings: readonly Finding[],
  notices: HandoffNotices
): Effect.fn.Return<ResidentResponse | undefined> {
  if (residentClaudeStopRequest(context.request)) {
    const fit = yield* context.deps.residentLedger.transition({
      kind: "collectionFitCheck",
      items: findings.length + notices.length,
      bytes: encodedClaudeStopOutputBytes(
        findings,
        notices.map((notice) => notice.value)
      )
    })
    if (!finalCollectionFits(fit)) {
      yield* context.deps.releaseDelivery(context.response.token)
      return { status: "empty" }
    }
  }
  return undefined
})
