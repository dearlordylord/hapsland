import { writeFileSync, rmSync } from "node:fs"
import { runClient } from "../test-support/client-runtime.ts"
import { makeReviewGitFixture as makeGitFixture, advicee as fixtureAdvicee } from "../direct-event/test-fixtures.ts"
import { it as effectIt } from "@effect/vitest"
import { ConfigProvider, Deferred, Effect, Fiber, Layer } from "effect"
import * as Scheduler from "effect/Scheduler"
import { afterEach, describe, expect, it } from "vitest"
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ResidentIpcError,
  releaseComposedBackgroundEffect,
  admitAndCollectEffect,
  makeResidentDispatchContextEffect,
  admitObservationEffect,
  residentRequestEffect as residentRequest,
  residentRequestEffect,
  ResidentStartup,
  ensureResidentEffect,
  type ResidentStartupOperations
} from "./client.ts"
import { prepareResidentDirectory, residentPaths, validateEndpointMetadata } from "./paths.ts"
import type { DirectObservation } from "../direct-event/observation.ts"

const directories: Array<string> = []
const servers: Array<Server> = []
const sockets: Array<Socket> = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const socket of sockets.splice(0)) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe("resident client trust boundary", () => {
  it("does not launch a resident just to release a background claim", async () => {
    const directory = await mkdtemp(join(tmpdir(), "haps-background-missing-"))
    directories.push(directory)
    await chmod(directory, 0o700)
    expect(
      await runClient(releaseComposedBackgroundEffect("/repo", fixtureAdvicee(), "claim", residentPaths(directory)))
    ).toBe(false)
  })

  it.each(["released", "empty"] as const)("releases a claim against the inspected lifetime: %s", async (status) => {
    const directory = await mkdtemp(join(tmpdir(), "haps-background-release-"))
    directories.push(directory)
    await chmod(directory, 0o700)
    const paths = residentPaths(directory)
    const requests: unknown[] = []
    const server = createServer((socket) => {
      sockets.push(socket)
      let frame = ""
      socket.on("data", (chunk) => {
        frame += chunk.toString("utf8")
        if (!frame.includes("\n")) return
        const request = JSON.parse(frame)
        requests.push(request)
        const response =
          request.operation === "hello"
            ? { version: 1, status: "ready", lifetime: "owned", pid: process.pid }
            : { version: 1, status }
        socket.end(`${JSON.stringify(response)}\n`)
      })
    })
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(paths.socket, resolve)
    })
    await chmod(paths.socket, 0o600)
    const advicee = fixtureAdvicee()
    const result = await runClient(
      releaseComposedBackgroundEffect("/repo", advicee, "claim").pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DIR: directory })))
      )
    )
    expect(result).toBe(status === "released")
    expect(requests).toEqual([
      { version: 1, operation: "hello" },
      { version: 1, operation: "release-background", lifetime: "owned", root: "/repo", advicee, token: "claim" }
    ])
  })

  it("sends the IPC frame when scheduling yields before connection handlers run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "haps-ipc-"))
    directories.push(directory)
    await chmod(directory, 0o700)
    const paths = residentPaths(directory)
    let received = 0
    const server = createServer((socket) => {
      sockets.push(socket)
      let frame = ""
      socket.on("data", (chunk) => {
        frame += chunk.toString("utf8")
        if (!frame.includes("\n")) return
        expect(JSON.parse(frame)).toEqual({ version: 1, operation: "hello" })
        received += 1
        socket.end(`${JSON.stringify({ version: 1, status: "ready", lifetime: "fixture", pid: process.pid })}\n`)
      })
    })
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(paths.socket, resolve)
    })
    await chmod(paths.socket, 0o600)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await Effect.runPromise(
        residentRequestEffect(paths, { requestRoute: "shared", operation: "hello" }, 300).pipe(
          Effect.provideService(Scheduler.MaxOpsBeforeYield, 3)
        )
      )
      expect(response).toEqual({ status: "ready", lifetime: "fixture", pid: process.pid })
    }
    expect(received).toBe(3)
  })
  effectIt.effect("uses one absolute readiness deadline and caps every operation to remaining time", () =>
    Effect.gen(function* () {
      const paths = residentPaths("/not-used")
      let clock = 0
      const launchCalls: Array<{ readonly at: number; readonly budget: number }> = []
      const probeBudgets: Array<number> = []
      const dependencies: ResidentStartupOperations = {
        now: Effect.sync(() => clock),
        clearDiagnostic: () => Effect.void,
        diagnostic: () => Effect.succeed(""),
        prepare: (_paths, timeoutMs) =>
          Effect.sync(() => {
            expect(timeoutMs).toBe(10_000)
            clock += 100
          }),
        probe: (_paths, timeoutMs) =>
          Effect.try({
            try: () => {
              probeBudgets.push(timeoutMs)
              clock += timeoutMs
              throw new ResidentIpcError({ message: "not ready" })
            },
            catch: () => new ResidentIpcError({ message: "not ready" })
          }),
        launch: (_paths, timeoutMs) =>
          Effect.sync(() => {
            launchCalls.push({ at: clock, budget: timeoutMs })
          }),
        wait: (milliseconds) =>
          Effect.sync(() => {
            clock += milliseconds
          })
      }
      const failure = yield* ensureResidentEffect(paths, 10_000).pipe(
        Effect.provide(Layer.succeed(ResidentStartup, dependencies)),
        Effect.flip
      )
      expect(failure.message).toContain("resident did not become ready within 10 seconds")
      expect(clock).toBe(10_000)
      expect(launchCalls.length).toBeGreaterThan(1)
      expect(launchCalls.every(({ at, budget }) => at < 10_000 && budget === 10_000 - at)).toBe(true)
      expect(probeBudgets.every((budget) => budget > 0 && budget <= 250)).toBe(true)
      expect(probeBudgets.at(-1)).toBeLessThanOrEqual(250)
    })
  )

  effectIt.effect("retries owner acquisition after a losing owner exits within the same deadline", () =>
    Effect.gen(function* () {
      const paths = residentPaths("/not-used")
      let clock = 0
      let launchCount = 0
      let endpointReady = false
      let ownerPresent = true
      const calls: Array<{ readonly operation: string; readonly at: number; readonly budget: number }> = []
      const dependencies: ResidentStartupOperations = {
        now: Effect.sync(() => clock),
        clearDiagnostic: () => Effect.void,
        diagnostic: () => Effect.succeed(""),
        prepare: (_paths, timeoutMs) =>
          Effect.sync(() => {
            calls.push({ operation: "prepare", at: clock, budget: timeoutMs })
          }),
        probe: (_paths, timeoutMs) =>
          Effect.try({
            try: () => {
              calls.push({ operation: "probe", at: clock, budget: timeoutMs })
              clock += Math.min(100, timeoutMs)
              if (endpointReady) return { status: "ready", lifetime: "second-owner", pid: 42 } as const
              throw new ResidentIpcError({ message: "not ready" })
            },
            catch: () => new ResidentIpcError({ message: "not ready" })
          }),
        launch: (_paths, timeoutMs) =>
          Effect.sync(() => {
            calls.push({ operation: "launch", at: clock, budget: timeoutMs })
            launchCount += 1
            if (!ownerPresent) endpointReady = true
          }),
        wait: (milliseconds) =>
          Effect.sync(() => {
            calls.push({ operation: "wait", at: clock, budget: milliseconds })
            clock += milliseconds
            ownerPresent = false
          })
      }

      expect(
        yield* ensureResidentEffect(paths, 10_000).pipe(Effect.provide(Layer.succeed(ResidentStartup, dependencies)))
      ).toEqual({ status: "ready", lifetime: "second-owner", pid: 42 })
      expect(launchCount).toBe(2)
      expect(clock).toBeGreaterThanOrEqual(350)
      expect(calls.every(({ at, budget }) => at < 10_000 && budget > 0 && budget <= 10_000 - at)).toBe(true)
    })
  )

  it("rejects wrong ownership, unsafe mode, symlinks, and wrong endpoint types", () => {
    const uid = typeof process.getuid === "function" ? process.getuid() : process.pid
    const safe = { uid, mode: 0o140600, isDirectory: false, isSocket: true, isFile: false, isSymbolicLink: false }
    expect(validateEndpointMetadata(safe, "socket", uid)).toBe(true)
    expect(validateEndpointMetadata({ ...safe, uid: uid + 1 }, "socket", uid)).toBe(false)
    expect(validateEndpointMetadata({ ...safe, mode: 0o140666 }, "socket", uid)).toBe(false)
    expect(validateEndpointMetadata({ ...safe, isSymbolicLink: true }, "socket", uid)).toBe(false)
    expect(validateEndpointMetadata({ ...safe, isSocket: false, isFile: true }, "socket", uid)).toBe(false)
  })

  it("rejects a precreated symlink runtime directory", async () => {
    const parent = await mkdtemp(join(tmpdir(), "resident-symlink-test-"))
    const target = await mkdtemp(join(tmpdir(), "resident-symlink-target-"))
    directories.push(parent, target)
    const link = join(parent, "runtime")
    await symlink(target, link)
    await expect(Effect.runPromise(prepareResidentDirectory(residentPaths(link)))).rejects.toThrow("private user-owned")
  })

  it.each([
    ["malformed", "not-json\n"],
    ["forged extra context", '{"status":"ready","lifetime":"fake","pid":1,"context":{"injected":true}}\n'],
    ["wrong field type", '{"status":"ready","lifetime":"fake","pid":"1"}\n'],
    ["invalid IPC version", '{"version":null,"status":"empty"}\n']
  ])("schema-rejects %s server responses", async (_label, response) => {
    const directory = await mkdtemp(join(tmpdir(), "resident-response-test-"))
    directories.push(directory)
    await chmod(directory, 0o700)
    const paths = residentPaths(directory)
    const server = createServer((socket) => socket.end(response))
    server.on("connection", (socket) => sockets.push(socket))
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(paths.socket, resolve)
    })
    await chmod(paths.socket, 0o600)
    await expect(
      runClient(residentRequest(paths, { requestRoute: "shared", operation: "hello" }, 500))
    ).rejects.toThrow("resident response was invalid")
  })

  it("rejects a precreated permissive endpoint before accepting its context", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resident-attacker-endpoint-"))
    directories.push(directory)
    await chmod(directory, 0o700)
    const paths = residentPaths(directory)
    let connections = 0
    const server = createServer((socket) => {
      connections += 1
      socket.end('{"status":"ready","lifetime":"forged","pid":1}\n')
    })
    server.on("connection", (socket) => sockets.push(socket))
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(paths.socket, resolve)
    })
    await chmod(paths.socket, 0o666)
    await expect(
      runClient(residentRequest(paths, { requestRoute: "shared", operation: "hello" }, 500))
    ).rejects.toThrow("private user-owned socket")
    expect(connections).toBe(0)
  })

  it("closes a connected native socket when the request fiber is interrupted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resident-interruption-test-"))
    directories.push(directory)
    await chmod(directory, 0o700)
    const paths = residentPaths(directory)
    let entered!: () => void
    let closed!: () => void
    const requestEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    const connectionClosed = new Promise<void>((resolve) => {
      closed = resolve
    })
    const server = createServer((socket) => {
      sockets.push(socket)
      socket.once("data", entered)
      socket.once("close", closed)
    })
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(paths.socket, resolve)
    })
    await chmod(paths.socket, 0o600)
    const request = Effect.runFork(residentRequestEffect(paths, { requestRoute: "shared", operation: "hello" }, 5_000))
    try {
      await requestEntered
      await Effect.runPromise(Fiber.interrupt(request))
      await connectionClosed
      expect(sockets[0]?.destroyed).toBe(true)
    } finally {
      await Effect.runPromise(Fiber.interrupt(request))
    }
  })

  effectIt.live("keeps admission IPC in its workflow and closes it on interruption", () =>
    Effect.gen(function* () {
      const directory = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "resident-admit-interruption-")))
      directories.push(directory)
      yield* Effect.promise(() => chmod(directory, 0o700))
      const paths = residentPaths(directory)
      const entered = yield* Deferred.make<void>()
      const closed = yield* Deferred.make<void>()
      const server = createServer((socket) => {
        sockets.push(socket)
        socket.once("data", (chunk) => {
          expect(JSON.parse(chunk.toString("utf8")).operation).toBe("admit")
          Effect.runSync(Deferred.succeed(entered, undefined))
        })
        socket.once("close", () => Effect.runSync(Deferred.succeed(closed, undefined)))
      })
      servers.push(server)
      yield* Effect.promise(
        () =>
          new Promise<void>((resolve, reject) => {
            server.once("error", reject)
            server.listen(paths.socket, resolve)
          })
      )
      yield* Effect.promise(() => chmod(paths.socket, 0o600))
      const startup = ResidentStartup.of({
        now: Effect.sync(() => performance.now()),
        prepare: () => Effect.void,
        probe: () => Effect.succeed({ status: "ready", lifetime: "owner", pid: 1 }),
        launch: () => Effect.die("an available owner must not launch"),
        wait: (milliseconds) => Effect.sleep(milliseconds),
        clearDiagnostic: () => Effect.void,
        diagnostic: () => Effect.succeed("")
      })
      const observation: DirectObservation = {
        root: "/fixture",
        rootIdentity: { rootDevice: "1", rootInode: "2", gitDirectory: "/fixture/.git", gitDevice: "1", gitInode: "3" },
        advicee: {
          host: "codex-cli",
          hostVersion: "0.155.1",
          sessionId: "session",
          turnId: "turn",
          toolUseId: "tool",
          subagentId: null
        },
        candidates: []
      }
      const admission = yield* admitObservationEffect(
        observation,
        true,
        { statePath: "/fixture/state", userConfigPath: null, credential: null, controlled: {} },
        paths
      ).pipe(Effect.provideService(ResidentStartup, startup), Effect.forkScoped)
      yield* Deferred.await(entered)
      expect(admission.pollUnsafe()).toBeUndefined()
      yield* Fiber.interrupt(admission)
      yield* Deferred.await(closed)
      expect(sockets[0]?.destroyed).toBe(true)
    })
  )

  it("bounds a collect response when the connected server never responds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resident-timeout-test-"))
    directories.push(directory)
    await chmod(directory, 0o700)
    const paths = residentPaths(directory)
    const server = createServer(() => undefined)
    server.on("connection", (socket) => sockets.push(socket))
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(paths.socket, resolve)
    })
    await chmod(paths.socket, 0o600)
    await expect(
      runClient(
        residentRequest(
          paths,
          {
            requestRoute: "shared",
            operation: "collect",
            composed: true,
            lifetime: "lifetime",
            root: "/tmp/root",
            advicee: {
              host: "codex-cli",
              hostVersion: "0.155.1",
              sessionId: "session",
              turnId: "turn",
              toolUseId: "tool",
              subagentId: null
            },
            dispatch: { statePath: "/tmp/consent", userConfigPath: null, credential: null, controlled: {} }
          },
          20
        )
      )
    ).rejects.toThrow("deadline exceeded")
  })

  it("rejects an oversized request before writing advicee-bearing bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resident-oversized-request-"))
    directories.push(directory)
    await chmod(directory, 0o700)
    const paths = residentPaths(directory)
    let received = 0
    const server = createServer((socket) =>
      socket.on("data", (chunk) => {
        received += typeof chunk === "string" ? Buffer.byteLength(chunk, "utf8") : chunk.byteLength
      })
    )
    server.on("connection", (socket) => sockets.push(socket))
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(paths.socket, resolve)
    })
    await chmod(paths.socket, 0o600)
    await expect(
      runClient(
        residentRequest(
          paths,
          {
            requestRoute: "shared",
            operation: "collect",
            composed: true,
            lifetime: "lifetime",
            root: "/tmp/root",
            advicee: {
              host: "codex-cli",
              hostVersion: "0.155.1",
              sessionId: "session",
              turnId: "turn",
              toolUseId: "tool",
              subagentId: null
            },
            dispatch: {
              statePath: "/tmp/consent",
              userConfigPath: null,
              credential: {
                name: "JEV_API_KEY",
                environmentValue: "x".repeat(300_000),

                generation: 0,
                statePath: "/tmp/credential-state"
              },
              controlled: null
            }
          },
          500
        )
      )
    ).rejects.toThrow("request exceeded frame bound")
    expect(received).toBe(0)
  })
})

