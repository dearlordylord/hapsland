import { createHash, randomBytes } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open, readFile, readlink, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const tuple = (stat) =>
  ["file", stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs, stat.ctimeNs].map(String).join(":")
const remaining = (deadline) => {
  if (!Number.isSafeInteger(deadline) || Date.now() >= deadline)
    throw new Error("Dependency identity deadline exceeded")
  return deadline - Date.now()
}
const digestPattern = /^[a-f0-9]{64}$/
export async function dependencyFilesystemNamespace() {
  // Other platforms keep descriptor-checked hashing until their filesystem
  // namespace has an equally concrete owner. No cross-machine metadata reuse.
  if (process.platform !== "linux") return undefined
  try {
    const [boot, mount] = await Promise.all([
      readFile("/proc/sys/kernel/random/boot_id", "utf8"),
      readlink("/proc/self/ns/mnt")
    ])
    return `${boot.trim()}:${mount}`
  } catch {
    return undefined
  }
}
export async function dependencyDigestMemo({
  directory,
  deadline,
  namespace,
  metrics = {},
  checkpointEveryFiles = 4096
}) {
  if (!Number.isSafeInteger(checkpointEveryFiles) || checkpointEveryFiles <= 0)
    throw new Error("Dependency memo checkpoint must have a finite positive file count")
  remaining(deadline)
  namespace ??= await dependencyFilesystemNamespace()
  const filename = namespace && join(directory, `${createHash("sha256").update(namespace).digest("hex")}.json`)
  let prior = new Map()
  if (filename) {
    try {
      const stat = await lstat(filename)
      if (!stat.isFile() || stat.size > 48 * 1024 * 1024) throw new Error("Invalid digest memo size")
      const record = JSON.parse(
        await readFile(filename, { encoding: "utf8", signal: AbortSignal.timeout(remaining(deadline)) })
      )
      if (record.version !== 1 || record.namespace !== namespace || !Array.isArray(record.files))
        throw new Error("Invalid digest memo")
      for (const entry of record.files) {
        if (
          !Array.isArray(entry) ||
          entry.length !== 3 ||
          typeof entry[0] !== "string" ||
          typeof entry[1] !== "string" ||
          !/^file:(?:\d+:){5}\d+$/.test(entry[1]) ||
          !digestPattern.test(entry[2])
        )
          throw new Error("Invalid digest memo entry")
      }
      prior = new Map(record.files.map(([path, observed, digest]) => [path, { observed, digest }]))
    } catch {
      remaining(deadline)
      // Metadata is only an optimization. A damaged/truncated memo is a miss.
    }
  }
  const current = new Map(),
    pending = new Map()
  let nextCheckpoint = checkpointEveryFiles,
    publication = Promise.resolve()
  const checkpoint = async () => {
    if (current.size < nextCheckpoint) return
    nextCheckpoint += checkpointEveryFiles
    await publish(false)
  }
  const digest = async (path, stat) => {
    remaining(deadline)
    const observed = tuple(stat)
    const cached = prior.get(path)
    if (cached?.observed === observed && tuple(await lstat(path, { bigint: true })) === observed) {
      metrics.hits = (metrics.hits ?? 0) + 1
      current.set(path, [path, observed, cached.digest])
      await checkpoint()
      return cached.digest
    }
    const key = `${path}\0${observed}`
    if (pending.has(key)) return pending.get(key)
    const work = (async () => {
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const before = await handle.stat({ bigint: true })
        if (!before.isFile() || tuple(before) !== observed) throw new Error("Dependency changed before hashing")
        const hash = createHash("sha256")
        for await (const chunk of handle.createReadStream({
          autoClose: false,
          signal: AbortSignal.timeout(remaining(deadline))
        })) {
          hash.update(chunk)
          metrics.bytesRead = (metrics.bytesRead ?? 0) + chunk.length
        }
        if (
          tuple(await handle.stat({ bigint: true })) !== observed ||
          tuple(await lstat(path, { bigint: true })) !== observed
        )
          throw new Error("Dependency changed during hashing")
        remaining(deadline)
        const value = hash.digest("hex")
        current.set(path, [path, observed, value])
        metrics.misses = (metrics.misses ?? 0) + 1
        await checkpoint()
        return value
      } finally {
        await handle.close()
      }
    })()
    pending.set(key, work)
    return work
  }
  const publishSnapshot = async (complete) => {
    remaining(deadline)
    if (!filename) return
    const temporary = `${filename}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
    try {
      await mkdir(directory, { recursive: true })
      const entries = complete
        ? new Map()
        : new Map([...prior].map(([path, { observed, digest }]) => [path, [path, observed, digest]]))
      for (const [path, entry] of current) entries.set(path, entry)
      const contents = JSON.stringify({
        version: 1,
        namespace,
        files: [...entries.values()].sort(([a], [b]) => a.localeCompare(b))
      })
      if (Buffer.byteLength(contents) > 48 * 1024 * 1024) return
      await writeFile(temporary, contents)
      remaining(deadline)
      await rename(temporary, filename)
    } catch {
      remaining(deadline)
      // Failed memo publication loses speed, never changes content identity.
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    remaining(deadline)
  }
  const publish = (complete = true) => {
    publication = publication.then(() => publishSnapshot(complete))
    return publication
  }
  return { digest, publish }
}
