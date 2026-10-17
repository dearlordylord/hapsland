import * as Effect from "effect/Effect"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import { DELIVERY_LEASE_MS, type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { Advice, AdviceContent } from "../../state/advice-records.ts"
import { residentAdviceCredentialAuthority } from "../../authorization/credentials.ts"
import { recipientPartition } from "../../recipient/identity.ts"
import { finalCollectionFits } from "../collection-decisions.ts"
import {
  combinedClaudeOutput,
  combinedReviewOutput,
  encodedClaudeStopOutputBytes,
  selectFittingCurrentFindingIndices,
  type ClaudeOutputMode
} from "../collection.ts"
import { findingAtDeliveryRoot, handoffCallerRoot } from "../findings.ts"
import type { ResponseAuthority, HandoffRequest } from "../authority.ts"
import type { Dependencies, HandoffNotices } from "./context.ts"
import { residentCollectorGate, residentEditCollectionStatus } from "./collection-status.ts"
import { inspectionObserveHandoffMessage } from "./observation.ts"
import { type FInput, type FCommand, type FResponse, type FTerminal, type FSurface } from "./handoff-core.js"

const nativeHandle = <Value>(values: readonly Value[], handle: number): Value => {
  const value = values[handle]
  if (value === undefined) throw new Error("invalid native handoff capability")
  return value
}

const fittingSurface = (surface: FSurface): ClaudeOutputMode | "codex" | "claude-stop" => {
  switch (surface.$) {
    case "FCodexSurface":
      return "codex"
    case "FStopSurface":
      return "claude-stop"
    case "FAdvisorySurface":
      return "advisory"
    case "FBlockingSurface":
      return "block-current-findings"
  }
}

// This is the closed ABI encoding of the caller's request and response tags.
// Handoff.bend derives pending/work-state, blocking and authority routes.
const finalizeInput = (
  request: HandoffRequest,
  response: ResidentResponse,
  authority: ResponseAuthority | undefined
): FInput => ({
  $: "FInput",
  request:
    request.operation !== "collect"
      ? { $: "FOtherRequest" }
      : request.requestRoute === "edit"
        ? { $: "FEditCollect" }
        : {
            $: "FSharedCollect",
            composed: request.composed === true,
            claude: request.advicee.host === "claude-code",
            turn_end: request.mode === "turn-end",
            finish: request.finish !== undefined,
            report: request.reportWorkState === true
          },
  response:
    response.status === "advice"
      ? { $: "FAdviceResponse" }
      : response.status === "empty"
        ? { $: "FEmptyResponse" }
        : response.status === "pending"
          ? { $: "FPendingResponse" }
          : { $: "FOtherResponse" },
  authority:
    authority === undefined
      ? { $: "FNoAuthority" }
      : authority.claudeFeedbackMode === "block-current-findings"
        ? { $: "FBlockingAuthority" }
        : { $: "FAdvisoryAuthority" }
})

/** Native capabilities and ABI conversion for the whole finalization cursor.
 * The caller keeps this invocation inside its existing uninterruptible tail.
 * All order, loops, short circuits and accepted-finding indexing live in Bend.
 */
export const makeResidentFinalizationSession = (
  deps: Dependencies,
  request: HandoffRequest,
  response: ResidentResponse,
  sourceCurrent: ReadonlyMap<string, boolean>,
  authority?: ResponseAuthority
) => {
  const advice: Advice[] = [],
    findings: Finding[] = [],
    contents: AdviceContent[] = [],
    notices: HandoffNotices = [],
    responses: ResidentResponse[] = []
  const adviceHandles = new Map<Advice, number>()
  const offers: Array<{
    readonly finding: Finding
    readonly facts: Effect.Success<ReturnType<Dependencies["residentFindingSelectionFacts"]>>
  }> = []
  let now: number | undefined
  const readNow = () => {
    if (now === undefined) throw new Error("handoff clock not captured")
    return now
  }
  const adviceResponse = () => {
    if (response.status !== "advice") throw new Error("non-advice handoff capability")
    return response
  }
  const collectRequest = () => {
    if (request.operation !== "collect") throw new Error("non-collect handoff capability")
    return request
  }
  const responseAuthority = () => {
    if (authority === undefined) throw new Error("missing handoff authority capability")
    return authority
  }
  const adviceHandle = (value: Advice) => {
    const existing = adviceHandles.get(value)
    if (existing !== undefined) return existing
    const handle = advice.push(value) - 1
    adviceHandles.set(value, handle)
    return handle
  }
  const optionalResponse = (value: ResidentResponse | undefined): FResponse => ({
    $: "FOptionalResponse",
    response: value === undefined ? { $: "None" } : { $: "Some", value: responses.push(value) - 1 }
  })
  const native = Effect.fn("ResidentRuntime.handoffCommand")(function* (
    command: FCommand
  ): Effect.fn.Return<FResponse> {
    switch (command.$) {
      case "FClock":
        now = deps.residentNow()
        return { $: "FAck" }
      case "FExpire":
        yield* deps.residentExpirePending(readNow())
        return { $: "FAck" }
      case "FPrune":
        yield* deps.residentPruneNoticeCooldowns(readNow())
        return { $: "FAck" }
      case "FWorkState": {
        const value = collectRequest()
        const result = yield* deps.residentCollectionWorkState(
          value.root,
          value.advicee,
          value.composed === true,
          Number(response.status === "pending")
        )
        return { $: "FHandle", handle: responses.push(result) - 1 }
      }
      case "FCollectorGate":
        return optionalResponse(
          yield* residentCollectorGate(deps, responseAuthority(), collectRequest().dispatch, readNow())
        )
      case "FEditStatus": {
        const value = collectRequest()
        const result = yield* residentEditCollectionStatus(
          deps,
          responseAuthority(),
          value.root,
          value.advicee,
          value.composed === true,
          readNow()
        )
        return { $: "FHandle", handle: responses.push(result) - 1 }
      }
      case "FAdvice": {
        const values = yield* deps.residentAdvice()
        return { $: "FHandles", handles: list((command.copy ? [...values] : values).map(adviceHandle)) }
      }
      case "FDelivery": {
        const value = nativeHandle(advice, command.advice)
        const { delivery } = yield* deps.residentLedger.advice.current(value)
        return {
          $: "FDeliveryFacts",
          present: delivery !== undefined,
          owned: delivery?.token === adviceResponse().token,
          findings: list((delivery?.findings ?? []).map((finding) => findings.push(finding) - 1)),
          round: value.round !== undefined,
          work: value.workUnitId !== undefined
        }
      }
      case "FCredentialFacts":
        return {
          $: "FTruth",
          value:
            nativeHandle(advice, command.advice).credentialGeneration ===
            (collectRequest().dispatch.credential?.generation ?? null)
        }
      case "FCredentialAuthority":
        return { $: "FTruth", value: residentAdviceCredentialAuthority(nativeHandle(advice, command.advice)) }
      case "FObserveCredential": {
        const observed = yield* deps.residentLedger.transition({
          kind: "deliveryCredentialObserveCheck",
          invalidSeen: false,
          generationValid: command.generation,
          authorized: command.authorized
        })
        if (observed.rejection !== undefined || observed.outputs.length !== 1)
          throw new Error("canonical credential observation refused")
        return { $: "FTruth", value: observed.outputs[0]?.kind === "deliveryCredentialInvalid" }
      }
      case "FCredentialGate": {
        const gate = yield* deps.residentLedger.transition({
          kind: "deliveryFinalCredentialCheck",
          sharedCollect: command.collect,
          invalidSeen: command.invalid
        })
        if (gate.rejection !== undefined || gate.outputs.length !== 1)
          throw new Error("canonical final credential gate refused")
        return { $: "FTruth", value: gate.outputs[0]?.kind === "deliveryBatchProceed" }
      }
      case "FReleaseComposed":
        yield* deps.releaseComposedSubmission(adviceResponse().token)
        return { $: "FAck" }
      case "FSourceCurrent": {
        const value = nativeHandle(advice, command.advice)
        return { $: "FSource", present: sourceCurrent.has(value.id), current: sourceCurrent.get(value.id) === true }
      }
      case "FRoundActive":
        return { $: "FTruth", value: yield* deps.residentRoundActive(nativeHandle(advice, command.advice).round) }
      case "FExpired":
        return {
          $: "FTruth",
          value: yield* deps.residentAdviceExpired(nativeHandle(advice, command.advice), readNow())
        }
      case "FWorkCurrent": {
        const value = nativeHandle(advice, command.advice)
        return { $: "FTruth", value: yield* deps.residentIsCurrentWork(value.revision, value.prepared) }
      }
      case "FRoute": {
        const route = yield* deps.residentCandidateRoute({
          kind: "finalCandidateCheck",
          ownerCurrent: true,
          credentialGeneration: true,
          credentialAuthorized: true,
          expired: command.expired,
          workCurrent: command.current,
          hasFindings: command.has_findings
        })
        return {
          $: "FRouted",
          route:
            route === "retainCandidate"
              ? { $: "FRetain" }
              : route === "retireCandidate"
                ? { $: "FRetire" }
                : route === "releaseCandidate"
                  ? { $: "FRelease" }
                  : { $: "FIgnore" }
        }
      }
      case "FReleaseAdvice":
        yield* deps.residentReleaseAdviceLease(nativeHandle(advice, command.advice))
        return { $: "FAck" }
      case "FRemoveAdvice":
        yield* deps.residentRemoveAdvice(nativeHandle(advice, command.advice).id, adviceResponse().token)
        return { $: "FAck" }
      case "FRenewAdvice":
        yield* deps.residentLedger.advice.updateDelivery(nativeHandle(advice, command.advice), adviceResponse().token, {
          leaseUntil: readNow() + DELIVERY_LEASE_MS
        })
        return { $: "FAck" }
      case "FReleaseDelivery":
        yield* deps.releaseDelivery(adviceResponse().token)
        return { $: "FAck" }
      case "FAllowsBlocking":
        return {
          $: "FTruth",
          value:
            nativeHandle(advice, command.advice).settings.configuration.policy.claudeFeedbackMode.value ===
            "block-current-findings"
        }
      case "FPendingFindings":
        return {
          $: "FCount",
          count: yield* deps.residentPendingCanonicalFindings(nativeHandle(advice, command.advice).canonicalOperationId)
        }
      case "FOffers": {
        const value = nativeHandle(advice, command.advice)
        const collection = collectRequest()
        const facts = yield* deps.residentFindingSelectionFacts(
          value,
          recipientPartition(collection.advicee),
          collection.dispatch.credential?.generation ?? null,
          readNow(),
          collection.composed === true
        )
        const { delivery } = yield* deps.residentLedger.advice.current(value)
        return {
          $: "FHandles",
          handles: list(
            (delivery?.findings ?? []).map(
              (finding) =>
                offers.push({
                  finding: findingAtDeliveryRoot(
                    finding,
                    value.observation.root,
                    handoffCallerRoot(request, value.observation.root)
                  ),
                  facts
                }) - 1
            )
          )
        }
      }
      case "FFit":
        return {
          $: "FHandles",
          handles: list(
            yield* selectFittingCurrentFindingIndices(
              unlist(command.offers).map((handle) => nativeHandle(offers, handle)),
              fittingSurface(command.surface),
              undefined,
              deps.residentCollectionFindingOffer
            )
          )
        }
      case "FUpdate":
        yield* deps.residentLedger.advice.updateDelivery(nativeHandle(advice, command.advice), adviceResponse().token, {
          findings: unlist(command.findings).map((handle) => nativeHandle(findings, handle))
        })
        return { $: "FAck" }
      case "FContent":
        return {
          $: "FHandle",
          handle: contents.push(yield* deps.residentLedger.advice.current(nativeHandle(advice, command.advice))) - 1
        }
      case "FContentFindings": {
        const value = nativeHandle(advice, command.advice)
        return {
          $: "FHandles",
          handles: list(
            (nativeHandle(contents, command.content).delivery?.findings ?? []).map(
              (finding) =>
                findings.push(
                  findingAtDeliveryRoot(
                    finding,
                    value.observation.root,
                    handoffCallerRoot(request, value.observation.root)
                  )
                ) - 1
            )
          )
        }
      }
      case "FNotices":
        return {
          $: "FHandles",
          handles: list(
            (yield* deps.residentNoticesForToken(adviceResponse().token)).map((value) => notices.push(value) - 1)
          )
        }
      case "FOutputFit": {
        const values = unlist(command.findings).map((handle) => nativeHandle(findings, handle))
        const selected = unlist(command.notices).map((handle) => nativeHandle(notices, handle))
        return {
          $: "FTruth",
          value: finalCollectionFits(
            yield* deps.residentLedger.transition({
              kind: "collectionFitCheck",
              items: values.length + selected.length,
              bytes: encodedClaudeStopOutputBytes(
                values,
                selected.map((notice) => notice.value)
              )
            })
          )
        }
      }
      case "FRenewNotice":
        yield* deps.residentNotices.renew(nativeHandle(notices, command.notice).id, readNow() + DELIVERY_LEASE_MS)
        return { $: "FAck" }
      case "FFinalAuthority":
        return {
          $: "FTruth",
          value:
            (yield* deps.residentLedger.transition({
              kind: "collectorFinalAuthorityCheck",
              admittedBlock: command.blocking,
              currentBlock: command.blocking
            })).outputs[0]?.kind === "collectorFinalProceed"
        }
      case "FEmptyResponseValue":
        return { $: "FHandle", handle: responses.push({ status: "empty" }) - 1 }
      case "FBuildResponse": {
        const values = unlist(command.findings).map((handle) => nativeHandle(findings, handle))
        const selected = unlist(command.notices).map((handle) => nativeHandle(notices, handle).value)
        const result: ResidentResponse =
          authority === undefined
            ? {
                status: "advice",
                token: adviceResponse().token,
                findingCount: values.length,
                output: combinedReviewOutput(values, selected)
              }
            : {
                requestRoute: "edit",
                status: "advice",
                token: adviceResponse().token,
                findingCount: values.length,
                output: combinedClaudeOutput(values, selected, command.blocking ? "block-current-findings" : "advisory")
              }
        return { $: "FHandle", handle: responses.push(result) - 1 }
      }
      case "FObserveMessage":
        inspectionObserveHandoffMessage(
          deps,
          request,
          nativeHandle(responses, command.response),
          unlist(command.findings).map((handle) => nativeHandle(findings, handle)),
          unlist(command.contents).map((handle) => nativeHandle(contents, handle)),
          unlist(command.advice).map((handle) => nativeHandle(advice, handle))
        )
        return { $: "FAck" }
      default: {
        const exhaustive: never = command
        throw new Error(`unknown handoff command: ${exhaustive}`)
      }
    }
  })
  return {
    input: finalizeInput(request, response, authority),
    perform: native,
    decode: (result: FTerminal): ResidentResponse => {
      switch (result.$) {
        case "FOriginal":
          return response
        case "FEmpty":
          return { status: "empty" }
        case "FLost":
          return { requestRoute: "edit", status: "unavailable", reason: "lost" }
        case "FCredentialUnavailable":
          return { requestRoute: "edit", status: "unavailable", reason: "credential" }
        case "FResponseHandle":
          return nativeHandle(responses, result.response)
      }
    }
  }
}
