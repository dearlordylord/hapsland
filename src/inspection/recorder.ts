import { Effect, Queue } from "effect"
import {
  decodeInspectionRecord,
  decodeInspectionRecordText,
  inspectionSourceId,
  MAX_INSPECTION_QUEUE_BYTES,
  MAX_INSPECTION_QUEUE_ITEMS,
  MAX_INSPECTION_RECORD_BYTES,
  MAX_INSPECTION_ROOTS,
  type InspectionCorrelation,
  type InspectionFact,
  type InspectionRecord,
  type InspectionScope
} from "./contract.ts"

export interface InspectionPublication {
  readonly allowed: () => boolean
  /** Commit this immutable, readable record synchronously against consent; cleanup may follow. */
  readonly commit: () => boolean
}
export interface InspectionPersistence {
  /** Stage asynchronously, then commit only once the exact record is readable. */
  readonly write: (
    record: InspectionRecord,
    encoded: string,
    publication: InspectionPublication
  ) => Effect.Effect<void, unknown>
}
export type InspectionObservation = Exclude<InspectionFact, { readonly kind: "recording-state" }>
export type InspectionOffer = "queued" | "disabled" | "overflow" | "oversized" | "invalid"
type Recording = { state: "enabled" | "disabled" | "unavailable"; epoch: number }
type Pending = {
  readonly encoded: string
  readonly root: string
  readonly epoch: number
  readonly bytes: number
  readonly sourceBearing: boolean
}

/** Independent scoped worker. Producers never run, await or retry persistence. */
export const makeInspectionRecorder = Effect.fn("InspectionRecorder.make")(function* (
  source: { readonly endpoint: string; readonly lifetime: string },
  persistence: InspectionPersistence,
  limits: { readonly items?: number; readonly bytes?: number; readonly now?: () => number } = {}
) {
  const maxItems = limits.items ?? MAX_INSPECTION_QUEUE_ITEMS
  const maxBytes = limits.bytes ?? MAX_INSPECTION_QUEUE_BYTES
  if (
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > MAX_INSPECTION_QUEUE_ITEMS ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_INSPECTION_QUEUE_BYTES
  )
    throw new Error("invalid inspection queue bounds")
  const clock = limits.now ?? Date.now
  const identity = { ...source, id: inspectionSourceId(source.endpoint, source.lifetime) }
  const queue = yield* Queue.dropping<number>(maxItems)
  const pending = new Map<number, Pending>()
  const roots = new Map<string, Recording>()
  let allocatedBytes = 0
  let allocatedItems = 0
  let sequence = 0
  let closed = false

  const free = (entry: Pending) => {
    allocatedBytes -= entry.bytes
    allocatedItems -= 1
  }
  const enqueue = (
    scope: InspectionScope,
    correlation: InspectionCorrelation,
    fact: InspectionFact
  ): InspectionOffer => {
    const recording = roots.get(scope.root)
    const sourceBearing = fact.kind !== "recording-state"
    if (closed || recording === undefined || (sourceBearing && recording.state !== "enabled")) return "disabled"
    // Consume identity on a lost observation as well; later retained increments may expose the gap.
    sequence += 1
    let encoded: string
    try {
      encoded = JSON.stringify(
        decodeInspectionRecord({
          version: 1,
          source: identity,
          sequence,
          capturedAt: clock(),
          consentEpoch: recording.epoch,
          scope,
          correlation,
          fact
        })
      )
    } catch {
      return "invalid"
    }
    const bytes = Buffer.byteLength(encoded)
    if (bytes > MAX_INSPECTION_RECORD_BYTES) return "oversized"
    if (allocatedItems >= maxItems || allocatedBytes + bytes > maxBytes) return "overflow"
    const entry = { encoded, bytes, root: scope.root, epoch: recording.epoch, sourceBearing }
    pending.set(sequence, entry)
    allocatedBytes += bytes
    allocatedItems += 1
    if (!Queue.offerUnsafe(queue, sequence)) {
      pending.delete(sequence)
      free(entry)
      return "overflow"
    }
    return "queued"
  }
  const observeRecording = (root: string, enabled: boolean | undefined): void => {
    const state = enabled === undefined ? "unavailable" : enabled ? "enabled" : "disabled"
    let recording = roots.get(root)
    if (closed || (state !== "enabled" && recording === undefined)) return
    if (recording === undefined) {
      if (roots.size >= MAX_INSPECTION_ROOTS) return
      recording = { state: "disabled", epoch: 0 }
      roots.set(root, recording)
    }
    if (closed || recording.state === state) return
    recording.state = state
    if (enabled) recording.epoch += 1
    else {
      for (const [key, entry] of pending) {
        if (entry.root !== root || !entry.sourceBearing) continue
        pending.delete(key)
        free(entry)
      }
    }
    enqueue(
      { root, runtime: null, runtimeVersion: null, sessionId: null, subagentId: null },
      {},
      { kind: "recording-state", state }
    )
  }
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      closed = true
      for (const recording of roots.values()) recording.state = "disabled"
      pending.clear()
      yield* Queue.shutdown(queue)
    })
  )
  yield* Effect.forever(
    Effect.gen(function* () {
      const key = yield* Queue.take(queue)
      const entry = pending.get(key)
      if (entry === undefined) return
      pending.delete(key)
      let committed = false
      const allowed = () =>
        committed ||
        (!closed &&
          (!entry.sourceBearing ||
            (roots.get(entry.root)?.state === "enabled" && roots.get(entry.root)?.epoch === entry.epoch)))
      const publication = {
        allowed,
        commit: () => {
          if (!allowed()) return false
          // No await between checking consent and committing this one record.
          committed = true
          return true
        }
      }
      const write = Effect.suspend(() =>
        allowed()
          ? persistence.write(decodeInspectionRecordText(entry.encoded), entry.encoded, publication)
          : Effect.void
      )
      yield* write.pipe(
        Effect.catchCause(() => Effect.void),
        Effect.ensuring(Effect.sync(() => free(entry)))
      )
    })
  ).pipe(Effect.forkScoped)
  const offer = (
    scope: InspectionScope,
    correlation: InspectionCorrelation,
    fact: InspectionObservation
  ): InspectionOffer => enqueue(scope, correlation, fact)
  return {
    offer,
    observeRecording,
    isEnabled: (root: string) => !closed && roots.get(root)?.state === "enabled",
    consentEpoch: (root: string) =>
      !closed && roots.get(root)?.state === "enabled" ? roots.get(root)?.epoch : undefined
  }
})

export type InspectionRecorder = Effect.Success<ReturnType<typeof makeInspectionRecorder>>
