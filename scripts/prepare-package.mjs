import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./test-harness/run-checks.mjs"
import { preparePackageArchive } from "./artifact-store.mjs"

export async function preparePackage({
  root = process.cwd(),
  timeoutMs = 120000,
  inherited = process.env.HAPSLAND_CHECK_CONTEXT
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("Package preparation requires a finite positive deadline")
  const run = await createRun({
    root: resolve(root),
    mode: inherited ? "artifact" : "focused",
    timeoutMs,
    inherited,
    scope: "package-preparation",
    output: (message) => process.stderr.write(`${message}\n`)
  })
  let artifact
  try {
    artifact = await preparePackageArchive({ root: run.root, runStage: run.runStage, deadline: run.context.deadline })
    await run.recordPassedStage({ name: "artifact-verification", evidence: artifact })
  } catch (error) {
    await run.recordFailedStage({ name: "package-preparation", error })
  }
  const exitCode = await run.finish()
  if (exitCode !== 0 || !artifact) throw new Error("Package preparation failed; see recorded stages")
  return artifact
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length > 1 || args.some((arg) => !/^--timeout-ms=\d+$/.test(arg)))
    throw new Error("Usage: prepare-package.mjs [--timeout-ms=N]")
  preparePackage({ ...(args.length ? { timeoutMs: Number(args[0].slice(13)) } : {}) })
    .then((artifact) => console.log(JSON.stringify(artifact)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
