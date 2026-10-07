import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { createRun, restoreReplay } from "./index.ts"
import { SharedCore } from "./shared-core.ts"
import { decodeDriver } from "./driver-codec.ts"
import { readBool, readRecord } from "../../../src/canonical/boundary-schema.ts"

const limits = { globalItems: 128, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 }
const plan = (core: SharedCore, partition: number, lifetime = 1) => {
  const value = readRecord(core.edit(partition, lifetime))
  return { retry: readBool(value.retry), actions: decodeDriver({ handled: true, actions: value.actions }).actions }
}

it("exposes an open-but-not-admitted checkpoint and deduplicates same-time competing edits", () => {
  const run = createRun({
    inputs: [10, 20].map((bytes) => ({ at: 0, kind: "edit" as const, bytes, unitBytes: [bytes] })),
    preparationDelay: 2,
    outcome: "clear"
  })
  expect(run.step(0)?.event.kind).toBe("openRound")
  expect(run.projection.rounds).toHaveLength(1)
  expect(run.projection.work).toHaveLength(0)
  expect(run.runtimeSnapshot().queue.filter((item) => item.input.kind === "edit")).toHaveLength(2)
  const restored = restoreReplay(run.exportReplay())
  expect(restored.runtimeSnapshot()).toEqual(run.runtimeSnapshot())
  run.advance({ untilTime: 0, maxEvents: 30 })
  expect(run.observations.filter((frame) => frame.event.kind === "openRound")).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.event.kind === "admitObservation")).toHaveLength(2)
  expect(
    run.observations.filter((frame) => frame.event.kind === "admitObservation").map((frame) => frame.time)
  ).toEqual([0, 0])
  expect(new Set(run.runtimeSnapshot().jobs.map(([, job]) => job.driverSourceJob?.bytes))).toEqual(new Set([10, 20]))
})

it("invalidates the captured edit at the opening boundary before observation admission", () => {
  const run = createRun({ inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }] })
  expect(run.step(0)?.event.kind).toBe("openRound")
  run.applyControl({ kind: "adviceeLifecycle", agent: "agent-1", action: "disconnect" })
  run.advance({ untilTime: 0, maxEvents: 30 })
  expect(run.observations.filter((frame) => frame.event.kind === "admitObservation")).toHaveLength(0)
  expect(restoreReplay(run.exportReplay()).runtimeSnapshot()).toEqual(run.runtimeSnapshot())
})

it("retains a pending marker after round-limit rejection, so 16 more attempts request retry without opening", () => {
  const core = new SharedCore(limits)
  for (let partition = 1; partition <= 64; partition++)
    expect(core.step({ kind: "openRound", partition, lifetime: 1 }).rejection).toBeUndefined()
  expect(plan(core, 65)).toMatchObject({ retry: true, actions: [{ event: { kind: "openRound", partition: 65 } }] })
  expect(core.step({ kind: "openRound", partition: 65, lifetime: 1 }).rejection).toBe("RoundLimit")
  for (let attempt = 0; attempt < 16; attempt++) expect(plan(core, 65)).toEqual({ retry: true, actions: [] })
})

it("native pending-opening bookkeeping has independently expected issued, deduplicated and consumed counts", () => {
  const native = spawnSync("bend", [fileURLToPath(new URL("../conformance/edit-opening.bend", import.meta.url))], {
    encoding: "utf8",
    timeout: 5000
  })
  expect(native.error).toBeUndefined()
  expect(native.status, native.stdout + native.stderr).toBe(0)
  expect(native.stdout.trim()).toBe("[1n, 1n, 0n, 1n, 0n]")
})
