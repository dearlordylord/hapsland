import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
const root = resolve(import.meta.dirname, "..")
execFileSync(
  process.execPath,
  [resolve(root, "prototypes/bend-strangler/generate-preparation-replay.mjs"), ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit", timeout: 60000 }
)
