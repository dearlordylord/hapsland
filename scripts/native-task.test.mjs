import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync, readFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { readPackageGraph } from "./package-graph.mjs"
import { prepareNativeTaskInputs, nativeTaskArtifacts } from "./native-task-inputs.mjs"
import { buildNativeTask } from "./native-task.mjs"

const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-native-task-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, "scripts"))
  for (const name of [
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
            profiles: { "darwin-arm64": { source: "native/helper.c", compileFlags: [], linkFlags: [] } }
          }
        }
      ]
    }
  }
  writeFileSync(resolve(root, "packages/native-owner/package.json"), JSON.stringify(manifest))
  const supplied = resolve(root, "native/prebuilt/darwin-arm64/helper")
  mkdirSync(resolve(supplied, ".."), { recursive: true })
  const bytes = Buffer.alloc(24)
  bytes.write("cffaedfe", 0, "hex")
  bytes.writeUInt32LE(0x0100000c, 4)
  writeFileSync(supplied, bytes, { mode: 0o755 })
  return { root, supplied, bytes, graph: readPackageGraph(root), owner: manifest.name }
}
test("foreign native task stages owned outputs and rejects corrupt restored outputs or changed supplied bytes", async (t) => {
  if (process.platform === "darwin") return t.skip("This case exercises foreign retention on a non-Darwin host")
  const f = fixture(t),
    env = { ...process.env, PATH: "" }
  await prepareNativeTaskInputs(f.root, f.graph, env)
  await buildNativeTask(f.root, f.owner, "darwin-arm64", {
    ...env,
    PATH: "/turbo/prepended/bin",
    LD_PRELOAD: "/turbo/untrusted"
  })
  const proof = await nativeTaskArtifacts(f.root, f.graph, "darwin-arm64", { environment: env })
  assert.equal(proof.assets.length, 1)
  const output = proof.assets[0].physicalPath
  assert.deepEqual(readFileSync(output), f.bytes)
  assert.deepEqual(readFileSync(f.supplied), f.bytes)
  chmodSync(output, 0o644)
  await assert.rejects(nativeTaskArtifacts(f.root, f.graph, "darwin-arm64", { environment: env }), /inventory changed/)
  chmodSync(output, 0o755)
  writeFileSync(output, "corrupt")
  await assert.rejects(nativeTaskArtifacts(f.root, f.graph, "darwin-arm64", { environment: env }), /inventory changed/)
  writeFileSync(output, f.bytes)
  writeFileSync(f.supplied, "changed supplier")
  await assert.rejects(nativeTaskArtifacts(f.root, f.graph, "darwin-arm64", { environment: env }), /inputs changed/)
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
  for (const asset of node.manifest.hapsland.nativeAssets) {
    const relative = asset.path.replace("native/prebuilt/{profile}/", "")
    const destination = resolve(directory, relative)
    mkdirSync(resolve(destination, ".."), { recursive: true })
    cpSync(resolve(root, asset.path.replace("{profile}", "linux-arm64")), destination)
    files[asset.producer.package] = destination
  }
  const { probeNativeParserBindings } = await import("./native-task.mjs")
  await probeNativeParserBindings(root, node, files)
})
