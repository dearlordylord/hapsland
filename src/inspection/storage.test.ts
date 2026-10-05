import {
  mkdtemp,
  readdir,
  lstat,
  writeFile,
  symlink,
  readFile,
  chmod,
  rm,
  statfs,
  realpath,
  open
} from "node:fs/promises"
import { constants } from "node:fs"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Scope, Exit } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { inspectionSourceId, type InspectionRecord } from "./contract.ts"
import { makeInspectionStorage, inspectionAllocatedBytes } from "./storage.ts"
import { nativeDeferred } from "../test-support/native-deferred.ts"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { makeInspectionHttpServer } from "./http.ts"
import { lockInspectionDirectory, InspectionStorageBusy } from "./native-lock.ts"
import { makeInspectionRecorder } from "./recorder.ts"
import { readInspectionSettings } from "./settings.ts"

it("retains an incoming edit after another inspector releases the real journal lock", async () => {
  const directory = await fixture()
  const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1048576, now: () => 100 })
  const ready = nativeDeferred<void>()
  const attempted = nativeDeferred<void>()
  const committed = nativeDeferred<void>()
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const recorder = yield* makeInspectionRecorder(
          { endpoint: "/retry/resident.sock", lifetime: "retry" },
          {
            write: (record, encoded, publication) =>
              store.write(record, encoded, publication).pipe(
                Effect.tapError(() => Effect.sync(() => attempted.resolve())),
                Effect.tap(() =>
                  Effect.sync(() => {
                    if (record.fact.kind === "recording-state") ready.resolve()
                    if (record.fact.kind === "edit-received") committed.resolve()
                  })
                )
              )
          },
          { now: () => 100 }
        )
        recorder.observeRecording("/project", true)
        yield* Effect.promise(() => ready.promise)
        let closed = false
        const handle = yield* Effect.acquireRelease(
          Effect.promise(() => open(directory, constants.O_RDONLY | constants.O_DIRECTORY)),
          (handle) => (closed ? Effect.void : Effect.promise(() => handle.close()))
        )
        expect(lockInspectionDirectory(handle.fd)).toBe(true)
        const edit = record(1)
        if (edit.fact.kind !== "edit-received") throw new Error("expected edit fixture")
        expect(recorder.offer(edit.scope, { receiptId: "after-contention" }, edit.fact)).toBe("queued")
        yield* Effect.promise(() => attempted.promise)
        yield* Effect.promise(() => handle.close())
        closed = true
        const saved = yield* Effect.promise(() =>
          Promise.race([
            committed.promise.then(() => true),
            new Promise<boolean>((resolve) => {
              const timer = setTimeout(() => resolve(false), 1000)
              timer.unref()
            })
          ])
        )
        expect(saved).toBe(true)
      })
    )
  )
  expect(
    (await Effect.runPromise(store.snapshot())).records.some(
      (entry) => entry.correlation.receiptId === "after-contention"
    )
  ).toBe(true)
})

it("sends existing history in the first SSE snapshot after transient contention without any new event", async () => {
  const directory = await fixture()
  const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1048576, now: () => 100 })
  await publish(store, record(1))
  let attempts = 0
  const scope = await Effect.runPromise(Scope.make())
  const controller = new AbortController()
  try {
    const server = await Effect.runPromise(
      makeInspectionHttpServer({
        snapshot: () =>
          Effect.suspend(() => (++attempts === 1 ? Effect.fail(new InspectionStorageBusy()) : store.snapshot()))
      }).pipe(Effect.provideService(Scope.Scope, scope))
    )
    const response = await fetch(`${server.url}events`, { signal: controller.signal })
    const reader = response.body!.getReader()
    let frame = ""
    while (!frame.includes("\n\n")) frame += new TextDecoder().decode((await reader.read()).value)
    const payload = frame.split("\n").find((line) => line.startsWith("data: "))!
    expect(JSON.parse(payload.slice(6))).toMatchObject({
      records: [expect.objectContaining({ fact: expect.objectContaining({ kind: "edit-received" }) })]
    })
    expect(attempts).toBeGreaterThan(1)
  } finally {
    controller.abort()
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "hapsland-inspection-"))
  directories.push(directory)
  return realpath(directory)
}
const record = (sequence: number, capturedAt = 100, lifetime = "first"): InspectionRecord => ({
  version: 1,
  source: { id: inspectionSourceId("/private/resident.sock", lifetime), endpoint: "/private/resident.sock", lifetime },
  sequence,
  capturedAt,
  consentEpoch: 1,
  scope: { root: "/project", runtime: "codex-cli", runtimeVersion: "0.155.1", sessionId: "session", subagentId: null },
  correlation: { receiptId: `receipt-${sequence}` },
  fact: { kind: "edit-received", candidates: [{ operation: "update", path: "日本語.ts" }] }
})
const publish = (store: ReturnType<typeof makeInspectionStorage>, value: InspectionRecord, allowed = () => true) =>
  Effect.runPromise(store.write(value, JSON.stringify(value), { allowed, commit: allowed }))

