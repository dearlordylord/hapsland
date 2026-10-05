import { describe, expect, it } from "vitest"
import {
  createRun,
  restoreReplay,
  projectAgent,
  DEFAULT_FILE_TREE_PROFILE,
  type Observation,
  type Run
} from "./index.ts"

import { runWorkloadNative } from "../../monkey-business-bend/conformance/workload-native-runner.mjs"

const opaqueAdvicees = ["runtime/subagent:7", "unrelated:session/2"] as const
const contentionConfig = {
  seed: 7,
  retention: 10000,
  outcome: "clear" as const,
  jevDelay: 20,
  preparationDelay: 2,
  sessions: opaqueAdvicees.map((agent, index) => ({
    agent,
    seed: index + 11,
    editIntervalMs: 1000000,
    variationMs: 0,
    editsPerTask: 1000,
    bytes: index ? 20 : 10,
    unitBytes: [index ? 7 : 5]
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
  },
  inputs: [
    ...Array.from({ length: 9 }, (_, index) => ({
      at: 0,
      kind: "edit" as const,
      agent: opaqueAdvicees[index % 2]!,
      revision: index + 1,
      generation: 0,
      recurring: false,
      bytes: index % 2 ? 20 : 10,
      unitBytes: [index % 2 ? 7 : 5],
      outcome: index === 0 ? ("interrupted" as const) : ("clear" as const)
    })),
    ...opaqueAdvicees.map((agent, index) => ({
      at: 30,
      kind: "edit" as const,
      agent,
      revision: 10 + index,
      generation: 0,
      recurring: false,
      bytes: index ? 20 : 10,
      unitBytes: [index ? 7 : 5],
      outcome: "clear" as const
    }))
  ]
}

it("attributes contention, interruption, refusal and recovery to opaque advicees in one resident", () => {
  const run = createRun(contentionConfig)
  run.advance({ untilTime: 5, maxEvents: 2000 })
  expect(run.agentScopes.map((scope) => scope.agent)).toEqual(opaqueAdvicees)
  expect(run.projection.dispatch.requests).toHaveLength(8)
  expect(run.projection.global).toEqual({ items: 8, bytes: 48 })
  expect(
    run.projection.partitions.map((scope) => [scope.partition, scope.items, scope.bytes]).sort((a, b) => a[0]! - b[0]!)
  ).toEqual([
    [1, 4, 20],
    [2, 4, 28]
  ])
  const refused = run.observations.filter((frame) =>
    frame.commands.some((command) => command.kind === "jevRequestUnavailable")
  )
  expect(refused).toHaveLength(1)
  expect(refused[0]).toMatchObject({ partition: 1, agent: opaqueAdvicees[0], time: 4 })
  expect(
    Math.max(...run.observations.map((frame) => frame.after.dispatch.running.filter((item) => item.preparation).length))
  ).toBe(8)
  run.advance({ untilTime: 25, maxEvents: 2000 })
  const interrupted = run.observations.filter((frame) => frame.event.kind === "jevRequestInterrupted")
  expect(interrupted).toHaveLength(1)
  expect(interrupted[0]).toMatchObject({ partition: 1, agent: opaqueAdvicees[0], time: 22 })
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  expect(run.projection.dispatch.requests).toEqual([])
  run.applyControl({ kind: "jevProfile", delayMs: 5, outcome: "clear" })
  run.applyControl({ kind: "suspendArrivals", agent: opaqueAdvicees[0], suspended: true })
  const endpoint = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(endpoint.observe()).toEqual(run.observe())
  expect(endpoint.exportReplay()).toEqual(run.exportReplay())
  for (const candidate of [run, endpoint]) candidate.advance({ untilTime: 40, maxEvents: 1000 })
  const healthy = run.observations.filter((frame) => frame.event.kind === "jevRequestSettled" && frame.time > 25)
  expect(healthy.map((frame) => [frame.time, frame.partition])).toEqual([
    [37, 1],
    [37, 2]
  ])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  expect(run.projection.dispatch.running).toEqual([])
  expect(run.projection.dispatch.requests).toEqual([])
  expect(endpoint.observe()).toEqual(run.observe())
  for (const frame of run.observations) {
    expect(frame.after.dispatch.requests.length).toBeLessThanOrEqual(8)
    expect(frame.after.global.bytes).toBe(frame.after.partitions.reduce((sum, owner) => sum + owner.bytes, 0))
    const local = projectAgent(frame.after, frame.partition ?? 0)
    expect(local.global).toEqual(frame.after.global)
    if (frame.partition !== undefined) expect(local.work.every((work) => work.partition === frame.partition)).toBe(true)
  }
})

const residentEventCodes: Record<string, number> = {
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
  jevRequestInterrupted: 25,
  stopPolled: 26
}
const residentCommandCodes: Record<string, number> = {
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
  submissionForgotten: 28,
  jevRequestUnavailable: 29,
  jevInterruptionRecorded: 30,
  jevObservationIgnored: 31,
  finishReady: 32,
  cancelWork: 33
}
const residentGraphCodes: Record<string, number> = {
  none: 0,
  resolveEdge: 1,
  checkPath: 2,
  readSource: 3,
  unitComplete: 4
}
function residentRow(frame: Observation): number[] {
  const p = frame.after
  const counts = [
    p.global.items,
    p.global.bytes,
    ...[1, 2].flatMap((owner) => {
      const usage = p.partitions.find((item) => item.partition === owner)
      return [usage?.items ?? 0, usage?.bytes ?? 0]
    }),
    p.dispatch.running.filter((item) => item.preparation).length,
    p.dispatch.requests.length
  ]
  if (frame.preparation) {
    const { after, command, event } = frame.preparation
    return [
      21,
      frame.time,
      frame.partition ?? 0,
      event.operation,
      21,
      0,
      residentGraphCodes[command.kind] ?? 99,
      after.files,
      after.readBytes,
      after.treeBytes,
      ...counts
    ]
  }
  const event = frame.event as unknown as Record<string, unknown>
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
  const facts =
    event.kind === "stopPolled"
      ? [Number(event.deadline), 0, 0, 0, 0, 0]
      : event.kind === "finalCandidateCheck"
        ? [
            event.ownerCurrent,
            event.credentialGeneration,
            event.credentialAuthorized,
            event.expired,
            event.workCurrent,
            event.hasFindings
          ].map(Number)
        : event.kind === "submissionTerminal"
          ? [Number(event.certain), 0, 0, 0, 0, 0]
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
                        event.outcome as "clear"
                      ],
                      0,
                      0,
                      0,
                      0
                    ]
                  : event.kind === "beginObservedPreparation"
                    ? [Number(event.bytes), 0, 0, 0, 0, 0]
                    : event.kind === "preparationCompleted"
                      ? [(event.unitBytes as number[]).length, (event.unitBytes as number[])[0] ?? 0, 0, 0, 0, 0]
                      : [0, 0, 0, 0, 0, 0]
  const commands = frame.commands.flatMap((command, index) => {
    const value = command as unknown as Record<string, unknown>
    const id = ["roundStarted", "observationAdmitted", "preparationReleased", "reservationReleased"].includes(
      command.kind
    )
      ? value.id
      : ["dispatchStarted", "prepare", "unitAdmitted", "cancelWork"].includes(command.kind)
        ? value.operation
        : command.kind === "jevRequestIssued"
          ? value.request
          : 0
    if (residentCommandCodes[command.kind] === undefined) throw new Error(`Unmapped resident command ${command.kind}`)
    return [residentCommandCodes[command.kind]!, frame.commandScopes?.[index] ?? 0, Number(id ?? 0)]
  })
  return [
    residentEventCodes[frame.event.kind] ?? 99,
    frame.time,
    frame.partition ?? 0,
    ...identity,
    ...facts,
    ...counts,
    Number(!!frame.rejection),
    ...commands
  ]
}

