import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { npmToolingRequire } from "./npm-tooling.mjs"

/** Inspect once without extracting, retaining text only for the audit's text owners. */
export async function archiveInventory(
  archive,
  { npmEntrypoint, timeoutMs = 30000, textLimit = 32 * 1024 * 1024 } = {}
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Archive inspection requires a finite deadline")
  const { Parser } = npmToolingRequire(npmEntrypoint)("tar")
  const records = new Map()
  return new Promise((resolve, reject) => {
    let settled = false,
      total = 0
    const input = createReadStream(archive)
    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      input.destroy()
      parser.abort(error)
      reject(error)
    }
    const parser = new Parser({
      strict: true,
      onReadEntry: (entry) => {
        const path = entry.path
        if (!path.startsWith("package/") || path.includes("..") || path.includes("\\"))
          return fail(new Error(`unsafe tarball path: ${path}`))
        if (records.has(path)) return fail(new Error("tarball has duplicate entries"))
        if (!["File", "OldFile", "ContiguousFile", "Directory"].includes(entry.type))
          return fail(new Error(`tarball has a non-regular entry: ${path}`))
        if (entry.size > 1024 * 1024 * 1024 || (total += entry.size) > 8 * 1024 * 1024 * 1024)
          return fail(new Error("tarball exceeds the inspection byte bound"))
        const record = { directory: entry.type === "Directory", mode: entry.mode }
        records.set(path, record)
        const retainText =
          /^(?:package\/(?:package(?:-runtime)?\.json|README\.md|bin\/launch\.sh)|package\/(?:dist\/.*\.js|docs\/.*\.md|src\/rules\/defaults\/.*\.json))$/.test(
            path
          )
        if (retainText && entry.size > textLimit)
          return fail(new Error(`tarball text exceeds the inspection byte bound: ${path}`))
        const digest = createHash("sha256"),
          chunks = []
        entry.on("data", (chunk) => {
          digest.update(chunk)
          if (retainText) chunks.push(chunk)
        })
        entry.on("end", () => {
          record.sha256 = digest.digest("hex")
          if (retainText) record.text = Buffer.concat(chunks)
        })
        entry.resume()
      }
    })
    const timer = setTimeout(() => fail(new Error("Archive inspection deadline exceeded")), timeoutMs)
    input.on("error", fail)
    parser.on("error", fail)
    parser.on("finish", () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(records)
    })
    input.pipe(parser)
  })
}
