import { readBendList } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { afterEach, expect, it, vi } from "vitest"
import SharedEngine from "../../monkey-business-bend/engine.mjs"
import * as boundary from "./simulation-adapter.ts"
import { createRun, restoreReplay } from "./index.ts"

afterEach(() => vi.restoreAllMocks())

it("integrates one authentic cache result and one hit through the public native Run and replay", () => {
  const run = createRun({
    seed: 7,
    inputs: [0, 10].map((at) => ({ at, kind: "edit", bytes: 10, unitBytes: [5], evaluationInputs: ["same"] })),
    outcome: "clear",
    jevDelay: 2,
    lifecycles: { reuse: { entryLimit: 2, byteLimit: 100 } }
  })
  run.advance({ untilTime: 20, maxEvents: 1000 })
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  expect(run.projection.reuse.cache).toHaveLength(1)
  expect(
    run.observations.filter((frame) => frame.outputs.some((command) => command.kind === "jevRequestIssued"))
  ).toHaveLength(1)
  expect(
    run.observations.filter((frame) => frame.outputs.some((command) => command.kind === "reuseCacheHit"))
  ).toHaveLength(1)
  vi.restoreAllMocks()
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
})

it("preserves cache provenance across retained shared Engine states and retries decoding atomically", () => {
  const limits = { globalItems: 32, globalBytes: 4096, partitionItems: 16, partitionBytes: 2048 }
  const run = createRun({
    limits,
    seed: 7,
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], evaluationInputs: ["same"] }],
    outcome: "clear",
    jevDelay: 2,
    lifecycles: { reuse: { entryLimit: 2, byteLimit: 100 } }
  })
  run.advance({ untilTime: 10, maxEvents: 1000 })
  const completion = run.observations.findIndex(({ event }) => event.kind === "jevRequestSettled")
  expect(completion).toBeGreaterThanOrEqual(0)
  let state = boundary.configureSharedCache(boundary.initialSharedCanonical(limits), 2, 100)
  let routes: unknown[] = []
  for (const [index, frame] of run.observations.slice(0, completion + 1).entries()) {
    if (frame.event.kind === "preparationGraph") continue
    const event = frame.event
    const stepped = boundary.stepSharedCanonical(state, event)
    state = stepped.state
    expect(stepped.result.rejection).toBeUndefined()
    if (stepped.result.rejection !== undefined) throw new Error("original cache fixture transition rejected")
    expect(stepped.result.outputs).toEqual(frame.outputs)
    for (const [outputIndex, output] of stepped.result.outputs.entries()) {
      if (output.kind === "observationAdmitted" && event.kind === "admitObservation") {
        const registration = run.observations
          .slice(index + 1, completion)
          .find(({ event }) => event.kind === "revisionRegister")?.event
        if (!registration || registration.kind !== "revisionRegister")
          throw new Error("missing actual source registration")
        state = boundary.admitSharedFreshness(
          state,
          {
            $: "FreshnessScenario.Scope",
            partition: event.partition,
            lifetime: event.lifetime,
            round: event.round,
            operation: output.id
          },
          { $: "FreshnessScenario.Source", subject: registration.subject, input: registration.input },
          outputIndex,
          true
        ).state
      }
      if (output.kind === "prepare" && "partition" in event && "lifetime" in event && "round" in event) {
        const capture = boundary.prepareSharedSharing(
          state,
          {
            $: "FreshnessScenario.Scope",
            partition: event.partition,
            lifetime: event.lifetime,
            round: event.round,
            operation: output.operation
          },
          [{ $: "SharingScenario.SharingKey", partition: event.partition, prepared: 1 }],
          [5]
        )
        expect(capture.valid).toBe(true)
        state = capture.state
        routes = readBendList(capture.routes, (route) => route, 1024)
        expect(routes).toHaveLength(1)
      }
    }
    if (event.kind === "reuseRoute") {
      expect(routes).toHaveLength(1)
      state = boundary.routedSharedSharing(state, routes[0]).state
    }
  }
  const event = run.observations[completion]!.event
  if (event.kind !== "jevRequestSettled") throw new Error("missing genuine Jev completion")
  expect(run.observations[completion]!.outputs).toContainEqual(
    expect.objectContaining({ category: "event", kind: "jevRequestOutcomeRecorded" })
  )
  const retained = boundary.enqueueShared(state, 100, 999)
  const original = boundary.projectSharedCanonical(state)
  expect(() => boundary.beginSharedCache(state, structuredClone(event))).toThrow(/cache result provenance/)
  expect(boundary.projectSharedCanonical(state)).toBe(original)
  const begun = boundary.beginSharedCache(state, event)
  expect(begun.facts).toHaveLength(1)
  expect(() => boundary.beginSharedCache(retained, event)).toThrow(/consumed actual cache result provenance/)
  expect(boundary.projectSharedCanonical(retained)).toBe(original)
  expect(boundary.queuedShared(retained)).toEqual([{ at: 100, order: 999 }])
  const capsule = begun.facts[0]!
  const queued = boundary.queuedShared(begun.state)
  const before = boundary.projectSharedCanonical(begun.state)
  const failure = vi.spyOn(SharedEngine, "after").mockReturnValueOnce({ $: "Foreign.After" })
  try {
    expect(() => boundary.stepSharedCache(begun.state, capsule)).toThrow("invalid shared constructor namespace")
    expect(boundary.projectSharedCanonical(begun.state)).toBe(before)
    expect(boundary.queuedShared(begun.state)).toEqual(queued)
  } finally {
    failure.mockRestore()
  }
  const published = boundary.stepSharedCache(begun.state, capsule)
  expect(published.cacheFacts).toHaveLength(1)
  expect(() => boundary.stepSharedCache(begun.state, capsule)).toThrow("foreign or consumed cache metadata fact")
})
