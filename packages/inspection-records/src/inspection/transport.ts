import { Context, Effect } from "effect"
import * as HttpClient from "effect/http/HttpClient"

/** Optional per-evaluation observer. Its only input is the final body; headers and credentials are excluded. */
export class InspectionTransportObservation extends Context.Service<
  InspectionTransportObservation,
  { readonly observe: (body: Uint8Array | undefined) => void }
>()("@hapsland/InspectionTransportObservation") {}

export const inspectHttpTransport = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.transform(client, (response, request) =>
    Effect.gen(function* () {
      const observer = Context.getOrUndefined(yield* Effect.context(), InspectionTransportObservation)
      if (observer !== undefined) {
        try {
          // Inspection owns its copy; a callback must not be able to rewrite egress.
          observer.observe(request.body._tag === "Uint8Array" ? Uint8Array.from(request.body.body) : undefined)
        } catch {
          /* Optional capture never changes transport behavior. */
        }
      }
      return yield* response
    })
  )
