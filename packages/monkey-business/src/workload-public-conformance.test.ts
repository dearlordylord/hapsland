import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Run, type RunConfig } from "./index.ts"
import type { OutcomeWeights } from "./outcomes.ts"
import {
  runWorkloadNative,
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"
import Shared from "../../monkey-business-bend/engine.mjs"
import { SessionGenerator } from "./session.ts"

const weights = (selected: Partial<OutcomeWeights>): OutcomeWeights => ({
  neverSent: 0,
  finding: 0,
  clear: 0,
  backendFailure: 0,
  timeout: 0,
  interrupted: 0,
  ...selected
})
const inputs = Array.from({ length: 16 }, (_, index) => ({
  kind: "edit" as const,
  at: index * 50,
  bytes: 10,
  unitBytes: [5]
}))
const outcomes = (run: Run) =>
  run.observations.flatMap((frame) => (frame.event.kind === "jevRequestSettled" ? [frame.event.outcome] : []))
const drain = (run: Run) => run.advance({ maxEvents: 2000 })
const session: RunConfig = {
  retention: 10000,
  outcome: "clear",
  session: {
    agent: "writer",
    seed: 7,
    editIntervalMs: 10,
    variationMs: 0,
    editsPerTask: 1,
    editDurationMs: 30,
    bytes: 10,
    unitBytes: [5]
  },
  editPermitLimits: { perAdvicee: 4, resident: 4 },
  permitProfile: { outcome: "success", durationMs: 1, lifetimeMs: 100 }
}

it("restores controls at an endpoint with no subsequent product event", () => {
  const run = createRun(session)
  run.advance({ untilTime: 11, maxEvents: 100 })
  const eventCount = run.eventCount
  run.applyControl({ kind: "sizes", agent: "writer", reservationBytes: 25, reviewUnitBytes: [7, 8] })
  run.applyControl({ kind: "editPace", agent: "writer", intervalMs: 70 })
  run.applyControl({ kind: "editDuration", agent: "writer", durationMs: 2 })
  run.applyControl({ kind: "suspendArrivals", agent: "writer", suspended: true })
  expect(run.eventCount).toBe(eventCount)
  const replay = JSON.parse(JSON.stringify(run.exportReplay()))
  const restored = restoreReplay(replay)
  expect(restored.exportReplay()).toEqual(replay)
  expect(restored.observe()).toEqual(run.observe())
  for (const candidate of [run, restored]) {
    candidate.applyControl({ kind: "burst", agent: "writer", count: 1 })
    candidate.advance({ untilTime: 100, maxEvents: 500 })
  }
  expect(restored.observations).toEqual(run.observations)
  expect(restored.projection).toEqual(run.projection)
})

it("pins the outcome stream at the public boundary without a sampler oracle", () => {
  const run = createRun({ seed: 7, inputs })
  drain(run)
  expect(outcomes(run)).toEqual([
    "clear",
    "finding",
    "finding",
    "finding",
    "clear",
    "finding",
    "finding",
    "finding",
    "finding",
    "finding",
    "clear",
    "finding",
    "finding",
    "finding",
    "clear",
    "clear"
  ])
  const stepped = createRun({ seed: 7, inputs })
  for (let count = 0; count < 2000 && stepped.step(); count++);
  expect(stepped.observations).toEqual(run.observations)
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
})

it.each([
  ["subnormal", weights({ finding: Number.MIN_VALUE }), "finding"],
  ["fractional", weights({ interrupted: 0.125 }), "interrupted"]
] as const)("preserves a sole %s outcome weight", (_name, outcomeWeights, expected) => {
  const run = createRun({ seed: 7, inputs: inputs.slice(0, 4), outcomeWeights })
  drain(run)
  expect(outcomes(run)).toEqual(Array(4).fill(expected))
  expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations)
})

