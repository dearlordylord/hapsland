// Forwards the production hook response while recording source-free delivery facts.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const startedAt = Date.now();
const input = readFileSync(0, "utf8");
let nativeEvent;
try { nativeEvent = JSON.parse(input); } catch { nativeEvent = undefined; }
const credentialFile = process.env.HAPSLAND_95_CREDENTIAL_FILE;
const credential = credentialFile ? readFileSync(credentialFile, "utf8").trim() : "";
const hookEnvironment = { ...process.env, TYPESAFE_API_KEY: credential };

const result = spawnSync(process.execPath, [process.env.HAPSLAND_95_CLI, "--codex-hook", "--controlled-writer"], {
  input,
  encoding: "utf8",
  env: hookEnvironment,
  maxBuffer: 1024 * 1024,
  timeout: 18_000,
});
const output = result.stdout ?? "";
let decoded;
try { decoded = JSON.parse(output); } catch { decoded = undefined; }
const context = decoded?.hookSpecificOutput?.additionalContext;
const advice = typeof context === "string" && context.startsWith("Advisory direct-event review");
const ruleIds = advice
  ? [...context.matchAll(/\[([a-z0-9_/-]+), p=/g)].map((match) => match[1])
  : [];
const path = process.env.HAPSLAND_95_HOOK_EVENTS;
if (path) {
  appendFileSync(path, `${JSON.stringify({
    kind: "hook",
    at: startedAt,
    durationMs: Date.now() - startedAt,
    tool: nativeEvent?.tool_name ?? "unknown",
    exitCode: result.status,
    signal: result.signal ?? null,
    responseBytes: Buffer.byteLength(output, "utf8"),
    advice,
    findingCount: ruleIds.length,
    ruleIds,
    operationalNotice: typeof context === "string" && context.includes("Operational notice:"),
  })}\n`, { mode: 0o600 });
}
process.stdout.write(output);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
