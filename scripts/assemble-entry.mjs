import { fileInventory } from "./compiler-evidence.mjs"
import { resolve } from "node:path"
import { readFileSync, mkdirSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"
import {
  assemblyPrerequisitePath,
  checkAssemblyPrerequisite,
  assemblyNativeArtifacts
} from "./assembly-prerequisites.mjs"
import { assemblyContext } from "./assembly-context.mjs"
import { checkAssemblyReceipt } from "./check-assembly-receipt.mjs"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { STANDALONE_PRODUCER_TIMEOUT_MS } from "./build-deadlines.mjs"

export const assemblyArtifactPaths = (root, owner, profile) => {
  if (
    !["linux-arm64", "darwin-arm64"].includes(profile) ||
    !/^[a-z][a-z-]*$/.test(owner.manifest.hapsland?.executable ?? "")
  )
    throw new Error("Invalid standalone artifact owner or profile")
  const directory = resolve(owner.path, "artifacts", profile)
  return {
    directory,
    output: resolve(directory, owner.manifest.hapsland.executable),
    receipt: resolve(directory, "assembly-receipt.json")
  }
}
export async function validateAssemblyArtifact(root, owner, profile, snapshot) {
  if (snapshot.owner !== owner.manifest.name || snapshot.profile !== profile)
    throw new Error("Assembly artifact owner mismatch")
  const paths = assemblyArtifactPaths(root, owner, profile),
    runtime = resolveBunRuntime()
  const receipt = JSON.parse(readFileSync(paths.receipt, "utf8"))
  checkAssemblyReceipt(
    root,
    receipt,
    await assemblyContext(root, `bun-${profile}`, runtime, snapshot),
    resolve(root, snapshot.entry),
    paths.output,
    assemblyNativeArtifacts(root, snapshot)
  )
  const inventory = fileInventory(root, paths.directory).filter((file) => resolve(root, file.path) !== paths.receipt)
  const outputs = [receipt.output, ...(receipt.bundle ? [receipt.bundle] : [])].sort((a, b) =>
    a.path.localeCompare(b.path)
  )
  if (JSON.stringify(inventory) !== JSON.stringify(outputs))
    throw new Error("Incomplete or changed standalone artifact inventory")
  return {
    receipt,
    outputs: outputs.map((output) => ({
      ...output,
      publicPath: `dist/bin/${profile}/${owner.manifest.hapsland.executable}${output === receipt.bundle ? ".js" : ""}`
    }))
  }
}
export async function assembleEntry(root, owner, profile) {
  if (!process.env.HAPSLAND_BUILD_LOCK_LEASE) throw new Error("Standalone producer requires fresh assembly admission")
  return withBuildLock(root, async (environment) => {
    const role = owner.manifest.hapsland.role,
      snapshotPath = assemblyPrerequisitePath(root, role, profile)
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"))
    checkAssemblyPrerequisite(root, snapshot, { owner: owner.manifest.name, target: profile })
    const paths = assemblyArtifactPaths(root, owner, profile),
      runtime = resolveBunRuntime()
    rmSync(paths.directory, { recursive: true, force: true })
    mkdirSync(paths.directory, { recursive: true })
    try {
      await runBuildProcess(
        runtime.executable,
        [
          resolve(root, "scripts/compile-standalone.mjs"),
          resolve(root, snapshot.entry),
          `bun-${profile}`,
          paths.output,
          snapshotPath,
          paths.receipt
        ],
        { cwd: root, env: environment, timeout: STANDALONE_PRODUCER_TIMEOUT_MS }
      )
      return await validateAssemblyArtifact(root, owner, profile, snapshot)
    } catch (error) {
      rmSync(paths.directory, { recursive: true, force: true })
      throw error
    }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, ".."),
    graph = readPackageGraph(root)
  const owner = [...graph.packages.values()].find((node) => node.path === resolve(process.cwd()))
  if (!owner) throw new Error("Standalone task must run in its manifest owner")
  await assembleEntry(root, owner, process.argv[2])
}
