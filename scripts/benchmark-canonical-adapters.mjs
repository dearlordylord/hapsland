import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
// Same deterministic trace on any checkout; observations, not an elapsed-time budget.
// Pass a checkout root to compare revisions without changing the workload.
const root = process.argv[2] ?? resolve(import.meta.dirname, "..")
console.log(JSON.stringify({ node: process.version, arch: process.arch, samples: 5, loops: 500 }))
const { initialCanonical, stepCanonical, projectCanonical } = await import(
  pathToFileURL(`${root}/packages/canonical-policy/src/canonical/adapter.ts`)
)
const { initialImportGraph, stepImportGraph, projectImportGraph } = await import(
  pathToFileURL(`${root}/packages/canonical-policy/src/canonical/graph-adapter.ts`)
)
const loops = 500
function canonical() {
  let state = initialCanonical({ globalItems: 16, globalBytes: 8192, partitionItems: 16, partitionBytes: 8192 })
  for (let i = 0; i < loops; i++) {
    const added = stepCanonical(state, { kind: "reserveCapacity", partition: 1, bytes: 16, purpose: "preparation" })
    const id = added.commands[0].id
    state = stepCanonical(added.state, { kind: "releaseCapacity", reservation: id }).state
    if (projectCanonical(state).global.bytes !== 0) throw new Error("trace invariant")
  }
}
function graph() {
  for (let i = 0; i < loops; i++) {
    let state = initialImportGraph()
    for (const event of [
      { kind: "root", target: 1, sourceBytes: 100, treeBytes: 50, edges: [2] },
      { kind: "next" },
      { kind: "resolved", target: 2, result: "found" },
      { kind: "pathChecked", allowed: true },
      { kind: "captured", sourceBytes: 100, treeBytes: 50, edges: [] },
      { kind: "next" }
    ])
      state = stepImportGraph(state, event).state
    if (projectImportGraph(state).phase !== "complete") throw new Error("graph invariant")
  }
}
canonical()
graph()
for (const [name, fn] of [
  ["canonical", canonical],
  ["graph", graph]
]) {
  const samples = []
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    fn()
    samples.push(Number((performance.now() - start).toFixed(2)))
  }
  console.log(JSON.stringify({ trace: name, loops, samplesMs: samples }))
}
