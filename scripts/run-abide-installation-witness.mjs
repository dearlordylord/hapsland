// Offline installer coexistence only; native behavior uses the common host runner.
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const project = resolve(import.meta.dirname, "..")
const prefix = process.argv.find((arg) => arg.startsWith("--abide-prefix="))?.slice(15)
if (!prefix) throw new Error("Choose --abide-prefix for installed @coldtea/abide@0.0.7")
const abideRoot = join(resolve(prefix), "node_modules", "@coldtea", "abide")
const manifest = JSON.parse(readFileSync(join(abideRoot, "package.json"), "utf8"))
if (manifest.version !== "0.0.7") throw new Error("Pinned Abide 0.0.7 required")
const bin = join(abideRoot, manifest.bin.abide)
const outputRoot = resolve(project, "../hapsland-research/evidence/native-coexistence")
mkdirSync(outputRoot, { recursive: true })
const runId = `installation-${Date.now()}`
const hosts = {
  codex: "/tmp/hapsland-codex-01551/node_modules/.bin/codex",
  claude: "/home/node/.local/share/claude/versions/2.1.218"
}
writeFileSync(
  join(outputRoot, `${runId}-declaration.json`),
  JSON.stringify(
    {
      schemaVersion: 1,
      declaredAt: new Date().toISOString(),
      scope: "source Hapsland installer and released Abide installer, isolated user profiles",
      cells: Object.keys(hosts).flatMap((host) => ["hapsland-first", "abide-first"].map((order) => ({ host, order }))),
      maximumProviderRequests: 0,
      nativeSessions: 0,
      credentials: "synthetic fixture key only",
      checks: [
        "both installation orders preserve neighboring handlers",
        "repeat Abide init preserves Hapsland",
        "Abide uninstall preserves Hapsland",
        "Hapsland uninstall preserves Abide"
      ]
    },
    null,
    2
  ) + "\n",
  { flag: "wx" }
)
const cells = []
const commands = (settings) =>
  Object.values(settings.hooks ?? {}).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((hook) => hook.command))
  )
for (const [host, binary] of Object.entries(hosts))
  for (const order of ["hapsland-first", "abide-first"]) {
    const temp = mkdtempSync(join(tmpdir(), "hapsland-abide-installation-"))
    try {
      const repo = join(temp, "repo"),
        profile = join(temp, "profile"),
        home = join(profile, `.${host}`)
      mkdirSync(repo)
      mkdirSync(home, { recursive: true })
      spawnSync("git", ["init", "--quiet", repo])
      writeFileSync(join(repo, "AGENTS.md"), "Do not expose raw exceptions to a user.\n")
      const settingsPath = join(home, host === "codex" ? "hooks.json" : "settings.json")
      writeFileSync(settingsPath, JSON.stringify({ description: "preserve independent user settings", hooks: {} }))
      const env = {
        ...process.env,
        ABIDE_HOME_DIR: profile,
        TYPESAFE_AI_API_KEY: "synthetic-fixture-key",
        TYPESAFE_AI_BASE_URL: "http://127.0.0.1:1/v1",
        REVIEW_INSTALL_RUNTIME: process.execPath,
        REVIEW_INSTALL_ENTRYPOINT: join(project, "src", "cli.ts"),
        REVIEW_RESIDENT_DIR: join(temp, "resident"),
        REVIEW_ACTIVITY_PATH: join(temp, "activity"),
        REVIEW_USER_CONFIG_PATH: join(temp, "user.jsonc")
      }
      delete env.NODE_OPTIONS
      delete env.TYPESAFE_API_KEY
      delete env.AI_GATEWAY_API_KEY
      const readSettings = () => JSON.parse(readFileSync(settingsPath, "utf8"))
      const invokeAbide = (operation) => {
        const result = spawnSync(process.execPath, [bin, operation, host], {
          cwd: repo,
          env,
          encoding: "utf8",
          timeout: 30_000
        })
        if (result.status !== 0)
          throw new Error(`Abide ${operation} failed with exit ${result.status}; output withheld`)
      }
      const request = { version: 1, host, [`${host}Home`]: home, [`${host}Executable`]: binary }
      const invokeHapsland = (operation, extra = {}) => {
        const result = spawnSync(process.execPath, [join(project, "src", "cli.ts"), `--${operation}`], {
          cwd: project,
          env,
          input: JSON.stringify({ ...request, operation, ...extra }),
          encoding: "utf8",
          timeout: 45_000
        })
        let output
        try {
          output = JSON.parse(result.stdout)
        } catch {
          throw new Error("Hapsland installer output could not be decoded; output withheld")
        }
        if (result.status !== 0)
          throw new Error(`Hapsland ${operation} failed: ${output.status ?? output.error?.code}; output withheld`)
        return output
      }
      const installHapsland = () => {
        const preview = invokeHapsland("install-preview")
        return invokeHapsland("install", { proposalDigest: preview.proposal.digest })
      }
      if (order === "hapsland-first") {
        installHapsland()
        invokeAbide("init")
      } else {
        invokeAbide("init")
        installHapsland()
      }
      const installed = commands(readSettings())
      const hapsland = installed.filter((command) => command.includes("--review-tool-"))
      const abide = installed.filter((command) => command.includes("abide-hook.js"))
      invokeAbide("init")
      const repeated = commands(readSettings())
      invokeAbide("uninstall")
      const afterAbideUninstall = commands(readSettings())
      invokeAbide("init")
      const removal = invokeHapsland("uninstall")
      invokeHapsland("uninstall", { proposalDigest: removal.proposal.digest })
      const afterHapslandUninstall = commands(readSettings())
      const checks = {
        bothToolsInstalled: hapsland.length >= 5 && abide.length === 4,
        repeatedAbideInitPreservesHapsland: hapsland.every((command) => repeated.includes(command)),
        repeatedAbideInitDoesNotDuplicate: repeated.length === installed.length,
        abideUninstallPreservesHapsland: hapsland.every((command) => afterAbideUninstall.includes(command)),
        abideUninstallRemovesOnlyAbide: !afterAbideUninstall.some((command) => command.includes("abide-hook.js")),
        hapslandUninstallPreservesAbide: abide.every((command) => afterHapslandUninstall.includes(command)),
        hapslandUninstallRemovesOnlyHapsland: !afterHapslandUninstall.some((command) =>
          command.includes("--review-tool-")
        ),
        independentSettingPreserved: readSettings().description === "preserve independent user settings"
      }
      cells.push({
        host,
        order,
        runtimeVersion: spawnSync(binary, ["--version"], { encoding: "utf8" }).stdout.trim(),
        hapslandHandlers: hapsland.length,
        abideHandlers: abide.length,
        checks,
        verdict: Object.values(checks).every(Boolean) ? "demonstrated" : "incomplete"
      })
    } catch (error) {
      cells.push({ host, order, verdict: "incomplete", failure: error.message })
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  }
const record = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  runnerSha256: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  hapslandCommit: spawnSync("git", ["-C", project, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
  abideVersion: manifest.version,
  providerRequests: 0,
  nativeSessions: 0,
  cells,
  installedPackageHapslandValidated: false,
  sourceRetained: false,
  credentialsRetained: false,
  verdict: cells.every((cell) => cell.verdict === "demonstrated") ? "demonstrated" : "incomplete"
}
const path = join(outputRoot, `${runId}.json`)
writeFileSync(path, JSON.stringify(record, null, 2) + "\n")
console.log(JSON.stringify({ evidence: path, verdict: record.verdict, cells }))
if (record.verdict !== "demonstrated") process.exitCode = 1
