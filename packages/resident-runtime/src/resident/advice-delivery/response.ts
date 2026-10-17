import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import type { createResidentPreparationBinding } from "../review-work/composition/preparation-binding.ts"
import type { ResidentRequest, ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { ResidentAdapterError } from "../adapter-error.ts"
import type { ReviewControls } from "../execution-controls/review-controls.ts"
import type { ResponseAuthority, HandoffRequest, ResponseContext } from "./authority.ts"
import type { makeResidentHandoff } from "./handoff/workflow.ts"

type Dependencies = {
  readonly handoff: Pick<
    ReturnType<typeof makeResidentHandoff>,
    | "residentHandoffSourceCurrent"
    | "residentFinalizeHandoff"
    | "residentResponseGate"
    | "sourceCurrentSession"
    | "finalizationSession"
  >
  readonly canonicalDelivery: Pick<
    ReturnType<typeof createResidentPreparationBinding>,
    "prepareDelivery" | "finalizeDelivery" | "cancelDelivery" | "cleanup"
  >
  readonly controls: Pick<ReviewControls, "beforeResponseHandoff">
  readonly releaseDelivery: (token: string) => Effect.Effect<void>
}

/** Freshness may suspend. The transport must keep final authorization and writing in one uninterruptible boundary. */
export const makeResidentResponses = ({ handoff, controls, releaseDelivery, canonicalDelivery }: Dependencies) => {
  const prepare = handoff.residentHandoffSourceCurrent
  const finalize = handoff.residentFinalizeHandoff
  const cancelContext = Effect.fn("ResidentRuntime.cancelDeliveryContext")(function* (
    context: Ref.Ref<ResponseContext>
  ) {
    const receipt = (yield* Ref.get(context)).delivery
    if (receipt === undefined) return
    yield* canonicalDelivery.cancelDelivery(receipt)
    yield* canonicalDelivery.cleanup()
    yield* Ref.update(context, ({ delivery: _delivery, ...state }) => state)
  }, Effect.uninterruptible)
  const prepareTransport = Effect.fn("ResidentRuntime.prepareTransportResponse")(function* (
    request: ResidentRequest,
    response: ResidentResponse,
    context: Ref.Ref<ResponseContext>
  ) {
    const receipt = (yield* Ref.get(context)).delivery
    const transport = {
      gate: handoff.residentResponseGate(request.operation, response),
      barrier: controls
        .beforeResponseHandoff()
        .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "response handoff barrier" })))
    }
    if (receipt === undefined) {
      yield* transport.gate
      yield* transport.barrier
      return yield* prepare(response)
    }
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const outcome = yield* restore(
          canonicalDelivery.prepareDelivery(receipt, (selected) => handoff.sourceCurrentSession(selected, transport))
        )
        if ("failure" in outcome) return yield* Effect.interrupt
        if (outcome.delivery.kind !== "handoff" || outcome.delivery.value.stage !== "prepare")
          return yield* Effect.die(new Error("Canonical Prepare did not issue Finalize"))
        const successor = outcome.delivery.receipt
        yield* Ref.update(context, (state) => ({ ...state, delivery: successor }))
        return outcome.delivery.value.sources
      })
    )
  })
  const finalizeTransport = Effect.fn("ResidentRuntime.finalizeTransportResponse")(function* (
    original: ResidentRequest,
    request: HandoffRequest,
    provisional: ResidentResponse,
    sources: ReadonlyMap<string, boolean>,
    authority: ResponseAuthority | undefined,
    canWrite: () => boolean,
    context: Ref.Ref<ResponseContext>
  ) {
    const receipt = (yield* Ref.get(context)).delivery
    if (receipt === undefined)
      return yield* finalize(request, provisional, sources, authority, { kind: "transport", original, canWrite })
    const outcome = yield* canonicalDelivery.finalizeDelivery(receipt, (selected, current) =>
      handoff.finalizationSession(request, selected, current, authority, { kind: "transport", original, canWrite })
    )
    if ("failure" in outcome) return yield* Effect.interrupt
    if (outcome.delivery.kind !== "result" || outcome.delivery.value.stage !== "finalize")
      return yield* Effect.die(new Error("Canonical Finalize did not accept result"))
    yield* Ref.update(context, ({ delivery: _delivery, ...state }) => state)
    return outcome.delivery.value.response
  })
  const completeLocal = Effect.fn("ResidentRuntime.completeLocalResponse")(
    (
      request: HandoffRequest,
      response: ResidentResponse,
      authority: ResponseAuthority | undefined,
      context: Ref.Ref<ResponseContext>
    ) =>
      Effect.gen(function* () {
        const receipt = (yield* Ref.get(context)).delivery
        if (receipt === undefined) {
          return yield* Effect.gen(function* () {
            const sources = yield* prepare(response)
            return yield* finalize(request, response, sources, authority, { kind: "local" })
          }).pipe(Effect.onError(() => (response.status === "advice" ? releaseDelivery(response.token) : Effect.void)))
        }
        const prepared = yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const outcome = yield* restore(
              canonicalDelivery.prepareDelivery(receipt, (selected) => handoff.sourceCurrentSession(selected))
            )
            if ("failure" in outcome) return yield* Effect.interrupt
            if (outcome.delivery.kind !== "handoff" || outcome.delivery.value.stage !== "prepare")
              return yield* Effect.die(new Error("Canonical local Prepare did not issue Finalize"))
            const successor = outcome.delivery.receipt
            yield* Ref.update(context, (state) => ({ ...state, delivery: successor }))
            return successor
          })
        )
        return yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const outcome = yield* canonicalDelivery.finalizeDelivery(prepared, (selected, current) =>
              handoff.finalizationSession(request, selected, current, authority, { kind: "local" })
            )
            if ("failure" in outcome) return yield* Effect.interrupt
            if (outcome.delivery.kind !== "result" || outcome.delivery.value.stage !== "finalize")
              return yield* Effect.die(new Error("Canonical local Finalize did not accept result"))
            yield* Ref.update(context, ({ delivery: _delivery, ...state }) => state)
            return outcome.delivery.value.response
          })
        )
      })
  )
  return { prepareTransport, finalizeTransport, completeLocal, cancelContext }
}
