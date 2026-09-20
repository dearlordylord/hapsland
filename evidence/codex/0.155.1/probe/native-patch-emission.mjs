import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const hookScript = join(repoRoot, "evidence/codex/0.155.1/probe/capture-hook.mjs");
const updateMode = process.argv.includes("--update") || process.argv.includes("--interface");
const interfaceMode = process.argv.includes("--interface");
const targetPath = updateMode ? "baseline.ts" : "native-probe.ts";
const outputPath = join(
  repoRoot,
  `evidence/codex/0.155.1/native-${interfaceMode ? "interface-edit" : updateMode ? "update" : "patch"}-emission-2026-09-20.json`,
);
const run = (command, args, options = {}) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        reject(new Error("command-timeout"));
      }
    }, options.timeoutMs ?? 120_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise({ code, signal, stdout, stderr });
    });
  });

const git = (repository, args) => run("git", ["-C", repository, ...args], { timeoutMs: 20_000 });

const readJsonLines = async (path) => {
  const text = await readFile(path, "utf8");
  return text.split("\n").filter(Boolean).flatMap((line) => {
    try {
      const value = JSON.parse(line);
      return value && typeof value === "object" ? [value] : [];
    } catch {
      return [];
    }
  });
};

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const summarizeJsonl = (text) => text.split("\n").filter(Boolean).flatMap((line) => {
  try {
    const value = JSON.parse(line);
    if (value === null || typeof value !== "object") return [];
    const summary = { type: typeof value.type === "string" ? value.type : "<missing>" };
    if (typeof value.item?.type === "string") summary.itemType = value.item.type;
    if (typeof value.item?.name === "string") summary.itemName = value.item.name;
    if (typeof value.status === "string") summary.status = value.status;
    return [summary];
  } catch {
    return [{ type: "<unparseable-json-line>" }];
  }
});

