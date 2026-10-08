import { spawn, type ChildProcess } from "node:child_process"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { observeOwnedResidentProcess } from "../../scripts/test-harness/cleanup-owned-resident.mjs"
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join } from "node:path"
import assert from "node:assert/strict"
import { configuredRules, connectDefaultRuleFixture } from "./default-rules.ts"
import { pathToFileURL } from "node:url"
import { residentRequestEffect } from "@hapsland/resident-transport/resident/client"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { prepareTestPackage, type TestPackage } from "./test-package.ts"
import { runClient } from "./client-runtime.ts"
import type { ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { commandEntrypoint, type RuntimeCommand } from "@hapsland/runtime-environment/runtime/package-runtime"
import { prepareTestSourceRuntime } from "./source-runtime.ts"

let createPiExtension: (typeof import("@hapsland/pi-extension/pi/extension"))["createPiExtension"]
export let installedCli: string
export let installedCommand: readonly string[]
let fixtureMode: "source" | "installed"
let installedPackage: TestPackage | undefined
export let installedResidentCommand: RuntimeCommand
let sourceEnvironment: Readonly<Record<string, string>> = {}
let installedEnvironment: NodeJS.ProcessEnv
const candidateRuntimePaths = () => {
  const executable = process.env.HAPSLAND_TEST_HOOK_EXECUTABLE
  const asset = process.env.HAPSLAND_TEST_PI_ASSET
  if (!executable || !asset || !isAbsolute(executable) || !isAbsolute(asset))
    throw new Error("Candidate Pi mode requires absolute hook executable and emitted asset paths")
  return { executable, asset }
}
export const setupInstalledPi = async (mode: "source" | "installed" | "candidate" = "installed") => {
  fixtureMode = mode === "candidate" ? "source" : mode
  if (mode === "candidate") {
    const { executable, asset } = candidateRuntimePaths()
    installedCli = executable
    installedCommand = [executable]
    installedResidentCommand = { executable: join(dirname(executable), "hapsland-resident"), args: [] }
    sourceEnvironment = {}
    createPiExtension = (await import(/* @vite-ignore */ pathToFileURL(asset).href)).createPiExtension
    return
  }
  if (mode === "source") {
    const runtime = prepareTestSourceRuntime()
    installedCli = commandEntrypoint(runtime.commands.hook)
    installedCommand = [runtime.commands.hook.executable, ...runtime.commands.hook.args]
    installedResidentCommand = runtime.commands.resident
    sourceEnvironment = runtime.environment
    createPiExtension = (await import("@hapsland/pi-extension/pi/extension")).createPiExtension
    return
  }
  installedPackage = prepareTestPackage()
  installedCli = installedPackage.hook.executable
  installedResidentCommand = installedPackage.resident
  installedEnvironment = installedPackage.environment
  installedCommand = [installedPackage.hook.executable, ...installedPackage.hook.args]
  try {
    const extension = await import(
      /* @vite-ignore */ pathToFileURL(join(installedPackage.packageRoot, "dist/pi/extension.js")).href
    )
    createPiExtension = extension.createPiExtension
  } catch (error) {
    cleanupInstalledPi()
    throw error
  }
}
export const cleanupInstalledPi = () => {
  installedPackage?.cleanup()
  installedPackage = undefined
}

type Handler = (event: any, context: any) => Promise<any>
const roots: string[] = []
const preparedResidents = new Map<string, ChildProcess>()
const residentCommands = new Map<string, RuntimeCommand>()
const fixtureOwnerPid = (path: string): number | undefined => {
  try {
    const { pid } = JSON.parse(readFileSync(path, "utf8")) as { pid: number }
    return Number.isInteger(pid) && pid > 1 && pid !== process.pid ? pid : undefined
  } catch {
    return undefined
  }
}
export const fixtureCommandMatches = (
  args: readonly string[],
  expected: RuntimeCommand,
  directory: string
): boolean => {
  const command = args.filter((argument, index) => argument !== "" || index !== args.length - 1)
  const tokens = [expected.executable, ...expected.args, directory]
  if (command.length !== tokens.length) return false
  try {
    return tokens.every(
      (token, index) => command[index] === token || realpathSync(command[index]!) === realpathSync(token)
    )
  } catch {
    return false
  }
}
const fixtureProcessRunning = (pid: number, expected: RuntimeCommand, directory: string): boolean => {
  try {
    return observeOwnedResidentProcess(pid, directory, [expected])?.owned ?? false
  } catch {
    return false
  }
}
const signalFixtureProcess = (pid: number, signal: NodeJS.Signals) => {
  try {
    process.kill(pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
  }
}
const waitForFixtureExit = async (pid: number, main: RuntimeCommand, directory: string) => {
  const deadline = Date.now() + 3_000
  while (fixtureProcessRunning(pid, main, directory) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
const stopFixtureProcess = async (pid: number, main: RuntimeCommand, directory: string) => {
  if (!fixtureProcessRunning(pid, main, directory)) return
  signalFixtureProcess(pid, "SIGTERM")
  await waitForFixtureExit(pid, main, directory)
  if (!fixtureProcessRunning(pid, main, directory)) return
  signalFixtureProcess(pid, "SIGKILL")
  await waitForFixtureExit(pid, main, directory)
  if (fixtureProcessRunning(pid, main, directory)) throw new Error("Pi fixture resident did not terminate")
}
const stopPreparedResident = async (child: ChildProcess) => {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 3_000)
    child.once("close", () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill("SIGTERM")
  })
}
export const cleanupPiFixtures = async () => {
  for (const root of roots.splice(0)) {
    const prepared = preparedResidents.get(root)
    preparedResidents.delete(root)
    if (prepared !== undefined) await stopPreparedResident(prepared)
    const directory = join(root, "runtime")
    const main = residentCommands.get(root)!
    // The lock owner exists before the server publishes its endpoint owner.
    const pids = new Set([
      fixtureOwnerPid(join(directory, "owner.json")),
      fixtureOwnerPid(join(directory, "owner.lock", "owner.json"))
    ])
    for (const pid of pids) if (pid !== undefined) await stopFixtureProcess(pid, main, directory)
    residentCommands.delete(root)
    rmSync(root, { recursive: true, force: true })
  }
}

const waitForResidentStats = async (
  root: string,
  ready: (stats: Extract<ResidentResponse, { status: "stats" }>) => boolean
) => {
  const paths = residentPaths(join(root, "runtime"))
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const owner = JSON.parse(readFileSync(paths.owner, "utf8")) as { lifetime: string }
      const stats = await runClient(
        residentRequestEffect(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      if (stats.status === "stats" && ready(stats)) return
    } catch {
      /* The exact fixture resident may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("Pi fixture resident did not reach the required IPC state")
}

export const fixture = (
  gated = false,
  control: Record<string, unknown> = {},
  options: { commandFactory?: (cli: string, root: string) => readonly string[]; env?: NodeJS.ProcessEnv } = {}
) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "haps-pi-")))
  roots.push(root)
  residentCommands.set(root, installedResidentCommand)
  execFileSync("git", ["init", "--quiet", root])
  connectDefaultRuleFixture(root)
  const capturePath = join(root, "backend-calls")
  const handlers = new Map<string, Handler>()
  const environment = () => ({
    ...(fixtureMode === "source" ? { ...process.env, ...sourceEnvironment } : installedEnvironment),
    REVIEW_RESIDENT_DIR: join(root, "runtime"),
    REVIEW_STATE_PATH: join(root, "state"),
    REVIEW_ACTIVITY_PATH: join(root, "activity"),
    REVIEW_USER_CONFIG_PATH: join(root, "user.json"),
    ...(gated
      ? { REVIEW_RESIDENT_BACKEND_GATE_PATH: join(root, "backend.gate"), REVIEW_RESIDENT_CONTROLLED: "1" }
      : {}),
    REVIEW_CONTROL_JSON: JSON.stringify({
      capturePath,
      answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }])),
      ...control
    }),
    ...options.env
  })
  const reload = () => {
    handlers.clear()
    createPiExtension({
      ...(options.commandFactory !== undefined
        ? { command: options.commandFactory(installedCli, root) }
        : fixtureMode === "source"
          ? { command: installedCommand }
          : {}),
      env: environment()
    })({
      on: (name: string, handler: Handler) => {
        handlers.set(name, handler)
      }
    })
  }
  reload()
  const context = { cwd: root, sessionManager: { getSessionId: () => "pi-boundary-session" } }
  const call = async (name: string, event: unknown, ctx = context) => {
    const handler = handlers.get(name)
    assert.ok(handler, `registered ${name} handler`)
    return handler(event, ctx)
  }
  const prepareResident = async () => {
    // Opt-in healthy-resident precondition for lifecycle witnesses. Cold-start
    // and refusal tests still exercise their original first-event startup.
    const directory = join(root, "runtime")
    const resident = residentCommands.get(root)!
    const command = [resident.executable, ...resident.args, directory]
    const child = spawn(command[0]!, command.slice(1), { env: environment(), stdio: "ignore" })
    preparedResidents.set(root, child)
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve)
      child.once("error", reject)
    })
    await waitForResidentStats(root, () => true)
  }
  const waitForWork = (count: number) => waitForResidentStats(root, (stats) => stats.queued + stats.running === count)
  const waitForAdvice = () =>
    waitForResidentStats(
      root,
      (stats) =>
        stats.queued === 0 && stats.running === 0 && stats.pendingEvaluations === 0 && stats.pendingFindingBatches > 0
    )
  const offerOnLaterEdits = async (ctx = context) => {
    // A healthy pending batch still requires current-source revalidation. The
    // ordinary 250 ms callback polls only its first 100 ms, so a busy reply can
    // truthfully defer the offer. Exercise at most two real later opportunities;
    // never stretch the production callback deadline or fabricate an offer.
    // Comment-only edits keep this witness about the existing finding; starting
    // unrelated classifier jobs here competes with its short collection window.
    let output
    let editCount = 0
    for (const [index, path] of ["other.ts", "later.ts"].entries()) {
      const next = {
        ...before,
        toolCallId: `native-edit-${index + 2}`,
        input: { path, edits: [{ oldText: "// before", newText: `// callback opportunity ${index}` }] }
      }
      writeFileSync(join(root, path), "// before\n")
      await call("tool_call", next, ctx)
      writeFileSync(join(root, path), `// callback opportunity ${index}\n`)
      output = await call(
        "tool_result",
        {
          ...result,
          ...next,
          content: [{ type: "text", text: `Successfully replaced text in ${path}.` }],
          details: { patch: `--- ${path}\n+++ ${path}\n@@ -1 +1 @@\n-// before\n+// callback opportunity ${index}\n` }
        },
        ctx
      )
      editCount += 1
      if (output !== undefined) break
    }
    return { output, editCount }
  }
  return { root, capturePath, call, context, reload, prepareResident, waitForWork, waitForAdvice, offerOnLaterEdits }
}

export const input = {
  path: "type.ts",
  edits: [{ oldText: "type Count = string", newText: "type OrderCount = number" }]
}
export const before = { toolName: "edit", toolCallId: "native-edit-1", input }
export const result = {
  ...before,
  isError: false,
  content: [{ type: "text", text: "Successfully replaced text in type.ts." }],
  structuredContent: { nativeEditCount: 1 },
  details: { patch: "--- type.ts\n+++ type.ts\n@@ -1 +1 @@\n-type Count = string\n+type OrderCount = number\n" }
}
