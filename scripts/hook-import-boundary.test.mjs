import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { checkBuildBoundaries } from "./check-build-boundaries.mjs"
const forbiddenCapabilities = [
  "administration",
  "credential-mutation",
  "provider-execution",
  "review-orchestration",
  "source-analysis"
]
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-boundary-closure-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const boundaries = Object.fromEntries(
    [
      ["standalone-hook", "hook"],
      ["pi-extension", "pi"]
    ].map(([name, owner]) => [
      name,
      {
        entry: `@hapsland/${owner}/main`,
        forbiddenCapabilities,
        forbiddenExternalPackages: [
          "@effect/ai-typesafe",
          "@effect/ai",
          "tree-sitter",
          "tree-sitter-typescript",
          "tree-sitter-rust"
        ]
      }
    ])
  )
  const manifest = {
    workspaces: ["hook", "shared", "admin", "pi"].map((name) => `packages/${name}`),
    hapsland: { buildBoundaries: boundaries }
  }
  writeFileSync(resolve(root, "package.json"), JSON.stringify(manifest))
  for (const name of ["hook", "shared", "admin", "pi"]) {
    mkdirSync(resolve(root, `packages/${name}/src`), { recursive: true })
    writeFileSync(
      resolve(root, `packages/${name}/package.json`),
      JSON.stringify({
        name: `@hapsland/${name}`,
        private: true,
        type: "module",
        exports: { "./main": { types: "./dist/main.d.ts", default: "./dist/main.js" } },
        dependencies:
          name === "hook"
            ? { "@hapsland/shared": "workspace:*", "@hapsland/admin": "workspace:*" }
            : name === "shared"
              ? { "@hapsland/admin": "workspace:*" }
              : {},
        hapsland: {
          entry: "src/main.ts",
          capabilities: name === "admin" ? ["administration"] : [],
          ...(name === "hook" ? { role: "hook" } : name === "pi" ? { surface: "pi-extension", host: "node" } : {})
        }
      })
    )
    writeFileSync(resolve(root, `packages/${name}/src/main.ts`), "export const value = 1")
  }
  return { root, manifest, source: resolve(root, "packages/hook/src/main.ts") }
}
for (const external of ["tree-sitter", "tree-sitter-typescript", "tree-sitter-rust"])
  test(`hook boundary rejects direct parser dependency: ${external}`, (t) => {
    const f = fixture(t)
    const records = ["hook", "shared", "admin", "pi"].map((name) => ({
      file: `packages/${name}/src/main.ts`,
      owner: `@hapsland/${name}`,
      imports: name === "hook" ? [{ external, specifier: external }] : []
    }))
    assert.throws(() => checkBuildBoundaries(f.root, { records }), /Forbidden build boundary dependency/)
  })
test("production source closures account for dedicated hooks and the host-loaded Pi asset", () => {
  const result = checkBuildBoundaries(resolve(import.meta.dirname, ".."))
  assert.ok(result["standalone-hook"].includes("packages/hook-runtime/src/resident/composed-hook.ts"))
  assert.ok(result["standalone-hook"].includes("packages/runtime-inputs/src/credentials/input.ts"))
  assert.deepEqual(result["pi-extension"], [
    "packages/pi-extension/src/pi/extension.ts",
    "packages/runtime-environment/src/runtime/hook-catalog.ts"
  ])
})
for (const source of [
  'import "@hapsland/admin/main"',
  'import type { value } from "@hapsland/admin/main"',
  'export * from "@hapsland/admin/main"',
  'type X = import("@hapsland/admin/main").value',
  'await import("@hapsland/admin/main")'
])
  test(`rejects protected source contributions: ${source}`, (t) => {
    const f = fixture(t)
    writeFileSync(f.source, source)
    assert.throws(() => checkBuildBoundaries(f.root), /Forbidden build boundary owner/)
  })
test("follows relative literals into transitive workspace reexports", (t) => {
  const f = fixture(t)
  writeFileSync(f.source, 'import "./step.ts"')
  writeFileSync(resolve(f.root, "packages/hook/src/step.ts"), 'import "@hapsland/shared/main"')
  writeFileSync(resolve(f.root, "packages/shared/src/main.ts"), 'export * from "@hapsland/admin/main"')
  assert.throws(() => checkBuildBoundaries(f.root), /Forbidden build boundary owner/)
})
test("refuses removed policy protection and entries that differ from the actual surface", (t) => {
  const f = fixture(t)
  f.manifest.hapsland.buildBoundaries["standalone-hook"].forbiddenCapabilities = []
  writeFileSync(resolve(f.root, "package.json"), JSON.stringify(f.manifest))
  assert.throws(() => checkBuildBoundaries(f.root), /omits protected/)
  f.manifest.hapsland.buildBoundaries["standalone-hook"].forbiddenCapabilities = forbiddenCapabilities
  f.manifest.hapsland.buildBoundaries["standalone-hook"].entry = "@hapsland/shared/main"
  writeFileSync(resolve(f.root, "package.json"), JSON.stringify(f.manifest))
  assert.throws(() => checkBuildBoundaries(f.root), /actual entry/)
})
