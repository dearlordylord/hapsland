import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ensureExecutionArtifact, dependencyIdentity } from "./artifact-store.mjs"
import { sourceIdentity } from "./test-harness/source-identity.mjs"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import {
  sourceRuntimeLayout,
  sourceRuntimeCommand,
  sourceRuntimeEntries
} from "../src/runtime/source-runtime-layout.ts"

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export async function ensureSourceRuntime({
  root,
  runStage,
  coverage = "none",
  deadline = Date.now() + 120000,
  store
} = {}) {
  if (!["none", "istanbul"].includes(coverage)) throw new Error("Unknown source runtime coverage mode")
  root = resolve(root)
  const runtime = resolveBunRuntime()
  const dependencyMeasurements = []
  const identify = async ({ deadline }) => {
    const sourceDigest = await sourceIdentity(
      root,
      undefined,
      (path) =>
        (path.startsWith("src/") ||
          path.startsWith("scripts/") ||
          path.startsWith("native/prebuilt/") ||
          ["package.json", "package-runtime.json", "bun.lock"].includes(path)) &&
        !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) &&
        !path.endsWith(".md"),
      { deadline }
    )
    const metrics = {},
      started = performance.now()
    let dependencies
    try {
      dependencies = await dependencyIdentity(root, { deadline, metrics })
    } catch (error) {
      error.message = `Dependency identity failed after ${Math.round(performance.now() - started)}ms (${metrics.bytesRead ?? 0} bytes, ${metrics.misses ?? 0} files): ${error.message}`
      throw error
    }
    dependencyMeasurements.push({ elapsedMs: Math.round(performance.now() - started), ...metrics })
    return {
      identity: hash({ sourceDigest, dependencies, bun: runtime.version, coverage, recipe: "source-runtime" }),
      sourceDigest
    }
  }
  const artifact = await ensureExecutionArtifact({
    root,
    store,
    kind: "source-runtime",
    identify,
    deadline,
    destination: (identity) => sourceRuntimeLayout(root, identity).directory,
    prepare: async (directory, { checkedStage }) => {
      await checkedStage(runStage, {
        name: "source-runtime-build",
        command: runtime.executable,
        args: [join(root, "scripts/build-source-runtime.ts"), directory, coverage],
        cwd: root,
        env: {}
      })
    }
  })
  const layout = sourceRuntimeLayout(root, artifact.identity)
  return {
    ...artifact,
    environment:
      coverage === "istanbul"
        ? { HAPSLAND_BUN_COVERAGE_MANIFEST: join(artifact.directory, "source-manifest.json") }
        : {},
    dependencyMeasurements,
    commands: Object.fromEntries(
      Object.keys(sourceRuntimeEntries).map((role) => [role, sourceRuntimeCommand(layout, runtime.executable, role)])
    )
  }
}
export async function prepareSourceRuntime({
  root = process.cwd(),
  coverage = "none",
  timeoutMs = 120000,
  inherited = process.env.HAPSLAND_CHECK_CONTEXT
} = {}) {
  const { createRun } = await import("./test-harness/run-checks.mjs")
  const run = await createRun({
    root: resolve(root),
    mode: inherited ? "artifact" : "focused",
    timeoutMs,
    inherited,
    scope: "source-runtime-preparation",
    output: (message) => process.stderr.write(`${message}\n`)
  })
  let artifact
  try {
    artifact = await ensureSourceRuntime({
      root: run.root,
      coverage,
      runStage: run.runStage,
      deadline: run.context.deadline
    })
    await run.recordPassedStage({ name: "source-runtime-verification", evidence: artifact })
  } catch (error) {
    await run.recordFailedStage({ name: "source-runtime-preparation", error })
  }
  const exitCode = await run.finish()
  if (exitCode !== 0 || !artifact) throw new Error("Source runtime preparation failed; see recorded stages")
  return artifact
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareSourceRuntime({ coverage: process.env.HAPSLAND_BUN_COVERAGE_DIRECTORY ? "istanbul" : "none" })
    .then((artifact) => console.log(JSON.stringify(artifact)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