it("rejects a zero profile before recording controls or consuming the random stream", () => {
  const run = createRun({ seed: 7, inputs })
  const before = run.exportReplay()
  expect(() => run.applyControl({ kind: "jevProfile", delayMs: 1, outcomeWeights: weights({}) })).toThrow()
  expect(run.exportReplay()).toEqual(before)
  drain(run)
  expect(outcomes(run).slice(0, 5)).toEqual(["clear", "finding", "finding", "finding", "clear"])
})

it.each([9, 10, 11])("retains a PRE-captured duration of %i across suspension and profile changes", (duration) => {
  const run = createRun({
    ...session,
    session: { ...session.session, editDurationMs: duration },
    editPermitLimits: { perAdvicee: 2, resident: 2 },
    permitProfile: { outcome: "success", durationMs: 1, lifetimeMs: 10 }
  })
  run.advance({ untilTime: 11, maxEvents: 100 })
  const issued = run.observations.filter((frame) => frame.event.kind === "issuePermit")
  expect(issued.map((frame) => frame.time)).toEqual([10])
  run.applyControl({ kind: "editDuration", agent: "writer", durationMs: 0 })
  run.applyControl({ kind: "suspendArrivals", agent: "writer", suspended: true })
  run.advance({ untilTime: 100, maxEvents: 500 })
  const consumed = run.observations.filter((frame) =>
    frame.commands.some((command) => command.kind === "permitConsumed")
  )
  expect(consumed.map((frame) => frame.time)).toEqual(duration <= 10 ? [10 + duration] : [])
  expect(run.projection.admissions.flatMap((admission) => admission.permits)).toEqual([])
  if (duration > 10) {
    expect(outcomes(run)).toEqual([])
    expect(run.projection.rounds).toEqual([])
  }
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
})

it("keeps an issued request's outcome and deadline across a profile control", () => {
  const run = createRun({ seed: 7, inputs: inputs.slice(0, 2), jevDelay: 20, outcomeWeights: weights({ clear: 1 }) })
  for (let count = 0; count < 100; count++) {
    const frame = run.step()
    if (frame?.commands.some((command) => command.kind === "jevRequestIssued")) break
  }
  const started = run.observations.flatMap((frame) =>
    frame.effects.flatMap((effect) => (effect.kind === "jev" && effect.phase === "started" ? [effect.due] : []))
  )
  expect(started).toHaveLength(1)
  run.applyControl({ kind: "jevProfile", delayMs: 1, outcomeWeights: weights({ backendFailure: 1 }) })
  drain(run)
  const settled = run.observations.filter((frame) => frame.event.kind === "jevRequestSettled")
  expect(settled.map((frame) => frame.time)).toEqual([started[0], 53])
  expect(outcomes(run)).toEqual(["clear", "backendFailure"])
  expect(run.projection.dispatch.running).toEqual([])
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
})

it("orders equal-time advicees identically under stepping and bounded advancement", () => {
  const { session: generatedSession, ...base } = session
  const config: RunConfig = {
    ...base,
    sessions: ["first", "second"].map((agent) => ({ ...generatedSession, agent })),
    editPermitLimits: { perAdvicee: 4, resident: 8 },
    permitProfile: { outcome: "success", durationMs: 1, lifetimeMs: 100 }
  }
  const batched = createRun(config)
  batched.advance({ untilTime: 11, maxEvents: 100 })
  expect(
    batched.observations.filter((frame) => frame.event.kind === "issuePermit").map((frame) => [frame.time, frame.agent])
  ).toEqual([
    [10, "first"],
    [10, "second"]
  ])
  const stepped = createRun(config)
  for (let count = 0; count < batched.eventCount; count++) expect(stepped.step()).toBeDefined()
  expect(stepped.observations).toEqual(batched.observations)
  for (const run of [batched, stepped]) {
    run.applyControl({ kind: "suspendArrivals", suspended: true })
    run.advance({ untilTime: 100, maxEvents: 500 })
  }
  expect(stepped.observations).toEqual(batched.observations)
  expect(
    batched.observations
      .filter((frame) => frame.commands.some((command) => command.kind === "permitConsumed"))
      .map((frame) => [frame.time, frame.agent])
  ).toEqual([
    [40, "first"],
    [40, "second"]
  ])
  expect(restoreReplay(batched.exportReplay()).observe()).toEqual(batched.observe())
})

