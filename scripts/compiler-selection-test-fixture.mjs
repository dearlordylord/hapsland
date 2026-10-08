import { createRequire } from "node:module"
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync, rmSync, realpathSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"
import { fileEvidence } from "./compiler-evidence.mjs"
import { authoredTaskToolingFiles } from "./authored-task-inputs.mjs"

// The nested compiler has distinct package/helper/executable bytes but delegates
// compilation to the real pinned executable. Markers identify actual discovery
// and compilation; version probes are deliberately excluded.
export async function compilerSelectionFixture(t, { stampOwner = "root", mutation } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-compiler-selection-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repository = resolve(import.meta.dirname, ".."),
    scripts = resolve(root, "scripts"),
    subject = resolve(root, "packages/subject")
  const selected = await resolvePinnedTypeScript()
  const version = selected.version,
    platformName = `@typescript/typescript-${process.platform}-${process.arch}`
  mkdirSync(scripts)
  mkdirSync(resolve(subject, "src"), { recursive: true })
  mkdirSync(resolve(root, "node_modules"))
  mkdirSync(resolve(root, ".test-runs"))
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({
      name: "fixture-release",
      private: true,
      type: "module",
      workspaces: ["packages/subject"],
      catalog: { typescript: version },
      devDependencies: { typescript: "catalog:" }
    })
  )
  writeFileSync(
    resolve(scripts, "package.json"),
    JSON.stringify({ name: "fixture-tooling", private: true, type: "module", dependencies: { typescript: "catalog:" } })
  )
  writeFileSync(
    resolve(subject, "package.json"),
    JSON.stringify({
      name: "@hapsland/subject",
      private: true,
      type: "module",
      dependencies: {},
      hapsland: { domain: "subject", host: "node" }
    })
  )
  const options = {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    composite: true,
    declaration: true,
    rootDir: "src",
    outDir: "dist"
  }
  writeFileSync(
    resolve(subject, "tsconfig.json"),
    JSON.stringify({ compilerOptions: options, include: ["src/**/*.ts"] })
  )
  writeFileSync(resolve(subject, "src/main.ts"), "export const value: number = 243\n")
  for (const name of ["tsconfig.json", "tsconfig.package.json"]) writeFileSync(resolve(root, name), "{}\n")
  writeFileSync(resolve(root, "bun.lock"), "fixture lock\n")
  for (const path of new Set([...authoredTaskToolingFiles({ compiler: "typescript" }), "scripts/check-ui-flows.mjs"])) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    copyFileSync(resolve(repository, path), resolve(root, path))
  }
  const registry = resolve(root, "packages/administration/src/interaction/flow-registry.ts")
  mkdirSync(dirname(registry), { recursive: true })
  writeFileSync(
    registry,
    `
export const uiFlows = {}, uiJourneys = {}, inputFragments = {}, directUiExceptions = {};
export const interactionInfrastructure = [], interactionCompositionRoots = [];
`
  )
  writeFileSync(resolve(scripts, "interaction-diagram-generators.ts"), "export const diagramGenerators = {}\n")
  const parser = createRequire(import.meta.url).resolve("@babel/parser/package.json")
  mkdirSync(resolve(root, "node_modules/@babel"))
  symlinkSync(dirname(parser), resolve(root, "node_modules/@babel/parser"), "dir")
  const actualPackage = createRequire(import.meta.url).resolve("typescript/package.json")
  symlinkSync(dirname(actualPackage), resolve(root, "node_modules/typescript"), "dir")
  const nestedModules = resolve(scripts, "node_modules"),
    packagePath = resolve(nestedModules, "typescript-selected"),
    platformPath = resolve(nestedModules, platformName)
  mkdirSync(resolve(packagePath, "lib"), { recursive: true })
  mkdirSync(resolve(platformPath, "lib"), { recursive: true })
  writeFileSync(
    resolve(packagePath, "package.json"),
    JSON.stringify({ name: "typescript", version, optionalDependencies: { [platformName]: version } })
  )
  writeFileSync(resolve(platformPath, "package.json"), JSON.stringify({ name: platformName, version }))
  symlinkSync(packagePath, resolve(nestedModules, "typescript"), "dir")
  const nestedExecutable = resolve(platformPath, "lib/tsc"),
    marker = resolve(root, "compiler-execution.jsonl")
  writeFileSync(
    resolve(packagePath, "lib/getExePath.js"),
    `module.exports = () => ${JSON.stringify(nestedExecutable)}\n`
  )
  const mutate =
    mutation === "bytes"
      ? `fs.appendFileSync(__filename, "\\n// replaced executable bytes\\n")`
      : mutation === "support"
        ? `fs.appendFileSync(${JSON.stringify(resolve(packagePath, "lib/getExePath.js"))}, "\\n// replaced helper bytes\\n")`
        : mutation === "resolution"
          ? `fs.rmSync(${JSON.stringify(resolve(nestedModules, "typescript"))}); fs.symlinkSync(${JSON.stringify(dirname(actualPackage))}, ${JSON.stringify(resolve(nestedModules, "typescript"))}, "dir")`
          : ""
  writeFileSync(
    nestedExecutable,
    `#!${process.execPath}
const fs = require("node:fs"), cp = require("node:child_process");
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log(${JSON.stringify("Version " + version)}); process.exit(0); }
fs.appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ executable: fs.realpathSync(__filename), args }) + "\\n");
const result = cp.spawnSync(${JSON.stringify(selected.executable)}, args, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status === 0 && args.includes("--listEmittedFiles")) { ${mutate} }
process.exit(result.status ?? 1);
`,
    { mode: 0o755 }
  )
  const fixtureResolver = await import(pathToFileURL(resolve(scripts, "pinned-typescript.mjs")))
  const rootSelection = await fixtureResolver.resolvePinnedTypeScript(root),
    toolingSelection = await fixtureResolver.resolvePinnedTypeScript(scripts)
  writeFileSync(
    resolve(root, ".test-runs/build-toolchain.json"),
    JSON.stringify({
      node: fileEvidence(root, realpathSync(process.execPath)),
      typescript: (stampOwner === "scripts" ? toolingSelection : rootSelection).identity
    })
  )
  const fixtureGraph = await import(pathToFileURL(resolve(scripts, "package-graph.mjs")))
  const authored = await import(pathToFileURL(resolve(scripts, "authored-task-inputs.mjs")))
  authored.prepareAuthoredTaskInputs(root, fixtureGraph.readPackageGraph(root))
  const run = () => {
    const env = { ...process.env }
    delete env.HAPSLAND_BUILD_LOCK_LEASE
    return spawnSync(process.execPath, [resolve(scripts, "compile-package.mjs")], {
      cwd: subject,
      env,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 1024 * 1024
    })
  }
  return {
    root,
    subject,
    nestedExecutable: realpathSync(nestedExecutable),
    marker,
    rootSelection,
    toolingSelection,
    run
  }
}
