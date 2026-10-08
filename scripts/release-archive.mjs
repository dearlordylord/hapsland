import { preparePackageArchive } from "./artifact-store.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { RELEASE_ARCHIVE_TIMEOUT_MS } from "./build-deadlines.mjs"

export async function prepareReleaseArchive({ root, deadline = Date.now() + RELEASE_ARCHIVE_TIMEOUT_MS }) {
  return preparePackageArchive({
    root,
    recipe: "release",
    deadline,
    runStage: async ({ command, args, cwd, env }) => {
      const timeout = deadline - Date.now()
      if (timeout <= 0) throw new Error("Release archive preparation deadline exceeded")
      await runBuildProcess(command, args, { cwd, env, stdio: "inherit", timeout })
      return { exitCode: 0 }
    }
  })
}
