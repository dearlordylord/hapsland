import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ensureResident, residentRequest } from "../src/resident/client.ts";
import { residentPaths } from "../src/resident/paths.ts";

const root = resolve(new URL("../", import.meta.url).pathname);
const outputPath = join(root, "evidence/direct-event-v1/host-codex-0.155.1-linux-arm64.json");
const run = (command, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 120_000);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    resolveRun({ code, signal, stdout, stderr });
  });
  if (options.input !== undefined) child.stdin.end(options.input);
});
const commandVersion = async (command, args) => (await run(command, args, { timeoutMs: 10_000 })).stdout.trim();
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const jsonLines = (text) => text.split("\n").filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});

const date = new Date().toISOString();
const versions = {
  codex: await commandVersion("codex", ["--version"]).catch(() => "unavailable"),
  node: process.version,
  git: await commandVersion("git", ["--version"]).catch(() => "unavailable"),
  operatingSystem: process.platform,
  architecture: process.arch,
};
const gaps = [];
if (versions.codex !== "codex-cli 0.155.1") gaps.push("Codex CLI 0.155.1 unavailable");
if (versions.operatingSystem !== "linux" || versions.architecture !== "arm64") gaps.push("Linux arm64 unavailable");

const temporary = await mkdtemp(join(tmpdir(), "direct-event-host-conformance-"));
let record;
try {
  const repository = join(temporary, "repository");
  const home = join(temporary, "codex-home");
  const state = join(temporary, "consent");
  const runtime = join(temporary, "runtime");
  const activityPath = join(temporary, "activity");
  const stagesPath = join(temporary, "stages.jsonl");
  const callsPath = join(temporary, "calls.txt");
  await mkdir(repository);
  await mkdir(home, { mode: 0o700 });
  await run("git", ["init", "--quiet", "--initial-branch=master"], { cwd: repository });
  await run("git", ["config", "user.name", "Conformance Fixture"], { cwd: repository });
  await run("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repository });
  await writeFile(join(repository, "README.md"), "synthetic fixture\n", { mode: 0o600 });
  await run("git", ["add", "README.md"], { cwd: repository });
  await run("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repository });
  let hostAuthentication = "available";
  try {
    await copyFile("/home/node/.codex/auth.json", join(home, "auth.json"));
    await chmod(join(home, "auth.json"), 0o600);
  } catch {
    hostAuthentication = "unavailable";
    gaps.push("Codex host authentication unavailable");
  }
  await writeFile(join(home, "config.toml"), "[features]\nhooks = true\n", { mode: 0o600 });
  const hook = resolve(root, "scripts/direct-event-host-hook.mjs");
  await writeFile(join(home, "hooks.json"), `${JSON.stringify({
    hooks: { PostToolUse: [{ matcher: "^(apply_patch|Bash)$", hooks: [{
      type: "command",
      command: `${shellQuote(process.execPath)} ${shellQuote(hook)}`,
      timeout: 20,
    }] }] },
  }, null, 2)}\n`, { mode: 0o600 });

  const answers = Object.fromEntries([
    "r1_inferred_case", "r2_meaningless_combinations", "r3_split_correlations",
    "r4_duplicate_encoding", "r5_absence_confusion", "r6_bare_domain_value",
    "r7_name_wider_than_type", "r8_name_claims_resource", "r9_body_reaches_undeclared",
  ].map((id) => [id, { _tag: "Probability", probability: 0.91 }]));
  const visibilityMarker = `HOOK_ONLY_${randomUUID().replaceAll("-", "")}`;
  const env = {
    ...process.env,
    CODEX_HOME: home,
    REVIEW_STATE_PATH: state,
    REVIEW_RESIDENT_DIR: runtime,
    REVIEW_ACTIVITY_PATH: activityPath,
    REVIEW_HOST_STAGE_PATH: stagesPath,
    REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath: callsPath }),
    REVIEW_VISIBILITY_MARKER: visibilityMarker,
  };
  for (const key of ["OPENAI_API_KEY", "TYPESAFE_API_KEY"]) delete env[key];

  const preview = await run(process.execPath, [join(root, "src/cli.ts"), "--enable"], {
    cwd: root, env, input: JSON.stringify({ version: 1, operation: "enable", cwd: repository }),
  });
  const digest = JSON.parse(preview.stdout).proposal?.digest;
  if (typeof digest !== "string") gaps.push("consent preview failed");
  else await run(process.execPath, [join(root, "src/cli.ts"), "--enable-confirm"], {
    cwd: root, env, input: JSON.stringify({ version: 1, operation: "enable-confirm", cwd: repository, proposalDigest: digest }),
  });

  let host = { code: null, signal: null, stdout: "", stderr: "" };
  if (gaps.length === 0 && hostAuthentication === "available") {
    host = await run("codex", [
      "exec", "--ephemeral", "--json", "--dangerously-bypass-hook-trust",
      "--dangerously-bypass-approvals-and-sandbox", "--ignore-rules", "-C", repository,
      "Use apply_patch exactly once to add profile.ts containing one exported interface named Delivery with fields id:string and destination:string. Then use Bash exactly once to run `printf collection-ready`. If hook context contains a token beginning HOOK_ONLY_, repeat that exact token in your final reply; otherwise reply VISIBILITY_NOT_OBSERVED. Do not inspect files or make other tool calls.",
    ], { cwd: repository, env, timeoutMs: 120_000 });
  }
  const stages = jsonLines(await readFile(stagesPath, "utf8").catch(() => ""));
  const backendCalls = (await readFile(callsPath, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
  const messages = jsonLines(host.stdout).flatMap((entry) =>
    entry?.item?.type === "agent_message" && typeof entry.item.text === "string" ? [entry.item.text] : []);
  const visibility = messages.some((message) => message.includes(visibilityMarker))
    ? "observed-hook-only-value"
    : messages.includes("VISIBILITY_NOT_OBSERVED") ? "not-observed" : "indeterminate";
  const addStage = stages.find((stage) => stage.toolName === "apply_patch");
  const submissionStage = stages.find((stage) => stage.submission === "attempted-unacknowledged");
  const observedSessionId = stages.find((stage) => typeof stage.sessionId === "string")?.sessionId;
  const activity = observedSessionId === undefined
    ? undefined
    : JSON.parse((await run(process.execPath, [join(root, "src/cli.ts"), "--status"], {
        cwd: root,
        env,
        input: JSON.stringify({ version: 1, operation: "status", cwd: repository, sessionId: observedSessionId }),
      })).stdout || "null");
  record = {
    schemaVersion: 1,
    recordedAt: date,
    profile: "direct-event-v1",
    environment: versions,
    mode: "headless command hooks / controlled writer / controlled DecisionModel",
    controlledWriter: true,
    isolation: { temporaryCodexHome: true, temporaryGitRepository: true, retainedSyntheticSource: false },
    addLiveEvidence: {
      hostExitCode: host.code,
      hookEntry: addStage?.hookEntry === true,
      adaptation: addStage?.adaptation ?? "not-observed",
      backendSubmissions: backendCalls,
      hostSubmission: submissionStage?.submission ?? "none",
      activity: activity?.activitySource === "resident-v1"
        ? {
            source: activity.activitySource,
            kind: activity.activity?.kind,
            modelReaction: activity.activity?.modelReaction?.status,
          }
        : { source: "unavailable" },
      independentlyObservedModelVisibility: visibility,
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
    exclusions: { headful: true, otherHosts: true, otherPlatforms: true, otherVersions: true, reliableVisibility: true, guaranteedFinalDrain: true },
    evidenceGaps: gaps,
    verdict: gaps.length > 0 ? "not-run-environment-gap"
      : addStage?.adaptation === "mapped" && backendCalls === 1 && submissionStage !== undefined
        ? "pinned-host-conformant-with-stated-gaps" : "inconclusive",
  };

  if (stages.length > 0) {
    const paths = residentPaths(runtime);
    const owner = await ensureResident(paths).catch(() => undefined);
    if (owner !== undefined) {
      await residentRequest(paths, {
        version: 1, operation: "cleanup", lifetime: owner.lifetime,
      }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      try { process.kill(owner.pid, 0); process.kill(owner.pid, "SIGTERM"); } catch { /* exited */ }
    }
  }

  if (process.argv.includes("--write-evidence")) {
    await mkdir(join(root, "evidence/direct-event-v1"), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
if (record.verdict === "inconclusive") process.exitCode = 1;
