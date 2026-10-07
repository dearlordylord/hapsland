import { createBendReceiptFixture } from "./bend-producer-test-fixture.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { sourceAnalysisContext, sourceAnalysisReceipt, checkSourceAnalysisReceipt } from "./source-analysis-receipt.mjs"
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-source-receipt-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ workspaces: ["packages/one"] }))
  const files = [
    "bun.lock",
    "tsconfig.json",
    "tsconfig.package.json",
    "tsconfig.packages.json",
    "turbo.json",
    "scripts/package-graph.mjs",
    "scripts/check-workspace-imports.mjs",
    "scripts/check-build-boundaries.mjs",
    "scripts/source-loader-policy.mjs",
    "scripts/source-type-evidence.mjs",
    "scripts/source-analysis-receipt.mjs",
    "packages/one/tsconfig.json",
    "packages/one/src/main.ts"
  ]
  for (const file of files) {
    mkdirSync(dirname(resolve(root, file)), { recursive: true })
    writeFileSync(resolve(root, file), "fixture")
  }
  writeFileSync(
    resolve(root, "packages/one/package.json"),
    JSON.stringify({
      name: "@hapsland/one",
      private: true,
      type: "module",
      dependencies: {},
      exports: { "./main": { types: "./dist/main.d.ts", default: "./dist/main.js" } }
    })
  )
  mkdirSync(resolve(root, ".test-runs"))
  const executable = fileEvidence(root, process.execPath)
  writeFileSync(
    resolve(root, ".test-runs/build-toolchain.json"),
    JSON.stringify({ node: executable, bun: executable, dependencies: "fixturedeps" })
  )
  const analysis = {
    files: 1,
    edges: 0,
    packages: 1,
    records: [{ file: "packages/one/src/main.ts", owner: "@hapsland/one", imports: [], nativeLibraries: [] }]
  }
  return { root, analysis, receipt: sourceAnalysisReceipt(root, analysis, sourceAnalysisContext(root)) }
}
test("accepts analysis of current sources and configurations", (t) => {
  const f = fixture(t)
  assert.deepEqual(checkSourceAnalysisReceipt(f.root, f.receipt, "fixturedeps"), f.analysis)
})
for (const file of [
  "packages/one/src/main.ts",
  "tsconfig.package.json",
  "scripts/source-loader-policy.mjs",
  "scripts/source-type-evidence.mjs"
])
  test(`rejects drift in ${file}`, (t) => {
    const f = fixture(t)
    writeFileSync(resolve(f.root, file), "changed")
    assert.throws(() => checkSourceAnalysisReceipt(f.root, f.receipt, "fixturedeps"), /stale source analysis/)
  })
test("rejects source additions and deletion", (t) => {
  const f = fixture(t)
  writeFileSync(resolve(f.root, "packages/one/src/extra.ts"), "extra")
  assert.throws(() => checkSourceAnalysisReceipt(f.root, f.receipt, "fixturedeps"), /stale source analysis/)
  rmSync(resolve(f.root, "packages/one/src/extra.ts"))
  rmSync(resolve(f.root, "packages/one/src/main.ts"))
  assert.throws(() => checkSourceAnalysisReceipt(f.root, f.receipt, "fixturedeps"), /stale source analysis/)
})
test("rejects corrupted analysis and missing contributions", (t) => {
  const f = fixture(t)
  f.receipt.analysis.records[0].imports.push({ specifier: "hidden", external: "hidden" })
  assert.throws(() => checkSourceAnalysisReceipt(f.root, f.receipt, "fixturedeps"), /stale source analysis/)
  f.receipt.analysis.records = []
  assert.throws(() => checkSourceAnalysisReceipt(f.root, f.receipt, "fixturedeps"), /stale source analysis/)
})
test("rejects duplicate contributions even with an updated digest", (t) => {
  const f = fixture(t)
  f.receipt.analysis.records.push({ ...f.receipt.analysis.records[0] })
  f.receipt.digest = createHash("sha256").update(JSON.stringify(f.receipt.analysis)).digest("hex")
  assert.throws(() => checkSourceAnalysisReceipt(f.root, f.receipt, "fixturedeps"), /missing or duplicate/)
})
test("refuses publication when sources changed during analysis", (t) => {
  const f = fixture(t)
  const before = sourceAnalysisContext(f.root)
  writeFileSync(resolve(f.root, "packages/one/src/main.ts"), "changed")
  assert.throws(() => sourceAnalysisReceipt(f.root, f.analysis, before), /changed during boundary analysis/)
})

