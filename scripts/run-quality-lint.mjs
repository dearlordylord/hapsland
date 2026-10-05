import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { discoverQualityFiles } from "./quality-file-discovery.mjs"

const args = process.argv.slice(2)
const known = new Set(["--changed", "--fix", "--staged", "--format-only", "--census"])
for (const arg of args)
  if (arg.startsWith("--") && !known.has(arg) && !arg.startsWith("--base="))
    throw new Error(`Unknown lint option: ${arg}`)
const files = args.filter((arg) => !arg.startsWith("--"))
const selected = discoverQualityFiles({
  ...(files.length ? { files } : {}),
  changed: args.includes("--changed") || args.includes("--staged"),
  base: args.find((arg) => arg.startsWith("--base="))?.slice(7) ?? "HEAD"
})
if (!selected.length) console.log("No authored code files selected for lint and format checks")
let failed = false
const run = (name, options) => {
  const executable = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name)
  const result = spawnSync(executable, options, { stdio: "inherit", timeout: 120_000 })
  if (result.error) throw result.error
  if (result.status !== 0) {
    failed = true
    if (!args.includes("--census")) process.exit(result.status ?? 1)
  }
}
if (selected.length) {
  console.log(`Checking ${selected.length} authored code files`)
  if (!args.includes("--format-only"))
    run("oxlint", [
      "-c",
      ".oxlintrc.json",
      "--deny-warnings",
      ...(args.includes("--fix") ? ["--fix"] : []),
      ...selected
    ])
  run("dprint", [args.includes("--fix") ? "fmt" : "check", ...selected])
}
if (failed) process.exitCode = 1
