import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { writeFileSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { deriveLookupPlan as baselineLookup, deriveSavePlan as baselineSave } from "./credential-reference.ts"
import { deriveLookupPlan as bendLookup, deriveSavePlan as bendSave } from "@hapsland/runtime-inputs/credentials/policy"
const contexts = Array.from({ length: 32 }, (_, bits) => ({ envVar: "KEY", referenceExplicit: Boolean(bits & 1), captured: Boolean(bits & 2),
  root: bits & 4 ? "/root" : undefined, userFile: "/user", nativeTarget: "hapsland",
  projectLocalFile: bits & 8 ? "/local" : undefined, projectFile: bits & 16 ? "/project" : undefined }))
const destinations = ["user", "project-local", "native"]
for (const context of contexts) {
  assert.deepEqual(bendLookup(context), baselineLookup(context))
  for (const destination of destinations) assert.deepEqual(bendSave(context, destination), baselineSave(context, destination))
}
const loops = 10000
function run(lookup, save) {
  let checksum = 0
  for (let n = 0; n < loops; n++) for (const context of contexts) {
    for (const step of lookup(context)) checksum += step.kind.length + (step.file ?? step.target ?? step.envVar).length
    for (const destination of destinations) {
      const plan = save(context, destination)
      if (plan !== undefined) checksum += plan.target.length + plan.scope.length + plan.storage.length
    }
  }
  return checksum
}
const expected = run(baselineLookup, baselineSave)
for (let warmup = 0; warmup < 3; warmup++) {
  assert.equal(run(baselineLookup, baselineSave), expected)
  assert.equal(run(bendLookup, bendSave), expected)
}
const samplesMs = { typescript: [], integratedBend: [] }
for (let sample = 0; sample < 9; sample++) {
  const lanes = [["typescript", baselineLookup, baselineSave], ["integratedBend", bendLookup, bendSave]]
  if (sample % 2) lanes.reverse()
  for (const [name, lookup, save] of lanes) {
    const start = performance.now()
    assert.equal(run(lookup, save), expected)
    samplesMs[name].push(performance.now() - start)
  }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const medianRatio = median(samplesMs.integratedBend) / median(samplesMs.typescript)
const sourcePaths = ["packages/runtime-inputs/src/credentials/policy.ts", "packages/canonical-policy/src/canonical/credential-adapter.ts",
  "packages/agent-flow-bend/credential-policy/core.bend", "packages/agent-flow-bend/dist/credential-policy.generated.js"]
const record = { at: new Date().toISOString(), runtime: process.versions, loops, contexts: contexts.length, checksum: expected, samplesMs, medianRatio,
  executionParity: medianRatio <= 1, sourceSha256: Object.fromEntries(sourcePaths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])),
  scope: "current compiled production credential planning versus frozen master a071b9b58; full output field consumption; warm finite caches; no credential IO or startup timing" }
writeFileSync(new URL("./integrated-performance.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
console.log(JSON.stringify({ samplesMs, medianRatio, executionParity: record.executionParity }))
