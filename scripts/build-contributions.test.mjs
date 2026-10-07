import { syncBuiltinESMExports } from "node:module"
import { createHash } from "node:crypto"
import { createBendReceiptFixture } from "./bend-producer-test-fixture.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import fs, { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { checkAssemblyContributions, checkCompilerContributions, contributionOwner } from "./build-contributions.mjs"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-contributions-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const boundaries = Object.fromEntries(
    [
      ["standalone-hook", "hook"],
      ["pi-extension", "pi"]
    ].map(([name, owner]) => [
      name,
      {
        entry: `@hapsland/${owner}/main`,
        forbiddenCapabilities: [
          "administration",
          "credential-mutation",
          "provider-execution",
          "review-orchestration",
          "source-analysis"
        ],
        forbiddenExternalPackages: [
          "@effect/ai",
          "@effect/ai-typesafe",
          "tree-sitter",
          "tree-sitter-typescript",
          "tree-sitter-rust"
        ]
      }
    ])
  )
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({
      workspaces: ["hook", "pi", "admin"].map((name) => `packages/${name}`),
      hapsland: { buildBoundaries: boundaries }
    })
  )
  mkdirSync(resolve(root, "node_modules"))
  const analysis = { records: [] }
  for (const name of ["hook", "pi", "admin"]) {
    const path = resolve(root, `packages/${name}`)
    mkdirSync(resolve(path, "src"), { recursive: true })
    mkdirSync(resolve(path, "dist"))
    writeFileSync(
      resolve(path, "package.json"),
      JSON.stringify({
        name: `@hapsland/${name}`,
        private: true,
        type: "module",
        exports: { "./main": { types: "./dist/main.d.ts", default: "./dist/main.js" } },
        dependencies: {},
        hapsland: {
          entry: "src/main.ts",
          capabilities: name === "admin" ? ["administration"] : [],
          ...(name === "hook" ? { role: "hook" } : name === "pi" ? { surface: "pi-extension", host: "node" } : {})
        }
      })
    )
    for (const file of ["src/main.ts", "dist/main.js", "dist/main.d.ts"])
      writeFileSync(resolve(path, file), "export const value = 1")
    writeFileSync(
      resolve(path, "dist/.compile-receipt.json"),
      JSON.stringify({ package: `@hapsland/${name}`, inputs: [fileEvidence(root, resolve(path, "src/main.ts"))] })
    )
    analysis.records.push({
      file: `packages/${name}/src/main.ts`,
      owner: `@hapsland/${name}`,
      imports: [],
      nativeLibraries: []
    })
  }
  const entry = resolve(root, "packages/hook/dist/main.js")
  const metafile = {
    inputs: { "packages/hook/dist/main.js": { imports: [] } },
    outputs: {
      "main.js": {
        entryPoint: "packages/hook/dist/main.js",
        inputs: { "packages/hook/dist/main.js": { bytesInOutput: 1 } },
        imports: []
      }
    }
  }
  return { root, entry, analysis, metafile }
}
test("accounts for actual compiler and emitted inputs independently", (t) => {
  const f = fixture(t)
  assert.equal(checkCompilerContributions(f.root, undefined, f.analysis)["standalone-hook"][0].owner, "@hapsland/hook")
  assert.equal(
    checkAssemblyContributions(f.root, f.entry, f.metafile, f.analysis)[0].source,
    "packages/hook/src/main.ts"
  )
})
test("rejects a forbidden owner in the actual compiler input list", (t) => {
  const f = fixture(t)
  writeFileSync(
    resolve(f.root, "packages/hook/dist/.compile-receipt.json"),
    JSON.stringify({
      package: "@hapsland/hook",
      inputs: [fileEvidence(f.root, resolve(f.root, "packages/admin/dist/main.d.ts"))]
    })
  )
  assert.throws(() => checkCompilerContributions(f.root, undefined, f.analysis), /Forbidden compiled contribution/)
})
test("rejects forbidden emitted input even when no bytes survive tree shaking", (t) => {
  const f = fixture(t)
  f.metafile.inputs["packages/admin/dist/main.js"] = { imports: [] }
  f.metafile.outputs["main.js"].inputs["packages/admin/dist/main.js"] = { bytesInOutput: 0 }
  assert.throws(
    () => checkAssemblyContributions(f.root, f.entry, f.metafile, f.analysis),
    /Forbidden compiled contribution/
  )
})
test("rejects a compiled module outside the selected source closure", (t) => {
  const f = fixture(t)
  writeFileSync(resolve(f.root, "packages/hook/src/extra.ts"), "export const extra = 1")
  writeFileSync(resolve(f.root, "packages/hook/dist/extra.js"), "export const extra = 1")
  f.metafile.inputs["packages/hook/dist/extra.js"] = { imports: [] }
  assert.throws(
    () => checkAssemblyContributions(f.root, f.entry, f.metafile, f.analysis),
    /disagrees with source closure/
  )
})
test("checks external package ownership through its real manifest", (t) => {
  const f = fixture(t)
  mkdirSync(resolve(f.root, "node_modules/@effect/ai/dist"), { recursive: true })
  writeFileSync(resolve(f.root, "node_modules/@effect/ai/package.json"), JSON.stringify({ name: "@effect/ai" }))
  writeFileSync(resolve(f.root, "node_modules/@effect/ai/dist/index.js"), "export const value = 1")
  f.metafile.inputs["node_modules/@effect/ai/dist/index.js"] = { imports: [] }
  assert.throws(
    () => checkAssemblyContributions(f.root, f.entry, f.metafile, f.analysis),
    /Forbidden external contribution/
  )
})
for (const change of [
  (m) => {
    m.inputs = {}
  },
  (m) => {
    m.outputs["main.js"].entryPoint = "wrong.js"
  },
  (m) => {
    m.inputs["packages/hook/dist/main.js"].imports = [{ path: "hidden", kind: "dynamic-import", external: true }]
  },
  (m) => {
    m.inputs["packages/hook/dist/main.js"].imports = [{ path: "hidden", kind: "unknown" }]
  },
  (m) => {
    m.inputs["packages/hook/dist/main.js"].imports = [{ path: "@hapsland/admin/main", kind: "import-statement" }]
  },
  (m) => {
    m.outputs["main.js"].imports = [{ path: "hidden" }]
  }
])
  test("refuses incomplete, unsupported or unaccounted emitted evidence", (t) => {
    const f = fixture(t)
    change(f.metafile)
    assert.throws(() => checkAssemblyContributions(f.root, f.entry, f.metafile, f.analysis))
  })
