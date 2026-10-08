import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, copyFileSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import {
  nativeTaskPlans,
  generatedNativePaths,
  nativeTaskDirectory,
  nativeEnvironment,
  observeNativeTaskInputs
} from "./native-task-inputs.mjs"
import { verifyNativeRelease } from "./verify-native-release.mjs"
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-native-plan-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const node = {
    path: resolve(root, "packages/native-owner"),
    manifest: {
      name: "@hapsland/native-owner",
      hapsland: {
        domain: "native-owner",
        nativeAssets: [
          {
            source: "src/loader.ts",
            path: "native/prebuilt/{profile}/helper",
            producer: { kind: "c", profiles: { "linux-arm64": {}, "darwin-arm64": {} } }
          }
        ]
      }
    }
  }
  return { root, node, graph: { packages: new Map([[node.manifest.name, node]]) } }
}
test("native task paths remain separate from TypeScript outputs and derive installed targets", (t) => {
  const f = fixture(t),
    plan = nativeTaskPlans(f.root, f.graph, "linux-arm64")[0]
  assert.equal(plan.assets[0].output, resolve(f.node.path, "artifacts/native/linux-arm64/helper"))
  assert.equal(plan.assets[0].installedPath, "native/prebuilt/linux-arm64/helper")
  assert.equal(nativeTaskDirectory(f.node, "darwin-arm64"), resolve(f.node.path, "artifacts/native/darwin-arm64"))
  const outputs = [
    resolve(f.root, "native/prebuilt/linux-arm64/helper"),
    resolve(f.root, "native/prebuilt/darwin-arm64/helper")
  ]
  assert.deepEqual(generatedNativePaths(f.root, f.graph), outputs)
  f.node.manifest.hapsland.nativeAssets[0].producer.kind = "package-binding"
  assert.deepEqual(generatedNativePaths(f.root, f.graph), outputs)
})
test("native plans reject unsupported profiles and path traversal", (t) => {
  const f = fixture(t)
  assert.throws(() => nativeTaskPlans(f.root, f.graph, "linux-x64"), /Unsupported/)
  f.node.manifest.hapsland.nativeAssets[0].path = "native/prebuilt/{profile}/../escape"
  assert.throws(() => nativeTaskPlans(f.root, f.graph, "linux-arm64"), /Escaped/)
  f.node.manifest.hapsland.nativeAssets[0].path = "native/prebuilt/{profile}/helper"
  f.node.manifest.hapsland.nativeAssets[0].producer.profiles.other = {}
  assert.throws(() => nativeTaskPlans(f.root, f.graph, "linux-arm64"), /Unsupported/)
})
test("release native inventory uses manifest targets and rejects mode, format and unsupported selection", (t) => {
  const f = fixture(t)
  for (const profile of ["linux-arm64", "darwin-arm64"]) {
    const file = resolve(f.root, "native/prebuilt", profile, "helper")
    mkdirSync(resolve(file, ".."), { recursive: true })
    const bytes = Buffer.alloc(24)
    if (profile === "linux-arm64") {
      bytes.write("7f454c46", 0, "hex")
      bytes.writeUInt16LE(183, 18)
    } else {
      bytes.write("cffaedfe", 0, "hex")
      bytes.writeUInt32LE(0x0100000c, 4)
    }
    writeFileSync(file, bytes, { mode: 0o755 })
  }
  assert.equal(verifyNativeRelease(f.root, f.graph).length, 2)
  assert.equal(verifyNativeRelease(f.root, f.graph, ["linux-arm64"]).length, 1)
  assert.throws(() => verifyNativeRelease(f.root, f.graph, ["bogus"]), /Unsupported/)
  const file = resolve(f.root, "native/prebuilt/linux-arm64/helper")
  chmodSync(file, 0o644)
  assert.throws(() => verifyNativeRelease(f.root, f.graph), /Invalid/)
  chmodSync(file, 0o755)
  writeFileSync(file, "corrupt")
  assert.throws(() => verifyNativeRelease(f.root, f.graph), /format or architecture/)
})
test("native environment records explicit absent keys for sealed producer environments", () => {
  const env = nativeEnvironment({ PATH: "/declared/compiler", CPATH: "/declared/headers" })
  assert.equal(env.PATH, "/declared/compiler")
  assert.equal(env.CPATH, "/declared/headers")
  assert.equal(env.LD_PRELOAD, null)
})

