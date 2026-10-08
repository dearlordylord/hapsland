import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, openSync, closeSync, ftruncateSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkReleaseSize, RELEASE_ARCHIVE_MAX_BYTES } from "./release-size.mjs"

test("publication rejects oversized archives before loading their base64 payload", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-release-size-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, "candidate.tgz")
  const fd = openSync(path, "w")
  try {
    ftruncateSync(fd, RELEASE_ARCHIVE_MAX_BYTES)
    assert.equal(checkReleaseSize(path).attachmentBytes, 4 * Math.ceil(RELEASE_ARCHIVE_MAX_BYTES / 3))
    ftruncateSync(fd, RELEASE_ARCHIVE_MAX_BYTES + 1)
    assert.throws(() => checkReleaseSize(path), /publication budget/u)
  } finally {
    closeSync(fd)
  }
})
