import { chmod, open, rename, symlink, unlink, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { join } from "node:path"
import type { Socket } from "node:net"
import { connectTestPort } from "../test-support/resident-port.ts"
import { once } from "node:events"
import { residentRequestEffect } from "../resident/client.ts"
import { Effect, Scope, Exit, ConfigProvider } from "effect"
import { expect, it } from "vitest"
import { inspectionSourceId, type InspectionRecord } from "./contract.ts"
import type { InspectionSource } from "./registry.ts"
import { MAX_INSPECTION_HTTP_BYTES, makeInspectionHttpServer } from "./http.ts"
import { makeInspectionStorage } from "./storage.ts"
import { acquireResidentFixture } from "../resident/runtime-fixture.ts"
import { residentPaths } from "../resident/paths.ts"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { nativeDeferred } from "../test-support/native-deferred.ts"
import { configuredRules, connectDefaultRuleFixture } from "../test-support/default-rules.ts"

it("discovers opted-in additional endpoints and isolates retained lifetimes through the public feed", async () => {
  const roots = [await makeGitFixture(), await makeGitFixture()]
  const history = makeInspectionStorage(join(roots[0]!, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
  const residents = []
  for (const root of roots) {
    await put(root, "type.ts", "type OrderCount = number\n")
    await writeFile(
      join(root, ".hapsland.jsonc"),
      JSON.stringify({ version: 1, rules: connectDefaultRuleFixture(root), sessionInspection: true })
    )
    const stored = nativeDeferred<void>()
    const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          history.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "evaluation-outcome") stored.resolve()
              })
            )
          )
      }
    })
    await Effect.runPromise(resident.listen())
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (!observation) throw new Error("missing observation")
    expect(
      (
        await Effect.runPromise(
          resident.admit(observation, {
            statePath: join(root, "consent"),
            userConfigPath: join(root, "absent-user"),
            credential: null,
            controlled: {
              answers: Object.fromEntries(
                configuredRules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0 }])
              )
            }
          })
        )
      ).status
    ).toBe("accepted")
    await stored.promise
    await Effect.runPromise(resident.whenIdle())
    residents.push(resident)
  }
  const first = residents[0]!,
    second = residents[1]!
  const scope = await Effect.runPromise(Scope.make())
  try {
    const server = await Effect.runPromise(
      makeInspectionHttpServer(history).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DIR: first.paths.directory }))
        ),
        Effect.provideService(Scope.Scope, scope)
      )
    )
    const snapshot = async () =>
      (await (await fetch(`${server.url}snapshot`)).json()) as {
        readonly records: InspectionRecord[]
        readonly sources: InspectionSource[]
        readonly discovery: unknown
      }
    const connected = await snapshot()
    expect(connected.discovery).toMatchObject({ mode: "registered-local-sources", known: 2, connected: 2, omitted: 0 })
    expect(connected.sources).toEqual(
      expect.arrayContaining(
        residents.map((resident) =>
          expect.objectContaining({
            source: expect.objectContaining({ endpoint: resident.paths.endpoint, lifetime: resident.lifetime }),
            registered: true,
            health: "connected"
          })
        )
      )
    )
    expect(
      connected.records.some((record: { fact: { kind: string } }) => record.fact.kind === "source-registration")
    ).toBe(true)
    for (const [path, original] of [
      [second.paths.directory, 0o700],
      [second.paths.owner, 0o600],
      [second.paths.endpoint, 0o600]
    ] as const) {
      try {
        await chmod(path, 0o777)
        const unsafe = await snapshot()
        expect(unsafe.sources.find((entry) => entry.source.lifetime === second.lifetime)?.health).toBe("unsafe")
        expect(unsafe.records).toEqual(connected.records)
      } finally {
        await chmod(path, original)
      }
    }
    const backup = `${second.paths.owner}.original`
    await rename(second.paths.owner, backup)
    try {
      await symlink(backup, second.paths.owner)
      const unsafe = await snapshot()
      expect(unsafe.sources.find((entry) => entry.source.lifetime === second.lifetime)?.health).toBe("unsafe")
    } finally {
      await unlink(second.paths.owner)
      await rename(backup, second.paths.owner)
    }
    await rename(second.paths.owner, backup)
    try {
      execFileSync("mkfifo", [second.paths.owner], { timeout: 5000 })
      const unsafe = await snapshot()
      expect(unsafe.sources.find((entry) => entry.source.lifetime === second.lifetime)?.health).toBe("unsafe")
    } finally {
      // Release a regressed blocking FIFO open before restoring this fixture's endpoint.
      const release = await open(second.paths.owner, constants.O_WRONLY | constants.O_NONBLOCK).catch(() => undefined)
      await release?.close()
      await unlink(second.paths.owner)
      await rename(backup, second.paths.owner)
    }
    await Effect.runPromise(second.close)
    const exited = await snapshot()
    expect(
      exited.sources.find((entry: { source: { lifetime: string } }) => entry.source.lifetime === second.lifetime)!
        .health
    ).toBe("disconnected")
    expect(exited.records).toEqual(connected.records)
    const replacement = await acquireResidentFixture(second.paths)
    await Effect.runPromise(replacement.listen())
    const replaced = await snapshot()
    expect(
      replaced.sources.find((entry: { source: { lifetime: string } }) => entry.source.lifetime === second.lifetime)
        ?.health
    ).toBe("replaced")
    expect(
      replaced.records.every(
        (record: { source: { lifetime: string } }) => record.source.lifetime !== replacement.lifetime
      )
    ).toBe(true)
    expect((await Effect.runPromise(replacement.stats())).queued).toBe(0)
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
}, 20000)

