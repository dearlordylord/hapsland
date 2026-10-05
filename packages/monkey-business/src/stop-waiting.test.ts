import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type RunConfig } from "./index.ts"

// Finite scheduling premise: source preparation returns at2; Jev returns at
// 2+delay; Stop starts at3 with its existing caller-supplied8ms safe wait.
const config = (delay: number) =>
  ({
    seed: 7,
    retention: 1000,
    preparationDelay: 2,
    jevDelay: delay,
    finishDeadline: 8,
    outcome: "clear",
    fileTrees: {
      ...DEFAULT_FILE_TREE_PROFILE,
      minFiles: 1,
      maxFiles: 1,
      maxImports: 0,
      minSourceBytes: 100,
      maxSourceBytes: 100,
      minTreeBytes: 20,
      maxTreeBytes: 20
    },
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 3, kind: "finish" }
    ]
  }) satisfies RunConfig
const replay = (run: ReturnType<typeof createRun>) => {
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(restored.observe()).toEqual(run.observe())
  return restored
}

it.each([
  { delay: 8, decision: 10 },
  { delay: 9, decision: 11 },
  { delay: 10, decision: 11 }
])("waits for the original response or cutoff with Jev delay $delay", ({ delay, decision }) => {
  const run = createRun(config(delay))
  run.advance({ untilTime: 3, maxEvents: 100 })
  const started = run.observations.find((frame) => frame.event.kind === "jevRequestStarted")!
  expect(started.time).toBe(2)
  const issued = started.event
  if (issued.kind !== "jevRequestStarted") throw new Error("missing genuine started request")
  const originalRequest = {
    partition: 1,
    lifetime: 1,
    round: 1,
    operation: issued.operation,
    request: issued.request,
    started: true,
    interrupted: false
  }
  expect(started.after.dispatch.requests).toContainEqual(originalRequest)
  expect(issued).toMatchObject({ partition: 1, lifetime: 1, round: 1 })
  const waiting = run.observations.find((frame) => frame.event.kind === "stopPolled")!
  expect(waiting.time).toBe(3)
  expect(waiting.commands.some((command) => command.kind === "waitForWork")).toBe(true)
  expect(run.observations.some((frame) => frame.event.kind === "finishReserve")).toBe(false)
  const restored = replay(run)
  for (const candidate of [run, restored]) candidate.advance({ untilTime: decision, maxEvents: 100 })
  expect(restored.observe()).toEqual(run.observe())
  const ready = run.observations.find((frame) => frame.commands.some((command) => command.kind === "finishReady"))!
  expect(ready.time).toBe(decision)
  expect(ready.event).toMatchObject({
    kind: "stopPolled",
    partition: 1,
    lifetime: 1,
    round: 1,
    deadline: decision === 11
  })
  expect(run.observations.some((frame) => frame.event.kind === "finishAuthorize")).toBe(false)
  expect(run.observations.some((frame) => frame.event.kind === "stopGroupEnded" && frame.time === decision)).toBe(true)
  const lateTarget = run
    .observe()
    .callbackTargets.find((target) => target.effect.kind === "jevSettled" && target.effect.request === issued.request)
  if (delay === 10) {
    expect(ready.commands.some((command) => command.kind === "cancelWork")).toBe(true)
    expect(run.observations.some((frame) => frame.event.kind === "jevRequestSettled")).toBe(false)
    expect(ready.before.work.some((work) => work.operation === issued.operation)).toBe(true)
    expect(
      ready.after.work.some(
        (work) => work.partition === 1 && work.lifetime === 1 && work.round === 1 && work.operation === issued.operation
      )
    ).toBe(false)
    expect(ready.before.dispatch.requests).toContainEqual(originalRequest)
    expect(ready.after.dispatch.requests).toEqual(ready.before.dispatch.requests)
    expect(ready.after.global).toEqual({ items: 0, bytes: 0 })
    expect(lateTarget).toBeDefined()
  } else {
    const settled = run.observations.find((frame) => frame.event.kind === "jevRequestSettled")!
    expect(settled.time).toBe(2 + delay)
    // Equal-time settlement was enqueued at2 before the Stop cutoff poll at3.
    expect(settled.sequence).toBeLessThan(ready.sequence)
  }
  run.advance({ untilTime: 20, maxEvents: 100 })
  const callback = run.observations.find((frame) => frame.event.kind === "jevRequestSettled")!
  expect(callback.time).toBe(2 + delay)
  expect(callback.event).toMatchObject({
    partition: 1,
    lifetime: 1,
    round: 1,
    operation: "operation" in issued ? issued.operation : 0,
    request: "request" in issued ? issued.request : 0,
    currentWork: true
  })
  if (delay === 10) {
    expect(callback.before.dispatch.requests).toContainEqual(originalRequest)
    expect(callback.commands.map((command) => command.kind)).toEqual(["jevObservationIgnored"])
    expect(callback.rejection).toBeUndefined()
    expect(callback.after.dispatch.requests).toEqual([])
    expect(callback.after.work).toEqual(callback.before.work)
    expect(callback.after.pendingFindings).toEqual([])
    expect(callback.after.global).toEqual({ items: 0, bytes: 0 })
    expect(
      callback.commands.some(
        (command) =>
          command.kind === "reviewRecorded" || command.kind === "collectionEligible" || command.kind === "retainFinding"
      )
    ).toBe(false)
    if (!lateTarget) throw new Error("missing original late callback receipt")
    expect(run.applyControl({ kind: "callback", action: "duplicate", target: lateTarget }).control).toEqual({
      kind: "callback",
      action: "duplicate",
      target: lateTarget
    })
    run.advance({ untilTime: 20, maxEvents: 100 })
    const duplicate = run.observations.filter((frame) => frame.event.kind === "jevRequestSettled")[1]
    expect(duplicate?.event).toEqual(callback.event)
    expect(duplicate?.rejection).toBe("StaleOperation")
    expect(duplicate?.commands).toEqual([])
    expect(duplicate?.after).toEqual(duplicate?.before)
  }
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.dispatch.running).toEqual([])
  expect(run.projection.collection.leases).toEqual([])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  replay(run)
})

