import { mkdirSync, writeFileSync, renameSync, rmSync, unlinkSync } from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import { isNodeError } from "./file-snapshots.ts"

export const atomicWrite = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export const atomicRemove = (path: string) => {
  try {
    unlinkSync(path)
  } catch (cause) {
    if (!isNodeError(cause, "ENOENT")) throw cause
  }
}
