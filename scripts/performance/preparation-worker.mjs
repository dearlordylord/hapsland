import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"

const [root, mode, fixturePath, goldenPath] = process.argv.slice(2)
assert.equal(process.argv.slice(2).length, 4)
assert.ok(root && fixturePath && goldenPath)
assert.ok(mode === "prepare" || mode === "measure")
const load = (path) => import(pathToFileURL(root + path).href)
const { prepareObservation } = await load("/packages/review-execution/dist/direct-event/pipeline.js")
const { discoverPhysicalWorkingTreeRoot } = await load("/packages/native-observation/dist/repository/root.js")
const { configuredRules } = await load("/scripts/test-support/default-rules.ts")
const { advicee } = await load("/scripts/test-support/test-fixtures.ts")
const { DEFAULT_BACKEND, DEFAULT_DESTINATION } = await load("/packages/review-definition/dist/runtime/review-config.js")
const Effect = await load("/node_modules/effect/dist/Effect.js")
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"))
const cases = await Promise.all(
  fixtures.map(async ({ root: fixtureRoot, paths }) => ({
    observation: {
      ...(await Effect.runPromise(discoverPhysicalWorkingTreeRoot(fixtureRoot))),
      advicee: advicee(),
      candidates: paths.map((path) => ({ operation: "add", path }))
    },
    context: {
      controlledWriter: true,
      advicee: advicee(),
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: configuredRules
    }
  }))
)
const run = async () => {
  const results = []
  for (const { observation, context } of cases)
    results.push(JSON.stringify(await Effect.runPromise(prepareObservation(observation, context))))
  return results
}
const actual = await run()
const controls = JSON.stringify(cases.map(({ context }) => context))
const results = actual.map((value) => JSON.parse(value))
for (const [index, result] of results.slice(0, 6).entries()) {
  assert.ok(
    result.outcomes.some((outcome) => outcome.status === "ready"),
    "fixture must prepare actual review work: " + JSON.stringify({ index, paths: fixtures[index].paths, result })
  )
  assert.equal(result.observation.units.length, 1)
  assert.equal(result.observation.units[0].root.artifact.name, "Root")
}
assert.ok(
  results[5].observation.units[0].root.references.some(
    (reference) => reference.kind === "expanded" && reference.node.artifact.name === "Support"
  ),
  "recursive fixture must capture and attach supporting evidence"
)
assert.equal(results[6].observation.status, "incomplete")
assert.equal(results[6].observation.units.length, 0)
assert.ok(
  results[6].observation.outcomes.some(
    (outcome) =>
      outcome.status === "observed" &&
      outcome.analysis.status === "incomplete" &&
      outcome.analysis.failures.some((failure) => failure.reason === "import" && failure.root === undefined)
  ),
  "error fixture must retain original import diagnosis"
)
if (mode === "prepare") {
  writeFileSync(goldenPath, JSON.stringify({ controls, results: actual }))
  process.exit(0)
}
const golden = JSON.parse(readFileSync(goldenPath, "utf8"))
assert.equal(controls, golden.controls, "lanes must use the same semantic rules and invocation settings")
const expected = golden.results
assert.deepEqual(actual, expected)
const warmups = 3,
  rounds = 2
for (let index = 0; index < warmups; index++) assert.deepEqual(await run(), expected)
const started = performance.now(),
  cpu = process.cpuUsage()
let checksum = 0
for (let index = 0; index < rounds; index++) {
  const result = await run()
  assert.deepEqual(result, expected)
  checksum += result.reduce((sum, value) => sum + value.length, 0)
}
const used = process.cpuUsage(cpu)
console.log(
  JSON.stringify({
    seconds: (performance.now() - started) / 1000,
    cpuSeconds: (used.user + used.system) / 1e6,
    checksum,
    fixtures: cases.length,
    warmups,
    rounds,
    definedAndEqual: true,
    implementation: "public",
    runtime: typeof Bun === "undefined" ? process.version : Bun.version
  })
)
