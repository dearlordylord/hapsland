import { randomUUID } from "node:crypto"
import { constants, type Stats } from "node:fs"
import { lstat, mkdir, open, readdir, realpath, statfs, unlink, link } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { Effect } from "effect"
import {
  decodeInspectionRecordText,
  MAX_INSPECTION_RECORD_BYTES,
  decodeInspectionLossText,
  type InspectionLoss,
  type InspectionJournalSnapshot,
  type InspectionRecord
} from "./contract.ts"
import { lockInspectionDirectory } from "./native-lock.ts"
import type { InspectionPersistence } from "./recorder.ts"

const RECORD_NAME = /^([a-f0-9]{64})-([0-9]{16})\.json$/
const LOSS_NAME = /^([a-f0-9]{64})-([0-9]{16})\.loss$/
const MAX_FILES = 8192
const MAX_LOSSES = 128
export const inspectionAllocatedBytes = (stat: Stats): number => Math.max(stat.size, stat.blocks * 512)
const privateOwned = (stat: Stats): boolean =>
  typeof process.getuid === "function" &&
  stat.uid === process.getuid() &&
  (stat.mode & 0o077) === 0 &&
  !stat.isSymbolicLink()
const sameFile = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino
const fileMetadata = (stat: Stats): string =>
  [stat.dev, stat.ino, stat.mode, stat.uid, stat.nlink, stat.size, stat.blocks, stat.mtimeMs, stat.ctimeMs].join(":")
const unchangedPrivateFile = (stat: Stats, metadata: string): boolean =>
  privateOwned(stat) && stat.isFile() && fileMetadata(stat) === metadata
const recordName = (record: InspectionRecord): string =>
  `${record.source.id}-${String(record.sequence).padStart(16, "0")}.json`
const lossName = (loss: InspectionLoss): string => `${loss.sourceId}-${String(loss.sequence).padStart(16, "0")}.loss`
const unavailable = (): Error => new Error("inspection storage unavailable")
const missing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
type Stored = {
  readonly name: string
  readonly record: InspectionRecord
  readonly encoded: string
  readonly bytes: number
  readonly metadata: string
}

type StoredLoss = {
  readonly name: string
  readonly loss: InspectionLoss
  readonly bytes: number
  readonly metadata: string
}
type Inventory = { readonly records: Stored[]; readonly losses: StoredLoss[] }

