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
import { lockInspectionDirectory, InspectionStorageBusy } from "./native-lock.ts"
import type { InspectionPersistence, InspectionPublication } from "./recorder.ts"

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

const assertOpenedDirectory = (opened: Stats, expected: Stats): void => {
  if (!privateOwned(opened) || !opened.isDirectory() || !sameFile(opened, expected)) throw unavailable()
}
const assertOwnedIdentity = (current: Stats, expected: Stats): void => {
  if (!privateOwned(current) || !sameFile(current, expected)) throw unavailable()
}
const assertIncomingIdentity = (captured: InspectionRecord, record: InspectionRecord): void => {
  if (captured.source.id !== record.source.id || captured.sequence !== record.sequence) throw unavailable()
}
const publicationAllowed = (signal: AbortSignal, publication: InspectionPublication): boolean =>
  !signal.aborted && publication.allowed()
const assertPendingFile = (entry: Stats): void => {
  if (!privateOwned(entry) || !entry.isFile() || entry.nlink > 2 || entry.size > MAX_INSPECTION_RECORD_BYTES)
    throw unavailable()
}
const inventoryNameRetained = (name: string, shared: boolean): boolean => {
  if (shared && /^pending-(?:loss-)?[a-f0-9-]{36}$/.test(name)) return false
  if (!LOSS_NAME.test(name) && !RECORD_NAME.test(name)) throw unavailable()
  return true
}
const assertInventoryFile = (name: string, stat: Stats): void => {
  if (
    !privateOwned(stat) ||
    !stat.isFile() ||
    stat.nlink < 1 ||
    stat.nlink > 2 ||
    stat.size > (LOSS_NAME.test(name) ? 512 : MAX_INSPECTION_RECORD_BYTES)
  )
    throw unavailable()
}
const assertPrivateRecordFile = (stat: Stats, maxBytes: number): void => {
  if (!privateOwned(stat) || !stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes) throw unavailable()
}
/** A private journal: writers own maintenance, readers never change the filesystem. */
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
    readonly payloadRead?: () => void
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
  const cached = new Map<string, Stored | StoredLoss>()
  let cachedDirectory: string | undefined
  const prepare = async (shared: boolean) => {
    if (!shared) await mkdir(directory, { recursive: true, mode: 0o700 })
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
      assertPrivateRecordFile(stat, MAX_INSPECTION_RECORD_BYTES)
      const encoded = await file.readFile({ encoding: "utf8" })
      controls.payloadRead?.()
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
      assertPrivateRecordFile(stat, 512)
      const loss = decodeInspectionLossText(await file.readFile({ encoding: "utf8" }))
      if (loss.sourceId !== match[1] || String(loss.sequence).padStart(16, "0") !== match[2]) throw unavailable()
      return { name, loss, bytes: inspectionAllocatedBytes(stat), metadata: fileMetadata(stat) }
    } finally {
      await file.close()
    }
  }
  const recoverUnfinishedPublication = async (root: string, name: string, entry: Stats, lossPending: boolean) => {
    const pending = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      if (!sameFile(entry, await pending.stat())) throw unavailable()
      const encoded = await pending.readFile({ encoding: "utf8" })
      const published = join(
        root,
        lossPending ? lossName(decodeInspectionLossText(encoded)) : recordName(decodeInspectionRecordText(encoded))
      )
      const linked = await lstat(published)
      if (!privateOwned(linked) || !sameFile(entry, linked)) throw unavailable()
      await unlink(published)
    } finally {
      await pending.close()
    }
  }
  const recoverPendingEntries = async (root: string, shared: boolean): Promise<void> => {
    const names = await readdir(root)
    if (names.length > MAX_FILES + 2) throw unavailable()
    for (const name of names) {
      const lossPending = /^pending-loss-[a-f0-9-]{36}$/.test(name)
      if (!lossPending && !/^pending-[a-f0-9-]{36}$/.test(name)) continue
      const entry = await lstat(join(root, name))
      assertPendingFile(entry)
      if (shared) continue
      if (entry.nlink === 2) {
        // A surviving temporary link means publication never finished. Discard both
        // links conservatively, including a writer killed before its consent recheck.
        await recoverUnfinishedPublication(root, name, entry, lossPending)
      }
      await unlink(join(root, name))
    }
  }
  const locked = async <A>(body: (root: string, rootStat: Stats) => Promise<A>, shared = false): Promise<A> => {
    const { canonical, stat } = await prepare(shared)
    const directoryHandle = await open(canonical, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try {
      const opened = await directoryHandle.stat()
      assertOpenedDirectory(opened, stat)
      if (!lockInspectionDirectory(directoryHandle.fd, shared)) throw new InspectionStorageBusy()
      const current = await lstat(directory)
      if (!privateOwned(current) || !sameFile(current, opened)) throw unavailable()
      const identity = `${opened.dev}:${opened.ino}`
      if (cachedDirectory !== identity) {
        cached.clear()
        cachedDirectory = identity
      }
      // Exclusive descriptor ownership survives async IO and is released by close or process exit.
      await recoverPendingEntries(canonical, shared)
      return await body(canonical, await directoryHandle.stat())
    } finally {
      await directoryHandle.close()
    }
  }
  const inventoryEntry = async (
    root: string,
    name: string,
    shared: boolean
  ): Promise<Stored | StoredLoss | undefined> => {
    if (!inventoryNameRetained(name, shared)) return undefined
    const stat = await lstat(join(root, name))
    assertInventoryFile(name, stat)
    if (shared && stat.nlink === 2) return undefined
    return await cachedInventoryEntry(root, name, stat)
  }
  const cachedInventoryEntry = async (root: string, name: string, stat: Stats): Promise<Stored | StoredLoss> => {
    let entry = cached.get(name)
    if (!entry || !unchangedPrivateFile(stat, entry.metadata)) {
      entry = LOSS_NAME.test(name) ? await readLoss(root, name) : await read(root, name)
      cached.set(name, entry)
    }
    return entry
  }
  const inventory = async (root: string, shared = false): Promise<Inventory> => {
    const entries = await readdir(root)
    if (entries.length > MAX_FILES) throw unavailable()
    const records: Stored[] = [],
      losses: StoredLoss[] = []
    const present = new Set(entries)
    for (const name of cached.keys()) if (!present.has(name)) cached.delete(name)
    for (const name of entries) {
      // Unknown entries fail closed; shared readers leave unfinished publications to writers.
      const entry = await inventoryEntry(root, name, shared)
      if (entry === undefined) continue
      if ("loss" in entry) losses.push(entry)
      else records.push(entry)
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
    const pruneExpiredLosses = async () => {
      while (losses.length && (now - losses[0]!.loss.removedAt >= limits.retentionMs || losses.length > maxLosses))
        await removeLoss()
    }
    await pruneExpiredLosses()
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
    const pruneExpiredRecords = async () => {
      for (const record of current.records) {
        if (now - record.record.capturedAt >= limits.retentionMs) await removeRecord(record, "expired")
        else retained.push(record)
      }
    }
    await pruneExpiredRecords()
    const lossReservation = () => (removed.length && maxLosses ? block * 2 : 0)
    const reclaimCapacity = async () => {
      while (losses.length && bytes + reserved + lossReservation() > limits.storageBytes) await removeLoss()
      while (bytes + reserved + lossReservation() > limits.storageBytes && retained.length)
        await removeRecord(retained.shift()!, "capacity-evicted")
      if (bytes + reserved > limits.storageBytes) throw unavailable()
    }
    await reclaimCapacity()
    // Markers follow successful unlink. A crash or refused marker loses knowledge, never invents a deletion.
    const publishRemovalMarker = async (loss: InspectionLoss) => {
      while (losses.length && (losses.length >= maxLosses || bytes + reserved + block * 2 > limits.storageBytes))
        await removeLoss()
      if (bytes + reserved + block * 2 > limits.storageBytes) return
      const currentRoot = await lstat(root)
      assertOwnedIdentity(currentRoot, rootStat)
      bytes += inspectionAllocatedBytes(currentRoot) - rootBytes
      rootBytes = inspectionAllocatedBytes(currentRoot)
      const published = await publishLoss(root, loss, bytes, reserved, block)
      if (published) {
        losses.push(published)
        bytes += published.bytes
      }
    }
    const publishRemovalMarkers = async () => {
      const chosen = removed.slice(-maxLosses)
      for (const loss of maxLosses ? chosen : []) {
        await publishRemovalMarker(loss)
      }
    }
    await publishRemovalMarkers()
    return { records: retained, losses }
  }
  const newRecordIdentity = (captured: InspectionRecord, encoded: string, current: Inventory): boolean => {
    if (
      current.losses.some(
        (entry) => entry.loss.sourceId === captured.source.id && entry.loss.sequence === captured.sequence
      )
    )
      throw unavailable()
    const existing = current.records.find((entry) => entry.name === recordName(captured))
    if (!existing) return true
    if (existing.encoded !== encoded) throw unavailable()
    return false
  }
  const allocationBlock = async (root: string): Promise<number> => {
    const block = (await statfs(root)).bsize
    if (!Number.isSafeInteger(block) || block < 1) throw unavailable()
    return block
  }
  const cleanupPublication = async (
    root: string,
    name: string,
    temporary: string,
    file: Awaited<ReturnType<typeof open>>,
    transaction: { readonly fileClosed: boolean; readonly linked: boolean; readonly committed: boolean }
  ): Promise<void> => {
    if (!transaction.fileClosed) await file.close()
    // Keep the temporary marker if revocation fails, so recovery cannot expose it.
    if (transaction.linked && !transaction.committed) await unlink(join(root, name))
    await unlink(temporary)
  }
  const publishRecord = async (
    root: string,
    name: string,
    encoded: string,
    retained: Inventory,
    block: number,
    signal: AbortSignal,
    publication: InspectionPublication
  ): Promise<boolean> => {
    const temporary = join(root, `pending-${randomUUID()}`)
    const file = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600
    )
    const transaction = { fileClosed: false, linked: false, committed: false }
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
      if (total + block > limits.storageBytes || !publicationAllowed(signal, publication)) return false
      // Hard-link publication is atomic and never overwrites an existing identity.
      await link(temporary, join(root, name))
      transaction.linked = true
      await controls.afterPublication?.()
      await file.close()
      transaction.fileClosed = true
      await controls.beforeCommit?.()
      // The immutable final object now exists and is readable. Commit is synchronous
      // against recorder consent; later cleanup cannot turn it into a new capture.
      transaction.committed = !signal.aborted && publication.commit()
      if (transaction.committed) await controls.afterCommit?.()
    } finally {
      await cleanupPublication(root, name, temporary, file, transaction)
    }
    return transaction.committed
  }
  const cacheCommittedRecord = async (root: string, name: string, captured: InspectionRecord, encoded: string) => {
    const final = await lstat(join(root, name))
    if (!privateOwned(final) || !final.isFile() || final.nlink !== 1) throw unavailable()
    cached.set(name, {
      name,
      record: captured,
      encoded,
      bytes: inspectionAllocatedBytes(final),
      metadata: fileMetadata(final)
    })
  }
  const write: InspectionPersistence["write"] = (record, encoded, publication) =>
    Effect.tryPromise({
      try: (signal) =>
        locked(async (root, rootStat) => {
          if (!publicationAllowed(signal, publication)) return
          // Validate the bytes that will be published, rather than trusting a second mutable object.
          const captured = decodeInspectionRecordText(encoded)
          assertIncomingIdentity(captured, record)
          if (clock() - captured.capturedAt >= limits.retentionMs) return
          const name = recordName(captured)
          const records = await inventory(root)
          if (!newRecordIdentity(captured, encoded, records)) return
          const block = await allocationBlock(root)
          // Reserve the payload and a conservative directory growth block before creating anything.
          const reserved = Math.ceil(Buffer.byteLength(encoded) / block) * block + block
          const retained = await prune(root, records, reserved, rootStat)
          if (retained.records.length + retained.losses.length + 2 > MAX_FILES) throw unavailable()
          if (!publicationAllowed(signal, publication)) return
          if (await publishRecord(root, name, encoded, retained, block, signal, publication))
            await cacheCommittedRecord(root, name, captured, encoded)
        }).finally(() => controls.settled?.()),
      catch: (error) => (error instanceof InspectionStorageBusy ? error : unavailable())
    })

  return {
    write,
    // Read-only history: expiry is filtered; physical cleanup belongs to writers.
    snapshot: () =>
      Effect.tryPromise({
        try: async () => {
          const exists = await lstat(directory).catch((error: unknown) => {
            if (missing(error)) return undefined
            throw error
          })
          if (!exists) return { records: [], losses: [] }
          return locked(async (root) => {
            const retained = await inventory(root, true)
            const now = clock()
            const expired = retained.records
              .filter((entry) => now - entry.record.capturedAt >= limits.retentionMs)
              .map((entry) => ({ sourceId: entry.record.source.id, sequence: entry.record.sequence }))
            return {
              ...(expired.length ? { expired } : {}),
              records: retained.records
                .filter((entry) => now - entry.record.capturedAt < limits.retentionMs)
                .map((entry) => structuredClone(entry.record)),
              losses: retained.losses
                .filter((entry) => now - entry.loss.removedAt < limits.retentionMs)
                .map((entry) => structuredClone(entry.loss))
            }
          }, true)
        },
        catch: (error) => (error instanceof InspectionStorageBusy ? error : unavailable())
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
