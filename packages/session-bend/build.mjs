import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
const root = dirname(fileURLToPath(import.meta.url))
const hash = (value) => createHash("sha256").update(value).digest("hex")
const sourceHash = hash(readFileSync(join(root, "Session.bend")))
const declarationHash = hash(readFileSync(join(root, "session.d.mts")))
const buildHash = hash(readFileSync(fileURLToPath(import.meta.url)))
if (process.argv.includes("--check")) {
  const manifest = JSON.parse(readFileSync(join(root, "generated.json"), "utf8"))
  if (
    manifest.declarationHash !== declarationHash ||
    manifest.sourceHash !== sourceHash ||
    manifest.buildHash !== buildHash ||
    manifest.moduleHash !== hash(readFileSync(join(root, "session.mjs")))
  )
    throw new Error("Stale shared Session artifact; run node packages/session-bend/build.mjs")
} else {
  const temp = mkdtempSync(join(tmpdir(), "hapsland-session-"))
  try {
    const run = spawnSync("bend", [join(root, "Session.bend"), "-o", join(temp, "session.mjs")], {
      encoding: "utf8",
      timeout: 5000
    })
    if (run.error || run.status !== 0) throw run.error ?? new Error(run.stdout + run.stderr)
    const module = readFileSync(join(temp, "session.mjs"))
    writeFileSync(join(root, "session.mjs"), module)
    writeFileSync(
      join(root, "generated.json"),
      JSON.stringify({ sourceHash, buildHash, declarationHash, moduleHash: hash(module) }, null, 2) + "\n"
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
