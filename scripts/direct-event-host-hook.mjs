import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import * as Effect from "effect/Effect";
import { adaptCodexDirectEvent } from "../src/direct-event/adapter.ts";

const input = readFileSync(0, "utf8");
let event;
try { event = JSON.parse(input); } catch { event = undefined; }
const adapted = event === undefined
  ? undefined
  : await Effect.runPromise(adaptCodexDirectEvent(event));
const product = spawnSync(
  process.execPath,
  [new URL("../src/cli.ts", import.meta.url).pathname, "--codex-hook", "--controlled", "--controlled-writer"],
  { input, encoding: "utf8", env: process.env, maxBuffer: 1024 * 1024 },
);
let output;
try { output = JSON.parse(product.stdout); } catch { output = undefined; }
const record = {
  hookEntry: event?.hook_event_name === "PostToolUse",
  toolName: typeof event?.tool_name === "string" ? event.tool_name : "unknown",
  adaptation: adapted === undefined ? "not-mapped" : "mapped",
  candidateCount: adapted?.candidates.length ?? 0,
  candidateOperations: adapted?.candidates.map(({ operation }) => operation) ?? [],
  submission: output?.hookSpecificOutput?.hookEventName === "PostToolUse"
    ? "attempted-unacknowledged"
    : "none",
  productExitCode: product.status,
};
if (process.env.REVIEW_HOST_STAGE_PATH !== undefined) {
  appendFileSync(process.env.REVIEW_HOST_STAGE_PATH, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}
process.stdout.write(product.stdout);
process.stderr.write(product.stderr);
process.exitCode = product.status ?? 1;
