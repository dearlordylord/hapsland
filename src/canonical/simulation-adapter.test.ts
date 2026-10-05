import { describe, expect, it } from "vitest"
import {
  initialSharedCanonical,
  projectSharedCanonical,
  stepSharedCanonical,
  enqueueShared,
  takeShared,
  queuedShared,
  cancelShared,
  beginSharedCache,
  stepSharedCache,
  issueSharedCallback,
  sharedCallbackOriginals,
  interveneSharedOutput
} from "./simulation-adapter.ts"
import SharedEngine from "../../packages/monkey-business-bend/engine.mjs"
import { encodeCanonicalEvent } from "./canonical-boundary.ts"
import { encodeEngineValue, encodeSharedValue, decodeSharedValue } from "./simulation-codec.ts"

const limits = { globalItems: 32, globalBytes: 4096, partitionItems: 16, partitionBytes: 2048 }
describe("trusted simulation composition boundary", () => {
  it("refuses copied engine states before projection or mutation", () => {
    const state = initialSharedCanonical(limits)
    const copy = structuredClone(state)
    expect(() => projectSharedCanonical(copy)).toThrow("foreign shared engine state")
    expect(() => enqueueShared(copy, 1, 1)).toThrow("foreign shared engine state")
    expect(() => stepSharedCanonical(copy, { kind: "openRound", partition: 1, lifetime: 1 })).toThrow(
      "foreign shared engine state"
    )
  })
  it("keeps immutable canonical ownership through deterministic scheduling", () => {
    const original = initialSharedCanonical(limits)
    const state = stepSharedCanonical(original, { kind: "openRound", partition: 1, lifetime: 1 }).state
    const projection = projectSharedCanonical(state)
    const queued = enqueueShared(enqueueShared(state, 10, 2), 10, 1)
    expect(projectSharedCanonical(queued)).toBe(projection)
    expect(queuedShared(queued)).toEqual([
      { at: 10, order: 1 },
      { at: 10, order: 2 }
    ])
    const taken = takeShared(queued)
    expect(taken.entry).toEqual({ at: 10, order: 1 })
    expect(projectSharedCanonical(taken.state)).toBe(projection)
    expect(queuedShared(cancelShared(taken.state, 2))).toEqual([])
    expect(queuedShared(state)).toEqual([])
    expect(Object.isFrozen(taken.state)).toBe(true)
    expect(Object.isFrozen(projection)).toBe(true)
  })
  it("rejects forged cache metadata without changing original ownership", () => {
    const state = initialSharedCanonical(limits)
    const projection = projectSharedCanonical(state)
    const event = { kind: "openRound", partition: 1, lifetime: 1 } as const
    const forged = Object.freeze({ event, partition: 1 })

    expect(() => stepSharedCache(state, forged)).toThrow("foreign or consumed cache metadata fact")
    expect(() => stepSharedCache(state, structuredClone(forged))).toThrow("foreign or consumed cache metadata fact")
    expect(() => beginSharedCache(structuredClone(state), event)).toThrow("foreign shared engine state")
    expect(() => stepSharedCache(structuredClone(state), forged)).toThrow("foreign shared engine state")
    expect(projectSharedCanonical(state)).toBe(projection)
    expect(queuedShared(state)).toEqual([])
  })
  it("rejects a same-kind caller event as original cache result provenance", () => {
    const original = initialSharedCanonical(limits)
    const event = { kind: "openRound", partition: 1, lifetime: 1 } as const
    const state = stepSharedCanonical(original, event).state
    const retained = enqueueShared(state, 10, 1)
    const projection = projectSharedCanonical(retained)

    expect(() => beginSharedCache(state, { ...event, partition: 2 })).toThrow(/cache result provenance/)
    expect(() => beginSharedCache(retained, structuredClone(event))).toThrow(/cache result provenance/)
    expect(projectSharedCanonical(retained)).toBe(projection)
    expect(queuedShared(retained)).toEqual([{ at: 10, order: 1 }])
  })
  it("refuses a mismatched output capture without minting the preexisting receipt", () => {
    const original = initialSharedCanonical(limits)
    const existing = issueSharedCallback(
      original,
      { kind: "jevRequestStarted", partition: 2, lifetime: 3, round: 4, operation: 5, request: 6 },
      7,
      2,
      {
        event: { kind: "jevRequestStarted", partition: 2, lifetime: 3, round: 4, operation: 5, request: 6 },
        delay: 0,
        job: false
      }
    )
    expect(existing.receipt).toBeDefined()
    const before = sharedCallbackOriginals(existing.state)
    const refused = issueSharedCallback(
      existing.state,
      { kind: "preparationCompleted", partition: 1, lifetime: 2, round: 3, operation: 4, unitBytes: [7] },
      8,
      3,
      {
        event: { kind: "preparationCompleted", partition: 1, lifetime: 2, round: 3, operation: 4, unitBytes: [7] },
        delay: 0,
        job: false
      },
      {
        attempt: { kind: "individual", advice: 7, token: 9 },
        started: 0,
        profile: { outcome: "certain", delayMs: 3, leaseMs: 10 }
      }
    )
    expect(refused.state).toBe(existing.state)
    expect(refused.receipt).toBeUndefined()
    expect(sharedCallbackOriginals(refused.state)).toEqual(before)
    expect(projectSharedCanonical(refused.state)).toBe(projectSharedCanonical(existing.state))
  })
  it("retains the original delayed callback action without changing its due time", () => {
    const state = initialSharedCanonical(limits)
    const issued = issueSharedCallback(
      state,
      { kind: "preparationCompleted", partition: 1, lifetime: 2, round: 3, operation: 4, unitBytes: [7] },
      8,
      3,
      {
        event: { kind: "preparationCompleted", partition: 1, lifetime: 2, round: 3, operation: 4, unitBytes: [7] },
        delay: 2,
        job: true
      }
    )
    expect(decodeSharedValue(issued.receipt)).toMatchObject({
      at: 3,
      action: {
        delay: 2,
        job: true,
        event: { $: "Canonical.PreparationCompleted", partition: 1, lifetime: 2, round: 3, operation: 4 }
      }
    })
  })
  it("validates exact output domains before touching shared state or receipt provenance", () => {
    const state = initialSharedCanonical(limits)
    const event = {
      kind: "preparationCompleted" as const,
      partition: 1,
      lifetime: 2,
      round: 3,
      operation: 4,
      unitBytes: [7]
    }
    const capture = {
      attempt: { kind: "individual", advice: 7, token: 9 },
      started: 0,
      profile: { outcome: "certain", delayMs: 3, leaseMs: 10 }
    }
    const target = {
      owner: { partition: 1, lifetime: 2, round: 3, operation: 4 },
      effect: { kind: "outputTerminal", advice: 7, token: 9 },
      originalOrder: 8
    }
    for (const value of [
      { ...capture, extra: true },
      { ...capture, profile: { ...capture.profile, extra: true } },
      { ...capture, profile: { ...capture.profile, outcome: { $: "OutputScenario.Certain", extra: true } } },
      { ...capture, attempt: { ...capture.attempt, advice: 0 } },
      { ...capture, started: 2 ** 48 }
    ]) {
      expect(() =>
        issueSharedCallback(
          state,
          event,
          8,
          3,
          {
            event: { kind: "preparationCompleted", partition: 1, lifetime: 2, round: 3, operation: 4, unitBytes: [7] },
            delay: 0,
            job: false
          },
          value
        )
      ).toThrow()
    }
    for (const [scope, outcome] of [
      [{ ...target, extra: true }, "certain"],
      [{ ...target, effect: { ...target.effect, extra: true } }, "certain"],
      [target, { $: "OutputScenario.Certain", extra: true }],
      [target, "unrecognized"]
    ]) {
      expect(() => interveneSharedOutput(state, scope, outcome)).toThrow()
    }
    expect(sharedCallbackOriginals(state)).toEqual([])
    expect(queuedShared(state)).toEqual([])
  })
  it("rejects numeric narrowing and foreign namespaces while preserving U32 words", () => {
    expect(() => decodeSharedValue(281474976710656n)).toThrow()
    expect(() => encodeSharedValue(-1)).toThrow()
    expect(() => encodeSharedValue(1.5)).toThrow()
    expect(() => encodeSharedValue({ $: "Foreign.State" })).toThrow()
    const words = { $: "RulePolicy.Words", high: 0x3fe00000, low: 0 }
    expect(decodeSharedValue(encodeSharedValue(words))).toEqual(words)
    expect(encodeSharedValue(words)).toEqual({ ...words, $: "../agent-flow-bend/RulePolicy.Words" })
    expect(() => encodeSharedValue({ ...words, low: 0x100000000 })).toThrow()
  })
})

it("preserves emitted Engine transitions with direct Number and plain-tag inputs", () => {
  const boundaryLimits = {
    $: "Ledger.Limits",
    global_items: 32,
    global_bytes: 4096,
    partition_items: 16,
    partition_bytes: 2048
  }
  const legacy = SharedEngine.initial(encodeSharedValue(boundaryLimits))
  const direct = SharedEngine.initial(encodeEngineValue(boundaryLimits))
  expect(direct).toEqual(legacy)
  const event = encodeCanonicalEvent({ kind: "openRound", partition: 1, lifetime: 1 })
  expect(SharedEngine.step(direct, encodeEngineValue(event))).toEqual(
    SharedEngine.step(legacy, encodeSharedValue(event))
  )
  for (const invalid of [-1, 0.5, 2 ** 48, Number.NaN])
    expect(() => encodeEngineValue({ $: "Some", value: invalid })).toThrow()
})
