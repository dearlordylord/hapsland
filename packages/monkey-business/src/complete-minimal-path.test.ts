import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type RunConfig } from "./index.ts"

// The public scenario seam is agreed in #176. Expected observations below come
// from the advice/handoff contract, not another invocation of Canonical.
const minimal = (outcome: "finding" | "clear", at = 0): RunConfig => ({
  seed: 17,
  inputs: [{ at, kind: "edit", bytes: 10, unitBytes: [5], outcome }],
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

it.each(["finding", "clear"] as const)(
  "executes a complete %s path with checked intermediate preparation and request lifecycle",
  (outcome) => {
    const run = createRun(minimal(outcome))
    run.advance({ untilTime: 6 })
    expect(
      run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "retainFinding")
    ).toEqual([])
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestSettled")).toEqual([])
    expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
    const graphs = run.observations.filter((frame) => frame.preparation)
    expect(graphs.map((frame) => frame.preparation!.command.kind)).toEqual([
      "none",
      "resolveEdge",
      "checkPath",
      "readSource",
      "none",
      "unitComplete"
    ])
    expect(graphs.at(-1)!.preparation!.after).toMatchObject({ files: 2, readBytes: 200, treeBytes: 40 })
    for (const frame of graphs) {
      expect(frame.after.work.some((work) => work.kind === "preparing")).toBe(true)
      expect(frame.after).toEqual(frame.before)
      expect(frame.commands).toEqual([])
    }
    run.advance({ untilTime: 10 })
    const frames = run.observations
    expect(frames.filter((frame) => frame.rejection)).toEqual([])
    expect(frames.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
    expect(frames.filter((frame) => frame.event.kind === "jevRequestSettled").map((frame) => frame.time)).toEqual([7])
    expect(
      frames.flatMap((frame) => frame.commands).filter((command) => command.kind === "retainFinding")
    ).toHaveLength(outcome === "finding" ? 1 : 0)
    expect(frames.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(
      outcome === "finding" ? 1 : 0
    )
    expect(run.projection.delivery.submissions.batches.map((batch) => batch.phase)).toEqual(
      outcome === "finding" ? ["submitted"] : []
    )
    expect(run.projection.dispatch.running).toEqual([])
    expect(run.projection.dispatch.requests).toEqual([])
    expect(run.projection.global).toEqual(outcome === "finding" ? { items: 1, bytes: 5 } : { items: 0, bytes: 0 })
    expect(run.projection.collection.leases).toEqual([])
    expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
  }
)

it.each([
  { currentWork: false, credentialReady: true },
  { currentWork: true, credentialReady: true, sourceReadable: false },
  { currentWork: true, credentialReady: true, credentialGeneration: 2 }
])("refuses output when final handoff authority changes: %j", (environment) => {
  const run = createRun(minimal("finding"))
  for (
    let steps = 0;
    steps < 100 && !run.observations.some((frame) => frame.event.kind === "jevRequestSettled");
    steps++
  )
    run.step()
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestSettled")).toHaveLength(1)
  run.applyControl({ kind: "environment", ...environment })
  run.advance({ untilTime: 10 })
  expect(run.observations.some((frame) => frame.event.kind === "finalCandidateCheck")).toBe(true)
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
  expect(run.projection.pendingFindings).toEqual([])
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
})

it("preserves a current finding during credential unavailability and delivers after restoration without another request", () => {
  const run = createRun(minimal("finding"))
  for (
    let steps = 0;
    steps < 100 && !run.observations.some((frame) => frame.event.kind === "jevRequestSettled");
    steps++
  )
    run.step()
  run.applyControl({ kind: "environment", currentWork: true, credentialReady: false })
  run.advance({ untilTime: 10 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(run.projection.delivery.submissions.batches).toEqual([])
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(restored.observe()).toEqual(run.observe())
  for (const instance of [run, restored]) {
    instance.applyControl({ kind: "environment", currentWork: true, credentialReady: true })
    instance.advance({ untilTime: 11 })
    expect(instance.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
    expect(instance.projection.delivery.submissions.batches.map((batch) => batch.phase)).toEqual(["submitted"])
  }
  expect(restored.observe()).toEqual(run.observe())
})

it("keeps a full path above the U32 clock boundary exact across step, advance and replay", () => {
  const at = 2 ** 32 + 17
  const stepped = createRun(minimal("finding", at))
  const batched = createRun(minimal("finding", at))
  for (let budget = 0; budget < 100 && stepped.step(at + 10); budget++) {
    /* finite public stepping */
  }
  batched.advance({ untilTime: at + 10, maxEvents: 100 })
  expect(stepped.observe()).toEqual(batched.observe())
  expect(
    batched.observations.filter((frame) => frame.event.kind === "jevRequestSettled").map((frame) => frame.time)
  ).toEqual([at + 7])
  expect(batched.projection.delivery.submissions.batches.map((batch) => batch.phase)).toEqual(["submitted"])
  expect(restoreReplay(batched.exportReplay()).observe()).toEqual(batched.observe())
})

it("generates native request callbacks from original outcomes without the Started/NeverSent contradiction", () => {
  const native = spawnSync(
    "bend",
    [fileURLToPath(new URL("../../monkey-business-bend/conformance/request-lifecycle.bend", import.meta.url))],
    { encoding: "utf8", timeout: 5000 }
  )
  expect(native.error).toBeUndefined()
  expect(native.status, native.stdout + native.stderr).toBe(0)
  expect(native.stdout.trim()).toBe("[[3n, 5n], [1n, 0n, 4n, 5n], [1n, 0n, 5n, 5n], [1n, 0n, 2n, 5n, 6n, 5n]]")
  const observed = (["neverSent", "finding", "clear", "interrupted"] as const).map((outcome) => {
    const run = createRun({
      ...minimal("clear"),
      inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome }]
    })
    run.advance({ untilTime: 7 })
    expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
    return run.observations.flatMap((frame) => {
      const event = frame.event
      if (event.kind === "jevRequestStarted") return [1, frame.time - 2]
      if (event.kind === "jevRequestInterrupted") return [2, frame.time - 2]
      if (event.kind !== "jevRequestSettled") return []
      const code = { neverSent: 3, finding: 4, clear: 5, interrupted: 6, backendFailure: 7, timeout: 8 }[event.outcome]
      return [code, frame.time - 2]
    })
  })
  expect(observed).toEqual([
    [3, 5],
    [1, 0, 4, 5],
    [1, 0, 5, 5],
    [1, 0, 2, 5, 6, 5]
  ])
})

it("refuses request issuance while credentials are unavailable and a later edit progresses on the same resident", () => {
  const run = createRun({ ...minimal("finding"), environment: { currentWork: true, credentialReady: false } })
  run.advance({ untilTime: 10 })
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "jevRequestUnavailable")
  ).toHaveLength(1)
  expect(
    run.observations.filter(
      (frame) => frame.event.kind === "jevRequestStarted" || frame.event.kind === "jevRequestSettled"
    )
  ).toEqual([])
  expect(run.projection.dispatch.running).toEqual([])
  expect(run.projection.delivery.submissions.batches).toEqual([])
  run.applyControl({ kind: "environment", currentWork: true, credentialReady: true })
  run.schedule({ at: 11, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" })
  run.advance({ untilTime: 21 })
  expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  expect(run.projection.delivery.submissions.batches.map((batch) => batch.phase)).toEqual(["submitted"])
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
})

it("keeps a wide delay exact in the compiled native driver execution lane", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-minimal-delay-"))
  try {
    const binary = join(directory, "delay")
    const build = spawnSync(
      "bend",
      [
        fileURLToPath(new URL("../../monkey-business-bend/conformance/wide-request-delay.bend", import.meta.url)),
        "-o",
        binary
      ],
      { encoding: "utf8", timeout: 5000 }
    )
    expect(build.error).toBeUndefined()
    expect(build.status, build.stdout + build.stderr).toBe(0)
    const native = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 })
    expect(native.error).toBeUndefined()
    expect(native.status, native.stdout + native.stderr).toBe(0)
    expect(native.stdout.trim()).toBe("4294967313")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it("runs original source-free minimal scenarios through the native shared driver and agrees on intermediate public traces", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-minimal-scenario-"))
  let nativeTraces: number[][][]
  try {
    const source = join(directory, "scenario.c")
    const binary = join(directory, "scenario")
    const emit = spawnSync(
      "bend",
      [
        fileURLToPath(new URL("../../monkey-business-bend/conformance/minimal-scenario.bend", import.meta.url)),
        "-o",
        source
      ],
      { encoding: "utf8", timeout: 5000 }
    )
    expect(emit.error).toBeUndefined()
    expect(emit.status, emit.stdout + emit.stderr).toBe(0)
    // Bend checking/emission and native execution each retain a five-second bound.
    // External C compilation has a separate fifteen-second bound: it took 4.1s
    // without load and exceeded 5s during concurrent checks. This compile budget
    // changes no proof or simulated-time deadline; optimization is irrelevant to traces.
    const compile = spawnSync("clang", ["-O0", "-Wno-unused-value", source, "-o", binary, "-lm", "-pthread"], {
      encoding: "utf8",
      timeout: 15000
    })
    expect(compile.error).toBeUndefined()
    expect(compile.status, compile.stdout + compile.stderr).toBe(0)
    const native = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 })
    expect(native.error).toBeUndefined()
    expect(native.status, native.stdout + native.stderr).toBe(0)
    nativeTraces = JSON.parse(native.stdout)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
  // Independent contract observations also constrain the native lane directly.
  expect(nativeTraces.map((trace) => trace.filter((row) => row[0] === 18).length)).toEqual([1, 0, 0, 0, 0, 0, 0])
  for (const trace of nativeTraces) {
    expect(trace.some((row) => row[0] === 97 || row[0] === 98 || row[0] === 99)).toBe(false)
    expect(trace.filter((row) => row[0] === 21).map((row) => row.slice(1, 6))).toEqual([
      [0, 0, 1, 100, 20],
      [0, 1, 1, 100, 20],
      [0, 2, 1, 100, 20],
      [1, 3, 1, 100, 20],
      [1, 0, 2, 200, 40],
      [1, 4, 2, 200, 40]
    ])
    expect(trace.filter((row) => row[0] === 11)).toHaveLength(1)
    expect(trace.filter((row) => row[0] === 12).map((row) => row[1])).toEqual([7])
    expect(trace.filter((row) => row[0] === 8).map((row) => row[1])).toEqual([2, 7])
  }
  for (const trace of nativeTraces.slice(5)) {
    const retirements = trace.filter((row) => row[0] === 24)
    expect(retirements.length).toBeGreaterThan(0)
    expect(retirements.every((row) => row[3] === 2)).toBe(true)
    expect(trace.at(-1)!.slice(15, 17)).toEqual([0, 0])
  }
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
    retireReview: 24
  }
  const commandCodes: Record<string, number> = {
    roundStarted: 1,
    observationAdmitted: 2,
    dispatchStarted: 3,
    prepare: 4,
    unitAdmitted: 5,
    jevRequestIssued: 6,
    retainFinding: 7,
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
    settleClear: 23,
    reviewRecorded: 24,
    retireCandidate: 25,
    releaseCandidate: 26,
    collectionAdviceRetired: 27,
    submissionForgotten: 28
  }
  const graphCodes: Record<string, number> = { none: 0, resolveEdge: 1, checkPath: 2, readSource: 3, unitComplete: 4 }
  const scenarios = [
    { outcome: "finding" as const },
    { outcome: "clear" as const },
    { outcome: "finding" as const, environment: { currentWork: false, credentialReady: true } },
    { outcome: "finding" as const, environment: { currentWork: true, credentialReady: false } },
    { outcome: "finding" as const, environment: { currentWork: true, credentialReady: true, credentialGeneration: 2 } },
    { outcome: "finding" as const, lifetime: 2, environment: { currentWork: false, credentialReady: true } },
    {
      outcome: "finding" as const,
      lifetime: 2,
      environment: { currentWork: true, credentialReady: true, credentialGeneration: 2 }
    }
  ]
  const traces = scenarios.map(({ outcome, environment, lifetime }, index) => {
    const config = minimal(outcome)
    const run = createRun(
      lifetime === undefined
        ? config
        : {
            ...config,
            inputs: [
              { at: 0, kind: "canonical", event: { kind: "openRound", partition: 1, lifetime } },
              ...config.inputs!
            ]
          }
    )
    if (environment) {
      for (
        let steps = 0;
        steps < 100 && !run.observations.some((frame) => frame.event.kind === "jevRequestSettled");
        steps++
      )
        run.step()
      run.applyControl({ kind: "environment", ...environment })
    }
    run.advance({ untilTime: 10 })
    if (lifetime === 2) {
      // A stale finding releases its original lifetime's reservation; ownership
      // cannot be reconstructed using the resident's initial lifetime.
      expect(run.projection.pendingFindings).toEqual([])
      expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
      expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
      const retirements = run.observations.filter((frame) => frame.event.kind === "retireReview")
      expect(retirements.length).toBeGreaterThan(0)
      for (const frame of retirements) expect(frame.event).toMatchObject({ partition: 1, lifetime: 2, round: 1 })
    }
    expect(run.eventCount).toBe(nativeTraces[index]!.length)
    expect(run.now).toBe(nativeTraces[index]!.at(-1)![1])
    expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
    return run.observations.map((frame) => {
      if (frame.preparation) {
        const { command, after } = frame.preparation
        return [
          21,
          frame.time,
          graphCodes[command.kind] ?? 99,
          after.files,
          after.readBytes,
          after.treeBytes,
          frame.after.global.items,
          frame.after.global.bytes,
          frame.after.dispatch.running.length,
          frame.after.dispatch.requests.length,
          frame.after.collection.leases.length
        ]
      }
      const event = frame.event as unknown as Record<string, unknown>
      const facts =
        event.kind === "finalCandidateCheck"
          ? [
              event.ownerCurrent,
              event.credentialGeneration,
              event.credentialAuthorized,
              event.expired,
              event.workCurrent,
              event.hasFindings
            ].map(Number)
          : event.kind === "jevRequestReady"
            ? [
                event.rootValid,
                event.configurationValid,
                event.credentialReady,
                event.selected,
                event.currentWork,
                event.physicalAvailable
              ].map(Number)
            : event.kind === "jevRequestSettled"
              ? [
                  Number(event.currentWork),
                  { neverSent: 1, finding: 2, clear: 3, backendFailure: 4, timeout: 5, interrupted: 6 }[
                    event.outcome as "finding"
                  ],
                  0,
                  0,
                  0,
                  0
                ]
              : event.kind === "submissionTerminal"
                ? [Number(event.certain), 0, 0, 0, 0, 0]
                : event.kind === "beginObservedPreparation"
                  ? [event.bytes, 0, 0, 0, 0, 0]
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
                        ? [
                            Number(event.expired),
                            Number(event.stopCollector),
                            Number(event.sameGroup),
                            Number(event.reofferable),
                            0,
                            0
                          ]
                        : [0, 0, 0, 0, 0, 0]
      return [
        eventCodes[frame.event.kind] ?? 99,
        frame.time,
        ...["partition", "lifetime", "round", "operation", "request", "advice", "token"].map(
          (key) =>
            (frame.event as unknown as Record<string, unknown>)[key] ??
            (key === "operation"
              ? event.observation
              : key === "partition"
                ? event.group
                : key === "token"
                  ? event.fingerprint
                  : undefined) ??
            0
        ),
        ...facts,
        frame.after.global.items,
        frame.after.global.bytes,
        frame.after.dispatch.running.length,
        frame.after.dispatch.requests.length,
        frame.after.collection.leases.length,
        Number(!!frame.rejection),
        ...frame.commands.map((command) => {
          if (commandCodes[command.kind] === undefined) throw new Error(`unmapped command ${command.kind}`)
          return commandCodes[command.kind]!
        })
      ]
    })
  })
  expect(nativeTraces).toEqual(traces)
}, 30000)

it.each([
  { currentWork: false, credentialReady: true },
  { currentWork: true, credentialReady: true, credentialGeneration: 2 }
])("retires a stale finding against its actual noninitial lifetime: %j", (environment) => {
  const config = minimal("finding")
  const run = createRun({
    ...config,
    inputs: [{ at: 0, kind: "canonical", event: { kind: "openRound", partition: 1, lifetime: 2 } }, ...config.inputs!]
  })
  for (
    let steps = 0;
    steps < 100 && !run.observations.some((frame) => frame.event.kind === "jevRequestSettled");
    steps++
  )
    run.step()
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  run.applyControl({ kind: "environment", ...environment })
  run.advance({ untilTime: 10 })
  expect(run.projection.pendingFindings).toEqual([])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
  const retirements = run.observations.filter((frame) => frame.event.kind === "retireReview")
  expect(retirements.length).toBeGreaterThan(0)
  for (const frame of retirements) expect(frame.event).toMatchObject({ partition: 1, lifetime: 2, round: 1 })
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
})