const binary = (profile) => {
  const bytes = Buffer.alloc(24)
  if (profile === "linux-arm64") {
    bytes.write("7f454c46", 0, "hex")
    bytes.writeUInt16LE(183, 18)
  } else {
    bytes.write("cffaedfe", 0, "hex")
    bytes.writeUInt32LE(0x0100000c, 4)
  }
  return bytes
}
test("parser selection preserves incompatible candidates and invalidates when an earlier candidate becomes compatible", async (t) => {
  const f = fixture(t)
  const host = `${process.platform}-${process.arch}`
  assert(["linux-arm64", "darwin-arm64"].includes(host))
  const packageRoot = resolve(f.root, "node_modules/parser-fixture")
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(resolve(packageRoot, "package.json"), JSON.stringify({ name: "parser-fixture", version: "1.0.0" }))
  mkdirSync(f.node.path, { recursive: true })
  f.node.manifest.dependencies = { "parser-fixture": "1.0.0" }
  const asset = f.node.manifest.hapsland.nativeAssets[0]
  asset.producer = {
    kind: "package-binding",
    package: "parser-fixture",
    localBuild: "local.node",
    publishedPrebuild: "{profile}/published.node",
    profiles: { "linux-arm64": {}, "darwin-arm64": {} }
  }
  writeFileSync(resolve(f.node.path, "package.json"), JSON.stringify(f.node.manifest))
  f.graph.release = {}
  mkdirSync(resolve(f.root, "scripts"))
  for (const name of [
    "native-input-bundle",
    "native-task-inputs",
    "native-task",
    "native-task-receipt",
    "native-artifact",
    "native-compiler-inputs",
    "native-linker-inputs",
    "native-toolchain-inputs",
    "native-header-search",
    "build-process",
    "build-lock",
    "build-groups",
    "owned-lock",
    "compiler-evidence",
    "package-graph"
  ])
    copyFileSync(resolve(import.meta.dirname, `${name}.mjs`), resolve(f.root, `scripts/${name}.mjs`))
  const local = resolve(packageRoot, "local.node")
  writeFileSync(local, binary(host === "linux-arm64" ? "darwin-arm64" : "linux-arm64"))
  const plan = nativeTaskPlans(f.root, f.graph, host)[0]
  const retained = resolve(f.root, plan.assets[0].installedPath)
  mkdirSync(resolve(retained, ".."), { recursive: true })
  writeFileSync(retained, binary(host))
  const published = resolve(packageRoot, host, "published.node")
  mkdirSync(resolve(published, ".."), { recursive: true })
  writeFileSync(published, binary(host))
  const observe = async () => (await observeNativeTaskInputs(f.root, f.graph, plan)).assets[0].input
  const before = await observe()
  assert.equal(before.selected.requested, realpathSync(published))
  assert.equal(before.candidates.length, 2)
  assert(before.candidates[0].evidence.sha256)
  writeFileSync(
    local,
    Buffer.concat([binary(host === "linux-arm64" ? "darwin-arm64" : "linux-arm64"), Buffer.from("changed")])
  )
  assert.notDeepEqual(await observe(), before)
  writeFileSync(local, binary(host))
  assert.equal((await observe()).selected.requested, realpathSync(local))
  rmSync(local)
  writeFileSync(retained, "corrupt")
  const fallback = await observe()
  assert.equal(fallback.selected.requested, realpathSync(published))
  assert.equal(fallback.candidates[0].evidence, null)
  writeFileSync(published, "wrong too")
  await assert.rejects(observe(), /Missing declared parser binding/)
  rmSync(local, { force: true })
  mkdirSync(local)
  await assert.rejects(observe(), /regular file/)
  const foreign = host === "linux-arm64" ? "darwin-arm64" : "linux-arm64"
  const foreignPlan = nativeTaskPlans(f.root, f.graph, foreign)[0]
  const foreignRetained = resolve(packageRoot, foreign, "published.node")
  mkdirSync(resolve(foreignRetained, ".."), { recursive: true })
  writeFileSync(foreignRetained, binary(foreign))
  const foreignInput = (await observeNativeTaskInputs(f.root, f.graph, foreignPlan)).assets[0].input
  assert.equal(foreignInput.selected.requested, realpathSync(foreignRetained))
  assert.equal(foreignInput.candidates.length, 1, "Foreign target must not inspect the host local build")
})
