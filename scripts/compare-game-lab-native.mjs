import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGameStreams } from "../prototypes/canonical-defense/game-stream-runner.mjs";
import { callbackNativeOwnerSources } from "../prototypes/canonical-defense/lab-trace-metadata.ts";

// Existing game transport owns compiler preflight, transitive source/tool hashes,
// finite subprocess deadlines, numeric IO wiring and retained output receipts.
const fixture = new URL("../prototypes/canonical-defense/DefenseLabConformance.bend", import.meta.url);
const streams = await createGameStreams(fixture, callbackNativeOwnerSources, {
  emissionTimeoutMs: 30000,
  clangTimeoutMs: 30000,
  executionTimeoutMs: 5000,
  executionArgumentGroups: Array.from({length:7},(_,id)=>[String(id)])
});
try {
  const rows = 7 * 40;
  assert.equal(streams.native.length, rows, "all seven original finite scenarios and every tick");
  assert.equal(streams.emitted.length, rows, "identical complete emitted scenario/tick coverage");
  let previousCount = 0;
  for (let index = 0; index < rows; index++) {
    const native = JSON.parse(readFileSync(streams.native[index], "utf8"));
    const emitted = JSON.parse(readFileSync(streams.emitted[index], "utf8"));
    const scenario = Math.floor(index / 40), tick = index % 40;
    assert.ok(Array.isArray(native) && native.length > 4, "nonempty complete owner vectors");
    assert.deepEqual(native.slice(0, 3), [scenario, tick, 128], "original scenario, exact tick order and hard event budget");
    if (tick === 0) previousCount = 0;
    assert.ok(Number.isSafeInteger(native[3]) && native[3] >= previousCount && native[3] <= 128,
      "finite monotonically consumed hard event budget");
    previousCount = native[3];
    assert.deepEqual(native, emitted,
      `scenario ${scenario} tick ${tick}: complete before/intervention/after Worlds, Frames and PhysicalDeliveries`);
  }
  console.log(JSON.stringify({ scope: "actual Lab native/emitted full owner vectors only; no public-lane or interactive-platform claim",
    scenarios: ["clear baseline", "early Jev Service", "late Jev Service", "finding baseline", "early Delivery Relay", "late Delivery Relay", "blocked source then Access Repair"],
    ticksPerScenario: 40, eventBudgetPerScenario: 128, initialGameBudget: 160, equalRows: rows,
    phases: { cEmissionMs: 30000, clangMs: 30000, jsEmissionMs: 30000, executionMsPerLane: 5000 } }));
} finally {
  streams.cleanup();
}
