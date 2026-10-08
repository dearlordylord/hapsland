import { spawnSync } from "node:child_process"
import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
const roots = { typescript: "/workspace/typescript/hapsland-bend-baseline", integratedBend: "/workspace/typescript/hapsland-bend-strangler" }
const startedAt = new Date().toISOString()
const stop = performance.now() + 300000
const samples = { typescript: [], integratedBend: [] }
for (let round = 0; round < 2; round++) {
  const lanes = Object.entries(roots)
  if (round % 2) lanes.reverse()
  for (const [name, root] of lanes) {
    const timeout = Math.min(150000, stop - performance.now())
    if (timeout <= 0) throw new Error("Build comparison deadline exhausted")
    const start = performance.now()
    const result = spawnSync(process.execPath, ["scripts/build-workspaces.mjs"], { cwd: root, timeout, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
    const cached = [...(result.stdout + result.stderr).matchAll(/Cached:\s+(\d+) cached, (\d+) total/g)].at(-1)
    const sample = { cachedTasks: cached ? Number(cached[1]) : null, totalTasks: cached ? Number(cached[2]) : null, seconds: (performance.now() - start) / 1000, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null }
    samples[name].push(sample)
    writeFileSync(`/tmp/hapsland-bend-build-${name}-${round}.log`, result.stdout + result.stderr)
    writeFileSync(new URL("./build-performance.json", import.meta.url), JSON.stringify({ startedAt, at: new Date().toISOString(), samples, scope: "paired warm workspace builds; baseline master a071b9b58 and current candidate; both separately prepared; native release assembly excluded" }, null, 2) + "\n")
    console.log(JSON.stringify({ lane: name, round, ...sample }))
    if (result.error || result.status !== 0) throw new Error(`Build comparison failed: ${name}; inspect retained log`)
  }
}
const mean = values => values.reduce((total, sample) => total + sample.seconds, 0) / values.length
const ratio = mean(samples.integratedBend) / mean(samples.typescript)
const record = { startedAt, at: new Date().toISOString(), roots, command: [process.execPath, "scripts/build-workspaces.mjs"], samples, meanRatio: ratio,
  buildParity: ratio <= 1, scope: "paired warm workspace builds; baseline master a071b9b58 and current candidate; both separately prepared; native release assembly excluded" }
writeFileSync(new URL("./build-performance.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
console.log(JSON.stringify({ meanRatio: ratio, buildParity: record.buildParity }))
