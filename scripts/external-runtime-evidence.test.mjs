import test from "node:test"
import assert from "node:assert/strict"
import { standaloneBuiltin } from "./external-runtime-evidence.mjs"

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
