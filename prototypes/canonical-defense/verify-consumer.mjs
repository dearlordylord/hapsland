import assert from "node:assert/strict";
import { runWorkloadEmitted } from "../../packages/monkey-business-bend/conformance/workload-native-runner.mjs";
import { runNative } from "../../packages/monkey-business-bend/conformance/native-run-runner.mjs";
import { createNativePreflight, cleanupNativePreflight } from "../../packages/monkey-business-bend/conformance/native-preflight.mjs";
import { decodeNativePrefixWithDescriptors } from "../../packages/monkey-business/src/callback-native-prefix.ts";
import { callbackNativeDescriptors as gameDescriptors } from "./defense-consumer-metadata.ts";
import { decodeObservedState, stateEndpoint } from "../../packages/monkey-business/src/sharing-native-boundary.ts";
import { callbackPublicBoundary } from "../../packages/monkey-business/src/callback-native-codec.ts";
import { readBendList, readNat, readRecord } from "../../src/canonical/boundary-schema.ts";
import { createRun, restoreReplay } from "../../packages/monkey-business/src/index.ts";

// This optional consumer is excluded from business builds. Integration needs
// the ONE game_consumer descriptor and actual NativeRun full observed sidecars.
// Missing sidecars are an explicit failure: no tuple projection substitutes.
const fixture = new URL("./DefenseConsumerConformance.bend", import.meta.url);
const preflight = await createNativePreflight({ fixtures: [fixture] });
const pinKeys = ["HAPSLAND_NATIVE_PREFLIGHT_MANIFEST", "HAPSLAND_NATIVE_PREFLIGHT_SESSION", "HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256"];
const previousPins = pinKeys.map(key => process.env[key]);
[preflight.manifestPath, preflight.sessionId, preflight.manifestHash].forEach((pin, index) => { process.env[pinKeys[index]] = pin; });
try {
const native = runNative(fixture);
const emitted = runWorkloadEmitted(fixture);
assert.deepEqual(native, emitted, "complete game/engine states, queues and frames");
const nativeOwners = decodeNativePrefixWithDescriptors(native, "game_consumer", gameDescriptors);
assert.deepEqual(nativeOwners, decodeNativePrefixWithDescriptors(emitted, "game_consumer", gameDescriptors));
const list = value => readBendList(value, value => value, 2048);
const one = value => { const values = list(value); assert.equal(values.length, 1); return readRecord(values[0]); };
const envelopes = list(nativeOwners).map(readRecord);
assert.deepEqual(envelopes.map(value => readNat(value.campaign_seed)), [0, 3, 17, 41]);
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

function originalInputs(seed) {
  return [
    ...Array.from({ length: 1 + seed % 4 }, () => ({ $: "DefenseConsumerObserved.Key", code: 110 })),
    { $: "DefenseConsumerObserved.Ticks", count: 100 }, { $: "DefenseConsumerObserved.Key", code: 97 },
    { $: "DefenseConsumerObserved.Ticks", count: 10 + seed % 5 }, { $: "DefenseConsumerObserved.Key", code: 97 },
    ...Array.from({ length: 12 }, () => ({ $: "DefenseConsumerObserved.Key", code: 91 })),
    { $: "DefenseConsumerObserved.Ticks", count: 10 },
    { $: "DefenseConsumerObserved.JevProfile", delay: 3200, weights: linked([
      words(0, 0), words(1071644672, 0), words(1072693248, 0), words(0, 0), words(0, 0), words(0, 0),
    ]) },
    { $: "DefenseConsumerObserved.Ticks", count: 480 }, { $: "DefenseConsumerObserved.Key", code: 32 },
    { $: "DefenseConsumerObserved.Ticks", count: 4 }, { $: "DefenseConsumerObserved.Key", code: 32 },
    { $: "DefenseConsumerObserved.Ticks", count: 200 },
  ];
}
function words(high, low) { return { $: "Numeric.Words", high, low }; }
function linked(values) { return values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" }); }
function endpoint(world) {
  const state = one(world.engine);
  assert.equal(state.$, "NativeRunTypes.State");
  assert.equal(state.valid, true, "actual consumer remains valid");
  return stateEndpoint(decodeObservedState(state.core), []);
}
for (const envelope of envelopes) {
  const seed = readNat(envelope.campaign_seed);
  const inputs = originalInputs(seed);
  assert.deepEqual(list(envelope.original), inputs, "independently declared original keys and endpoints");
  assert.equal(readNat(envelope.creation_seed), 152);
  const run = createRun(config), untouchedDashboard = createRun(config);
  const dashboardBefore = untouchedDashboard.observe();
  let ticks = 0, paused = false, suspended = false, pace = 1200;
  const checkpoints = list(readRecord(envelope.trace).checkpoints).map(readRecord);
  assert.equal(checkpoints.length, inputs.length);
  const receipts = [], nativeFrames = [];
  assert.equal(run.now, 0);
  assert.equal(run.observations.length, 0, "configuration queues arrivals without performing work");
  for (const [index, input] of inputs.entries()) {
    const checkpoint = checkpoints[index];
    assert.deepEqual(checkpoint.input, input);
    const beforeWorld = one(checkpoint.before), afterWorld = one(checkpoint.after);
    const beforeEndpoint = endpoint(beforeWorld);
    assert.deepEqual(beforeEndpoint, callbackPublicBoundary(run.observe(), [], []).endpoint);
    if (input.$ === "DefenseConsumerObserved.Key") {
      if (input.code === 110) run.applyControl({ kind: "burst", agent: "agent-1", count: 1 });
      if (input.code === 97) { suspended = !suspended; run.applyControl({ kind: "suspendArrivals", agent: "agent-1", suspended }); }
      if (input.code === 91) { pace = Math.max(20, pace - 100); run.applyControl({ kind: "editPace", agent: "agent-1", intervalMs: pace }); }
      if (input.code === 32) paused = !paused;
      assert.equal(list(checkpoint.ticks).length, 0);
      assert.equal(afterWorld.clock, ticks, "keys do not advance virtual time");
      assert.equal(afterWorld.paused, paused);
      if (input.code === 110 && ticks === 0) {
        assert.equal(run.observations.length, 0, "Burst supplies arrivals without synchronously executing them");
        assert.equal(endpoint(afterWorld).time, 0);
      }
    } else if (input.$ === "DefenseConsumerObserved.JevProfile") {
      run.applyControl({ kind: "jevProfile", delayMs: 3200,
        outcomeWeights: { neverSent: 0, finding: .5, clear: 1, backendFailure: 0, timeout: 0, interrupted: 0 } });
    } else {
      const history = list(checkpoint.ticks).map(readRecord);
      assert.equal(history.length, input.count, "every actual Host tick retained");
      for (const physical of history) {
        const before = one(physical.before), after = one(physical.after);
        assert.equal(before.valid, true); assert.equal(after.valid, true);
        const publicPhysical = [];
        const unsubscribe = run.subscribeStructural(frame => {
          if (frame.kind === "callbackDelivery") publicPhysical.push(frame);
        });
        try {
          if (paused) {
            assert.deepEqual(after, before, "paused Host tick preserves the entire private engine and queue");
            assert.equal(list(physical.frames).length, 0);
          } else {
            ticks++;
            run.advance({ untilTime: ticks * 20, maxEvents: 256 });
          }
        } finally { unsubscribe(); }
        const deliveries = list(physical.physical).map(readRecord);
        assert.equal(deliveries.length, publicPhysical.length, "every actual physical delivery, including no-frame callbacks");
        for (const [deliveryIndex, delivery] of deliveries.entries()) {
          assert.equal(delivery.$, "NativeRunTypes.PhysicalDelivery");
          const actual = publicPhysical[deliveryIndex];
          assert.deepEqual(one(readRecord(delivery.before).core), actual.before.engine, "full physical owner before delivery");
          assert.deepEqual(one(readRecord(delivery.after).core), actual.after.engine, "full physical owner after delivery");
          assert.deepEqual(delivery.action, actual.delivery, "actual original physical action");
        }
        for (const raw of list(physical.frames)) {
          const frame = readRecord(raw), details = readRecord(frame.details);
          assert.equal(details.$, "NativeRunTypes.FrameDetails");
          // These are the actual per-frame source snapshots, never tick endpoints.
          const runtimeBefore = readRecord(details.before), runtimeAfter = readRecord(details.after);
          assert.equal(runtimeBefore.$, "NativeRunTypes.RuntimeSnapshot");
          assert.equal(runtimeAfter.$, "NativeRunTypes.RuntimeSnapshot");
          decodeObservedState(runtimeBefore.core);
          decodeObservedState(runtimeAfter.core);
          decodeObservedState(details.transition_after);
          list(details.prepared).forEach(value => assert.equal(readRecord(value).$, "NativeRunTypes.EmissionContext"));
          list(details.command_scopes).forEach(value => {
            const scope = readRecord(value);
            assert.ok(scope.$ === "None" || scope.$ === "Some");
            if (scope.$ === "Some") readNat(scope.value);
          });
          const receipt = readRecord(details.receipt);
          assert.ok(receipt.$ === "None" || receipt.$ === "Some");
          if (receipt.$ === "Some") assert.equal(readRecord(receipt.value).$, "Callbacks.Fact");
          for (const value of list(details.physical)) {
            const delivery = readRecord(value);
            assert.equal(delivery.$, "NativeRunTypes.PhysicalDelivery");
            decodeObservedState(readRecord(delivery.before).core);
            decodeObservedState(readRecord(delivery.after).core);
          }
          // A native snapshot is not an Edge Runtime: item/job bindings and
          // deliveries without an observation still need the shared owner's
          // complete publication contract. Do not fabricate an Edge envelope.
          throw new Error("pending complete NativeRun runtime/job/request/callback registry and frame comparison");
        }
      }
      assert.equal(afterWorld.clock, ticks);
      if (index === 1 + seed % 4) {
        assert.equal(ticks, 100, "the first midpoint is exactly 100 active game ticks");
        assert.ok(afterWorld.offered > 0, "actual continuous input reaches admitted game activity");
        assert.ok(run.observations.some(frame => frame.event.kind === "admitObservation"));
        assert.equal(run.observations.some(frame => frame.event.kind === "jevRequestSettled"), false,
          "800-ms preparation and 3200-ms Jev facts cannot settle at the 2000-ms midpoint");
      }
    }
    assert.deepEqual(endpoint(afterWorld), callbackPublicBoundary(run.observe(), [], []).endpoint);
    if (paused) assert.deepEqual(endpoint(afterWorld), beforeEndpoint, "pause preserves full public endpoint");
    assert.deepEqual(untouchedDashboard.observe(), dashboardBefore, "game controls cannot mutate another instance");
    const exported = JSON.parse(JSON.stringify(run.exportReplay()));
    const restored = restoreReplay(exported);
    assert.deepEqual(restored.exportReplay(), exported);
    assert.deepEqual(restored.observe(), run.observe(), "full ordinary replay at every game midpoint");
  }
  assert.deepEqual(nativeFrames, callbackPublicBoundary(run.observe(), [], []).frames, "complete ordered public frames, scopes and receipts");
  assert.deepEqual(endpoint(one(readRecord(envelope.trace).world)), callbackPublicBoundary(run.observe(), [], []).endpoint);
}
console.log("Full optional game consumer: native/emitted-JS/public histories and midpoint replay agree");

} finally {
  await cleanupNativePreflight(preflight);
  pinKeys.forEach((key, index) => {
    if (previousPins[index] === undefined) delete process.env[key];
    else process.env[key] = previousPins[index];
  });
}
