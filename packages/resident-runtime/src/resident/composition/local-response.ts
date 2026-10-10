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
import type { makeResidentRequests } from "../ipc/requests.ts"

type Dependencies = {
  readonly lifetime: string
  readonly adviceCollection: Pick<ReturnType<typeof makeResidentAdviceCollection>, "residentCollect">
  readonly responses: Pick<ReturnType<typeof makeResidentResponses>, "completeLocal">
  readonly requests: Pick<ReturnType<typeof makeResidentRequests>, "residentHandle" | "residentEditCollectionRequest">
}

export const makeLocalResidentOperations = ({ lifetime, adviceCollection, responses, requests }: Dependencies) => {
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
      const response = yield* adviceCollection.residentCollect(root, advicee, dispatch, mode, authority, composed)
      return yield* responses.completeLocal(
        { requestRoute: "shared", operation: "collect", lifetime, root, advicee, dispatch, mode, composed },
        response,
        authority
      )
    })
  }
  const handle = Effect.fn("ResidentRuntime.localHandoff")(function* (request: ResidentRequest) {
    const context = yield* Ref.make<ResponseContext>({})
    const response = yield* requests.residentHandle(request, context)
    if (response.status !== "advice") return response
    const handoffRequest =
      request.operation === "admit-and-collect" ? requests.residentEditCollectionRequest(request) : request
    return yield* responses.completeLocal(handoffRequest, response, (yield* Ref.get(context)).authority)
  })
  return { collect, handle }
}
