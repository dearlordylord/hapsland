import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import { inspectHttpTransport } from "../inspection/transport.ts"

/** Review requests carry provider framing, not ambient agent trace context. */
export const reviewHttpTransport = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.transformResponse(
    inspectHttpTransport(client),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false)
  )
