import { mkdirSync, writeFileSync, realpathSync } from "node:fs"
import { dependencyIdentity } from "./artifact-store.mjs"
import { fileEvidence } from "./compiler-evidence.mjs"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { resolve } from "node:path"
import { generatePackageConfigs } from "./package-graph.mjs"
import { generateReleaseIdentity } from "./generate-release-identity.mjs"
import { prepareBendProducerToolchain } from "./build-bend-producers.mjs"
import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"
import { prepareAuthoredTaskInputs, verifyAuthoredTaskInputs } from "./authored-task-inputs.mjs"
import { prepareNativeTaskInputs } from "./native-task-inputs.mjs"
import { generateTurboConfig } from "./generate-turbo-config.mjs"
const root = resolve(import.meta.dirname, "..")
const args = process.argv.slice(2)
if (args.length > 1 || args.some((arg) => arg !== "--with-native"))
  throw new Error("Workspace build accepts only --with-native")
const withNative = args.includes("--with-native")
await withBuildLock(root, async (buildEnvironment) => {
  const graph = generatePackageConfigs(root, true)
  generateReleaseIdentity(root, true)
  generateTurboConfig(root, { check: true })
  mkdirSync(resolve(root, ".test-runs"), { recursive: true })
  const bendToolchain = await prepareBendProducerToolchain(root, graph)
  const profiles = process.env.HAPSLAND_BUILD_PROFILE
    ? [process.env.HAPSLAND_BUILD_PROFILE]
    : ["linux-arm64", "darwin-arm64"]
  if (profiles.some((profile) => !["linux-arm64", "darwin-arm64"].includes(profile)))
    throw new Error("Unsupported product build profile")
  const toolchain = {
    node: fileEvidence(root, realpathSync(process.execPath)),
    bun: fileEvidence(root, realpathSync(resolveBunRuntime().executable)),
    typescript: (await resolvePinnedTypeScript(resolve(root, "scripts"))).identity,
    dependencies: await dependencyIdentity(root),
    platform: process.platform,
    architecture: process.arch,
    environment: Object.fromEntries(
      ["NODE_OPTIONS", "BUN_OPTIONS", "HAPSLAND_BUILD_PROFILE"].map((key) => [key, process.env[key] ?? null])
    )
  }
  writeFileSync(resolve(root, ".test-runs/build-toolchain.json"), JSON.stringify(toolchain))
  const authored = prepareAuthoredTaskInputs(root, graph, { toolchain, bendToolchain })
  if (withNative) await prepareNativeTaskInputs(root, graph, buildEnvironment)
  await runBuildProcess(
    resolve(root, "node_modules/.bin/turbo"),
    [
      "run",
      "build",
      ...(withNative ? profiles.map((profile) => `native:${profile}`) : []),
      "--cache=local:rw",
      "--concurrency=2",
      "--cache-dir=.test-runs/turbo-cache",
      ...graph.order.map((name) => `--filter=${name}`)
    ],
    {
      cwd: root,
      stdio: "inherit",
      timeout: 180000,
      env: {
        ...buildEnvironment,
        TURBO_TELEMETRY_DISABLED: "1",
        ...(bendToolchain ? { HAPSLAND_BEND_PRODUCER_ENV: JSON.stringify(bendToolchain.environment) } : {})
      }
    }
  )

  // Match the pre-hash observation, rather than accepting a new snapshot after
  // Turbo has started. Producers enforce the same bound independently.
  verifyAuthoredTaskInputs(root, graph, authored)
})
