import { test } from "node:test"
import assert from "node:assert/strict"
import { resolve } from "node:path"
import { assemblyFixture } from "./assembly-test-fixture.mjs"
import { assemblyContext } from "./assembly-context.mjs"
test("assembly context contains only the selected component proof and actual runtime identity", async (t) => {
  const f = assemblyFixture(t),
    snapshot = f.snapshots.get("cli/linux-arm64"),
    runtime = { version: "fixture", executable: resolve(f.root, "compiler") }
  const before = await assemblyContext(f.root, "bun-linux-arm64", runtime, snapshot)
  f.write("packages/doctor/src/main.ts", "changed unrelated body")
  assert.deepEqual(await assemblyContext(f.root, "bun-linux-arm64", runtime, snapshot), before)
  assert.equal(
    snapshot.configuration.find((file) => file.path.includes("doctor")),
    undefined
  )
  await assert.rejects(assemblyContext(f.root, "bun-darwin-arm64", runtime, snapshot), /target disagrees/)
  f.write("compiler", "changed runtime")
  await assert.rejects(assemblyContext(f.root, "bun-linux-arm64", runtime, snapshot), /Bun executable differs/)
})
