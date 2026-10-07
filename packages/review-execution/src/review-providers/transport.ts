import { JEV_PROVIDER, type RequestContentProfile } from "@hapsland/runtime-environment/runtime/backend"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import { reviewRequestContent } from "./request-content.ts"
import { inspectHttpTransport } from "@hapsland/inspection-records/inspection/transport"

/** Review requests carry provider framing, not ambient agent trace context. */
export const reviewHttpTransport = (
  client: HttpClient.HttpClient,
  profile: RequestContentProfile = JEV_PROVIDER.requestContent
): HttpClient.HttpClient =>
  HttpClient.transformResponse(
    HttpClient.mapRequest(inspectHttpTransport(client), (request) => {
      if (request.body._tag !== "Uint8Array") throw new TypeError("review request must have a concrete JSON body")
      return HttpClientRequest.bodyText(request, reviewRequestContent(request.body.body, profile), "application/json")
    }),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false)
  )
