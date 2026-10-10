import {
  residentFindingResponse,
  residentNoticeResponse,
  residentResponseToken,
  residentFinishBindingValid,
  residentFinishSelection
} from "../finish.ts"
import { type RoundCloseReason } from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import { type ResidentRequest, type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import type { ComposedDelivery } from "../../state/composed-delivery.ts"
import { recipientPartition } from "../../recipient/identity.ts"
import { type HandoffContext, type Dependencies } from "./context.ts"
import { residentEditCollectRequest } from "./workflow.ts"
import { residentEditCollectionStatus } from "./collection-status.ts"

export const finishEditHandoff = Effect.fn("ResidentRuntime.finishEditHandoff")(function* (
  context: HandoffContext<"residentAdvice" | "residentAdviceExpired" | "residentCollectionWorkCount">,
  selected: ResidentResponse
): Effect.fn.Return<ResidentResponse> {
  if (!residentEditCollectRequest(context.request)) return selected
  if (context.authority === undefined) return { requestRoute: "edit", status: "unavailable", reason: "lost" }
  return selected.status === "advice"
    ? { ...selected, requestRoute: "edit" }
    : yield* residentEditCollectionStatus(
        context.deps,
        context.authority,
        context.request.root,
        context.request.advicee,
        context.request.composed === true,
        context.now
      )
})

const residentFinishWriteMatches = (canWrite: boolean, response: ResidentResponse, token: string): boolean =>
  canWrite && response.status === "advice" && response.token === token

const residentFinishOutputReason = (output: ReturnType<ComposedDelivery["decideFinishOutput"]>): RoundCloseReason =>
  output.kind === "allowed" ? output.reason : "unavailable"

export const residentReconcileFinishHandoff = Effect.fn("ResidentRuntime.reconcileFinishHandoff")(function* (
  deps: Pick<
    Dependencies,
    "releaseDelivery" | "residentAllowFinish" | "residentComposedDelivery" | "residentLedger" | "residentNow"
  >,
  request: ResidentRequest,
  provisional: ResidentResponse,
  final: ResidentResponse,
  canWrite: boolean
): Effect.fn.Return<ResidentResponse> {
  if (request.operation !== "collect" || request.finish === undefined || !residentFindingResponse(provisional))
    return final
  const group = recipientPartition(request.advicee)
  if (
    !(yield* deps.residentComposedDelivery.revokeProvisionalFinishOutput(
      group,
      request.finish.token,
      provisional.token
    ))
  ) {
    yield* deps.releaseDelivery(provisional.token)
    yield* deps.residentAllowFinish(group, request.finish.token, "unavailable")
    return { status: "empty" }
  }
  const round = yield* deps.residentLedger.rounds.get(group)
  const selection = yield* residentFinishSelection(deps, final)
  const pendingFindings = (yield* deps.residentLedger.canonicalProjection()).pendingFindings
  const bindingValid = residentFinishBindingValid(
    deps,
    final,
    round,
    selection.count,
    selection.advice,
    pendingFindings
  )
  const output = yield* deps.residentComposedDelivery.decideFinishOutput(
    group,
    request.finish.token,
    residentResponseToken(final),
    selection.selected,
    deps.residentNow(),
    residentNoticeResponse(final),
    false,
    residentFinishWriteMatches(canWrite, final, provisional.token),
    bindingValid,
    request.finish.deadlineReached
  )
  if (output.kind === "reserved") return final
  if (final.status === "advice") yield* deps.releaseDelivery(final.token)
  yield* deps.residentAllowFinish(group, request.finish.token, residentFinishOutputReason(output))
  return { status: "empty" }
}, Effect.uninterruptible)
