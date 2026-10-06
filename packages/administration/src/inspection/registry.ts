import { constants, type Stats } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import { Effect } from "effect"
import type { ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { residentRequestEffect } from "@hapsland/resident-transport/resident/client"
import {
  residentPaths,
  validateEndpointMetadata,
  type ResidentPaths
} from "@hapsland/resident-transport/resident/paths"
import {
  inspectionSourceId,
  MAX_INSPECTION_RECORDING_BYTES,
  type InspectionRecord
} from "@hapsland/inspection-records/inspection/contract"

export const MAX_INSPECTION_SOURCES = 128
export const MAX_INSPECTION_DISCOVERY_BYTES = 65536
export type InspectionSourceHealth = "connected" | "disconnected" | "replaced" | "unsafe" | "unavailable" | "historical"
export type InspectionSource = {
  readonly source: InspectionRecord["source"]
  readonly registered: boolean
  readonly health: InspectionSourceHealth
  readonly lastObservation: number | null
  readonly lastSequence: number | null
}
const metadata = (value: Stats) => ({
  uid: value.uid,
  mode: value.mode,
  isDirectory: value.isDirectory(),
  isSocket: value.isSocket(),
  isFile: value.isFile(),
  isSymbolicLink: value.isSymbolicLink()
})
const unsafe = () => new Error("unsafe inspection endpoint")
const same = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino
const endpointIdentity = async (endpoint: string) => {
  const paths = residentPaths(dirname(endpoint))
  if (!isAbsolute(endpoint) || paths.socket !== endpoint) throw unsafe()
  const directory = await lstat(paths.directory)
  if (
    !validateEndpointMetadata(metadata(directory), "directory") ||
    (await realpath(paths.directory)) !== paths.directory
  )
    throw unsafe()
  const handle = await open(paths.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    if (!same(directory, await handle.stat())) throw unsafe()
    const owner = await open(paths.owner, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const status = await owner.stat()
      if (!validateEndpointMetadata(metadata(status), "regular") || status.nlink !== 1 || status.size > 1024)
        throw unsafe()
      const buffer = Buffer.alloc(1025)
      const { bytesRead } = await owner.read(buffer, 0, buffer.length, 0)
      if (bytesRead > 1024) throw unsafe()
      const text = buffer.subarray(0, bytesRead).toString("utf8")
      const value: unknown = JSON.parse(text)
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw unsafe()
      const data = value as Record<string, unknown>
      if (
        Object.keys(data).some((key) => key !== "pid" && key !== "lifetime") ||
        typeof data.pid !== "number" ||
        !Number.isSafeInteger(data.pid) ||
        data.pid < 1 ||
        typeof data.lifetime !== "string" ||
        data.lifetime.length < 1 ||
        data.lifetime.length > 256
      )
        throw unsafe()
      const inspectionPaths = { ...paths, socket: join(paths.directory, "inspection.sock") }
      const socket = await lstat(paths.socket)
      const inspectionSocket = await lstat(inspectionPaths.socket)
      if (!validateEndpointMetadata(metadata(inspectionSocket), "socket")) throw unsafe()
      if (!validateEndpointMetadata(metadata(socket), "socket") || !same(directory, await lstat(paths.directory)))
        throw unsafe()
      return {
        pid: data.pid,
        lifetime: data.lifetime,
        paths: inspectionPaths,
        directory,
        owner: status,
        socket,
        inspectionSocket
      }
    } finally {
      await owner.close()
    }
  } finally {
    await handle.close()
  }
}
type Recording = Extract<ResidentResponse, { status: "inspection-status" }>
type Probe = { readonly health: InspectionSourceHealth; readonly lifetime?: string; readonly recording?: Recording }
const probe = (endpoint: string): Effect.Effect<Probe> =>
  Effect.gen(function* () {
    const before = yield* Effect.tryPromise({ try: () => endpointIdentity(endpoint), catch: (error) => error })
    const response = yield* residentRequestEffect(before.paths, { requestRoute: "shared", operation: "hello" }, 150)
    const state =
      response.status === "ready" && response.pid === before.pid && response.lifetime === before.lifetime
        ? yield* residentRequestEffect(
            before.paths,
            { requestRoute: "shared", operation: "inspection-status", lifetime: before.lifetime },
            75
          ).pipe(
            Effect.timeoutOption(75),
            Effect.map((value) => (value._tag === "Some" ? value.value : undefined)),
            Effect.catch(() => Effect.succeed(undefined))
          )
        : undefined
    const after = yield* Effect.tryPromise({ try: () => endpointIdentity(endpoint), catch: (error) => error })
    if (
      response.status !== "ready" ||
      response.pid !== before.pid ||
      response.lifetime !== before.lifetime ||
      after.pid !== before.pid ||
      after.lifetime !== before.lifetime ||
      !same(before.directory, after.directory) ||
      !same(before.owner, after.owner) ||
      !same(before.socket, after.socket) ||
      !same(before.inspectionSocket, after.inspectionSocket)
    )
      return { health: "unavailable" as const }
    return {
      health: "connected" as const,
      lifetime: response.lifetime,
      ...(state?.status === "inspection-status" && state.sourceId === inspectionSourceId(endpoint, response.lifetime)
        ? { recording: state }
        : {})
    }
  }).pipe(
    Effect.timeoutOption(300),
    Effect.map((result) => (result._tag === "Some" ? result.value : { health: "unavailable" as const })),
    Effect.catch((error) =>
      Effect.succeed<Probe>({
        health:
          typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
            ? "disconnected"
            : (error instanceof Error && error.message === "unsafe inspection endpoint") ||
                (typeof error === "object" && error !== null && "code" in error && error.code === "ELOOP")
              ? "unsafe"
              : "unavailable"
      })
    )
  )

/** Registry advertisements share the private journal's locks, age, allocated quota and cleanup protections. */
export const makeInspectionRegistry = () => {
  // This is an inspector-only pool: no waiting queue and no review-control permits.
  let active = 0
  const inspect = (endpoint: string) =>
    Effect.suspend(() => {
      if (active >= 4) return Effect.succeed<Probe>({ health: "unavailable" })
      active += 1
      return probe(endpoint).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            active -= 1
          })
        )
      )
    })
  return {
    discover: (records: ReadonlyArray<InspectionRecord>, standard: ResidentPaths | undefined) =>
      Effect.gen(function* () {
        const standardEndpoint =
          standard !== undefined && Buffer.byteLength(standard.socket) <= 4096 ? standard.socket : undefined
        const entries = new Map<string, InspectionSource>()
        for (const record of records) {
          const previous = entries.get(record.source.id)
          entries.set(record.source.id, {
            source: record.source,
            registered: previous?.registered === true || record.fact.kind === "source-registration",
            health: "historical",
            lastObservation:
              previous?.lastSequence !== undefined &&
              previous.lastSequence !== null &&
              previous.lastSequence > record.sequence
                ? previous.lastObservation
                : record.capturedAt,
            lastSequence: Math.max(previous?.lastSequence ?? 0, record.sequence)
          })
        }
        const known = entries.size
        const candidates = [...entries.values()].sort(
          (a, b) =>
            Number(b.source.endpoint === standardEndpoint) - Number(a.source.endpoint === standardEndpoint) ||
            (b.lastObservation ?? 0) - (a.lastObservation ?? 0)
        )
        const selected: InspectionSource[] = []
        let metadataBytes = 8192
        for (const entry of candidates) {
          const bytes = Buffer.byteLength(JSON.stringify(entry)) + 32
          if (selected.length >= MAX_INSPECTION_SOURCES || metadataBytes + bytes > MAX_INSPECTION_DISCOVERY_BYTES)
            continue
          selected.push(entry)
          metadataBytes += bytes
        }
        const endpoints = new Set<string>(standardEndpoint === undefined ? [] : [standardEndpoint])
        for (const entry of selected)
          if (entry.registered || entry.source.endpoint === standardEndpoint) endpoints.add(entry.source.endpoint)
        const replies = new Map<string, Probe>()
        yield* Effect.forEach(
          [...endpoints],
          (endpoint) =>
            inspect(endpoint).pipe(
              Effect.tap((reply) =>
                Effect.sync(() => {
                  replies.set(endpoint, reply)
                })
              )
            ),
          { concurrency: 4 }
        ).pipe(Effect.timeoutOption(1500))
        const sources: InspectionSource[] = selected.map((entry) => {
          const reply = replies.get(entry.source.endpoint)
          return reply === undefined
            ? { ...entry, health: endpoints.has(entry.source.endpoint) ? "unavailable" : "historical" }
            : {
                ...entry,
                health:
                  reply.health === "connected" && reply.lifetime !== entry.source.lifetime ? "replaced" : reply.health
              }
        })
        const standardReply = standardEndpoint === undefined ? undefined : replies.get(standardEndpoint)
        let additionalKnown = 0
        if (
          standardEndpoint !== undefined &&
          standardReply?.health === "connected" &&
          standardReply.lifetime !== undefined
        ) {
          const id = inspectionSourceId(standardEndpoint, standardReply.lifetime)
          if (!entries.has(id)) additionalKnown = 1
          const current: InspectionSource = {
            source: { id, endpoint: standardEndpoint, lifetime: standardReply.lifetime },
            registered: false,
            health: "connected",
            lastObservation: null,
            lastSequence: null
          }
          if (additionalKnown) {
            if (sources.length >= MAX_INSPECTION_SOURCES) {
              const removed = sources.pop()!
              metadataBytes -= Buffer.byteLength(JSON.stringify(removed)) + 32
            }
            if (metadataBytes + Buffer.byteLength(JSON.stringify(current)) + 32 <= MAX_INSPECTION_DISCOVERY_BYTES)
              sources.push(current)
          }
        }
        const recording: Array<{
          sourceId: string
          status: string
          observedAt: number | null
          roots: Recording["roots"]
          omittedRoots: number
        }> = []
        let recordingBytes = 1024
        for (const entry of sources) {
          const reply = replies.get(entry.source.endpoint)
          const state = reply?.lifetime === entry.source.lifetime ? reply.recording : undefined
          const value = {
            sourceId: entry.source.id,
            status: state ? "observed" : entry.health === "connected" ? "unavailable" : entry.health,
            observedAt: state?.observedAt ?? null,
            roots: state?.roots ?? [],
            omittedRoots: state?.omittedRoots ?? 0
          }
          const bytes = Buffer.byteLength(JSON.stringify(value)) + 1
          if (recordingBytes + bytes > MAX_INSPECTION_RECORDING_BYTES) continue
          recording.push(value)
          recordingBytes += bytes
        }
        const actualKnown = known + additionalKnown
        return {
          sources,
          recording: { sources: recording, omittedSources: actualKnown - recording.length },
          discovery: {
            mode: "registered-local-sources" as const,
            known: actualKnown,
            connected: sources.filter((entry) => entry.health === "connected").length,
            omitted: actualKnown - sources.length,
            standard: {
              endpoint: standardEndpoint ?? null,
              health:
                standardReply?.health ??
                (standard !== undefined && standardEndpoint === undefined ? "unsafe" : "unavailable")
            },
            observationOrder: "timestamps-are-presentation-only" as const
          }
        }
      })
  }
}
