import * as Effect from "effect/Effect"
import type { ResidentRequest, ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { ResidentAdapterError } from "../adapter-error.ts"
import type { ReviewControls } from "../execution-controls/review-controls.ts"
import type { ResponseAuthority, HandoffRequest } from "./authority.ts"
import type { makeResidentHandoff } from "./handoff/workflow.ts"

type Dependencies = {
  readonly handoff: Pick<
    ReturnType<typeof makeResidentHandoff>,
    | "residentHandoffSourceCurrent"
    | "residentResponseForHandoff"
    | "residentReconcileFinishHandoff"
    | "residentResponseGate"
  >
  readonly controls: Pick<ReviewControls, "beforeResponseHandoff">
  readonly releaseDelivery: (token: string) => Effect.Effect<void>
}

/** Freshness may suspend. The transport must keep final authorization and writing in one uninterruptible boundary. */
export const makeResidentResponses = ({ handoff, controls, releaseDelivery }: Dependencies) => {
  const prepare = handoff.residentHandoffSourceCurrent
  const finalize = handoff.residentResponseForHandoff
  const prepareTransport = Effect.fn("ResidentRuntime.prepareTransportResponse")(function* (
    request: ResidentRequest,
    response: ResidentResponse
  ) {
    yield* handoff.residentResponseGate(request.operation, response)
    yield* controls
      .beforeResponseHandoff()
      .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "response handoff barrier" })))
    return yield* prepare(response)
  })
  const finalizeTransport = Effect.fn("ResidentRuntime.finalizeTransportResponse")(function* (
    original: ResidentRequest,
    request: HandoffRequest,
    provisional: ResidentResponse,
    sources: ReadonlyMap<string, boolean>,
    authority: ResponseAuthority | undefined,
    canWrite: () => boolean
  ) {
    const selected = yield* finalize(request, provisional, sources, authority)
    return yield* handoff.residentReconcileFinishHandoff(original, provisional, selected, canWrite())
  })
  const completeLocal = Effect.fn("ResidentRuntime.completeLocalResponse")(
    (request: HandoffRequest, response: ResidentResponse, authority: ResponseAuthority | undefined) =>
      Effect.gen(function* () {
        const sources = yield* prepare(response)
        return yield* finalize(request, response, sources, authority)
      }).pipe(Effect.onError(() => (response.status === "advice" ? releaseDelivery(response.token) : Effect.void)))
  )
  return { prepareTransport, finalizeTransport, completeLocal }
}
