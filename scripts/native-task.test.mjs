import { nativeInputRecipe, retainNativeInputBundle, foreignNativeInput } from "./native-input-bundle.mjs"
import { nativeTaskPlans, prepareNativeTaskInputs, nativeTaskArtifacts } from "./native-task-inputs.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync, readFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { readPackageGraph } from "./package-graph.mjs"
import { buildNativeTask } from "./native-task.mjs"

const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-native-task-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, "scripts"))
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
    cpSync(resolve(`scripts/${name}.mjs`), resolve(root, `scripts/${name}.mjs`))
  mkdirSync(resolve(root, "packages/native-owner"), { recursive: true })
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ workspaces: ["packages/native-owner"] }))
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
  writeFileSync(resolve(root, "packages/native-owner/package.json"), JSON.stringify(manifest))
  let supplied = resolve(root, "native/prebuilt", profile, "helper")
  mkdirSync(resolve(supplied, ".."), { recursive: true })
  const bytes = Buffer.alloc(24)
  if (profile === "linux-arm64") {
    bytes.write("7f454c46", 0, "hex")
    bytes.writeUInt16LE(183, 18)
  } else {
    bytes.write("cffaedfe", 0, "hex")
    bytes.writeUInt32LE(0x0100000c, 4)
  }
  writeFileSync(supplied, bytes, { mode: 0o755 })
  writeFileSync(resolve(root, "native/helper.c"), "int main(void) { return 0; }\n")
  const graph = readPackageGraph(root)
  const recipe = nativeInputRecipe(root, nativeTaskPlans(root, graph, profile), profile)
  supplied = resolve(retainNativeInputBundle(root, recipe, [supplied]), recipe.assets[0].path)
  return { root, supplied, bytes, graph, profile, owner: manifest.name }
}
test("foreign native task stages owned outputs and rejects corrupt restored outputs or changed supplied bytes", async (t) => {
  const f = fixture(t),
    env = { ...process.env, PATH: "" }
  await prepareNativeTaskInputs(f.root, f.graph, env)
  await buildNativeTask(f.root, f.owner, f.profile, {
    ...env,
    PATH: "/turbo/prepended/bin",
    LD_PRELOAD: "/turbo/untrusted"
  })
  const proof = await nativeTaskArtifacts(f.root, f.graph, f.profile, { environment: env })
  assert.equal(proof.assets.length, 1)
  const output = proof.assets[0].physicalPath
  assert.deepEqual(readFileSync(output), f.bytes)
  assert.deepEqual(readFileSync(f.supplied), f.bytes)
  chmodSync(output, 0o644)
  await assert.rejects(nativeTaskArtifacts(f.root, f.graph, f.profile, { environment: env }), /inventory changed/)
  chmodSync(output, 0o755)
  writeFileSync(output, "corrupt")
  await assert.rejects(nativeTaskArtifacts(f.root, f.graph, f.profile, { environment: env }), /inventory changed/)
  writeFileSync(output, f.bytes)
  writeFileSync(f.supplied, "changed supplier")
  await assert.rejects(
    nativeTaskArtifacts(f.root, f.graph, f.profile, { environment: env }),
    /Native input bundle changed/
  )
})

test("Node parser probe accepts actual staged binding files using package-directory loader overrides", async (t) => {
  if (`${process.platform}-${process.arch}` !== "linux-arm64")
    return t.skip("Actual retained Linux parser supplier profile")
  const root = process.cwd(),
    graph = readPackageGraph(root)
  const node = graph.packages.get("@hapsland/source-analysis")
  const directory = mkdtempSync(resolve(tmpdir(), "hapsland-parser-probe-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const files = {}
  const plans = nativeTaskPlans(root, graph, "linux-arm64")
  for (const asset of node.manifest.hapsland.nativeAssets) {
    const relative = asset.path.replace("native/prebuilt/{profile}/", "")
    const destination = resolve(directory, relative)
    mkdirSync(resolve(destination, ".."), { recursive: true })
    const produced = foreignNativeInput(root, plans, "linux-arm64", asset.path.replace("{profile}", "linux-arm64"))
    cpSync(produced.path, destination)
    files[asset.producer.package] = destination
  }
  const { probeNativeParserBindings } = await import("./native-task.mjs")
  await probeNativeParserBindings(root, node, files)
})

test("foreign native inputs reject absent bundles and source drift even when generated publication files exist", async (t) => {
  const f = fixture(t)
  writeFileSync(resolve(f.root, "native/helper.c"), "int main(void) { return 1; }\n")
  await assert.rejects(prepareNativeTaskInputs(f.root, f.graph), /Missing, stale or corrupt/)
  writeFileSync(resolve(f.root, "native/helper.c"), "int main(void) { return 0; }\n")
  rmSync(resolve(f.root, ".test-runs/native-inputs"), { recursive: true, force: true })
  await assert.rejects(prepareNativeTaskInputs(f.root, f.graph), /Missing, stale or corrupt/)
})
