import { validInspectionAddress, DEFAULT_INSPECTION_HOST, DEFAULT_INSPECTION_PORT } from "./options.ts"
import { createServer } from "node:http"
import { randomBytes } from "node:crypto"
import { Effect, Stream, Schedule } from "effect"
import * as NodeHttpServerRequest from "@effect/platform-node/NodeHttpServerRequest"
import { watchInspectionConsumer } from "./consumer.ts"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as HttpServer from "effect/http/HttpServer"
import * as Request from "effect/http/HttpServerRequest"
import * as Response from "effect/http/HttpServerResponse"
import type { InspectionRecord, InspectionJournalSnapshot } from "./contract.ts"
import { inspectionPage, inspectionPagePolicy } from "./page.ts"
import { makeInspectionReplay } from "./replay.ts"
import { makeInspectionRegistry } from "./registry.ts"
import { resolveResidentPaths } from "../resident/paths.ts"
import { InspectionStorageBusy } from "./native-lock.ts"

export const MAX_INSPECTION_HTTP_BYTES = 1024 * 1024
export const MAX_INSPECTION_VIEWERS = 8
export interface InspectionHistoryReader {
  readonly snapshot: () => Effect.Effect<InspectionJournalSnapshot, unknown>
}

export interface InspectionHttpServerOptions {
  readonly host?: string
  readonly port?: number
  readonly page?: Effect.Effect<{ readonly html: string; readonly policy: string }, unknown>
}