effectIt.effect("dispatch credentials and paths use the supplied configuration provider", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture)
    directories.push(root)
    const credentialStatePath = join(root, "credential-state.json")
    const acquire = makeResidentDispatchContextEffect(
      root,
      join(root, "consent"),
      join(root, "activity"),
      undefined,
      undefined
    )
    const configured = yield* acquire.pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            TYPESAFE_API_KEY: "synthetic-fixture-credential",
            REVIEW_CREDENTIAL_STATE_PATH: credentialStatePath,
            REVIEW_DEMO_BUDGET_PATH: join(root, "budget")
          })
        )
      )
    )
    expect(configured.credential?.environmentValue).toBe("synthetic-fixture-credential")
    expect(configured.credential?.statePath).toBe(credentialStatePath)
    expect(configured.demoBudgetPath).toBe(join(root, "budget"))
    const absent = yield* acquire.pipe(
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_CREDENTIAL_STATE_PATH: credentialStatePath }))
      )
    )
    expect(absent.credential?.environmentValue).toBeNull()
    expect(absent.demoBudgetPath).toBeNull()
    writeFileSync(join(root, ".env.local"), "TYPESAFE_API_KEY=file-fixture-credential\n")
    const fromFile = yield* acquire.pipe(
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_CREDENTIAL_STATE_PATH: credentialStatePath }))
      )
    )
    expect(fromFile.credential?.environmentValue).toBe("file-fixture-credential")
    rmSync(join(root, ".env.local"))
    for (const key of ["REVIEW_CREDENTIAL_STATE_PATH", "REVIEW_DEMO_BUDGET_PATH"]) {
      const invalid = yield* acquire.pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown(
              { REVIEW_CREDENTIAL_STATE_PATH: credentialStatePath, [key]: "" },
              { preserveEmptyStrings: true }
            )
          )
        ),
        Effect.result
      )
      expect(invalid._tag).toBe("Failure")
    }
  })
)

