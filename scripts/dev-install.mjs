import * as Effect from "effect/Effect"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildToolchain, ensurePackageArtifact } from "./artifact-store.mjs"
import { stageRelease } from "../src/onboarding/distribution.ts"
import { NEW_KEY_FLAG, SETUP_COMMAND } from "../src/runtime/cli-names.ts"

const args = process.argv.slice(2)
const host = args.find((arg) => arg.startsWith("--host="))?.slice("--host=".length)
const update = args.includes("--update")
const newKey = args.includes(NEW_KEY_FLAG)
if (update && newKey) throw new Error(`${NEW_KEY_FLAG} requires guided setup; omit --update`)
const forwarded = args.filter((arg) => /^--(?:claude|codex|pi)-(?:home|executable)=/.test(arg))
if (
  (host !== "claude" && host !== "codex" && host !== "pi") ||
  args.some((arg) => arg !== `--host=${host}` && arg !== "--update" && arg !== NEW_KEY_FLAG && !forwarded.includes(arg))
) {
  throw new Error(
    `usage: npm run dev-install -- --host=claude|codex|pi [--update | ${NEW_KEY_FLAG}] [--claude-home=PATH|--codex-home=PATH|--pi-home=PATH] [--claude-executable=PATH|--codex-executable=PATH|--pi-executable=PATH]`
  )
}
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
let candidate
try {
  const toolchain = await buildToolchain(environment)
  const artifact = await stage("Preparing checked local development archive", () =>
    ensurePackageArtifact({
      root,
      toolchain,
      runStage: async ({ command, args }) => {
        run(command, args)
        return { exitCode: 0 }
      }
    })
  )
  process.stdout.write(
    artifact.buildReused ? "Reusing checked development build.\n" : "Built current development inputs.\n"
  )
  run("npm", ["run", "verify:release-native"])
  candidate = await stage("Checking installed snapshot / installing local archive", () =>
    Effect.runPromise(stageRelease({ kind: "archive", path: artifact.archivePath }))
  )
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
      : [SETUP_COMMAND, host, ...(newKey ? [NEW_KEY_FLAG] : []), ...forwarded]
  )
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = error.exitCode ?? 1
}
