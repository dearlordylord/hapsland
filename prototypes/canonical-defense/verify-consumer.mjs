import assert from "node:assert/strict";
import { compareNativeRuntime, compareNativeFrames } from "./compare-native-runtime.mjs";
import { readFileSync } from "node:fs";
import { createGameStreams } from "./game-stream-runner.mjs";
import { decodeNativePrefixWithDescriptors } from "../../packages/monkey-business/src/callback-native-prefix.ts";
import { callbackNativeDescriptors as gameDescriptors, callbackNativeOwnerSources as gameOwnerSources } from "./defense-consumer-metadata.ts";
import { decodeObservedState, stateEndpoint } from "../../packages/monkey-business/src/sharing-native-boundary.ts";
import { callbackPublicBoundary } from "../../packages/monkey-business/src/callback-native-codec.ts";
import { decodeCallbackTarget } from "../../packages/monkey-business/src/callback-controls.ts";
import { readBendList, readNat, readRecord } from "../../src/canonical/boundary-schema.ts";
import { createRun, restoreReplay } from "../../packages/monkey-business/src/index.ts";

// This optional consumer is excluded from business builds. Integration needs
// the ONE game_consumer descriptor and actual NativeRun full observed sidecars.
// Missing sidecars are an explicit failure: no tuple projection substitutes.
const fixture = new URL("./DefenseConsumerConformance.bend", import.meta.url);
const streams = await createGameStreams(fixture,gameOwnerSources,{emissionTimeoutMs:0,clangTimeoutMs:120000,executionTimeoutMs:15000,
  overallDeadlineMs:Number(process.env.HAPSLAND_GAME_OUTER_DEADLINE_MS),
  ...(process.env.HAPSLAND_GAME_NATIVE_RESUME_RECEIPT===undefined?{}:{resumeCompilerReceipt:process.env.HAPSLAND_GAME_NATIVE_RESUME_RECEIPT})});
