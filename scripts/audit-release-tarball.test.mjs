import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { validateReleasePublication } from "./audit-release-tarball.mjs"

test("release consumer binds physical owner, public path, and shipped byte and mode evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-release-consumer-"))
  try {
    mkdirSync(join(root, "owned"))
    mkdirSync(join(root, "dist"))
    const owner = join(root, "owned/module.js"),
      published = join(root, "dist/module.js")
    writeFileSync(owner, "export const value = 1", { mode: 0o644 })
    writeFileSync(published, "export const value = 1", { mode: 0o644 })
    const output = { ...fileEvidence(root, owner), publicPath: "dist/module.js" }
    const shipped = { sha256: output.sha256, mode: output.mode }
    validateReleasePublication(root, output, shipped)
    assert.throws(() => validateReleasePublication(root, output, { ...shipped, mode: 0o755 }), /differs/)
    assert.throws(() => validateReleasePublication(root, output, { ...shipped, sha256: "wrong" }), /differs/)
    chmodSync(published, 0o755)
    assert.throws(() => validateReleasePublication(root, output), /differs/)
    chmodSync(published, 0o644)
    writeFileSync(published, "stale publication")
    assert.throws(() => validateReleasePublication(root, output), /differs/)
    writeFileSync(published, "export const value = 1")
    writeFileSync(owner, "changed owner")
    assert.throws(() => validateReleasePublication(root, output), /differs/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
