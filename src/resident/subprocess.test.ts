import { runClient } from "../test-support/client-runtime.ts"
import { afterEach, describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { execFileAsync } from "../../scripts/test-harness/process.mjs"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import type { DirectObservation } from "../direct-event/model.ts"
import { addEvent, makeGitFixture, put, advicee } from "../direct-event/test-fixtures.ts"
import { configuredRules } from "../policy/rules.ts"
import {
  acknowledgeAdviceEffect as acknowledgeAdvice,
  beginComposedSubmissionEffect as beginComposedSubmission,
  collectReadyEffect as collectReady,
  composedStopBoundaryEffect as composedStopBoundary,
  ensureResidentEffect as ensureResident,
  residentRequestEffect as residentRequest
} from "./client.ts"
import { monotonicNow } from "./hook-clock.ts"
import { residentPaths } from "./paths.ts"
import { DELIVERY_LEASE_MS, type ResidentDispatchContext, type ResidentRequest } from "./protocol.ts"

const processes: Array<number> = []
const directories: Array<string> = []

afterEach(async () => {
  for (const pid of processes.splice(0)) {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      /* already stopped */
    }
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

const childResult = (child: ChildProcessWithoutNullStreams) =>
  new Promise<string>((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.once("error", reject)
    child.once("close", (code) => (code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr))))
  })

const childClosed = (child: ChildProcessWithoutNullStreams): Promise<void> =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise((resolve) => child.once("close", () => resolve()))

const waitFor = async <A>(read: () => Promise<A | undefined>, milliseconds = 5_000): Promise<A> => {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined) return value
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("condition did not become ready")
}

const answers = Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))

const dispatchFor = (statePath: string, options: { readonly capturePath?: string } = {}): ResidentDispatchContext => ({
  statePath,
  userConfigPath: null,
  credential: null,
  controlled: { answers, ...(options.capturePath === undefined ? {} : { capturePath: options.capturePath }) }
})

const registerEdit = async (
  paths: ReturnType<typeof residentPaths>,
  lifetime: string,
  observation: DirectObservation
) => {
  const registered = await runClient(
    residentRequest(paths, {
      requestRoute: "shared",
      operation: "register-edit",
      lifetime,
      root: observation.root,
      advicee: observation.advicee,
      startedAt: monotonicNow()
    })
  )
  expect(registered).toEqual({ status: "advanced" })
}

const admitComposed = async (
  paths: ReturnType<typeof residentPaths>,
  request: Omit<Extract<ResidentRequest, { readonly operation: "admit"; readonly requestRoute: "shared" }>, "composed">,
  timeoutMs?: number
) => {
  await registerEdit(paths, request.lifetime, request.observation)
  return runClient(residentRequest(paths, { ...request, composed: true }, timeoutMs))
}

