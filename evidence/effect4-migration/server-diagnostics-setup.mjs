// Diagnostic-only hooks: hashed test identity, timing and memory; no input payloads.
import { beforeEach, afterEach } from "vitest";
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";

const output = process.env.HAPSLAND_DIAGNOSTIC_OUTPUT;
if (output === undefined) throw new Error("diagnostic output path required");
const delay = monitorEventLoopDelay({ resolution: 10 });
delay.enable();
let start;
const identity = (task) => createHash("sha256").update(task.name).digest("hex").slice(0, 16);
beforeEach(({ task }) => {
  delay.reset();
  start = performance.now();
  appendFileSync(output, `${JSON.stringify({ phase: "start", testHash: identity(task), atMs: start, ...process.memoryUsage() })}\n`);
});
afterEach(({ task }) => {
  appendFileSync(output, `${JSON.stringify({ phase: "finish", testHash: identity(task), durationMs: performance.now() - start,
    eventLoopMaxMs: delay.max / 1e6, ...process.memoryUsage() })}\n`);
});
