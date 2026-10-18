import {tokenSpan} from "./motion-state-slice.mjs"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { lowerHostRegisterBank } from "./register-bank.mjs"

// Real Bend IO main, actual scene rectangles and independent pixel oracle.
test("raster primitives agree in native/JavaScript; actual scenes match the pure oracle", { timeout: 180000 }, t => {
  const directory = mkdtempSync(join(tmpdir(), "defense-raster-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const fixture = new URL("DefenseNativeRasterTests.bend", import.meta.url).pathname
  const deadline = Date.now() + 175000
  function run(command, args, limit) {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: Math.min(limit, deadline - Date.now()), maxBuffer: 4 * 1024 * 1024 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    return result.stdout
  }
  const js = join(directory, "test.cjs"), c = join(directory, "test.c"), binary = join(directory, "test")
  run("bend", [fixture, "-o", js], 55000)
  // The original pure raster oracle recursively filters long glyph lists.
  const emitted = run(process.execPath, ["--stack-size=4096", js], 25000)
  run("bend", [fixture, "-o", c], 55000)
  writeFileSync(c, lowerHostRegisterBank(readFileSync(c, "utf8")).source)
  run(process.env.CC ?? "clang", ["-std=c11", "-O0", c, "-o", binary, "-pthread", "-lm"], 45000)
  const native = run(binary, [], 25000)
  assert.equal(native, "PASS native raster pixels\n".repeat(6))
  assert.equal(emitted, native)
  const scenes = join(directory, "scenes.cjs")
  run("bend", [new URL("DefenseRasterSceneTests.bend", import.meta.url).pathname, "-o", scenes], 55000)
  assert.equal(run(process.execPath, ["--stack-size=4096", scenes], 25000), "PASS native raster pixels\n".repeat(6))
})

test("the native game presents the rasterized current Bend scene", () => {
  const main = readFileSync(new URL("DefenseMain.bend", import.meta.url), "utf8")
  tokenSpan(main, "image : Image <- Raster.rasterize(R.scene(~R.base_scene,world_value(world)))")
  tokenSpan(main, "drawn : FrameState & Image <- view(frame) draw(drawn,")
  tokenSpan(main, "Window.frame(window,image)")
})
