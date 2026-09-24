// Run one preregistered issue #95 arm in a disposable repository.
// Raw Codex and Jev material stays in memory or temporary private files.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeTypeFile } from "../../../src/direct-event/analyzer.ts";
import { residentRequest } from "../../../src/resident/client.ts";
import { residentPaths } from "../../../src/resident/paths.ts";

const directory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const project = resolve(directory, "../../..");
const arm = process.argv[2];
const pair = Number(process.argv[3]);
if (!["A", "B"].includes(arm) || ![1, 2].includes(pair)) {
  throw new Error("Usage: node run-session.mjs A|B 1|2");
}
const promptPath = join(directory, "prompt.md");
const prompt = await readFile(promptPath, "utf8");
const promptSha256 = createHash("sha256").update(prompt).digest("hex");
if (promptSha256 !== "0ec22a3c04928da18bdd48e52644eff153371acfefa92a03ea1f36af58d46074") {
  throw new Error("Accepted prompt changed after registration");
}
const instruction = "After implementing the task and running your tests, review your own changes for correctness and type/API design, make any repairs you judge necessary, and report what you verified.";
const testedPrompt = `${prompt}\n${instruction}\n`;
const outputRoot = join(directory, "runs", `pair-${pair}-${arm}`);
const temporary = await mkdtemp(join(tmpdir(), "hapsland-95-pair-"));
const repo = join(temporary, "repo");
const home = join(temporary, "codex-home");
const state = join(temporary, "state");
const ledger = join(temporary, "provider-requests.jsonl");
const providerEvents = join(temporary, "provider-events.jsonl");
const hookEvents = join(temporary, "hook-events.jsonl");
const credentialFile = join(temporary, "jev-credential");
const cli = join(project, "src/cli.ts");
const started = Date.now();
let residentOwner;

async function command(executable, args, options = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? project,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const maximumOutput = options.maximumOutput ?? 16 * 1024 * 1024;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, options.timeoutMs ?? 10_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length < maximumOutput) stdout += chunk;
      options.onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < maximumOutput) stderr += chunk;
    });
    child.once("error", rejectCommand);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveCommand({ code, signal, timedOut, stdout, stderr });
    });
    child.stdin.end(options.input ?? "");
  });
}

function parseJsonLines(value) {
  return value.split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

async function readJsonLines(path) {
  return parseJsonLines(await readFile(path, "utf8").catch(() => ""));
}

async function safeTreeCopy(from, to, depth = 0) {
  if (depth > 5) throw new Error("Generated tree is too deep");
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" ||
      entry.name.startsWith(".env") || entry.name === "auth.json") continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    const metadata = await lstat(source);
    if (metadata.isSymbolicLink()) continue;
    if (metadata.isDirectory()) await safeTreeCopy(source, target, depth + 1);
    else if (metadata.isFile() && metadata.size <= 128 * 1024) await copyFile(source, target);
  }
}

async function activitySummary(path) {
  const counts = {};
  const events = [];
  for (const session of await readdir(path).catch(() => [])) {
    for (const file of await readdir(join(path, session)).catch(() => [])) {
      if (!file.endsWith(".json")) continue;
      let marker;
      try { marker = JSON.parse(await readFile(join(path, session, file), "utf8")); } catch { continue; }
      const stage = marker.kind === "submission" ? "submitted" : marker.stage;
      if (typeof stage !== "string") continue;
      counts[stage] = (counts[stage] ?? 0) + 1;
      events.push({ atMs: marker.observedAt - started, stage, findings: marker.findings ?? 0 });
    }
  }
  events.sort((left, right) => left.atMs - right.atMs);
  return { counts, events };
}

async function analyzerSummary(path) {
  const result = [];
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      const candidate = join(folder, entry.name);
      if (entry.isDirectory()) await visit(candidate);
      else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) {
        const relative = candidate.slice(path.length + 1);
        const source = await readFile(candidate, "utf8");
        const analysis = analyzeTypeFile(relative, source);
        result.push({
          path: relative,
          status: analysis.status,
          reason: analysis.status === "unsupported" ? analysis.reason : undefined,
          units: analysis.status === "analyzed"
            ? analysis.units.map((unit) => ({
                name: unit.status === "ready" ? unit.unit.root.artifact.name : unit.root.name,
                status: unit.status,
                reason: unit.status === "unsupported" ? unit.reason : undefined,
              }))
            : [],
        });
      }
    }
  }
  await visit(path);
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

