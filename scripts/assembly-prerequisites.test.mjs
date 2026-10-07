import { readPackageGraph } from "./package-graph.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { assemblyFixture } from "./assembly-test-fixture.mjs"
import {
  checkAssemblyPrerequisite,
  createAssemblyPrerequisites,
  requiredAssemblyNativePaths,
  assemblyNativeArtifacts,
  writeAssemblyPrerequisites
} from "./assembly-prerequisites.mjs"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
test("unrelated administration source changes preserve component projections", (t) => {
  const f = assemblyFixture(t),
    before = f.snapshots.get("cli/linux-arm64")
  f.write("packages/doctor/src/main.ts", "export const value=2;")
  const after = createAssemblyPrerequisites(f.root, f.graph, f.analysis, { "pi-extension": [] }, ["linux-arm64"]).get(
    "cli/linux-arm64"
  )
  assert.deepEqual(after, before)
  assert.deepEqual(checkAssemblyPrerequisite(f.root, before), before.analysis)
  assert.throws(
    () => checkAssemblyPrerequisite(f.root, f.snapshots.get("doctor/linux-arm64")),
    /Stale assembly prerequisite/
  )
})
test("missing source records and changed policy cannot authorize a component", (t) => {
  const f = assemblyFixture(t),
    snapshot = structuredClone(f.snapshots.get("pi-extension/host"))
  snapshot.analysis.records.pop()
  assert.throws(() => checkAssemblyPrerequisite(f.root, snapshot), /Unaccounted source contribution/)
  const changed = structuredClone(f.snapshots.get("cli/linux-arm64"))
  changed.policy.forbiddenCapabilities.push("administration")
  assert.throws(() => checkAssemblyPrerequisite(f.root, changed), /owner or policy changed/)
})
test("private admission token never enters stable task snapshots", (t) => {
  const f = assemblyFixture(t)
  writeAssemblyPrerequisites(f.root, f.snapshots, { token: "lease-secret" })
  const text = readFileSync(resolve(f.root, ".test-runs/assembly-prerequisites/cli/linux-arm64.json"), "utf8")
  assert.doesNotMatch(text, /lease-secret/)
  assert.throws(
    () => checkAssemblyPrerequisite(f.root, f.snapshots.get("cli/linux-arm64"), { owner: "@hapsland/cli" }),
    /ENOENT|admission/
  )
})
test("component native proof includes only selected owners and rejects changed binary bytes", (t) => {
  const f = assemblyFixture(t)
  const path = resolve(f.root, "packages/cli/package.json"),
    manifest = JSON.parse(readFileSync(path, "utf8"))
  const realManifest = JSON.parse(
    readFileSync(fileURLToPath(new URL("../packages/credential-storage/package.json", import.meta.url)), "utf8")
  )
  const declaration = structuredClone(realManifest.hapsland.nativeAssets[0])
  declaration.source = "src/main.ts"
  manifest.hapsland.nativeAssets = [declaration]
  const installedPath = declaration.path.replace("{profile}", "linux-arm64")
  const nativeName = installedPath.slice("native/prebuilt/linux-arm64/".length)
  f.write("packages/cli/package.json", JSON.stringify(manifest))
  f.write(`packages/cli/artifacts/native/linux-arm64/${nativeName}`, "native bytes")
  f.write("packages/cli/artifacts/native/linux-arm64/.native-task-receipt.json", "verified native receipt")
  const graph = readPackageGraph(f.root)
  const physicalPath = resolve(f.root, `packages/cli/artifacts/native/linux-arm64/${nativeName}`)
  const native = {
    assets: [{ owner: "@hapsland/cli", physicalPath, installedPath }],
    receipts: [
      {
        owner: "@hapsland/cli",
        path: resolve(f.root, "packages/cli/artifacts/native/linux-arm64/.native-task-receipt.json")
      }
    ]
  }
  assert.throws(
    () => createAssemblyPrerequisites(f.root, graph, f.analysis, { "pi-extension": [] }, ["linux-arm64"]),
    /Missing verified native prerequisite/
  )
  const snapshot = createAssemblyPrerequisites(
    f.root,
    graph,
    f.analysis,
    { "pi-extension": [] },
    ["linux-arm64"],
    new Map([["linux-arm64", native]])
  ).get("cli/linux-arm64")
  assert.deepEqual(requiredAssemblyNativePaths(graph, "linux-arm64", [{ source: "packages/cli/src/main.ts" }]), [
    installedPath
  ])
  assert.deepEqual(requiredAssemblyNativePaths(graph, "linux-arm64", [{ source: "packages/doctor/src/main.ts" }]), [])
  assert.equal(assemblyNativeArtifacts(f.root, snapshot).assets[0].physicalPath, physicalPath)
  assert.equal(snapshot.native.assets.length, 1)
  assert.equal(snapshot.native.receipts.length, 1)
  checkAssemblyPrerequisite(f.root, snapshot)
  f.write(`packages/cli/artifacts/native/linux-arm64/${nativeName}`, "changed native bytes")
  assert.throws(() => checkAssemblyPrerequisite(f.root, snapshot), /Stale native assembly prerequisite/)
})
