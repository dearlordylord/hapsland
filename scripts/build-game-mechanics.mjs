import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const source = "prototypes/canonical-defense/DefenseMechanics.bend"
const modulePath = "prototypes/canonical-defense/lab/mechanics.generated.mjs"
const metadataPath = "prototypes/canonical-defense/lab/mechanics.generated.json"
const inputs = [
  source,
  "packages/monkey-business-bend/Numeric.bend",
  "prototypes/canonical-defense/lab/mechanics.generated.d.mts",
  "scripts/build-game-mechanics.mjs"
]
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`
const checked = (args) => {
  const result = spawnSync("bend", args, { cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stdout + result.stderr)
  return result.stdout
}
const compiler = checked(["--help"]).split("\n")[0]
const sourceHash = createHash("sha256").update(compiler)
for (const path of inputs) {
  const bytes = readFileSync(resolve(root, path))
  sourceHash.update(`${path}\0${bytes.length}\0`).update(bytes)
}
const temp = mkdtempSync(join(tmpdir(), "hapsland-game-mechanics-"))
try {
  const emittedPath = join(temp, "mechanics.mjs")
  checked([source, "-o", emittedPath])
  const emitted = readFileSync(emittedPath)
  const metadata =
    JSON.stringify(
      { format: 1, compiler, sourceIdentity: `sha256:${sourceHash.digest("hex")}`, moduleIdentity: digest(emitted) },
      null,
      2
    ) + "\n"
  if (process.argv.includes("--check")) {
    if (
      !readFileSync(resolve(root, modulePath)).equals(emitted) ||
      readFileSync(resolve(root, metadataPath), "utf8") !== metadata
    )
      throw new Error("Stale game mechanic module; run node scripts/build-game-mechanics.mjs")
  } else {
    writeFileSync(resolve(root, modulePath), emitted)
    writeFileSync(resolve(root, metadataPath), metadata)
  }
  console.log("game mechanic module and source identity are current")
} finally {
  rmSync(temp, { recursive: true, force: true })
}