describe("resident separate-process lifecycle", () => {
  it("exits the native resident successfully after idle retirement and releases ownership", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-native-idle-"))
    directories.push(temporary)
    const paths = residentPaths(join(temporary, "runtime"))
    const executable = join(process.cwd(), "dist", "bin", `${process.platform}-${process.arch}`, "hapsland-resident")
    const child = spawn(executable, [paths.directory], { stdio: "pipe" })
    if (child.pid !== undefined) processes.push(child.pid)
    const result = childResult(child)
    await waitFor(async () => (existsSync(paths.socket) ? true : undefined), 8_000)
    await result
    expect(child.exitCode).toBe(0)
    expect(existsSync(paths.socket)).toBe(false)
    expect(existsSync(paths.owner)).toBe(false)
    expect(existsSync(paths.lock)).toBe(false)
  })

  it("releases ownership after startup failure without deleting an unsafe endpoint", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-startup-failure-"))
    directories.push(temporary)
    const paths = residentPaths(join(temporary, "runtime"))
    await mkdir(paths.directory, { mode: 0o700 })
    await writeFile(paths.socket, "unowned endpoint\n", { mode: 0o600 })
    const failed = spawn(process.execPath, ["src/resident/main.ts", paths.directory], {
      cwd: process.cwd(),
      stdio: "pipe"
    })
    await expect(childResult(failed)).rejects.toThrow("resident startup failed: listen on resident socket")
    expect(await readFile(paths.socket, "utf8")).toBe("unowned endpoint\n")
    expect(existsSync(paths.lock)).toBe(false)
    expect(existsSync(paths.owner)).toBe(false)
    await rm(paths.socket)
    const next = await runClient(ensureResident(paths, 5_000))
    processes.push(next.pid)
    expect((await runClient(residentRequest(paths, { requestRoute: "shared", operation: "hello" }))).status).toBe(
      "ready"
    )
  })

  it("exits losing launch contenders while one owner remains", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-contenders-"))
    directories.push(temporary)
    const paths = residentPaths(join(temporary, "runtime"))
    const contenders = Array.from({ length: 3 }, () =>
      spawn(process.execPath, ["src/resident/main.ts", paths.directory], {
        cwd: process.cwd(),
        stdio: ["ignore", "ignore", "pipe"]
      })
    )
    const owner = await waitFor(async () => {
      if (!existsSync(paths.owner)) return undefined
      return JSON.parse(await readFile(paths.owner, "utf8")) as { pid: number }
    }, 8_000)
    processes.push(owner.pid)
    await waitFor(
      async () => (contenders.every((child) => child.pid === owner.pid || child.exitCode !== null) ? true : undefined),
      8_000
    )
    expect(contenders.filter((child) => child.pid === owner.pid)).toHaveLength(1)
    expect(contenders.filter((child) => child.pid !== owner.pid).every((child) => child.exitCode === 0)).toBe(true)
    expect(() => process.kill(owner.pid, 0)).not.toThrow()
  })

  it("retires an empty installed resident and starts a distinct lifetime on the next hook", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-idle-"))
    directories.push(temporary)
    const paths = residentPaths(join(temporary, "runtime"))
    const first = await runClient(ensureResident(paths, 5_000))
    processes.push(first.pid)
    expect((await runClient(residentRequest(paths, { requestRoute: "shared", operation: "hello" }))).status).toBe(
      "ready"
    )
    await waitFor(async () => {
      try {
        process.kill(first.pid, 0)
        return undefined
      } catch {
        return true
      }
    }, 26_000)
    expect(existsSync(paths.owner)).toBe(false)
    expect(existsSync(paths.socket)).toBe(false)
    expect(existsSync(paths.lock)).toBe(false)
    const second = await runClient(ensureResident(paths, 5_000))
    processes.push(second.pid)
    expect(second.pid).not.toBe(first.pid)
    expect(second.lifetime).not.toBe(first.lifetime)
    expect((await runClient(residentRequest(paths, { requestRoute: "shared", operation: "hello" }))).status).toBe(
      "ready"
    )
  })

  it("keeps a live connected client until it disconnects", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-connected-"))
    directories.push(temporary)
    const paths = residentPaths(join(temporary, "runtime"))
    const owner = await runClient(ensureResident(paths, 5_000))
    processes.push(owner.pid)
    const client = (await import("node:net")).connect(paths.socket)
    const heartbeat = setInterval(() => client.write(" "), 500)
    try {
      await new Promise<void>((resolve, reject) => {
        client.once("connect", resolve)
        client.once("error", reject)
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 5_500))
      expect(() => process.kill(owner.pid, 0)).not.toThrow()
    } finally {
      clearInterval(heartbeat)
      client.destroy()
    }
  })

  it("keeps accepted review work and pending advice beyond the idle grace", async () => {
    const root = await makeGitFixture()
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-work-idle-"))
    directories.push(root, temporary)
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(temporary, "consent")
    const gate = join(temporary, "backend.gate")
    const paths = residentPaths(join(temporary, "runtime"))
    const launched = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import {ensureResidentEffect as ensureResident} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts'; console.log(JSON.stringify(await runClient(ensureResident())));"
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          REVIEW_RESIDENT_DIR: paths.directory,
          REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
          REVIEW_RESIDENT_CONTROLLED: "1"
        },
        stdio: ["pipe", "pipe", "pipe"]
      }
    )
    const owner = JSON.parse(await childResult(launched)) as { pid: number; lifetime: string }
    processes.push(owner.pid)
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const accepted = await admitComposed(paths, {
      requestRoute: "shared",
      operation: "admit",
      lifetime: owner.lifetime,
      observation,
      controlledWriter: true,
      dispatch: dispatchFor(statePath)
    })
    expect(accepted.status).toBe("accepted")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      return stats.status === "stats" && stats.running > 0 ? true : undefined
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 5_500))
    expect(() => process.kill(owner.pid, 0)).not.toThrow()
    await writeFile(gate, "release\n")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      return stats.status === "stats" && stats.pendingAdvice > 0 ? true : undefined
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 5_500))
    expect(() => process.kill(owner.pid, 0)).not.toThrow()
  })

  it("exits after SIGTERM with gated review work and permits a new owner", async () => {
    const root = await makeGitFixture()
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-signal-"))
    directories.push(root, temporary)
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(temporary, "consent")
    const gate = join(temporary, "backend.gate")
    const paths = residentPaths(join(temporary, "runtime"))
    const launched = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import {ensureResidentEffect as ensureResident} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts'; console.log(JSON.stringify(await runClient(ensureResident())));"
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          REVIEW_RESIDENT_DIR: paths.directory,
          REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
          REVIEW_RESIDENT_CONTROLLED: "1"
        },
        stdio: ["pipe", "pipe", "pipe"]
      }
    )
    const owner = JSON.parse(await childResult(launched)) as { pid: number; lifetime: string }
    processes.push(owner.pid)
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    expect(
      (
        await admitComposed(paths, {
          requestRoute: "shared",
          operation: "admit",
          lifetime: owner.lifetime,
          observation,
          controlledWriter: true,
          dispatch: dispatchFor(statePath)
        })
      ).status
    ).toBe("accepted")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      return stats.status === "stats" && stats.running > 0 ? true : undefined
    })
    expect(existsSync(gate)).toBe(false)
    process.kill(owner.pid, "SIGTERM")
    await waitFor(async () => {
      try {
        process.kill(owner.pid, 0)
        return undefined
      } catch {
        return !existsSync(paths.owner) && !existsSync(paths.lock) ? true : undefined
      }
    }, 5_000)
    const restarted = await runClient(ensureResident(paths, 5_000))
    processes.push(restarted.pid)
    expect(restarted.pid).not.toBe(owner.pid)
    expect(restarted.lifetime).not.toBe(owner.lifetime)
    expect((await runClient(residentRequest(paths, { requestRoute: "shared", operation: "hello" }))).status).toBe(
      "ready"
    )
  })

  it("converges six starters across three clients and keeps timed-out/disconnected work resident-owned", async () => {
    const root = await makeGitFixture()
    const otherRoot = await makeGitFixture()
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-test-"))
    directories.push(root, otherRoot, temporary)
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(temporary, "consent")
    const runtime = join(temporary, "runtime")
    const gate = join(temporary, "backend.gate")
    const acceptedPath = join(temporary, "admission.accepted")
    const collectGate = join(temporary, "collect-response")
    const collectDisconnected = join(temporary, "collect-disconnected")
    const ackGate = join(temporary, "ack-response")
    const clockPath = join(temporary, "clock")
    await writeFile(clockPath, "100\n")
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      // Deliberately wrong: per-request dispatch context, not first-launch
      // environment, owns configuration and consent lookup.
      REVIEW_STATE_PATH: join(temporary, "wrong-launch-consent"),
      REVIEW_RESIDENT_CONTROLLED: "1",
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: acceptedPath,
      REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH: join(temporary, "admit-response"),
      REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH: collectGate,
      REVIEW_RESIDENT_COLLECT_DISCONNECT_PATH: collectDisconnected,
      REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH: ackGate,
      REVIEW_RESIDENT_CLOCK_PATH: clockPath,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers })
    }
    const ensureScript = [
      "import { ensureResidentEffect as ensureResident } from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts';",
      "import {writeFileSync} from 'node:fs';",
      "const count=Number(process.argv[1]);",
      "await new Promise(resolve=>{process.stdin.once('data',resolve);writeFileSync(process.argv[2],'ready\\n')});",
      "process.stdin.pause();",
      "const values=await Promise.all(Array.from({length:count},()=>runClient(ensureResident())));",
      "console.log(JSON.stringify(values));"
    ].join("")
    // Release only after all three independent clients have imported their
    // runtime and armed stdin. Each then starts two concurrent ensure calls.
    const readyPaths = Array.from({ length: 3 }, (_, index) => join(temporary, `starter-${index}.ready`))
    const starters = readyPaths.map((readyPath) =>
      spawn(process.execPath, ["--input-type=module", "-e", ensureScript, "2", readyPath], {
        cwd: process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"]
      })
    )
    const results = Promise.all(starters.map(childResult))
    // Readiness failures must not leave an unhandled rejection while cleanup runs.
    void results.catch(() => {})
    let owners: string[]
    try {
      await waitFor(async () => {
        if (starters.some((child) => child.exitCode !== null || child.signalCode !== null)) {
          throw new Error("launch contender exited before the shared release")
        }
        return readyPaths.every((readyPath) => existsSync(readyPath)) ? true : undefined
      }, 8_000)
      for (const child of starters) child.stdin.end("release\n")
      owners = await results
    } finally {
      for (const child of starters) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
      }
      await Promise.all(starters.map(childClosed))
      // A partially successful launch still belongs to this fixture's cleanup.
      const ownerPath = residentPaths(runtime).owner
      if (existsSync(ownerPath)) {
        const owner = JSON.parse(await readFile(ownerPath, "utf8")) as { pid: number }
        processes.push(owner.pid)
      }
    }
    const identities = owners.flatMap((encoded) => JSON.parse(encoded) as Array<{ pid: number; lifetime: string }>)
    expect(identities).toHaveLength(6)
    expect(new Set(identities.map(({ pid }) => pid)).size).toBe(1)
    expect(new Set(identities.map(({ lifetime }) => lifetime)).size).toBe(1)

    // Losing the pathname is not evidence that the lock owner died. A stale
    // endpoint cannot make a contender displace that still-live owner, and
    // the readiness attempt remains bounded.
    const liveSocket = `${residentPaths(runtime).socket}.live`
    await rename(residentPaths(runtime).socket, liveSocket)
    const staleScript = [
      "import {createServer} from 'node:net';",
      "import {chmodSync} from 'node:fs';",
      `const path=${JSON.stringify(residentPaths(runtime).socket)};`,
      "const server=createServer();server.listen(path,()=>{chmodSync(path,0o600);console.log('ready')});"
    ].join("")
    const stale = spawn(process.execPath, ["--input-type=module", "-e", staleScript], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    })
    await new Promise<void>((resolve, reject) => {
      stale.once("error", reject)
      stale.stdout.once("data", () => resolve())
    })
    const staleClosed = childClosed(stale)
    stale.kill("SIGKILL")
    await staleClosed
    const boundedScript = [
      "import {ensureResidentEffect as ensureResident} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts';",
      `const paths=${JSON.stringify(residentPaths(runtime))};`,
      "await runClient(ensureResident(paths,250));"
    ].join("")
    const bounded = spawn(process.execPath, ["--input-type=module", "-e", boundedScript], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    })
    const readinessStarted = performance.now()
    await expect(childResult(bounded)).rejects.toThrow()
    expect(performance.now() - readinessStarted).toBeLessThan(2_000)
    expect(() => process.kill(identities[0]!.pid, 0)).not.toThrow()
    await rm(residentPaths(runtime).socket, { force: true })
    await rename(liveSocket, residentPaths(runtime).socket)

    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const admissionScript = [
      "import * as Effect from 'effect/Effect';",
      "import {connect} from 'node:net';",
      "import { adaptCodexDirectEvent } from './src/direct-event/adapter.ts';",
      "import {residentRequestEffect as residentRequest} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts';",
      "import {monotonicNow} from './src/resident/hook-clock.ts';",
      `const event=${JSON.stringify(addEvent(root))};`,
      `const dispatch=${JSON.stringify(dispatchFor(statePath))};`,
      `const socketPath=${JSON.stringify(residentPaths(runtime).socket)};`,
      `const paths=${JSON.stringify(residentPaths(runtime))};`,
      `const lifetime=${JSON.stringify(identities[0]!.lifetime)};`,
      "const observation=await Effect.runPromise(adaptCodexDirectEvent(event));",
      "const registered=await runClient(residentRequest(paths,{requestRoute:'shared',operation:'register-edit',lifetime,root:observation.root,advicee:observation.advicee,startedAt:monotonicNow()}));",
      "if(registered.status!=='advanced')throw new Error('edit permit was not registered');",
      "const socket=connect(socketPath);",
      "socket.once('connect',()=>socket.write(JSON.stringify({version:1,operation:'admit',lifetime,observation,controlledWriter:true,dispatch,composed:true})+'\\n'));"
    ].join("")
    const admitGate = env.REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH
    await writeFile(`${admitGate}.enabled`, "enabled\n")
    const admitting = spawn(process.execPath, ["--input-type=module", "-e", admissionScript], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    })
    let admissionFailure: unknown
    void childResult(admitting).catch((cause: unknown) => {
      admissionFailure = cause
    })
    await waitFor(async () => {
      if (admissionFailure !== undefined) throw admissionFailure
      return existsSync(acceptedPath) ? true : undefined
    })
    await waitFor(async () => (existsSync(`${admitGate}.entered`) ? true : undefined))
    const admissionClosed = childClosed(admitting)
    admitting.kill("SIGKILL")
    await admissionClosed

    const paths = residentPaths(runtime)
    const owner = identities[0]!
    const dispatch: ResidentDispatchContext = {
      ...dispatchFor(statePath),
      controlled: {
        answers: Object.fromEntries(
          configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 }
          ])
        )
      }
    }
    for (let index = 0; index < 2; index++) {
      await expect(
        admitComposed(
          paths,
          {
            requestRoute: "shared",
            operation: "admit",
            lifetime: owner.lifetime,
            observation: { ...observation, advicee: { ...observation.advicee, toolUseId: `extra-${index}` } },
            controlledWriter: true,
            dispatch
          },
          50
        )
      ).rejects.toThrow("outcome is uncertain")
    }
    await writeFile(`${admitGate}.release`, "release\n")
    const gated = await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      // Independent preparation jobs use free resident slots immediately.
      return stats.status === "stats" && stats.running === 3 && stats.queued === 0 ? stats : undefined
    })
    expect(gated.retainedBytes).toBeLessThanOrEqual(64 * 1024 * 1024)
    await writeFile(gate, "release\n")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      // Event/tool ids do not distinguish complete evaluation identity: the
      // three accepted observations converge on one evaluation and advice.
      return stats.status === "stats" && stats.pendingAdvice === 1 ? stats : undefined
    })

    expect(await runClient(collectReady(root, advicee({ subagentId: "other-child" }), dispatch, paths))).toBeUndefined()
    expect(await runClient(collectReady(otherRoot, advicee(), dispatch, paths))).toBeUndefined()
    await writeFile(`${collectGate}.enabled`, "enabled\n")
    const disconnectScript = [
      "import {collectReadyEffect as collectReady} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts';",
      `const root=${JSON.stringify(root)};`,
      `const advicee=${JSON.stringify(advicee({ turnId: "later", toolUseId: "disconnect" }))};`,
      `const dispatch=${JSON.stringify(dispatch)};`,
      `const paths=${JSON.stringify(paths)};`,
      "await runClient(collectReady(root,advicee,dispatch,paths));"
    ].join("")
    const disconnecting = spawn(process.execPath, ["--input-type=module", "-e", disconnectScript], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    })
    await waitFor(async () => (existsSync(`${collectGate}.entered`) ? true : undefined))
    const disconnected = childClosed(disconnecting)
    disconnecting.kill("SIGKILL")
    await disconnected
    await waitFor(async () => (existsSync(collectDisconnected) ? true : undefined))
    await writeFile(`${collectGate}.release`, "release\n")
    const advice = await waitFor(
      () => runClient(collectReady(root, advicee({ turnId: "later", toolUseId: "bash" }), dispatch, paths)),
      10_000
    )
    expect(advice?.output.hookSpecificOutput.additionalContext).toContain("type.ts")
    if (advice === undefined) return

    await writeFile(`${ackGate}.enabled`, "enabled\n")
    expect(await runClient(beginComposedSubmission(advice, "edit"))).toBe(true)
    const ackScript = [
      "import {acknowledgeAdviceEffect as acknowledgeAdvice} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts';",
      `const advice=${JSON.stringify(advice)};`,
      "await runClient(acknowledgeAdvice(advice));"
    ].join("")
    const acknowledging = spawn(process.execPath, ["--input-type=module", "-e", ackScript], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    })
    await waitFor(async () => (existsSync(`${ackGate}.entered`) ? true : undefined))
    const acknowledgementClosed = childClosed(acknowledging)
    acknowledging.kill("SIGKILL")
    await writeFile(`${ackGate}.release`, "release\n")
    await acknowledgementClosed
    await writeFile(clockPath, `${100 + DELIVERY_LEASE_MS}\n`)
    const reclaimed = await runClient(
      collectReady(root, advicee({ turnId: "later", toolUseId: "after-ack-failure" }), dispatch, paths)
    )
    // The killed acknowledgement may have reached output authorization. It
    // cannot be silently offered again as an ordinary edit response.
    expect(reclaimed).toBeUndefined()

    await put(root, "type.ts", "type ChangedAfterReview = string\n")
    expect(
      await runClient(collectReady(root, advicee({ turnId: "later-2", toolUseId: "bash-2" }), dispatch, paths))
    ).toBeUndefined()
  })

  it("rechecks file exclusions after admission and before backend dispatch", async () => {
    const root = await makeGitFixture()
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-revoke-"))
    directories.push(root, temporary)
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(temporary, "consent")
    const runtime = join(temporary, "runtime")
    const gate = join(temporary, "backend.gate")
    const capturePath = join(temporary, "backend-called")
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_CONTROLLED: "1",
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath })
    }
    const script =
      "import {ensureResidentEffect as ensureResident} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts'; console.log(JSON.stringify(await runClient(ensureResident())));"
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    })
    const owner = JSON.parse(await childResult(child)) as { pid: number; lifetime: string }
    processes.push(owner.pid)
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const paths = residentPaths(runtime)
    const dispatch = dispatchFor(statePath, { capturePath })
    expect(
      (
        await admitComposed(paths, {
          requestRoute: "shared",
          operation: "admit",
          lifetime: owner.lifetime,
          observation,
          controlledWriter: true,
          dispatch
        })
      ).status
    ).toBe("accepted")
    await put(root, ".hapsland.jsonc", '{"version":1,"excludes":["type.ts"]}')
    await writeFile(gate, "release\n")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      return stats.status === "stats" && stats.running === 0 ? stats : undefined
    })
    expect(existsSync(capturePath)).toBe(false)
    expect(await runClient(collectReady(root, advicee(), dispatch, paths))).toBeUndefined()
    expect(JSON.parse(await readFile(paths.owner, "utf8"))).toMatchObject({ pid: owner.pid })
  })

  it("loads current configuration at dispatch rather than freezing admission config", async () => {
    const root = await makeGitFixture()
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-config-"))
    directories.push(root, temporary)
    await put(root, "type.ts", "type OrderCount = number\n")
    const statePath = join(temporary, "consent")
    const runtime = join(temporary, "runtime")
    const gate = join(temporary, "backend.gate")
    const capturePath = join(temporary, "backend-called")
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_CONTROLLED: "1",
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath })
    }
    const script =
      "import {ensureResidentEffect as ensureResident} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts'; console.log(JSON.stringify(await runClient(ensureResident())));"
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    })
    const owner = JSON.parse(await childResult(child)) as { pid: number; lifetime: string }
    processes.push(owner.pid)
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(observation).toBeDefined()
    if (observation === undefined) return
    const paths = residentPaths(runtime)
    const dispatch = dispatchFor(statePath, { capturePath })
    expect(
      (
        await admitComposed(paths, {
          requestRoute: "shared",
          operation: "admit",
          lifetime: owner.lifetime,
          observation,
          controlledWriter: true,
          dispatch
        })
      ).status
    ).toBe("accepted")
    await put(root, ".hapsland.jsonc", '{"version":1,"excludes":["type.ts"]}\n')
    await writeFile(gate, "release\n")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      )
      return stats.status === "stats" && stats.running === 0 ? stats : undefined
    })
    expect(existsSync(capturePath)).toBe(false)
    expect(await runClient(collectReady(root, advicee(), dispatch, paths))).toBeUndefined()
  })

  it("kills one lifetime, rejects obsolete messages, restarts empty, and cleans up only when idle", async () => {
    const root = await makeGitFixture()
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-restart-"))
    const otherRoot = join(temporary, "other-worktree")
    directories.push(root, temporary)
    await put(root, "type.ts", "type OrderCount = number\n")
    await put(root, "second.ts", "type CustomerCount = number\n")
    await execFileAsync("git", ["-C", root, "add", "type.ts", "second.ts"])
    await execFileAsync("git", ["-C", root, "commit", "-qm", "resident lifecycle fixture"])
    await execFileAsync("git", ["-C", root, "worktree", "add", "--detach", otherRoot, "HEAD"])

    const statePath = join(temporary, "consent")
    const runtime = join(temporary, "runtime")
    const backendGate = join(temporary, "backend.gate")
    const cleanupGate = join(temporary, "cleanup-response")
    await writeFile(backendGate, "release\n")
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_RESIDENT_BACKEND_GATE_PATH: backendGate,
      REVIEW_RESIDENT_CLEANUP_RESPONSE_GATE_PATH: cleanupGate
    }
    const ensureScript =
      "import {ensureResidentEffect as ensureResident} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts'; console.log(JSON.stringify(await runClient(ensureResident())));"
    const start = async () => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", ensureScript], {
        cwd: process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"]
      })
      return JSON.parse(await childResult(child)) as { pid: number; lifetime: string }
    }
    const paths = residentPaths(runtime)
    const dispatch: ResidentDispatchContext = {
      ...dispatchFor(statePath),
      controlled: {
        answers: Object.fromEntries(
          configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 }
          ])
        )
      }
    }
    const failingDispatch: ResidentDispatchContext = {
      ...dispatch,
      controlled: { failure: "fixture backend unavailable" }
    }
    const observe = async (
      targetRoot: string,
      pathsInEvent: ReadonlyArray<string>,
      overrides: Readonly<Record<string, unknown>> = {}
    ) => {
      const adapted = await Effect.runPromise(adaptCodexDirectEvent(addEvent(targetRoot, pathsInEvent, overrides)))
      expect(adapted).toBeDefined()
      if (adapted === undefined) throw new Error("fixture did not adapt")
      return adapted
    }

    const first = await start()
    processes.push(first.pid)
    const rootObservation = await observe(root, ["type.ts"])
    expect(
      (
        await admitComposed(paths, {
          requestRoute: "shared",
          operation: "admit",
          lifetime: first.lifetime,
          observation: rootObservation,
          controlledWriter: true,
          dispatch
        })
      ).status
    ).toBe("accepted")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: first.lifetime })
      )
      return stats.status === "stats" && stats.pendingAdvice === 1 && stats.successfulCacheEntries === 1
        ? stats
        : undefined
    })
    // An equivalent completed input joins the retained advice/cache identity.
    expect(
      (
        await admitComposed(paths, {
          requestRoute: "shared",
          operation: "admit",
          lifetime: first.lifetime,
          observation: { ...rootObservation, advicee: { ...rootObservation.advicee, toolUseId: "joined" } },
          controlledWriter: true,
          dispatch
        })
      ).status
    ).toBe("accepted")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: first.lifetime })
      )
      return stats.status === "stats" && stats.running === 0 && stats.queued === 0 ? stats : undefined
    })

    const noticeObservation = await observe(root, ["type.ts"], { agent_id: "notice-child" })
    for (const toolUseId of ["notice-1", "notice-2"]) {
      expect(
        (
          await admitComposed(paths, {
            requestRoute: "shared",
            operation: "admit",
            lifetime: first.lifetime,
            observation: { ...noticeObservation, advicee: { ...noticeObservation.advicee, toolUseId } },
            controlledWriter: true,
            dispatch: failingDispatch
          })
        ).status
      ).toBe("accepted")
    }
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: first.lifetime })
      )
      return stats.status === "stats" && stats.running === 0 && stats.noticeCooldowns === 1 ? stats : undefined
    })
    expect(
      (
        await runClient(
          residentRequest(paths, { requestRoute: "shared", operation: "cleanup", lifetime: first.lifetime })
        )
      ).status
    ).toBe("busy")

    // Accepted work remains resident-owned with no client callback. Cleanup
    // refuses it, and killing the actual owner is the explicit loss boundary.
    await rm(backendGate, { force: true })
    const blockedObservation = await observe(root, ["second.ts"], { tool_use_id: "blocked-before-kill" })
    expect(
      (
        await admitComposed(paths, {
          requestRoute: "shared",
          operation: "admit",
          lifetime: first.lifetime,
          observation: blockedObservation,
          controlledWriter: true,
          dispatch
        })
      ).status
    ).toBe("accepted")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: first.lifetime })
      )
      return stats.status === "stats" && stats.running > 0 ? stats : undefined
    })
    expect(
      (
        await runClient(
          residentRequest(paths, { requestRoute: "shared", operation: "cleanup", lifetime: first.lifetime })
        )
      ).status
    ).toBe("busy")
    expect((await readdir(runtime)).sort()).toEqual(["owner.json", "owner.lock", "resident.sock"])
    process.kill(first.pid, "SIGKILL")
    await waitFor(async () => {
      try {
        process.kill(first.pid, 0)
        return undefined
      } catch {
        return true
      }
    })

    await writeFile(backendGate, "release\n")
    const second = await start()
    processes.push(second.pid)
    expect(second.lifetime).not.toBe(first.lifetime)
    expect(
      (
        await runClient(
          residentRequest(paths, {
            requestRoute: "shared",
            operation: "admit",
            lifetime: first.lifetime,
            observation: blockedObservation,
            controlledWriter: true,
            dispatch,
            composed: true
          })
        )
      ).status
    ).toBe("obsolete-lifetime")
    expect(
      await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: second.lifetime }))
    ).toMatchObject({
      status: "stats",
      queued: 0,
      running: 0,
      pendingAdvice: 0,
      retainedBytes: 0,
      successfulCacheEntries: 0,
      pendingEvaluations: 0,
      noticeCooldowns: 0,
      currentWork: 0
    })
    expect(await runClient(collectReady(root, advicee(), dispatch, paths))).toBeUndefined()

    // One two-unit batch with a same-round join, one child partition, and one
    // distinct existing Git worktree travel through the new process. Exclusion
    // after admission keeps the other worktree from dispatching and cannot
    // leak its advice.
    const batch = await observe(root, ["type.ts", "second.ts"], { tool_use_id: "batch" })
    const child = await observe(root, ["type.ts"], { agent_id: "child-2", tool_use_id: "child" })
    const other = await observe(otherRoot, ["type.ts"], { tool_use_id: "other-worktree" })
    await rm(backendGate, { force: true })
    for (const observation of [
      batch,
      { ...batch, advicee: { ...batch.advicee, toolUseId: "batch-join" } },
      child,
      other
    ]) {
      expect(
        (
          await admitComposed(paths, {
            requestRoute: "shared",
            operation: "admit",
            lifetime: second.lifetime,
            observation,
            controlledWriter: true,
            dispatch
          })
        ).status
      ).toBe("accepted")
    }
    await put(otherRoot, ".hapsland.jsonc", '{"version":1,"excludes":["type.ts"]}')
    await writeFile(backendGate, "release\n")
    await waitFor(async () => {
      const stats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: second.lifetime })
      )
      return stats.status === "stats" && stats.running === 0 && stats.queued === 0 && stats.pendingAdvice === 3
        ? stats
        : undefined
    })
    expect(await runClient(collectReady(otherRoot, advicee(), dispatch, paths))).toBeUndefined()
    const rootBatch = await runClient(
      collectReady(root, advicee({ turnId: "collect", toolUseId: "batch" }), dispatch, paths)
    )
    expect(rootBatch?.output.hookSpecificOutput.additionalContext).toContain("type.ts")
    expect(rootBatch?.output.hookSpecificOutput.additionalContext).toContain("second.ts")
    if (rootBatch === undefined) return
    expect(
      (
        await runClient(
          residentRequest(paths, { requestRoute: "shared", operation: "cleanup", lifetime: second.lifetime })
        )
      ).status
    ).toBe("busy")
    expect(await runClient(beginComposedSubmission(rootBatch, "edit"))).toBe(true)
    expect(await runClient(acknowledgeAdvice(rootBatch))).toBe(true)
    const childAdvice = await runClient(
      collectReady(root, advicee({ subagentId: "child-2", turnId: "collect", toolUseId: "child" }), dispatch, paths)
    )
    expect(childAdvice).toBeDefined()
    if (childAdvice !== undefined) {
      expect(await runClient(beginComposedSubmission(childAdvice, "edit"))).toBe(true)
      expect(await runClient(acknowledgeAdvice(childAdvice))).toBe(true)
    }

    const beforeClosure = await runClient(
      residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: second.lifetime })
    )
    expect(beforeClosure).toMatchObject({ status: "stats", pendingAdvice: 3 })
    for (const [roundRoot, agent, token] of [
      [root, advicee(), "root-stop"],
      [root, advicee({ subagentId: "child-2" }), "child-stop"],
      [otherRoot, advicee(), "other-stop"]
    ] as const) {
      expect(await runClient(composedStopBoundary("begin-stop", roundRoot, agent, token, false, paths))).toBe(true)
      expect(await runClient(composedStopBoundary("finish-stop", roundRoot, agent, token, true, paths))).toBe(true)
    }
    const beforeCleanup = await runClient(
      residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: second.lifetime })
    )
    expect(beforeCleanup).toMatchObject({ status: "stats", pendingAdvice: 0 })
    if (beforeCleanup.status === "stats") expect(beforeCleanup.successfulCacheEntries).toBe(0)
    await writeFile(`${cleanupGate}.enabled`, "enabled\n")
    const cleanupScript = [
      "import {residentRequestEffect as residentRequest} from './src/resident/client.ts';\nimport { runClient } from './src/test-support/client-runtime.ts';",
      `const paths=${JSON.stringify(paths)};`,
      `const lifetime=${JSON.stringify(second.lifetime)};`,
      "console.log(JSON.stringify(await runClient(residentRequest(paths,{requestRoute:'shared',operation:'cleanup',lifetime}))));"
    ].join("")
    const cleaning = spawn(process.execPath, ["--input-type=module", "-e", cleanupScript], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"]
    })
    const cleanupResult = childResult(cleaning)
    await waitFor(async () => (existsSync(`${cleanupGate}.entered`) ? true : undefined))
    // The cleanup response is still gated, so these arrive concurrently with
    // the retiring owner still listening. Neither can revive or reserve work.
    expect(await runClient(residentRequest(paths, { requestRoute: "shared", operation: "hello" }))).toEqual({
      status: "obsolete-lifetime"
    })
    expect(
      await runClient(
        residentRequest(paths, {
          requestRoute: "shared",
          operation: "admit",
          lifetime: second.lifetime,
          observation: batch,
          controlledWriter: true,
          dispatch,
          composed: true
        })
      )
    ).toEqual({ status: "obsolete-lifetime" })
    await writeFile(`${cleanupGate}.release`, "release\n")
    expect(JSON.parse(await cleanupResult)).toEqual({ status: "cleaned" })
    await waitFor(async () => {
      try {
        process.kill(second.pid, 0)
        return undefined
      } catch {
        return true
      }
    })

    const third = await start()
    processes.push(third.pid)
    expect(third.lifetime).not.toBe(second.lifetime)
    expect(
      await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: third.lifetime }))
    ).toMatchObject({
      status: "stats",
      queued: 0,
      running: 0,
      pendingAdvice: 0,
      retainedBytes: 0,
      successfulCacheEntries: 0,
      noticeCooldowns: 0
    })
  })
})
