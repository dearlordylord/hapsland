import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { DirectAdvicee } from "../direct-event/observation.ts"
import { readActivity, formatActivityHuman, recordActivity, recordRoundClosure, type ActivityStage } from "./status.ts"

const roots: Array<string> = []
const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "resident-activity-"))
  roots.push(root)
  return root
}
const advicee = (sessionId: string, toolUseId: string, subagentId: string | null = null): DirectAdvicee => ({
  host: "codex-cli",
  hostVersion: "0.155.1",
  sessionId,
  turnId: `turn-${toolUseId}`,
  toolUseId,
  subagentId
})

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("resident activity status", () => {
  it("distinguishes every production stage, submission, and absent model-reaction evidence", () => {
    const statePath = makeRoot()
    const root = "/synthetic/repository"
    const lifetime = "resident-a"
    const stages: ReadonlyArray<ActivityStage> = [
      "skipped",
      "pending",
      "clear",
      "findings",
      "unavailable",
      "incomplete"
    ]
    for (const [index, stage] of stages.entries()) {
      recordActivity({
        statePath,
        root,
        advicee: advicee("session", `event-${stage}`, index === 0 ? "child-a" : null),
        lifetime,
        stage,
        findings: stage === "findings" ? 2 : 0,
        now: 100 + index
      })
    }
    const submitted = advicee("session", "event-submitted")
    recordActivity({ statePath, root, advicee: submitted, lifetime, stage: "findings", findings: 1, now: 200 })
    recordActivity({
      statePath,
      root,
      advicee: submitted,
      lifetime,
      stage: "submitted",
      submittedFindings: 1,
      now: 201
    })

    const status = readActivity({ statePath, root, sessionId: "session", resident: { available: true, lifetime } })
    expect(status).toMatchObject({
      kind: "incomplete",
      observed: true,
      source: "resident-v1",
      findings: 3,
      counts: {
        skipped: 1,
        pending: 1,
        clear: 1,
        findings: 2,
        submitted: 1,
        unavailable: 1,
        incomplete: 1,
        "restarted/lost": 0
      },
      modelReaction: { status: "unavailable", reason: "host-model-reaction-not-instrumented" },
      submission: { status: "submitted", findings: 1 }
    })
    expect(status.children).toHaveLength(2)
    expect(status.children.map((child) => child.identity).sort()).toEqual(["child", "root"])
  })

  it("reports pending work as restarted/lost when its resident lifetime disappears or changes", () => {
    const statePath = makeRoot()
    const root = "/synthetic/repository"
    recordActivity({
      statePath,
      root,
      advicee: advicee("restart-session", "event"),
      lifetime: "resident-before-restart",
      stage: "pending"
    })
    expect(
      readActivity({
        statePath,
        root,
        sessionId: "restart-session",
        resident: { available: true, lifetime: "resident-before-restart" }
      }).kind
    ).toBe("pending")
    expect(
      readActivity({
        statePath,
        root,
        sessionId: "restart-session",
        resident: { available: true, lifetime: "resident-after-restart" }
      }).kind
    ).toBe("restarted/lost")
    expect(readActivity({ statePath, root, sessionId: "restart-session", resident: { available: false } }).kind).toBe(
      "restarted/lost"
    )
  })

  it("keeps submission separate from pending work and sums unique unit findings", () => {
    const statePath = makeRoot()
    const root = "/synthetic/repository"
    const event = advicee("multi-session", "event")
    recordActivity({
      statePath,
      root,
      advicee: event,
      lifetime: "resident",
      stage: "pending",
      expectedUnitIdentities: ["unit-a", "unit-b"]
    })
    recordActivity({
      statePath,
      root,
      advicee: event,
      lifetime: "resident",
      stage: "findings",
      findings: 2,
      unitIdentity: "unit-a"
    })
    recordActivity({ statePath, root, advicee: event, lifetime: "resident", stage: "submitted", submittedFindings: 4 })
    expect(
      readActivity({ statePath, root, sessionId: "multi-session", resident: { available: true, lifetime: "resident" } })
    ).toMatchObject({ kind: "pending", submission: { status: "submitted", findings: 4 } })

    // A retry for the same semantic unit is idempotent; the second unit adds.
    recordActivity({
      statePath,
      root,
      advicee: event,
      lifetime: "resident",
      stage: "findings",
      findings: 2,
      unitIdentity: "unit-a"
    })
    recordActivity({
      statePath,
      root,
      advicee: event,
      lifetime: "resident",
      stage: "findings",
      findings: 3,
      unitIdentity: "unit-b"
    })
    expect(
      readActivity({ statePath, root, sessionId: "multi-session", resident: { available: true, lifetime: "resident" } })
    ).toMatchObject({ kind: "submitted", findings: 5, submission: { findings: 4 } })
  })

  it("retains concurrent markers from separate hook processes without lost updates", async () => {
    const statePath = makeRoot()
    const root = "/synthetic/repository"
    const event = advicee("concurrent-session", "event")
    const units = Array.from({ length: 12 }, (_, index) => `unit-${index}`)
    recordActivity({
      statePath,
      root,
      advicee: event,
      lifetime: "resident",
      stage: "pending",
      expectedUnitIdentities: units
    })
    const modulePath = resolve("src/activity/status.ts")
    await Promise.all(
      units.map(
        (unitIdentity) =>
          new Promise<void>((resolveChild, rejectChild) => {
            const child = spawn(
              process.execPath,
              [
                "--input-type=module",
                "-e",
                `
        import { recordActivity } from ${JSON.stringify(modulePath)};
        recordActivity(JSON.parse(process.env.ACTIVITY_INPUT));
      `
              ],
              {
                cwd: process.cwd(),
                env: {
                  ...process.env,
                  ACTIVITY_INPUT: JSON.stringify({
                    statePath,
                    root,
                    advicee: event,
                    lifetime: "resident",
                    stage: "findings",
                    findings: 1,
                    unitIdentity
                  })
                },
                stdio: "ignore"
              }
            )
            child.once("error", rejectChild)
            child.once("close", (code) =>
              code === 0 ? resolveChild() : rejectChild(new Error(`marker child exited ${code}`))
            )
          })
      )
    )
    expect(
      readActivity({
        statePath,
        root,
        sessionId: "concurrent-session",
        resident: { available: true, lifetime: "resident" }
      })
    ).toMatchObject({ kind: "findings", findings: units.length })
  })
})

