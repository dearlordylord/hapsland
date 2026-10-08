import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

export const RELEASE_PIN_PATH = "scripts/npm-release-pin.json"
export const releaseGit = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000, maxBuffer: 16 * 1024 * 1024 }).trim()
// A pin-only follow-up commit does not change the candidate. All native files are ignored outputs.
export function releaseSourceTree(root, commit) {
  const excluded = new Set([RELEASE_PIN_PATH])
  const entries = releaseGit(root, "ls-tree", "-r", "-z", commit).split("\0").filter(Boolean)
  const inputs = entries.filter((entry) => !excluded.has(entry.slice(entry.indexOf("\t") + 1)))
  return createHash("sha256").update(inputs.join("\0")).digest("hex")
}
export function assertReleaseSource(root, pin, { allowPin = false } = {}) {
  const head = releaseGit(root, "rev-parse", "HEAD")
  try {
    releaseGit(root, "merge-base", "--is-ancestor", pin.sourceCommit, head)
    if (releaseSourceTree(root, pin.sourceCommit) !== pin.sourceTreeSha256)
      throw new Error("Prepared source tree differs from its commit")
  } catch {
    throw new Error("Prepared source commit is unavailable or differs from its pin. Run npm run release:prepare.")
  }
  if (releaseSourceTree(root, head) !== pin.sourceTreeSha256)
    throw new Error("Release pin is stale: source inputs changed. Run npm run release:prepare before publishing.")
  const allowed = new Set(allowPin ? [RELEASE_PIN_PATH] : [])
  const changed = releaseGit(root, "diff", "--name-only", "-z", "HEAD").split("\0").filter(Boolean)
  const untracked = releaseGit(root, "ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)
  if ([...changed, ...untracked].some((path) => !allowed.has(path)))
    throw new Error("Release requires committed source inputs; commit changes, then run npm run release:prepare.")
  return head
}