/** A private journal shared by all producers. Lock contention loses optional capture; it never waits. */
export const makeInspectionStorage = (
  directory: string,
  limits: { readonly retentionMs: number; readonly storageBytes: number; readonly now?: () => number },
  controls: {
    /** Local IO barriers for the physical failure seam; never supplied by IPC or configuration. */
    readonly beforeAllocationCheck?: () => Promise<void>
    readonly beforePublication?: () => Promise<void>
    readonly afterPublication?: () => Promise<void>
    readonly beforeCommit?: () => Promise<void>
    readonly afterCommit?: () => Promise<void>
    readonly beforeLossPublication?: () => Promise<void>
    readonly afterLossPublication?: () => Promise<void>
    readonly settled?: () => void
  } = {}
): InspectionPersistence & { readonly snapshot: () => Effect.Effect<InspectionJournalSnapshot, unknown> } => {
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
    const file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!privateOwned(stat) || !stat.isFile() || stat.nlink !== 1 || stat.size > MAX_INSPECTION_RECORD_BYTES)
        throw unavailable()
      const encoded = await file.readFile({ encoding: "utf8" })
      const record = decodeInspectionRecordText(encoded)
      if (record.source.id !== match[1] || String(record.sequence).padStart(16, "0") !== match[2]) throw unavailable()
      return { name, record, encoded, bytes: inspectionAllocatedBytes(stat), metadata: fileMetadata(stat) }
    } finally {
      await file.close()
    }
  }
  const readLoss = async (root: string, name: string): Promise<StoredLoss> => {
    const match = LOSS_NAME.exec(name)
    if (!match) throw unavailable()
    const file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!privateOwned(stat) || !stat.isFile() || stat.nlink !== 1 || stat.size > 512) throw unavailable()
      const loss = decodeInspectionLossText(await file.readFile({ encoding: "utf8" }))
      if (loss.sourceId !== match[1] || String(loss.sequence).padStart(16, "0") !== match[2]) throw unavailable()
      return { name, loss, bytes: inspectionAllocatedBytes(stat), metadata: fileMetadata(stat) }
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
      if (names.length > MAX_FILES + 2) throw unavailable()
      for (const name of names) {
        const lossPending = /^pending-loss-[a-f0-9-]{36}$/.test(name)
        if (!lossPending && !/^pending-[a-f0-9-]{36}$/.test(name)) continue
        const entry = await lstat(join(canonical, name))
        if (!privateOwned(entry) || !entry.isFile() || entry.nlink > 2 || entry.size > MAX_INSPECTION_RECORD_BYTES)
          throw unavailable()
        if (entry.nlink === 2) {
          // A surviving temporary link means publication never finished. Discard both
          // links conservatively, including a writer killed before its consent recheck.
          const pending = await open(
            join(canonical, name),
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
          )
          try {
            if (!sameFile(entry, await pending.stat())) throw unavailable()
            const encoded = await pending.readFile({ encoding: "utf8" })
            const published = join(
              canonical,
              lossPending
                ? lossName(decodeInspectionLossText(encoded))
                : recordName(decodeInspectionRecordText(encoded))
            )
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
  const inventory = async (root: string): Promise<Inventory> => {
    const entries = await readdir(root)
    if (entries.length > MAX_FILES) throw unavailable()
    const records: Stored[] = [],
      losses: StoredLoss[] = []
    for (const name of entries) {
      // Unknown entries are never interpreted or deleted to recover quota.
      if (LOSS_NAME.test(name)) losses.push(await readLoss(root, name))
      else records.push(await read(root, name))
    }
    return {
      records: records.sort((a, b) => a.record.capturedAt - b.record.capturedAt || a.name.localeCompare(b.name)),
      losses: losses.sort((a, b) => a.loss.removedAt - b.loss.removedAt || a.name.localeCompare(b.name))
    }
  }
  const publishLoss = async (
    root: string,
    loss: InspectionLoss,
    total: number,
    reserved: number,
    block: number
  ): Promise<StoredLoss | undefined> => {
    const temporary = join(root, `pending-loss-${randomUUID()}`)
    const file = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600
    )
    try {
      await file.writeFile(JSON.stringify(loss), "utf8")
      const bytes = inspectionAllocatedBytes(await file.stat())
      if (total + bytes + reserved + block > limits.storageBytes) return undefined
      await controls.beforeLossPublication?.()
      await link(temporary, join(root, lossName(loss)))
      await controls.afterLossPublication?.()
    } finally {
      await file.close()
      await unlink(temporary)
    }
    // Linking and removing the temporary name changes ctime/link count.
    return await readLoss(root, lossName(loss))
  }
  const prune = async (root: string, current: Inventory, reserved: number, rootStat: Stats) => {
    const block = (await statfs(root)).bsize
    if (!Number.isSafeInteger(block) || block < 1) throw unavailable()
    const maxLosses = Math.min(MAX_LOSSES, Math.floor(limits.storageBytes / block / 8))
    const losses = [...current.losses]
    let rootBytes = inspectionAllocatedBytes(rootStat)
    let bytes = rootBytes + [...current.records, ...losses].reduce((sum, record) => sum + record.bytes, 0)
    const now = clock(),
      removed: InspectionLoss[] = [],
      retained: Stored[] = []
    const removeLoss = async () => {
      const oldest = losses.shift()!
      await unlink(join(root, oldest.name))
      bytes -= oldest.bytes
    }
    while (losses.length && (now - losses[0]!.loss.removedAt >= limits.retentionMs || losses.length > maxLosses))
      await removeLoss()
    const removeRecord = async (record: Stored, reason: InspectionLoss["reason"]) => {
      await unlink(join(root, record.name))
      bytes -= record.bytes
      removed.push({
        version: 1,
        sourceId: record.record.source.id,
        sequence: record.record.sequence,
        capturedAt: record.record.capturedAt,
        removedAt: now,
        reason
      })
    }
    for (const record of current.records) {
      if (now - record.record.capturedAt >= limits.retentionMs) await removeRecord(record, "expired")
      else retained.push(record)
    }
    const lossReservation = () => (removed.length && maxLosses ? block * 2 : 0)
    while (losses.length && bytes + reserved + lossReservation() > limits.storageBytes) await removeLoss()
    while (bytes + reserved + lossReservation() > limits.storageBytes && retained.length)
      await removeRecord(retained.shift()!, "capacity-evicted")
    if (bytes + reserved > limits.storageBytes) throw unavailable()
    // Markers follow successful unlink. A crash or refused marker loses knowledge, never invents a deletion.
    const chosen = removed.slice(-maxLosses)
    for (const loss of maxLosses ? chosen : []) {
      while (losses.length && (losses.length >= maxLosses || bytes + reserved + block * 2 > limits.storageBytes))
        await removeLoss()
      if (bytes + reserved + block * 2 > limits.storageBytes) continue
      const currentRoot = await lstat(root)
      if (!privateOwned(currentRoot) || !sameFile(currentRoot, rootStat)) throw unavailable()
      bytes += inspectionAllocatedBytes(currentRoot) - rootBytes
      rootBytes = inspectionAllocatedBytes(currentRoot)
      const published = await publishLoss(root, loss, bytes, reserved, block)
      if (published) {
        losses.push(published)
        bytes += published.bytes
      }
    }
    return { records: retained, losses }
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
          if (
            records.losses.some(
              (entry) => entry.loss.sourceId === captured.source.id && entry.loss.sequence === captured.sequence
            )
          )
            throw unavailable()
          const existing = records.records.find((entry) => entry.name === name)
          if (existing) {
            if (existing.encoded !== encoded) throw unavailable()
            return
          }
          const block = (await statfs(root)).bsize
          if (!Number.isSafeInteger(block) || block < 1) throw unavailable()
          // Reserve the payload and a conservative directory growth block before creating anything.
          const reserved = Math.ceil(Buffer.byteLength(encoded) / block) * block + block
          const retained = await prune(root, records, reserved, rootStat)
          if (retained.records.length + retained.losses.length + 2 > MAX_FILES) throw unavailable()
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
            await controls.beforeAllocationCheck?.()
            const currentRoot = await lstat(root)
            const total =
              inspectionAllocatedBytes(currentRoot) +
              (await allocatedInventoryBytes(root, temporary, [...retained.records, ...retained.losses])) +
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
          if (!exists) return { records: [], losses: [] }
          return locked(async (root, rootStat) => {
            const retained = await prune(root, await inventory(root), 0, rootStat)
            return {
              records: retained.records.map((entry) => entry.record),
              losses: retained.losses.map((entry) => entry.loss)
            }
          })
        },
        catch: () => unavailable()
      })
  }
}

/** Payloads were validated under this same exclusive lock. Recheck every
 * retained file's identity and mutation metadata before counting allocation;
 * changed or additional files fail closed instead of reusing stale evidence. */
const allocatedInventoryBytes = async (
  root: string,
  pending: string,
  retained: ReadonlyArray<Stored | StoredLoss>
): Promise<number> => {
  const names = await readdir(root)
  if (names.length > MAX_FILES) throw unavailable()
  const known = new Map(retained.map((entry) => [entry.name, entry]))
  let bytes = 0
  for (const name of names) {
    if (join(root, name) === pending) continue
    const entry = known.get(name)
    if (entry === undefined) throw unavailable()
    const stat = await lstat(join(root, name))
    if (!unchangedPrivateFile(stat, entry.metadata)) throw unavailable()
    bytes += inspectionAllocatedBytes(stat)
    known.delete(name)
  }
  if (known.size > 0) throw unavailable()
  return bytes
}
