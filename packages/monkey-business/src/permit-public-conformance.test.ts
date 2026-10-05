import { beforeAll, expect, it } from "vitest"
import { createRun, restoreReplay, type CanonicalEvent, type RunInput } from "./index.ts"
import {
  runWorkloadNative,
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"

const cases = [
  { outcome: "success", delay: 9, terminal: [0, 0, 1, 0, 0] },
  { outcome: "success", delay: 10, terminal: [0, 0, 1, 0, 0] },
  { outcome: "success", delay: 11, terminal: [1, 0, 0, 0, 0] },
  { outcome: "failure", delay: 5, terminal: [0, 0, 0, 0, 0] },
  { outcome: "duplicate", delay: 5, terminal: [1, 0, 1, 0, 0] },
  { outcome: "absent", delay: 0, terminal: [0, 0, 0, 0, 0] }
] as const
let native: unknown
beforeAll(() => {
  native = runWorkloadNative(new URL("../../monkey-business-bend/conformance/permit-scenario.bend", import.meta.url))
}, WORKLOAD_CONFORMANCE_TIMEOUT_MS)

// Original source-free PRE/POST facts, independent of the new Bend fact generator.
const inputs = (outcome: (typeof cases)[number]["outcome"], delay: number): RunInput[] => {
  const scope = { partition: 1, lifetime: 1, token: 1 }
  const event = (at: number, event: CanonicalEvent): RunInput => ({ at, kind: "canonical", event })
  const result = [
    event(1, {
      kind: "issuePermit",
      partition: 1,
      lifetime: 1,
      tool: 7,
      started: 1,
      deadline: 11,
      now: 1,
      minimumStarted: 0,
      facts: {
        clockValid: true,
        hookWindow: 10,
        startedUpper: 1,
        nowLower: 1,
        adviceePermitLimit: 32,
        residentPermitLimit: 4096
      }
    })
  ]
  if (outcome === "absent" || delay > 10)
    result.push(event(11, { kind: "expirePermit", ...scope, deadlineReached: true }))
  if (outcome === "failure") result.push(event(1 + delay, { kind: "releasePermit", ...scope }))
  else if (outcome !== "absent") {
    result.push(event(1 + delay, { kind: "consumePermit", ...scope, tool: 7, now: 1 + delay }))
    if (outcome === "duplicate")
      result.push(event(1 + delay, { kind: "consumePermit", ...scope, tool: 7, now: 1 + delay }))
  }
  return result
}
it("agrees across native original permit generation and the public JS/replay boundary", () => {
  const observed = cases.map(({ outcome, delay, terminal }) => {
    const run = createRun({ inputs: inputs(outcome, delay) })
    run.advance({ maxEvents: 20 })
    const rows = run.observations.map((frame) => [
      frame.rejection ? 1 : 0,
      frame.after.admissions.reduce((count, admission) => count + admission.permits.length, 0),
      frame.after.rounds.length,
      frame.after.work.length,
      frame.after.global.items
    ])
    expect(rows[0]).toEqual([0, 1, 0, 0, 0]) // PRE alone reserves no round or review-data charge.
    expect(rows.at(-1)).toEqual(terminal)
    expect(run.observations.flatMap((frame) => frame.effects).filter((effect) => effect.kind === "output")).toEqual([])
    expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
    return rows
  })
  expect(native).toEqual(observed)
})
it("closed-round authority stays closed after its delayed POST", () => {
  const original = inputs("success", 1)
  original.push(
    {
      at: 3,
      kind: "canonical",
      event: {
        kind: "issuePermit",
        partition: 1,
        lifetime: 1,
        tool: 8,
        started: 3,
        deadline: 13,
        now: 3,
        minimumStarted: 0,
        facts: {
          clockValid: true,
          hookWindow: 10,
          startedUpper: 3,
          nowLower: 3,
          adviceePermitLimit: 32,
          residentPermitLimit: 4096
        }
      }
    },
    { at: 4, kind: "canonical", event: { kind: "closePermitRound", partition: 1, lifetime: 1, round: 1, at: 4 } },
    { at: 4, kind: "canonical", event: { kind: "retirePartition", partition: 1, lifetime: 1, round: 1 } },
    {
      at: 13,
      kind: "canonical",
      event: { kind: "consumePermit", partition: 1, lifetime: 1, token: 2, tool: 8, now: 13 }
    }
  )
  const run = createRun({ inputs: original })
  run.advance({ maxEvents: 20 })
  expect(run.projection.rounds).toEqual([])
  expect(run.projection.admissions.flatMap((admission) => admission.permits)).toEqual([])
  expect(run.observations.at(-1)?.rejection).toBeDefined()
  expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations)
})
it("keeps per-advicee and resident permit ceilings separate and releases each token once", () => {
  const issue = (partition: number, tool: number, at = 1): RunInput => ({
    at,
    kind: "canonical",
    event: {
      kind: "issuePermit",
      partition,
      lifetime: 1,
      tool,
      started: at,
      deadline: at + 10,
      now: at,
      minimumStarted: 0,
      facts: {
        clockValid: true,
        hookWindow: 10,
        startedUpper: at,
        nowLower: at,
        adviceePermitLimit: 1,
        residentPermitLimit: 2
      }
    }
  })
  const release: RunInput = {
    at: 2,
    kind: "canonical",
    event: { kind: "releasePermit", partition: 1, lifetime: 1, token: 1 }
  }
  const run = createRun({
    inputs: [issue(1, 1), issue(1, 2), issue(2, 3), issue(3, 4), release, release, issue(3, 5, 3)]
  })
  run.advance({ maxEvents: 20 })
  const rows = run.observations.map((frame) => [
    frame.rejection ? 1 : 0,
    frame.after.admissions.reduce((count, admission) => count + admission.permits.length, 0)
  ])
  // A second release is forbidden; it cannot create phantom capacity.
  expect(rows).toEqual([
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
    [0, 1],
    [1, 1],
    [0, 2]
  ])
  expect(run.projection.admissions.find((admission) => admission.partition === 1)?.permits).toEqual([])
  expect(run.projection.admissions.find((admission) => admission.partition === 2)?.permits).toHaveLength(1)
  expect(run.projection.admissions.find((admission) => admission.partition === 3)?.permits).toHaveLength(1)
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations)
})