it("keeps a pending preparation callback in its original scope after a Stop cutoff", () => {
  const run = createRun({
    ...config(1),
    preparationDelay: 12,
    finishDeadline: 2,
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 1, kind: "finish" }
    ]
  })
  run.advance({ untilTime: 1, maxEvents: 100 })
  expect(run.observations.some((frame) => frame.commands.some((command) => command.kind === "waitForWork"))).toBe(true)
  run.advance({ untilTime: 3, maxEvents: 100 })
  expect(run.observations.some((frame) => frame.commands.some((command) => command.kind === "cancelWork"))).toBe(true)
  expect(run.observations.some((frame) => frame.event.kind === "preparationCompleted")).toBe(false)
  expect(run.observations.some((frame) => frame.event.kind === "jevRequestStarted")).toBe(false)
  replay(run)
  run.advance({ untilTime: 20, maxEvents: 100 })
  const callback = run.observations.find((frame) => frame.event.kind === "preparationCompleted")!
  expect(callback.time).toBe(12)
  expect(callback.event).toMatchObject({ partition: 1, lifetime: 1, round: 1 })
  expect(callback.rejection).toBeDefined()
  expect(callback.after).toEqual(callback.before)
  const physical = run.observations.find(
    (frame) => frame.event.kind === "dispatchSettled" && frame.event.operation === 1
  )
  expect(physical?.event).toEqual({ kind: "dispatchSettled", partition: 1, lifetime: 1, round: 1, operation: 1 })
  expect(physical?.time).toBe(12)
  expect(physical?.rejection).toBeUndefined()
  expect(run.observations.some((frame) => frame.event.kind === "jevRequestStarted")).toBe(false)
  expect(run.projection.dispatch.running).toEqual([])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  replay(run)
})

it.each(["certain", "uncertain"] as const)(
  "waits for live %s background output without duplicating certain delivery",
  (outcome) => {
    const run = createRun({
      ...config(5),
      outcome: "finding",
      finishDeadline: 10,
      // A real Background advicee; its next edit/task is outside this finite case.
      session: { editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 },
      outputProfile: { outcome, delayMs: 9, leaseMs: 20 },
      inputs: [
        { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
        { at: 8, kind: "finish" }
      ]
    })
    run.advance({ untilTime: 7, maxEvents: 100 })
    const originalOutput = run.observations.find((frame) => frame.event.kind === "submissionBegin")
    expect(originalOutput?.time).toBe(7)
    expect(originalOutput?.event).toMatchObject({
      kind: "submissionBegin",
      advice: 3,
      group: 1,
      round: 1,
      token: 3,
      surface: "background",
      authorizeNow: true,
      fingerprints: [3],
      units: [3]
    })
    expect(run.projection.delivery.submissions.batches[0]).toMatchObject({
      advice: 3,
      group: 1,
      round: 1,
      token: 3,
      surface: "background",
      phase: "authorized"
    })
    expect(run.projection.collection.leases).toEqual([{ advice: 3, owner: 3 }])
    run.advance({ untilTime: 8, maxEvents: 100 })
    expect(
      run.projection.collection.leases,
      JSON.stringify(
        run.observations.map((frame) => ({
          time: frame.time,
          event: frame.event.kind,
          commands: frame.commands.map((command) => command.kind)
        }))
      )
    ).toHaveLength(1)
    expect(
      run.observations
        .findLast((frame) => frame.event.kind === "stopPolled")
        ?.commands.some((command) => command.kind === "waitForOutput")
    ).toBe(true)
    expect(run.observations.some((frame) => frame.event.kind === "finishAuthorize")).toBe(false)
    const restored = replay(run)
    for (const candidate of [run, restored]) candidate.advance({ untilTime: 16, maxEvents: 100 })
    expect(restored.observe()).toEqual(run.observe())
    const background = run.observations.find((frame) => frame.event.kind === "submissionTerminal")!
    expect(background.time).toBe(16)
    expect(background.event).toMatchObject({ certain: outcome === "certain" })
    if (outcome === "certain")
      expect(run.observations.some((frame) => frame.event.kind === "finishAuthorize")).toBe(false)
    else {
      const authorized = run.observations.find((frame) => frame.event.kind === "finishAuthorize")!
      expect(authorized.time).toBe(16)
      expect(authorized.event).toMatchObject({ group: 1, round: 1 })
      expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
    }
    run.advance({ untilTime: 40, maxEvents: 100 })
    expect(run.projection.collection.leases).toEqual([])
    expect(run.projection.dispatch.requests).toEqual([])
    replay(run)
  }
)
