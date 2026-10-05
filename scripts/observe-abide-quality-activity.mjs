// Non-intervening source-free diagnostic sampler for the running native study.
import { spawnSync } from "node:child_process"
import { appendFileSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
const out = resolve(
  process.argv.find((x) => x.startsWith("--out="))?.slice(6) ??
    resolve(import.meta.dirname, "../../hapsland-research/evidence/abide-quality-native/activity-observations.jsonl")
)
const requestCap = process.argv.find((x) => x.startsWith("--request-cap="))?.slice(14) ?? "180"
const maxMinutes = Number(process.argv.find((x) => x.startsWith("--max-minutes="))?.slice(14) ?? 25)
if (!Number.isFinite(maxMinutes) || maxMinutes < 1 || maxMinutes > 90) throw new Error("Invalid sampling deadline")
let previous = []
try {
  previous = readFileSync(out, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).contentDigest)
} catch {
  /* Fresh sampler output. */
}
const seen = new Set(previous)
const deadline = Date.now() + maxMinutes * 60 * 1000
while (Date.now() < deadline) {
  const list = spawnSync("ps", ["-eo", "pid,args"], { encoding: "utf8" }).stdout.split("\n")
  for (const line of list) {
    if (!line.includes("/.bin/codex exec")) continue
    const pid = line.trim().split(/\s+/)[0]
    let env
    try {
      const selected = ["QUALITY_CANDIDATE", "QUALITY_CASE", "QUALITY_GLOBAL_CAP", "REVIEW_ACTIVITY_PATH"]
      env = Object.fromEntries(
        readFileSync(`/proc/${pid}/environ`, "utf8")
          .split("\0")
          .flatMap((item) => {
            const i = item.indexOf("=")
            const key = item.slice(0, i)
            return selected.includes(key) ? [[key, item.slice(i + 1)]] : []
          })
      )
    } catch {
      continue
    }
    if (env.QUALITY_CANDIDATE !== "hapsland" || env.QUALITY_GLOBAL_CAP !== requestCap) continue
    let profile
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
      const parent = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]
      profile = readFileSync(`/proc/${parent}/cmdline`, "utf8")
        .split("\0")
        .find((arg) => arg.startsWith("--task-profile="))
        ?.slice(15)
    } catch {
      /* Older diagnostics need no profile label. */
    }
    const visit = (directory) => {
      let entries
      try {
        entries = readdirSync(directory, { withFileTypes: true })
      } catch {
        return
      }
      for (const item of entries) {
        const path = join(directory, item.name)
        if (item.isDirectory()) visit(path)
        else if (item.isFile() && item.name.endsWith(".json")) {
          let record, raw
          try {
            raw = readFileSync(path, "utf8")
            record = JSON.parse(raw)
          } catch {
            continue
          }
          const id = createHash("sha256").update(raw).digest("hex")
          if (seen.has(id)) continue
          seen.add(id)
          const keys = ["version", "kind", "stage", "findings", "reason", "observedAt", "reservedContinuations"]
          const safe = Object.fromEntries(
            keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]])
          )
          appendFileSync(
            out,
            JSON.stringify({
              sampledAt: Date.now(),
              taskProfile: profile,
              taskId: env.QUALITY_CASE,
              candidate: "hapsland",
              contentDigest: id,
              activity: safe
            }) + "\n"
          )
        }
      }
    }
    if (env.REVIEW_ACTIVITY_PATH) visit(env.REVIEW_ACTIVITY_PATH)
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