it("reports malformed persisted marker fields without presenting healthy activity", () => {
  const statePath = makeRoot()
  const root = "/synthetic/repository"
  recordActivity({ statePath, root, advicee: advicee("malformed", "event"), lifetime: "resident", stage: "clear" })
  const directory = join(statePath, readdirSync(statePath)[0]!)
  const file = join(directory, readdirSync(directory)[0]!)
  const marker = JSON.parse(readFileSync(file, "utf8"))
  const patches = [
    { version: 2 },
    { sessionKey: "bad" },
    { childKey: "bad" },
    { repositoryKey: "bad" },
    { eventKey: "bad" },
    { lifetime: "" },
    { lifetime: "x".repeat(513) },
    { observedAt: -1 },
    { observedAt: 0.5 },
    { observedAt: 2 ** 53 },
    { findings: -1 },
    { findings: 65_537 },
    { kind: "unknown" },
    { stage: "unknown" },
    { unitKey: "bad" },
    { expectedUnitKeys: "bad" },
    { expectedUnitKeys: ["bad"] },
    { expectedUnitKeys: Array(65).fill("a".repeat(64)) }
  ]
  for (const invalid of [null, [], ...patches.map((patch) => ({ ...marker, ...patch }))]) {
    writeFileSync(file, JSON.stringify(invalid))
    expect(
      readActivity({ statePath, root, sessionId: "malformed", resident: { available: true, lifetime: "resident" } })
    ).toMatchObject({ kind: "no-observation", observed: false, limitation: "activity-state-unreadable", findings: 0 })
  }
})

