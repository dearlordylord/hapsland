import { bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readdir, rm, realpath, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { nativeDeferred } from "../test-support/native-deferred.ts"
import { prepareTestPackage, type TestPackage } from "../test-support/test-package.ts"
import { makeInspectionStorage } from "@hapsland/inspection-records/inspection/storage"
import { decodeInspectionRecord } from "@hapsland/inspection-records/inspection/contract"
import { acquireResidentFixture } from "../resident/runtime-fixture.ts"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { configuredRules, connectDefaultRuleFixture } from "../test-support/default-rules.ts"
import { residentRequestEffect } from "@hapsland/resident-transport/resident/client"
import { runClient } from "../test-support/client-runtime.ts"

const launch = async (command: readonly string[], environment: NodeJS.ProcessEnv, directory: string) => {
  const child = spawn(command[0]!, [...command.slice(1), "dashboard", "--host", "127.0.0.1", "--port", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...environment,
      XDG_STATE_HOME: directory,
      XDG_CONFIG_HOME: directory,
      REVIEW_RESIDENT_DIR: join(directory, "r")
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
  const cleanup = async () => {
    clearTimeout(deadline)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
      await exited
    }
  }
  try {
    const url = await Promise.race([
      started.promise,
      exited.then(() => {
        throw new Error("dashboard exited before readiness")
      })
    ])
    return {
      url,
      cleanup,
      stop: async () => {
        child.kill("SIGINT")
        const [code, signal] = await exited
        clearTimeout(deadline)
        expect(signal, "Dashboard must handle SIGINT without a forced kill").toBeNull()
        expect(code).toBe(130)
        await expect(fetch(url)).rejects.toThrow()
      }
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}
const recordsAt = async (url: string) => {
  const value: unknown = await (await fetch(`${url}snapshot`)).json()
  if (typeof value !== "object" || value === null || !("records" in value) || !Array.isArray(value.records))
    throw new Error("missing public snapshot records")
  return value.records.map(decodeInspectionRecord)
}

describe.each(["source", "package"] as const)("%s foreground inspection command", (role) => {
  let packed: TestPackage | undefined
  beforeAll(() => {
    if (role === "package") packed = prepareTestPackage()
  }, 240000)
  afterAll(() => packed?.cleanup())
  const command = () =>
    packed ? [packed.cli.executable, ...packed.cli.args] : [bunExecutable(), "packages/cli-entry/src/cli.ts"]
  const environment = () => packed?.environment ?? process.env

  it("prints its URL and exits on SIGINT without opting in or starting a resident", async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "hd-")))
    let dashboard: Awaited<ReturnType<typeof launch>> | undefined
    try {
      dashboard = await launch(command(), environment(), directory)
      expect((await fetch(dashboard.url)).status).toBe(200)
      expect(await recordsAt(dashboard.url)).toEqual([])
      expect(await readdir(directory)).toEqual([])
      await dashboard.stop()
    } finally {
      await dashboard?.cleanup()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("reads pre-launch history and leaves resident recording alive across interrupt and restart", async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "hd-")))
    const root = await makeGitFixture()
    await writeFile(
      join(root, ".hapsland.jsonc"),
      JSON.stringify({ version: 1, rules: connectDefaultRuleFixture(root), sessionInspection: true })
    )
    const history = makeInspectionStorage(join(directory, "hapsland", "inspection"), {
      retentionMs: 7 * 86400000,
      storageBytes: 128 * 1048576
    })
    let published = nativeDeferred<void>()
    let calls = 0
    const paths = residentPaths(join(directory, "r"))
    const resident = await acquireResidentFixture(paths, undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          history.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "evaluation-outcome") published.resolve()
              })
            )
          )
      },
      controlledRequestEffect: async () => {
        calls += 1
      }
    })
    let first: Awaited<ReturnType<typeof launch>> | undefined
    let second: Awaited<ReturnType<typeof launch>> | undefined
    const edit = async (name: string) => {
      await put(root, "type.ts", `type ${name}Count = number;\n`)
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id: name }))
      )
      if (!observation) throw new Error("missing observation")
      published = nativeDeferred<void>()
      expect(
        (
          await Effect.runPromise(
            resident.admit(observation, {
              statePath: join(root, "consent"),
              userConfigPath: join(root, "absent-user"),
              credential: null,
              controlled: {
                answers: Object.fromEntries(
                  configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }])
                )
              }
            })
          )
        ).status
      ).toBe("accepted")
      await published.promise
      await Effect.runPromise(resident.whenIdle())
    }
    try {
      await Effect.runPromise(resident.listen())
      await edit("BeforeDashboard")
      expect(calls).toBe(1)
      first = await launch(command(), environment(), directory)
      const before = await recordsAt(first.url)
      expect(before.filter((record) => record.fact.kind === "edit-received")).toHaveLength(1)
      expect(before.some((record) => record.source.lifetime === resident.lifetime)).toBe(true)
      expect(calls, "Reading history cannot classify or start another resident").toBe(1)
      await first.stop()
      expect(
        await runClient(residentRequestEffect(paths, { requestRoute: "shared", operation: "hello" }))
      ).toMatchObject({ status: "ready", lifetime: resident.lifetime })
      await edit("WhileDashboardStopped")
      expect(calls).toBe(2)
      second = await launch(command(), environment(), directory)
      const after = await recordsAt(second.url)
      expect(after.filter((record) => record.fact.kind === "edit-received")).toHaveLength(2)
      expect(after.filter((record) => record.fact.kind === "evaluation-outcome").map((record) => record.fact)).toEqual([
        { kind: "evaluation-outcome", outcome: "clear" },
        { kind: "evaluation-outcome", outcome: "clear" }
      ])
      expect(new Set(after.map((record) => record.source.lifetime))).toEqual(new Set([resident.lifetime]))
      expect(calls).toBe(2)
      await second.stop()
      expect(
        await runClient(residentRequestEffect(paths, { requestRoute: "shared", operation: "hello" }))
      ).toMatchObject({ status: "ready", lifetime: resident.lifetime })
    } finally {
      await first?.cleanup()
      await second?.cleanup()
      await Effect.runPromise(resident.close)
      await rm(directory, { recursive: true, force: true })
    }
  }, 20000)
})
