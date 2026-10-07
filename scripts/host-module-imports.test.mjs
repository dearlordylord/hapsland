import { test } from "node:test"
import assert from "node:assert/strict"
import { hostModuleImports } from "./host-module-imports.mjs"

test("accounts for static imports and both reexport forms by actual string range", () => {
  const text =
    'import { x } from "./x.js"; export { y } from "@hapsland/owner/y"; export * from "./z.js"; import "node:url";'
  const edges = hostModuleImports(text, "asset.js")
  assert.deepEqual(
    edges.map((edge) => edge.specifier),
    ["./x.js", "@hapsland/owner/y", "./z.js", "node:url"]
  )
  for (const edge of edges) assert.equal(JSON.parse(text.slice(edge.start, edge.end)), edge.specifier)
  assert.deepEqual(
    edges.map((edge) => edge.builtin),
    [false, false, false, true]
  )
})
test("comments and ordinary string values are not module edges", () => {
  assert.deepEqual(hostModuleImports('// import "hidden"\nconst text = "./fake.js"; export { text };', "asset.js"), [])
})
for (const text of [
  'import("./hidden.js")',
  'const load = require; load("hidden")',
  'globalThis["require"]("hidden")',
  'new Function("return 1")',
  'eval("hidden")',
  'import { createRequire } from "node:module"',
  'import * as vm from "node:vm"',
  'import "./data.json" with { type: "json" }'
])
  test("rejects unsupported host loader " + text, () => {
    assert.throws(() => hostModuleImports(text, "asset.js"), /Unsupported host module loader/)
  })
