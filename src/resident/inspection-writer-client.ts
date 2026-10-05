import { dirname } from "node:path"
import { Context, Effect, Layer, Queue, Schema } from "effect"
import { InspectionWriterReports } from "./inspection-writer-reports.ts"
import { InspectionWriterState } from "../inspection/contract.ts"
import { InspectionSubmissionObservation } from "../inspection/writer.ts"
import { residentRequestEffect } from "./client.ts"
import { residentPaths, type ResidentPaths } from "./paths.ts"
import {
  decodeCurrentResidentRequest,
  encodeCurrentResidentRequest,
  type ResidentRequest,
  type ResidentWriterEvidence
} from "./protocol.ts"

type WriterRequest = Extract<ResidentRequest, { operation: "inspection-writer" }>
type Pending = { readonly request: WriterRequest; readonly paths: ResidentPaths; readonly bytes: number }
const isWriterState = Schema.is(InspectionWriterState)

/** Offers detached bounded reports; its scoped worker owns all endpoint and socket I/O. */
export const makeInspectionWriterClient = Effect.fn("InspectionWriterClient.make")(function* (
  send: (request: WriterRequest, paths: ResidentPaths) => Effect.Effect<unknown, unknown>,
  limits: { readonly items?: number; readonly bytes?: number } = {}
) {
  const maxItems = limits.items ?? 16
  const maxBytes = limits.bytes ?? 131072
  if (
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > 16 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 131072
  )
    throw new Error("invalid inspection writer queue bounds")
  const queue = yield* Queue.dropping<number>(maxItems)
  const pending = new Map<number, Pending>()
  let sequence = 0,
    items = 0,
    bytes = 0,
    closed = false
  const free = (entry: Pending) => {
    items -= 1
    bytes -= entry.bytes
  }
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      closed = true
      pending.clear()
      yield* Queue.shutdown(queue)
    })
  )
  yield* Effect.forever(
    Effect.gen(function* () {
      const key = yield* Queue.take(queue)
      const entry = pending.get(key)
      if (!entry) return
      yield* Effect.suspend(() => send(entry.request, entry.paths)).pipe(
        Effect.timeoutOption(250),
        Effect.catchCause(() => Effect.void),
        Effect.ensuring(
          Effect.sync(() => {
            pending.delete(key)
            free(entry)
          })
        )
      )
    })
  ).pipe(Effect.forkScoped)
  const observation = InspectionSubmissionObservation.of({
    forAttempt: (attempt) => {
      if (closed || attempt.recording !== true) return undefined
      const paths = residentPaths(dirname(attempt.endpoint))
      if (paths.socket !== attempt.endpoint) return undefined
      const binding = { ...attempt, advicee: { ...attempt.advicee } }
      const seen = new Set<string>()
      return {
        observe: (event) => {
          if (closed || !isWriterState(event.state) || seen.has(event.state)) return
          seen.add(event.state)
          const oversized = event.encoded !== undefined && Buffer.byteLength(event.encoded) > 16384
          const request: WriterRequest = {
            requestRoute: "shared",
            operation: "inspection-writer",
            lifetime: binding.lifetime,
            token: binding.batchId,
            attemptId: binding.attemptId,
            root: binding.root,
            advicee: binding.advicee,
            findingCount: binding.findingCount,
            noticeOnly: binding.noticeOnly,
            state: event.state,
            ...(oversized || event.outputMissing !== undefined
              ? { outputMissing: oversized ? ("oversized" as const) : event.outputMissing! }
              : event.encoded === undefined
                ? {}
                : { encoded: event.encoded })
          }
          const encoded = encodeCurrentResidentRequest(request)
          const size = Buffer.byteLength(encoded)
          if (items >= maxItems || bytes + size > maxBytes) return
          const copy = decodeCurrentResidentRequest(encoded)
          if (copy?.operation !== "inspection-writer") return
          const entry = { request: copy, paths, bytes: size }
          sequence += 1
          pending.set(sequence, entry)
          items += 1
          bytes += size
          if (!Queue.offerUnsafe(queue, sequence)) {
            pending.delete(sequence)
            free(entry)
          }
        }
      }
    }
  })
  const reports = InspectionWriterReports.of({
    forBatch: (batch) => {
      const selected: Array<ResidentWriterEvidence> = []
      if (closed) return selected
      for (const { request, paths } of pending.values()) {
        if (
          paths.socket !== batch.endpoint ||
          request.lifetime !== batch.lifetime ||
          request.token !== batch.token ||
          request.root !== batch.root ||
          request.advicee.host !== batch.advicee.host ||
          request.advicee.hostVersion !== batch.advicee.hostVersion ||
          request.advicee.sessionId !== batch.advicee.sessionId ||
          request.advicee.subagentId !== batch.advicee.subagentId ||
          request.advicee.turnId !== batch.advicee.turnId ||
          request.advicee.toolUseId !== batch.advicee.toolUseId
        )
          continue
        const { requestRoute: _route, operation: _operation, token: _token, lifetime: _lifetime, ...evidence } = request
        selected.push(evidence)
        if (selected.length === 8) break
      }
      return selected
    }
  })
  return { ...observation, forBatch: reports.forBatch }
})

export const inspectionWriterClientLayer = Layer.effectContext(
  makeInspectionWriterClient((request, paths) => residentRequestEffect(paths, request, 250)).pipe(
    Effect.map((client) =>
      Context.make(InspectionSubmissionObservation, client).pipe(Context.add(InspectionWriterReports, client))
    )
  )
)
