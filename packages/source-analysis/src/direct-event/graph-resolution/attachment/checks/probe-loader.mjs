import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"

const owner = join(import.meta.dirname, "..")
const temporary = mkdtempSync(join(tmpdir(), "hapsland-attachment-check-"))
process.once("exit", () => rmSync(temporary, { recursive: true, force: true }))
const loaded = new Map()

export async function loadProbe(name) {
  if (!/^[A-Za-z]+$/u.test(name)) throw new Error("Invalid attachment probe name")
  if (loaded.has(name)) return loaded.get(name)
  const output = join(temporary, name + ".mjs")
  execFileSync("bend", [join(owner, name + ".bend"), "-o", output], { timeout: 5000 })
  const module = (await import(pathToFileURL(output))).default
  loaded.set(name, module)
  return module
}

export function recordEvidence(name, record) {
  const directory = join(owner, "../../../../../../.test-runs/bend-migration/attachment")
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), JSON.stringify(record, null, 2) + "\n")
}
