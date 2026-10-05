import { expect, it } from "vitest"
import { createRun, replayRun } from "./index.ts"
const edit = { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], outcome: "finding" as const }
const profile = (outcome: "certain" | "uncertain" | "failed", delayMs = 0, leaseMs = 30) => ({
  outcome,
  delayMs,
  leaseMs
})

it("dispatches review jobs through checked cohorts and new edits reattempt after unavailable credentials", () => {
  const run = createRun({ inputs: [edit], environment: { currentWork: true, credentialReady: false } })
  run.advance({ untilTime: 10 })
  expect(run.projection.dispatch.running).toEqual([])
  expect(
    run.observations.some((frame) => frame.commands.some((command) => command.kind === "jevRequestUnavailable"))
  ).toBe(true)
  run.applyControl({ kind: "environment", currentWork: true, credentialReady: true })
  run.schedule({ ...edit, at: 11 })
  run.advance({ untilTime: 20 })
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.rejection).map((frame) => frame.event.kind)).toEqual([])
})

it("checks stale work at callback settlement without overriding explicitly supplied canonical facts", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 })
  run.advance({ untilTime: 2 })
  run.applyControl({ kind: "environment", currentWork: false, credentialReady: true })
  run.advance({ untilTime: 22 })
  expect(run.projection.pendingFindings).toEqual([])
  const settle = run.observations.find((frame) => frame.event.kind === "jevRequestSettled")!
  expect(settle.event).toMatchObject({ currentWork: false })
  const explicit = createRun({ inputs: [], environment: { currentWork: true, credentialReady: true } })
  explicit.schedule({
    kind: "canonical",
    at: 0,
    event: {
      kind: "jevRequestReady",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 1,
      rootValid: true,
      configurationValid: true,
      credentialReady: false,
      selected: true,
      currentWork: false,
      physicalAvailable: true
    }
  })
  explicit.step()
  expect(explicit.observations[0]!.event).toMatchObject({ currentWork: false, credentialReady: false })
})

it("distinguishes temporary credential unavailability from rotation and changed/unreadable sources at handoff", () => {
  const run = createRun({ inputs: [edit] })
  while (!run.observations.some((frame) => frame.event.kind === "jevRequestSettled")) run.step()
  run.applyControl({ kind: "environment", currentWork: true, credentialReady: false })
  run.advance({ untilTime: 8 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(run.projection.delivery.submissions.batches).toEqual([])
  run.applyControl({ kind: "environment", currentWork: true, credentialReady: true })
  run.advance({ untilTime: 9 })
  expect(run.projection.delivery.submissions.batches[0]?.phase).toBe("submitted")
  run.applyControl({ kind: "environment", currentWork: true, credentialReady: true, credentialGeneration: 2 })
  run.advance({ untilTime: 10 })
  expect(run.projection.pendingFindings).toEqual([])
  for (const facts of [
    { currentWork: false, sourceReadable: true },
    { currentWork: true, sourceReadable: false }
  ]) {
    const changed = createRun({ inputs: [edit] })
    while (!changed.observations.some((frame) => frame.event.kind === "jevRequestSettled")) changed.step()
    changed.applyControl({ kind: "environment", ...facts, credentialReady: true })
    changed.advance({ untilTime: 8 })
    expect(changed.projection.pendingFindings).toEqual([])
    expect(changed.observations.some((frame) => frame.event.kind === "submissionTerminal")).toBe(false)
  }
})

it("preauthorization output failure releases the reservation without claiming submission", () => {
  const run = createRun({ inputs: [edit], outputProfile: profile("failed") })
  run.advance({ untilTime: 10 })
  expect(run.projection.delivery.submissions.batches).toEqual([])
  expect(run.projection.collection.leases).toEqual([])
  expect(run.observations.some((frame) => frame.event.kind === "submissionTerminal")).toBe(false)
  expect(run.observations.some((frame) => frame.event.kind === "submissionRelease")).toBe(true)
  run.applyControl({ kind: "outputProfile", ...profile("certain") })
  run.applyControl({ kind: "environment", currentWork: true, credentialReady: true })
  run.advance({ untilTime: 11 })
  expect(run.projection.delivery.submissions.batches[0]?.phase).toBe("submitted")
})

it.each([profile("uncertain"), profile("certain", 50, 10)])(
  "uncertain/expired background output reoffers once at Stop with the same advice and no second Jev call: %j",
  (outputProfile) => {
    const run = createRun({
      session: { editIntervalMs: 1000, variationMs: 0, editsPerTask: 100 },
      inputs: [edit],
      outputProfile
    })
    run.advance({ untilTime: 18 })
    expect(run.projection.delivery.submissions.batches[0]?.phase).toBe("uncertain")
    run.applyControl({ kind: "outputProfile", ...profile("certain") })
    run.schedule({ kind: "finish", at: 20 })
    run.advance({ untilTime: 21 })
    const submissions = run.observations
      .filter((frame) => frame.event.kind === "submissionTerminal")
      .map((frame) => frame.event)
    expect(submissions).toHaveLength(1)
    expect(submissions[0]).toMatchObject({ certain: false })
    const stopResults = run.observations
      .filter((frame) => frame.event.kind === "finishTerminal")
      .map((frame) => frame.event)
    expect(stopResults).toHaveLength(1)
    expect(stopResults[0]).toMatchObject({
      outcome: "acknowledged",
      selected: [(submissions[0] as { advice: number }).advice]
    })
    run.schedule({ kind: "finish", at: 22 })
    run.advance({ untilTime: 60 })
    expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(1)
    expect(run.observations.filter((frame) => frame.event.kind === "finishTerminal")).toHaveLength(1)
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
    expect(run.observations.filter((frame) => frame.rejection).map((frame) => frame.event.kind)).toEqual([])
    const replay = replayRun(run.exportReplay())
    replay.advance({ untilTime: 60 })
    expect(replay.observations).toEqual(run.observations)
  }
)

it.each([
  { currentWork: false, credentialReady: true },
  { currentWork: true, credentialReady: false }
])("Stop revalidates uncertain background advice against changed authority %j", (environment) => {
  const run = createRun({
    inputs: [edit],
    session: { editIntervalMs: 1000, editsPerTask: 100 },
    outputProfile: profile("uncertain")
  })
  run.advance({ untilTime: 10 })
  run.applyControl({ kind: "environment", ...environment })
  run.schedule({ kind: "finish", at: 11 })
  run.advance({ untilTime: 12 })
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(1)
  expect(run.observations.some((frame) => frame.event.kind === "finishAuthorize")).toBe(false)
})

it("credential rotation during an in-flight request cannot relabel its eventual finding", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 })
  run.advance({ untilTime: 2 })
  run.applyControl({ kind: "environment", currentWork: true, credentialReady: true, credentialGeneration: 2 })
  run.advance({ untilTime: 23 })
  expect(run.observations.some((frame) => frame.commands.some((command) => command.kind === "retainFinding"))).toBe(
    true
  )
  expect(run.projection.pendingFindings).toEqual([])
  expect(run.observations.some((frame) => frame.event.kind === "submissionTerminal")).toBe(false)
})