test("rejects a changed installed dependency identity", (t) => {
  const f = fixture(t)
  assert.throws(() => checkSourceAnalysisReceipt(f.root, f.receipt, "changed-dependencies"), /stale source analysis/)
})

test("binds Bend generated runtime, authored ABI and producer identities without synthetic source or tsconfig paths", async (t) => {
  const f = fixture(t),
    directory = resolve(f.root, "packages/agent-flow-bend")
  mkdirSync(directory)
  writeFileSync(
    resolve(f.root, "package.json"),
    JSON.stringify({ workspaces: ["packages/one", "packages/agent-flow-bend"] })
  )
  writeFileSync(
    resolve(directory, "package.json"),
    JSON.stringify({
      name: "@hapsland/agent-flow-bend",
      private: true,
      type: "module",
      dependencies: {},
      exports: {
        "./canonical": { types: "./dist/canonical.generated.d.ts", default: "./dist/canonical.generated.js" },
        "./import-graph": { types: "./dist/import-graph.generated.d.ts", default: "./dist/import-graph.generated.js" }
      },
      hapsland: {
        compiler: "bend",
        abi: { "./canonical": "./abi/canonical.generated.d.ts", "./import-graph": "./abi/import-graph.generated.d.ts" }
      }
    })
  )
  await createBendReceiptFixture(f.root, resolve(import.meta.dirname, ".."))
  const context = sourceAnalysisContext(f.root)
  assert.ok(context.configuration.some((file) => file.path === "packages/one/tsconfig.json"))
  assert.ok(!context.configuration.some((file) => file.path === "packages/agent-flow-bend/tsconfig.json"))
  assert.equal(context.producers[0].owner, "@hapsland/agent-flow-bend")
  assert.ok(context.sources.some((file) => file.path === "packages/agent-flow-bend/abi/canonical.generated.d.ts"))
  assert.ok(context.sources.some((file) => file.path === "packages/agent-flow-bend/dist/canonical.generated.js"))
  const analysis = {
    files: context.sources.length,
    edges: 0,
    packages: 2,
    records: context.sources
      .filter((file) => /\.(?:ts|js|json)$/.test(file.path))
      .map((file) => ({
        file: file.path,
        owner: file.path.startsWith("packages/agent-flow-bend/") ? "@hapsland/agent-flow-bend" : "@hapsland/one",
        imports: [],
        nativeLibraries: []
      }))
  }
  const receipt = sourceAnalysisReceipt(f.root, analysis, context)
  assert.deepEqual(checkSourceAnalysisReceipt(f.root, receipt, "fixturedeps"), analysis)
  const abi = resolve(directory, "abi/canonical.generated.d.ts"),
    original = readFileSync(abi)
  writeFileSync(abi, "export declare const changed: string")
  assert.throws(() => checkSourceAnalysisReceipt(f.root, receipt, "fixturedeps"), /Stale Bend producer receipt context/)
  writeFileSync(abi, original)
  const generator = resolve(directory, "scripts/build-canonical.mjs")
  writeFileSync(generator, "// changed generator identity")
  assert.throws(() => checkSourceAnalysisReceipt(f.root, receipt, "fixturedeps"), /Stale Bend producer receipt context/)
})
