import { createHash } from "node:crypto"
import { existsSync, readdirSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { readPackageGraph } from "./package-graph.mjs"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { bendProducerToolchain } from "./bend-producer.mjs"
import { nativeTaskPlans, observeNativeTaskInputs } from "./native-task-inputs.mjs"

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const ignored = new Set(["dist", "artifacts", "node_modules", ".test-runs", ".turbo"])
const authoredInventory = (root, directory) =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      if (ignored.has(entry.name) || entry.name.startsWith(".bend-stage-")) return []
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Build watch authored symlink is unsupported: ${path}`)
      return entry.isDirectory() ? authoredInventory(root, path) : [fileEvidence(root, path)]
    })
const nativeObserver = () => {
  const previous = new Map()
  return async (root, graph, environment) => {
    const observations = []
    for (const profile of ["linux-arm64", "darwin-arm64"])
      for (const plan of nativeTaskPlans(root, graph, profile)) {
        const key = `${plan.node.manifest.name}#${profile}`
        const observed = await observeNativeTaskInputs(root, graph, plan, environment, previous.get(key))
        previous.set(key, observed)
        observations.push(observed)
      }
    return observations
  }
}

/** Observe admission and repair needs; Turbo remains the sole task scheduler and cache. */
export const createBuildWatchObserver = (
  root,
  {
    environment = process.env,
    observeRuntime = async () => ({
      node: fileEvidence(root, realpathSync(process.execPath)),
      bun: fileEvidence(root, realpathSync(resolveBunRuntime(environment).executable)),
      bend: await bendProducerToolchain(root)
    }),
    observeNative = nativeObserver()
  } = {}
) => {
  const inventory = (path) => (existsSync(path) ? fileInventory(root, path) : null)
  return async () => {
    const graph = readPackageGraph(root),
      owners = [...graph.packages.values()]
    return {
      source: digest({
        configuration: [
          "package.json",
          "bun.lock",
          "tsconfig.json",
          "tsconfig.package.json",
          "tsconfig.packages.json",
          "turbo.json"
        ].map((path) => fileEvidence(root, resolve(root, path))),
        owners: owners.map((owner) => ({
          manifest: fileEvidence(root, resolve(owner.path, "package.json")),
          configuration: owner.compiler === "bend" ? null : fileEvidence(root, resolve(owner.path, "tsconfig.json")),
          source: authoredInventory(root, owner.compiler === "bend" ? owner.path : resolve(owner.path, "src"))
        })),
        tooling: authoredInventory(root, resolve(root, "scripts")),
        native: await observeNative(root, graph, environment),
        runtime: await observeRuntime(),
        platform: process.platform,
        architecture: process.arch,
        profile: environment.HAPSLAND_BUILD_PROFILE ?? null
      }),
      output: digest({
        release: inventory(resolve(root, "dist")),
        native: inventory(resolve(root, "native/prebuilt")),
        owners: owners.map((owner) => ({
          emitted: inventory(resolve(owner.path, "dist")),
          artifacts: inventory(resolve(owner.path, "artifacts"))
        }))
      })
    }
  }
}
