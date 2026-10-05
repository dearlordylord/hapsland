import { DEFAULT_CHILD_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs"
import { execFileSync, spawnSync } from "../../scripts/test-harness/process.mjs"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { EventEmitter } from "node:events"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn, type ChildProcess } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"

type ResidentFixture = { root: string; child?: ChildProcess; spawnedPid: number | undefined }
const fixtures: Array<ResidentFixture> = []
const RESIDENT_EXIT_TIMEOUT_MS = 3_000

const waitForExit = (child: ChildProcess, timeoutMs: number): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    let settled = false
    const finish = (exited: boolean) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      child.removeListener("error", onError)
      child.removeListener("exit", onExit)
      child.removeListener("close", onClose)
      resolve(exited)
    }
    const onError = () => undefined
    const onExit = () => finish(true)
    const onClose = () => finish(true)
    child.once("error", onError)
    child.once("exit", onExit)
    child.once("close", onClose)
    const timer = setTimeout(() => finish(false), timeoutMs)
    if (child.exitCode !== null || child.signalCode !== null) finish(true)
  })
}

const terminate = async (fixture: ResidentFixture, timeoutMs = RESIDENT_EXIT_TIMEOUT_MS): Promise<void> => {
  const child = fixture.child
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    if (child.exitCode !== null || child.signalCode !== null) return
    try {
      child.kill(signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return
      throw error
    }
    if (await waitForExit(child, timeoutMs)) return
  }
  throw new Error(`resident subprocess ${fixture.spawnedPid ?? "unknown"} did not exit after bounded cleanup`)
}

afterEach(async () => {
  const failures: unknown[] = []
  for (const fixture of fixtures) {
    try {
      await terminate(fixture)
      rmSync(fixture.root, { recursive: true, force: true })
    } catch (error) {
      failures.push(error)
    }
  }
  fixtures.length = 0
  if (failures.length > 0) throw new AggregateError(failures, "resident fixture cleanup failed")
})

const waitFor = (predicate: () => boolean, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  throw new Error("timed out waiting for subprocess state")
}

describe("production resident activity subprocess", () => {
  it("does not treat failed signal delivery or an error event as resident exit", async () => {
    const signals: Array<NodeJS.Signals | number | undefined> = []
    const emitter = new EventEmitter()
    const fake = Object.assign(emitter, {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      pid: 1234,
      kill: (signal?: NodeJS.Signals | number) => {
        signals.push(signal)
        queueMicrotask(() => emitter.emit("error", new Error("signal was not delivered")))
        return false
      }
    })
    const child = fake as unknown as ChildProcess
    child.on("error", () => undefined)
    await expect(terminate({ root: "", child, spawnedPid: fake.pid }, 1)).rejects.toThrow(
      "resident subprocess 1234 did not exit after bounded cleanup"
    )
    expect(signals).toEqual(["SIGTERM", "SIGKILL"])
  })

  it("reports a controlled native event as pending, then restarted/lost after resident death", () => {
    const root = mkdtempSync(join(tmpdir(), "resident-activity-subprocess-"))
    const fixture: ResidentFixture = { root, spawnedPid: undefined }
    fixtures.push(fixture)
    const repository = join(root, "repository")
    const state = join(root, "consent")
    const runtime = join(root, "runtime")
    const activity = join(root, "activity")
    const gate = join(root, "backend-release")
    execFileSync("git", ["init", "--quiet", "--initial-branch=master", repository])
    execFileSync("git", ["-C", repository, "config", "user.name", "Activity Fixture"])
    execFileSync("git", ["-C", repository, "config", "user.email", "fixture@example.invalid"])
    writeFileSync(join(repository, "README.md"), "fixture\n")
    execFileSync("git", ["-C", repository, "add", "README.md"])
    execFileSync("git", ["-C", repository, "commit", "--quiet", "-m", "fixture"])
    const environment = {
      ...process.env,
      REVIEW_STATE_PATH: state,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_ACTIVITY_PATH: activity,
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: "{}"
    }
    const source = "export interface PendingReview { id: string }\n"
    writeFileSync(join(repository, "pending.ts"), source)
    const event = {
      hook_event_name: "PostToolUse",
      tool_name: "apply_patch",
      session_id: "restart-session",
      turn_id: "turn-1",
      tool_use_id: "tool-1",
      cwd: repository,
      tool_input: { command: `*** Begin Patch\n*** Add File: pending.ts\n+${source.trim()}\n*** End Patch` },
      tool_response: {}
    }
    // This witness starts with a running resident and observes its loss. Cold
    // startup admission is covered separately by the resident startup suite.
    const resident = spawn(process.execPath, ["src/resident/main.ts", runtime], {
      cwd: process.cwd(),
      env: environment,
      detached: true,
      stdio: "ignore"
    })
    fixture.child = resident
    fixture.spawnedPid = resident.pid
    resident.unref()
    waitFor(() => existsSync(join(runtime, "owner.json")) && existsSync(join(runtime, "resident.sock")))
    const before = spawnSync(
      process.execPath,
      ["src/cli.ts", "--composed-before-edit-hook", "--composed-host=codex-cli", "--controlled-reviewer"],
      {
        cwd: process.cwd(),
        env: environment,
        input: JSON.stringify({ ...event, hook_event_name: "PreToolUse" }),
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS
      }
    )
    expect(before.status).toBe(0)
    expect(JSON.parse(before.stdout)).toEqual({})
    const hook = spawnSync(
      process.execPath,
      ["src/cli.ts", "--codex-hook", "--controlled-reviewer", "--controlled-writer", "--composed-edit-hook"],
      {
        cwd: process.cwd(),
        env: environment,
        input: JSON.stringify(event),
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS
      }
    )
    expect(hook.status).toBe(0)
    expect(JSON.parse(hook.stdout)).toEqual({})
    const readStatus = () => {
      const result = spawnSync(process.execPath, ["src/cli.ts", "--status"], {
        cwd: process.cwd(),
        env: environment,
        input: JSON.stringify({ version: 1, operation: "status", cwd: repository, sessionId: "restart-session" }),
        encoding: "utf8"
      })
      expect(result.status).toBe(0)
      return JSON.parse(result.stdout) as { activitySource: string; activity: { kind: string } }
    }
    expect(readStatus()).toMatchObject({ activitySource: "resident-v1", activity: { kind: "pending" } })
    const owner = JSON.parse(readFileSync(join(runtime, "owner.json"), "utf8")) as { pid: number }
    process.kill(owner.pid, "SIGTERM")
    waitFor(() => !existsSync(join(runtime, "owner.json")))
    expect(readStatus()).toMatchObject({ activitySource: "resident-v1", activity: { kind: "restarted/lost" } })
  })
})
