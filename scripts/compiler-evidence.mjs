import { createHash } from "node:crypto"
import { lstatSync, readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"

export const fileEvidence = (root, path) => {
  const stat = lstatSync(path)
  if (!stat.isFile()) throw new Error(`Compiler evidence must be a regular file: ${path}`)
  return {
    path: relative(root, path).replaceAll("\\", "/"),
    mode: stat.mode & 0o777,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex")
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
