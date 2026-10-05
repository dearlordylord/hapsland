import { randomUUID } from "node:crypto"
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

/** Replace an installer-owned file without exposing a partially written version. */
export const atomicInstallationFile = (path: string, content: string | undefined): void => {
  if (content === undefined) {
    rmSync(path, { force: true })
    return
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}
