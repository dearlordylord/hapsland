import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unresolvedBuildOwnership } from "./build-ownership.mjs"
const fixture = async (work) => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-build-ownership-"))
  try {
    await work(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
test("completed build has no unresolved checkout ownership", () =>
  fixture(async (root) => {
    assert.equal(await unresolvedBuildOwnership(root), undefined)
  }))
test("surviving checkout lease remains unresolved even after owner exits", () =>
  fixture(async (root) => {
    const directory = join(root, ".test-runs/product-build")
    await mkdir(join(directory, "lock"), { recursive: true })
    await writeFile(join(directory, "lock/owner.json"), JSON.stringify({ pid: 2147483647 }))
    await writeFile(join(directory, "lease.json"), JSON.stringify({ pid: 2147483647 }))
    assert.match(await unresolvedBuildOwnership(root), /ownership remains/)
    assert.equal(JSON.parse(await readFile(join(directory, "lock/owner.json"))).pid, 2147483647)
  }))
test("missing lease is unresolved and preserves owner evidence", () =>
  fixture(async (root) => {
    const directory = join(root, ".test-runs/product-build")
    await mkdir(join(directory, "lock"), { recursive: true })
    await writeFile(join(directory, "lock/owner.json"), JSON.stringify({ pid: process.pid }))
    assert.match(await unresolvedBuildOwnership(root), /Incomplete/)
    assert.equal(JSON.parse(await readFile(join(directory, "lock/owner.json"))).pid, process.pid)
  }))
