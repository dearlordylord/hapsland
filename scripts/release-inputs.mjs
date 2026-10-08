import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { relative } from "node:path"
import { readPackageGraph } from "./package-graph.mjs"
import { generatedNativePaths } from "./native-task-inputs.mjs"

export const RELEASE_PIN_PATH = "scripts/npm-release-pin.json"
export const releaseGit = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000, maxBuffer: 16 * 1024 * 1024 }).trim()
export const releaseGeneratedPaths = (root, buildPlatform) => {
  const manifest = JSON.parse(readFileSync(`${root}/package.json`, "utf8"))
  return manifest.workspaces
    ? generatedNativePaths(root, readPackageGraph(root), buildPlatform).map((path) =>
        relative(root, path).replaceAll("\\", "/")
      )
    : []
}
// A pin-only follow-up commit does not change the candidate. Native binaries
// compiled on the preparation host are outputs; their C sources remain inputs.
export function releaseSourceTree(root, commit, buildPlatform) {
  const excluded = new Set([RELEASE_PIN_PATH, ...releaseGeneratedPaths(root, buildPlatform)])
  const entries = releaseGit(root, "ls-tree", "-r", "-z", commit).split("\0").filter(Boolean)
  const inputs = entries.filter((entry) => !excluded.has(entry.slice(entry.indexOf("\t") + 1)))
  return createHash("sha256").update(inputs.join("\0")).digest("hex")
}
export function assertReleaseSource(root, pin, { allowGenerated = false, allowPin = false } = {}) {
  const head = releaseGit(root, "rev-parse", "HEAD")
  try {
    releaseGit(root, "merge-base", "--is-ancestor", pin.sourceCommit, head)
    if (releaseSourceTree(root, pin.sourceCommit, pin.buildPlatform) !== pin.sourceTreeSha256)
      throw new Error("Prepared source tree differs from its commit")
  } catch {
    throw new Error("Prepared source commit is unavailable or differs from its pin. Run npm run release:prepare.")
  }
  if (releaseSourceTree(root, head, pin.buildPlatform) !== pin.sourceTreeSha256)
    throw new Error("Release pin is stale: source inputs changed. Run npm run release:prepare before publishing.")
  const allowed = new Set([
    ...(allowGenerated ? releaseGeneratedPaths(root, pin.buildPlatform) : []),
    ...(allowPin ? [RELEASE_PIN_PATH] : [])
  ])
  const changed = releaseGit(root, "diff", "--name-only", "-z", "HEAD").split("\0").filter(Boolean)
  const untracked = releaseGit(root, "ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)
  if ([...changed, ...untracked].some((path) => !allowed.has(path)))
    throw new Error("Release requires committed source inputs; commit changes, then run npm run release:prepare.")
  return head
}
