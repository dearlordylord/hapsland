import { expect, it } from "vitest";
import { createRun, restoreReplay, type RunConfig } from "./index.ts";
import { runNative, runEmitted } from "../../monkey-business-bend/conformance/native-run-runner.mjs";
import { nativeRows, publicRows } from "../../monkey-business-bend/conformance/native-run-public.mjs";

// Independently specified original inputs. Native executes the same workload
// owner and dispatcher; it does not consume canonical events recorded here.
const original: RunConfig = {
  seed: 7, retention: 10000, outcome: "clear",
  limits: { globalItems: 32, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 },
  session: { agent: "a", seed: 7, editIntervalMs: 10, variationMs: 0,
    editsPerTask: 2, taskPauseMs: 100, adviceResponse: "ignore", repairDelayMs: 50,
    bytes: 10, unitBytes: [5] },
  preparationDelay: 2, jevDelay: 5, adviceLifetime: 600000,
  outputProfile: { outcome: "certain", delayMs: 0, leaseMs: 30000 },
  fileTrees: { minFiles: 2, maxFiles: 2, maxImports: 1, maxDepth: 1, deniedPercent: 0,
    minSourceBytes: 100, maxSourceBytes: 100, minTreeBytes: 20, maxTreeBytes: 20 },
};

it("runs continuous original workload and Finish facts through one native owner", async () => {
  const fixture = new URL("../../monkey-business-bend/conformance/native-run-scenario.bend", import.meta.url);
  const native = runNative(fixture);
  expect(await runEmitted(fixture)).toEqual(native);
  const run = createRun(original);
  run.advance({ untilTime: 150, maxEvents: 1000 });
  expect(nativeRows(native)).toEqual(publicRows(run.observations));
  expect(native.filter(row => row[0] === 12).map(row => row[1])).toEqual([17, 27, 147]);
  expect(native.filter(row => row[0] === 40).map(row => row[1])).toEqual([30]);
  expect(native.filter(row => row[0] === 1).map(row => row[1])).toEqual([10, 140]);
  expect(native.filter(row => row[0] === 21 && row[2] === 4)
    .map(row => row.slice(3, 6))).toEqual([[2, 200, 40], [2, 200, 40], [2, 200, 40]]);
  const replay = JSON.parse(JSON.stringify(run.exportReplay()));
  const restored = restoreReplay(replay);
  expect(restored.observe()).toEqual(run.observe());
  for (const candidate of [run, restored]) candidate.advance({ untilTime: 250, maxEvents: 1000 });
  expect(restored.observe()).toEqual(run.observe());
}, 30000);

it.each(["restore", "rotate"] as const)("keeps captured issuance authority through credential %s", async mode => {
  const fixture = new URL(`../../monkey-business-bend/conformance/native-run-credential-${mode}.bend`, import.meta.url);
  const native = runNative(fixture);
  expect(await runEmitted(fixture)).toEqual(native);
  const run = createRun({ ...original, outcome: "finding" });
  const boundary = mode === "restore" ? "jevRequestSettled" : "jevRequestStarted";
  for (let count = 0; count < 1000; count++) {
    if (run.step()?.event.kind === boundary) break;
  }
  expect(run.observations.at(-1)?.event.kind).toBe(boundary);
  if (mode === "restore") {
    run.applyControl({ kind: "environment", currentWork: true, credentialReady: false, credentialGeneration: 1, sourceReadable: true });
    run.advance({ untilTime: 18, maxEvents: 1000 });
    expect(run.projection.pendingFindings).toHaveLength(1);
    expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toEqual([]);
    run.applyControl({ kind: "environment", currentWork: true, credentialReady: true, credentialGeneration: 1, sourceReadable: true });
  } else {
    run.applyControl({ kind: "environment", currentWork: true, credentialReady: true, credentialGeneration: 2, sourceReadable: true });
  }
  run.advance({ untilTime: 19, maxEvents: 1000 });
  expect(nativeRows(native)).toEqual(publicRows(run.observations));
  expect(native.filter(row => row[0] === 18).map(row => row[1])).toEqual(mode === "restore" ? [17] : []);
  expect(run.projection.dispatch.requests).toEqual([]);
  if (mode === "rotate") {
    expect(run.projection.pendingFindings).toEqual([]);
    expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
  }
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
}, 30000);

