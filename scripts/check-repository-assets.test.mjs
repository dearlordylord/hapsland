import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"

test("repository asset gate bounds the current migration guide without limiting other documents", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-migration-guide-"))
  const runner = resolve("scripts/check-repository-assets.mjs")
  const check = () => spawnSync(process.execPath, [runner], { cwd: root, encoding: "utf8", timeout: 5000 })
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root })
    mkdirSync(join(root, "docs"))
    writeFileSync(join(root, "docs/another-contract.md"), "x".repeat(32 * 1024))
    writeFileSync(join(root, "docs/bend-migration.md"), "x".repeat(16 * 1024))
    execFileSync("git", ["add", "docs"], { cwd: root })
    const boundary = check()
    assert.equal(boundary.status, 0, boundary.stdout + boundary.stderr)

    writeFileSync(join(root, "docs/bend-migration.md"), "x".repeat(16 * 1024 + 1))
    const oversized = check()
    assert.notEqual(oversized.status, 0)
    assert.match(oversized.stderr, /bend-migration\.md exceeds 16384 bytes/u)
    assert.match(oversized.stderr, /experiment history belongs in Git/u)

    writeFileSync(join(root, "docs/bend-migration.md"), "Current acceptance path\n")
    mkdirSync(join(root, "evidence"))
    writeFileSync(join(root, "evidence/result.json"), "{}\n")
    execFileSync("git", ["add", "evidence"], { cwd: root })
    assert.match(check().stderr, /run output are tracked by Git/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