const residentDiagnostics = process.env.HAPSLAND_RESIDENT_DIAGNOSTICS === "1"
function residentCheckpoint(stage: string) {
  if (residentDiagnostics) console.error(`[shared-resident] ${stage}`)
}
function advanceResident(run: Run, untilTime: number, fuel: number, stage: string) {
  // The two finite original workloads must quiesce before their passive million-
  // millisecond arrivals. A cycle is a failure, not another scheduling opportunity.
  for (let index = 0; index < fuel; index++) {
    residentCheckpoint(`${stage} before step ${index} count=${run.eventCount} clock=${run.now}`)
    const result = run.advance({ untilTime, maxEvents: 1 })
    residentCheckpoint(
      `${stage} after step ${index} reason=${result.reason} event=${run.observations.at(-1)?.event.kind}`
    )
    if (result.reason !== "eventLimit") return
  }
  throw new Error(`${stage} did not quiesce within ${fuel} events; last=${run.observations.at(-1)?.event.kind}`)
}

it("compares original shared contention and recovery inputs with the compiled native resident", () => {
  residentCheckpoint("native start")
  const rows = runWorkloadNative(
    new URL("../../monkey-business-bend/conformance/shared-resident.bend", import.meta.url),
    process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST ? {} : { emissionTimeoutMs: 90000, clangTimeoutMs: 120000 }
  ) as number[][]
  residentCheckpoint(`native contention complete rows=${rows.length}`)
  expect(rows.slice(3).some((row) => [97, 98, 99].includes(row[0]!))).toBe(false)
  expect(rows.length).toBeLessThan(250)
  expect(rows.slice(0, 3)).toEqual([
    [90, 4294967313, 1, 11],
    [90, 99, 2, 12],
    [91, 0, 4294967313, 1, 11]
  ])
  const native = rows.slice(3)
  const run = createRun(contentionConfig)
  advanceResident(run, 25, 250, "contention initial")
  const boundary = run.now
  const before = run.observations.map(residentRow)
  run.applyControl({ kind: "jevProfile", delayMs: 5, outcome: "clear" })
  run.applyControl({ kind: "suspendArrivals", agent: opaqueAdvicees[0], suspended: true })
  residentCheckpoint("contention restore start")
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  residentCheckpoint("contention restore complete")
  advanceResident(run, 40, 80, "contention recovery")
  advanceResident(restored, 40, 80, "contention restored recovery")
  expect(restored.observe()).toEqual(run.observe())
  expect(native).toEqual([...before, [80, boundary, 5], ...run.observations.slice(before.length).map(residentRow)])
  expect(native.some((row) => [97, 98, 99].includes(row[0]!))).toBe(false)
  const canonical = native.filter((row) => row[0] !== 21 && row[0] !== 80)
  expect(Math.max(...canonical.map((row) => row[22]!))).toBe(8)
  expect(Math.max(...canonical.map((row) => row[23]!))).toBe(8)
  expect(
    canonical
      .filter((row) => row.slice(25).some((code, index) => index % 3 === 0 && code === 29))
      .map((row) => [row[1], row[2]])
  ).toEqual([[4, 1]])
  expect(canonical.filter((row) => row[0] === 25).map((row) => [row[1], row[2]])).toEqual([[22, 1]])
  expect(canonical.filter((row) => row[0] === 12 && row[1]! > 25).map((row) => [row[1], row[2]])).toEqual([
    [37, 1],
    [37, 2]
  ])
  expect(canonical.at(-1)!.slice(16, 24)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  const graph = native.filter((row) => row[0] === 21)
  expect(graph).toHaveLength(22)
  for (const row of graph) expect(row.slice(7, 10)).toEqual([1, 100, 20])
}, 250000)

function originalCancellation(): Run {
  residentCheckpoint("cancellation create start")
  const cancellation = createRun({
    ...contentionConfig,
    inputs: [
      {
        at: 0,
        kind: "edit",
        agent: opaqueAdvicees[0],
        revision: 1,
        generation: 0,
        recurring: false,
        bytes: 10,
        unitBytes: [5],
        outcome: "clear"
      },
      {
        at: 0,
        kind: "edit",
        agent: opaqueAdvicees[1],
        revision: 2,
        generation: 0,
        recurring: false,
        bytes: 20,
        unitBytes: [7],
        outcome: "finding"
      },
      { at: 5, kind: "canonical", event: { kind: "stopPolled", partition: 1, lifetime: 1, round: 1, deadline: true } }
    ]
  })
  residentCheckpoint("cancellation create complete")
  advanceResident(cancellation, 5, 64, "cancellation initial")
  const deadline = cancellation.observations.find((frame) => frame.event.kind === "stopPolled")!
  expect(deadline.event).toEqual({ kind: "stopPolled", partition: 1, lifetime: 1, round: 1, deadline: true })
  expect(deadline.partition).toBe(1)
  expect(deadline.agent).toBe(opaqueAdvicees[0])
  const firstRequest = deadline.before.dispatch.requests.find((request) => request.partition === 1)!
  expect(deadline.commands.filter((command) => command.kind === "cancelWork")).toEqual([
    { kind: "cancelWork", operation: firstRequest.operation }
  ])
  expect(deadline.after.global).toEqual({ items: 1, bytes: 7 })
  expect(deadline.after.partitions.find((owner) => owner.partition === 1)?.items ?? 0).toBe(0)
  expect(deadline.after.partitions.find((owner) => owner.partition === 2)).toMatchObject({ items: 1, bytes: 7 })
  for (let index = 0; index < deadline.commands.length; index++) expect(deadline.commandScopes?.[index]).toBe(1)
  residentCheckpoint("cancellation restore start")
  const cancellationReplay = restoreReplay(JSON.parse(JSON.stringify(cancellation.exportReplay())))
  residentCheckpoint("cancellation restore complete")
  expect(cancellationReplay.observe()).toEqual(cancellation.observe())
  advanceResident(cancellation, 40, 64, "cancellation settle")
  advanceResident(cancellationReplay, 40, 64, "cancellation restored settle")
  expect(cancellationReplay.observe()).toEqual(cancellation.observe())
  const ignored = cancellation.observations.filter((frame) =>
    frame.commands.some((command) => command.kind === "jevObservationIgnored")
  )
  expect(ignored).toHaveLength(1)
  expect(ignored[0]!.event).toMatchObject({
    kind: "jevRequestSettled",
    partition: 1,
    lifetime: 1,
    round: 1,
    operation: firstRequest.operation,
    request: firstRequest.request
  })
  const ready = cancellation.observations.filter((frame) => frame.event.kind === "collectionReady")
  expect(ready).toHaveLength(1)
  expect(ready[0]).toMatchObject({ partition: 2, agent: opaqueAdvicees[1], time: 22 })
  const output = cancellation.observations.filter((frame) => frame.event.kind === "submissionTerminal")
  expect(output).toHaveLength(1)
  expect(output[0]).toMatchObject({ partition: 2, agent: opaqueAdvicees[1], time: 22 })
  // The unaffected current finding retains its charge after submission. Delivery
  // releases its lease; cancellation must not retire the other advicee's advice.
  expect(cancellation.projection.global).toEqual({ items: 1, bytes: 7 })
  expect(cancellation.projection.partitions.find((owner) => owner.partition === 1)?.items ?? 0).toBe(0)
  expect(cancellation.projection.partitions.find((owner) => owner.partition === 2)).toMatchObject({
    items: 1,
    bytes: 7
  })
  expect(cancellation.projection.pendingFindings).toHaveLength(1)
  const unaffectedRequest = deadline.before.dispatch.requests.find((request) => request.partition === 2)!
  expect(cancellation.projection.pendingFindings[0]).toEqual({ operation: unaffectedRequest.operation, count: 1 })
  expect(cancellation.projection.work.find((work) => work.operation === unaffectedRequest.operation)).toMatchObject({
    partition: 2,
    lifetime: 1,
    round: 2,
    kind: "pendingFinding"
  })
  expect(cancellation.projection.charges).toHaveLength(1)
  expect(cancellation.projection.charges[0]).toMatchObject({ partition: 2, bytes: 7 })
  expect(cancellation.projection.collection.leases).toEqual([])
  expect(cancellation.projection.delivery.submissions.batches).toHaveLength(1)
  expect(cancellation.projection.delivery.submissions.batches[0]).toMatchObject({
    advice: unaffectedRequest.operation,
    group: 2,
    round: 2,
    phase: "submitted",
    fingerprints: [unaffectedRequest.operation],
    units: [unaffectedRequest.operation]
  })
  expect(cancellation.projection.dispatch.running).toEqual([])
  expect(cancellation.projection.dispatch.requests).toEqual([])

  return cancellation
}

it("cancels one original advicee request while the other delivers, including ordinary endpoint replay", () => {
  originalCancellation()
})

it("compares original advicee cancellation with the compiled native shared driver", () => {
  residentCheckpoint("native cancellation start")
  const canceled = runWorkloadNative(
    new URL("../../monkey-business-bend/conformance/shared-resident-cancellation.bend", import.meta.url),
    process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST ? {} : { emissionTimeoutMs: 90000, clangTimeoutMs: 120000 }
  ) as number[][]
  residentCheckpoint(`native cancellation complete rows=${canceled.length}`)
  expect(canceled.some((row) => [97, 98, 99].includes(row[0]!))).toBe(false)
  expect(canceled.length).toBeLessThan(80)
  expect(canceled.at(-1)!.slice(16, 24)).toEqual([1, 7, 0, 0, 1, 7, 0, 0])
  expect(canceled).toEqual(originalCancellation().observations.map(residentRow))
}, 250000)

const config = {
  seed: 7,
  sessions: [
    { agent: "alpha", seed: 11, editIntervalMs: 10, variationMs: 0, editsPerTask: 1000, bytes: 10, unitBytes: [5] },
    { agent: "beta", seed: 29, editIntervalMs: 10, variationMs: 0, editsPerTask: 1000, bytes: 10, unitBytes: [5] }
  ],
  limits: { globalItems: 128, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 },
  fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 1, maxFiles: 1, maxImports: 0 },
  outcome: "clear" as const,
  jevDelay: 1000,
  retention: 10000
}