it("reads expired history and unfinished publications without changing any journal files", async () => {
  const directory = await fixture()
  let now = 100
  const store = makeInspectionStorage(directory, { retentionMs: 50, storageBytes: 1048576, now: () => now })
  await publish(store, record(1))
  const pending = "pending-00000000-0000-0000-0000-000000000000"
  await writeFile(join(directory, pending), JSON.stringify(record(2)), { mode: 0o600 })
  const names = (await readdir(directory)).sort()
  const contents = await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")))
  now = 150
  expect(await Effect.runPromise(store.snapshot())).toEqual({
    records: [],
    losses: [],
    expired: [{ sourceId: record(1).source.id, sequence: 1 }]
  })
  expect((await readdir(directory)).sort()).toEqual(names)
  expect(await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")))).toEqual(contents)
  await publish(store, record(3, 150))
  expect((await readdir(directory)).some((name) => name.startsWith("pending"))).toBe(false)
  expect((await Effect.runPromise(store.snapshot())).records.map((entry) => entry.sequence)).toEqual([3])
})

it("does not create a missing journal when reading history", async () => {
  const directory = join(await fixture(), "missing")
  const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1048576 })
  expect(await Effect.runPromise(store.snapshot())).toEqual({ records: [], losses: [] })
  await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" })
})

it("reuses immutable payloads while observing another writer and isolating returned snapshots", async () => {
  const directory = await fixture()
  const limits = { retentionMs: 1000, storageBytes: 1048576, now: () => 100 }
  let payloadReads = 0
  const first = makeInspectionStorage(directory, limits, {
    payloadRead: () => {
      payloadReads += 1
    }
  })
  const second = makeInspectionStorage(directory, limits)
  await publish(first, record(1))
  await publish(first, record(2))
  expect(payloadReads).toBe(0)
  await publish(second, record(3))
  await publish(first, record(4))
  expect(payloadReads).toBe(1)
  const snapshot = await Effect.runPromise(first.snapshot())
  Object.assign(snapshot.records[0]!.correlation, { receiptId: "mutated-view" })
  expect((await Effect.runPromise(first.snapshot())).records.map((entry) => entry.correlation.receiptId)).toEqual([
    "receipt-1",
    "receipt-2",
    "receipt-3",
    "receipt-4"
  ])
  expect(payloadReads).toBe(1)
  const changed = { ...record(1), correlation: { receiptId: "changed-on-disk" } }
  await writeFile(join(directory, `${changed.source.id}-0000000000000001.json`), JSON.stringify(changed))
  expect((await Effect.runPromise(first.snapshot())).records[0]!.correlation.receiptId).toBe("changed-on-disk")
  expect(payloadReads).toBe(2)
})

