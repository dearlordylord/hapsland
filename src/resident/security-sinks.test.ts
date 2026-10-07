import { bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { runClient } from "@hapsland/build-tooling/test-support/client-runtime"
/** Resident source-free diagnostic and process-sink regression witnesses. */
import { afterEach, describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  makeReviewGitFixture as makeGitFixture,
  put,
  updateEvent
} from "@hapsland/build-tooling/test-support/test-fixtures"
import { residentRequestEffect as residentRequest } from "@hapsland/resident-transport/resident/client"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import type { ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"

const marker = "SYNTHETIC_SOURCE_MARKER_7fb741a1"
const processes: number[] = []
const directories: string[] = []

afterEach(async () => {
  for (const pid of processes.splice(0)) {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      /* already exited */
    }
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

const waitFor = async (condition: () => Promise<boolean>) => {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("resident did not finish the synthetic failure")
}

const allFileContents = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const contents: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) contents.push(...(await allFileContents(path)))
    else if (entry.isFile()) contents.push(await readFile(path, "utf8"))
  }
  return contents
}

describe("security sink prototype", () => {
  it("observes source-bearing ingress and a provider failure across resident file/output sinks", async () => {
    const root = await makeGitFixture()
    const temporary = await mkdtemp(join(tmpdir(), "hapsland-security-sinks-"))
    directories.push(root, temporary)
    await put(root, "type.ts", `type OrderCount = number // ${marker}\n`)
    const statePath = join(temporary, "consent")
    const activityPath = join(temporary, "activity")
    const runtime = join(temporary, "runtime")

    const launchScript =
      "import {ensureResidentEffect as ensureResident} from './packages/resident-transport/src/resident/client.ts';\nimport { runClient } from '@hapsland/build-tooling/test-support/client-runtime'; console.log(JSON.stringify(await runClient(ensureResident())));"
    const child = spawn(bunExecutable(), ["--input-type=module", "-e", launchScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        REVIEW_RESIDENT_DIR: runtime,
        REVIEW_RESIDENT_CONTROLLED: "1",
        REVIEW_RESIDENT_DEBUG: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    })
    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk))
    const exit = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject)
      child.once("close", resolve)
    })
    expect(exit).toBe(0)
    expect(Buffer.concat(errors).toString("utf8")).not.toContain(marker)
    const owner = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { pid: number; lifetime: string }
    processes.push(owner.pid)

    const observation = await Effect.runPromise(
      adaptCodexDirectEvent(updateEvent(root, "type.ts", [`type OrderCount = number // ${marker}`]))
    )
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const dispatch: ResidentDispatchContext = {
      statePath,
      activityPath,
      userConfigPath: null,
      credential: null,
      controlled: { failure: `synthetic backend error contains ${marker}`, capturePath: join(temporary, "called") }
    }
    // Write the observed frame through the real resident Unix socket.
    const admissionFrame = `${JSON.stringify({
      version: 1,
      operation: "admit",
      lifetime: owner.lifetime,
      composed: true,
      observation,
      controlledWriter: true,
      dispatch
    })}\n`
    expect(admissionFrame).toContain(marker)
    const paths = residentPaths(runtime)
    expect(
      (
        await runClient(
          residentRequest(paths, {
            requestRoute: "shared",
            operation: "register-edit",
            lifetime: owner.lifetime,
            root,
            advicee: observation.advicee,
            startedAt: monotonicNow()
          })
        )
      ).status
    ).toBe("advanced")
    const admissionResponse = await new Promise<string>((resolve, reject) => {
      const socket = connect(paths.socket)
      let response = ""
      socket.setEncoding("utf8")
      socket.once("error", reject)
      socket.once("connect", () => socket.write(admissionFrame))
      socket.on("data", (chunk: string) => {
        response += chunk
        if (response.includes("\n")) socket.end()
      })
      socket.once("close", () => resolve(response))
    })
    expect(JSON.parse(admissionResponse)).toEqual({ version: 1, status: "accepted" })
    await waitFor(async () => {
      if (!existsSync(join(temporary, "called"))) return false
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      return stats.status === "stats" && stats.running === 0
    })
    const response = await runClient(
      residentRequest(paths, {
        requestRoute: "shared",
        operation: "collect",
        composed: true,
        lifetime: owner.lifetime,
        root,
        advicee: observation.advicee,
        dispatch
      })
    )
    expect(JSON.stringify(response)).not.toContain(marker)
    const files = await allFileContents(temporary)
    expect(files).not.toHaveLength(0)
    for (const content of files) expect(content).not.toContain(marker)
  })

  it("keeps a synthetic source-bearing unexpected cause out of debug stderr", async () => {
    const root = await makeGitFixture()
    const temporary = await mkdtemp(join(tmpdir(), "hapsland-security-debug-"))
    directories.push(root, temporary)
    await put(root, "type.ts", `type OrderCount = number // ${marker}\n`)
    const statePath = join(temporary, "consent")
    const script = [
      "import * as Effect from 'effect/Effect';",
      "import {Layer} from 'effect';",
      "import {ResidentPreparationControls,PreparationControlError,defaultPreparationControls} from './packages/resident-runtime/src/resident/preparation-controls.ts';",
      "import {adaptCodexDirectEvent} from './packages/native-observation/src/direct-event/adapter.ts';",
      "import {updateEvent} from '@hapsland/build-tooling/test-support/test-fixtures';",
      "import {makeResidentRuntime} from './packages/resident-runtime/src/resident/server.ts';",
      "import {residentPaths} from './packages/resident-transport/src/resident/paths.ts';",
      `const root=${JSON.stringify(root)};`,
      `const marker=${JSON.stringify(marker)};`,
      `const statePath=${JSON.stringify(statePath)};`,
      `const runtime=${JSON.stringify(join(temporary, "runtime"))};`,
      "const observation=await Effect.runPromise(adaptCodexDirectEvent(updateEvent(root,'type.ts',[`type OrderCount = number // ${marker}`])));",
      "await Effect.runPromise(Effect.scoped(Effect.gen(function*(){",
      "const preparationControls=Layer.succeed(ResidentPreparationControls,{...defaultPreparationControls,afterPrepare:Effect.fail(new PreparationControlError({phase:'prepared',cause:new Error(marker)}))});",
      "const server=yield* makeResidentRuntime(residentPaths(runtime),undefined,{preparationControls});",
      "yield* server.admit(observation,{statePath,userConfigPath:null,credential:null,controlled:{}});",
      "for(let i=0;i<200;i++){const s=Effect.runSync(server.stats());if(s.running===0&&s.queued===0)break;yield* Effect.promise(()=>new Promise(r=>setTimeout(r,10)))}",
      "console.log('done');",
      "})));"
    ].join("\n")
    const child = spawn(bunExecutable(), ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, REVIEW_RESIDENT_DEBUG: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk))
    const exit = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject)
      child.once("close", resolve)
    })
    expect(exit).toBe(0)
    expect(Buffer.concat(output).toString("utf8")).toContain("done")
    const stderr = Buffer.concat(errors).toString("utf8")
    expect(stderr).toContain("resident preparation unavailable")
    expect(stderr).not.toContain(marker)
  })
})
