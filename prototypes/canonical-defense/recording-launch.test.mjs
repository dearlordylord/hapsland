import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { prepareRecording, magic } from "./recording-launch.mjs"

const identity = "a".repeat(64)
function record(kind, a = 0, b = 0) {
  const bytes = Buffer.alloc(12)
  bytes.writeUInt32LE(kind, 0); bytes.writeUInt32LE(a, 4); bytes.writeUInt32LE(b, 8)
  return bytes
}
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "defense-recording-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, "game.bin")
  const environment = { HAPSLAND_GAME_RECORDING: path }
  const saved = (...entries) => Buffer.concat([Buffer.from(magic + identity), record(0), ...entries])
  return { path, saved, prepare: args => prepareRecording(join(dir, identity), args, environment) }
}

test("default always starts new; resume requires an explicit option", t => {
  const f = fixture(t)
  assert.equal(f.prepare([]).mode, "new")
  assert.equal(existsSync(f.path), false)
  writeFileSync(f.path, f.saved(record(1, 110), record(4, 8)))
  const before = readFileSync(f.path)
  assert.equal(f.prepare([]).mode, "new")
  assert.equal(f.prepare(["--resume"]).mode, "resume")
  assert.deepEqual(readFileSync(f.path), before)
  assert.equal(f.prepare(["--new"]).mode, "new")
  assert.deepEqual(readFileSync(f.path), before, "native startup owns replacing the save")
})
test("resume repairs an interrupted final record; replay preserves every byte", t => {
  const f = fixture(t)
  const complete = f.saved(record(1, 110), record(4, 3))
  const interrupted = Buffer.concat([complete, record(3, 424, 232).subarray(0, 7)])
  writeFileSync(f.path, interrupted)
  assert.equal(f.prepare(["--replay"]).mode, "replay")
  assert.deepEqual(readFileSync(f.path), interrupted)
  assert.equal(f.prepare(["--resume"]).mode, "resume")
  assert.deepEqual(readFileSync(f.path), complete)
})
test("stale identities and malformed complete records fail without replacing the save", t => {
  const f = fixture(t)
  for (const bytes of [Buffer.from("wrong header"), f.saved(record(4, 9)),
    f.saved(record(0, 2)), f.saved(record(1, 114)),
    Buffer.concat([Buffer.from(magic + "b".repeat(64)), record(0)])]) {
    writeFileSync(f.path, bytes)
    assert.throws(() => f.prepare(["--resume"]))
    assert.deepEqual(readFileSync(f.path), bytes)
    assert.equal(f.prepare(["--new"]).mode, "new")
    assert.equal(f.prepare([]).mode, "new")
  }
  assert.throws(() => f.prepare(["--unknown"]), /Usage/)
  assert.throws(() => f.prepare(["--new", "--replay"]), /Usage/)
})
