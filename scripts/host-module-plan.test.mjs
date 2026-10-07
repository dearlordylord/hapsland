import { test } from "node:test"
import assert from "node:assert/strict"
import { hostModuleImports } from "./host-module-imports.mjs"
import { hostModulePlan } from "./host-module-plan.mjs"
const fixture = () => {
  const text = 'import { x } from "shared/x"; export * from "shared/x"; const label = "shared/x";'
  return [
    {
      path: "entry.js",
      text,
      mode: 0o644,
      imports: hostModuleImports(text, "entry.js").map((edge) => ({ ...edge, target: "shared.js" }))
    },
    { path: "shared.js", text: "export const x = 1;", mode: 0o644, imports: [] }
  ]
}
const destination = (record) => (record.path === "entry.js" ? "dist/pi/extension.js" : "dist/runtime/shared.js")
test("rewrites every parsed edge while preserving ordinary strings", () => {
  const result = hostModulePlan(fixture(), destination)
  assert.equal(
    result[0].text,
    'import { x } from "../runtime/shared.js"; export * from "../runtime/shared.js"; const label = "shared/x";'
  )
  assert.equal(result[0].imports.length, 2)
  assert.ok(result.every((record) => /^[a-f0-9]{64}$/.test(record.sha256)))
})
test("rejects incomplete graphs before output preparation", () => {
  assert.throws(() => hostModulePlan(fixture().slice(0, 1), destination), /Missing host output target/)
})
test("rejects destination collisions", () => {
  assert.throws(() => hostModulePlan(fixture(), () => "dist/pi/extension.js"), /collision/)
})
test("rejects destination traversal", () => {
  assert.throws(() => hostModulePlan(fixture(), () => "dist/../outside.js"), /Invalid host output/)
})
test("rejects stale import evidence instead of rewriting incorrect string ranges", () => {
  const records = fixture()
  records[0].text = "// prefix\n" + records[0].text
  assert.throws(() => hostModulePlan(records, destination), /evidence disagrees/)
})