test("accounts for a discarded import using the assembler's actual resolver", (t) => {
  const f = fixture(t)
  f.metafile.inputs["packages/hook/dist/main.js"].imports = [{ path: "./main.js", kind: "import-statement" }]
  const inputs = checkAssemblyContributions(f.root, f.entry, f.metafile, f.analysis, undefined, () => f.entry)
  assert.equal(inputs[0].imports[0].resolved.path, "packages/hook/dist/main.js")
  assert.equal(inputs[0].imports[0].contributed, true)
})

test("rejects a discarded workspace target outside the source closure", (t) => {
  const f = fixture(t)
  const extra = resolve(f.root, "packages/hook/dist/extra.js")
  writeFileSync(resolve(f.root, "packages/hook/src/extra.ts"), "export const extra = 1")
  writeFileSync(extra, "export const extra = 1")
  f.metafile.inputs["packages/hook/dist/main.js"].imports = [{ path: "./extra.js", kind: "import-statement" }]
  assert.throws(
    () => checkAssemblyContributions(f.root, f.entry, f.metafile, f.analysis, undefined, () => extra),
    /Resolved import disagrees/
  )
})

test("accounts for receipt-validated Bend runtime and ABI contributions and rejects unaccounted outputs", async (t) => {
  const f = fixture(t),
    directory = resolve(f.root, "packages/agent-flow-bend")
  mkdirSync(directory)
  const releasePath = resolve(f.root, "package.json"),
    release = JSON.parse(readFileSync(releasePath, "utf8"))
  release.workspaces.push("packages/agent-flow-bend")
  writeFileSync(releasePath, JSON.stringify(release))
  writeFileSync(
    resolve(directory, "package.json"),
    JSON.stringify({
      name: "@hapsland/agent-flow-bend",
      private: true,
      type: "module",
      dependencies: {},
      exports: {
        "./canonical": { types: "./dist/canonical.generated.d.ts", default: "./dist/canonical.generated.js" },
        "./import-graph": { types: "./dist/import-graph.generated.d.ts", default: "./dist/import-graph.generated.js" },
        "./request-content": {
          types: "./dist/request-content.generated.d.ts",
          default: "./dist/request-content.generated.js"
        }
      },
      hapsland: {
        compiler: "bend",
        capabilities: [],
        abi: {
          "./canonical": "./abi/canonical.generated.d.ts",
          "./import-graph": "./abi/import-graph.generated.d.ts",
          "./request-content": "./abi/request-content.generated.d.ts"
        }
      }
    })
  )
  await createBendReceiptFixture(f.root, resolve(import.meta.dirname, ".."))
  const graph = readPackageGraph(f.root)
  assert.deepEqual(contributionOwner(f.root, graph, "packages/agent-flow-bend/dist/canonical.generated.js"), {
    owner: "@hapsland/agent-flow-bend",
    source: "packages/agent-flow-bend/dist/canonical.generated.js"
  })
  const abi = { owner: "@hapsland/agent-flow-bend", source: "packages/agent-flow-bend/abi/canonical.generated.d.ts" }
  assert.deepEqual(contributionOwner(f.root, graph, "packages/agent-flow-bend/dist/canonical.generated.d.ts"), abi)
  assert.deepEqual(contributionOwner(f.root, graph, abi.source), abi)
  assert.deepEqual(contributionOwner(f.root, graph, "packages/agent-flow-bend/dist/request-content.generated.js"), {
    owner: "@hapsland/agent-flow-bend",
    source: "packages/agent-flow-bend/dist/request-content.generated.js"
  })
  assert.deepEqual(contributionOwner(f.root, graph, "packages/agent-flow-bend/dist/request-content.generated.d.ts"), {
    owner: "@hapsland/agent-flow-bend",
    source: "packages/agent-flow-bend/abi/request-content.generated.d.ts"
  })
  const canonical = "packages/agent-flow-bend/dist/canonical.generated.js"
  const imported = "packages/agent-flow-bend/dist/import-graph.generated.js"
  const receiptPath = resolve(directory, "dist/.bend-receipt.json")
  const assembly = {
    inputs: {
      [canonical]: {
        imports: [
          { kind: "import-statement", path: "./import-graph.generated.js" },
          { kind: "import-statement", path: "./import-graph.generated.js" }
        ]
      },
      [imported]: { imports: [] }
    },
    outputs: { output: { entryPoint: canonical, inputs: { [canonical]: {}, [imported]: {} }, imports: [] } }
  }
  const originalRead = fs.readFileSync
  let receiptReads = 0
  fs.readFileSync = function (path, ...args) {
    if (resolve(String(path)) === receiptPath && args[0] === "utf8") receiptReads++
    return originalRead.call(this, path, ...args)
  }
  syncBuiltinESMExports()
  const validate = (resolver) =>
    checkAssemblyContributions(
      f.root,
      resolve(f.root, canonical),
      assembly,
      f.analysis,
      graph,
      resolver ?? (() => resolve(f.root, imported))
    )
  try {
    assert.equal(validate().length, 2)
    assert.equal(receiptReads, 2)
    receiptReads = 0
    validate()
    assert.equal(receiptReads, 2)
  } finally {
    fs.readFileSync = originalRead
    syncBuiltinESMExports()
  }
  const before = readFileSync(receiptPath)
  const originalOutput = readFileSync(resolve(f.root, imported))
  let replaced = false
  assert.throws(
    () =>
      validate(() => {
        if (!replaced) {
          replaced = true
          writeFileSync(resolve(f.root, imported), "export const fixture = 2;\n")
          const receipt = JSON.parse(readFileSync(receiptPath, "utf8"))
          receipt.outputs = fileInventory(f.root, resolve(directory, "dist")).filter(
            (value) => !value.path.endsWith("/.bend-receipt.json")
          )
          delete receipt.digest
          receipt.digest = createHash("sha256").update(JSON.stringify(receipt)).digest("hex")
          writeFileSync(receiptPath, JSON.stringify(receipt))
        }
        return resolve(f.root, imported)
      }),
    /Bend producer changed during assembly/
  )
  // The replacement receipt is valid in a new invocation, proving that the
  // previous rejection covered transaction drift rather than just corruption.
  assert.equal(validate().length, 2)
  writeFileSync(resolve(f.root, imported), originalOutput)
  writeFileSync(receiptPath, before)
  assert.throws(
    () =>
      validate(() => {
        writeFileSync(resolve(f.root, imported), "corrupt output")
        return resolve(f.root, imported)
      }),
    /Incomplete or changed Bend producer output inventory/
  )
  assert.throws(() => validate(), /Incomplete or changed Bend producer output inventory/)
  writeFileSync(resolve(f.root, imported), originalOutput)
  writeFileSync(resolve(directory, "dist/unaccounted.js"), "export const bypass = 1")
  assert.throws(
    () => contributionOwner(f.root, graph, "packages/agent-flow-bend/dist/unaccounted.js"),
    /Incomplete or changed Bend producer output inventory/
  )
  rmSync(resolve(directory, "dist/unaccounted.js"))
  writeFileSync(resolve(directory, "dist/canonical.generated.js"), "export const changed = 1")
  assert.throws(
    () => contributionOwner(f.root, graph, "packages/agent-flow-bend/dist/canonical.generated.js"),
    /Incomplete or changed Bend producer output inventory/
  )
})
