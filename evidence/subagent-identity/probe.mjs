#!/usr/bin/env node
// Bounded native identity probe. Run one host at a time; output is source-free.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.argv[2];
if (host !== "claude" && host !== "codex") throw new Error("usage: node probe.mjs claude|codex");
const capture = resolve(dirname(fileURLToPath(import.meta.url)), "capture.cjs");
const fixture = mkdtempSync(join(host === "codex" ? process.cwd() : tmpdir(), `hapsland-${host}-child-`));
const trace = join(fixture, "identity.jsonl");
const hook = { type: "command", command: `node ${capture}`, timeout: 10 };
const events = ["PreToolUse", "PostToolUse", "SubagentStart", "SubagentStop", "Stop"];
const hooks = Object.fromEntries(events.map((event) => [event, [{ hooks: [hook] }]]));
const configDir = join(fixture, ".claude");
if (host === "claude") mkdirSync(configDir);
const settingsPath = join(configDir, "settings.json");
if (host === "claude") writeFileSync(settingsPath, JSON.stringify({ hooks }));
const git = spawn("git", ["init", "--quiet", fixture], { stdio: "ignore" });
await new Promise((resolveDone) => git.once("close", resolveDone));
const prompt = host === "claude"
  ? "Use a subagent to create child.txt containing only CHILD with its Write tool. Wait for the subagent. Then use your own Write tool to create parent.txt containing only PARENT. Do not use Bash to write either file. This is an isolated hook identity probe."
  : "Spawn a subagent and have it create child.txt containing only CHILD using apply_patch. Wait for it to finish. Then create parent.txt containing only PARENT using apply_patch yourself. Use relative file paths, with no absolute path in either patch. Do not use shell commands to write either file. This is an isolated hook identity probe.";
const command = host === "claude" ? process.env.HAP_CLAUDE_BIN ?? "claude" : process.env.HAP_CODEX_BIN ?? "codex";
const version = spawnSync(command, ["--version"], { encoding: "utf8" }).stdout?.match(/\d+\.\d+\.\d+/)?.[0] ?? "unknown";
const codexHooks = events.flatMap((event) => ["--config",
  `hooks.${event}=[{hooks=[{type="command",command=${JSON.stringify(`node ${capture}`)},timeout=10}]}]`]);
const args = host === "claude"
  ? ["-p", "--output-format", "json", "--no-session-persistence", "--permission-mode", "acceptEdits", "--setting-sources", "project", "--settings", settingsPath, prompt]
  : ["exec", "--ignore-user-config", "--enable", "hooks", "--dangerously-bypass-hook-trust",
    ...codexHooks, "--sandbox", "danger-full-access", "--json", "-C", fixture, prompt];
const child = spawn(command, args, { cwd: fixture, env: { ...process.env, HAP_IDENTITY_TRACE: trace }, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "", stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
const exit = await new Promise((resolveDone) => child.once("close", resolveDone));
clearTimeout(timeout);
let records = [];
try { records = readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse); } catch {}
const exists = (name) => { try { return readFileSync(join(fixture, name), "utf8").trim(); } catch { return null; } };
const editTool = host === "claude" ? "Write" : "apply_patch";
const childStart = records.find((item) => item.event === "SubagentStart" && item.agent !== null);
const childPre = records.find((item) => item.event === "PreToolUse" && item.tool === editTool && item.agent !== null);
const childPost = records.find((item) => item.event === "PostToolUse" && item.tool === editTool && item.agent !== null);
const childStop = records.find((item) => item.event === "SubagentStop" && item.agent !== null);
const parentPre = records.find((item) => item.event === "PreToolUse" && item.tool === editTool && item.agent === null);
const parentPost = records.find((item) => item.event === "PostToolUse" && item.tool === editTool && item.agent === null);
const assertions = {
  hostCompleted: exit === 0 && child.signalCode === null,
  bothEditsCompleted: exists("child.txt") === "CHILD" && exists("parent.txt") === "PARENT",
  childIdentityConsistent: childStart !== undefined && childPre !== undefined && childPost !== undefined &&
    childStop !== undefined && childStart.agent === childPre.agent && childPre.agent === childPost.agent &&
    childPost.agent === childStop.agent && childPre.toolUse === childPost.toolUse,
  childMarkersPresent: childPre?.fields.agent_id === true && childPre?.fields.agent_type === true &&
    childPost?.fields.agent_id === true && childPost?.fields.agent_type === true &&
    childStop?.fields.agent_id === true,
  parentUnmarked: parentPre !== undefined && parentPost !== undefined &&
    parentPre.toolUse === parentPost.toolUse &&
    [parentPre, parentPost].every((item) => !item.fields.agent_id && !item.fields.agent_type &&
      !item.fields.agent_transcript_path),
  sharedSession: childPre !== undefined && parentPre !== undefined && childPre.session === parentPre.session,
  separateCodexTurns: host === "claude" ||
    (childPre !== undefined && parentPre !== undefined && childPre.turn !== parentPre.turn),
};
const result = {
  host,
  version,
  platform: process.platform,
  arch: process.arch,
  mode: host === "claude" ? "headless print, project hooks, acceptEdits" :
    "exec, inline hooks, danger-full-access sandbox, isolated fixture",
  assertions,
  events: records,
  // Source and model output remain in the temporary fixture and are removed below.
  hostOutput: {
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr),
    eventTypes: host === "codex" ? stdout.split("\n").flatMap((line) => {
      try { const event = JSON.parse(line); return typeof event.type === "string" ? [{
        type: event.type, itemType: event.item?.type ?? null,
        itemName: event.item?.name ?? null, itemStatus: event.item?.status ?? null,
      }] : []; }
      catch { return []; }
    }) : [],
    stderrHasError: /error|failed|invalid/i.test(stderr),
    stderrHasWarning: /warn/i.test(stderr),
    stderrTopics: ["hook", "config", "auth", "model", "sandbox", "trust", "agent"].filter((word) =>
      stderr.toLowerCase().includes(word)),
  },
};
console.log(JSON.stringify(result, null, 2));
rmSync(fixture, { recursive: true, force: true });
if (Object.values(assertions).some((passed) => !passed)) process.exitCode = 1;
