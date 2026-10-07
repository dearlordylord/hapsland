import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { withOwnedLock } from "./owned-lock.mjs"
const fixture = async (work) => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-owned-lock-"))
  try {
    await work(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
test("invalid deadline is rejected before acquiring a lock", () =>
  fixture(async (root) => {
    await assert.rejects(
      withOwnedLock(root, async () => {}, Infinity),
      /finite deadline/
    )
  }))
test("live competing owner is retained after the wait deadline", () =>
  fixture(async (root) => {
    await mkdir(join(root, "lock"))
    const owner = JSON.stringify({ pid: process.pid })
    await writeFile(join(root, "lock/owner.json"), owner)
    await assert.rejects(
      withOwnedLock(
        root,
        async () => {
          throw new Error("must not execute")
        },
        50
      ),
      /deadline exceeded/
    )
    assert.equal(await readFile(join(root, "lock/owner.json"), "utf8"), owner)
  }))
test("malformed owner is rejected without removing evidence", () =>
  fixture(async (root) => {
    await mkdir(join(root, "lock"))
    await writeFile(join(root, "lock/owner.json"), JSON.stringify({ pid: 0 }))
    await assert.rejects(
      withOwnedLock(root, async () => {}),
      /Invalid artifact lock owner/
    )
    assert.equal(JSON.parse(await readFile(join(root, "lock/owner.json"))).pid, 0)
  }))
