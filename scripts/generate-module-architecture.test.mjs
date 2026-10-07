import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { test } from "node:test"
import { readPackageGraph } from "./package-graph.mjs"
import {
  architectureModuleModel,
  moduleArchitectureDocument,
  renderModuleArchitecture
} from "./module-architecture.mjs"

const root = resolve(import.meta.dirname, "..")
const annotations = JSON.parse(readFileSync(resolve(root, "scripts/architecture-descriptions.json"), "utf8"))
const graph = readPackageGraph(root)

test("one model retains every declared workspace edge and leaves scheduler semantics unchanged", () => {
  const before = JSON.stringify([...graph.workspaces])
  const model = architectureModuleModel(graph, annotations)
  const expected = [...graph.workspaces].flatMap(([from, node]) =>
    Object.entries(node.dependencyVersions).flatMap(([kind, declarations]) =>
      Object.keys(declarations)
        .filter((to) => graph.workspaces.has(to))
        .map((to) => ({ from, to, kind }))
    )
  )
  const key = ({ from, to, kind }) => `${from}:${to}:${kind}`
  assert.deepEqual(model.edges.map(key).sort(), expected.map(key).sort())
  assert.equal(model.nodes.length, graph.workspaces.size)
  assert.deepEqual(model.auxiliarySccs, graph.auxiliarySccs)
  assert.equal(JSON.stringify([...graph.workspaces]), before)
  const rendered = renderModuleArchitecture(model)
  for (const name of graph.workspaces.keys()) assert.ok(rendered.includes(name.replace("@hapsland/", "")))
  assert.match(rendered, /```mermaid/)
})

test("annotation drift fails instead of hiding a module or duplicating structural facts", () => {
  const missing = structuredClone(annotations)
  delete missing[Object.keys(missing)[0]]
  assert.throws(() => architectureModuleModel(graph, missing))
  assert.throws(() => architectureModuleModel(graph, { ...annotations, "@hapsland/unknown": { summary: "unknown" } }))
  const redundant = structuredClone(annotations)
  redundant[Object.keys(redundant)[0]].dependencies = []
  assert.throws(() => architectureModuleModel(graph, redundant))
})

test("generated block repair preserves prose and rejects ambiguous markers", () => {
  const model = architectureModuleModel(graph, annotations)
  const start = "<!-- architecture-modules:start -->"
  const end = "<!-- architecture-modules:end -->"
  const repaired = moduleArchitectureDocument(`before\n${start}\nstale\n${end}\nafter`, model)
  assert.ok(repaired.startsWith("before\n"))
  assert.ok(repaired.endsWith("\nafter"))
  assert.equal(moduleArchitectureDocument(repaired, model), repaired)
  for (const text of ["none", `${end}\n${start}`, `${start}\n${start}\n${end}`, `${start}\n${end}\n${end}`]) {
    assert.throws(() => moduleArchitectureDocument(text, model))
  }
})

test("ordinary CLI checks stale output without writing and repairs it on generation", () => {
  const fixture = mkdtempSync(resolve(tmpdir(), "hapsland-module-docs-"))
  try {
    mkdirSync(resolve(fixture, "scripts"))
    mkdirSync(resolve(fixture, "docs"))
    writeFileSync(resolve(fixture, "package.json"), JSON.stringify({ type: "module" }))
    for (const file of [
      "module-architecture.mjs",
      "generate-module-architecture.mjs",
      "architecture-descriptions.json"
    ]) {
      copyFileSync(resolve(root, "scripts", file), resolve(fixture, "scripts", file))
    }
    // CLI fixture isolates filesystem behavior; the preceding test checks the real reader's graph.
    writeFileSync(
      resolve(fixture, "scripts/package-graph.mjs"),
      `export const readPackageGraph = () => ({ workspaces: new Map(${JSON.stringify([...graph.workspaces])}), auxiliarySccs: ${JSON.stringify(graph.auxiliarySccs)} });`
    )
    const path = resolve(fixture, "docs/architecture.md")
    const stale = "intro\n<!-- architecture-modules:start -->\nstale\n<!-- architecture-modules:end -->\noutro\n"
    writeFileSync(path, stale)
    const run = (...args) =>
      spawnSync(process.execPath, [resolve(fixture, "scripts/generate-module-architecture.mjs"), ...args], {
        encoding: "utf8",
        timeout: 10000
      })
    const check = run("--check")
    assert.equal(check.status, 1, check.stderr)
    assert.equal(readFileSync(path, "utf8"), stale)
    const update = run()
    assert.equal(update.status, 0, update.stderr)
    assert.equal(run("--check").status, 0)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test("references preserve HTTPS contracts and escape table delimiters", () => {
  const changed = structuredClone(annotations)
  const name = Object.keys(changed)[0]
  changed[name].contracts = [
    { label: "External contract", target: "https://github.com/dearlordylord/hapsland/issues/225" },
    { label: "Pipe | label", target: "docs/status.md#one|two" }
  ]
  const rendered = renderModuleArchitecture(architectureModuleModel(graph, changed))
  assert.ok(rendered.includes("[External contract](https://github.com/dearlordylord/hapsland/issues/225)"))
  assert.ok(rendered.includes("docs/status.md#one%7Ctwo"))
  assert.ok(!rendered.includes("docs/status.md#one|two"))
  changed[name].contracts[0].target = "javascript:alert(1)"
  assert.throws(() => architectureModuleModel(graph, changed))
})
