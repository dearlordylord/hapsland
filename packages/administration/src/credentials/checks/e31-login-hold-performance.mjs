import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import * as reference from "/workspace/typescript/hapsland-bend-baseline-master-e31dac83/packages/administration/dist/credentials/login-model.js"
import * as candidate from "../../../dist/credentials/login-model.js"
const phases = ["SelectingDestination", "PreparingTarget", "EnteringKey", "ConfirmingSave", "SavingKey", "CheckingActive", "Done", "Cancelled"]
const actions = ["selected", "prepared", "entered", "approved", "observed", "active", "back", "exit"]
const proposal = { id: "proposal", availability: "available", plan: { destination: "native", target: "/fixture", scope: "user", storage: "native" }, reason: undefined, activeSource: "environment", activeFile: undefined }
const storage = { status: "stored", state: { version: 1, generation: 3, savedUseSuspended: false }, stateLock: "acquired" }
const active = { status: "present", source: "native", generation: 3 }
const fixtures = []
  for (const phase of phases) {
    const model = { phase, revision: 7, destination: "native", proposal, storage, active }
    assert.deepEqual(candidate.loginCommand(model), reference.loginCommand(model))
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) for (let bits = 0; bits < 32; bits++) {
      const current = Boolean(bits & 1), matched = Boolean(bits & 2), blocked = Boolean(bits & 4), yes = Boolean(bits & 8), stale = Boolean(bits & 16)
      const kind = actions[actionIndex]
      const action = {
        selected: { kind, destination: "user" },
        prepared: { kind, commandId: 7, proposal: { ...proposal, id: "new-proposal", availability: blocked ? "blocked" : "available" } },
        entered: { kind, commandId: 7, proposalId: matched ? "proposal" : "other-proposal" },
        approved: { kind, proposalId: matched ? "proposal" : "other-proposal", yes },
        observed: { kind, commandId: 7, storage: { ...storage, status: stale ? "stale" : "stored", state: { ...storage.state, generation: 4 } } },
        active: { kind, commandId: 7, active: { status: "missing", source: "environment", generation: 4 } },
        back: { kind }, exit: { kind }
      }[kind]
      const event = { revision: current ? 7 : 6, action }
      const expected = reference.reduceLogin(model, event)
      const actual = candidate.reduceLogin(model, event)
      assert.deepEqual(actual, expected)
      if (expected === model) assert.equal(actual, model)
      fixtures.push([model, event])
    }
  }

function run(lane) {
  let checksum = 0
  const start = performance.now()
  for (let round = 0; round < 1000; round++) for (const [model, event] of fixtures) {
    const result = lane.reduceLogin(model, event)
    checksum += result.revision + result.phase.length
  }
  return { milliseconds: performance.now() - start, checksum }
}
for (let round = 0; round < 3; round++) { run(reference); run(candidate) }
const samples = { typescript: [], integratedBend: [] }
for (let round = 0; round < 9; round++) {
  const lanes = [["typescript", reference], ["integratedBend", candidate]]
  if (round % 2) lanes.reverse()
  for (const [name, lane] of lanes) samples[name].push(run(lane))
}
assert.equal(new Set([...samples.typescript, ...samples.integratedBend].map(sample => sample.checksum)).size, 1)
const median = samples => samples.map(sample => sample.milliseconds).sort((a,b) => a-b)[4]
const ratio = median(samples.integratedBend) / median(samples.typescript)
const record = { runtime: {kind: "Bun", version: globalThis.Bun.version}, actualCompiledBaseline: "/workspace/typescript/hapsland-bend-baseline-master-e31dac83/packages/administration/dist/credentials/login-model.js", at: new Date().toISOString(), cases: fixtures.length, samples, medianRatio: ratio, executionParity: ratio <= 1, scope: "warm compiled login reducer and command mapping; exhaustive typed native payload materialization; IO, startup, secret lifetime and platform support excluded" }
writeFileSync("evidence/bend-strangler/e31-login-hold-performance.json", JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify({ medianRatio: ratio, executionParity: record.executionParity }))
