import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { checkWorkspaceImports } from "./check-workspace-imports.mjs"
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-source-isolation-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ workspaces: ["packages/hook", "packages/input"] }))
  for (const name of ["hook", "input"]) {
    mkdirSync(resolve(root, `packages/${name}/src`), { recursive: true })
    writeFileSync(
      resolve(root, `packages/${name}/package.json`),
      JSON.stringify({
        name: `@hapsland/${name}`,
        private: true,
        type: "module",
        exports: { "./main": { types: "./dist/main.d.ts", default: "./dist/main.js" } },
        dependencies: name === "hook" ? { "@hapsland/input": "workspace:*" } : {}
      })
    )
    writeFileSync(resolve(root, `packages/${name}/src/main.ts`), "export const value = 1")
  }
  return { root, source: resolve(root, "packages/hook/src/main.ts") }
}
for (const source of [
  'import { value } from "@hapsland/input/main"',
  'import type { value } from "@hapsland/input/main"',
  'export * from "@hapsland/input/main"',
  'export type * from "@hapsland/input/main"',
  'type X = import("@hapsland/input/main").value',
  'await import("@hapsland/input/main")',
  'require("@hapsland/input/main")',
  "const global = { items: 1 }; console.log(global.items)",
  "const run = (process: { wait: boolean }) => process.wait",
  'const run = (lines: readonly string[], key: number) => { const line = lines[key]; return line.startsWith("x") }',
  "const run = (lines: readonly string[], key: number) => lines[key]"
])
  test(`accepts supported declared source: ${source}`, (t) => {
    const f = fixture(t)
    writeFileSync(f.source, source)
    assert.equal(checkWorkspaceImports(f.root).files, 2)
  })
for (const source of [
  'import x from "@hapsland/missing/main"',
  'import type { X } from "@hapsland/missing/main"',
  'type X = import("@hapsland/missing/main").X',
  'await import("@hapsland/missing/main")',
  'import x from "@hapsland/input/missing"',
  'import x from "./missing.ts"',
  'import x from "../../input/src/main.ts"',
  'const p = "@hapsland/input/main"; await import(p)',
  "await import(`@hapsland/input/main`)",
  'await import("@hapsland/input/main", { with: { type: "json" } })',
  'require<string>("@hapsland/input/main")',
  'const load = require; load("@hapsland/input/main")',
  'require("@hapsland/input/main" satisfies string)',
  'module.require("@hapsland/input/main")',
  'module?.["requ" + "ire"]("@hapsland/input/main")',
  'import { createRequire as makeLoader } from "node:module"; makeLoader(import.meta.url)("@hapsland/input/main")',
  'import * as m from "node:module"; m["create" + "Require"](import.meta.url)("@hapsland/input/main")',
  'import input = require("@hapsland/input/main")',
  'Module._load("@hapsland/input/main")',
  'eval("require")("@hapsland/input/main")',
  'new Function("return require")()("@hapsland/input/main")',
  '(() => {}).constructor("return require")()("@hapsland/input/main")',
  '(() => {})["con" + "structor"]("return require")()("@hapsland/input/main")',
  'const p = process; p["getBuiltin" + "Module"]("module")',
  'globalThis["requ" + "ire"]("@hapsland/input/main")',
  'import { from "@hapsland/input/main"',
  'const key = process.argv[2]; (() => {})[key]("return require")()',
  'const key = process.argv[2]; const load = (() => {})[key]; load("return require")()("./hidden.js")',
  'const fn = () => {}; const alias = fn; const key = process.argv[2]; const load = alias[key]; load("return require")()',
  'function fn() {}; const load = fn[process.argv[2]]; load("return require")()',
  'const load = ({f: () => {}}).f[process.argv[2]]; load("return require")()',
  "const run = () => Object.getPrototypeOf(() => {})[process.argv[2]];",
  'const obj = { f: () => {} }; const load = (obj.f as unknown as Record<string, string>)[process.argv[2]] as unknown as (s: string) => any; load("return require")()',
  'declare const opaque: () => unknown; const table = opaque() as Record<string, string>; const load = table[process.argv[2]] as unknown as Function; load("return require")()',
  "const value = Object.getPrototypeOf(() => {})[process.argv[2]]; export {value};",
  'const pass = (fn) => fn("return require")(); pass(Object.getPrototypeOf(() => {})[process.argv[2]]);',
  'const load = Object.getPrototypeOf(() => {})[process.argv[2]]; load("return require")()',
  'const load = (true ? () => {} : () => {})[process.argv[2]]; const alias = load as Function; alias("return require")()',
  'const table = { __proto__: () => 1 }; table[process.argv[2]]("return require")()',
  "const table = { action: () => 1 }; Object.setPrototypeOf(table, () => 1); table[process.argv[2]]()",
  'import { runInNewContext } from "node:vm"; runInNewContext("require")',
  'import { Worker } from "node:worker_threads"; new Worker("require", {eval:true})',
  'const ffi = await import("bun:ffi"); ffi.dlopen("/tmp/hidden-reviewer.so", {})'
])
  test(`rejects unsupported or undeclared source: ${source}`, (t) => {
    const f = fixture(t)
    writeFileSync(f.source, source)
    assert.throws(() => checkWorkspaceImports(f.root))
  })

