import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const source = "prototypes/canonical-defense/DefenseLab.bend"
const target = "prototypes/canonical-defense/lab/game.generated.mjs"
const manifest = "prototypes/canonical-defense/lab/game.generated.json"
const checked = (args) => {
  const result = spawnSync("bend", args, { cwd: root, encoding: "utf8", timeout: 55000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stdout + result.stderr)
  return result.stdout
}
const compiler = checked(["--help"]).split("\n")[0]
const dependencies = new Map()
function collect(path) {
  if (dependencies.has(path)) return
  const content = readFileSync(resolve(root, path))
  dependencies.set(path, content)
  for (const match of content.toString().matchAll(/^import (\.\S+\.bend)(?: as \w+)?$/gm))
    collect(relative(root, resolve(root, dirname(path), match[1])))
}
collect(source)
for (const path of ["scripts/build-game-lab.mjs", "prototypes/canonical-defense/lab/game.generated.d.mts"])
  dependencies.set(path, readFileSync(resolve(root, path)))
const hash = createHash("sha256").update(compiler)
for (const [path, content] of [...dependencies].sort(([a], [b]) => a.localeCompare(b)))
  hash.update(`${path}\0${content.length}\0`).update(content)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-game-lab-"))
try {
  const emittedPath = join(temporary, "game.mjs")
  checked([source, "-o", emittedPath])
  const emitted = readFileSync(emittedPath)
  const metadata =
    JSON.stringify(
      {
        format: 1,
        compiler,
        sourceIdentity: `sha256:${hash.digest("hex")}`,
        moduleIdentity: `sha256:${createHash("sha256").update(emitted).digest("hex")}`,
        sources: [...dependencies.keys()].sort()
      },
      null,
      2
    ) + "\n"
  if (process.argv.includes("--check")) {
    if (
      !readFileSync(resolve(root, target)).equals(emitted) ||
      readFileSync(resolve(root, manifest), "utf8") !== metadata
    )
      throw new Error("Stale headless game module; run node scripts/build-game-lab.mjs")
  } else {
    writeFileSync(resolve(root, target), emitted)
    writeFileSync(resolve(root, manifest), metadata)
  }
  console.log("headless game module and source identity are current")
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
