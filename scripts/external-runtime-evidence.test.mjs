import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, chmodSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { standaloneBuiltin, externalRuntimeEvidence } from "./external-runtime-evidence.mjs"

test("reused external syntax observes changed target bytes, modes and missing files", (t) => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "hapsland-external-freshness-")))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, "packages/fixture/src"), { recursive: true })
  mkdirSync(resolve(root, "node_modules/dependency"), { recursive: true })
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({ workspaces: ["packages/fixture"], hapsland: { buildBoundaries: {} } })
  )
  writeFileSync(
    resolve(root, "packages/fixture/package.json"),
    JSON.stringify({ name: "fixture", private: true, type: "module" })
  )
  const manifest = resolve(root, "node_modules/dependency/package.json")
  const module = resolve(root, "node_modules/dependency/index.js")
  const target = resolve(root, "node_modules/dependency/target.js")
  writeFileSync(manifest, JSON.stringify({ name: "dependency", main: "index.js" }))
  writeFileSync(module, 'module.exports = require("./target.js")')
  writeFileSync(target, "module.exports = 1")
  const inputs = [{ ...fileEvidence(root, module), external: "dependency", manifest: fileEvidence(root, manifest) }]
  const observe = () =>
    externalRuntimeEvidence(root, inputs, [], new Map(), "bun-linux-arm64", undefined, "packages/fixture/src/entry.js")
  const before = observe()[0]
  writeFileSync(target, "module.exports = 2")
  chmodSync(target, 0o755)
  const after = observe()[0]
  assert.equal(after.sha256, before.sha256)
  assert.notEqual(after.edges[0].target.sha256, before.edges[0].target.sha256)
  assert.equal(after.edges[0].target.mode, 0o755)
  rmSync(target)
  assert.throws(observe, /ENOENT|Cannot find module/)
  writeFileSync(module, "module.exports = require(name)")
  inputs[0] = { ...inputs[0], ...fileEvidence(root, module) }
  assert.throws(observe, /computed require/)
})

test("receipt verification uses the Bun standalone ws compatibility module", () => {
  assert.equal(standaloneBuiltin("ws"), true)
  assert.equal(standaloneBuiltin("node:fs"), true)
  assert.equal(standaloneBuiltin("bun:ffi"), true)
  for (const specifier of ["ws/index.js", "ws/anything", "effect", "bun:unknown"])
    assert.equal(standaloneBuiltin(specifier), false)
})

test("AST-resolved edges enforce forbidden owner capabilities and package names", async () => {
  const { assertExternalEdgePolicy } = await import("./external-runtime-evidence.mjs")
  const graph = {
    packages: new Map([
      ["allowed", { manifest: { hapsland: { capabilities: ["read"] } } }],
      ["forbidden", { manifest: { hapsland: { capabilities: ["admin"] } } }]
    ])
  }
  const policy = { forbiddenCapabilities: ["admin"], forbiddenExternalPackages: ["tree-sitter"] }
  assertExternalEdgePolicy(graph, policy, { owner: "allowed" }, "asset.js")
  assert.throws(
    () => assertExternalEdgePolicy(graph, policy, { owner: "forbidden" }, "asset.js"),
    /Forbidden external loader workspace/
  )
  assert.throws(
    () => assertExternalEdgePolicy(graph, policy, { owner: "missing" }, "asset.js"),
    /Forbidden external loader workspace/
  )
  assert.throws(
    () => assertExternalEdgePolicy(graph, policy, { external: "tree-sitter" }, "asset.js"),
    /Forbidden external loader package/
  )
})
