import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Run } from "./index.ts"

import type { CallbackTarget } from "./callback-controls.ts"
type Target = CallbackTarget & { readonly effect: Extract<CallbackTarget["effect"], { readonly kind: "jevSettled" }> }
function target(run: Run): Target | undefined {
  return run
    .observe()
    .callbackTargets.find((value): value is Target => value.owner.partition === 1 && value.effect.kind === "jevSettled")
}
function apply(run: Run, original: Target, action: "hold" | "release" | "duplicate") {
  run.applyControl({ kind: "callback", target: original, action })
}
function advance(run: Run, untilTime: number, maxEvents: number) {
  expect(run.advance({ untilTime, maxEvents }).reason).not.toBe("eventLimit")
}
function reproduce(run: Run) {
  const exported = JSON.parse(JSON.stringify(run.exportReplay()))
  const restored = restoreReplay(exported)
  expect(restored.observe()).toEqual(run.observe())
  expect(restored.exportReplay()).toEqual(exported)
  return restored
}

it.each([7, 91001, 4294967313])("seed %i preserves held canceled identity while healthy work continues", (seed) => {
  const run = createRun({
    seed,
    inputs: [],
    jevDelay: 20,
    preparationDelay: 2,
    outcome: "clear",
    retention: 10000,
    sessions: ["faulty", "healthy"].map((agent, index) => ({
      agent,
      seed: 11 + index,
      editIntervalMs: 1000000,
      variationMs: 0,
      editsPerTask: 1000,
      bytes: 10,
      unitBytes: [5]
    })),
    fileTrees: {
      ...DEFAULT_FILE_TREE_PROFILE,
      minFiles: 1,
      maxFiles: 1,
      maxImports: 0,
      minSourceBytes: 100,
      maxSourceBytes: 100,
      minTreeBytes: 20,
      maxTreeBytes: 20
    }
  })
  for (const agent of ["faulty", "healthy"]) run.schedule({ kind: "edit", at: 0, agent, bytes: 10, unitBytes: [5] })
  for (let fuel = 0; fuel < 64 && !target(run); fuel++) run.step()
  const original = target(run)
  expect(original, "original callback not issued within 64 events").toBeDefined()
  if (!original) throw new Error("campaign recovery premise unavailable")
  apply(run, original, "hold")
  run.schedule({
    kind: "canonical",
    at: 5,
    event: {
      kind: "stopPolled",
      partition: original.owner.partition,
      lifetime: original.owner.lifetime,
      round: original.owner.round,
      deadline: true
    }
  })
  run.schedule({ kind: "edit", at: 30, agent: "healthy", bytes: 10, unitBytes: [5] })
  advance(run, 55, 256)
  // Queue exhaustion cannot certify recovery: one real callback is held.
  expect(run.projection.dispatch.requests).toHaveLength(1)
  expect(run.projection.dispatch.requests[0]).toMatchObject({ ...original.owner, request: original.effect.request })
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  expect(
    run.observations
      .filter((frame) => frame.event.kind === "jevRequestSettled")
      .map((frame) => [frame.time, frame.partition])
  ).toEqual([
    [22, 2],
    [52, 2]
  ])
  const restored = reproduce(run)
  for (const candidate of [run, restored]) {
    apply(candidate, original, "release")
    advance(candidate, candidate.now, 64)
    const late = candidate.observations.filter((frame) => frame.event.kind === "jevRequestSettled").at(-1)!
    expect(late.event).toMatchObject({ ...original.owner, request: original.effect.request })
    expect(late.commands.map((command) => command.kind)).toEqual(["jevObservationIgnored"])
    expect(candidate.projection.dispatch.requests).toEqual([])
    expect(candidate.projection.global).toEqual({ items: 0, bytes: 0 })
    const released = candidate.projection
    apply(candidate, original, "duplicate")
    advance(candidate, candidate.now, 64)
    const duplicate = candidate.observations.filter((frame) => frame.event.kind === "jevRequestSettled").at(-1)!
    expect(duplicate.rejection).toBe("StaleOperation")
    expect(duplicate.commands).toEqual([])
    expect(candidate.projection).toEqual(released)
  }
  expect(restored.observe()).toEqual(run.observe())
  expect(run.projection.dispatch.running).toEqual([])
  expect(run.projection.collection.leases).toEqual([])
  reproduce(run)
})