effectIt.effect("serializes only portable controlled dispatch options and keeps credential opt-in", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture)
    directories.push(root)
    const provider = ConfigProvider.layer(
      ConfigProvider.fromUnknown({ REVIEW_CREDENTIAL_STATE_PATH: join(root, "credential-state.json") })
    )
    const options: import("../review-execution/controlled-decision-model.ts").ControlledDecisionModelOptions = {
      answers: { fixture: { _tag: "Probability", probability: 0.5 } },
      delayMs: 0,
      failure: "fixture-failure",
      failureOnSourceIncludes: "fail-marker",
      findingOnSourceIncludes: "finding-marker",
      syntheticR6BrandedRepair: "control",
      capturePath: "capture",
      requestSummaryPath: "summary",
      outcomePath: "outcome",
      requireCredential: false,
      onRequest: Effect.void,
      inspectRequest: () => Effect.void,
      extraDecisionKey: "not-portable"
    }
    const context = yield* makeResidentDispatchContextEffect(root, "consent", "activity", undefined, options).pipe(
      Effect.provide(provider)
    )
    const { onRequest: _onRequest, inspectRequest: _inspect, extraDecisionKey: _extra, ...portable } = options
    expect(context.controlled).toEqual(portable)
    expect(context.credential).toBeNull()
    const empty = yield* makeResidentDispatchContextEffect(root, "consent", "activity", undefined, {}).pipe(
      Effect.provide(provider)
    )
    expect(empty.controlled).toEqual({})
    expect(empty.credential).toBeNull()
    const required = yield* makeResidentDispatchContextEffect(root, "consent", "activity", undefined, {
      requireCredential: true
    }).pipe(Effect.provide(provider))
    expect(required.controlled).toEqual({ requireCredential: true })
    expect(required.credential?.environmentValue).toBeNull()
  })
)

