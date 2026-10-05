import { standaloneEnvironment } from "./test-harness/standalone-environment.mjs"
import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(new URL("../", import.meta.url).pathname)
const outputPath = join(root, "evidence/direct-event-v1/host-codex-0.155.1-linux-arm64.json")
const run = (command, args, options = {}) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 120_000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.once("error", reject)
    child.once("close", (code, signal) => {
      clearTimeout(timer)
      resolveRun({ code, signal, stdout, stderr })
    })
    if (options.input !== undefined) child.stdin.end(options.input)
  })
const commandVersion = async (command, args) => (await run(command, args, { timeoutMs: 10_000 })).stdout.trim()
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const jsonLines = (text) =>
  text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })

const date = new Date().toISOString()
const versions = {
  codex: await commandVersion("codex", ["--version"]).catch(() => "unavailable"),
  node: process.version,
  git: await commandVersion("git", ["--version"]).catch(() => "unavailable"),
  operatingSystem: process.platform,
  architecture: process.arch
}
const gaps = []
if (versions.codex !== "codex-cli 0.155.1") gaps.push("Codex CLI 0.155.1 unavailable")
if (versions.operatingSystem !== "linux" || versions.architecture !== "arm64") gaps.push("Linux arm64 unavailable")

const temporary = await mkdtemp(join(tmpdir(), "direct-event-host-conformance-"))
let record
try {
  const repository = join(temporary, "repository")
  const artifacts = join(temporary, "artifacts")
  const installation = join(temporary, "installation")
  const home = join(temporary, "codex-home")
  const state = join(temporary, "consent")
  const runtime = join(temporary, "runtime")
  const activityPath = join(temporary, "activity")
  const stagesPath = join(temporary, "stages.jsonl")
  const callsPath = join(temporary, "calls.txt")
  await mkdir(repository)
  await mkdir(artifacts)
  await mkdir(installation)
  await mkdir(home, { mode: 0o700 })
  const packed = await run("npm", ["pack", "--pack-destination", artifacts], { cwd: root })
  if (packed.code !== 0) throw new Error("npm pack failed for host conformance")
  const artifactName = (await readdir(artifacts)).find((entry) => entry.endsWith(".tgz"))
  if (artifactName === undefined) throw new Error("npm pack did not produce a host-conformance artifact")
  const installed = await run(
    "npm",
    ["install", "--prefer-offline", "--omit=dev", "--prefix", installation, join(artifacts, artifactName)],
    { cwd: temporary, timeoutMs: 120_000 }
  )
  if (installed.code !== 0) throw new Error("host-conformance package install failed")
  const tarball = join(artifacts, artifactName)
  const installedCli = join(installation, "node_modules", ".bin", "hapsland")
  const packageDirectory = join(installation, "node_modules", "@hapsland", "hapsland")
  const installedManifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"))
  const artifactSha256 = createHash("sha256")
    .update(await readFile(tarball))
    .digest("hex")
  await run("git", ["init", "--quiet", "--initial-branch=master"], { cwd: repository })
  await run("git", ["config", "user.name", "Conformance Fixture"], { cwd: repository })
  await run("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repository })
  await writeFile(join(repository, "README.md"), "synthetic fixture\n", { mode: 0o600 })
  await run("git", ["add", "README.md"], { cwd: repository })
  await run("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repository })
  let hostAuthentication = "available"
  try {
    await copyFile("/home/node/.codex/auth.json", join(home, "auth.json"))
    await chmod(join(home, "auth.json"), 0o600)
  } catch {
    hostAuthentication = "unavailable"
    gaps.push("Codex host authentication unavailable")
  }
  await writeFile(join(home, "config.toml"), "[features]\nhooks = true\n", { mode: 0o600 })
  const observer = join(temporary, "independent-hook-observer.mjs")
  await writeFile(
    observer,
    `import { appendFileSync, readFileSync } from "node:fs";
let event;
try { event = JSON.parse(readFileSync(0, "utf8")); } catch { event = undefined; }
appendFileSync(process.env.REVIEW_HOST_STAGE_PATH, JSON.stringify({
  hookEntry: event?.hook_event_name === "PostToolUse",
  toolName: typeof event?.tool_name === "string" ? event.tool_name : "unknown",
  sessionId: typeof event?.session_id === "string" ? event.session_id : undefined
}) + "\\n", { mode: 0o600 });
`,
    { mode: 0o600 }
  )
  await writeFile(
    join(home, "hooks.json"),
    `${JSON.stringify(
      { description: "installed product followed by an independent source-free observer" },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  )

  const visibilityMarker = `HOOK_ONLY_${randomUUID().replaceAll("-", "")}`
  await writeFile(
    join(repository, "visibility-rules.jsonc"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: "host-visibility",
        contentVersion: "1.0.0",
        rules: [
          {
            id: "marker",
            question: "Does this declaration define a delivery-shaped interface?",
            criteria: { false: "The declaration is not delivery-shaped.", true: "The declaration is delivery-shaped." },
            threshold: 0.7,
            message: `Visibility probe token: ${visibilityMarker}`,
            applicability: { includes: ["profile.ts"] }
          }
        ]
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  )
  await writeFile(join(repository, ".hapsland.jsonc"), '{"version":1,"packs":["visibility-rules.jsonc"]}\n', {
    mode: 0o600
  })
  const answers = Object.fromEntries(
    [
      "r1_inferred_case",
      "r2_meaningless_combinations",
      "r3_split_correlations",
      "r4_duplicate_encoding",
      "r5_absence_confusion",
      "r6_bare_domain_value",
      "r7_name_wider_than_type",
      "r8_name_claims_resource",
      "r9_body_reaches_undeclared"
    ].map((id) => [id, { _tag: "Probability", probability: 0.91 }])
  )
  answers["host-visibility/marker"] = { _tag: "Probability", probability: 0.91 }
  const env = {
    ...standaloneEnvironment(join(temporary, "standalone-path"), process.env, ["codex"]),
    CODEX_HOME: home,
    REVIEW_STATE_PATH: state,
    REVIEW_RESIDENT_DIR: runtime,
    REVIEW_ACTIVITY_PATH: activityPath,
    REVIEW_HOST_STAGE_PATH: stagesPath,
    REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath: callsPath }),
    REVIEW_INSTALL_CONTROLLED: "1"
  }
  for (const key of ["OPENAI_API_KEY", "TYPESAFE_API_KEY"]) delete env[key]

  const installPreview = JSON.parse(
    (
      await run(installedCli, ["--install-preview"], {
        cwd: temporary,
        env,
        input: JSON.stringify({ version: 1, operation: "install-preview", codexHome: home, codexExecutable: "codex" })
      })
    ).stdout
  )
  if (installPreview.status !== "preview" || typeof installPreview.proposal?.digest !== "string") {
    throw new Error("installed package did not preview the real-host hook installation")
  }
  const installResult = JSON.parse(
    (
      await run(installedCli, ["--install"], {
        cwd: temporary,
        env,
        input: JSON.stringify({
          version: 1,
          operation: "install",
          codexHome: home,
          codexExecutable: "codex",
          proposalDigest: installPreview.proposal.digest
        })
      })
    ).stdout
  )
  if (installResult.status !== "installed") throw new Error("installed package did not install the real-host hook")
  const hookConfiguration = JSON.parse(await readFile(join(home, "hooks.json"), "utf8"))
  hookConfiguration.hooks.PostToolUse.push({
    matcher: "^(apply_patch|Bash)$",
    hooks: [{ type: "command", command: `${shellQuote(process.execPath)} ${shellQuote(observer)}`, timeout: 20 }]
  })
  await writeFile(join(home, "hooks.json"), `${JSON.stringify(hookConfiguration, null, 2)}\n`, { mode: 0o600 })
  const installedHooks = await readFile(join(home, "hooks.json"), "utf8")
  if (!installedHooks.includes(installation) || installedHooks.includes(join(root, "src"))) {
    throw new Error("real-host hook does not point exclusively at the installed package")
  }

  let host = { code: null, signal: null, stdout: "", stderr: "" }
  if (gaps.length === 0 && hostAuthentication === "available") {
    host = await run(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--json",
        "--dangerously-bypass-hook-trust",
        "--dangerously-bypass-approvals-and-sandbox",
        "--ignore-rules",
        "-C",
        repository,
        "Use apply_patch exactly once to add profile.ts containing one exported interface named Delivery with fields id:string and destination:string. Then use Bash exactly once to run `printf collection-ready`. If hook context contains a token beginning HOOK_ONLY_, repeat that exact token in your final reply; otherwise reply VISIBILITY_NOT_OBSERVED. Do not inspect files or make other tool calls."
      ],
      { cwd: repository, env, timeoutMs: 120_000 }
    )
  }
  const stages = jsonLines(await readFile(stagesPath, "utf8").catch(() => ""))
  const backendCalls = (await readFile(callsPath, "utf8").catch(() => "")).split("\n").filter(Boolean).length
  const messages = jsonLines(host.stdout).flatMap((entry) =>
    entry?.item?.type === "agent_message" && typeof entry.item.text === "string" ? [entry.item.text] : []
  )
  const visibility = messages.some((message) => message.includes(visibilityMarker))
    ? "observed-hook-only-value"
    : messages.includes("VISIBILITY_NOT_OBSERVED")
      ? "not-observed"
      : "indeterminate"
  const addStage = stages.find((stage) => stage.toolName === "apply_patch")
  const observedSessionId = stages.find((stage) => typeof stage.sessionId === "string")?.sessionId
  const activity =
    observedSessionId === undefined
      ? undefined
      : JSON.parse(
          (
            await run(installedCli, ["--status"], {
              cwd: root,
              env,
              input: JSON.stringify({ version: 1, operation: "status", cwd: repository, sessionId: observedSessionId })
            })
          ).stdout || "null"
        )
  record = {
    schemaVersion: 1,
    nodeOrBunOnInstalledPath: false,
    recordedAt: date,
    profile: "direct-event-v1",
    environment: versions,
    mode: "headless installed command hook / controlled writer / controlled DecisionModel",
    controlledWriter: true,
    packageProvenance: {
      name: installedManifest.name,
      version: installedManifest.version,
      artifact: artifactName,
      artifactSha256,
      hookEntrypoint: "installed-package",
      checkoutSourceInHookPath: false,
      independentObserverImportsCheckoutSource: false
    },
    isolation: { temporaryCodexHome: true, temporaryGitRepository: true, retainedSyntheticSource: false },
    addLiveEvidence: {
      hostExitCode: host.code,
      hookEntry: addStage?.hookEntry === true,
      adaptation: backendCalls === 1 && activity?.activity?.observed === true ? "mapped" : "not-observed",
      backendSubmissions: backendCalls,
      hostSubmission: activity?.activity?.submission?.status === "submitted" ? "attempted-unacknowledged" : "none",
      activity:
        activity?.activitySource === "resident-v1"
          ? {
              instrumentation: activity.activitySource,
              kind: activity.activity?.kind,
              observed: activity.activity?.observed,
              submission: activity.activity?.submission?.status,
              submissionFindings: activity.activity?.submission?.findings,
              modelReaction: activity.activity?.modelReaction?.status,
              limitation: activity.activity?.limitation ?? "none"
            }
          : { instrumentation: "unavailable" },
      independentlyObservedModelVisibility: visibility
    },
    updateAndMultiFileEvidence: {
      status: "deterministic-and-native-payload-only",
      liveHostRun: false,
      checks: [
        "src/direct-event/pipeline.test.ts: revalidates delayed Add, Update, and multi-file work through deterministic backend gates",
        "evidence/codex/0.155.1/native-update-emission-2026-09-20.json",
        "evidence/codex/0.155.1/post-tool-use-multi-file.json"
      ]
    },
    childSpecificDelivery: { status: "unvalidated", deterministicIdentityIsolationOnly: true },
    exclusions: {
      headful: true,
      otherHosts: true,
      otherPlatforms: true,
      otherVersions: true,
      reliableVisibility: true,
      guaranteedFinalDrain: true
    },
    evidenceGaps: gaps,
    verdict:
      gaps.length > 0
        ? "not-run-environment-gap"
        : addStage?.hookEntry === true &&
            backendCalls === 1 &&
            activity?.activitySource === "resident-v1" &&
            activity.activity?.kind === "submitted" &&
            activity.activity?.submission?.status === "submitted" &&
            activity.activity?.modelReaction?.status === "unavailable" &&
            visibility === "observed-hook-only-value"
          ? "pinned-host-conformant-with-stated-gaps"
          : "inconclusive"
  }

  const owner = JSON.parse(await readFile(join(runtime, "owner.json"), "utf8").catch(() => "null"))
  if (typeof owner?.pid === "number") {
    try {
      process.kill(owner.pid, "SIGTERM")
    } catch {
      /* exited */
    }
  }

  if (process.argv.includes("--write-evidence")) {
    await mkdir(join(root, "evidence/direct-event-v1"), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`)
if (record.verdict === "inconclusive") process.exitCode = 1
