import { randomUUID } from "node:crypto"
import { constants, type Stats } from "node:fs"
import { lstat, mkdir, open, readdir, realpath, statfs, unlink, link } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { Effect } from "effect"
import { decodeInspectionRecordText, MAX_INSPECTION_RECORD_BYTES, type InspectionRecord } from "./contract.ts"
import type { InspectionPersistence } from "./recorder.ts"

const RECORD_NAME = /^([a-f0-9]{64})-([0-9]{16})\.json$/
const MAX_FILES = 8192
const LOCK_NAME = "writer.lock"
export const inspectionAllocatedBytes = (stat: Stats): number => Math.max(stat.size, stat.blocks * 512)
const privateOwned = (stat: Stats): boolean =>
  typeof process.getuid === "function" &&
  stat.uid === process.getuid() &&
  (stat.mode & 0o077) === 0 &&
  !stat.isSymbolicLink()
const sameFile = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino
const unavailable = (): Error => new Error("inspection storage unavailable")
const missing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
type Stored = {
  readonly name: string
  readonly record: InspectionRecord
  readonly encoded: string
  readonly bytes: number
}

/** A private journal shared by all producers. Lock contention loses optional capture; it never waits. */
export const makeInspectionStorage = (
  directory: string,
  limits: { readonly retentionMs: number; readonly storageBytes: number; readonly now?: () => number },
  controls: {
    /** Local IO barriers for the physical failure seam; never supplied by IPC or configuration. */
    readonly beforePublication?: () => Promise<void>
    readonly afterPublication?: () => Promise<void>
    readonly settled?: () => void
  } = {}
): InspectionPersistence & { readonly snapshot: () => Effect.Effect<ReadonlyArray<InspectionRecord>, unknown> } => {
  if (
    !isAbsolute(directory) ||
    !Number.isSafeInteger(limits.retentionMs) ||
    limits.retentionMs < 1 ||
    !Number.isSafeInteger(limits.storageBytes) ||
    limits.storageBytes < 1
  )
    throw unavailable()
  const clock = limits.now ?? Date.now
  const prepare = async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const stat = await lstat(directory)
    if (!privateOwned(stat) || !stat.isDirectory()) throw unavailable()
    const canonical = await realpath(directory)
    if (canonical !== resolve(directory)) throw unavailable()
    return { canonical, stat }
  }
  const read = async (root: string, name: string, historical = false): Promise<Stored> => {
    const match = RECORD_NAME.exec(name)
    if (!match) throw unavailable()
    const file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (
        !privateOwned(stat) ||
        !stat.isFile() ||
        (stat.nlink !== 1 && !(historical && stat.nlink === 2)) ||
        stat.size > MAX_INSPECTION_RECORD_BYTES
      )
        throw unavailable()
      const encoded = await file.readFile({ encoding: "utf8" })
      const record = decodeInspectionRecordText(encoded)
      if (record.source.id !== match[1] || String(record.sequence).padStart(16, "0") !== match[2]) throw unavailable()
      return { name, record, encoded, bytes: inspectionAllocatedBytes(stat) }
    } finally {
      await file.close()
    }
  }
  const locked = async <A>(body: (root: string, rootStat: Stats, lockStat: Stats) => Promise<A>): Promise<A> => {
    const { canonical, stat } = await prepare()
    const lockPath = join(canonical, LOCK_NAME)
    // Exclusive creation also refuses a symlink, stale lock, or unrelated existing file.
    const lock = await open(
      lockPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600
    )
    await lock.writeFile(JSON.stringify({ version: 1, pid: process.pid }))
    const lockStat = await lock.stat()
    try {
      const current = await lstat(directory)
      if (!privateOwned(current) || !sameFile(current, stat)) throw unavailable()
      return await body(canonical, current, lockStat)
    } finally {
      await lock.close()
      const current = await lstat(lockPath).catch((error: unknown) => {
        if (missing(error)) return undefined
        throw error
      })
      if (current && sameFile(current, lockStat)) await unlink(lockPath)
    }
  }
  const inventory = async (root: string): Promise<Stored[]> => {
    const entries = await readdir(root)
    if (entries.length > MAX_FILES) throw unavailable()
    const records: Stored[] = []
    for (const name of entries) {
      if (name === LOCK_NAME) continue
      // Unknown files are not deleted or interpreted as records, and prevent an unaccounted quota claim.
      records.push(await read(root, name))
    }
    return records.sort((a, b) => a.record.capturedAt - b.record.capturedAt || a.name.localeCompare(b.name))
  }
  const prune = async (root: string, records: Stored[], reserved: number, rootStat: Stats, lockStat: Stats) => {
    let bytes =
      inspectionAllocatedBytes(rootStat) +
      inspectionAllocatedBytes(lockStat) +
      records.reduce((sum, record) => sum + record.bytes, 0)
    const retained: Stored[] = []
    const now = clock()
    for (const record of records) {
      if (now - record.record.capturedAt >= limits.retentionMs) {
        await unlink(join(root, record.name))
        bytes -= record.bytes
      } else retained.push(record)
    }
    while (bytes + reserved > limits.storageBytes && retained.length) {
      const record = retained.shift()!
      await unlink(join(root, record.name))
      bytes -= record.bytes
    }
    if (bytes + reserved > limits.storageBytes) throw unavailable()
    return retained
  }
  const write: InspectionPersistence["write"] = (record, encoded, allowed) =>
    Effect.tryPromise({
      try: (signal) =>
        locked(async (root, rootStat, lockStat) => {
          if (signal.aborted || !allowed()) return
          // Validate the bytes that will be published, rather than trusting a second mutable object.
          const captured = decodeInspectionRecordText(encoded)
          if (captured.source.id !== record.source.id || captured.sequence !== record.sequence) throw unavailable()
          if (clock() - captured.capturedAt >= limits.retentionMs) return
          const name = `${captured.source.id}-${String(captured.sequence).padStart(16, "0")}.json`
          const records = await inventory(root)
          const existing = records.find((entry) => entry.name === name)
          if (existing) {
            if (existing.encoded !== encoded) throw unavailable()
            return
          }
          const block = (await statfs(root)).bsize
          if (!Number.isSafeInteger(block) || block < 1) throw unavailable()
          // Reserve the payload and a conservative directory growth block before creating anything.
          const reserved = Math.ceil(Buffer.byteLength(encoded) / block) * block + block
          await prune(root, records, reserved, rootStat, lockStat)
          if (signal.aborted || !allowed()) return
          const temporary = join(root, `pending-${randomUUID()}`)
          const file = await open(
            temporary,
            constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
            0o600
          )
          try {
            await file.writeFile(encoded, "utf8")
            const actual = await file.stat()
            const currentRoot = await lstat(root)
            const total =
              inspectionAllocatedBytes(currentRoot) +
              inspectionAllocatedBytes(lockStat) +
              (await inventoryWithoutPending(root, temporary, read)).reduce((sum, entry) => sum + entry.bytes, 0) +
              inspectionAllocatedBytes(actual)
            await controls.beforePublication?.()
            if (total + block > limits.storageBytes || signal.aborted || !allowed()) return
            // Hard-link publication is atomic and never overwrites an existing identity.
            await link(temporary, join(root, name))
            await controls.afterPublication?.()
            // Readers refuse the live writer lock throughout publication. Revoke the new
            // link before releasing that lock if consent changed during native IO.
            if (signal.aborted || !allowed()) await unlink(join(root, name))
          } finally {
            await file.close()
            await unlink(temporary)
          }
        }).finally(() => controls.settled?.()),
      catch: () => unavailable()
    })
  const writableInProgress = async (root: string) => {
    const file = await open(join(root, LOCK_NAME), constants.O_RDONLY | constants.O_NOFOLLOW).catch(
      (error: unknown) => {
        if (missing(error)) return undefined
        throw error
      }
    )
    if (!file) return false
    try {
      const stat = await file.stat()
      if (!privateOwned(stat) || !stat.isFile() || stat.size > 128) throw unavailable()
      const value: unknown = JSON.parse(await file.readFile({ encoding: "utf8" }))
      if (
        typeof value !== "object" ||
        value === null ||
        !("version" in value) ||
        value.version !== 1 ||
        !("pid" in value) ||
        typeof value.pid !== "number" ||
        !Number.isSafeInteger(value.pid) ||
        value.pid < 1
      )
        throw unavailable()
      try {
        process.kill(value.pid, 0)
        return true
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH") return false
        throw unavailable()
      }
    } finally {
      await file.close()
    }
  }
  return {
    write,
    // Historical reads neither create nor clean the journal. A dead writer cannot prevent reading its retained records.
    snapshot: () =>
      Effect.tryPromise({
        try: async () => {
          const stat = await lstat(directory).catch((error: unknown) => {
            if (missing(error)) return undefined
            throw error
          })
          if (!stat) return []
          if (!privateOwned(stat) || !stat.isDirectory() || (await realpath(directory)) !== resolve(directory))
            throw unavailable()
          if (await writableInProgress(directory)) throw unavailable()
          const names = await readdir(directory)
          if (names.length > MAX_FILES) throw unavailable()
          const records: Stored[] = []
          for (const name of names) {
            if (!RECORD_NAME.test(name)) continue
            records.push(await read(directory, name, true))
          }
          if ((await writableInProgress(directory)) || !sameFile(stat, await lstat(directory))) throw unavailable()
          const now = clock()
          return records
            .filter((entry) => now - entry.record.capturedAt < limits.retentionMs)
            .sort((a, b) => a.record.capturedAt - b.record.capturedAt || a.name.localeCompare(b.name))
            .map((entry) => entry.record)
        },
        catch: () => unavailable()
      })
  }
}

const inventoryWithoutPending = async (
  root: string,
  pending: string,
  read: (root: string, name: string) => Promise<Stored>
): Promise<Stored[]> => {
  const names = await readdir(root)
  if (names.length > MAX_FILES) throw unavailable()
  const records: Stored[] = []
  for (const name of names) {
    if (name === LOCK_NAME || join(root, name) === pending) continue
    records.push(await read(root, name))
  }
  return records
}
