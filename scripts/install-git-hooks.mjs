import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, realpathSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const marker = "# Hapsland shared-worktree hook dispatcher"
export const dispatcher = `#!/bin/sh
${marker}
set -eu
root=$(git rev-parse --show-toplevel)
cd "$root"
if [ -f .husky/pre-commit ]; then
  exec sh .husky/pre-commit
fi
common=$(git rev-parse --git-common-dir)
exec sh "$common/hapsland-hooks/maintained-pre-commit"
`
export function installGitHooks(root = process.cwd()) {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000 }).trim()
  const common = realpathSync(resolve(root, git("rev-parse", "--git-common-dir")))
  const hooks = join(common, "hapsland-hooks")
  const readConfig = (worktree, scope, key) => {
    try {
      return execFileSync("git", ["-C", worktree, "config", scope, "--get", key], {
        encoding: "utf8",
        timeout: 5000
      }).trim()
    } catch (error) {
      if (error.status === 1) return undefined
      throw error
    }
  }
  const owned = (configured) => !configured || configured === ".husky/_" || configured === hooks
  const configured = readConfig(root, "--local", "core.hooksPath")
  if (!owned(configured)) throw new Error(`Existing core.hooksPath is not Hapsland-owned: ${configured}`)
  const worktreeConfig = readConfig(root, "--local", "extensions.worktreeConfig") === "true"
  const worktrees = git("worktree", "list", "--porcelain", "-z")
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => field.slice(9))
    .filter((path) => existsSync(path))
  const overrides = worktreeConfig
    ? worktrees.map((worktree) => ({ worktree, configured: readConfig(worktree, "--worktree", "core.hooksPath") }))
    : []
  for (const override of overrides)
    if (!owned(override.configured))
      throw new Error(`Worktree core.hooksPath is not Hapsland-owned: ${override.worktree}: ${override.configured}`)
  mkdirSync(hooks, { recursive: true })
  const path = join(hooks, "pre-commit")
  if (existsSync(path) && !readFileSync(path, "utf8").includes(marker))
    throw new Error("Existing shared pre-commit dispatcher is not Hapsland-owned")
  const maintained = join(root, ".husky/pre-commit")
  const fallback = join(hooks, "maintained-pre-commit")
  if (existsSync(maintained)) writeFileSync(fallback, readFileSync(maintained))
  else if (!existsSync(fallback)) throw new Error("No maintained pre-commit command is available")
  writeFileSync(path, dispatcher)
  chmodSync(path, 0o755)
  git("config", "--local", "core.hooksPath", hooks)
  for (const { worktree, configured } of overrides) {
    if (configured !== undefined)
      execFileSync("git", ["-C", worktree, "config", "--worktree", "core.hooksPath", hooks], { timeout: 5000 })
  }
  // A worktree-specific setting would override the shared configuration.
  if (git("config", "--get", "core.hooksPath") !== hooks)
    throw new Error("A worktree-specific core.hooksPath overrides the shared dispatcher")
  return { hooksPath: hooks, dispatcher: path }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(installGitHooks()))
