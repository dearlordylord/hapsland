import * as Effect from "effect/Effect"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import core, { type SCommand, type SResponse, type SStep, type SCache } from "./freshness/handoff-sources-core.js"
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
    // Encode closed state before touching the caller's paths or source limit.
    const maximum = args[4] ?? MAX_SOURCE_BYTES
    const key = closed ? undefined : canonicalValue([args[0], args[3], args[1].relativePath])
    const cached = key === undefined ? undefined : captures.get(key)
    const facts: SCache = closed
      ? { $: "SClosed" }
      : cached === undefined
        ? { $: "SMissing" }
        : cached.result.status === "captured"
          ? { $: "SCaptured", oversize: cached.result.capture.byteLength > maximum }
          : {
              $: "SFailed",
              size_limit:
                cached.result.status === "unavailable" && cached.result.diagnostic.code === "capture-size-limit",
              larger_limit: !(maximum <= cached.maximum)
            }
    switch (core.source_capture(facts).$) {
      case "SCaptureUnavailable":
        return unavailable()
      case "SCaptureCached":
        if (cached === undefined) throw new Error("missing source cache capability")
        return cached.result
      case "SCaptureLimit":
        if (cached?.result.status !== "captured") throw new Error("missing captured source capability")
        return {
          status: "unavailable" as const,
          diagnostic: {
            stage: "capture" as const,
            code: "capture-size-limit" as const,
            args: { observedBytes: cached.result.capture.byteLength, limitBytes: maximum }
          }
        }
      case "SCaptureRead": {
        const result = yield* (options.captureSource ?? captureStable)(...args)
        if (key === undefined) throw new Error("missing source cache key")
        captures.set(key, { result, maximum })
        return result
      }
    }
  })
  const memberAt = (handle: number) => {
    const member = members[handle]
    if (member === undefined) throw new Error("invalid source member capability")
    return member
  }
  const native = Effect.fn("DirectEvent.handoffSourceCommand")(function* (
    command: SCommand
  ): Effect.fn.Return<SResponse> {
    switch (command.$) {
      case "SVerify": {
        const result = yield* options.verifyMember(memberAt(command.member), capture)
        return {
          $: "SVerified",
          result: result === undefined ? { $: "SUnavailable" } : { $: "SCurrent", current: result }
        }
      }
      case "SRecord":
        current.set(memberAt(command.member).id, command.current)
        return { $: "SAck" }
      case "SCheckDrop":
        return { $: "STruth", value: dropCache(command.remaining, command.aborted) }
      case "SClear":
        clear()
        return { $: "SAck" }
    }
  })
  const drive = Effect.fn("DirectEvent.handoffSourceCursor")(function* (initial: SStep) {
    let step = initial
    while (step.$ === "SAwait") {
      const request = step.request
      step = core.source_resume(step, {
        $: "SReply",
        invocation: request.invocation,
        id: request.id,
        response: yield* native(request.command)
      })
    }
    if (step.$ !== "SDone") throw new Error("Bend source verification refused native reply")
  })
  return yield* drive(core.source_initial(1, list(members.map((_member, handle) => handle)))).pipe(
    Effect.as(current),
    Effect.ensuring(Effect.suspend(() => drive(core.source_cleanup(1))))
  )
})