try {
assert.equal(streams.native.length,145,"all derived original checkpoint batches");
assert.equal(streams.native.length,streams.emitted.length,"all native/emitted batches");
let batchIndex=0, retainedTicks=0;
const list = value => readBendList(value, value => value, 2048);
const one = value => { const values = list(value); assert.equal(values.length, 1); return readRecord(values[0]); };
function nextBatch() {
  assert.ok(batchIndex<streams.native.length,"missing original batch");
  const native=JSON.parse(readFileSync(streams.native[batchIndex],"utf8"));
  const emitted=JSON.parse(readFileSync(streams.emitted[batchIndex],"utf8"));
  assert.deepEqual(native,emitted,`entire batch ${batchIndex}`);batchIndex++;
  const values=list(decodeNativePrefixWithDescriptors(native,"game_consumer",gameDescriptors));
  assert.equal(values.length,1,"exactly one batch per line");
  const batch=readRecord(values[0]);assert.equal(batch.$,"DefenseConsumerBatches.GameBatch");
  assert.ok(list(batch.ticks).length<=64,"bounded actual tick chunk");return batch;
}
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
    ...Array.from({ length: 1 + seed % 4 }, () => ({ $: "DefenseConsumerObserved.GameKey", code: 110 })),
    { $: "DefenseConsumerObserved.Ticks", count: 100 }, { $: "DefenseConsumerObserved.GameKey", code: 97 },
    { $: "DefenseConsumerObserved.Ticks", count: 10 + seed % 5 }, { $: "DefenseConsumerObserved.GameKey", code: 97 },
    ...Array.from({ length: 12 }, () => ({ $: "DefenseConsumerObserved.GameKey", code: 91 })),
    { $: "DefenseConsumerObserved.Ticks", count: 10 },
    { $: "DefenseConsumerObserved.JevProfile", delay: 3200, weights: linked([
      words(0, 0), words(1071644672, 0), words(1072693248, 0), words(0, 0), words(0, 0), words(0, 0),
    ]) },
    { $: "DefenseConsumerObserved.Ticks", count: 480 }, { $: "DefenseConsumerObserved.GameKey", code: 32 },
    { $: "DefenseConsumerObserved.Ticks", count: 4 }, { $: "DefenseConsumerObserved.GameKey", code: 32 },
    { $: "DefenseConsumerObserved.Ticks", count: 200 },
  ];
}
function words(high, low) { return { $: "Numeric.Words", high, low }; }
function linked(values) { return values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" }); }
function endpoint(world, receipts) {
  const state = one(world.engine);
  assert.equal(state.$, "NativeRunTypes.State");
  assert.equal(state.valid, true, "actual consumer remains valid");
  return stateEndpoint(decodeObservedState(state.core), receipts);
}
for (const seed of [0,3,17,41]) {
  const envelope=nextBatch();
  assert.equal(envelope.campaign_seed,seed,"original campaign order");
  const inputs = originalInputs(seed);
  assert.deepEqual(list(envelope.original), inputs, "independently declared original keys and endpoints");
  assert.equal(readNat(envelope.creation_seed), 152);
  const run = createRun(config), untouchedDashboard = createRun(config);
  const dashboardBefore = untouchedDashboard.observe();
  // Delivered originals leave the native core; frame facts are the actual
  // retained history used to reconstruct the public target boundary.
  const nativeReceipts = [];
  let ticks = 0, paused = false, suspended = false, pace = 1200;
  let pendingBatch=envelope;
  assert.equal(run.now, 0);
  assert.equal(run.observations.length, 0, "configuration queues arrivals without performing work");
  for (const [index, input] of inputs.entries()) {
    const checkpoint=pendingBatch ?? nextBatch();pendingBatch=undefined;
    assert.equal(checkpoint.checkpoint,index,"exact checkpoint order");
    assert.equal(checkpoint.offset,0,"checkpoint begins at tick zero");
    const checkChunk=chunk=>{
      for(const field of ["config","creation_seed","campaign_seed","original","checkpoint","input","before","after","final_world"])
        assert.deepEqual(chunk[field],checkpoint[field],`immutable batch metadata ${field}`);
    };
    function* checkpointTicks() {
      let chunk=checkpoint,offset=0;
      for(;;){checkChunk(chunk);assert.equal(chunk.offset,offset,"no dropped/duplicated/reordered ticks");
        for(const tick of list(chunk.ticks)){offset++;retainedTicks++;yield readRecord(tick);}
        if(chunk.checkpoint_end){assert.equal(offset,input.$==="DefenseConsumerObserved.Ticks"?input.count:0,"every original tick");return;}
        assert.equal(list(chunk.ticks).length,64,"nonfinal chunk is full");chunk=nextBatch();
      }
    }
    assert.deepEqual(checkpoint.input, input);
    const beforeWorld = one(checkpoint.before), afterWorld = one(checkpoint.after);
    compareNativeRuntime(one(beforeWorld.engine),run.runtimeSnapshot(),`campaign ${seed} checkpoint ${index} before`);
    const beforeEndpoint = endpoint(beforeWorld, nativeReceipts);
    assert.deepEqual(beforeEndpoint, callbackPublicBoundary(run.observe(), [], []).endpoint);
    if (input.$ === "DefenseConsumerObserved.GameKey") {
      if (input.code === 110) run.applyControl({ kind: "burst", agent: "agent-1", count: 1 });
      if (input.code === 97) { suspended = !suspended; run.applyControl({ kind: "suspendArrivals", agent: "agent-1", suspended }); }
      if (input.code === 91) { pace = Math.max(20, pace - 100); run.applyControl({ kind: "editPace", agent: "agent-1", intervalMs: pace }); }
      if (input.code === 32) paused = !paused;
      assert.deepEqual([...checkpointTicks()],[]);
      assert.equal(afterWorld.clock, ticks, "keys do not advance virtual time");
      assert.equal(afterWorld.paused, paused);
      if (input.code === 110 && ticks === 0) {
        assert.equal(run.observations.length, 0, "Burst supplies arrivals without synchronously executing them");
        assert.equal(endpoint(afterWorld, nativeReceipts).time, 0);
      }
    } else if (input.$ === "DefenseConsumerObserved.JevProfile") {
      assert.deepEqual([...checkpointTicks()],[]);
      run.applyControl({ kind: "jevProfile", delayMs: 3200,
        outcomeWeights: { neverSent: 0, finding: .5, clear: 1, backendFailure: 0, timeout: 0, interrupted: 0 } });
    } else {
      for (const physical of checkpointTicks()) {
        const before = one(physical.before), after = one(physical.after);
        assert.equal(before.valid, true); assert.equal(after.valid, true);
        compareNativeRuntime(before,run.runtimeSnapshot(),`campaign ${seed} tick ${ticks} before`);
        const publicPhysical = [], publicFrames = [];
        const unsubscribe = run.subscribeStructural(frame => {
          publicFrames.push(frame);
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
          compareNativeRuntime(delivery.before,actual.before,`campaign ${seed} tick ${ticks} physical ${deliveryIndex} before`);
          compareNativeRuntime(delivery.after,actual.after,`campaign ${seed} tick ${ticks} physical ${deliveryIndex} after`);
          assert.deepEqual(delivery.action, actual.delivery, "actual original physical action");
        }
        compareNativeRuntime(after,run.runtimeSnapshot(),`campaign ${seed} tick ${ticks} endpoint`);
        compareNativeFrames(physical.frames,publicFrames,`campaign ${seed} tick ${ticks}`);
        // compareNativeFrames already validates these snapshots, contexts,
        // scopes and attached physical deliveries. Retain only the actual
        // delivered-target history needed by the independent public endpoint.
        for (const raw of list(physical.frames)) {
          const details = readRecord(readRecord(raw).details), receipt = readRecord(details.receipt);
          if (receipt.$ === "Some") nativeReceipts.push(decodeCallbackTarget(readRecord(receipt.value).target));
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
    compareNativeRuntime(one(afterWorld.engine),run.runtimeSnapshot(),`campaign ${seed} checkpoint ${index} after`);
    assert.deepEqual(endpoint(afterWorld, nativeReceipts), callbackPublicBoundary(run.observe(), [], []).endpoint);
    if (paused) assert.deepEqual(endpoint(afterWorld, nativeReceipts), beforeEndpoint, "pause preserves full public endpoint");
    assert.deepEqual(untouchedDashboard.observe(), dashboardBefore, "game controls cannot mutate another instance");
    const exported = JSON.parse(JSON.stringify(run.exportReplay()));
    const restored = restoreReplay(exported);
    assert.deepEqual(restored.exportReplay(), exported);
    assert.deepEqual(restored.observe(), run.observe(), "full ordinary replay at every game midpoint");
  }

  assert.deepEqual(endpoint(one(envelope.final_world), nativeReceipts),callbackPublicBoundary(run.observe(),[],[]).endpoint);
}

assert.equal(batchIndex,streams.native.length,"no trailing or unknown campaign batches");
assert.equal(retainedTicks,3222,"all original retained Host ticks");
console.log("Full optional game consumer: native/emitted-JS/public histories and midpoint replay agree");
} finally { streams.cleanup(); }
