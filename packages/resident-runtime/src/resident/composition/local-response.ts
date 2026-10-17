import type { DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type {
  ResidentDispatchContext,
  ResidentRequest,
  ResidentResponse,
  CollectionMode
} from "@hapsland/resident-transport/resident/protocol"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import type { ResidentAdapterError } from "../adapter-error.ts"
import type { ResponseAuthority, ResponseContext } from "../advice-delivery/authority.ts"
import type { makeResidentAdviceCollection } from "../advice-delivery/advice-collection.ts"
import type { makeResidentResponses } from "../advice-delivery/response.ts"
import type { makeResidentCollectionDelivery } from "../advice-delivery/collection-delivery.ts"
import { recipientPartition } from "../recipient/identity.ts"
import type { makeResidentRequests } from "../ipc/requests.ts"

type Dependencies = {
  readonly lifetime: string
  readonly adviceCollection: Pick<ReturnType<typeof makeResidentAdviceCollection>, "residentCollectionSession">
  readonly responses: Pick<ReturnType<typeof makeResidentResponses>, "completeLocal" | "cancelContext">
  readonly collectDelivery: ReturnType<typeof makeResidentCollectionDelivery>
  readonly requests: Pick<ReturnType<typeof makeResidentRequests>, "residentHandle" | "residentEditCollectionRequest">
}

export const makeLocalResidentOperations = ({
  lifetime,
  adviceCollection,
  responses,
  requests,
  collectDelivery
}: Dependencies) => {
  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode?: CollectionMode
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>
  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: undefined,
    composed: true
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>
  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: ResponseAuthority,
    composed?: boolean
  ): Effect.Effect<ResidentResponse, ResidentAdapterError>
  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    authority?: ResponseAuthority,
    composed = false
  ): Effect.Effect<ResidentResponse, ResidentAdapterError> {
    return Effect.gen(function* () {
      const context = yield* Ref.make<ResponseContext>(authority === undefined ? {} : { authority })
      return yield* Effect.gen(function* () {
        const response = yield* collectDelivery(
          {
            kind: "direct",
            composed,
            turnEnd: mode === "turn-end",
            collection: adviceCollection.residentCollectionSession(root, advicee, dispatch, mode, authority, composed)
          },
          recipientPartition(advicee),
          true,
          context
        )
        return yield* responses.completeLocal(
          { requestRoute: "shared", operation: "collect", lifetime, root, advicee, dispatch, mode, composed },
          response,
          authority,
          context
        )
      }).pipe(Effect.ensuring(responses.cancelContext(context)))
    })
  }
  const handle = Effect.fn("ResidentRuntime.localHandoff")(function* (request: ResidentRequest) {
    const context = yield* Ref.make<ResponseContext>({})
    return yield* Effect.gen(function* () {
      const response = yield* requests.residentHandle(request, context)
      if (response.status !== "advice" && (yield* Ref.get(context)).delivery === undefined) return response
      const handoffRequest =
        request.operation === "admit-and-collect" ? requests.residentEditCollectionRequest(request) : request
      return yield* responses.completeLocal(handoffRequest, response, (yield* Ref.get(context)).authority, context)
    }).pipe(Effect.ensuring(responses.cancelContext(context)))
  })
  return { collect, handle }
}
