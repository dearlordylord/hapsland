import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const generators = [
  { file: "scripts/generate-configuration.ts", update: ["--update"] },
  { file: "scripts/generate-hook-index.mjs", update: [] },
  { file: "scripts/generate-architecture-diagram.mjs", update: [] },
  { file: "scripts/generate-module-architecture.mjs", update: [] },
  { file: "scripts/generate-decision-boundary-ledger.mts", update: ["--update"] },
  { file: "scripts/generate-interaction-diagrams.mts", update: ["--write"], timeoutMs: 90_000 },
  { file: "scripts/generate-abide-scenario-pages.mjs", update: [] }
]

/** One inventory for updates and read-only drift checks; stop on the first failure. */
export const generateDocumentation = (mode, root = resolve(import.meta.dirname, "..")) => {
  if (mode !== "--update" && mode !== "--check") throw new Error("Choose --update or --check")
  // The launcher itself imports no compiled owner. Turbo owns package preparation.
  const preparation = spawnSync(process.execPath, ["scripts/build-workspaces.mjs"], {
    cwd: root,
    stdio: "inherit",
    timeout: 180_000
  })
  if (preparation.error) throw preparation.error
  if (preparation.status !== 0) return preparation.status ?? 1
  for (const generator of generators) {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", generator.file, ...(mode === "--check" ? ["--check"] : generator.update)],
      { cwd: root, stdio: "inherit", timeout: generator.timeoutMs ?? 30_000 }
    )
    if (result.error) throw result.error
    if (result.status !== 0) return result.status ?? 1
  }
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: generate-documentation.mjs --update|--check")
  process.exitCode = generateDocumentation(process.argv[2])
}
