import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, writeFile, rm, readdir, utimes, lstat, rename } from "node:fs/promises"
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { dependencyDigestMemo } from "./dependency-digests.mjs"

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-digest-memo-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, "dependency.js"),
    directory = join(root, "memo")
  await writeFile(file, "AAAA")
  const time = new Date("2000-01-01T00:00:00Z")
  await utimes(file, time, time)
  const probe = async (namespace = "fixture-filesystem") => {
    const script = `
      import {lstat} from 'node:fs/promises';
      import {dependencyDigestMemo} from ${JSON.stringify(new URL("./dependency-digests.mjs", import.meta.url).href)};
      const metrics={};
      const memo=await dependencyDigestMemo({directory:${JSON.stringify(directory)},namespace:${JSON.stringify(namespace)},deadline:Date.now()+5000,metrics});
      const digest=await memo.digest(${JSON.stringify(file)},await lstat(${JSON.stringify(file)},{bigint:true}));
      await memo.publish();console.log(JSON.stringify({digest,metrics}));
    `
    return JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 7000 })
    )
  }
  return { file, directory, time, probe }
}
test("independent processes reuse unchanged digests but detect restored mtime and replaced inode", async (t) => {
  const f = await fixture(t)
  const first = await f.probe(),
    second = await f.probe()
  assert.equal(first.digest, second.digest)
  assert.equal(first.metrics.bytesRead, 4)
  assert.equal(second.metrics.bytesRead ?? 0, 0)
  assert.equal(second.metrics.hits, 1)
  const before = await lstat(f.file, { bigint: true })
  await writeFile(f.file, "BBBB")
  await utimes(f.file, f.time, f.time)
  const after = await lstat(f.file, { bigint: true })
  assert.equal(before.mtimeNs, after.mtimeNs)
  assert.notEqual(before.ctimeNs, after.ctimeNs)
  const changed = await f.probe()
  assert.notEqual(changed.digest, first.digest)
  assert.equal(changed.metrics.bytesRead, 4)
  await writeFile(`${f.file}.replacement`, "BBBB")
  await utimes(`${f.file}.replacement`, f.time, f.time)
  await rename(`${f.file}.replacement`, f.file)
  const replaced = await f.probe()
  assert.equal(replaced.digest, changed.digest)
  assert.equal(replaced.metrics.bytesRead, 4)
})
test("corrupt memo, concurrent writers and a different filesystem namespace remain correct", async (t) => {
  const f = await fixture(t)
  const first = await f.probe()
  const filename = join(f.directory, (await readdir(f.directory))[0])
  await writeFile(filename, "truncated PRIVATE_CACHE")
  const recovered = await f.probe()
  assert.equal(recovered.digest, first.digest)
  assert.equal(recovered.metrics.bytesRead, 4)
  const other = await f.probe("other-filesystem")
  assert.equal(other.digest, first.digest)
  assert.equal(other.metrics.bytesRead, 4)
  const a = await dependencyDigestMemo({
    directory: f.directory,
    namespace: "fixture-filesystem",
    deadline: Date.now() + 5000
  })
  const b = await dependencyDigestMemo({
    directory: f.directory,
    namespace: "fixture-filesystem",
    deadline: Date.now() + 5000
  })
  await Promise.all([
    a.digest(f.file, await lstat(f.file, { bigint: true })),
    b.digest(f.file, await lstat(f.file, { bigint: true }))
  ])
  await Promise.all([a.publish(), b.publish()])
  const final = await f.probe()
  assert.equal(final.digest, first.digest)
  assert.equal(final.metrics.bytesRead ?? 0, 0)
  assert.ok((await readdir(f.directory)).every((name) => name.endsWith(".json")))
})
test("mutation during descriptor hashing cannot publish a digest", async (t) => {
  const f = await fixture(t)
  await writeFile(f.file, Buffer.alloc(1024 * 1024, 1))
  let bytes = 0,
    mutated = false
  const metrics = {
    get bytesRead() {
      return bytes
    },
    set bytesRead(value) {
      bytes = value
      if (!mutated) {
        mutated = true
        writeFileSync(f.file, Buffer.alloc(1024 * 1024, 2))
      }
    }
  }
  const memo = await dependencyDigestMemo({
    directory: f.directory,
    namespace: "fixture-filesystem",
    deadline: Date.now() + 5000,
    metrics
  })
  await assert.rejects(memo.digest(f.file, await lstat(f.file, { bigint: true })), /Dependency changed during hashing/)
  await memo.publish()
  const recovered = await f.probe()
  assert.equal(recovered.metrics.bytesRead, 1024 * 1024)
})

test("an interrupted process retains only completed descriptor-checked digest checkpoints", async (t) => {
  const f = await fixture(t)
  await f.probe()
  const next = join(f.directory, "../next-dependency.js")
  await writeFile(next, "BBBB")
  const script = `
    import {lstat} from 'node:fs/promises';
    import {dependencyDigestMemo} from ${JSON.stringify(new URL("./dependency-digests.mjs", import.meta.url).href)};
    const memo=await dependencyDigestMemo({directory:${JSON.stringify(f.directory)},namespace:"fixture-filesystem",deadline:Date.now()+5000,checkpointEveryFiles:1});
    await memo.digest(${JSON.stringify(next)},await lstat(${JSON.stringify(next)},{bigint:true}));
    process.kill(process.pid,'SIGKILL');
  `
  assert.throws(
    () => execFileSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 7000, stdio: "ignore" }),
    (error) => error.signal === "SIGKILL"
  )
  const recovered = await f.probe()
  assert.equal(recovered.metrics.bytesRead ?? 0, 0)
  assert.equal(recovered.metrics.hits, 1)
})
