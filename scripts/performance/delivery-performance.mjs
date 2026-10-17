import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const roots = {
  typescript: process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT,
  integratedBend: process.env.HAPSLAND_PERFORMANCE_CANDIDATE_ROOT
}
assert.ok(roots.typescript && roots.integratedBend)
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: roots.typescript, encoding: "utf8" }).trim(),
  "a0773f79ffa4babdba219c773832fa3a61cc803c"
)
const profile = process.argv.includes("--profile"),
  probe = profile || process.argv.includes("--probe"),
  stop = Date.now() + 600_000
const temporary = mkdtempSync(join(tmpdir(), "haps-delivery-bench-"))
const worker = resolve(
  import.meta.dirname,
  "../../packages/resident-runtime/src/resident/advice-delivery/verification/delivery-performance-worker.mjs"
)
const golden = join(temporary, "golden.json"),
  fixture = join(temporary, "fixture.json")
const startedAt = new Date().toISOString(),
  samples = { typescript: [], integratedBend: [] }
// Profiling is a single diagnostic pair, never a qualification run.
const profileDirectory = profile
  ? resolve(roots.integratedBend, ".test-runs/bend-migration/profiles", startedAt.replaceAll(":", "-"))
  : undefined
if (profileDirectory) mkdirSync(profileDirectory, { recursive: true })
const files = {
  "a.ts": "type Count = number\n",
  "b.ts": "type OtherCount = number\n",
  "rule.jsonc": JSON.stringify({
    version: 1,
    id: "domain",
    question: "Is a domain value a bare primitive?",
    criteria: { false: "No", true: "Yes" },
    threshold: 0.7,
    message: "Use a domain type",
    inputs: [{ languages: ["typescript"], kind: "type", requires: ["root-declaration"] }]
  }),
  ".hapsland.jsonc": JSON.stringify({ version: 1, rules: [{ path: "rule.jsonc" }] }),
  "user.jsonc": JSON.stringify({ version: 1, claudeFeedbackMode: "advisory" })
}
try {
  execFileSync("git", ["init", "-q", temporary])
  for (const [name, source] of Object.entries(files)) writeFileSync(join(temporary, name), source)
  execFileSync("git", ["-C", temporary, "add", "a.ts", "b.ts"])
  writeFileSync(fixture, JSON.stringify({ root: temporary, userConfigPath: join(temporary, "user.jsonc") }))
  const workerEnvironment = (lane) => {
    const environment = { ...process.env }
    if (lane === "typescript" && process.env.HAPSLAND_PERFORMANCE_BASELINE_ENV) {
      for (const [name, value] of Object.entries(JSON.parse(process.env.HAPSLAND_PERFORMANCE_BASELINE_ENV))) {
        if (value === null) delete environment[name]
        else environment[name] = value
      }
    }
    if (profile) environment.HAPSLAND_DELIVERY_PROFILE_INTERVALS = "1"
    return environment
  }
  const invoke = (lane, mode) =>
    execFileSync(
      "taskset",
      [
        "-c",
        "11",
        join(roots.integratedBend, "node_modules/bun/bin/bun.exe"),
        ...(profileDirectory && mode === "measure"
          ? [
              "--cpu-prof",
              "--cpu-prof-interval=5000",
              `--cpu-prof-dir=${profileDirectory}`,
              `--cpu-prof-name=${lane}.cpuprofile`
            ]
          : []),
        worker,
        roots[lane],
        mode,
        fixture,
        golden
      ],
      {
        env: workerEnvironment(lane),
        encoding: "utf8",
        timeout: Math.min(45_000, Math.max(1, stop - Date.now())),
        maxBuffer: 8 * 1024 * 1024
      }
    )
  invoke("typescript", "prepare")
  for (let pair = 0; pair < (probe ? 1 : 17); pair++) {
    const lanes = Object.keys(roots)
    if (pair % 2) lanes.reverse()
    for (const lane of lanes) {
      assert.ok(Date.now() < stop)
      const sample = JSON.parse(invoke(lane, "measure"))
      assert.ok(sample.definedAndEqual)
      assert.equal(sample.fixtures.length, 5)
      samples[lane].push(sample)
      console.log(JSON.stringify({ pair, lane, ...sample }))
    }
  }
  if (probe) {
    console.log(JSON.stringify({ probe: true, passed: true, profileDirectory }))
  } else {
    const mean = (values) => values.reduce((sum, sample) => sum + sample.seconds, 0) / values.length
    const meanRatio = mean(samples.integratedBend) / mean(samples.typescript)
    const fixtureRatios = samples.typescript[0].fixtures.map(({ name }, index) => ({
      name,
      meanRatio:
        mean(samples.integratedBend.map((sample) => sample.fixtures[index])) /
        mean(samples.typescript.map((sample) => sample.fixtures[index]))
    }))
    const record = {
      startedAt,
      terminalAt: new Date().toISOString(),
      roots,
      samples,
      fixtureRatios,
      fixtureSourcesSha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
      expectedResultsSha256: createHash("sha256").update(readFileSync(golden)).digest("hex"),
      measuredPairs: 17,
      meanRatio,
      deliveryParity: meanRatio <= 1,
      deliveryAcceptanceRatioLimit: 3,
      // The owner budget applies to the whole fixed consumer, as in Preparation.
      // Keep every scenario ratio visible; an extra per-scenario gate was not accepted.
      deliveryPerformanceAccepted: meanRatio <= 3,
      scope:
        "public local empty/ready, actual IPC empty/ready and single-pass ready edit; real source freshness and final authorization; fresh runtime per invocation; actual controlled preparation and verified release/Scope cleanup outside timers"
    }
    assert.ok(process.env.HAPSLAND_PERFORMANCE_OUTPUT)
    writeFileSync(process.env.HAPSLAND_PERFORMANCE_OUTPUT, JSON.stringify(record, null, 2) + "\n")
    console.log(JSON.stringify({ meanRatio, fixtureRatios, deliveryParity: record.deliveryParity }))
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
