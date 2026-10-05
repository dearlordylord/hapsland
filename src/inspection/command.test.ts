import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { nativeDeferred } from "../test-support/native-deferred.ts"

it("prints the foreground dashboard URL and exits on SIGINT without opting in or starting a resident", async () => {
  const directory = await mkdtemp(join(tmpdir(), "haps-dashboard-"))
  const child = spawn(process.execPath, ["src/cli.ts", "dashboard", "--host", "127.0.0.1", "--port", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      XDG_STATE_HOME: directory,
      XDG_CONFIG_HOME: directory,
      REVIEW_RESIDENT_DIR: join(directory, "resident")
    }
  })
  const started = nativeDeferred<string>()
  let stdout = ""
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString()
    const url = /http:\/\/127\.0\.0\.1:[0-9]+\/[a-f0-9]{64}\//.exec(stdout)?.[0]
    if (url) started.resolve(url)
  })
  const exited = once(child, "exit")
  const deadline = setTimeout(() => child.kill("SIGKILL"), 10000)
  try {
    const result = await Promise.race([
      started.promise,
      exited.then(() => {
        throw new Error("dashboard exited before readiness")
      })
    ])
    expect((await fetch(result)).status).toBe(200)
    expect(await (await fetch(`${result}snapshot`)).json()).toMatchObject({ records: [] })
    expect(await readdir(directory)).toEqual([])
    child.kill("SIGINT")
    await exited
  } finally {
    clearTimeout(deadline)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
      await exited
    }
    await rm(directory, { recursive: true, force: true })
  }
})