const runProbe = async () => {
  const parent = await mkdtemp(join(tmpdir(), "codex-native-patch-emission-"));
  const repository = join(parent, "repository");
  const home = join(parent, "codex-home");
  const capturePath = join(parent, "hook-events.jsonl");
  await run("mkdir", ["-p", repository, home]);
  await chmod(home, 0o700);
  await git(repository, ["init", "--quiet", "--initial-branch=master"]);
  await git(repository, ["config", "user.name", "Native Patch Probe"]);
  await git(repository, ["config", "user.email", "native-patch-probe@example.invalid"]);
  const baseline = interfaceMode
    ? [
      "export interface Delivery {",
      "  id: string;",
      "  channel: DeliveryChannel;",
      "  email?: string;",
      "  phone?: string;",
      '  priority: "normal" | "urgent";',
      "  retries: number;",
      "  scheduledAt?: string;",
      "  metadata: Record<string, string>;",
      "}",
      "",
    ].join("\n")
    : "export const baseline = 1;\n";
  await writeFile(join(repository, "baseline.ts"), baseline, { mode: 0o600 });
  await git(repository, ["add", "baseline.ts"]);
  await git(repository, ["commit", "--quiet", "-m", "synthetic baseline"]);
  await writeFile(capturePath, "", { mode: 0o600 });

  let authAvailable = true;
  try {
    await copyFile("/home/node/.codex/auth.json", join(home, "auth.json"));
    await chmod(join(home, "auth.json"), 0o600);
  } catch {
    authAvailable = false;
  }
  await writeFile(join(home, "config.toml"), "[features]\nhooks = true\n", { mode: 0o600 });
  const hooks = {
    description: "Isolated native apply_patch emission probe; never install as user configuration.",
    hooks: {
      PostToolUse: [{
        matcher: "^apply_patch$",
        hooks: [{
          type: "command",
          command: `${process.execPath} ${shellQuote(hookScript)} native-patch`,
          timeout: 10,
        }],
      }],
    },
  };
  await writeFile(join(home, "hooks.json"), `${JSON.stringify(hooks, null, 2)}\n`, { mode: 0o600 });

  let processResult = { code: null, signal: null, stdout: "", stderr: "", skipped: !authAvailable };
  if (authAvailable) {
    const env = {
      ...process.env,
      CODEX_HOME: home,
      REVIEW_PROBE_CAPTURE: capturePath,
    };
    for (const key of ["CODEX_SESSION_ID", "CODEX_THREAD_ID", "OPENAI_API_KEY", "TYPESAFE_API_KEY"]) {
      delete env[key];
    }
    processResult = await run("codex", [
      "exec",
      "--ephemeral",
      "--json",
      "--dangerously-bypass-hook-trust",
      "--dangerously-bypass-approvals-and-sandbox",
      "--ignore-rules",
      "-C",
      repository,
      interfaceMode
        ? "Use apply_patch exactly once. Update existing baseline.ts by changing exactly `email?: string;` to `email: string;` in the Delivery interface. Do not use Bash, inspect files, make another tool call, or edit another path. Then reply DONE."
        : updateMode
        ? "Use apply_patch exactly once. Update existing baseline.ts by adding exactly `export const nativeProbe = true;` after the existing export. Do not use Bash, inspect files, make another tool call, or edit another path. Then reply DONE."
        : "Use apply_patch exactly once. Add a new file named native-probe.ts containing exactly `export const nativeProbe = true;` and no other content. Do not use Bash, inspect files, make another tool call, or edit another path. Then reply DONE.",
    ], { cwd: repository, env, timeoutMs: 120_000 });
  }

  const events = authAvailable ? await readJsonLines(capturePath) : [];
  const nativeEvents = events.filter((event) => event.hook_event_name === "PostToolUse" && event.tool_name === "apply_patch");
  const event = nativeEvents[0];
  const command = typeof event?.tool_input?.command === "string"
    ? event.tool_input.command.replaceAll(repository, "<WORKSPACE>")
    : undefined;
  let content;
  try {
    content = await readFile(join(repository, targetPath), "utf8");
  } catch {
    content = undefined;
  }
  const evidence = {
    evidenceVersion: 1,
    date: "2026-09-20",
    host: "codex-cli 0.155.1",
    mode: "codex exec --ephemeral --json",
    isolation: {
      temporaryCodexHome: true,
      temporaryRepository: true,
      credentialsCopiedToTemporaryHome: authAvailable,
      sourceAndCredentialsRetained: false,
    },
    request: {
      instruction: interfaceMode
        ? "one native apply_patch call changing one line in a 10-line interface; no Bash or other tool call"
        : updateMode
        ? "one native apply_patch call updating baseline.ts; no Bash or other tool call"
        : "one native apply_patch call adding native-probe.ts; no Bash or other tool call",
      toolName: event?.tool_name,
      toolInputKeys: event?.tool_input && typeof event.tool_input === "object" ? Object.keys(event.tool_input) : [],
      command,
    },
    postToolUseEnvelope: event === undefined ? undefined : {
      keys: Object.keys(event).sort(),
      sessionId: event.session_id,
      turnId: event.turn_id,
      transcriptPath: event.transcript_path,
      cwd: event.cwd,
      hookEventName: event.hook_event_name,
      model: event.model,
      permissionMode: event.permission_mode,
      toolName: event.tool_name,
      toolInput: { command },
      toolResponse: event.tool_response,
      toolUseId: event.tool_use_id,
    },
    result: {
      codexExitCode: processResult.code,
      codexSignal: processResult.signal,
      postToolUseEvents: nativeEvents.length,
      fileChanged: content !== undefined,
      fileSha256: content === undefined ? undefined : sha256(content),
      fileBytes: content === undefined ? undefined : Buffer.byteLength(content),
      hostJsonlEvents: summarizeJsonl(processResult.stdout),
    },
    sanitization: "Session, turn, tool-use, model, response, workspace, and authentication identities are redacted; the retained patch content is synthetic.",
    verdict: authAvailable && nativeEvents.length === 1 && typeof command === "string" && content !== undefined
      ? "runtime-tested"
      : authAvailable ? "runtime-inconclusive" : "not-run-credentials-unavailable",
  };
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await rm(parent, { recursive: true, force: true });
  return evidence;
};

runProbe()
  .then((evidence) => {
    process.stdout.write(`${JSON.stringify({
      verdict: evidence.verdict,
      toolName: evidence.request.toolName,
      command: evidence.request.command,
      postToolUseEvents: evidence.result.postToolUseEvents,
      fileChanged: evidence.result.fileChanged,
    })}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "probe-failed"}\n`);
    process.exitCode = 1;
  });