const bendFixture = (t) => {
  const f = fixture(t),
    directory = resolve(f.root, "packages/agent-flow-bend")
  mkdirSync(resolve(directory, "dist"), { recursive: true })
  mkdirSync(resolve(directory, "abi"), { recursive: true })
  writeFileSync(
    resolve(f.root, "package.json"),
    JSON.stringify({ workspaces: ["packages/hook", "packages/input", "packages/agent-flow-bend"] })
  )
  const manifest = {
    name: "@hapsland/agent-flow-bend",
    private: true,
    type: "module",
    exports: {
      "./canonical": { types: "./dist/canonical.generated.d.ts", default: "./dist/canonical.generated.js" },
      "./import-graph": { types: "./dist/import-graph.generated.d.ts", default: "./dist/import-graph.generated.js" }
    },
    dependencies: { "@hapsland/input": "workspace:*" },
    hapsland: {
      compiler: "bend",
      abi: { "./canonical": "./abi/canonical.generated.d.ts", "./import-graph": "./abi/import-graph.generated.d.ts" },
      loaderPolicies: {
        "dist/canonical.generated.js": "bend-system-ffi",
        "dist/import-graph.generated.js": "bend-system-ffi"
      }
    }
  }
  writeFileSync(resolve(directory, "package.json"), JSON.stringify(manifest))
  for (const name of ["canonical", "import-graph"]) {
    writeFileSync(resolve(directory, `dist/${name}.generated.js`), 'export { value } from "@hapsland/input/main"')
    writeFileSync(resolve(directory, `abi/${name}.generated.d.ts`), "export declare const value: number")
    writeFileSync(resolve(directory, `dist/${name}.generated.d.ts`), "export declare const value: number")
  }
  return { ...f, directory, manifest, generated: resolve(directory, "dist/canonical.generated.js") }
}
test("inspects Bend-generated JavaScript exports and authored ABI edges under their producer owner", (t) => {
  const f = bendFixture(t),
    result = checkWorkspaceImports(f.root)
  const records = result.records.filter((record) => record.owner === "@hapsland/agent-flow-bend")
  assert.equal(records.length, 6)
  assert.equal(
    records.find((record) => record.file.endsWith("canonical.generated.js")).imports[0].specifier,
    "@hapsland/input/main"
  )
})
test("rejects missing cold Bend runtime output rather than parsing Bend as JavaScript", (t) => {
  const f = bendFixture(t)
  rmSync(f.generated)
  assert.throws(() => checkWorkspaceImports(f.root), /Missing or escaped Bend emitted export/)
})
test("rejects undeclared edges inside generated Bend JavaScript", (t) => {
  const f = bendFixture(t)
  writeFileSync(f.generated, 'export * from "@hapsland/hook/main"')
  assert.throws(() => checkWorkspaceImports(f.root), /Undeclared dependency/)
})
test("checks every generated Bend module, including unexported modules", (t) => {
  const f = bendFixture(t)
  writeFileSync(resolve(f.directory, "dist/hidden.js"), "await import(process.argv[2])")
  assert.throws(() => checkWorkspaceImports(f.root), /computed loader/)
})
test("accepts only the bounded native system-library profile on named Bend outputs", (t) => {
  const f = bendFixture(t)
  writeFileSync(f.generated, 'import { dlopen } from "bun:ffi"; export const library = dlopen("libc.so.6", {})')
  const result = checkWorkspaceImports(f.root)
  assert.deepEqual(result.records.find((record) => record.file.endsWith("canonical.generated.js")).nativeLibraries, [
    "libc.so.6"
  ])
  writeFileSync(f.generated, 'import { dlopen } from "bun:ffi"; dlopen("/tmp/arbitrary.so", {})')
  assert.throws(() => checkWorkspaceImports(f.root), /native library loader/)
})
test("rejects a Bend native policy moved onto another generated module", (t) => {
  const f = bendFixture(t)
  writeFileSync(resolve(f.directory, "dist/hidden.js"), "export const value = 1")
  f.manifest.hapsland.loaderPolicies["dist/hidden.js"] = "bend-system-ffi"
  writeFileSync(resolve(f.directory, "package.json"), JSON.stringify(f.manifest))
  assert.throws(() => checkWorkspaceImports(f.root), /different source owner/)
})
test("rejects a Bend native policy on a different workspace owner", (t) => {
  const f = bendFixture(t)
  f.manifest.name = "@hapsland/other-bend"
  writeFileSync(resolve(f.directory, "package.json"), JSON.stringify(f.manifest))
  assert.throws(() => checkWorkspaceImports(f.root), /different source owner/)
})
test("rejects a generated Bend relative import escaping its producer", (t) => {
  const f = bendFixture(t)
  writeFileSync(f.generated, 'export * from "../../input/src/main.ts"')
  assert.throws(() => checkWorkspaceImports(f.root), /escapes source owner/)
})