it("bounds registry metadata and reports omitted sources without accepting browser paths", async () => {
  const records: InspectionRecord[] = Array.from({ length: 130 }, (_, index) => {
    const endpoint = `/private/${"x".repeat(7800)}/${index}/endpoint.json`
    return {
      version: 1,
      source: { id: inspectionSourceId(endpoint, "bounded"), endpoint, lifetime: "bounded" },
      sequence: 1,
      capturedAt: index + 1,
      consentEpoch: 1,
      scope: { root: "/project", runtime: null, runtimeVersion: null, sessionId: null, subagentId: null },
      correlation: {},
      fact: { kind: "source-registration" }
    }
  })
  const root = await makeGitFixture()
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* makeInspectionHttpServer({
          snapshot: () => Effect.succeed({ records, losses: [] })
        }).pipe(
          Effect.provide(
            ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DIR: join(root, "missing") }))
          )
        )
        yield* Effect.promise(async () => {
          const response = await fetch(`${server.url}snapshot`)
          const bytes = await response.text()
          const body = JSON.parse(bytes)
          expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(MAX_INSPECTION_HTTP_BYTES)
          expect(Buffer.byteLength(JSON.stringify(body.sources))).toBeLessThanOrEqual(65536)
          expect(body.discovery.known).toBe(130)
          expect(body.discovery.omitted).toBe(130 - body.sources.length)
          expect(body.discovery.connected).toBe(0)
          expect(Buffer.byteLength(JSON.stringify(body.recording))).toBeLessThanOrEqual(32768)
          expect(body.sources.length).toBeLessThan(128)
          expect(body.truncated).toBe(true)
          expect(body.watermark.sources).toHaveLength(128)
          expect(body.watermark.omittedSources).toBe(2)
          expect(body.watermark.cursor.length).toBeLessThanOrEqual(6874)
          expect(body.replay.gaps).toEqual(
            expect.arrayContaining([{ reason: "source-limit" }, { reason: "view-limit" }])
          )
          const resumed = await fetch(`${server.url}snapshot`, { headers: { "last-event-id": body.watermark.cursor } })
          expect(resumed.status).toBe(200)
          expect(Buffer.byteLength(await resumed.text())).toBeLessThanOrEqual(MAX_INSPECTION_HTTP_BYTES)
          expect((await fetch(`${server.url}snapshot?endpoint=/untrusted/endpoint.json`)).status).toBe(404)
        })
      })
    )
  )
}, 10000)

it("isolates saturated read-only discovery sockets from hook-control capacity", async () => {
  const root = await makeGitFixture()
  const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")))
  const viewers: Socket[] = []
  try {
    await Effect.runPromise(resident.listen())
    for (let i = 0; i < 4; i += 1) {
      const socket = await connectTestPort(join(resident.paths.directory, "inspection.endpoint.json"))
      viewers.push(socket)
    }
    expect(
      await Effect.runPromise(residentRequestEffect(resident.paths, { requestRoute: "shared", operation: "hello" }))
    ).toMatchObject({ status: "ready", lifetime: resident.lifetime })
    const readonlyPaths = { ...resident.paths, endpoint: join(resident.paths.directory, "inspection.endpoint.json") }
    for (const socket of viewers) socket.destroy()
    await Promise.all(viewers.map((socket) => (socket.closed ? Promise.resolve() : once(socket, "close"))))
    expect(
      await Effect.runPromise(
        residentRequestEffect(readonlyPaths, {
          requestRoute: "shared",
          operation: "cleanup",
          lifetime: resident.lifetime
        })
      )
    ).toEqual({ status: "unsupported" })
    expect(
      await Effect.runPromise(residentRequestEffect(resident.paths, { requestRoute: "shared", operation: "hello" }))
    ).toMatchObject({ status: "ready" })
    const hooks: Socket[] = []
    try {
      for (let i = 0; i < 32; i += 1) {
        const socket = await connectTestPort(resident.paths.endpoint)
        hooks.push(socket)
      }
      expect(
        await Effect.runPromise(residentRequestEffect(readonlyPaths, { requestRoute: "shared", operation: "hello" }))
      ).toMatchObject({ status: "ready", lifetime: resident.lifetime })
    } finally {
      for (const socket of hooks) socket.destroy()
    }
  } finally {
    for (const socket of viewers) socket.destroy()
    await Effect.runPromise(resident.close)
  }
})

it("closes incomplete inspection frames despite continuous input", async () => {
  const root = await makeGitFixture()
  const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")))
  let socket: Socket | undefined
  let trickle: ReturnType<typeof setInterval> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    await Effect.runPromise(resident.listen())
    socket = await connectTestPort(join(resident.paths.directory, "inspection.endpoint.json"))
    const socketErrors: NodeJS.ErrnoException[] = []
    socket.on("error", (error) => socketErrors.push(error))
    // A trickled write can race the peer's deadline close. Require close itself,
    // and check its transport errors instead of rejecting Node's once(close).
    const closed = new Promise<void>((resolve) =>
      socket?.once("close", () => {
        clearInterval(trickle)
        resolve()
      })
    )
    trickle = setInterval(() => socket?.write(" "), 50)
    await Promise.race([
      closed,
      new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error("trickled inspection connection exceeded finite deadline")), 1000)
      })
    ])
    expect(socketErrors.every((error) => error.code === "EPIPE" || error.code === "ECONNRESET")).toBe(true)
    expect(
      await Effect.runPromise(residentRequestEffect(resident.paths, { requestRoute: "shared", operation: "hello" }))
    ).toMatchObject({ status: "ready" })
  } finally {
    clearInterval(trickle)
    clearTimeout(deadline)
    socket?.destroy()
    await Effect.runPromise(resident.close)
  }
})
