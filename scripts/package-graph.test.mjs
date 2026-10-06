import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { generatePackageConfigs, packageTypeScriptConfig, readPackageGraph } from "./package-graph.mjs"

const fixture = (t, manifests) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-package-graph-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspaces = Object.keys(manifests).map((name) => `packages/${name}`)
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces }))
  for (const [name, values] of Object.entries(manifests)) {
    const path = join(root, "packages", name)
    mkdirSync(path, { recursive: true })
    writeFileSync(
      join(path, "package.json"),
      JSON.stringify({ name: `@hapsland/${name}`, private: true, type: "module", ...values })
    )
  }
  return root
}

test("manifest changes regenerate dependency-first references without a second graph", (t) => {
  const root = fixture(t, {
    input: {},
    hook: { dependencies: { "@hapsland/input": "workspace:*" } },
    pi: { dependencies: { "@hapsland/input": "workspace:*" }, hapsland: { host: "node" } }
  })
  const graph = generatePackageConfigs(root)
  assert.ok(graph.order.indexOf("@hapsland/input") < graph.order.indexOf("@hapsland/hook"))
  assert.deepEqual(packageTypeScriptConfig(graph, "@hapsland/hook").references, [{ path: "../input/tsconfig.json" }])
  assert.deepEqual(packageTypeScriptConfig(graph, "@hapsland/pi").compilerOptions.customConditions, ["node"])
  generatePackageConfigs(root, true)
  writeFileSync(
    join(root, "packages/hook/package.json"),
    JSON.stringify({
      name: "@hapsland/hook",
      private: true,
      type: "module",
      dependencies: { "@hapsland/pi": "workspace:*" }
    })
  )
  assert.throws(() => generatePackageConfigs(root, true), /Stale generated configuration/)
  const updated = generatePackageConfigs(root)
  assert.deepEqual(packageTypeScriptConfig(updated, "@hapsland/hook").references, [{ path: "../pi/tsconfig.json" }])
})

test("cyclic and unresolved workspace declarations fail before build scheduling", (t) => {
  const cyclic = fixture(t, {
    hook: { dependencies: { "@hapsland/input": "workspace:*" } },
    input: { dependencies: { "@hapsland/hook": "workspace:*" } }
  })
  assert.throws(() => readPackageGraph(cyclic), /dependency cycle/)
  const missing = fixture(t, { hook: { dependencies: { "@hapsland/missing": "workspace:*" } } })
  assert.throws(() => readPackageGraph(missing), /Unknown workspace dependency/)
})

test("unsupported workspace and host branches cannot silently produce configurations", (t) => {
  const root = fixture(t, { pi: { hapsland: { host: "unknown" } } })
  assert.throws(() => generatePackageConfigs(root), /Unsupported compilation host/)
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }))
  assert.throws(() => readPackageGraph(root), /Unsupported workspace declaration/)
})
