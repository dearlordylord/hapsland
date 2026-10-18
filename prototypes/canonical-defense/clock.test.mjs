import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { after, test } from "node:test"

const temporary = mkdtempSync(join(tmpdir(), "defense-clock-"))
after(() => rmSync(temporary, { recursive: true, force: true }))
const owner = import.meta.dirname
const fixture = join(temporary, "Clock.bend")
writeFileSync(fixture, `import Base
import ${owner}/DefenseMain.bend as Main
import ${owner}/DefenseHost.bend as H
import ${owner}/DefenseRecording.bend as Recording
import ${owner}/DefenseModel.bend as M
import ${owner}/DefenseLabTraceCodec.bend as Codec

def initial() -> Main.FrameState: Main.Frame{[H.key(H.initial(), 110)], 0n, 0, False{}, 0, False{}}
def step(now: Nat, frame: Main.FrameState) -> Main.FrameState: Main.clock_step(now, frame)
def world(frame: Main.FrameState) -> M.World:
  match frame:
    case Main.Frame{world, _, _, _, _, _}: Main.world_value(world)
def encode(frame: Main.FrameState) -> List<&2, Nat>: Codec.defensemodel_world([world(frame)], [])
def expected(ticks: Nat) -> List<&2, Nat>: Codec.defensemodel_world([Recording.ticks(ticks, H.key(H.initial(), 110))], [])
def pause(frame: Main.FrameState) -> Main.FrameState: Main.event_step(frame, Key{112, True{}})
def steps(total: U32) -> U32: Main.clock_steps(total)
`)
const emitted = join(temporary, "clock.mjs")
const build = spawnSync("bend", [fixture, "-o", emitted], { encoding: "utf8", timeout: 55000 })
assert.ifError(build.error)
assert.equal(build.status, 0, build.stdout + build.stderr)
const { default: G } = await import(pathToFileURL(emitted))

const values = list => {
  const result = []
  while (list.$ === "Con") { result.push(list.head); list = list.tail }
  assert.equal(list.$, "Nil")
  return result
}
const sameWorld = (frame, ticks, message) => assert.deepEqual(values(G.encode(frame)), values(G.expected(ticks)), message)

test("half-speed clock preserves complete worlds at 40 ms boundaries", () => {
  let frame = G.initial()
  for (const now of [0n, 19n, 20n, 39n, 40n, 41n, 79n, 80n, 119n, 120n, 160n, 200n]) {
    frame = G.step(now, frame)
    sameWorld(frame, now / 40n, `wall time ${now}`)
  }
})
test("clock retains bounded catch-up and fractional time without skipping simulation", () => {
  let frame = G.step(400n, G.initial())
  sameWorld(frame, 8n)
  frame = G.step(400n, frame)
  sameWorld(frame, 10n)
  assert.equal(G.steps(39), 0)
  assert.equal(G.steps(40), 1)
  assert.equal(G.steps(400), 8)
})
test("pause discards elapsed wall time instead of catching it up on resume", () => {
  let frame = G.step(40n, G.initial())
  frame = G.pause(frame)
  frame = G.step(4000n, frame)
  frame = G.pause(frame)
  frame = G.step(4040n, frame)
  sameWorld(frame, 2n)
})