function credentialFromEnvFile(contents) {
  const value = contents.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1];
  return value?.replace(/^(['"])(.*)\1$/, "$2");
}

try {
  await mkdir(repo, { mode: 0o700 });
  await mkdir(home, { mode: 0o700 });
  await mkdir(state, { mode: 0o700 });
  await copyFile("/home/node/.codex/auth.json", join(home, "auth.json"));
  await chmod(join(home, "auth.json"), 0o600);
  const git = await command("git", ["init", "--quiet", "--initial-branch=master"], { cwd: repo });
  if (git.code !== 0) throw new Error("Unable to initialize isolated Git repository");
  await writeFile(join(home, "config.toml"), "[features]\nhooks = true\n", { mode: 0o600 });

  const environment = {
    ...process.env,
    CODEX_HOME: home,
    REVIEW_STATE_PATH: join(state, "consent"),
    REVIEW_ACTIVITY_PATH: join(state, "activity"),
    REVIEW_RESIDENT_DIR: join(state, "resident"),
    REVIEW_USER_CONFIG_PATH: join(state, "absent-user-config.jsonc"),
    HAPSLAND_95_PROVIDER_LEDGER: ledger,
    HAPSLAND_95_PROVIDER_EVENTS: providerEvents,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${join(directory, "provider-guard.mjs")}`.trim(),
  };
  delete environment.TYPESAFE_API_KEY;
  delete environment.OPENAI_API_KEY;

  if (arm === "A") {
    const credential = credentialFromEnvFile(await readFile(join(project, ".env"), "utf8"));
    if (!credential) throw new Error("Jev credential is unavailable in the primary checkout");
    await writeFile(credentialFile, credential, { mode: 0o600 });
    environment.HAPSLAND_95_CLI = cli;
    environment.HAPSLAND_95_HOOK_EVENTS = hookEvents;
    environment.HAPSLAND_95_CREDENTIAL_FILE = credentialFile;
    const hookCommand = `${JSON.stringify(process.execPath)} ${JSON.stringify(join(directory, "hook-observer.mjs"))}`;
    await writeFile(join(home, "hooks.json"), JSON.stringify({ hooks: { PostToolUse: [
      { matcher: "^(apply_patch|Bash)$", hooks: [{ type: "command", command: hookCommand, timeout: 20 }] },
    ] } }), { mode: 0o600 });
    const preview = await command(process.execPath, [cli, "--enable"], {
      cwd: repo, env: environment,
      input: JSON.stringify({ version: 1, operation: "enable", cwd: repo }),
    });
    let digest;
    try { digest = JSON.parse(preview.stdout)?.proposal?.digest; } catch { digest = undefined; }
    if (preview.code !== 0 || typeof digest !== "string") throw new Error("Hapsland consent preview failed");
    const confirmed = await command(process.execPath, [cli, "--enable-confirm"], {
      cwd: repo, env: environment,
      input: JSON.stringify({ version: 1, operation: "enable-confirm", cwd: repo, proposalDigest: digest }),
    });
    let enabled;
    try { enabled = JSON.parse(confirmed.stdout)?.status === "enabled"; } catch { enabled = false; }
    if (confirmed.code !== 0 || !enabled) throw new Error("Hapsland consent confirmation failed");
  }

  const hostEvents = [];
  let partialLine = "";
  const hostStarted = Date.now();
  const host = await command("npm", [
    "exec", "--yes", "--package=@openai/codex@0.155.1", "--", "codex", "exec",
    "--ephemeral", "--json", "--dangerously-bypass-hook-trust",
    "--dangerously-bypass-approvals-and-sandbox", "--ignore-rules",
    "-m", "gpt-6-luna", "-c", "model_reasoning_effort=max", "-C", repo, testedPrompt,
  ], {
    cwd: repo,
    env: environment,
    timeoutMs: 20 * 60_000,
    maximumOutput: 0,
    onStdout(chunk) {
      partialLine += chunk;
      const lines = partialLine.split("\n");
      partialLine = lines.pop() ?? "";
      for (const line of lines) {
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        const message = event.item?.type === "agent_message" ? event.item.text ?? "" : "";
        hostEvents.push({
          atMs: Date.now() - started,
          type: event.type,
          itemType: event.item?.type,
          mentionsHapsland: /Hapsland|Advisory direct-event review|Jev review/i.test(message),
          mentionsReviewFeedback: /automated review|review feedback|review finding/i.test(message),
          usage: event.type === "turn.completed" ? event.usage : undefined,
        });
      }
    },
  });
  const hostEnded = Date.now();

  await mkdir(outputRoot, { recursive: true });
  await safeTreeCopy(repo, join(outputRoot, "tree"));
  const analyzer = await analyzerSummary(repo);
  let packageJson;
  try { packageJson = JSON.parse(await readFile(join(repo, "package.json"), "utf8")); }
  catch { packageJson = {}; }
  const verification = {};
  for (const [name, args] of [["typecheck", ["run", "typecheck"]], ["test", ["test"]]]) {
    if (name === "typecheck" && typeof packageJson.scripts?.typecheck !== "string") {
      verification[name] = { status: "missing-command" };
      continue;
    }
    if (name === "test" && typeof packageJson.scripts?.test !== "string") {
      verification[name] = { status: "missing-command" };
      continue;
    }
    const result = await command("npm", args, { cwd: repo, env: environment, timeoutMs: 120_000 });
    verification[name] = { status: result.code === 0 ? "passed" : "failed", exitCode: result.code, timedOut: result.timedOut };
  }
  const calls = await readJsonLines(ledger);
  const completions = await readJsonLines(providerEvents);
  const hooks = await readJsonLines(hookEvents);
  const activity = await activitySummary(join(state, "activity"));
  const usage = hostEvents.filter((event) => event.usage !== undefined).map((event) => event.usage);
  const record = {
    schemaVersion: 1,
    pair,
    arm,
    recordedAt: new Date().toISOString(),
    host: { version: "0.155.1", model: "gpt-6-luna", reasoning: "max", platform: `${process.platform}-${process.arch}`, sandboxBypass: true, hookTrustBypass: true },
    promptSha256,
    proceduralInstructionSha256: createHash("sha256").update(instruction).digest("hex"),
    hostExitCode: host.code,
    hostSignal: host.signal,
    hostTimedOut: host.timedOut,
    hostElapsedMs: hostEnded - hostStarted,
    setupAndHostElapsedMs: hostEnded - started,
    hostStderrBytes: Buffer.byteLength(host.stderr, "utf8"),
    hostKnownErrors: { bwrap: host.stderr.includes("bwrap:"), modelUnavailable: /model.*not.*found|unknown model/i.test(host.stderr) },
    hostEvents,
    hostReportedUsage: usage,
    hostReportedCostUsd: null,
    jevReportedCostUsd: null,
    providerRequests: calls.length,
    providerRequestBytes: calls.reduce((sum, item) => sum + (item.requestBytes ?? 0), 0),
    providerEvents: completions.map((event) => ({ ...event, atMs: event.at - started, at: undefined })),
    hooks: hooks.map((event) => ({ ...event, atMs: event.at - started, at: undefined })),
    activity,
    analyzer,
    verification,
    rawHostTranscriptRetained: false,
    rawJevMaterialRetained: false,
  };
  await writeFile(join(outputRoot, "sanitized.json"), `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ pair, arm, hostExitCode: host.code, hostTimedOut: host.timedOut, providerRequests: calls.length, artifact: join(outputRoot, "sanitized.json") })}\n`);
} finally {
  try { residentOwner = JSON.parse(await readFile(residentPaths(join(state, "resident")).owner, "utf8")); } catch { residentOwner = undefined; }
  if (residentOwner) {
    const paths = residentPaths(join(state, "resident"));
    await residentRequest(paths, { version: 1, operation: "cleanup", lifetime: residentOwner.lifetime }).catch(() => {});
    try { process.kill(residentOwner.pid, "SIGTERM"); } catch { /* already gone */ }
  }
  await rm(temporary, { recursive: true, force: true });
}
