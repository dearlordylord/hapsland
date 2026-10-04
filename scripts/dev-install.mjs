import * as Effect from "effect/Effect"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  devBuildIdentity,
  devCacheDirectory,
  readDevCandidate,
  writeDevCandidate,
  withDevInstallLock
} from "./dev-install-cache.mjs"
import { loadDevEnvFile } from "./dev-install-env.mjs"
import { packDevelopmentArchive } from "./dev-pack.mjs"
import { stageRelease } from "../src/onboarding/distribution.ts"

const args = process.argv.slice(2)
const host = args.find((arg) => arg.startsWith("--host="))?.slice("--host=".length)
const update = args.includes("--update")
const newKey = args.includes("--new-key")
if (update && newKey) throw new Error("--new-key requires guided setup; omit --update")
const forwarded = args.filter((arg) => /^--(?:claude|codex|pi)-(?:home|executable)=/.test(arg))
if (
  (host !== "claude" && host !== "codex" && host !== "pi") ||
  args.some((arg) => arg !== `--host=${host}` && arg !== "--update" && arg !== "--new-key" && !forwarded.includes(arg))
) {
  throw new Error(
    "usage: npm run dev-install -- --host=claude|codex|pi [--update | --new-key] [--claude-home=PATH|--codex-home=PATH|--pi-home=PATH] [--claude-executable=PATH|--codex-executable=PATH|--pi-executable=PATH]"
  )
}
loadDevEnvFile(process.cwd())
const environment = {
  ...process.env,
  HAPSLAND_ACTIVE_DISPATCH: "1",
  HAPSLAND_BUILD_PROFILE: `${process.platform}-${process.arch}`
}
delete environment.REVIEW_INSTALL_RUNTIME
delete environment.REVIEW_INSTALL_ENTRYPOINT
const run = (command, commandArgs, stdio = "inherit") => {
  const result = spawnSync(command, commandArgs, { stdio, encoding: "utf8", timeout: 300_000, env: environment })
  if (result.error) throw new Error(`${command} ${commandArgs[0]} failed: ${result.error.message}`)
  if (result.status !== 0)
    throw Object.assign(new Error(`${command} ${commandArgs[0]} failed`), { exitCode: result.status ?? 1 })
  return result.stdout
}
const stage = async (label, work) => {
  const started = Date.now()
  process.stdout.write(`${label}...\n`)
  const timer = setInterval(
    () => process.stdout.write(`${label}: still running (${Math.round((Date.now() - started) / 1000)}s)\n`),
    10_000
  )
  try {
    return await work()
  } finally {
    clearInterval(timer)
    process.stdout.write(`${label}: finished in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)
  }
}
const root = process.cwd()
const cache = devCacheDirectory(root)
const toolVersion = (command, args) => {
  const probe = spawnSync(command, args, { encoding: "utf8", timeout: 10_000 })
  return probe.status === 0 ? probe.stdout.trim() : "unavailable"
}
const toolchain = {
  node: process.version,
  profile: environment.HAPSLAND_BUILD_PROFILE,
  bun: environment.HAPSLAND_BUILD_BUN ?? "mise-or-path:1.3.14",
  npm: toolVersion("npm", ["--version"]),
  cc: toolVersion("cc", ["--version"]),
  libsecret: process.platform === "linux" ? toolVersion("pkg-config", ["--modversion", "libsecret-1"]) : undefined
}
let candidate
try {
  candidate = await withDevInstallLock(cache, async () => {
    let inputs
    const identity = devBuildIdentity(root, toolchain, (observed) => {
      inputs = observed
    })
    const cached = readDevCandidate(cache, identity)
    let archive
    if (cached) {
      archive = cached.archive
      process.stdout.write("Reusing unchanged development build; skipping build and pack.\n")
    } else {
      process.stdout.write("Development build inputs changed or cache missing; building current platform.\n")
      run("npm", ["run", "build"])
      run("npm", ["run", "verify:release-native"])
      const destination = mkdtempSync(join(cache, "pack-"))
      archive = await stage("Packing local development archive (fast compression)", () =>
        packDevelopmentArchive({ root, destination })
      )
      let currentInputs
      if (
        devBuildIdentity(root, toolchain, (observed) => {
          currentInputs = observed
        }) !== identity
      ) {
        const changed = [...new Set([...inputs.keys(), ...currentInputs.keys()])].filter(
          (path) => inputs.get(path) !== currentInputs.get(path)
        )
        throw new Error(
          `Build inputs changed during dev-install: ${changed.slice(0, 10).join(", ")}; rerun to build the current code`
        )
      }
      writeDevCandidate(cache, identity, archive)
    }
    return await stage("Checking installed snapshot / installing local archive", () =>
      Effect.runPromise(stageRelease({ kind: "archive", path: archive }))
    )
  })
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(error.exitCode ?? 1)
}
const snapshotPath = join(candidate.prefix, "snapshot.json")
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"))
writeFileSync(
  snapshotPath,
  JSON.stringify(
    {
      ...snapshot,
      commit: run("git", ["rev-parse", "HEAD"], "pipe").trim(),
      dirty: run("git", ["status", "--porcelain"], "pipe").trim() !== ""
    },
    null,
    2
  ) + "\n",
  { mode: 0o600 }
)
process.stdout.write(
  `Local candidate ${candidate.packageVersion}: ${candidate.executable}\nRetained archive: ${candidate.identity.archive}\n`
)
process.stdout.write("Starting Hapsland setup...\n")
try {
  run(
    candidate.executable,
    update
      ? ["update", host, `--target=${candidate.executable}`, ...forwarded]
      : ["setup", host, ...(newKey ? ["--new-key"] : []), ...forwarded]
  )
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = error.exitCode ?? 1
}
