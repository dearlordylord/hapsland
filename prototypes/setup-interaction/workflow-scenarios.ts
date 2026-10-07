// Prototype: named executable scenarios with independent behavioral assertions.
import assert from "node:assert/strict"
import { Effect } from "effect"
import type { Interaction } from "./interaction.ts"
import { scopeInteraction } from "./interaction-session.ts"
import { scriptedInteraction, type ScriptStep } from "./scripted-interaction.ts"
import { fakeUpdateOwner, runUpdate } from "./update-flow.ts"
import { fakeMaintenanceOwner, runMaintenance } from "./maintenance-flow.ts"
import { fakeCredentialOwner } from "./credential-owner.ts"
import { runLogin } from "./login-flow.ts"
import { runVerification } from "./verification-flow.ts"
import type { Observe, ReplayStep } from "./workflow-replay.ts"
export type Workflow = "update" | "maintenance" | "login" | "verification"
export type ScenarioReplay = { workflow: Workflow; name: string; trace: ReplayStep[] }
const choose: ScriptStep = { kind: "choose", index: 0 }
const yes: ScriptStep = { kind: "confirm", line: "y" }
const no: ScriptStep = { kind: "confirm", line: "" }
const back: ScriptStep = { kind: "back" }
const secret: ScriptStep = { kind: "hidden", value: "FAKE_WORKFLOW_SECRET_SENTINEL" }
export async function runWorkflowScenarios(sink: (replay: ScenarioReplay) => void = () => {}) {
  const cases = { update: 0, maintenance: 0, login: 0, verification: 0 }
  async function replay<M>(
    workflow: Workflow,
    name: string,
    steps: ScriptStep[],
    run: (interaction: Interaction, observe: Observe) => Effect.Effect<M>,
    check: (model: M, transcript: string[]) => void
  ) {
    const script = scriptedInteraction(steps),
      trace: ReplayStep[] = []
    const observe: Observe = (step) =>
      Effect.sync(() => {
        trace.push(step)
      })
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          return yield* run(yield* scopeInteraction(script.interaction), observe)
        })
      )
    )
    assert.equal(script.remaining(), 0, name)
    assert(
      !JSON.stringify({ model, trace, transcript: script.transcript }).includes("FAKE_WORKFLOW_SECRET_SENTINEL"),
      name
    )
    check(model, script.transcript)
    cases[workflow]++
    sink({ workflow, name, trace })
  }
  for (const outcome of ["updated", "partial", "failed"] as const) {
    const owner = fakeUpdateOwner({ outcomes: { Claude: outcome, Codex: "updated" } })
    await replay(
      "update",
      `group-${outcome}-then-success`,
      [choose, yes],
      (i, o) => runUpdate(i, owner, o),
      (m, text) => {
        assert.deepEqual(m.results, { Claude: outcome, Codex: "updated" })
        assert.equal(owner.observed().writes, outcome === "failed" ? 1 : 2)
        assert.equal(text.filter((t) => t.startsWith("Batch update preview")).length, 2)
      }
    )
  }
  for (const line of ["", "yes", "n"]) {
    const owner = fakeUpdateOwner()
    await replay(
      "update",
      `decline-${line || "empty"}`,
      [choose, { kind: "confirm", line }],
      (i, o) => runUpdate(i, owner, o),
      (m) => {
        assert.deepEqual(m.results, { Claude: "declined", Codex: "declined" })
        assert.equal(owner.observed().writes, 0)
      }
    )
  }
  for (const hosts of [[], ["Claude", "Codex"]]) {
    const owner = fakeUpdateOwner({ hosts, outcomes: { Claude: "already-current", Codex: "already-current" } })
    await replay(
      "update",
      hosts.length ? "all-current" : "no-registration",
      [],
      (i, o) => runUpdate(i, owner, o),
      (m) => {
        assert.equal(m.phase, "Done")
        assert.equal(owner.observed().writes, 0)
        assert.equal(owner.observed().staged, hosts.length ? 1 : 0)
        assert.equal(owner.observed().activations, hosts.length ? 1 : 0)
      }
    )
  }
  {
    const owner = fakeUpdateOwner({ outcomes: { Claude: "already-current" } })
    await replay(
      "update",
      "current-plus-declined",
      [choose, no],
      (i, o) => runUpdate(i, owner, o),
      (m) => {
        assert.deepEqual(m.results, { Claude: "already-current", Codex: "declined" })
        assert.equal(owner.observed().writes, 0)
        assert.equal(owner.observed().activations, 1)
      }
    )
  }
  {
    const owner = fakeUpdateOwner({ stale: true })
    await replay(
      "update",
      "changed-group-reapprove",
      [choose, yes, choose, yes],
      (i, o) => runUpdate(i, owner, o),
      (m) => {
        assert.equal(m.results.Codex, "updated")
        assert.equal(owner.observed().writes, 2)
      }
    )
  }
  {
    const owner = fakeUpdateOwner({ activationFails: true })
    await replay(
      "update",
      "activation-failure",
      [choose, yes],
      (i, o) => runUpdate(i, owner, o),
      (m) => {
        assert.equal(m.activation, "failed")
        assert.equal(m.results.Claude, "updated")
        assert(m.retained)
      }
    )
  }
  for (const ending of ["exit", "eof"] as const) {
    const owner = fakeUpdateOwner()
    await replay(
      "update",
      ending,
      [choose, { kind: ending }],
      (i, o) => runUpdate(i, owner, o),
      (m) => {
        assert.equal(m.phase, "Cancelled")
        assert(m.retained)
        assert.equal(owner.observed().writes, 0)
      }
    )
  }
  {
    const owner = fakeUpdateOwner()
    await replay(
      "update",
      "back-from-approval",
      [choose, back, choose, yes],
      (i, o) => runUpdate(i, owner, o),
      (m) => {
        assert.equal(m.results.Claude, "updated")
        assert.equal(owner.observed().staged, 1)
      }
    )
  }
  for (const command of ["repair", "reinstall", "uninstall"] as const) {
    const owner = fakeMaintenanceOwner({ recovered: { Claude: "uninstall" } })
    await replay(
      "maintenance",
      `${command}-independent-approval`,
      [choose, yes, choose, no],
      (i, o) => runMaintenance(i, owner, command, o),
      (m) => {
        assert.deepEqual(m.results, { Claude: "complete", Codex: "declined" })
        assert.deepEqual(owner.observed().operations, [`Claude:${command === "reinstall" ? "install" : "uninstall"}`])
        assert.equal(owner.observed().activations, command === "reinstall" ? 1 : 0)
      }
    )
  }
  for (const outcome of ["partial", "failed"] as const) {
    const owner = fakeMaintenanceOwner({ outcomes: { Claude: outcome } })
    await replay(
      "maintenance",
      `${outcome}-continues-next-agent`,
      [choose, yes, choose, yes],
      (i, o) => runMaintenance(i, owner, "repair", o),
      (m) => {
        assert.deepEqual(m.results, { Claude: outcome, Codex: "complete" })
      }
    )
  }
  {
    const owner = fakeMaintenanceOwner({ hosts: ["Claude"], stale: true })
    await replay(
      "maintenance",
      "stale-reinspection-and-consent",
      [choose, yes, choose, yes],
      (i, o) => runMaintenance(i, owner, "repair", o),
      (m) => {
        assert.equal(m.results.Claude, "complete")
        assert.equal(owner.observed().writes, 1)
      }
    )
  }
  {
    const owner = fakeMaintenanceOwner({ hosts: ["Claude"], activationFails: true })
    await replay(
      "maintenance",
      "activation-failed-after-mutation",
      [choose, yes],
      (i, o) => runMaintenance(i, owner, "reinstall", o),
      (m) => {
        assert.equal(m.results.Claude, "complete")
        assert.equal(m.activation.Claude, "failed")
      }
    )
  }
  for (const ending of ["exit", "eof"] as const) {
    const owner = fakeMaintenanceOwner({ outcomes: { Claude: "partial" } })
    await replay(
      "maintenance",
      `${ending}-after-prior-partial`,
      [choose, yes, { kind: ending }],
      (i, o) => runMaintenance(i, owner, "repair", o),
      (m) => {
        assert.equal(m.phase, "Cancelled")
        assert.equal(m.results.Claude, "partial")
        assert.equal(owner.observed().writes, 1)
      }
    )
  }
  {
    const owner = fakeMaintenanceOwner({ hosts: ["Claude"] })
    await replay(
      "maintenance",
      "back-preserves-preview",
      [choose, back, choose, no],
      (i, o) => runMaintenance(i, owner, "repair", o),
      (m) => {
        assert.equal(m.results.Claude, "declined")
        assert.equal(owner.observed().writes, 0)
      }
    )
  }
  {
    const owner = fakeMaintenanceOwner({ current: ["Claude", "Codex"] })
    await replay(
      "maintenance",
      "intact-no-approval",
      [],
      (i, o) => runMaintenance(i, owner, "repair", o),
      (m) => {
        assert.deepEqual(m.results, { Claude: "intact", Codex: "intact" })
        assert.equal(owner.observed().writes, 0)
      }
    )
  }
  for (const outcome of ["stored", "failed", "partial"] as const) {
    const owner = fakeCredentialOwner({ save: outcome })
    await replay(
      "login",
      `native-save-${outcome}`,
      [secret],
      (i, o) => runLogin(i, owner, o),
      (m) => {
        assert.equal(m.outcome, outcome)
        assert.equal(owner.observed().saves, outcome === "failed" ? 0 : 1)
        if (outcome === "failed") assert(owner.observed().available)
      }
    )
  }
  for (const ending of ["exit", "eof"] as const) {
    const owner = fakeCredentialOwner()
    await replay(
      "login",
      `hidden-${ending}`,
      [{ kind: ending }],
      (i, o) => runLogin(i, owner, o),
      (m) => {
        assert.equal(m.phase, "Cancelled")
        assert.equal(owner.observed().saves, 0)
        assert(owner.observed().available)
      }
    )
  }
  {
    const owner = fakeCredentialOwner({ writable: false })
    await replay(
      "login",
      "storage-unavailable-no-capture",
      [],
      (i, o) => runLogin(i, owner, o),
      (m) => {
        assert.equal(m.outcome, "unavailable")
        assert.equal(owner.observed().captures, 0)
      }
    )
  }
  for (const source of ["environment", "file"] as const) {
    const owner = fakeCredentialOwner({ source })
    await replay(
      "login",
      `saved-under-${source}`,
      [secret],
      (i, o) => runLogin(i, owner, o),
      (m) => {
        assert.equal(m.credential?.source, source)
        assert.equal(m.outcome, "stored")
      }
    )
  }
  for (const outcome of ["accepted", "rejected", "forbidden", "rate-limited", "unconfirmed"] as const) {
    const owner = fakeCredentialOwner({ source: "environment", checks: [outcome] })
    await replay(
      "verification",
      `environment-${outcome}`,
      [yes],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.outcome, outcome)
        assert.equal(m.attempts, 1)
        assert.equal(owner.observed().saves, 0)
      }
    )
  }
  {
    const owner = fakeCredentialOwner()
    await replay(
      "verification",
      "decline-no-request",
      [no],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.outcome, "declined")
        assert.equal(owner.observed().checks, 0)
      }
    )
  }
  {
    const owner = fakeCredentialOwner({ source: "none" })
    await replay(
      "verification",
      "missing-no-consent",
      [],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.outcome, "unavailable")
        assert.equal(owner.observed().checks, 0)
      }
    )
  }
  for (const source of ["saved", "file"] as const) {
    const owner = fakeCredentialOwner({ source, checks: ["rejected", "accepted"] })
    await replay(
      "verification",
      `${source}-correction-fresh-consent`,
      [yes, choose, yes, ...(source === "saved" ? [secret] : [])],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.outcome, "accepted")
        assert.equal(m.attempts, 2)
        assert.equal(owner.observed().saves, source === "saved" ? 1 : 0)
      }
    )
  }
  {
    const owner = fakeCredentialOwner({ checks: ["rejected", "forbidden", "rejected"] })
    await replay(
      "verification",
      "three-request-cap",
      [yes, choose, yes, secret, choose, yes, secret],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.attempts, 3)
        assert.equal(owner.observed().checks, 3)
        assert.equal(owner.observed().saves, 2)
      }
    )
  }
  for (const outcome of ["failed", "partial"] as const) {
    const owner = fakeCredentialOwner({ save: outcome, checks: ["rejected"] })
    await replay(
      "verification",
      `replacement-${outcome}-no-request`,
      [yes, choose, yes, secret],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.saveOutcome, outcome)
        assert.equal(owner.observed().checks, 1)
      }
    )
  }
  {
    const owner = fakeCredentialOwner({ checks: ["rejected"] })
    await replay(
      "verification",
      "back-and-decline-correction",
      [yes, choose, back, choose, no],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.attempts, 1)
        assert.equal(owner.observed().saves, 0)
      }
    )
  }
  {
    const owner = fakeCredentialOwner({ stale: true })
    await replay(
      "verification",
      "changed-source-fresh-consent",
      [yes, yes],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.attempts, 1)
        assert.equal(owner.observed().checks, 1)
      }
    )
  }
  for (const ending of ["exit", "eof"] as const) {
    const owner = fakeCredentialOwner({ checks: ["rejected"] })
    await replay(
      "verification",
      `replacement-hidden-${ending}`,
      [yes, choose, yes, { kind: ending }],
      (i, o) => runVerification(i, owner, o),
      (m) => {
        assert.equal(m.phase, "Cancelled")
        assert.equal(owner.observed().checks, 1)
        assert.equal(owner.observed().saves, 0)
        assert(owner.observed().available)
      }
    )
  }
  return { cases, realWrites: 0, credentialReads: 0, providerRequests: 0 }
}
