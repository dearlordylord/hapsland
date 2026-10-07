import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { hostModuleGraph } from "./host-module-graph.mjs"
function fixture(work) {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-host-graph-"))
  const packages = new Map(
    ["entry", "shared"].map((name) => [
      name,
      {
        path: resolve(root, name),
        dependencies: name === "entry" ? ["shared"] : [],
        manifest: { name, exports: { "./value": { default: "./dist/value.js" } } }
      }
    ])
  )
  for (const name of packages.keys()) mkdirSync(resolve(root, name, "dist"), { recursive: true })
  const write = (path, text) => writeFileSync(resolve(root, path), text)
  write("entry/dist/main.js", 'export * from "shared/value"; import "node:url";')
  write("shared/dist/value.js", 'export { value } from "./inner.js";')
  write("shared/dist/inner.js", "export const value = 1;")
  try {
    work(root, { packages }, write)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
test("walks workspace exports and relative reexports, retaining actual input evidence", () =>
  fixture((root, graph) => {
    const result = hostModuleGraph(root, graph, resolve(root, "entry/dist/main.js"))
    assert.equal(result.length, 3)
    assert.ok(result.every((record) => /^[a-f0-9]{64}$/.test(record.sha256)))
    assert.equal(result[0].imports[0].target, "shared/dist/value.js")
  }))
test("cyclic module reexports terminate without losing edges", () =>
  fixture((root, graph, write) => {
    write("shared/dist/inner.js", 'export * from "./value.js";')
    assert.equal(hostModuleGraph(root, graph, resolve(root, "entry/dist/main.js")).length, 3)
  }))
test("rejects undeclared dependencies", () =>
  fixture((root, graph) => {
    graph.packages.get("entry").dependencies = []
    assert.throws(() => hostModuleGraph(root, graph, resolve(root, "entry/dist/main.js")), /Undeclared host dependency/)
  }))
test("rejects a relative escape into another owner", () =>
  fixture((root, graph, write) => {
    write("entry/dist/main.js", 'import "../../shared/dist/value.js";')
    assert.throws(() => hostModuleGraph(root, graph, resolve(root, "entry/dist/main.js")), /crosses owner/)
  }))
test("a missing transitive output cannot produce a graph", () =>
  fixture((root, graph) => {
    rmSync(resolve(root, "shared/dist/inner.js"))
    assert.throws(() => hostModuleGraph(root, graph, resolve(root, "entry/dist/main.js")), /ENOENT/)
  }))