it("preserves fractional scaling without making zero-weight outcomes reachable", () => {
  const run = createRun({ seed: 7, inputs, outcomeWeights: weights({ finding: 0.25, clear: 0.75 }) })
  const scaled = createRun({ seed: 7, inputs, outcomeWeights: weights({ finding: 25, clear: 75 }) })
  drain(run)
  drain(scaled)
  expect(outcomes(run)).toEqual(outcomes(scaled))
  expect(new Set(outcomes(run))).toEqual(new Set(["finding", "clear"]))
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
})

it(
  "executes an original continuous arrival through the native shared workload and business driver",
  () => {
    const [native, timing, feedback, permitTraces, endpoint, equalTimes] = runWorkloadNative(
      new URL("../../monkey-business-bend/conformance/workload-scenario.bend", import.meta.url)
    ) as [number[][], number[][], number[][], number[][][], number[][], number[][]]
    expect(endpoint).toEqual([
      [10, 2, 0, 0, 1],
      [10, 1, 2, 1, 1, 2, 25, 15, 0, 0]
    ])
    expect(equalTimes).toEqual([
      [10, 0],
      [10, 1]
    ])
    expect(timing).toEqual([
      [10, 20, 19, 9, 1],
      [10, 20, 20, 10, 1],
      [10, 20, 21, 11, 1],
      [10, 20, 10, 0, 1],
      [4294967313, 4294967323, 4294967322, 9, 1]
    ])
    expect(permitTraces).toEqual([
      [
        [10, 31, 1, 20, 1, 0, 0, 1],
        [19, 32, 1, 0, 0, 1, 0, 2, 4]
      ],
      [
        [10, 31, 1, 20, 1, 0, 0, 1],
        [20, 32, 1, 0, 0, 1, 0, 2, 4]
      ],
      [
        [10, 31, 1, 20, 1, 0, 0, 1],
        [20, 33, 1, 0, 0, 0, 0, 3],
        [21, 32, 1, 0, 0, 0, 1]
      ]
    ])
    for (const [index, duration] of [9, 10, 11].entries()) {
      const permitRun = createRun({
        ...session,
        session: { ...session.session, editDurationMs: duration },
        editPermitLimits: { perAdvicee: 2, resident: 2 },
        permitProfile: { outcome: "success", durationMs: 1, lifetimeMs: 10 }
      })
      permitRun.advance({ untilTime: 11, maxEvents: 100 })
      permitRun.applyControl({ kind: "editDuration", agent: "writer", durationMs: 0 })
      permitRun.applyControl({ kind: "suspendArrivals", agent: "writer", suspended: true })
      permitRun.advance({ untilTime: 100, maxEvents: 500 })
      const publicPermits = permitRun.observations.flatMap((frame) => {
        const event = frame.event
        if (event.kind !== "issuePermit" && event.kind !== "consumePermit" && event.kind !== "expirePermit") return []
        const codes: Record<string, number> = { permitIssued: 1, permitConsumed: 2, permitExpired: 3, roundStarted: 4 }
        return [
          [
            frame.time,
            event.kind === "issuePermit" ? 31 : event.kind === "consumePermit" ? 32 : 33,
            event.kind === "issuePermit"
              ? frame.commands.find((command) => command.kind === "permitIssued")?.token
              : event.token,
            event.kind === "issuePermit" ? event.deadline : 0,
            frame.after.admissions.flatMap((admission) => admission.permits).length,
            frame.after.rounds.length,
            frame.rejection ? 1 : 0,
            ...frame.commands.map((command) => codes[command.kind])
          ]
        ]
      })
      expect(publicPermits).toEqual(permitTraces[index])
      expect(restoreReplay(permitRun.exportReplay()).observe()).toEqual(permitRun.observe())
    }
    expect(feedback).toEqual([
      [50, 1, 0, 0, 1, 0, 10, 5, 0, 1],
      [60, 1, 0, 1, 1, 1, 10, 5, 0, 1],
      [70, 1, 1, 1, 1, 2, 10, 5, 1, 0],
      [50, 1, 1, 1, 1, 3, 10, 5, 0, 0],
      [50, 1, 1, 1, 1, 4, 10, 5, 0, 0],
      [50, 1, 1, 1, 1, 5, 25, 15, 0, 0],
      [80, 0, 1, 1]
    ])
    const generator = new SessionGenerator({
      agent: "writer",
      seed: 7,
      editIntervalMs: 10,
      variationMs: 0,
      editsPerTask: 1,
      taskPauseMs: 100,
      adviceResponse: "delayedRepair",
      repairDelayMs: 20,
      bytes: 10,
      unitBytes: [5]
    })
    const generated = [
      ...generator.next(50),
      ...generator.next(50),
      ...generator.apply({ kind: "suspendArrivals", suspended: true }, 50),
      ...generator.onAdvice(50),
      ...generator.apply({ kind: "burst", count: 2 }, 50),
      ...generator.onFinish(50, true),
      ...generator.apply({ kind: "sizes", reservationBytes: 25, reviewUnitBytes: [7, 8] }, 50),
      ...generator.apply({ kind: "burst", count: 1 }, 50)
    ]
    expect(
      generated.map((input) => [
        input.at,
        input.generation,
        input.kind === "task" ? 0 : input.kind === "edit" ? 1 : 2,
        input.kind === "edit" ? input.revision : 0,
        input.kind === "edit" ? input.bytes : 0,
        input.kind === "edit" ? input.unitBytes.reduce((sum, bytes) => sum + bytes, 0) : 0,
        input.kind === "edit" && input.repair ? 1 : 0,
        input.recurring ? 1 : 0
      ])
    ).toEqual(
      feedback
        .slice(0, -1)
        .map((row) => [
          row[0],
          row[2],
          row[3],
          row[3] === 1 ? row[5] : 0,
          row[3] === 1 ? row[6] : 0,
          row[3] === 1 ? row[7] : 0,
          row[8],
          row[9]
        ])
    )
    expect(generated.map((input) => generator.valid(input))).toEqual([false, false, true, true, true, true])
    expect(native.some((row) => [97, 98, 99].includes(row[0]!))).toBe(false)
    expect(native.filter((row) => row[0] === 21).map((row) => row.slice(1, 6))).toEqual([
      [10, 0, 1, 100, 20],
      [10, 1, 1, 100, 20],
      [10, 2, 1, 100, 20],
      [11, 3, 1, 100, 20],
      [11, 0, 2, 200, 40],
      [11, 4, 2, 200, 40]
    ])
    expect(native.filter((row) => row[0] === 8).map((row) => row[1])).toEqual([12, 17])
    expect(native.filter((row) => row[0] === 12).map((row) => row[1])).toEqual([17])
    const run = createRun({
      retention: 10000,
      outcome: "clear",
      preparationDelay: 2,
      jevDelay: 5,
      session: {
        agent: "writer",
        seed: 7,
        editIntervalMs: 10,
        variationMs: 0,
        editsPerTask: 1,
        taskPauseMs: 100,
        bytes: 10,
        unitBytes: [5]
      },
      fileTrees: {
        ...DEFAULT_FILE_TREE_PROFILE,
        minFiles: 2,
        maxFiles: 2,
        maxImports: 1,
        maxDepth: 1,
        deniedPercent: 0,
        minSourceBytes: 100,
        maxSourceBytes: 100,
        minTreeBytes: 20,
        maxTreeBytes: 20
      }
    })
    for (let count = 0; count < 100; count++) {
      const frame = run.step()
      if (frame?.event.kind === "openRound") break
    }
    run.applyControl({ kind: "suspendArrivals", agent: "writer", suspended: true })
    run.advance({ untilTime: 20, maxEvents: 200 })
    const codes: Record<string, number> = {
      openRound: 1,
      admitObservation: 2,
      queueDispatch: 3,
      startObservation: 4,
      beginObservedPreparation: 5,
      preparationCompleted: 6,
      completeObservation: 7,
      dispatchSettled: 8,
      startReview: 9,
      jevRequestReady: 10,
      jevRequestStarted: 11,
      jevRequestSettled: 12
    }
    const graphCodes: Record<string, number> = { none: 0, resolveEdge: 1, checkPath: 2, readSource: 3, unitComplete: 4 }
    const publicTrace = run.observations.map((frame) => {
      const counts = [
        frame.after.global.items,
        frame.after.global.bytes,
        frame.after.dispatch.running.length,
        frame.after.dispatch.requests.length,
        frame.after.collection.leases.length
      ]
      if (frame.preparation)
        return [
          21,
          frame.time,
          graphCodes[frame.preparation.command.kind],
          frame.preparation.after.files,
          frame.preparation.after.readBytes,
          frame.preparation.after.treeBytes,
          ...counts
        ]
      return [codes[frame.event.kind], frame.time, ...counts, frame.rejection ? 1 : 0]
    })
    expect(native.map((row) => (row[0] === 21 ? row : [row[0], row[1], ...row.slice(15, 21)]))).toEqual(publicTrace)
    expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
    expect(outcomes(run)).toEqual(["clear"])
    expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
  },
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
)