it("reports malformed round closure accounting and preserves its valid bounded summary", () => {
  const statePath = makeRoot()
  const root = "/synthetic/repository"
  const discarded = { queued: 1, running: 2, pendingAdvice: 3, submitted: 0, uncertain: 0, editPermits: 1 }
  recordRoundClosure({
    statePath,
    root,
    advicee: advicee("closed", "event"),
    lifetime: "resident",
    roundIdentity: "round",
    reason: "deadline",
    reservedContinuations: 4,
    discarded
  })
  const options = { statePath, root, sessionId: "closed", resident: { available: false } }
  expect(readActivity(options)).toMatchObject({
    roundClosures: [{ reason: "deadline", reservedContinuations: 4, discarded }]
  })
  const directory = join(statePath, readdirSync(statePath)[0]!)
  const file = join(directory, readdirSync(directory)[0]!)
  const marker = JSON.parse(readFileSync(file, "utf8"))
  for (const patch of [
    { roundKey: "bad" },
    { reason: "unknown" },
    { reservedContinuations: 5 },
    { discarded: null },
    { discarded: { ...discarded, queued: -1 } },
    { discarded: { ...discarded, editPermits: undefined } }
  ]) {
    writeFileSync(file, JSON.stringify({ ...marker, ...patch }))
    expect(readActivity(options)).toMatchObject({ observed: false, limitation: "activity-state-unreadable" })
  }
})

it("distinguishes an absent session, a missing session ID and an unreadable session directory", () => {
  const statePath = makeRoot()
  const root = "/synthetic/repository"
  const options = { statePath, root, sessionId: "session", resident: { available: false } }
  expect(readActivity({ ...options, sessionId: "" })).toMatchObject({ limitation: "session-id-required" })
  expect(readActivity(options)).not.toHaveProperty("limitation")
  recordActivity({ statePath, root, advicee: advicee("session", "event"), lifetime: "resident", stage: "clear" })
  const sessionPath = join(statePath, readdirSync(statePath)[0]!)
  rmSync(sessionPath, { recursive: true })
  writeFileSync(sessionPath, "not a directory")
  expect(readActivity(options)).toMatchObject({ kind: "no-observation", limitation: "activity-state-unreadable" })
})

it("persists a source-free marker with bounded hashed unit identities", () => {
  const statePath = makeRoot()
  const root = "/secret/repository/path"
  const event = advicee("raw-session-secret", "raw-tool-secret", "raw-child-secret")
  recordActivity({
    statePath,
    root,
    advicee: event,
    lifetime: "resident",
    stage: "pending",
    expectedUnitIdentities: Array.from({ length: 70 }, (_, index) => `raw-unit-${index}`)
  })
  const directory = join(statePath, readdirSync(statePath)[0]!)
  const content = readFileSync(join(directory, readdirSync(directory)[0]!), "utf8")
  const marker = JSON.parse(content)
  expect(marker.expectedUnitKeys).toHaveLength(64)
  for (const forbidden of [
    root,
    event.sessionId,
    event.toolUseId,
    event.subagentId!,
    "raw-unit-",
    "source",
    "credential",
    "advice",
    "probability"
  ]) {
    expect(content).not.toContain(forbidden)
  }
  expect(
    readActivity({ statePath, root, sessionId: event.sessionId, resident: { available: true, lifetime: "resident" } })
  ).toMatchObject({ kind: "pending", findings: 0 })
})

it("formats submissions, round closures and missing instrumentation without claiming model reaction", () => {
  const statePath = makeRoot()
  const root = "/synthetic/repository"
  const event = advicee("formatted-session", "event")
  recordActivity({ statePath, root, advicee: event, lifetime: "resident", stage: "submitted", submittedFindings: 4 })
  recordRoundClosure({
    statePath,
    root,
    advicee: event,
    lifetime: "resident",
    roundIdentity: "round",
    reason: "deadline",
    reservedContinuations: 2,
    discarded: { queued: 1, running: 0, pendingAdvice: 2, submitted: 0, uncertain: 0, editPermits: 1 }
  })
  const options = { statePath, root, sessionId: event.sessionId, resident: { available: true, lifetime: "resident" } }
  const output = formatActivityHuman(event.sessionId, readActivity(options))
  expect(output).toContain("activity: submitted\n")
  expect(output).toContain("events: submitted=1\n")
  expect(output).toContain("submission: submitted (findings=4)\n")
  expect(output).toContain("round closed: deadline; continuations=2; discarded queued=1")
  expect(output).toContain("model-reaction: unavailable")
  const missing = formatActivityHuman("", readActivity({ ...options, sessionId: "" }))
  expect(missing).toContain("activity: no-observation\n")
  expect(missing).toContain("events: none\n")
  expect(missing).toContain("limitation: session-id-required\n")
})
