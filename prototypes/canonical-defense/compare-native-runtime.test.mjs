import assert from "node:assert/strict";
import { test } from "node:test";
import { compareNativeQueuedPayload, compareCanonicalOwner, compareNativeInputContext, compareNativeRuntime, resolvedGameOutputScopes } from "./compare-native-runtime.mjs";

const owner = canonical => ({ $: "Types.State", canonical });
test("public contract permits different private scheduler and scenario representation", () => {
  compareCanonicalOwner({ ...owner({ round: 7 }), scheduler: { private: "native" }, scenarios: { capsule: 1 } },
    { ...owner({ round: 7 }), scheduler: { private: "public" }, scenarios: { capsule: 2 } }, "campaign 0 tick 1");
});
test("public contract refuses a changed Canonical owner", () => {
  assert.throws(() => compareCanonicalOwner(owner({ round: 7 }), owner({ round: 8 }), "campaign 0 tick 1"),
    /campaign 0 tick 1 complete Canonical state/);
});
test("public contract still refuses changed observable queue order", () => {
  const runtime = { valid: true, core: { $: "Con", head: owner({ round: 7 }), tail: { $: "Nil" } },
    environment: {}, next: 4 };
  assert.throws(() => compareNativeRuntime(runtime, { engine: owner({ round: 7 }), order: 5 }, "campaign 0 item 4"),
    /campaign 0 item 4 next queue order/);
});

const linked = values => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
test("external finding-count acknowledgement resolves only its missing event owner", () => {
  const event = { $: "Canonical.FindingCountUpdated", partition: 3 };
  const outputs = linked([{ $: "Canonical.EventEstablished", event: { $: "Canonical.FindingCountRecorded" } }]);
  assert.deepEqual(resolvedGameOutputScopes(linked([{ $: "None" }]), event, outputs), [3]);
  assert.deepEqual(resolvedGameOutputScopes(linked([{ $: "Some", value: 8 }]), event, outputs), [8]);
  assert.deepEqual(resolvedGameOutputScopes(linked([{ $: "None" }]), { $: "Canonical.StartReview", partition: 3 }, outputs), [null]);
  assert.deepEqual(resolvedGameOutputScopes(linked([{ $: "None" }]), event, linked([{ $: "Canonical.EventEstablished", event: { $: "Canonical.JevRequestIssued" } }])), [null]);
});

test("native input context requires exactly one optional capsule", () => {
  compareNativeInputContext(linked([{ $: "None" }]),{},"input context");
  assert.throws(() => compareNativeInputContext(linked([]),{},"empty context"));
  assert.throws(() => compareNativeInputContext(linked([{ $: "None" },{ $: "None" }]),{},"duplicate context"));
  assert.throws(() => compareNativeInputContext({ $: "None" },{},"unboxed context"));
  assert.throws(() => compareNativeInputContext(linked([{ $: "None" }]),{ driverContext: {} },"lost context"), /lost context absent context/);
});


test("captured edit keeps its original activity fence and complete source job", () => {
  const source = { $: "Driver.SourceJob", partition: 2, lifetime: 3, bytes: 10, units: linked([5]), outcome: { $: "None" } };
  const job = { $: "NativeRunTypes.Job", partition: 2, lifetime: 3, round: 0, bytes: 10, units: linked([5]), revision: 7, repair: false,
    duration: { $: "None" }, source_job: { $: "Some", value: source }, facts: linked([{ $: "None" }]) };
  const input = { $: "NativeRunTypes.CapturedEdit", job, activity: 9 };
  const original = { at: 20, order: 4, activityScope: 9, input: { kind: "edit", at: 20, bytes: 10, unitBytes: [5], revision: 7 },
    driverSourceJob: { partition: 2, lifetime: 3, bytes: 10, units: [5], outcome: { $: "None" } } };
  compareNativeQueuedPayload(input,original,"captured",4,{});
  assert.throws(() => compareNativeQueuedPayload({ ...input, activity: 8 },original,"captured",4,{}), /original captured edit activity/);
  assert.throws(() => compareNativeQueuedPayload({ ...input, job: { ...job, bytes: 11 } },original,"captured",4,{}), /full active input/);
  assert.throws(() => compareNativeQueuedPayload({ ...input, job: { ...job, source_job: { $: "Some", value: { ...source, lifetime: 4 } } } },original,"captured",4,{}), /immutable source/);
  assert.throws(() => compareNativeQueuedPayload({ ...input, $: "NativeRunTypes.Edit" },original,"captured",4,{}), /unsupported genuine queued family/);
});

test("cache facts preserve independent target and emitter partitions", () => {
  const event = { kind: "cachePrepare", id: 1, bytes: 5, entryLimit: 8, byteLimit: 100 };
  const input = { $: "NativeRunTypes.CacheFact", source_partition: 3,
    fact: { event: { $: "Canonical.CachePrepare", id: 1, bytes: 5, entry_limit: 8, byte_limit: 100 }, offer: { key: { partition: 2 } } } };
  const original = { at: 20, order: 4, partition: 3, input: { at: 20, kind: "canonical", event }, cacheFact: { event, partition: 2 } };
  compareNativeQueuedPayload(input,original,"cache",4,{});
  assert.throws(() => compareNativeQueuedPayload({ ...input, source_partition: 2 },original,"cache",4,{}), /cache fact emitter/);
  assert.throws(() => compareNativeQueuedPayload({ ...input, fact: { ...input.fact, offer: { key: { partition: 3 } } } },original,"cache",4,{}), /cache fact target/);
});
