import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { magic } from "./recording-launch.mjs"

const owner = dirname(fileURLToPath(import.meta.url))
const evidence = resolve(owner, "../../.test-runs")
mkdirSync(evidence, { recursive: true })
const directory = mkdtempSync(join(evidence, "game-recording-"))
const deadline = Date.now() + 380000
const stages = []
function run(label, program, args, cap, environment = process.env) {
  const timeout = Math.min(cap, deadline - Date.now())
  assert.ok(timeout > 0, "Recording qualification deadline expired")
  console.log(`Recording check: ${label}`)
  const started = Date.now()
  const result = spawnSync(program, args, { cwd: owner, env: { ...environment, BEND_NO_TELEMETRY: "1" },
    encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 })
  writeFileSync(join(directory, `${label}.log`), result.stdout + result.stderr)
  stages.push({ label, program, args, elapsedMs: Date.now() - started, exit: result.status,
    error: result.error?.message ?? null, signal: result.signal })
  writeFileSync(join(directory, "receipt.json"), JSON.stringify({ stages }, null, 2) + "\n")
  assert.equal(result.status, 0, `${label}: ${result.error?.message ?? result.stderr}; logs: ${directory}`)
  return result.stdout
}
const header = magic + "a".repeat(64)
const fixture = join(owner, "DefenseRecordingTests.bend")
run("source", "bend", [fixture, "--check-only"], 5000)
const compilerVersion = spawnSync(process.env.CC ?? "clang", ["--version"], { encoding: "utf8", timeout: 5000 }).stdout
const nativeEnv = process.platform === "darwin" && process.arch === "arm64" && /Apple clang version 21\./.test(compilerVersion)
  ? { ...process.env, BEND_CANONICAL_DEFENSE_CC: process.env.CC ?? "clang", CC: join(owner, "clang-no-stack-check.sh") }
  : process.env
run("native-build", "bend", [fixture, "-o", join(directory, "native")], 300000, nativeEnv)
run("javascript-build", "bend", [fixture, "-o", join(directory, "fixture.js")], 30000)
const results = []
for (const lane of ["native", "javascript"]) {
  const path = join(directory, `${lane}.bin`)
  const environment = { ...process.env, HAPSLAND_GAME_RECORDING: path, HAPSLAND_GAME_RECORDING_HEADER: header }
  results.push(lane === "native" ? run(lane, join(directory, "native"), ["--threads", "4"], 15000, environment)
    : run(lane, "bun", [join(directory, "fixture.js")], 15000, environment))
  const saved = readFileSync(path)
  assert.equal(saved.length, 92, "new game retains only its header and map")
  assert.equal(saved.subarray(0, 80).toString(), header)
  assert.equal(saved.readUInt32LE(80), 0)
  assert.equal(saved.readUInt32LE(84), 1)
  assert.equal(saved.readUInt32LE(88), 0)
}
assert.equal(results[0], results[1], "native and JavaScript behavioral predicates agree")
assert.equal(results[0].split("\n").filter(line => line.startsWith("PASS ")).length, 7)
console.log(results[0].trim())
console.log(`Recording qualification passed; retained logs: ${directory}`)
