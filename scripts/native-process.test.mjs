import { test } from "node:test"
import assert from "node:assert/strict"
import { executeNative } from "./native-process.mjs"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

test("captures structured output and counts discarded stderr", async () => {
  const result = await executeNative(
    process.execPath,
    ["-e", "process.stderr.write('err');process.stdin.pipe(process.stdout)"],
    { input: '{"ok":true}', timeout: 2000 }
  )
  assert.equal(result.code, 0)
  assert.equal(result.stdout, '{"ok":true}')
  assert.equal(result.stderrBytes, 3)
})
test("escalates a native host that ignores termination", async () => {
  await assert.rejects(
    executeNative(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},100)"], {
      timeout: 250,
      killGraceMs: 50
    }),
    /deadline exceeded/
  )
})
test("bounds output without exposing its contents", async () => {
  await assert.rejects(
    executeNative(process.execPath, ["-e", "process.stdout.write('private'.repeat(10000))"], {
      timeout: 2000,
      maxOutputBytes: 100
    }),
    /output budget exceeded/
  )
})
test("caps each phase to the inherited run deadline", async () => {
  await assert.rejects(
    executeNative(process.execPath, ["-e", "setInterval(()=>{},100)"], {
      timeout: 2000,
      env: { ...process.env, HAPSLAND_CHECK_CONTEXT: JSON.stringify({ deadline: Date.now() + 150 }) }
    }),
    /deadline exceeded/
  )
  assert.throws(() => executeNative(process.execPath, [], { timeout: Infinity }), /finite positive/)
})

test("terminates a descendant even when its parent exits on TERM", { skip: process.platform === "win32" }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "haps-native-process-"))
  const receipt = join(directory, "pid")
  let pid
  try {
    const descendant = "process.on('SIGTERM',()=>{});setInterval(()=>{},100)"
    const parent = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});require('node:fs').writeFileSync(process.argv[1],String(c.pid));setInterval(()=>{},100)`
    await assert.rejects(
      executeNative(process.execPath, ["-e", parent, receipt], { timeout: 1000, killGraceMs: 50 }),
      /deadline exceeded/
    )
    pid = Number(readFileSync(receipt, "utf8"))
    // Linux may retain an already-killed orphan as a zombie until its init reaps it.
    if (process.platform === "linux") {
      let state
      const stoppedBy = Date.now() + 1000
      do {
        try {
          state = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ")[0]
        } catch (error) {
          if (error.code !== "ENOENT") throw error
          state = undefined
        }
        if (state === undefined || state === "Z") break
        await new Promise((resolve) => setTimeout(resolve, 10))
      } while (Date.now() < stoppedBy)
      assert.ok(state === undefined || state === "Z", `descendant remains active: ${state}`)
    } else assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  } finally {
    if (pid) {
      try {
        process.kill(pid, "SIGKILL")
      } catch {}
    }
    rmSync(directory, { recursive: true, force: true })
  }
})

test("parent interruption cancels its detached native process", { skip: process.platform !== "linux" }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "haps-native-interrupt-"))
  const receipt = join(directory, "pid")
  const childCode =
    "require('node:fs').writeFileSync(process.argv[1],String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},100)"
  const module = new URL("./native-process.mjs", import.meta.url).href
  const parentCode = `import {executeNative} from ${JSON.stringify(module)};try{await executeNative(process.execPath,['-e',${JSON.stringify(childCode)},${JSON.stringify(receipt)}],{timeout:5000,killGraceMs:50})}catch{process.exitCode=1}`
  const env = { ...process.env }
  delete env.HAPSLAND_CHECK_CONTEXT
  const parent = spawn(process.execPath, ["--input-type=module", "-e", parentCode], { env, stdio: "ignore" })
  let pid
  const exited = new Promise((resolve) => parent.once("close", resolve))
  try {
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      try {
        pid = Number(readFileSync(receipt, "utf8"))
        break
      } catch (error) {
        if (error.code !== "ENOENT") throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.ok(pid, "native child published its process identity")
    parent.kill("SIGTERM")
    assert.equal(await exited, 1)
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  } finally {
    parent.kill("SIGKILL")
    if (pid) {
      try {
        process.kill(pid, "SIGKILL")
      } catch {}
    }
    rmSync(directory, { recursive: true, force: true })
  }
})