describe("one resident with independent agent generators", () => {
  it("applies a generator control only to its owner and restores the entire resident deterministically", () => {
    const run = createRun(config)
    run.advance({ untilTime: 80, maxEvents: 10000 })
    run.applyControl({ kind: "editPace", intervalMs: 731, agent: "alpha" })
    run.advance({ untilTime: 200, maxEvents: 10000 })
    const edits = run.observations.filter((frame) => frame.event.kind === "admitObservation" && frame.time > 80)
    expect(edits.some((frame) => frame.agent === "beta")).toBe(true)
    expect(edits.some((frame) => frame.agent === "alpha")).toBe(false)
    const replay = run.exportReplay()
    const restored = restoreReplay(replay)
    expect(restored.projection).toEqual(run.projection)
    expect(restored.observations).toEqual(run.observations)
    expect(restored.agentScopes).toEqual(run.agentScopes)
    expect(restored.exportReplay()).toEqual(replay)
    const alpha = projectAgent(run.projection, 1)
    const beta = projectAgent(run.projection, 2)
    expect(alpha.global).toEqual(beta.global)
    expect(alpha.global).toEqual(run.projection.global)
    expect(alpha.work.every((item) => item.partition === 1)).toBe(true)
    expect(beta.work.every((item) => item.partition === 2)).toBe(true)
    expect(alpha.dispatch.requests.length + beta.dispatch.requests.length).toBe(run.projection.dispatch.requests.length)
    expect(() => run.applyControl({ kind: "burst", count: 1, agent: "missing" })).toThrow("unknown agent")
    expect(() => run.applyControl({ kind: "jevProfile", delayMs: 1, agent: "alpha" })).toThrow("resident controls")
  })

  it("uses one global capacity budget instead of multiplying it by the agent count", () => {
    const run = createRun({ ...config, limits: { ...config.limits, globalItems: 4 } })
    run.advance({ untilTime: 100, maxEvents: 10000 })
    expect(
      run.observations.some((frame) =>
        frame.commands.some((command) => command.kind === "preparationRefused" || command.kind === "unitRefused")
      )
    ).toBe(true)
    expect(Math.max(...run.observations.map((frame) => frame.after.global.items))).toBeLessThanOrEqual(4)
    expect(new Set(run.observations.map((frame) => frame.partition))).toEqual(new Set([1, 2]))
  })
})
