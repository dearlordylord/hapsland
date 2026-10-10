import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
const roots = { typescript: "/workspace/typescript/hapsland-bend-baseline", integratedBend: "/workspace/typescript/hapsland-bend-strangler" }
const samples = { typescript: [], integratedBend: [] }
const startedAt = new Date().toISOString()
const samplePairs = Number(process.env.HAPSLAND_STARTUP_SAMPLE_PAIRS ?? 41)
assert.ok(Number.isInteger(samplePairs) && samplePairs >= 41 && samplePairs <= 121 && samplePairs % 2 === 1)
const deadline = performance.now() + 120000
function run(root) {
  const start = performance.now()
  const result = spawnSync("python3", ["-c", "import resource, subprocess, sys, time; started = time.perf_counter_ns(); result = subprocess.run(sys.argv[1:]); elapsed = (time.perf_counter_ns() - started) / 1000000; usage = resource.getrusage(resource.RUSAGE_CHILDREN); print(f'HAPSLAND_CPU {usage.ru_utime} {usage.ru_stime} HAPSLAND_WALL {elapsed}', file=sys.stderr); sys.exit(result.returncode)", "taskset", "-c", "11", "bun", "packages/cli-entry/dist/cli.js", "--help"], { cwd: root, timeout: Math.min(5000, deadline - start), encoding: "utf8", maxBuffer: 1024 * 1024 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Hapsland/)
  const timing = /HAPSLAND_CPU ([0-9.]+) ([0-9.]+) HAPSLAND_WALL ([0-9.]+)\n$/.exec(result.stderr)
  assert.ok(timing)
  const stderr = result.stderr.slice(0, timing.index)
  return { cpuSeconds: Number(timing[1]) + Number(timing[2]), milliseconds: Number(timing[3]), wrapperMilliseconds: performance.now() - start, stdoutBytes: Buffer.byteLength(result.stdout), stderrBytes: Buffer.byteLength(stderr), stdoutSha256: createHash("sha256").update(result.stdout).digest("hex"), stderrSha256: createHash("sha256").update(stderr).digest("hex"), exitCode: result.status }
}
for (const root of Object.values(roots)) run(root)
for (let round = 0; round < samplePairs; round++) {
  const lanes = Object.entries(roots)
  if (round % 2) lanes.reverse()
  for (const [name, root] of lanes) samples[name].push(run(root))
}
assert.equal(new Set([...samples.typescript, ...samples.integratedBend].map(sample => sample.stdoutSha256)).size, 1)
assert.equal(new Set([...samples.typescript, ...samples.integratedBend].map(sample => sample.stderrSha256)).size, 1)
const median = values => values.map(sample => sample.milliseconds).sort((a,b) => a-b)[Math.floor(values.length / 2)]
const ratio = median(samples.integratedBend) / median(samples.typescript)
const cpuRatio = samples.integratedBend.reduce((sum, sample) => sum + sample.cpuSeconds, 0) / samples.typescript.reduce((sum, sample) => sum + sample.cpuSeconds, 0)
const record = { startedAt, at: new Date().toISOString(), roots, samplePairs, command: ["bun", "packages/cli-entry/dist/cli.js", "--help"], samples, cpuRatio, cpuParity: cpuRatio <= 1, affinity: "CPU 11 for both lanes; not exclusive", cpuResolutionSeconds: 0.000001, medianRatio: ratio, startupParity: ratio <= 1, wallTiming: "Python monotonic timer around taskset/Bun child; outer wrapper duration retained per sample", scope: "fresh Bun processes with warm filesystem caches; compiled CLI help import and dispatch; identical output hashes; no installed bundle, Jev request, interactive journey or platform support claim" }
writeFileSync("evidence/bend-strangler/startup-performance.json", JSON.stringify(record, null, 2) + "\n")
console.log(JSON.stringify({ cpuRatio, cpuParity: cpuRatio <= 1, affinity: "CPU 11 for both lanes; not exclusive", cpuResolutionSeconds: 0.000001, medianRatio: ratio, startupParity: record.startupParity }))
