import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { installGitHooks } from "./install-git-hooks.mjs"

const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000 }).trim()
test("one shared dispatcher runs maintained hooks in existing and future worktrees", () => {
  const temp = mkdtempSync(join(tmpdir(), "hapsland-hooks-test-"))
  try {
    const root = join(temp, "main")
    mkdirSync(root)
    git(root, "init", "-q")
    git(root, "config", "user.name", "Hook fixture")
    git(root, "config", "user.email", "fixture@example.invalid")
    mkdirSync(join(root, ".husky"))
    writeFileSync(join(root, ".husky/pre-commit"), "set -eu\npwd > hook-working-directory\n")
    git(root, "add", ".husky/pre-commit")
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture")
    const existing = join(temp, "existing")
    git(root, "worktree", "add", "--detach", existing)
    git(root, "config", "core.hooksPath", ".husky/_")
    git(root, "config", "extensions.worktreeConfig", "true")
    git(existing, "config", "--worktree", "core.hooksPath", ".husky/_")
    const installed = installGitHooks(existing)
    assert.equal(installGitHooks(root).hooksPath, installed.hooksPath)
    const future = join(temp, "future")
    git(root, "worktree", "add", "--detach", future)
    assert.equal(git(existing, "config", "--worktree", "--get", "core.hooksPath"), installed.hooksPath)
    git(future, "config", "--worktree", "core.hooksPath", "/foreign/worktree/hooks")
    assert.throws(() => installGitHooks(root), /Worktree core.hooksPath is not Hapsland-owned/)
    assert.equal(git(future, "config", "--get", "core.hooksPath"), "/foreign/worktree/hooks")
    git(future, "config", "--worktree", "--unset", "core.hooksPath")
    for (const worktree of [root, existing, future]) {
      assert.equal(git(worktree, "config", "--get", "core.hooksPath"), installed.hooksPath)
      git(worktree, "hook", "run", "pre-commit")
      assert.equal(readFileSync(join(worktree, "hook-working-directory"), "utf8").trim(), worktree)
      writeFileSync(join(worktree, "committed.txt"), "valid\n")
      git(worktree, "add", "committed.txt")
      git(worktree, "commit", "-qm", "shared hook accepts real commit")
      const accepted = git(worktree, "rev-parse", "HEAD")
      writeFileSync(join(worktree, ".husky/pre-commit"), "set -eu\nexit 1\n")
      writeFileSync(join(worktree, "committed.txt"), "rejected\n")
      git(worktree, "add", "committed.txt")
      assert.throws(() => git(worktree, "commit", "-qm", "must be rejected"))
      assert.equal(git(worktree, "rev-parse", "HEAD"), accepted)
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
test("foreign hook configuration is preserved", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-hooks-foreign-"))
  try {
    git(root, "init", "-q")
    git(root, "config", "core.hooksPath", "/custom/hooks")
    assert.throws(() => installGitHooks(root), /not Hapsland-owned/)
    assert.equal(git(root, "config", "--get", "core.hooksPath"), "/custom/hooks")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
