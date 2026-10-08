import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync, chmodSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { checkAssemblyReceipt, assemblyReceiptDigest } from "./check-assembly-receipt.mjs"
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-assembly-receipt-"))
  mkdirSync(resolve(root, "packages/fixture/src"), { recursive: true })
  mkdirSync(resolve(root, "node_modules"))
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({ workspaces: ["packages/fixture"], hapsland: { buildBoundaries: {} } })
  )
  writeFileSync(
    resolve(root, "packages/fixture/package.json"),
    JSON.stringify({ name: "@hapsland/fixture", private: true, type: "module" })
  )
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const file of ["entry.js", "dependency.js", "manifest.json", "native.node", "command"])
    writeFileSync(resolve(root, "packages/fixture/src", file), file)
  const evidence = (file) => fileEvidence(root, resolve(root, "packages/fixture/src", file))
  const context = { target: "bun-linux-arm64", toolchain: "fixture" }
  const receipt = {
    context,
    entry: evidence("entry.js"),
    output: evidence("command"),
    nativeAssets: [evidence("native.node")],
    transformations: [],
    externalRuntime: [],
    inputs: [
      {
        ...evidence("entry.js"),
        owner: "@hapsland/fixture",
        source: "packages/fixture/src/entry.js",
        imports: [
          { resolved: evidence("dependency.js"), contributed: false },
          { resolved: evidence("manifest.json"), contributed: false }
        ]
      }
    ]
  }
  receipt.digest = assemblyReceiptDigest(receipt)
  return {
    root,
    receipt,
    context,
    entry: resolve(root, "packages/fixture/src/entry.js"),
    output: resolve(root, "packages/fixture/src/command")
  }
}
const verify = (f) => checkAssemblyReceipt(f.root, f.receipt, f.context, f.entry, f.output)
test("validates current input, discarded target, native asset and executable evidence", (t) => {
  assert.ok(verify(fixture(t)))
})
test("repeated references must agree and each receipt check observes current bytes", (t) => {
  const f = fixture(t)
  const reference = f.receipt.inputs[0].imports[0]
  f.receipt.inputs[0].imports.push(structuredClone(reference))
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.ok(verify(f))
  f.receipt.inputs[0].imports[2].resolved.sha256 = "a".repeat(64)
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /Changed assembly evidence/)
  f.receipt.inputs[0].imports[2] = structuredClone(reference)
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.ok(verify(f))
  writeFileSync(resolve(f.root, reference.resolved.path), "changed")
  assert.throws(() => verify(f), /Changed assembly evidence/)
})
test("Node-only builtins cannot authorize a Bun assembly receipt", (t) => {
  const f = fixture(t)
  f.receipt.inputs[0].imports.push({ kind: "import-statement", external: true, path: "node:sea" })
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /Unaccounted assembly import/)
})
test("rejects missing transformed-loader evidence collection", (t) => {
  const f = fixture(t)
  delete f.receipt.transformations
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /stale assembly receipt/)
})
test("rejects a transformation outside actual inputs and selected native assets", (t) => {
  const f = fixture(t)
  f.receipt.transformations.push({
    path: "dependency.js",
    policy: "physical-native-bindings",
    packageName: "tree-sitter",
    nativeBinding: "tree_sitter_runtime_binding.node",
    transformedSha256: "a".repeat(64)
  })
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /loader transformation/)
})
test("native wrapper inputs require transformed-byte evidence", (t) => {
  const f = fixture(t)
  f.receipt.inputs[0].external = "tree-sitter"
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /omits a native loader transformation/)
})
for (const file of ["entry.js", "dependency.js", "manifest.json", "native.node", "command"])
  test(`rejects changed ${file}`, (t) => {
    const f = fixture(t)
    writeFileSync(resolve(f.root, "packages/fixture/src", file), "changed")
    assert.throws(() => verify(f), /Changed assembly evidence/)
  })
