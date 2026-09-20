import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const capturePath = process.env.REVIEW_PROBE_CAPTURE;
if (typeof capturePath !== "string" || capturePath === "") {
  process.exit(0);
}

const readJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const input = readJson(readFileSync(0, "utf8")) ?? {};
const eventName = typeof input.hook_event_name === "string" ? input.hook_event_name : "<missing>";
const targetNames = (() => {
  const value = process.env.REVIEW_PROBE_TARGETS;
  if (typeof value !== "string" || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((name) => typeof name === "string" && /^[-a-zA-Z0-9_./]+$/.test(name))
      : [];
  } catch {
    return [];
  }
})();

const snapshot = (relativePath) => {
  const path = resolve(process.cwd(), relativePath);
  try {
    const stats = statSync(path);
    if (!stats.isFile()) return { path: relativePath, exists: true, regularFile: false };
    const content = readFileSync(path);
    return {
      path: relativePath,
      exists: true,
      regularFile: true,
      size: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  } catch {
    return { path: relativePath, exists: false };
  }
};

const safeKeys = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];

const safeStatus = (value) => {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && /^(success|succeeded|failed|error|completed|running|cancelled|canceled)$/i.test(value)) {
    return value.toLowerCase();
  }
  return undefined;
};

const toolResponseSummary = (() => {
  const response = input.tool_response;
  if (response === null || response === undefined) return { type: "null" };
  if (typeof response !== "object") {
    const summary = { type: typeof response };
    if (typeof response === "string") {
      const match = response.match(/\b(?:exit(?:[ _-]code|[ _-]status)?|status)\s*[:=]?\s*(-?\d+)\b/i);
      if (match !== null) summary.exitCode = Number(match[1]);
    }
    return summary;
  }
  const summary = { type: Array.isArray(response) ? "array" : "object", keys: safeKeys(response) };
  for (const key of ["exit_code", "exitCode", "status", "success"]) {
    const value = safeStatus(response[key]);
    if (value !== undefined) summary[key] = value;
  }
  return summary;
})();

const stopBlocks = Number(process.env.REVIEW_PROBE_STOP_BLOCKS ?? "0");
const statePath = process.env.REVIEW_PROBE_STOP_STATE;
let stopAttempt = 0;
if (eventName === "Stop" && typeof statePath === "string" && statePath !== "") {
  try {
    stopAttempt = Number(readFileSync(statePath, "utf8")) || 0;
  } catch {
    stopAttempt = 0;
  }
  writeFileSync(statePath, `${stopAttempt + 1}\n`, { mode: 0o600 });
}
const stopDecision = eventName === "Stop" && stopAttempt < stopBlocks ? "block" : eventName === "Stop" ? "allow" : undefined;

const startedAtMs = Number(process.env.REVIEW_PROBE_STARTED_AT_MS ?? Date.now());
const record = {
  observedAfterMs: Math.max(0, Date.now() - startedAtMs),
  event: eventName,
  tool: typeof input.tool_name === "string" ? input.tool_name : undefined,
  permissionMode: typeof input.permission_mode === "string" ? input.permission_mode : undefined,
  stopHookActive: typeof input.stop_hook_active === "boolean" ? input.stop_hook_active : undefined,
  sessionStartSource: typeof input.source === "string" ? input.source : undefined,
  sessionEndReason: typeof input.reason === "string" && /^(clear|logout|prompt_exit|other|completed|interrupted)$/i.test(input.reason)
    ? input.reason
    : undefined,
  inputKeys: safeKeys(input),
  promptLength: typeof input.prompt === "string" ? input.prompt.length : undefined,
  lastAssistantMessageLength: typeof input.last_assistant_message === "string" ? input.last_assistant_message.length : undefined,
  toolInputKeys: safeKeys(input.tool_input),
  toolResponse: toolResponseSummary,
  targets: targetNames.map(snapshot),
  stopAttempt: eventName === "Stop" ? stopAttempt + 1 : undefined,
  stopDecision,
};

for (const key of Object.keys(record)) {
  if (record[key] === undefined) delete record[key];
}

appendFileSync(capturePath, `${JSON.stringify(record)}\n`, { mode: 0o600 });

if (eventName !== "Stop") process.exit(0);

if (stopAttempt < stopBlocks) {
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: "Synthetic issue-4 lifecycle continuation probe.",
  }));
} else {
  process.stdout.write("{}");
}
