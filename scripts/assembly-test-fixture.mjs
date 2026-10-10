import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { readPackageGraph } from "./package-graph.mjs"
import { assemblyProducerFiles, createAssemblyPrerequisites } from "./assembly-prerequisites.mjs"
import { fileEvidence } from "./compiler-evidence.mjs"
export function assemblyFixture(t) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "hapsland-component-")))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, text) => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    writeFileSync(resolve(root, path), text)
  }
  const protectedPolicy = {
    entry: "@hapsland/pi/extension",
    forbiddenCapabilities: [
      "administration",
      "credential-mutation",
      "provider-execution",
      "review-orchestration",
      "source-analysis"
    ],
    forbiddenExternalPackages: [
      "@effect/ai-typesafe",
      "@effect/ai",
      "tree-sitter",
      "tree-sitter-typescript",
      "tree-sitter-rust",
      "tree-sitter-python",
      "tree-sitter-go"
    ]
  }
  write(
    "package.json",
    JSON.stringify({
      workspaces: ["packages/cli", "packages/doctor", "packages/pi", "packages/runtime"],
      exports: { "./pi-extension": "./dist/pi/extension.js" },
      hapsland: { buildBoundaries: { "pi-extension": protectedPolicy } }
    })
  )
  write("bun.lock", "fixture")
  for (const path of [
    "tsconfig.json",
    "tsconfig.package.json",
    ...assemblyProducerFiles,
    "scripts/assemble-host-modules.mjs",
    "scripts/host-module-graph.mjs",
    "scripts/host-module-plan.mjs",
    "scripts/host-module-imports.mjs"
  ])
    write(path, "fixture")
  const records = []
  for (const [name, entry] of [
    ["cli", "main"],
    ["doctor", "main"],
    ["pi", "pi/extension"],
    ["runtime", "runtime/value"]
  ]) {
    const owner = `@hapsland/${name}`,
      directory = `packages/${name}`
    write(
      `${directory}/package.json`,
      JSON.stringify({
        name: owner,
        private: true,
        type: "module",
        exports: {
          [name === "pi" ? "./extension" : "./main"]: { types: `./dist/${entry}.d.ts`, default: `./dist/${entry}.js` }
        },
        dependencies: name === "pi" ? { "@hapsland/runtime": "workspace:*" } : {},
        hapsland: {
          host: name === "pi" || name === "runtime" ? "node" : "bun",
          capabilities: [],
          ...(name === "pi"
            ? { surface: "pi-extension", entry: `src/${entry}.ts`, hostOutputDirectory: "dist" }
            : name === "runtime"
              ? { hostOutputDirectory: "dist" }
              : { role: name, entry: `src/${entry}.ts`, executable: `hapsland-${name}` })
        }
      })
    )
    write(`${directory}/tsconfig.json`, "fixture")
    write(`${directory}/src/${entry}.ts`, "export const value=1;")
    write(
      `${directory}/dist/${entry}.js`,
      name === "pi" ? 'export { value } from "@hapsland/runtime/main";' : "export const value=1;"
    )
    write(
      `${directory}/dist/.compile-receipt.json`,
      JSON.stringify({
        outputs: [{ ...fileEvidence(root, resolve(root, `${directory}/dist/${entry}.js`)), path: `dist/${entry}.js` }]
      })
    )
    records.push({
      file: `${directory}/src/${entry}.ts`,
      owner,
      imports:
        name === "pi" ? [{ specifier: "@hapsland/runtime/main", target: "packages/runtime/src/runtime/value.ts" }] : []
    })
  }
  write("compiler", "fixture Bun executable")
  write(".test-runs/build-toolchain.json", JSON.stringify({ bun: fileEvidence(root, resolve(root, "compiler")) }))
  const graph = readPackageGraph(root),
    analysis = { records }
  const snapshots = createAssemblyPrerequisites(root, graph, analysis, { "pi-extension": [] }, [
    "linux-arm64",
    "darwin-arm64"
  ])
  return { root, graph, analysis, snapshots, write }
}
