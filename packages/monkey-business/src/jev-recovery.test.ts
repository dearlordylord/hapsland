import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Observation } from "./index.ts"
import {
  runWorkloadNative,
  runWorkloadEmitted,
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"

it.each(["neverSent", "backendFailure", "timeout", "interrupted"] as const)(
  "releases each request and restores delivery through twelve %s cycles without reset",
  (outcome) => {
    const run = createRun({ inputs: [], outcome: "finding", jevDelay: 5, retention: 10000 })
    for (let cycle = 0; cycle < 12; cycle++) {
      for (const selected of [outcome, "finding"] as const) {
        run.applyControl({ kind: "jevProfile", delayMs: 5, outcome: selected })
        const start = run.eventCount
        run.schedule({ at: run.now, kind: "edit", bytes: 10, unitBytes: [5] })
        run.advance({ untilTime: run.now + 20, maxEvents: 100 })
        const frames = run.observations.filter((frame) => frame.sequence >= start)
        const settled = frames.filter((frame) => frame.event.kind === "jevRequestSettled")
        expect(settled).toHaveLength(1)
        expect(settled[0]?.event).toMatchObject({ outcome: selected })
        expect(frames.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(
          selected === "neverSent" ? 0 : 1
        )
        expect(frames.filter((frame) => frame.event.kind === "jevRequestInterrupted")).toHaveLength(
          selected === "interrupted" ? 1 : 0
        )
        expect(frames.filter((frame) => frame.rejection)).toEqual([])
        expect(run.projection.dispatch.requests).toEqual([])
        expect(run.projection.dispatch.running).toEqual([])
        expect(
          frames.flatMap((frame) => frame.outputs).filter((command) => command.kind === "submissionRecorded")
        ).toHaveLength(selected === "finding" ? 1 : 0)
        if (selected === "finding") expect(frames.some((frame) => frame.after.collection.ready.length > 0)).toBe(true)
      }
    }
    const replay = restoreReplay(run.exportReplay())
    expect(replay.observations).toEqual(run.observations)
    expect(replay.projection).toEqual(run.projection)
  }
)

// Boundary projection only, not a second execution or policy oracle.
const eventCodes: Record<string, number> = {
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
  jevRequestSettled: 12,
  collectionReady: 13,
  finalCandidateCheck: 14,
  submissionSuppressCheck: 15,
  collectionReserveLease: 16,
  submissionBegin: 17,
  submissionTerminal: 18,
  collectionLeaseCheck: 19,
  collectionReleaseLease: 20,
  collectionRetireAdvice: 22,
  submissionForget: 23,
  retireReview: 24,
  jevRequestInterrupted: 25
}
const commandCodes: Record<string, number> = {
  roundStarted: 1,
  observationAdmitted: 2,
  dispatchStarted: 3,
  prepare: 4,
  unitAdmitted: 5,
  jevRequestIssued: 6,
  findingRetained: 7,
  collectionEligible: 8,
  retainCandidate: 9,
  submissionUnsuppressed: 10,
  collectionLeaseReserved: 11,
  submissionBegun: 12,
  submissionRecorded: 13,
  observationStarted: 14,
  preparationReleased: 15,
  observationCompleted: 16,
  reviewStarted: 17,
  jevRequestStartRecorded: 18,
  jevRequestOutcomeRecorded: 19,
  reservationReleased: 20,
  collectionLeaseKept: 21,
  collectionLeaseReleased: 22,
  clearSettled: 23,
  reviewRecorded: 24,
  retireCandidate: 25,
  releaseCandidate: 26,
  collectionAdviceRetired: 27,
  submissionForgotten: 28,
  jevInterruptionRecorded: 29,
  jevRequestUnavailable: 30
}
const graphCodes: Record<string, number> = { none: 0, resolveEdge: 1, checkPath: 2, readSource: 3, unitComplete: 4 }
const code = (codes: Record<string, number>, kind: string): number => {
  const value = codes[kind]
  if (value === undefined) throw new Error(`unmapped public boundary kind ${kind}`)
  return value
}
const row = (frame: Observation): number[] => {
  const counts = [
    frame.after.global.items,
    frame.after.global.bytes,
    frame.after.dispatch.running.length,
    frame.after.dispatch.requests.length,
    frame.after.collection.leases.length
  ]
  if (frame.preparation) {
    const { command, after } = frame.preparation
    return [21, frame.time, code(graphCodes, command.kind), after.files, after.readBytes, after.treeBytes, ...counts]
  }
  const event = frame.event as unknown as Record<string, unknown>
  const numbers = (keys: string[]): number[] => keys.map((key) => Number(event[key]))
  const facts =
    event.kind === "finalCandidateCheck"
      ? numbers([
          "ownerCurrent",
          "credentialGeneration",
          "credentialAuthorized",
          "expired",
          "workCurrent",
          "hasFindings"
        ])
      : event.kind === "jevRequestReady"
        ? numbers([
            "rootValid",
            "configurationValid",
            "credentialReady",
            "selected",
            "currentWork",
            "physicalAvailable"
          ])
        : event.kind === "jevRequestSettled"
          ? [
              Number(event.currentWork),
              code(
                { neverSent: 1, finding: 2, clear: 3, backendFailure: 4, timeout: 5, interrupted: 6 },
                String(event.outcome)
              ),
              0,
              0,
              0,
              0
            ]
          : event.kind === "submissionTerminal"
            ? [Number(event.certain), 0, 0, 0, 0, 0]
            : event.kind === "beginObservedPreparation"
              ? [Number(event.bytes), 0, 0, 0, 0, 0]
              : event.kind === "preparationCompleted"
                ? [(event.unitBytes as number[]).length, (event.unitBytes as number[])[0] ?? 0, 0, 0, 0, 0]
                : event.kind === "submissionBegin"
                  ? [
                      Number(event.authorizeNow),
                      (event.fingerprints as number[]).length,
                      (event.fingerprints as number[])[0] ?? 0,
                      (event.units as number[]).length,
                      (event.units as number[])[0] ?? 0,
                      0
                    ]
                  : event.kind === "collectionLeaseCheck"
                    ? numbers(["expired", "stopCollector", "sameGroup", "reofferable"]).concat([0, 0])
                    : [0, 0, 0, 0, 0, 0]
  const identity = ["partition", "lifetime", "round", "operation", "request", "advice", "token"].map((key) =>
    Number(
      event[key] ??
        (key === "operation"
          ? event.observation
          : key === "partition"
            ? event.group
            : key === "token"
              ? event.fingerprint
              : undefined) ??
        0
    )
  )
  return [
    code(eventCodes, frame.event.kind),
    frame.time,
    ...identity,
    ...facts,
    ...counts,
    Number(!!frame.rejection),
    ...frame.outputs.map((command) => code(commandCodes, command.kind))
  ]
}

it("compares four original twelve-cycle recovery scripts with the stateful native driver and public replay", () => {
  const fixture = new URL("../../monkey-business-bend/conformance/jev-recovery-native.bend", import.meta.url)
  const native = runWorkloadNative(fixture, {
    emissionTimeoutMs: 90000,
    clangTimeoutMs: 120000,
    executionTimeoutMs: 5000
  }) as number[][][]
  const emitted = runWorkloadEmitted(fixture, { emissionTimeoutMs: 30000, stackSizeKiB: 4096 })
  expect(native).toEqual(emitted)
  const faults = ["neverSent", "backendFailure", "timeout", "interrupted"] as const
  const expectedTimes = Array.from({ length: 24 }, (_, index) => index * 20 + 7)
  for (const [index, trace] of native.entries()) {
    expect(trace.filter((row) => row[0] === 12).map((row) => row[1])).toEqual(expectedTimes)
    expect(trace.filter((row) => row[0] === 11)).toHaveLength(index === 0 ? 12 : 24)
    expect(trace.filter((row) => row[0] === 25)).toHaveLength(index === 3 ? 12 : 0)
    expect(trace.filter((row) => row[0] === 18)).toHaveLength(12)
    expect(trace.some((row) => [97, 98, 99].includes(row[0] ?? 99))).toBe(false)
    expect(trace.filter((row) => row[0] !== 21).every((row) => row[20] === 0)).toBe(true)
    expect(trace.at(-1)?.slice(17, 20)).toEqual([0, 0, 0])
  }
  const publicTraces = faults.map((outcome) => {
    const run = createRun({
      outcome,
      jevDelay: 5,
      preparationDelay: 2,
      inputs: Array.from({ length: 24 }, (_, index) => ({
        at: index * 20,
        kind: "edit" as const,
        bytes: 10,
        unitBytes: [5]
      })),
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
    for (let period = 0; period < 24; period++) {
      if (period > 0) {
        run.advance({ untilTime: period * 20 - 1, maxEvents: 100 })
        run.applyControl({ kind: "jevProfile", delayMs: 5, outcome: period % 2 === 0 ? outcome : "finding" })
      }
      run.advance({ untilTime: period * 20 + 10, maxEvents: 100 })
    }
    expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
    expect(
      run.observations.flatMap((frame) => frame.outputs).filter((command) => command.kind === "submissionRecorded")
    ).toHaveLength(12)
    expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
    return run.observations.map(row)
  })
  expect(native).toEqual(publicTraces)
}, 250000)

it(
  "compares original targeted Jev interventions with native reports and full public traces",
  () => {
    const native = runWorkloadNative(
      new URL("../../monkey-business-bend/conformance/jev-targets-native.bend", import.meta.url)
    ) as number[][][]
    const targets = [
      { trigger: "issued", outcome: "neverSent", lifetime: 1, result: "applied", code: 1, outputs: 0 },
      { trigger: "started", outcome: "timeout", lifetime: 1, result: "applied", code: 1, outputs: 0 },
      { trigger: "started", outcome: "interrupted", lifetime: 1, result: "applied", code: 1, outputs: 0 },
      { trigger: "started", outcome: "neverSent", lifetime: 1, result: "requestAlreadyStarted", code: 3, outputs: 1 },
      { trigger: "issued", outcome: "timeout", lifetime: 2, result: "requestMissing", code: 2, outputs: 1 },
      { trigger: "settled", outcome: "interrupted", lifetime: 1, result: "requestMissing", code: 2, outputs: 1 }
    ] as const
    expect(native).toHaveLength(targets.length)
    for (const [index, scenario] of targets.entries()) {
      const nativeTrace = native[index] ?? []
      const controls = nativeTrace.filter((row) => row[0] === 30)
      expect(controls).toEqual([
        [30, scenario.trigger === "settled" ? 7 : 2, scenario.code, 1, scenario.lifetime, 1, 3, 4]
      ])
      expect(nativeTrace.filter((row) => row[0] === 18)).toHaveLength(scenario.outputs)
      const run = createRun({
        outcome: "finding",
        inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }],
        preparationDelay: 2,
        jevDelay: 5,
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
      const reached = () =>
        scenario.trigger === "issued"
          ? run.observations.some((frame) => frame.outputs.some((command) => command.kind === "jevRequestIssued"))
          : run.observations.some(
              (frame) =>
                frame.event.kind === (scenario.trigger === "started" ? "jevRequestStarted" : "jevRequestSettled")
            )
      for (let transitions = 0; transitions < 100 && !reached(); transitions++) run.step()
      expect(reached()).toBe(true)
      run.applyControl({
        kind: "jevRequest",
        target: { partition: 1, lifetime: scenario.lifetime, round: 1, operation: 3, request: 4 },
        outcome: scenario.outcome
      })
      expect(run.interventions.at(-1)?.result).toBe(scenario.result)
      run.advance({ untilTime: 10, maxEvents: 100 })
      expect(run.projection.dispatch.requests).toEqual([])
      expect(run.projection.dispatch.running).toEqual([])
      expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
      expect(nativeTrace.filter((row) => row[0] !== 30)).toEqual(run.observations.map(row))
      expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
    }
  },
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
)

it.each([0, 1, 2] as const)(
  "compares original credential action script %i with the same native resident",
  (mode) => {
    const fixtures = [
      "jev-credentials-unavailable-native.bend",
      "jev-credentials-restore-native.bend",
      "jev-credentials-rotation-native.bend"
    ] as const
    const nativeTrace = runWorkloadNative(
      new URL(`../../monkey-business-bend/conformance/${fixtures[mode]}`, import.meta.url)
    ) as number[][]
    const run = createRun({
      outcome: "finding",
      inputs:
        mode === 1
          ? [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }]
          : [0, 11].map((at) => ({ at, kind: "edit" as const, bytes: 10, unitBytes: [5] })),
      preparationDelay: 2,
      jevDelay: 5,
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
    const trace: number[][] = []
    let recorded = 0
    const flush = () => {
      trace.push(...run.observations.slice(recorded).map(row))
      recorded = run.observations.length
    }
    const control = (action: "unavailable" | "restore" | "rotate") => {
      flush()
      const state = run.projection
      run.applyControl({ kind: "credentials", action })
      trace.push([
        31,
        run.now,
        { unavailable: 1, restore: 2, rotate: 3 }[action],
        1,
        state.global.items,
        state.global.bytes,
        state.dispatch.running.length,
        state.dispatch.requests.length,
        state.collection.leases.length
      ])
    }
    const reach = (condition: () => boolean) => {
      for (let transitions = 0; transitions < 100 && !condition(); transitions++) run.step()
      expect(condition()).toBe(true)
    }
    if (mode === 0) {
      control("unavailable")
      reach(() =>
        run.observations.some((frame) => frame.event.kind === "dispatchSettled" && frame.event.operation === 3)
      )
      expect(
        run.observations.flatMap((frame) => frame.outputs).filter((command) => command.kind === "jevRequestUnavailable")
      ).toHaveLength(1)
      expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
      expect(run.projection.dispatch.running).toEqual([])
      control("restore")
    } else if (mode === 1) {
      reach(() => run.observations.some((frame) => frame.event.kind === "jevRequestSettled"))
      control("unavailable")
      run.advance({ untilTime: 8, maxEvents: 100 })
      expect(run.projection.pendingFindings.map((finding) => finding.operation)).toEqual([3])
      expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
      expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
      control("restore")
    } else {
      reach(() => run.observations.some((frame) => frame.event.kind === "jevRequestStarted"))
      control("rotate")
      run.advance({ untilTime: 10, maxEvents: 100 })
      expect(run.projection.pendingFindings).toEqual([])
      expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
      expect(run.projection.dispatch.requests).toEqual([])
      expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
      expect(
        run.observations.filter((frame) => frame.event.kind === "retireReview").map((frame) => frame.event)
      ).toEqual([{ kind: "retireReview", partition: 1, lifetime: 1, round: 1, operation: 3 }])
      expect(nativeTrace.find((row) => row[0] === 34)).toEqual([34, 2, 1, 5, 1, 1, 0, 2, 1, 0, 0])
      expect(nativeTrace.find((row) => row[0] === 32)).toEqual([32, 7, 0, 0, 0, 0, 0, 2, 0, 0, 0])
    }
    run.advance({ untilTime: mode === 1 ? 10 : 20, maxEvents: 100 })
    flush()
    expect(nativeTrace.filter((row) => ![32, 33, 34, 35].includes(row[0] ?? 99))).toEqual(trace)
    expect(nativeTrace.filter((row) => row[0] === 18)).toHaveLength(1)
    expect(nativeTrace.filter((row) => row[0] === 11)).toHaveLength(mode === 0 ? 1 : mode === 1 ? 1 : 2)
    // The fresh edit at11 completes PRE2 at13 and Jev5 at18. Captures
    // follow live work/physical-request ownership, not historical numeric IDs.
    if (mode === 0) {
      const started = run.observations.find((frame) => frame.event.kind === "jevRequestStarted")
      expect(started?.event.kind).toBe("jevRequestStarted")
      if (started?.event.kind === "jevRequestStarted") {
        expect(nativeTrace.filter((row) => row[0] === 35)).toEqual([[35, 13, started.event.operation, 1]])
      }
    }
    const endpoint = nativeTrace.find((row) => row[0] === 33)
    expect(endpoint).toEqual(
      mode === 0
        ? [33, 18, 1, 5, 0, 0, 0, 1, 0, 0, 0]
        : mode === 1
          ? [33, 7, 1, 5, 0, 0, 0, 1, 1, 0, 0]
          : [33, 18, 1, 5, 0, 0, 0, 2, 0, 0, 2]
    )
    expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
    expect(run.projection.dispatch.running).toEqual([])
    expect(run.projection.dispatch.requests).toEqual([])
    expect(run.projection.collection.leases).toEqual([])
    expect(run.interventions.every((report) => report.result === "applied")).toBe(true)
    expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
  },
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
)