it(
  "runs original IEEE64 weight words in the compiled native numeric owner",
  () => {
    const native = runWorkloadNative(
      new URL("../../monkey-business-bend/conformance/workload-numeric.bend", import.meta.url)
    ) as number[][]
    expect(native[0]).toEqual([2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2])
    expect(native[1]).toEqual(Array(16).fill(1))
    expect(native[3]).toEqual([0, 1, 0, 1])
    expect(native[4]).toEqual([1072693248, 0, 1072693248, 2, 0, 2, 1072693248, 0])
    const run = createRun({ seed: 7, inputs, outcomeWeights: weights({ finding: 0.25, clear: 0.75 }) })
    drain(run)
    expect(native[2]).toEqual(
      outcomes(run).map((outcome) => (outcome === "finding" ? 1 : outcome === "clear" ? 2 : -1))
    )
  },
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
)

it("preserves raw MIN_VALUE words when either addend is exact zero", () => {
  const zero = { $: "Numeric.Words", high: 0, low: 0 }
  const minimum = { $: "Numeric.Words", high: 0, low: 1 }
  expect(Shared.numeric_add(zero, minimum)).toEqual(minimum)
  expect(Shared.numeric_add(minimum, zero)).toEqual(minimum)
})

it("rounds valid weight arithmetic to nearest even and normalizes subnormals", () => {
  const one = { $: "Numeric.Words", high: 1072693248, low: 0 }
  const halfUlp = { $: "Numeric.Words", high: 1017118720, low: 0 }
  const minimum = { $: "Numeric.Words", high: 0, low: 1 }
  expect(Shared.numeric_add(one, halfUlp)).toEqual(one)
  expect(Shared.numeric_add({ ...one, low: 1 }, halfUlp)).toEqual({ ...one, low: 2 })
  expect(Shared.numeric_add(minimum, minimum)).toEqual({ ...minimum, low: 2 })
  expect(Shared.numeric_divide(minimum, minimum)).toEqual(one)
  expect(Shared.numeric_add({ $: "Numeric.Words", high: 1048575, low: 4294967295 }, minimum)).toEqual({
    $: "Numeric.Words",
    high: 1048576,
    low: 0
  })
  expect(Shared.numeric_divide(minimum, { ...minimum, low: 6 })).toEqual({
    $: "Numeric.Words",
    high: 1069897045,
    low: 1431655765
  })
})