describe("private inspection journal", () => {
  it.each(["changed", "added", "removed", "permissions"] as const)(
    "refuses a %s file after quota inventory validation",
    async (change) => {
      const directory = await fixture()
      const limits = { retentionMs: 1000, storageBytes: 1048576, now: () => 100 }
      await publish(makeInspectionStorage(directory, limits), record(1))
      const existing = (await readdir(directory))[0]!
      let mutated = false
      const store = makeInspectionStorage(directory, limits, {
        beforeAllocationCheck: async () => {
          mutated = true
          if (change === "changed") {
            const value = record(1)
            await writeFile(
              join(directory, existing),
              JSON.stringify({ ...value, correlation: { receiptId: "changed-size" } })
            )
          } else if (change === "removed") {
            await rm(join(directory, existing))
          } else if (change === "permissions") {
            await chmod(join(directory, existing), 0o644)
          } else {
            const value = record(3)
            const name = `${value.source.id}-${String(value.sequence).padStart(16, "0")}.json`
            await writeFile(join(directory, name), JSON.stringify(value), { mode: 0o600 })
          }
        }
      })
      await expect(publish(store, record(2))).rejects.toThrow("inspection storage unavailable")
      expect(mutated).toBe(true)
      const names = await readdir(directory)
      expect(names.some((name) => name.endsWith("0000000000000002.json"))).toBe(false)
      expect(names.some((name) => name.startsWith("pending-"))).toBe(false)
      expect(names.includes(existing)).toBe(change !== "removed")
    }
  )
  it.each([
    { boundary: "beforeCommit", retained: 0 },
    { boundary: "afterCommit", retained: 1 }
  ])("orders disable against $boundary while filesystem cleanup is pending", async ({ boundary, retained }) => {
    const directory = await fixture()
    const scope = await Effect.runPromise(Scope.make())
    const entered = nativeDeferred<void>()
    const release = nativeDeferred<void>()
    const disabled = nativeDeferred<void>()
    let sourceWrite = false
    const history = makeInspectionStorage(
      directory,
      { retentionMs: 1000, storageBytes: 1048576, now: () => 100 },
      {
        [boundary]: async () => {
          if (!sourceWrite) return
          entered.resolve()
          await release.promise
        }
      }
    )
    try {
      const recorder = await Effect.runPromise(
        makeInspectionRecorder(
          { endpoint: "/private/resident.sock", lifetime: "first" },
          {
            write: (value, encoded, publication) =>
              Effect.suspend(() => {
                sourceWrite = value.fact.kind === "edit-received"
                return history.write(value, encoded, publication).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      if (value.fact.kind === "recording-state" && value.fact.state === "disabled") disabled.resolve()
                    })
                  )
                )
              })
          },
          { now: () => 100 }
        ).pipe(Effect.provideService(Scope.Scope, scope))
      )
      const value = record(1)
      if (value.fact.kind !== "edit-received") throw new Error("missing edit fixture")
      recorder.observeRecording(value.scope.root, true)
      expect(recorder.offer(value.scope, value.correlation, value.fact)).toBe("queued")
      await entered.promise
      recorder.observeRecording(value.scope.root, false)
      expect(recorder.offer(value.scope, { receiptId: "after-disable" }, value.fact)).toBe("disabled")
      release.resolve()
      await disabled.promise
      const { records } = await Effect.runPromise(history.snapshot())
      expect(records.filter((value) => value.fact.kind === "edit-received")).toHaveLength(retained)
      expect((await readdir(directory)).every((name) => name.endsWith(".json"))).toBe(true)
    } finally {
      release.resolve()
      await Effect.runPromise(Scope.close(scope, Exit.void))
    }
  })
  it.each([
    { boundary: "beforePublication", withdraw: false },
    { boundary: "afterPublication", withdraw: true },
    { boundary: "beforeCommit", withdraw: true }
  ])(
    "reads committed history after a writer dies at $boundary (withdraw=$withdraw)",
    async ({ boundary, withdraw }) => {
      const directory = await fixture()
      const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1024 * 1024, now: () => 100 })
      const first = record(1)
      await publish(store, first)
      const script = `
      import { Effect } from "effect";
      import { makeInspectionStorage } from ${JSON.stringify(new URL("./storage.ts", import.meta.url).href)};
      const value = JSON.parse(process.argv[2]);
      let allowed = true;
      const store = makeInspectionStorage(process.argv[1], { retentionMs: 1000, storageBytes: 1048576, now: () => 100 }, {
        [process.argv[3]]: async () => {
          process.stdin.on("data", () => { allowed = false; process.stdout.write("disabled\\n"); });
          process.stdin.resume(); process.stdout.write("ready\\n"); await new Promise(() => {});
        }
      });
      await Effect.runPromise(store.write(value, JSON.stringify(value), { allowed: () => allowed, commit: () => allowed }));
    `
      const child = spawn(
        process.execPath,
        ["--input-type=module", "--eval", script, directory, JSON.stringify(record(2)), boundary],
        { stdio: ["pipe", "pipe", "pipe"] }
      )
      const exited = once(child, "exit")
      const deadline = setTimeout(() => child.kill("SIGKILL"), 10000)
      const output = () =>
        Promise.race([
          once(child.stdout, "data"),
          exited.then(() => {
            throw new Error("inspection writer exited before its IO barrier")
          })
        ])
      try {
        await output()
        await expect(Effect.runPromise(store.snapshot())).rejects.toThrow("inspection storage unavailable")
        if (withdraw) {
          const disabled = output()
          child.stdin.write("disable\n")
          await disabled
        }
        child.kill("SIGKILL")
        await exited
        expect((await Effect.runPromise(store.snapshot())).records).toEqual([first])
        expect((await readdir(directory)).some((name) => name.startsWith("pending"))).toBe(true)
        await publish(store, record(3))
        expect((await readdir(directory)).some((name) => name.startsWith("pending"))).toBe(false)
        expect((await Effect.runPromise(store.snapshot())).records.map((entry) => entry.sequence)).toEqual([1, 3])
      } finally {
        clearTimeout(deadline)
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL")
          await exited
        }
      }
    }
  )
  it("revokes capture while real filesystem publication is pending", async () => {
    const directory = await fixture()
    const entered = nativeDeferred<void>()
    const release = nativeDeferred<void>()
    let allowed = true
    const store = makeInspectionStorage(
      directory,
      { retentionMs: 1000, storageBytes: 1024 * 1024, now: () => 100 },
      {
        afterPublication: async () => {
          entered.resolve()
          await release.promise
        }
      }
    )
    const writing = publish(store, record(1), () => allowed)
    await entered.promise
    await expect(Effect.runPromise(store.snapshot())).rejects.toThrow("inspection storage unavailable")
    allowed = false
    release.resolve()
    await writing
    expect((await Effect.runPromise(store.snapshot())).records).toEqual([])
    expect(await readdir(directory)).toEqual([])
  })
  it("aborts publication on interruption and observes eventual native IO cleanup", async () => {
    const directory = await fixture()
    const entered = nativeDeferred<void>()
    const release = nativeDeferred<void>()
    const settled = nativeDeferred<void>()
    const store = makeInspectionStorage(
      directory,
      { retentionMs: 1000, storageBytes: 1024 * 1024, now: () => 100 },
      {
        beforePublication: async () => {
          entered.resolve()
          await release.promise
        },
        settled: () => settled.resolve()
      }
    )
    const controller = new AbortController()
    const value = record(1)
    const writing = Effect.runPromiseExit(
      store.write(value, JSON.stringify(value), { allowed: () => true, commit: () => true }),
      { signal: controller.signal }
    )
    await entered.promise
    controller.abort()
    await writing
    // Node IO cannot be cancelled; the bounded in-flight operation cleans up after it settles.
    release.resolve()
    await settled.promise
    expect((await Effect.runPromise(store.snapshot())).records).toEqual([])
    expect(await readdir(directory)).toEqual([])
  })
  it("retains exact immutable records across producer lifetimes and refuses conflicting identities", async () => {
    const directory = await fixture()
    const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1024 * 1024, now: () => 100 })
    const first = record(1)
    const second = record(1, 100, "second")
    await publish(store, first)
    await publish(store, second)
    await publish(store, first)
    expect((await Effect.runPromise(store.snapshot())).records).toEqual(expect.arrayContaining([first, second]))
    await expect(publish(store, { ...first, correlation: { receiptId: "different" } })).rejects.toThrow(
      "inspection storage unavailable"
    )
    for (const name of await readdir(directory)) {
      const stat = await lstat(join(directory, name))
      expect(stat.mode & 0o077).toBe(0)
      expect(stat.uid).toBe(process.getuid!())
    }
  })
  it("prunes by captured age at the exact boundary rather than write time", async () => {
    const directory = await fixture()
    let now = 100
    const store = makeInspectionStorage(directory, { retentionMs: 50, storageBytes: 1024 * 1024, now: () => now })
    await publish(store, record(1, 51))
    await publish(store, record(2, 100))
    now = 101
    expect((await Effect.runPromise(store.snapshot())).records.map((entry) => entry.sequence)).toEqual([2])
    expect((await readdir(directory)).filter((name) => name.endsWith(".json"))).toHaveLength(2)
    await publish(store, record(3, 101))
    const pruned = await Effect.runPromise(store.snapshot())
    expect(pruned.losses).toEqual([
      { version: 1, sourceId: record(1).source.id, sequence: 1, capturedAt: 51, removedAt: 101, reason: "expired" }
    ])
    expect((await Effect.runPromise(store.snapshot())).records.map((entry) => entry.sequence)).toEqual([2, 3])
    expect((await readdir(directory)).filter((name) => name.endsWith(".json"))).toHaveLength(2)
    await publish(store, record(4, 51))
    expect((await Effect.runPromise(store.snapshot())).records.map((entry) => entry.sequence)).toEqual([2, 3])
    now = 151
    await publish(store, record(5, 151))
    const later = await Effect.runPromise(store.snapshot())
    expect(later.records.map((entry) => entry.sequence)).toEqual([5])
    expect(later.losses.map((entry) => entry.sequence)).toEqual([2, 3])
  })
  it("applies one allocated-storage cap across source lifetimes, evicting oldest records", async () => {
    const directory = await fixture()
    const block = (await statfs(directory)).bsize
    const cap = inspectionAllocatedBytes(await lstat(directory)) + block * 4
    const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: cap, now: () => 110 })
    for (let sequence = 1; sequence <= 8; sequence++)
      await publish(store, record(sequence, 100 + sequence, sequence % 2 ? "first" : "second"))
    const { records: retained } = await Effect.runPromise(store.snapshot())
    expect(retained.length).toBeGreaterThan(0)
    expect(retained.length).toBeLessThan(8)
    expect(retained.at(-1)?.sequence).toBe(8)
    let allocated = inspectionAllocatedBytes(await lstat(directory))
    for (const name of await readdir(directory))
      allocated += inspectionAllocatedBytes(await lstat(join(directory, name)))
    expect(allocated).toBeLessThanOrEqual(cap)
  })
  it("shares the default 128 MiB allocated cap across contending project writers and maintenance", async () => {
    const directory = await fixture()
    const settings = readInspectionSettings(directory, join(directory, "absent-user"))
    expect(settings).toMatchObject({ retentionMs: 7 * 86400000, storageBytes: 128 * 1048576 })
    if (!settings) throw new Error("missing default inspection limits")
    const limits = { ...settings, now: () => 2000 }
    const paddedRecord = (value: InspectionRecord) => {
      const encoded = JSON.stringify(value)
      return encoded + " ".repeat(128 * 1024 - Buffer.byteLength(encoded))
    }
    // Existing immutable history is fixture setup. Padding keeps each valid JSON
    // record at the real per-record byte limit without fabricating a UI producer.
    const seeded = Array.from({ length: 1023 }, (_, index) => {
      const value = record(index + 1, 100 + index, index % 2 ? "second" : "first")
      return { ...value, scope: { ...value.scope, root: index % 2 ? "/project-b" : "/project-a" } }
    })
    for (let start = 0; start < seeded.length; start += 32) {
      await Promise.all(
        seeded.slice(start, start + 32).map((value) => {
          const encoded = paddedRecord(value)
          return writeFile(
            join(directory, `${value.source.id}-${String(value.sequence).padStart(16, "0")}.json`),
            encoded,
            { mode: 0o600 }
          )
        })
      )
    }
    const allocated = async () => {
      let total = inspectionAllocatedBytes(await lstat(directory))
      for (const name of await readdir(directory)) total += inspectionAllocatedBytes(await lstat(join(directory, name)))
      return total
    }
    // Filesystem allocation can exceed the padded logical record size. Trim
    // fixture setup using measured allocation, leaving less than one full record
    // of free quota so actual publications must exercise capacity eviction.
    while ((await allocated()) > settings.storageBytes) {
      const value = seeded.pop()
      if (!value) throw new Error("fixture cannot fit the default storage cap")
      await rm(join(directory, `${value.source.id}-${String(value.sequence).padStart(16, "0")}.json`))
    }
    expect(await allocated()).toBeGreaterThan(settings.storageBytes - 256 * 1024)
    expect(await allocated()).toBeLessThanOrEqual(settings.storageBytes)
    const entered = nativeDeferred<void>()
    const release = nativeDeferred<void>()
    const first = makeInspectionStorage(directory, limits, {
      beforePublication: async () => {
        expect(await allocated()).toBeLessThanOrEqual(settings.storageBytes)
        entered.resolve()
        await release.promise
      }
    })
    const second = makeInspectionStorage(directory, limits)
    const next = { ...record(1024, 1500), scope: { ...record(1024).scope, root: "/project-a" } }
    const writing = Effect.runPromise(
      first.write(next, paddedRecord(next), { allowed: () => true, commit: () => true })
    )
    await Promise.race([
      entered.promise,
      writing.then(() => {
        throw new Error("writer settled without reaching publication")
      })
    ])
    try {
      await expect(publish(second, record(1025, 1600, "second"))).rejects.toThrow("inspection storage unavailable")
      await expect(Effect.runPromise(second.snapshot())).rejects.toThrow("inspection storage unavailable")
    } finally {
      release.resolve()
      await writing
    }
    const final = { ...record(1025, 1600, "second"), scope: { ...record(1025).scope, root: "/project-b" } }
    await Effect.runPromise(second.write(final, paddedRecord(final), { allowed: () => true, commit: () => true }))
    const retained = await Effect.runPromise(second.snapshot())
    expect(retained.records.map((value) => value.sequence)).toContain(1024)
    expect(retained.records.map((value) => value.sequence)).toContain(1025)
    expect(retained.records.map((value) => value.sequence)).not.toContain(1)
    const remainingSeed = retained.records.filter((value) => value.sequence <= seeded.length)
    expect(remainingSeed.length).toBeGreaterThan(0)
    expect(remainingSeed.map((value) => value.sequence)).toEqual(
      seeded.slice(remainingSeed[0]!.sequence - 1).map((value) => value.sequence)
    )
    // Loss markers also share the quota: later admission can evict an older
    // marker, but every surviving marker must identify a genuinely removed seed.
    expect(retained.losses.length).toBeGreaterThan(0)
    for (const loss of retained.losses) {
      expect(loss.reason).toBe("capacity-evicted")
      expect(loss.sequence).toBeLessThan(remainingSeed[0]!.sequence)
      expect(loss.sourceId).toBe(seeded[loss.sequence - 1]!.source.id)
    }
    expect(new Set(retained.records.map((value) => value.scope.root))).toEqual(new Set(["/project-a", "/project-b"]))
    expect(await allocated()).toBeLessThanOrEqual(settings.storageBytes)
  }, 60000)

  it("retains exact capacity-loss identities across readers within the allocated cap", async () => {
    const directory = await fixture()
    const block = (await statfs(directory)).bsize
    const cap = inspectionAllocatedBytes(await lstat(directory)) + block * 16
    const peaks: number[] = []
    const observeAllocation = async () => {
      let bytes = inspectionAllocatedBytes(await lstat(directory))
      for (const name of await readdir(directory)) bytes += inspectionAllocatedBytes(await lstat(join(directory, name)))
      peaks.push(bytes)
    }
    const store = makeInspectionStorage(
      directory,
      { retentionMs: 1000, storageBytes: cap, now: () => 150 },
      { beforePublication: observeAllocation, beforeLossPublication: observeAllocation }
    )
    let loss: import("./contract.ts").InspectionLoss | undefined
    for (let sequence = 1; sequence <= 32 && !loss; sequence++) {
      await publish(store, record(sequence, 100 + sequence))
      loss = (await Effect.runPromise(store.snapshot())).losses.find((entry) => entry.reason === "capacity-evicted")
    }
    expect(loss).toBeDefined()
    if (!loss) throw new Error("missing capacity-loss witness")
    const reader = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: cap, now: () => 150 })
    await expect(publish(reader, record(loss.sequence, loss.capturedAt))).rejects.toThrow(
      "inspection storage unavailable"
    )
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* makeInspectionHttpServer(reader)
          yield* Effect.promise(async () => {
            const body = (await (await fetch(`${server.url}snapshot`)).json()) as {
              losses: import("./contract.ts").InspectionLoss[]
            }
            expect(body.losses).toContainEqual(loss)
            expect(await (await fetch(`${server.url}payload/${loss.sourceId}/${loss.sequence}`)).json()).toMatchObject({
              status: "missing",
              reason: "capacity-evicted"
            })
          })
        })
      )
    )
    let allocated = inspectionAllocatedBytes(await lstat(directory))
    for (const name of await readdir(directory))
      allocated += inspectionAllocatedBytes(await lstat(join(directory, name)))
    expect(allocated).toBeLessThanOrEqual(cap)
    expect(Math.max(...peaks)).toBeLessThanOrEqual(cap)
    expect((await readdir(directory)).filter((name) => name.endsWith(".loss")).length).toBeLessThanOrEqual(128)
  })

  it.each(["beforeLossPublication", "afterLossPublication"] as const)(
    "recovers $0 marker publication after producer death without inventing loss knowledge",
    async (boundary) => {
      const directory = await fixture()
      const script = `
      import { Effect } from "effect";
      import { makeInspectionStorage } from ${JSON.stringify(new URL("./storage.ts", import.meta.url).href)};
      let now = 100;
      const store = makeInspectionStorage(process.argv[1], { retentionMs: 50, storageBytes: 1048576, now: () => now }, {
        ${boundary}: () => { process.stdout.write("pending-loss\\n"); return new Promise(() => {}); }
      });
      for (const record of ${JSON.stringify([record(1, 51), record(2, 100)])})
        await Effect.runPromise(store.write(record, JSON.stringify(record), { allowed: () => true, commit: () => true }));
      now = 101;
      const next = ${JSON.stringify(record(3, 101))};
      await Effect.runPromise(store.write(next, JSON.stringify(next), { allowed: () => true, commit: () => true }));
    `
      const child = spawn(process.execPath, ["--input-type=module", "-e", script, directory], {
        stdio: ["ignore", "pipe", "pipe"]
      })
      const exited = once(child, "exit")
      const ready = nativeDeferred<void>()
      child.stdout.on("data", () => ready.resolve())
      let error = ""
      child.stderr.on("data", (chunk) => {
        error += chunk.toString()
      })
      const deadline = setTimeout(() => child.kill("SIGKILL"), 5000)
      try {
        await Promise.race([
          ready.promise,
          exited.then(() => {
            throw new Error("marker producer exited before its barrier: " + error)
          })
        ])
        child.kill("SIGKILL")
        await exited
        const store = makeInspectionStorage(directory, { retentionMs: 50, storageBytes: 1048576, now: () => 101 })
        const snapshot = await Effect.runPromise(store.snapshot())
        expect(snapshot.records.map((entry) => entry.sequence)).toEqual([2])
        expect(snapshot.losses).toEqual([])
        expect((await readdir(directory)).some((name) => name.startsWith("pending"))).toBe(true)
        await publish(store, record(4, 101))
        expect((await readdir(directory)).some((name) => name.startsWith("pending"))).toBe(false)
      } finally {
        clearTimeout(deadline)
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL")
          await exited
        }
      }
    }
  )

  it("does not publish when consent is withdrawn during the write", async () => {
    const directory = await fixture()
    const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1024 * 1024, now: () => 100 })
    let checks = 0
    await publish(store, record(1), () => ++checks < 3)
    expect((await Effect.runPromise(store.snapshot())).records).toEqual([])
    expect(await readdir(directory)).toEqual([])
  })
  it("refuses competing readers and writers without waiting, then releases ownership", async () => {
    const directory = await fixture()
    const entered = nativeDeferred<void>()
    const release = nativeDeferred<void>()
    const limits = { retentionMs: 1000, storageBytes: 1048576, now: () => 100 }
    const first = makeInspectionStorage(directory, limits, {
      beforePublication: async () => {
        entered.resolve()
        await release.promise
      }
    })
    const second = makeInspectionStorage(directory, limits)
    const writing = publish(first, record(1))
    await entered.promise
    try {
      await expect(publish(second, record(2))).rejects.toThrow("inspection storage unavailable")
      await expect(Effect.runPromise(second.snapshot())).rejects.toThrow("inspection storage unavailable")
    } finally {
      release.resolve()
      await writing
    }
    await publish(second, record(2))
    expect((await Effect.runPromise(second.snapshot())).records.map((entry) => entry.sequence)).toEqual([1, 2])
    expect((await readdir(directory)).every((name) => name.endsWith(".json"))).toBe(true)
  })
  it("refuses symlinks and unrelated entries without reading or deleting their targets", async () => {
    const directory = await fixture()
    const external = await fixture()
    const target = join(external, "private.txt")
    await writeFile(target, "unrelated source", { mode: 0o600 })
    const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1024 * 1024, now: () => 100 })
    await symlink(target, join(directory, "foreign"))
    await expect(publish(store, record(1))).rejects.toThrow("inspection storage unavailable")
    expect(await readFile(target, "utf8")).toBe("unrelated source")
    expect(await readdir(directory)).toEqual(["foreign"])
    const alias = join(external, "alias")
    await symlink(directory, alias)
    await expect(
      publish(makeInspectionStorage(alias, { retentionMs: 1000, storageBytes: 1024 * 1024 }), record(1))
    ).rejects.toThrow("inspection storage unavailable")
  })
  it.each(["json", "loss"] as const)(
    "refuses a private FIFO with a recognized $0 identity without blocking or deleting it",
    async (extension) => {
      const directory = await fixture()
      const first = record(1)
      const fifo = join(directory, `${first.source.id}-0000000000000001.${extension}`)
      execFileSync("mkfifo", ["-m", "600", fifo])
      const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1048576, now: () => 100 })
      const reading = Effect.runPromise(store.snapshot())
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("FIFO read did not fail promptly")), 2000)
        })
        await expect(Promise.race([reading, deadline])).rejects.toThrow("inspection storage unavailable")
        expect((await lstat(fifo)).isFIFO()).toBe(true)
      } finally {
        if (timer) clearTimeout(timer)
        const release = await open(fifo, constants.O_WRONLY | constants.O_NONBLOCK).catch(() => undefined)
        await release?.close()
        await reading.catch(() => {})
      }
    }
  )

  it("refuses public directories and caps smaller than the journal overhead", async () => {
    const directory = await fixture()
    const store = makeInspectionStorage(directory, { retentionMs: 1000, storageBytes: 1, now: () => 100 })
    await expect(publish(store, record(1))).rejects.toThrow("inspection storage unavailable")
    expect(await readdir(directory)).toEqual([])
    await chmod(directory, 0o755)
    await expect(Effect.runPromise(store.snapshot())).rejects.toThrow("inspection storage unavailable")
  })
})
