import { randomUUID } from "node:crypto"
import { constants, type Stats } from "node:fs"
import { lstat, mkdir, open, readdir, realpath, statfs, unlink, link } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { Effect } from "effect"
import { decodeInspectionRecordText, MAX_INSPECTION_RECORD_BYTES, type InspectionRecord } from "./contract.ts"
import { lockInspectionDirectory } from "./native-lock.ts"
import type { InspectionPersistence } from "./recorder.ts"

const RECORD_NAME = /^([a-f0-9]{64})-([0-9]{16})\.json$/
const MAX_FILES = 8192
export const inspectionAllocatedBytes = (stat: Stats): number => Math.max(stat.size, stat.blocks * 512)
const privateOwned = (stat: Stats): boolean =>
  typeof process.getuid === "function" &&
  stat.uid === process.getuid() &&
  (stat.mode & 0o077) === 0 &&
  !stat.isSymbolicLink()
const sameFile = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino
const recordName = (record: InspectionRecord): string =>
  `${record.source.id}-${String(record.sequence).padStart(16, "0")}.json`
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
    readonly beforeCommit?: () => Promise<void>
    readonly afterCommit?: () => Promise<void>
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
  const read = async (root: string, name: string): Promise<Stored> => {
    const match = RECORD_NAME.exec(name)
    if (!match) throw unavailable()
    const file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (!privateOwned(stat) || !stat.isFile() || stat.nlink !== 1 || stat.size > MAX_INSPECTION_RECORD_BYTES)
        throw unavailable()
      const encoded = await file.readFile({ encoding: "utf8" })
      const record = decodeInspectionRecordText(encoded)
      if (record.source.id !== match[1] || String(record.sequence).padStart(16, "0") !== match[2]) throw unavailable()
      return { name, record, encoded, bytes: inspectionAllocatedBytes(stat) }
    } finally {
      await file.close()
    }
  }
  const locked = async <A>(body: (root: string, rootStat: Stats) => Promise<A>): Promise<A> => {
    const { canonical, stat } = await prepare()
    const directoryHandle = await open(canonical, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try {
      const opened = await directoryHandle.stat()
      if (!privateOwned(opened) || !opened.isDirectory() || !sameFile(opened, stat)) throw unavailable()
      if (!lockInspectionDirectory(directoryHandle.fd)) throw unavailable()
      const current = await lstat(directory)
      if (!privateOwned(current) || !sameFile(current, opened)) throw unavailable()
      // Exclusive descriptor ownership survives async IO and is released by close or process exit.
      const names = await readdir(canonical)
      if (names.length > MAX_FILES) throw unavailable()
      for (const name of names) {
        if (!/^pending-[a-f0-9-]{36}$/.test(name)) continue
        const entry = await lstat(join(canonical, name))
        if (!privateOwned(entry) || !entry.isFile() || entry.nlink > 2 || entry.size > MAX_INSPECTION_RECORD_BYTES)
          throw unavailable()
        if (entry.nlink === 2) {
          // A surviving temporary link means publication never finished. Discard both
          // links conservatively, including a writer killed before its consent recheck.
          const pending = await open(join(canonical, name), constants.O_RDONLY | constants.O_NOFOLLOW)
          try {
            if (!sameFile(entry, await pending.stat())) throw unavailable()
            const record = decodeInspectionRecordText(await pending.readFile({ encoding: "utf8" }))
            const published = join(canonical, recordName(record))
            const linked = await lstat(published)
            if (!privateOwned(linked) || !sameFile(entry, linked)) throw unavailable()
            await unlink(published)
          } finally {
            await pending.close()
          }
        }
        await unlink(join(canonical, name))
      }
      return await body(canonical, await directoryHandle.stat())
    } finally {
      await directoryHandle.close()
    }
  }
  const inventory = async (root: string): Promise<Stored[]> => {
    const entries = await readdir(root)
    if (entries.length > MAX_FILES) throw unavailable()
    const records: Stored[] = []
    for (const name of entries) {
      // Unknown files are not deleted or interpreted as records, and prevent an unaccounted quota claim.
      records.push(await read(root, name))
    }
    return records.sort((a, b) => a.record.capturedAt - b.record.capturedAt || a.name.localeCompare(b.name))
  }
  const prune = async (root: string, records: Stored[], reserved: number, rootStat: Stats) => {
    let bytes = inspectionAllocatedBytes(rootStat) + records.reduce((sum, record) => sum + record.bytes, 0)
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
  const write: InspectionPersistence["write"] = (record, encoded, publication) =>
    Effect.tryPromise({
      try: (signal) =>
        locked(async (root, rootStat) => {
          if (signal.aborted || !publication.allowed()) return
          // Validate the bytes that will be published, rather than trusting a second mutable object.
          const captured = decodeInspectionRecordText(encoded)
          if (captured.source.id !== record.source.id || captured.sequence !== record.sequence) throw unavailable()
          if (clock() - captured.capturedAt >= limits.retentionMs) return
          const name = recordName(captured)
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
          await prune(root, records, reserved, rootStat)
          if (signal.aborted || !publication.allowed()) return
          const temporary = join(root, `pending-${randomUUID()}`)
          const file = await open(
            temporary,
            constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
            0o600
          )
          let fileClosed = false,
            linked = false,
            committed = false
          try {
            await file.writeFile(encoded, "utf8")
            const actual = await file.stat()
            const currentRoot = await lstat(root)
            const total =
              inspectionAllocatedBytes(currentRoot) +
              (await inventoryWithoutPending(root, temporary, read)).reduce((sum, entry) => sum + entry.bytes, 0) +
              inspectionAllocatedBytes(actual)
            await controls.beforePublication?.()
            if (total + block > limits.storageBytes || signal.aborted || !publication.allowed()) return
            // Hard-link publication is atomic and never overwrites an existing identity.
            await link(temporary, join(root, name))
            linked = true
            await controls.afterPublication?.()
            await file.close()
            fileClosed = true
            await controls.beforeCommit?.()
            // The immutable final object now exists and is readable. Commit is synchronous
            // against recorder consent; later cleanup cannot turn it into a new capture.
            committed = !signal.aborted && publication.commit()
            if (committed) await controls.afterCommit?.()
          } finally {
            if (!fileClosed) await file.close()
            // Keep the temporary marker if revocation fails, so recovery cannot expose it.
            if (linked && !committed) await unlink(join(root, name))
            await unlink(temporary)
          }
        }).finally(() => controls.settled?.()),
      catch: () => unavailable()
    })

  return {
    write,
    // A history read owns maintenance, independently of any resident lifetime.
    snapshot: () =>
      Effect.tryPromise({
        try: async () => {
          const exists = await lstat(directory).catch((error: unknown) => {
            if (missing(error)) return undefined
            throw error
          })
          if (!exists) return []
          return locked(async (root, rootStat) =>
            (await prune(root, await inventory(root), 0, rootStat)).map((entry) => entry.record)
          )
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
    if (join(root, name) === pending) continue
    records.push(await read(root, name))
  }
  return records
}
