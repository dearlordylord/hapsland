import { preparePackageArchive } from "./artifact-store.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { RELEASE_ARCHIVE_TIMEOUT_MS } from "./build-deadlines.mjs"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { bendProducerEnvironment } from "./bend-producer.mjs"

export async function auditPreparedArchive({ root, archivePath, commit, coordinates, deadline }) {
  const toolchain = JSON.parse(readFileSync(resolve(root, ".test-runs/bend-toolchain.json"), "utf8"))
  const env = { ...process.env, HAPSLAND_BEND_PRODUCER_ENV: JSON.stringify(toolchain.environment) }
  // Validate the bounded declaration before launching an isolated audit. The
  // receipt checks re-observe the actual tools and libraries in that context.
  bendProducerEnvironment(root, env)
  const result = await runBuildProcess(
    process.execPath,
    [
      resolve(root, "scripts/audit-release-tarball.mjs"),
      archivePath,
      commit,
      JSON.stringify({ root, coordinates, deadline })
    ],
    { cwd: root, env, timeout: deadline - Date.now(), stdio: ["ignore", "pipe", "inherit"] }
  )
  return JSON.parse(result.stdout)
}

export async function prepareReleaseArchive({
  root,
  deadline = Date.now() + RELEASE_ARCHIVE_TIMEOUT_MS,
  validateArchive
}) {
  return preparePackageArchive({
    root,
    recipe: "release",
    deadline,
    validateArchive,
    runStage: async ({ command, args, cwd, env }) => {
      const timeout = deadline - Date.now()
      if (timeout <= 0) throw new Error("Release archive preparation deadline exceeded")
      await runBuildProcess(command, args, { cwd, env, stdio: "inherit", timeout })
      return { exitCode: 0 }
    }
  })
}
