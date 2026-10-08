import { readFileSync, writeFileSync, chmodSync, renameSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { prepareReleaseArchive, auditPreparedArchive } from "./release-archive.mjs"
import { retainReleaseAudit } from "./prepared-release.mjs"
import {
  RELEASE_PIN_PATH,
  releaseGit,
  releaseSourceTree,
  releaseGeneratedPaths,
  assertReleaseSource
} from "./release-inputs.mjs"
import { validateReleaseTarget } from "./release-coordinates.mjs"
import { BUN_VERSION, resolveBunRuntime, ensurePinnedBunLauncher } from "./pinned-bun.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { RELEASE_ARCHIVE_TIMEOUT_MS } from "./build-deadlines.mjs"

export async function prepareRelease(root) {
  const target = validateReleaseTarget(JSON.parse(readFileSync(resolve(root, RELEASE_PIN_PATH), "utf8")))
  const buildPlatform = `${process.platform}-${process.arch}`
  if (!["linux-arm64", "darwin-arm64"].includes(buildPlatform) || process.version !== "v24.20.0")
    throw new Error(
      "Preparation requires Linux/macOS arm64 and Node 24.20.0: mise exec node@24.20.0 -- npm run release:prepare"
    )
  if (releaseGit(root, "status", "--porcelain", "--untracked-files=normal"))
    throw new Error("Release preparation requires a clean committed checkout.")
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
  if (
    manifest.name !== target.packageName ||
    manifest.version !== target.version ||
    manifest.private === true ||
    manifest.packageManager !== `bun@${BUN_VERSION}`
  )
    throw new Error(
      "Release target does not match package.json; commit matching version and channel before preparation."
    )
  const runtime = resolveBunRuntime()
  const sourceCommit = releaseGit(root, "rev-parse", "HEAD")
  const pin = {
    format: 1,
    packageName: target.packageName,
    repositoryUrl: target.repositoryUrl,
    version: target.version,
    tag: target.tag,
    sourceCommit,
    sourceTreeSha256: releaseSourceTree(root, sourceCommit, buildPlatform),
    buildPlatform
  }
  const deadline = Date.now() + RELEASE_ARCHIVE_TIMEOUT_MS
  await runBuildProcess(runtime.executable, ["install", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: root,
    env: { ...process.env, CI: "true" },
    timeout: 60000
  })
  ensurePinnedBunLauncher(root, runtime)
  assertReleaseSource(root, pin)
  const backups = releaseGeneratedPaths(root, buildPlatform).map((path) => ({
    path,
    bytes: readFileSync(resolve(root, path)),
    mode: Number.parseInt(releaseGit(root, "ls-tree", "HEAD", "--", path).split(" ")[0], 8) & 0o777
  }))
  const restoreNative = () => {
    for (const backup of backups) {
      writeFileSync(resolve(root, backup.path), backup.bytes)
      chmodSync(resolve(root, backup.path), backup.mode)
    }
  }
  let artifact
  try {
    artifact = await prepareReleaseArchive({
      root,
      deadline,
      validateArchive: async (built) => {
        try {
          assertReleaseSource(root, pin, { allowGenerated: true })
          const record = await auditPreparedArchive({
            root,
            archivePath: built.archivePath,
            commit: sourceCommit,
            coordinates: pin,
            deadline
          })
          pin.archiveSha256 = built.archiveDigest
          pin.auditSha256 = await retainReleaseAudit(root, record)
        } finally {
          restoreNative()
        }
      }
    })
  } catch (error) {
    if (!error.groupUnresolved) await withBuildLock(root, async () => restoreNative())
    throw error
  }
  assertReleaseSource(root, pin)
  const path = resolve(root, RELEASE_PIN_PATH),
    temporary = `${path}.${process.pid}.tmp`
  await withBuildLock(
    root,
    async () => {
      assertReleaseSource(root, pin)
      try {
        writeFileSync(temporary, `${JSON.stringify(pin, null, 2)}\n`)
        renameSync(temporary, path)
      } finally {
        rmSync(temporary, { force: true })
      }
    },
    deadline - Date.now()
  )
  process.stdout.write(
    `Prepared and audited: ${artifact.archivePath}\nSHA-256: ${artifact.archiveDigest}\nCommit and push ${RELEASE_PIN_PATH}, then run npm run local-release. Publication uses this archive without rebuilding.\n`
  )
  return { ...artifact, pin }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2)
    throw new Error("release:prepare takes coordinates from scripts/npm-release-pin.json and accepts no arguments")
  await prepareRelease(process.cwd())
}
