import { createHash } from "node:crypto"
import { constants, openSync, closeSync, fstatSync, lstatSync, readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"

// Linux metadata reuse is scoped to this live process: no persisted evidence
// and no cross-boot/namespace reuse. Every call
// opens the current regular file and checks its descriptor and pathname again.
const digests = new Map()
const digestLimit = 8192
const stamp = (stat) => [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs, stat.ctimeNs].map(String).join(":")
export const fileEvidence = (root, path) => {
  const observed = lstatSync(path, { bigint: true })
  if (!observed.isFile()) throw new Error(`Compiler evidence must be a regular file: ${path}`)
  const identity = stamp(observed)
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = fstatSync(descriptor, { bigint: true })
    if (!before.isFile() || stamp(before) !== identity)
      throw new Error(`Compiler evidence changed before hashing: ${path}`)
    const key = `${before.dev}:${before.ino}`
    const cached = process.platform === "linux" ? digests.get(key) : undefined
    const sha256 =
      cached?.identity === identity
        ? cached.sha256
        : createHash("sha256").update(readFileSync(descriptor)).digest("hex")
    if (
      stamp(fstatSync(descriptor, { bigint: true })) !== identity ||
      stamp(lstatSync(path, { bigint: true })) !== identity
    )
      throw new Error(`Compiler evidence changed during hashing: ${path}`)
    if (process.platform === "linux" && cached?.identity !== identity) {
      if (!digests.has(key) && digests.size >= digestLimit) digests.delete(digests.keys().next().value)
      digests.set(key, { identity, sha256 })
    }
    return { path: relative(root, path).replaceAll("\\", "/"), mode: Number(before.mode) & 0o777, sha256 }
  } finally {
    closeSync(descriptor)
  }
}
export const fileInventory = (root, directory) =>
  readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Compiler output symlink is unsupported: ${path}`)
      return entry.isDirectory() ? fileInventory(root, path) : [fileEvidence(root, path)]
    })
export const compilerInputs = (text) =>
  text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("/"))
    .sort()
