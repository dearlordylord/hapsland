import { nativeInputRecipe, retainNativeInputBundle } from "./native-input-bundle.mjs"
import { nativeTaskPlans, prepareNativeTaskInputs, nativeTaskArtifacts } from "./native-task-inputs.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, cpSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { validateReleasePublication, nativeReleaseArtifacts } from "./audit-release-tarball.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { buildNativeTask } from "./native-task.mjs"

test("release consumer binds physical owner, public path, and shipped byte and mode evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-release-consumer-"))
  try {
    mkdirSync(join(root, "owned"))
    mkdirSync(join(root, "dist"))
    const owner = join(root, "owned/module.js"),
      published = join(root, "dist/module.js")
    writeFileSync(owner, "export const value = 1", { mode: 0o644 })
    writeFileSync(published, "export const value = 1", { mode: 0o644 })
    const output = { ...fileEvidence(root, owner), publicPath: "dist/module.js" }
    const shipped = { sha256: output.sha256, mode: output.mode }
    validateReleasePublication(root, output, shipped)
    assert.throws(() => validateReleasePublication(root, output, { ...shipped, mode: 0o755 }), /differs/)
    assert.throws(() => validateReleasePublication(root, output, { ...shipped, sha256: "wrong" }), /differs/)
    chmodSync(published, 0o755)
    assert.throws(() => validateReleasePublication(root, output), /differs/)
    chmodSync(published, 0o644)
    writeFileSync(published, "stale publication")
    assert.throws(() => validateReleasePublication(root, output), /differs/)
    writeFileSync(published, "export const value = 1")
    writeFileSync(owner, "changed owner")
    assert.throws(() => validateReleasePublication(root, output), /differs/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("native release audit re-observes the build PATH and still rejects changed native inputs", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-release-native-environment-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, "scripts"))
  for (const name of [
    "native-input-bundle",
    "native-binding-source",
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
    cpSync(resolve(import.meta.dirname, `${name}.mjs`), join(root, "scripts", `${name}.mjs`))
  mkdirSync(join(root, "packages/native-owner"), { recursive: true })
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/native-owner"] }))
  const profile = process.platform === "darwin" ? "linux-arm64" : "darwin-arm64"
  const manifest = {
    name: "@hapsland/native-owner",
    private: true,
    type: "module",
    hapsland: {
      domain: "native-owner",
      nativeAssets: [
        {
          source: "src/loader.ts",
          path: "native/prebuilt/{profile}/helper",
          producer: {
            kind: "c",
            profiles: { [profile]: { source: "native/helper.c", compileFlags: [], linkFlags: [] } }
          }
        }
      ]
    }
  }
  writeFileSync(join(root, "packages/native-owner/package.json"), JSON.stringify(manifest))
  let supplied = join(root, "native/prebuilt", profile, "helper")
  mkdirSync(join(supplied, ".."), { recursive: true })
  const bytes = Buffer.alloc(24)
  if (profile === "linux-arm64") {
    bytes.write("7f454c46", 0, "hex")
    bytes.writeUInt16LE(183, 18)
  } else {
    bytes.write("cffaedfe", 0, "hex")
    bytes.writeUInt32LE(0x0100000c, 4)
  }
  writeFileSync(supplied, bytes, { mode: 0o755 })
  writeFileSync(join(root, "native/helper.c"), "int main(void) { return 0; }\n")
  const graph = readPackageGraph(root)
  const recipe = nativeInputRecipe(root, nativeTaskPlans(root, graph, profile), profile)
  supplied = resolve(retainNativeInputBundle(root, recipe, [supplied]), recipe.assets[0].path)
  const buildEnvironment = { ...process.env, PATH: `/npm-build-path:${process.env.PATH}` }
  await prepareNativeTaskInputs(root, graph, buildEnvironment)
  await buildNativeTask(root, manifest.name, profile, buildEnvironment)
  await assert.rejects(nativeTaskArtifacts(root, graph, profile), /Native task inputs changed/)
  assert.equal((await nativeReleaseArtifacts(root, graph, profile)).assets.length, 1)
  const changed = Buffer.from(bytes)
  changed[23] = 1
  writeFileSync(supplied, changed)
  await assert.rejects(nativeReleaseArtifacts(root, graph, profile), /Native input bundle changed/)
})
