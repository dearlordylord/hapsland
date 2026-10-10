import { residentAdviceCredentialAuthority } from "../../authorization/credentials.ts"
import * as Effect from "effect/Effect"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type ClaudeOutputMode } from "../collection.ts"
import { type HandoffContext } from "./context.ts"
import { residentCollectorGate, residentEditCollectionStatus } from "./collection-status.ts"
import { residentEditCollectRequest } from "./workflow.ts"

const observeDeliveryCredential = Effect.fn("ResidentRuntime.observeDeliveryCredential")(function* (
  context: HandoffContext<"residentLedger">,
  invalidSeen: boolean,
  generationValid: boolean,
  authorized: boolean
) {
  const observed = yield* context.deps.residentLedger.transition({
    kind: "deliveryCredentialObserveCheck",
    invalidSeen,
    generationValid,
    authorized
  })
  if (observed.rejection !== undefined || observed.outputs.length !== 1)
    throw new Error("canonical credential observation refused")
  return observed.outputs[0]?.kind === "deliveryCredentialInvalid"
})

export const validateHandoffCredentials = Effect.fn("ResidentRuntime.validateHandoffCredentials")(function* (
  context: HandoffContext<"releaseComposedSubmission" | "residentAdvice" | "residentLedger">
): Effect.fn.Return<ResidentResponse | undefined> {
  const sharedCollect = context.request.operation === "collect"
  const observeCredentials = Effect.fn("ResidentRuntime.observeDeliveryCredentials")(function* () {
    let invalidCredential = false
    if (context.request.operation === "collect")
      for (const advice of yield* context.deps.residentAdvice()) {
        if (
          invalidCredential ||
          (yield* context.deps.residentLedger.advice.current(advice)).delivery?.token !== context.response.token
        )
          continue
        const generationValid =
          advice.credentialGeneration === (context.request.dispatch.credential?.generation ?? null)
        invalidCredential = yield* observeDeliveryCredential(
          context,
          invalidCredential,
          generationValid,
          generationValid && residentAdviceCredentialAuthority(advice)
        )
      }
    return invalidCredential
  })
  const invalidCredential = yield* observeCredentials()
  const credentialGate = yield* context.deps.residentLedger.transition({
    kind: "deliveryFinalCredentialCheck",
    sharedCollect,
    invalidSeen: invalidCredential
  })
  if (credentialGate.rejection !== undefined || credentialGate.outputs.length !== 1)
    throw new Error("canonical final credential gate refused")
  if (credentialGate.outputs[0]?.kind !== "deliveryBatchProceed") {
    yield* context.deps.releaseComposedSubmission(context.response.token)
    return context.request.requestRoute === "edit"
      ? { requestRoute: "edit", status: "unavailable", reason: "credential" }
      : { status: "empty" }
  }
  return undefined
})

export const checkHandoffFinalAuthority = Effect.fn("ResidentRuntime.checkHandoffFinalAuthority")(function* (
  context: HandoffContext<
    | "lifetime"
    | "releaseDelivery"
    | "residentAdvice"
    | "residentAdviceExpired"
    | "residentCollectionWorkCount"
    | "residentLedger"
    | "residentRoundActive"
  >,
  handoffMode: ClaudeOutputMode
): Effect.fn.Return<ResidentResponse | undefined> {
  const checkCollectorAuthority = Effect.fn("ResidentRuntime.checkCollectorAuthority")(function* (): Effect.fn.Return<
    ResidentResponse | undefined
  > {
    if (context.authority !== undefined && context.request.operation === "collect") {
      const gate = yield* residentCollectorGate(context.deps, context.authority, context.request.dispatch, context.now)
      if (gate !== undefined) {
        yield* context.deps.releaseDelivery(context.response.token)
        return gate
      }
    }
    return undefined
  })
  const gate = yield* checkCollectorAuthority()
  if (gate !== undefined) return gate
  const admittedBlock = handoffMode === "block-current-findings"
  const currentBlock = admittedBlock
  if (
    context.authority !== undefined &&
    residentEditCollectRequest(context.request) &&
    (yield* context.deps.residentLedger.transition({
      kind: "collectorFinalAuthorityCheck",
      admittedBlock,
      currentBlock
    })).outputs[0]?.kind !== "collectorFinalProceed"
  ) {
    // Only retained findings whose edit snapshot permits blocking can block.
    yield* context.deps.releaseDelivery(context.response.token)
    return yield* residentEditCollectionStatus(
      context.deps,
      context.authority,
      context.request.root,
      context.request.advicee,
      context.request.composed === true,
      context.now
    )
  }
  return undefined
})
