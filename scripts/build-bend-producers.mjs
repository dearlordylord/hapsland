import { resolveTurboExecutable } from "./pinned-turbo.mjs"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"
import { bendProducerToolchain, checkBendProducerReceipt } from "./bend-producer.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { prepareAuthoredTaskInputs } from "./authored-task-inputs.mjs"

export const prepareBendProducerToolchain = async (root, graph = readPackageGraph(root)) => {
  const producers = [...graph.packages.values()].filter((node) => node.compiler === "bend")
  if (!producers.length) return
  mkdirSync(resolve(root, ".test-runs"), { recursive: true })
  const toolchain = await bendProducerToolchain(root)
  writeFileSync(resolve(root, ".test-runs/bend-toolchain.json"), JSON.stringify(toolchain))
  return toolchain
}

export const buildBendProducers = async (root, environment, graph = readPackageGraph(root)) => {
  const producers = [...graph.packages.values()].filter((node) => node.compiler === "bend")
  const toolchain = await prepareBendProducerToolchain(root, graph)
  if (!toolchain) return
  prepareAuthoredTaskInputs(
    root,
    { ...graph, packages: new Map(producers.map((node) => [node.manifest.name, node])) },
    { bendToolchain: toolchain }
  )
  await runBuildProcess(
    resolveTurboExecutable(root),
    [
      "run",
      "build",
      "--cache=local:rw",
      "--concurrency=2",
      "--cache-dir=.test-runs/turbo-cache",
      ...producers.map((node) => `--filter=${node.manifest.name}`)
    ],
    {
      cwd: root,
      stdio: "inherit",
      timeout: 180000,
      env: {
        ...environment,
        TURBO_TELEMETRY_DISABLED: "1",
        HAPSLAND_BEND_PRODUCER_ENV: JSON.stringify(toolchain.environment)
      }
    }
  )
  for (const producer of producers) checkBendProducerReceipt(root, producer)
  return toolchain
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..")
  await withBuildLock(root, async (environment) => buildBendProducers(root, environment))
}
