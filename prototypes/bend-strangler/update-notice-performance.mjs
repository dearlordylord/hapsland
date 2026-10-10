import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import * as baseline from "/workspace/typescript/hapsland-bend-baseline-master-e31dac83/packages/resident-transport/dist/resident/protocol.js"
import * as candidate from "../../packages/resident-transport/dist/resident/protocol.js"
const fixtures = []
for (const operation of ["hello", "admit", "admit-and-collect", "edit-policy", "prompt-marker", "register-edit", "collect", "cleanup"])
  for (const updateNotice of [undefined, false, true])
    for (const host of [undefined, "pi", "codex-cli"])
      for (const mode of ["ordinary", "stop"])
        fixtures.push({ operation, mode, ...(host === undefined ? {} : { advicee: { host, sessionId: "fixture" } }), ...(updateNotice === undefined ? {} : { updateNotice }) })
for (const request of fixtures) assert.equal(candidate.residentUpdateOpportunity(request), baseline.residentUpdateOpportunity(request))
const callers = {
  typescript: () => { let sum = 0; for (let round = 0; round < 20000; round++) for (const request of fixtures) sum += Number(baseline.residentUpdateOpportunity(request)); return sum },
  integratedBend: () => { let sum = 0; for (let round = 0; round < 20000; round++) for (const request of fixtures) sum += Number(candidate.residentUpdateOpportunity(request)); return sum }
}
const startedAt = new Date().toISOString()
const samples = { typescript: [], integratedBend: [] }
let checksum
for (let pair = 0; pair < 12; pair++) {
  const lanes = Object.entries(callers)
  if (pair % 2) lanes.reverse()
  for (const [name, run] of lanes) {
    const start = performance.now(), actual = run(), seconds = (performance.now() - start) / 1000
    checksum ??= actual
    assert.equal(actual, checksum)
    if (pair >= 3) samples[name].push(seconds)
  }
}
const mean = xs => xs.reduce((a,b) => a+b,0)/xs.length
const ratio = mean(samples.integratedBend)/mean(samples.typescript)
const record = { startedAt, at: new Date().toISOString(), baseline: "e31dac83", fixtures: fixtures.length, rounds: 20000, warmupPairs: 3, measuredPairs: 9, samples, checksum, meanRatio: ratio, executionParity: ratio <= 1, scope: "actual compiled residentUpdateOpportunity; alternating identical callers and checksum; CPU11 nonexclusive; no wire latency, budget map or delivery claim" }
writeFileSync(new URL("update-notice-performance.json", import.meta.url), JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify(record))
assert.ok(record.executionParity, "update notice execution must reach baseline parity")