test("rejects executable permission changes", (t) => {
  const f = fixture(t)
  chmodSync(f.output, 0o700)
  assert.throws(() => verify(f), /Changed assembly evidence/)
})
test("rejects changed producer context", (t) => {
  const f = fixture(t)
  f.context = { ...f.context, target: "bun-darwin-arm64" }
  assert.throws(() => verify(f), /stale assembly receipt/)
})
test("rejects missing and duplicate inputs", (t) => {
  const f = fixture(t)
  f.receipt.inputs.push(f.receipt.inputs[0])
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /duplicate/)
  f.receipt.inputs = []
  assert.throws(() => verify(f), /stale assembly receipt/)
})
test("rejects missing restored executable", (t) => {
  const f = fixture(t)
  rmSync(f.output)
  assert.throws(() => verify(f))
})
test("rejects unaccounted imports", (t) => {
  const f = fixture(t)
  f.receipt.inputs[0].imports = [{ kind: "dynamic-import" }]
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /Unaccounted/)
})

test("rejects evidence removed from a retained receipt", (t) => {
  const f = fixture(t)
  f.receipt.nativeAssets = []
  assert.throws(() => verify(f), /stale assembly receipt/)
})
test("rejects an omitted contributing target even with recomputed integrity", (t) => {
  const f = fixture(t)
  f.receipt.inputs[0].imports[0].contributed = true
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /omits a contributing/)
})
test("rejects arbitrary external loader targets", (t) => {
  const f = fixture(t)
  f.receipt.inputs[0].imports = [{ external: true, path: "hidden-loader" }]
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /Unaccounted/)
})

test("recomputed integrity cannot conceal an actual external module by deleting its owner marker", async (t) => {
  const f = fixture(t)
  const { externalRuntimeEvidence } = await import("./external-runtime-evidence.mjs")
  mkdirSync(resolve(f.root, "node_modules/fixture-dependency"), { recursive: true })
  const manifestPath = resolve(f.root, "node_modules/fixture-dependency/package.json")
  const modulePath = resolve(f.root, "node_modules/fixture-dependency/index.js")
  writeFileSync(manifestPath, JSON.stringify({ name: "fixture-dependency", main: "index.js" }))
  writeFileSync(modulePath, "module.exports = 1;")
  const externalInput = {
    ...fileEvidence(f.root, modulePath),
    external: "fixture-dependency",
    manifest: fileEvidence(f.root, manifestPath),
    imports: []
  }
  f.receipt.inputs.push(externalInput)
  f.receipt.inputs[0].imports.push({ resolved: fileEvidence(f.root, modulePath), contributed: true })
  f.receipt.externalRuntime = externalRuntimeEvidence(
    f.root,
    f.receipt.inputs,
    [],
    new Map(),
    f.context.target,
    undefined,
    f.entry
  )
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.ok(verify(f))
  delete externalInput.external
  delete externalInput.manifest
  f.receipt.externalRuntime = []
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /assembly input ownership/)
})

test("recomputed integrity cannot omit the manifest of an actual external owner", async (t) => {
  const f = fixture(t)
  const { externalRuntimeEvidence } = await import("./external-runtime-evidence.mjs")
  mkdirSync(resolve(f.root, "node_modules/fixture-dependency"), { recursive: true })
  const manifestPath = resolve(f.root, "node_modules/fixture-dependency/package.json")
  const modulePath = resolve(f.root, "node_modules/fixture-dependency/index.js")
  writeFileSync(manifestPath, JSON.stringify({ name: "fixture-dependency", main: "index.js" }))
  writeFileSync(modulePath, "module.exports = 1;")
  const externalInput = {
    ...fileEvidence(f.root, modulePath),
    external: "fixture-dependency",
    manifest: fileEvidence(f.root, manifestPath),
    imports: []
  }
  f.receipt.inputs.push(externalInput)
  f.receipt.externalRuntime = externalRuntimeEvidence(
    f.root,
    f.receipt.inputs,
    [],
    new Map(),
    f.context.target,
    undefined,
    f.entry
  )
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.ok(verify(f))
  delete externalInput.manifest
  f.receipt.digest = assemblyReceiptDigest(f.receipt)
  assert.throws(() => verify(f), /assembly input ownership.*manifest/)
})
