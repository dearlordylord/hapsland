import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readFileSync, statSync, openSync, closeSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { copyNativeArtifact } from "./native-artifact.mjs"

test("atomic publication replaces the inode while an existing reader retains old bytes and parser mode", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-native-publication-"))
  let reader
  try {
    const source = join(root, "owned.node"),
      output = join(root, "published.node")
    writeFileSync(source, "new verified parser")
    writeFileSync(output, "loaded old parser")
    const oldInode = statSync(output).ino
    reader = openSync(output, "r")
    copyNativeArtifact(source, output, 0o644)
    assert.notEqual(statSync(output).ino, oldInode)
    assert.equal(statSync(output).mode & 0o777, 0o644)
    assert.equal(readFileSync(output, "utf8"), "new verified parser")
    assert.equal(readFileSync(reader, "utf8"), "loaded old parser")
    copyNativeArtifact(source, output)
    assert.equal(statSync(output).mode & 0o777, 0o755)
  } finally {
    if (reader !== undefined) closeSync(reader)
    rmSync(root, { recursive: true, force: true })
  }
})
