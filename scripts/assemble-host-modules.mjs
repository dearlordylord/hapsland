import { mkdirSync, writeFileSync, renameSync, chmodSync, rmSync, readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { hostModuleGraph } from "./host-module-graph.mjs"
import { hostModulePlan } from "./host-module-plan.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import {
  checkAssemblyPrerequisite,
  assemblyPrerequisitePath,
  assemblySnapshotDigest
} from "./assembly-prerequisites.mjs"
import { withBuildLock } from "./build-lock.mjs"

export function hostArtifactPaths(root, snapshot) {
  const graph = readPackageGraph(root),
    owner = graph.packages.get(snapshot.owner)
  if (owner?.manifest.hapsland?.surface !== "pi-extension" || snapshot.profile !== "host")
    throw new Error("Invalid host artifact owner")
  const directory = resolve(owner.path, "artifacts/host")
  return { directory, receipt: resolve(directory, "host-module-receipt.json") }
}
export async function prepareHostModules(root, snapshot) {
  checkAssemblyPrerequisite(root, snapshot)
  const graph = readPackageGraph(root),
    paths = hostArtifactPaths(root, snapshot)
  const modules = hostModuleGraph(root, graph, resolve(root, snapshot.entry))
  const sourceClosure = new Set(snapshot.sources.map((source) => source.path))
  const logicalPlan = hostModulePlan(modules, (record) => {
    const owner = graph.packages.get(record.owner)
    const local = relative(resolve(owner.path, "dist"), resolve(root, record.path))
    const origin = `${owner.directory}/src/${local.replace(/\.js$/, ".ts")}`
    if (!sourceClosure.has(origin)) throw new Error(`Host emitted module outside source closure: ${record.path}`)
    const directory = owner.manifest.hapsland.hostOutputDirectory
    if (typeof directory !== "string" || !/^dist(?:\/[a-z0-9-]+)*$/.test(directory))
      throw new Error(`Missing or unsupported host output directory: ${record.owner}`)
    const destination = `${directory}/${local}`
    if (!/^dist\/(pi|runtime)\//.test(destination))
      throw new Error("Host modules must use packaged pi or runtime directories")
    return destination
  })
  const entry = logicalPlan.find((output) => output.input === snapshot.entry)
  if (
    !entry ||
    graph.release.exports?.["./pi-extension"] !== `./${entry.path}` ||
    resolve(root, dirname(entry.path), "../bin") !== resolve(root, "dist/bin")
  )
    throw new Error("Pi output disagrees with public export or executable layout")
  const plan = logicalPlan.map(({ path: publicPath, ...output }) => ({
    ...output,
    publicPath,
    path: relative(root, resolve(paths.directory, publicPath)).replaceAll("\\", "/")
  }))
  return {
    format: 1,
    entry: snapshot.entry,
    prerequisite: snapshot,
    prerequisiteDigest: assemblySnapshotDigest(snapshot),
    inputs: modules.map(({ path, mode, sha256 }) => ({ path, mode, sha256 })),
    plan
  }
}
export async function checkHostModuleReceipt(root, snapshot) {
  const { plan, ...expected } = await prepareHostModules(root, snapshot)
  expected.outputs = plan.map(({ text: _text, ...output }) => output)
  return checkPublishedHostModules(root, snapshot, expected)
}
function checkPublishedHostModules(root, snapshot, expected) {
  const paths = hostArtifactPaths(root, snapshot),
    receipt = JSON.parse(readFileSync(paths.receipt, "utf8"))
  if (JSON.stringify(receipt) !== JSON.stringify(expected))
    throw new Error("Missing, corrupt or stale host module receipt")
  const inventory = fileInventory(root, paths.directory).filter(
    (output) => resolve(root, output.path) !== paths.receipt
  )
  if (
    JSON.stringify(inventory) !==
    JSON.stringify(
      expected.outputs
        .map(({ path, mode, sha256 }) => ({ path, mode, sha256 }))
        .sort((a, b) => a.path.localeCompare(b.path))
    )
  )
    throw new Error("Incomplete or changed host artifact inventory")
  return receipt
}
async function produceHostModules(root, snapshot, admission) {
  if (!admission || !process.env.HAPSLAND_BUILD_LOCK_LEASE)
    throw new Error("Host producer requires fresh assembly admission")
  checkAssemblyPrerequisite(root, snapshot, admission)
  const { plan, ...receipt } = await prepareHostModules(root, snapshot),
    paths = hostArtifactPaths(root, snapshot)
  const staging = paths.directory + `.stage-${process.pid}`
  rmSync(paths.directory, { recursive: true, force: true })
  rmSync(staging, { recursive: true, force: true })
  const verifyInputs = () => {
    checkAssemblyPrerequisite(root, snapshot, admission)
    for (const input of receipt.inputs)
      if (JSON.stringify(input) !== JSON.stringify(fileEvidence(root, resolve(root, input.path))))
        throw new Error(`Host module input changed during assembly: ${input.path}`)
  }
  try {
    for (const output of plan) {
      const path = resolve(staging, relative(paths.directory, resolve(root, output.path)))
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, output.text)
      chmodSync(path, output.mode)
    }
    verifyInputs()
    receipt.outputs = plan.map(({ text: _text, ...output }) => output)
    writeFileSync(resolve(staging, "host-module-receipt.json"), JSON.stringify(receipt, null, 2) + "\n")
    mkdirSync(dirname(paths.directory), { recursive: true })
    renameSync(staging, paths.directory)
    verifyInputs()
    return checkPublishedHostModules(root, snapshot, receipt)
  } catch (error) {
    rmSync(paths.directory, { recursive: true, force: true })
    throw error
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
export async function assembleHostModules(root, snapshot, admission) {
  if (!admission || !process.env.HAPSLAND_BUILD_LOCK_LEASE)
    throw new Error("Host producer requires fresh assembly admission")
  return withBuildLock(root, () => produceHostModules(root, snapshot, admission))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..")
  if (!process.env.HAPSLAND_BUILD_LOCK_LEASE) throw new Error("Host producer requires fresh assembly admission")
  const snapshot = JSON.parse(readFileSync(assemblyPrerequisitePath(root, "pi-extension", "host"), "utf8"))
  await assembleHostModules(root, snapshot, { owner: snapshot.owner, target: "host" })
}
