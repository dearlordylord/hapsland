import * as Effect from "effect/Effect"
import { initialCanonical, stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { captureStable, MAX_SOURCE_BYTES, type CaptureResult } from "@hapsland/native-observation/direct-event/capture"
import type { PhysicalRootIdentity } from "@hapsland/native-observation/direct-event/observation"
import { canonicalValue, type ReviewInput } from "@hapsland/review-definition/direct-event/model"

export type HandoffSourceMember = {
  readonly id: string
  readonly root: string
  readonly rootIdentity?: PhysicalRootIdentity
  readonly fingerprints: ReviewInput["sourceFingerprints"]
}

const empty = initialCanonical({ globalItems: 1, globalBytes: 1, partitionItems: 1, partitionBytes: 1 })
const dropCache = (remaining: number, aborted: boolean) => {
  const result = stepCanonical(empty, { kind: "sourceCacheCheck", remaining, aborted })
  const decision = result.outputs[0]?.kind
  if (
    result.rejection !== undefined ||
    result.outputs.length !== 1 ||
    (decision !== "sourceCacheDrop" && decision !== "sourceCacheRetain")
  ) {
    throw new Error("canonical source cache decision refused")
  }
  return decision === "sourceCacheDrop"
}

/** The selected delivery is the source verification boundary. */
export const checkHandoffSources = Effect.fn("DirectEvent.checkHandoffSources")(function* (
  members: readonly HandoffSourceMember[],
  options: {
    readonly captureSource?: typeof captureStable
    readonly verifyMember: (
      member: HandoffSourceMember,
      capture: typeof captureStable
    ) => Effect.Effect<boolean | undefined>
  }
) {
  const current = new Map<string, boolean>()
  // One selected delivery owns these snapshots. No TTL or background owner.
  const captures = new Map<string, { readonly result: CaptureResult; readonly maximum: number }>()
  let closed = false
  const unavailable = (): CaptureResult => ({
    status: "unavailable",
    diagnostic: { stage: "capture", code: "capture-unavailable", args: { reason: "unknown" } }
  })
  const clear = () => {
    closed = true
    for (const { result } of captures.values()) if (result.status === "captured") result.capture.bytes.fill(0)
    captures.clear()
  }
  const capture = Effect.fn("DirectEvent.handoffCapture")(function* (...args: Parameters<typeof captureStable>) {
    if (closed) return unavailable()
    const maximum = args[4] ?? MAX_SOURCE_BYTES
    const key = canonicalValue([args[0], args[3], args[1].relativePath])
    const cached = captures.get(key)
    if (cached?.result.status === "captured") {
      if (cached.result.capture.byteLength > maximum)
        return {
          status: "unavailable" as const,
          diagnostic: {
            stage: "capture" as const,
            code: "capture-size-limit" as const,
            args: { observedBytes: cached.result.capture.byteLength, limitBytes: maximum }
          }
        }
      return cached.result
    }
    if (
      cached !== undefined &&
      (cached.result.status !== "unavailable" ||
        cached.result.diagnostic.code !== "capture-size-limit" ||
        maximum <= cached.maximum)
    )
      return cached.result
    const result = yield* (options.captureSource ?? captureStable)(...args)
    captures.set(key, { result, maximum })
    return result
  })
  return yield* Effect.gen(function* () {
    let remaining = members.length
    for (const member of members) {
      const matches = yield* options.verifyMember(member, capture)
      if (matches !== undefined) current.set(member.id, matches)
      remaining--
      if (dropCache(remaining, false)) clear()
    }
    return current
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (dropCache(0, true)) clear()
      })
    )
  )
})
