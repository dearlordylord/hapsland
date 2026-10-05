import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { npmToolingRequire } from "./npm-tooling.mjs"
import { archiveInventory } from "./archive-inventory.mjs"

const tar = npmToolingRequire()("tar")
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-archive-inventory-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, "README.md"), "shipped text")
  await writeFile(join(root, "binary"), Buffer.from([0, 1, 2, 3]))
  const archive = join(root, "archive.tgz")
  return { root, archive }
}
test("a single scan retains audit text and hashes binary contents without extraction", async (t) => {
  const { root, archive } = await fixture(t)
  await tar.c({ cwd: root, file: archive, prefix: "package", gzip: true }, ["README.md", "binary"])
  const records = await archiveInventory(archive)
  assert.equal(records.size, 2)
  assert.equal(records.get("package/README.md").text.toString(), "shipped text")
  assert.equal(records.get("package/binary").text, undefined)
  assert.equal(
    records.get("package/binary").sha256,
    createHash("sha256")
      .update(Buffer.from([0, 1, 2, 3]))
      .digest("hex")
  )
})
test("symbolic links, duplicate entries and paths outside the package are rejected", async (t) => {
  const { root, archive } = await fixture(t)
  await symlink("README.md", join(root, "link"))
  await tar.c({ cwd: root, file: archive, prefix: "package", gzip: true }, ["link"])
  await assert.rejects(archiveInventory(archive), /non-regular entry/)
  await tar.c({ cwd: root, file: archive, prefix: "package", gzip: true }, ["binary", "binary"])
  await assert.rejects(archiveInventory(archive), /duplicate entries/)
  await tar.c({ cwd: root, file: archive, gzip: true }, ["binary"])
  await assert.rejects(archiveInventory(archive), /unsafe tarball path/)
})
test("text byte bounds and malformed archives are rejected", async (t) => {
  const { root, archive } = await fixture(t)
  await tar.c({ cwd: root, file: archive, prefix: "package", gzip: true }, ["README.md"])
  await assert.rejects(archiveInventory(archive, { textLimit: 1 }), /text exceeds/)
  await writeFile(archive, "not an archive")
  await assert.rejects(archiveInventory(archive))
})
