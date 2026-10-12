import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const roots = {
  typescript: process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT,
  integratedBend: process.env.HAPSLAND_PERFORMANCE_CANDIDATE_ROOT
}
assert.ok(roots.typescript && roots.integratedBend)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-preparation-bench-"))
const goldenPath = join(temporary, "golden.json"),
  fixturePath = join(temporary, "fixtures.json")
const worker = resolve(import.meta.dirname, "preparation-worker.mjs")
const bun = join(roots.integratedBend, "node_modules/bun/bin/bun.exe")
const startedAt = new Date().toISOString(),
  stop = Date.now() + 180000
const samples = { typescript: [], integratedBend: [] }
const sources = [
  { "root.ts": "export interface Root { value: string }\n" },
  { "root.py": "class Root:\n value: str\n" },
  {
    "root.go": "package fixture\ntype Root struct { Value string }\n",
    "go.mod": "module example.test/fixture\ngo 1.27\n"
  },
  { "root.rs": "pub struct Root { pub value: String }\n" },
  { "root.bend": "type Root is Data:\n  Root{}\n" },
  {
    "root.ts": "import type { Support } from './support'; export interface Root { value: Support }\n",
    "support.ts": "export interface Support { value: string }\n"
  },
  { "root.ts": "type Broken = import('./missing').Value\n" }
]
try {
  const fixtures = sources.map((files, index) => {
    const root = join(temporary, String(index))
    mkdirSync(root)
    execFileSync("git", ["init", "-q", root])
    for (const [path, source] of Object.entries(files)) writeFileSync(join(root, path), source)
    return { root, paths: [Object.keys(files)[0]] }
  })
  writeFileSync(fixturePath, JSON.stringify(fixtures))
  const invoke = (root, mode) =>
    execFileSync("taskset", ["-c", "11", bun, worker, root, mode, fixturePath, goldenPath], {
      encoding: "utf8",
      timeout: Math.min(15000, stop - Date.now()),
      maxBuffer: 8 * 1024 * 1024
    })
  invoke(roots.typescript, "prepare")
  for (let pair = 0; pair < 17; pair++) {
    const lanes = Object.entries(roots)
    if (pair % 2) lanes.reverse()
    for (const [lane, root] of lanes) {
      assert.ok(Date.now() < stop)
      const sample = JSON.parse(invoke(root, "measure"))
      assert.ok(sample.definedAndEqual)
      samples[lane].push(sample)
      console.log(JSON.stringify({ pair, lane, ...sample }))
    }
  }
  assert.equal(
    new Set(
      Object.values(samples)
        .flat()
        .map((sample) => sample.checksum)
    ).size,
    1
  )
  const mean = (values) => values.reduce((sum, value) => sum + value.seconds, 0) / values.length
  const meanRatio = mean(samples.integratedBend) / mean(samples.typescript)
  const record = {
    startedAt,
    terminalAt: new Date().toISOString(),
    roots,
    measuredPairs: 17,
    samples,
    meanRatio,
    preparationParity: meanRatio <= 1,
    scope:
      "actual compiled public prepareObservation: Canonical lifecycle, Preparation/Graph, physical capture/parser/rendering and result acceptance; seven offline fixtures, all five languages, recursive supporting capture and original import failure; full JSON equality against fixed baseline on every call; three warmups then two whole rounds per worker; 17 alternating isolated Bun pairs on CPU11; setup/import/startup excluded; not dispatch, maximal capacity or platform performance"
  }
  writeFileSync(process.env.HAPSLAND_PERFORMANCE_OUTPUT, JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify({ meanRatio, preparationParity: record.preparationParity }))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
