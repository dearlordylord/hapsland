import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import * as reference from "./verification-reference.ts"
import * as candidate from "../../../dist/onboarding/verification-model.js"
import { phases, actions, sources, results, fixture } from "./verification-fixtures.mjs"
const fixtures = []
let cases = 0
for (const phase of phases) for (const attempts of [0, 1, 2, 3, 4, 31, 65536]) for (const source of sources) for (const result of results) for (let bits = 0; bits < 16; bits++) {
  const f = fixture(phase, attempts, source, result, bits)
  assert.deepEqual(candidate.verificationCommand(f.model), reference.verificationCommand(f.model))
  for (const kind of actions) {
    const event = { revision: f.current ? 7 : 6, action: f.actions[kind] }
    const expected = reference.reduceVerification(f.model, event), actual = candidate.reduceVerification(f.model, event)
    assert.deepEqual(actual, expected)
    if (expected === f.model) assert.equal(actual, f.model)
    if (attempts <= 3) fixtures.push([f.model, event])
    cases++
  }
}
function run(lane) {
  let checksum = 0
  const start = performance.now()
  for (let round = 0; round < 10; round++) for (const [model, event] of fixtures) {
    const result = lane.reduceVerification(model, event), command = lane.verificationCommand(result)
    checksum += result.revision + result.keyRevision + result.attempts + result.phase.length + result.observations.length + (result.storage?.generation ?? 0) + (command?.kind.length ?? 0) + (command?.id ?? 0) + (command?.keyRevision ?? 0)
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
const paths = ["scripts/pure-bend-artifact.mjs", "packages/administration/src/onboarding/checks/verification-reference.ts", "packages/agent-flow-bend/verification-policy/core.bend", "packages/agent-flow-bend/verification-policy/LAWS.bend", "packages/agent-flow-bend/verification-policy/PROOF.bend", "packages/agent-flow-bend/scripts/build-verification-policy.mjs", "packages/canonical-policy/src/canonical/verification-adapter.ts", "packages/administration/src/onboarding/verification-model.ts", "packages/agent-flow-bend/dist/verification-policy.generated.js", "packages/canonical-policy/dist/canonical/verification-adapter.js", "packages/administration/dist/onboarding/verification-model.js"]
const sha256 = Object.fromEntries(paths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]))
const record = { at: new Date().toISOString(), baselineRevision: "a071b9b58", cases, timedCases: fixtures.length, samples, medianRatio: ratio, executionParity: ratio <= 1, sha256, scope: "warm compiled verification reducer and command mapping; complete typed enum/Boolean cases at counts 0..3 timed; larger counts also checked for exact native payload/count preservation; no request, IO, startup or platform claim" }
writeFileSync("evidence/bend-strangler/verification-performance.json", JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify({ cases, medianRatio: ratio, executionParity: record.executionParity }))
