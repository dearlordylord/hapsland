import { strict as assert } from "node:assert"
import { it as test } from "vitest"
import { validateReleaseCoordinates } from "./release-coordinates.mjs"
const pin = {
  format: 1,
  sourceTreeSha256: "c".repeat(64),
  auditSha256: "d".repeat(64),
  buildPlatform: "darwin-arm64",
  packageName: "@hapsland/hapsland",
  version: "0.2.0",
  tag: "latest",
  repositoryUrl: "https://github.com/dearlordylord/hapsland.git",
  sourceCommit: "a".repeat(40),
  archiveSha256: "b".repeat(64)
}
test("stable and candidate coordinates produce distinct archive/tag identities", () => {
  assert.equal(validateReleaseCoordinates(pin).archiveFilename, "hapsland-hapsland-0.2.0.tgz")
  assert.equal(
    validateReleaseCoordinates({ ...pin, version: "0.3.0-next.1", tag: "next" }).archiveFilename,
    "hapsland-hapsland-0.3.0-next.1.tgz"
  )
})
test("reject channel/version mismatch and missing reviewed identity", () => {
  for (const change of [
    { version: "0.3.0-next.1" },
    { tag: "next" },
    { tag: "other" },
    { version: "../../archive" },
    { archiveSha256: "" },
    { sourceCommit: "" },
    { sourceTreeSha256: "" },
    { auditSha256: "" },
    { buildPlatform: "darwin-x64" },
    { format: 2 }
  ]) {
    assert.throws(() => validateReleaseCoordinates({ ...pin, ...change }))
  }
})
