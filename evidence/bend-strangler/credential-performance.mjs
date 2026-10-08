import assert from "node:assert/strict"
import { createCredentialPlanner } from "./credential-bridge.mjs"
import { performance } from "node:perf_hooks"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { credentialPolicy, deriveLookupPlan, deriveSavePlan } from "./credential-reference.ts"
const directory = mkdtempSync(join(tmpdir(), "hapsland-credential-performance-"))
try {
  const output = join(directory, "core.mjs")
  const buildStart = performance.now()
  execFileSync("bend", ["packages/agent-flow-bend/credential-policy/core.bend", "-o", output], { timeout: 5000, stdio: "pipe" })
  const compileMs = performance.now() - buildStart
  const { default: core } = await import(pathToFileURL(output))
  const { lookup, save } = createCredentialPlanner(core, credentialPolicy, { cache: false })
  const cached = createCredentialPlanner(core, credentialPolicy)
  const { lookup: cachedLookup, save: cachedSave } = cached
  const destinations = ["user", "native", "project-local"]
  const contexts = Array.from({ length: 32 }, (_, bits) => ({ envVar: "KEY", referenceExplicit: Boolean(bits & 1), captured: Boolean(bits & 2),
    root: bits & 4 ? "/root" : undefined, userFile: "/user", nativeTarget: "hapsland",
    projectLocalFile: bits & 8 ? "/local" : undefined, projectFile: bits & 16 ? "/project" : undefined }))
  for (const context of contexts) {
    assert.deepEqual(lookup(context), deriveLookupPlan(context))
    assert.deepEqual(cachedLookup(context), deriveLookupPlan(context))
    for (const destination of destinations) {
      assert.deepEqual(save(context, destination), deriveSavePlan(context, destination))
      assert.deepEqual(cachedSave(context, destination), deriveSavePlan(context, destination))
    }
    const changedPaths = { ...context, envVar: "OTHER_KEY", userFile: "/other-user", nativeTarget: "other-target",
      projectLocalFile: context.projectLocalFile === undefined ? undefined : "/other-local",
      projectFile: context.projectFile === undefined ? undefined : "/other-project" }
    assert.deepEqual(cachedLookup(changedPaths), deriveLookupPlan(changedPaths))
    for (const destination of destinations) assert.deepEqual(cachedSave(changedPaths, destination), deriveSavePlan(changedPaths, destination))
  }
  assert.deepEqual(cached.cacheEntries(), { lookup: 32, save: 6 })
  if (process.argv.includes("--validate-only")) {
    console.log(JSON.stringify({ result: "pass", contexts: contexts.length, changedTargets: "pass", cacheEntries: cached.cacheEntries() }))
  } else {
  const loops = 10000
  function run(lookupPlan, savePlan) {
    let checksum = 0
    for (let n = 0; n < loops; n++) for (const context of contexts) {
      checksum += lookupPlan(context).length
      for (const destination of destinations) checksum += savePlan(context, destination) === undefined ? 0 : 1
    }
    return checksum
  }
  const expected = run(deriveLookupPlan, deriveSavePlan)
  assert.equal(run(lookup, save), expected)
  assert.equal(run(cachedLookup, cachedSave), expected)
  const samples = { typescript: [], bendWithHostConversion: [], bendWithBoundedCache: [] }
  for (let sample = 0; sample < 7; sample++) {
    const lanes = [["typescript", deriveLookupPlan, deriveSavePlan], ["bendWithHostConversion", lookup, save],
      ["bendWithBoundedCache", cachedLookup, cachedSave]]
    if (sample % 2) lanes.reverse()
    for (const [name, lookupPlan, savePlan] of lanes) {
      const start = performance.now()
      assert.equal(run(lookupPlan, savePlan), expected)
      samples[name].push(performance.now() - start)
    }
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const ratio = median(samples.bendWithBoundedCache) / median(samples.typescript)
  const record = { at: new Date().toISOString(), runtime: process.versions, compileMs, loops, contexts: contexts.length, checksum: expected,
    cacheEntries: { lookup: cached.cacheEntries().lookup, save: cached.cacheEntries().save }, samplesMs: samples, medianRatio: ratio, executionParity: ratio <= 1,
    scope: "candidate emitted Bend with full host plan conversion versus current TypeScript; interleaved lanes; no IO or production integration" }
  writeFileSync(new URL("./candidate-performance.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify({ compileMs, samplesMs: samples, medianRatio: ratio, executionParity: ratio <= 1 }))
  }
} finally { rmSync(directory, { recursive: true, force: true }) }
