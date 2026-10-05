import { validInspectionAddress } from "./options.ts"
import { createServer } from "node:http"
import { randomBytes } from "node:crypto"
import { Effect, Stream, Schedule } from "effect"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as HttpServer from "effect/http/HttpServer"
import * as Request from "effect/http/HttpServerRequest"
import * as Response from "effect/http/HttpServerResponse"
import type { InspectionRecord } from "./contract.ts"
import { inspectionPage, inspectionPagePolicy } from "./page.ts"

export const MAX_INSPECTION_HTTP_BYTES = 1024 * 1024
export const MAX_INSPECTION_VIEWERS = 8
export interface InspectionHistoryReader {
  readonly snapshot: () => Effect.Effect<ReadonlyArray<InspectionRecord>, unknown>
}

/** Foreground, scoped HTTP access. A random per-launch capability keeps local TCP access private. */
export const makeInspectionHttpServer = Effect.fn("InspectionHttpServer.make")(function* (
  history: InspectionHistoryReader,
  options: { readonly host?: string; readonly port?: number } = {}
) {
  const host = options.host ?? "127.0.0.1"
  const port = options.port ?? 0
  if (!validInspectionAddress(host, port))
    throw new Error("inspection requires a loopback host and a port from 0 to 65535")
  const node = createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 })
  node.maxConnections = MAX_INSPECTION_VIEWERS
  const server = yield* NodeHttpServer.make(() => node, {
    host: host === "localhost" ? "127.0.0.1" : host,
    port,
    gracefulShutdownTimeout: "1 second"
  })
  const origin = HttpServer.formatAddress(server.address)
  const authority = new URL(origin).host
  const capability = randomBytes(32).toString("hex")
  const base = `/${capability}/`
  const headers = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  }
  const snapshot = Effect.gen(function* () {
    const records = yield* history.snapshot()
    const retained: InspectionRecord[] = []
    let bytes = 256
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index]!
      const size = Buffer.byteLength(JSON.stringify(record)) + 1
      if (bytes + size > MAX_INSPECTION_HTTP_BYTES) break
      retained.unshift(record)
      bytes += size
    }
    return {
      version: 1,
      discovery: "standard-endpoint-only",
      records: retained,
      truncated: retained.length < records.length
    }
  }).pipe(Effect.catchCause(() => Effect.succeed({ version: 1, status: "unavailable" })))
  yield* server.serve(
    Effect.gen(function* () {
      const request = yield* Request.HttpServerRequest
      if (request.method !== "GET") return Response.empty({ status: 405, headers })
      if (
        request.headers.host !== authority ||
        (request.headers.origin !== undefined && request.headers.origin !== origin) ||
        request.headers["sec-fetch-site"] === "cross-site"
      )
        return Response.empty({ status: 403, headers })
      if (request.url === base)
        return Response.text(inspectionPage, {
          contentType: "text/html",
          headers: { ...headers, "content-security-policy": inspectionPagePolicy }
        })
      if (request.url === `${base}snapshot`) return Response.jsonUnsafe(yield* snapshot, { headers })
      if (request.url === `${base}events`) {
        const stream = Stream.fromEffectSchedule(snapshot, Schedule.spaced("1 second")).pipe(
          Stream.map((value) => new TextEncoder().encode(`event: snapshot\ndata: ${JSON.stringify(value)}\n\n`))
        )
        return Response.stream(stream, { contentType: "text/event-stream", headers })
      }
      return Response.empty({ status: 404, headers })
    })
  )
  return { url: `${origin}${base}`, origin }
})
