import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"
import { createBuildWatchObserver } from "./build-watch-observation.mjs"
import { fileEvidence } from "./compiler-evidence.mjs"
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "haps-watch-observation-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const path of [
    "scripts",
    "packages/input/src",
    "packages/input/dist",
    "packages/input/artifacts/native/linux-arm64",
    "packages/bend/abi",
    "dist/bin",
    "native/prebuilt/darwin-arm64",
    ".test-runs"
  ])
    mkdirSync(resolve(root, path), { recursive: true })
  const put = (path, value) =>
    writeFileSync(resolve(root, path), typeof value === "string" ? value : JSON.stringify(value))
  put("package.json", { workspaces: ["packages/input", "packages/bend"] })
  put("packages/input/package.json", { name: "@probe/input", private: true, type: "module" })
  put("packages/bend/package.json", {
    name: "@probe/bend",
    private: true,
    type: "module",
    hapsland: { compiler: "bend", abi: {} }
  })
  for (const path of [
    "tsconfig.json",
    "tsconfig.package.json",
    "tsconfig.packages.json",
    "turbo.json",
    "packages/input/tsconfig.json"
  ])
    put(path, {})
  put("bun.lock", "lock")
  put("scripts/tool.mjs", "export {}")
  put("packages/input/src/input.ts", "export {}")
  put("packages/input/dist/input.js", "export {}")
  put("packages/bend/Main.bend", "def main = 1")
  put("packages/input/artifacts/native/linux-arm64/helper", "native output")
  put("dist/bin/hook", "hook")
  put("native/prebuilt/darwin-arm64/helper", "foreign supplier")
  put(".test-runs/runtime", "runtime identity")
  const observe = createBuildWatchObserver(root, {
    observeDependencies: async () => "dependencies",
    observeRuntime: async () => fileEvidence(root, resolve(root, ".test-runs/runtime")),
    observeNative: async () => fileEvidence(root, resolve(root, "native/prebuilt/darwin-arm64/helper"))
  })
  return { root, put, observe }
}
test("watch accepts generated root configuration without a deleted Bend-local Turbo file", async (t) => {
  const { observe } = fixture(t)
  assert.deepEqual(await observe(), await observe())
})
for (const path of [
  "dist/bin/hook",
  "packages/input/dist/input.js",
  "packages/input/artifacts/native/linux-arm64/helper"
])
  test(`declared artifact deletion triggers repair observation: ${path}`, async (t) => {
    const { root, observe } = fixture(t),
      before = await observe()
    rmSync(resolve(root, path))
    const after = await observe()
    assert.equal(after.source, before.source)
    assert.notEqual(after.output, before.output)
  })
for (const path of [
  "native/prebuilt/darwin-arm64/helper",
  ".test-runs/runtime",
  "packages/bend/Main.bend",
  "packages/input/src/added.ts"
])
  test(`watch admission sees changed supplier or source: ${path}`, async (t) => {
    const { observe, put } = fixture(t),
      before = await observe()
    put(path, "changed identity")
    assert.notEqual((await observe()).source, before.source)
  })
