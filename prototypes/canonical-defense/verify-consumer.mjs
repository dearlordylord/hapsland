import assert from "node:assert/strict";
import { runNative, runEmitted } from "../../packages/monkey-business-bend/conformance/native-run-runner.mjs";
import { publicRows, nativeRows } from "../../packages/monkey-business-bend/conformance/native-run-public.mjs";

import { createNativePreflight, cleanupNativePreflight } from "../../packages/monkey-business-bend/conformance/native-preflight.mjs";

const fixture = new URL("./DefenseConsumerConformance.bend", import.meta.url);
const preflight = createNativePreflight({ fixtures: [fixture] });
const previousPins = [process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST,
  process.env.HAPSLAND_NATIVE_PREFLIGHT_SESSION, process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256];
process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST = preflight.manifestPath;
process.env.HAPSLAND_NATIVE_PREFLIGHT_SESSION = preflight.sessionId;
process.env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256 = preflight.manifestHash;
try {
const native = runNative(fixture);
assert.deepEqual(await runEmitted(fixture), native, "native/emitted-JS original consumer inputs");
const { createRun, restoreReplay } = await import("../../packages/monkey-business/src/index.ts");

// Original consumer literals, rather than events copied out of either runtime.
const config = {
  seed: 152, retention: 10000,
  limits: { globalItems: 32, globalBytes: 480, partitionItems: 16, partitionBytes: 480 },
  session: { agent: "agent-1", seed: 152, editIntervalMs: 1200, variationMs: 200,
    editsPerTask: 4, taskPauseMs: 3000, adviceResponse: "ignore", repairDelayMs: 300,
    bytes: 100, unitBytes: [10, 20] },
  preparationDelay: 800, jevDelay: 3200, adviceLifetime: 20000,
  outputProfile: { outcome: "certain", delayMs: 800, leaseMs: 5000 },
  outcomeWeights: { neverSent: 0, finding: 1, clear: 1, backendFailure: 0, timeout: 0, interrupted: 0 },
  fileTrees: { minFiles: 1, maxFiles: 3, maxImports: 2, maxDepth: 2, deniedPercent: 0,
    missingPercent: 0, unreadablePercent: 0, repeatedEdgePercent: 10, cyclicEdgePercent: 0,
    unsupportedPercent: 0, deadlineStep: 0, localWork: 0,
    minSourceBytes: 4, maxSourceBytes: 8, minTreeBytes: 3, maxTreeBytes: 6 },
};
const run = createRun(config);
run.applyControl({ kind: "burst", agent: "agent-1", count: 1 });
run.advance({ untilTime: 2000, maxEvents: 2000 });
run.applyControl({ kind: "suspendArrivals", agent: "agent-1", suspended: true });
run.advance({ untilTime: 2200, maxEvents: 2000 });
run.applyControl({ kind: "suspendArrivals", agent: "agent-1", suspended: false });
run.applyControl({ kind: "editPace", agent: "agent-1", intervalMs: 20 });
run.advance({ untilTime: 2400, maxEvents: 2000 });
run.applyControl({ kind: "jevProfile", delayMs: 3200,
  outcomeWeights: { neverSent: 0, finding: .5, clear: 1, backendFailure: 0, timeout: 0, interrupted: 0 } });
run.advance({ untilTime: 12000, maxEvents: 2000 });

assert.deepEqual(nativeRows(native), publicRows(run.observations), "actual consumer/public ordered frames");
const replay = JSON.parse(JSON.stringify(run.exportReplay()));
const restored = restoreReplay(replay);
assert.deepEqual(restored.exportReplay(), replay);
assert.deepEqual(restored.observe(), run.observe(), "ordinary replay preserves controls and endpoint");
assert.equal(run.observations[0].time, 0, "original Burst at initial clock");
assert.ok(run.observations.some(frame => frame.event.kind === "jevRequestSettled"));
assert.ok(run.observations.some(frame => frame.event.kind === "stopPolled"));
for (const candidate of [run, restored]) candidate.advance({ untilTime: 16000, maxEvents: 2000 });
assert.deepEqual(restored.observe(), run.observe(), "ordinary replay continuation");
console.log("Actual consumer: native/emitted-JS/public trace and ordinary replay agree");

} finally {
  cleanupNativePreflight(preflight);
  for (const [index, key] of ["HAPSLAND_NATIVE_PREFLIGHT_MANIFEST", "HAPSLAND_NATIVE_PREFLIGHT_SESSION",
    "HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256"].entries()) {
    if (previousPins[index] === undefined) delete process.env[key];
    else process.env[key] = previousPins[index];
  }
}