it("preserves edit polling and rejection outcomes through bounded IPC", async () => {
  const directory = await mkdtemp(join(tmpdir(), "resident-edit-outcomes-"))
  directories.push(directory)
  await chmod(directory, 0o700)
  const paths = residentPaths(directory)
  let reply: { readonly status: string; readonly reason?: string } = { status: "empty" }
  const server = createServer((socket) => {
    sockets.push(socket)
    socket.once("data", () => socket.end(`${JSON.stringify({ version: 1, ...reply })}\n`))
  })
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(paths.socket, resolve)
  })
  await chmod(paths.socket, 0o600)
  const startup = Layer.succeed(
    ResidentStartup,
    ResidentStartup.of({
      now: Effect.sync(() => performance.now()),
      prepare: () => Effect.void,
      probe: () => Effect.succeed({ status: "ready", lifetime: "owner", pid: 1 }),
      launch: () => Effect.die("ready owner must not launch"),
      wait: (milliseconds) => Effect.sleep(milliseconds),
      clearDiagnostic: () => Effect.void,
      diagnostic: () => Effect.succeed("")
    })
  )
  const observation: DirectObservation = {
    root: "/fixture",
    rootIdentity: { rootDevice: "1", rootInode: "2", gitDirectory: "/fixture/.git", gitDevice: "1", gitInode: "3" },
    advicee: {
      host: "claude-code",
      hostVersion: "2.1.218",
      sessionId: "session",
      turnId: null,
      toolUseId: "tool",
      subagentId: null
    },
    candidates: []
  }
  const dispatch: import("./protocol.ts").ResidentDispatchContext = {
    statePath: "/fixture/consent",
    activityPath: "/fixture/activity",
    sessionAnalytics: false,
    userConfigPath: null,
    demoBudgetPath: null,
    credential: null,
    controlled: null
  }
  for (const status of [
    "pending",
    "empty",
    "unsupported",
    "rejected-capacity",
    "rejected-stale",
    "obsolete-lifetime",
    "unavailable"
  ]) {
    reply = status === "unavailable" ? { status, reason: "backend" } : { status }
    const result = await Effect.runPromise(
      admitAndCollectEffect(observation, dispatch, Number(process.hrtime.bigint()) / 1_000_000 + 1_000, paths).pipe(
        Effect.provide(startup)
      )
    )
    expect(result).toEqual(
      status === "pending" || status === "empty"
        ? { status }
        : status === "unavailable"
          ? { requestRoute: "edit", status, reason: "backend" }
          : { status: "unavailable", reason: "lost" }
    )
  }
})
