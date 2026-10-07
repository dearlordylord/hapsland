import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { parse } from "@babel/parser"
import { readPackageGraph } from "./package-graph.mjs"
import { sourceTypeEvidence } from "./source-type-evidence.mjs"
const fixture = (t, declaration) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-bend-type-evidence-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({ type: "module", workspaces: ["packages/agent-flow-bend", "packages/consumer"] })
  )
  writeFileSync(
    resolve(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", strict: true },
      include: ["packages/consumer/src/**/*.ts"]
    })
  )
  const producer = resolve(root, "packages/agent-flow-bend"),
    consumer = resolve(root, "packages/consumer")
  mkdirSync(resolve(producer, "abi"), { recursive: true })
  mkdirSync(resolve(consumer, "src"), { recursive: true })
  mkdirSync(resolve(root, "node_modules/@hapsland"), { recursive: true })
  symlinkSync(producer, resolve(root, "node_modules/@hapsland/agent-flow-bend"))
  writeFileSync(
    resolve(producer, "package.json"),
    JSON.stringify({
      name: "@hapsland/agent-flow-bend",
      private: true,
      type: "module",
      exports: {
        "./canonical": { types: "./dist/canonical.generated.d.ts", default: "./dist/canonical.generated.js" }
      },
      hapsland: { compiler: "bend", abi: { "./canonical": "./abi/canonical.generated.d.ts" } }
    })
  )
  writeFileSync(
    resolve(consumer, "package.json"),
    JSON.stringify({
      name: "@hapsland/consumer",
      private: true,
      type: "module",
      exports: { "./main": { types: "./dist/main.d.ts", default: "./dist/main.js" } },
      dependencies: { "@hapsland/agent-flow-bend": "workspace:*" }
    })
  )
  writeFileSync(resolve(producer, "abi/canonical.generated.d.ts"), declaration)
  const source =
    'import { table } from "@hapsland/agent-flow-bend/canonical"; export const read = (key: string) => table[key]'
  const file = resolve(consumer, "src/main.ts")
  writeFileSync(file, source)
  const expression = parse(source, { sourceType: "module", plugins: ["typescript"] }).program.body[1].declaration
    .declarations[0].init.body
  return { root, producer, file, expression }
}
test("resolves a Bend authored ABI for a TypeScript consumer without runtime outputs or project references", (t) => {
  const f = fixture(t, "export declare const table: Record<string, string>")
  const evidence = sourceTypeEvidence(f.root, readPackageGraph(f.root))
  try {
    assert.equal(evidence.nonCallableRead(f.file, f.expression), true)
  } finally {
    evidence.close()
  }
})
for (const declaration of [
  "export declare const table: Record<string, () => string>",
  "export declare const table: any"
])
  test(`does not turn unresolved or callable Bend ABI data into safe runtime evidence: ${declaration}`, (t) => {
    const f = fixture(t, declaration),
      evidence = sourceTypeEvidence(f.root, readPackageGraph(f.root))
    try {
      assert.equal(evidence.nonCallableRead(f.file, f.expression), false)
    } finally {
      evidence.close()
    }
  })
test("rejects a missing authored Bend ABI rather than trusting old emitted declarations", (t) => {
  const f = fixture(t, "export declare const table: Record<string, string>")
  mkdirSync(resolve(f.producer, "dist"))
  writeFileSync(
    resolve(f.producer, "dist/canonical.generated.d.ts"),
    "export declare const table: Record<string, string>"
  )
  rmSync(resolve(f.producer, "abi/canonical.generated.d.ts"))
  assert.throws(() => sourceTypeEvidence(f.root, readPackageGraph(f.root)), /Missing.*(?:ABI|source)/)
})
