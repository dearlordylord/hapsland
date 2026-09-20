import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { inputComparisonFixtures } from "../../../../experiments/input-contract-comparison/fixtures.ts";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const hookScript = join(repoRoot, "evidence/codex/0.155.1/probe/capture-hook.mjs");
const outputPath = join(repoRoot, "evidence/codex/0.155.1/native-patch-corpus-2026-09-20.json");

const run = (command, args, options = {}) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
    if (!settled) { settled = true; reject(new Error("command-timeout")); }
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
const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const readJsonLines = async (path) => (await readFile(path, "utf8")).split("\n").filter(Boolean).flatMap((line) => {
  try {
    const value = JSON.parse(line);
    return value && typeof value === "object" ? [value] : [];
  } catch { return []; }
});
const summarizeJsonl = (text) => text.split("\n").filter(Boolean).flatMap((line) => {
  try {
    const value = JSON.parse(line);
    if (!value || typeof value !== "object") return [];
    return [{
      type: typeof value.type === "string" ? value.type : "<missing>",
      ...(typeof value.item?.type === "string" ? { itemType: value.item.type } : {}),
    }];
  } catch { return [{ type: "<unparseable-json-line>" }]; }
});

const editBlocks = (before, after) => {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let beforeEnd = beforeLines.length;
  let afterEnd = afterLines.length;
  while (beforeEnd > prefix && afterEnd > prefix && beforeLines[beforeEnd - 1] === afterLines[afterEnd - 1]) { beforeEnd -= 1; afterEnd -= 1; }
  return { beforeLines, afterLines, prefix, beforeBlock: beforeLines.slice(prefix, beforeEnd), afterBlock: afterLines.slice(prefix, afterEnd) };
};

const promptFor = (fixture) => {
  const { beforeBlock, afterBlock, prefix, beforeLines } = editBlocks(fixture.before, fixture.after);
  const location = beforeLines[Math.max(0, prefix - 1)] ?? "the start of the file";
  const block = (lines) => lines.length === 0 ? "(empty)" : lines.join("\n");
  if (beforeBlock.length === 0) return `Use apply_patch exactly once. In ${fixture.path}, add exactly this line immediately after the existing line ${JSON.stringify(location)}:\n${block(afterBlock)}\nDo not use Bash, inspect files, make another tool call, or edit another path. Then reply DONE.`;
  if (afterBlock.length === 0) return `Use apply_patch exactly once. In ${fixture.path}, remove exactly this block:\n${block(beforeBlock)}\nDo not use Bash, inspect files, make another tool call, or edit another path. Then reply DONE.`;
  return `Use apply_patch exactly once. In ${fixture.path}, replace exactly this block:\n${block(beforeBlock)}\nwith:\n${block(afterBlock)}\nDo not use Bash, inspect files, make another tool call, or edit another path. Then reply DONE.`;
};

const runFixture = async (fixture) => {
  const parent = await mkdtemp(join(tmpdir(), "codex-patch-corpus-"));
  const repository = join(parent, "repository");
  const home = join(parent, "codex-home");
  const capturePath = join(parent, "hook-events.jsonl");
  try {
    await run("mkdir", ["-p", repository, home]);
    await chmod(home, 0o700);
    await git(repository, ["init", "--quiet", "--initial-branch=master"]);
    await git(repository, ["config", "user.name", "Codex Patch Corpus Probe"]);
    await git(repository, ["config", "user.email", "codex-patch-corpus@example.invalid"]);
    const target = join(repository, fixture.path);
    await run("mkdir", ["-p", dirname(target)]);
    await writeFile(target, fixture.before, { mode: 0o600 });
    await git(repository, ["add", fixture.path]);
    await git(repository, ["commit", "--quiet", "-m", "synthetic fixture baseline"]);
    await writeFile(capturePath, "", { mode: 0o600 });
    let authAvailable = true;
    try {
      await copyFile("/home/node/.codex/auth.json", join(home, "auth.json"));
      await chmod(join(home, "auth.json"), 0o600);
    } catch { authAvailable = false; }
    await writeFile(join(home, "config.toml"), "[features]\nhooks = true\n", { mode: 0o600 });
    await writeFile(join(home, "hooks.json"), `${JSON.stringify({
      description: "Isolated native apply_patch corpus probe; never install as user configuration.",
      hooks: { PostToolUse: [{ matcher: "^apply_patch$", hooks: [{ type: "command", command: `${process.execPath} ${shellQuote(hookScript)} native-patch-corpus`, timeout: 10 }] }] },
    }, null, 2)}\n`, { mode: 0o600 });
    if (!authAvailable) return { fixtureId: fixture.id, path: fixture.path, verdict: "not-run-credentials-unavailable" };
    const env = { ...process.env, CODEX_HOME: home, REVIEW_PROBE_CAPTURE: capturePath };
    for (const key of ["CODEX_SESSION_ID", "CODEX_THREAD_ID", "OPENAI_API_KEY", "TYPESAFE_API_KEY"]) delete env[key];
    const processResult = await run("codex", [
      "exec", "--ephemeral", "--json", "--dangerously-bypass-hook-trust", "--dangerously-bypass-approvals-and-sandbox", "--ignore-rules", "-C", repository,
      `${promptFor(fixture)} Then reply DONE.`,
    ], { cwd: repository, env, timeoutMs: 120_000 });
    const events = await readJsonLines(capturePath);
    const nativeEvents = events.filter((event) => event.hook_event_name === "PostToolUse" && event.tool_name === "apply_patch");
    const event = nativeEvents[0];
    const command = typeof event?.tool_input?.command === "string" ? event.tool_input.command.replaceAll(repository, "<WORKSPACE>") : undefined;
    const content = await readFile(target, "utf8").catch(() => undefined);
    const fileMatches = content === fixture.after;
    const status = processResult.code === 0 && nativeEvents.length === 1 && command !== undefined && fileMatches ? "runtime-tested" : "runtime-inconclusive";
    return {
      fixtureId: fixture.id,
      path: fixture.path,
      verdict: status,
      command,
      postToolUseEnvelope: event === undefined ? undefined : {
        hookEventName: event.hook_event_name,
        toolName: event.tool_name,
        toolInput: { command },
        toolResponse: event.tool_response,
        toolUseId: event.tool_use_id,
      },
      result: {
        codexExitCode: processResult.code,
        codexSignal: processResult.signal,
        postToolUseEvents: nativeEvents.length,
        fileSha256: content === undefined ? undefined : sha256(content),
        expectedFileSha256: sha256(fixture.after),
        fileMatches,
        hostJsonlEvents: summarizeJsonl(processResult.stdout),
      },
      sanitization: "Session, turn, model, response, workspace, and authentication identities are redacted; fixture source is synthetic and already checked in.",
    };
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
};

const rows = [];
for (const fixture of inputComparisonFixtures) {
  process.stderr.write(`capturing ${fixture.id}\n`);
  rows.push(await runFixture(fixture));
}
const report = {
  evidenceVersion: 1,
  date: "2026-09-20",
  host: "codex-cli 0.155.1",
  mode: "codex exec --ephemeral --json",
  fixtureCount: rows.length,
  runtimeTested: rows.filter((row) => row.verdict === "runtime-tested").length,
  rows,
  verdict: rows.every((row) => row.verdict === "runtime-tested") ? "runtime-tested" : "inconclusive",
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outputPath, fixtureCount: report.fixtureCount, runtimeTested: report.runtimeTested, verdict: report.verdict })}\n`);