/** Foreground, scoped HTTP access. A random per-launch capability keeps local TCP access private. */
export const makeInspectionHttpServer = Effect.fn("InspectionHttpServer.make")(function* (
  history: InspectionHistoryReader,
  options: InspectionHttpServerOptions = {}
) {
  const host = options.host ?? DEFAULT_INSPECTION_HOST
  const port = options.port ?? DEFAULT_INSPECTION_PORT
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
  const registry = makeInspectionRegistry()
  const standard = yield* resolveResidentPaths().pipe(Effect.catch(() => Effect.succeed(undefined)))
  const replay = makeInspectionReplay()
  let pendingHistory: Promise<InspectionJournalSnapshot> | undefined
  const readHistory = () =>
    Effect.tryPromise({
      try: () => {
        pendingHistory ??= Effect.runPromise(
          Effect.suspend(() => history.snapshot()).pipe(
            Effect.retry({
              times: 10,
              while: (error) => error instanceof InspectionStorageBusy,
              schedule: Schedule.spaced("100 millis")
            })
          )
        ).finally(() => {
          pendingHistory = undefined
        })
        return pendingHistory
      },
      catch: (error) => error
    })
  const snapshot = (cursor?: string) =>
    Effect.gen(function* () {
      const journal = yield* readHistory()
      const raw = journal.records
      const unique = new Map(raw.map((record) => [`${record.source.id}:${record.sequence}`, record]))
      const records = [...unique.values()]
      const discovery = yield* registry.discover(records, standard)
      const retained: InspectionRecord[] = []
      const positions = replay.describe(records, cursor, false, journal.losses, journal.expired)
      let bytes = Buffer.byteLength(JSON.stringify({ ...discovery, ...positions })) + 512
      for (let index = records.length - 1; index >= 0; index--) {
        const record = records[index]!
        const size = Buffer.byteLength(JSON.stringify(record)) + 128
        if (bytes + size > MAX_INSPECTION_HTTP_BYTES) break
        retained.unshift(record)
        bytes += size
      }
      const identities = new Map<string, number[]>()
      for (const record of retained) {
        let sequences = identities.get(record.source.id)
        if (sequences === undefined) {
          sequences = []
          identities.set(record.source.id, sequences)
        }
        sequences.push(record.sequence)
      }
      const truncated = retained.length < records.length
      return {
        version: 1,
        ...discovery,
        ...replay.describe(records, cursor, truncated, journal.losses, journal.expired),
        records: retained,
        retained: [...identities].map(([sourceId, sequences]) => ({ sourceId, sequences })),
        truncated
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
        return yield* (options.page ?? Effect.succeed({ html: inspectionPage, policy: inspectionPagePolicy })).pipe(
          Effect.map((page) =>
            Response.text(page.html, {
              contentType: "text/html",
              headers: { ...headers, "content-security-policy": page.policy }
            })
          ),
          Effect.catchCause(() =>
            Effect.succeed(Response.text("Inspection page unavailable", { status: 503, headers }))
          )
        )
      const route = new URL(request.url, origin)
      const replayRoute = route.pathname === `${base}snapshot` || route.pathname === `${base}events`
      if (replayRoute && [...route.searchParams.keys()].some((key) => key !== "cursor"))
        return Response.empty({ status: 404, headers })
      const requestedCursor = request.headers["last-event-id"] ?? route.searchParams.get("cursor") ?? undefined
      if (route.pathname === `${base}snapshot`)
        return Response.jsonUnsafe(yield* snapshot(requestedCursor), { headers })
      if (request.url.startsWith(`${base}payload/`)) {
        const match = /^([a-f0-9]{64})\/([1-9][0-9]{0,15})$/.exec(request.url.slice(`${base}payload/`.length))
        if (match === null || !Number.isSafeInteger(Number(match[2]))) return Response.empty({ status: 404, headers })
        const sourceId = match[1]!
        const sequence = Number(match[2])
        const identity = { version: 1 as const, sourceId, sequence }
        const value = yield* readHistory().pipe(
          Effect.map((journal) => {
            const record = journal.records.find((item) => item.source.id === sourceId && item.sequence === sequence)
            if (record === undefined)
              return {
                ...identity,
                status: "missing" as const,
                reason:
                  journal.losses.find((loss) => loss.sourceId === sourceId && loss.sequence === sequence)?.reason ??
                  (journal.expired?.some((entry) => entry.sourceId === sourceId && entry.sequence === sequence)
                    ? ("expired" as const)
                    : ("not-retained" as const))
              }
            const fact = record.fact
            if (fact.kind === "transport-invoked" || fact.kind === "model-input")
              return { ...identity, representation: fact.representation, ...fact.payload }
            if (fact.kind === "agent-message") return { ...identity, ...fact.message }
            return { ...identity, status: "missing" as const, reason: "no-exact-payload" as const }
          }),
          Effect.catchCause(() =>
            Effect.succeed({ ...identity, status: "missing" as const, reason: "history-unavailable" as const })
          )
        )
        return Response.jsonUnsafe(value, { headers })
      }
      if (route.pathname === `${base}events`) {
        watchInspectionConsumer(NodeHttpServerRequest.toServerResponse(request))
        let cursor = requestedCursor
        const next = Effect.suspend(() =>
          snapshot(cursor).pipe(
            Effect.tap((value) =>
              Effect.sync(() => {
                if ("watermark" in value) cursor = value.watermark.cursor
              })
            )
          )
        )
        const stream = Stream.fromEffectSchedule(next, Schedule.spaced("1 second")).pipe(
          Stream.map((value) => {
            const incremental = "replay" in value && value.replay.state === "resumed"
            const after = new Map(
              "replay" in value ? value.replay.sources.map((source) => [source.sourceId, source.after]) : []
            )
            const packet =
              incremental && "records" in value
                ? {
                    ...value,
                    records: value.records.filter((record) => record.sequence > (after.get(record.source.id) ?? 0))
                  }
                : value
            return new TextEncoder().encode(
              `${"watermark" in value ? `id: ${value.watermark.cursor}\n` : ""}event: ${incremental ? "increment" : "snapshot"}\ndata: ${JSON.stringify(packet)}\n\n`
            )
          })
        )
        return Response.stream(stream, {
          contentType: "text/event-stream",
          headers: { ...headers, "x-inspection-replay": "Send Last-Event-ID or cursor to resume retained history" }
        })
      }
      return Response.empty({ status: 404, headers })
    })
  )
  return { url: `${origin}${base}`, origin }
})
