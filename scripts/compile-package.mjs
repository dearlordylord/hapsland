import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { compilerInputs, fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { compilerContext, readCompilerToolchain } from "./compiler-context.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { verifyAuthoredInputStamp } from "./authored-task-inputs.mjs"

const root = resolve(import.meta.dirname, "..")
await withBuildLock(root, async () => {
  const graph = readPackageGraph(root)
  const node = [...graph.packages.values()].find((candidate) => candidate.path === process.cwd())
  if (!node) throw new Error("Compiler must run in a declared build workspace")
  if (node.compiler !== "typescript") throw new Error("TypeScript compiler requires a TypeScript workspace")
  const output = resolve(node.path, "dist")
  const receipt = resolve(output, ".compile-receipt.json")
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  try {
    const selected = await resolvePinnedTypeScript(resolve(root, "scripts"))
    if (JSON.stringify(selected.identity) !== JSON.stringify(readCompilerToolchain(root).typescript))
      throw new Error("Compiler selection disagrees with recorded toolchain")
    const authored = verifyAuthoredInputStamp(root, node)
    const compiler = selected.executable
    const assets = (directory) =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name)
        return entry.isDirectory()
          ? assets(path)
          : entry.name.endsWith(".generated.js") || entry.name.endsWith(".d.ts") || entry.name.endsWith(".json")
            ? [path]
            : []
      })
    const assetPaths = assets(resolve(node.path, "src"))
    const anticipated = spawnSync(
      compiler,
      ["-p", resolve(node.path, "tsconfig.json"), "--listFilesOnly", "--pretty", "false"],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 60000 }
    )
    if (anticipated.status !== 0) {
      rmSync(output, { recursive: true, force: true })
      throw (
        anticipated.error ?? new Error(`Compiler input discovery failed: ${anticipated.stdout}${anticipated.stderr}`)
      )
    }
    const paths = [...new Set([...compilerInputs(anticipated.stdout), ...assetPaths])].sort()
    const before = paths.map((path) => fileEvidence(root, path))
    const contextBefore = compilerContext(root, node)
    const result = spawnSync(
      compiler,
      ["-p", resolve(node.path, "tsconfig.json"), "--listFiles", "--listEmittedFiles", "--pretty", "false"],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 60000, env: process.env }
    )
    if (result.status !== 0) {
      rmSync(output, { recursive: true, force: true })
      const failureLog = resolve(root, ".test-runs", "compile-failures", `${node.manifest.hapsland.domain}.log`)
      mkdirSync(dirname(failureLog), { recursive: true })
      writeFileSync(failureLog, (result.stdout ?? "") + (result.stderr ?? ""))
      process.stderr.write(
        (result.stdout ?? "")
          .split("\n")
          .filter((line) => !line.startsWith("/") && !line.startsWith("TSFILE:"))
          .join("\n")
      )
      process.stderr.write(result.stderr ?? "")
      throw result.error ?? new Error(`Package compiler failed: ${node.manifest.name}`)
    }
    const inputs = compilerInputs(result.stdout ?? "")
    if (inputs.length === 0) throw new Error(`Missing compiler input evidence: ${node.manifest.name}`)
    const copyAssets = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name)
        if (entry.isDirectory()) copyAssets(path)
        else if (entry.name.endsWith(".generated.js") || entry.name.endsWith(".d.ts") || entry.name.endsWith(".json")) {
          const target = resolve(output, relative(resolve(node.path, "src"), path))
          mkdirSync(dirname(target), { recursive: true })
          copyFileSync(path, target)
          if (!inputs.includes(path)) inputs.push(path)
        }
      }
    }
    copyAssets(resolve(node.path, "src"))
    const actual = [...new Set(inputs)].sort()
    if (JSON.stringify(actual) !== JSON.stringify(paths))
      throw new Error(`Compiler input set changed: ${node.manifest.name}`)
    const after = actual.map((path) => fileEvidence(root, path))
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error(`Compiler inputs changed during compilation: ${node.manifest.name}`)
    const selectedAfter = await resolvePinnedTypeScript(resolve(root, "scripts"))
    if (JSON.stringify(selectedAfter.identity) !== JSON.stringify(readCompilerToolchain(root).typescript))
      throw new Error("Compiler selection changed during compilation")
    const contextAfter = compilerContext(root, node)
    if (JSON.stringify(contextBefore) !== JSON.stringify(contextAfter))
      throw new Error(`Compiler context changed during compilation: ${node.manifest.name}`)
    verifyAuthoredInputStamp(root, node, authored)
    writeFileSync(
      receipt,
      `${JSON.stringify(
        {
          context: contextAfter,
          package: node.manifest.name,
          host: node.manifest.hapsland.host,
          compilerVersion: `Version ${selected.version}`,
          inputs: after,
          outputs: fileInventory(node.path, output)
        },
        null,
        2
      )}\n`
    )
    process.stdout.write(`Compiled ${node.manifest.name}: ${inputs.length} recorded inputs\n`)
  } catch (error) {
    rmSync(output, { recursive: true, force: true })
    throw error
  }
})
