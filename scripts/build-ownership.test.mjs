import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unresolvedBuildOwnership } from "./build-ownership.mjs"
import { buildProcessGroup } from "./build-groups.mjs"
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
test("only the exact open enclosing lease for this process and group is admitted", () =>
  fixture(async (root) => {
    const directory = join(root, ".test-runs/product-build")
    await mkdir(join(directory, "lock"), { recursive: true })
    const token = "12345678-1234-1234-1234-123456789abc"
    const lease = { pid: process.pid, group: buildProcessGroup(), token, state: "open" }
    await writeFile(join(directory, "lock/owner.json"), JSON.stringify({ pid: process.pid }))
    const verify = async (changed, enclosingToken = token) => {
      await writeFile(join(directory, "lease.json"), JSON.stringify({ ...lease, ...changed }))
      return unresolvedBuildOwnership(root, { enclosingToken })
    }
    assert.equal(await verify({}), undefined)
    assert.match(await unresolvedBuildOwnership(root), /ownership remains/)
    assert.match(await verify({}, token.replace("a", "b")), /ownership remains/)
    assert.match(await verify({ state: "closing" }), /ownership remains/)
    assert.match(await verify({ group: lease.group + 1 }), /ownership remains/)
    assert.match(await verify({ pid: 2147483647 }), /Invalid/)
  }))
