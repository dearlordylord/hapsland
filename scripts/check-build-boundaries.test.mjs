import { test } from "node:test"
import assert from "node:assert/strict"
import { assemblyFixture } from "./assembly-test-fixture.mjs"
import { checkBuildBoundary, checkBuildBoundaries } from "./check-build-boundaries.mjs"
test("scoped boundary requires all selected records without unrelated role records", (t) => {
  const f = assemblyFixture(t),
    selected = f.snapshots.get("pi-extension/host").analysis
  assert.deepEqual(checkBuildBoundary(f.root, selected, "pi-extension"), [
    "packages/pi/src/pi/extension.ts",
    "packages/runtime/src/runtime/value.ts"
  ])
  assert.throws(() => checkBuildBoundaries(f.root, selected), /Missing required build boundary: standalone-hook/)
  const incomplete = structuredClone(selected)
  incomplete.records.pop()
  assert.throws(() => checkBuildBoundary(f.root, incomplete, "pi-extension"), /Unaccounted source contribution/)
  const escaped = structuredClone(selected)
  escaped.records[0].imports.push({ specifier: "@effect/ai", external: "@effect/ai" })
  assert.throws(() => checkBuildBoundary(f.root, escaped, "pi-extension"), /Forbidden build boundary dependency/)
})
