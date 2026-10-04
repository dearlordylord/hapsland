import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { commandHooks, piHooks, piHookCommand } from "../src/runtime/hook-catalog.ts"
const path = resolve(import.meta.dirname, "../README.md")
const start = "<!-- hapsland-hooks:start -->"
const end = "<!-- hapsland-hooks:end -->"
const cell = (value) => String(value).replaceAll("|", "\\|")
const rows = []
for (const [runtime, hooks] of Object.entries(commandHooks)) {
  for (const hook of Object.values(hooks))
    rows.push([
      runtime === "codex" ? "Codex" : "Claude Code",
      `\`${hook.event}\``,
      "matcher" in hook ? `\`${hook.matcher}\`` : "All",
      "async" in hook && hook.async ? "Async command" : "Sync command",
      `${hook.timeout} s`,
      hook.purpose
    ])
}
for (const hook of Object.values(piHooks))
  rows.push([
    "Pi",
    `\`${hook.event}\``,
    "tool" in hook ? `\`${hook.tool}\`` : "All",
    "Extension callback",
    hook.callsResident ? `${piHookCommand.timeoutMs / 1000} s per IPC call` : "No IPC",
    hook.purpose
  ])
const table = [
  start,
  "## Agent hooks",
  "",
  "Generated from [the hook catalog](./src/runtime/hook-catalog.ts). Command timeouts are upper limits, not measured latency. Pi limits each Hapsland command call; a callback may make multiple calls. Codex does not install a `UserPromptSubmit` hook. OpenCode review hooks are currently inactive.",
  "",
  "| Runtime | Event | Selection | Mode | Limit | Purpose |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  end
].join("\n")
const current = readFileSync(path, "utf8")
const begin = current.indexOf(start)
const finish = current.indexOf(end)
if (begin < 0 !== finish < 0) throw new Error("README hook-index markers are incomplete")
const next =
  begin < 0
    ? `${current.trimEnd()}\n\n${table}\n`
    : `${current.slice(0, begin)}${table}${current.slice(finish + end.length)}`
if (process.argv.includes("--check")) {
  if (next !== current) throw new Error("README hook index is stale; run npm run hooks:generate")
  console.log("README hook index matches installed definitions")
} else writeFileSync(path, next)
