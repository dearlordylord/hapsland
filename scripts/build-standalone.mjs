import { resolveBunRuntime } from "./pinned-bun.mjs"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const bun = resolveBunRuntime().executable
const entries = [
  ["hapsland", "dist/cli.js"],
  ["hapsland-doctor", "dist/package-doctor.js"],
  ["hapsland-parser", "dist/parser-main.js"],
  ["hapsland-resident", "dist/resident/main.js"]
]
const profiles = process.env.HAPSLAND_BUILD_PROFILE
  ? [process.env.HAPSLAND_BUILD_PROFILE]
  : ["linux-arm64", "darwin-arm64"]
if (profiles.some((profile) => !["linux-arm64", "darwin-arm64"].includes(profile)))
  throw new Error("Unsupported standalone build profile")
for (const profile of profiles) {
  const target = `bun-${profile}`
  const output = resolve(root, "dist/bin", profile)
  mkdirSync(output, { recursive: true })
  for (const [name, entry] of entries) {
    const result = spawnSync(
      bun,
      [resolve(root, "scripts/compile-standalone.mjs"), resolve(root, entry), target, resolve(output, name)],
      { cwd: root, stdio: "inherit", env: process.env }
    )
    if (result.status !== 0 || !existsSync(resolve(output, name)))
      throw new Error(`Standalone ${profile}/${name} build failed`)
  }
}