it("preserves initial u48 clock and root-seed acceptance without narrowing to controls", async () => {
  const fixture = new URL("../../monkey-business-bend/conformance/native-run-boundaries.bend", import.meta.url);
  const native = runNative(fixture);
  expect(await runEmitted(fixture)).toEqual(native);
  const accepted = [0, 0, 1, 1], refused = [0, 0, 0, 0];
  expect(native).toEqual([accepted, accepted, accepted, accepted,
    accepted, refused, refused, accepted, refused, [1, ...accepted]]);
  const maximum = 2 ** 48 - 1;
  for (const overrides of [{ seed: maximum }, { preparationDelay: maximum },
    { jevDelay: maximum }, { adviceLifetime: maximum },
    { environment: { currentWork: true, credentialReady: true, credentialGeneration: 1_000_000_000 } }]) {
    const run = createRun({ ...original, ...overrides });
    expect([run.now, run.eventCount]).toEqual([0, 0]);
  }
  for (const overrides of [{ seed: maximum + 1 }, { preparationDelay: maximum + 1 },
    { environment: { currentWork: true, credentialReady: true, credentialGeneration: 0 } },
    { environment: { currentWork: true, credentialReady: true, credentialGeneration: 1_000_000_001 } }])
    expect(() => createRun({ ...original, ...overrides })).toThrow();
  const run = createRun(original);
  run.applyControl({ kind: "sizes", reservationBytes: 1, reviewUnitBytes: [] });
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
}, 30000);

it("captures issued facts before a future raw-subnormal profile control", async () => {
  const fixture = new URL("../../monkey-business-bend/conformance/native-run-future-profile.bend", import.meta.url);
  const native = runNative(fixture);
  expect(await runEmitted(fixture)).toEqual(native);
  const run = createRun(original);
  run.advance({ untilTime: 12, maxEvents: 1000 });
  run.applyControl({ kind: "jevProfile", delayMs: 5,
    outcomeWeights: { neverSent: 0, finding: Number.MIN_VALUE, clear: 0,
      backendFailure: 0, timeout: 0, interrupted: 0 } });
  run.advance({ untilTime: 30, maxEvents: 1000 });
  expect(nativeRows(native)).toEqual(publicRows(run.observations));
  expect(native.filter(row => row[0] === 12).map(row => [row[1], row[10]])).toEqual([[17, 3], [27, 2]]);
  expect(run.observations.flatMap(frame => frame.event.kind === "jevRequestSettled"
    ? [[frame.time, frame.event.outcome]] : [])).toEqual([[17, "clear"], [27, "finding"]]);
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
}, 30000);

it("preserves the active graph after an original wrong-parent callback", async () => {
  const fixture = new URL("../../monkey-business-bend/conformance/native-run-wrong-completion.bend", import.meta.url);
  const native = runNative(fixture);
  expect(await runEmitted(fixture)).toEqual(native);
  const run = createRun(original);
  run.advance({ untilTime: 10, maxEvents: 1000 });
  run.schedule({ kind: "canonical", at: run.now,
    event: { kind: "preparationCompleted", partition: 1, lifetime: 1, round: 999, operation: 1, unitBytes: [5] } });
  run.advance({ untilTime: 30, maxEvents: 1000 });
  expect(nativeRows(native)).toEqual(publicRows(run.observations));
  expect(native.filter(row => row[0] === 6 && row[20] === 1).map(row => row[1])).toEqual([10]);
  expect(native.filter(row => row[0] === 6 && row[20] === 0).map(row => row[1])).toEqual([12, 22]);
  expect(native.filter(row => row[0] === 12).map(row => row[1])).toEqual([17, 27]);
  expect(native.filter(row => row[0] === 21 && row[2] === 4)
    .map(row => row.slice(3, 6))).toEqual([[2, 200, 40], [2, 200, 40]]);
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
}, 30000);

it("preserves empty future review-unit sizes through actual preparation and replay", async () => {
  const fixture = new URL("../../monkey-business-bend/conformance/native-run-empty-sizes.bend", import.meta.url);
  const native = runNative(fixture);
  expect(await runEmitted(fixture)).toEqual(native);
  const run = createRun(original);
  run.applyControl({ kind: "sizes", reservationBytes: 1, reviewUnitBytes: [] });
  run.advance({ untilTime: 30, maxEvents: 1000 });
  expect(nativeRows(native)).toEqual(publicRows(run.observations));
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(0);
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
}, 30000);
